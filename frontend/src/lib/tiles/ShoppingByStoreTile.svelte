<script lang="ts">
  /**
   * Shopping list grouped by store. Fetches /api/admin/grocery/shopping-list
   * and lays items out per preferred/effective store with a per-store
   * total, matching the grocery app's own "by store" screen.
   */
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import BaseTile from './BaseTile.svelte';

  interface Props {
    id: string;
    props?: { pollMs?: number };
  }
  let { id, props = {} }: Props = $props();

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
    status: string;
    done: boolean;
  };
  type Group = { store: string; rows: Row[]; total: number; count: number };

  let groups = $state<Group[]>([]);
  let loadedOnce = $state(false);
  let configured = $state(false);
  let timer: ReturnType<typeof setInterval> | null = null;

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

  async function pull(): Promise<void> {
    try {
      const r = await fetch('/api/admin/grocery/shopping-list', { cache: 'no-store' });
      if (!r.ok) return;
      const j = (await r.json()) as { configured?: boolean; data?: { items?: ApiItem[] } };
      configured = Boolean(j?.configured);
      if (!configured) {
        loadedOnce = true;
        return;
      }
      const items = j.data?.items ?? [];
      const bucket = new Map<string, Row[]>();
      for (const it of items) {
        const done = (it.status ?? 'open') !== 'open';
        const row: Row = {
          id: String(it.id),
          name:
            it.name ||
            it.product_display_name ||
            it.product_full_name ||
            '(item)',
          category: (it.category ?? '') as string,
          qty: qtyOf(it),
          price: priceOf(it),
          status: it.status ?? 'open',
          done,
        };
        const store = storeOf(it);
        const arr = bucket.get(store) ?? [];
        arr.push(row);
        bucket.set(store, arr);
      }
      // Rank stores by open-item count descending, stable by name.
      const out: Group[] = Array.from(bucket.entries())
        .map(([store, rows]) => {
          const openRows = rows.filter((r) => !r.done);
          const total = openRows.reduce((s, r) => s + r.price, 0);
          return { store, rows, total, count: openRows.length };
        })
        .sort((a, b) => b.count - a.count || a.store.localeCompare(b.store));
      groups = out;
      loadedOnce = true;
    } catch {
      /* keep previous */
    }
  }

  onMount(() => {
    if (!browser) return;
    void pull();
    timer = setInterval(pull, Math.max(30_000, props.pollMs ?? 30_000));
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  const totalOpen = $derived(groups.reduce((s, g) => s + g.count, 0));
</script>

<BaseTile {id} type="shopping_by_store" label="Shopping">
  <div class="list" data-testid="shopping-by-store">
    <h4 class="heading mono">
      Shopping · {totalOpen} open
      {#if !configured && loadedOnce}<span class="warn"> · no grocery key</span>{/if}
    </h4>

    {#if groups.length === 0}
      <div class="empty mono">nothing on the list</div>
    {:else}
      <div class="groups">
        {#each groups as g (g.store)}
          <div class="group">
            <div class="gh">
              <span class="store">{g.store}</span>
              <span class="tot mono">{money(g.total)} · {g.count}</span>
            </div>
            <ul>
              {#each g.rows as r (r.id)}
                <li class:done={r.done}>
                  <span class="n">{r.name}</span>
                  <span class="c mono">{r.category}</span>
                  <span class="q mono">{r.qty}</span>
                  <span class="p mono">{money(r.price)}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</BaseTile>

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  .heading {
    color: var(--dim);
    font-size: 0.75rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
  .warn {
    color: var(--warn);
    text-transform: none;
    letter-spacing: 0.1em;
    font-size: 0.7rem;
  }
  .groups {
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow-y: auto;
    min-height: 0;
  }
  .group {
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    padding: 8px 12px 10px;
    background: var(--panel);
  }
  .gh {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--line);
    margin-bottom: 6px;
  }
  .store {
    font-weight: 600;
    font-size: 0.95rem;
    letter-spacing: 0.02em;
  }
  .tot {
    color: var(--dim);
    font-size: 0.75rem;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  li {
    display: grid;
    grid-template-columns: 1fr auto auto auto;
    gap: 14px;
    padding: 4px 2px;
    font-size: 0.82rem;
    align-items: baseline;
  }
  li.done .n {
    color: var(--dimmer);
    text-decoration: line-through;
  }
  .n {
    color: var(--fg);
  }
  .c {
    color: var(--accent-2);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  .q {
    color: var(--dim);
    font-size: 0.78rem;
    min-width: 3ch;
    text-align: right;
  }
  .p {
    color: var(--fg);
    font-size: 0.82rem;
    min-width: 5ch;
    text-align: right;
  }
  .empty {
    color: var(--dim);
    font-size: 0.85rem;
    padding: 10px 0;
  }
</style>
