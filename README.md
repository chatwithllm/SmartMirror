# Smart Mirror

Dynamic, Home-Assistant-driven dashboard for a 43" TV mounted vertical. Live tiles for clock, weather, calendar, Plex, Immich, Frigate cameras, inventory (Grocy), service health, projects, alerts. 4 themes, 10 modes, optional webcam gesture control.

> **Status:** v1.0.0 shipped — [release notes](https://github.com/chatwithllm/SmartMirror/releases/tag/v1.0.0). Deploy steps: **[docs/deploy.md](docs/deploy.md)**.

## Starting on a new machine

👉 **[NEW_MACHINE.md](NEW_MACHINE.md)** — copy-paste quickstart: install tools, clone, auth, paste prompt.

## Documentation

1. [DESIGN_SPEC.md](DESIGN_SPEC.md) — product, hardware, modes, themes, build phases
2. [FRONTEND_SPEC.md](FRONTEND_SPEC.md) — SvelteKit app, tile registry, grid, themes
3. [BACKEND_SPEC.md](BACKEND_SPEC.md) — Home Assistant entities, python_scripts, gesture addon, installer
4. [PHASES.md](PHASES.md) — 14 autonomous build phases with acceptance criteria
5. [AGENT_INSTRUCTIONS.md](AGENT_INSTRUCTIONS.md) — agent workflow rules
6. [BUILD_PROMPT.md](BUILD_PROMPT.md) — how to boot / resume the autonomous agent
7. [NEW_MACHINE.md](NEW_MACHINE.md) — quickstart to start/resume on any new machine

## Visual reference

10 interactive HTML mockups under [mockups/](mockups/). Open `mockups/index.html` in a browser for previews of all themes and modes.

## Quickstart

**One-liner** on a fresh Ubuntu Desktop box (as admin user with sudo):

```bash
curl -fsSL https://raw.githubusercontent.com/chatwithllm/SmartMirror/main/installer/bootstrap.sh \
  | sudo bash -s -- \
      --orientation portrait-cw \
      --ha-url http://ha.local:8123 \
      --ha-token YOUR_LONG_LIVED_TOKEN
sudo reboot
```

The bootstrap installs system deps (Node 20, pnpm, Chrome, va-api, xdotool, wmctrl), creates the `mirror` user, configures autologin (GDM *or* lightdm), builds the frontend, drops systemd units, applies rotation, and starts services. Idempotent — safe to re-run.

On the HA side, copy `ha/` into `/config/` and wire includes per [ha/README.md](ha/README.md). Full walkthrough: [docs/deploy.md](docs/deploy.md).

## Hardware

- 43" TV (ex-Lululemon display panel), HDMI
- Celeron-class mini PC, 8 GB RAM, iGPU with VA-API
- Optional: USB webcam for gesture control (Logitech C270 / Brio)

## Target

- 4K UHD portrait default (switchable to 1440p / 1080p)
- Coexists with normal Ubuntu desktop (dedicated `mirror` user for the kiosk session)

## License

MIT — see [LICENSE](LICENSE).
