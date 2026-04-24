<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import QRCode from 'qrcode';
  import BaseTile from './BaseTile.svelte';
  import { loadYouTubeIframeAPI, setYTPlayer } from '$lib/youtube/controller.js';

  interface YTProps {
    videoId?: string;
    autoplay?: boolean;
    mute?: boolean;
    start?: number;
    title?: string;
    hideQr?: boolean;
    loop?: boolean;
    /** Drop BaseTile chrome (border/padding) and stretch edge-to-edge. */
    chromeless?: boolean;
  }

  interface Props {
    id: string;
    props?: YTProps;
  }

  let { id, props = {} }: Props = $props();

  // A stable DOM id for YT.Player to attach to. Must start with a
  // letter and be unique per tile instance.
  const frameId = `yt-${id}-${Math.random().toString(36).slice(2, 8)}`;

  const src = $derived.by(() => {
    if (!props.videoId) return '';
    const params: Record<string, string> = {
      autoplay: (props.autoplay ?? true) ? '1' : '0',
      mute: (props.mute ?? true) ? '1' : '0',
      start: String(props.start ?? 0),
      enablejsapi: '1',
      // Chromeless = immersive backdrop, hide the player controls / info
      // overlay so nothing chromes the video but the video itself.
      controls: props.chromeless ? '0' : '1',
      disablekb: props.chromeless ? '1' : '0',
      iv_load_policy: '3',
      rel: '0',
      modestbranding: '1',
      playsinline: '1',
      origin: browser ? window.location.origin : '',
    };
    if (props.loop) {
      // YouTube requires playlist=<id> to make loop=1 actually loop a
      // single video in the embed.
      params.loop = '1';
      params.playlist = props.videoId;
    }
    return `https://www.youtube.com/embed/${encodeURIComponent(props.videoId)}?${new URLSearchParams(params)}`;
  });

  let player: unknown = null;
  let qrDataUrl = $state<string>('');
  let pasteUrl = $state<string>('');
  // Chromeless cover sizing: we oversize the iframe so the 16:9 video
  // fills the (likely portrait) cell on both axes and the excess is
  // clipped by overflow:hidden on the wrapper. Width/height are kept
  // as numbers so the style binding is single-source.
  let coverW = $state<number | null>(null);
  let coverH = $state<number | null>(null);
  let wrapEl: HTMLDivElement | null = $state(null);

  function recomputeCover(): void {
    if (!props.chromeless || !wrapEl) return;
    const r = wrapEl.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const aspect = 16 / 9;
    // Scale to cover the wrapper: pick the axis that would leave a gap
    // at the video's native aspect and grow past 100% on the other.
    if (r.width / r.height > aspect) {
      coverW = r.width;
      coverH = r.width / aspect;
    } else {
      coverH = r.height;
      coverW = r.height * aspect;
    }
  }

  let coverRO: ResizeObserver | null = null;

  onMount(async () => {
    if (!browser) return;

    // Build the /paste URL the phone should open and render it as a
    // QR overlay. location.origin would be http://localhost:3000 in
    // the kiosk — that's unreachable from the phone. +layout.server.ts
    // detects the mirror's LAN-routable IP and stashes it in
    // window.__MIRROR_LAN_URL__; fall back to location.origin if the
    // env detection failed (e.g. dev machine).
    const lan = (window as unknown as { __MIRROR_LAN_URL__?: string })
      .__MIRROR_LAN_URL__;
    pasteUrl = `${lan || window.location.origin}/paste`;
    try {
      qrDataUrl = await QRCode.toDataURL(pasteUrl, {
        margin: 1,
        width: 220,
        color: { dark: '#f2f3f5', light: '#00000000' },
      });
    } catch {
      qrDataUrl = '';
    }

    if (props.chromeless && wrapEl) {
      recomputeCover();
      coverRO = new ResizeObserver(() => recomputeCover());
      coverRO.observe(wrapEl);
    }

    if (!props.videoId) return;
    await loadYouTubeIframeAPI();
    const w = window as unknown as {
      YT: { Player: new (id: string, opts: Record<string, unknown>) => unknown };
    };
    player = new w.YT.Player(frameId, {
      events: {
        // Expose the player so HA-button polling in +page.svelte can
        // pilot play/pause/mute/volume/seek.
        onReady: () => setYTPlayer(player as never),
      },
    });
  });

  onDestroy(() => {
    if (!browser) return;
    setYTPlayer(null);
    coverRO?.disconnect();
    // YT.Player.destroy() exists but re-loading the tile tears down
    // the iframe anyway; no need for an explicit kill.
  });
</script>

<BaseTile {id} type="youtube" label={props.title ?? 'YouTube'} chromeless={props.chromeless ?? false}>
  <div class="yt-wrap" class:cover={props.chromeless} bind:this={wrapEl}>
    {#if src}
      <iframe
        id={frameId}
        class="yt"
        src={src}
        title={props.title ?? 'YouTube'}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowfullscreen
        referrerpolicy="origin"
        data-testid="youtube-frame"
        style:width={props.chromeless && coverW != null ? `${coverW}px` : null}
        style:height={props.chromeless && coverH != null ? `${coverH}px` : null}
      ></iframe>
    {:else}
      <div class="empty mono" data-testid="youtube-empty">no videoId</div>
    {/if}
    {#if qrDataUrl && !props.hideQr}
      <div class="qr mono" data-testid="youtube-qr" title={pasteUrl}>
        <img src={qrDataUrl} alt="scan to paste URL" />
        <div class="qr-label">scan → paste</div>
      </div>
    {/if}
  </div>
</BaseTile>

<style>
  .yt-wrap {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .yt {
    width: 100%;
    height: 100%;
    border: 0;
    border-radius: calc(var(--radius-md) - 2px);
    background: #000;
    display: block;
  }
  /* Immersive cover mode: oversize the iframe beyond the cell and clip
   * so the video fills both axes with no letterboxing. JS sets the
   * explicit width/height so the inner YT player renders its video at
   * 16:9 over the entire container. */
  .yt-wrap.cover {
    overflow: hidden;
    background: #000;
  }
  .yt-wrap.cover .yt {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    border-radius: 0;
    max-width: none;
    max-height: none;
  }
  .qr {
    position: absolute;
    right: 8px;
    bottom: 8px;
    width: 68px;
    padding: 6px 6px 4px;
    border-radius: var(--radius-sm);
    background: rgba(0, 0, 0, 0.72);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    pointer-events: none;
    z-index: 2;
  }
  .qr img {
    width: 56px;
    height: 56px;
    image-rendering: pixelated;
  }
  .qr-label {
    font-size: 0.55rem;
    letter-spacing: 0.08em;
    color: var(--dim);
    white-space: nowrap;
  }
  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--dim);
    font-size: 0.85rem;
  }
</style>
