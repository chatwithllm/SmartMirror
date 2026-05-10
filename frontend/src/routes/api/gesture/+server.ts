import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { gestureBus, isKnownGesture, type GestureEvent } from '$lib/server/gestureBus.js';

// POST /api/gesture
//
// Accepts JSON { gesture, confidence, ts } from the kiosk-local
// gesture service. Bearer token must match MIRROR_GESTURE_TOKEN
// (shared via /etc/mirror/config.env). We don't fall back to
// "localhost only" auth here because the same endpoint is reachable
// from anything the kiosk LAN can talk to — a stray curl from a TV
// or smart-plug shouldn't be able to fake a fullscreen gesture.

function bearerOk(req: Request): boolean {
  const expected = env.MIRROR_GESTURE_TOKEN;
  if (!expected) {
    // Token unconfigured — refuse. Better fail closed than open up
    // the bus to anyone who finds the endpoint.
    return false;
  }
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  const got = auth.slice('Bearer '.length).trim();
  // Length-equal compare is sufficient here — the secret is hex from
  // openssl rand, attackers can't time-side-channel a constant-time
  // miss any meaningful info, and we don't have crypto.timingSafeEqual
  // in the request scope without a buffer dance.
  return got.length === expected.length && got === expected;
}

export const POST: RequestHandler = async ({ request }) => {
  if (!bearerOk(request)) {
    return new Response('forbidden', { status: 403 });
  }

  let body: Partial<GestureEvent> & { payload?: unknown } = {};
  try {
    body = (await request.json()) as Partial<GestureEvent>;
  } catch {
    return new Response('bad json', { status: 400 });
  }

  const gesture = typeof body.gesture === 'string' ? body.gesture : '';
  if (!isKnownGesture(gesture)) {
    return new Response('bad gesture', { status: 400 });
  }
  const confidence = Number(body.confidence);
  const ts = Number(body.ts);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return new Response('bad confidence', { status: 400 });
  }
  if (!Number.isFinite(ts) || ts <= 0) {
    return new Response('bad ts', { status: 400 });
  }

  gestureBus.emitGesture({ gesture, confidence, ts });
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'content-type': 'application/json' }
  });
};
