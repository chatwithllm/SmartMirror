// Module-level singleton that the YouTubeTile registers its YT.Player
// instance into, and that +page.svelte's HA-button polling calls into
// for remote control. Kept tiny on purpose — one tile, one player.

// The YT IFrame API surface we actually need. Kept loose because the
// real shape isn't typed in the runtime script.
type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  getVolume(): number;
  setVolume(v: number): void;
  getCurrentTime(): number;
  seekTo(t: number, allowSeekAhead: boolean): void;
  getPlayerState(): number;
  loadVideoById(id: string | { videoId: string; startSeconds?: number }): void;
  cueVideoById(id: string | { videoId: string }): void;
};

let player: YTPlayer | null = null;

export function setYTPlayer(p: YTPlayer | null): void {
  player = p;
}

export type YTAction =
  | 'yt_toggle'
  | 'yt_mute'
  | 'yt_vol_up'
  | 'yt_vol_down'
  | 'yt_skip';

const VOL_STEP = 10;
const SKIP_SECONDS = 30;

export function ytCmd(action: YTAction): boolean {
  if (!player) return false;
  try {
    switch (action) {
      case 'yt_toggle': {
        const s = player.getPlayerState();
        // YT.PlayerState.PLAYING === 1
        if (s === 1) player.pauseVideo();
        else player.playVideo();
        return true;
      }
      case 'yt_mute': {
        if (player.isMuted()) player.unMute();
        else player.mute();
        return true;
      }
      case 'yt_vol_up': {
        player.unMute();
        player.setVolume(Math.min(100, player.getVolume() + VOL_STEP));
        return true;
      }
      case 'yt_vol_down': {
        player.setVolume(Math.max(0, player.getVolume() - VOL_STEP));
        return true;
      }
      case 'yt_skip': {
        player.seekTo(player.getCurrentTime() + SKIP_SECONDS, true);
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Parse either a bare 11-char YouTube ID or a full URL (watch?v=..., youtu.be/...,
 * shorts/..., live/...) down to the video ID. Returns null when the input is
 * empty or clearly not a valid ID.
 */
export function parseYouTubeId(input: string): string | null {
  const s = (input ?? '').trim();
  if (!s) return null;
  // Bare 11-char ID.
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    const v = u.searchParams.get('v');
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    // youtu.be/<id>, /shorts/<id>, /live/<id>, /embed/<id>
    const segs = u.pathname.split('/').filter(Boolean);
    const last = segs[segs.length - 1] ?? '';
    if (/^[A-Za-z0-9_-]{11}$/.test(last)) return last;
  } catch {
    /* not a URL, fall through */
  }
  return null;
}

export function ytLoadVideo(input: string): boolean {
  const id = parseYouTubeId(input);
  if (!id || !player) return false;
  try {
    player.loadVideoById(id);
    return true;
  } catch {
    return false;
  }
}

let apiLoading: Promise<void> | null = null;

/**
 * Load the https://www.youtube.com/iframe_api script once. Resolves when
 * window.YT.Player is ready to be instantiated.
 */
export function loadYouTubeIframeAPI(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const w = window as unknown as {
    YT?: { Player: unknown };
    onYouTubeIframeAPIReady?: () => void;
  };
  if (w.YT && w.YT.Player) return Promise.resolve();
  if (apiLoading) return apiLoading;
  apiLoading = new Promise((resolve) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      try {
        prev?.();
      } catch {
        /* ignore */
      }
      resolve();
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    document.head.appendChild(tag);
  });
  return apiLoading;
}
