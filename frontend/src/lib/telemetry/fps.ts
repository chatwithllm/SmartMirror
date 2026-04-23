import { writable } from 'svelte/store';

export const fpsStore = writable<number>(0);
export const domNodesStore = writable<number>(0);
export const heapMbStore = writable<number>(0);

let rafHandle: number | null = null;

export function startFpsSampler(opts: { window?: number } = {}) {
  if (typeof window === 'undefined') return () => {};
  const windowMs = opts.window ?? 1000;
  const samples: number[] = [];
  function loop(ts: number) {
    samples.push(ts);
    const cutoff = ts - windowMs;
    while (samples.length && samples[0] < cutoff) samples.shift();
    fpsStore.set(samples.length);
    rafHandle = requestAnimationFrame(loop);
  }
  rafHandle = requestAnimationFrame(loop);
  return () => {
    if (rafHandle !== null) cancelAnimationFrame(rafHandle);
    rafHandle = null;
  };
}

export function startDomSampler(intervalMs = 5_000) {
  if (typeof document === 'undefined') return () => {};
  const t = setInterval(() => {
    domNodesStore.set(document.getElementsByTagName('*').length);
    // performance.memory is Chrome-only; guard access.
    const perf = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    if (perf?.usedJSHeapSize !== undefined) {
      heapMbStore.set(Math.round(perf.usedJSHeapSize / (1024 * 1024)));
    }
  }, intervalMs);
  return () => clearInterval(t);
}
