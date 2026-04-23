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

### Phase 06 — media tile pack
- `FrigateCameraTile` — go2rtc WS stub + status chip
- `ImmichSlideshowTile` — demo-image rotation with prev/next + resolution-aware thumb size
- `YouTubeTile` — iframe embed with jsapi params, autoplay/mute defaults
- `PodcastTile` — HTML5 audio control, scrub bar, ±15/30s skip
- Registry expanded to 17 tile types
- `ha/layouts/morning.portrait.json` — full morning bundle
- `docs/frigate-go2rtc.md` — go2rtc config cheatsheet
