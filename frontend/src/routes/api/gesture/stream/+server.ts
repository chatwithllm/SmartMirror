import type { RequestHandler } from './$types';
import { gestureBus, type GestureEvent } from '$lib/server/gestureBus.js';

// GET /api/gesture/stream
//
// SSE stream of gesture events. The browser opens an EventSource here
// at app mount; gesture-service POSTs land on /api/gesture and fan
// out via gestureBus. We send a `:hb` comment every 15 s so the
// client's EventSource doesn't wander into reconnect loops on idle
// connections behind aggressive proxies.
//
// No auth on this endpoint — it's read-only and the kiosk is LAN-only.

const HEARTBEAT_MS = 15_000;

export const GET: RequestHandler = ({ request }) => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();

      const send = (ev: GestureEvent) => {
        try {
          controller.enqueue(
            enc.encode(`event: gesture\ndata: ${JSON.stringify(ev)}\n\n`)
          );
        } catch {
          /* controller closed under us */
        }
      };
      const heartbeat = () => {
        try {
          controller.enqueue(enc.encode(`: hb ${Date.now()}\n\n`));
        } catch {
          /* closed */
        }
      };

      // Push a hello so the client knows the channel is live; useful
      // for the connection pill.
      controller.enqueue(enc.encode(`: hello ${Date.now()}\n\n`));

      gestureBus.on('gesture', send);
      const hbTimer = setInterval(heartbeat, HEARTBEAT_MS);

      const cleanup = () => {
        clearInterval(hbTimer);
        gestureBus.off('gesture', send);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      request.signal.addEventListener('abort', cleanup);
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store, no-transform',
      // Disable proxy buffering — Nginx in particular will hold the
      // first few KB of an event-stream before flushing.
      'x-accel-buffering': 'no',
      connection: 'keep-alive'
    }
  });
};
