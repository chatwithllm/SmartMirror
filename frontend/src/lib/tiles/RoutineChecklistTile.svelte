<script lang="ts">
  import BaseTile from './BaseTile.svelte';

  interface Item {
    id: string;
    label: string;
    done?: boolean;
  }

  interface Props {
    id: string;
    props?: { title?: string; demo?: Item[] };
  }

  let { id, props = {} }: Props = $props();

  let items = $state<Item[]>(
    props.demo ?? [
      { id: '1', label: 'Hydrate (500ml water)' },
      { id: '2', label: 'Stretch 5 min' },
      { id: '3', label: 'Review calendar' },
      { id: '4', label: 'Take vitamins' },
      { id: '5', label: 'Start coffee' }
    ]
  );

  const doneCount = $derived(items.filter((i) => i.done).length);
  const pct = $derived(Math.round((doneCount / items.length) * 100));

  function toggle(iid: string) {
    items = items.map((it) => (it.id === iid ? { ...it, done: !it.done } : it));
  }
</script>

<BaseTile {id} type="routine_checklist" label={props.title ?? 'Routine'}>
  <div class="rc" data-testid="routine">
    <h4 class="mono">{props.title ?? 'Morning routine'} · {doneCount}/{items.length}</h4>
    <svg class="ring" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="44" stroke="var(--line)" stroke-width="6" fill="none" />
      <circle
        cx="50"
        cy="50"
        r="44"
        stroke="var(--ok)"
        stroke-width="6"
        fill="none"
        stroke-dasharray={2 * Math.PI * 44}
        stroke-dashoffset={2 * Math.PI * 44 * (1 - pct / 100)}
        transform="rotate(-90 50 50)"
        stroke-linecap="round"
      />
      <text x="50" y="52" text-anchor="middle" alignment-baseline="middle" class="rt">
        {pct}%
      </text>
    </svg>
    <ul>
      {#each items as it (it.id)}
        <li>
          <button onclick={() => toggle(it.id)} data-testid={`rc-${it.id}`}>
            {it.done ? '☑' : '☐'}
          </button>
          <span class="l" class:done={it.done}>{it.label}</span>
        </li>
      {/each}
    </ul>
  </div>
</BaseTile>

<style>
  .rc {
    display: grid;
    grid-template-columns: 60px 1fr;
    grid-template-rows: auto 1fr;
    grid-template-areas:
      'h h'
      'ring list';
    gap: 6px;
    width: 100%;
    height: 100%;
  }
  h4 {
    grid-area: h;
    color: var(--dim);
    font-size: 10px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
  .ring {
    grid-area: ring;
    width: 60px;
    height: 60px;
  }
  .rt {
    fill: var(--fg);
    font-family: var(--font-mono);
    font-size: 16px;
  }
  ul {
    grid-area: list;
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  li {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 12px;
  }
  button {
    background: none;
    border: 0;
    color: var(--dim);
    font-size: 14px;
    cursor: pointer;
    padding: 0;
  }
  .l {
    color: var(--fg);
  }
  .l.done {
    color: var(--dimmer);
    text-decoration: line-through;
  }
</style>
