<script lang="ts">
  import { onMount } from 'svelte';
  import { TILES, isKnownTile } from '$lib/tiles/registry.js';
  import type { Layout } from '$lib/layout/schema.js';
  import {
    createHeightStore,
    effectiveH,
    reflowYs,
    type SectionHeights
  } from '$lib/layout/resize.js';

  interface Props {
    layout: Layout;
  }
  let { layout }: Props = $props();

  // Per-layout override store. Recreated on layout swap so stale
  // overrides from a different mode don't leak.
  const heights = $derived(createHeightStore(layout.mode, layout.orientation));
  let overrides = $state<SectionHeights>({});
  $effect(() => {
    const unsub = heights.subscribe((v) => (overrides = v));
    return unsub;
  });

  // Reflowed y per tile — re-runs on overrides change.
  const ys = $derived(reflowYs(layout.tiles, overrides, layout.grid.cols));

  // Tile geometry honoring overrides.
  function tileStyle(t: { id: string; x: number; y: number; w: number; h: number }) {
    const eh = effectiveH(t, overrides);
    const ey = ys[t.id] ?? t.y;
    return (
      `grid-column: ${t.x + 1} / span ${t.w};` +
      ` grid-row: ${ey + 1} / span ${eh};`
    );
  }

  const gridStyle = $derived(
    `grid-template-columns: repeat(${layout.grid.cols}, 1fr);` +
      ` grid-template-rows: repeat(${layout.grid.rows}, 1fr);` +
      ` gap: ${layout.grid.gap}px;`
  );

  // Resize handle drag state. activeId = the tile being resized
  // (the handle lives on the tile's BOTTOM edge — drag transfers rows
  // between this tile and the one immediately below).
  let dragState = $state<{
    activeId: string | null;
    nextId: string | null;
    startY: number;
    startH: number;
    nextStartH: number;
    rowPx: number;
  } | null>(null);

  // Resizable iff: tile is a section_host (we don't resize header /
  // editorial_header) AND there's a sibling tile below it.
  function resizableSiblingId(
    tile: { id: string; type: string },
    sortedIds: string[]
  ): string | null {
    if (tile.type !== 'section_host') return null;
    const idx = sortedIds.indexOf(tile.id);
    if (idx < 0 || idx === sortedIds.length - 1) return null;
    return sortedIds[idx + 1];
  }

  const sortedIds = $derived(
    [...layout.tiles].sort((a, b) => (ys[a.id] ?? a.y) - (ys[b.id] ?? b.y)).map((t) => t.id)
  );

  function startDrag(
    e: PointerEvent,
    tile: { id: string; h: number },
    sibling: { id: string; h: number },
    rowPx: number
  ) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragState = {
      activeId: tile.id,
      nextId: sibling.id,
      startY: e.clientY,
      startH: effectiveH(tile, overrides),
      nextStartH: effectiveH(sibling, overrides),
      rowPx
    };
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragState) return;
    const dy = e.clientY - dragState.startY;
    const deltaRows = Math.round(dy / dragState.rowPx);
    if (deltaRows === 0) return;
    const newH = dragState.startH + deltaRows;
    const newNextH = dragState.nextStartH - deltaRows;
    const MIN = 2;
    if (newH < MIN || newNextH < MIN) return;
    heights.update((m) => ({
      ...m,
      [dragState!.activeId!]: newH,
      [dragState!.nextId!]: newNextH
    }));
  }

  function endDrag(e: PointerEvent) {
    if (!dragState) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragState = null;
  }

  // One row's pixel height = grid container height / total rows. Read
  // off the live element so the drag math matches actual layout.
  let gridEl: HTMLDivElement | null = $state(null);
  function rowPxFor(): number {
    if (!gridEl) return 50;
    const h = gridEl.clientHeight;
    const gap = layout.grid.gap;
    const rows = layout.grid.rows;
    // Approximation: (containerH - (rows-1)*gap) / rows.
    return (h - (rows - 1) * gap) / rows;
  }

  // Reset all overrides — wired to a double-tap on any handle.
  let lastTapId = '';
  let lastTapAt = 0;
  function maybeReset(tileId: string) {
    const now = Date.now();
    if (lastTapId === tileId && now - lastTapAt < 500) {
      heights.set({});
      lastTapAt = 0;
      return true;
    }
    lastTapId = tileId;
    lastTapAt = now;
    return false;
  }
</script>

<div
  class="grid-stack"
  style={gridStyle}
  data-mode={layout.mode}
  data-orient={layout.orientation}
  bind:this={gridEl}
  onpointermove={onPointerMove}
  onpointerup={endDrag}
  onpointercancel={endDrag}
>
  {#each layout.tiles as tile (tile.id)}
    {@const Component = isKnownTile(tile.type) ? TILES[tile.type] : null}
    {@const sibId = resizableSiblingId(tile, sortedIds)}
    {@const sibTile = sibId ? layout.tiles.find((t) => t.id === sibId) : null}
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
      {#if sibTile}
        <button
          class="resize-handle"
          aria-label="Resize {tile.id} / {sibId}"
          title="Drag to resize · double-tap to reset"
          onpointerdown={(e) => {
            if (maybeReset(tile.id)) return;
            startDrag(e, tile, sibTile, rowPxFor());
          }}
        ></button>
      {/if}
    </div>
  {/each}
</div>

<style>
  .grid-stack {
    display: grid;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    position: relative;
    touch-action: none;
  }
  .grid-cell {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    position: relative;
  }
  .resize-handle {
    position: absolute;
    left: 0;
    right: 0;
    bottom: -6px;
    height: 12px;
    z-index: 5;
    cursor: ns-resize;
    touch-action: none;
    border: 0;
    background: transparent;
    padding: 0;
  }
  .resize-handle::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 2.5rem;
    height: 3px;
    border-radius: 2px;
    background: var(--accent);
    opacity: 0;
    transition: opacity 200ms ease;
  }
  .resize-handle:hover::after,
  .resize-handle:focus-visible::after {
    opacity: 0.5;
  }
  .resize-handle:active::after {
    opacity: 1;
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
