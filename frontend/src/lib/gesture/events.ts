import { browser } from '$app/environment';
import { gestureRouter, type Gesture } from './router.js';

/**
 * Phase 13 wiring. The frontend uses REST polling everywhere else, so
 * gestures piggy-back the same pattern instead of opening a websocket
 * just for `event.mirror_gesture`. The HA gesture router automation
 * mirrors the latest classified event into
 * `input_text.mirror_last_gesture` as compact JSON; we poll, detect a
 * fresh `ts`, and dispatch into the in-browser `gestureRouter`.
 *
 * Defaults: 1s poll cadence (matches MQTT throughput well enough for a
 * 15 fps classifier) and a 30s freshness window so a stale value left
 * behind from yesterday never triggers on a fresh page load.
 */

const ENTITY = 'input_text.mirror_last_gesture';
const POLL_MS = 1000;
const STALE_MS = 30_000;

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

export interface GesturePayload {
  gesture: Gesture;
  ts: number;
  payload?: unknown;
}

export function parseGestureState(raw: string | null | undefined): GesturePayload | null {
  if (!raw) return null;
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

interface RuntimeCfg {
  baseUrl: string;
  token: string;
}

function getRuntime(): RuntimeCfg | null {
  if (!browser) return null;
  const w = window as unknown as { __HA_URL__?: string; __HA_TOKEN__?: string };
  if (!w.__HA_URL__ || !w.__HA_TOKEN__) return null;
  return { baseUrl: w.__HA_URL__, token: w.__HA_TOKEN__ };
}

async function fetchGesture(cfg: RuntimeCfg): Promise<GesturePayload | null> {
  try {
    const r = await fetch(`${cfg.baseUrl}/api/states/${ENTITY}`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      cache: 'no-store'
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { state?: string };
    return parseGestureState(j.state);
  } catch {
    return null;
  }
}

export interface WireOptions {
  intervalMs?: number;
  /** Test seam — defaults to the runtime poll. */
  fetcher?: () => Promise<GesturePayload | null>;
  /** Test seam — defaults to `Date.now()` in seconds. */
  now?: () => number;
}

/**
 * Start polling. Returns a stop function. The first tick is treated as
 * the baseline so a stale value doesn't fire on page load.
 */
export function wireGestures(opts: WireOptions = {}): () => void {
  if (!browser && !opts.fetcher) return () => {};

  const intervalMs = opts.intervalMs ?? POLL_MS;
  const now = opts.now ?? (() => Date.now() / 1000);
  const fetcher =
    opts.fetcher ??
    (async () => {
      const cfg = getRuntime();
      if (!cfg) return null;
      return fetchGesture(cfg);
    });

  let lastTs = 0;
  let baselined = false;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    const p = await fetcher();
    if (!p) return;
    if (!baselined) {
      lastTs = p.ts;
      baselined = true;
      return;
    }
    if (p.ts <= lastTs) return;
    lastTs = p.ts;
    // Drop values that are older than STALE_MS — keeps a rebooted box
    // from replaying the gesture that was on screen when it crashed.
    if (now() - p.ts > STALE_MS / 1000) return;
    gestureRouter.dispatch(p.gesture, p.payload);
  };

  void tick();
  const id = setInterval(() => void tick(), intervalMs);

  return () => {
    stopped = true;
    clearInterval(id);
  };
}

export type { Gesture };
