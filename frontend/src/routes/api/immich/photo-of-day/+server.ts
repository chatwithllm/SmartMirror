import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

interface Asset { id: string; exifInfo?: { dateTimeOriginal?: string; city?: string; country?: string } }
interface MemoryLaneEntry { assets: Asset[] }
interface AlbumResp { assets: Asset[] }

interface CachedPhoto { ts: number; payload: { photoUrl: string; dateTaken?: string; location?: string; caption?: string } }

let cache: CachedPhoto | null = null;
const TTL_MS = 60 * 60 * 1000;

async function tryMemoryLane(base: string, key: string): Promise<Asset | null> {
  const now = new Date();
  const day = now.getDate();
  const month = now.getMonth() + 1;
  const r = await fetch(`${base}/api/search/memory-lane?day=${day}&month=${month}`, {
    headers: { 'x-api-key': key }
  });
  if (!r.ok) return null;
  try {
    const data = (await r.json()) as MemoryLaneEntry[];
    for (const entry of data) {
      if (Array.isArray(entry.assets) && entry.assets.length > 0) {
        return entry.assets[Math.floor(Math.random() * entry.assets.length)];
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function tryAlbumRandom(base: string, key: string, albumId: string): Promise<Asset | null> {
  const r = await fetch(`${base}/api/album/${albumId}`, { headers: { 'x-api-key': key } });
  if (!r.ok) return null;
  try {
    const data = (await r.json()) as AlbumResp;
    if (Array.isArray(data.assets) && data.assets.length > 0) {
      return data.assets[Math.floor(Math.random() * data.assets.length)];
    }
  } catch {
    return null;
  }
  return null;
}

export const GET: RequestHandler = async () => {
  const base = process.env.IMMICH_URL;
  const key = process.env.IMMICH_API_KEY;
  const albumId = process.env.IMMICH_ALBUM_ID;
  if (!base || !key) throw error(500, 'IMMICH_URL or IMMICH_API_KEY not configured');

  const now = Date.now();
  if (cache && now - cache.ts < TTL_MS) {
    return json(cache.payload);
  }

  let asset = await tryMemoryLane(base, key);
  if (!asset && albumId) asset = await tryAlbumRandom(base, key, albumId);

  if (!asset) return new Response('no photo available', { status: 503 });

  const payload = {
    photoUrl: `/api/immich/asset/${asset.id}`,
    dateTaken: asset.exifInfo?.dateTimeOriginal,
    location: asset.exifInfo?.city
      ? `${asset.exifInfo.city}${asset.exifInfo.country ? ', ' + asset.exifInfo.country : ''}`
      : undefined
  };
  cache = { ts: now, payload };
  return json(payload);
};
