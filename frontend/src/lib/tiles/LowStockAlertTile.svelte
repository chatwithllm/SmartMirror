<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import BaseTile from './BaseTile.svelte';
  import { normalizeInventory, type InvItem as Item } from '$lib/grocery/normalize.js';

  interface Props {
    id: string;
    props?: { source?: string; demo?: Item[] };
  }

  let { id, props = {} }: Props = $props();
  const demo: Item[] = props.demo ?? [
    { id: '1', name: 'Milk', qty: 1, min: 2, unit: 'L' },
    { id: '2', name: 'Tomatoes', qty: 3, min: 4, unit: 'pcs' },
    { id: '3', name: 'Olive oil', qty: 0.3, min: 0.5, unit: 'L' },
    { id: '4', name: 'Butter', qty: 80, min: 150, unit: 'g' }
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

  const items: Item[] = $derived((live ?? demo).filter((i) => i.qty < i.min));
</script>

<BaseTile {id} type="low_stock_alert" label="Low Stock">
  <div class="ls" data-testid="low-stock">
    <h4 class="mono">Low Stock · {items.length}</h4>
    {#if items.length === 0}
      <div class="none mono">nothing low</div>
    {:else}
      <ul>
        {#each items as i (i.id)}
          <li>
            <span class="n">{i.name}</span>
            <span class="q mono">{i.qty}/{i.min}{i.unit ?? ''}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</BaseTile>

<style>
  .ls {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    height: 100%;
  }
  h4 {
    color: var(--bad);
    font-size: 0.75rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
  .none {
    color: var(--ok);
    font-size: 0.85rem;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  li {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 0.85rem;
    padding: 3px 0;
    border-bottom: 1px solid var(--line);
  }
  .n {
    color: var(--fg);
  }
  .q {
    color: var(--bad);
    font-size: 0.8rem;
  }
</style>
