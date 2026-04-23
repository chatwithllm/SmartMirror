import { describe, it, expect } from 'vitest';
import { gestureRouter } from './router.js';

describe('gestureRouter', () => {
  it('invokes registered handler on matching gesture', () => {
    let hit = 0;
    const off = gestureRouter.on('mode_next', () => (hit += 1));
    gestureRouter.dispatch('mode_next');
    expect(hit).toBe(1);
    off();
  });

  it('silently ignores unmapped gestures', () => {
    expect(() => gestureRouter.dispatch('alert_ack')).not.toThrow();
  });

  it('tracks recent count', () => {
    gestureRouter.dispatch('wake');
    expect(gestureRouter.recentCount()).toBeGreaterThan(0);
  });
});
