import type { RequestHandler } from './$types';

/**
 * Liveness probe. Synchronous and trivial — if the Node event loop is
 * blocked or the process is wedged, this endpoint stops responding,
 * which is exactly what the watchdog wants to detect. Do NOT add I/O,
 * DB calls, or anything that could hang here.
 */
export const GET: RequestHandler = () => {
  return new Response(
    JSON.stringify({ ok: true, ts: Date.now() }),
    {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store'
      }
    }
  );
};
