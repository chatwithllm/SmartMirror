<script lang="ts">
  import BaseTile from './BaseTile.svelte';

  interface Item {
    id: string;
    title: string;
    subtitle?: string;
    thumb?: string;
  }

  interface Props {
    id: string;
    props?: { library?: string; limit?: number; demo?: Item[] };
  }

  let { id, props = {} }: Props = $props();
  const limit = $derived(Math.min(Math.max(props.limit ?? 6, 2), 24));
  const items: Item[] = $derived(
    props.demo ?? [
      { id: '1', title: 'Dune: Part Two', subtitle: '2024' },
      { id: '2', title: 'The Bear', subtitle: 'S03' },
      { id: '3', title: 'Shogun', subtitle: 'S01' },
      { id: '4', title: 'Severance', subtitle: 'S02' },
      { id: '5', title: 'Oppenheimer', subtitle: '2023' },
      { id: '6', title: 'Andor', subtitle: 'S02' }
    ]
  );
</script>

<BaseTile {id} type="plex_recent" label="Plex · Recently Added">
  <div class="pr" data-testid="plex-recent">
    <h4 class="mono">Recently Added</h4>
    <div class="grid">
      {#each items.slice(0, limit) as it (it.id)}
        <article class="card">
          <div class="thumb" aria-hidden="true">
            {#if it.thumb}
              <img src={it.thumb} alt="" />
            {:else}
              <div class="thumb-empty mono">{it.title.substring(0, 2).toUpperCase()}</div>
            {/if}
          </div>
          <div class="title">{it.title}</div>
          <div class="sub mono">{it.subtitle ?? ''}</div>
        </article>
      {/each}
    </div>
  </div>
</BaseTile>

<style>
  .pr {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  h4 {
    color: var(--dim);
    font-size: 10px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
    gap: 8px;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .thumb {
    aspect-ratio: 2 / 3;
    background: var(--panel-2);
    border-radius: var(--radius-sm);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .thumb-empty {
    color: var(--dim);
    font-size: 18px;
    letter-spacing: 0.1em;
  }
  .title {
    color: var(--fg);
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sub {
    color: var(--dim);
    font-size: 9px;
  }
</style>
