<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { isStale } from '$lib/cards/stale.js';

  interface Props {
    id: string;
    isActive: boolean;
  }
  let { isActive }: Props = $props();

  interface Notif { entity_id: string; state: string; attributes?: { title?: string; message?: string; created_at?: string } }
  let items = $state<Notif[]>([]);
  let failed = $state(false);
  let lastSuccessTs = $state(0);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function load() {
    try {
      // Same-origin proxy: server adds bearer auth, dodges Cloudflare CORS.
      const r = await fetch('/api/ha/api/states', { cache: 'no-store' });
      if (!r.ok) { failed = true; return; }
      const all = (await r.json()) as Notif[];
      items = all
        .filter((e) => e.entity_id.startsWith('persistent_notification.'))
        .sort((a, b) => {
          const at = a.attributes?.created_at ?? '';
          const bt = b.attributes?.created_at ?? '';
          return bt.localeCompare(at);
        })
        .slice(0, 3);
      lastSuccessTs = Date.now();
      failed = false;
    } catch {
      failed = true;
    }
  }

  onMount(() => {
    if (!isActive) return;
    void load();
    timer = setInterval(load, 15_000);
  });
  onDestroy(() => { if (timer) clearInterval(timer); });

  const fmtTime = (iso?: string) =>
    iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';

  const stale = $derived(isStale(lastSuccessTs, 15_000));
</script>

<section class="notif" data-stale={stale ? 'true' : undefined}>
  <header class="kicker">— System Pulse —</header>
  {#if failed}
    <p class="fail">— card unavailable —</p>
  {:else if lastSuccessTs === 0 && items.length === 0}
    <ul class="skel">
      <li><span class="skel-bar w70"></span></li>
      <li><span class="skel-bar w90"></span></li>
      <li><span class="skel-bar w60"></span></li>
    </ul>
  {:else if items.length === 0}
    <p class="empty">All quiet</p>
  {:else}
    <ul>
      {#each items as n, i (n.entity_id + i)}
        <li>
          <span class="t">{fmtTime(n.attributes?.created_at)}</span>
          <span class="m">{n.attributes?.message ?? n.attributes?.title ?? n.entity_id}</span>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="rule" aria-hidden="true"></div>
</section>

<style>
  .notif { height: 100%; padding: 0.6rem 0.8rem 0.7rem; display: flex; flex-direction: column; color: var(--fg); font-family: 'Fraunces', Georgia, serif; position: relative; }
  .kicker { font-style: italic; font-size: 0.6rem; letter-spacing: 0.28em; text-transform: uppercase; color: var(--dim); margin-bottom: 0.5rem; }
  .empty, .fail { font-style: italic; color: var(--dim); font-size: 1.05rem; margin: auto 0; }
  .fail { color: var(--dimmer); }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  li { display: grid; grid-template-columns: 4rem 1fr; gap: 0.7rem; font-style: italic; font-size: 0.85rem; }
  .t { color: var(--accent); font-feature-settings: 'tnum'; }
  .m { color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rule { position: absolute; left: 0.8rem; right: 0.8rem; bottom: 0; height: 1px; background: var(--line); }
  .notif[data-stale='true'] {
    opacity: 0.6;
    transition: opacity 400ms ease;
  }
  .skel { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  .skel li { padding: 0.2rem 0; }
  .skel-bar {
    display: inline-block;
    height: 0.85rem;
    border-radius: 2px;
    background: linear-gradient(90deg, var(--line) 0%, var(--line-strong) 50%, var(--line) 100%);
    background-size: 200% 100%;
    animation: skel-shimmer 1.6s ease-in-out infinite;
  }
  .skel-bar.w70 { width: 70%; }
  .skel-bar.w90 { width: 90%; }
  .skel-bar.w60 { width: 60%; }
  @keyframes skel-shimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
</style>
