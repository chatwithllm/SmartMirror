<script lang="ts">
  import BaseTile from './BaseTile.svelte';

  interface Item {
    id: string;
    name: string;
    qty: number;
    min: number;
    unit?: string;
  }

  interface Props {
    id: string;
    props?: { source?: string; demo?: Item[] };
  }

  let { id, props = {} }: Props = $props();
  const items: Item[] = $derived(
    (props.demo ?? [
      { id: '1', name: 'Milk', qty: 1, min: 2, unit: 'L' },
      { id: '2', name: 'Tomatoes', qty: 3, min: 4, unit: 'pcs' },
      { id: '3', name: 'Olive oil', qty: 0.3, min: 0.5, unit: 'L' },
      { id: '4', name: 'Butter', qty: 80, min: 150, unit: 'g' }
    ]).filter((i) => i.qty < i.min)
  );
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
    font-size: 10px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
  .none {
    color: var(--ok);
    font-size: 12px;
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
    font-size: 12px;
    padding: 3px 0;
    border-bottom: 1px solid var(--line);
  }
  .n {
    color: var(--fg);
  }
  .q {
    color: var(--bad);
    font-size: 11px;
  }
</style>
