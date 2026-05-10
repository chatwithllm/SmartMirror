import { writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface SectionHeights {
  [tileId: string]: number;
}

const STORAGE_KEY = (mode: string, orientation: string) =>
  `mirror.layout.${mode}.${orientation}.heights`;

function loadInitial(mode: string, orientation: string): SectionHeights {
  if (!browser) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY(mode, orientation));
    if (!raw) return {};
    const j = JSON.parse(raw) as SectionHeights;
    return typeof j === 'object' && j !== null ? j : {};
  } catch {
    return {};
  }
}

/**
 * Per-layout section-height override store. Keyed by tile id; values
 * are integer row spans. Falls back to the layout JSON h when a tile
 * isn't in the override map. Persists to localStorage.
 */
export function createHeightStore(
  mode: string,
  orientation: string
): Writable<SectionHeights> {
  const inner = writable<SectionHeights>(loadInitial(mode, orientation));
  if (browser) {
    inner.subscribe((v) => {
      try {
        localStorage.setItem(STORAGE_KEY(mode, orientation), JSON.stringify(v));
      } catch {
        /* swallow — quota / private mode */
      }
    });
  }
  return inner;
}

/**
 * Compute the effective per-tile h given an override map.
 * Returns the override if present, else the original h.
 */
export function effectiveH(
  tile: { id: string; h: number },
  overrides: SectionHeights
): number {
  const o = overrides[tile.id];
  return typeof o === 'number' && o >= 1 ? o : tile.h;
}

/**
 * Recompute grid y-positions for vertically-stacked single-column
 * tiles after a height change. Returns a map of tile id → new y.
 * Handles only the editorial-daily portrait shape (one column, all
 * tiles span full width). Other layouts pass tiles through unchanged.
 */
export function reflowYs(
  tiles: Array<{ id: string; x: number; y: number; w: number; h: number }>,
  overrides: SectionHeights,
  cols: number
): Record<string, number> {
  const fullColTiles = tiles.filter((t) => t.x === 0 && t.w === cols);
  const sortedById = new Map(tiles.map((t) => [t.id, t.y]));
  if (fullColTiles.length === tiles.length) {
    // Single-column stack — reflow.
    const sorted = [...fullColTiles].sort((a, b) => a.y - b.y);
    const out: Record<string, number> = {};
    let cursor = 0;
    for (const t of sorted) {
      out[t.id] = cursor;
      cursor += effectiveH(t, overrides);
    }
    return out;
  }
  // Multi-column layouts: don't reflow — return original ys.
  const out: Record<string, number> = {};
  for (const [id, y] of sortedById) out[id] = y;
  return out;
}
