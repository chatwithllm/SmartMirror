# Gesture setup

## Prereqs
- HA Supervisor / HAOS (addon support)
- Mosquitto addon + `mqtt:` integration live
- Webcam with visible LED

## Steps

1. Add the repo's `addons/` folder to HA's **Local add-ons** store:

   ```
   Settings → Add-ons → Add-on Store → ⋮ → Repositories → add file:///…/addons
   ```

2. Install **Mirror Gesture**. Configure:

   ```yaml
   enabled: true
   face_blur: true
   fps_limit: 15
   mqtt_host: core-mosquitto
   mqtt_topic: mirror/gesture
   ```

3. Start the addon. Check logs — expect a single "mediapipe loaded" line.

4. In HA, enable `input_boolean.mirror_gesture_enable`.

5. Smoke: wave an open palm across the camera → watch `Developer Tools →
   Events → mirror_gesture`.

## Kill-switches

- Addon toggle `enabled: false` — webcam released in ≤3s.
- `input_boolean.mirror_gesture_enable` off — router ignores events.
- LED always visible while webcam is open.
