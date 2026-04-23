<script lang="ts">
  import BaseTile from './BaseTile.svelte';

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

  const src = $derived.by(() => {
    if (!props.videoId) return '';
    const params = new URLSearchParams({
      autoplay: (props.autoplay ?? true) ? '1' : '0',
      mute: (props.mute ?? true) ? '1' : '0',
      start: String(props.start ?? 0),
      enablejsapi: '1',
      controls: '1',
      rel: '0',
      modestbranding: '1'
    });
    return `https://www.youtube.com/embed/${encodeURIComponent(props.videoId)}?${params}`;
  });
</script>

<BaseTile {id} type="youtube" label={props.title ?? 'YouTube'}>
  {#if src}
    <iframe
      class="yt"
      src={src}
      title={props.title ?? 'YouTube'}
      allow="autoplay; encrypted-media; picture-in-picture"
      allowfullscreen
      sandbox="allow-scripts allow-same-origin allow-presentation"
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
    font-size: 12px;
  }
</style>
