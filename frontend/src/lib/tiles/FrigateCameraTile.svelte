<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import BaseTile from './BaseTile.svelte';
  import { watchEntity, type HaEntity } from '$lib/ha/entity.js';

  interface FrigateProps {
    entity_id?: string;            // e.g. camera.driveway — preferred
    camera?: string;               // legacy label fallback
    go2rtc_base?: string;          // optional go2rtc stream path
    muted?: boolean;
    refreshMs?: number;            // snapshot refresh cadence (default 1500)
  }

  interface Props {
    id: string;
    props?: FrigateProps;
  }

  let { id, props = {} }: Props = $props();

  let haEntity = $state<HaEntity | null>(null);
  let stopWatch: (() => void) | null = null;

  $effect(() => {
    stopWatch?.();
    haEntity = null;
    if (!props.entity_id) return;
    // Re-query every 10s for a fresh entity_picture token (HA rotates it).
    const w = watchEntity(props.entity_id, 10_000);
    const unsub = w.store.subscribe((e) => (haEntity = e));
    stopWatch = () => {
      unsub();
      w.stop();
    };
  });

  // Refresh the <img> src faster than the entity re-query so the feed
  // looks live-ish. Each img load pulls a fresh JPEG from HA.
  let frameSeq = $state(0);
  let frameTimer: ReturnType<typeof setInterval> | null = null;
  const refreshMs = $derived(Math.max(props.refreshMs ?? 1500, 500));

  onMount(() => {
    if (!browser) return;
    frameTimer = setInterval(() => {
      frameSeq += 1;
    }, refreshMs);
  });

  onDestroy(() => {
    stopWatch?.();
    if (frameTimer) clearInterval(frameTimer);
  });

  const url = $derived.by(() => {
    if (!browser) return '';
    const w = window as unknown as { __HA_URL__?: string; __HA_TOKEN__?: string };
    const base = w.__HA_URL__;
    if (!base || !props.entity_id) return '';
    const tok = (haEntity?.attributes as { access_token?: string } | undefined)?.access_token;
    if (tok) {
      return `${base}/api/camera_proxy_stream/${encodeURIComponent(props.entity_id)}?token=${tok}`;
    }
    // Fallback to snapshot with auth header not possible on <img>; use
    // entity_picture which already embeds a signed short-lived token.
    const ep = (haEntity?.attributes as { entity_picture?: string } | undefined)?.entity_picture;
    if (ep) return `${base}${ep}&s=${frameSeq}`;
    return '';
  });

  const label = $derived(props.entity_id?.replace(/^camera\./, '') ?? props.camera ?? 'cam');
  const status = $derived.by(() => {
    if (!haEntity) return 'connecting';
    if (haEntity.state === 'unavailable') return 'offline';
    return 'live';
  });
</script>

<BaseTile {id} type="frigate_camera" label={label}>
  <div class="cam" data-testid="frigate-cam">
    {#if url}
      <img class="feed" alt={label} src={url} referrerpolicy="no-referrer" />
    {:else}
      <div class="placeholder mono">no camera</div>
    {/if}
    <div class="label mono">
      {label} · <span class="state s-{status}">{status}</span>
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
    display: block;
  }
  .placeholder {
    display: flex;
    width: 100%;
    height: 100%;
    align-items: center;
    justify-content: center;
    color: var(--dim);
    font-size: 0.85rem;
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
