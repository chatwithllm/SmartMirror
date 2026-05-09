import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('IMMICH_URL', 'https://immich.example');
  vi.stubEnv('IMMICH_API_KEY', 'k');
  vi.stubEnv('IMMICH_ALBUM_ID', 'album-1');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('GET /api/immich/photo-of-day', () => {
  it('returns memory-lane asset when available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('memory-lane')) {
          return new Response(
            JSON.stringify([{ assets: [{ id: 'asset-1', exifInfo: { dateTimeOriginal: '2020-05-09T10:00:00Z' } }] }])
          );
        }
        return new Response('not used', { status: 404 });
      })
    );
    const { GET } = await import('./+server.js');
    const res = await GET({ url: new URL('http://localhost/api/immich/photo-of-day') } as never);
    const j = (await res.json()) as { photoUrl: string; dateTaken?: string };
    expect(j.photoUrl).toContain('/api/immich/asset/asset-1');
    expect(j.dateTaken).toBe('2020-05-09T10:00:00Z');
  });

  it('falls back to album random when memory-lane is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('memory-lane')) return new Response('[]');
        if (url.includes('/album/')) {
          return new Response(
            JSON.stringify({ assets: [{ id: 'asset-2' }, { id: 'asset-3' }] })
          );
        }
        return new Response('not used', { status: 404 });
      })
    );
    const { GET } = await import('./+server.js');
    const res = await GET({ url: new URL('http://localhost/api/immich/photo-of-day') } as never);
    const j = (await res.json()) as { photoUrl: string };
    expect(j.photoUrl).toMatch(/\/api\/immich\/asset\/asset-(2|3)/);
  });

  it('returns 503 when both fetches fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    const { GET } = await import('./+server.js');
    const res = await GET({ url: new URL('http://localhost/api/immich/photo-of-day') } as never);
    expect(res.status).toBe(503);
  });
});
