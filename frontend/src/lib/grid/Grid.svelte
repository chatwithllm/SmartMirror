<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { browser } from '$app/environment';
  import { TILES, isKnownTile } from '$lib/tiles/registry.js';
  import type { Layout, Tile } from '$lib/layout/schema.js';

  interface Props {
    layout: Layout;
  }

  let { layout }: Props = $props();

  let container: HTMLDivElement | null = $state(null);

  // gridstack is a browser-only DOM lib. Import lazily so SSR stays clean.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let grid: any = null;

  onMount(async () => {
    if (!browser || !container) return;
    const mod = await import('gridstack');
    await import('gridstack/dist/gridstack.min.css');
    await tick();
    grid = mod.GridStack.init(
      {
        column: layout.grid.cols,
        cellHeight: `${100 / layout.grid.rows}vh`,
        margin: layout.grid.gap,
        float: false,
        disableDrag: true,
        disableResize: true,
        animate: true,
        staticGrid: true
      },
      container
    );
  });

  onDestroy(() => {
    if (grid) {
      grid.destroy(false);
      grid = null;
    }
  });
</script>

<div
  bind:this={container}
  class="grid-stack"
  data-mode={layout.mode}
  data-orient={layout.orientation}
>
  {#each layout.tiles as tile (tile.id)}
    {@const Component = isKnownTile(tile.type) ? TILES[tile.type] : null}
    <div
      class="grid-stack-item"
      {...{
        'gs-id': tile.id,
        'gs-x': tile.x,
        'gs-y': tile.y,
        'gs-w': tile.w,
        'gs-h': tile.h
      }}
    >
      <div class="grid-stack-item-content">
        {#if Component}
          <Component id={tile.id} props={tile.props} />
        {:else}
          <div class="missing">unknown tile: {tile.type}</div>
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .grid-stack {
    width: 100%;
    height: 100vh;
    padding: var(--overscan);
  }

  .grid-stack-item-content {
    padding: 0;
    inset: 0;
    position: absolute;
  }

  .missing {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--bad);
    font-family: var(--font-mono);
    font-size: 12px;
  }
</style>
