<script lang="ts">
  /**
   * Reflection-first port of mockups/05-glass.html.
   *
   * The original mockup used translucent glass panels over a soft
   * gradient. Behind a two-way mirror that whole aesthetic vanishes —
   * low-alpha fills read as faint grey rectangles competing with the
   * room reflection. This tile drops every panel background, keeps the
   * grid composition, and bumps text contrast:
   *
   *   - bg #000, no card fills, no blur / backdrop-filter
   *   - primary text #fff weight 500+, secondary #fff/0.82
   *   - saturated accents (gold / cyan / lime / coral)
   *   - outlines only where hierarchy demands (hero camera / media)
   *
   * Live data bindings (same as MinimalTile):
   *   weather.4340, calendar, grocery inventory, one hero camera,
   *   optional plex media_player, mirror PC stats.
   */
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import BaseTile from './BaseTile.svelte';
  import { watchEntity, type HaEntity } from '$lib/ha/entity.js';
  import { normalizeInventory } from '$lib/grocery/normalize.js';

  interface Props {
    id: string;
    props?: {
      weatherEntity?: string;
      calendarEntity?: string;
      plexEntity?: string;
      cameraEntity?: string;
      locationLabel?: string;
      cityLabel?: string;
      services?: Array<{ name: string; state: 'ok' | 'warn' | 'bad'; note: string }>;
      hosts?: Array<{ name: string; ip: string; cpu: number; ram: number; disk: number }>;
    };
  }
  let { id, props = {} }: Props = $props();

  // ---------- clock ----------
  let now = $state(new Date());
  let clockTimer: ReturnType<typeof setInterval> | null = null;
  const hhmm = $derived(
    now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
  );
  const dateLine = $derived(
    now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
  );
  const modeLabel = $derived.by(() => {
    const h = now.getHours();
    if (h < 5) return 'night';
    if (h < 10) return 'morning';
    if (h < 17) return 'work';
    if (h < 22) return 'evening';
    return 'night';
  });

  // ---------- HA entities ----------
  let weather = $state<HaEntity | null>(null);
  let plex = $state<HaEntity | null>(null);
  let camera = $state<HaEntity | null>(null);
  const stopFns: Array<() => void> = [];
  function watch(eid: string, pollMs: number, set: (e: HaEntity | null) => void): void {
    const w = watchEntity(eid, pollMs);
    const unsub = w.store.subscribe(set);
    stopFns.push(() => {
      unsub();
      w.stop();
    });
  }

  // ---------- calendar ----------
  type CalRow = { when: string; summary: string };
  let calendar = $state<CalRow[]>([]);
  let calendarTimer: ReturnType<typeof setInterval> | null = null;
  async function fetchCalendar(): Promise<void> {
    if (!browser) return;
    const w = window as unknown as { __HA_URL__?: string; __HA_TOKEN__?: string };
    if (!w.__HA_URL__ || !w.__HA_TOKEN__) return;
    const eid = props.calendarEntity ?? 'calendar.palakurla4340_gmail_com';
    const start = new Date().toISOString();
    const end = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
    try {
      const r = await fetch(`${w.__HA_URL__}/api/calendars/${eid}?start=${start}&end=${end}`, {
        headers: { Authorization: `Bearer ${w.__HA_TOKEN__}` },
      });
      if (!r.ok) return;
      const arr = (await r.json()) as Array<{
        start: { dateTime?: string; date?: string };
        summary?: string;
      }>;
      const today = new Date();
      calendar = arr
        .map((e) => {
          const d = new Date(e.start?.dateTime ?? e.start?.date ?? '');
          return { date: d, summary: e.summary ?? '' };
        })
        .filter((e) => !isNaN(e.date.getTime()) && e.date.getTime() > Date.now() - 3600_000)
        .slice(0, 4)
        .map((e) => {
          const sameDay = e.date.toDateString() === today.toDateString();
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const isTomorrow = e.date.toDateString() === tomorrow.toDateString();
          const when = sameDay
            ? e.date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            : isTomorrow
              ? 'Tomorrow'
              : e.date.toLocaleDateString('en-US', { weekday: 'short' });
          return { when, summary: e.summary };
        });
    } catch {
      /* ignore */
    }
  }

  // ---------- grocery ----------
  type InvRow = { name: string; qty: string; level: 'ok' | 'low' | 'crit' };
  let inventory = $state<InvRow[]>([
    { name: 'Coffee beans', qty: '180 g', level: 'low' },
    { name: 'Milk', qty: '0.2 L', level: 'crit' },
    { name: 'Eggs', qty: '4', level: 'low' },
    { name: 'Dishwasher tabs', qty: '18', level: 'ok' },
    { name: 'Bin liners', qty: '22', level: 'ok' },
    { name: 'Olive oil', qty: '150 ml', level: 'low' },
  ]);
  let groceryTimer: ReturnType<typeof setInterval> | null = null;
  async function fetchGrocery(): Promise<void> {
    try {
      const r = await fetch('/api/admin/grocery/inventory', { cache: 'no-store' });
      if (!r.ok) return;
      const j = (await r.json()) as { configured?: boolean; data?: unknown };
      if (!j.configured) return;
      const rows = normalizeInventory(j.data);
      const low = rows.filter((r) => r.qty < r.min).slice(0, 8);
      const rest = rows.filter((r) => !(r.qty < r.min)).slice(0, Math.max(0, 6 - low.length));
      const merged = [...low, ...rest].slice(0, 6);
      if (!merged.length) return;
      inventory = merged.map((r) => {
        const deep = r.min > 0 && r.qty / r.min <= 0.25;
        const level: 'ok' | 'low' | 'crit' = r.qty < r.min ? (deep ? 'crit' : 'low') : 'ok';
        return {
          name: r.name,
          qty: `${r.qty}${r.unit ? ` ${r.unit}` : ''}`.trim(),
          level,
        };
      });
    } catch {
      /* ignore */
    }
  }

  // ---------- stats ----------
  type HostStat = { name: string; ip: string; cpu: number; ram: number; disk: number };
  let mirrorStats = $state<HostStat | null>(null);
  let statsTimer: ReturnType<typeof setInterval> | null = null;
  async function fetchStats(): Promise<void> {
    try {
      const r = await fetch('/api/admin/stats', { cache: 'no-store' });
      if (!r.ok) return;
      const j = (await r.json()) as { cpu?: number; ram?: number; disk?: number };
      const lan = (window as unknown as { __MIRROR_LAN_URL__?: string }).__MIRROR_LAN_URL__ ?? '';
      const ip = lan ? lan.replace(/^https?:\/\//, '').replace(/:\d+$/, '') : '—';
      mirrorStats = { name: 'mirror-pc', ip, cpu: j.cpu ?? 0, ram: j.ram ?? 0, disk: j.disk ?? 0 };
    } catch {
      /* ignore */
    }
  }

  // ---------- mount / destroy ----------
  onMount(() => {
    if (!browser) return;
    clockTimer = setInterval(() => (now = new Date()), 1000);
    watch(props.weatherEntity ?? 'weather.4340', 60_000, (e) => (weather = e));
    if (props.plexEntity) watch(props.plexEntity, 10_000, (e) => (plex = e));
    if (props.cameraEntity) watch(props.cameraEntity, 10_000, (e) => (camera = e));
    void fetchCalendar();
    calendarTimer = setInterval(fetchCalendar, 5 * 60_000);
    void fetchGrocery();
    groceryTimer = setInterval(fetchGrocery, 30_000);
    void fetchStats();
    statsTimer = setInterval(fetchStats, 10_000);
  });
  onDestroy(() => {
    if (clockTimer) clearInterval(clockTimer);
    if (calendarTimer) clearInterval(calendarTimer);
    if (groceryTimer) clearInterval(groceryTimer);
    if (statsTimer) clearInterval(statsTimer);
    for (const fn of stopFns) fn();
  });

  // ---------- derived ----------
  const weatherTemp = $derived.by(() => {
    const t = (weather?.attributes as { temperature?: number } | undefined)?.temperature;
    return typeof t === 'number' ? Math.round(t) : null;
  });
  const weatherCond = $derived(weather?.state ?? '—');
  const weatherFeels = $derived.by(() => {
    const f = (weather?.attributes as { apparent_temperature?: number } | undefined)
      ?.apparent_temperature;
    return typeof f === 'number' ? Math.round(f) : null;
  });
  const wxForecast = $derived.by(() => {
    const f = (weather?.attributes as { forecast?: Array<Record<string, unknown>> } | undefined)
      ?.forecast;
    if (!Array.isArray(f)) return [] as Array<{ day: string; t: number }>;
    const byDay = new Map<string, number[]>();
    for (const row of f) {
      const dt = row.datetime as string | undefined;
      if (!dt) continue;
      const d = new Date(dt);
      const key = d.toLocaleDateString('en-US', { weekday: 'short' });
      const t = typeof row.temperature === 'number' ? Math.round(row.temperature) : null;
      if (t == null) continue;
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(t);
    }
    return Array.from(byDay.entries())
      .slice(0, 5)
      .map(([day, temps]) => ({ day, t: Math.max(...temps) }));
  });

  const services = $derived(
    props.services ?? [
      { name: 'home-assistant', state: 'ok' as const, note: '42d' },
      { name: 'plex', state: 'ok' as const, note: '12d' },
      { name: 'immich', state: 'ok' as const, note: '12d' },
      { name: 'frigate', state: 'warn' as const, note: '4h' },
      { name: 'grafana', state: 'ok' as const, note: '4d' },
      { name: 'backup', state: 'bad' as const, note: '2h' },
      { name: 'traefik', state: 'ok' as const, note: '38d' },
      { name: 'kuma', state: 'ok' as const, note: '38d' },
    ],
  );
  const upCount = $derived(services.filter((s) => s.state === 'ok').length);
  const warnCount = $derived(services.filter((s) => s.state === 'warn').length);
  const downCount = $derived(services.filter((s) => s.state === 'bad').length);

  const plexNow = $derived.by(() => {
    if (!plex || plex.state === 'idle' || plex.state === 'off' || plex.state === 'unavailable')
      return null;
    const a = plex.attributes as
      | {
          media_title?: string;
          media_artist?: string;
          media_album_name?: string;
          media_position?: number;
          media_duration?: number;
          entity_picture?: string;
        }
      | undefined;
    return {
      title: a?.media_title ?? 'Now playing',
      meta: [a?.media_artist, a?.media_album_name].filter(Boolean).join(' · '),
      pct:
        a?.media_position != null && a?.media_duration
          ? Math.round((a.media_position / a.media_duration) * 100)
          : 42,
      poster: a?.entity_picture,
    };
  });

  function camUrl(entity: HaEntity | null): string {
    if (!browser || !entity) return '';
    const base = (window as unknown as { __HA_URL__?: string }).__HA_URL__;
    if (!base) return '';
    const tok = (entity.attributes as { access_token?: string } | undefined)?.access_token;
    if (tok) {
      return `${base}/api/camera_proxy_stream/${encodeURIComponent(entity.entity_id)}?token=${tok}`;
    }
    const ep = (entity.attributes as { entity_picture?: string } | undefined)?.entity_picture;
    return ep ? `${base}${ep}` : '';
  }

  const demoHosts: HostStat[] = [
    { name: 'nas-01', ip: '10.0.0.21', cpu: 12, ram: 34, disk: 71 },
    { name: 'nvr-box', ip: '10.0.0.22', cpu: 46, ram: 71, disk: 82 },
  ];
  const hosts = $derived.by(() => {
    if (props.hosts) return props.hosts;
    const out: HostStat[] = [];
    if (mirrorStats) out.push(mirrorStats);
    out.push(...demoHosts.slice(0, 2 - out.length));
    return out;
  });

  function metricColor(v: number): string {
    if (v >= 80) return 'var(--g-bad)';
    if (v >= 60) return 'var(--g-warn)';
    return 'var(--g-accent)';
  }
</script>

<BaseTile {id} type="glass" chromeless={true} label="glass">
  <div class="gl" data-testid="glass">
    <div class="top">
      <span><span class="dot ok"></span>{upCount}</span>
      <span><span class="dot warn"></span>{warnCount}</span>
      <span><span class="dot bad"></span>{downCount}</span>
      <span>{modeLabel}</span>
    </div>

    <div class="grid">
      <!-- CLOCK -->
      <section class="clock">
        <div class="lbl">
          <span>Now</span><span class="chip">{modeLabel} mode</span>
        </div>
        <div class="time">{hhmm}</div>
        <div class="sub">
          <span>{dateLine}</span>
          {#if props.locationLabel}<span>{props.locationLabel}</span>{/if}
        </div>
      </section>

      <!-- WEATHER -->
      <section class="weather">
        <div class="lbl">
          <span>Weather{props.cityLabel ? ` · ${props.cityLabel}` : ''}</span>
          <span class="ic">⛅</span>
        </div>
        <div class="temp">{weatherTemp != null ? `${weatherTemp}°` : '—'}</div>
        <div class="cond">
          {weatherCond}{weatherFeels != null ? ` · feels ${weatherFeels}°` : ''}
        </div>
        <div class="fc">
          {#each wxForecast as d (d.day)}
            <div class="d">
              <div class="dy">{d.day}</div>
              <div class="dt">{d.t}°</div>
            </div>
          {/each}
        </div>
      </section>

      <!-- UP NEXT -->
      <section class="upnext">
        <div class="lbl">Up next</div>
        <ul>
          {#if calendar.length === 0}
            <li><span class="t">—</span><span>nothing</span></li>
          {:else}
            {#each calendar as r (r.when + r.summary)}
              <li><span class="t">{r.when}</span><span>{r.summary}</span></li>
            {/each}
          {/if}
        </ul>
      </section>

      <!-- PLEX HERO -->
      <section class="plex">
        {#if plexNow?.poster}
          <img
            class="bg"
            src={`${(window as any).__HA_URL__ ?? ''}${plexNow.poster}`}
            alt=""
          />
        {/if}
        <div class="overlay"></div>
        <div class="body">
          <span class="chip">Plex · {plexNow ? 'continue' : 'queue'}</span>
          <div class="title">{plexNow?.title ?? 'Nothing playing'}</div>
          <div class="meta">{plexNow?.meta ?? 'pick something tonight'}</div>
          <div class="bar"><span style:width={`${plexNow?.pct ?? 0}%`}></span></div>
        </div>
      </section>

      <!-- SERVICES -->
      <section class="svc">
        <div class="lbl">
          <span>Services</span><span>{services.length} monitored</span>
        </div>
        <div class="sgrid">
          {#each services as s (s.name)}
            <div class="si">
              <span class="dot {s.state}"></span>
              <span class="n">{s.name}</span>
              <span class="u">{s.note}</span>
            </div>
          {/each}
        </div>
      </section>

      <!-- INVENTORY -->
      <section class="inv">
        <div class="lbl">
          <span>Pantry</span>
          <span>{inventory.filter((r) => r.level !== 'ok').length} low</span>
        </div>
        <ul>
          {#each inventory as r (r.name)}
            <li>
              <span>{r.name}</span>
              <span class="badge {r.level === 'ok' ? '' : r.level}">{r.qty}</span>
            </li>
          {/each}
        </ul>
      </section>

      <!-- PODCAST -->
      <section class="pod">
        <div class="lbl">Podcast</div>
        <div class="row">
          <div class="art">🎙</div>
          <div class="info">
            <div class="title">Changelog #587</div>
            <div class="meta">paused · queue 2 of 4</div>
          </div>
        </div>
        <div class="bar"><span style:width="34%"></span></div>
      </section>

      <!-- HOSTS -->
      <section class="hosts">
        <div class="lbl">
          <span>Hosts</span><span>{hosts.length} online</span>
        </div>
        <div class="hgrid">
          {#each hosts as h (h.name)}
            <div class="h">
              <div class="n">{h.name}</div>
              <div class="ip">{h.ip}</div>
              <div class="metrics">
                {#each [{ lab: 'cpu', v: h.cpu }, { lab: 'ram', v: h.ram }, { lab: 'disk', v: h.disk }] as m (m.lab)}
                  <div class="m">
                    <div class="lab2">{m.lab}</div>
                    <div class="v">{m.v}</div>
                    <div class="bar"><span style:width={`${m.v}%`} style:background={metricColor(m.v)}></span></div>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </section>

      <!-- CAMERA -->
      <section class="cam">
        <div class="chip rec-chip">
          <span class="rec"></span>
          {camera?.entity_id?.replace(/^camera\./, '').replace(/_/g, ' ') ?? 'camera'}
        </div>
        {#if camUrl(camera)}
          <img src={camUrl(camera)} alt="" referrerpolicy="no-referrer" />
        {/if}
      </section>
    </div>
  </div>
</BaseTile>

<style>
  /* Reflection-first tokens — bright, saturated, no low-alpha fills. */
  .gl {
    --g-fg: #ffffff;
    --g-dim: rgba(255, 255, 255, 0.82);
    --g-dimmer: rgba(255, 255, 255, 0.62);
    --g-line: rgba(255, 255, 255, 0.22);
    --g-line-strong: rgba(255, 255, 255, 0.4);
    --g-accent: #69dcff;
    --g-good: #9bff8e;
    --g-warn: #ffc85a;
    --g-bad: #ff8b8b;
    --g-violet: #d0a8ff;

    background: #000;
    color: var(--g-fg);
    font-family: 'Inter', system-ui, sans-serif;
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
  }

  :global(:root[data-mode='light']) .gl {
    /* On light mode, a smart mirror isn't competing with reflection
     * the same way — switch to a softer near-white canvas with darker
     * ink so it stays legible without harsh #000 punch. */
    --g-fg: #1c1a18;
    --g-dim: rgba(28, 26, 24, 0.82);
    --g-dimmer: rgba(28, 26, 24, 0.55);
    --g-line: rgba(28, 26, 24, 0.18);
    --g-line-strong: rgba(28, 26, 24, 0.35);
    --g-accent: #0a6ea0;
    --g-good: #2d8538;
    --g-warn: #a66a12;
    --g-bad: #a82525;
    --g-violet: #6a3dc0;
    background: #f5f0e6;
  }

  .top {
    position: absolute;
    top: 1.3rem;
    right: 1.6rem;
    display: flex;
    gap: 0.8rem;
    z-index: 3;
    font-size: 0.6rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--g-dim);
    align-items: center;
    font-weight: 500;
  }
  .top > span {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }

  .dot {
    width: 0.38rem;
    height: 0.38rem;
    border-radius: 50%;
    display: inline-block;
    flex-shrink: 0;
  }
  .dot.ok {
    background: var(--g-good);
    box-shadow: 0 0 8px var(--g-good);
  }
  .dot.warn {
    background: var(--g-warn);
    box-shadow: 0 0 8px var(--g-warn);
  }
  .dot.bad {
    background: var(--g-bad);
    box-shadow: 0 0 8px var(--g-bad);
  }

  .grid {
    width: 100%;
    height: 100%;
    padding: 1.6rem 1.8rem 1.8rem;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    /* Row bands:
     *   clock 5 + (weather 5 || upnext 5) + plex 5 + svc 3 +
     *   (inv 5 || pod 5) + (hosts 3 || cam 3) = 26
     * Spans match the band heights so auto-flow packs edge-to-edge —
     * no dead strips at top/bottom. */
    grid-template-rows: repeat(26, minmax(0, 1fr));
    gap: 0.9rem;
  }

  .lbl {
    font-size: 0.55rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--g-dim);
    font-weight: 600;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .chip {
    border: 1px solid var(--g-line-strong);
    border-radius: 999px;
    padding: 0.15rem 0.6rem;
    font-size: 0.55rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--g-dim);
    font-weight: 500;
  }

  /* CLOCK */
  .clock {
    grid-column: span 8;
    grid-row: span 5;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.4rem;
    padding-top: 1rem;
  }
  .clock .time {
    font-size: 8.2rem;
    font-weight: 500;
    letter-spacing: -0.045em;
    line-height: 0.95;
    color: var(--g-fg);
  }
  .clock .sub {
    display: flex;
    justify-content: space-between;
    color: var(--g-dim);
    font-size: 0.85rem;
    font-weight: 500;
    margin-top: 0.2rem;
  }

  /* WEATHER */
  .weather {
    grid-column: span 5;
    grid-row: span 5;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .weather .ic {
    font-size: 1.2rem;
  }
  .weather .temp {
    font-size: 5rem;
    font-weight: 500;
    letter-spacing: -0.035em;
    line-height: 1;
    color: var(--g-fg);
    margin-top: 0.4rem;
  }
  .weather .cond {
    color: var(--g-dim);
    font-size: 0.85rem;
    font-weight: 500;
    margin-top: 0.2rem;
    text-transform: capitalize;
  }
  .fc {
    display: flex;
    justify-content: space-between;
    margin-top: auto;
    padding-top: 0.7rem;
    border-top: 1px solid var(--g-line);
  }
  .fc .d {
    text-align: center;
  }
  .fc .dy {
    font-size: 0.65rem;
    color: var(--g-dim);
    letter-spacing: 0.06em;
  }
  .fc .dt {
    color: var(--g-fg);
    font-weight: 600;
    font-size: 0.85rem;
    margin-top: 0.1rem;
  }

  /* UP NEXT */
  .upnext {
    grid-column: span 3;
    grid-row: span 5;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .upnext ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .upnext li {
    display: flex;
    gap: 0.6rem;
    padding: 0.3rem 0;
    border-top: 1px solid var(--g-line);
    font-size: 0.75rem;
    color: var(--g-dim);
    font-weight: 500;
  }
  .upnext li:first-child {
    border-top: 0;
  }
  .upnext li .t {
    color: var(--g-accent);
    width: 3.5rem;
    flex-shrink: 0;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  /* PLEX HERO */
  .plex {
    grid-column: span 8;
    grid-row: span 5;
    position: relative;
    overflow: hidden;
    border: 1px solid var(--g-line-strong);
    border-radius: 6px;
  }
  .plex .bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    filter: saturate(1.2) brightness(1.1);
  }
  .plex .overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0) 30%, rgba(0, 0, 0, 0.85));
  }
  .plex .body {
    position: absolute;
    inset: auto 0 0 0;
    padding: 1.2rem 1.4rem;
    z-index: 2;
  }
  .plex .title {
    font-size: 1.8rem;
    font-weight: 600;
    margin-top: 0.5rem;
    line-height: 1.1;
    letter-spacing: -0.01em;
    color: #fff;
  }
  .plex .meta {
    color: rgba(255, 255, 255, 0.85);
    font-size: 0.85rem;
    margin-top: 0.25rem;
    font-weight: 500;
  }
  .plex .bar {
    height: 3px;
    background: rgba(255, 255, 255, 0.35);
    border-radius: 3px;
    margin-top: 0.9rem;
    overflow: hidden;
  }
  .plex .bar > span {
    display: block;
    height: 100%;
    background: #fff;
  }

  /* SERVICES */
  .svc {
    grid-column: span 8;
    grid-row: span 3;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .sgrid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.4rem 0.9rem;
    margin-top: 0.3rem;
  }
  .si {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--g-fg);
  }
  .si .n {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .si .u {
    color: var(--g-dim);
    font-size: 0.7rem;
    font-weight: 500;
  }

  /* INVENTORY */
  .inv {
    grid-column: span 5;
    grid-row: span 5;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .inv ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .inv li {
    padding: 0.35rem 0;
    border-top: 1px solid var(--g-line);
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.82rem;
    font-weight: 500;
    color: var(--g-fg);
  }
  .inv li:first-child {
    border-top: 0;
  }
  .badge {
    font-size: 0.65rem;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    border: 1px solid var(--g-line-strong);
    color: var(--g-dim);
    font-weight: 600;
  }
  .badge.low {
    color: var(--g-warn);
    border-color: var(--g-warn);
  }
  .badge.crit {
    color: var(--g-bad);
    border-color: var(--g-bad);
  }

  /* PODCAST */
  .pod {
    grid-column: span 3;
    grid-row: span 5;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .pod .row {
    display: flex;
    gap: 0.7rem;
    align-items: center;
    margin-top: 0.3rem;
  }
  .pod .art {
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 0.6rem;
    background: linear-gradient(135deg, var(--g-violet), var(--g-accent));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.1rem;
    flex-shrink: 0;
  }
  .pod .info {
    flex: 1;
    min-width: 0;
  }
  .pod .title {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--g-fg);
  }
  .pod .meta {
    font-size: 0.66rem;
    color: var(--g-dim);
    margin-top: 0.1rem;
    font-weight: 500;
  }
  .pod .bar {
    height: 2px;
    background: var(--g-line);
    border-radius: 2px;
    margin-top: auto;
    overflow: hidden;
  }
  .pod .bar > span {
    display: block;
    height: 100%;
    background: var(--g-violet);
  }

  /* HOSTS */
  .hosts {
    grid-column: span 5;
    grid-row: span 3;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .hgrid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.4rem 0.9rem;
  }
  .hgrid .h {
    padding-top: 0.4rem;
    border-top: 1px solid var(--g-line);
  }
  .hgrid .n {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--g-fg);
  }
  .hgrid .ip {
    font-size: 0.6rem;
    color: var(--g-dim);
    letter-spacing: 0.14em;
    margin-top: 0.1rem;
  }
  .hgrid .metrics {
    display: flex;
    gap: 0.55rem;
    margin-top: 0.35rem;
  }
  .hgrid .m {
    flex: 1;
  }
  .hgrid .m .lab2 {
    font-size: 0.55rem;
    color: var(--g-dim);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-weight: 600;
  }
  .hgrid .m .v {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--g-fg);
  }
  .hgrid .m .bar {
    height: 3px;
    background: var(--g-line);
    border-radius: 2px;
    margin-top: 0.15rem;
    overflow: hidden;
  }
  .hgrid .m .bar > span {
    display: block;
    height: 100%;
    background: var(--g-accent);
  }

  /* CAMERA */
  .cam {
    grid-column: span 3;
    grid-row: span 3;
    position: relative;
    overflow: hidden;
    border: 1px solid var(--g-line-strong);
    border-radius: 6px;
  }
  .cam img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .rec-chip {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    z-index: 2;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    border-color: rgba(255, 255, 255, 0.35);
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .rec {
    width: 0.38rem;
    height: 0.38rem;
    border-radius: 50%;
    background: var(--g-bad);
    box-shadow: 0 0 8px var(--g-bad);
    animation: pulse 1.4s infinite;
  }
  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.35;
    }
  }
</style>
