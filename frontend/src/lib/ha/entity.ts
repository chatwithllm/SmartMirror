import { writable, type Readable } from 'svelte/store';
import { browser } from '$app/environment';

export interface HaEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
}

async function fetchEntity(id: string): Promise<HaEntity | null> {
  try {
    // Proxy path — same-origin, no CORS, server adds bearer auth.
    // Doesn't need window.__HA_URL__/__HA_TOKEN__ to be populated yet,
    // so we avoid the race where child watchers fire before +layout.svelte
    // onMount has seeded the globals.
    const r = await fetch(`/api/ha/api/states/${encodeURIComponent(id)}`, {
      cache: 'no-store'
    });
    if (!r.ok) return null;
    return (await r.json()) as HaEntity;
  } catch {
    return null;
  }
}

/**
 * Poll an HA entity every `intervalMs` ms. Returns a Svelte store plus
 * a stop function. Safe to call multiple times for the same id — each
 * call creates its own interval (trade cpu for simplicity).
 */
export function watchEntity(
  id: string,
  intervalMs = 5000
): { store: Readable<HaEntity | null>; stop: () => void } {
  const { subscribe, set } = writable<HaEntity | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const tick = async () => {
    const e = await fetchEntity(id);
    if (!stopped) set(e);
  };

  if (browser) {
    void tick();
    timer = setInterval(() => void tick(), intervalMs);
  }

  return {
    store: { subscribe },
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
    }
  };
}

/** One-shot fetch — for tiles that only need initial data. */
export async function getEntity(id: string): Promise<HaEntity | null> {
  return fetchEntity(id);
}
