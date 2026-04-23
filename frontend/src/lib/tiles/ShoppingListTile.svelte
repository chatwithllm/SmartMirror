<script lang="ts">
  import BaseTile from './BaseTile.svelte';

  interface Item {
    id: string;
    name: string;
    qty?: string;
    category?: string;
    done?: boolean;
  }

  interface Props {
    id: string;
    props?: { entity_id?: string; demo?: Item[] };
  }

  let { id, props = {} }: Props = $props();

  let items = $state<Item[]>(
    props.demo ?? [
      { id: '1', name: 'Milk', qty: '2L', category: 'dairy' },
      { id: '2', name: 'Tomatoes', qty: '6', category: 'produce' },
      { id: '3', name: 'Bread', qty: '1 loaf', category: 'bakery' },
      { id: '4', name: 'Pasta', qty: '500g', category: 'pantry' },
      { id: '5', name: 'Olive oil', qty: '750ml', category: 'pantry' },
      { id: '6', name: 'Coffee', qty: '1kg', category: 'pantry' },
      { id: '7', name: 'Butter', qty: '250g', category: 'dairy' },
      { id: '8', name: 'Yogurt', qty: '4', category: 'dairy' }
    ]
  );

  const todoCount = $derived(items.filter((i) => !i.done).length);

  function toggle(iid: string) {
    items = items.map((it) => (it.id === iid ? { ...it, done: !it.done } : it));
  }
</script>

<BaseTile {id} type="shopping_list" label="Shopping">
  <div class="sl" data-testid="shopping">
    <h4 class="mono">Shopping · {todoCount} left</h4>
    <ul>
      {#each items as it (it.id)}
        <li>
          <button
            onclick={() => toggle(it.id)}
            class="check"
            class:done={it.done}
            aria-label={`toggle ${it.name}`}
            data-testid="shop-item"
          >
            {it.done ? '☑' : '☐'}
          </button>
          <span class="n" class:done={it.done}>{it.name}</span>
          {#if it.qty}<span class="q mono">{it.qty}</span>{/if}
          {#if it.category}<span class="c mono">{it.category}</span>{/if}
        </li>
      {/each}
    </ul>
  </div>
</BaseTile>

<style>
  .sl {
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
    gap: 2px;
  }
  li {
    display: grid;
    grid-template-columns: 20px 1fr auto auto;
    gap: 8px;
    align-items: center;
    padding: 3px 4px;
    border-radius: var(--radius-sm);
    font-size: 0.85rem;
  }
  .check {
    background: none;
    border: 0;
    color: var(--dim);
    font-size: 1.05rem;
    cursor: pointer;
  }
  .check.done {
    color: var(--ok);
  }
  .n {
    color: var(--fg);
  }
  .n.done {
    color: var(--dimmer);
    text-decoration: line-through;
  }
  .q {
    color: var(--dim);
    font-size: 0.8rem;
  }
  .c {
    color: var(--accent-2);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }
</style>
