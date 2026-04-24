<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import BaseTile from './BaseTile.svelte';
  import { loadYouTubeIframeAPI, setYTPlayer } from '$lib/youtube/controller.js';

  interface YTProps {
    videoId?: string;
    autoplay?: boolean;
    mute?: boolean;
    start?: number;
    title?: string;
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
    const params = new URLSearchParams({
      autoplay: (props.autoplay ?? true) ? '1' : '0',
      mute: (props.mute ?? true) ? '1' : '0',
      start: String(props.start ?? 0),
      enablejsapi: '1',
      controls: '1',
      rel: '0',
      modestbranding: '1',
      origin: browser ? window.location.origin : '',
    });
    return `https://www.youtube.com/embed/${encodeURIComponent(props.videoId)}?${params}`;
  });

  let player: unknown = null;

  onMount(async () => {
    if (!browser || !props.videoId) return;
    await loadYouTubeIframeAPI();
    // The YT API wraps an existing iframe by DOM id.
    const w = window as unknown as {
      YT: { Player: new (id: string, opts: Record<string, unknown>) => unknown };
    };
    player = new w.YT.Player(frameId, {
      events: {
        onReady: () => {
          // Expose to the module-level singleton so HA-button polling
          // in +page.svelte can pilot play/pause/mute/volume/seek.
          setYTPlayer(player as never);
        },
      },
    });
  });

  onDestroy(() => {
    if (!browser) return;
    setYTPlayer(null);
    // YT.Player.destroy() exists but re-loading the tile tears down
    // the iframe anyway; no need for an explicit kill.
  });
</script>

<BaseTile {id} type="youtube" label={props.title ?? 'YouTube'}>
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
    ></iframe>
  {:else}
    <div class="empty mono" data-testid="youtube-empty">no videoId</div>
  {/if}
</BaseTile>

<style>
  .yt {
    width: 100%;
    height: 100%;
    border: 0;
    border-radius: calc(var(--radius-md) - 2px);
    background: #000;
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
