<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import BaseTile from './BaseTile.svelte';

  interface FrigateProps {
    camera?: string;
    go2rtc_base?: string; // e.g. ws://frigate.local:1984
    stream?: 'mse' | 'webrtc';
    muted?: boolean;
  }

  interface Props {
    id: string;
    props?: FrigateProps;
  }

  let { id, props = {} }: Props = $props();

  let video: HTMLVideoElement | null = $state(null);
  let ws: WebSocket | null = null;
  let status = $state<'connecting' | 'live' | 'offline'>('connecting');

  async function startMse() {
    if (!browser || !video || !props.camera || !props.go2rtc_base) {
      status = 'offline';
      return;
    }
    const url = `${props.go2rtc_base.replace(/^http/, 'ws')}/api/ws?src=${encodeURIComponent(props.camera)}`;
    try {
      ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        status = 'live';
      };
      ws.onerror = () => {
        status = 'offline';
      };
      ws.onclose = () => {
        status = 'offline';
      };
      // go2rtc WS → MSE wiring: real implementation pipes init+segments
      // via MediaSource.addSourceBuffer. We leave the data path to a
      // follow-up phase and keep this tile visible with a placeholder.
    } catch {
      status = 'offline';
    }
  }

  onMount(() => {
    void startMse();
  });

  onDestroy(() => {
    ws?.close();
    ws = null;
  });
</script>

<BaseTile {id} type="frigate_camera" label={props.camera ?? 'Camera'}>
  <div class="cam" data-testid="frigate-cam">
    <!-- svelte-ignore a11y_media_has_caption -->
    <video
      bind:this={video}
      autoplay
      muted={props.muted ?? true}
      playsinline
      class="feed"
    ></video>
    <div class="label mono">
      {props.camera ?? 'cam'} · <span class="state s-{status}">{status}</span>
    </div>
  </div>
</BaseTile>

<style>
  .cam {
    position: relative;
    width: 100%;
    height: 100%;
    background: #000;
    border-radius: calc(var(--radius-md) - 2px);
    overflow: hidden;
  }
  .feed {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .label {
    position: absolute;
    top: 8px;
    left: 8px;
    padding: 3px 6px;
    background: rgba(0, 0, 0, 0.6);
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    color: var(--fg);
    letter-spacing: 0.08em;
  }
  .state {
    color: var(--dim);
  }
  .s-live {
    color: var(--ok);
  }
  .s-offline {
    color: var(--bad);
  }
</style>
