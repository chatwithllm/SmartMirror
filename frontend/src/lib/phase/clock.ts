import { browser } from '$app/environment';
import { writable, type Readable } from 'svelte/store';

export type Phase = 'pratah' | 'madhyahna' | 'sandhya' | 'ratri';

export function phaseAt(d: Date): Phase {
  const h = d.getHours();
  if (h < 5) return 'ratri';
  if (h < 11) return 'pratah';
  if (h < 17) return 'madhyahna';
  if (h < 22) return 'sandhya';
  return 'ratri';
}

export interface PhaseStoreHandle {
  store: Readable<Phase>;
  tick: () => void;
  stop: () => void;
}

/**
 * Create a Svelte store that emits the current phase. Recomputes on
 * every `tick` (manual or auto-fired by the interval). Exposed
 * separately for tests so we can advance time without timers.
 */
export function createPhaseStore(
  now: () => Date = () => new Date(),
  intervalMs = 60_000
): PhaseStoreHandle {
  const inner = writable<Phase>(phaseAt(now()));
  const tick = () => inner.set(phaseAt(now()));
  const handle = setInterval(tick, intervalMs);
  return {
    store: inner,
    tick,
    stop: () => clearInterval(handle)
  };
}

const phaseHandle = browser ? createPhaseStore() : null;
export const currentPhase: Readable<Phase> = phaseHandle
  ? phaseHandle.store
  : writable<Phase>(phaseAt(new Date()));
