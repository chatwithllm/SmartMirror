import type { RequestHandler } from './$types';

// Proxy to Google Static Maps so the API key never leaves the mirror.
// Requires GOOGLE_MAPS_KEY in /etc/mirror/config.env.
//
// Query: /api/admin/map?q=<address>&w=640&h=320&zoom=14

export const GET: RequestHandler = async ({ url }) => {
  const key = process.env.GOOGLE_MAPS_KEY?.trim();
  const q = url.searchParams.get('q')?.trim();
  const w = clamp(url.searchParams.get('w'), 120, 640, 640);
  const h = clamp(url.searchParams.get('h'), 120, 640, 320);
  const zoom = clamp(url.searchParams.get('zoom'), 5, 19, 14);

  if (!key) return new Response('no-key', { status: 503 });
  if (!q) return new Response('missing q', { status: 400 });

  const gurl = new URL('https://maps.googleapis.com/maps/api/staticmap');
  gurl.searchParams.set('center', q);
  gurl.searchParams.set('zoom', String(zoom));
  gurl.searchParams.set('size', `${w}x${h}`);
  gurl.searchParams.set('scale', '2');
  gurl.searchParams.set('markers', `color:red|${q}`);
  gurl.searchParams.set('maptype', 'roadmap');
  // Muted dark style, readable on the mirror.
  const darkStyles = [
    'feature:all|element:geometry|color:0x1b1d22',
    'feature:all|element:labels.text.stroke|color:0x1b1d22',
    'feature:all|element:labels.text.fill|color:0x8b8f99',
    'feature:water|element:geometry|color:0x0c0d10',
    'feature:road|element:geometry|color:0x2a2e38',
    'feature:road.highway|element:geometry|color:0x3a3f4a',
    'feature:poi|element:labels|visibility:off',
    'feature:transit|element:labels|visibility:off',
    'feature:administrative|element:labels.text.fill|color:0xb0b4be',
  ];
  for (const s of darkStyles) gurl.searchParams.append('style', s);
  gurl.searchParams.set('key', key);

  try {
    const r = await fetch(gurl.toString());
    if (!r.ok) return new Response(`upstream ${r.status}`, { status: 502 });
    const buf = await r.arrayBuffer();
    return new Response(buf, {
      headers: {
        'content-type': r.headers.get('content-type') ?? 'image/png',
        // Cache in the browser for a day — map of a calendar location
        // rarely changes.
        'cache-control': 'public, max-age=86400',
      },
    });
  } catch (e) {
    return new Response('fetch failed', { status: 502 });
  }
};

function clamp(s: string | null, min: number, max: number, fallback: number): number {
  const n = Number(s);
  if (!isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
