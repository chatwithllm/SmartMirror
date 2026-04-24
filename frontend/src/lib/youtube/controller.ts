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
