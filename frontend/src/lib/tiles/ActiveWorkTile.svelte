<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import BaseTile from './BaseTile.svelte';
  import { fetchActiveCards } from '$lib/kanban/client.js';
  import type { KanbanCard } from '$lib/kanban/types.js';

  interface Props {
    id: string;
    props?: {
      kanbanUrl?: string;
      mirrorToken?: string;
      projects?: string[];
      maxCards?: number;
      showFeedback?: boolean;
      refreshSeconds?: number;
      projectAliases?: Record<string, string>;
    };
  }

  let { id, props = {} }: Props = $props();

  const kanbanUrl = props.kanbanUrl ?? '';
  const mirrorToken = props.mirrorToken ?? '';
  const projects = props.projects;
  const maxCards = props.maxCards ?? 5;
  const refreshSeconds = props.refreshSeconds ?? 30;
  const projectAliases = props.projectAliases ?? {};

  let cards = $state<KanbanCard[]>([]);
  let total = $state(0);
  let lastFetched = $state<Date | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(true);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let aborter: AbortController | null = null;

  function projectLabel(key: string | null): string {
    if (!key) return '—';
    if (projectAliases[key]) return projectAliases[key];
    const parts = key.split('/');
    return parts[parts.length - 1] ?? key;
  }

  function relativeTime(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000) return 'now';
    const mins = Math.floor(ms / 60_000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  async function refresh() {
    if (!kanbanUrl || !mirrorToken) {
      error = 'Tile not configured (kanbanUrl + mirrorToken required)';
      loading = false;
      return;
    }
    aborter?.abort();
    aborter = new AbortController();
    try {
      const all = await fetchActiveCards({
        baseUrl: kanbanUrl,
        mirrorToken,
        projects,
        signal: aborter.signal,
      });
      total = all.length;
      cards = all.slice(0, maxCards);
      error = null;
      lastFetched = new Date();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('401') || msg.includes('403')) {
        error = 'Auth error — regenerate mirror token';
      } else if (lastFetched) {
        error = `stale (last update ${relativeTime(lastFetched.toISOString())})`;
      } else {
        error = `error: ${msg}`;
      }
    } finally {
      loading = false;
    }
  }

  function schedule() {
    timer = setTimeout(async () => {
      await refresh();
      schedule();
    }, refreshSeconds * 1000);
  }

  onMount(() => {
    refresh().then(schedule);
  });

  onDestroy(() => {
    aborter?.abort();
    if (timer) clearTimeout(timer);
  });

  function dominantTag(card: KanbanCard): string | null {
    for (const t of ['deployed-prod', 'deployed-local', 'blocked', 'has-feedback']) {
      if (card.tags.includes(t)) return t;
    }
    return null;
  }
</script>

<BaseTile {id} type="active-work" label="Active Work">
  <div class="active-work">
    {#if loading && cards.length === 0}
      <div class="dim">Loading…</div>
    {:else if total === 0}
      <div class="dim">No active work</div>
    {:else}
      <ul>
        {#each cards as card (card.id)}
          <li class="row" data-tag={dominantTag(card)}>
            <div class="head">
              <span class="project">{projectLabel(card.project)}</span>
              <span class="title">{card.title}</span>
            </div>
            <div class="meta">
              {#if card.tags.includes('deployed-prod')}<span class="ok">✓ prod</span>{/if}
              {#if card.tags.includes('deployed-local') && !card.tags.includes('deployed-prod')}<span class="dot ok" aria-hidden="true"></span><span>local</span>{/if}
              {#if card.tags.includes('blocked')}<span class="warn">blocked</span>{/if}
              <span class="ts">{relativeTime(card.updated_at)}</span>
            </div>
          </li>
        {/each}
      </ul>
      {#if total > cards.length}
        <div class="dim more">+{total - cards.length} more</div>
      {/if}
    {/if}
    {#if error}
      <div class="error">{error}</div>
    {/if}
  </div>
</BaseTile>

<style>
  .active-work { font-family: 'JetBrains Mono', monospace; font-size: 0.9rem; color: #d6d6d6; }
  ul { list-style: none; margin: 0; padding: 0; }
  .row { padding: 0.4rem 0; border-bottom: 1px solid #2a2a2a; position: relative; }
  .row:last-child { border-bottom: none; }
  .row[data-tag="blocked"] { border-left: 3px solid #d6b06a; padding-left: 0.5rem; }
  .row[data-tag="has-feedback"]::after {
    content: '';
    position: absolute; right: 0; top: 50%; width: 0.4rem; height: 0.4rem;
    background: #7ab8d4; border-radius: 50%; transform: translateY(-50%);
    animation: pulse 2s infinite;
  }
  .head { display: flex; gap: 0.5rem; align-items: baseline; }
  .project { color: #7ab8d4; min-width: 6rem; }
  .title { color: #e0e0e0; font-weight: 500; }
  .meta { display: flex; gap: 0.6rem; font-size: 0.78rem; color: #8a8a8a; margin-top: 0.15rem; }
  .ok { color: #7fc99a; }
  .warn { color: #d6b06a; }
  .dot { display: inline-block; width: 0.4rem; height: 0.4rem; border-radius: 50%; vertical-align: middle; margin-right: 0.2rem; }
  .dot.ok { background: #7fc99a; }
  .ts { margin-left: auto; }
  .dim { color: #6a6a6a; }
  .more { padding-top: 0.3rem; font-size: 0.78rem; }
  .error { color: #d67070; font-size: 0.78rem; padding-top: 0.4rem; }
  @keyframes pulse {
    0% { opacity: 0.4; }
    50% { opacity: 1; }
    100% { opacity: 0.4; }
  }
</style>
