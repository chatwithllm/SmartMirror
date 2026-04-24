import type { RequestHandler } from './$types';

// Proxy to Google Distance Matrix API for home → event travel time
// with live traffic. Requires:
//   GOOGLE_MAPS_KEY  (shared with Static Maps)
//   HOME_ADDRESS     (or HOME_LATLNG as "lat,lng")
//
// Query: /api/admin/directions?to=<address>&mode=driving&units=imperial
// Returns JSON: { ok, distance, duration, duration_in_traffic, mode, units }

const HOME = process.env.HOME_LATLNG?.trim() || process.env.HOME_ADDRESS?.trim() || '';

export const GET: RequestHandler = async ({ url }) => {
  const key = process.env.GOOGLE_MAPS_KEY?.trim();
  const to = url.searchParams.get('to')?.trim();
  const mode = (url.searchParams.get('mode') ?? 'driving').toLowerCase();
  const units = (url.searchParams.get('units') ?? 'imperial').toLowerCase();

  if (!key) return json({ ok: false, error: 'no-key' }, 503);
  if (!HOME) return json({ ok: false, error: 'no-home-address' }, 503);
  if (!to) return json({ ok: false, error: 'missing to' }, 400);

  const g = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
  g.searchParams.set('origins', HOME);
  g.searchParams.set('destinations', to);
  g.searchParams.set('mode', mode);
  g.searchParams.set('units', units);
  // Traffic requires a departure_time + driving mode.
  if (mode === 'driving') {
    g.searchParams.set('departure_time', 'now');
    g.searchParams.set('traffic_model', 'best_guess');
  }
  g.searchParams.set('key', key);

  try {
    const r = await fetch(g.toString());
    if (!r.ok) {
      const text = (await r.text()).slice(0, 300);
      return json({ ok: false, error: `upstream ${r.status}`, detail: text }, 502);
    }
    const body = (await r.json()) as DistanceMatrix;
    if (body.status !== 'OK') {
      return json({ ok: false, error: body.status, detail: body.error_message ?? '' }, 502);
    }
    const el = body.rows?.[0]?.elements?.[0];
    if (!el || el.status !== 'OK') {
      return json({ ok: false, error: el?.status ?? 'NO_RESULT' }, 502);
    }
    return json({
      ok: true,
      distance: el.distance,
      duration: el.duration,
      duration_in_traffic: el.duration_in_traffic ?? null,
      mode,
      units,
    });
  } catch (e) {
    return json({ ok: false, error: 'fetch-failed' }, 502);
  }
};

type DMElement = {
  status: string;
  distance?: { text: string; value: number };
  duration?: { text: string; value: number };
  duration_in_traffic?: { text: string; value: number };
};
type DistanceMatrix = {
  status: string;
  error_message?: string;
  rows?: Array<{ elements?: DMElement[] }>;
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}
