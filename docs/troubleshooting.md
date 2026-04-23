# Troubleshooting

## Kiosk shows "waiting for Home Assistant"
- `systemctl status mirror-frontend` — is Node up?
- `curl http://localhost:3000/` — does the SSR return HTML?
- `/etc/mirror/config.env` — HA_URL and HA_TOKEN populated?
- Network: can the box reach HA? `curl -k $HA_URL/api/`

## Black screen / no chromium
- `systemctl --user --machine=mirror@ status mirror-kiosk`
- GDM autologin configured? `/etc/gdm3/custom.conf`
- Rotation correct? `/home/mirror/.config/monitors.xml`

## Plex stutters on 4K
- `chrome://media-internals` — is `VaapiVideoDecoder` active?
- Drop to 1080p via HA `input_select.mirror_resolution`.
- Automation `06_mirror_perf_downshift` auto-drops on sustained FPS < 30.

## Gestures fire false positives
- Lower `fps_limit` in addon options.
- Raise confidence threshold in `src/main.py` (0.7 → 0.8).
- Check `mirror/gesture` MQTT topic with `mosquitto_sub`.

## Theme doesn't swap
- Check layout JSON `theme` vs `mode` — compat guard coerces illegal pairs.
- Toast will appear if coerced; the console logs the reason.
