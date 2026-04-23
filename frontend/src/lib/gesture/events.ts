import { gestureRouter, type Gesture } from './router.js';

/**
 * Phase 13 placeholder. The HAClient WS wrapper was removed when we
 * pivoted to REST polling — the real wiring will live in a small SSE
 * or fetch-poll shim here once the gesture MQTT addon is deployed.
 */
export function wireGestures(): () => void {
  return () => {};
}

export type { Gesture };
