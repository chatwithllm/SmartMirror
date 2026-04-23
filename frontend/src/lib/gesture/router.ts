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

type Handler = (payload?: unknown) => void;

class Router {
  private handlers = new Map<Gesture, Handler>();
  private log: { gesture: Gesture; at: number }[] = [];

  on(gesture: Gesture, handler: Handler): () => void {
    this.handlers.set(gesture, handler);
    return () => this.handlers.delete(gesture);
  }

  dispatch(gesture: Gesture, payload?: unknown): void {
    this.log.push({ gesture, at: Date.now() });
    if (this.log.length > 32) this.log.shift();
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
