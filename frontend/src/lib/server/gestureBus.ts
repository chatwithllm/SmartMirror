// In-process gesture bus. The Python service POSTs classified
// gestures to /api/gesture; subscribers (the SSE endpoint) receive
// them via this EventEmitter and stream them to connected browsers.
//
// Single-process by design — the kiosk runs one Node server, and the
// browser is on the same box. No Redis, no queue.

import { EventEmitter } from 'node:events';

export interface GestureEvent {
  gesture: string;
  confidence: number;
  ts: number;
}

const KNOWN = new Set([
  'wake',
  'resize_grow',
  'resize_shrink',
  'focus',
  'mode_next',
  'mode_prev',
  'tile_fullscreen',
  'tile_minimize',
  'lock',
  'media_pause',
  'alert_ack'
]);

class GestureBus extends EventEmitter {
  private last: GestureEvent | null = null;

  emitGesture(ev: GestureEvent): void {
    this.last = ev;
    this.emit('gesture', ev);
  }

  latest(): GestureEvent | null {
    return this.last;
  }
}

export const gestureBus = new GestureBus();
// Bump default — SSE long-poll connections each register one listener,
// and a flapping client could otherwise trip the warn threshold.
gestureBus.setMaxListeners(64);

export function isKnownGesture(name: string): boolean {
  return KNOWN.has(name);
}
