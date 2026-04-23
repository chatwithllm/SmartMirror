<script lang="ts">
  import BaseTile from './BaseTile.svelte';

  interface Card {
    id: string;
    title: string;
    column: 'todo' | 'doing' | 'review' | 'done';
    assignee?: string;
  }

  interface Props {
    id: string;
    props?: { source?: string; project_id?: string; demo?: Card[] };
  }

  let { id, props = {} }: Props = $props();

  const cards: Card[] = $derived(
    props.demo ?? [
      { id: '1', title: 'Kiosk shell', column: 'done' },
      { id: '2', title: 'Control loop', column: 'done' },
      { id: '3', title: 'Plex tile', column: 'done' },
      { id: '4', title: 'Inventory bundle', column: 'doing' },
      { id: '5', title: 'Themes', column: 'todo' },
      { id: '6', title: 'Resize engine', column: 'todo' },
      { id: '7', title: 'FLIP tuning', column: 'review', assignee: 'claude' }
    ]
  );

  const cols = ['todo', 'doing', 'review', 'done'] as const;
  const byCol = $derived(
    cols.map((c) => ({ col: c, items: cards.filter((k) => k.column === c) }))
  );
</script>

<BaseTile {id} type="project_board" label="Board">
  <div class="pb" data-testid="project-board">
    <h4 class="mono">Project board</h4>
    <div class="grid">
      {#each byCol as group (group.col)}
        <section class="col col-{group.col}">
          <header class="mono">{group.col} · {group.items.length}</header>
          <ul>
            {#each group.items as c (c.id)}
              <li>
                <span class="t">{c.title}</span>
                {#if c.assignee}<span class="a mono">@{c.assignee}</span>{/if}
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>
  </div>
</BaseTile>

<style>
  .pb {
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
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    overflow: hidden;
  }
  .col header {
    font-size: 0.7rem;
    color: var(--dim);
    text-transform: uppercase;
    letter-spacing: 0.14em;
    padding-bottom: 3px;
    border-bottom: 1px solid var(--line);
  }
  .col-doing header {
    color: var(--accent);
  }
  .col-review header {
    color: var(--warn);
  }
  .col-done header {
    color: var(--ok);
  }
  ul {
    list-style: none;
    margin: 4px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  li {
    background: var(--panel-2);
    border-radius: var(--radius-sm);
    padding: 4px 6px;
    font-size: 0.75rem;
    color: var(--fg);
  }
  .a {
    color: var(--dim);
    font-size: 0.7rem;
    margin-left: 4px;
  }
</style>
