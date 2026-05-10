# Gesture demo + test plan

## Architecture (Phase 13.2)

```
USB webcam
   │
   ▼
mirror-gesture.service (systemd, kiosk PC, mirror user)
   ├─ MediaPipe Hands @ 15 fps
   ├─ face blur (Haar cascade)
   ├─ classifier with hold-time gate (gestures.py)
   └─ per-gesture cooldown (default 800 ms)
   │
   │   POST http://localhost:3000/api/gesture
   │   Authorization: Bearer ${MIRROR_GESTURE_TOKEN}
   │
   ▼
SvelteKit Node server
   ├─ /api/gesture        — validates bearer, gestureBus.emit
   └─ /api/gesture/stream — SSE subscriber
   │
   │   text/event-stream
   ▼
browser
   ├─ sse.ts → router.dispatch
   └─ handlers.ts → focusedTile / fullscreenTile / ytCmd / window event

Side channel for global state (still HA, still REST):
   gesture service → POST /api/events/mirror_gesture (HA bus)
                  → ha/automations/05_mirror_gesture_router.yaml
                  → input_select.select_next on mode_next
                  → input_boolean.turn_off (5 min) on lock
```

Frames never leave the kiosk PC. The HA round-trip exists only for the
two gestures that change global HA state.

## Gesture vocabulary

| Gesture | What you do | What happens |
|---|---|---|
| `wake` | Open palm enters frame | Toast "gesture · awake" — proof of life |
| `mode_next` | Open palm, swipe → | HA cycles `input_select.mirror_mode` forward |
| `mode_prev` | Open palm, swipe ← | HA cycles `input_select.mirror_mode` backward |
| `focus` | Point with index finger | Cycle through visible tiles (sets `focusedTile`) |
| `tile_fullscreen` | Pinch open (thumb away from index) | Focused tile takes the stage |
| `tile_minimize` | Pinch shut (thumb meets index) | Return to grid |
| `media_pause` | Open palm held still ~1 s | `ytCmd('yt_toggle')` on the YouTube tile |
| `lock` | Closed fist held ~1 s | HA disables gesture service for 5 min, LED off |
| `alert_ack` | (handler exists; classifier doesn't emit yet) | Dispatches `mirror:alert_ack` window event |

`resize_grow`/`resize_shrink` registered as toast stubs — the bundled-
layouts simplification removed `patch_layout`. Restore the service to
re-enable.

## Demo flow

1. Open `input_boolean.mirror_gesture_enable` in HA → on.
2. `journalctl -u mirror-gesture.service -f` shows "camera opened".
3. Wave an open palm — toast appears. ✅ Service → SSE → router live.
4. Swipe right → mode advances within ~2 s. ✅ Service → HA → kiosk poll.
5. Point with index finger → tile border highlights, scale 1.03.
6. Pinch open → focused tile fills the screen.
7. Pinch shut → returns to grid.
8. Hold open palm → YouTube tile pause/play.
9. Hold a fist for ~1 s → service log says "gesture enable → off",
   webcam LED goes dark, browser stops receiving gestures.
10. Wait 5 min → HA re-enables; service reacquires camera; LED on.

## Kill-switches

| Switch | Effect | Latency |
|---|---|---|
| `systemctl stop mirror-gesture` | Camera released | <2 s |
| `input_boolean.mirror_gesture_enable` off | Camera released, LED off | ≤1 s |
| Unplug USB | Service logs "camera read failed", retries | n/a |

## Privacy contract

- Pixels never cross the kiosk's localhost boundary.
- Default face blur is a structural choice, not a setting people
  remember to turn on.
- The webcam LED is the visible contract: LED on ⇒ frames being read.
  When the gating boolean is off, the camera is *released*, not just
  "muted in software" — the LED actually goes dark.
- Bearer-authed POST to `/api/gesture` so a stray curl on the LAN
  can't fake gestures into the UI.
