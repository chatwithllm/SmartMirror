import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { gestureRouter, focusedTile, fullscreenTile } from './router.js';
import { registerDefaultHandlers } from './handlers.js';
import { layoutStore } from '$lib/layout/store.js';
import { parseLayout } from '$lib/layout/schema.js';

const FIXTURE = parseLayout({
  version: 1,
  mode: 'morning',
  theme: 'minimal-dark',
  orientation: 'portrait',
  grid: { cols: 4, rows: 6, gap: 12 },
  tiles: [
    { id: 'a', type: 'clock', x: 0, y: 0, w: 1, h: 1 },
    { id: 'b', type: 'weather', x: 1, y: 0, w: 1, h: 1 },
    { id: 'c', type: 'calendar', x: 2, y: 0, w: 1, h: 1 }
  ]
});

describe('default gesture handlers', () => {
  let teardown: () => void;

  beforeEach(() => {
    layoutStore.setLayout(FIXTURE);
    focusedTile.set(null);
    fullscreenTile.set(null);
    teardown?.();
    teardown = registerDefaultHandlers();
  });

  it('focus advances through visible tiles and wraps', () => {
    gestureRouter.dispatch('focus');
    expect(get(focusedTile)).toBe('a');
    gestureRouter.dispatch('focus');
    expect(get(focusedTile)).toBe('b');
    gestureRouter.dispatch('focus');
    expect(get(focusedTile)).toBe('c');
    gestureRouter.dispatch('focus');
    expect(get(focusedTile)).toBe('a');
  });

  it('tile_fullscreen elevates the focused tile, tile_minimize clears it', () => {
    focusedTile.set('b');
    gestureRouter.dispatch('tile_fullscreen');
    expect(get(fullscreenTile)).toBe('b');
    gestureRouter.dispatch('tile_minimize');
    expect(get(fullscreenTile)).toBeNull();
  });

  it('tile_fullscreen with no focused tile is a no-op', () => {
    gestureRouter.dispatch('tile_fullscreen');
    expect(get(fullscreenTile)).toBeNull();
  });

  it('alert_ack dispatches a window event', () => {
    let hits = 0;
    const listener = () => (hits += 1);
    window.addEventListener('mirror:alert_ack', listener);
    gestureRouter.dispatch('alert_ack');
    expect(hits).toBe(1);
    window.removeEventListener('mirror:alert_ack', listener);
  });

  it('teardown removes handlers', () => {
    teardown();
    teardown = () => {};
    gestureRouter.dispatch('focus');
    expect(get(focusedTile)).toBeNull();
  });
});
