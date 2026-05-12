<script lang="ts">
  /**
   * Shopping list grouped by store, mirroring extended.npalakurla.net's
   * own "by store" view. Each store gets a sub-heading with item count
   * + estimated total; rows under it show name + category + qty +
   * price. Editorial typography (Fraunces serif, gold accents).
   *
   * Wraps the same /api/admin/grocery/shopping-list endpoint as
   * ShoppingByStoreTile but renders chromeless inside SectionHostTile.
   */
  import { getContext, onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { isStale } from '$lib/cards/stale.js';
  import { SECTION_EMPTY_CTX } from '$lib/sections/empty.js';
  import EditorialTicker from '$lib/EditorialTicker.svelte';

  interface Props {
    id: string;
    isActive: boolean;
    props?: { pollMs?: number };
  }
  let { isActive, props = {} }: Props = $props();

  type ApiItem = {
    id: number | string;
    name?: string;
    product_display_name?: string;
    product_full_name?: string;
    category?: string | null;
    quantity?: number | string;
    unit?: string | null;
    size_label?: string | null;
    effective_store?: string | null;
    preferred_store?: string | null;
    status?: string;
    actual_price?: number | null;
    manual_estimated_price?: number | null;
    latest_price?: { price?: number } | null;
  };

  type Row = {
    id: string;
    name: string;
    category: string;
    qty: string;
    price: number;
    done: boolean;
  };
  type Group = { store: string; rows: Row[]; total: number; count: number };

  let groups = $state<Group[]>([]);
  let configured = $state(false);
  let failed = $state(false);
  let lastSuccessTs = $state(0);
  let timer: ReturnType<typeof setInterval> | null = null;

  // Monthly spending-by-category from extended.npalakurla.com /analytics
  // proxy. Drives the marquee (replaces the per-item scroll). Refreshed
  // on a slower cadence — the data only changes when receipts post.
  type CategoryRow = {
    category: string;
    amount: number;
    share_pct?: number;
    delta_pct?: number;
    prev_amount?: number;
  };
  let spending = $state<{ month: string; total: number; categories: CategoryRow[] } | null>(null);
  let spendingTimer: ReturnType<typeof setInterval> | null = null;

  function priceOf(it: ApiItem): number {
    if (typeof it.actual_price === 'number') return it.actual_price;
    if (typeof it.manual_estimated_price === 'number') return it.manual_estimated_price;
    if (it.latest_price && typeof it.latest_price.price === 'number') return it.latest_price.price;
    return 0;
  }

  function qtyOf(it: ApiItem): string {
    const q = it.quantity ?? 1;
    const unit = it.unit && it.unit !== 'each' ? it.unit : '';
    const size = it.size_label ? ` ${it.size_label}` : '';
    return `${q}${unit ? ' ' + unit : ''}${size}`.trim();
  }

  function storeOf(it: ApiItem): string {
    return it.effective_store || it.preferred_store || 'Other';
  }

  function money(n: number): string {
    return `$${n.toFixed(2)}`;
  }

  async function load() {
    try {
      const r = await fetch('/api/admin/grocery/shopping-list', { cache: 'no-store' });
      if (!r.ok) {
        failed = true;
        return;
      }
      const j = (await r.json()) as {
        configured?: boolean;
        data?: {
          items?: ApiItem[];
          suggested_stores?: Array<{ store: string; estimated_total: number; item_count: number }>;
        };
      };
      configured = Boolean(j?.configured);
      if (!configured) {
        groups = [];
        failed = false;
        lastSuccessTs = Date.now();
        return;
      }
      const items = j.data?.items ?? [];
      const suggested = j.data?.suggested_stores ?? [];
      const bucket = new Map<string, Row[]>();
      for (const it of items) {
        const done = (it.status ?? 'open') !== 'open';
        if (done) continue; // open items only on the mirror
        const row: Row = {
          id: String(it.id),
          name: it.name || it.product_display_name || it.product_full_name || '(item)',
          category: (it.category ?? '') as string,
          qty: qtyOf(it),
          price: priceOf(it),
          done
        };
        const store = storeOf(it);
        const arr = bucket.get(store) ?? [];
        arr.push(row);
        bucket.set(store, arr);
      }

      const out: Group[] = [];
      const seen = new Set<string>();
      for (const s of suggested) {
        if (s.item_count === 0) continue;
        seen.add(s.store);
        out.push({
          store: s.store,
          rows: bucket.get(s.store) ?? [],
          total: s.estimated_total,
          count: s.item_count
        });
      }
      for (const [store, rows] of bucket) {
        if (seen.has(store)) continue;
        out.push({
          store,
          rows,
          total: rows.reduce((s, r) => s + r.price, 0),
          count: rows.length
        });
      }
      out.sort((a, b) => b.count - a.count || a.store.localeCompare(b.store));
      groups = out;
      failed = false;
      lastSuccessTs = Date.now();
    } catch {
      failed = true;
    }
  }

  async function loadSpending() {
    try {
      const r = await fetch('/api/admin/grocery/spending-by-category?limit=20', {
        cache: 'no-store'
      });
      if (!r.ok) return;
      const j = (await r.json()) as {
        configured?: boolean;
        data?: { month: string; total: number; categories: CategoryRow[] } | null;
      };
      if (j?.configured && j.data) spending = j.data;
    } catch {
      /* transient — keep last value */
    }
  }

  onMount(() => {
    if (!browser || !isActive) return;
    void load();
    timer = setInterval(load, Math.max(30_000, props.pollMs ?? 30_000));
    void loadSpending();
    // Spending changes when transactions post — refresh every 15 min.
    spendingTimer = setInterval(loadSpending, 15 * 60_000);
  });
  onDestroy(() => {
    if (timer) clearInterval(timer);
    if (spendingTimer) clearInterval(spendingTimer);
  });

  const stale = $derived(isStale(lastSuccessTs, 30_000));
  const totalOpen = $derived(groups.reduce((s, g) => s + g.count, 0));
  const grandTotal = $derived(groups.reduce((s, g) => s + g.total, 0));

  // Tell the host section we're empty so it can collapse to MIN.
  // Gated on lastSuccessTs so first-mount skeletons don't trigger
  // a collapse before any data arrives.
  const markEmpty = getContext<(v: boolean) => void>(SECTION_EMPTY_CTX);
  $effect(() => {
    if (!markEmpty) return;
    markEmpty(configured && lastSuccessTs > 0 && groups.length === 0);
  });

  function titleCase(s: string): string {
    return s
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function deltaArrow(d: number | undefined): string {
    if (typeof d !== 'number' || d === 0) return '';
    return d < 0 ? `↓${Math.abs(d)}%` : `↑${d}%`;
  }

  function monthName(ym: string): string {
    // "2026-05" → "May"
    const [y, m] = ym.split('-').map((x) => parseInt(x, 10));
    if (!y || !m) return ym;
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return names[m - 1] ?? ym;
  }

  // Marquee items: monthly spending-by-category from /analytics. Lets
  // the eye scan budget at a glance instead of reading individual
  // shopping rows. Falls back to a minimal pantry summary when the
  // spending endpoint hasn't responded yet.
  const tickerItems = $derived.by(() => {
    if (spending && spending.categories.length > 0) {
      const out: string[] = [];
      out.push(`${monthName(spending.month)} · ${money(spending.total)} total`);
      for (const c of spending.categories) {
        const name = titleCase(c.category);
        const amt = money(c.amount);
        const share = typeof c.share_pct === 'number' ? ` · ${c.share_pct}%` : '';
        const delta = deltaArrow(c.delta_pct);
        out.push(`${name} · ${amt}${share}${delta ? ' · ' + delta : ''}`);
      }
      return out;
    }
    // Fallback while spending loads or if it's unavailable.
    if (lastSuccessTs === 0 || !configured || groups.length === 0) return [];
    return [`${totalOpen} open · ${money(grandTotal)}`];
  });
</script>

<section class="grocery" data-stale={stale ? 'true' : undefined}>
  <EditorialTicker tag="Pantry" items={tickerItems} durationSec={80} />

  {#if failed}
    <p class="fail">— card unavailable —</p>
  {:else if lastSuccessTs === 0}
    <ol class="skel">
      <li><span class="skel-bar w70"></span></li>
      <li><span class="skel-bar w90"></span></li>
      <li><span class="skel-bar w60"></span></li>
    </ol>
  {:else if !configured}
    <p class="empty">Grocery integration not configured</p>
  {:else if groups.length === 0}
    <p class="empty">Pantry's stocked</p>
  {:else}
    <div class="groups">
      {#each groups as g (g.store)}
        <div class="group">
          <div class="gh">
            <span class="store">{g.store}</span>
            <span class="tot">{money(g.total)} · {g.count}</span>
          </div>
          <ul>
            {#each g.rows as r (r.id)}
              <li>
                <span class="n">{r.name}</span>
                {#if r.category}<span class="c">{r.category}</span>{/if}
                <span class="q">{r.qty}</span>
                <span class="p">{money(r.price)}</span>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
  {/if}
  <div class="rule" aria-hidden="true"></div>
</section>

<style>
  .grocery {
    height: 100%;
    padding: 0.6rem 0.8rem 0.7rem;
    display: flex;
    flex-direction: column;
    color: var(--fg);
    font-family: 'Fraunces', Georgia, serif;
    position: relative;
    min-height: 0;
  }
  .empty,
  .fail {
    font-style: italic;
    color: var(--dim);
    font-size: 1.05rem;
    margin: auto 0;
    text-align: center;
  }
  .fail { color: var(--dimmer); }
  .groups {
    column-count: 2;
    column-gap: 1.2rem;
    column-rule: 1px solid var(--line);
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    padding-right: 0.2rem;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 0.18rem;
    /* Keep store-group intact within a column instead of fragmenting
     * the header onto one column and rows onto the next. */
    break-inside: avoid;
    page-break-inside: avoid;
    margin-bottom: 0.55rem;
  }
  .gh {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 1px solid var(--line);
    padding-bottom: 0.18rem;
    margin-bottom: 0.18rem;
  }
  .store {
    font-style: italic;
    font-weight: 700;
    font-size: 0.95rem;
    color: var(--accent);
    letter-spacing: 0.02em;
  }
  .tot {
    font-style: italic;
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    color: var(--dim);
    font-feature-settings: 'tnum';
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.14rem;
  }
  li {
    display: grid;
    grid-template-columns: 1fr auto auto auto;
    gap: 0.5rem;
    align-items: baseline;
    /* Editorial newsprint body — matches Kanban card weight/size for
     * consistent body type across the three section cards. */
    font-family: 'Fraunces', Georgia, serif;
    font-style: normal;
    font-weight: 500;
    font-size: 0.82rem;
    line-height: 1.3;
    padding: 0.18rem 0;
    border-bottom: 1px solid var(--line);
  }
  .n { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--fg); }
  .c {
    font-size: 0.65rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--dimmer);
    font-style: normal;
  }
  .q { font-size: 0.75rem; color: var(--dim); font-feature-settings: 'tnum'; }
  .p { font-feature-settings: 'tnum'; color: var(--accent); font-weight: 700; }
  .rule {
    position: absolute;
    left: 0.8rem;
    right: 0.8rem;
    bottom: 0;
    height: 1px;
    background: var(--line);
  }
  .grocery[data-stale='true'] { opacity: 0.6; transition: opacity 400ms ease; }
  .skel {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .skel li { padding: 0.2rem 0; display: block; }
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
