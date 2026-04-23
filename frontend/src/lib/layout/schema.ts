/**
 * Minimal layout types for Phase 01. Full zod schema + runtime validation
 * lands in Phase 03 (control loop). Keeping this file present and narrow
 * so Grid.svelte can import a stable type path now.
 */

export type Orientation = 'portrait' | 'landscape';

export interface Grid {
  cols: number;
  rows: number;
  gap: number;
}

export interface Tile {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z?: number;
  audio?: boolean;
  props?: Record<string, unknown>;
}

export interface Layout {
  version: 1;
  mode: string;
  orientation: Orientation;
  theme: string;
  grid: Grid;
  tiles: Tile[];
  transition?: 'fade' | 'flip' | 'none';
}
