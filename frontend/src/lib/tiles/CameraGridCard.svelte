<script lang="ts">
  /**
   * Asymmetric camera grid (3 cells row 1, 2 cells row 2 — 5 total).
   * Each cell either:
   *   - mounts FrigateCameraTile when input_text.mirror_camera_slot_N
   *     resolves to a non-empty entity id (the user has bound it via
   *     the QR setup flow)
   *   - falls back to a QR-bind placeholder pointing at
   *     /setup/camera/N on the mirror's LAN URL. Phone scans → picks
   *     a camera entity → server writes the helper → this card swaps
   *     to a live feed within ~5–10s.
   *
   * Header has a CAMERAS pill on the left + a scrolling notification
   * ticker on the right. Notifications can be passed via
   * props.notifications; falls back to a placeholder loop in dev.
   */
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';
  import QRCode from 'qrcode';
  import FrigateCameraTile from './FrigateCameraTile.svelte';
  import { watchEntity, type HaEntity } from '$lib/ha/entity.js';

  interface CameraSpec {
    // entity_id is no longer the source of truth — bindings come from
    // input_text.mirror_camera_slot_N. Kept for back-compat with any
    // layout JSON that still passes it; ignored at render time.
    entity_id?: string;
    label?: string;
  }

  interface Props {
    id: string;
    isActive: boolean;
    props?: { cameras?: CameraSpec[]; notifications?: string[] };
  }
  let { id: _id, isActive, props = {} }: Props = $props();

  // Default to 5 generic slots — labels only. Real binding lives in
  // input_text helpers and is read via watchEntity below.
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

  // Per-slot HA helper watch — input_text.mirror_camera_slot_N. Empty
  // state means no binding → render QR. Non-empty means the user
  // chose a camera entity; mount FrigateCameraTile with that id.
  //
  // Set up in onMount (NOT $effect) — synchronous subscribe writes to
  // `bindings`, which would re-trigger an effect that read `isActive`,
  // recreating watchers in a tight loop → ERR_INSUFFICIENT_RESOURCES.
  let bindings = $state<string[]>(['', '', '', '', '']);
  const bindingStops: Array<(() => void) | null> = [null, null, null, null, null];

  onMount(() => {
    if (!isActive) return;
    for (let i = 0; i < 5; i++) {
      const slotIdx = i;
      const w = watchEntity(`input_text.mirror_camera_slot_${i}`, 5_000);
      const unsub = w.store.subscribe((e: HaEntity | null) => {
        const v = (e?.state ?? '').trim();
        bindings[slotIdx] =
          v && v !== 'unknown' && v !== 'unavailable' ? v : '';
      });
      bindingStops[i] = () => {
        unsub();
        w.stop();
      };
    }
  });

  // QR url + dataURL generation. Phone scans a per-slot URL pointing
  // at /setup/camera/N on the mirror's LAN host (provided by
  // +layout.server.ts; falls back to window.origin if dev/no override).
  const lanUrl = $derived.by((): string => {
    const data = get(page).data as { mirrorLanUrl?: string };
    if (data?.mirrorLanUrl) return data.mirrorLanUrl;
    if (browser) return window.location.origin;
    return '';
  });

  let qrDataUrls = $state<string[]>(['', '', '', '', '']);

  $effect(() => {
    if (!browser || !lanUrl) return;
    for (let i = 0; i < 5; i++) {
      const url = `${lanUrl}/setup/camera/${i}`;
      const slotIdx = i;
      void QRCode.toDataURL(url, {
        width: 240,
        margin: 1,
        color: { dark: '#f4ece0', light: '#0a0a0a00' }
      }).then((d) => {
        qrDataUrls[slotIdx] = d;
      });
    }
  });

  // Live HH:MM:SS for placeholder timestamps. Cheap setInterval —
  // shared across all 4 cells. Currently unused in the QR variant but
  // kept for any future hybrid placeholder.
  let now = $state(new Date());
  let timer: ReturnType<typeof setInterval> | null = null;
  onMount(() => {
    if (!isActive) return;
    timer = setInterval(() => (now = new Date()), 1000);
  });

  // In-cell camera picker. Fetches the full camera.* roster once when
  // this card becomes active, so each cell can offer a native <select>
  // override without round-tripping HA per render. Resolution order
  // becomes: localStorage override → HA helper → layout JSON → QR.
  interface CameraOption {
    entity_id: string;
    friendly_name: string;
  }
  let availableCams = $state<CameraOption[]>([]);

  onMount(() => {
    if (!isActive) return;
    void (async () => {
      try {
        const r = await fetch('/api/setup/cameras', { cache: 'no-store' });
        if (!r.ok) return;
        const j = (await r.json()) as { cameras: CameraOption[] };
        availableCams = j.cameras;
      } catch {
        /* swallow — picker just won't have options */
      }
    })();
  });

  const STORAGE_KEY = (i: number) => `mirror.cameraSlot.${i}`;
  let localOverrides = $state<string[]>(['', '', '', '', '']);

  onMount(() => {
    if (!browser) return;
    for (let i = 0; i < 5; i++) {
      const v = localStorage.getItem(STORAGE_KEY(i));
      if (v) localOverrides[i] = v;
    }
  });

  function setSlot(i: number, entityId: string) {
    localOverrides[i] = entityId;
    if (browser) {
      if (entityId) localStorage.setItem(STORAGE_KEY(i), entityId);
      else localStorage.removeItem(STORAGE_KEY(i));
    }
  }
  onDestroy(() => {
    if (timer) clearInterval(timer);
    for (let i = 0; i < 5; i++) {
      bindingStops[i]?.();
      bindingStops[i] = null;
    }
  });
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
      {@const liveId = localOverrides[i] || bindings[i] || cam.entity_id || ''}
      {#if haReady && liveId}
        <div class="cell">
          <FrigateCameraTile
            id={`cam-${i}`}
            props={{ entity_id: liveId, refreshMs: 2000, fit: 'cover' }}
          />
          <div class="cell-label">{cam.label ?? `CAM ${i + 1}`}</div>
          {#if availableCams.length > 0}
            <div class="picker">
              <select
                value={liveId}
                onchange={(e) =>
                  setSlot(i, (e.currentTarget as HTMLSelectElement).value)}
                title="Pick camera for slot {i + 1}"
              >
                <option value="">— unset —</option>
                {#each availableCams as opt (opt.entity_id)}
                  <option value={opt.entity_id}>{opt.friendly_name}</option>
                {/each}
              </select>
            </div>
          {/if}
        </div>
      {:else}
        <div
          class="cell qr-bind"
          aria-label="{cam.label ?? `Camera ${i + 1}`} unbound"
        >
          {#if qrDataUrls[i]}
            <img class="qr" src={qrDataUrls[i]} alt="QR to bind slot {i}" />
          {:else}
            <div class="grain"></div>
          {/if}
          <div class="bind-hint">Scan to bind</div>
          <div class="cell-label">SLOT {i + 1} · UNBOUND</div>
          {#if availableCams.length > 0}
            <div class="picker">
              <select
                value={liveId}
                onchange={(e) =>
                  setSlot(i, (e.currentTarget as HTMLSelectElement).value)}
                title="Pick camera for slot {i + 1}"
              >
                <option value="">— unset —</option>
                {#each availableCams as opt (opt.entity_id)}
                  <option value={opt.entity_id}>{opt.friendly_name}</option>
                {/each}
              </select>
            </div>
          {/if}
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
  .cell.qr-bind {
    background: radial-gradient(ellipse at 30% 30%, #1a1714 0%, #050505 60%);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }
  .cell.qr-bind .qr {
    width: 60%;
    max-width: 7rem;
    aspect-ratio: 1 / 1;
    image-rendering: pixelated;
    filter: drop-shadow(0 0 8px rgba(0, 0, 0, 0.6));
  }
  .cell.qr-bind .bind-hint {
    position: absolute;
    bottom: 1rem;
    left: 0;
    right: 0;
    text-align: center;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 0.6rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--accent);
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
  .picker {
    position: absolute;
    top: 0.4rem;
    right: 0.4rem;
    z-index: 3;
    opacity: 0.65;
    transition: opacity 200ms ease;
  }
  .cell:hover .picker {
    opacity: 1;
  }
  .picker select {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 0.55rem;
    letter-spacing: 0.08em;
    padding: 2px 4px;
    background: rgba(0, 0, 0, 0.7);
    color: var(--fg);
    border: 1px solid var(--line-strong);
    border-radius: 2px;
    max-width: 6.5rem;
    cursor: pointer;
  }
  .picker select:focus {
    outline: 1px solid var(--accent);
  }
</style>
