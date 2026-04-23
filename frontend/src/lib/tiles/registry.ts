import type { Component } from 'svelte';
import ClockTile from './ClockTile.svelte';

/**
 * Tile registry. Phase 01 ships only `clock`; new types added per phase
 * (FRONTEND_SPEC §5). Registry is a plain map now; lazy `import()` chunks
 * land in Phase 03+ once the diff engine picks them up dynamically.
 */
export const TILES: Record<string, Component<any>> = {
  clock: ClockTile
};

export type TileType = keyof typeof TILES;

export function isKnownTile(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(TILES, type);
}
