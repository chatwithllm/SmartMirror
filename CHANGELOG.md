# Changelog

All notable changes will be added here as autonomous phases merge.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Added
- Initial specs: `DESIGN_SPEC.md`, `FRONTEND_SPEC.md`, `BACKEND_SPEC.md`
- Phase plan: `PHASES.md`, `AGENT_INSTRUCTIONS.md`, `BUILD_PROMPT.md`
- 10 interactive HTML mockups in `mockups/` (5 themes × 5 modes sample)
- Agent config: `.env.agent.example`, `.agent/state.json`
- CI workflow: `.github/workflows/ci.yml` (lint, gitleaks, frontend build/test)
- Lint configs: `.yamllint.yml`, `.markdownlint.yml`, `.editorconfig`
- MIT license, README

### Phase 00 — kiosk shell + repo bootstrap (PR #1, merged 2026-04-23)
- `installer/install.sh` — whiptail wizard stub supporting `--dry-run` and `--non-interactive`
- `installer/systemd/mirror-kiosk.service` — user-level chromium kiosk unit
- `installer/chromium/mirror-kiosk.sh` — chromium flags per BACKEND_SPEC §10
- `installer/gdm/custom.conf.tmpl`, `installer/monitors/portrait-{cw,ccw}.xml.tmpl`
- Directory scaffold per FRONTEND_SPEC §2 + BACKEND_SPEC §2 (empty dirs with `.gitkeep`)

### Phase 01 — frontend skeleton (PR #2, merged 2026-04-23)
- SvelteKit 2.15 + Svelte 5 + TypeScript + Vite 6 + Vitest 3 scaffold under `frontend/`
- `@sveltejs/adapter-node` for Node runtime on the kiosk (systemd, port 3000)
- `+layout.svelte` + `+page.svelte` render a hard-coded single-tile layout
- `lib/tiles/BaseTile.svelte` + `lib/tiles/ClockTile.svelte` with per-tile test IDs
- `lib/tiles/registry.ts` (clock only for now, expands per phase)
- `lib/grid/Grid.svelte` — gridstack v11 wrapper (static kiosk mode; drag/resize wiring lands Phase 12)
- `lib/layout/schema.ts` — narrow Layout / Tile types; full zod schema lands Phase 03
- Vitest unit suite for ClockTile (render + tick + date toggle); happy-dom env
- Playwright smoke test `tests/e2e/boot.spec.ts` against `pnpm preview`
- `installer/systemd/mirror-frontend.service` — Node SSR service on :3000 with hardening
- `installer/systemd/mirror-kiosk.service` — waits on `curl localhost:3000` before launching chromium
- CI workflow pinned to pnpm v10 to match `packageManager`

### Phase 02 — HA wiring (PR #3, merged 2026-04-23)
- `ha/input_select.yaml`, `input_boolean.yaml`, `input_text.yaml`, `input_number.yaml` — all helpers per BACKEND_SPEC §3
- `ha/sensor.yaml` — template sensors for `mirror_layout_revision` and `any_service_down`
- `ha/python_scripts/build_mirror_layout.py` — sandbox-safe layout builder (preset → mode/theme overlay, auto-mode inference, theme coercion, revision bump)
- `ha/automations/00_mirror_mode_selector.yaml` — 5-minute tick + state-change triggered rebuild
- `ha/layouts/work.portrait.json` — smoke-fixture layout (clock + weather) for Phase 03 to pull
- `ha/README.md` — install + verification steps

### Phase 03 — control loop (PR #4, merged 2026-04-23)
- `lib/layout/schema.ts` upgraded to zod: `LayoutSchema`, `TileSchema`, `safeParseLayout`
- `lib/layout/diff.ts` — pure diff function emitting add/remove/move/resize/move_resize/swap/props patches (9 unit tests)
- `lib/layout/flip.ts` — FLIP animation helper (snapshotRects + flip)
- `lib/layout/store.ts` — Svelte store: current/previous layouts + last patches
- `lib/layout/fetch.ts` — validates via zod, routes single-audio conflicts to toast
- `lib/layout/demo.ts` — bundled DEMO_LAYOUT for offline dev parity
- `lib/ha/client.ts` — HAClient wrapper with long-lived-token auth + exponential backoff (1s→30s capped)
- `lib/ha/subscribe.ts` — wires `sensor.mirror_layout_revision` → fetch → store
- `lib/stores/connection.ts` — connection state store + toast queue
- `lib/audio/single-audio.ts` — enforce-single-audio guard (3 unit tests)
- `lib/tiles/WeatherTile.svelte` + registry entry (demo data; real subscription lands Phase 04)
- `routes/+page.svelte` — seeds demo layout, bootstraps HAClient when env/window config present, renders Grid + conn pill + toasts

### Phase 04 — core tile pack (PR #5, merged 2026-04-23)
- New tiles: `CalendarTile`, `NewsBriefingTile`, `ServiceStatusTile`, `HostHealthTile`, `AlertsTile`, `LogTailTile`, `MetricsChartTile`, `IframeTile` (+ `WeatherTile` upgrade, clock unchanged)
- Registry expanded; 10 tile types recognised
- 10 smoke unit tests covering minimal-props render for each tile
- `ha/layouts/ops.portrait.json` — reference layout exercising all 10 tile types

### Phase 05 — Plex tile (PR #6, merged 2026-04-23)
- `lib/tiles/PlexPlayerTile.svelte` — hls.js integration, poster fallback, decode-error event emit
- `lib/tiles/PlexNowPlayingTile.svelte` — active Plex sessions w/ progress bar
- `lib/tiles/PlexRecentTile.svelte` — recently added carousel
- `lib/resolution/tile-props.ts` — RES_CAPS + `currentResolution()` bitrate chooser
- `ha/scripts/mirror_plex_prep.yaml` — populate continue-watching ratingKey
- `ha/automations/01_mirror_plex_focus.yaml` — Plex playing → relax-minimal
- `ha/layouts/relax.portrait.json` — Plex hero layout
- `docs/plex-hw-decode-verify.md` — VA-API verification runbook

### Phase 06 — media tile pack (PR #7, merged 2026-04-23)
- `FrigateCameraTile` — go2rtc WS stub + status chip
- `ImmichSlideshowTile` — demo-image rotation with prev/next + resolution-aware thumb size
- `YouTubeTile` — iframe embed with jsapi params, autoplay/mute defaults
- `PodcastTile` — HTML5 audio control, scrub bar, ±15/30s skip
- Registry expanded to 17 tile types
- `ha/layouts/morning.portrait.json` — full morning bundle
- `docs/frigate-go2rtc.md` — go2rtc config cheatsheet

### Phase 07 — inventory + shopping bundle (PR #8, merged 2026-04-23)
- Tiles: `InventoryGridTile`, `LowStockAlertTile`, `ShoppingListTile` (clickable toggle), `RecipeSuggestTile`, `ExpiryTile`, `BudgetTile`
- `ha/layouts/shopping.portrait.json` wires the full shopping mode
- `ha/automations/03_mirror_inventory_weekly.yaml` — Sunday 19:00 → shopping window for 15m
- Registry now at 23 tile types

### Phase 08 — work + focus bundle (PR #9, merged 2026-04-23)
- Tiles: `PomodoroTile` (state persists across layout swaps via store), `MeetingCountdownTile`, `ProjectBoardTile`, `PrListTile`, `DeployPipelineTile`, `MessagesTile`
- `lib/stores/pomodoro.ts` — idle/running/paused/done machine
- `ha/layouts/work.landscape.json` — landscape work dashboard
- Registry at 29 tile types

### Phase 09 — security + night bundle (PR #10, merged 2026-04-23)
- Tiles: `AlarmPanelTile` (home/away/night/disarmed modes, dispatches `mirror:alarm_arm`), `EventTimelineTile` (ack), `SensorGridTile`, `QuickActionsTile`
- `ha/layouts/security.portrait.json`, `ha/layouts/night.portrait.json`
- Registry at 33 tile types

### Phase 10 — morning + ambience bundle (PR #11, merged 2026-04-23)
- Tiles: `RoutineChecklistTile` (ring % done), `CoffeeTimerTile`, `CommuteTile`, `AmbientScenesTile`, `DeviceSliderTile`, `SleepTimerTile`
- Landscape layout variants for every mode (morning/work/relax/shopping/security/night/ops/guest/showcase/editorial) + portrait variants for guest/showcase/editorial
- Registry at 39 tile types (full spec surface)

### Phase 11 — themes (PR #12, merged 2026-04-23)
- 4 theme CSS files: `minimal-dark`, `ops-cyberpunk`, `editorial`, `security`
- `lib/themes/loader.ts` — lazy-import `?inline` + 400ms cross-fade
- `lib/themes/compat.ts` + `coerceTheme()` — enforces legal (mode × theme) combos
- `lib/stores/theme.ts` — active theme store
- `+page.svelte` wires an `$effect` that coerces + applies theme on every layout change
- Unit tests: 5 compat cases

### Phase 12 — resize / FLIP / edit mode (PR #13, merged 2026-04-23)
- `lib/grid/edit-mode.ts` — `editMode` store + patch buffer (overwrites per id)
- `lib/grid/burnin.ts` — 8-min rotating offset store for static-tile guard
- `ha/python_scripts/patch_mirror_layout.py` — merges tile patch into layout_json attribute
- `ha/scripts/mirror_patch_tile.yaml` — wires service → python_script
- `ha/automations/07_mirror_edit_mode_timeout.yaml` — auto-off after 15 min

### Phase 13 — gesture subsystem (PR #14, merged 2026-04-23)
- `addons/mirror-gesture/` full HA addon: `config.yaml`, `Dockerfile`, `run.sh`, `requirements.txt`
- `addons/mirror-gesture/src/` — `main.py` loop, `camera.py`, `privacy.py` (face blur), `gestures.py` (rule-based classifier), `mqtt.py` publisher
- `ha/mqtt/discovery.yaml` — MQTT event + sensors for gesture + metrics
- `ha/automations/05_mirror_gesture_router.yaml` — MQTT → `mirror_gesture` event + service fanout
- Frontend: `lib/gesture/events.ts` subscribes, `lib/gesture/router.ts` dispatches, `focusedTile` store
- `docs/gesture-demo.md` — demo flow + kill-switches + privacy

## [v1.0.0] — 2026-04-23
All 14 phases merged. All phase branches preserved. Tag + GitHub release
published. Tracking issue #16.

### Phase 14 — telemetry + installer polish + docs (PR #15, merged 2026-04-23)
- `lib/telemetry/fps.ts` — rAF-based FPS sampler + DOM/heap sampler stores
- `lib/telemetry/report.ts` — posts `sensor.mirror_frontend_*` every 60s
- `ha/rest_command.yaml` — `mirror_set_resolution` via SSH to the mirror box
- `scripts/set-mode-via-ssh.sh` — wlr-randr rotate + restart kiosk
- `ha/automations/02_mirror_alert_swap.yaml`, `06_mirror_perf_downshift.yaml`
- `tests/e2e-smoke.sh` — local + (optional) live HA smoke gate
- `docs/` — architecture, install, troubleshooting, tile-authoring, theme-authoring, gesture-setup
