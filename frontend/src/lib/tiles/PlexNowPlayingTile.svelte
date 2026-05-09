<script lang="ts">
  import { onDestroy } from 'svelte';
  import BaseTile from './BaseTile.svelte';
  import { browser } from '$app/environment';
  import { watchEntity, type HaEntity } from '$lib/ha/entity.js';

  interface Session {
    id: string;
    title: string;
    subtitle?: string;
    user?: string;
    player?: string;
    progress?: number; // 0..1
    poster?: string;
  }

  interface Props {
    id: string;
    props?: {
      demo?: Session[];
      /** HA media_player entity to derive now-playing from. Optional —
       *  if absent the tile falls back to the demo session list. */
      entityId?: string;
    };
  }

  let { id, props = {} }: Props = $props();

  // Live HA entity (only when entityId is supplied). Watcher polls every
  // 5s, same cadence as the takeover trigger watcher. We unsubscribe and
  // stop the timer in onDestroy + when the prop flips.
  let haEntity = $state<HaEntity | null>(null);
  let stopWatch: (() => void) | null = null;
  $effect(() => {
    stopWatch?.();
    haEntity = null;
    if (!props.entityId) return;
    const w = watchEntity(props.entityId, 5_000);
    const unsub = w.store.subscribe((e) => (haEntity = e));
    stopWatch = () => {
      unsub();
      w.stop();
    };
  });
  onDestroy(() => stopWatch?.());

  function posterUrl(entity: HaEntity | null): string | undefined {
    if (!browser || !entity) return undefined;
    const ep = (entity.attributes as { entity_picture?: string } | undefined)
      ?.entity_picture;
    if (!ep) return undefined;
    // entity_picture is a relative URL; prefix with HA base if available.
    const base = (window as unknown as { __HA_URL__?: string }).__HA_URL__;
    return base ? `${base}${ep}` : ep;
  }

  const liveSession = $derived.by((): Session | null => {
    if (!haEntity) return null;
    const s = haEntity.state;
    if (!s || s === 'off' || s === 'idle' || s === 'unavailable' || s === 'unknown')
      return null;
    const a = haEntity.attributes as
      | {
          media_title?: string;
          media_series_title?: string;
          media_episode?: string;
          media_season?: string;
          media_artist?: string;
          media_album_name?: string;
          media_position?: number;
          media_duration?: number;
        }
      | undefined;
    const seriesPart = a?.media_series_title
      ? `${a.media_series_title}${a.media_season ? ` · S${a.media_season}` : ''}${
          a.media_episode ? `E${a.media_episode}` : ''
        }`
      : undefined;
    const title = seriesPart ?? a?.media_title ?? 'Now playing';
    const subtitle = seriesPart && a?.media_title ? a.media_title : a?.media_artist;
    const progress =
      a?.media_position != null && a?.media_duration && a.media_duration > 0
        ? Math.max(0, Math.min(1, a.media_position / a.media_duration))
        : undefined;
    return {
      id: haEntity.entity_id,
      title,
      subtitle,
      player: haEntity.entity_id.replace(/^media_player\./, '').replace(/_/g, ' '),
      progress,
      poster: posterUrl(haEntity)
    };
  });

  const sessions: Session[] = $derived.by(() => {
    if (props.entityId) return liveSession ? [liveSession] : [];
    return (
      props.demo ?? [
        {
          id: '1',
          title: 'The Bear · S03E04',
          subtitle: 'Violet',
          user: 'chatwithllm',
          player: 'Kitchen TV',
          progress: 0.42
        }
      ]
    );
  });
</script>

<BaseTile {id} type="plex_now_playing" label="Plex · Now Playing">
  <div class="pnp" data-testid="plex-now-playing">
    <h4 class="mono">Plex Now Playing</h4>
    {#if sessions.length === 0}
      <div class="empty mono">no active sessions</div>
    {:else}
      <ul>
        {#each sessions as s (s.id)}
          <li>
            {#if s.poster}
              <div class="poster"><img src={s.poster} alt={s.title} /></div>
            {/if}
            <div class="title">{s.title}</div>
            {#if s.subtitle}
              <div class="sub">{s.subtitle}</div>
            {/if}
            <div class="meta mono">
              {s.user ?? 'plex'} · {s.player ?? 'player'}
            </div>
            {#if s.progress !== undefined}
              <div class="bar">
                <div class="fill" style:width="{Math.round(s.progress * 100)}%"></div>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</BaseTile>

<style>
  .pnp {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    height: 100%;
  }
  h4 {
    color: var(--dim);
    font-size: 0.75rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
  .empty {
    color: var(--dim);
    font-size: 0.85rem;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
    min-height: 0;
  }
  li {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-height: 0;
  }
  .poster {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    border-radius: var(--radius-sm);
    background: var(--panel-2);
  }
  .poster img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .title {
    color: var(--fg);
    font-size: 1.05rem;
    font-weight: 500;
  }
  .sub {
    color: var(--dim);
    font-size: 0.85rem;
  }
  .meta {
    color: var(--dimmer);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
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
    transition: width 600ms ease;
  }
</style>
