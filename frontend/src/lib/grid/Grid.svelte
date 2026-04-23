<script lang="ts">
  import { TILES, isKnownTile } from '$lib/tiles/registry.js';
  import type { Layout } from '$lib/layout/schema.js';

  interface Props {
    layout: Layout;
  }

  let { layout }: Props = $props();

  // Native CSS grid sizing — each tile's geometry comes from the layout
  // JSON. No gridstack dependency for the read-only kiosk path; edit-mode
  // (Phase 12+) layers gridstack on top of the same structure for drag/resize.
  const gridStyle = $derived(
    `grid-template-columns: repeat(${layout.grid.cols}, 1fr);` +
      ` grid-template-rows: repeat(${layout.grid.rows}, 1fr);` +
      ` gap: ${layout.grid.gap}px;`
  );

  function tileStyle(t: { x: number; y: number; w: number; h: number }) {
    return (
      `grid-column: ${t.x + 1} / span ${t.w};` +
      ` grid-row: ${t.y + 1} / span ${t.h};`
    );
  }
</script>

<div
  class="grid-stack"
  style={gridStyle}
  data-mode={layout.mode}
  data-orient={layout.orientation}
>
  {#each layout.tiles as tile (tile.id)}
    {@const Component = isKnownTile(tile.type) ? TILES[tile.type] : null}
    <div
      class="grid-cell"
      data-tile-id={tile.id}
      data-tile-type={tile.type}
      style={tileStyle(tile)}
    >
      {#if Component}
        <Component id={tile.id} props={tile.props} />
      {:else}
        <div class="missing">unknown tile: {tile.type}</div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .grid-stack {
    display: grid;
    width: 100%;
    /* Stage (parent) applies per-side overscan padding; grid fills
     * whatever space it's given. */
    height: 100%;
    box-sizing: border-box;
  }
  .grid-cell {
    min-width: 0;
    min-height: 0;
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
