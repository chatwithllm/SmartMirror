import type { RequestHandler } from './$types';
import { getYt, setYt } from '$lib/server/ytState.js';

// GET — frontend polls this every 2 s. Response always safe to cache
// for zero seconds.
export const GET: RequestHandler = () => {
  return new Response(JSON.stringify(getYt()), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
};

// POST — lets any LAN phone or HA automation push a new video URL
// into the state. We still return the new { value, ts } so callers
// can confirm. No auth: the kiosk is LAN-only and the mirror
// frontend's other write endpoints use the same trust model.
export const POST: RequestHandler = async ({ request }) => {
  let body: { value?: unknown } = {};
  try {
    body = (await request.json()) as { value?: unknown };
  } catch {
    return new Response('bad json', { status: 400 });
  }
  const value = typeof body.value === 'string' ? body.value.trim() : '';
  if (!value) return new Response('empty', { status: 400 });
  const next = setYt(value);
  return new Response(JSON.stringify({ ok: true, ...next }), {
    headers: { 'content-type': 'application/json' },
  });
};
