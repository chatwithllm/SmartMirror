<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import BaseTile from './BaseTile.svelte';

  interface PodcastProps {
    feed_url?: string;
    entity_id?: string;
    episode?: { title: string; show?: string; artwork?: string; duration?: number };
    autoplay?: boolean;
    muted?: boolean;
  }

  interface Props {
    id: string;
    props?: PodcastProps;
  }

  let { id, props = {} }: Props = $props();

  let audio: HTMLAudioElement | null = $state(null);
  let playing = $state(false);
  let position = $state(0);
  let duration = $state(props.episode?.duration ?? 1800);

  const episode = $derived(
    props.episode ?? { title: 'Untitled episode', show: 'Demo podcast' }
  );

  function toggle() {
    if (!audio) {
      playing = !playing;
      return;
    }
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }

  function seekRel(d: number) {
    if (audio) audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + d));
    else position = Math.max(0, Math.min(duration, position + d));
  }

  onMount(() => {
    if (audio) {
      audio.addEventListener('timeupdate', () => {
        position = audio!.currentTime;
      });
      audio.addEventListener('play', () => (playing = true));
      audio.addEventListener('pause', () => (playing = false));
      audio.addEventListener('loadedmetadata', () => {
        duration = audio!.duration || duration;
      });
      if ((props.autoplay ?? false) && !(props.muted ?? false)) {
        void audio.play();
      }
    }
  });

  onDestroy(() => {
    audio?.pause();
  });

  function fmt(t: number) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }
</script>

<BaseTile {id} type="podcast" label="Podcast">
  <div class="pd" data-testid="podcast">
    <div class="meta">
      {#if episode.artwork}
        <img class="art" src={episode.artwork} alt="" />
      {:else}
        <div class="art-empty mono">🎧</div>
      {/if}
      <div class="text">
        <div class="show mono">{episode.show ?? ''}</div>
        <div class="title">{episode.title}</div>
      </div>
    </div>
    <div class="controls">
      <button onclick={() => seekRel(-15)} aria-label="back 15s">−15</button>
      <button class="play" onclick={toggle} aria-label="play/pause" data-testid="podcast-play">
        {playing ? '❚❚' : '▶'}
      </button>
      <button onclick={() => seekRel(30)} aria-label="forward 30s">+30</button>
    </div>
    <div class="bar">
      <div class="fill" style:width="{(position / duration) * 100}%"></div>
    </div>
    <div class="times mono">
      <span>{fmt(position)}</span>
      <span>{fmt(duration)}</span>
    </div>
    {#if props.feed_url}
      <audio bind:this={audio} src={props.feed_url} preload="metadata"></audio>
    {/if}
  </div>
</BaseTile>

<style>
  .pd {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    height: 100%;
  }
  .meta {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .art,
  .art-empty {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-sm);
    background: var(--panel-2);
    display: flex;
    align-items: center;
    justify-content: center;
    object-fit: cover;
    font-size: 1.7rem;
  }
  .show {
    color: var(--dim);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }
  .title {
    color: var(--fg);
    font-size: 0.95rem;
    font-weight: 500;
  }
  .controls {
    display: flex;
    gap: 6px;
    justify-content: center;
    align-items: center;
  }
  button {
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    color: var(--fg);
    padding: 4px 8px;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    cursor: pointer;
  }
  .play {
    min-width: 3.08rem;
    background: var(--accent);
    color: #000;
    border-color: var(--accent);
  }
  .bar {
    height: 3px;
    background: var(--panel-2);
    border-radius: 2px;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--accent);
    transition: width 300ms linear;
  }
  .times {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: var(--dim);
  }
</style>
