import { describe, it, expect } from 'vitest';
import { diffLayouts } from './diff.js';
import type { Layout, Tile } from './schema.js';

function tile(id: string, overrides: Partial<Tile> = {}): Tile {
  return {
    id,
    type: 'clock',
    x: 0,
    y: 0,
    w: 2,
    h: 2,
    z: 0,
    props: {},
    audio: false,
    resizable: true,
    ...overrides
  };
}

function layout(tiles: Tile[]): Layout {
  return {
    version: 1,
    mode: 'work',
    orientation: 'portrait',
    theme: 'minimal-dark',
    resolution: '1080p',
    grid: { cols: 8, rows: 14, gap: 14 },
    tiles,
    transition: 'flip'
  };
}

describe('diffLayouts', () => {
  it('adds all tiles when prev is null', () => {
    const next = layout([tile('a'), tile('b')]);
    const { patches } = diffLayouts(null, next);
    expect(patches).toHaveLength(2);
    expect(patches.every((p) => p.kind === 'add')).toBe(true);
  });

  it('emits remove for tiles absent in next', () => {
    const prev = layout([tile('a'), tile('b')]);
    const next = layout([tile('a')]);
    const { patches } = diffLayouts(prev, next);
    expect(patches).toEqual([{ kind: 'remove', id: 'b' }]);
  });

  it('emits add for tiles new in next', () => {
    const prev = layout([tile('a')]);
    const next = layout([tile('a'), tile('b', { x: 2 })]);
    const { patches } = diffLayouts(prev, next);
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ kind: 'add' });
    expect((patches[0] as any).tile.id).toBe('b');
  });

  it('emits move when x/y change but size is same', () => {
    const prev = layout([tile('a', { x: 0, y: 0 })]);
    const next = layout([tile('a', { x: 3, y: 2 })]);
    const { patches, preserveIds } = diffLayouts(prev, next);
    expect(patches).toEqual([{ kind: 'move', id: 'a', x: 3, y: 2 }]);
    expect(preserveIds.has('a')).toBe(true);
  });

  it('emits resize when w/h change but position is same', () => {
    const prev = layout([tile('a', { w: 2, h: 2 })]);
    const next = layout([tile('a', { w: 4, h: 3 })]);
    const { patches } = diffLayouts(prev, next);
    expect(patches).toEqual([{ kind: 'resize', id: 'a', w: 4, h: 3 }]);
  });

  it('emits move_resize when both change', () => {
    const prev = layout([tile('a', { x: 0, y: 0, w: 2, h: 2 })]);
    const next = layout([tile('a', { x: 1, y: 1, w: 3, h: 3 })]);
    const { patches } = diffLayouts(prev, next);
    expect(patches).toEqual([{ kind: 'move_resize', id: 'a', x: 1, y: 1, w: 3, h: 3 }]);
  });

  it('emits swap when type changes for same id', () => {
    const prev = layout([tile('a', { type: 'clock' })]);
    const next = layout([tile('a', { type: 'weather' })]);
    const { patches } = diffLayouts(prev, next);
    expect(patches).toHaveLength(1);
    expect(patches[0].kind).toBe('swap');
  });

  it('emits props patch when only props differ', () => {
    const prev = layout([tile('a', { props: { format: '24h' } })]);
    const next = layout([tile('a', { props: { format: '12h' } })]);
    const { patches, preserveIds } = diffLayouts(prev, next);
    expect(patches).toHaveLength(1);
    expect(patches[0].kind).toBe('props');
    expect(preserveIds.has('a')).toBe(true);
  });

  it('no-op when prev == next', () => {
    const a = layout([tile('a')]);
    const b = layout([tile('a')]);
    const { patches, preserveIds } = diffLayouts(a, b);
    expect(patches).toEqual([]);
    expect(preserveIds.has('a')).toBe(true);
  });
});
