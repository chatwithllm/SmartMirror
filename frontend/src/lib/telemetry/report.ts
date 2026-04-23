import { get } from 'svelte/store';
import { fpsStore, domNodesStore, heapMbStore } from './fps.js';

export interface TelemetryPayload {
  fps: number;
  dom: number;
  heap_mb: number;
  ts: number;
}

export function snapshot(): TelemetryPayload {
  return {
    fps: get(fpsStore),
    dom: get(domNodesStore),
    heap_mb: get(heapMbStore),
    ts: Date.now()
  };
}

/**
 * Post telemetry every N seconds to HA's REST API.
 * HA side has rest sensors that ingest `sensor.mirror_frontend_*`.
 */
export function startReporter(opts: {
  hassUrl: string;
  token: string;
  intervalMs?: number;
}): () => void {
  if (typeof window === 'undefined') return () => {};
  const interval = opts.intervalMs ?? 60_000;
  const timer = setInterval(async () => {
    const p = snapshot();
    await Promise.all([
      postSensor(opts, 'sensor.mirror_frontend_fps', p.fps, 'fps'),
      postSensor(opts, 'sensor.mirror_frontend_heap_mb', p.heap_mb, 'MB'),
      postSensor(opts, 'sensor.mirror_frontend_dom_nodes', p.dom)
    ]);
  }, interval);
  return () => clearInterval(timer);
}

async function postSensor(
  opts: { hassUrl: string; token: string },
  entity_id: string,
  state: number,
  unit?: string
) {
  try {
    await fetch(`${opts.hassUrl}/api/states/${entity_id}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        state,
        attributes: unit ? { unit_of_measurement: unit } : {}
      })
    });
  } catch {
    /* swallow — telemetry must never crash the UI */
  }
}
