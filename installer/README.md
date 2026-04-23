# Installer

Bash + whiptail installer for the Smart Mirror kiosk.

Phase 00 scope: kiosk user, autologin, display rotation, chromium pointing at `about:blank`. Phase 01 adds the frontend service. Phase 13 adds the gesture addon. Phase 14 hardens the full wizard (Plex / Immich / Frigate / Grocy creds, CA cert trust, Node install, git clone, build).

## Usage

```bash
# Safe preview — no system changes
bash installer/install.sh --dry-run

# Apply (requires root)
sudo bash installer/install.sh

# CI / smoke (no prompts)
sudo bash installer/install.sh --non-interactive
```

## What it does (Phase 00)

1. Creates `mirror` user, adds to `video, audio, input` groups.
2. Writes `/etc/gdm3/custom.conf` — autologin for `mirror`.
3. Writes `/home/mirror/.config/monitors.xml` — rotation per orientation.
4. Writes `/etc/mirror/config.env` — HA URL, token, orientation, resolution.
5. Writes `/etc/systemd/user/mirror-kiosk.service` + `/usr/local/bin/mirror-kiosk.sh`.
6. Enables the kiosk service.

Reboot → `mirror` auto-logs in → kiosk starts → `about:blank` fullscreen.

## Templates

- `systemd/mirror-kiosk.service` — systemd unit (user-level)
- `chromium/mirror-kiosk.sh` — chromium flags
- `gdm/custom.conf.tmpl` — GDM autologin
- `monitors/portrait-cw.xml.tmpl` · `portrait-ccw.xml.tmpl` · `landscape.xml.tmpl`

Templates are copied verbatim (no variable substitution in Phase 00; resolution-aware templating lands in Phase 14).

## Notes

- Requires Ubuntu Desktop with GDM + Wayland.
- Assumes `HDMI-1` connector; real installer detects via `wlr-randr` in later phases.
- `mirror` user coexists with your daily desktop user — switch via GDM user menu to leave kiosk.
