import { writable } from 'svelte/store';

export type Gesture =
  | 'wake'
  | 'resize_grow'
  | 'resize_shrink'
  | 'focus'
  | 'mode_next'
  | 'mode_prev'
  | 'tile_fullscreen'
  | 'tile_minimize'
  | 'lock'
  | 'media_pause'
  | 'alert_ack';

export const focusedTile = writable<string | null>(null);
export const fullscreenTile = writable<string | null>(null);

/**
 * Transient acknowledgement of the most recent gesture. Written on every
 * dispatch — regardless of whether a handler ran or what it did — so a
 * recognised gesture can never be invisible to the person in front of the
 * mirror. `seq` bumps per event so the HUD can key its flash animation.
 */
export interface GestureHud {
  gesture: Gesture;
  confidence: number | undefined;
  at: number;
  seq: number;
}
export const gestureHud = writable<GestureHud | null>(null);

type Handler = (payload?: unknown) => void;

class Router {
  private handlers = new Map<Gesture, Handler>();
  private log: { gesture: Gesture; at: number }[] = [];
  private seq = 0;

  on(gesture: Gesture, handler: Handler): () => void {
    this.handlers.set(gesture, handler);
    return () => this.handlers.delete(gesture);
  }

  dispatch(gesture: Gesture, payload?: unknown): void {
    this.log.push({ gesture, at: Date.now() });
    if (this.log.length > 32) this.log.shift();
    const confidence =
      payload && typeof payload === 'object' && 'confidence' in payload
        ? (payload as { confidence?: unknown }).confidence
        : undefined;
    const conf =
      typeof confidence === 'number' && Number.isFinite(confidence)
        ? confidence
        : undefined;
    gestureHud.set({ gesture, confidence: conf, at: Date.now(), seq: ++this.seq });
    const h = this.handlers.get(gesture);
    if (h) {
      try {
        h(payload);
      } catch {
        /* swallow */
      }
    }
  }

  recentCount(): number {
    const cutoff = Date.now() - 5_000;
    return this.log.filter((e) => e.at >= cutoff).length;
  }
}

export const gestureRouter = new Router();
