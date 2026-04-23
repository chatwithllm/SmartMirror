import type { Layout, Tile } from './schema.js';

export type Patch =
  | { kind: 'add'; tile: Tile }
  | { kind: 'remove'; id: string }
  | { kind: 'move'; id: string; x: number; y: number }
  | { kind: 'resize'; id: string; w: number; h: number }
  | { kind: 'move_resize'; id: string; x: number; y: number; w: number; h: number }
  | { kind: 'swap'; id: string; from: Tile; to: Tile }
  | { kind: 'props'; id: string; tile: Tile };

export interface DiffResult {
  patches: Patch[];
  preserveIds: Set<string>;
}

/** Diff prev → next per FRONTEND_SPEC §4. Match tiles by `id`. */
export function diffLayouts(prev: Layout | null, next: Layout): DiffResult {
  const patches: Patch[] = [];
  const preserveIds = new Set<string>();

  if (!prev) {
    for (const t of next.tiles) patches.push({ kind: 'add', tile: t });
    return { patches, preserveIds };
  }

  const prevById = new Map(prev.tiles.map((t) => [t.id, t]));
  const nextById = new Map(next.tiles.map((t) => [t.id, t]));

  // removes
  for (const [id] of prevById) {
    if (!nextById.has(id)) patches.push({ kind: 'remove', id });
  }

  // adds + moves + resizes + swaps + props-only
  for (const [id, to] of nextById) {
    const from = prevById.get(id);
    if (!from) {
      patches.push({ kind: 'add', tile: to });
      continue;
    }
    if (from.type !== to.type) {
      patches.push({ kind: 'swap', id, from, to });
      continue;
    }
    const moved = from.x !== to.x || from.y !== to.y;
    const resized = from.w !== to.w || from.h !== to.h;

    if (moved && resized) {
      patches.push({ kind: 'move_resize', id, x: to.x, y: to.y, w: to.w, h: to.h });
      preserveIds.add(id);
    } else if (moved) {
      patches.push({ kind: 'move', id, x: to.x, y: to.y });
      preserveIds.add(id);
    } else if (resized) {
      patches.push({ kind: 'resize', id, w: to.w, h: to.h });
      preserveIds.add(id);
    } else if (!shallowEqualProps(from.props, to.props)) {
      patches.push({ kind: 'props', id, tile: to });
      preserveIds.add(id);
    } else {
      preserveIds.add(id);
    }
  }

  return { patches, preserveIds };
}

function shallowEqualProps(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) if (a[k] !== b[k]) return false;
  return true;
}
