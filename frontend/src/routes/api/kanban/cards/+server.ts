import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

/**
 * Server-side proxy for kanban.npalakurla.net /api/cards. Browser
 * can't hit kanban directly (Cloudflare CORS preflight blocks). We
 * forward with x-mirror-token from server-side env so the token
 * never leaves the box.
 *
 * Same shape as upstream — array of KanbanCard. Status filter applied
 * via ?statuses=in_progress,today (defaults to those two — matches
 * ActiveWorkTile's "in flight" semantics).
 */

interface KanbanCard {
  id: string;
  title: string;
  status: string;
  tags: string[];
  project: string | null;
  updated_at: string;
  description?: string;
}

export const GET: RequestHandler = async ({ url }) => {
  const base = (env.KANBAN_URL ?? '').replace(/\/$/, '');
  const token = env.KANBAN_MIRROR_TOKEN ?? '';
  if (!base || !token) {
    return json({ configured: false, cards: [] });
  }

  // Default to all 4 columns so the mirror can render the full board.
  // Card consumer can still filter via ?statuses=… for narrower views.
  const wantStatuses = (url.searchParams.get('statuses') ?? 'backlog,today,in_progress,done')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    const upstream = new URL('/api/cards', base);
    upstream.searchParams.set('scope', 'personal');
    const r = await fetch(upstream.toString(), {
      headers: { 'x-mirror-token': token }
    });
    if (!r.ok) throw error(r.status, `kanban /api/cards ${r.status}`);
    const all = (await r.json()) as KanbanCard[];
    const filtered = wantStatuses.length
      ? all.filter((c) => wantStatuses.includes(c.status))
      : all;
    filtered.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    return json({ configured: true, cards: filtered });
  } catch (e) {
    if (e instanceof Response) throw e;
    throw error(502, e instanceof Error ? e.message : 'kanban fetch failed');
  }
};
