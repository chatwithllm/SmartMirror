import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

interface HNStory { id: number; score: number; title: string; url?: string; by: string; time: number }

let cache: { ts: number; items: HNStory[] } | null = null;
const TTL_MS = 10 * 60 * 1000;

async function fetchTop(): Promise<HNStory[]> {
  const r = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
  if (!r.ok) return [];
  const ids = (await r.json()) as number[];
  const top30 = ids.slice(0, 30);

  const items: HNStory[] = [];
  for (let i = 0; i < top30.length; i += 5) {
    const chunk = top30.slice(i, i + 5);
    const fetched = await Promise.all(
      chunk.map(async (id) => {
        const rr = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
        if (!rr.ok) return null;
        return (await rr.json()) as HNStory | null;
      })
    );
    items.push(...fetched.filter((x): x is HNStory => x !== null && (x.score ?? 0) >= 100));
    if (items.length >= 5) break;
  }
  return items.sort((a, b) => b.score - a.score);
}

export const GET: RequestHandler = async ({ url }) => {
  const n = Math.min(Math.max(Number(url.searchParams.get('n') ?? '5'), 1), 10);
  const now = Date.now();
  if (!cache || now - cache.ts > TTL_MS) {
    const items = await fetchTop();
    cache = { ts: now, items };
  }
  return json({
    items: cache.items.slice(0, n).map((s) => ({
      title: s.title,
      url: s.url ?? `https://news.ycombinator.com/item?id=${s.id}`,
      score: s.score,
      by: s.by,
      time: s.time
    }))
  });
};
