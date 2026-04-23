import type { Component } from 'svelte';
import ClockTile from './ClockTile.svelte';
import WeatherTile from './WeatherTile.svelte';

/**
 * Tile registry. Each phase adds the next batch. Grid.svelte looks up
 * tile types here; unknown types render an inline placeholder rather
 * than crashing the grid.
 */
export const TILES: Record<string, Component<any>> = {
  clock: ClockTile,
  weather: WeatherTile
};

export type TileType = keyof typeof TILES;

export function isKnownTile(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(TILES, type);
}
