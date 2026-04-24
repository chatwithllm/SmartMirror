<script lang="ts">
  /**
   * Homelab Observability Console — Direction 06 port.
   *
   * Aesthetic: NOC wall. Border-only panels, ISO timestamps,
   * tabular-num JetBrains Mono everywhere, unicode block sparklines,
   * muted desaturated accents (#7fc99a green / #d6b06a amber /
   * #d67070 red / #7ab8d4 info). No cards, no fills.
   *
   * Live entities:
   *   clock                     — local tick
   *   weather.outside           — weather.4340 attrs + 5-day forecast
   *   system.stats              — /api/admin/stats (cpu/ram/disk/uptime)
   *   svc.health                — demo
   *   sensors.zigbee            — demo (swap to real z2m entities later)
   *   frigate.nvr               — 5 Frigate cameras via access_token
   *   media.state.plex          — optional plexEntity
   *   media.state.immich        — demo
   *   grocy.inventory           — /api/admin/grocery/{shopping-list,inventory}
   *   calendar.agenda           — HA calendar next 3
   *   news ticker               — demo
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
      cameras?: string[];
      hostLabel?: string;
      locationLabel?: string;
    };
  }
  let { id, props = {} }: Props = $props();
  const CAM_LIST = props.cameras ?? [];

  // ---------- clock ----------
  let now = $state(new Date());
  let clockTimer: ReturnType<typeof setInterval> | null = null;
  function pad(n: number): string {
    return String(n).padStart(2, '0');
  }
  const hh = $derived(pad(now.getHours()));
  const mm = $derived(pad(now.getMinutes()));
  const ss = $derived(pad(now.getSeconds()));
  const isoUtc = $derived.by(() => {
    const d = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 19) + 'Z';
  });
  const dateLine = $derived(
    now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
  );

  // ---------- HA entities ----------
  let weather = $state<HaEntity | null>(null);
  let plex = $state<HaEntity | null>(null);
  const cams = $state<Record<string, HaEntity | null>>({});
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
  type CalRow = { start: Date; summary: string; location?: string };
  let calendar = $state<CalRow[]>([]);
  let calTimer: ReturnType<typeof setInterval> | null = null;
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
        location?: string;
      }>;
      calendar = arr
        .map((e) => ({
          start: new Date(e.start?.dateTime ?? e.start?.date ?? ''),
          summary: e.summary ?? '',
          location: (e.location ?? '').trim() || undefined,
        }))
        .filter((e) => !isNaN(e.start.getTime()) && e.start.getTime() > Date.now())
        .sort((a, b) => a.start.getTime() - b.start.getTime())
        .slice(0, 3);
    } catch {
      /* ignore */
    }
  }

  // ---------- grocery ----------
  type ShopRow = { name: string; qty: string; done: boolean; category: string };
  type PantryRow = { name: string; pct: number; band: 'ok' | 'low' | 'crit' };
  let shopping = $state<ShopRow[]>([]);
  let pantry = $state<PantryRow[]>([]);
  let shopCount = $state(0);
  let shopTimer: ReturnType<typeof setInterval> | null = null;
  async function fetchGrocery(): Promise<void> {
    try {
      const invR = await fetch('/api/admin/grocery/inventory', { cache: 'no-store' });
      if (invR.ok) {
        const j = (await invR.json()) as { configured?: boolean; data?: unknown };
        if (j.configured) {
          const rows = normalizeInventory(j.data);
          pantry = rows.slice(0, 8).map((r) => {
            const pctRaw = r.min > 0 ? Math.min(100, (r.qty / (r.min * 2)) * 100) : 72;
            const pct = Math.round(pctRaw);
            const band: 'ok' | 'low' | 'crit' =
              r.qty < r.min ? (r.qty / Math.max(r.min, 1) <= 0.25 ? 'crit' : 'low') : 'ok';
            return { name: r.name.toLowerCase().slice(0, 12), pct, band };
          });
        }
      }
      const shopR = await fetch('/api/admin/grocery/shopping-list', { cache: 'no-store' });
      if (shopR.ok) {
        const j = (await shopR.json()) as {
          configured?: boolean;
          data?: { items?: Array<Record<string, unknown>>; open_count?: number };
        };
        if (j.configured && j.data?.items) {
          shopCount = j.data.open_count ?? j.data.items.length;
          shopping = j.data.items.slice(0, 14).map((it) => ({
            name:
              ((it.name as string | undefined) ??
                (it.product_display_name as string | undefined) ??
                '—'),
            qty: `${it.quantity ?? ''}${(it.unit as string | undefined) && it.unit !== 'each' ? ' ' + it.unit : ''}`.trim(),
            done: (it.status as string | undefined) !== 'open',
            category: ((it.category as string | undefined) ?? '').toLowerCase() || '—',
          }));
        }
      }
    } catch {
      /* ignore */
    }
  }

  // ---------- host stats ----------
  type Stats = { cpu: number; ram: number; disk: number; uptimeSec: number };
  let stats = $state<Stats | null>(null);
  let statsTimer: ReturnType<typeof setInterval> | null = null;
  async function fetchStats(): Promise<void> {
    try {
      const r = await fetch('/api/admin/stats', { cache: 'no-store' });
      if (!r.ok) return;
      const j = (await r.json()) as {
        cpu?: number;
        ram?: number;
        disk?: number;
        uptime_seconds?: number;
      };
      stats = {
        cpu: j.cpu ?? 0,
        ram: j.ram ?? 0,
        disk: j.disk ?? 0,
        uptimeSec: j.uptime_seconds ?? 0,
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
    for (const eid of CAM_LIST) {
      watch(eid, 10_000, (e) => {
        cams[eid] = e;
      });
    }
    void fetchCalendar();
    calTimer = setInterval(fetchCalendar, 5 * 60_000);
    void fetchGrocery();
    shopTimer = setInterval(fetchGrocery, 30_000);
    void fetchStats();
    statsTimer = setInterval(fetchStats, 10_000);
  });
  onDestroy(() => {
    if (clockTimer) clearInterval(clockTimer);
    if (calTimer) clearInterval(calTimer);
    if (shopTimer) clearInterval(shopTimer);
    if (statsTimer) clearInterval(statsTimer);
    for (const fn of stopFns) fn();
  });

  // ---------- derived ----------
  const wxAttr = $derived(
    (weather?.attributes ?? {}) as {
      temperature?: number;
      apparent_temperature?: number;
      humidity?: number;
      wind_speed?: number;
      wind_bearing?: number;
      dew_point?: number;
      pressure?: number;
      uv_index?: number;
      visibility?: number;
      forecast?: Array<{
        datetime?: string;
        temperature?: number;
        templow?: number;
        condition?: string;
      }>;
    },
  );
  function num(v: unknown, digits = 1): string {
    return typeof v === 'number' ? v.toFixed(digits) : '—';
  }
  function intOr(v: unknown): string {
    return typeof v === 'number' ? String(Math.round(v)) : '—';
  }
  const wxTemp = $derived(num(wxAttr.temperature));
  const wxFeels = $derived(num(wxAttr.apparent_temperature));
  const wxHum = $derived(intOr(wxAttr.humidity));
  const wxWind = $derived(num(wxAttr.wind_speed));
  const wxDew = $derived(num(wxAttr.dew_point));
  const wxPress = $derived(num(wxAttr.pressure, 2));
  const wxUV = $derived(num(wxAttr.uv_index));
  const wxVis = $derived(num(wxAttr.visibility));
  const wxCond = $derived(String(weather?.state ?? '—').toUpperCase());
  function windDir(b?: number): string {
    if (b == null) return '';
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(((b % 360) / 45)) % 8];
  }
  const wxDir = $derived(windDir(wxAttr.wind_bearing));

  const forecast = $derived.by(() => {
    const f = wxAttr.forecast;
    if (!Array.isArray(f)) return [] as Array<{ dow: string; hi: number; lo: number; cond: string }>;
    const byDay = new Map<string, { hi: number; lo: number; cond: string }>();
    for (const row of f) {
      const dt = row.datetime;
      if (!dt) continue;
      const d = new Date(dt);
      const key = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
      const t = typeof row.temperature === 'number' ? row.temperature : null;
      const l = typeof row.templow === 'number' ? row.templow : t;
      if (t == null) continue;
      const cur = byDay.get(key);
      if (!cur) byDay.set(key, { hi: t, lo: l ?? t, cond: condCode(row.condition ?? '') });
      else {
        if (t > cur.hi) cur.hi = t;
        if ((l ?? t) < cur.lo) cur.lo = l ?? t;
      }
    }
    return Array.from(byDay.entries())
      .slice(0, 5)
      .map(([dow, v]) => ({ dow, hi: Math.round(v.hi), lo: Math.round(v.lo), cond: v.cond }));
  });
  function condCode(c: string): string {
    const s = c.toLowerCase();
    if (s.includes('clear') || s.includes('sunny')) return 'CLR';
    if (s.includes('partly')) return 'FEW';
    if (s.includes('cloud')) return 'OVC';
    if (s.includes('rain')) return 'RAIN';
    if (s.includes('snow')) return 'SNOW';
    if (s.includes('storm') || s.includes('thunder')) return 'TSTM';
    if (s.includes('fog')) return 'FOG';
    return c ? c.toUpperCase().slice(0, 4) : '—';
  }

  function uptimeLabel(sec: number): string {
    if (!sec) return '—';
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${d}d ${pad(h)}h ${pad(m)}m`;
  }

  function camUrl(eid: string): string {
    const e = cams[eid];
    if (!browser || !e) return '';
    const base = (window as unknown as { __HA_URL__?: string }).__HA_URL__;
    if (!base) return '';
    const tok = (e.attributes as { access_token?: string } | undefined)?.access_token;
    if (tok) return `${base}/api/camera_proxy_stream/${encodeURIComponent(e.entity_id)}?token=${tok}`;
    const ep = (e.attributes as { entity_picture?: string } | undefined)?.entity_picture;
    return ep ? `${base}${ep}` : '';
  }
  function camShortLabel(eid: string): string {
    return eid.replace(/^camera\./, '').replace(/_/g, ' ').slice(0, 12);
  }

  const plexNow = $derived.by(() => {
    if (!plex || ['idle', 'off', 'unavailable'].includes(plex.state)) return null;
    const a = plex.attributes as {
      media_title?: string;
      media_artist?: string;
      media_duration?: number;
      media_position?: number;
    };
    const pct =
      a.media_position != null && a.media_duration
        ? Math.min(100, (a.media_position / a.media_duration) * 100)
        : 0;
    const rem =
      a.media_duration != null && a.media_position != null
        ? Math.max(0, a.media_duration - a.media_position)
        : 0;
    return {
      title: a.media_title ?? 'Now playing',
      sub: a.media_artist ?? '',
      pct: Math.round(pct),
      pos: secToClock(a.media_position ?? 0),
      rem: `-${secToClock(rem)}`,
    };
  });
  function secToClock(sec: number): string {
    const s = Math.round(sec);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
  }

  function relTime(d: Date): string {
    const ms = d.getTime() - now.getTime();
    if (ms < 0) return 'now';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `in ${h}h ${pad(m)}m` : `in ${m}m`;
  }

  function fmtCalTime(d: Date): string {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // ---------- demo data ----------
  const SERVICES = [
    { nm: 'svc.home_assistant', state: 'ok', up: '47d' },
    { nm: 'svc.grocy', state: 'ok', up: '12d' },
    { nm: 'svc.plex', state: 'ok', up: '47d' },
    { nm: 'svc.immich', state: 'ok', up: '47d' },
    { nm: 'svc.frigate', state: 'warn', up: '3h slow' },
    { nm: 'svc.zigbee2mqtt', state: 'ok', up: '47d' },
    { nm: 'svc.mosquitto', state: 'ok', up: '47d' },
    { nm: 'svc.nginx', state: 'ok', up: '128d' },
    { nm: 'svc.pihole', state: 'ok', up: '47d' },
  ];

  const ZIG_SENSORS = [
    { k: 'kitchen.temp', v: '72.4', u: '°F', sp: '▃▄▄▄▃▃▂▂', state: false },
    { k: 'bedroom.temp', v: '68.1', u: '°F', sp: '▂▃▃▃▂▂▂▁', state: false },
    { k: 'garage.temp', v: '55.2', u: '°F', sp: '▅▆▆▅▅▄▄▄', state: false },
    { k: 'basement.hum', v: '58', u: '%', sp: '▄▄▄▄▄▅▄▄', state: false },
    { k: 'front.door', v: 'closed', sp: 'last 4h 12m', state: true, band: 'ok' },
    { k: 'back.door', v: 'closed', sp: 'last 18h 02m', state: true, band: 'ok' },
    { k: 'hall.motion', v: 'quiet', sp: 'last 37m', state: true, band: 'ok' },
    { k: 'garage.door', v: 'open', sp: 'last 2m 14s', state: true, band: 'warn' },
  ];

  const FRIGATE_EVENTS = [
    { t: '22:17:34', msg: 'person detected at front_door · 4.2s · acked', src: 'cam.01' },
    { t: '22:11:08', msg: 'car arriving at driveway · 8.8s', src: 'cam.02' },
    { t: '21:54:22', msg: 'motion at side_yard · 2.1s', src: 'cam.04' },
    { t: '21:48:51', msg: 'cam.05 signal lost · reboot issued', src: 'nvr' },
  ];

  const NEWS = [
    { src: 'REUTERS', text: 'Fed holds rates at 4.25–4.50% citing sticky services inflation' },
    { src: 'AP', text: 'NOAA confirms tenth-warmest Indianapolis April on record' },
    { src: 'HN', text: 'Home Assistant 2026.4 ships first-class Matter 1.3 support' },
  ];
  const TICKER = [...NEWS, ...NEWS];

  // Sparkline hints (static demo until we log real history)
  const SP_CPU = '▁▂▃▂▃▅▇█▆▄▃▂';
  const SP_RAM = '▃▃▄▄▅▅▅▆▅▅▅▅';
  const SP_DISK = '████████▁▁▁▁';

  // Static expiring warnings (demo)
  const EXPIRING = [
    { name: '! greek_yog', date: '2026-04-26', rel: 'in 36h', band: 'warn' },
    { name: '!! cilantro', date: '2026-04-25', rel: 'in 14h', band: 'err' },
  ];
</script>

<BaseTile {id} type="console" chromeless={true} label="console">
  <div class="con" data-testid="console">
    <div class="top-bar">
      <span><span class="dot">●</span> {isoUtc}</span>
      <span></span>
      <span>
        <span class="host">{props.hostLabel ?? 'mirror.lan'}</span>
        {#if stats}· up {uptimeLabel(stats.uptimeSec)}{/if}
      </span>
    </div>

    <!-- HERO CLOCK -->
    <div class="hero">
      <div class="hero-clock">
        {hh}<span class="colon">:</span>{mm}<span class="sec">:{ss}</span>
      </div>
      <div class="hero-meta">
        <span class="label">date</span>
        <span class="v">{dateLine}</span>
        <span class="label">loc</span>
        <span class="v">{props.locationLabel ?? ''}</span>
        <span class="label">temp · now</span>
        <span class="v">{wxTemp}°F · {wxCond}</span>
      </div>
    </div>

    <!-- WEATHER -->
    <div class="h">weather.outside <span class="count">src=ha:{props.weatherEntity ?? 'weather'} · poll=60s</span></div>
    <div class="p">
      <div class="pt"><span>sensor.outdoor</span><span class="ts">ts={isoUtc}</span></div>
      <div class="two" style="gap: 2rem;">
        <div>
          <div class="m"><span class="k">temp</span><span class="sp info">▃▄▅▇▆▅▄▄▃▃▂▂</span><span class="v">{wxTemp}<span class="u">°F</span></span></div>
          <div class="m"><span class="k">feels</span><span class="sp">▃▃▄▆▅▄▃▃▂▂▁▁</span><span class="v">{wxFeels}<span class="u">°F</span></span></div>
          <div class="m"><span class="k">humid</span><span class="sp">▄▄▅▆▆▆▇▇▆▆▅▅</span><span class="v">{wxHum}<span class="u">%</span></span></div>
          <div class="m"><span class="k">wind</span><span class="sp">▁▂▂▃▃▂▂▁▁▁▂▂</span><span class="v">{wxWind}<span class="u">mph {wxDir}</span></span></div>
          <div class="m"><span class="k">press</span><span class="sp">▄▄▄▅▅▅▅▄▄▄▃▃</span><span class="v">{wxPress}<span class="u">inHg</span></span></div>
        </div>
        <div>
          <div class="m"><span class="k">uv</span><span class="sp warn">▁▂▄▆▇▇▇▆▄▂▁▁</span><span class="v">{wxUV}<span class="u">idx</span></span></div>
          <div class="m"><span class="k">dewpt</span><span class="sp">▃▄▄▄▅▅▅▅▄▄▄▃</span><span class="v">{wxDew}<span class="u">°F</span></span></div>
          <div class="m"><span class="k">sky</span><span class="sp"></span><span class="v">{wxCond}</span></div>
          <div class="m"><span class="k">vis</span><span class="sp"></span><span class="v">{wxVis}<span class="u">mi</span></span></div>
        </div>
      </div>
      <div class="fc">
        {#each forecast as d (d.dow)}
          <div class="d">
            <div class="dow">{d.dow}</div>
            <div class="hi">{d.hi}</div>
            <div class="lo">{d.lo}</div>
            <div class="ic">{d.cond}</div>
          </div>
        {/each}
      </div>
    </div>

    <!-- SYSTEM -->
    <div class="h">system.stats <span class="count">host={props.hostLabel ?? 'mirror.lan'}</span></div>
    <div class="p">
      <div class="pt"><span>node_exporter</span><span class="ts">poll=10s</span></div>
      <div class="two" style="gap: 2rem;">
        <div>
          <div class="m"><span class="k">cpu</span><span class="sp info">{SP_CPU}</span><span class="v">{stats?.cpu ?? '—'}<span class="u">%</span></span></div>
          <div class="m"><span class="k">ram</span><span class="sp">{SP_RAM}</span><span class="v">{stats?.ram ?? '—'}<span class="u">%</span></span></div>
          <div class="m"><span class="k">disk</span><span class="sp">{SP_DISK}</span><span class="v">{stats?.disk ?? '—'}<span class="u">%</span></span></div>
          <div class="m"><span class="k">uptime</span><span class="sp"></span><span class="v">{stats ? uptimeLabel(stats.uptimeSec) : '—'}</span></div>
        </div>
        <div>
          <div class="m"><span class="k">net↓</span><span class="sp info">▁▂▃▇▅▃▂▁▁▂▃▂</span><span class="v">14.2<span class="u">Mi/s</span></span></div>
          <div class="m"><span class="k">net↑</span><span class="sp">▁▁▂▃▂▁▁▁▁▁▂▁</span><span class="v">2.1<span class="u">Mi/s</span></span></div>
          <div class="m"><span class="k">procs</span><span class="sp">▄▄▄▄▅▅▅▄▄▄▄▄</span><span class="v">284</span></div>
          <div class="m"><span class="k">load</span><span class="sp"></span><span class="v">0.28 0.31 0.29</span></div>
        </div>
      </div>
    </div>

    <!-- SERVICES -->
    <div class="h">svc.health <span class="count">{SERVICES.length} services · {SERVICES.filter((s) => s.state === 'bad').length} down · {SERVICES.filter((s) => s.state === 'warn').length} degraded</span></div>
    <div class="p">
      <div class="pt"><span>prometheus.targets</span><span class="ts">interval=30s</span></div>
      <div class="svc-list">
        {#each SERVICES as s (s.nm)}
          <div class="svc {s.state === 'warn' ? 'warn' : s.state === 'bad' ? 'err' : ''}">
            <span class="led"></span>
            <span class="n">{s.nm}</span>
            <span class="u">{s.up}</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- SENSORS -->
    <div class="h">sensors.zigbee <span class="count">{ZIG_SENSORS.length} devices · mesh healthy</span></div>
    <div class="p">
      <div class="pt"><span>zigbee2mqtt.bridge</span><span class="ts">poll=60s · demo</span></div>
      <div class="sensors">
        {#each ZIG_SENSORS as z, i (i)}
          <div class="sens" class:state={z.state} class:warn={z.band === 'warn'} class:err={z.band === 'err'}>
            <div class="k">{z.k}</div>
            <div class="v">{z.v}{#if z.u && !z.state}<span class="u">{z.u}</span>{/if}</div>
            <div class="sp">{z.sp}</div>
          </div>
        {/each}
      </div>
    </div>

    <!-- FRIGATE -->
    <div class="h">frigate.nvr <span class="count">{CAM_LIST.length} channels · h264</span></div>
    <div class="p">
      <div class="pt"><span>nvr.local</span><span class="ts">va-api</span></div>
      <div class="cams">
        {#each CAM_LIST.slice(0, 6) as eid, i (eid)}
          <div class="cam" class:offline={!camUrl(eid)}>
            {#if camUrl(eid)}
              <img src={camUrl(eid)} alt="" referrerpolicy="no-referrer" />
            {/if}
            <span class="lbl">CAM.{pad(i + 1)} {camShortLabel(eid)}</span>
            <span class="rec">REC</span>
            <span class="ts">{hh}:{mm}:{ss}</span>
          </div>
        {/each}
      </div>
      <div class="evt-list">
        {#each FRIGATE_EVENTS as e, i (i)}
          <div class="evt">
            <span class="t">{e.t}</span>
            <span class="msg">{e.msg}</span>
            <span class="src">{e.src}</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- MEDIA -->
    <div class="h">media.state <span class="count">{plexNow ? '1 playing' : '0 playing'} · 1 slideshow</span></div>
    <div class="two">
      <div class="p">
        <div class="pt"><span>plex.now_playing</span><span class="ts">{plexNow ? 'active' : 'idle'}</span></div>
        <div class="plex">
          <div class="art"></div>
          <div class="info">
            <div class="t">{plexNow?.title ?? 'idle'}</div>
            <div class="s">{plexNow?.sub ?? 'no media'}</div>
            <div class="bar"><div class="fill" style:width={`${plexNow?.pct ?? 0}%`}></div></div>
            <div class="times">
              <span>{plexNow?.pos ?? '--:--'}</span>
              <span>{plexNow?.rem ?? '--:--'}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="p">
        <div class="pt"><span>immich.slideshow</span><span class="ts">unwired</span></div>
        <div class="immich">
          <span class="meta">DEMO · NO ASSET</span>
        </div>
      </div>
    </div>

    <!-- GROCY -->
    <div class="h">grocy.inventory <span class="count">{shopCount} to buy · {pantry.filter((p) => p.band !== 'ok').length} low</span></div>
    <div class="two">
      <div class="p">
        <div class="pt"><span>list.shopping</span><span class="ts">poll=30s</span></div>
        {#if shopping.length === 0}
          <div class="shop"><span class="n">— nothing on the list —</span></div>
        {:else}
          {#each shopping as it, i (i)}
            <div class="shop" class:done={it.done}>
              <span>
                <span class="box"></span>
                <span class="n">{it.name}</span>
              </span>
              <span class="q">{it.qty}</span>
              <span class="cat">{it.category}</span>
            </div>
          {/each}
        {/if}
      </div>
      <div>
        <div class="p" style="margin-bottom: 1rem;">
          <div class="pt"><span>pantry.stock</span><span class="ts">poll=30s</span></div>
          <div class="pantry">
            {#if pantry.length === 0}
              <div class="pant"><span class="k">—</span><span class="bar"></span><span class="pct">—</span></div>
            {:else}
              {#each pantry as p (p.name)}
                <div class="pant">
                  <span class="k">{p.name}</span>
                  <span class="bar"><span class="f {p.band}" style:width={`${p.pct}%`}></span></span>
                  <span class="pct">{p.pct}%</span>
                </div>
              {/each}
            {/if}
          </div>
        </div>
        <div class="p">
          <div class="pt"><span>expiring.soon</span><span class="ts">window=72h · demo</span></div>
          {#each EXPIRING as e (e.name)}
            <div class="m">
              <span class="k {e.band}">{e.name}</span>
              <span class="sp">exp {e.date}</span>
              <span class="v {e.band}">{e.rel}</span>
            </div>
          {/each}
        </div>
      </div>
    </div>

    <!-- CALENDAR -->
    <div class="h">calendar.agenda <span class="count">src=google · next={calendar.length}</span></div>
    <div class="p">
      <div class="pt"><span>events.upcoming</span><span class="ts">poll=5m</span></div>
      {#if calendar.length === 0}
        <div class="cal-row"><span class="tm">—</span><span class="nm">no upcoming events</span><span class="rel"></span></div>
      {:else}
        {#each calendar as ev (ev.start.toISOString())}
          <div class="cal-row">
            <span class="tm">{fmtCalTime(ev.start)}</span>
            <span class="nm">
              {ev.summary}
              {#if ev.location}<span class="loc">{ev.location}</span>{/if}
            </span>
            <span class="rel">{relTime(ev.start)}</span>
          </div>
        {/each}
      {/if}
    </div>

    <!-- NEWS TICKER -->
    <div class="news">
      <div class="news-track">
        {#each TICKER as n, i (i)}
          <span><span class="src">{n.src}</span>{n.text}<span class="sep">│</span></span>
        {/each}
      </div>
    </div>

    <div class="boot">
      [<span class="ok">ok</span>] mirror-frontend running · svc=mirror-frontend · v1.0.0-homelab
    </div>
  </div>
</BaseTile>

<style>
  .con {
    --fg-hero: #ffffff;
    --fg-pri: #e6e6e6;
    --fg-sec: #9a9a9a;
    --fg-dim: #5a5a5a;
    --fg-deep: #2a2a2a;
    --ok: #7fc99a;
    --warn: #d6b06a;
    --err: #d67070;
    --info: #7ab8d4;
    background: #000;
    color: var(--fg-pri);
    font-family: 'JetBrains Mono', ui-monospace, 'Menlo', monospace;
    font-variant-numeric: tabular-nums;
    font-feature-settings: 'tnum', 'zero';
    font-size: 0.82rem;
    line-height: 1.4;
    width: 100%;
    height: 100%;
    overflow-y: auto;
    padding: 1.4rem 1.5rem 2rem;
    box-sizing: border-box;
  }

  :global(:root[data-mode='light']) .con {
    background: #f5f0e6;
    color: #2a2a2a;
    --fg-hero: #000000;
    --fg-pri: #2a2a2a;
    --fg-sec: #6a6a6a;
    --fg-dim: #a8a8a8;
    --fg-deep: #d6d6d6;
  }

  .top-bar {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 1.5rem;
    font-size: 0.72rem;
    color: var(--fg-sec);
    letter-spacing: 0.02em;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--fg-deep);
  }
  .top-bar .host {
    color: var(--fg-pri);
  }
  .top-bar .dot {
    color: var(--ok);
  }

  /* Hero clock */
  .hero {
    padding: 1.4rem 0 1rem;
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: end;
    gap: 1.6rem;
    border-bottom: 1px solid var(--fg-deep);
  }
  .hero-clock {
    font-weight: 300;
    font-size: 7rem;
    color: var(--fg-hero);
    letter-spacing: -0.04em;
    line-height: 0.95;
  }
  .hero-clock .colon {
    animation: blink 1s step-end infinite;
  }
  .hero-clock .sec {
    color: var(--fg-sec);
  }
  @keyframes blink {
    50% { opacity: 0.35; }
  }
  .hero-meta {
    text-align: right;
    font-size: 0.85rem;
    color: var(--fg-pri);
    padding-bottom: 0.6rem;
  }
  .hero-meta .label {
    color: var(--fg-sec);
    font-size: 0.55rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    margin-top: 0.65rem;
    display: block;
  }
  .hero-meta .label:first-child {
    margin-top: 0;
  }
  .hero-meta .v {
    font-weight: 500;
  }

  /* Section heading */
  .h {
    font-size: 0.55rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--fg-sec);
    padding: 0.9rem 0 0.45rem;
    display: flex;
    align-items: baseline;
    gap: 0.55rem;
  }
  .h .count {
    color: var(--fg-dim);
    font-size: 0.5rem;
  }
  .h::before {
    content: '';
    flex: 0 0 auto;
    width: 0.5rem;
    height: 1px;
    background: var(--fg-sec);
    margin-right: -0.2rem;
  }

  /* Panel */
  .p {
    border: 1px solid var(--fg-dim);
    padding: 0.75rem 0.85rem 0.85rem;
    position: relative;
  }
  .p .pt {
    font-size: 0.5rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--fg-sec);
    margin-bottom: 0.55rem;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .p .pt .ts {
    color: var(--fg-dim);
    font-size: 0.45rem;
    letter-spacing: 0.08em;
  }

  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.4rem;
  }

  /* Metric row */
  .m {
    display: grid;
    grid-template-columns: 3.3rem 1fr auto;
    gap: 0.5rem;
    align-items: baseline;
    padding: 0.15rem 0;
    font-size: 0.85rem;
  }
  .m .k {
    color: var(--fg-sec);
    font-size: 0.72rem;
    letter-spacing: 0.04em;
  }
  .m .v {
    color: var(--fg-pri);
    font-weight: 500;
    text-align: right;
  }
  .m .v.warn {
    color: var(--warn);
  }
  .m .v.err {
    color: var(--err);
  }
  .m .u {
    color: var(--fg-sec);
    font-size: 0.66rem;
    font-weight: 400;
  }
  .m .sp {
    color: var(--fg-pri);
    font-size: 0.75rem;
    letter-spacing: -0.02em;
    line-height: 1;
    overflow: hidden;
    white-space: nowrap;
    text-align: center;
  }
  .m .sp.ok { color: var(--ok); }
  .m .sp.warn { color: var(--warn); }
  .m .sp.info { color: var(--info); }
  .m .k.warn { color: var(--warn); }
  .m .k.err { color: var(--err); }

  /* Forecast */
  .fc {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.35rem;
    margin-top: 0.65rem;
    padding-top: 0.65rem;
    border-top: 1px solid var(--fg-deep);
  }
  .fc .d {
    text-align: center;
  }
  .fc .dow {
    font-size: 0.58rem;
    color: var(--fg-sec);
    letter-spacing: 0.12em;
  }
  .fc .hi {
    font-size: 1rem;
    color: var(--fg-pri);
    font-weight: 500;
    margin-top: 0.25rem;
  }
  .fc .lo {
    font-size: 0.68rem;
    color: var(--fg-sec);
  }
  .fc .ic {
    font-size: 0.55rem;
    color: var(--fg-dim);
    margin-top: 0.15rem;
    letter-spacing: 0.1em;
  }

  /* Services */
  .svc-list {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.35rem 1rem;
  }
  .svc {
    display: grid;
    grid-template-columns: 0.6rem 1fr auto;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0;
    border-bottom: 1px solid var(--fg-deep);
    font-size: 0.75rem;
  }
  .svc .led {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: var(--ok);
    box-shadow: 0 0 6px var(--ok);
  }
  .svc.warn .led {
    background: var(--warn);
    box-shadow: 0 0 6px var(--warn);
  }
  .svc.err .led {
    background: var(--err);
    box-shadow: 0 0 6px var(--err);
  }
  .svc .n {
    color: var(--fg-pri);
    font-size: 0.72rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .svc .u {
    color: var(--fg-sec);
    font-size: 0.6rem;
    text-align: right;
  }

  /* Sensors */
  .sensors {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.7rem 0.9rem;
  }
  .sens {
    border-top: 1px solid var(--fg-deep);
    padding-top: 0.4rem;
  }
  .sens .k {
    font-size: 0.55rem;
    color: var(--fg-sec);
    letter-spacing: 0.1em;
    text-transform: lowercase;
  }
  .sens .v {
    font-size: 1.1rem;
    color: var(--fg-pri);
    font-weight: 500;
    margin-top: 0.1rem;
  }
  .sens .v .u {
    font-size: 0.62rem;
    color: var(--fg-sec);
    font-weight: 400;
  }
  .sens .sp {
    font-size: 0.6rem;
    color: var(--fg-sec);
    letter-spacing: -0.02em;
    margin-top: 0.1rem;
  }
  .sens.state .v {
    font-size: 0.82rem;
    color: var(--ok);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .sens.state.warn .v {
    color: var(--warn);
  }
  .sens.state.err .v {
    color: var(--err);
  }

  /* Cams */
  .cams {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-auto-rows: 1fr;
    gap: 0.45rem;
  }
  .cam {
    aspect-ratio: 16/9;
    border: 2px solid var(--fg-dim);
    position: relative;
    overflow: hidden;
    background: #000;
  }
  .cam img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    filter: brightness(0.85) contrast(1.05);
  }
  .cam::before {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(0deg, transparent 0 3px, rgba(255, 255, 255, 0.02) 3px 4px);
    pointer-events: none;
  }
  .cam .lbl {
    position: absolute;
    top: 0.3rem;
    left: 0.4rem;
    font-size: 0.58rem;
    color: var(--fg-pri);
    letter-spacing: 0.1em;
    font-weight: 500;
    z-index: 2;
  }
  .cam .rec {
    position: absolute;
    top: 0.35rem;
    right: 0.4rem;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.5rem;
    color: var(--err);
    letter-spacing: 0.14em;
    z-index: 2;
  }
  .cam .rec::before {
    content: '';
    width: 0.35rem;
    height: 0.35rem;
    background: var(--err);
    border-radius: 50%;
    box-shadow: 0 0 6px var(--err);
  }
  .cam .ts {
    position: absolute;
    bottom: 0.3rem;
    right: 0.4rem;
    font-size: 0.58rem;
    color: var(--fg-pri);
    z-index: 2;
  }
  .cam.offline .lbl {
    color: var(--err);
  }
  .cam.offline::after {
    content: 'SIGNAL LOST';
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--err);
    font-size: 0.78rem;
    letter-spacing: 0.2em;
  }

  /* Event list */
  .evt-list {
    margin-top: 0.7rem;
    font-size: 0.7rem;
  }
  .evt {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 0.65rem;
    padding: 0.25rem 0;
    border-bottom: 1px solid var(--fg-deep);
    align-items: baseline;
  }
  .evt .t {
    color: var(--fg-sec);
    font-size: 0.62rem;
  }
  .evt .msg {
    color: var(--fg-pri);
  }
  .evt .src {
    color: var(--info);
    font-size: 0.62rem;
    letter-spacing: 0.08em;
  }

  /* Plex */
  .plex {
    display: grid;
    grid-template-columns: 3.5rem 1fr;
    gap: 0.7rem;
    align-items: center;
  }
  .plex .art {
    aspect-ratio: 2/3;
    border: 2px solid var(--fg-dim);
    position: relative;
  }
  .plex .art::after {
    content: '▶';
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--fg-dim);
    font-size: 1.1rem;
  }
  .plex .info .t {
    font-size: 0.95rem;
    color: var(--fg-pri);
    font-weight: 500;
    line-height: 1.15;
  }
  .plex .info .s {
    font-size: 0.65rem;
    color: var(--fg-sec);
    margin-top: 0.15rem;
    letter-spacing: 0.06em;
  }
  .plex .bar {
    height: 3px;
    background: var(--fg-deep);
    margin-top: 0.5rem;
    position: relative;
  }
  .plex .bar .fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 3px;
    background: var(--fg-pri);
  }
  .plex .times {
    display: flex;
    justify-content: space-between;
    font-size: 0.6rem;
    color: var(--fg-sec);
    margin-top: 0.3rem;
  }

  /* Immich */
  .immich {
    border: 2px solid var(--fg-dim);
    min-height: 6rem;
    position: relative;
    overflow: hidden;
  }
  .immich::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      linear-gradient(135deg, #1a1a1a 25%, transparent 25%, transparent 50%, #1a1a1a 50%, #1a1a1a 75%, transparent 75%);
    background-size: 18px 18px;
    opacity: 0.4;
  }
  .immich .meta {
    position: absolute;
    bottom: 0.5rem;
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.6rem;
    color: var(--fg-pri);
    letter-spacing: 0.16em;
    background: #000;
    padding: 0.1rem 0.5rem;
    z-index: 2;
  }

  /* Shopping list */
  .shop {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 0.55rem;
    align-items: baseline;
    padding: 0.25rem 0;
    border-bottom: 1px solid var(--fg-deep);
    font-size: 0.72rem;
  }
  .shop .box {
    display: inline-block;
    width: 0.7rem;
    height: 0.7rem;
    border: 1.5px solid var(--fg-pri);
    margin-right: 0.5rem;
    vertical-align: middle;
  }
  .shop.done .box::after {
    content: '✓';
    color: var(--ok);
    font-size: 0.65rem;
    display: block;
    line-height: 0.5rem;
    text-align: center;
    font-weight: 700;
    margin-top: -2px;
  }
  .shop.done .n {
    color: var(--fg-sec);
    text-decoration: line-through;
  }
  .shop .n {
    color: var(--fg-pri);
  }
  .shop .q {
    color: var(--fg-sec);
    font-size: 0.62rem;
  }
  .shop .cat {
    font-size: 0.45rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--fg-sec);
    border: 1px solid var(--fg-dim);
    padding: 0.1rem 0.35rem;
  }

  /* Pantry */
  .pantry {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem 1.1rem;
  }
  .pant {
    display: grid;
    grid-template-columns: 3.5rem 1fr auto;
    gap: 0.45rem;
    align-items: center;
    font-size: 0.65rem;
  }
  .pant .k {
    color: var(--fg-sec);
    font-size: 0.62rem;
  }
  .pant .bar {
    height: 4px;
    background: var(--fg-deep);
    position: relative;
  }
  .pant .bar .f {
    position: absolute;
    left: 0;
    top: 0;
    height: 4px;
    background: var(--fg-pri);
  }
  .pant .bar .f.low {
    background: var(--warn);
  }
  .pant .bar .f.crit {
    background: var(--err);
  }
  .pant .pct {
    color: var(--fg-pri);
    font-size: 0.6rem;
    min-width: 1.8rem;
    text-align: right;
  }

  /* Calendar */
  .cal-row {
    display: grid;
    grid-template-columns: 3rem 1fr auto;
    gap: 0.7rem;
    align-items: baseline;
    padding: 0.35rem 0;
    border-bottom: 1px solid var(--fg-deep);
    font-size: 0.78rem;
  }
  .cal-row .tm {
    color: var(--fg-pri);
    font-weight: 500;
  }
  .cal-row .nm {
    color: var(--fg-pri);
  }
  .cal-row .nm .loc {
    color: var(--fg-sec);
    font-size: 0.6rem;
    display: block;
    margin-top: 0.15rem;
  }
  .cal-row .rel {
    color: var(--info);
    font-size: 0.6rem;
    letter-spacing: 0.04em;
  }

  /* News */
  .news {
    margin-top: 1.4rem;
    border-top: 1px solid var(--fg-dim);
    border-bottom: 1px solid var(--fg-dim);
    padding: 0.5rem 0;
    overflow: hidden;
    position: relative;
  }
  .news-track {
    display: inline-flex;
    gap: 3.5rem;
    white-space: nowrap;
    animation: tick 60s linear infinite;
    font-size: 0.72rem;
    color: var(--fg-pri);
  }
  .news-track .src {
    color: var(--info);
    letter-spacing: 0.14em;
    font-size: 0.6rem;
    margin-right: 0.4rem;
  }
  .news-track .sep {
    color: var(--fg-dim);
    margin: 0 0.4rem;
  }
  @keyframes tick {
    0% { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }

  .boot {
    margin-top: 0.9rem;
    font-size: 0.55rem;
    color: var(--fg-dim);
    letter-spacing: 0.06em;
  }
  .boot .ok {
    color: var(--ok);
  }
</style>
