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

---

## Installer / first-boot gotchas (field-tested)

### `mirror-frontend.service: Failed to set up mount namespacing: /var/log/mirror`
The hardened unit uses `LogsDirectory=mirror` so systemd auto-creates the
directory. If you upgraded from an older unit file:
```bash
sudo install -d -o mirror -g mirror /var/log/mirror
sudo systemctl daemon-reload
sudo systemctl reset-failed mirror-frontend
sudo systemctl restart mirror-frontend
```

### `status=203/EXEC` from mirror-frontend
Node 20 missing or `build/index.js` missing. Verify:
```bash
node --version         # expect v20.x
ls /opt/mirror/frontend/build/index.js
```
Fix by re-running `installer/install.sh` — it installs Node 20 + builds the
frontend under the mirror user.

### Kiosk logs `chromium: not found`
Ubuntu 24.04 chromium is a snap with kiosk-hostile confinement. Installer
drops Google Chrome via `.deb`. Kiosk script auto-picks whichever browser is
installed (google-chrome > chromium > chromium-browser > snap chromium).

### Chrome opens but navigates to Google, not localhost:3000
Script reads `$FRONTEND_PORT` from `/etc/mirror/config.env` and builds
`$URL`. Older drafts used `$TARGET` which was never set. Re-install or copy
the current `installer/install.sh` kiosk.sh section.

### Chrome window not fullscreen under GNOME
Script now also passes `--window-size=WxH --window-position=0,0
--start-fullscreen`. If still windowed:
```bash
sudo apt install -y wmctrl
sudo -u mirror DISPLAY=:0 wmctrl -r "Smart Mirror" -b add,fullscreen
```

### "Choose password for new keyring" blocks Chrome on first run
Script passes `--password-store=basic` so Chrome skips keyring. If an old
keyring is still prompting:
```bash
sudo -u mirror rm -rf /home/mirror/.local/share/keyrings
```

### lightdm: `pam_succeed_if ... nopasswdlogin not met`
Mirror user needs to be in the `nopasswdlogin` group. Installer does this.
Manual fix:
```bash
sudo groupadd -r nopasswdlogin 2>/dev/null || true
sudo usermod -aG nopasswdlogin,autologin mirror
sudo systemctl restart lightdm
```

### Autologin logs in admin account instead of mirror
`/etc/lightdm/lightdm.conf` still had `autologin-user=<admin>` from prior
setup. Installer overwrites to `autologin-user=mirror` and removes the
stale `lightdm.conf.d/50-mirror-autologin.conf` drop-in. Re-run
`installer/install.sh`.

### Display rotated but upside-down (180°)
Installer writes `~mirror/.xprofile` with `xrandr --rotate left` for
`portrait-cw`. If your panel needs the other direction, edit `.xprofile`
and swap `left` ↔ `right`, then logout/login.

### Screen looks dark/empty but `curl localhost:3000` returns HTML
Minimal-dark theme is near-black; reflections on a glossy panel obscure
tiles in photos. Inspect the live DOM via remote devtools:
```bash
# ensure kiosk has --remote-debugging-port=9222 in its flags
sudo curl -sL -o /usr/local/bin/websocat \
  https://github.com/vi/websocat/releases/download/v1.13.0/websocat.x86_64-unknown-linux-musl
sudo chmod +x /usr/local/bin/websocat
PAGE=$(curl -s http://localhost:9222/json | python3 -c 'import json,sys;p=[x for x in json.load(sys.stdin) if "Smart" in x.get("title","")][0];print(p["id"])')
echo '{"id":1,"method":"Runtime.evaluate","params":{"expression":"document.querySelectorAll(\"[data-tile-id]\").length"}}' \
  | websocat -n1 "ws://localhost:9222/devtools/page/$PAGE"
```
Expect `"value":2` for the demo layout. If 0, client hydration failed —
SSH-tunnel port 9222 to your dev laptop and open `chrome://inspect` to
attach DevTools.
