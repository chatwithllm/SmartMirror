<script lang="ts">
  /**
   * Reflection-first port of mockups/07-noon-work.html.
   *
   * Sections (portrait, single chromeless tile):
   *   focus        (5×6)  — pomodoro ring + session dots + reset/pause/skip
   *   clock        (3×3)  — big mono time + date + today focus tally
   *   meet         (3×3)  — next calendar event with countdown + Join
   *   kanban       (8×5)  — 4-col board (demo cards until GitHub wired)
   *   prs          (5×4)  — pull requests (demo)
   *   deploy       (3×4)  — deploy pipeline steps (demo)
   *   hosts        (8×3)  — mirror PC + demo hosts, cpu/ram/disk bars
   *   messages     (5×2)  — triaged messages (demo)
   *   goals        (3×2)  — 3 daily progress bars
   *
   * Live:
   *   clock            — local tick
   *   meet             — HA calendar first upcoming event
   *   hosts            — /api/admin/stats for mirror PC (first row)
   * Demo (swap to real integrations later):
   *   kanban / prs / deploy / msg / goals
   */
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import BaseTile from './BaseTile.svelte';

  interface Props {
    id: string;
    props?: {
      calendarEntity?: string;
      cityLabel?: string;
      pomodoroMinutes?: number;
      dailyFocusGoalMinutes?: number;
      hosts?: Array<{ name: string; ip: string; cpu: number; ram: number; disk: number }>;
    };
  }
  let { id, props = {} }: Props = $props();

  const POMO_MIN = props.pomodoroMinutes ?? 25;
  const FOCUS_GOAL_MIN = props.dailyFocusGoalMinutes ?? 360;

  // ---------- clock ----------
  let now = $state(new Date());
  let clockTimer: ReturnType<typeof setInterval> | null = null;
  const hhmm = $derived(
    now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
  );
  const hhmmss = $derived(
    now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }),
  );
  function weekNumber(d: Date): number {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const jan1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
  }
  const dline = $derived(
    `${now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · W${weekNumber(now)}`,
  );

  // ---------- calendar ----------
  type ApiEvent = {
    start?: { dateTime?: string; date?: string };
    summary?: string;
    location?: string;
    description?: string;
  };
  type MeetEvent = { start: Date; summary: string; location?: string };
  let nextMeeting = $state<MeetEvent | null>(null);
  let calendarTimer: ReturnType<typeof setInterval> | null = null;

  async function fetchCalendar(): Promise<void> {
    if (!browser) return;
    const w = window as unknown as { __HA_URL__?: string; __HA_TOKEN__?: string };
    if (!w.__HA_URL__ || !w.__HA_TOKEN__) return;
    const eid = props.calendarEntity ?? 'calendar.palakurla4340_gmail_com';
    const start = new Date().toISOString();
    const end = new Date(Date.now() + 2 * 86400 * 1000).toISOString();
    try {
      const r = await fetch(`${w.__HA_URL__}/api/calendars/${eid}?start=${start}&end=${end}`, {
        headers: { Authorization: `Bearer ${w.__HA_TOKEN__}` },
      });
      if (!r.ok) return;
      const arr = (await r.json()) as ApiEvent[];
      const first = arr
        .map((e) => ({
          date: new Date(e.start?.dateTime ?? e.start?.date ?? ''),
          summary: e.summary ?? '',
          location: (e.location ?? '').trim() || undefined,
        }))
        .filter((e) => !isNaN(e.date.getTime()) && e.date.getTime() > Date.now())
        .sort((a, b) => a.date.getTime() - b.date.getTime())[0];
      nextMeeting = first ? { start: first.date, summary: first.summary, location: first.location } : null;
    } catch {
      /* ignore */
    }
  }

  // ---------- mirror PC stats ----------
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

  // ---------- pomodoro ----------
  let pomoSec = $state(POMO_MIN * 60);
  let pomoRunning = $state(false);
  let pomoSession = $state(3); // 3 of 4
  let pomoTimer: ReturnType<typeof setInterval> | null = null;
  let todayFocusSec = $state(4 * 3600 + 22 * 60); // 4h 22m demo carry-over
  function togglePomo(): void {
    pomoRunning = !pomoRunning;
    if (pomoRunning) {
      pomoTimer = setInterval(() => {
        pomoSec = Math.max(0, pomoSec - 1);
        if (pomoSec === 0 && pomoTimer) {
          clearInterval(pomoTimer);
          pomoTimer = null;
          pomoRunning = false;
          todayFocusSec += POMO_MIN * 60;
          pomoSession = Math.min(4, pomoSession + 1);
        } else {
          // Count real focused seconds into today's tally while running.
          todayFocusSec += 1;
        }
      }, 1000);
    } else if (pomoTimer) {
      clearInterval(pomoTimer);
      pomoTimer = null;
    }
  }
  function resetPomo(): void {
    pomoSec = POMO_MIN * 60;
    if (pomoTimer) {
      clearInterval(pomoTimer);
      pomoTimer = null;
    }
    pomoRunning = false;
  }
  function skipPomo(): void {
    pomoSec = 5 * 60;
    if (pomoTimer) {
      clearInterval(pomoTimer);
      pomoTimer = null;
    }
    pomoRunning = false;
  }
  const pomoDisplay = $derived.by(() => {
    const m = String(Math.floor(pomoSec / 60)).padStart(2, '0');
    const s = String(pomoSec % 60).padStart(2, '0');
    return `${m}:${s}`;
  });
  const pomoPct = $derived(Math.max(0, Math.min(1, pomoSec / (POMO_MIN * 60))));
  const CIRC = 2 * Math.PI * 120;
  const ringOffset = $derived(CIRC * (1 - pomoPct));
  const todayFocusLabel = $derived.by(() => {
    const m = Math.floor(todayFocusSec / 60);
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  });
  const focusGoalPct = $derived(Math.min(100, Math.round((todayFocusSec / 60 / FOCUS_GOAL_MIN) * 100)));

  // ---------- meeting countdown ----------
  const meetIn = $derived.by(() => {
    if (!nextMeeting) return '—';
    const diff = nextMeeting.start.getTime() - now.getTime();
    if (diff <= 0) return 'now';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) {
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      return `${m}:${String(s).padStart(2, '0')}`;
    }
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  });
  const meetTime = $derived.by(() => {
    if (!nextMeeting) return '';
    return nextMeeting.start.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  });
  const meetIsSoon = $derived.by(() => {
    if (!nextMeeting) return false;
    const diff = nextMeeting.start.getTime() - now.getTime();
    return diff > 0 && diff < 15 * 60 * 1000;
  });

  // ---------- hosts (live + demo) ----------
  const demoHosts: HostStat[] = [
    { name: 'pve-node-a', ip: '10.0.0.11', cpu: 22, ram: 48, disk: 55 },
    { name: 'nvr-box', ip: '10.0.0.22', cpu: 46, ram: 71, disk: 82 },
    { name: 'nas-01', ip: '10.0.0.21', cpu: 12, ram: 34, disk: 71 },
  ];
  const hosts = $derived.by(() => {
    if (props.hosts) return props.hosts;
    const out: HostStat[] = [];
    if (mirrorStats) out.push(mirrorStats);
    out.push(...demoHosts.slice(0, 4 - out.length));
    return out;
  });

  function metricBandColor(v: number): 'ok' | 'high' | 'crit' {
    if (v >= 80) return 'crit';
    if (v >= 60) return 'high';
    return 'ok';
  }

  // ---------- mount/destroy ----------
  onMount(() => {
    if (!browser) return;
    clockTimer = setInterval(() => (now = new Date()), 1000);
    void fetchCalendar();
    calendarTimer = setInterval(fetchCalendar, 5 * 60_000);
    void fetchStats();
    statsTimer = setInterval(fetchStats, 10_000);
  });
  onDestroy(() => {
    if (clockTimer) clearInterval(clockTimer);
    if (calendarTimer) clearInterval(calendarTimer);
    if (statsTimer) clearInterval(statsTimer);
    if (pomoTimer) clearInterval(pomoTimer);
  });

  // ---------- demo static data (swap later) ----------
  const KAN_COLS: Array<{
    name: string;
    count: number;
    items: Array<{ id: string; title: string; labels?: Array<{ kind: string; text: string }> }>;
  }> = [
    {
      name: 'Backlog',
      count: 12,
      items: [
        { id: '#131', title: 'Port rotation config writer', labels: [{ kind: 'chore', text: 'chore' }] },
        { id: '#128', title: 'Guest mode layout preset', labels: [{ kind: 'feat', text: 'feat' }] },
        { id: '#125', title: 'Frigate MJPEG fallback' },
      ],
    },
    {
      name: 'In progress',
      count: 3,
      items: [
        { id: '#142', title: 'Layout diff + FLIP', labels: [{ kind: 'feat', text: 'feat' }, { kind: 'urg', text: 'URG' }] },
        { id: '#140', title: 'HA JSON writer', labels: [{ kind: 'feat', text: 'feat' }] },
        { id: '#138', title: 'Kiosk autostart', labels: [{ kind: 'chore', text: 'chore' }] },
      ],
    },
    {
      name: 'Review',
      count: 4,
      items: [
        { id: '#137', title: 'SvelteKit skeleton', labels: [{ kind: 'feat', text: 'feat' }] },
        { id: '#134', title: 'Plex HLS tile', labels: [{ kind: 'feat', text: 'feat' }] },
        { id: '#133', title: 'Audio guard', labels: [{ kind: 'bug', text: 'bug' }] },
      ],
    },
    {
      name: 'Done · today',
      count: 5,
      items: [
        { id: '#141', title: '10 portrait mockups', labels: [{ kind: 'feat', text: 'feat' }] },
        { id: '#139', title: 'Design spec v1' },
        { id: '#136', title: 'Tile registry' },
      ],
    },
  ];

  const PRS = [
    { state: 'wait', color: 'amber', title: 'Layout diff + FLIP', meta: '#142 · waiting sam · 3h', checks: ['ok', 'ok', 'warn'], age: '3h' },
    { state: 'ready', color: 'green', title: 'Plex HLS tile', meta: '#134 · approved · merge ready', checks: ['ok', 'ok', 'ok'], age: '23m' },
    { state: 'changes', color: 'red', title: 'Audio guard', meta: '#133 · changes requested', checks: ['ok', 'bad', 'ok'], age: '1h' },
    { state: 'ci', color: 'accent', title: 'SvelteKit skeleton', meta: '#137 · CI running', checks: ['ok', 'info', 'info'], age: '8m' },
  ];
  const prStateGlyph: Record<string, string> = { wait: '◕', ready: '✓', changes: '◐', ci: '◉' };

  const DEPLOY_STEPS = [
    { label: 'Build', duration: '42s', state: 'done' },
    { label: 'Test', duration: '1m 14s', state: 'done' },
    { label: 'Scan', duration: '22s', state: 'done' },
    { label: 'Deploy', duration: '58s', state: 'now' },
    { label: 'Smoke', duration: '—', state: 'todo' },
    { label: 'Promote', duration: '—', state: 'todo' },
  ];

  const MSGS = [
    { name: 'Sam · slack', avatar: 'SM', avClass: 'sam', time: '2m', preview: 'Can you rebase #142 on main?' },
    { name: 'Kai · review', avatar: 'KJ', avClass: 'kai', time: '1h', preview: 'Comments on #133 — one blocker, rest nits.' },
  ];

  const GOALS = $derived([
    { name: 'Focus · 6h', current: todayFocusLabel, pct: focusGoalPct, color: 'accent' },
    { name: 'PRs · 3', current: '2', pct: 66, color: 'green' },
    { name: 'Steps · 8k', current: '2.1k', pct: 26, color: 'amber' },
  ]);
</script>

<BaseTile {id} type="work" chromeless={true} label="work">
  <div class="wk" data-testid="work">
    <div class="top">
      <span class="dnd">DND · focus</span>
      <span class="now">{hhmmss}</span>
    </div>

    <div class="grid">
      <!-- FOCUS -->
      <section class="focus">
        <div class="phase">Focus · Deep Work</div>
        <div class="ring-wrap">
          <svg viewBox="0 0 280 280">
            <circle cx="140" cy="140" r="120" fill="none" stroke="rgba(94,173,255,0.14)" stroke-width="10" />
            <defs>
              <linearGradient id="wk-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#5eadff" />
                <stop offset="100%" stop-color="#b887ff" />
              </linearGradient>
            </defs>
            <circle
              cx="140"
              cy="140"
              r="120"
              fill="none"
              stroke="url(#wk-grad)"
              stroke-width="10"
              stroke-dasharray={CIRC}
              stroke-dashoffset={ringOffset}
              stroke-linecap="round"
              transform="rotate(-90 140 140)"
            />
          </svg>
          <div class="inner">
            <div class="t mono">{pomoDisplay}</div>
            <div class="p">Session {pomoSession} of 4</div>
          </div>
        </div>
        <div class="bar-stages">
          {#each [1, 2, 3, 4] as sx (sx)}
            <div
              class="s"
              class:done={sx < pomoSession}
              class:now={sx === pomoSession && pomoRunning}
            ></div>
          {/each}
        </div>
        <div class="ctrls">
          <button class="btn" onclick={resetPomo}>↺ Reset</button>
          <button class="btn primary" onclick={togglePomo}>
            {pomoRunning ? '❚❚ Pause' : '▶ Start'}
          </button>
          <button class="btn" onclick={skipPomo}>⏭ Break</button>
        </div>
      </section>

      <!-- CLOCK -->
      <section class="cclock">
        <div class="lbl"><span>Now</span><span>{props.cityLabel ?? ''}</span></div>
        <div class="t mono">{hhmm}</div>
        <div class="d">{dline}</div>
        <div class="today">
          <span>Today <b>{todayFocusLabel}</b></span>
          <span>Goal <b>{Math.round(FOCUS_GOAL_MIN / 60)}h</b></span>
        </div>
      </section>

      <!-- MEETING -->
      <section class="meet" class:soon={meetIsSoon}>
        <div class="lbl">
          <span>Next meeting</span>
          <span>in <b class="mono">{meetIn}</b></span>
        </div>
        <div class="in">
          {meetIsSoon ? 'Starting soon' : nextMeeting ? 'Upcoming' : 'No meeting'}
        </div>
        <div class="t">{nextMeeting?.summary ?? '—'}</div>
        <div class="m">
          {#if nextMeeting}
            {meetTime} · {nextMeeting.location ?? 'no location'}
          {:else}
            calendar clear
          {/if}
        </div>
        {#if nextMeeting}
          <button class="join">Join call</button>
        {/if}
      </section>

      <!-- KANBAN -->
      <section class="kan">
        <div class="lbl"><span>Projects · active</span><span>3 of 7 repos</span></div>
        <div class="board">
          {#each KAN_COLS as col (col.name)}
            <div class="col">
              <h5>{col.name} <span class="n">{col.count}</span></h5>
              {#each col.items as it (it.id)}
                <div class="tk" class:done={col.name.startsWith('Done')}>
                  <div class="id mono">{it.id}</div>
                  <div class="tt">{it.title}</div>
                  {#if it.labels}
                    <div class="labels">
                      {#each it.labels as l, i (i)}
                        <span class="lab {l.kind}">{l.text}</span>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/each}
        </div>
      </section>

      <!-- PRs -->
      <section class="prs">
        <div class="lbl"><span>Pull requests</span><span>{PRS.length} open</span></div>
        <ul>
          {#each PRS as p (p.title)}
            <li>
              <span class="state {p.color}">{prStateGlyph[p.state]}</span>
              <div class="tt">
                <div class="ttl">{p.title}</div>
                <div class="m">{p.meta}</div>
              </div>
              <span class="chk">
                {#each p.checks as c, i (i)}
                  <span class={c}></span>
                {/each}
              </span>
              <span class="n mono">{p.age}</span>
            </li>
          {/each}
        </ul>
      </section>

      <!-- DEPLOY -->
      <section class="dep">
        <div class="lbl"><span>Deploy · staging</span><span class="live">● live</span></div>
        <div class="rev mono">v2.4.1 · 0x7a4c · 14m</div>
        <div class="pipe">
          {#each DEPLOY_STEPS as s (s.label)}
            <div class="step {s.state}">
              <div class="mark">{s.state === 'done' ? '✓' : s.state === 'now' ? '●' : '○'}</div>
              <div class="t">{s.label}</div>
              <div class="d mono">{s.duration}</div>
            </div>
          {/each}
        </div>
      </section>

      <!-- HOSTS -->
      <section class="hosts">
        <div class="lbl"><span>Hosts · health</span><span>all up</span></div>
        <div class="hlist">
          {#each hosts.slice(0, 4) as h (h.name)}
            <div class="h">
              <div>
                <div class="n">{h.name}</div>
                <div class="ip mono">{h.ip}</div>
              </div>
              {#each [{ lab: 'cpu', v: h.cpu }, { lab: 'ram', v: h.ram }, { lab: 'disk', v: h.disk }] as mm (mm.lab)}
                <div class="m {metricBandColor(mm.v)}">
                  <span class="lab2">{mm.lab}</span>
                  <span class="v">{mm.v}</span>
                  <div class="bar"><span style:width={`${mm.v}%`}></span></div>
                </div>
              {/each}
            </div>
          {/each}
        </div>
      </section>

      <!-- MESSAGES -->
      <section class="msg">
        <div class="lbl"><span>Messages · triaged</span><span>2 unread</span></div>
        <div class="mlist">
          {#each MSGS as m (m.name)}
            <div class="r">
              <div class="av {m.avClass}">{m.avatar}</div>
              <div class="b">
                <div class="n">
                  <span class="nn">{m.name}</span>
                  <span class="tt mono">{m.time}</span>
                </div>
                <div class="p">{m.preview}</div>
              </div>
            </div>
          {/each}
        </div>
      </section>

      <!-- GOALS -->
      <section class="goals">
        <div class="lbl"><span>Goals · today</span><span>3</span></div>
        <div class="glist">
          {#each GOALS as g (g.name)}
            <div class="g">
              <div class="n">
                <span>{g.name}</span>
                <span class="p mono">{g.current}</span>
              </div>
              <div class="bar"><span style:width={`${g.pct}%`} style:background={`var(--w-${g.color})`}></span></div>
            </div>
          {/each}
        </div>
      </section>
    </div>
  </div>
</BaseTile>

<style>
  .wk {
    --w-fg: #ffffff;
    --w-dim: rgba(255, 255, 255, 0.82);
    --w-dimmer: rgba(255, 255, 255, 0.62);
    --w-line: rgba(255, 255, 255, 0.18);
    --w-line-strong: rgba(255, 255, 255, 0.35);
    --w-accent: #5eadff;
    --w-violet: #b887ff;
    --w-green: #6ee7a7;
    --w-amber: #ffb454;
    --w-red: #ff6b6b;
    --w-pink: #ff87c3;

    background: #000;
    color: var(--w-fg);
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
  }
  :global(:root[data-mode='light']) .wk {
    --w-fg: #1c1a18;
    --w-dim: rgba(28, 26, 24, 0.82);
    --w-dimmer: rgba(28, 26, 24, 0.52);
    --w-line: rgba(28, 26, 24, 0.18);
    --w-line-strong: rgba(28, 26, 24, 0.35);
    --w-accent: #1f6cc7;
    --w-violet: #7b37c4;
    --w-green: #2d8538;
    --w-amber: #a66a12;
    --w-red: #a82525;
    background: #f5f0e6;
  }

  .mono {
    font-family: 'JetBrains Mono', ui-monospace, 'Menlo', monospace;
  }

  .top {
    position: absolute;
    top: 1.3rem;
    right: 1.6rem;
    display: flex;
    gap: 0.8rem;
    z-index: 3;
    align-items: center;
    font-size: 0.6rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--w-dim);
    font-weight: 600;
  }
  .top .dnd {
    padding: 0.25rem 0.65rem;
    border-radius: 999px;
    background: rgba(255, 107, 107, 0.15);
    color: var(--w-red);
    border: 1px solid var(--w-red);
    letter-spacing: 0.18em;
    font-weight: 700;
  }
  .top .now {
    color: var(--w-fg);
    font-weight: 700;
  }

  .grid {
    width: 100%;
    height: 100%;
    padding: 1.6rem 1.8rem 1.8rem;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    /* Row bands:
     *   (focus 6 || cclock 3 + meet 3) + kan 5 + (prs 4 || dep 4) +
     *   hosts 3 + (msg 2 || goals 2) = 6 + 5 + 4 + 3 + 2 = 20 */
    grid-template-rows: repeat(20, minmax(0, 1fr));
    gap: 0.9rem;
  }

  .lbl {
    font-size: 0.55rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--w-dim);
    font-weight: 700;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .lbl .live {
    color: var(--w-accent);
    font-weight: 700;
  }

  .dot {
    width: 0.35rem;
    height: 0.35rem;
    border-radius: 50%;
    display: inline-block;
  }

  /* ---- Focus ---- */
  .focus {
    grid-column: span 5;
    grid-row: span 6;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.5rem 0.6rem;
  }
  .focus .phase {
    font-size: 0.65rem;
    letter-spacing: 0.3em;
    color: var(--w-accent);
    text-transform: uppercase;
    font-weight: 800;
  }
  .focus .ring-wrap {
    position: relative;
    width: 85%;
    aspect-ratio: 1;
    max-width: 18rem;
  }
  .focus .ring-wrap svg {
    width: 100%;
    height: 100%;
  }
  .focus .ring-wrap .inner {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .focus .ring-wrap .t {
    font-size: 3.8rem;
    font-weight: 700;
    letter-spacing: -0.04em;
    line-height: 1;
    color: var(--w-fg);
  }
  .focus .ring-wrap .p {
    font-size: 0.6rem;
    letter-spacing: 0.18em;
    color: var(--w-dim);
    text-transform: uppercase;
    margin-top: 0.4rem;
    font-weight: 600;
  }
  .focus .bar-stages {
    display: flex;
    gap: 0.3rem;
    width: 80%;
  }
  .focus .bar-stages .s {
    flex: 1;
    height: 5px;
    background: var(--w-line);
    border-radius: 3px;
  }
  .focus .bar-stages .s.done {
    background: var(--w-accent);
  }
  .focus .bar-stages .s.now {
    background: var(--w-accent);
    animation: breathe 2s ease-in-out infinite;
  }
  @keyframes breathe {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }
  .focus .ctrls {
    display: flex;
    gap: 0.5rem;
    width: 80%;
  }
  .focus .btn {
    flex: 1;
    padding: 0.6rem 0.4rem;
    border: 1px solid var(--w-line-strong);
    background: transparent;
    color: var(--w-fg);
    border-radius: 10px;
    font-family: inherit;
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .focus .btn.primary {
    background: var(--w-accent);
    color: #031022;
    border-color: var(--w-accent);
  }

  /* ---- Clock ---- */
  .cclock {
    grid-column: span 3;
    grid-row: span 3;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .cclock .t {
    font-size: 3.6rem;
    font-weight: 700;
    letter-spacing: -0.04em;
    line-height: 1;
    margin-top: 0.2rem;
    color: var(--w-fg);
  }
  .cclock .d {
    font-size: 0.75rem;
    color: var(--w-dim);
    font-weight: 500;
    margin-top: 0.15rem;
  }
  .cclock .today {
    margin-top: auto;
    display: flex;
    justify-content: space-between;
    font-size: 0.7rem;
    color: var(--w-dim);
    padding-top: 0.45rem;
    border-top: 1px solid var(--w-line);
    font-weight: 500;
  }
  .cclock .today b {
    color: var(--w-fg);
  }

  /* ---- Meeting ---- */
  .meet {
    grid-column: span 3;
    grid-row: span 3;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .meet .in {
    font-size: 0.62rem;
    letter-spacing: 0.22em;
    color: var(--w-amber);
    text-transform: uppercase;
    font-weight: 800;
    margin-top: 0.2rem;
  }
  .meet.soon .in,
  .meet.soon .lbl b {
    color: var(--w-red);
  }
  .meet .t {
    font-size: 1.1rem;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: -0.01em;
    color: var(--w-fg);
    margin-top: 0.2rem;
  }
  .meet .m {
    font-size: 0.72rem;
    color: var(--w-dim);
    font-weight: 500;
  }
  .meet .join {
    margin-top: auto;
    padding: 0.5rem 0.8rem;
    background: var(--w-red);
    color: #fff;
    border: 0;
    border-radius: 10px;
    font-family: inherit;
    font-weight: 800;
    font-size: 0.65rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    align-self: flex-start;
    cursor: pointer;
  }

  /* ---- Kanban ---- */
  .kan {
    grid-column: span 8;
    grid-row: span 5;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .kan .board {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.6rem;
    margin-top: 0.4rem;
    flex: 1;
    min-height: 0;
  }
  .kan .col {
    border: 1px solid var(--w-line);
    border-radius: 10px;
    padding: 0.55rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    overflow: hidden;
  }
  .kan .col h5 {
    font-size: 0.55rem;
    letter-spacing: 0.2em;
    color: var(--w-dim);
    text-transform: uppercase;
    font-weight: 800;
    display: flex;
    justify-content: space-between;
  }
  .kan .col h5 .n {
    color: var(--w-fg);
  }
  .kan .tk {
    border: 1px solid var(--w-line);
    border-radius: 6px;
    padding: 0.5rem 0.6rem;
    font-size: 0.72rem;
    color: var(--w-fg);
  }
  .kan .tk.done {
    opacity: 0.55;
  }
  .kan .tk .id {
    font-size: 0.6rem;
    color: var(--w-dimmer);
    font-weight: 600;
  }
  .kan .tk .tt {
    font-size: 0.72rem;
    margin-top: 0.1rem;
    line-height: 1.3;
    font-weight: 600;
  }
  .kan .tk .labels {
    display: flex;
    gap: 0.25rem;
    margin-top: 0.35rem;
    flex-wrap: wrap;
  }
  .kan .tk .lab {
    font-size: 0.55rem;
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
    font-weight: 700;
    letter-spacing: 0.05em;
  }
  .kan .tk .lab.bug {
    color: var(--w-red);
    border: 1px solid var(--w-red);
  }
  .kan .tk .lab.feat {
    color: var(--w-green);
    border: 1px solid var(--w-green);
  }
  .kan .tk .lab.chore {
    color: var(--w-amber);
    border: 1px solid var(--w-amber);
  }
  .kan .tk .lab.urg {
    background: var(--w-red);
    color: #fff;
  }

  /* ---- PRs ---- */
  .prs {
    grid-column: span 5;
    grid-row: span 4;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .prs ul {
    list-style: none;
    margin: 0;
    padding: 0;
    flex: 1;
  }
  .prs li {
    display: flex;
    gap: 0.6rem;
    padding: 0.5rem 0;
    border-top: 1px solid var(--w-line);
    font-size: 0.75rem;
    align-items: center;
    font-weight: 500;
  }
  .prs li:first-child {
    border-top: 0;
  }
  .prs .state {
    font-size: 1rem;
    width: 1.1rem;
    flex-shrink: 0;
    font-weight: 700;
  }
  .prs .state.amber {
    color: var(--w-amber);
  }
  .prs .state.green {
    color: var(--w-green);
  }
  .prs .state.red {
    color: var(--w-red);
  }
  .prs .state.accent {
    color: var(--w-accent);
  }
  .prs .tt {
    flex: 1;
    min-width: 0;
  }
  .prs .tt .ttl {
    font-weight: 600;
    color: var(--w-fg);
  }
  .prs .tt .m {
    font-size: 0.63rem;
    color: var(--w-dim);
    margin-top: 0.1rem;
  }
  .prs .chk {
    display: flex;
    gap: 0.15rem;
  }
  .prs .chk span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .prs .chk .ok {
    background: var(--w-green);
  }
  .prs .chk .warn {
    background: var(--w-amber);
  }
  .prs .chk .bad {
    background: var(--w-red);
  }
  .prs .chk .info {
    background: var(--w-accent);
  }
  .prs .n {
    font-size: 0.6rem;
    color: var(--w-dimmer);
    font-weight: 600;
  }

  /* ---- Deploy ---- */
  .dep {
    grid-column: span 3;
    grid-row: span 4;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .dep .rev {
    font-size: 0.68rem;
    color: var(--w-accent);
    font-weight: 700;
    margin-top: 0.2rem;
  }
  .dep .pipe {
    margin-top: 0.45rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .dep .step {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    font-size: 0.72rem;
    color: var(--w-fg);
    font-weight: 500;
  }
  .dep .step .mark {
    width: 1.1rem;
    height: 1.1rem;
    border-radius: 50%;
    border: 1.5px solid var(--w-line-strong);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.6rem;
    flex-shrink: 0;
  }
  .dep .step.done .mark {
    background: var(--w-green);
    border-color: var(--w-green);
    color: #031022;
    font-weight: 800;
  }
  .dep .step.now .mark {
    background: var(--w-accent);
    border-color: var(--w-accent);
    color: #031022;
    font-weight: 800;
    animation: pulse 1.4s infinite;
  }
  .dep .step.todo {
    color: var(--w-dim);
  }
  @keyframes pulse {
    0%,
    100% {
      box-shadow: 0 0 0 0 rgba(94, 173, 255, 0.55);
    }
    50% {
      box-shadow: 0 0 0 8px rgba(94, 173, 255, 0);
    }
  }
  .dep .step .t {
    flex: 1;
    font-weight: 600;
  }
  .dep .step .d {
    font-size: 0.6rem;
    color: var(--w-dimmer);
    font-weight: 600;
  }

  /* ---- Hosts ---- */
  .hosts {
    grid-column: span 8;
    grid-row: span 3;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .hosts .hlist {
    margin-top: 0.4rem;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.35rem 0.9rem;
  }
  .hosts .h {
    border: 1px solid var(--w-line);
    border-radius: 8px;
    padding: 0.45rem 0.55rem;
    display: grid;
    grid-template-columns: 1fr repeat(3, 1fr);
    gap: 0.5rem;
    align-items: center;
    font-size: 0.65rem;
  }
  .hosts .n {
    font-weight: 700;
    font-size: 0.78rem;
    color: var(--w-fg);
  }
  .hosts .ip {
    font-size: 0.58rem;
    color: var(--w-dimmer);
    font-weight: 500;
    letter-spacing: 0.06em;
  }
  .hosts .m {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .hosts .m .lab2 {
    font-size: 0.55rem;
    color: var(--w-dim);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-weight: 700;
  }
  .hosts .m .v {
    font-weight: 700;
    font-size: 0.82rem;
    color: var(--w-fg);
  }
  .hosts .m .bar {
    height: 3px;
    background: var(--w-line);
    border-radius: 2px;
    overflow: hidden;
  }
  .hosts .m .bar > span {
    display: block;
    height: 100%;
    background: var(--w-accent);
  }
  .hosts .m.high .bar > span {
    background: var(--w-amber);
  }
  .hosts .m.crit .bar > span {
    background: var(--w-red);
  }
  .hosts .m.crit .v {
    color: var(--w-red);
  }

  /* ---- Messages ---- */
  .msg {
    grid-column: span 5;
    grid-row: span 2;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .msg .mlist {
    margin-top: 0.3rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  .msg .r {
    display: flex;
    gap: 0.55rem;
    font-size: 0.72rem;
  }
  .msg .av {
    width: 1.8rem;
    height: 1.8rem;
    border-radius: 50%;
    flex-shrink: 0;
    background: linear-gradient(135deg, var(--w-accent), var(--w-violet));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    font-weight: 800;
    color: #fff;
  }
  .msg .av.sam {
    background: linear-gradient(135deg, var(--w-green), var(--w-accent));
  }
  .msg .av.kai {
    background: linear-gradient(135deg, var(--w-pink), var(--w-violet));
  }
  .msg .b {
    flex: 1;
    min-width: 0;
  }
  .msg .n {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .msg .n .nn {
    font-weight: 700;
    color: var(--w-fg);
  }
  .msg .n .tt {
    font-size: 0.6rem;
    color: var(--w-dimmer);
  }
  .msg .p {
    font-size: 0.68rem;
    color: var(--w-dim);
    font-weight: 500;
  }

  /* ---- Goals ---- */
  .goals {
    grid-column: span 3;
    grid-row: span 2;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .goals .glist {
    margin-top: 0.3rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  .goals .g .n {
    display: flex;
    justify-content: space-between;
    font-size: 0.68rem;
    color: var(--w-fg);
    font-weight: 600;
  }
  .goals .g .n .p {
    color: var(--w-dim);
    font-weight: 600;
  }
  .goals .g .bar {
    height: 4px;
    background: var(--w-line);
    border-radius: 3px;
    overflow: hidden;
    margin-top: 0.25rem;
  }
  .goals .g .bar > span {
    display: block;
    height: 100%;
    background: var(--w-accent);
  }
</style>
