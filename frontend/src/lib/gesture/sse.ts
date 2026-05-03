import { browser } from '$app/environment';
import { gestureRouter, type Gesture } from './router.js';

/**
 * Phase 13.2 wiring. The kiosk-local gesture service POSTs each
 * classified gesture to /api/gesture; the SvelteKit server fans the
 * event out via SSE on /api/gesture/stream. We subscribe here, parse
 * the payload, and dispatch into the in-browser gestureRouter.
 *
 * EventSource handles reconnect natively (3 s default). On reconnect
 * we don't replay the last event — gestures are one-shot inputs.
 */

const KNOWN: ReadonlySet<Gesture> = new Set<Gesture>([
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

const STREAM_URL = '/api/gesture/stream';
const STALE_MS = 30_000;

export interface GesturePayload {
  gesture: Gesture;
  ts: number;
  payload?: unknown;
}

export function parseGestureMessage(raw: string): GesturePayload | null {
  let j: unknown;
  try {
    j = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!j || typeof j !== 'object') return null;
  const o = j as { gesture?: unknown; ts?: unknown; payload?: unknown };
  if (typeof o.gesture !== 'string' || !KNOWN.has(o.gesture as Gesture)) return null;
  const ts = typeof o.ts === 'number' ? o.ts : Number(o.ts);
  if (!Number.isFinite(ts) || ts <= 0) return null;
  return { gesture: o.gesture as Gesture, ts, payload: o.payload };
}

export interface WireOptions {
  /** Test seam — defaults to the global EventSource. */
  EventSourceCtor?: typeof EventSource;
  /** Test seam — defaults to wall-clock seconds. */
  now?: () => number;
}

/**
 * Open the SSE channel. Returns a stop function that closes the
 * EventSource and detaches listeners.
 */
export function wireGestures(opts: WireOptions = {}): () => void {
  const Ctor = opts.EventSourceCtor ?? (browser ? EventSource : undefined);
  if (!Ctor) return () => {};

  const now = opts.now ?? (() => Date.now() / 1000);
  const es = new Ctor(STREAM_URL);

  const onMessage = (ev: MessageEvent<string>) => {
    const p = parseGestureMessage(ev.data);
    if (!p) return;
    // Drop events older than 30 s — guards against a buffered SSE
    // backlog on reconnect replaying ancient state.
    if (now() - p.ts > STALE_MS / 1000) return;
    gestureRouter.dispatch(p.gesture, p.payload);
  };

  // The server tags real gestures as `event: gesture`; heartbeats are
  // SSE comments (lines starting with `:`) and never reach a listener,
  // so we don't have to filter them out here.
  es.addEventListener('gesture', onMessage as EventListener);

  return () => {
    es.removeEventListener('gesture', onMessage as EventListener);
    try {
      es.close();
    } catch {
      /* ignore */
    }
  };
}

export type { Gesture };
