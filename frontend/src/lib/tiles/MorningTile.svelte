<script lang="ts">
  /**
   * Morning dashboard tile matching mockups/06-morning.html 1:1.
   *
   * Single full-bleed tile so the glassy gradient background is uninterrupted.
   * Internal sub-grid reproduces the mockup layout:
   *   [mode bar row]
   *   [hero 5 rows]  — greeting, clock, stats, sun
   *   [wx 4 / commute 2 / timer 2] — right column splits
   *   [agenda 4 / routine 4]
   *   [news 3 / breakfast 3]
   *   [podcast 2 full]
   *
   * Live data sources:
   *   clock / greeting          — local time
   *   weather                    — HA weather.<entity>
   *   commute                    — /api/admin/directions (to next event with location)
   *   agenda                     — HA calendar.<entity>
   *   breakfast stock            — /api/admin/grocery/inventory (low-stock first)
   *   routine, news, podcast     — demo (until wired)
   *
   * Palette prop: 'warm' (mockup default, sunrise gradient) or 'light'.
   */
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import BaseTile from './BaseTile.svelte';
  import { watchEntity, type HaEntity } from '$lib/ha/entity.js';
  import { normalizeInventory } from '$lib/grocery/normalize.js';

  type Palette = 'warm' | 'light';

  interface Props {
    id: string;
    props?: {
      palette?: Palette;
      greeting?: string;
      weatherEntity?: string;
      calendarEntity?: string;
      userHandle?: string;
      city?: string;
    };
  }
  let { id, props = {} }: Props = $props();

  const palette: Palette = $derived(props.palette ?? 'warm');

  // ---------- clock / date ----------
  let now = $state(new Date());
  let clockTimer: ReturnType<typeof setInterval> | null = null;

  const hhmm = $derived(
    now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
  );
  const dateLine = $derived(
    now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
  );
  const topDateShort = $derived(
    now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
  );
  const greetingWord = $derived.by(() => {
    if (props.greeting) return props.greeting;
    const h = now.getHours();
    if (h < 5) return 'Still up,';
    if (h < 12) return 'Good morning,';
    if (h < 18) return 'Good afternoon,';
    return 'Good evening,';
  });

  // ---------- weather ----------
  let weather = $state<HaEntity | null>(null);
  const stopWatchers: Array<() => void> = [];
  $effect(() => {
    const eid = props.weatherEntity ?? 'weather.4340';
    if (!browser || !eid) return;
    const w = watchEntity(eid, 60_000);
    stopWatchers.push(w.stop);
    const unsub = w.store.subscribe((e) => (weather = e));
    stopWatchers.push(unsub);
  });
  const wxTemp = $derived.by(() => {
    const t = (weather?.attributes as { temperature?: number } | undefined)?.temperature;
    return typeof t === 'number' ? Math.round(t) : null;
  });
  const wxCond = $derived(weather?.state ?? '—');
  const wxHumidity = $derived(
    (weather?.attributes as { humidity?: number } | undefined)?.humidity ?? null,
  );
  const wxWind = $derived(
    (weather?.attributes as { wind_speed?: number } | undefined)?.wind_speed ?? null,
  );
  const wxForecast = $derived.by(() => {
    const a = weather?.attributes as
      | { forecast?: Array<{ datetime?: string; temperature?: number; condition?: string }> }
      | undefined;
    const arr = a?.forecast ?? [];
    return arr.slice(0, 7).map((f) => ({
      t: f.datetime ? new Date(f.datetime).getHours() : null,
      temp: typeof f.temperature === 'number' ? Math.round(f.temperature) : null,
      cond: f.condition ?? '',
    }));
  });
  function weatherIcon(c: string): string {
    const s = c.toLowerCase();
    if (s.includes('clear') || s.includes('sunny')) return '☀';
    if (s.includes('partly') || s.includes('partlycloudy')) return '⛅';
    if (s.includes('cloud')) return '☁';
    if (s.includes('rain') || s.includes('pouring')) return '🌧';
    if (s.includes('snow')) return '❄';
    if (s.includes('fog')) return '🌫';
    if (s.includes('storm') || s.includes('lightning')) return '⛈';
    return '🌤';
  }

  // ---------- calendar (agenda + commute target) ----------
  type ApiEvent = {
    start?: { dateTime?: string; date?: string };
    summary?: string;
    location?: string;
  };
  type PickedEvent = { start: Date; summary: string; location: string };
  let agenda = $state<Array<{ hhmm: string; summary: string }>>([]);
  let nextEvent = $state<PickedEvent | null>(null);
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
      const arr = (await r.json()) as ApiEvent[];
      const items = arr
        .map((e) => {
          const raw = e.start?.dateTime ?? e.start?.date ?? '';
          const d = new Date(raw);
          return {
            d,
            summary: e.summary ?? '',
            location: (e.location ?? '').trim(),
          };
        })
        .filter((e) => !isNaN(e.d.getTime()))
        .sort((a, b) => a.d.getTime() - b.d.getTime());
      const nowMs = Date.now();
      const upcoming = items.filter((e) => e.d.getTime() >= nowMs);
      agenda = upcoming.slice(0, 5).map((e) => ({
        hhmm: e.d.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
        summary: e.summary || '(event)',
      }));
      const withLoc = upcoming.find((e) => e.location);
      nextEvent = withLoc
        ? { start: withLoc.d, summary: withLoc.summary || '(event)', location: withLoc.location }
        : null;
      if (!nextEvent && upcoming[0]) {
        // Still surface the next event in the hero callout even without
        // a location — just no commute estimate.
        nextEvent = {
          start: upcoming[0].d,
          summary: upcoming[0].summary || '(event)',
          location: '',
        };
      }
    } catch {
      /* keep previous */
    }
  }

  // ---------- commute (directions to next event) ----------
  type Directions = {
    ok: boolean;
    distance?: { text: string };
    duration?: { text: string };
    duration_in_traffic?: { text: string; value: number } | null;
    error?: string;
  };
  let directions = $state<Directions | null>(null);
  let dirTimer: ReturnType<typeof setInterval> | null = null;

  async function fetchDirections(to: string): Promise<void> {
    try {
      const r = await fetch(`/api/admin/directions?to=${encodeURIComponent(to)}`, {
        cache: 'no-store',
      });
      directions = (await r.json()) as Directions;
    } catch {
      directions = null;
    }
  }

  // ---------- breakfast / stock (from grocery) ----------
  type Stock = { name: string; qty: string; level: 'ok' | 'low' | 'crit' };
  const DEFAULT_STOCK: Stock[] = [
    { name: 'Milk', qty: '0.2 L', level: 'low' },
    { name: 'Eggs', qty: '4', level: 'ok' },
    { name: 'Oats', qty: '1 kg', level: 'ok' },
    { name: 'Coffee', qty: '180 g', level: 'crit' },
    { name: 'Bread', qty: 'half', level: 'ok' },
    { name: 'Berries', qty: 'fresh', level: 'ok' },
  ];
  let liveStock = $state<Stock[] | null>(null);
  let stockTimer: ReturnType<typeof setInterval> | null = null;

  async function fetchStock(): Promise<void> {
    try {
      const r = await fetch('/api/admin/grocery/inventory', { cache: 'no-store' });
      if (!r.ok) return;
      const j = (await r.json()) as { configured?: boolean; data?: unknown };
      if (!j.configured) return;
      const rows = normalizeInventory(j.data);
      const low = rows.filter((r) => r.qty < r.min);
      const pick = [...low, ...rows.filter((r) => !(r.qty < r.min))].slice(0, 6);
      if (pick.length) {
        liveStock = pick.map((r) => ({
          name: r.name,
          qty: `${r.qty}${r.unit ? ' ' + r.unit : ''}`.trim(),
          level: (r.qty === 0 ? 'crit' : r.qty < r.min ? 'low' : 'ok') as 'ok' | 'low' | 'crit',
        }));
      }
    } catch {
      /* keep current */
    }
  }
  const stock = $derived(liveStock ?? DEFAULT_STOCK);

  // ---------- routine (client-only for now) ----------
  let routine = $state([
    { id: 'wake', name: 'Wake · sunrise alarm', at: '06:41', done: true },
    { id: 'vit', name: 'Water + vitamins', at: '06:52', done: true },
    { id: 'cof', name: 'Coffee brewing', at: '07:15', done: false },
    { id: 'sho', name: 'Shower', at: '07:25', done: false },
    { id: 'brk', name: 'Breakfast', at: '07:50', done: false },
    { id: 'out', name: 'Leave for office', at: '08:15', done: false },
  ]);
  const routineDone = $derived(routine.filter((r) => r.done).length);
  const routineTotal = $derived(routine.length);
  const routinePct = $derived(
    routineTotal ? Math.round((routineDone / routineTotal) * 100) : 0,
  );
  const ringCirc = 150.8;
  const ringOffset = $derived(ringCirc - ringCirc * (routineDone / Math.max(1, routineTotal)));
  function toggleRoutine(rid: string) {
    routine = routine.map((r) => (r.id === rid ? { ...r, done: !r.done } : r));
  }

  // ---------- coffee timer ----------
  let tLeft = $state(210);
  let tRunning = $state(false);
  let tInterval: ReturnType<typeof setInterval> | null = null;
  const tMin = $derived(String(Math.floor(tLeft / 60)).padStart(2, '0'));
  const tSec = $derived(String(tLeft % 60).padStart(2, '0'));
  function toggleTimer() {
    tRunning = !tRunning;
    if (tRunning) {
      tInterval = setInterval(() => {
        tLeft = Math.max(0, tLeft - 1);
        if (tLeft === 0) {
          clearInterval(tInterval!);
          tInterval = null;
          tRunning = false;
        }
      }, 1000);
    } else if (tInterval) {
      clearInterval(tInterval);
      tInterval = null;
    }
  }
  function resetTimer() {
    if (tInterval) clearInterval(tInterval);
    tInterval = null;
    tLeft = 210;
    tRunning = false;
  }

  // ---------- lifecycle ----------
  $effect(() => {
    const loc = nextEvent?.location;
    if (!loc) {
      directions = null;
      if (dirTimer) {
        clearInterval(dirTimer);
        dirTimer = null;
      }
      return;
    }
    void fetchDirections(loc);
    if (dirTimer) clearInterval(dirTimer);
    dirTimer = setInterval(() => void fetchDirections(loc), 2 * 60_000);
  });

  onMount(() => {
    if (!browser) return;
    clockTimer = setInterval(() => (now = new Date()), 1000);
    void fetchCalendar();
    calTimer = setInterval(fetchCalendar, 5 * 60_000);
    void fetchStock();
    stockTimer = setInterval(fetchStock, 30_000);
  });

  onDestroy(() => {
    if (clockTimer) clearInterval(clockTimer);
    if (calTimer) clearInterval(calTimer);
    if (stockTimer) clearInterval(stockTimer);
    if (dirTimer) clearInterval(dirTimer);
    if (tInterval) clearInterval(tInterval);
    for (const fn of stopWatchers) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
  });

  // ---------- demo news + podcast ----------
  const news = [
    {
      src: 'Hacker',
      t: 'Local-first software: making the web work offline first',
      m: 'hn · 412 points · 2h ago',
    },
    {
      src: 'Verge',
      t: 'Home Assistant 2026.4 ships with LLM conversation agents',
      m: 'the verge · 1h ago',
    },
    {
      src: 'GitHub',
      t: 'New release · home-assistant/core v2026.4.2',
      m: '3 commits to track · 0 breaking',
    },
    { src: 'Self', t: 'PR #412 approved · merge when ready', m: 'sam approved 23 min ago' },
  ];

  // ---------- derived commute ----------
  const commuteBig = $derived.by(() => {
    const t = directions?.duration_in_traffic?.text ?? directions?.duration?.text;
    if (!t) return null;
    const m = /(\d+)/.exec(t);
    return m ? m[1] : t;
  });
  const commuteVia = $derived(nextEvent?.location ?? '');
  const commuteLeaveAt = $derived.by(() => {
    const d = nextEvent?.start;
    const sec = directions?.duration_in_traffic?.value ?? 0;
    if (!d || !sec) return null;
    const leave = new Date(d.getTime() - sec * 1000 - 10 * 60_000);
    return leave.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  });
  const commuteDelayed = $derived.by(() => {
    const dt = directions?.duration_in_traffic?.value;
    const base = directions?.duration?.text; // not the number; just flag presence
    if (!dt || !base) return false;
    return dt > 15 * 60; // >15 min buffer as rough "heavy" marker
  });

  function minutesTo(d: Date | undefined): number | null {
    if (!d) return null;
    const ms = d.getTime() - Date.now();
    if (ms < 0) return null;
    return Math.round(ms / 60000);
  }
  const nextInMin = $derived(minutesTo(nextEvent?.start));

  const userHandle = $derived(props.userHandle ?? '@chatwithllm');
  const city = $derived(props.city ?? '');
</script>

<BaseTile {id} type="morning" chromeless={true} label="Morning">
  <div class="mm" data-palette={palette}>
    <div class="mm-bg"></div>

    <div class="modebar card">
      <div class="left"><span class="pill on">☀ Morning</span></div>
      <div class="right">
        <span>HA · connected</span>
        <span>{topDateShort}</span>
      </div>
    </div>

    <div class="card hero">
      <div class="sun"></div>
      <div>
        <div class="greet">{greetingWord} <span class="u">{userHandle}</span></div>
        <div class="time">{hhmm}</div>
        <div class="date">{dateLine}</div>
      </div>
      {#if nextEvent && nextInMin != null}
        <div class="next-hero">
          <div class="in">In {nextInMin} min</div>
          <div class="ne">{nextEvent.summary}</div>
          {#if nextEvent.location}<div class="ne-loc">{nextEvent.location}</div>{/if}
        </div>
      {/if}
    </div>

    <div class="card wx">
      <div class="label"><span>{city || 'Weather'}</span><span class="ic">{weatherIcon(wxCond)}</span></div>
      <div class="top">
        <div>
          <div class="temp">{wxTemp ?? '—'}°</div>
          <div class="cond">{wxCond}</div>
          <div class="meta">
            {#if wxHumidity != null}<span>Humidity <b>{wxHumidity}%</b></span>{/if}
            {#if wxWind != null}<span>Wind <b>{wxWind} mph</b></span>{/if}
          </div>
        </div>
      </div>
      {#if wxForecast.length}
        <div class="fc">
          {#each wxForecast as f, i (i)}
            <div class="h">
              <div>{f.t ?? ''}</div>
              <div class="t">{f.temp ?? '—'}°</div>
              <div class="p">{weatherIcon(f.cond)}</div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="card commute">
      <div class="label">
        <span>Commute</span>
        <span>{nextEvent?.summary ? 'next event' : 'idle'}</span>
      </div>
      <div class="big">
        {commuteBig ?? '—'}<span class="u">min</span>
      </div>
      <div class="status" class:bad={commuteDelayed}>
        {commuteDelayed ? 'heavy traffic' : 'light traffic'}
      </div>
      <div class="via">
        {commuteVia || '—'}
        {#if commuteLeaveAt}· leave <b>{commuteLeaveAt}</b>{/if}
      </div>
    </div>

    <div class="card timer">
      <div class="label" style="justify-content:center">☕ Coffee · pour-over</div>
      <div class="clock-v">{tMin}:{tSec}</div>
      <div class="ctrls">
        <button class="btn" onclick={resetTimer} aria-label="reset">↺</button>
        <button class="btn primary" onclick={toggleTimer} aria-label="start/pause">
          {tRunning ? '❚❚' : tLeft === 0 ? '☕' : '▶'}
        </button>
      </div>
    </div>

    <div class="card agenda">
      <div class="label"><span>Today</span><span>{agenda.length} events</span></div>
      {#if nextEvent && nextInMin != null}
        <div class="next">
          <div class="in">In {nextInMin} min</div>
          <div class="t">{nextEvent.summary}</div>
          <div class="m">
            {nextEvent.start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
            {#if nextEvent.location}· {nextEvent.location}{/if}
          </div>
        </div>
      {/if}
      <ul class="list">
        {#each agenda.slice(nextEvent ? 1 : 0, 5) as ev (ev.hhmm + ev.summary)}
          <li><span class="t">{ev.hhmm}</span><span>{ev.summary}</span></li>
        {/each}
      </ul>
    </div>

    <div class="card routine">
      <div class="label"><span>Morning routine</span><span>{routineDone}/{routineTotal}</span></div>
      <div class="progress-ring">
        <div class="ring">
          <svg width="56" height="56" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="4" />
            <circle
              cx="28"
              cy="28"
              r="24"
              fill="none"
              stroke="var(--mm-accent)"
              stroke-width="4"
              stroke-dasharray={ringCirc}
              stroke-dashoffset={ringOffset}
              stroke-linecap="round"
              style="transform: rotate(-90deg); transform-origin: 50% 50%;"
            />
          </svg>
          <div class="lab">{routinePct}%</div>
        </div>
        <div class="sum">You're <b>on track</b> for your usual departure.</div>
      </div>
      <ul>
        {#each routine as r (r.id)}
          <li class:done={r.done}>
            <button
              class="chk"
              onclick={() => toggleRoutine(r.id)}
              aria-label={`toggle ${r.name}`}
            ></button>
            <span class="t">{r.name}</span>
            <span class="d">{r.at}</span>
          </li>
        {/each}
      </ul>
    </div>

    <div class="card news">
      <div class="label"><span>Briefing</span><span>curated</span></div>
      {#each news as n (n.t)}
        <div class="row">
          <span class="src">{n.src}</span>
          <div class="t">{n.t}<div class="m">{n.m}</div></div>
        </div>
      {/each}
    </div>

    <div class="card brk">
      <div class="label"><span>Breakfast · stock</span><span class="hint">live</span></div>
      <div class="items">
        {#each stock as s (s.name)}
          <div class="i {s.level !== 'ok' ? s.level : ''}">
            <span>{s.name}</span><span class="q">{s.qty}</span>
          </div>
        {/each}
      </div>
    </div>

    <div class="card pod">
      <div class="art">🎙</div>
      <div class="info">
        <div class="label">Up next · morning queue</div>
        <div class="title">The Daily · What happens when climate tech scales</div>
        <div class="meta">NYT · 24:11 · resumes where you left off</div>
        <div class="bar"><span style="width:34%"></span></div>
      </div>
      <div class="ctrls">
        <button class="btn" aria-label="back 15">⏪</button>
        <button class="btn play" aria-label="play">▶</button>
        <button class="btn" aria-label="fwd 15">⏩</button>
      </div>
    </div>
  </div>
</BaseTile>

<style>
  /* Scoped to .mm so the rest of the app is untouched. Mirrors the
     tokens from 06-morning.html and adds a light-palette override. */
  .mm {
    --mm-bg-0: #1a0f1e;
    --mm-bg-1: #3a1d3a;
    --mm-bg-2: #6d2d4e;
    --mm-bg-3: #c4593e;
    --mm-bg-4: #f0a54a;
    --mm-panel: rgba(20, 12, 24, 0.55);
    --mm-panel-2: rgba(255, 255, 255, 0.08);
    --mm-fg: #fff5e8;
    --mm-dim: rgba(255, 235, 210, 0.72);
    --mm-dimmer: rgba(255, 235, 210, 0.48);
    --mm-line: rgba(255, 235, 210, 0.15);
    --mm-line-strong: rgba(255, 235, 210, 0.28);
    --mm-accent: #ffb454;
    --mm-green: #8ee77b;
    --mm-red: #ff8585;

    position: relative;
    width: 100%;
    height: 100%;
    color: var(--mm-fg);
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    padding: 1.2rem;
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    grid-auto-rows: minmax(5.4rem, auto);
    gap: 0.9rem;
    overflow: hidden;
  }
  .mm[data-palette='light'] {
    --mm-bg-0: #fbeedc;
    --mm-bg-1: #ffe0b8;
    --mm-bg-2: #ffc493;
    --mm-bg-3: #ffa47a;
    --mm-bg-4: #ffd78a;
    --mm-panel: rgba(255, 255, 255, 0.72);
    --mm-panel-2: rgba(255, 180, 84, 0.12);
    --mm-fg: #2a1608;
    --mm-dim: rgba(60, 30, 10, 0.72);
    --mm-dimmer: rgba(60, 30, 10, 0.48);
    --mm-line: rgba(80, 40, 20, 0.15);
    --mm-line-strong: rgba(80, 40, 20, 0.28);
    --mm-accent: #c4593e;
    --mm-green: #4b8f3b;
    --mm-red: #a83333;
  }

  .mm-bg {
    position: absolute;
    inset: 0;
    z-index: 0;
    background:
      radial-gradient(1400px 900px at 80% 100%, var(--mm-bg-4), transparent 60%),
      radial-gradient(1200px 800px at 30% 110%, var(--mm-bg-3), transparent 60%),
      linear-gradient(180deg, var(--mm-bg-0) 0%, var(--mm-bg-1) 35%, var(--mm-bg-2) 70%, var(--mm-bg-3) 100%);
    pointer-events: none;
  }
  .mm .card {
    position: relative;
    z-index: 1;
  }

  /* Shared card chrome. */
  .mm .card {
    background: var(--mm-panel);
    backdrop-filter: blur(18px) saturate(130%);
    -webkit-backdrop-filter: blur(18px) saturate(130%);
    border: 1px solid var(--mm-line-strong);
    border-radius: 1.2rem;
    padding: 0.9rem 1.2rem;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }
  .mm .label {
    font-size: 0.55rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--mm-dimmer);
    font-weight: 600;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .mm .modebar {
    grid-column: 1 / -1;
    grid-row: span 1;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.9rem;
    border-radius: 1rem;
  }
  .mm .pill {
    padding: 0.35rem 0.7rem;
    border-radius: 999px;
    font-size: 0.6rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    border: 1px solid var(--mm-line);
    color: var(--mm-dim);
    font-weight: 500;
    background: transparent;
  }
  .mm .pill.on {
    background: var(--mm-accent);
    color: #2a1608;
    border-color: var(--mm-accent);
    font-weight: 700;
  }
  .mm .modebar .right {
    display: flex;
    gap: 0.8rem;
    font-size: 0.6rem;
    color: var(--mm-dim);
  }

  .mm .hero {
    grid-column: span 8;
    grid-row: span 5;
    padding: 1.6rem 1.8rem;
    justify-content: space-between;
    background: linear-gradient(
      135deg,
      rgba(255, 180, 84, 0.18),
      rgba(196, 89, 62, 0.2)
    );
  }
  .mm .greet {
    font-size: 1.3rem;
    color: var(--mm-dim);
    font-weight: 300;
  }
  .mm .greet .u {
    color: var(--mm-fg);
    font-weight: 500;
  }
  .mm .time {
    font-size: 9rem;
    font-weight: 700;
    line-height: 0.95;
    letter-spacing: -0.055em;
    margin-top: 0.4rem;
    background: linear-gradient(135deg, var(--mm-fg) 0%, var(--mm-accent) 80%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .mm .date {
    font-size: 0.95rem;
    color: var(--mm-dim);
    margin-top: 0.2rem;
  }
  .mm .hero .next-hero {
    margin-top: 0.8rem;
    padding: 0.7rem 0.9rem;
    border-left: 3px solid var(--mm-accent);
    background: linear-gradient(135deg, rgba(255, 180, 84, 0.22), rgba(255, 180, 84, 0.08));
    border-radius: 0.5rem;
  }
  .mm .hero .next-hero .in {
    font-size: 0.55rem;
    letter-spacing: 0.2em;
    color: var(--mm-accent);
    text-transform: uppercase;
    font-weight: 700;
  }
  .mm .hero .next-hero .ne {
    font-size: 1rem;
    font-weight: 600;
    margin-top: 0.2rem;
  }
  .mm .hero .next-hero .ne-loc {
    font-size: 0.75rem;
    color: var(--mm-dim);
    margin-top: 0.15rem;
  }
  .mm .sun {
    position: absolute;
    right: 1.5rem;
    top: 1.5rem;
    width: 5rem;
    height: 5rem;
    border-radius: 50%;
    background: radial-gradient(circle, #fff 0%, #ffd78a 40%, var(--mm-accent) 80%);
    box-shadow: 0 0 90px 20px rgba(255, 180, 84, 0.45);
    animation: mm-bob 6s ease-in-out infinite;
  }
  @keyframes mm-bob {
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-0.4rem);
    }
  }

  .mm .wx {
    grid-column: span 5;
    grid-row: span 4;
  }
  .mm .wx .ic {
    font-size: 2.5rem;
  }
  .mm .wx .top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-top: 0.3rem;
  }
  .mm .wx .temp {
    font-size: 4rem;
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.04em;
  }
  .mm .wx .cond {
    font-size: 0.8rem;
    color: var(--mm-dim);
    margin-top: 0.2rem;
    text-transform: capitalize;
  }
  .mm .wx .meta {
    display: flex;
    gap: 0.8rem;
    margin-top: 0.5rem;
    font-size: 0.72rem;
    color: var(--mm-dim);
  }
  .mm .wx .meta b {
    color: var(--mm-fg);
    font-weight: 600;
  }
  .mm .wx .fc {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 0.35rem;
    margin-top: auto;
    padding-top: 0.7rem;
    border-top: 1px solid var(--mm-line);
  }
  .mm .wx .h {
    text-align: center;
    font-size: 0.65rem;
    color: var(--mm-dim);
  }
  .mm .wx .h .t {
    color: var(--mm-fg);
    font-weight: 600;
    font-size: 0.78rem;
    margin-top: 0.1rem;
  }
  .mm .wx .h .p {
    font-size: 0.65rem;
    margin-top: 0.05rem;
  }

  .mm .commute {
    grid-column: span 3;
    grid-row: span 2;
  }
  .mm .commute .big {
    font-size: 3rem;
    font-weight: 700;
    line-height: 1;
    margin-top: 0.5rem;
    letter-spacing: -0.03em;
  }
  .mm .commute .big .u {
    font-size: 0.95rem;
    color: var(--mm-dim);
    font-weight: 400;
    margin-left: 0.25rem;
  }
  .mm .commute .status {
    margin-top: 0.4rem;
    padding: 0.25rem 0.65rem;
    background: rgba(142, 231, 123, 0.14);
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.65rem;
    color: var(--mm-green);
    font-weight: 600;
    align-self: flex-start;
  }
  .mm .commute .status::before {
    content: '';
    width: 0.35rem;
    height: 0.35rem;
    border-radius: 50%;
    background: var(--mm-green);
  }
  .mm .commute .status.bad {
    background: rgba(255, 133, 133, 0.14);
    color: var(--mm-red);
  }
  .mm .commute .status.bad::before {
    background: var(--mm-red);
  }
  .mm .commute .via {
    font-size: 0.65rem;
    color: var(--mm-dimmer);
    margin-top: auto;
    padding-top: 0.4rem;
  }

  .mm .timer {
    grid-column: span 3;
    grid-row: span 2;
    text-align: center;
    align-items: center;
    justify-content: space-between;
    background: linear-gradient(135deg, rgba(109, 45, 78, 0.35), rgba(58, 29, 58, 0.35));
  }
  .mm .timer .clock-v {
    font-size: 2.6rem;
    font-weight: 700;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    letter-spacing: -0.03em;
    color: var(--mm-accent);
    line-height: 1;
  }
  .mm .timer .ctrls {
    display: flex;
    gap: 0.35rem;
    width: 100%;
  }
  .mm .timer .btn {
    flex: 1;
    padding: 0.45rem;
    border: 1px solid var(--mm-line-strong);
    background: var(--mm-panel-2);
    color: var(--mm-fg);
    border-radius: 0.5rem;
    font-family: inherit;
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .mm .timer .btn.primary {
    background: var(--mm-accent);
    color: #2a1608;
    border-color: var(--mm-accent);
  }

  .mm .agenda {
    grid-column: span 4;
    grid-row: span 4;
  }
  .mm .agenda .next {
    margin-top: 0.55rem;
    padding: 0.7rem 0.8rem;
    background: linear-gradient(135deg, rgba(255, 180, 84, 0.22), rgba(255, 180, 84, 0.08));
    border-left: 3px solid var(--mm-accent);
    border-radius: 0.5rem;
  }
  .mm .agenda .next .in {
    font-size: 0.55rem;
    letter-spacing: 0.2em;
    color: var(--mm-accent);
    text-transform: uppercase;
    font-weight: 700;
  }
  .mm .agenda .next .t {
    font-size: 0.95rem;
    font-weight: 600;
    margin-top: 0.2rem;
  }
  .mm .agenda .next .m {
    font-size: 0.7rem;
    color: var(--mm-dim);
    margin-top: 0.15rem;
  }
  .mm .agenda .list {
    list-style: none;
    margin: 0.7rem 0 0;
    padding: 0;
  }
  .mm .agenda .list li {
    display: flex;
    gap: 0.7rem;
    padding: 0.4rem 0;
    border-top: 1px solid var(--mm-line);
    font-size: 0.75rem;
  }
  .mm .agenda .list li:first-child {
    border-top: 0;
  }
  .mm .agenda .list li .t {
    color: var(--mm-dimmer);
    width: 3.2rem;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 0.65rem;
    flex-shrink: 0;
  }

  .mm .routine {
    grid-column: span 4;
    grid-row: span 4;
  }
  .mm .routine .progress-ring {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    margin-top: 0.55rem;
  }
  .mm .routine .ring {
    width: 3.3rem;
    height: 3.3rem;
    position: relative;
    flex-shrink: 0;
  }
  .mm .routine .ring .lab {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
    font-weight: 700;
  }
  .mm .routine .sum {
    font-size: 0.75rem;
    color: var(--mm-dim);
  }
  .mm .routine .sum b {
    color: var(--mm-fg);
  }
  .mm .routine ul {
    list-style: none;
    margin: 0.85rem 0 0;
    padding: 0;
  }
  .mm .routine li {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.45rem 0;
    border-top: 1px solid var(--mm-line);
    font-size: 0.78rem;
    transition: opacity 0.2s;
  }
  .mm .routine li:first-child {
    border-top: 0;
  }
  .mm .routine li .chk {
    width: 1.15rem;
    height: 1.15rem;
    border-radius: 50%;
    border: 1.5px solid var(--mm-line-strong);
    flex-shrink: 0;
    background: transparent;
    cursor: pointer;
    padding: 0;
  }
  .mm .routine li.done .chk {
    background: var(--mm-green);
    border-color: var(--mm-green);
  }
  .mm .routine li.done {
    opacity: 0.55;
  }
  .mm .routine li.done .t {
    text-decoration: line-through;
  }
  .mm .routine li .d {
    font-size: 0.65rem;
    color: var(--mm-dimmer);
    margin-left: auto;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
  }

  .mm .news {
    grid-column: span 5;
    grid-row: span 3;
  }
  .mm .news .row {
    display: flex;
    gap: 0.7rem;
    padding: 0.5rem 0;
    border-top: 1px solid var(--mm-line);
  }
  .mm .news .row:first-child {
    border-top: 0;
  }
  .mm .news .src {
    font-size: 0.6rem;
    letter-spacing: 0.14em;
    color: var(--mm-accent);
    font-weight: 700;
    text-transform: uppercase;
    width: 3.3rem;
    flex-shrink: 0;
    padding-top: 0.1rem;
  }
  .mm .news .t {
    font-size: 0.78rem;
    line-height: 1.35;
  }
  .mm .news .t .m {
    font-size: 0.65rem;
    color: var(--mm-dimmer);
    margin-top: 0.1rem;
  }

  .mm .brk {
    grid-column: span 3;
    grid-row: span 3;
  }
  .mm .brk .items {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.35rem;
    margin-top: 0.55rem;
  }
  .mm .brk .i {
    background: var(--mm-panel-2);
    border: 1px solid var(--mm-line);
    border-radius: 0.5rem;
    padding: 0.4rem 0.6rem;
    font-size: 0.7rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .mm .brk .i .q {
    font-size: 0.6rem;
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    background: rgba(142, 231, 123, 0.14);
    color: var(--mm-green);
    font-weight: 700;
  }
  .mm .brk .i.low .q {
    background: rgba(255, 180, 84, 0.18);
    color: var(--mm-accent);
  }
  .mm .brk .i.crit .q {
    background: rgba(255, 133, 133, 0.18);
    color: var(--mm-red);
  }

  .mm .pod {
    grid-column: span 8;
    grid-row: span 2;
    flex-direction: row;
    align-items: center;
    gap: 1rem;
    padding: 0.9rem 1.2rem;
  }
  .mm .pod .art {
    width: 3.4rem;
    height: 3.4rem;
    border-radius: 0.8rem;
    background: linear-gradient(135deg, var(--mm-accent), var(--mm-bg-3));
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.4rem;
  }
  .mm .pod .info {
    flex: 1;
    min-width: 0;
  }
  .mm .pod .label {
    justify-content: flex-start;
    gap: 0.55rem;
  }
  .mm .pod .title {
    font-size: 0.88rem;
    font-weight: 600;
    margin-top: 0.1rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mm .pod .meta {
    font-size: 0.7rem;
    color: var(--mm-dim);
    margin-top: 0.1rem;
  }
  .mm .pod .bar {
    height: 3px;
    background: rgba(255, 255, 255, 0.14);
    border-radius: 3px;
    margin-top: 0.55rem;
    overflow: hidden;
  }
  .mm .pod .bar > span {
    display: block;
    height: 100%;
    background: var(--mm-accent);
  }
  .mm .pod .ctrls {
    display: flex;
    gap: 0.45rem;
    align-items: center;
  }
  .mm .pod .btn {
    width: 2.3rem;
    height: 2.3rem;
    border-radius: 50%;
    background: var(--mm-panel-2);
    border: 1px solid var(--mm-line-strong);
    color: var(--mm-fg);
    cursor: pointer;
    font-size: 0.82rem;
  }
  .mm .pod .btn.play {
    width: 2.9rem;
    height: 2.9rem;
    background: var(--mm-accent);
    color: #2a1608;
    border-color: var(--mm-accent);
    font-size: 1.1rem;
  }
</style>
