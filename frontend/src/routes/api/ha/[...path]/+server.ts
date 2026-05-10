import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

/**
 * Generic HA REST proxy. Browser hits /api/ha/<path> with no auth,
 * server forwards to ${HA_URL}/<path> with Bearer token. Avoids CORS
 * entirely (same-origin from browser POV) and keeps the long-lived
 * token off the client.
 *
 * Supports GET and POST. Query strings + arbitrary path segments pass
 * through. Response body is streamed back as-is with content-type
 * preserved so binary endpoints (camera_proxy snapshots) work.
 */

async function forward(
  method: 'GET' | 'POST',
  pathname: string,
  search: string,
  bodyText: string | null
): Promise<Response> {
  const base = env.HA_URL?.replace(/\/$/, '');
  const token = env.HA_TOKEN;
  if (!base || !token) throw error(500, 'HA_URL or HA_TOKEN not configured');

  const url = `${base}/${pathname}${search}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`
  };
  if (method === 'POST' && bodyText !== null) {
    headers['content-type'] = 'application/json';
  }

  const r = await fetch(url, {
    method,
    headers,
    body: method === 'POST' ? bodyText ?? '' : undefined
  });

  // Stream response back, preserving content-type so camera snapshots
  // (image/jpeg) and JSON state both pass through correctly.
  const buf = await r.arrayBuffer();
  return new Response(buf, {
    status: r.status,
    headers: {
      'content-type': r.headers.get('content-type') ?? 'application/octet-stream',
      'cache-control': 'no-store'
    }
  });
}

export const GET: RequestHandler = async ({ params, url }) => {
  return forward('GET', params.path ?? '', url.search, null);
};

export const POST: RequestHandler = async ({ params, url, request }) => {
  const body = await request.text();
  return forward('POST', params.path ?? '', url.search, body || null);
};
