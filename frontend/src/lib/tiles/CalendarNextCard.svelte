<script lang="ts">
  /**
   * Next upcoming event from the HA calendar REST endpoint. Window is
   * now → +7d, first future event wins. 60s refresh, skeleton + stale
   * per Task 28 conventions.
   */
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { isStale } from '$lib/cards/stale.js';

  interface Props {
    id: string;
    isActive: boolean;
    props?: { entityId?: string };
  }
  let { isActive, props = {} }: Props = $props();
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
  let next = $state<CalEvent | null>(null);
  let lastSuccessTs = $state(0);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function load() {
    if (!browser) return;
    const w = window as unknown as { __HA_URL__?: string; __HA_TOKEN__?: string };
    if (!w.__HA_URL__ || !w.__HA_TOKEN__) return;
    const now = new Date();
    const end = new Date(now.getTime() + 7 * 86400 * 1000);
    const startISO = encodeURIComponent(now.toISOString());
    const endISO = encodeURIComponent(end.toISOString());
    try {
      const r = await fetch(
        `${w.__HA_URL__}/api/calendars/${entityId}?start=${startISO}&end=${endISO}`,
        { headers: { Authorization: `Bearer ${w.__HA_TOKEN__}` } },
      );
      if (!r.ok) return;
      const arr = (await r.json()) as ApiEvent[];
      const future = arr
        .map((e) => ({
          summary: e.summary ?? '',
          start: e.start?.dateTime ?? e.start?.date ?? '',
        }))
        .filter((e) => e.start && !isNaN(new Date(e.start).getTime()))
        .filter((e) => +new Date(e.start) >= now.getTime())
        .sort((a, b) => +new Date(a.start) - +new Date(b.start));
      next = future[0] ?? null;
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

  const countdown = $derived.by((): string => {
    if (!next) return '';
    const ms = +new Date(next.start) - Date.now();
    if (ms < 0) return 'now';
    const min = Math.round(ms / 60_000);
    if (min < 60) return `in ${min} min`;
    const hr = Math.floor(min / 60);
    const rest = min % 60;
    return rest === 0 ? `in ${hr}h` : `in ${hr}h ${rest}m`;
  });
</script>

<section class="cal-next" data-stale={stale ? 'true' : undefined}>
  <header class="kicker">— Next Up —</header>
  {#if lastSuccessTs === 0}
    <p class="title skel-bar w80"></p>
    <p class="when skel-bar w40"></p>
  {:else if !next}
    <p class="empty">Nothing scheduled</p>
  {:else}
    <p class="title">{next.summary}</p>
    <p class="when">{countdown}</p>
  {/if}
  <div class="rule" aria-hidden="true"></div>
</section>

<style>
  .cal-next {
    height: 100%;
    padding: 0.6rem 0.8rem 0.7rem;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
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
  }
  .title {
    font-style: italic;
    font-weight: 700;
    font-size: clamp(1.4rem, 3vw, 2rem);
    line-height: 1.1;
    margin: 0 0 0.3rem;
  }
  .when {
    font-style: italic;
    color: var(--accent);
    font-size: 0.95rem;
    letter-spacing: 0.06em;
    margin: 0;
  }
  .rule {
    position: absolute;
    left: 0.8rem;
    right: 0.8rem;
    bottom: 0;
    height: 1px;
    background: var(--line);
  }
  .cal-next[data-stale='true'] {
    opacity: 0.6;
    transition: opacity 400ms ease;
  }
  .skel-bar {
    display: inline-block;
    height: 1.2rem;
    border-radius: 2px;
    background: linear-gradient(90deg, var(--line) 0%, var(--line-strong) 50%, var(--line) 100%);
    background-size: 200% 100%;
    animation: skel-shimmer 1.6s ease-in-out infinite;
  }
  .skel-bar.w80 { width: 80%; height: 1.6rem; }
  .skel-bar.w40 { width: 40%; height: 0.9rem; }
  @keyframes skel-shimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
</style>
