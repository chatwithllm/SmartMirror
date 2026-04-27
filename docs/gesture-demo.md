# Gesture demo + test plan

## Architecture

```
webcam → mirror-gesture addon (MediaPipe + face blur)
       → MQTT topic   mirror/gesture
       → HA gesture router (ha/automations/05_mirror_gesture_router.yaml):
           1. fires event.mirror_gesture
           2. mirrors latest into input_text.mirror_last_gesture
           3. routes mode_next/prev → input_select.mirror_mode cycle
           4. routes lock           → input_boolean.mirror_gesture_enable off (5 min)
       → kiosk REST poll every 1 s on input_text.mirror_last_gesture
       → frontend gesture router (lib/gesture/router.ts) dispatches
       → registered handlers act on the focused tile / fullscreen state
```

The frontend uses REST polling (no websocket) to match every other
HA-driven entity in this build. The HA automation owns mode cycling
and the lock kill-switch; the kiosk owns focus, fullscreen, alert ack,
and media pause.

## Prereqs

- HA with Mosquitto addon and `mqtt:` integration active
- Webcam with a visible LED
- This addon installed and `enabled: true` via the addon UI
- `input_boolean.mirror_gesture_enable` toggled on
- `ha/packages/mirror.yaml` includes `input_text.mirror_last_gesture` (added in this phase)
- `ha/automations/05_mirror_gesture_router.yaml` loaded (e.g. via
  `automation: !include_dir_merge_list automations/`)

## Demo flow

1. Open `input_boolean.mirror_gesture_enable` in HA → turn on.
2. Open the mirror UI.
3. Wave an open palm left-to-right in front of the camera.
   - MQTT `mirror/gesture` receives `{ gesture: "mode_next" }`.
   - HA fires `event.mirror_gesture` and updates `input_text.mirror_last_gesture`.
   - HA cycles `input_select.mirror_mode` to the next option.
   - Frontend layout poll (≤2 s) swaps the layout for the new mode.
4. Wave open palm right-to-left → `mode_prev`.
5. Close fist and hold ~1 second → `lock` → addon paused for 5 min,
   webcam LED dark.
6. Open palm forward (focus) → focused-tile ring advances; visible as
   `[data-focused='true']` border on the active `<section.tile>`.
7. Pinch out → `tile_fullscreen` → focused tile takes the stage.
   Pinch in → `tile_minimize` → return to the grid.
8. With a YouTube tile playing → palm-down (media_pause) toggles play.
9. With an alert toast on screen → swipe up (alert_ack) dispatches
   `mirror:alert_ack` on `window`.

## Kill-switches

- Addon UI toggle `enabled: false` → webcam released within 3 s.
- `input_boolean.mirror_gesture_enable` off → bridge automation
  short-circuits, no events propagate, and the helper stops updating
  so the kiosk goes quiet too.
- LED always on while webcam in use.

## Privacy

- Face blur default on (`face_blur: true`).
- Frames never leave the addon; only classified gesture + confidence + ts
  are published on MQTT.
- Rolling window is 3 frames, dropped on empty hands.
- The kiosk only sees `{ gesture, ts, payload }` JSON via REST — no
  pixels, no landmarks.

## Notes & limits

- `resize_grow` / `resize_shrink` are received and surfaced as a toast
  but are intentionally not wired to a layout patch in this build —
  layouts are bundled into the frontend bundle (no `patch_layout`
  service). Restore the service and the gesture handler picks them up
  unchanged.
- Stale events older than 30 s (e.g. left in the helper after a
  reboot) are dropped on the first poll; the first tick is treated as
  the baseline so a page reload can't replay an old gesture.
