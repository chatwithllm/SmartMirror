<script lang="ts">
  /**
   * Minimal-dark dashboard matching mockups/01-minimal-dark.html 1:1.
   *
   * Sections (portrait, single full-bleed tile):
   *   mode-tag      (absolute top-right)
   *   clock         — big time + date + location label
   *   weather       (4 cols) — live from weather entity
   *   mode/status   (4 cols) — time-of-day label + counters
   *   cal           (4 cols) — HA calendar upcoming list
   *   pod           (4 cols) — plex media_player now-playing (optional)
   *   media hero    (8 cols) — plex poster / fallback title
   *   services      (4 cols) — demo / prop-driven
   *   inventory     (4 cols) — /api/admin/grocery/inventory low-stock
   *   frigate strip (8 cols) — 4 camera entities
   *   hosts grid    (8 cols) — mirror PC stats + demo hosts
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
      cameraEntities?: string[];
      locationLabel?: string;
      cityLabel?: string;
      services?: Array<{ name: string; state: 'ok' | 'warn' | 'bad'; note: string }>;
      hosts?: Array<{ name: string; ip: string; cpu: number; ram: number; disk: number }>;
    };
  }
  let { id, props = {} }: Props = $props();

  const DEFAULT_SERVICES: NonNullable<Props['props']>['services'] = [
    { name: 'home-assistant', state: 'ok', note: 'up · 42d' },
    { name: 'plex', state: 'ok', note: 'up · 12d' },
    { name: 'immich', state: 'ok', note: 'up · 12d' },
    { name: 'frigate', state: 'warn', note: 'degraded' },
    { name: 'grafana', state: 'ok', note: 'up · 4d' },
    { name: 'backup-svc', state: 'bad', note: 'down · 2h' },
  ];

  // ---------- clock ----------
  let now = $state(new Date());
  let clockTimer: ReturnType<typeof setInterval> | null = null;

  const hhmm = $derived(
    now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
  );
  const dateShort = $derived(
    now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
  );
  const modeLabel = $derived.by(() => {
    const h = now.getHours();
    if (h < 5) return 'Night';
    if (h < 10) return 'Morning';
    if (h < 17) return 'Work';
    if (h < 22) return 'Evening';
    return 'Night';
  });
  const nextModeLine = $derived.by(() => {
    const h = now.getHours();
    if (h < 5) return 'Next · 05:00 → Morning';
    if (h < 10) return 'Next · 10:00 → Work';
    if (h < 17) return 'Next · 17:00 → Evening';
    if (h < 22) return 'Next · 22:00 → Night';
    return 'Next · 05:00 → Morning';
  });

  // ---------- HA entity watchers ----------
  let weather = $state<HaEntity | null>(null);
  let plex = $state<HaEntity | null>(null);
  const cameras = $state<Record<string, HaEntity | null>>({});
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
          const raw = e.start?.dateTime ?? e.start?.date ?? '';
          const d = new Date(raw);
          return { date: d, summary: e.summary ?? '' };
        })
        .filter((e) => !isNaN(e.date.getTime()) && e.date.getTime() > Date.now() - 3600_000)
        .slice(0, 5)
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
  type InvRow = { name: string; qty: string; min: string; level: 'ok' | 'low' | 'crit' };
  let inventory = $state<InvRow[]>([
    { name: 'Coffee beans', qty: '180g', min: '500g', level: 'low' },
    { name: 'Milk', qty: '0.2L', min: '1L', level: 'crit' },
    { name: 'Eggs', qty: '4', min: '12', level: 'low' },
    { name: 'Dishwasher tabs', qty: '18', min: '10', level: 'ok' },
    { name: 'Bin liners', qty: '22', min: '20', level: 'ok' },
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
          qty: `${r.qty}${r.unit ? `${r.unit}` : ''}`.trim(),
          min: `${r.min}${r.unit ? `${r.unit}` : ''}`.trim(),
          level,
        };
      });
    } catch {
      /* ignore */
    }
  }

  // ---------- mirror-pc host stats ----------
  type HostStat = { name: string; ip: string; cpu: number; ram: number; disk: number };
  let mirrorStats = $state<HostStat | null>(null);
  let statsTimer: ReturnType<typeof setInterval> | null = null;

  async function fetchMirrorStats(): Promise<void> {
    try {
      const r = await fetch('/api/admin/stats', { cache: 'no-store' });
      if (!r.ok) return;
      const j = (await r.json()) as { cpu?: number; ram?: number; disk?: number };
      const lan = (window as unknown as { __MIRROR_LAN_URL__?: string }).__MIRROR_LAN_URL__ ?? '';
      const ip = lan ? lan.replace(/^https?:\/\//, '').replace(/:\d+$/, '') : '—';
      mirrorStats = {
        name: 'mirror-pc',
        ip,
        cpu: j.cpu ?? 0,
        ram: j.ram ?? 0,
        disk: j.disk ?? 0,
      };
    } catch {
      /* ignore */
    }
  }

  // ---------- mount/destroy ----------
  onMount(() => {
    if (!browser) return;
    clockTimer = setInterval(() => (now = new Date()), 1000);

    watch(props.weatherEntity ?? 'weather.4340', 60_000, (e) => (weather = e));
    if (props.plexEntity) watch(props.plexEntity, 10_000, (e) => (plex = e));

    for (const eid of props.cameraEntities ?? []) {
      watch(eid, 10_000, (e) => ((cameras[eid] = e), (cameras[eid] = cameras[eid])));
    }

    void fetchCalendar();
    calendarTimer = setInterval(fetchCalendar, 5 * 60_000);
    void fetchGrocery();
    groceryTimer = setInterval(fetchGrocery, 30_000);
    void fetchMirrorStats();
    statsTimer = setInterval(fetchMirrorStats, 10_000);
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
  const weatherRange = $derived.by(() => {
    const f = (weather?.attributes as { forecast?: Array<Record<string, unknown>> } | undefined)
      ?.forecast;
    if (!Array.isArray(f) || !f.length) return '';
    const temps = f
      .slice(0, 8)
      .map((r) => (typeof r.temperature === 'number' ? r.temperature : null))
      .filter((x): x is number => x != null);
    const lows = f
      .slice(0, 8)
      .map((r) => (typeof r.templow === 'number' ? r.templow : null))
      .filter((x): x is number => x != null);
    if (!temps.length) return '';
    const high = Math.max(...temps);
    const low = lows.length ? Math.min(...lows) : Math.min(...temps);
    return `H ${Math.round(high)}° · L ${Math.round(low)}°`;
  });

  const services = $derived(props.services ?? DEFAULT_SERVICES);
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
          : 0,
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

  function camLabel(eid: string): string {
    return eid.replace(/^camera\./, '').replace(/_/g, ' ');
  }

  const demoHosts: HostStat[] = [
    { name: 'pve-node-a', ip: '10.0.0.11', cpu: 22, ram: 48, disk: 55 },
    { name: 'pve-node-b', ip: '10.0.0.12', cpu: 34, ram: 62, disk: 44 },
    { name: 'hass-vm', ip: '10.0.0.31', cpu: 8, ram: 41, disk: 28 },
    { name: 'nvr-box', ip: '10.0.0.22', cpu: 46, ram: 71, disk: 82 },
    { name: 'nas-01', ip: '10.0.0.21', cpu: 12, ram: 34, disk: 71 },
  ];
  const hosts = $derived.by(() => {
    const custom = props.hosts;
    if (custom) return custom;
    const out: HostStat[] = [];
    if (mirrorStats) out.push(mirrorStats);
    out.push(...demoHosts.slice(0, 6 - out.length));
    return out;
  });
</script>

<BaseTile {id} type="minimal" chromeless={true} label="minimal">
  <div class="mm" data-testid="minimal">
    <div class="mode-tag">Mode · {modeLabel}</div>

    <div class="grid">
      <!-- CLOCK -->
      <div class="tile clock">
        <div class="time">{hhmm}</div>
        <div class="date">{dateShort}</div>
        {#if props.locationLabel}<div class="loc">{props.locationLabel}</div>{/if}
      </div>

      <!-- WEATHER -->
      <div class="tile weather">
        <h4>Weather{props.cityLabel ? ` · ${props.cityLabel}` : ''}</h4>
        <div class="temp">{weatherTemp != null ? `${weatherTemp}°` : '—'}</div>
        <div class="cond">{weatherCond}</div>
        <div class="range">{weatherRange}</div>
      </div>

      <!-- MODE / STATUS -->
      <div class="tile mode">
        <h4>Today · status</h4>
        <div class="m">{modeLabel}</div>
        <div class="n">{upCount} up · {warnCount} warn · {downCount} down</div>
        <div class="next">{nextModeLine}</div>
      </div>

      <!-- UP NEXT -->
      <div class="tile cal">
        <h4>Up next</h4>
        <ul>
          {#if calendar.length === 0}
            <li><span class="t">—</span><span>nothing on the agenda</span></li>
          {:else}
            {#each calendar as r, i (i)}
              <li><span class="t">{r.when}</span><span>{r.summary}</span></li>
            {/each}
          {/if}
        </ul>
      </div>

      <!-- NOW PLAYING -->
      <div class="tile pod">
        <h4>Now playing</h4>
        {#if plexNow}
          <div class="title">{plexNow.title}</div>
          <div class="meta">{plexNow.meta || '—'}</div>
          <div class="bar"><span style:width={`${plexNow.pct}%`}></span></div>
        {:else}
          <div class="title">Idle</div>
          <div class="meta">no media playing</div>
          <div class="bar"><span style:width="0%"></span></div>
        {/if}
      </div>

      <!-- MEDIA HERO -->
      <div
        class="tile media"
        style:background-image={plexNow?.poster
          ? `url(${(window as any).__HA_URL__ ?? ''}${plexNow.poster})`
          : ''}
      >
        <div class="info">
          <div class="tag">Plex · {plexNow ? 'Now playing' : 'Queue'}</div>
          <div class="t">{plexNow?.title ?? 'Recently watched'}</div>
        </div>
      </div>

      <!-- SERVICES -->
      <div class="tile svc">
        <h4>Services</h4>
        <ul>
          {#each services as s (s.name)}
            <li>
              <span><span class="dot {s.state}"></span>{s.name}</span>
              <span>{s.note}</span>
            </li>
          {/each}
        </ul>
      </div>

      <!-- INVENTORY -->
      <div class="tile inv">
        <h4>Inventory · low</h4>
        <table>
          <thead>
            <tr><th>Item</th><th>Qty</th><th>Min</th></tr>
          </thead>
          <tbody>
            {#each inventory as r (r.name)}
              <tr>
                <td>{r.name}</td>
                <td class={r.level === 'ok' ? '' : r.level}>{r.qty}</td>
                <td>{r.min}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- FRIGATE STRIP -->
      <div class="tile frigate-strip">
        {#each props.cameraEntities ?? [] as eid (eid)}
          <div class="c">
            {#if camUrl(cameras[eid])}
              <img src={camUrl(cameras[eid])} alt={camLabel(eid)} referrerpolicy="no-referrer" />
            {/if}
            <div class="lab">{camLabel(eid)}</div>
          </div>
        {/each}
      </div>

      <!-- HOSTS -->
      <div class="tile hosts">
        {#each hosts as h (h.name)}
          <div class="host">
            <div class="n">{h.name}</div>
            <div class="meta">{h.ip}</div>
            <div class="metrics">
              <span>cpu {h.cpu}%</span><span>ram {h.ram}%</span><span>disk {h.disk}%</span>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
</BaseTile>

<style>
  .mm {
    --mm-bg: #000;
    --mm-fg: #fff;
    --mm-dim: #9a9a9a;
    --mm-dimmer: #555;
    --mm-warn: #ffb454;
    --mm-bad: #ff6b6b;
    --mm-ok: #8ee77b;
    --mm-line: #151515;
    background: var(--mm-bg);
    color: var(--mm-fg);
    font-family: 'Inter', system-ui, sans-serif;
    font-weight: 300;
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
  }

  :global(:root[data-mode='light']) .mm {
    --mm-bg: #f5f0e6;
    --mm-fg: #1c1a18;
    --mm-dim: #5b564e;
    --mm-dimmer: #8c857a;
    --mm-line: #d5cdbc;
  }

  .mode-tag {
    position: absolute;
    top: 1.4rem;
    right: 1.5rem;
    font-size: 0.6rem;
    letter-spacing: 0.32em;
    color: var(--mm-dimmer);
    text-transform: uppercase;
    z-index: 2;
  }

  .grid {
    width: 100%;
    height: 100%;
    padding: 2.6rem 3rem 3rem;
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    grid-template-rows: repeat(24, minmax(0, 1fr));
    gap: 1.2rem 1rem;
    box-sizing: border-box;
  }

  h4 {
    font-size: 0.55rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--mm-dimmer);
    font-weight: 500;
    margin-bottom: 0.55rem;
  }

  /* CLOCK */
  .clock {
    grid-column: 1 / span 8;
    grid-row: span 4;
    text-align: center;
    padding-bottom: 0.35rem;
  }
  .clock .time {
    font-size: 8rem;
    font-weight: 100;
    letter-spacing: -0.055em;
    line-height: 0.95;
  }
  .clock .date {
    font-size: 1rem;
    color: var(--mm-dim);
    font-weight: 300;
    margin-top: 0.45rem;
  }
  .clock .loc {
    font-size: 0.65rem;
    color: var(--mm-dimmer);
    letter-spacing: 0.3em;
    text-transform: uppercase;
    margin-top: 0.25rem;
  }

  /* WEATHER */
  .weather {
    grid-column: 1 / span 4;
    grid-row: span 3;
  }
  .weather .temp {
    font-size: 4.2rem;
    font-weight: 200;
    letter-spacing: -0.03em;
    line-height: 1;
  }
  .weather .cond {
    color: var(--mm-dim);
    font-size: 0.8rem;
    margin-top: 0.2rem;
    text-transform: capitalize;
  }
  .weather .range {
    color: var(--mm-dimmer);
    font-size: 0.7rem;
    margin-top: 0.3rem;
  }

  /* MODE / STATUS */
  .mode {
    grid-column: 5 / span 4;
    grid-row: span 3;
    text-align: right;
  }
  .mode .m {
    font-size: 2.2rem;
    font-weight: 200;
    letter-spacing: -0.02em;
    margin-top: 0.2rem;
  }
  .mode .n {
    color: var(--mm-dim);
    font-size: 0.75rem;
    margin-top: 0.2rem;
  }
  .mode .next {
    color: var(--mm-dimmer);
    font-size: 0.6rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    margin-top: 0.35rem;
  }

  /* CALENDAR */
  .cal {
    grid-column: 1 / span 4;
    grid-row: span 3;
  }
  .cal ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .cal li {
    display: flex;
    gap: 0.7rem;
    padding: 0.4rem 0;
    border-top: 1px solid var(--mm-line);
    font-size: 0.82rem;
  }
  .cal li:first-child {
    border-top: 0;
  }
  .cal .t {
    color: var(--mm-dim);
    width: 5rem;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  /* PODCAST */
  .pod {
    grid-column: 5 / span 4;
    grid-row: span 3;
  }
  .pod .title {
    font-size: 0.88rem;
    margin-bottom: 0.1rem;
  }
  .pod .meta {
    color: var(--mm-dim);
    font-size: 0.72rem;
    margin-bottom: 0.6rem;
  }
  .bar {
    height: 2px;
    background: var(--mm-line);
    border-radius: 2px;
    overflow: hidden;
  }
  .bar > span {
    display: block;
    height: 100%;
    background: var(--mm-fg);
  }

  /* MEDIA HERO */
  .media {
    grid-column: 1 / span 8;
    grid-row: span 5;
    aspect-ratio: 16 / 9;
    background-color: #0a0a0a;
    background-size: cover;
    background-position: center;
    position: relative;
    overflow: hidden;
  }
  .media::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, transparent 45%, rgba(0, 0, 0, 0.7));
  }
  .media .info {
    position: absolute;
    left: 1.4rem;
    bottom: 1.2rem;
    z-index: 2;
    color: #fff;
  }
  .media .info .tag {
    font-size: 0.6rem;
    letter-spacing: 0.3em;
    color: #bbb;
    text-transform: uppercase;
  }
  .media .info .t {
    font-size: 1.75rem;
    font-weight: 300;
    margin-top: 0.35rem;
  }

  /* SERVICES */
  .svc {
    grid-column: 1 / span 4;
    grid-row: span 3;
  }
  .svc ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .svc li {
    display: flex;
    justify-content: space-between;
    padding: 0.4rem 0;
    font-size: 0.78rem;
    border-top: 1px solid var(--mm-line);
  }
  .svc li:first-child {
    border-top: 0;
  }
  .dot {
    width: 0.35rem;
    height: 0.35rem;
    border-radius: 50%;
    display: inline-block;
    margin-right: 0.5rem;
  }
  .dot.ok {
    background: var(--mm-ok);
  }
  .dot.warn {
    background: var(--mm-warn);
  }
  .dot.bad {
    background: var(--mm-bad);
  }

  /* INVENTORY */
  .inv {
    grid-column: 5 / span 4;
    grid-row: span 3;
  }
  .inv table {
    width: 100%;
    font-size: 0.72rem;
    border-collapse: collapse;
  }
  .inv th,
  .inv td {
    text-align: left;
    padding: 0.35rem 0;
    border-top: 1px solid var(--mm-line);
    color: var(--mm-dim);
    font-weight: 400;
  }
  .inv th {
    color: var(--mm-dimmer);
    font-size: 0.55rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    border-top: 0;
  }
  .inv td:first-child {
    color: var(--mm-fg);
  }
  .inv .low {
    color: var(--mm-warn);
  }
  .inv .crit {
    color: var(--mm-bad);
  }

  /* FRIGATE STRIP */
  .frigate-strip {
    grid-column: 1 / span 8;
    grid-row: span 3;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
  }
  .frigate-strip .c {
    aspect-ratio: 4 / 3;
    background: #000;
    position: relative;
    overflow: hidden;
  }
  .frigate-strip .c img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .frigate-strip .c .lab {
    position: absolute;
    top: 0.3rem;
    left: 0.3rem;
    font-size: 0.5rem;
    color: var(--mm-dim);
    letter-spacing: 0.15em;
    text-transform: uppercase;
    background: rgba(0, 0, 0, 0.6);
    padding: 0.1rem 0.3rem;
  }

  /* HOSTS */
  .hosts {
    grid-column: 1 / span 8;
    grid-row: span 3;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1.2rem 1.4rem;
    padding-top: 1.2rem;
    border-top: 1px solid #111;
  }
  .host .n {
    font-size: 0.82rem;
  }
  .host .meta {
    color: var(--mm-dimmer);
    font-size: 0.55rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    margin-top: 0.15rem;
  }
  .host .metrics {
    display: flex;
    gap: 0.7rem;
    margin-top: 0.3rem;
    font-size: 0.62rem;
    color: var(--mm-dim);
  }
</style>
