import type { RequestHandler } from './$types';
import { fetchGroceryJson, isGroceryConfigured } from '$lib/server/groceryClient.js';

export const GET: RequestHandler = async () => {
  if (!isGroceryConfigured()) {
    return new Response(JSON.stringify({ configured: false, items: [] }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
  const data = await fetchGroceryJson('/shopping-list');
  return new Response(
    JSON.stringify({ configured: true, data: data ?? null }),
    { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } },
  );
};
