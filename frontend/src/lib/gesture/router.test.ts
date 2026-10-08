import { describe, it, expect } from 'vitest';
import { gestureRouter, gestureHud } from './router.js';
import { get } from 'svelte/store';

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

  it('acknowledges every dispatch on the HUD store', () => {
    gestureRouter.dispatch('media_pause', { confidence: 0.72 });
    const hud = get(gestureHud);
    expect(hud?.gesture).toBe('media_pause');
    expect(hud?.confidence).toBe(0.72);
    expect(hud?.seq).toBeGreaterThan(0);
  });

  it('tolerates a dispatch without a payload', () => {
    gestureRouter.dispatch('focus');
    expect(get(gestureHud)?.confidence).toBeUndefined();
    expect(get(gestureHud)?.gesture).toBe('focus');
  });
});
