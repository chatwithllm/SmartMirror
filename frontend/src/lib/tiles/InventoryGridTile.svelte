<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import BaseTile from './BaseTile.svelte';
  import { normalizeInventory, type InvItem as Item } from '$lib/grocery/normalize.js';

  interface Props {
    id: string;
    props?: { source?: string; filter?: string; threshold?: number; demo?: Item[] };
  }

  let { id, props = {} }: Props = $props();

  const demo: Item[] = props.demo ?? [
    { id: '1', name: 'Eggs', qty: 6, min: 4, unit: 'pcs', category: 'dairy' },
    { id: '2', name: 'Milk', qty: 1, min: 2, unit: 'L', category: 'dairy' },
    { id: '3', name: 'Coffee beans', qty: 480, min: 250, unit: 'g', category: 'pantry' },
    { id: '4', name: 'Tomatoes', qty: 3, min: 4, unit: 'pcs', category: 'produce' },
    { id: '5', name: 'Rice', qty: 2.1, min: 1, unit: 'kg', category: 'pantry' },
    { id: '6', name: 'Olive oil', qty: 0.3, min: 0.5, unit: 'L', category: 'pantry' }
  ];
  let live = $state<Item[] | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function pull() {
    try {
      const r = await fetch('/api/admin/grocery/inventory', { cache: 'no-store' });
      if (!r.ok) return;
      const j = (await r.json()) as { configured?: boolean; data?: unknown };
      if (!j?.configured) return;
      const rows = normalizeInventory(j.data);
      if (rows.length) live = rows;
    } catch {
      /* keep current */
    }
  }

  onMount(() => {
    if (!browser) return;
    void pull();
    timer = setInterval(pull, 30_000);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  const items: Item[] = $derived(live ?? demo);

  function pct(i: Item) {
    return Math.min(100, Math.max(0, Math.round((i.qty / Math.max(i.min * 2, 1)) * 100)));
  }
</script>

<BaseTile {id} type="inventory_grid" label="Inventory">
  <div class="inv" data-testid="inventory">
    <h4 class="mono">Pantry</h4>
    <div class="grid">
      {#each items as it (it.id)}
        {@const p = pct(it)}
        <div class="cell" class:low={it.qty < it.min}>
          <div class="n">{it.name}</div>
          <div class="bar"><div class="fill" style:width="{p}%"></div></div>
          <div class="q mono">{it.qty}{it.unit ?? ''}</div>
        </div>
      {/each}
    </div>
  </div>
</BaseTile>

<style>
  .inv {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    height: 100%;
  }
  h4 {
    color: var(--dim);
    font-size: 0.75rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9.23rem, 1fr));
    gap: 6px;
  }
  .cell {
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .cell.low {
    border-color: var(--bad);
  }
  .n {
    color: var(--fg);
    font-size: 0.8rem;
  }
  .bar {
    height: 3px;
    background: var(--bg);
    border-radius: 2px;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--ok);
  }
  .cell.low .fill {
    background: var(--bad);
  }
  .q {
    font-size: 0.75rem;
    color: var(--dim);
    text-align: right;
  }
</style>
