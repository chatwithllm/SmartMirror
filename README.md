# Smart Mirror

Dynamic, Home-Assistant-driven dashboard for a 43" TV mounted vertical. Live tiles for clock, weather, calendar, Plex, Immich, Frigate cameras, inventory (Grocy), service health, projects, alerts. 4 themes, 10 modes, optional webcam gesture control.

> **Status:** v1.0.0 shipped — [release notes](https://github.com/chatwithllm/SmartMirror/releases/tag/v1.0.0).

## Deploy

**One-liner** on a fresh Ubuntu Desktop box (as admin user with sudo):

```bash
curl -fsSL https://raw.githubusercontent.com/chatwithllm/SmartMirror/main/installer/bootstrap.sh \
  | sudo bash -s -- \
      --orientation portrait-cw \
      --ha-url http://ha.local:8123 \
      --ha-token YOUR_LONG_LIVED_TOKEN
sudo reboot
```

Installs Node 20, pnpm, Chrome, X11 utils, creates `mirror` user, configures autologin, builds the frontend, drops systemd units, applies rotation, and starts services. Idempotent — safe to re-run.

Full walkthrough: **[docs/deploy.md](docs/deploy.md)**.

## Home Assistant

Copy `ha/packages/mirror.yaml` into `/config/packages/` and enable `packages:` include in `configuration.yaml` — see [ha/README.md](ha/README.md).

One-shot helpers (run on the mirror PC once HA is configured):

```bash
# Persistent CIFS mount of HA /config + /backup shares.
sudo bash /opt/mirror/installer/setup-ha-smb.sh --ha-host 192.168.1.10

# Push the Smart Mirror Lovelace control dashboard into HA.
sudo -u mirror bash /opt/mirror/installer/ha-dashboard.sh

# Reload HA YAML after editing ha/packages/mirror.yaml.
sudo -u mirror bash /opt/mirror/installer/ha-reload.sh
```

## Hardware

- 43" TV mounted portrait, HDMI
- Celeron-class mini PC, 8 GB RAM, iGPU with VA-API
- Optional: USB webcam for gesture control (Logitech C270 / Brio)

## Target

- 4K UHD portrait default (switchable to 1440p / 1080p)
- Coexists with normal Ubuntu desktop (dedicated `mirror` user for the kiosk session)

## License

MIT — see [LICENSE](LICENSE).
