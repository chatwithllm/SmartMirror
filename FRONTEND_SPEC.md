# Smart Mirror — Frontend Spec

Companion to `DESIGN_SPEC.md` (product, hardware, install).
Scope: the **SvelteKit app** that runs inside the kiosk Chromium. All HA-side design (automations, python_script, MQTT, addon) lives in `BACKEND_SPEC.md`.

> The frontend is a **dumb renderer**. HA owns state. The app never invents layouts, modes, themes, or content — it reads, diffs, renders.

---

## 1. Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Framework | **SvelteKit** (`@sveltejs/kit@^2`) | Lightest reactive diff engine, tiny bundle, great for Celeron |
| Language | **TypeScript** strict | Contracts with HA are schema-driven; types catch drift |
| Build | Vite | Default for SvelteKit |
| Styling | Plain CSS + CSS custom properties (no Tailwind) | Theme swap = swap `<style>` root tokens |
| Grid engine | **gridstack.js** v11+ | Resize/drag/FLIP already solved |
| HA WS | `home-assistant-js-websocket` | Official, reconnect + auth baked |
| Video | Native `<video>` + **hls.js** (Plex) + **MSE/WebRTC** (Frigate via go2rtc) | No video.js — keep bundle small |
| Audio | Native `<audio>`, single-tile guard | — |
| Animation | Svelte transitions for fades; **flip-toolkit** / custom FLIP for grid moves | — |
| Date/time | Native `Intl.*`, `toLocaleTimeString` | No moment/dayjs — 0 deps |
| Package manager | `pnpm` | Faster install on Celeron during updates |
| Runtime | Node 20 LTS (systemd service) | SSR not required but keeps env + CA cert handling simple |

**Bundle budget:** ≤ 400 KB gzipped initial, < 100 KB per lazy chunk (themes, tile groups).

---

## 2. Project structure

```
frontend/
├── package.json
├── svelte.config.js
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── app.html
│   ├── app.d.ts
│   ├── hooks.server.ts          # inject HA_URL, HA_TOKEN into +page.server
│   ├── routes/
│   │   ├── +layout.svelte       # error boundary, theme <style> slot, toast
│   │   ├── +layout.ts           # load HA config, open WS, subscribe
│   │   └── +page.svelte         # grid renderer (the single page)
│   └── lib/
│       ├── ha/
│       │   ├── client.ts        # createConnection, auth, reconnect
│       │   ├── subscribe.ts     # state_changed, events, services
│       │   ├── services.ts      # callService wrapper
│       │   └── types.ts         # HAState, HAEntity types
│       ├── layout/
│       │   ├── schema.ts        # zod schemas for Layout + Tile
│       │   ├── store.ts         # Svelte store: current layout, prev layout
│       │   ├── fetch.ts         # hit /local/mirror/layout.json on revision bump
│       │   ├── diff.ts          # prev ↔ next tile diff (add/move/resize/remove/swap)
│       │   └── flip.ts          # first/last/invert/play animation helpers
│       ├── grid/
│       │   ├── Grid.svelte      # gridstack wrapper, controlled by layout store
│       │   ├── edit-mode.ts     # enable drag/resize handles, push patches back to HA
│       │   └── safe-zones.ts    # overscan padding, burn-in rotation
│       ├── tiles/
│       │   ├── registry.ts      # type → component map (one entry per tile type)
│       │   ├── BaseTile.svelte  # shared wrapper (border, label, padding, mount hooks)
│       │   ├── ClockTile.svelte
│       │   ├── WeatherTile.svelte
│       │   ├── CalendarTile.svelte
│       │   ├── PlexPlayerTile.svelte
│       │   ├── PlexNowPlayingTile.svelte
│       │   ├── PlexRecentTile.svelte
│       │   ├── YouTubeTile.svelte
│       │   ├── PodcastTile.svelte
│       │   ├── ImmichSlideshowTile.svelte
│       │   ├── FrigateCameraTile.svelte
│       │   ├── ServiceStatusTile.svelte
│       │   ├── HostHealthTile.svelte
│       │   ├── InventoryGridTile.svelte
│       │   ├── LowStockAlertTile.svelte
│       │   ├── ShoppingListTile.svelte
│       │   ├── RecipeSuggestTile.svelte
│       │   ├── ExpiryTile.svelte
│       │   ├── BudgetTile.svelte
│       │   ├── ProjectBoardTile.svelte
│       │   ├── PrListTile.svelte
│       │   ├── DeployPipelineTile.svelte
│       │   ├── MessagesTile.svelte
│       │   ├── PomodoroTile.svelte
│       │   ├── MeetingCountdownTile.svelte
│       │   ├── RoutineChecklistTile.svelte
│       │   ├── CoffeeTimerTile.svelte
│       │   ├── AmbientScenesTile.svelte
│       │   ├── DeviceSliderTile.svelte
│       │   ├── SleepTimerTile.svelte
│       │   ├── NewsBriefingTile.svelte
│       │   ├── CommuteTile.svelte
│       │   ├── AlarmPanelTile.svelte
│       │   ├── EventTimelineTile.svelte
│       │   ├── SensorGridTile.svelte
│       │   ├── QuickActionsTile.svelte
│       │   ├── AlertsTile.svelte
│       │   ├── LogTailTile.svelte
│       │   ├── MetricsChartTile.svelte
│       │   └── IframeTile.svelte
│       ├── themes/
│       │   ├── loader.ts        # lazy-import theme CSS, swap root <style>
│       │   ├── minimal-dark.css
│       │   ├── ops-cyberpunk.css
│       │   ├── editorial.css
│       │   └── security.css     # ops fork, red/amber palette
│       ├── audio/
│       │   └── single-audio.ts  # enforce one audio tile per layout
│       ├── gesture/
│       │   ├── events.ts        # listen to HA event.mirror_gesture
│       │   └── router.ts        # map gesture → action (focus / resize / swipe mode)
│       ├── resolution/
│       │   ├── detect.ts        # devicePixelRatio + screen dims
│       │   └── tile-props.ts    # derive Plex bitrate, Immich thumb size
│       ├── stores/
│       │   ├── connection.ts    # WS connected / reconnecting / down
│       │   ├── theme.ts
│       │   ├── orientation.ts
│       │   ├── edit-mode.ts
│       │   ├── focused-tile.ts  # used by gesture focus / cycle
│       │   └── telemetry.ts     # FPS, dropped frames, audio conflicts
│       ├── telemetry/
│       │   ├── fps.ts           # requestAnimationFrame sampler
│       │   └── report.ts        # POST /metrics → HA sensor
│       └── utils/
│           ├── env.ts
│           ├── log.ts
│           └── safe-fetch.ts
├── static/
│   └── fonts/                   # self-host Inter, JetBrains Mono, Fraunces (no CDN in kiosk)
└── tests/
    ├── unit/                    # vitest
    └── e2e/                     # playwright, runs against mock HA
```

---

## 3. Contract with HA — layout JSON

This is the **only** shape the frontend accepts. Nothing else, ever.

```ts
// lib/layout/schema.ts
import { z } from 'zod';

export const Orientation = z.enum(['portrait', 'landscape']);
export const ThemeName   = z.enum(['minimal-dark', 'ops-cyberpunk', 'editorial', 'security']);
export const ModeName    = z.enum([
  'morning', 'work', 'relax', 'shopping', 'security',
  'night', 'ops', 'guest', 'showcase', 'editorial',
]);

export const Grid = z.object({
  cols: z.number().int().min(4).max(16),
  rows: z.number().int().min(4).max(24),
  gap:  z.number().int().min(0).max(40),
});

export const Tile = z.object({
  id:    z.string(),                   // stable; reposition vs remount decision hinges on this
  type:  z.string(),                   // must exist in TILES registry
  x: z.number().int(), y: z.number().int(),
  w: z.number().int().min(1), h: z.number().int().min(1),
  z: z.number().int().default(0),
  props: z.record(z.unknown()).default({}),
  audio: z.boolean().default(false),   // only one per layout
  resizable: z.boolean().default(true),
  min: z.object({ w: z.number().int(), h: z.number().int() }).optional(),
  max: z.object({ w: z.number().int(), h: z.number().int() }).optional(),
  since: z.string().datetime().optional(),
});

export const Layout = z.object({
  version: z.literal(1),
  mode: ModeName,
  orientation: Orientation,
  theme: ThemeName,
  grid: Grid,
  tiles: z.array(Tile),
  transition: z.enum(['fade', 'flip', 'none']).default('flip'),
  ttl_seconds: z.number().int().optional(),  // auto-revert to default after
});

export type Layout = z.infer<typeof Layout>;
export type Tile   = z.infer<typeof Tile>;
```

**Delivery mechanism:** `sensor.mirror_layout_revision` (int) bumps → frontend fetches `/local/mirror/layout.json` (served by HA via `www/`). Rationale: `input_text` caps at 255 chars, and revision bumps keep WS traffic tiny.

**Validation:** every fetched layout runs through `Layout.parse()`. Failed parse → toast + keep previous layout. Never render partial/invalid.

---

## 4. State flow

```
  ┌──────────────────────────────────────────────────────────────┐
  │                      Home Assistant                          │
  │   input_select.mirror_preset / mirror_mode / mirror_theme    │
  │                       ↓                                       │
  │   automation → python_script.build_mirror_layout              │
  │                       ↓                                       │
  │   writes www/mirror/layout.json + bumps sensor.mirror_layout_revision
  └──────────────────────────────────────────────────────────────┘
                          ↓ WS state_changed
  ┌──────────────────────────────────────────────────────────────┐
  │                    Frontend (kiosk)                          │
  │                                                              │
  │   ha/subscribe.ts ──┐                                         │
  │                     ▼                                         │
  │        layout/fetch.ts → GET /local/mirror/layout.json        │
  │                     ▼                                         │
  │        Layout.parse() → zod                                   │
  │                     ▼                                         │
  │        layoutStore.set(next)                                  │
  │                     ▼                                         │
  │        diff(prev, next) → [adds, moves, resizes, removes, swaps]
  │                     ▼                                         │
  │        Grid.svelte apply patches + FLIP                       │
  │                     ▼                                         │
  │        tile components subscribe their own entities/services  │
  └──────────────────────────────────────────────────────────────┘
```

### Diff rules (authoritative)

Match tiles by `id`.

| prev | next | action | preserve state? |
|------|------|--------|-----------------|
| absent | present | **mount** new component | n/a |
| present | absent | **unmount** | — |
| same id, same type, same x/y/w/h | same | **no-op** | yes |
| same id, same type, different x/y | **move** (FLIP animate) | yes (DOM node kept) |
| same id, same type, different w/h | **resize** (FLIP animate, dispatch `tile:resized`) | yes |
| same id, different type | **swap** (unmount then mount) | no |

*"preserve state"* = DOM node stays mounted, internal component state and media playback continue across the move/resize.

---

## 5. Tile system

### Contract every tile implements

```ts
// lib/tiles/BaseTile.svelte  props
export interface TileProps<P = Record<string, unknown>> {
  id: string;
  mode: ModeName;
  theme: ThemeName;
  w: number; h: number;        // current grid span (for content density decisions)
  pixelW: number; pixelH: number;  // resolved pixel size (recalculated on resize)
  audio: boolean;              // permitted to play audio?
  resolution: '1080p' | '1440p' | '4k';
  edit: boolean;               // are we in edit mode?
  props: P;                    // tile-specific
}
```

Every tile receives resize events via a Svelte store subscription:

```ts
// inside any TileFoo.svelte
import { onResize } from '$lib/grid/Grid.svelte';
onResize((size) => {
  // recompute layout, bitrate, thumbnail size, etc.
});
```

### Registry

```ts
// lib/tiles/registry.ts
export const TILES = {
  clock:               () => import('./ClockTile.svelte'),
  weather:             () => import('./WeatherTile.svelte'),
  calendar:            () => import('./CalendarTile.svelte'),
  plex_player:         () => import('./PlexPlayerTile.svelte'),
  plex_now_playing:    () => import('./PlexNowPlayingTile.svelte'),
  plex_recent:         () => import('./PlexRecentTile.svelte'),
  youtube:             () => import('./YouTubeTile.svelte'),
  podcast:             () => import('./PodcastTile.svelte'),
  immich_slideshow:    () => import('./ImmichSlideshowTile.svelte'),
  frigate_camera:      () => import('./FrigateCameraTile.svelte'),
  service_status:      () => import('./ServiceStatusTile.svelte'),
  host_health:         () => import('./HostHealthTile.svelte'),
  inventory_grid:      () => import('./InventoryGridTile.svelte'),
  low_stock_alert:     () => import('./LowStockAlertTile.svelte'),
  shopping_list:       () => import('./ShoppingListTile.svelte'),
  recipe_suggest:      () => import('./RecipeSuggestTile.svelte'),
  expiry:              () => import('./ExpiryTile.svelte'),
  budget:              () => import('./BudgetTile.svelte'),
  project_board:       () => import('./ProjectBoardTile.svelte'),
  pr_list:             () => import('./PrListTile.svelte'),
  deploy_pipeline:     () => import('./DeployPipelineTile.svelte'),
  messages:            () => import('./MessagesTile.svelte'),
  pomodoro:            () => import('./PomodoroTile.svelte'),
  meeting_countdown:   () => import('./MeetingCountdownTile.svelte'),
  routine_checklist:   () => import('./RoutineChecklistTile.svelte'),
  coffee_timer:        () => import('./CoffeeTimerTile.svelte'),
  ambient_scenes:      () => import('./AmbientScenesTile.svelte'),
  device_slider:       () => import('./DeviceSliderTile.svelte'),
  sleep_timer:         () => import('./SleepTimerTile.svelte'),
  news_briefing:       () => import('./NewsBriefingTile.svelte'),
  commute:             () => import('./CommuteTile.svelte'),
  alarm_panel:         () => import('./AlarmPanelTile.svelte'),
  event_timeline:      () => import('./EventTimelineTile.svelte'),
  sensor_grid:         () => import('./SensorGridTile.svelte'),
  quick_actions:       () => import('./QuickActionsTile.svelte'),
  alerts:              () => import('./AlertsTile.svelte'),
  log_tail:            () => import('./LogTailTile.svelte'),
  metrics_chart:       () => import('./MetricsChartTile.svelte'),
  iframe:              () => import('./IframeTile.svelte'),
} as const;
export type TileType = keyof typeof TILES;
```

Lazy `import()` per type → each tile is its own chunk → first-load cost scales to tiles-in-view only.

### Tile prop schemas

Each tile file exports a `PropsSchema` zod schema. `Grid.svelte` runs it per tile before mounting — bad props never render. See `tiles/<type>Tile.svelte` for the per-type schema; excerpt:

```ts
// PlexPlayerTile.svelte
export const PropsSchema = z.object({
  ratingKey: z.string(),
  autoplay: z.boolean().default(true),
  mute: z.boolean().default(false),
  startMs: z.number().int().default(0),
  maxBitrate: z.number().int().optional(),  // resolution-derived if absent
});
```

---

## 6. Grid engine

### Initial mount

```ts
// Grid.svelte
import { GridStack } from 'gridstack';

const grid = GridStack.init({
  column: layout.grid.cols,
  cellHeight: 'auto',          // uniform rows, computed from container / rows
  margin: layout.grid.gap,
  disableDrag: !$editMode,
  disableResize: !$editMode,
  animate: true,               // grid lib animates add/remove; we override for moves
  float: false,
}, container);
```

### Move / resize / add / remove

On `layoutStore` change, diff produces patches. Apply in this order (gridstack batches via `grid.batchUpdate()`):

1. **Remove** outgoing tiles (`grid.removeWidget(node, removeDOM=true)`).
2. **Move / resize** persisting tiles (`grid.update(node, {x, y, w, h})`).
3. **Add** incoming tiles (`grid.addWidget({el, x, y, w, h, id})`).

Wrap the whole sequence in `grid.batchUpdate() / grid.commit()`. Then run FLIP on the persisting set:

```ts
// lib/layout/flip.ts
export function flip(nodes: HTMLElement[], prevRects: Map<string, DOMRect>) {
  for (const el of nodes) {
    const prev = prevRects.get(el.dataset.id!);
    if (!prev) continue;
    const next = el.getBoundingClientRect();
    const dx = prev.left - next.left;
    const dy = prev.top  - next.top;
    const sx = prev.width  / next.width;
    const sy = prev.height / next.height;
    el.animate(
      [{ transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
       { transform: 'translate(0,0) scale(1,1)' }],
      { duration: 280, easing: 'cubic-bezier(0.2, 0.9, 0.2, 1.0)' },
    );
  }
}
```

### Edit mode (manual resize)

Toggled by `input_boolean.mirror_edit_mode`. Enables gridstack handles, shows translucent drop hints. On commit:

```ts
grid.on('change', (_, items) => {
  const patch = items.map(i => ({ id: i.id!, x: i.x!, y: i.y!, w: i.w!, h: i.h! }));
  hass.callService('mirror', 'patch_layout', { patch });
});
```

HA receives patch, rewrites `www/mirror/layout.json`, bumps revision. Round trip keeps HA as source of truth.

### Min/max + snap

`tile.min` / `tile.max` respected by gridstack via per-widget `minW/maxW/minH/maxH`. Snap grid = 1 cell. Aspect ratio locks for `frigate_camera` (16:9) and `youtube` (16:9) — enforced via `onResizeStart` handler.

### Safe zones + burn-in guard

Rendered grid is inset by overscan padding computed from `window.innerWidth × 0.02`. Clock/mode-chip tiles subscribe to `burnIn.rotate(tile_id, 8*60*1000)` — a store that increments a pixel offset every 8 min, applied via CSS translate to avoid static pixels.

---

## 7. Theme system

### Four themes confirmed

| Name | Source mockup | Use |
|------|---------------|-----|
| `minimal-dark` | `01-minimal-dark.html` | night, low-noise default |
| `ops-cyberpunk` | `03-ops-cyberpunk.html` | dev, monitoring, generic ops |
| `editorial` | `04-editorial.html` | guest, weekend, reading |
| `security` | `10-security-night.html` | security mode + NVR-heavy layouts (red/amber variant) |

### Token contract

Each theme defines the same ~30 CSS custom properties on `:root`:

```css
/* themes/_tokens.css (reference) */
:root {
  --bg:                /* page background */;
  --panel:             /* tile background */;
  --panel-2:           /* nested elevation */;
  --fg:                /* primary text */;
  --dim:               /* secondary text */;
  --dimmer:            /* tertiary text */;
  --line:              /* divider */;
  --line-strong:       /* prominent border */;
  --accent:            /* brand primary */;
  --accent-2:          /* brand secondary */;
  --ok:                /* green state */;
  --warn:              /* amber state */;
  --bad:               /* red state */;
  --info:              /* blue state */;
  --violet:            /* optional 5th hue */;
  --font-ui:           /* UI sans stack */;
  --font-mono:         /* mono stack */;
  --font-display:      /* editorial serif, defaults to --font-ui */;
  --radius-sm:         /* 4px */;
  --radius-md:         /* 12px */;
  --radius-lg:         /* 22px */;
  --gap-sm:;
  --gap-md:;
  --gap-lg:;
  --shadow-1:;
  --shadow-2:;
  --backdrop-blur:     /* 0 for minimal/ops/editorial; 24px for security-camera tiles only */;
  --motion-fast:       /* 120ms */;
  --motion-med:        /* 280ms */;
  --motion-slow:       /* 400ms */;
  --overscan:          /* 2vw */;
}
```

Every tile CSS uses **only these variables**. No hex codes in tile files.

### Swap mechanism

```ts
// lib/themes/loader.ts
const cache: Record<string, string> = {};

export async function loadTheme(name: ThemeName) {
  if (!cache[name]) {
    const mod = await import(`./${name}.css?inline`);
    cache[name] = mod.default;
  }
  const tag = document.getElementById('theme-style') ?? createTag();
  tag.textContent = cache[name];
  document.documentElement.dataset.theme = name;
}
```

Theme change triggers 400ms cross-fade: mount new `<style>` beneath the old, then remove old after animation. No FOUC.

### Allowed (mode × theme)

Enforced client-side; bad combos get coerced.

```ts
// lib/themes/compat.ts
export const ALLOWED: Record<ModeName, ThemeName[]> = {
  morning:   ['minimal-dark', 'editorial', 'ops-cyberpunk'],
  work:      ['ops-cyberpunk', 'minimal-dark', 'editorial'],
  relax:     ['minimal-dark', 'editorial'],
  shopping:  ['minimal-dark', 'ops-cyberpunk', 'editorial'],
  security:  ['security', 'ops-cyberpunk'],
  night:     ['minimal-dark', 'security'],
  ops:       ['ops-cyberpunk', 'security'],
  guest:     ['editorial', 'minimal-dark'],
  showcase:  ['editorial', 'minimal-dark'],
  editorial: ['editorial'],
};
```

If `layout.theme` not in `ALLOWED[layout.mode]`, fall back to `ALLOWED[mode][0]` and emit `event.mirror_theme_coerced` to HA for logging.

---

## 8. Media rules

### Single audio guard

```ts
// lib/audio/single-audio.ts
export function enforceSingleAudio(layout: Layout): Layout {
  const audioTiles = layout.tiles.filter(t => t.audio);
  if (audioTiles.length <= 1) return layout;
  const keep = audioTiles[0].id;
  const patched = layout.tiles.map(t =>
    t.audio && t.id !== keep
      ? { ...t, audio: false, props: { ...t.props, muted: true } }
      : t,
  );
  haCallService('mirror', 'log_audio_conflict', {
    tried: audioTiles.map(t => t.id), kept: keep,
  });
  return { ...layout, tiles: patched };
}
```

### Playback lifecycle

- **Autoplay policy:** chromium launched with `--autoplay-policy=no-user-gesture-required`. Still, kiosk bootstrap fires a synthetic click on page load to unlock audio contexts.
- **Mount-don't-unmount:** when a tile moves or resizes across layouts, DOM stays put; `<video>` playback persists.
- **Theme change:** does not re-mount tiles (CSS-only).
- **Mode change:** diffs decide per tile; Plex tile preserved across `relax → showcase` transitions.

### hls.js (Plex)

```ts
// PlexPlayerTile.svelte
const url = `${plexBase}/video/:/transcode/universal/start.m3u8?` +
  `path=/library/metadata/${ratingKey}&protocol=hls&` +
  `maxVideoBitrate=${maxBitrate}&X-Plex-Token=${token}`;

if (Hls.isSupported()) {
  const hls = new Hls({ maxBufferLength: 10 });
  hls.loadSource(url);
  hls.attachMedia(video);
}
```

### MSE / WebRTC (Frigate via go2rtc)

Frigate exposes `ws://frigate/api/ws?cam=<name>` — pipe MSE into `<video>`. go2rtc fallback to WebRTC when MSE unsupported (should never happen on Chromium).

---

## 9. Gesture subsystem (client side)

Backend publishes gesture events as HA events. Frontend just listens.

```ts
// lib/gesture/events.ts
hass.subscribeEvents((ev) => {
  if (ev.event_type !== 'mirror_gesture') return;
  dispatch(ev.data.gesture, ev.data.payload);
}, 'mirror_gesture');
```

```ts
// lib/gesture/router.ts
const handlers: Record<Gesture, (p?: any) => void> = {
  wake:            () => connection.set('active'),
  resize_grow:     () => resizeFocused(+1),
  resize_shrink:   () => resizeFocused(-1),
  focus:           (p) => focusedTile.set(p.tile_id),
  mode_next:       () => hass.callService('input_select', 'select_next', { entity_id: 'input_select.mirror_mode' }),
  mode_prev:       () => hass.callService('input_select', 'select_previous', { entity_id: 'input_select.mirror_mode' }),
  tile_fullscreen: () => fullscreen($focusedTile),
  tile_minimize:   () => fullscreen(null),
  lock:            () => edit.set('locked'),
  media_pause:     () => hass.callService('media_player', 'media_pause', { entity_id: audioTile().player }),
  alert_ack:       () => hass.callService('mirror', 'ack_alert'),
};
```

Focused tile decoration: the tile matching `$focusedTile` gets a 2px accent outline + 1.03 scale for 400ms, then relaxes to 1.0 while staying outlined. CSS pseudo-state via `[data-focused="true"]`.

Resize via gesture publishes a patch back to HA (same path as edit mode). HA is always source of truth.

---

## 10. Resolution awareness

```ts
// lib/resolution/detect.ts
export function currentResolution(): '1080p' | '1440p' | '4k' {
  const w = window.innerWidth * window.devicePixelRatio;
  if (w >= 3000) return '4k';
  if (w >= 2200) return '1440p';
  return '1080p';
}
```

```ts
// lib/resolution/tile-props.ts
export const RES_CAPS = {
  '1080p': { plexBitrate: 4_000,  immichSize: 'preview',  maxConcurrentVideo: 4, blur: true  },
  '1440p': { plexBitrate: 8_000,  immichSize: 'preview',  maxConcurrentVideo: 3, blur: true  },
  '4k':    { plexBitrate: 20_000, immichSize: 'original', maxConcurrentVideo: 2, blur: false },
};
```

Tiles derive their runtime props from resolution caps when `props.*` is absent.

### FPS guard

```ts
// lib/telemetry/fps.ts
let samples: number[] = [];
function sample(ts: number) {
  samples.push(ts);
  samples = samples.filter(t => ts - t < 1000);
  const fps = samples.length;
  if (fps < 30 && currentResolution() !== '1080p') {
    // 3 consecutive samples under 30fps → ask HA to downshift
    maybeRequestDownshift();
  }
  requestAnimationFrame(sample);
}
```

Fires `event.mirror_perf_downshift_requested`. HA automation (backend-side) decides whether to comply.

---

## 11. Performance budget

| Metric | Budget |
|--------|--------|
| First paint | < 800 ms |
| First interactive | < 1.5 s |
| Layout swap (mode change) | < 300 ms diff → grid applied |
| Theme swap | < 500 ms cross-fade |
| Sustained FPS (mode with media tile) | ≥ 45 |
| JS heap after 1h | < 180 MB |
| DOM nodes | < 3 000 |
| Tile count per layout | ≤ 18 |
| Simultaneously animating tiles | ≤ 6 |
| Audio tiles concurrent | exactly 1 (guard) |
| Video tiles concurrent | see RES_CAPS |

Reports posted to HA every 60s as `sensor.mirror_frontend_fps`, `sensor.mirror_frontend_heap_mb`, `sensor.mirror_frontend_dom_nodes`.

---

## 12. Error + connection states

| State | UI |
|-------|-----|
| WS never connected | Full-screen "waiting for Home Assistant…" with spinner, last layout hidden. |
| WS lost after connection | Previous layout stays rendered; small pill top-right: "reconnecting · 3s" with countdown. Auto-reconnect with exponential backoff (1, 2, 4, 8, 15, 30s, capped). |
| Layout fetch 404 | Toast "layout missing (rev N)", keep prev layout. |
| Layout fetch parse fail | Toast "invalid layout (rev N)", keep prev. |
| Tile prop schema fail | Render placeholder skeleton with `⚠ tile:<type>:<id>` label; log to HA. Never crash the grid. |
| Tile component throws at runtime | Svelte error boundary in `BaseTile.svelte` catches; renders same warning placeholder. |
| HW decode failure (Plex) | hls.js emits `MEDIA_ERR_DECODE`; swap tile to static poster + play overlay; emit `event.mirror_decode_failed`. |

---

## 13. Dev + build workflow

```bash
cd frontend
pnpm install
pnpm dev             # http://localhost:5173, hot reload
pnpm check           # svelte-check + tsc
pnpm test            # vitest
pnpm test:e2e        # playwright
pnpm build           # → build/
pnpm preview         # serve the production build locally
```

### Environment

```bash
# .env (dev)
HA_URL=https://ha.local:8123
HA_TOKEN=...
HA_SELF_SIGNED_CERT=/etc/mirror/ha.crt    # optional
MIRROR_ORIENTATION=portrait
MIRROR_RESOLUTION=1080p
MIRROR_DEMO=0   # 1 = serve bundled fake HA for mockup-only browsing
```

### Mock HA (offline dev)

`pnpm dev:mock` loads `tests/fixtures/layouts/*.json` in a small static server; presses the mode-cycle hotkey cycles layouts locally. No HA required. Used for:
- Porting mockup DOMs to layout JSON
- Theme CSS iteration
- Tile component unit visuals

### Kiosk bundle

```
build/
├── server/                 # Node SSR entry
├── client/                 # hashed JS/CSS chunks
└── static/                 # fonts, icons, themes/*.css
```

Served by `node build/index.js` on `:3000`. `chromium --kiosk --app=http://localhost:3000`.

---

## 14. Testing

### Unit (vitest)

- `layout/diff.ts` — every add/move/resize/remove/swap case.
- `audio/single-audio.ts` — N audio tiles → exactly 1 kept.
- `themes/compat.ts` — each mode × theme allowed/coerced.
- `resolution/detect.ts` — boundary DPR cases.

### Component (vitest + @testing-library/svelte)

- Each tile mounts with minimal valid props and renders non-empty output.
- ClockTile ticks on setInterval mock advance.
- CoffeeTimerTile, SleepTimerTile, PomodoroTile: start/pause/reset state transitions.
- ShoppingListTile toggle → count updates.
- AlarmPanelTile arm change → state chip updates + service called.

### E2E (playwright against mock HA)

- Boot → default layout renders.
- Send HA event flipping preset → layout swaps in < 300 ms, no tile unmount for persisting ids.
- Theme change → CSS vars swap, no tile re-mount.
- Gesture event `resize_grow` → focused tile grows by 1 cell; patch POSTs.
- Network dropout → reconnect pill shows, layout persists.

---

## 15. Build phases (frontend scope only)

Maps onto `DESIGN_SPEC.md` build phases; this is the frontend slice.

| Phase | Frontend deliverable | Hours |
|-------|----------------------|-------|
| 1 | SvelteKit skeleton, +page.svelte renders hard-coded `clock` | 6 |
| 2 | HA WS client + layout fetch + zod parse + diff engine | 6 |
| 3a | Core tiles: clock, weather, calendar, news, service_status | 6 |
| 3b | Host / metrics / log / alerts tiles | 4 |
| 4 | Plex tile (hls.js) — biggest tech risk | 6 |
| 5 | Frigate / Immich / YouTube / podcast tiles | 6 |
| 6 | Inventory bundle: grid, low-stock, shopping, recipes, expiry, budget | 6 |
| 7 | Work bundle: pomodoro, meeting, kanban, PRs, deploy, messages, goals | 6 |
| 8 | Security bundle: alarm panel, event timeline, sensor grid, quick actions | 5 |
| 9 | Ambience / morning: ambient scenes, device sliders, routine checklist, coffee timer, sleep timer, commute | 5 |
| 10 | 4 theme CSS files + swap + compat guard | 8 |
| 11 | FLIP motion, resize, edit mode, single-audio guard | 6 |
| 12 | Gesture event router + focus visuals | 4 |
| 13 | Telemetry (FPS, heap, DOM), error boundaries, connection states | 4 |
| 14 | Tests (unit + component + e2e skeleton) | 6 |

**Total frontend scope: ~84h** across ~12 sessions.

Phases 1–4 = vertical-slice MVP in ~24h. Ships a working mirror with 5 tiles + Plex + 1 theme.

---

## 16. Contracts with backend (forward ref)

Backend spec (`BACKEND_SPEC.md`, next) owns:

- Writing `www/mirror/layout.json` and bumping `sensor.mirror_layout_revision`.
- `input_select.mirror_preset | mirror_mode | mirror_theme | mirror_orientation`.
- `input_boolean.mirror_edit_mode`.
- `mirror.*` service calls: `patch_layout`, `ack_alert`, `log_audio_conflict`, `set_resolution`.
- Event emission: `mirror_gesture`, `mirror_focus_request`, etc. (source of truth for gesture subsystem).
- HA automation that picks `preset` from time/presence/alerts/calendar.
- Per-mode × per-orientation preset JSONs stored in `ha/layouts/`.
- Resolution switcher (`mirror.set_resolution` → SSH into mirror box → wlr-randr).
- Webcam gesture addon (MediaPipe server-side) publishing `mirror_gesture` events.

Frontend never hardcodes URLs, tokens, mode logic, layout content. Only renders what backend sends.

---

## 17. Open items

- [ ] Confirm `security` theme palette — strict red/amber fork of ops, or gentler "dark navy + amber"?
- [ ] Pick `font-display` for editorial — Fraunces (current mockup) or lighter (Besley, Newsreader)?
- [ ] Decide on `IframeTile` — ship in v1 as escape hatch, or delay to v1.1?
- [ ] Confirm tile registry fully covers every mockup (visual audit next turn).
- [ ] Pick Plex auth surface — long-lived token in HA env, or pull from Plex account each session?

---

Ready for backend spec when you are.
