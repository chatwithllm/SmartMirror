<script lang="ts">
  import BaseTile from './BaseTile.svelte';

  interface Session {
    id: string;
    title: string;
    subtitle?: string;
    user?: string;
    player?: string;
    progress?: number; // 0..1
  }

  interface Props {
    id: string;
    props?: { demo?: Session[] };
  }

  let { id, props = {} }: Props = $props();
  const sessions: Session[] = $derived(
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
            <div class="title">{s.title}</div>
            <div class="sub">{s.subtitle ?? ''}</div>
            <div class="meta mono">
              {s.user ?? 'user'} · {s.player ?? 'player'}
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
    font-size: 10px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
  .empty {
    color: var(--dim);
    font-size: 12px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  li {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .title {
    color: var(--fg);
    font-size: 14px;
    font-weight: 500;
  }
  .sub {
    color: var(--dim);
    font-size: 12px;
  }
  .meta {
    color: var(--dimmer);
    font-size: 10px;
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
