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
  let resizeHandler: (() => void) | null = null;

  function computeCellHeight(): number {
    if (!container || !layout.grid.rows) return 64;
    const h = container.clientHeight || window.innerHeight;
    // Subtract the overscan padding (2vw on each axis — negligible but
    // fall back to a sane minimum).
    return Math.max(32, Math.floor(h / layout.grid.rows));
  }

  onMount(async () => {
    if (!browser || !container) return;
    const mod = await import('gridstack');
    await import('gridstack/dist/gridstack.min.css');
    await tick();
    grid = mod.GridStack.init(
      {
        column: layout.grid.cols,
        cellHeight: computeCellHeight(),
        margin: layout.grid.gap,
        float: false,
        disableDrag: true,
        disableResize: true,
        animate: true,
        staticGrid: true
      },
      container
    );
    // Keep cellHeight honest across rotation / window resize. Kiosk only
    // rotates at boot but browser zoom, unplug-replug, etc. can resize.
    resizeHandler = () => {
      if (grid?.cellHeight) grid.cellHeight(computeCellHeight(), false);
    };
    window.addEventListener('resize', resizeHandler);
  });

  onDestroy(() => {
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
      resizeHandler = null;
    }
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
