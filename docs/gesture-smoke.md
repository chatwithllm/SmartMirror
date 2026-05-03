# Gesture · end-to-end smoke checklist

Walk this top-to-bottom on the real kiosk PC after plugging the USB
webcam in. Each step has what to expect and the most likely failure
mode. Stop at the first red light — don't chase a downstream failure
when an upstream one already explains it.

## 0. Pre-flight (60 s)

```bash
# Mirror frontend is up
curl -fsS http://localhost:3000/api/admin/stats | head -1
# expect: a JSON line with {"cpu":…,"ram":…}

# Camera is enumerated and the mirror user can reach it
ls -l /dev/video*
groups mirror | tr ' ' '\n' | grep -q video && echo "video group ok"

# v4l-utils available (auto-pick uses v4l2-ctl)
command -v v4l2-ctl

# HA env present (only if you want mode/lock to work)
sudo cat /etc/mirror/config.env | grep -E 'HA_URL|HA_TOKEN' | sed 's/=.*/=…/'
```

If `mirror` is not in the `video` group: `sudo usermod -aG video mirror`
then `sudo systemctl restart mirror-frontend`. The kiosk session needs
to re-login for that to take effect.

## 1. Install the service

```bash
sudo bash /opt/mirror/installer/install-gesture.sh
```

Expect the last lines:

```
* mirror-gesture.service - Smart Mirror Gesture Service
   Active: active (running) since …
done. tail logs with: journalctl -u mirror-gesture.service -f
```

If it dies on `pip install mediapipe`: you're on a Python the wheel
doesn't ship for. Check `python3 --version` (need 3.11+); on Ubuntu
24.04 default is 3.12 which works.

## 2. Watch the service start

```bash
journalctl -u mirror-gesture.service -f
```

Expect, in order:

```
starting: local=http://localhost:3000 ha=http://… blur=True cooldown=800ms floor=0.70
camera opened: index=N 640x480
```

If you see `camera opened: index=0` but the LED doesn't light, the
device probably isn't `/dev/video0`. Set `CAMERA_INDEX=N` in
`/etc/mirror/config.env` and `systemctl restart mirror-gesture`.

## 3. Verify the SSE channel is live

In a second terminal:

```bash
curl -N http://localhost:3000/api/gesture/stream
```

Expect an immediate `: hello <ts>` line, then a `: hb <ts>` every 15 s.
Leave this running — gesture events will appear here once you start
waving.

If you get a 404, the SvelteKit build is stale: `sudo systemctl restart
mirror-frontend`.

## 4. Confirm the bearer gate is closed to anonymous

```bash
curl -i -X POST http://localhost:3000/api/gesture \
  -H 'content-type: application/json' \
  -d '{"gesture":"wake","confidence":1,"ts":1}'
```

Expect: `HTTP/1.1 403 Forbidden` body `forbidden`.

If you get `200 OK`, `MIRROR_GESTURE_TOKEN` is empty in the
SvelteKit env — `cat /etc/mirror/config.env | grep TOKEN`. If the
installer ran cleanly it should be there; if not, set it manually
with `openssl rand -hex 32` and restart `mirror-frontend`.

## 5. Confirm the bearer gate opens with the right token

```bash
TOK=$(sudo grep MIRROR_GESTURE_TOKEN /etc/mirror/config.env | cut -d= -f2)
curl -i -X POST http://localhost:3000/api/gesture \
  -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d '{"gesture":"wake","confidence":1,"ts":'"$(date +%s)"'}'
```

Expect: `200 OK` body `{"ok":true}`. The curl from step 3 should also
print one `event: gesture` line at this moment.

## 6. First hand wave

Stand 60-90 cm from the camera. Wave an open palm side to side once.

- **journalctl** should print a `POST http://localhost:3000/api/gesture`
  log line (no warning) per classified gesture.
- **curl /api/gesture/stream** from step 3 should print
  `event: gesture\ndata: {"gesture":"wake",…}`.
- **Browser** (open the kiosk URL) should flash a toast
  `gesture · awake` in the bottom-right.

If 1 and 2 happen but 3 doesn't, the browser side isn't subscribing —
check DevTools → Network for `/api/gesture/stream` (should be open,
text/event-stream).

If nothing happens, lighting is the usual culprit. MediaPipe Hands
needs ~200 lux on the hand. Try with a desk lamp pointed at you.

## 7. Mode cycling (needs HA)

```bash
# Watch HA's mode select
watch -n1 'curl -s -H "Authorization: Bearer $HA_TOKEN" \
  $HA_URL/api/states/input_select.mirror_mode | jq .state'
```

Swipe → with an open palm. Within 1-2 s:

- HA `input_select.mirror_mode` advances by one option.
- The mirror's layout swaps (the page polls the helper every 2 s).

If the HA state doesn't change, the gesture service can't reach HA:
`journalctl -u mirror-gesture.service` will show
`POST http://…/api/events/mirror_gesture failed`. Check
`HA_URL`/`HA_TOKEN` in `/etc/mirror/config.env`.

If HA changes but the layout doesn't, that's a layout-poll problem
(unrelated to gesture).

## 8. Focus + fullscreen

1. Point with index finger only → first tile gets the
   `[data-focused='true']` border (visible: 1.03× scale, accent
   border colour).
2. Point again → focus advances; wraps at the last tile.
3. Pinch open (thumb away from index) → focused tile takes the stage
   (`position: fixed; inset: 0`).
4. Pinch shut → returns to the grid.

If pinch is missed: thresholds in `gestures.py` (`PINCH_OPEN=0.18`,
`PINCH_SHUT=0.06`) are tuned for the C270 — recalibrate by logging
`d_first, d_last` in `classify()` and watching real values for a
deliberate pinch.

## 9. Media pause

Open the YouTube tile (paste a video via `/paste` if needed). Then
hold an open palm still in front of the camera for ~1 second.

Expect: video toggles pause/play. Toast shows nothing (this gesture
is silent on success).

If it doesn't fire, the palm-stillness threshold
(`PALM_STILLNESS_THRESHOLD=0.04`) might be too tight for shaky hands —
relax to `0.06`.

## 10. Privacy panic — lock

Make a fist and hold for ~1 second.

- **Service log**: `gesture enable → off; releasing camera`.
- **Webcam LED**: goes dark within ~2 s.
- **Browser**: stops receiving gesture events.
- **HA**: `input_boolean.mirror_gesture_enable` is `off`.

Wait 5 minutes (or toggle the HA boolean back on manually). The
service log shows `gesture enable → on; reacquiring camera`, LED
relights, gestures resume.

## 11. Failure modes (negative tests)

| Scenario | Expected behavior |
|---|---|
| Unplug the USB webcam | Service logs `camera read failed; sleeping 1 s` and retries every second. Re-plug → next loop iteration reopens. |
| `sudo systemctl stop mirror-gesture` | LED off in ≤2 s. Browser stops receiving gestures. SSE stays open. |
| Stop mirror-frontend | Service logs `POST http://localhost:3000/api/gesture failed` once a second. Doesn't crash. |
| HA unreachable | UI gestures keep working. mode/lock silently no-op. Logs warn but don't spam. |
| Wrong `HA_TOKEN` | Same as above — service can't fire HA event. |
| `MIRROR_GESTURE_TOKEN` mismatch | Service log shows 403 from localhost. UI silent. Re-run `install-gesture.sh` to regenerate. |

## 12. Performance smoke

```bash
# Watch CPU while gesturing
top -p "$(pgrep -f mirror_gesture)"
```

On a Celeron N5095 with the C270 at 640×480 / 15 fps you should see
single-core CPU around 30-45% steady. If it's pegged at 100%, drop
`FPS_LIMIT` to 10 or `CAMERA_HEIGHT/WIDTH` to 480×360.

```bash
# Check the kiosk frontend isn't suffering
curl -s http://localhost:3000/api/admin/stats | jq '.cpu, .ram'
```

Should be unchanged from baseline; the gesture service runs in its
own process.

## When you're done

```bash
# Confirm autostart
systemctl is-enabled mirror-gesture.service
# expect: enabled
```

The service comes up on boot after `mirror-frontend.service`. Reboot
the box to confirm cold-boot health:

```bash
sudo reboot
# wait 60 s, then:
journalctl -b -u mirror-gesture.service --no-pager | head -30
```

Expect a clean `starting:` → `camera opened:` sequence with no errors.
