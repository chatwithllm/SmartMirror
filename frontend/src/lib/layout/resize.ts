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
 *
 * `heights` accepts either a SectionHeights override map (in which
 * case unset entries fall back to the tile's JSON h) OR a precomputed
 * effective-height map (e.g. from `effectiveHeights`) which already
 * has every tile's final h baked in.
 */
export function reflowYs(
  tiles: Array<{ id: string; x: number; y: number; w: number; h: number }>,
  heights: SectionHeights | Record<string, number>,
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
      const raw = heights[t.id];
      const eh = typeof raw === 'number' && raw >= 1 ? raw : t.h;
      out[t.id] = cursor;
      cursor += eh;
    }
    return out;
  }
  // Multi-column layouts: don't reflow — return original ys.
  const out: Record<string, number> = {};
  for (const [id, y] of sortedById) out[id] = y;
  return out;
}

const MIN_EMPTY_H = 1;
const MIN_NORMAL_H = 2;

export interface SizedTile {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Compute the effective h for each tile in a single-column stack,
 * collapsing empties + redistributing rescued rows to non-empty
 * resizable siblings. Header (any non-section_host tile) keeps its
 * user-override / JSON h verbatim.
 *
 * Returns a map tileId → effective h. Caller uses reflowYs() on the
 * same map to recompute grid-row positions.
 */
export function effectiveHeights(
  tiles: SizedTile[],
  overrides: SectionHeights,
  emptyIds: ReadonlySet<string>,
  totalRows: number
): Record<string, number> {
  const stacked = tiles.filter((t) => t.x === 0).sort((a, b) => a.y - b.y);
  if (stacked.length !== tiles.length) {
    // Multi-column layout — pass through unchanged.
    const out: Record<string, number> = {};
    for (const t of tiles) out[t.id] = effectiveH(t, overrides);
    return out;
  }

  // Pass 1: baseline = override or JSON h.
  const base: Record<string, number> = {};
  for (const t of stacked) base[t.id] = effectiveH(t, overrides);

  // Pass 2: collapse empties to MIN_EMPTY_H. Track rescued rows.
  let rescued = 0;
  const collapsed: Record<string, number> = { ...base };
  for (const t of stacked) {
    if (t.type !== 'section_host') continue; // only section hosts collapse
    if (!emptyIds.has(t.id)) continue;
    const collapsedTo = MIN_EMPTY_H;
    if (collapsed[t.id] > collapsedTo) {
      rescued += collapsed[t.id] - collapsedTo;
      collapsed[t.id] = collapsedTo;
    }
  }

  if (rescued <= 0) return collapsed;

  // Pass 3: distribute rescued rows to non-empty section_host tiles
  // proportionally to their current size.
  const recipients = stacked.filter(
    (t) => t.type === 'section_host' && !emptyIds.has(t.id)
  );
  if (recipients.length === 0) return collapsed;

  const recipientTotal = recipients.reduce((s, t) => s + collapsed[t.id], 0);
  if (recipientTotal === 0) return collapsed;

  let leftover = rescued;
  for (const t of recipients) {
    const share = Math.floor((rescued * collapsed[t.id]) / recipientTotal);
    collapsed[t.id] += share;
    leftover -= share;
  }
  // Stuff any rounding remainder onto the largest recipient.
  if (leftover > 0) {
    const biggest = recipients.reduce((a, b) =>
      collapsed[a.id] >= collapsed[b.id] ? a : b
    );
    collapsed[biggest.id] += leftover;
  }

  // Sanity: don't let any tile drop below MIN_NORMAL_H if it's not in
  // emptyIds (defensive — shouldn't happen via these passes).
  for (const t of stacked) {
    if (!emptyIds.has(t.id) && collapsed[t.id] < MIN_NORMAL_H) {
      collapsed[t.id] = MIN_NORMAL_H;
    }
  }

  // Total budget check — if we somehow overshot totalRows, trim from
  // the biggest section_host until it fits.
  const sum = Object.values(collapsed).reduce((s, v) => s + v, 0);
  if (sum > totalRows) {
    let over = sum - totalRows;
    while (over > 0 && recipients.length > 0) {
      const biggest = recipients.reduce((a, b) =>
        collapsed[a.id] >= collapsed[b.id] ? a : b
      );
      if (collapsed[biggest.id] <= MIN_NORMAL_H) break;
      collapsed[biggest.id] -= 1;
      over -= 1;
    }
  }

  return collapsed;
}
