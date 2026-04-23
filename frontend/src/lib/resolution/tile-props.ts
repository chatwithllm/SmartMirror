export type Resolution = '4k' | '1440p' | '1080p';

export interface ResCaps {
  plexBitrate: number; // kbps
  immichSize: 'preview' | 'original';
  maxConcurrentVideo: number;
  blur: boolean;
}

export const RES_CAPS: Record<Resolution, ResCaps> = {
  '1080p': { plexBitrate: 4_000, immichSize: 'preview', maxConcurrentVideo: 4, blur: true },
  '1440p': { plexBitrate: 8_000, immichSize: 'preview', maxConcurrentVideo: 3, blur: true },
  '4k': { plexBitrate: 20_000, immichSize: 'original', maxConcurrentVideo: 2, blur: false }
};

export function currentResolution(): Resolution {
  if (typeof window === 'undefined') return '1080p';
  const w = window.innerWidth * (window.devicePixelRatio ?? 1);
  if (w >= 3000) return '4k';
  if (w >= 2200) return '1440p';
  return '1080p';
}
