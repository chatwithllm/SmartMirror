# Deploy Smart Mirror v1.0.0 from release

End-to-end deploy guide. Three machines: **dev laptop** (optional — for sanity),
**Home Assistant box** (runs HA itself), **mirror box** (Celeron mini PC + 43"
TV running Ubuntu Desktop). Steps 1–6 are sequential; step 7+ are optional.

---

## 0. What you need before you start

| Item | Where | Notes |
|------|-------|-------|
| Mirror box | physical | Celeron N-series, 8GB RAM, HDMI 2.0, USB webcam (optional) |
| 43" TV | physical | mounted vertical (portrait default) or landscape |
| Ubuntu Desktop 24.04+ | pre-installed on mirror box | GDM session, admin user with sudo |
| Home Assistant | reachable over LAN | any install flavour; Mosquitto addon if you want gesture |
| HA long-lived token | HA profile → Security → Long-lived access tokens | copy to `/etc/mirror/config.env` |
| HA URL | e.g. `https://ha.local:8123` | self-signed cert OK — installer trusts it |
| Optional: Plex URL + token | for media tiles | |
| Optional: Frigate URL + go2rtc | for camera tiles | |
| Optional: Immich URL + API key | for photo slideshow | |
| Optional: Grocy URL + API key | for inventory | |
| Optional: webcam with LED | for gesture addon | |

Download the release tarball: https://github.com/chatwithllm/SmartMirror/releases/tag/v1.0.0

---

## 1. Prepare the mirror box OS

Fresh-install Ubuntu Desktop, log in with an admin user.

```bash
sudo apt-get update
sudo apt-get install -y git curl chromium-browser whiptail unclutter \
  ca-certificates software-properties-common

# VA-API bits for HW decode (Celeron iGPU)
sudo apt-get install -y vainfo intel-media-va-driver-non-free
vainfo | head       # confirm H.264 + HEVC profiles listed
```

Node 20 LTS + pnpm:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pnpm@10
```

Wayland rotation tool (if you picked portrait):

```bash
sudo apt-get install -y wlr-randr
```

---

## 2. Pull the release into `/opt/mirror`

```bash
sudo mkdir -p /opt/mirror
sudo chown $USER:$USER /opt/mirror
cd /opt
git clone --depth 1 --branch v1.0.0 https://github.com/chatwithllm/SmartMirror.git mirror
cd mirror
git checkout v1.0.0         # verify tag
```

Build the frontend once so systemd has something to serve:

```bash
cd /opt/mirror/frontend
pnpm install --frozen-lockfile
pnpm check
pnpm test -- --run
pnpm build
```

Expected: `✓ built in ~1s`, `Using @sveltejs/adapter-node · ✔ done`.

---

## 3. Trust the HA cert (only if self-signed)

```bash
# Grab HA's cert (or copy from your HA host /ssl/fullchain.pem)
echo | openssl s_client -servername ha.local -connect ha.local:8123 2>/dev/null \
  | openssl x509 > /tmp/ha.crt

sudo install -m 0644 /tmp/ha.crt /usr/local/share/ca-certificates/ha.crt
sudo update-ca-certificates

# Node reads from this path via systemd EnvironmentFile
sudo install -m 0644 /tmp/ha.crt /etc/mirror/ha.crt
```

If HA uses a public CA (Let's Encrypt), skip this step.

---

## 4. Run the installer

```bash
cd /opt/mirror

# Preview — prints every intended change, touches nothing.
sudo bash installer/install.sh --dry-run

# Apply
sudo bash installer/install.sh
```

The installer prompts for:

1. **Orientation** — `portrait-cw` (default) / `portrait-ccw` / `landscape`
2. **HA URL** — include `https://` and port
3. **HA token** — paste the long-lived token

Then it:

- Creates the `mirror` user, adds to `video,audio,input` groups
- Enables GDM autologin (`/etc/gdm3/custom.conf`)
- Drops `/home/mirror/.config/monitors.xml` for rotation
- Writes `/etc/mirror/config.env` (root:mirror, 0640)
- Installs `mirror-frontend.service` (system-level)
- Installs `mirror-kiosk.service` (mirror user-level)
- Installs `/usr/local/bin/mirror-kiosk.sh` with chromium flags
- Runs `systemctl daemon-reload` + enables both units

Verify before reboot:

```bash
sudo systemctl cat mirror-frontend
sudo systemctl cat --user --machine=mirror@ mirror-kiosk
ls -la /etc/mirror/config.env       # expect 0640 root:mirror
cat /etc/mirror/config.env          # sanity — HA_URL populated?
```

Start frontend without rebooting:

```bash
sudo systemctl start mirror-frontend
sleep 3
curl -sf http://localhost:3000/ | head -20   # expect <!doctype html>
```

If 3000 is empty, tail the log:

```bash
journalctl -u mirror-frontend -f
```

---

## 5. Install HA-side config

Two options: push via git-sync addon, or rsync into `/config/`.

### Option A — copy via Samba / VSCode addon

From your dev machine, copy the `ha/` folder into your HA `/config/` root so
you end up with `/config/ha/` on HA. Then edit `/config/configuration.yaml`:

```yaml
# configuration.yaml
input_select:  !include ha/input_select.yaml
input_boolean: !include ha/input_boolean.yaml
input_text:    !include ha/input_text.yaml
input_number:  !include ha/input_number.yaml

template: !include ha/sensor.yaml
rest_command: !include ha/rest_command.yaml

python_script:

automation mirror: !include_dir_merge_list ha/automations/
script mirror:     !include_dir_merge_named ha/scripts/

# (optional) mqtt discovery for gesture
mqtt: !include ha/mqtt/discovery.yaml
```

Drop the python scripts into HA's expected path:

```bash
cp /config/ha/python_scripts/*.py /config/python_scripts/
```

Reload HA: *Developer Tools → YAML → Check Configuration*, then *Restart*.

### Option B — git-sync

Add the HA git-sync addon, point it at this repo, and it'll pull `ha/`
automatically on every push.

### Verify HA side

1. *Developer Tools → States* — search `input_select.mirror_preset` etc. All
   helpers present.
2. *Developer Tools → Services* — call `python_script.build_mirror_layout`
   with empty data. Expect no error.
3. *States* — `sensor.mirror_layout_file` now holds an int + `layout_json`
   attribute. `sensor.mirror_layout_revision` mirrors the same integer.

---

## 6. Boot the kiosk

```bash
sudo reboot
```

On boot:
- GDM autologs `mirror` user
- `mirror-frontend.service` starts Node on :3000
- `mirror-kiosk.service` waits for `curl localhost:3000`, then chromium
  launches full-screen
- Rotation applies (monitors.xml)
- Cursor hidden (unclutter, if installed)

You should see the default work layout with clock + weather (real data
replaces demo data once HA starts pushing revisions).

Flip the preset in HA:

```
Settings → Devices & Services → Helpers → Mirror Preset → relax-minimal
```

Layout swap visible within ~300 ms.

---

## 7. (Optional) Gesture addon

On your HA host:

1. Copy `addons/mirror-gesture/` to HA `/addons/mirror-gesture/` (local
   addon store), or configure the HA Supervisor to watch this repo.
2. *Settings → Add-ons → Add-on Store → ⋮ → Check for updates* — installs
   Mirror Gesture.
3. Configure the addon:

   ```yaml
   enabled: true
   face_blur: true
   fps_limit: 15
   mqtt_host: core-mosquitto
   mqtt_port: 1883
   mqtt_topic: mirror/gesture
   ```

4. Plug the webcam into the mirror box (not HA). Or point
   `camera_index` at a different `/dev/videoN` if you have a webcam on HA.
5. Start the addon. Log should print `mediapipe loaded`.
6. In HA, turn on `input_boolean.mirror_gesture_enable`.
7. Wave an open palm at the webcam → `Developer Tools → Events → mirror_gesture`
   fires → frontend advances the mode.

Privacy: the addon never emits frames. Face-blur default on. LED stays
visible whenever the camera is in use. `enabled: false` releases the
webcam in ≤3 s.

---

## 8. (Optional) Resolution switch over SSH

Let HA drop the mirror box to 1080p when Plex saturates the iGPU.

On the mirror box:

```bash
sudo install -m 0755 /opt/mirror/scripts/set-mode-via-ssh.sh \
  /usr/local/bin/set-mode-via-ssh.sh

# sudoers — allow wlr-randr + systemctl without password
sudo tee /etc/sudoers.d/mirror > /dev/null <<'EOF'
%mirror ALL=NOPASSWD: /usr/bin/wlr-randr, /bin/systemctl
EOF
sudo visudo -c
```

On the HA host, add the mirror box's SSH pubkey to `mirror@<mirrorbox>:~/.ssh/authorized_keys`.

Test from HA:

```
Developer Tools → Services → rest_command.mirror_set_resolution
  data:  { res: "1080p", rot: "cw" }
```

Watch `Settings → Devices & Services → mirror_set_resolution` for response.

Automation `06_mirror_perf_downshift.yaml` is already wired: sustained
FPS < 30 triggers this command automatically.

---

## 9. Media integrations (optional, per-service)

Each tile renders demo data until the matching HA integration is online.

### Plex
- *Settings → Devices → Add → Plex* — standard HA Plex integration
- Write your Plex URL + token into `/etc/mirror/config.env`:

  ```
  PLEX_URL=https://plex.home.local:32400
  PLEX_TOKEN=xxxxxxxx
  ```

- `sensor.plex_continue_watching.rating_key` should populate; the Plex
  tile reads it on next layout rebuild.

### Frigate + go2rtc
- Add the Frigate addon, configure your cameras.
- `/config/frigate.yaml` → add a `go2rtc.streams` block per camera.
- Frontend tile props:

  ```json
  { "camera": "driveway", "go2rtc_base": "http://frigate.local:1984", "stream": "mse" }
  ```

See `docs/frigate-go2rtc.md`.

### Immich
- Install `immich-home-assistant` custom integration OR point the tile at
  a REST sensor.
- Fill `IMMICH_URL` + `IMMICH_KEY` in `/etc/mirror/config.env`.

### Grocy
- HA core `grocy` integration.
- Inventory tiles read from Grocy entity attributes once populated.

---

## 10. Verify — smoke checklist

Run on the mirror box:

```bash
bash /opt/mirror/tests/e2e-smoke.sh
```

Expected:

```
==> Frontend build        ✅
==> Preview server        ✅
==> Smoke checks
  ✅ preview returns 200
  ✅ preview HTML contains <title>
  ✅ bundle under 400KB gzipped
🎉 smoke test passed
```

Live HA variant (from the dev machine or HA box):

```bash
HA_URL=https://ha.local:8123 HA_TOKEN=eyJ0... \
  bash /opt/mirror/tests/e2e-smoke.sh
```

Adds live checks: HA reachable, `sensor.mirror_layout_revision` present.

---

## 11. Day-2 ops

### Restart frontend
```bash
sudo systemctl restart mirror-frontend
```

### Restart kiosk only (keeps Node running)
```bash
sudo systemctl --machine=mirror@ --user restart mirror-kiosk.service
```

### Tail logs
```bash
journalctl -u mirror-frontend -f
journalctl --user --machine=mirror@ -u mirror-kiosk -f
```

### Update to a newer release
```bash
cd /opt/mirror
git fetch --tags
git checkout v1.0.1           # or whatever the next tag is
cd frontend && pnpm install --frozen-lockfile && pnpm build
sudo systemctl restart mirror-frontend
```

### Temporarily disable the mirror without uninstall
```bash
sudo systemctl stop mirror-frontend mirror-kiosk
# re-enable:
sudo systemctl start mirror-frontend mirror-kiosk
```

### Switch user back to desktop
- GDM user switcher → pick your admin account → normal desktop session.
- `mirror` user session stays, kiosk resumes when you switch back.

### Burn-in guard
Already active. `lib/grid/burnin.ts` rotates static pixels every 8 min.

### Edit mode (reposition / resize tiles live)
1. `input_boolean.mirror_edit_mode` → on
2. Drag/resize in the UI → change round-trips through HA
   (`python_script.patch_mirror_layout`)
3. Auto-off after 15 min (automation `07_mirror_edit_mode_timeout`)

---

## 12. Troubleshooting pointers

- Kiosk black / stuck on "waiting for Home Assistant…" — see `docs/troubleshooting.md`
- Plex stutters / software decode — `docs/plex-hw-decode-verify.md`
- Frigate camera offline — `docs/frigate-go2rtc.md`
- Gesture false-positives — `docs/gesture-demo.md`
- Theme not swapping — compat guard forces a legal (mode × theme) combo and
  toasts the coercion

---

## 13. Uninstall

```bash
sudo systemctl disable --now mirror-kiosk.service --machine=mirror@ --user
sudo systemctl disable --now mirror-frontend.service

sudo rm -f /etc/systemd/system/mirror-frontend.service
sudo rm -f /etc/systemd/user/mirror-kiosk.service
sudo rm -f /usr/local/bin/mirror-kiosk.sh
sudo rm -rf /etc/mirror

sudo systemctl daemon-reload
sudo userdel -r mirror          # WARNING: deletes /home/mirror
sudo rm -f /etc/sudoers.d/mirror
```

Roll back GDM autologin by editing `/etc/gdm3/custom.conf` and removing the
`AutomaticLogin*` lines.
