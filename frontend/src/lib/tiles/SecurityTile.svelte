<script lang="ts">
  /**
   * Reflection-first port of mockups/10-security-night.html.
   *
   * Single full-bleed tile, pure #000 bg, cyan accent, no panel fills
   * (same design language as GlassTile/WorkTile).
   *
   * Sections:
   *   clk (3×2) + stats (5×2)
   *   cams (8×7)  — hero + 4 sub cams, Frigate stream URLs
   *   alarm (8×4) — state + zones + arm modes
   *   events (8×6) — demo timeline with ack buttons
   *   sensors (8×4) — 12 Zigbee/Z-wave cells
   *   actions (8×1) — quick actions
   *
   * Live: clock, all 5 cameras.
   * Demo: stats, alarm state, zones, events, sensors, actions
   *       (swap to real HA entities later).
   */
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import BaseTile from './BaseTile.svelte';
  import { watchEntity, type HaEntity } from '$lib/ha/entity.js';

  interface Props {
    id: string;
    props?: {
      cameras?: string[];
      heroCamera?: string;
    };
  }
  let { id, props = {} }: Props = $props();

  const CAM_LIST = props.cameras ?? [];
  const HERO_CAM = props.heroCamera ?? CAM_LIST[0];
  const SUB_CAMS = CAM_LIST.filter((c) => c !== HERO_CAM);

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
  const dline = $derived(
    now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase(),
  );

  // ---------- camera entities ----------
  const cams = $state<Record<string, HaEntity | null>>({});
  const stopFns: Array<() => void> = [];
  function watchCam(eid: string): void {
    const w = watchEntity(eid, 10_000);
    const unsub = w.store.subscribe((e) => {
      cams[eid] = e;
      // Svelte 5 needs the identity change to trigger reactive derived.
      (cams as Record<string, HaEntity | null>)[eid] = e;
    });
    stopFns.push(() => {
      unsub();
      w.stop();
    });
  }

  function camUrl(eid: string): string {
    const entity = cams[eid];
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

  function camLabel(eid: string, idx: number): string {
    const name = eid.replace(/^camera\./, '').replace(/_/g, ' ').toUpperCase();
    const n = String(idx + 1).padStart(2, '0');
    return `CAM-${n} · ${name}`;
  }

  // ---------- alarm state ----------
  type ArmMode = 'home' | 'away' | 'night' | 'disarm';
  let armMode = $state<ArmMode>('away');
  const armLabel = $derived.by(() =>
    armMode === 'disarm' ? 'DISARMED' : `ARMED · ${armMode.toUpperCase()}`,
  );
  const armColor = $derived.by(() => {
    if (armMode === 'disarm') return 'var(--s-red)';
    if (armMode === 'night') return 'var(--s-violet)';
    return 'var(--s-green)';
  });
  function setArm(m: ArmMode): void {
    armMode = m;
  }

  // ---------- mount ----------
  onMount(() => {
    if (!browser) return;
    clockTimer = setInterval(() => (now = new Date()), 1000);
    for (const eid of CAM_LIST) watchCam(eid);
  });
  onDestroy(() => {
    if (clockTimer) clearInterval(clockTimer);
    for (const fn of stopFns) fn();
  });

  // ---------- demo data ----------
  const ZONES = [
    { name: 'Front door', state: 'CLOSED', open: false },
    { name: 'Back door', state: 'CLOSED', open: false },
    { name: 'Garage side', state: 'OPEN', open: true },
    { name: 'Windows · 12/12', state: 'SEALED', open: false },
    { name: 'Motion · interior', state: 'ACTIVE', open: false },
    { name: 'Glass break', state: 'ARMED', open: false },
  ];

  const EVENTS = [
    { severity: 'alert', category: 'person', title: 'Person · driveway', meta: 'cam-01 · 94% · unknown', ts: 'now', ack: false },
    { severity: 'unack', category: 'car', title: 'Car stopped · driveway', meta: 'cam-01 · silver sedan · 32s', ts: '3m', ack: false },
    { severity: 'unack', category: 'pkg', title: 'Package delivered', meta: 'cam-02 · FedEx', ts: '18m', ack: false },
    { severity: 'ok', category: 'motion', title: 'Motion · backyard', meta: 'cam-03 · cat · 88%', ts: '42m', ack: true },
    { severity: 'ok', category: 'person', title: 'Face · known', meta: 'cam-02 · 98% · arrived', ts: '2h', ack: true },
    { severity: 'ok', category: 'motion', title: 'Garage door opened', meta: 'automation · scheduled', ts: '2h', ack: true },
    { severity: 'ok', category: 'person', title: 'Person · side yard', meta: 'cam-05 · known · neighbor', ts: '4h', ack: true },
    { severity: 'ok', category: 'motion', title: 'Motion · driveway', meta: 'cam-01 · unknown', ts: '5h', ack: true },
  ];

  const SENSORS = [
    { name: 'Front door', meta: 'contact', state: 'CLOSED', band: 'ok' },
    { name: 'Back door', meta: 'contact', state: 'CLOSED', band: 'ok' },
    { name: 'Garage side', meta: 'contact', state: 'OPEN 2m', band: 'open' },
    { name: 'Kitchen', meta: 'motion', state: 'CLEAR', band: 'ok' },
    { name: 'Hallway', meta: 'motion', state: 'CLEAR', band: 'ok' },
    { name: 'Living', meta: 'motion', state: 'CLEAR', band: 'ok' },
    { name: 'Smoke · 1', meta: 'ok', state: 'OK', band: 'ok' },
    { name: 'Smoke · 2', meta: 'ok', state: 'OK', band: 'ok' },
    { name: 'Leak · kitchen', meta: 'dry', state: 'DRY', band: 'ok' },
    { name: 'Leak · bath', meta: 'dry', state: 'DRY', band: 'ok' },
    { name: 'Window · office', meta: 'battery 12%', state: 'LOW BAT', band: 'bat' },
    { name: 'Garage door', meta: 'closed', state: 'CLOSED', band: 'ok' },
  ];

  const EVENT_FILTERS = ['all', 'person', 'car', 'pkg', 'motion'];
  let eventFilter = $state('all');
  const filteredEvents = $derived(
    eventFilter === 'all' ? EVENTS : EVENTS.filter((e) => e.category === eventFilter),
  );
  const unackCount = $derived(EVENTS.filter((e) => !e.ack).length);

  const QUICK_ACTIONS = [
    { icon: '🔆', label: 'All lights on' },
    { icon: '🔒', label: 'Lock all' },
    { icon: '⚫', label: 'Start recording' },
    { icon: '⚠', label: 'Panic' },
  ];
</script>

<BaseTile {id} type="security" chromeless={true} label="security">
  <div class="sec" data-testid="security">
    <div class="top">
      <span class="armed" style:color={armColor} style:border-color={armColor}>
        <span class="adot" style:background={armColor}></span>
        {armLabel}
      </span>
      <span class="now mono">{hhmmss}</span>
    </div>

    <div class="grid">
      <!-- CLOCK -->
      <section class="clk">
        <div class="lbl"><span>Local time</span><span>CDT</span></div>
        <div class="t mono">{hhmm}</div>
        <div class="d mono">{dline}</div>
        <div class="since mono">Night mode · sunrise 06:39</div>
      </section>

      <!-- 24h STATS -->
      <section class="stats">
        <div class="lbl"><span>24h stats</span><span>all zones</span></div>
        <div class="sgrid">
          <div class="x">
            <div class="k mono">Events</div>
            <div class="v mono">142</div>
            <div class="m">↓ 12 vs avg</div>
          </div>
          <div class="x">
            <div class="k mono">Persons</div>
            <div class="v mono warn">8</div>
            <div class="m">3 unknown</div>
          </div>
          <div class="x">
            <div class="k mono">Unack</div>
            <div class="v mono amber">{unackCount}</div>
            <div class="m">oldest 18m</div>
          </div>
        </div>
      </section>

      <!-- CAMS -->
      <section class="cams">
        <div class="ctop">
          <div class="l mono">
            <span>▣ FRIGATE · NVR</span>
            <span class="count">{CAM_LIST.length} cams · {CAM_LIST.length} live</span>
          </div>
          <div class="r">
            <button class="cbtn on">Live</button>
            <button class="cbtn">Events</button>
            <button class="cbtn">Quad</button>
          </div>
        </div>
        <div class="cgrid">
          <div class="c big">
            {#if camUrl(HERO_CAM)}
              <img src={camUrl(HERO_CAM)} alt="" referrerpolicy="no-referrer" />
            {/if}
            <div class="clab mono">{camLabel(HERO_CAM, 0)}</div>
            <div class="crec mono">REC · 2160p</div>
            <div class="cdetect mono">⚑ PERSON · 94%</div>
            <div class="bbox" style="left:42%;top:38%;width:22%;height:38%">
              <span class="bboxl mono">person 94%</span>
            </div>
          </div>
          {#each SUB_CAMS as eid, i (eid)}
            <div class="c">
              {#if camUrl(eid)}
                <img src={camUrl(eid)} alt="" referrerpolicy="no-referrer" />
              {/if}
              <div class="clab mono">{camLabel(eid, i + 1)}</div>
              <div class="crec mono">REC</div>
            </div>
          {/each}
        </div>
      </section>

      <!-- ALARM -->
      <section class="alarm">
        <div class="lbl"><span>Alarm system</span><span>last arm 22:30 · mirror</span></div>
        <div class="astate mono" style:color={armColor}>{armLabel}</div>
        <div class="asub">No faults · all zones normal</div>
        <div class="zones">
          {#each ZONES as z (z.name)}
            <div class="z" class:open={z.open}>
              <span class="zn">{z.name}</span>
              <span class="zs mono">{z.state}</span>
            </div>
          {/each}
        </div>
        <div class="modes">
          {#each [['home', 'Home'], ['away', 'Away'], ['night', 'Night'], ['disarm', 'Disarm']] as pair (pair[0])}
            <button
              class="mbtn"
              class:on={armMode === pair[0]}
              class:disarm={pair[0] === 'disarm'}
              onclick={() => setArm(pair[0] as ArmMode)}
            >
              {pair[1]}
            </button>
          {/each}
        </div>
      </section>

      <!-- EVENTS -->
      <section class="events">
        <div class="lbl"><span>Event timeline</span><span>{unackCount} unack</span></div>
        <div class="ectrls">
          {#each EVENT_FILTERS as f (f)}
            <button class="ef" class:on={eventFilter === f} onclick={() => (eventFilter = f)}>
              {f}
            </button>
          {/each}
        </div>
        <ul class="elist">
          {#each filteredEvents as ev, i (i)}
            <li class="ev" class:alert={ev.severity === 'alert'} class:unack={ev.severity === 'unack'} class:ack={ev.ack}>
              <div class="b">
                <div class="et">{ev.title}</div>
                <div class="em mono">{ev.meta}</div>
              </div>
              <span class="ets mono">{ev.ts}</span>
            </li>
          {/each}
        </ul>
      </section>

      <!-- SENSORS -->
      <section class="sensors">
        <div class="lbl"><span>Zigbee · Z-wave</span><span>{SENSORS.length} devices</span></div>
        <div class="sgrid2">
          {#each SENSORS as s (s.name)}
            <div class="sc" class:open={s.band === 'open'} class:bat={s.band === 'bat'}>
              <div class="sn">{s.name}</div>
              <div class="sm mono">{s.meta}</div>
              <div class="sst mono">{s.state}</div>
            </div>
          {/each}
        </div>
      </section>

      <!-- QUICK ACTIONS -->
      <section class="actions">
        <span class="qico mono">QUICK</span>
        {#each QUICK_ACTIONS as a (a.label)}
          <button class="qa">{a.icon} {a.label}</button>
        {/each}
      </section>
    </div>
  </div>
</BaseTile>

<style>
  .sec {
    --s-fg: #ffffff;
    --s-dim: rgba(255, 255, 255, 0.8);
    --s-dimmer: rgba(255, 255, 255, 0.56);
    --s-line: rgba(255, 255, 255, 0.18);
    --s-line-strong: rgba(255, 255, 255, 0.35);
    --s-accent: #47e0ff;
    --s-green: #4cff9e;
    --s-amber: #ffcc3e;
    --s-red: #ff4a6b;
    --s-violet: #b388ff;

    background: #000;
    color: var(--s-fg);
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
  }
  :global(:root[data-mode='light']) .sec {
    --s-fg: #1c1a18;
    --s-dim: rgba(28, 26, 24, 0.82);
    --s-dimmer: rgba(28, 26, 24, 0.5);
    --s-line: rgba(28, 26, 24, 0.18);
    --s-line-strong: rgba(28, 26, 24, 0.35);
    --s-accent: #0a6ea0;
    --s-green: #2d8538;
    --s-amber: #a66a12;
    --s-red: #a82525;
    --s-violet: #6a3dc0;
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
    color: var(--s-dim);
    font-weight: 700;
  }
  .top .armed {
    padding: 0.25rem 0.7rem;
    border-radius: 999px;
    border: 1px solid var(--s-green);
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .top .adot {
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 50%;
    box-shadow: 0 0 8px currentColor;
  }
  .top .now {
    color: var(--s-fg);
    font-weight: 700;
  }

  .grid {
    width: 100%;
    height: 100%;
    padding: 1.4rem 1.6rem 1.6rem;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    /* clk 2 + stats 2 (same band) + cams 7 + alarm 4 + events 6 + sensors 4 + actions 1 = 24 */
    grid-template-rows: repeat(24, minmax(0, 1fr));
    gap: 0.9rem;
  }

  .lbl {
    font-size: 0.55rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--s-dim);
    font-weight: 700;
    font-family: 'JetBrains Mono', monospace;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  /* ---- Clock ---- */
  .clk {
    grid-column: span 3;
    grid-row: span 2;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .clk .t {
    font-size: 3rem;
    font-weight: 700;
    color: var(--s-accent);
    letter-spacing: -0.02em;
    line-height: 1;
    margin-top: 0.1rem;
  }
  .clk .d {
    font-size: 0.7rem;
    color: var(--s-dim);
    letter-spacing: 0.1em;
    font-weight: 600;
  }
  .clk .since {
    font-size: 0.6rem;
    color: var(--s-dimmer);
    margin-top: auto;
    padding-top: 0.3rem;
    border-top: 1px solid var(--s-line);
    letter-spacing: 0.08em;
    font-weight: 500;
  }

  /* ---- 24h Stats ---- */
  .stats {
    grid-column: span 5;
    grid-row: span 2;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .stats .sgrid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.9rem;
    flex: 1;
    margin-top: 0.3rem;
  }
  .stats .x .k {
    font-size: 0.55rem;
    letter-spacing: 0.18em;
    color: var(--s-dim);
    text-transform: uppercase;
    font-weight: 700;
  }
  .stats .x .v {
    font-size: 1.8rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    margin-top: 0.15rem;
    color: var(--s-fg);
  }
  .stats .x .v.warn {
    color: var(--s-amber);
  }
  .stats .x .v.amber {
    color: var(--s-amber);
  }
  .stats .x .m {
    font-size: 0.65rem;
    color: var(--s-dim);
    margin-top: 0.1rem;
    font-weight: 500;
  }

  /* ---- Cameras ---- */
  .cams {
    grid-column: span 8;
    grid-row: span 7;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    border: 1px solid var(--s-line-strong);
    border-radius: 6px;
    overflow: hidden;
    padding: 0;
  }
  .ctop {
    padding: 0.55rem 0.9rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--s-line);
  }
  .ctop .l {
    display: flex;
    gap: 0.7rem;
    align-items: center;
    font-size: 0.65rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    font-weight: 700;
    color: var(--s-fg);
  }
  .ctop .l .count {
    color: var(--s-accent);
  }
  .ctop .r {
    display: flex;
    gap: 0.3rem;
  }
  .cbtn {
    padding: 0.25rem 0.6rem;
    background: transparent;
    border: 1px solid var(--s-line-strong);
    border-radius: 5px;
    color: var(--s-dim);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.58rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    font-weight: 700;
  }
  .cbtn.on {
    background: var(--s-accent);
    color: #001822;
    border-color: var(--s-accent);
  }
  .cgrid {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 2fr 1fr 1fr;
    gap: 3px;
    padding: 3px;
    background: #000;
  }
  .c {
    position: relative;
    overflow: hidden;
    background: #0a0a0a;
  }
  .c.big {
    grid-column: span 2;
  }
  .c img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    filter: brightness(0.75) contrast(1.1) saturate(0.75);
  }
  .c::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.35) 0%, transparent 25%, transparent 75%, rgba(0, 0, 0, 0.55) 100%);
    pointer-events: none;
  }
  .clab {
    position: absolute;
    top: 6px;
    left: 6px;
    font-size: 0.55rem;
    color: var(--s-accent);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-weight: 700;
    background: rgba(0, 0, 0, 0.6);
    padding: 0.15rem 0.4rem;
    border: 1px solid var(--s-accent);
    z-index: 2;
  }
  .crec {
    position: absolute;
    top: 6px;
    right: 6px;
    font-size: 0.52rem;
    color: var(--s-red);
    display: flex;
    align-items: center;
    gap: 0.2rem;
    z-index: 2;
    background: rgba(0, 0, 0, 0.6);
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    font-weight: 700;
  }
  .crec::before {
    content: '';
    width: 0.35rem;
    height: 0.35rem;
    border-radius: 50%;
    background: var(--s-red);
    box-shadow: 0 0 6px var(--s-red);
    animation: blink 1s infinite;
  }
  @keyframes blink {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }
  .cdetect {
    position: absolute;
    bottom: 8px;
    left: 8px;
    background: var(--s-amber);
    color: #2a1e00;
    font-size: 0.55rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-weight: 800;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    z-index: 2;
  }
  .bbox {
    position: absolute;
    border: 2px solid var(--s-amber);
    z-index: 3;
    pointer-events: none;
  }
  .bboxl {
    position: absolute;
    top: -1.1rem;
    left: -1px;
    background: var(--s-amber);
    color: #2a1e00;
    font-size: 0.55rem;
    padding: 0.05rem 0.35rem;
    font-weight: 700;
    white-space: nowrap;
  }

  /* ---- Alarm ---- */
  .alarm {
    grid-column: span 8;
    grid-row: span 4;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .astate {
    font-size: 2rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin-top: 0.2rem;
  }
  .asub {
    font-size: 0.75rem;
    color: var(--s-dim);
    font-weight: 500;
  }
  .zones {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.35rem;
    margin-top: 0.45rem;
  }
  .z {
    border: 1px solid var(--s-line);
    border-radius: 6px;
    padding: 0.45rem 0.6rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.75rem;
  }
  .z .zn {
    font-weight: 600;
    color: var(--s-fg);
  }
  .z .zs {
    font-size: 0.6rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-weight: 700;
    color: var(--s-green);
  }
  .z.open {
    border-color: var(--s-red);
  }
  .z.open .zs {
    color: var(--s-red);
  }
  .modes {
    display: flex;
    gap: 0.35rem;
    margin-top: 0.5rem;
  }
  .mbtn {
    flex: 1;
    padding: 0.55rem 0.3rem;
    background: transparent;
    border: 1px solid var(--s-line-strong);
    border-radius: 6px;
    color: var(--s-dim);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    cursor: pointer;
    font-weight: 700;
  }
  .mbtn.on {
    background: var(--s-green);
    color: #001a0e;
    border-color: var(--s-green);
  }
  .mbtn.disarm.on {
    background: var(--s-red);
    color: #fff;
    border-color: var(--s-red);
  }

  /* ---- Events ---- */
  .events {
    grid-column: span 8;
    grid-row: span 6;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .ectrls {
    display: flex;
    gap: 0.3rem;
    margin-top: 0.3rem;
  }
  .ef {
    padding: 0.25rem 0.7rem;
    background: transparent;
    border: 1px solid var(--s-line);
    border-radius: 5px;
    font-size: 0.58rem;
    color: var(--s-dim);
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    font-weight: 700;
  }
  .ef.on {
    background: var(--s-accent);
    color: #001822;
    border-color: var(--s-accent);
  }
  .elist {
    list-style: none;
    margin: 0.35rem 0 0;
    padding: 0;
    flex: 1;
    overflow: hidden;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.3rem;
    align-content: start;
  }
  .ev {
    display: flex;
    gap: 0.6rem;
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--s-line);
    border-radius: 6px;
    align-items: flex-start;
  }
  .ev.unack {
    border-left: 3px solid var(--s-amber);
  }
  .ev.alert {
    border-left: 3px solid var(--s-red);
  }
  .ev.ack {
    opacity: 0.5;
  }
  .ev .b {
    flex: 1;
    min-width: 0;
  }
  .ev .et {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--s-fg);
  }
  .ev .em {
    font-size: 0.58rem;
    color: var(--s-dim);
    margin-top: 0.1rem;
    font-weight: 500;
  }
  .ev .ets {
    font-size: 0.58rem;
    color: var(--s-dimmer);
    flex-shrink: 0;
  }

  /* ---- Sensors ---- */
  .sensors {
    grid-column: span 8;
    grid-row: span 4;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .sgrid2 {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 0.35rem;
    flex: 1;
    margin-top: 0.3rem;
  }
  .sc {
    border: 1px solid var(--s-line);
    border-radius: 6px;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    position: relative;
    font-size: 0.65rem;
  }
  .sc::before {
    content: '';
    position: absolute;
    top: 0.4rem;
    right: 0.4rem;
    width: 0.35rem;
    height: 0.35rem;
    border-radius: 50%;
    background: var(--s-green);
    box-shadow: 0 0 6px var(--s-green);
  }
  .sc.open::before {
    background: var(--s-amber);
    box-shadow: 0 0 6px var(--s-amber);
    animation: blink 1.2s infinite;
  }
  .sc.bat::before {
    background: var(--s-red);
    box-shadow: 0 0 6px var(--s-red);
  }
  .sc .sn {
    font-size: 0.65rem;
    font-weight: 700;
    color: var(--s-fg);
  }
  .sc .sm {
    font-size: 0.52rem;
    color: var(--s-dim);
    letter-spacing: 0.05em;
    font-weight: 500;
  }
  .sc .sst {
    font-size: 0.62rem;
    font-weight: 700;
    color: var(--s-green);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-top: 0.15rem;
  }
  .sc.open .sst {
    color: var(--s-amber);
  }
  .sc.bat .sst {
    color: var(--s-red);
  }

  /* ---- Quick actions ---- */
  .actions {
    grid-column: span 8;
    grid-row: span 1;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .qico {
    font-size: 0.58rem;
    color: var(--s-dim);
    letter-spacing: 0.15em;
    text-transform: uppercase;
    font-weight: 700;
    margin-right: 0.5rem;
  }
  .qa {
    padding: 0.5rem 0.8rem;
    background: transparent;
    border: 1px solid var(--s-line-strong);
    border-radius: 6px;
    color: var(--s-fg);
    font-family: inherit;
    font-size: 0.7rem;
    cursor: pointer;
    font-weight: 600;
  }
</style>
