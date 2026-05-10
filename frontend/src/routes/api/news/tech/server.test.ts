import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 4, 9, 12, 0, 0));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function mockHN(stories: Array<{ id: number; score: number; title: string; url: string; by: string; time: number }>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/topstories.json')) {
        return new Response(JSON.stringify(stories.map((s) => s.id)));
      }
      const m = url.match(/\/item\/(\d+)\.json$/);
      if (m) {
        const story = stories.find((s) => s.id === Number(m[1]));
        return new Response(JSON.stringify(story));
      }
      return new Response('not found', { status: 404 });
    })
  );
}

describe('GET /api/news/tech', () => {
  it('returns top 5 stories with score >= 100', async () => {
    mockHN([
      { id: 1, score: 200, title: 'Top 1', url: 'https://a/1', by: 'x', time: 0 },
      { id: 2, score: 50,  title: 'Low score', url: 'https://a/2', by: 'x', time: 0 },
      { id: 3, score: 150, title: 'Top 2', url: 'https://a/3', by: 'x', time: 0 },
      { id: 4, score: 110, title: 'Top 3', url: 'https://a/4', by: 'x', time: 0 },
      { id: 5, score: 105, title: 'Top 4', url: 'https://a/5', by: 'x', time: 0 },
      { id: 6, score: 102, title: 'Top 5', url: 'https://a/6', by: 'x', time: 0 },
      { id: 7, score: 90,  title: 'Below', url: 'https://a/7', by: 'x', time: 0 }
    ]);

    const { GET } = await import('./+server.js');
    const res = await GET({ url: new URL('http://localhost/api/news/tech') } as never);
    const j = (await res.json()) as { items: { title: string; score: number }[] };
    expect(j.items).toHaveLength(5);
    expect(j.items.every((i) => i.score >= 100)).toBe(true);
  });

  it('honors n query parameter', async () => {
    mockHN([
      { id: 1, score: 200, title: 'A', url: 'https://a/1', by: 'x', time: 0 },
      { id: 2, score: 200, title: 'B', url: 'https://a/2', by: 'x', time: 0 },
      { id: 3, score: 200, title: 'C', url: 'https://a/3', by: 'x', time: 0 }
    ]);
    const { GET } = await import('./+server.js');
    const res = await GET({ url: new URL('http://localhost/api/news/tech?n=2') } as never);
    const j = (await res.json()) as { items: unknown[] };
    expect(j.items).toHaveLength(2);
  });

  it('returns empty items array when topstories fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    const { GET } = await import('./+server.js');
    const res = await GET({ url: new URL('http://localhost/api/news/tech') } as never);
    const j = (await res.json()) as { items: unknown[] };
    expect(j.items).toEqual([]);
  });
});
