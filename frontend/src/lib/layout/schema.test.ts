import { describe, it, expect } from 'vitest';
import { safeParseLayout } from './schema.js';

describe('LayoutSchema', () => {
  const valid = {
    version: 1,
    mode: 'work',
    orientation: 'portrait',
    theme: 'minimal-dark',
    resolution: '1080p',
    grid: { cols: 8, rows: 14, gap: 14 },
    tiles: [
      { id: 'a', type: 'clock', x: 0, y: 0, w: 2, h: 2 }
    ],
    transition: 'flip'
  };

  it('accepts a well-formed layout', () => {
    const r = safeParseLayout(valid);
    expect(r.ok).toBe(true);
  });

  it('rejects wrong version', () => {
    const r = safeParseLayout({ ...valid, version: 2 });
    expect(r.ok).toBe(false);
  });

  it('rejects unknown mode', () => {
    const r = safeParseLayout({ ...valid, mode: 'nonsense' });
    expect(r.ok).toBe(false);
  });

  it('defaults missing optional tile fields', () => {
    const r = safeParseLayout(valid);
    if (r.ok) {
      expect(r.layout.tiles[0].z).toBe(0);
      expect(r.layout.tiles[0].props).toEqual({});
      expect(r.layout.tiles[0].audio).toBe(false);
    }
  });
});
