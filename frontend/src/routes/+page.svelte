<script lang="ts">
  import { onMount } from 'svelte';
  import Grid from '$lib/grid/Grid.svelte';
  import { layoutStore, currentLayout } from '$lib/layout/store.js';
  import { connection, toasts } from '$lib/stores/connection.js';
  import { DEMO_LAYOUT } from '$lib/layout/demo.js';
  import { HAClient } from '$lib/ha/client.js';
  import { wireLayoutUpdates } from '$lib/ha/subscribe.js';
  import { fetchLayout } from '$lib/layout/fetch.js';
  import { applyTheme } from '$lib/themes/loader.js';
  import { coerceTheme } from '$lib/themes/compat.js';

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

  onMount(() => {
    // Demo / offline boot: seed the store with the bundled layout so the
    // screen is never empty while HA is unreachable.
    layoutStore.setLayout(DEMO_LAYOUT, 0);

    const hassUrl =
      (typeof window !== 'undefined' && (window as any).__HA_URL__) ||
      (import.meta as any).env?.VITE_HA_URL;
    const hassToken =
      (typeof window !== 'undefined' && (window as any).__HA_TOKEN__) ||
      (import.meta as any).env?.VITE_HA_TOKEN;

    if (!hassUrl || !hassToken) {
      connection.set({ kind: 'down', reason: 'no-ha-config' });
      toasts.push('info', 'No HA config in env — running in demo mode');
      return () => {};
    }

    const client = new HAClient({ hassUrl, accessToken: hassToken });
    let unsub: (() => void) | null = null;
    void (async () => {
      try {
        await client.start();
        unsub = await wireLayoutUpdates(client, { baseUrl: hassUrl });
        // Initial pull — revision 0 forces a cache-busted GET.
        const { layout } = await fetchLayout({ baseUrl: hassUrl, revision: 0 });
        layoutStore.setLayout(layout, 0);
      } catch (err) {
        toasts.push('error', `HA bootstrap failed: ${(err as Error).message}`);
      }
    })();

    return () => {
      unsub?.();
      client.stop();
    };
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
