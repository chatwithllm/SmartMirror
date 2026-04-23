<script lang="ts">
  import BaseTile from './BaseTile.svelte';

  interface Item {
    id: string;
    name: string;
    daysLeft: number;
    qty?: string;
  }

  interface Props {
    id: string;
    props?: { demo?: Item[] };
  }

  let { id, props = {} }: Props = $props();
  const items: Item[] = $derived(
    (props.demo ?? [
      { id: '1', name: 'Milk', daysLeft: 2, qty: '1L' },
      { id: '2', name: 'Yogurt', daysLeft: 4, qty: '500g' },
      { id: '3', name: 'Bread', daysLeft: 1, qty: '1 loaf' },
      { id: '4', name: 'Salmon', daysLeft: 0, qty: '400g' },
      { id: '5', name: 'Leftover pasta', daysLeft: -1, qty: '1 box' }
    ]).sort((a, b) => a.daysLeft - b.daysLeft)
  );

  function label(d: number) {
    if (d < 0) return 'expired';
    if (d === 0) return 'today';
    if (d === 1) return '1d';
    return `${d}d`;
  }

  function sev(d: number): 'bad' | 'warn' | 'ok' {
    if (d <= 1) return 'bad';
    if (d <= 3) return 'warn';
    return 'ok';
  }
</script>

<BaseTile {id} type="expiry" label="Expiring">
  <div class="ex" data-testid="expiry">
    <h4 class="mono">Expiring soon</h4>
    <ul>
      {#each items as it (it.id)}
        <li class="s-{sev(it.daysLeft)}">
          <span class="n">{it.name}</span>
          {#if it.qty}<span class="q mono">{it.qty}</span>{/if}
          <span class="d mono">{label(it.daysLeft)}</span>
        </li>
      {/each}
    </ul>
  </div>
</BaseTile>

<style>
  .ex {
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
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  li {
    display: grid;
    grid-template-columns: 1fr auto 48px;
    gap: 8px;
    align-items: baseline;
    font-size: 0.85rem;
    padding: 3px 0;
    border-bottom: 1px solid var(--line);
  }
  .n {
    color: var(--fg);
  }
  .q {
    color: var(--dim);
    font-size: 0.75rem;
  }
  .d {
    color: var(--dim);
    text-align: right;
    font-size: 0.8rem;
  }
  .s-bad .d {
    color: var(--bad);
  }
  .s-warn .d {
    color: var(--warn);
  }
</style>
