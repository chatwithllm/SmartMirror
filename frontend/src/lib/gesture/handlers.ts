import { get } from 'svelte/store';
import { browser } from '$app/environment';
import { gestureRouter, focusedTile, fullscreenTile, type Gesture } from './router.js';
import { ytCmd } from '$lib/youtube/controller.js';
import { currentLayout } from '$lib/layout/store.js';
import { toasts } from '$lib/stores/connection.js';

/**
 * Default gesture → UI action wiring. HA-side gestures (mode_next/prev,
 * lock) are handled by the HA gesture router automation; this module
 * only owns the in-browser ones.
 *
 * `wake` is a no-op visually — the addon emits it when a hand first
 * enters frame, and the polling loop is already alive — but we surface
 * a toast so the user sees the link is live during demo.
 */

function visibleTileIds(): string[] {
  const layout = get(currentLayout);
  if (!layout) return [];
  return layout.tiles.map((t) => t.id);
}

function cycleFocus(delta: 1 | -1): void {
  const ids = visibleTileIds();
  if (ids.length === 0) return;
  const cur = get(focusedTile);
  const idx = cur ? ids.indexOf(cur) : -1;
  // Wrap around. If nothing was focused, delta=1 → first tile,
  // delta=-1 → last tile.
  const next =
    idx === -1
      ? delta === 1
        ? ids[0]
        : ids[ids.length - 1]
      : ids[(idx + delta + ids.length) % ids.length];
  focusedTile.set(next);
}

function toggleFullscreen(): void {
  const f = get(fullscreenTile);
  if (f) {
    fullscreenTile.set(null);
    return;
  }
  const cur = get(focusedTile);
  if (!cur) {
    toasts.push('warn', 'gesture · focus a tile first');
    return;
  }
  fullscreenTile.set(cur);
}

function dispatchAlertAck(): void {
  if (!browser) return;
  try {
    window.dispatchEvent(
      new CustomEvent('mirror:alert_ack', { detail: { source: 'gesture' } })
    );
  } catch {
    /* ignore */
  }
}

/**
 * Register the default handler set against the singleton gesture
 * router. Returns a teardown that removes them — useful for tests and
 * for HMR cleanup.
 */
export function registerDefaultHandlers(): () => void {
  const offs: Array<() => void> = [];

  offs.push(
    gestureRouter.on('wake', () => {
      toasts.push('info', 'gesture · awake', 2000);
    })
  );

  offs.push(gestureRouter.on('focus', () => cycleFocus(1)));
  // Mode_next/prev are owned by HA, but if HA ever drops them we still
  // want a sane local fallback that cycles focused tile in absence.
  // Intentionally NOT registering anything for mode_next/prev so the
  // router's recent-count metric still records them and HA stays the
  // single source of truth for mode changes.

  offs.push(
    gestureRouter.on('tile_fullscreen', () => {
      const cur = get(focusedTile);
      if (!cur) {
        toasts.push('warn', 'gesture · focus a tile first');
        return;
      }
      fullscreenTile.set(cur);
    })
  );
  offs.push(
    gestureRouter.on('tile_minimize', () => {
      fullscreenTile.set(null);
    })
  );

  offs.push(
    gestureRouter.on('media_pause', () => {
      // Best-effort — only the YouTubeTile registers a player. Other
      // media tiles (Plex, Podcast) don't expose a controller yet.
      const ok = ytCmd('yt_toggle');
      if (!ok) toasts.push('warn', 'gesture · no media to pause');
    })
  );

  offs.push(gestureRouter.on('alert_ack', () => dispatchAlertAck()));

  // resize_grow / resize_shrink can't round-trip through HA in this
  // build (layouts are bundled into the frontend; there's no
  // patch_layout service). Register a stub that surfaces a toast so
  // the gesture is visibly "received but no-op" instead of silently
  // dropped. Spec-compliant when the patch_layout service comes back.
  const resizeNote = () =>
    toasts.push('warn', 'gesture · resize unsupported (bundled layouts)');
  offs.push(gestureRouter.on('resize_grow', resizeNote));
  offs.push(gestureRouter.on('resize_shrink', resizeNote));

  return () => {
    for (const off of offs) off();
  };
}

export const __testing__ = { cycleFocus, toggleFullscreen, visibleTileIds };
export type { Gesture };
