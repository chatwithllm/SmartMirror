# Smart Mirror

Dynamic, Home-Assistant-driven dashboard for a 43" TV mounted vertical. Live tiles for clock, weather, calendar, Plex, Immich, Frigate cameras, inventory (Grocy), service health, projects, alerts. 4 themes, 10 modes, optional webcam gesture control.

> **Status:** spec complete, autonomous build starting. See [CHANGELOG.md](CHANGELOG.md) for progress.

## Documentation

1. [DESIGN_SPEC.md](DESIGN_SPEC.md) — product, hardware, modes, themes, build phases
2. [FRONTEND_SPEC.md](FRONTEND_SPEC.md) — SvelteKit app, tile registry, grid, themes
3. [BACKEND_SPEC.md](BACKEND_SPEC.md) — Home Assistant entities, python_scripts, gesture addon, installer
4. [PHASES.md](PHASES.md) — 14 autonomous build phases with acceptance criteria
5. [AGENT_INSTRUCTIONS.md](AGENT_INSTRUCTIONS.md) — agent workflow rules
6. [BUILD_PROMPT.md](BUILD_PROMPT.md) — how to boot / resume the autonomous agent

## Visual reference

10 interactive HTML mockups under [mockups/](mockups/). Open `mockups/index.html` in a browser for previews of all themes and modes.

## Quickstart (once v1.0.0 ships)

On the mirror box (Ubuntu Desktop):

```bash
git clone https://github.com/chatwithllm/SmartMirror.git /opt/mirror
cd /opt/mirror
sudo bash installer/install.sh
```

The installer prompts for orientation, resolution, HA URL + token, optional Plex/Immich/Frigate/Grocy creds, webcam index. Reboots into kiosk.

On the Home Assistant side, copy snippets from [ha/](ha/) into your config per [ha/README.md](ha/README.md).

## Hardware

- 43" TV (ex-Lululemon display panel), HDMI
- Celeron-class mini PC, 8 GB RAM, iGPU with VA-API
- Optional: USB webcam for gesture control (Logitech C270 / Brio)

## Target

- 4K UHD portrait default (switchable to 1440p / 1080p)
- Coexists with normal Ubuntu desktop (dedicated `mirror` user for the kiosk session)

## License

MIT — see [LICENSE](LICENSE).
