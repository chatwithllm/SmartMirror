import type { HAClient } from '$lib/ha/client.js';
import { gestureRouter, type Gesture } from './router.js';

/** Listen for `mirror_gesture` events from HA and dispatch via router. */
export function wireGestures(client: HAClient): () => void {
  const off = client.onEvent('mirror_gesture', (data) => {
    const ev = data as { gesture?: Gesture; payload?: unknown };
    if (!ev.gesture) return;
    gestureRouter.dispatch(ev.gesture, ev.payload);
  });
  return off;
}
