# Smart Mirror — Autonomous Build Phases

Self-contained prompts, one per phase. Each phase = one branch, one PR, one merge. All branches kept alive until full build complete.

**Read first:** `DESIGN_SPEC.md`, `FRONTEND_SPEC.md`, `BACKEND_SPEC.md`, `AGENT_INSTRUCTIONS.md`.

**Branch naming:** `phase-NN-<slug>` · e.g. `phase-00-kiosk`, `phase-05-plex-tile`.

**Merge strategy:** merge commit (no squash) into `main`. Branch kept alive — `git branch --delete` never called until all 14 phases green.

**Definition of done per phase:**
- All acceptance criteria met
- Tests pass (`pnpm test` + unit YAML lint for HA)
- Type check clean (`pnpm check`)
- Commit messages follow conventional commits
- PR body fills template (below)
- Merged to `main`

**PR body template (every phase):**
```
## Phase NN — <title>

### Delivered
- [bullet list of concrete files]

### Acceptance
- [x] <criterion 1>
- [x] <criterion 2>

### Risks / follow-ups
- <any known issue carried forward>

### Test output
```
$ pnpm test
<paste>
```

Closes #<phase-issue-number>
```

---

## Phase 00 — kiosk shell + repo bootstrap

**Goal:** Empty repo becomes an auto-booting kiosk serving a placeholder page.

**Pre-reqs user supplies before starting:**
- Local repo path
- Git remote URL (GitHub/Gitea)
- SSH access to mirror box (host, user, key)
- HA URL + long-lived token (will be written to `/etc/mirror/config.env` later)

**Deliverables:**
1. Repo init, `.gitignore`, `.editorconfig`, `README.md` (install quickstart), `LICENSE` (MIT).
2. Directory scaffold per `FRONTEND_SPEC.md §2` + `BACKEND_SPEC.md §2`. Empty-but-present.
3. `installer/install.sh` — whiptail wizard **stub**: prompts orientation + HA URL, writes `/etc/mirror/config.env`, creates `mirror` user, enables GDM autologin, copies `monitors.xml` for rotation, drops systemd units (see 4).
4. `installer/systemd/mirror-kiosk.service` — launches chromium `--kiosk` to `about:blank` for now.
5. `installer/chromium/mirror-kiosk.sh` — full Chromium flag list from `BACKEND_SPEC.md §10`.
6. `installer/gdm/custom.conf.tmpl`, `installer/monitors/portrait-cw.xml.tmpl`.
7. CI: GitHub Actions workflow `.github/workflows/ci.yml` — runs `shellcheck installer/**/*.sh` and `yamllint` on `ha/`.

**Acceptance:**
- `bash installer/install.sh --dry-run` prints intended changes without touching anything.
- Fresh Ubuntu Desktop VM (or the real box) after `install.sh`: reboot → chromium auto-launches in portrait → shows `about:blank`.
- CI green on the PR.

**Git:**
```bash
git checkout -b phase-00-kiosk
# work
git add -A && git commit -m "feat(installer): scaffold kiosk install + systemd + rotation"
git push -u origin phase-00-kiosk
gh pr create --title "Phase 00 — kiosk shell + repo bootstrap" --body "$(PR_BODY)"
gh pr merge --merge
# DO NOT delete the branch
```

---

## Phase 01 — frontend skeleton

**Goal:** SvelteKit app renders a single hard-coded `clock` tile. systemd runs it on `:3000`. Kiosk points at it.

**Deliverables:**
1. `frontend/package.json` — SvelteKit, TS, vitest, playwright, gridstack, home-assistant-js-websocket, hls.js, zod, flip-toolkit. `pnpm` lockfile.
2. `frontend/src/app.html`, `+layout.svelte`, `+page.svelte` — minimal renderer.
3. `frontend/src/lib/tiles/BaseTile.svelte` and `ClockTile.svelte` per `FRONTEND_SPEC.md §5`.
4. `frontend/src/lib/grid/Grid.svelte` — gridstack wrapper, accepts a hard-coded layout prop.
5. Hard-coded layout (inline constant in `+page.svelte`): one clock tile centered.
6. `installer/systemd/mirror-frontend.service` wired and enabled.
7. Kiosk service `ExecStartPre` waits on `curl localhost:3000`.
8. Vitest: clock renders current time; advance fake timer → time text updates.
9. Playwright: boot app, expect `[data-tile-id="clock"]` visible.

**Acceptance:**
- `pnpm dev` shows clock on dev machine.
- After deploy, rebooting the mirror box shows the live clock fullscreen kiosk.
- Vitest + Playwright green.

**Git:** branch `phase-01-frontend-skeleton`, same merge flow.

---

## Phase 02 — HA wiring (entities + python_script stub)

**Goal:** HA side has the full entity surface. `python_script.build_mirror_layout` writes a valid layout JSON. `sensor.mirror_layout_revision` bumps on each write.

**Deliverables:**
1. `ha/input_select.yaml`, `ha/input_boolean.yaml`, `ha/input_text.yaml`, `ha/input_number.yaml` per `BACKEND_SPEC.md §3`.
2. `ha/sensor.yaml` — template sensor for layout revision + any_service_down stub.
3. `ha/python_scripts/build_mirror_layout.py` — resolves preset/mode/theme/orientation, writes minimal layout to `/config/www/mirror/layout.json`, bumps revision.
4. `ha/automations/00_mirror_mode_selector.yaml` — triggers on time_pattern + state changes, calls python_script.
5. `ha/layouts/work.portrait.json` — minimal valid layout with just clock+weather tiles (fixture for phase 03).
6. `ha/README.md` — how to install HA config snippets, where to drop them.
7. YAML lint CI step.

**Acceptance:**
- Paste `ha/` snippets into test HA instance → no config errors on reload.
- Calling `python_script.build_mirror_layout` manually writes valid JSON.
- `sensor.mirror_layout_revision` increments.
- YAML lint green.

**Git:** `phase-02-ha-wiring`.

---

## Phase 03 — control loop

**Goal:** Mirror box WS-connects to HA, subscribes to layout revision, fetches JSON, renders through diff engine. Change preset in HA → UI swaps in <300ms.

**Deliverables:**
1. `frontend/src/lib/ha/client.ts` — WS auth, reconnect, exponential backoff.
2. `frontend/src/lib/ha/subscribe.ts` — state_changed + event subscriptions.
3. `frontend/src/lib/layout/schema.ts` (zod), `store.ts`, `fetch.ts`, `diff.ts`, `flip.ts` per `FRONTEND_SPEC.md §3–4`.
4. `+page.svelte` switches from hard-coded layout to live store-driven layout.
5. `frontend/src/lib/stores/connection.ts` — WS state with UI indicators.
6. `frontend/src/lib/audio/single-audio.ts` — enforce one audio tile.
7. Add `weather` tile minimal impl to prove diff works with >1 tile type.
8. Error states: connection-lost pill, invalid-layout toast, failing tile placeholder.
9. Vitest: every diff case (add/move/resize/remove/swap) produces correct patch list.
10. Playwright: mock HA, emit layout changes, assert <300ms diff-to-DOM.

**Acceptance:**
- Change `input_select.mirror_preset` in HA UI → mirror layout swaps visibly.
- Pull network cable on mirror box → pill appears, layout frozen.
- Invalid JSON pushed → toast, previous layout retained.

**Git:** `phase-03-control-loop`.

---

## Phase 04 — core tile pack

**Goal:** 10 core non-media tiles implemented with props + state subscriptions.

**Tiles in scope:**
`clock` (upgrade), `weather` (upgrade), `calendar`, `news_briefing`, `service_status`, `host_health`, `alerts`, `log_tail`, `metrics_chart`, `iframe`.

**Deliverables:**
1. `frontend/src/lib/tiles/<Type>Tile.svelte` per each type, with `PropsSchema` zod.
2. Registry entry for each.
3. Each tile subscribes only to the HA entities it needs.
4. Vitest: render with minimal props for each type; assert key DOM present.
5. Playwright visual regression snapshots for each tile in each of the 4 themes (skip themes — phase 09; use default CSS for now).
6. `ha/layouts/ops.portrait.json` — uses all 10 tile types to exercise them.
7. Add `binary_sensor.up_*` for each monitored service to `ha/sensor.yaml`.

**Acceptance:**
- Switching to `ops-ops` preset renders all 10 tiles without errors.
- Hot-unplug a monitored service → `service_status` tile shows red pill + timestamp updates.
- All component tests green.

**Git:** `phase-04-core-tiles`.

---

## Phase 05 — Plex tile (highest tech risk)

**Goal:** Plex HLS playback in a tile on Celeron. HW decode confirmed.

**Deliverables:**
1. `frontend/src/lib/tiles/PlexPlayerTile.svelte` — hls.js, autoplay, mute, scrub, volume.
2. `PlexNowPlayingTile.svelte`, `PlexRecentTile.svelte`.
3. `ha/scripts/mirror_plex_prep.yaml` — fills `sensor.plex_continue_watching.rating_key` attribute.
4. Resolution-aware bitrate from `RES_CAPS` in `frontend/src/lib/resolution/tile-props.ts`.
5. `ha/automations/01_mirror_plex_focus.yaml` — Plex playing → swap to `relax-minimal`.
6. `ha/layouts/relax.portrait.json` completed with Plex hero.
7. Telemetry hook: emit decode-failure events.
8. Manual test checklist in `docs/plex-hw-decode-verify.md` — how to inspect `chrome://media-internals` to confirm VaapiVideoDecoder used.

**Acceptance:**
- Plex tile plays a 4K direct-play title without stuttering at 1080p render target.
- Pausing via gesture or HA service updates UI within 200ms.
- `chrome://media-internals` shows VaapiVideoDecoder engaged on the mirror box.

**Git:** `phase-05-plex-tile`.

---

## Phase 06 — media tile pack

**Goal:** Frigate cam, Immich slideshow, YouTube, podcast, all production-ready.

**Deliverables:**
1. `FrigateCameraTile.svelte` using go2rtc MSE stream; fallback to JSMpeg.
2. `ImmichSlideshowTile.svelte` — random asset fetch via Immich API, 8s rotation, manual prev/next.
3. `YouTubeTile.svelte` — iframe embed with `enablejsapi=1`, mute+autoplay.
4. `PodcastTile.svelte` — RSS fetch OR HA media_player state; scrubber, play/pause/skip.
5. `single-audio.ts` updated to block mid-mount audio conflicts.
6. `ha/layouts/morning.portrait.json` + `relax.portrait.json` updated with full tile set.
7. Frigate HA integration config snippet in `ha/README.md`.
8. go2rtc config example in `docs/frigate-go2rtc.md`.

**Acceptance:**
- Driveway Frigate stream visible in tile, latency <500ms.
- Immich tile rotates through album without flash of unstyled content.
- Pausing Plex keeps podcast muted; swapping layout preserves current podcast timestamp.

**Git:** `phase-06-media-tiles`.

---

## Phase 07 — inventory + shopping bundle

**Goal:** Shopping, inventory, recipes, expiry, budget tiles wired to Grocy.

**Deliverables:**
1. Tiles: `inventory_grid`, `low_stock_alert`, `shopping_list`, `recipe_suggest`, `expiry`, `budget`.
2. HA Grocy integration snippet.
3. Layout `shopping.portrait.json` completed from mockup 09.
4. `ha/automations/03_mirror_inventory_weekly.yaml` — Sunday 19:00 swap to `shopping-minimal` for 15 min.
5. Click-to-check offline queue (if WS down, queue check-offs, flush on reconnect).
6. Tests: toggle each shopping item, assert count updates + service call fired.

**Acceptance:**
- Tap shopping item → Grocy marks complete → next fetch reflects state.
- Low-stock automation forces layout to inventory when 3+ items below threshold.

**Git:** `phase-07-inventory`.

---

## Phase 08 — work + focus bundle

**Goal:** Pomodoro, meeting, PRs, deploy, messages, goals tiles.

**Deliverables:**
1. Tiles: `pomodoro`, `meeting_countdown`, `project_board`, `pr_list`, `deploy_pipeline`, `messages`, and a `goals` variant (sub-tile of `host_health` or new).
2. HA GitHub integration snippet or REST sensor wiring.
3. `work.portrait.json` from mockup 07.
4. DND binds to `input_boolean.mirror_dnd`.
5. Pomodoro state persists across layout swap.

**Acceptance:**
- Start pomodoro in work mode → swap to relax mode → swap back → timer still running.
- PR merged in GitHub → pr_list reflects within 60s (polling window).

**Git:** `phase-08-work-focus`.

---

## Phase 09 — security + night bundle

**Goal:** Alarm panel, event timeline, sensor grid, quick actions. Night mode polish.

**Deliverables:**
1. Tiles: `alarm_panel`, `event_timeline`, `sensor_grid`, `quick_actions`.
2. `security.portrait.json` + `night.portrait.json` from mockup 10 + 01.
3. HA alarm_control_panel + Frigate events integration.
4. Ack flow: button → service call → HA updates entity → tile re-renders.
5. Night mode additional behavior: reduce brightness of clock tile via CSS filter.

**Acceptance:**
- Arm change in HA reflected within 200ms.
- Ack event removes from unack list without reload.
- Night mode: brightness reduction visible.

**Git:** `phase-09-security-night`.

---

## Phase 10 — morning + ambience bundle

**Goal:** Remaining tiles to complete the 10-mode set.

**Deliverables:**
1. Tiles: `routine_checklist`, `coffee_timer`, `commute`, `ambient_scenes`, `device_slider`, `sleep_timer`.
2. `morning.portrait.json` from mockup 06.
3. Landscape variants of all 10 layouts (porting portrait → landscape): 10 new files.
4. Landscape testing on a dummy 1920×1080 viewport.

**Acceptance:**
- Toggle `input_select.mirror_orientation` between portrait/landscape → layout swaps correctly.
- Every tile works in both orientations.
- Sleep timer fires a scene change at expiry via service call.

**Git:** `phase-10-morning-ambience`.

---

## Phase 11 — themes

**Goal:** 4 theme CSS files, lazy loader, compat guard.

**Deliverables:**
1. `frontend/src/lib/themes/minimal-dark.css`, `ops-cyberpunk.css`, `editorial.css`, `security.css`.
2. `frontend/src/lib/themes/loader.ts` with 400ms cross-fade.
3. `frontend/src/lib/themes/compat.ts` + frontend coercion logic.
4. Tile CSS audit — replace all literal colors with tokens.
5. Playwright visual regression snapshots: every core tile × every theme = 40+ snapshots.
6. Backend `python_script.build_mirror_layout` resolves theme via same COMPAT map (both sides match).

**Acceptance:**
- Change `input_select.mirror_theme` → CSS swaps with no tile remount.
- Illegal combo (e.g. `ops` mode + `editorial` theme) → warning event + coerces to `ops-cyberpunk`.

**Git:** `phase-11-themes`.

---

## Phase 12 — resize / FLIP / edit mode

**Goal:** Tiles resize smoothly; edit mode works; edit-mode patches round-trip to HA.

**Deliverables:**
1. `frontend/src/lib/grid/edit-mode.ts` — gridstack handles enabled when `input_boolean.mirror_edit_mode` is on.
2. `ha/scripts/mirror_patch_tile.yaml` + `python_script.patch_mirror_layout` — accept `{id,x,y,w,h}` patches.
3. FLIP animation on every persisting tile on layout diff.
4. Min/max per tile + aspect ratio locks.
5. `ha/automations/07_mirror_edit_mode_timeout.yaml`.
6. Burn-in guard store.

**Acceptance:**
- Turn on edit mode → drag tile → release → HA sees patch, JSON rewritten, other clients would see same.
- Auto-off after 15 min.
- FLIP animates smoothly (60fps measured).

**Git:** `phase-12-resize-edit`.

---

## Phase 13 — gesture subsystem

**Goal:** Webcam → MediaPipe → MQTT → HA events → frontend actions.

**Deliverables:**
1. `addons/mirror-gesture/` full addon per `BACKEND_SPEC.md §7`. Dockerfile, config.yaml, Python MediaPipe + classifier + MQTT publisher.
2. `ha/mqtt/discovery.yaml`.
3. `ha/automations/05_mirror_gesture_router.yaml`.
4. `frontend/src/lib/gesture/events.ts` + `router.ts`.
5. Focus visuals, cycle-mode on swipe, resize on pinch.
6. Privacy: face blur on, LED-on webcam required, addon off by default.
7. Test plan + demo script in `docs/gesture-demo.md`.

**Acceptance:**
- Wave hand at webcam (while addon on) → `event.mirror_gesture` appears in HA.
- Pinch-out gesture on focused tile → tile grows by 1 grid cell.
- Turn off `input_boolean.mirror_gesture_enable` → addon releases webcam within 3s.

**Git:** `phase-13-gesture`.

---

## Phase 14 — telemetry + errors + installer polish + docs

**Goal:** Production hardening. Ship-ready.

**Deliverables:**
1. `frontend/src/lib/telemetry/fps.ts` + `report.ts` — POST metrics every 60s.
2. HA rest sensors for `mirror_frontend_fps`, `mirror_frontend_heap_mb`, `mirror_frontend_dom_nodes`.
3. `ha/automations/06_mirror_perf_downshift.yaml` functional — downshift res on sustained low FPS.
4. `scripts/set-mode-via-ssh.sh` + `rest_command.mirror_set_resolution`.
5. Installer wizard full whiptail flow per `BACKEND_SPEC.md §9`.
6. `docs/` index: architecture, install, troubleshooting, theme-authoring, tile-authoring, gesture-setup.
7. `README.md` — quickstart (5 commands).
8. `CHANGELOG.md` — all phases summarized.
9. End-to-end smoke test script in `tests/e2e-smoke.sh`.

**Acceptance:**
- `curl -sS http://ha/api/states/sensor.mirror_frontend_fps` returns recent value.
- Sustained low FPS triggers resolution downshift; log confirms.
- Fresh install on blank Ubuntu box from install script → working mirror in <15min.
- `docs/` renders cleanly (markdown lint).
- `CHANGELOG.md` mentions every phase PR.

**Git:** `phase-14-polish`.

---

## After all 14 phases merged

Agent's **final action**:
1. Verify all 14 branches still exist (never deleted).
2. Run `tests/e2e-smoke.sh` against a fresh test box.
3. Tag release: `git tag v1.0.0 && git push origin v1.0.0`.
4. Open a tracking issue `#release-v1.0.0` with checklist of all 14 PRs.
5. Ping the user via the configured notification channel (see `AGENT_INSTRUCTIONS.md`).

**Ping payload example:**

> ✅ Smart Mirror v1.0.0 build complete.
> · 14 phases merged, all branches preserved.
> · Release: https://github.com/<user>/smart-mirror/releases/tag/v1.0.0
> · Smoke test: passed (FPS 52, heap 138MB, DOM 2104).
> · Known follow-ups: (list any in CHANGELOG "known issues" section).

---

## Phase dependencies

```
00 ──┬── 01 ── 03 ── 04 ─┬── 05 ─┬── 06 ─┬── 07 ─┬── 11 ── 12 ── 13 ── 14
     │                   │       │       │       │
     └── 02 ─────────────┘       │       │       └── 08
                                 │       │
                                 │       └── 09
                                 │
                                 └── 10
```

Phases 07/08/09/10 are parallelizable (independent tile bundles). Everything converges at 11 (themes) because theme CSS needs every tile present for visual audit.

Agent may run 07–10 in parallel branches; merge order into main is 07 → 08 → 09 → 10 to keep history linear.

---

## Notes for agent autonomy

- Never merge a PR whose CI is failing.
- Never skip tests.
- Never force-push main.
- If a phase gets stuck (>2 retries on the same error), open a `needs-human` labeled issue with full context and **continue to the next independent phase**. Resume blocked phase when human resolves.
- Every commit: Conventional Commits format (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).
- Every commit trailer: `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Never commit secrets. `.env` files gitignored from phase 00.
