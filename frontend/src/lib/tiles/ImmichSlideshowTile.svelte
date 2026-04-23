<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import BaseTile from './BaseTile.svelte';
  import { currentResolution, RES_CAPS } from '$lib/resolution/tile-props.js';

  interface ImmichProps {
    album_id?: string;
    immich_base?: string;
    api_key?: string;
    interval?: number; // seconds
    demo?: string[];
  }

  interface Props {
    id: string;
    props?: ImmichProps;
  }

  let { id, props = {} }: Props = $props();

  const interval = $derived(Math.max(props.interval ?? 8, 3));
  // Resolution-aware thumbnail size is resolved inline when real Immich
  // wiring lands (Phase 14 observability tweaks).
  void RES_CAPS[currentResolution()].immichSize;
  const demoImages = $derived(
    props.demo ?? [
      'https://picsum.photos/seed/mirror1/1080/1920',
      'https://picsum.photos/seed/mirror2/1080/1920',
      'https://picsum.photos/seed/mirror3/1080/1920'
    ]
  );

  let currentIdx = $state(0);
  let timer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    timer = setInterval(() => {
      currentIdx = (currentIdx + 1) % demoImages.length;
    }, interval * 1000);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  function prev() {
    currentIdx = (currentIdx - 1 + demoImages.length) % demoImages.length;
  }
  function next() {
    currentIdx = (currentIdx + 1) % demoImages.length;
  }

</script>

<BaseTile {id} type="immich_slideshow" label="Immich">
  <div class="ss" data-testid="immich">
    <img
      src={demoImages[currentIdx]}
      alt=""
      class="photo"
      data-testid="immich-photo"
      loading="lazy"
    />
    <div class="controls">
      <button onclick={prev} aria-label="previous">‹</button>
      <span class="mono idx">{currentIdx + 1}/{demoImages.length}</span>
      <button onclick={next} aria-label="next">›</button>
    </div>
  </div>
</BaseTile>

<style>
  .ss {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    border-radius: calc(var(--radius-md) - 2px);
    background: #000;
  }
  .photo {
    width: 100%;
    height: 100%;
    object-fit: cover;
    animation: fade var(--motion-slow) ease;
  }
  @keyframes fade {
    from {
      opacity: 0.6;
    }
    to {
      opacity: 1;
    }
  }
  .controls {
    position: absolute;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 8px;
    align-items: center;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 999px;
    padding: 4px 10px;
  }
  button {
    background: none;
    border: 0;
    color: var(--fg);
    font-size: 1.3rem;
    line-height: 1;
    cursor: pointer;
  }
  .idx {
    font-size: 0.75rem;
    color: var(--dim);
  }
</style>
