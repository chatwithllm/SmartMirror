import type { Layout } from './schema.js';

/**
 * Local demo layout used when `MIRROR_DEMO=1` (or no HA configured). Mirrors
 * `ha/layouts/work.portrait.json` so dev parity with Phase 02 is obvious.
 */
export const DEMO_LAYOUT: Layout = {
  version: 1,
  mode: 'work',
  orientation: 'portrait',
  theme: 'minimal-dark',
  resolution: '1080p',
  transition: 'flip',
  grid: { cols: 8, rows: 14, gap: 14 },
  tiles: [
    {
      id: 'clock',
      type: 'clock',
      x: 1,
      y: 1,
      w: 6,
      h: 3,
      z: 0,
      props: { format: '24h', showSeconds: true, showDate: true },
      audio: false,
      resizable: true
    },
    {
      id: 'weather',
      type: 'weather',
      x: 1,
      y: 4,
      w: 6,
      h: 4,
      z: 0,
      props: { units: 'metric', days: 5 },
      audio: false,
      resizable: true
    }
  ]
};
