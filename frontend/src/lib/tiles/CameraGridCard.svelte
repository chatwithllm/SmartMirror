<script lang="ts">
  /**
   * Asymmetric camera grid (3 cells row 1, 2 cells row 2 — 5 total).
   * Each cell either:
   *   - mounts FrigateCameraTile when an entity_id is configured AND
   *     window.__HA_URL__ + token are populated
   *   - falls back to a styled placeholder ("CAM N · OFFLINE") so the
   *     grid still reads as a security feed in dev / no-HA mode.
   * Demo placeholder uses radial-gradient + grain SVG overlay + a
   * tiny live timestamp tick to feel authored, not blank.
   *
   * Header has a CAMERAS pill on the left + a scrolling notification
   * ticker on the right. Notifications can be passed via
   * props.notifications; falls back to a placeholder loop in dev.
   */
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import FrigateCameraTile from './FrigateCameraTile.svelte';

  interface CameraSpec {
    entity_id?: string;
    label?: string;
  }

  interface Props {
    id: string;
    isActive: boolean;
    props?: { cameras?: CameraSpec[]; notifications?: string[] };
  }
  let { id: _id, isActive, props = {} }: Props = $props();

  // Default to 5 generic slots — the layout JSON can override with
  // real entity ids per camera position. Row 1: 3 cells. Row 2: 2 cells.
  const cameras = $derived(
    props.cameras ?? [
      { label: 'Front' },
      { label: 'Driveway' },
      { label: 'Garage' },
      { label: 'Backyard' },
      { label: 'Side' }
    ]
  );

  // Camera notification ticker. Real source TBD (Frigate event feed,
  // HA persistent_notification with `camera.*` filter, etc.). For now
  // accept via props or fall back to placeholder strings so the strip
  // has motion.
  const notifications = $derived(
    props.notifications ?? [
      'Front · motion 14:32',
      'Driveway · person detected 13:08',
      'Backyard · package delivered 11:51',
      'Garage · door open 09:14',
      'Side · all clear'
    ]
  );

  // Determine HA presence at render time. If neither env globals nor
  // entity ids are set, every cell falls to the placeholder.
  let haReady = $state(false);
  $effect(() => {
    if (!browser) return;
    const w = window as unknown as { __HA_URL__?: string; __HA_TOKEN__?: string };
    haReady = Boolean(w.__HA_URL__ && w.__HA_TOKEN__);
  });

  // Live HH:MM:SS for placeholder timestamps. Cheap setInterval —
  // shared across all 4 cells.
  let now = $state(new Date());
  let timer: ReturnType<typeof setInterval> | null = null;
  onMount(() => {
    if (!isActive) return;
    timer = setInterval(() => (now = new Date()), 1000);
  });
  onDestroy(() => { if (timer) clearInterval(timer); });

  const fmtTs = (d: Date) =>
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
</script>

<section class="cams" data-testid="camera-grid">
  <header class="head">
    <div class="tag">Cameras</div>
    <div class="ticker">
      <div class="ticker-track">
        {#each [0, 1] as loop (loop)}
          <div class="ticker-loop" aria-hidden={loop === 1}>
            {#each notifications as note, idx (idx)}
              <span class="t-item">{note}</span>
              <span class="t-sep" aria-hidden="true">◆</span>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  </header>
  <div class="grid">
    {#each cameras as cam, i (i)}
      {#if haReady && cam.entity_id}
        <div class="cell">
          <FrigateCameraTile
            id={`cam-${i}`}
            props={{ entity_id: cam.entity_id, refreshMs: 2000, fit: 'cover' }}
          />
          <div class="cell-label">{cam.label ?? `CAM ${i + 1}`}</div>
        </div>
      {:else}
        <div class="cell offline" aria-label="{cam.label ?? `Camera ${i + 1}`} offline">
          <div class="grain"></div>
          <div class="rec-dot"></div>
          <div class="ts mono">{fmtTs(now)}</div>
          <div class="cell-label">{cam.label ?? `CAM ${i + 1}`} · OFFLINE</div>
        </div>
      {/if}
    {/each}
  </div>
  <div class="rule" aria-hidden="true"></div>
</section>

<style>
  .cams {
    height: 100%;
    width: 100%;
    padding: 0.6rem 0.8rem 0.7rem;
    display: flex;
    flex-direction: column;
    color: var(--fg);
    font-family: 'Fraunces', Georgia, serif;
    position: relative;
  }
  .head {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: stretch;
    height: 1.4rem;
    margin-bottom: 0.5rem;
    overflow: hidden;
    border-bottom: 1px solid var(--line);
  }
  .tag {
    display: flex;
    align-items: center;
    padding: 0 0.9rem;
    background: var(--accent);
    color: #000;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 700;
    font-size: 0.62rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    white-space: nowrap;
    clip-path: polygon(0 0, 100% 0, calc(100% - 0.55rem) 100%, 0 100%);
    padding-right: 1.2rem;
  }
  .ticker {
    overflow: hidden;
    position: relative;
    -webkit-mask-image: linear-gradient(
      to right,
      transparent 0,
      black 3%,
      black 97%,
      transparent 100%
    );
    mask-image: linear-gradient(
      to right,
      transparent 0,
      black 3%,
      black 97%,
      transparent 100%
    );
  }
  .ticker-track {
    display: inline-flex;
    align-items: center;
    height: 100%;
    white-space: nowrap;
    animation: cam-ticker-scroll 40s linear infinite;
    will-change: transform;
  }
  .ticker-loop {
    display: inline-flex;
    align-items: center;
    padding-left: 1rem;
  }
  .t-item {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    color: var(--fg);
  }
  .t-sep {
    margin: 0 1rem;
    color: var(--accent);
    font-size: 0.5rem;
    transform: translateY(-1px);
  }
  @keyframes cam-ticker-scroll {
    from { transform: translateX(0); }
    to   { transform: translateX(-50%); }
  }
  .grid {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    grid-template-rows: 1fr 1fr;
    gap: 0.4rem;
    min-height: 0;
  }
  /* Row 1: 3 cells × col-span 2 = 6 cols. Row 2: 2 cells × col-span 3. */
  .cell:nth-child(1),
  .cell:nth-child(2),
  .cell:nth-child(3) {
    grid-column: span 2;
    grid-row: 1;
  }
  .cell:nth-child(4),
  .cell:nth-child(5) {
    grid-column: span 3;
    grid-row: 2;
  }
  .cell {
    position: relative;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 2px;
    background: #050505;
  }
  .cell :global(.tile) {
    border: 0 !important;
    border-radius: 0 !important;
    padding: 0 !important;
    background: #050505 !important;
    height: 100% !important;
  }
  .cell-label {
    position: absolute;
    bottom: 0.2rem;
    left: 0.4rem;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 0.55rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.85);
    text-shadow: 0 0 4px rgba(0, 0, 0, 0.9);
    pointer-events: none;
  }
  .cell.offline {
    background:
      radial-gradient(ellipse at 30% 30%, #1a1a1a 0%, #050505 60%);
  }
  /* SVG grain overlay — gives the placeholder noise like real low-light camera feed */
  .cell.offline .grain {
    position: absolute;
    inset: 0;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.08 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
    background-size: 160px 160px;
    opacity: 0.5;
    pointer-events: none;
    animation: grain-shift 1.8s steps(8) infinite;
  }
  @keyframes grain-shift {
    0%   { transform: translate(0, 0); }
    25%  { transform: translate(-3px, 2px); }
    50%  { transform: translate(2px, -2px); }
    75%  { transform: translate(-1px, 3px); }
    100% { transform: translate(0, 0); }
  }
  .cell.offline .rec-dot {
    position: absolute;
    top: 0.4rem;
    right: 0.4rem;
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: var(--bad, #c95a4a);
    box-shadow: 0 0 6px var(--bad, #c95a4a);
    animation: rec-pulse 1.4s ease-in-out infinite;
  }
  @keyframes rec-pulse {
    0%, 100% { opacity: 0.3; }
    50%      { opacity: 1; }
  }
  .cell.offline .ts {
    position: absolute;
    top: 0.3rem;
    left: 0.4rem;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 0.55rem;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.65);
    pointer-events: none;
  }
  .rule {
    position: absolute;
    left: 0.8rem;
    right: 0.8rem;
    bottom: 0;
    height: 1px;
    background: var(--line);
  }
</style>
