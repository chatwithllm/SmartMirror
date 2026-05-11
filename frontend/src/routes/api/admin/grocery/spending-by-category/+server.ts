import type { RequestHandler } from './$types';
import { fetchGroceryJson, isGroceryConfigured } from '$lib/server/groceryClient.js';

interface CategoryRow {
  category: string;
  amount: number;
  share_pct?: number;
  delta_pct?: number;
  prev_amount?: number;
}
interface SpendingResp {
  month: string;
  total: number;
  categories: CategoryRow[];
}

function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const GET: RequestHandler = async ({ url }) => {
  if (!(await isGroceryConfigured())) {
    return new Response(JSON.stringify({ configured: false, data: null }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    });
  }
  const month = url.searchParams.get('month') ?? currentYm();
  const limit = url.searchParams.get('limit') ?? '20';
  const data = await fetchGroceryJson<SpendingResp>(
    `/analytics/spending-by-category?month=${encodeURIComponent(month)}&limit=${encodeURIComponent(limit)}`
  );
  return new Response(
    JSON.stringify({ configured: true, data: data ?? null }),
    { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }
  );
};
