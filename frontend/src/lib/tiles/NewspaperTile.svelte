<script lang="ts">
  /**
   * Editorial "Mirror Daily" tile — one newspaper-style panel that fills
   * the whole cell. Replicates the mockup at 04-editorial.html:
   *
   *   [masthead]
   *   [hero: kicker + headline + deck + photo]
   *   [at-a-glance: time • weather • mode/status]
   *   [lede: 2-col prose with drop-cap]
   *   [pull quote]
   *   [three: agenda • services • pantry]
   *   [now-playing strip]
   *   [footer: host/service/frigate/plex stats]
   *
   * Live data where HA ships an entity (clock, weather, calendar);
   * demo-fed where it doesn't (pantry, services, pull quote). Keep it
   * all in one tile so the layout stays a single full-bleed cell.
   */
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import BaseTile from './BaseTile.svelte';
  import { watchEntity, type HaEntity } from '$lib/ha/entity.js';

  interface Props {
    id: string;
    props?: {
      weatherEntity?: string;
      calendarEntity?: string;
      plexEntity?: string;
      edition?: string;
      pantry?: Array<{ name: string; qty: string; level?: 'crit' | 'low' | 'ok' }>;
      services?: Array<{ name: string; state: 'ok' | 'warn' | 'bad'; note: string }>;
      hostsUp?: number;
      hostsTotal?: number;
      frigateEvents24h?: number;
      plexItems?: number;
    };
  }

  let { id, props = {} }: Props = $props();

  const DEFAULT_PANTRY: NonNullable<Props['props']>['pantry'] = [
    { name: 'Coffee beans', qty: '180g', level: 'low' },
    { name: 'Milk', qty: '0.2L', level: 'crit' },
    { name: 'Eggs', qty: '4', level: 'low' },
    { name: 'Dishwasher tabs', qty: '18' },
    { name: 'Bin liners', qty: '22' },
  ];
  const DEFAULT_SERVICES: NonNullable<Props['props']>['services'] = [
    { name: 'home-assistant', state: 'ok', note: 'up · 42d' },
    { name: 'plex', state: 'ok', note: 'up · 12d' },
    { name: 'immich', state: 'ok', note: 'up · 12d' },
    { name: 'frigate', state: 'warn', note: 'degraded' },
    { name: 'backup-svc', state: 'bad', note: 'down 2h' },
  ];

  // ----- Live clock -----
  let now = $state(new Date());
  let clockTimer: ReturnType<typeof setInterval> | null = null;

  // ----- HA entities -----
  let weather = $state<HaEntity | null>(null);
  let calendarEvents = $state<Array<{ start: Date; summary: string }>>([]);
  let plex = $state<HaEntity | null>(null);

  const stopWatchers: Array<() => void> = [];

  function watchWeather(eid: string): void {
    const w = watchEntity(eid, 60_000);
    stopWatchers.push(w.stop);
    const unsub = w.store.subscribe((e) => (weather = e));
    stopWatchers.push(unsub);
  }
  function watchPlex(eid: string): void {
    const w = watchEntity(eid, 10_000);
    stopWatchers.push(w.stop);
    const unsub = w.store.subscribe((e) => (plex = e));
    stopWatchers.push(unsub);
  }

  // ----- Calendar fetch (beyond the generic state API) -----
  async function fetchCalendar(eid: string): Promise<void> {
    if (!browser) return;
    const w = window as unknown as { __HA_URL__?: string; __HA_TOKEN__?: string };
    if (!w.__HA_URL__ || !w.__HA_TOKEN__) return;
    const start = new Date().toISOString();
    const end = new Date(Date.now() + 6 * 24 * 3600 * 1000).toISOString();
    try {
      const r = await fetch(
        `${w.__HA_URL__}/api/calendars/${eid}?start=${start}&end=${end}`,
        { headers: { Authorization: `Bearer ${w.__HA_TOKEN__}` } },
      );
      if (!r.ok) return;
      const arr = (await r.json()) as Array<{ start: { dateTime?: string; date?: string }; summary: string }>;
      calendarEvents = arr
        .map((e) => ({ start: new Date(e.start.dateTime ?? e.start.date ?? ''), summary: e.summary }))
        .filter((e) => !isNaN(e.start.getTime()))
        .sort((a, b) => a.start.getTime() - b.start.getTime())
        .slice(0, 5);
    } catch {
      /* ignore */
    }
  }

  let calendarTimer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    if (!browser) return;
    clockTimer = setInterval(() => (now = new Date()), 1000);
    const wEnt = props.weatherEntity ?? 'weather.4340';
    watchWeather(wEnt);
    const cEnt = props.calendarEntity ?? 'calendar.palakurla4340_gmail_com';
    void fetchCalendar(cEnt);
    calendarTimer = setInterval(() => void fetchCalendar(cEnt), 5 * 60_000);
    if (props.plexEntity) watchPlex(props.plexEntity);
  });

  onDestroy(() => {
    if (clockTimer) clearInterval(clockTimer);
    if (calendarTimer) clearInterval(calendarTimer);
    for (const fn of stopWatchers) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
  });

  // ----- Derived -----
  const time = $derived(
    now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
  );
  const longDate = $derived(
    now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
  );
  const mastDate = $derived(
    now.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
  );
  const hhmm = $derived(
    now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
  );
  const edition = $derived.by(() => {
    if (props.edition) return props.edition;
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - start.getTime();
    const day = Math.floor(diff / 86400000);
    return `№ ${String(day).padStart(4, '0')}`;
  });
  const modeName = $derived.by(() => {
    const h = now.getHours();
    if (h < 6 || h >= 22) return 'Night';
    if (h < 10) return 'Morning';
    if (h < 17) return 'Work';
    return 'Evening';
  });
  const nextModeNote = $derived.by(() => {
    const h = now.getHours();
    if (h < 6) return 'next → morning at 06:00';
    if (h < 10) return 'next → work at 10:00';
    if (h < 17) return 'next → evening at 17:00';
    if (h < 22) return 'next → night at 22:00';
    return 'next → morning at 06:00';
  });

  const weatherTemp = $derived.by(() => {
    const t = (weather?.attributes as { temperature?: number } | undefined)?.temperature;
    return typeof t === 'number' ? Math.round(t) : null;
  });
  const weatherCond = $derived(weather?.state ?? '—');
  const weatherFeels = $derived.by(() => {
    const f = (weather?.attributes as { apparent_temperature?: number } | undefined)?.apparent_temperature;
    return typeof f === 'number' ? Math.round(f) : null;
  });

  const services = $derived(props.services ?? DEFAULT_SERVICES);
  const pantry = $derived(props.pantry ?? DEFAULT_PANTRY);
  const upCount = $derived(services.filter((s) => s.state === 'ok').length);
  const warnCount = $derived(services.filter((s) => s.state === 'warn').length);
  const downCount = $derived(services.filter((s) => s.state === 'bad').length);

  function fmtCalTime(d: Date): string {
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    if (sameDay)
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  }

  const nowPlaying = $derived.by(() => {
    if (!plex || plex.state === 'idle' || plex.state === 'off') return null;
    const a = plex.attributes as
      | { media_title?: string; media_artist?: string; media_album_name?: string }
      | undefined;
    return {
      title: a?.media_title ?? 'Now playing',
      meta: [a?.media_artist, a?.media_album_name].filter(Boolean).join(' · '),
    };
  });
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,700;1,9..144,400&display=swap"
  />
</svelte:head>

<BaseTile {id} type="newspaper" chromeless={true} label="daily">
  <div class="paper">
    <header class="mast">
      <div class="brand">The Mirror <span>Daily</span></div>
      <div class="meta">
        <div>Edition <b>{edition}</b></div>
        <div>Mode <b>{modeName}</b></div>
        <div>{mastDate} · <b>{hhmm}</b></div>
      </div>
    </header>

    <section class="hero">
      <div class="left">
        <div class="kicker">Tonight · Feature</div>
        <h1>
          {#if nowPlaying}
            {nowPlaying.title}
          {:else}
            A quiet house, a patient <em>mirror</em>
          {/if}
        </h1>
        <div class="deck">
          {#if nowPlaying}
            {nowPlaying.meta} — ready on the living-room shelf, playing on request.
          {:else}
            The pantry is taking stock, the calendar is sorted, and the kiosk
            has finished its evening checks. Everything is, for the moment, calm.
          {/if}
        </div>
      </div>
      <div class="right">
        <div class="photo"></div>
        <div class="cap">Home · {mastDate}</div>
      </div>
    </section>

    <section class="today">
      <div class="time-big">
        <div class="section-h">At a glance</div>
        <div class="time-serif">{time}</div>
        <div class="sub">{longDate}</div>
      </div>
      <div class="wx-card">
        <div class="section-h">Weather</div>
        <div class="t">{weatherTemp ?? '—'}°</div>
        <div class="c">{weatherCond}</div>
        <div class="r">
          {weatherFeels != null ? `feels ${weatherFeels}°` : '—'}
        </div>
      </div>
      <div class="mode-card">
        <div class="section-h">Status</div>
        <div class="v">{modeName}</div>
        <div class="n">
          {upCount} up · {warnCount} warn · {downCount} down<br />
          {nextModeNote}
        </div>
      </div>
    </section>

    <section class="lede">
      <p>
        The evening room settles: ambient light drops, the thermostat eases
        back three degrees, and the mirror shifts mode on its own. Services
        hum along; a few stutter; one is silent. The pantry quietly
        announces that it is running out of milk.
      </p>
      <p>
        Meanwhile the driveway camera watches a neighbour's cat, the
        calendar has a deploy penciled for 20:00, and the backup process
        wants a second glance before sleep. The dishwasher is happy.
        Everything else is, for now, calm.
      </p>
    </section>

    <blockquote class="pull">
      "The quieter the room, the more precise the signal."
      <cite>— Mirror log, {hhmm}</cite>
    </blockquote>

    <section class="three">
      <div>
        <div class="section-h">Agenda</div>
        <div class="agenda">
          <ul>
            {#if calendarEvents.length === 0}
              <li><span class="t">—</span><span>nothing on the agenda</span></li>
            {:else}
              {#each calendarEvents as ev (ev.start.toISOString() + ev.summary)}
                <li>
                  <span class="t">{fmtCalTime(ev.start)}</span>
                  <span>{ev.summary}</span>
                </li>
              {/each}
            {/if}
          </ul>
        </div>
      </div>

      <div>
        <div class="section-h">Services</div>
        <div class="svc-list">
          {#each services as s (s.name)}
            <div class="r">
              <span class="n"><span class="dot {s.state}"></span>{s.name}</span>
              <span>{s.note}</span>
            </div>
          {/each}
        </div>
      </div>

      <div>
        <div class="section-h">Pantry</div>
        <div class="inv-side">
          <ul>
            {#each pantry as p (p.name)}
              <li class={p.level ?? ''}>
                <span>{p.name}</span>
                <span class="q">{p.qty}</span>
              </li>
            {/each}
          </ul>
        </div>
      </div>
    </section>

    {#if nowPlaying}
      <div class="now">
        <div class="art"></div>
        <div>
          <div class="title">{nowPlaying.title}</div>
          <div class="meta">Plex · {nowPlaying.meta}</div>
        </div>
        <div class="stat">now playing<br /><span class="inline">on the living-room TV</span></div>
      </div>
    {/if}

    <footer class="footer">
      <div class="foot">
        <div class="label">Hosts</div>
        <div class="val">{props.hostsUp ?? 6} <small>of {props.hostsTotal ?? 6}</small></div>
      </div>
      <div class="foot">
        <div class="label">Services</div>
        <div class="val">{upCount} up <small>· {downCount} down</small></div>
      </div>
      <div class="foot">
        <div class="label">Frigate · 24h</div>
        <div class="val">{props.frigateEvents24h ?? '—'} <small>events</small></div>
      </div>
      <div class="foot">
        <div class="label">Plex</div>
        <div class="val">{props.plexItems ?? '—'} <small>items</small></div>
      </div>
    </footer>

    <div class="edition">Compiled at {hhmm} · Home Assistant · Smart Mirror</div>
  </div>
</BaseTile>

<style>
  /* Paper palette mirrors the mockup. */
  .paper {
    --paper-bg: #12100e;
    --paper-ink: #f4ece0;
    --paper-dim: #b5a99a;
    --paper-dimmer: #6e6458;
    --paper-line: #2c2720;
    --paper-gold: #d8b36b;
    --paper-red: #c95a4a;
    --paper-green: #87a876;
    --paper-face: #1a1714;
    background: var(--paper-bg);
    color: var(--paper-ink);
    width: 100%;
    height: 100%;
    overflow: hidden;
    padding: 2.5rem 3rem 2rem;
    font-family: 'Inter', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    font-size: 0.85rem;
  }
  .paper :global(*) {
    box-sizing: border-box;
  }
  .paper .time-serif,
  .paper h1,
  .paper .brand,
  .paper .sub,
  .paper .t,
  .paper .v,
  .paper .deck,
  .paper .pull,
  .paper .agenda .t,
  .paper .svc-list .n,
  .paper .inv-side .q,
  .paper .now .title,
  .paper .val,
  .paper .edition {
    font-family: 'Fraunces', Georgia, serif;
  }

  .mast {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    padding-bottom: 0.9rem;
    border-bottom: 2px solid var(--paper-ink);
    margin-bottom: 1.6rem;
  }
  .brand {
    font-weight: 700;
    font-size: 2.6rem;
    letter-spacing: -0.01em;
    font-style: italic;
    line-height: 1;
  }
  .brand span {
    color: var(--paper-gold);
  }
  .meta {
    font-size: 0.55rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--paper-dim);
    text-align: right;
    line-height: 1.7;
  }
  .meta b {
    color: var(--paper-ink);
    font-weight: 500;
    margin-left: 0.35rem;
  }

  .section-h {
    font-size: 0.55rem;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--paper-gold);
    font-weight: 600;
    margin-bottom: 0.55rem;
  }

  .hero {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.6rem;
    margin-bottom: 1.4rem;
  }
  .hero .kicker {
    font-size: 0.6rem;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--paper-gold);
    font-weight: 600;
  }
  .hero h1 {
    font-weight: 400;
    font-size: 2.8rem;
    line-height: 1.02;
    letter-spacing: -0.02em;
    margin-top: 0.3rem;
  }
  .hero h1 em {
    font-style: italic;
    color: var(--paper-gold);
  }
  .hero .deck {
    font-size: 0.9rem;
    line-height: 1.45;
    color: var(--paper-dim);
    font-weight: 300;
    margin-top: 0.75rem;
  }
  .hero .photo {
    aspect-ratio: 4 / 5;
    background:
      #000
      url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1000&auto=format&q=75')
      center / cover;
  }
  .hero .cap {
    font-size: 0.55rem;
    color: var(--paper-dimmer);
    letter-spacing: 0.18em;
    text-transform: uppercase;
    margin-top: 0.5rem;
  }

  .today {
    display: grid;
    grid-template-columns: 1.3fr 1fr 1fr;
    gap: 1.5rem;
    margin-bottom: 1.4rem;
  }
  .time-big .time-serif {
    font-size: 4.2rem;
    line-height: 1;
    font-weight: 300;
    font-style: italic;
    letter-spacing: -0.03em;
  }
  .time-big .sub {
    font-size: 0.9rem;
    color: var(--paper-dim);
    margin-top: 0.3rem;
  }
  .wx-card .t {
    font-size: 2.5rem;
    font-weight: 300;
    line-height: 1;
  }
  .wx-card .c {
    font-size: 0.75rem;
    color: var(--paper-dim);
    margin-top: 0.3rem;
  }
  .wx-card .r {
    font-size: 0.6rem;
    color: var(--paper-dimmer);
    margin-top: 0.2rem;
  }
  .mode-card .v {
    font-style: italic;
    font-size: 1.5rem;
    color: var(--paper-ink);
  }
  .mode-card .n {
    font-size: 0.6rem;
    color: var(--paper-dim);
    margin-top: 0.3rem;
    letter-spacing: 0.05em;
    line-height: 1.4;
  }

  .lede {
    column-count: 2;
    column-gap: 1.6rem;
    font-size: 0.78rem;
    line-height: 1.65;
    color: var(--paper-dim);
    margin-bottom: 1.4rem;
  }
  .lede p:first-child::first-letter {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 3.1rem;
    line-height: 0.9;
    float: left;
    padding: 0.3rem 0.4rem 0 0;
    color: var(--paper-gold);
  }
  .pull {
    font-weight: 300;
    font-style: italic;
    font-size: 1.3rem;
    line-height: 1.35;
    color: var(--paper-ink);
    border-left: 3px solid var(--paper-gold);
    padding: 0.4rem 0.9rem;
    margin: 1rem 0 1.4rem;
  }
  .pull cite {
    display: block;
    margin-top: 0.55rem;
    font-style: normal;
    font-size: 0.6rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--paper-dimmer);
    font-family: 'Inter', sans-serif;
  }

  .three {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 1.4rem;
    margin-bottom: 1.4rem;
  }
  .three ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .agenda li {
    padding: 0.45rem 0;
    border-top: 1px solid var(--paper-line);
    display: flex;
    gap: 0.6rem;
    font-size: 0.75rem;
  }
  .agenda li:first-child {
    border-top: 0;
  }
  .agenda li .t {
    color: var(--paper-gold);
    width: 3.2rem;
    font-style: italic;
    font-size: 0.7rem;
    flex-shrink: 0;
  }
  .svc-list .r {
    display: flex;
    justify-content: space-between;
    padding: 0.35rem 0;
    border-top: 1px solid var(--paper-line);
    font-size: 0.72rem;
  }
  .svc-list .r:first-child {
    border-top: 0;
  }
  .dot {
    width: 0.35rem;
    height: 0.35rem;
    border-radius: 50%;
    display: inline-block;
    margin-right: 0.4rem;
  }
  .dot.ok {
    background: var(--paper-green);
  }
  .dot.warn {
    background: var(--paper-gold);
  }
  .dot.bad {
    background: var(--paper-red);
  }
  .inv-side li {
    display: flex;
    justify-content: space-between;
    padding: 0.35rem 0;
    border-top: 1px solid var(--paper-line);
    font-size: 0.72rem;
  }
  .inv-side li:first-child {
    border-top: 0;
  }
  .inv-side li .q {
    font-style: italic;
    color: var(--paper-dim);
  }
  .inv-side li.low .q {
    color: var(--paper-gold);
  }
  .inv-side li.crit .q {
    color: var(--paper-red);
  }

  .now {
    background: var(--paper-face);
    padding: 1rem 1.2rem;
    border-top: 1px solid var(--paper-line);
    border-bottom: 1px solid var(--paper-line);
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 0.8rem;
    align-items: center;
    margin-bottom: 1.4rem;
  }
  .now .art {
    width: 3rem;
    height: 3rem;
    background: linear-gradient(135deg, var(--paper-red), var(--paper-gold));
  }
  .now .title {
    font-size: 1rem;
  }
  .now .meta {
    font-size: 0.6rem;
    color: var(--paper-dimmer);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin-top: 0.2rem;
  }
  .now .stat {
    font-style: italic;
    color: var(--paper-dim);
    font-size: 0.75rem;
    text-align: right;
  }
  .now .stat .inline {
    font-style: normal;
    color: var(--paper-dim);
    font-family: 'Inter', sans-serif;
  }

  .footer {
    padding-top: 0.9rem;
    border-top: 1px solid var(--paper-line);
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1.2rem;
  }
  .foot .label {
    font-size: 0.5rem;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--paper-dimmer);
    margin-bottom: 0.3rem;
  }
  .foot .val {
    font-size: 1.1rem;
  }
  .foot .val small {
    color: var(--paper-dim);
    font-size: 0.6rem;
    font-family: 'Inter', sans-serif;
    margin-left: 0.25rem;
  }
  .edition {
    font-style: italic;
    font-size: 0.62rem;
    color: var(--paper-dimmer);
    text-align: center;
    margin-top: 1rem;
  }
</style>
