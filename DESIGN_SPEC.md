# Smart Mirror — Design Spec

Dynamic, HA-driven dashboard on a 43" TV. Supports portrait + landscape, coexists with regular Ubuntu desktop. Inventory, media playback (Plex/YouTube/podcast/Immich), NVR, service monitoring, project status — all swappable by Home Assistant automation.

> Preview mockups: open `mockups/index.html` in a browser.
> Style candidates: `01-minimal-dark` · `02-bento-modern` · `03-ops-cyberpunk` · `04-editorial` · `05-glass`.
> Mode mockups (interactive): `06-morning` · `07-noon-work` · `08-evening-relax` · `09-shopping-inventory` · `10-security-night`.

---

## 1. Goals

1. **One surface, many faces.** Layout, tiles, sizes, content all driven by HA state — no redeploy to change anything visible.
2. **Mode-aware.** Morning / work / evening / night / ops / media / inventory / guest. HA picks from context (time, presence, alerts, calendar, voice).
3. **Rich media tiles.** YouTube, Plex (via HLS), podcast, Immich photo slideshow, Frigate live cameras — not just text widgets.
4. **Inventory + monitoring first-class.** Pantry/stock, services, hosts, projects, NVR events all render as tiles.
5. **Portrait OR landscape.** User chooses at install; layout presets exist for both.
6. **Coexist with desktop use.** Dedicated `mirror` user + autologin kiosk session; switch user for normal desktop work.
7. **Celeron 8GB friendly.** Single browser, HW video decode, sane DOM count, one audio source rule.

---

## 2. Non-goals (v1)

- Touch interaction (passive display). Touch becomes v2.
- Voice control surface inside the mirror app. Voice stays in HA.
- Multi-user accounts inside the mirror. One dashboard per box.
- Cloud auth / public exposure. LAN only behind HA.
- Editing layouts visually in-browser. Layouts are HA state; edit in HA.

---

## 3. Visual direction — mockup comparison

| # | Name | Vibe | Density | Best for modes | Weight on Celeron |
|---|------|------|---------|----------------|---|
| 01 | Minimal Dark | MagicMirror classic, void + text | Low | night, morning | Lightest |
| 02 | Bento Modern | iOS/Pixel bento cards | Medium | default, evening, media | Light |
| 03 | Ops / Mission Control | Terminal, dense, neon | High | ops, alerts, monitoring | Light |
| 04 | Editorial | Serif magazine, narrative | Low-medium | evening, guest | Light |
| 05 | Glass | Frosted, Immich backdrop | Medium | media, photos | **Heaviest** (backdrop-filter + large bg image — profile before adopting) |

### Recommended direction
**Hybrid: Bento Modern (02) as default + Ops (03) as ops/alerts mode.**
- 02 carries every mode where content variety matters (media, evening, inventory, morning).
- 03 activates when `binary_sensor.any_service_down == on` or mode = `ops` — swaps grid to dense terminal grid.
- 05 (Glass) reserved as optional "showcase" mode (photo party, guests) — not default, because blur + fullscreen bg is the most expensive to render continuously.
- 01 (Minimal) retained for `night` mode — black, low lumen, low noise.
- 04 (Editorial) kept as `guest` / `weekend` novelty mode.

### Typography choice
- **UI sans:** `Inter` (weights 300 / 400 / 500 / 600 / 700)
- **Mono:** `JetBrains Mono` (400 / 500) — ops mode, log tails, IPs, metrics
- **Editorial display:** `Fraunces` (300 / 400 italic / 700) — editorial mode only
- System font fallback: `system-ui, -apple-system, sans-serif`

### Colour tokens (default / Bento)
```
--bg:        #0c0d10
--panel:     #15171c
--panel-2:   #1c1f26
--fg:        #f2f3f5
--dim:       #8b8f99
--dimmer:    #555862
--line:      #22252d
--accent-blue:   #5eadff
--accent-violet: #b887ff
--accent-pink:   #ff87c3
--accent-green:  #6ee7a7
--accent-orange: #ffb454
--accent-red:    #ff6b6b
```

Ops mode overrides with cyan/amber/red; night mode overrides to pure black + ultra-low brightness.

### Motion
- Tile add/remove/move: FLIP animation, 280ms, ease-out-cubic.
- Mode transitions: 400ms cross-fade between old and new grid.
- Video/audio tiles: do **not** animate — prevent stutter. Freeze layout position for audible tile.
- Never animate more than ~6 tiles simultaneously (Celeron limit).

---

## 4. Display / orientation / resolution

### Hardware
- Celeron N-series (unspecified exact SKU), 8 GB RAM, iGPU with VA-API (HW decode AV1/H.265/H.264).
- 43" panel (ex-Lululemon display). Assume **native 3840 × 2160 (4K UHD)** unless installer detects otherwise.
- HDMI 2.0 minimum (4K @ 60Hz). HDMI 2.1 preferred for 4K60 HDR passthrough.

### Target resolution: **4K, portrait default**
Production build runs at the TV's native resolution. Mockups are authored at the 1080 × 1920 base (for laptop previewing); the same CSS grid scales 2× to 2160 × 3840 with no layout change. All sizes are in CSS px — DPR handles the upscale.

### Install-time display wizard
Installer runs `wlr-randr --json` (Wayland) / `xrandr --verbose` (X11), detects modes, then prompts:
```
Detected: Smart TV 43" · 3840×2160@60  (also offers 1920×1080@60, 2560×1440@60)

[1] Portrait · 4K      (2160 × 3840, rotate 90° CW)   ← default
[2] Portrait · 4K      (2160 × 3840, rotate 90° CCW)
[3] Portrait · 1080p   (1080 × 1920, rotate 90° CW)   — lower GPU load
[4] Landscape · 4K     (3840 × 2160)
[5] Landscape · 1080p  (1920 × 1080)
[6] Custom             (pick mode + rotation manually)
```
Choice persists to:
- `~/.config/monitors.xml` for the `mirror` user (GNOME Wayland)
- `/etc/mirror/config.env`: `ORIENTATION=portrait`, `RESOLUTION=4k|1440p|1080p`, `ROTATION=cw|ccw|none`

### Runtime resolution switch
Exposed as HA service `mirror.set_resolution` (and `mirror.set_orientation`). Invokes a helper script on the mirror box over SSH (or via HA's `command_line` integration):
```bash
# /usr/local/bin/mirror-set-mode
wlr-randr --output HDMI-A-1 --mode "${WIDTH}x${HEIGHT}@${RATE}" --transform ${TRANSFORM}
systemctl --user restart mirror-kiosk.service
```
Use cases:
- Drop to 1080p for `media` mode if Plex HW decode backs up.
- Flip to 1440p during `ops` mode when many camera streams are on.
- Automated fallback: if frontend reports FPS < 30 via `/metrics`, HA automation switches to next lower resolution.

### Resolution-aware tile behaviour
Frontend reads `window.devicePixelRatio` and layout units stay constant — but certain tiles adjust content density:
- `frigate_camera`: stream resolution follows display — 4K → native, 1080p → sub-stream.
- `immich_slideshow`: requests thumbnails sized to container via Immich's `/api/asset/<id>/thumbnail?size=preview|original`.
- `plex_player`: `maxVideoBitrate` scales with resolution (4K → 20 Mbps, 1080p → 8 Mbps, 720p → 4 Mbps).
- `photos`, `yt`: use `?w=` query for CDN sizing.

### Grid per orientation
```ts
const GRID = {
  landscape: { cols: 12, rows: 8,  gap: 14 },   // 16:9
  portrait:  { cols: 8,  rows: 14, gap: 14 },   // 9:16 — default
};
```
Same grid at 1080×1920 or 2160×3840 — only the unit scale changes.

### Safe zones
- Respect TV overscan: 2% padding on all edges. At 1080×1920 base = 22px; at 4K = 44px.
- Clock / mode chip position rotated subtly over hours to spread burn-in risk. Static tiles with bright edges (alarm state banner, accent pills) avoid the corners most prone to burn-in on the specific panel (log panel model at install).

### Performance budget per resolution
| Res | Max concurrent video tiles | Max backdrop-filter layers | Notes |
|-----|----------------------------|----------------------------|-------|
| 4K | 2 (one HW-decoded Plex/Frigate hero + 1 sub-stream cam) | 2 | Celeron iGPU limit — more stutter risk |
| 1440p | 3 video + 4 camera sub-streams | 3 | Good balance, default for `ops` |
| 1080p | 4 video + 6 cams | 4 | Fallback, safe |

Frontend enforces budget: if a received layout exceeds it, extra video tiles render as static posters with a play overlay.

---

## 5. Layout schema (HA → frontend contract)

Stored in HA as `input_text.mirror_layout` (JSON string) or emitted by `python_script.build_mirror_layout`.

```ts
type Orientation = 'portrait' | 'landscape';

type Layout = {
  version: 1;
  mode: string;                    // 'morning' | 'evening' | 'ops' | ...
  orientation: Orientation;
  theme?: 'default' | 'night' | 'ops' | 'editorial' | 'glass';
  grid: { cols: number; rows: number; gap: number };
  tiles: Tile[];
  transition?: 'fade' | 'flip' | 'none';  // default 'flip'
};

type Tile = {
  id: string;                      // stable id; used for FLIP + state preservation
  type: TileType;                  // key in registry
  x: number; y: number;            // grid cell (0-based)
  w: number; h: number;            // grid spans
  props: Record<string, unknown>;  // tile-specific
  audio?: boolean;                 // true if tile plays audio (only one per layout)
  z?: number;                      // stacking, defaults to 0
  since?: string;                  // ISO timestamp, for "new tile" hints
};
```

### Tile registry (v1)

| Type | Purpose | Key props |
|------|---------|-----------|
| `clock` | Big clock + date + mode chip | `format`, `showSeconds` |
| `weather` | Current + forecast | `location`, `units`, `days` |
| `calendar` | Agenda, next N events | `calendar_id`, `count` |
| `youtube` | Embedded video tile | `videoId`, `autoplay`, `mute`, `start` |
| `podcast` | HTML5 audio with RSS/HA media_player | `feed_url` or `entity_id`, `episode` |
| `plex_player` | HLS stream from Plex | `ratingKey`, `autoplay`, `mute` |
| `plex_now_playing` | Active Plex sessions summary | — |
| `plex_recent` | Recently added carousel | `library`, `limit` |
| `immich_slideshow` | Random photos | `album_id`, `interval` |
| `frigate_camera` | Live cam (MSE/WebRTC) | `camera`, `stream` |
| `service_status` | Uptime Kuma / HA binary_sensors grid | `source`, `group` |
| `host_health` | Glances/Prometheus CPU/RAM/Disk | `hosts[]` |
| `inventory_grid` | Grocy / HA counters table | `source`, `filter`, `threshold` |
| `low_stock_alert` | Items below threshold, red accent | `source` |
| `project_board` | GitHub/Linear columns | `source`, `project_id` |
| `grafana_panel` | Grafana iframe render | `url`, `panelId` |
| `log_tail` | Live log stream (ops mode) | `source`, `lines` |
| `alerts` | HA critical alerts list | `severity_min` |
| `iframe_generic` | Escape hatch | `url` |

Tile component files: `frontend/src/lib/tiles/<Type>Tile.svelte`. Map in `frontend/src/lib/tiles/registry.ts`.

### Audio rule
At most one tile in a layout has `audio: true`. Frontend validates on receive; extra audio tiles auto-mute and log a warning to HA via event.

### Tile lifecycle
- **Mount** on layout receive if `id` absent before.
- **Reposition** (keep DOM) if `id` exists and type unchanged — enables seamless video playback across re-renders.
- **Unmount** if `id` absent in new layout.
- **Swap** (unmount + remount) if type changed for same id.

---

## 6. Modes — preset matrix

Each mode has 2 preset layouts (portrait / landscape). Stored as JSON in `ha/layouts/` and loaded by `python_script.build_mirror_layout`.

| Mode | Trigger | Default tiles | Theme |
|------|---------|---------------|-------|
| `morning` | 06:00–10:00, presence | clock, weather, calendar, news feed, podcast, inventory (breakfast items), service summary | default |
| `work` | 10:00–17:00 weekday | clock, calendar, project_board, host_health, service_status, podcast, weather | default |
| `evening` | 17:00–22:00 | clock, weather, plex_recent, immich_slideshow, inventory, frigate_camera(small), podcast | default |
| `night` | 22:00–06:00 | clock (dim), weather, frigate_camera(all), alerts | **night** (black) |
| `ops` | `binary_sensor.any_service_down == on` OR manual | alerts (big), service_status (dense), host_health (dense), log_tail, frigate quad, metrics chart | **ops** |
| `media` | Plex `playing` state | plex_player (hero), clock (small), weather (small), podcast (paused), frigate (small) | default |
| `inventory` | Manual / weekly cron | inventory_grid (hero), low_stock_alert, shopping_list, clock, weather | default |
| `guest` | Manual via `input_boolean.guest_mode` | editorial layout — hero photo, clock, weather, agenda, curated inventory only | **editorial** |
| `showcase` | Manual — party / dinner | immich_slideshow (fullscreen backdrop), clock + plex_now_playing as glass overlays | **glass** |

Theme name maps to CSS root override file (`themes/<name>.css`). Theme + orientation + grid = final render.

### Mode mockup reference (live / interactive)

Each mockup below is a working demo of its mode with live clocks, clickable lists, scrubbers, sliders, and state-driven UI. They share a top "mode switcher" pill bar that navigates between them — same mechanism HA will trigger at runtime via `input_select.mirror_mode`.

| File | Mode | Key tiles | Interactive |
|------|------|-----------|-------------|
| `06-morning.html` | `morning` | hero clock w/ sunrise, HRV/sleep stats, weather + 7h forecast, agenda with in-N-minutes countdown, news briefing, commute ETA, breakfast stock, morning podcast queue, routine checklist, pour-over timer | checklist toggle + progress ring, coffee timer start/pause/reset, podcast play/skip/scrub |
| `07-noon-work.html` | `work` | Pomodoro ring (25-min), DND banner, meeting countdown + join, 4-col project kanban, PR list w/ CI pips, deploy pipeline, messages, goal bars, host health | pomodoro controls, kanban project tabs, real-time meeting countdown, deploy step pulse |
| `08-evening-relax.html` | `media` | Plex hero (4K HDR), episode metadata chips, HA volume slider, Immich slideshow (auto-advance + manual), ambient scene tiles, 4 device sliders, sleep timer presets, podcast-paused + "Plex has audio" guard | full Plex transport controls (play/pause/skip/scrub), volume slider, scene picker, device sliders, sleep timer select + live countdown |
| `09-shopping-inventory.html` | `inventory` / `shopping` | 14-item shopping list, category filter, pantry grid with live stock bars + −/+/✓ controls, recipe suggestions ranked by stock match, expiring-soon alerts, monthly grocery budget with pace marker | tap to check off (live count), category filter, pantry quick-adjust buttons |
| `10-security-night.html` | `security` / `night` | Frigate 5-cam wall w/ AI bbox + detection chip, arm state banner, zone list, arm mode picker (Home/Away/Night/Disarm), event timeline w/ ack, filter chips, Zigbee sensor grid, 24h stats, quick actions | arm mode change (updates banner + state), event ack + filter, quick action flash-confirm |

Use these as the functional spec for the tile components in `frontend/src/lib/tiles/`. Each interactive element here becomes either:
- a `state_changed` subscription + in-tile local state, OR
- a `service_call` back to HA (arm state, scene change, slider commit, ack).

---

## 7. HA integration

### Entities to create
```yaml
# input_text.yaml
mirror_layout:
  name: Mirror Layout JSON
  max: 255                  # placeholder — actual JSON lives in sensor, see below
mirror_mode:
  name: Mirror Mode
  initial: auto

# input_select.yaml
mirror_orientation:
  name: Mirror Orientation
  options: [portrait, landscape]
  initial: landscape
mirror_theme_override:
  name: Mirror Theme Override
  options: [auto, default, night, ops, editorial, glass]
  initial: auto

# input_boolean.yaml
guest_mode:
  name: Guest Mode
```

> Note: `input_text` is 255-char capped. For larger JSON, use a **file-based sensor** (`sensor.mirror_layout`) that reads `/config/www/mirror/layout.json`, with `python_script.build_mirror_layout` writing to that file. Frontend subscribes to that sensor's `state_changed` event.

### Python script
`ha/python_scripts/build_mirror_layout.py`:
- Inputs: mode, orientation, theme override, current tile context (plex state, service states, inventory counters).
- Loads preset JSON from `ha/layouts/<mode>.<orientation>.json`.
- Applies dynamic substitutions (Plex ratingKey, Immich album id, service list from current HA state).
- Writes final JSON to `www/mirror/layout.json` and bumps a `sensor.mirror_layout_revision` counter.

### Core automations
- `automation.mirror_mode_selector` — compute mode from time + presence + alerts.
- `automation.mirror_plex_focus` — on Plex playing, swap to `media` mode; on stop, revert.
- `automation.mirror_alert_swap` — on service down, force `ops` mode until cleared.
- `automation.mirror_inventory_weekly` — Sunday 19:00, go to `inventory` mode for 15 min.
- `automation.mirror_guest_toggle` — on `input_boolean.guest_mode`, swap to editorial.

### Reverse channel (frontend → HA)
Frontend fires `mirror.tile_event` via WS event bus with `{ tile_id, action, payload }`. HA automations listen:
- `tile.ended` (video/episode finished) → next recommendation.
- `tile.clicked` (click anywhere → wake / dismiss alert).
- `tile.audio_conflict` → log which tile wanted audio.

---

## 8. Frontend architecture

### Stack
- **SvelteKit** + TypeScript (lighter than React on Celeron, reactive layout diffing native).
- **gridstack.js** for grid renderer (no drag in kiosk — used purely as layout engine with FLIP).
- **home-assistant-js-websocket** for WS client.
- **hls.js** for Plex streaming.
- **video.js** *not* used — native `<video>` + hls.js is enough.
- **Vite** build. Prerender shell, hydrate with live state.
- No Tailwind — plain CSS variables for themes. Use `@layer` if scope grows.

### Folder layout
```
frontend/
├── src/
│   ├── app.html
│   ├── lib/
│   │   ├── ha/                    # WS auth, subscribe, services
│   │   ├── grid/                  # gridstack wrapper, FLIP, diff
│   │   ├── tiles/                 # one .svelte per type + registry.ts
│   │   ├── themes/                # default.css, night.css, ops.css, ...
│   │   ├── audio/                 # single-audio guard
│   │   ├── stores/                # layout, theme, connection, telemetry
│   │   └── utils/                 # log, env, safe-fetch
│   └── routes/
│       └── +page.svelte           # renderer entry
└── package.json
```

### State flow
```
HA WS ─── state_changed(sensor.mirror_layout_revision)
                │
                ▼
        fetch /local/mirror/layout.json
                │
                ▼
        layoutStore.set(newLayout)
                │
                ▼
        grid diff(prev, next) → tile adds / moves / removes
                │
                ▼
        FLIP animate + re-render tile components
```

### Diff rules
- Match tiles by `id`.
- Same id + same type → reposition, preserve state.
- Same id + new type → unmount then mount.
- New id → mount.
- Missing id → unmount.

### Single-audio guard
```ts
// audio/guard.ts
function enforceSingleAudio(layout: Layout): Layout {
  const audioTiles = layout.tiles.filter(t => t.audio);
  if (audioTiles.length <= 1) return layout;
  // keep first, mute rest, emit event
  const keepId = audioTiles[0].id;
  const patched = layout.tiles.map(t =>
    t.audio && t.id !== keepId ? { ...t, audio: false, props: { ...t.props, muted: true } } : t,
  );
  haEmit('mirror.audio_conflict', { tried: audioTiles.map(t => t.id), kept: keepId });
  return { ...layout, tiles: patched };
}
```

---

## 9. Kiosk / OS / deployment

### Users
- `mirror` — autologin via GDM, runs kiosk chromium fullscreen.
- `$YOU` — normal desktop user, separate session, landscape by default.
- Switch via GDM user switcher — rotation auto-flips per user.

### systemd units
- `mirror-frontend.service` (system-level): runs `node /opt/mirror/build/index.js` on `:3000`. Reads `/etc/mirror/config.env` for `HA_URL`, `HA_TOKEN`, `NODE_EXTRA_CA_CERTS`.
- `mirror-kiosk.service` (user-level, `mirror` user): waits for frontend, starts `chromium --kiosk --app=http://localhost:3000 --autoplay-policy=no-user-gesture-required --disable-infobars --noerrdialogs`.
- `mirror-unclutter.service` (user-level): `unclutter -idle 1` hides cursor.

### Chromium flags
```
--kiosk
--app=http://localhost:3000
--autoplay-policy=no-user-gesture-required
--disable-infobars
--disable-session-crashed-bubble
--disable-features=TranslateUI
--noerrdialogs
--hide-crash-restore-bubble
--no-first-run
--enable-features=VaapiVideoDecoder,VaapiVideoEncoder
--ignore-gpu-blocklist
```
HW decode verified via `chrome://media-internals`.

### HA cert trust
- Copy HA CA cert → `/usr/local/share/ca-certificates/ha.crt`
- `sudo update-ca-certificates`
- Chromium picks up NSS; Node picks up via `NODE_EXTRA_CA_CERTS=/etc/mirror/ha.crt` env.

### Install wizard prompts
```
HA URL            : https://ha.local:8123
HA long-lived token: ****
Orientation       : [landscape / portrait-cw / portrait-ccw]
Plex URL + token  : (optional now, set later via web UI)
Immich URL + key  : (optional)
Frigate URL       : (optional)
Grocy URL + key   : (optional — inventory)
```
Writes `/etc/mirror/config.env`, drops systemd units, enables + starts.

---

## 10. Build phases (updated)

| Phase | Deliverable | Sessions |
|-------|-------------|----------|
| 0 | `mirror` user + autologin + kiosk chromium hitting `about:blank`. Rotation verified per user. | 1 |
| 1 | SvelteKit skeleton + gridstack renderer + hardcoded layout (clock + weather). systemd unit. | 1 |
| 2 | HA WS bridge. `sensor.mirror_layout_revision` subscribe. `www/mirror/layout.json` fetch. 2 HA automations flip layout on time. | 1 |
| 3 | Core tile pack: clock, weather, calendar, service_status, host_health, immich_slideshow, frigate_camera. | 2 |
| 4 | Media pack: plex_player (hls.js), plex_recent, plex_now_playing, youtube, podcast. Single-audio guard. | 1 |
| 5 | Inventory pack: Grocy integration, inventory_grid, low_stock_alert. `inventory` mode. | 1 |
| 6 | Mode engine: `python_script.build_mirror_layout` + all preset JSONs for portrait + landscape × 9 modes. | 1 |
| 7 | Themes: `default`, `night`, `ops`, `editorial`, `glass`. Theme override logic. | 1 |
| 8 | Installer wizard (`install.sh` + whiptail) + cert trust + systemd bundle. | 1 |
| 9 | Polish: FLIP motion, burn-in guard, telemetry events, docs. | 1 |

---

## 11. Open questions

- [ ] Which mockup wins for default? (Recommendation: **02 Bento**. Confirm or swap.)
- [ ] Which mockup for ops mode? (Recommendation: **03 Ops**.)
- [ ] Grocy on HA Supervisor or separate VM/container?
- [ ] Project source — GitHub, Gitea, Linear, Jira? (affects tile fetch code)
- [ ] Frigate already deployed or installing fresh?
- [ ] Single Immich album or random across library?
- [ ] Portrait or landscape install default?
- [ ] Plex Pass present? (Affects HW transcode decisions)
- [ ] Default `night` mode cutoff time?

---

## 12. Decisions locked

- Frontend stack: **SvelteKit + TypeScript + gridstack.js + hls.js**.
- Transport: Node process (not static + nginx), for env + CA cert handling.
- Install: bare-metal systemd (no Docker) — simpler kiosk + fewer layers.
- Two Ubuntu users, GDM autologin for `mirror`.
- Layout JSON served from HA `/local/mirror/layout.json`, revision-triggered.
- One audio source per layout, hard-enforced.
- At most 6 simultaneously animating tiles.
- Cursor hidden (`unclutter`), passive — no touch in v1.
