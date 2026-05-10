import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params, url }) => {
  const base = process.env.IMMICH_URL;
  const key = process.env.IMMICH_API_KEY;
  if (!base || !key) throw error(500, 'IMMICH_URL or IMMICH_API_KEY not configured');

  const size = url.searchParams.get('size') ?? 'preview';
  const upstream = `${base}/api/asset/thumbnail/${params.id}?format=jpeg&size=${encodeURIComponent(size)}`;

  const r = await fetch(upstream, { headers: { 'x-api-key': key } });
  if (!r.ok) throw error(r.status, `immich asset ${params.id} fetch failed`);

  const buf = await r.arrayBuffer();
  return new Response(buf, {
    headers: {
      'content-type': r.headers.get('content-type') ?? 'image/jpeg',
      'cache-control': 'public, max-age=3600'
    }
  });
};
