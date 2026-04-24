<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';
  import Grid from '$lib/grid/Grid.svelte';
  import StatsFooter from '$lib/StatsFooter.svelte';
  import { ytCmd, ytLoadVideo, type YTAction } from '$lib/youtube/controller.js';
  import { layoutStore, currentLayout } from '$lib/layout/store.js';
  import { connection, toasts } from '$lib/stores/connection.js';
  import { DEMO_LAYOUT } from '$lib/layout/demo.js';
  import { applyTheme } from '$lib/themes/loader.js';
  import { coerceTheme } from '$lib/themes/compat.js';
  import { resolveLayout } from '$lib/layout/resolver.js';
  import type { Orientation } from '$lib/layout/schema.js';

  // React to theme changes on the active layout.
  $effect(() => {
    const l = $currentLayout;
    if (!l) return;
    const { theme, coerced, from } = coerceTheme(l.mode, l.theme);
    void applyTheme(theme);
    if (coerced) {
      toasts.push('warn', `theme ${from} not allowed for ${l.mode}, using ${theme}`);
    }
  });

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let lastHash = '';
  let overscan = $state({ top: 2, right: 2, bottom: 2, left: 2 });

  // Track last-seen press timestamp per admin button entity. HA's
  // input_button state is the ISO timestamp of the most recent press,
  // so a change in state == a fresh press. Baseline on first tick so we
  // don't fire any action on startup.
  const adminButtons: Record<string, { entity: string; action: string }> = {
    reload_browser: { entity: 'input_button.mirror_reload_browser', action: 'reload_browser' },
    restart_frontend: {
      entity: 'input_button.mirror_restart_frontend',
      action: 'restart_frontend'
    },
    reboot: { entity: 'input_button.mirror_reboot', action: 'reboot' },
    // YouTube tile controls — dispatched inline (no server exec).
    yt_toggle: { entity: 'input_button.mirror_yt_toggle', action: 'yt_toggle' },
    yt_mute: { entity: 'input_button.mirror_yt_mute', action: 'yt_mute' },
    yt_vol_up: { entity: 'input_button.mirror_yt_vol_up', action: 'yt_vol_up' },
    yt_vol_down: { entity: 'input_button.mirror_yt_vol_down', action: 'yt_vol_down' },
    yt_skip: { entity: 'input_button.mirror_yt_skip', action: 'yt_skip' }
  };
  const lastSeenButton: Record<string, string | null> = {};
  let buttonBaselined = false;
  let lastYtVideoInput: string | null = null;

  // Boolean-backed toggle: screen power. Watch input_boolean, dispatch
  // DPMS on transition. Baselined on first tick so a page reload
  // doesn't flip the panel.
  let lastScreenState: string | null = null;
  let screenBaselined = false;

  async function dispatchAction(action: string) {
    // YouTube actions run entirely in the browser against the IFrame
    // Player — no round-trip through the admin endpoint.
    if (action.startsWith('yt_')) {
      const ok = ytCmd(action as YTAction);
      if (!ok) toasts.push('warn', `yt · player not ready`);
      return;
    }
    try {
      await fetch('/api/admin/command', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action })
      });
      toasts.push('info', `mirror · ${action.replace('_', ' ')}`);
    } catch (e) {
      toasts.push('error', `admin ${action} failed`);
    }
  }

  async function pollAdminButtons(base: string, token: string) {
    const states = await Promise.all(
      Object.values(adminButtons).map((b) => fetchState(base, token, b.entity))
    );
    const keys = Object.keys(adminButtons);
    if (!buttonBaselined) {
      // First tick — just snapshot, don't fire. Avoids reboot on page load.
      keys.forEach((k, i) => (lastSeenButton[k] = states[i]));
      buttonBaselined = true;
      return;
    }
    keys.forEach((k, i) => {
      const cur = states[i];
      if (cur && cur !== lastSeenButton[k]) {
        lastSeenButton[k] = cur;
        void dispatchAction(adminButtons[k].action);
      } else if (cur) {
        lastSeenButton[k] = cur;
      }
    });
  }

  async function pollYtVideo(base: string, token: string) {
    const cur = await fetchState(base, token, 'input_text.mirror_yt_video');
    if (cur == null) return;
    // Empty or unchanged -> ignore. We don't baseline like the buttons
    // because the value is user-supplied content, not a trigger flag;
    // the first time we see a non-empty value we should honour it.
    if (cur === lastYtVideoInput) return;
    lastYtVideoInput = cur;
    if (!cur.trim()) return;
    const ok = ytLoadVideo(cur);
    toasts.push(ok ? 'info' : 'warn', ok ? `yt · loaded` : `yt · bad url`);
  }

  async function pollScreenToggle(base: string, token: string) {
    const cur = await fetchState(base, token, 'input_boolean.mirror_screen_on');
    if (!cur) return;
    if (!screenBaselined) {
      lastScreenState = cur;
      screenBaselined = true;
      return;
    }
    if (cur !== lastScreenState) {
      lastScreenState = cur;
      void dispatchAction(cur === 'on' ? 'screen_on' : 'screen_off');
    }
  }


  async function fetchState(base: string, token: string, id: string): Promise<string | null> {
    try {
      const r = await fetch(`${base}/api/states/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      if (!r.ok) return null;
      const j = (await r.json()) as { state?: string };
      return j.state ?? null;
    } catch {
      return null;
    }
  }

  async function applyHa(base: string, token: string) {
    const [preset, mode, theme, orientation, osT, osR, osB, osL] = await Promise.all([
      fetchState(base, token, 'input_select.mirror_preset'),
      fetchState(base, token, 'input_select.mirror_mode'),
      fetchState(base, token, 'input_select.mirror_theme'),
      fetchState(base, token, 'input_select.mirror_orientation'),
      fetchState(base, token, 'input_number.mirror_overscan_top'),
      fetchState(base, token, 'input_number.mirror_overscan_right'),
      fetchState(base, token, 'input_number.mirror_overscan_bottom'),
      fetchState(base, token, 'input_number.mirror_overscan_left')
    ]);

    // Overscan updates independently of layout — no hash short-circuit.
    const parseN = (s: string | null, fallback: number) =>
      s == null ? fallback : Number(s) || fallback;
    overscan = {
      top: parseN(osT, 2),
      right: parseN(osR, 2),
      bottom: parseN(osB, 2),
      left: parseN(osL, 2)
    };

    const hash = `${preset}|${mode}|${theme}|${orientation}`;
    if (hash === lastHash) return;
    lastHash = hash;

    const r = resolveLayout({
      preset: preset ?? undefined,
      mode: (mode as never) ?? undefined,
      theme: (theme as never) ?? undefined,
      orientation: (orientation as Orientation) ?? 'portrait'
    });
    if (!r) {
      toasts.push('warn', `no bundled layout for ${mode}.${orientation}`);
      return;
    }
    layoutStore.setLayout(r.layout, Date.now());
    connection.set({ kind: 'connected', since: Date.now() });
  }

  onMount(() => {
    layoutStore.setLayout(DEMO_LAYOUT, 0);

    // Read directly from +layout.server.ts data — parent layout's onMount
    // hasn't fired yet at this point (child mounts first), so window
    // globals aren't populated yet.
    const pageData = get(page).data as { haUrl?: string; haToken?: string };
    const hassUrl = pageData?.haUrl || (import.meta as any).env?.VITE_HA_URL || '';
    const hassToken = pageData?.haToken || (import.meta as any).env?.VITE_HA_TOKEN || '';

    if (!hassUrl || !hassToken) {
      connection.set({ kind: 'down', reason: 'no-ha-config' });
      toasts.push('info', 'No HA config — running in demo mode');
      return;
    }

    // Fire immediately + every 2s. No WS, no abstractions.
    void applyHa(hassUrl, hassToken);
    void pollAdminButtons(hassUrl, hassToken);
    void pollScreenToggle(hassUrl, hassToken);
    void pollYtVideo(hassUrl, hassToken);
    pollTimer = setInterval(() => {
      void applyHa(hassUrl, hassToken);
      void pollAdminButtons(hassUrl, hassToken);
      void pollScreenToggle(hassUrl, hassToken);
      void pollYtVideo(hassUrl, hassToken);
    }, 2000);
  });

  onDestroy(() => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  });

  let connLabel = $derived.by(() => {
    const s = $connection;
    switch (s.kind) {
      case 'boot':
        return 'boot';
      case 'connecting':
        return 'connecting…';
      case 'connected':
        return null;
      case 'reconnecting':
        return `reconnecting · ${Math.round(s.nextRetryMs / 1000)}s`;
      case 'down':
        return `offline (${s.reason})`;
    }
  });
</script>

<main
  class="stage"
  style="--os-top:{overscan.top}vh; --os-right:{overscan.right}vw; --os-bottom:{overscan.bottom}vh; --os-left:{overscan.left}vw; padding: var(--os-top) var(--os-right) var(--os-bottom) var(--os-left);"
>
  {#if $currentLayout}
    <Grid layout={$currentLayout} />
  {:else}
    <div class="boot-splash" data-testid="boot-splash">waiting for Home Assistant…</div>
  {/if}

  {#if connLabel}
    <div class="conn-pill" data-testid="conn-pill">{connLabel}</div>
  {/if}

  {#if $toasts.length}
    <ul class="toasts">
      {#each $toasts as t (t.id)}
        <li class="toast t-{t.kind}" data-testid="toast">{t.text}</li>
      {/each}
    </ul>
  {/if}

  <StatsFooter />
</main>

<style>
  .stage {
    width: 100%;
    height: 100vh;
    position: relative;
    box-sizing: border-box;
    overflow: hidden;
  }
  .boot-splash {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--dim);
    font-family: var(--font-mono);
    font-size: 14px;
  }
  .conn-pill {
    position: absolute;
    top: 14px;
    right: 14px;
    background: var(--panel);
    color: var(--fg);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 6px 12px;
    font-family: var(--font-mono);
    font-size: 11px;
  }
  .toasts {
    position: absolute;
    bottom: 14px;
    right: 14px;
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-width: 50%;
  }
  .toast {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 6px 10px;
    font-size: 12px;
    color: var(--fg);
  }
  .toast.t-warn {
    border-color: var(--warn);
  }
  .toast.t-error {
    border-color: var(--bad);
    color: var(--bad);
  }
</style>
