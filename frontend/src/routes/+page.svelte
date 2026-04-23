<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';
  import Grid from '$lib/grid/Grid.svelte';
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
    const [preset, mode, theme, orientation] = await Promise.all([
      fetchState(base, token, 'input_select.mirror_preset'),
      fetchState(base, token, 'input_select.mirror_mode'),
      fetchState(base, token, 'input_select.mirror_theme'),
      fetchState(base, token, 'input_select.mirror_orientation')
    ]);
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
    pollTimer = setInterval(() => {
      void applyHa(hassUrl, hassToken);
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

<main class="stage">
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
</main>

<style>
  .stage {
    width: 100%;
    height: 100vh;
    position: relative;
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
