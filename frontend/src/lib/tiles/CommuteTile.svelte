<script lang="ts">
  import BaseTile from './BaseTile.svelte';

  interface Route {
    name: string;
    minutes: number;
    trafficDelta: number;
    mode: 'car' | 'transit' | 'bike';
  }

  interface Props {
    id: string;
    props?: { origin?: string; destinations?: string[]; demo?: Route[] };
  }

  let { id, props = {} }: Props = $props();

  const routes: Route[] = $derived(
    props.demo ?? [
      { name: 'Work', minutes: 34, trafficDelta: 6, mode: 'car' },
      { name: 'Work (BART)', minutes: 42, trafficDelta: 0, mode: 'transit' },
      { name: 'Gym', minutes: 12, trafficDelta: -2, mode: 'bike' }
    ]
  );
</script>

<BaseTile {id} type="commute" label="Commute">
  <div class="cm" data-testid="commute">
    <h4 class="mono">Commute</h4>
    <ul>
      {#each routes as r (r.name)}
        <li>
          <span class="icon">{r.mode === 'car' ? '🚗' : r.mode === 'transit' ? '🚌' : '🚲'}</span>
          <span class="n">{r.name}</span>
          <span class="t mono">{r.minutes}m</span>
          <span
            class="delta mono"
            class:heavy={r.trafficDelta > 5}
            class:lite={r.trafficDelta < 0}
          >
            {r.trafficDelta > 0 ? '+' : ''}{r.trafficDelta}
          </span>
        </li>
      {/each}
    </ul>
  </div>
</BaseTile>

<style>
  .cm {
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
    grid-template-columns: 1.69rem 1fr auto 2.46rem;
    gap: 6px;
    align-items: center;
    padding: 3px 0;
    border-bottom: 1px solid var(--line);
    font-size: 0.85rem;
  }
  .icon {
    font-size: 1.05rem;
  }
  .n {
    color: var(--fg);
  }
  .t {
    color: var(--dim);
    text-align: right;
    font-size: 0.8rem;
  }
  .delta {
    color: var(--dim);
    text-align: right;
    font-size: 0.8rem;
  }
  .delta.heavy {
    color: var(--bad);
  }
  .delta.lite {
    color: var(--ok);
  }
</style>
