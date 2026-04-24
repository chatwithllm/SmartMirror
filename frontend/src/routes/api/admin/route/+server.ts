import type { RequestHandler } from './$types';

// Proxy to Google Routes API (computeRoutes) that returns the encoded
// polyline + start / end lat-lng pair for home → event. Used by the
// NextEventMapTile to draw a blue route line on the Static Map.
//
// Requires:
//   GOOGLE_MAPS_KEY
//   HOME_ADDRESS (or HOME_LATLNG "lat,lng")
//
// Query: /api/admin/route?to=<address>
// Returns: { ok, polyline, home_latlng, dest_latlng, distance_meters,
//            duration_sec, duration_in_traffic_sec }
//
// Per-destination cache (1 h TTL) keeps Routes API calls low — route
// geometry rarely changes for the same address.

const HOME = process.env.HOME_LATLNG?.trim() || process.env.HOME_ADDRESS?.trim() || '';

type CacheEntry = {
  exp: number;
  body: RouteOut;
};
const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 60 * 60 * 1000;

type RouteOut = {
  ok: true;
  polyline: string;
  home_latlng: string; // "lat,lng"
  dest_latlng: string;
  distance_meters: number | null;
  duration_sec: number | null;
  duration_in_traffic_sec: number | null;
};

type LatLng = { latitude: number; longitude: number };
type Leg = {
  startLocation?: { latLng?: LatLng };
  endLocation?: { latLng?: LatLng };
};
type RoutesResp = {
  routes?: Array<{
    distanceMeters?: number;
    duration?: string;
    staticDuration?: string;
    polyline?: { encodedPolyline?: string };
    legs?: Leg[];
  }>;
  error?: { code?: number; message?: string; status?: string };
};

function parseDurationSec(s?: string): number | null {
  if (!s) return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(s);
  return m ? Math.round(parseFloat(m[1])) : null;
}

function waypoint(raw: string): Record<string, unknown> {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(raw);
  if (m) {
    return { location: { latLng: { latitude: parseFloat(m[1]), longitude: parseFloat(m[2]) } } };
  }
  return { address: raw };
}

function llStr(ll?: LatLng): string | null {
  if (!ll || typeof ll.latitude !== 'number' || typeof ll.longitude !== 'number') return null;
  return `${ll.latitude},${ll.longitude}`;
}

export const GET: RequestHandler = async ({ url }) => {
  const key = process.env.GOOGLE_MAPS_KEY?.trim();
  const to = url.searchParams.get('to')?.trim();

  if (!key) return json({ ok: false, error: 'no-key' }, 503);
  if (!HOME) return json({ ok: false, error: 'no-home-address' }, 503);
  if (!to) return json({ ok: false, error: 'missing to' }, 400);

  const cacheKey = `${HOME}|${to}`;
  const cached = CACHE.get(cacheKey);
  if (cached && cached.exp > Date.now()) {
    return json(cached.body);
  }

  try {
    const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask':
          'routes.polyline.encodedPolyline,routes.legs.startLocation,routes.legs.endLocation,routes.distanceMeters,routes.duration,routes.staticDuration',
      },
      body: JSON.stringify({
        origin: waypoint(HOME),
        destination: waypoint(to),
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        units: 'IMPERIAL',
        polylineEncoding: 'ENCODED_POLYLINE',
      }),
    });
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 300);
      return json({ ok: false, error: `upstream ${r.status}`, detail }, 502);
    }
    const j = (await r.json()) as RoutesResp;
    const route = j.routes?.[0];
    const poly = route?.polyline?.encodedPolyline;
    const leg = route?.legs?.[0];
    const homeLL = llStr(leg?.startLocation?.latLng);
    const destLL = llStr(leg?.endLocation?.latLng);
    if (!poly || !homeLL || !destLL) {
      return json({ ok: false, error: 'no-route' }, 502);
    }

    const body: RouteOut = {
      ok: true,
      polyline: poly,
      home_latlng: homeLL,
      dest_latlng: destLL,
      distance_meters: route?.distanceMeters ?? null,
      duration_sec: parseDurationSec(route?.staticDuration),
      duration_in_traffic_sec: parseDurationSec(route?.duration),
    };
    CACHE.set(cacheKey, { exp: Date.now() + TTL_MS, body });
    return json(body);
  } catch (e) {
    return json({ ok: false, error: 'fetch-failed' }, 502);
  }
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
