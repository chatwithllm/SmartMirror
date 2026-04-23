import { describe, it, expect } from 'vitest';
import { enforceSingleAudio } from './single-audio.js';
import type { Layout, Tile } from '$lib/layout/schema.js';

function tile(id: string, audio: boolean): Tile {
  return {
    id,
    type: 'podcast',
    x: 0,
    y: 0,
    w: 2,
    h: 2,
    z: 0,
    props: {},
    audio,
    resizable: true
  };
}

function layoutOf(tiles: Tile[]): Layout {
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

describe('enforceSingleAudio', () => {
  it('passes through when 0 audio tiles', () => {
    const l = layoutOf([tile('a', false), tile('b', false)]);
    const r = enforceSingleAudio(l);
    expect(r.conflict).toBeNull();
    expect(r.layout.tiles.every((t) => !t.audio)).toBe(true);
  });

  it('passes through when exactly 1 audio tile', () => {
    const l = layoutOf([tile('a', true), tile('b', false)]);
    const r = enforceSingleAudio(l);
    expect(r.conflict).toBeNull();
    expect(r.layout.tiles.filter((t) => t.audio)).toHaveLength(1);
  });

  it('keeps first audio tile and mutes the rest', () => {
    const l = layoutOf([tile('a', true), tile('b', true), tile('c', true)]);
    const r = enforceSingleAudio(l);
    expect(r.layout.tiles.filter((t) => t.audio)).toHaveLength(1);
    expect(r.layout.tiles[0].audio).toBe(true);
    expect(r.layout.tiles[1].audio).toBe(false);
    expect(r.layout.tiles[2].audio).toBe(false);
    expect((r.layout.tiles[1].props as any).muted).toBe(true);
    expect(r.conflict).toEqual({ kept: 'a', muted: ['b', 'c'] });
  });
});
