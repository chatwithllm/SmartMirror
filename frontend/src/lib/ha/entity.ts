import { writable, type Readable } from 'svelte/store';
import { browser } from '$app/environment';

export interface HaEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
}

interface RuntimeCfg {
  baseUrl: string;     // kept for compat; unused for fetches now
  token: string;       // kept for compat; unused for fetches now
  haReady: boolean;
}

function getRuntime(): RuntimeCfg | null {
  if (!browser) return null;
  const w = window as unknown as { __HA_URL__?: string; __HA_TOKEN__?: string };
  // +layout.svelte publishes these via onMount, but poll-based entity
  // watchers can also read straight from +layout.server.ts data if
  // window hasn't been populated yet. The values are kept for back-compat
  // — actual fetches go through the same-origin /api/ha/ proxy so we
  // dodge Cloudflare CORS preflight blocking.
  if (w.__HA_URL__ && w.__HA_TOKEN__) {
    return { baseUrl: w.__HA_URL__, token: w.__HA_TOKEN__, haReady: true };
  }
  return null;
}

async function fetchEntity(_cfg: RuntimeCfg, id: string): Promise<HaEntity | null> {
  try {
    // Proxy path — same-origin, no CORS, server adds bearer auth.
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
    const cfg = getRuntime();
    if (!cfg) return;
    const e = await fetchEntity(cfg, id);
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
  const cfg = getRuntime();
  if (!cfg) return null;
  return fetchEntity(cfg, id);
}
