<script lang="ts">
  /**
   * Today's events from the HA calendar REST endpoint
   * (`/api/calendars/{entity_id}?start=...&end=...`). The state-attribute
   * shape is empty in vanilla HA, so we mirror MorningTile and pull the
   * events array directly. 60s refresh, skeleton + stale wired per
   * Task 28 conventions.
   */
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { isStale } from '$lib/cards/stale.js';

  interface Props {
    id: string;
    isActive: boolean;
    props?: { entityId?: string };
  }
  let { id: _id, isActive, props = {} }: Props = $props();

  const entityId = $derived(props.entityId ?? 'calendar.palakurla4340_gmail_com');

  interface CalEvent {
    summary: string;
    start: string; // ISO
  }
  type ApiEvent = {
    start?: { dateTime?: string; date?: string };
    summary?: string;
  };

  const REFRESH_MS = 60_000;
  let events = $state<CalEvent[]>([]);
  let lastSuccessTs = $state(0);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function load() {
    if (!browser) return;
    const w = window as unknown as { __HA_URL__?: string; __HA_TOKEN__?: string };
    if (!w.__HA_URL__ || !w.__HA_TOKEN__) return;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const startISO = encodeURIComponent(todayStart.toISOString());
    const endISO = encodeURIComponent(tomorrowStart.toISOString());
    try {
      const r = await fetch(
        `${w.__HA_URL__}/api/calendars/${entityId}?start=${startISO}&end=${endISO}`,
        { headers: { Authorization: `Bearer ${w.__HA_TOKEN__}` } },
      );
      if (!r.ok) return;
      const arr = (await r.json()) as ApiEvent[];
      events = arr
        .map((e) => ({
          summary: e.summary ?? '',
          start: e.start?.dateTime ?? e.start?.date ?? '',
        }))
        .filter((e) => e.start && !isNaN(new Date(e.start).getTime()))
        .sort((a, b) => +new Date(a.start) - +new Date(b.start));
      lastSuccessTs = Date.now();
    } catch {
      /* keep previous */
    }
  }

  $effect(() => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (!isActive) return;
    void load();
    timer = setInterval(load, REFRESH_MS);
  });

  onMount(() => {
    if (isActive && !timer) {
      void load();
      timer = setInterval(load, REFRESH_MS);
    }
  });
  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  const stale = $derived(isStale(lastSuccessTs, REFRESH_MS));

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };
</script>

<section class="cal-day" data-stale={stale ? 'true' : undefined}>
  <header class="kicker">— Today's Calendar —</header>
  {#if lastSuccessTs === 0}
    <ul class="skel">
      <li><span class="skel-bar w70"></span></li>
      <li><span class="skel-bar w90"></span></li>
      <li><span class="skel-bar w60"></span></li>
    </ul>
  {:else if events.length === 0}
    <p class="empty">No events today — clear day ahead</p>
  {:else}
    <ul>
      {#each events as e (e.start)}
        <li>
          <span class="t">{fmtTime(e.start)}</span>
          <span class="s">{e.summary}</span>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="rule" aria-hidden="true"></div>
</section>

<style>
  .cal-day {
    height: 100%;
    width: 100%;
    padding: 0.6rem 0.8rem 0.7rem;
    display: flex;
    flex-direction: column;
    color: var(--fg);
    font-family: 'Fraunces', Georgia, serif;
    position: relative;
  }
  .kicker {
    font-style: italic;
    font-size: 0.6rem;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--dim);
    margin-bottom: 0.5rem;
  }
  .empty {
    font-style: italic;
    color: var(--dim);
    font-size: 1.05rem;
    margin: auto 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    flex: 1;
  }
  li {
    display: grid;
    grid-template-columns: 5rem 1fr;
    gap: 0.7rem;
    align-items: baseline;
  }
  .t {
    font-style: italic;
    font-size: 0.85rem;
    color: var(--accent);
    font-feature-settings: 'tnum';
    letter-spacing: 0.04em;
  }
  .s {
    font-style: italic;
    font-size: 0.95rem;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rule {
    position: absolute;
    left: 0.8rem;
    right: 0.8rem;
    bottom: 0;
    height: 1px;
    background: var(--line);
  }
  .cal-day[data-stale='true'] {
    opacity: 0.6;
    transition: opacity 400ms ease;
  }
  .skel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .skel li {
    display: block;
    padding: 0.2rem 0;
  }
  .skel-bar {
    display: inline-block;
    height: 0.85rem;
    border-radius: 2px;
    background: linear-gradient(90deg, var(--line) 0%, var(--line-strong) 50%, var(--line) 100%);
    background-size: 200% 100%;
    animation: skel-shimmer 1.6s ease-in-out infinite;
  }
  .skel-bar.w70 { width: 70%; }
  .skel-bar.w90 { width: 90%; }
  .skel-bar.w60 { width: 60%; }
  @keyframes skel-shimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
</style>
