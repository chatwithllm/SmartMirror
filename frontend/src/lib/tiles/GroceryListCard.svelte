<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { isStale } from '$lib/cards/stale.js';
  import { normalizeShopping, type ShopItem as GroceryItem } from '$lib/grocery/normalize.js';

  interface Props {
    id: string;
    isActive: boolean;
    props?: { endpoint?: string };
  }
  let { isActive, props = {} }: Props = $props();
  const endpoint = $derived(props.endpoint ?? '/api/admin/grocery/shopping-list');

  let items = $state<GroceryItem[]>([]);
  let failed = $state(false);
  let lastSuccessTs = $state(0);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function load() {
    try {
      const r = await fetch(endpoint, { cache: 'no-store' });
      if (!r.ok) { failed = true; return; }
      const j = (await r.json()) as { configured?: boolean; data?: unknown };
      if (j.configured === false) {
        // User hasn't set up the grocery integration — treat as empty,
        // not failed.
        items = [];
        failed = false;
        lastSuccessTs = Date.now();
        return;
      }
      const all = normalizeShopping(j.data);
      items = all.filter((it) => !it.done);
      lastSuccessTs = Date.now();
      failed = false;
    } catch {
      failed = true;
    }
  }

  onMount(() => {
    if (!isActive) return;
    void load();
    timer = setInterval(load, 30_000);
  });
  onDestroy(() => { if (timer) clearInterval(timer); });

  const stale = $derived(isStale(lastSuccessTs, 30_000));
</script>

<section class="grocery" data-stale={stale ? 'true' : undefined}>
  <header class="kicker">— Pantry —</header>
  {#if failed}
    <p class="fail">— card unavailable —</p>
  {:else if lastSuccessTs === 0}
    <ul class="skel">
      <li><span class="skel-bar w70"></span></li>
      <li><span class="skel-bar w90"></span></li>
      <li><span class="skel-bar w60"></span></li>
    </ul>
  {:else if items.length === 0}
    <p class="empty">Pantry's stocked</p>
  {:else}
    <ul>
      {#each items.slice(0, 6) as it, i (i)}
        <li>
          <span class="n">{it.name}</span>
          {#if it.category}<span class="cat">{it.category}</span>{/if}
        </li>
      {/each}
    </ul>
  {/if}
  <div class="rule" aria-hidden="true"></div>
</section>

<style>
  .grocery { height: 100%; padding: 0.6rem 0.8rem 0.7rem; display: flex; flex-direction: column; color: var(--fg); font-family: 'Fraunces', Georgia, serif; position: relative; }
  .kicker { font-style: italic; font-size: 0.6rem; letter-spacing: 0.28em; text-transform: uppercase; color: var(--dim); margin-bottom: 0.5rem; }
  .empty, .fail { font-style: italic; color: var(--dim); font-size: 1.05rem; margin: auto 0; }
  .fail { color: var(--dimmer); }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; flex: 1; }
  li { display: flex; justify-content: space-between; align-items: baseline; font-style: italic; font-size: 0.95rem; }
  .cat { color: var(--accent); font-size: 0.7rem; letter-spacing: 0.18em; text-transform: uppercase; }
  .rule { position: absolute; left: 0.8rem; right: 0.8rem; bottom: 0; height: 1px; background: var(--line); }
  .grocery[data-stale='true'] {
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
