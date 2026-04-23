<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import BaseTile from './BaseTile.svelte';
  import { currentResolution, RES_CAPS } from '$lib/resolution/tile-props.js';

  interface PlexProps {
    ratingKey?: string;
    plexBase?: string;
    plexToken?: string;
    autoplay?: boolean;
    mute?: boolean;
    startMs?: number;
    maxBitrate?: number; // kbps; if absent, derive from resolution
    poster?: string;
    title?: string;
  }

  interface Props {
    id: string;
    props?: PlexProps;
  }

  let { id, props = {} }: Props = $props();

  const maxBitrate = $derived(props.maxBitrate ?? RES_CAPS[currentResolution()].plexBitrate);
  const src = $derived.by(() => {
    if (!props.ratingKey || !props.plexBase) return '';
    const token = props.plexToken ? `&X-Plex-Token=${encodeURIComponent(props.plexToken)}` : '';
    return (
      `${props.plexBase}/video/:/transcode/universal/start.m3u8?` +
      `path=/library/metadata/${encodeURIComponent(props.ratingKey)}&protocol=hls&` +
      `maxVideoBitrate=${maxBitrate}${token}`
    );
  });

  let video: HTMLVideoElement | null = $state(null);
  let hasError = $state(false);
  let hls: { destroy: () => void } | null = null;

  async function start() {
    if (!browser || !video || !src) return;
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      return;
    }
    const mod = await import('hls.js');
    const Hls = mod.default;
    if (!Hls.isSupported()) {
      hasError = true;
      return;
    }
    const h = new Hls({ maxBufferLength: 10 });
    h.on(Hls.Events.ERROR, (_ev, data) => {
      if (data?.fatal) {
        hasError = true;
        const detail = (data?.details as string) ?? 'unknown';
        try {
          window.dispatchEvent(
            new CustomEvent('mirror:decode_failed', { detail: { id, details: detail } })
          );
        } catch {
          /* ignore */
        }
      }
    });
    h.loadSource(src);
    h.attachMedia(video);
    hls = h as unknown as { destroy: () => void };
  }

  onMount(() => {
    void start();
  });

  onDestroy(() => {
    hls?.destroy();
    hls = null;
  });
</script>

<BaseTile {id} type="plex_player" label={props.title ?? 'Plex'}>
  {#if hasError || !src}
    <div class="poster" data-testid="plex-poster">
      {#if props.poster}
        <img src={props.poster} alt={props.title ?? 'Plex'} />
      {/if}
      <div class="overlay mono">
        {hasError ? 'decode error · poster fallback' : 'waiting for Plex metadata'}
      </div>
    </div>
  {:else}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video
      class="player"
      bind:this={video}
      autoplay={props.autoplay ?? true}
      muted={props.mute ?? false}
      playsinline
      preload="auto"
      data-testid="plex-video"
    ></video>
  {/if}
</BaseTile>

<style>
  .player {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: calc(var(--radius-md) - 2px);
    background: #000;
  }
  .poster {
    position: relative;
    width: 100%;
    height: 100%;
    background: var(--panel-2);
    border-radius: calc(var(--radius-md) - 2px);
    overflow: hidden;
  }
  .poster img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .overlay {
    position: absolute;
    inset: auto 0 0 0;
    padding: 6px 8px;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0));
    color: var(--fg);
    font-size: 11px;
  }
</style>
