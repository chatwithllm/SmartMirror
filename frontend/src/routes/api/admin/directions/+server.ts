import type { RequestHandler } from './$types';

// Proxy to Google Routes API (routes.googleapis.com) for home → event
// travel time with live traffic. The classic Distance Matrix API is
// the legacy surface; Routes API is the newer unified replacement
// that every fresh Cloud project now sees in the library.
//
// Requires:
//   GOOGLE_MAPS_KEY
//   HOME_ADDRESS  (or HOME_LATLNG "lat,lng")
//
// Query: /api/admin/directions?to=<address>&mode=driving&units=imperial
// Returns JSON: { ok, distance, duration, duration_in_traffic, mode, units }

const HOME = process.env.HOME_LATLNG?.trim() || process.env.HOME_ADDRESS?.trim() || '';

type RouteElement = {
  originIndex: number;
  destinationIndex: number;
  duration?: string; // "720s" — with live traffic for DRIVE+TRAFFIC_AWARE
  staticDuration?: string; // "720s" — without traffic
  distanceMeters?: number;
  condition?: string;
};

function parseDurationSec(s: string | undefined): number | null {
  if (!s) return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(s);
  return m ? Math.round(parseFloat(m[1])) : null;
}

function fmtDuration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h} h ${rem} min` : `${h} h`;
}

function fmtDistance(meters: number, units: string): string {
  if (units === 'metric') {
    if (meters < 1000) return `${meters} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  }
  const miles = meters / 1609.344;
  if (miles < 0.1) {
    const ft = Math.round(meters * 3.28084);
    return `${ft} ft`;
  }
  return `${miles.toFixed(1)} mi`;
}

function waypoint(raw: string): Record<string, unknown> {
  // "lat,lng" → location; otherwise treat as address string.
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(raw);
  if (m) {
    return {
      waypoint: {
        location: {
          latLng: { latitude: parseFloat(m[1]), longitude: parseFloat(m[2]) },
        },
      },
    };
  }
  return { waypoint: { address: raw } };
}

export const GET: RequestHandler = async ({ url }) => {
  const key = process.env.GOOGLE_MAPS_KEY?.trim();
  const to = url.searchParams.get('to')?.trim();
  const mode = (url.searchParams.get('mode') ?? 'driving').toLowerCase();
  const units = (url.searchParams.get('units') ?? 'imperial').toLowerCase();

  if (!key) return json({ ok: false, error: 'no-key' }, 503);
  if (!HOME) return json({ ok: false, error: 'no-home-address' }, 503);
  if (!to) return json({ ok: false, error: 'missing to' }, 400);

  const travelMode =
    mode === 'walking'
      ? 'WALK'
      : mode === 'bicycling'
        ? 'BICYCLE'
        : mode === 'transit'
          ? 'TRANSIT'
          : 'DRIVE';

  const body = {
    origins: [waypoint(HOME)],
    destinations: [waypoint(to)],
    travelMode,
    ...(travelMode === 'DRIVE' ? { routingPreference: 'TRAFFIC_AWARE' } : {}),
    units: units === 'metric' ? 'METRIC' : 'IMPERIAL',
    languageCode: 'en-US',
  };

  try {
    const r = await fetch(
      'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask':
            'originIndex,destinationIndex,duration,staticDuration,distanceMeters,condition',
        },
        body: JSON.stringify(body),
      },
    );
    if (!r.ok) {
      const text = (await r.text()).slice(0, 400);
      return json({ ok: false, error: `upstream ${r.status}`, detail: text }, 502);
    }
    const arr = (await r.json()) as RouteElement[];
    const el = Array.isArray(arr) ? arr[0] : null;
    if (!el || el.condition !== 'ROUTE_EXISTS') {
      return json({ ok: false, error: el?.condition ?? 'NO_RESULT' }, 502);
    }
    const durationSec = parseDurationSec(el.duration);
    const staticSec = parseDurationSec(el.staticDuration);
    const meters = typeof el.distanceMeters === 'number' ? el.distanceMeters : null;

    return json({
      ok: true,
      distance:
        meters != null ? { text: fmtDistance(meters, units), value: meters } : null,
      // staticDuration = free-flow / no-traffic baseline.
      duration: staticSec != null ? { text: fmtDuration(staticSec), value: staticSec } : null,
      // duration = with live traffic in DRIVE + TRAFFIC_AWARE mode.
      duration_in_traffic:
        durationSec != null && staticSec != null && durationSec !== staticSec
          ? { text: fmtDuration(durationSec), value: durationSec }
          : null,
      mode,
      units,
    });
  } catch (e) {
    return json({ ok: false, error: 'fetch-failed' }, 502);
  }
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
