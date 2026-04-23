<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import BaseTile from './BaseTile.svelte';
  import { browser } from '$app/environment';

  interface Event {
    id: string;
    title: string;
    start: string;
    end?: string;
    location?: string;
  }

  interface CalProps {
    entity_id?: string;   // e.g. calendar.personal — pulls live HA events
    calendar_id?: string; // legacy
    count?: number;
    demo?: Event[];
  }

  interface Props {
    id: string;
    props?: CalProps;
  }

  let { id, props = {} }: Props = $props();
  const count = $derived(Math.min(Math.max(props.count ?? 6, 1), 12));

  let liveEvents = $state<Event[] | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function pullCalendar() {
    if (!browser || !props.entity_id) return;
    const w = window as unknown as { __HA_URL__?: string; __HA_TOKEN__?: string };
    if (!w.__HA_URL__ || !w.__HA_TOKEN__) return;
    const now = new Date();
    const start = now.toISOString();
    const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    try {
      const r = await fetch(
        `${w.__HA_URL__}/api/calendars/${props.entity_id}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
        { headers: { Authorization: `Bearer ${w.__HA_TOKEN__}` }, cache: 'no-store' }
      );
      if (!r.ok) return;
      const data = (await r.json()) as Array<{
        summary?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string };
        location?: string;
        uid?: string;
      }>;
      liveEvents = data
        .map((ev, i) => ({
          id: ev.uid ?? String(i),
          title: ev.summary ?? '(untitled)',
          start: ev.start?.dateTime ?? ev.start?.date ?? '',
          end: ev.end?.dateTime,
          location: ev.location
        }))
        .filter((e) => e.start);
    } catch {
      /* swallow */
    }
  }

  onMount(() => {
    if (!props.entity_id) return;
    void pullCalendar();
    timer = setInterval(() => void pullCalendar(), 5 * 60 * 1000);
  });
  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  const events: Event[] = $derived(
    liveEvents ??
      props.demo ?? [
        { id: '1', title: 'Standup', start: new Date(Date.now() + 30 * 60 * 1000).toISOString() },
        {
          id: '2',
          title: 'Design review',
          start: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
          location: 'Meet'
        },
        {
          id: '3',
          title: '1:1 w/ manager',
          start: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString()
        }
      ]
  );

  function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  function minutesUntil(iso: string): number {
    return Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  }
</script>

<BaseTile {id} type="calendar" label="Calendar">
  <div class="cal" data-testid="calendar">
    <h4 class="cal-title mono">Upcoming</h4>
    <ul>
      {#each events.slice(0, count) as ev (ev.id)}
        {@const mins = minutesUntil(ev.start)}
        <li class="ev" data-testid="cal-event">
          <span class="when mono">{formatTime(ev.start)}</span>
          <span class="title">{ev.title}</span>
          {#if ev.location}
            <span class="loc">· {ev.location}</span>
          {/if}
          <span class="soon" class:imminent={mins <= 10} class:warn={mins <= 30 && mins > 10}>
            in {mins}m
          </span>
        </li>
      {/each}
    </ul>
  </div>
</BaseTile>

<style>
  .cal {
    display: flex;
    flex-direction: column;
    gap: var(--gap-sm);
    width: 100%;
    height: 100%;
  }
  .cal-title {
    color: var(--dim);
    font-size: 0.75rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .ev {
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-size: 0.95rem;
    padding: 4px 0;
    border-bottom: 1px solid var(--line);
  }
  .when {
    color: var(--accent);
    font-size: 0.8rem;
    min-width: 44px;
  }
  .title {
    flex: 1;
    color: var(--fg);
  }
  .loc {
    color: var(--dim);
    font-size: 0.8rem;
  }
  .soon {
    color: var(--dim);
    font-size: 0.8rem;
    font-family: var(--font-mono);
  }
  .soon.warn {
    color: var(--warn);
  }
  .soon.imminent {
    color: var(--bad);
  }
</style>
