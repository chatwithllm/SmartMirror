<script lang="ts">
  import BaseTile from './BaseTile.svelte';

  interface Recipe {
    id: string;
    title: string;
    matchPct: number;
    missing?: string[];
    time?: number;
  }

  interface Props {
    id: string;
    props?: { demo?: Recipe[] };
  }

  let { id, props = {} }: Props = $props();
  const recipes: Recipe[] = $derived(
    (props.demo ?? [
      { id: '1', title: 'Pasta pomodoro', matchPct: 100, time: 25 },
      { id: '2', title: 'Vegetable stir fry', matchPct: 85, missing: ['ginger'], time: 20 },
      { id: '3', title: 'Grilled salmon', matchPct: 60, missing: ['salmon', 'lemon'], time: 30 },
      { id: '4', title: 'Pancakes', matchPct: 100, time: 15 }
    ]).sort((a, b) => b.matchPct - a.matchPct)
  );
</script>

<BaseTile {id} type="recipe_suggest" label="Recipes">
  <div class="rs" data-testid="recipes">
    <h4 class="mono">Cook tonight</h4>
    <ul>
      {#each recipes as r (r.id)}
        <li>
          <span class="t">{r.title}</span>
          <span class="m mono" class:full={r.matchPct === 100}>{r.matchPct}%</span>
          {#if r.time}<span class="time mono">{r.time}m</span>{/if}
          {#if r.missing?.length}
            <div class="missing mono">missing: {r.missing.join(', ')}</div>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
</BaseTile>

<style>
  .rs {
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
    gap: 4px;
  }
  li {
    display: grid;
    grid-template-columns: 1fr 40px 32px;
    gap: 6px;
    align-items: baseline;
    padding: 4px 0;
    border-bottom: 1px solid var(--line);
    font-size: 0.85rem;
  }
  .t {
    color: var(--fg);
  }
  .m {
    color: var(--dim);
    font-size: 0.8rem;
    text-align: right;
  }
  .m.full {
    color: var(--ok);
  }
  .time {
    color: var(--dim);
    font-size: 0.8rem;
    text-align: right;
  }
  .missing {
    grid-column: 1 / -1;
    color: var(--warn);
    font-size: 0.75rem;
    padding-top: 2px;
  }
</style>
