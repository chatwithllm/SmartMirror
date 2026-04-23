import { writable } from 'svelte/store';

export type ConnState =
  | { kind: 'boot' }
  | { kind: 'connecting' }
  | { kind: 'connected'; since: number }
  | { kind: 'reconnecting'; attempt: number; nextRetryMs: number }
  | { kind: 'down'; reason: string };

export const connection = writable<ConnState>({ kind: 'boot' });

export type ToastKind = 'info' | 'warn' | 'error';
export interface Toast {
  id: string;
  kind: ToastKind;
  text: string;
  expiresAt: number;
}

function createToasts() {
  const { subscribe, update } = writable<Toast[]>([]);
  let seq = 0;
  return {
    subscribe,
    push(kind: ToastKind, text: string, ttlMs = 6000) {
      const id = `t${++seq}`;
      const expiresAt = Date.now() + ttlMs;
      update((list) => [...list, { id, kind, text, expiresAt }]);
      setTimeout(() => {
        update((list) => list.filter((t) => t.id !== id));
      }, ttlMs);
      return id;
    },
    clear() {
      update(() => []);
    }
  };
}

export const toasts = createToasts();
