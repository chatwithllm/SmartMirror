import { writable } from 'svelte/store';

/**
 * Tiny store that shifts a 1–2 px offset every 8 min to rotate
 * bright static pixels (clock, mode chip). Applied via CSS translate
 * on subscribed tiles.
 */
export const burnInOffset = writable<{ x: number; y: number }>({ x: 0, y: 0 });

const OFFSETS: Array<{ x: number; y: number }> = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 }
];

let idx = 0;
let timer: ReturnType<typeof setInterval> | null = null;

export function startBurnInGuard(intervalMs = 8 * 60 * 1000): () => void {
  if (timer) return () => stopBurnInGuard();
  timer = setInterval(() => {
    idx = (idx + 1) % OFFSETS.length;
    burnInOffset.set(OFFSETS[idx]);
  }, intervalMs);
  return () => stopBurnInGuard();
}

export function stopBurnInGuard() {
  if (timer) clearInterval(timer);
  timer = null;
}
