import type { KanbanCard, KanbanStatus } from './types.js';

export type FetchCardsOptions = {
  baseUrl: string;
  mirrorToken: string;
  statuses?: KanbanStatus[];
  projects?: string[];
  signal?: AbortSignal;
};

export async function fetchActiveCards(opts: FetchCardsOptions): Promise<KanbanCard[]> {
  const statuses = opts.statuses ?? ['in_progress', 'today'];
  const out: KanbanCard[] = [];
  for (const status of statuses) {
    const url = new URL('/api/cards', opts.baseUrl);
    url.searchParams.set('scope', 'personal');
    const res = await fetch(url.toString(), {
      headers: { 'x-mirror-token': opts.mirrorToken },
      signal: opts.signal,
    });
    if (!res.ok) {
      throw new Error(`fetchActiveCards: ${res.status} ${res.statusText}`);
    }
    const all = (await res.json()) as KanbanCard[];
    for (const c of all) if (c.status === status) out.push(c);
  }
  let cards = out;
  if (opts.projects && opts.projects.length > 0) {
    const allowed = new Set(opts.projects);
    cards = cards.filter(c => c.project !== null && allowed.has(c.project));
  }
  cards.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  return cards;
}
