<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { isStale } from '$lib/cards/stale.js';
  import { normalizeShopping, type ShopItem } from '$lib/grocery/normalize.js';

  interface Props {
    id: string;
    isActive: boolean;
    props?: { endpoint?: string; n?: number; shoppingEndpoint?: string };
  }
  let { isActive, props = {} }: Props = $props();
  const endpoint = $derived(props.endpoint ?? '/api/news/tech');
  const n = $derived(props.n ?? 5);
  const shoppingEndpoint = $derived(props.shoppingEndpoint ?? '/api/admin/grocery/shopping-list');

  interface NewsItem { title: string; url: string; score: number; by: string }
  let items = $state<NewsItem[]>([]);
  let failed = $state(false);
  let lastSuccessTs = $state(0);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function loadNews() {
    try {
      const r = await fetch(`${endpoint}?n=${n}`, { cache: 'no-store' });
      if (!r.ok) { failed = true; return; }
      const j = (await r.json()) as { items?: NewsItem[] };
      items = j.items ?? [];
      lastSuccessTs = Date.now();
      failed = false;
    } catch {
      failed = true;
    }
  }

  // Shopping ticker pulled from extended.npalakurla.com via the
  // existing /api/admin/grocery/shopping-list proxy. Open items only;
  // 60s refresh independent of the news 10min cadence.
  let shopping = $state<ShopItem[]>([]);
  let shopFailed = $state(false);
  let shopTimer: ReturnType<typeof setInterval> | null = null;

  async function loadShopping() {
    try {
      const r = await fetch(shoppingEndpoint, { cache: 'no-store' });
      if (!r.ok) { shopFailed = true; return; }
      const j = (await r.json()) as { configured?: boolean; data?: unknown };
      if (j.configured === false) {
        shopping = [];
        shopFailed = false;
        return;
      }
      const all = normalizeShopping(j.data) as ShopItem[];
      shopping = all.filter((it) => !it.done);
      shopFailed = false;
    } catch {
      shopFailed = true;
    }
  }

  onMount(() => {
    if (!isActive) return;
    void loadNews();
    void loadShopping();
    timer = setInterval(loadNews, 10 * 60 * 1000);
    shopTimer = setInterval(loadShopping, 60 * 1000);
  });
  onDestroy(() => {
    if (timer) clearInterval(timer);
    if (shopTimer) clearInterval(shopTimer);
  });

  const stale = $derived(isStale(lastSuccessTs, 10 * 60 * 1000));

  // Build the shopping ticker text — name + optional category.
  const shoppingLine = $derived.by(() => {
    if (shopFailed) return '— shopping list unavailable —';
    if (shopping.length === 0) return "Pantry's stocked";
    return shopping
      .slice(0, 12)
      .map((it) => (it.category ? `${it.name} · ${it.category}` : it.name))
      .join('   ◆   ');
  });
</script>

<section class="news" data-stale={stale ? 'true' : undefined}>
  <header class="kicker">— Tech Wire —</header>
  {#if failed}
    <p class="fail">— card unavailable —</p>
  {:else if lastSuccessTs === 0}
    <ol class="skel">
      <li><span class="skel-bar w70"></span></li>
      <li><span class="skel-bar w90"></span></li>
      <li><span class="skel-bar w60"></span></li>
    </ol>
  {:else if items.length === 0}
    <p class="empty">News brief unavailable</p>
  {:else}
    <ol>
      {#each items as it, i (it.url)}
        <li>
          <span class="num">{i + 1}</span>
          <span class="title">{it.title}</span>
        </li>
      {/each}
    </ol>
  {/if}

  <!-- Shopping list strip: scrolling pantry items pulled live from
       extended.npalakurla.com. Same broadcast-ticker pattern as the
       masthead + camera grid for visual continuity. -->
  <div class="shop-strip">
    <div class="shop-tag">Pantry</div>
    <div class="shop-ticker">
      <div class="shop-track">
        {#each [0, 1] as loop (loop)}
          <span class="shop-loop" aria-hidden={loop === 1}>{shoppingLine}{'   ◆   '}</span>
        {/each}
      </div>
    </div>
  </div>

  <div class="rule" aria-hidden="true"></div>
</section>

<style>
  .news { height: 100%; padding: 0.6rem 0.8rem 0.7rem; display: flex; flex-direction: column; color: var(--fg); font-family: 'Fraunces', Georgia, serif; position: relative; }
  .kicker { font-style: italic; font-size: 0.6rem; letter-spacing: 0.28em; text-transform: uppercase; color: var(--dim); margin-bottom: 0.5rem; }
  .empty, .fail { font-style: italic; color: var(--dim); font-size: 1.05rem; margin: auto 0; }
  .fail { color: var(--dimmer); }
  ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; flex: 1; }
  li { display: grid; grid-template-columns: 1.6rem 1fr; gap: 0.5rem; align-items: baseline; }
  .num { font-style: italic; font-weight: 700; color: var(--accent); font-feature-settings: 'tnum'; font-size: 0.85rem; }
  .title { font-style: italic; font-size: 0.92rem; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
  .rule { position: absolute; left: 0.8rem; right: 0.8rem; bottom: 0; height: 1px; background: var(--line); }
  .news[data-stale='true'] {
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

  /* Shopping list ticker strip — pinned to bottom of the card. */
  .shop-strip {
    flex: none;
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: stretch;
    height: 1.3rem;
    margin-top: 0.5rem;
    border-top: 1px solid var(--line);
    overflow: hidden;
  }
  .shop-tag {
    display: flex;
    align-items: center;
    padding: 0 0.7rem;
    background: var(--accent);
    color: #000;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 700;
    font-size: 0.55rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    white-space: nowrap;
    clip-path: polygon(0 0, 100% 0, calc(100% - 0.45rem) 100%, 0 100%);
    padding-right: 1rem;
  }
  .shop-ticker {
    overflow: hidden;
    position: relative;
    -webkit-mask-image: linear-gradient(
      to right,
      transparent 0,
      black 3%,
      black 97%,
      transparent 100%
    );
    mask-image: linear-gradient(
      to right,
      transparent 0,
      black 3%,
      black 97%,
      transparent 100%
    );
  }
  .shop-track {
    display: inline-flex;
    align-items: center;
    height: 100%;
    white-space: nowrap;
    animation: shop-scroll 45s linear infinite;
    will-change: transform;
  }
  .shop-loop {
    display: inline-block;
    padding-left: 1rem;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 0.7rem;
    color: var(--fg);
    letter-spacing: 0.04em;
  }
  @keyframes shop-scroll {
    from { transform: translateX(0); }
    to   { transform: translateX(-50%); }
  }
</style>
