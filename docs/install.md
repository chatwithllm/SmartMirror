# Install the mirror on a fresh box

## Prereqs
- Ubuntu Desktop on the kiosk hardware, GDM session
- Network reachability to HA
- Admin user with sudo

## Quickstart

```bash
git clone https://github.com/chatwithllm/SmartMirror.git /opt/mirror
cd /opt/mirror
sudo bash installer/install.sh --dry-run     # preview
sudo bash installer/install.sh                # apply
```

The installer:

1. Prompts orientation + HA URL + HA token
2. Creates the `mirror` user, enables GDM autologin
3. Drops `/home/mirror/.config/monitors.xml` with the chosen rotation
4. Writes `/etc/mirror/config.env`
5. Installs `mirror-frontend.service` (SSR, port 3000) and `mirror-kiosk.service` (chromium)
6. Kiosk waits on `curl localhost:3000` before launching chromium

## Post-install

```bash
systemctl status mirror-frontend
systemctl --user --machine=mirror@ status mirror-kiosk
curl http://localhost:3000/
```

## HA side

Copy `ha/` into the HA config folder and wire includes per `ha/README.md`.
Reload YAML; verify `sensor.mirror_layout_revision` appears.

## Gesture addon (optional)

`addons/mirror-gesture/` is a standard HA addon. Point the local addon
store at the repo's `addons/` folder, then install + enable. Keep the
webcam LED visible.
