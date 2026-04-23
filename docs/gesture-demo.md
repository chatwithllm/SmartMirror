# Gesture demo + test plan

## Prereqs
- HA with Mosquitto addon and `mqtt:` integration active
- Webcam with a visible LED
- This addon installed and `enabled: true` via the addon UI
- `input_boolean.mirror_gesture_enable` toggled on

## Demo flow

1. Open `input_boolean.mirror_gesture_enable` in HA → turn on.
2. Open the mirror UI.
3. Wave an open palm left-to-right in front of the camera.
   - MQTT `mirror/gesture` receives `{ gesture: "mode_next" }`.
   - HA `mirror_gesture` event fires.
   - Frontend router advances `input_select.mirror_mode`.
4. Wave open palm right-to-left → mode_prev.
5. Close fist and hold 1 second → `lock` (addon pauses 5 min).
6. Pinch out / in on a focused tile → `resize_grow` / `resize_shrink` → tile
   resizes by 1 grid cell. Patch round-trips through HA (Phase 12 script).

## Kill-switches

- Addon UI toggle `enabled: false` → webcam released within 3 s.
- `input_boolean.mirror_gesture_enable` off → router ignores gestures.
- LED always on while webcam in use.

## Privacy
- Face blur default on (`face_blur: true`).
- Frames never leave the addon; only classified gesture + confidence + ts
  are published on MQTT.
- Rolling window is 3 frames, dropped on empty hands.
