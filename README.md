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

## Quickstart (v1.0.0)

Full guide: **[docs/deploy.md](docs/deploy.md)**. TL;DR on the mirror box:

```bash
sudo apt-get install -y git curl chromium-browser whiptail unclutter \
  vainfo intel-media-va-driver-non-free wlr-randr
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs && sudo npm install -g pnpm@10

sudo git clone --branch v1.0.0 https://github.com/chatwithllm/SmartMirror.git /opt/mirror
cd /opt/mirror/frontend && pnpm install --frozen-lockfile && pnpm build
cd /opt/mirror && sudo bash installer/install.sh --dry-run   # preview
sudo bash installer/install.sh                                # apply
sudo reboot
```

On the HA side, copy `ha/` into `/config/` and wire includes per [ha/README.md](ha/README.md).

## Hardware

- 43" TV (ex-Lululemon display panel), HDMI
- Celeron-class mini PC, 8 GB RAM, iGPU with VA-API
- Optional: USB webcam for gesture control (Logitech C270 / Brio)

## Target

- 4K UHD portrait default (switchable to 1440p / 1080p)
- Coexists with normal Ubuntu desktop (dedicated `mirror` user for the kiosk session)

## License

MIT — see [LICENSE](LICENSE).
