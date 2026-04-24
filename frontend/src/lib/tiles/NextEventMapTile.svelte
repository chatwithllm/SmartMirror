<script lang="ts">
  /**
   * Next calendar event with a location — rendered as a Google Static
   * Map with the event details in a side card. Pulls calendar events
   * from HA (same pattern as CalendarTile / NewspaperTile), picks the
   * first upcoming event that has a location, and fetches the map
   * image through /api/admin/map so the Google key stays server-side.
   */
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import BaseTile from './BaseTile.svelte';

  interface Props {
    id: string;
    props?: {
      entity_id?: string;
      zoom?: number;
      /** Skip past events + all-day events. */
      upcomingDays?: number;
    };
  }
  let { id, props = {} }: Props = $props();

  type ApiEvent = {
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    summary?: string;
    location?: string;
    description?: string;
  };

  type PickedEvent = { start: Date; summary: string; location: string };
  let event = $state<PickedEvent | null>(null);
  let loaded = $state(false);
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let dirTimer: ReturnType<typeof setInterval> | null = null;

  type Directions = {
    ok: boolean;
    distance?: { text: string; value: number };
    duration?: { text: string; value: number };
    duration_in_traffic?: { text: string; value: number } | null;
    error?: string;
  };
  let directions = $state<Directions | null>(null);

  type RouteData = {
    polyline: string;
    home_latlng: string;
    dest_latlng: string;
  };
  let route = $state<RouteData | null>(null);

  async function fetchCalendar(): Promise<void> {
    if (!browser) return;
    const w = window as unknown as { __HA_URL__?: string; __HA_TOKEN__?: string };
    if (!w.__HA_URL__ || !w.__HA_TOKEN__) return;
    const eid = props.entity_id ?? 'calendar.palakurla4340_gmail_com';
    const days = Math.max(1, props.upcomingDays ?? 14);
    const start = new Date().toISOString();
    const end = new Date(Date.now() + days * 86400 * 1000).toISOString();
    try {
      const r = await fetch(
        `${w.__HA_URL__}/api/calendars/${eid}?start=${start}&end=${end}`,
        { headers: { Authorization: `Bearer ${w.__HA_TOKEN__}` } },
      );
      if (!r.ok) return;
      const arr = (await r.json()) as ApiEvent[];
      const now = Date.now();
      const first = arr
        .map((e) => {
          const raw = e.start?.dateTime ?? e.start?.date ?? '';
          const d = new Date(raw);
          return { date: d, summary: e.summary ?? '', location: (e.location ?? '').trim() };
        })
        .filter((e) => !isNaN(e.date.getTime()) && e.date.getTime() >= now && e.location)
        .sort((a, b) => a.date.getTime() - b.date.getTime())[0];
      event = first
        ? { start: first.date, summary: first.summary || '(event)', location: first.location }
        : null;
      loaded = true;
    } catch {
      /* keep previous */
    }
  }

  async function fetchDirections(to: string): Promise<void> {
    try {
      const r = await fetch(`/api/admin/directions?to=${encodeURIComponent(to)}`, {
        cache: 'no-store',
      });
      const j = (await r.json()) as Directions;
      directions = j;
    } catch {
      directions = null;
    }
  }

  async function fetchRoute(to: string): Promise<void> {
    try {
      const r = await fetch(`/api/admin/route?to=${encodeURIComponent(to)}`, {
        cache: 'no-store',
      });
      if (!r.ok) {
        route = null;
        return;
      }
      const j = (await r.json()) as {
        ok: boolean;
        polyline?: string;
        home_latlng?: string;
        dest_latlng?: string;
      };
      if (j.ok && j.polyline && j.home_latlng && j.dest_latlng) {
        route = {
          polyline: j.polyline,
          home_latlng: j.home_latlng,
          dest_latlng: j.dest_latlng,
        };
      } else {
        route = null;
      }
    } catch {
      route = null;
    }
  }

  // Whenever the picked event changes, kick a fresh directions fetch
  // and set up a traffic-refresh interval. Route polyline is fetched
  // once per event — geometry is cached server-side for an hour.
  $effect(() => {
    const loc = event?.location;
    if (!loc) {
      directions = null;
      route = null;
      if (dirTimer) {
        clearInterval(dirTimer);
        dirTimer = null;
      }
      return;
    }
    void fetchDirections(loc);
    void fetchRoute(loc);
    if (dirTimer) clearInterval(dirTimer);
    dirTimer = setInterval(() => void fetchDirections(loc), 2 * 60_000);
  });

  onMount(() => {
    if (!browser) return;
    void fetchCalendar();
    pollTimer = setInterval(fetchCalendar, 5 * 60_000);
  });

  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
    if (dirTimer) clearInterval(dirTimer);
  });

  const mapSrc = $derived.by(() => {
    if (!event) return '';
    const qs = new URLSearchParams();
    qs.set('w', '640');
    qs.set('h', '640');
    if (route) {
      // Route overlay: blue polyline + green home pin + red dest pin.
      // Drop `q`/`zoom` so Static Maps auto-frames the whole path.
      qs.set('path', `color:0x4285f4|weight:5|enc:${route.polyline}`);
      qs.append('markers', `color:green|label:H|${route.home_latlng}`);
      qs.append('markers', `color:red|${route.dest_latlng}`);
    } else {
      qs.set('q', event.location);
      qs.set('zoom', String(props.zoom ?? 14));
    }
    return `/api/admin/map?${qs}`;
  });

  const whenText = $derived.by(() => {
    if (!event) return '';
    const d = event.start;
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();
    const time = d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    if (sameDay) return `today · ${time}`;
    if (isTomorrow) return `tomorrow · ${time}`;
    return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${time}`;
  });

  const relText = $derived.by(() => {
    if (!event) return '';
    const diff = event.start.getTime() - Date.now();
    const mins = Math.round(diff / 60000);
    if (mins < 60) return `in ${mins} min`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `in ${hrs}h`;
    const days = Math.round(hrs / 24);
    return `in ${days}d`;
  });

  const travelLine = $derived.by(() => {
    const d = directions;
    if (!d) return '';
    if (!d.ok) return d.error === 'no-home-address' ? 'set HOME_ADDRESS' : '';
    const base = d.duration?.text ?? '';
    const tr = d.duration_in_traffic?.text;
    const dist = d.distance?.text ?? '';
    const parts: string[] = [];
    if (tr && d.duration && d.duration_in_traffic) {
      const delta = d.duration_in_traffic.value - d.duration.value;
      const delayMin = Math.round(delta / 60);
      if (delayMin > 1) parts.push(`${tr} (+${delayMin}m traffic)`);
      else parts.push(tr);
    } else if (base) {
      parts.push(base);
    }
    if (dist) parts.push(dist);
    return parts.join(' · ');
  });

  const trafficBad = $derived.by(() => {
    const d = directions;
    if (!d?.ok || !d.duration || !d.duration_in_traffic) return false;
    return d.duration_in_traffic.value - d.duration.value > 5 * 60;
  });
</script>

<BaseTile {id} type="next_event_map" label="Next event">
  <div class="wrap" data-testid="next-event-map">
    {#if !loaded}
      <div class="empty mono">loading…</div>
    {:else if !event}
      <div class="empty mono">no upcoming event with a location</div>
    {:else}
      <div class="map">
        {#if mapSrc}
          <img
            src={mapSrc}
            alt={`Map of ${event.location}`}
            onerror={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              img.style.display = 'none';
              const sibling = img.parentElement?.querySelector('.map-fallback');
              if (sibling instanceof HTMLElement) sibling.style.display = 'flex';
            }}
          />
          <div class="map-fallback mono">
            map · set GOOGLE_MAPS_KEY in config.env
          </div>
        {/if}
      </div>
      <div class="card">
        <div class="rel mono">{relText}</div>
        <div class="title">{event.summary}</div>
        <div class="when mono">{whenText}</div>
        <div class="loc">{event.location}</div>
        {#if travelLine}
          <div class="travel mono" class:bad={trafficBad}>{travelLine}</div>
        {/if}
      </div>
    {/if}
  </div>
</BaseTile>

<style>
  .wrap {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    width: 100%;
    height: 100%;
  }
  .empty {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--dim);
    font-size: 0.8rem;
  }
  .map {
    position: relative;
    width: 100%;
    height: 100%;
    background: var(--panel-2);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  .map img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .map-fallback {
    position: absolute;
    inset: 0;
    display: none;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: var(--dim);
    font-size: 0.65rem;
    padding: 0.5rem;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    justify-content: center;
    padding: 0 0.2rem;
    min-width: 0;
  }
  .rel {
    color: var(--accent);
    font-size: 0.6rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    margin-bottom: 0.3rem;
  }
  .title {
    font-size: 1rem;
    line-height: 1.15;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .when {
    color: var(--dim);
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-top: 0.25rem;
  }
  .loc {
    color: var(--dim);
    font-size: 0.72rem;
    line-height: 1.25;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    margin-top: 0.35rem;
  }
  .travel {
    color: var(--accent);
    font-size: 0.65rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-top: 0.35rem;
  }
  .travel.bad {
    color: var(--warn);
  }
</style>
