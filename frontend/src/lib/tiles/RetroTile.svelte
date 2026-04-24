<script lang="ts">
  /**
   * Retro hardware display — Nixie tubes, 7-seg LED, VFD, CRT teletype.
   * Full port of the attached mockup, wired to every live entity the
   * mirror has: weather.4340, calendar, grocery inventory + shopping
   * list, Frigate cameras, Plex media_player (optional), mirror PC
   * stats.
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
      locationLabel?: string;
    };
  }
  let { id, props = {} }: Props = $props();
  const CAM_LIST = props.cameras ?? [];

  // ---------- clock ----------
  let now = $state(new Date());
  let clockTimer: ReturnType<typeof setInterval> | null = null;
  function pad2(n: number): string {
    return String(n).padStart(2, '0');
  }
  const hh = $derived(pad2(now.getHours()));
  const mm = $derived(pad2(now.getMinutes()));
  const ss = $derived(pad2(now.getSeconds()));
  const dateLine = $derived(
    now
      .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
      .toUpperCase()
      .replace(/,/g, ''),
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
          summary: (e.summary ?? '').toUpperCase(),
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
  let shoppingList = $state<ShopRow[]>([]);
  let pantry = $state<PantryRow[]>([]);
  let shopTimer: ReturnType<typeof setInterval> | null = null;

  async function fetchGrocery(): Promise<void> {
    try {
      const invR = await fetch('/api/admin/grocery/inventory', { cache: 'no-store' });
      if (invR.ok) {
        const j = (await invR.json()) as { configured?: boolean; data?: unknown };
        if (j.configured) {
          const rows = normalizeInventory(j.data);
          // Pantry bars: top 8 rows by recency; low/crit bands from is_low synth.
          pantry = rows.slice(0, 8).map((r) => {
            const pctRaw = r.min > 0 ? Math.min(100, (r.qty / (r.min * 2)) * 100) : 72;
            const pct = Math.round(pctRaw);
            const band: 'ok' | 'low' | 'crit' =
              r.qty < r.min ? (r.qty / Math.max(r.min, 1) <= 0.25 ? 'crit' : 'low') : 'ok';
            return { name: r.name.toUpperCase().slice(0, 14), pct, band };
          });
        }
      }
      const shopR = await fetch('/api/admin/grocery/shopping-list', { cache: 'no-store' });
      if (shopR.ok) {
        const j = (await shopR.json()) as {
          configured?: boolean;
          data?: { items?: Array<Record<string, unknown>> };
        };
        if (j.configured && j.data?.items) {
          shoppingList = j.data.items.slice(0, 14).map((it) => {
            const name = ((it.name as string | undefined) ??
              (it.product_display_name as string | undefined) ??
              '—').toUpperCase();
            const qraw = it.quantity ?? '';
            const unit = (it.unit as string | undefined) && it.unit !== 'each' ? ` ${it.unit}` : '';
            const cat = ((it.category as string | undefined) ?? '').toUpperCase().slice(0, 5) || '—';
            return {
              name: name.slice(0, 18),
              qty: `${qraw}${unit}`.trim(),
              done: (it.status as string | undefined) !== 'open',
              category: cat,
            };
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  // ---------- host stats ----------
  let mirrorStats = $state<{ cpu: number; ram: number; disk: number; uptimeSec: number } | null>(null);
  let statsTimer: ReturnType<typeof setInterval> | null = null;
  async function fetchStats(): Promise<void> {
    try {
      const r = await fetch('/api/admin/stats', { cache: 'no-store' });
      if (!r.ok) return;
      const j = (await r.json()) as { cpu?: number; ram?: number; disk?: number; uptime_seconds?: number };
      mirrorStats = {
        cpu: j.cpu ?? 0,
        ram: j.ram ?? 0,
        disk: j.disk ?? 0,
        uptimeSec: j.uptime_seconds ?? 0,
      };
    } catch {
      /* ignore */
    }
  }

  // ---------- mount ----------
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
      ozone?: number;
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
  const wxTemp = $derived(typeof wxAttr.temperature === 'number' ? Math.round(wxAttr.temperature) : null);
  const wxFeels = $derived(
    typeof wxAttr.apparent_temperature === 'number' ? wxAttr.apparent_temperature.toFixed(1) : '—',
  );
  const wxHum = $derived(typeof wxAttr.humidity === 'number' ? Math.round(wxAttr.humidity) : null);
  const wxWind = $derived(typeof wxAttr.wind_speed === 'number' ? wxAttr.wind_speed.toFixed(1) : '—');
  const wxDew = $derived(typeof wxAttr.dew_point === 'number' ? wxAttr.dew_point.toFixed(1) : '—');
  const wxPress = $derived(typeof wxAttr.pressure === 'number' ? wxAttr.pressure.toFixed(2) : '—');
  const wxUV = $derived(typeof wxAttr.uv_index === 'number' ? wxAttr.uv_index.toFixed(1) : '—');
  const wxVis = $derived(typeof wxAttr.visibility === 'number' ? wxAttr.visibility.toFixed(1) : '—');
  const wxCondRaw = $derived(weather?.state ?? '—');
  const wxCond = $derived(String(wxCondRaw).toUpperCase());

  function windDir(bearing?: number): string {
    if (bearing == null) return '—';
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(((bearing % 360) / 45)) % 8];
  }
  const wxWindDir = $derived(windDir(wxAttr.wind_bearing));

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
    if (s.includes('fog') || s.includes('mist')) return 'FOG';
    return c ? c.toUpperCase().slice(0, 4) : '—';
  }

  function uptimeLabel(sec: number): string {
    if (!sec) return '—';
    const days = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    if (days >= 1) return `${days}D ${h}H`;
    const m = Math.floor((sec % 3600) / 60);
    return `${h}H ${m}M`;
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

  const plexNow = $derived.by(() => {
    if (!plex || ['idle', 'off', 'unavailable'].includes(plex.state)) return null;
    const a = plex.attributes as {
      media_title?: string;
      media_artist?: string;
      media_position?: number;
      media_duration?: number;
    };
    return {
      title: (a.media_title ?? 'NOW PLAYING').toUpperCase(),
      sub: (a.media_artist ?? '').toUpperCase(),
      pct:
        a.media_position != null && a.media_duration
          ? Math.round((a.media_position / a.media_duration) * 100)
          : 0,
    };
  });

  // ---------- demo data (no HA entity yet) ----------
  const SERVICES = [
    { nm: 'HOME_ASSIST', state: 'ok', up: 'UP 47D' },
    { nm: 'GROCY', state: 'ok', up: 'UP 12D' },
    { nm: 'PLEX', state: 'ok', up: 'UP 47D' },
    { nm: 'IMMICH', state: 'ok', up: 'UP 47D' },
    { nm: 'FRIGATE', state: 'warn', up: 'DEGR 3H' },
    { nm: 'Z2MQTT', state: 'ok', up: 'UP 47D' },
    { nm: 'MOSQUITTO', state: 'ok', up: 'UP 47D' },
    { nm: 'NGINX', state: 'ok', up: 'UP 128D' },
    { nm: 'PIHOLE', state: 'ok', up: 'UP 47D' },
  ];

  const NEWS_TICKER = [
    { src: 'REUTERS', text: 'FED HOLDS RATES AT 4.25–4.50% CITING STICKY SERVICES INFLATION' },
    { src: 'AP', text: 'NOAA CONFIRMS TENTH-WARMEST INDIANAPOLIS APRIL ON RECORD' },
    { src: 'HN', text: 'HOME ASSISTANT 2026.4 SHIPS FIRST-CLASS MATTER 1.3 SUPPORT' },
  ];
  // duplicate items for seamless loop
  const TICKER = [...NEWS_TICKER, ...NEWS_TICKER];

  function relTime(d: Date): string {
    const ms = d.getTime() - now.getTime();
    if (ms < 0) return 'NOW';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `T+${pad2(h)}H ${pad2(m)}M`;
  }

  function fmtCalTime(d: Date): string {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;900&family=Share+Tech+Mono&family=VT323&display=swap"
  />
</svelte:head>

<BaseTile {id} type="retro" chromeless={true} label="retro">
  <div class="retro" data-testid="retro">
    <!-- NIXIE CLOCK -->
    <div class="panel" data-lbl="U1 · TIME" data-ref="IN-14 × 6">
      <div class="nixie-row">
        <span class="tube"><span class="ghost">8</span><span class="glyph">{hh[0]}</span></span>
        <span class="tube"><span class="ghost">8</span><span class="glyph">{hh[1]}</span></span>
        <span class="colon-pair"><span class="dot"></span><span class="dot"></span></span>
        <span class="tube"><span class="ghost">8</span><span class="glyph">{mm[0]}</span></span>
        <span class="tube"><span class="ghost">8</span><span class="glyph">{mm[1]}</span></span>
        <span class="sec-group">
          <span class="colon-pair sm"><span class="dot sm"></span><span class="dot sm"></span></span>
          <span class="tube sm"><span class="ghost">8</span><span class="glyph">{ss[0]}</span></span>
          <span class="tube sm"><span class="ghost">8</span><span class="glyph">{ss[1]}</span></span>
        </span>
      </div>
      <div class="date-line">{dateLine}</div>
      <div class="loc-line">{props.locationLabel ?? ''}</div>
    </div>

    <!-- 7-SEG STATS ROW -->
    <div class="seg-row">
      <div class="seg-cell">
        <div class="lbl">OUT TEMP</div>
        <div class="val"><span class="ghost">888</span>{wxTemp ?? '—'}<span class="u">°F</span></div>
      </div>
      <div class="seg-cell">
        <div class="lbl">FEELS</div>
        <div class="val"><span class="ghost">888</span>{wxFeels}<span class="u">°F</span></div>
      </div>
      <div class="seg-cell">
        <div class="lbl">HUMID</div>
        <div class="val"><span class="ghost">888</span>{wxHum ?? '—'}<span class="u">%</span></div>
      </div>
      <div class="seg-cell">
        <div class="lbl">WIND</div>
        <div class="val"><span class="ghost">888</span>{wxWind}<span class="u">mph</span></div>
      </div>
    </div>

    <!-- WEATHER DETAIL + FORECAST -->
    <div class="panel" data-lbl="U2 · WEATHER" data-ref="HA · weather.4340">
      <div class="wx-rows">
        <div>
          <div class="vfd-row"><span class="k">SKY</span><span></span><span class="v">{wxCond}</span></div>
          <div class="vfd-row"><span class="k">DEWPT</span><span></span><span class="v">{wxDew}°F</span></div>
          <div class="vfd-row"><span class="k">PRESS</span><span></span><span class="v">{wxPress} inHg</span></div>
          <div class="vfd-row"><span class="k">UV</span><span></span><span class="v">{wxUV} idx</span></div>
        </div>
        <div>
          <div class="vfd-row"><span class="k">VIS</span><span></span><span class="v">{wxVis} mi</span></div>
          <div class="vfd-row"><span class="k">WIND</span><span></span><span class="v">{wxWind} {wxWindDir}</span></div>
          <div class="vfd-row"><span class="k">HUMID</span><span></span><span class="v">{wxHum ?? '—'} %</span></div>
          <div class="vfd-row"><span class="k">TEMP</span><span></span><span class="v">{wxTemp ?? '—'}°F</span></div>
        </div>
      </div>
      <div class="forecast">
        {#each forecast as d (d.dow)}
          <div class="fc-day">
            <div class="dow">{d.dow}</div>
            <div class="hi">{d.hi}</div>
            <div class="lo">{d.lo}</div>
            <div class="ic">{d.cond}</div>
          </div>
        {/each}
      </div>
    </div>

    <!-- SERVICES LED BANK -->
    <div class="panel" data-lbl="J1 · SERVICES" data-ref="{SERVICES.length} CH">
      <div class="led-bank">
        {#each SERVICES as s (s.nm)}
          <div class="led-row">
            <span class="led {s.state === 'warn' ? 'y' : s.state === 'bad' ? 'r' : ''}"></span>
            <span class="nm">{s.nm}</span>
            <span class="up">{s.up}</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- FRIGATE CAM WALL -->
    <div class="panel" data-lbl="U7 · NVR MONITORS" data-ref="{CAM_LIST.length}CH · H264">
      <div class="cams">
        {#each CAM_LIST.slice(0, 6) as eid, i (eid)}
          <div class="cam">
            {#if camUrl(eid)}
              <img src={camUrl(eid)} alt="" referrerpolicy="no-referrer" />
            {/if}
            <span class="lbl">CAM.{String(i + 1).padStart(2, '0')}</span>
            <span class="rec">REC</span>
            <span class="ts">{hh}:{mm}:{ss}</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- NOW PLAYING + IMMICH SLIDESHOW -->
    <div class="dual-row">
      <div class="panel" data-lbl="U5 · NOW PLAYING" data-ref={plexNow ? 'PLEX · LIVE' : 'PLEX · IDLE'}>
        <div class="plex-deck">
          <div class="plex-art"></div>
          <div class="plex-info">
            <div class="title">{plexNow?.title ?? 'IDLE'}</div>
            <div class="sub">{plexNow?.sub ?? 'NO MEDIA'}</div>
            <div class="prog-bar"><div class="fill" style:width={`${plexNow?.pct ?? 0}%`}></div></div>
          </div>
        </div>
      </div>
      <div class="panel" data-lbl="U6 · SLIDESHOW" data-ref="IMMICH">
        <div class="immich-slide">
          <span class="idx">—/—</span>
          <span class="meta">DEMO · UNWIRED</span>
        </div>
      </div>
    </div>

    <!-- CALENDAR -->
    <div class="panel" data-lbl="U3 · AGENDA" data-ref="GCAL · NEXT {calendar.length}">
      <div class="cal">
        {#if calendar.length === 0}
          <div class="cal-empty">— NO UPCOMING EVENTS —</div>
        {:else}
          {#each calendar as ev (ev.start.toISOString())}
            <div class="row">
              <span class="tm"><span class="ghost">88:88</span>{fmtCalTime(ev.start)}</span>
              <span class="ev">
                {ev.summary}
                {#if ev.location}<span class="loc">{ev.location.toUpperCase()}</span>{/if}
              </span>
              <span class="rel">{relTime(ev.start)}</span>
            </div>
          {/each}
        {/if}
      </div>
    </div>

    <!-- SHOPPING TELETYPE + PANTRY -->
    <div class="dual-row grow">
      <div class="panel" data-lbl="U8 · SHOPPING.OUT" data-ref="GROCY LLT">
        <div class="teletype">
          {#if shoppingList.length === 0}
            <div class="line"><span class="mk">&gt;</span><span class="nm">—</span><span class="q">—</span><span class="cat">—</span></div>
          {:else}
            {#each shoppingList as it, i (it.name + i)}
              <div class="line" class:done={it.done}>
                <span class="mk">&gt;</span>
                <span class="nm">{it.name}</span>
                <span class="q">{it.qty}</span>
                <span class="cat">{it.category}</span>
              </div>
            {/each}
          {/if}
        </div>
      </div>
      <div class="panel" data-lbl="U8 · PANTRY.STK" data-ref="% FULL">
        <div class="pantry-seg">
          {#if pantry.length === 0}
            <div class="pr"><span class="k">—</span><span class="bar"></span><span class="pct">—</span></div>
          {:else}
            {#each pantry as p (p.name)}
              <div class="pr">
                <span class="k">{p.name}</span>
                <span class="bar"><span class="f {p.band}" style:width={`${p.pct}%`}></span></span>
                <span class="pct">{p.pct}%</span>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </div>

    <!-- HOST STATS -->
    <div class="panel" data-lbl="U9 · HOST" data-ref={mirrorStats ? `UP ${uptimeLabel(mirrorStats.uptimeSec)}` : 'UNWIRED'}>
      <div class="sys-grid">
        <div class="sys-cell">
          <div class="k">CPU</div>
          <div class="v"><span class="ghost">888</span>{mirrorStats?.cpu ?? '—'}<span class="u">%</span></div>
        </div>
        <div class="sys-cell">
          <div class="k">RAM</div>
          <div class="v"><span class="ghost">888</span>{mirrorStats?.ram ?? '—'}<span class="u">%</span></div>
        </div>
        <div class="sys-cell">
          <div class="k">DISK</div>
          <div class="v"><span class="ghost">888</span>{mirrorStats?.disk ?? '—'}<span class="u">%</span></div>
        </div>
        <div class="sys-cell">
          <div class="k">UPTIME</div>
          <div class="v small">{mirrorStats ? uptimeLabel(mirrorStats.uptimeSec) : '—'}</div>
        </div>
      </div>
    </div>

    <!-- CRT NEWS TICKER -->
    <div class="crt-ticker">
      <span class="label">U10 · NEWS.CRT</span>
      <span class="ref">P1 PHOSPHOR · 1HZ</span>
      <div class="tick-scroll">
        <div class="tick-track">
          {#each TICKER as t, i (i)}
            <span><span class="src">{t.src}</span>{t.text}<span class="sep">◆</span></span>
          {/each}
        </div>
      </div>
    </div>

    <div class="power-line">● POWER  ● LINK  ● SYNC  ─  MIRROR V1.0.0-RETRO</div>
  </div>
</BaseTile>

<style>
  .retro {
    --r-nixie: #ff7b33;
    --r-amber: #ffb020;
    --r-amber-dim: #7a5410;
    --r-vfd: #6be5d4;
    --r-vfd-dim: #2f6b63;
    --r-crt: #5bff5b;
    --r-crt-dim: #2f7a2f;
    --r-led-r: #ff4040;
    --r-led-g: #4eff7e;
    --r-deep: #2a2a2a;
    --r-dim: #555555;

    background: #000;
    color: var(--r-vfd);
    font-family: 'VT323', ui-monospace, monospace;
    width: 100%;
    height: 100%;
    overflow-y: auto;
    padding: 1.2rem 1.4rem 1.8rem;
    box-sizing: border-box;
    font-size: 1rem;
  }
  :global(:root[data-mode='light']) .retro {
    background: #f5f0e6;
    color: #0a4a44;
  }

  /* Panels */
  .panel {
    border: 2px solid var(--r-deep);
    position: relative;
    padding: 1rem 0.9rem 0.8rem;
    margin-bottom: 1rem;
  }
  .panel::before {
    content: attr(data-lbl);
    position: absolute;
    top: -0.55rem;
    left: 0.8rem;
    background: #000;
    padding: 0 0.45rem;
    font-family: 'VT323', monospace;
    font-size: 0.78rem;
    color: var(--r-vfd);
    letter-spacing: 0.16em;
    text-shadow: 0 0 6px rgba(107, 229, 212, 0.6);
  }
  .panel::after {
    content: attr(data-ref);
    position: absolute;
    top: -0.45rem;
    right: 0.8rem;
    background: #000;
    padding: 0 0.45rem;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.58rem;
    color: var(--r-dim);
    letter-spacing: 0.2em;
  }

  /* ---------- NIXIE ---------- */
  .nixie-row {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 0.2rem;
    padding: 0.6rem 0 0.3rem;
    flex-wrap: wrap;
  }
  .tube {
    position: relative;
    display: inline-block;
  }
  .tube .glyph,
  .tube .ghost {
    font-family: 'Big Shoulders Display', Impact, sans-serif;
    font-weight: 900;
    font-size: 8rem;
    line-height: 0.88;
    letter-spacing: -0.02em;
  }
  .tube .glyph {
    color: var(--r-nixie);
    text-shadow:
      0 0 4px var(--r-nixie),
      0 0 14px rgba(255, 123, 51, 0.85),
      0 0 32px rgba(255, 123, 51, 0.55),
      0 0 60px rgba(255, 123, 51, 0.35);
    animation: nixie-flicker 3s ease-in-out infinite;
  }
  .tube .ghost {
    position: absolute;
    inset: 0;
    color: rgba(255, 123, 51, 0.08);
    pointer-events: none;
  }
  .tube.sm .glyph,
  .tube.sm .ghost {
    font-size: 5rem;
  }
  .colon-pair {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1rem;
  }
  .colon-pair.sm {
    gap: 0.6rem;
  }
  .colon-pair .dot {
    width: 0.6rem;
    height: 0.6rem;
    background: var(--r-nixie);
    border-radius: 50%;
    box-shadow: 0 0 10px var(--r-nixie), 0 0 22px rgba(255, 123, 51, 0.6);
    animation: dot-blink 1s step-end infinite;
  }
  .colon-pair .dot.sm {
    width: 0.4rem;
    height: 0.4rem;
  }
  .sec-group {
    display: inline-flex;
    align-items: baseline;
    margin-left: 0.4rem;
    align-self: flex-end;
    margin-bottom: 0.6rem;
  }
  @keyframes nixie-flicker {
    0%, 4%, 100% { opacity: 1; }
    2% { opacity: 0.95; }
    48%, 52% { opacity: 0.985; }
  }
  @keyframes dot-blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0.3; }
  }

  .date-line {
    text-align: center;
    font-family: 'VT323', monospace;
    font-size: 1.6rem;
    color: var(--r-vfd);
    letter-spacing: 0.2em;
    text-shadow: 0 0 10px rgba(107, 229, 212, 0.6);
  }
  .loc-line {
    text-align: center;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    color: var(--r-dim);
    letter-spacing: 0.3em;
  }

  /* ---------- 7-SEG STATS ---------- */
  .seg-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.6rem;
    margin-bottom: 1rem;
  }
  .seg-cell {
    border: 2px solid var(--r-deep);
    padding: 0.6rem 0.5rem 0.5rem;
    text-align: center;
  }
  .seg-cell .lbl {
    font-family: 'VT323', monospace;
    font-size: 0.72rem;
    color: var(--r-vfd);
    letter-spacing: 0.14em;
    text-shadow: 0 0 4px rgba(107, 229, 212, 0.5);
    margin-bottom: 0.25rem;
  }
  .seg-cell .val {
    position: relative;
    font-family: 'Share Tech Mono', monospace;
    font-size: 2rem;
    color: var(--r-amber);
    letter-spacing: 0.04em;
    text-shadow: 0 0 3px var(--r-amber), 0 0 10px rgba(255, 176, 32, 0.6), 0 0 22px rgba(255, 176, 32, 0.35);
    font-variant-numeric: tabular-nums;
    display: inline-block;
  }
  .seg-cell .val .ghost {
    position: absolute;
    left: 0;
    top: 0;
    color: rgba(255, 176, 32, 0.08);
    text-shadow: none;
    pointer-events: none;
  }
  .seg-cell .u {
    font-size: 0.9rem;
    color: var(--r-amber-dim);
    margin-left: 0.1rem;
  }

  /* ---------- VFD rows ---------- */
  .wx-rows {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
  }
  .vfd-row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 0.6rem;
    align-items: baseline;
    padding: 0.25rem 0;
    border-bottom: 1px solid var(--r-deep);
    font-family: 'VT323', monospace;
    font-size: 0.85rem;
    color: var(--r-vfd);
    text-shadow: 0 0 4px rgba(107, 229, 212, 0.4);
  }
  .vfd-row .k {
    color: var(--r-vfd-dim);
    letter-spacing: 0.1em;
  }

  /* ---------- Forecast ---------- */
  .forecast {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.4rem;
    margin-top: 0.7rem;
  }
  .fc-day {
    border: 2px solid var(--r-deep);
    padding: 0.5rem 0.2rem;
    text-align: center;
  }
  .fc-day .dow {
    font-size: 0.72rem;
    color: var(--r-vfd);
    letter-spacing: 0.14em;
    text-shadow: 0 0 4px rgba(107, 229, 212, 0.4);
  }
  .fc-day .hi {
    font-family: 'Share Tech Mono', monospace;
    font-size: 1.35rem;
    color: var(--r-amber);
    text-shadow: 0 0 3px var(--r-amber), 0 0 10px rgba(255, 176, 32, 0.5);
    margin-top: 0.2rem;
    line-height: 1;
  }
  .fc-day .lo {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    color: var(--r-amber-dim);
  }
  .fc-day .ic {
    font-size: 0.65rem;
    color: var(--r-vfd-dim);
    letter-spacing: 0.14em;
    margin-top: 0.15rem;
  }

  /* ---------- LED bank ---------- */
  .led-bank {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.3rem 1rem;
  }
  .led-row {
    display: grid;
    grid-template-columns: 0.8rem 1fr auto;
    gap: 0.5rem;
    align-items: center;
    padding: 0.25rem 0;
    border-bottom: 1px solid var(--r-deep);
  }
  .led {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: var(--r-led-g);
    box-shadow: 0 0 8px var(--r-led-g), 0 0 18px rgba(78, 255, 126, 0.5);
  }
  .led.r {
    background: var(--r-led-r);
    box-shadow: 0 0 8px var(--r-led-r), 0 0 18px rgba(255, 64, 64, 0.5);
  }
  .led.y {
    background: var(--r-amber);
    box-shadow: 0 0 8px var(--r-amber), 0 0 18px rgba(255, 176, 32, 0.5);
  }
  .led-row .nm {
    font-family: 'VT323', monospace;
    font-size: 0.82rem;
    color: var(--r-vfd);
    letter-spacing: 0.08em;
  }
  .led-row .up {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.6rem;
    color: var(--r-dim);
    letter-spacing: 0.12em;
  }

  /* ---------- Cam wall ---------- */
  .cams {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-auto-rows: 1fr;
    gap: 0.3rem;
  }
  .cam {
    aspect-ratio: 16/9;
    border: 2px solid var(--r-crt-dim);
    position: relative;
    background: #000;
    overflow: hidden;
    box-shadow: inset 0 0 30px rgba(91, 255, 91, 0.06);
  }
  .cam img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    filter: brightness(0.85) contrast(1.05) saturate(0.85);
  }
  .cam::before {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(0deg, transparent 0 2px, rgba(91, 255, 91, 0.08) 2px 3px);
    pointer-events: none;
  }
  .cam::after {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center, transparent 50%, rgba(0, 0, 0, 0.4) 100%);
    pointer-events: none;
  }
  .cam .lbl {
    position: absolute;
    top: 0.3rem;
    left: 0.4rem;
    font-family: 'VT323', monospace;
    font-size: 0.7rem;
    color: var(--r-crt);
    text-shadow: 0 0 4px rgba(91, 255, 91, 0.7);
    letter-spacing: 0.14em;
    z-index: 2;
  }
  .cam .rec {
    position: absolute;
    top: 0.35rem;
    right: 0.4rem;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.55rem;
    color: var(--r-led-r);
    letter-spacing: 0.16em;
    z-index: 2;
  }
  .cam .rec::before {
    content: '';
    width: 0.35rem;
    height: 0.35rem;
    background: var(--r-led-r);
    border-radius: 50%;
    box-shadow: 0 0 6px var(--r-led-r);
    animation: dot-blink 1s step-end infinite;
  }
  .cam .ts {
    position: absolute;
    bottom: 0.3rem;
    right: 0.4rem;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.6rem;
    color: var(--r-crt);
    text-shadow: 0 0 3px rgba(91, 255, 91, 0.6);
    z-index: 2;
  }

  /* ---------- Dual row ---------- */
  .dual-row {
    display: grid;
    grid-template-columns: 1.2fr 1fr;
    gap: 0.8rem;
  }
  .dual-row.grow {
    grid-template-columns: 1.3fr 1fr;
  }
  .dual-row .panel {
    margin-bottom: 1rem;
  }

  /* ---------- Plex deck ---------- */
  .plex-deck {
    display: grid;
    grid-template-columns: 3rem 1fr;
    gap: 0.7rem;
    align-items: center;
  }
  .plex-art {
    aspect-ratio: 2/3;
    border: 2px solid var(--r-deep);
    position: relative;
  }
  .plex-art::after {
    content: '▶';
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--r-vfd-dim);
    font-size: 1.2rem;
  }
  .plex-info .title {
    font-family: 'VT323', monospace;
    font-size: 1.1rem;
    color: var(--r-vfd);
    text-shadow: 0 0 5px rgba(107, 229, 212, 0.55);
    letter-spacing: 0.08em;
    line-height: 1.1;
  }
  .plex-info .sub {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.55rem;
    color: var(--r-vfd-dim);
    letter-spacing: 0.14em;
    margin-top: 0.2rem;
  }
  .plex-info .prog-bar {
    margin-top: 0.4rem;
    height: 4px;
    background: var(--r-deep);
    position: relative;
  }
  .plex-info .prog-bar .fill {
    position: absolute;
    left: 0;
    top: 0;
    height: 4px;
    background: var(--r-vfd);
    box-shadow: 0 0 6px rgba(107, 229, 212, 0.6);
  }

  /* ---------- Immich ---------- */
  .immich-slide {
    border: 2px solid var(--r-deep);
    min-height: 5rem;
    position: relative;
    background:
      linear-gradient(135deg, #141414 25%, transparent 25%, transparent 50%, #141414 50%, #141414 75%, transparent 75%);
    background-size: 14px 14px;
  }
  .immich-slide .meta {
    position: absolute;
    bottom: 0.4rem;
    left: 50%;
    transform: translateX(-50%);
    background: #000;
    padding: 0.1rem 0.5rem;
    font-family: 'VT323', monospace;
    font-size: 0.7rem;
    color: var(--r-vfd);
    letter-spacing: 0.18em;
    text-shadow: 0 0 3px rgba(107, 229, 212, 0.5);
  }
  .immich-slide .idx {
    position: absolute;
    top: 0.3rem;
    right: 0.4rem;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.58rem;
    color: var(--r-amber);
    text-shadow: 0 0 3px var(--r-amber);
    letter-spacing: 0.1em;
  }

  /* ---------- Calendar ---------- */
  .cal .row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 0.9rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--r-deep);
    align-items: center;
  }
  .cal .tm {
    font-family: 'Share Tech Mono', monospace;
    font-size: 1.25rem;
    color: var(--r-amber);
    text-shadow: 0 0 3px var(--r-amber), 0 0 10px rgba(255, 176, 32, 0.45);
    position: relative;
  }
  .cal .tm .ghost {
    position: absolute;
    left: 0;
    top: 0;
    color: rgba(255, 176, 32, 0.08);
    text-shadow: none;
  }
  .cal .ev {
    font-family: 'VT323', monospace;
    font-size: 1rem;
    color: var(--r-vfd);
    text-shadow: 0 0 4px rgba(107, 229, 212, 0.5);
    letter-spacing: 0.06em;
  }
  .cal .ev .loc {
    display: block;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.58rem;
    color: var(--r-vfd-dim);
    letter-spacing: 0.12em;
    text-shadow: none;
    margin-top: 0.1rem;
  }
  .cal .rel {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.68rem;
    color: var(--r-amber-dim);
    letter-spacing: 0.1em;
  }
  .cal-empty {
    text-align: center;
    color: var(--r-vfd-dim);
    padding: 0.6rem 0;
    font-size: 0.9rem;
    letter-spacing: 0.2em;
  }

  /* ---------- Teletype ---------- */
  .teletype {
    font-family: 'VT323', monospace;
    font-size: 0.95rem;
    color: var(--r-crt);
    text-shadow: 0 0 4px rgba(91, 255, 91, 0.5);
    line-height: 1.35;
    letter-spacing: 0.04em;
  }
  .teletype .line {
    display: grid;
    grid-template-columns: 1rem 1fr auto auto;
    gap: 0.4rem;
    padding: 0.15rem 0;
    align-items: baseline;
  }
  .teletype .line .mk {
    color: var(--r-crt-dim);
  }
  .teletype .line .q {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.72rem;
    color: var(--r-amber);
    text-shadow: 0 0 3px var(--r-amber);
    min-width: 2.5rem;
    text-align: right;
  }
  .teletype .line .cat {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.5rem;
    color: var(--r-dim);
    letter-spacing: 0.18em;
    min-width: 2.8rem;
    text-align: right;
  }
  .teletype .line.done .mk {
    color: var(--r-crt-dim);
  }
  .teletype .line.done .nm {
    color: var(--r-crt-dim);
    text-decoration: line-through;
    text-shadow: none;
  }

  /* ---------- Pantry ---------- */
  .pantry-seg {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.55rem 0.9rem;
  }
  .pantry-seg .pr {
    display: grid;
    grid-template-columns: 3rem 1fr auto;
    gap: 0.35rem;
    align-items: center;
    font-family: 'VT323', monospace;
  }
  .pantry-seg .pr .k {
    font-size: 0.7rem;
    color: var(--r-vfd-dim);
    letter-spacing: 0.08em;
  }
  .pantry-seg .pr .bar {
    height: 6px;
    background: var(--r-deep);
    position: relative;
  }
  .pantry-seg .pr .bar .f {
    position: absolute;
    left: 0;
    top: 0;
    height: 6px;
    background: var(--r-crt);
    box-shadow: 0 0 6px rgba(91, 255, 91, 0.5);
  }
  .pantry-seg .pr .bar .f.low {
    background: var(--r-amber);
    box-shadow: 0 0 6px rgba(255, 176, 32, 0.5);
  }
  .pantry-seg .pr .bar .f.crit {
    background: var(--r-led-r);
    box-shadow: 0 0 6px rgba(255, 64, 64, 0.5);
  }
  .pantry-seg .pr .pct {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.7rem;
    color: var(--r-amber);
    text-shadow: 0 0 3px var(--r-amber);
    min-width: 2rem;
    text-align: right;
  }

  /* ---------- System ---------- */
  .sys-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.6rem;
  }
  .sys-cell {
    border: 2px solid var(--r-deep);
    padding: 0.55rem 0.4rem;
    text-align: center;
  }
  .sys-cell .k {
    font-family: 'VT323', monospace;
    font-size: 0.72rem;
    color: var(--r-vfd);
    letter-spacing: 0.14em;
    text-shadow: 0 0 3px rgba(107, 229, 212, 0.4);
  }
  .sys-cell .v {
    font-family: 'Share Tech Mono', monospace;
    font-size: 1.8rem;
    color: var(--r-amber);
    text-shadow: 0 0 3px var(--r-amber), 0 0 10px rgba(255, 176, 32, 0.5);
    line-height: 1;
    margin-top: 0.2rem;
    position: relative;
    display: inline-block;
  }
  .sys-cell .v.small {
    font-size: 1.15rem;
  }
  .sys-cell .v .ghost {
    position: absolute;
    left: 0;
    top: 0;
    color: rgba(255, 176, 32, 0.08);
    text-shadow: none;
  }
  .sys-cell .v .u {
    font-size: 0.9rem;
    color: var(--r-amber-dim);
    text-shadow: none;
  }

  /* ---------- CRT ticker ---------- */
  .crt-ticker {
    margin-top: 1rem;
    border: 2px solid var(--r-crt-dim);
    padding: 0.6rem 0.7rem;
    position: relative;
    overflow: hidden;
    box-shadow: inset 0 0 24px rgba(91, 255, 91, 0.08);
  }
  .crt-ticker::before {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(0deg, transparent 0 2px, rgba(91, 255, 91, 0.09) 2px 3px);
    pointer-events: none;
  }
  .crt-ticker::after {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center, transparent 50%, rgba(0, 0, 0, 0.4) 100%);
    pointer-events: none;
  }
  .crt-ticker .label {
    position: absolute;
    top: -0.55rem;
    left: 0.8rem;
    background: #000;
    padding: 0 0.45rem;
    font-family: 'VT323', monospace;
    font-size: 0.75rem;
    color: var(--r-crt);
    text-shadow: 0 0 5px rgba(91, 255, 91, 0.6);
    letter-spacing: 0.16em;
  }
  .crt-ticker .ref {
    position: absolute;
    top: -0.45rem;
    right: 0.8rem;
    background: #000;
    padding: 0 0.45rem;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.55rem;
    color: var(--r-dim);
    letter-spacing: 0.2em;
  }
  .tick-scroll {
    overflow: hidden;
    position: relative;
    height: 1.4rem;
  }
  .tick-track {
    display: inline-flex;
    gap: 3rem;
    white-space: nowrap;
    animation: tick 75s linear infinite;
    font-family: 'VT323', monospace;
    font-size: 0.95rem;
    color: var(--r-crt);
    text-shadow: 0 0 4px rgba(91, 255, 91, 0.5);
    letter-spacing: 0.04em;
  }
  .tick-track .src {
    color: var(--r-amber);
    text-shadow: 0 0 3px var(--r-amber);
    letter-spacing: 0.14em;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.68rem;
    margin-right: 0.5rem;
  }
  .tick-track .sep {
    color: var(--r-crt-dim);
    margin: 0 0.5rem;
  }
  @keyframes tick {
    0% { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }

  .power-line {
    margin-top: 0.8rem;
    text-align: center;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.55rem;
    color: var(--r-dim);
    letter-spacing: 0.28em;
  }
</style>
