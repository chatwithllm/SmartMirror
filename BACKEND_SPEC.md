# Smart Mirror — Backend Spec

Companion to `FRONTEND_SPEC.md`. Owns the Home Assistant side: entities, automations, python_scripts, layout files, gesture addon, install scripts, systemd units, cert trust, media integrations.

> Backend = source of truth for mode / theme / layout / state. Frontend only reads.

---

## 1. Components overview

```
┌─────────────────────────────────────────────────────────────────────┐
│ Home Assistant (existing)                                            │
│                                                                       │
│   input_select.*    input_boolean.*    input_text.*  input_number.*  │
│        │                    │                                         │
│        ▼                    ▼                                         │
│   automation.mirror_*  →  python_script.build_mirror_layout           │
│                                    │                                   │
│                                    ▼                                   │
│                       /config/www/mirror/layout.json                   │
│                                    +                                   │
│                       sensor.mirror_layout_revision (++int)            │
│                                                                       │
│   MQTT broker ◄──── mirror-gesture addon (MediaPipe)                  │
│       │                                                               │
│       ▼                                                               │
│   event.mirror_gesture (Home Assistant event bus)                     │
└─────────────────────────────────────────────────────────────────────┘
                  ▲                              │
                  │ WS (events, state)           │ HTTPS GET /local/mirror/layout.json
                  │                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Mirror box (Ubuntu Desktop)                                          │
│                                                                       │
│   mirror-frontend.service   (Node SSR SvelteKit on :3000)             │
│   mirror-kiosk.service      (chromium --kiosk under `mirror` user)    │
│   mirror-gesture.service    (optional local MP if not using HA addon) │
│   mirror-metrics            (POST FPS/heap to HA REST API)            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Repository layout (backend scope)

```
smart-mirror/
├── ha/
│   ├── input_select.yaml
│   ├── input_boolean.yaml
│   ├── input_text.yaml
│   ├── input_number.yaml
│   ├── sensor.yaml               # template sensors (layout_revision, armed state, any_down)
│   ├── rest_command.yaml         # HA → mirror box resolution switcher, kiosk reload
│   ├── shell_command.yaml        # local scripts (only if HA runs on mirror box)
│   ├── python_scripts/
│   │   ├── build_mirror_layout.py
│   │   └── patch_mirror_layout.py
│   ├── automations/
│   │   ├── 00_mirror_mode_selector.yaml
│   │   ├── 01_mirror_plex_focus.yaml
│   │   ├── 02_mirror_alert_swap.yaml
│   │   ├── 03_mirror_inventory_weekly.yaml
│   │   ├── 04_mirror_guest_toggle.yaml
│   │   ├── 05_mirror_gesture_router.yaml
│   │   ├── 06_mirror_perf_downshift.yaml
│   │   └── 07_mirror_edit_mode_timeout.yaml
│   ├── scripts/
│   │   ├── mirror_set_preset.yaml
│   │   ├── mirror_set_resolution.yaml
│   │   └── mirror_patch_tile.yaml
│   ├── layouts/                  # 10 modes × 2 orientations = 20 JSON templates
│   │   ├── morning.portrait.json
│   │   ├── morning.landscape.json
│   │   ├── work.portrait.json
│   │   ├── work.landscape.json
│   │   ├── relax.portrait.json
│   │   ├── relax.landscape.json
│   │   ├── shopping.portrait.json
│   │   ├── shopping.landscape.json
│   │   ├── security.portrait.json
│   │   ├── security.landscape.json
│   │   ├── night.portrait.json
│   │   ├── night.landscape.json
│   │   ├── ops.portrait.json
│   │   ├── ops.landscape.json
│   │   ├── guest.portrait.json
│   │   ├── guest.landscape.json
│   │   ├── showcase.portrait.json
│   │   ├── showcase.landscape.json
│   │   ├── editorial.portrait.json
│   │   └── editorial.landscape.json
│   ├── mqtt/
│   │   └── discovery.yaml        # auto-discovery for gesture + metrics entities
│   └── www/
│       └── mirror/
│           ├── layout.json       # live layout (written by python_script)
│           └── .gitkeep
│
├── addons/
│   └── mirror-gesture/           # HA addon: Docker container, MediaPipe, MQTT publisher
│       ├── config.yaml
│       ├── Dockerfile
│       ├── run.sh
│       ├── requirements.txt
│       └── src/
│           ├── main.py
│           ├── camera.py
│           ├── gestures.py       # classifier
│           ├── privacy.py        # face blur
│           └── mqtt.py
│
├── installer/
│   ├── install.sh                # whiptail wizard on mirror box
│   ├── uninstall.sh
│   ├── systemd/
│   │   ├── mirror-frontend.service
│   │   ├── mirror-kiosk.service
│   │   └── mirror-metrics.service
│   ├── chromium/
│   │   └── mirror-kiosk.sh
│   ├── gdm/
│   │   └── custom.conf.tmpl      # autologin for mirror user
│   ├── monitors/
│   │   ├── portrait-cw.xml.tmpl
│   │   ├── portrait-ccw.xml.tmpl
│   │   └── landscape.xml.tmpl
│   └── certs/
│       └── update-ca.sh
│
└── scripts/
    ├── set-mode-via-ssh.sh       # HA → mirror box resolution switch
    ├── reload-kiosk.sh
    └── restart-frontend.sh
```

---

## 3. HA entities

### 3.1 `ha/input_select.yaml`

```yaml
mirror_preset:
  name: Mirror Preset (bundle)
  icon: mdi:monitor-dashboard
  options:
    - auto
    - morning-minimal
    - morning-editorial
    - work-ops
    - work-minimal
    - relax-minimal
    - relax-editorial
    - shopping-minimal
    - shopping-ops
    - security-security
    - security-ops
    - night-minimal
    - night-security
    - ops-ops
    - guest-editorial
    - showcase-editorial
  initial: auto

mirror_mode:
  name: Mirror Mode
  icon: mdi:view-dashboard-variant
  options: [auto, morning, work, relax, shopping, security, night, ops, guest, showcase, editorial]
  initial: auto

mirror_theme:
  name: Mirror Theme
  icon: mdi:palette
  options: [auto, minimal-dark, ops-cyberpunk, editorial, security]
  initial: auto

mirror_orientation:
  name: Mirror Orientation
  icon: mdi:screen-rotation
  options: [portrait, landscape]
  initial: portrait

mirror_resolution:
  name: Mirror Resolution
  icon: mdi:resize
  options: [4k, 1440p, 1080p]
  initial: 1080p
```

### 3.2 `ha/input_boolean.yaml`

```yaml
mirror_edit_mode:      { name: Mirror Edit Mode,      icon: mdi:resize }
mirror_gesture_enable: { name: Mirror Gestures,       icon: mdi:gesture-tap }
mirror_dnd:            { name: Mirror Do Not Disturb, icon: mdi:bell-off }
guest_mode:            { name: Guest Mode,            icon: mdi:account-multiple }
party_mode:            { name: Party Mode,            icon: mdi:party-popper }
```

### 3.3 `ha/input_number.yaml`

```yaml
mirror_override_minutes:
  name: Mirror Override Timeout (min)
  min: 5
  max: 240
  step: 5
  initial: 60
  unit_of_measurement: min
```

### 3.4 `ha/sensor.yaml` (template)

```yaml
- sensor:
    - name: Mirror Layout Revision
      unique_id: mirror_layout_revision
      state: "{{ state_attr('sensor.mirror_layout_file', 'revision') | int(0) }}"
      attributes:
        path: /local/mirror/layout.json
        written_at: "{{ state_attr('sensor.mirror_layout_file','written_at') }}"

    - name: Any Service Down
      unique_id: any_service_down
      state: >
        {% set svcs = [
          'binary_sensor.up_home_assistant',
          'binary_sensor.up_plex',
          'binary_sensor.up_immich',
          'binary_sensor.up_frigate',
          'binary_sensor.up_backup',
        ] %}
        {{ svcs | select('is_state','off') | list | count > 0 }}
```

### 3.5 `ha/input_text.yaml`

```yaml
mirror_focused_tile:   # updated by gesture / edit mode
  name: Mirror Focused Tile
  max: 64
  initial: ""
```

---

## 4. Layout writer — `python_script.build_mirror_layout`

```python
# ha/python_scripts/build_mirror_layout.py
# Inputs via service data:
#   mode (optional, overrides input_select)
#   theme (optional)
#   orientation (optional)
#   preset (optional)
#   force_revision_bump (bool, default true)

import json, os, time

PRESETS = {
    'morning-minimal':   ('morning',  'minimal-dark'),
    'morning-editorial': ('morning',  'editorial'),
    'work-ops':          ('work',     'ops-cyberpunk'),
    'work-minimal':      ('work',     'minimal-dark'),
    'relax-minimal':     ('relax',    'minimal-dark'),
    'relax-editorial':   ('relax',    'editorial'),
    'shopping-minimal':  ('shopping', 'minimal-dark'),
    'shopping-ops':      ('shopping', 'ops-cyberpunk'),
    'security-security': ('security', 'security'),
    'security-ops':      ('security', 'ops-cyberpunk'),
    'night-minimal':     ('night',    'minimal-dark'),
    'night-security':    ('night',    'security'),
    'ops-ops':           ('ops',      'ops-cyberpunk'),
    'guest-editorial':   ('guest',    'editorial'),
    'showcase-editorial':('showcase', 'editorial'),
}

COMPAT = {
    'morning':   ['minimal-dark', 'editorial', 'ops-cyberpunk'],
    'work':      ['ops-cyberpunk', 'minimal-dark', 'editorial'],
    'relax':     ['minimal-dark', 'editorial'],
    'shopping':  ['minimal-dark', 'ops-cyberpunk', 'editorial'],
    'security':  ['security', 'ops-cyberpunk'],
    'night':     ['minimal-dark', 'security'],
    'ops':       ['ops-cyberpunk', 'security'],
    'guest':     ['editorial', 'minimal-dark'],
    'showcase':  ['editorial', 'minimal-dark'],
    'editorial': ['editorial'],
}

def resolve():
    preset = data.get('preset') or hass.states.get('input_select.mirror_preset').state
    mode   = data.get('mode')   or hass.states.get('input_select.mirror_mode').state
    theme  = data.get('theme')  or hass.states.get('input_select.mirror_theme').state
    orient = data.get('orientation') or hass.states.get('input_select.mirror_orientation').state

    if preset and preset != 'auto' and preset in PRESETS:
        p_mode, p_theme = PRESETS[preset]
        if mode == 'auto': mode = p_mode
        if theme == 'auto': theme = p_theme

    if mode == 'auto': mode = _pick_mode_from_context()
    if theme == 'auto' or theme not in COMPAT[mode]: theme = COMPAT[mode][0]
    return mode, theme, orient

def _pick_mode_from_context():
    h = int(time.strftime('%H'))
    if hass.states.is_state('binary_sensor.any_service_down', 'on'): return 'ops'
    if hass.states.is_state('input_boolean.party_mode', 'on'): return 'showcase'
    if hass.states.is_state('input_boolean.guest_mode', 'on'): return 'guest'
    if hass.states.is_state('binary_sensor.plex_playing', 'on'): return 'relax'
    if h < 6 or h >= 22: return 'night'
    if h < 10: return 'morning'
    if 10 <= h < 17: return 'work'
    return 'relax'

def load_template(mode, orient):
    path = f'/config/ha/layouts/{mode}.{orient}.json'
    with open(path) as f: return json.load(f)

def patch_dynamic(layout):
    # Fill tile props from current HA state:
    for t in layout['tiles']:
        if t['type'] == 'plex_player':
            t['props']['ratingKey'] = hass.states.get('sensor.plex_continue_watching').attributes.get('rating_key', '')
            t['props']['maxBitrate'] = {'4k':20000,'1440p':8000,'1080p':4000}.get(layout.get('resolution','1080p'),4000)
        elif t['type'] == 'frigate_camera' and t['props'].get('camera') is None:
            t['props']['camera'] = 'driveway'
        elif t['type'] == 'service_status':
            t['props']['services'] = [s.entity_id for s in hass.states.async_all() if s.entity_id.startswith('binary_sensor.up_')]
    return layout

def write(layout):
    path = '/config/www/mirror/layout.json'
    os.makedirs(os.path.dirname(path), exist_ok=True)
    layout['_meta'] = {'written_at': time.time(), 'rev': int(time.time())}
    with open(path, 'w') as f: json.dump(layout, f, separators=(',',':'))
    hass.states.set('sensor.mirror_layout_file', int(time.time()), {
        'revision': int(time.time()),
        'written_at': time.strftime('%Y-%m-%dT%H:%M:%S'),
        'mode': layout['mode'], 'theme': layout['theme'],
    })

mode, theme, orient = resolve()
layout = load_template(mode, orient)
layout['mode'] = mode
layout['theme'] = theme
layout['orientation'] = orient
layout['resolution'] = hass.states.get('input_select.mirror_resolution').state
layout = patch_dynamic(layout)
write(layout)
```

Tile-level `patch_mirror_layout` accepts a partial `{id, x, y, w, h}` patch (sent by edit-mode or gesture resize), merges into current layout, rewrites.

---

## 5. Automations

### `00_mirror_mode_selector.yaml`

```yaml
alias: Mirror · auto preset selector
mode: single
trigger:
  - platform: time_pattern
    minutes: "/5"
  - platform: state
    entity_id:
      - binary_sensor.any_service_down
      - binary_sensor.plex_playing
      - input_boolean.guest_mode
      - input_boolean.party_mode
      - input_select.mirror_mode
      - input_select.mirror_theme
condition:
  - condition: or
    conditions:
      - condition: state
        entity_id: input_select.mirror_preset
        state: auto
      - condition: template
        value_template: "{{ trigger.from_state is not none }}"
action:
  - service: python_script.build_mirror_layout
```

### `01_mirror_plex_focus.yaml`

```yaml
alias: Mirror · Plex focus swap
trigger:
  - platform: state
    entity_id: media_player.plex_livingroom
    to: "playing"
action:
  - service: input_select.select_option
    target: { entity_id: input_select.mirror_preset }
    data: { option: relax-minimal }
```

### `02_mirror_alert_swap.yaml`

```yaml
alias: Mirror · alert auto ops
trigger:
  - platform: state
    entity_id: binary_sensor.any_service_down
    to: "on"
action:
  - service: input_select.select_option
    target: { entity_id: input_select.mirror_preset }
    data: { option: ops-ops }
```

### `05_mirror_gesture_router.yaml`

```yaml
alias: Mirror · gesture router
trigger:
  - platform: event
    event_type: mirror_gesture
action:
  - choose:
      - conditions: "{{ trigger.event.data.gesture == 'mode_next' }}"
        sequence:
          - service: input_select.select_next
            target: { entity_id: input_select.mirror_mode }
      - conditions: "{{ trigger.event.data.gesture == 'mode_prev' }}"
        sequence:
          - service: input_select.select_previous
            target: { entity_id: input_select.mirror_mode }
      - conditions: "{{ trigger.event.data.gesture == 'lock' }}"
        sequence:
          - service: input_boolean.turn_off
            target: { entity_id: input_boolean.mirror_gesture_enable }
          - delay: "00:05:00"
          - service: input_boolean.turn_on
            target: { entity_id: input_boolean.mirror_gesture_enable }
      - conditions: "{{ trigger.event.data.gesture in ['resize_grow','resize_shrink'] }}"
        sequence:
          - service: python_script.patch_mirror_layout
            data:
              tile_id: "{{ states('input_text.mirror_focused_tile') }}"
              delta: "{{ 1 if trigger.event.data.gesture == 'resize_grow' else -1 }}"
```

### `06_mirror_perf_downshift.yaml`

```yaml
alias: Mirror · perf downshift
trigger:
  - platform: event
    event_type: mirror_perf_downshift_requested
action:
  - service: input_select.select_previous
    target: { entity_id: input_select.mirror_resolution }
  - service: rest_command.mirror_set_resolution
```

### `07_mirror_edit_mode_timeout.yaml`

```yaml
alias: Mirror · edit mode timeout
trigger:
  - platform: state
    entity_id: input_boolean.mirror_edit_mode
    to: "on"
    for: "00:15:00"
action:
  - service: input_boolean.turn_off
    target: { entity_id: input_boolean.mirror_edit_mode }
```

---

## 6. Layout JSON templates

Each `ha/layouts/<mode>.<orientation>.json` follows `FRONTEND_SPEC.md §3` Layout schema. Source: port each mockup's DOM into tile list.

### Example: `relax.portrait.json`

```json
{
  "version": 1,
  "mode": "relax",
  "orientation": "portrait",
  "theme": "minimal-dark",
  "grid": { "cols": 8, "rows": 20, "gap": 14 },
  "transition": "flip",
  "tiles": [
    { "id": "plex", "type": "plex_player",      "x":0,"y":0,"w":8,"h":7,  "audio": true,  "props": { "ratingKey": "", "autoplay": true } },
    { "id": "clk",  "type": "clock",            "x":0,"y":7,"w":4,"h":3,  "props": { "format": "HH:mm" } },
    { "id": "scn",  "type": "ambient_scenes",   "x":4,"y":7,"w":4,"h":3 },
    { "id": "pho",  "type": "immich_slideshow", "x":0,"y":10,"w":8,"h":4, "props": { "album": "family", "interval": 8 } },
    { "id": "amb",  "type": "device_slider",    "x":0,"y":14,"w":5,"h":3, "props": { "devices": ["light.living","climate.main","fan.ceiling"] } },
    { "id": "slp",  "type": "sleep_timer",      "x":5,"y":14,"w":3,"h":3 },
    { "id": "pod",  "type": "podcast",          "x":0,"y":17,"w":8,"h":2, "props": { "muted": true } }
  ]
}
```

Full 20 templates ship in phase 4–8 (content bundles) — port from existing mockup HTML files.

---

## 7. Gesture addon — `addons/mirror-gesture/`

### `config.yaml` (HA Addon format)

```yaml
name: Mirror Gesture
slug: mirror-gesture
version: 0.1.0
description: MediaPipe-based gesture recognizer; publishes events via MQTT.
arch: [amd64, aarch64]
startup: application
boot: auto
devices:
  - /dev/video0:/dev/video0:rwm
options:
  camera_index: 0
  resolution: [640, 480]
  fps_limit: 15
  mqtt_host: core-mosquitto
  mqtt_port: 1883
  mqtt_topic: mirror/gesture
  face_blur: true
  enabled: false
schema:
  camera_index: int
  resolution: "[int, int]"
  fps_limit: int
  mqtt_host: str
  mqtt_port: int
  mqtt_topic: str
  face_blur: bool
  enabled: bool
```

### Flow

```
webcam → opencv capture → face blur (if enabled)
        → MediaPipe Hands (landmarks)
        → gestures.py classify (pinch / swipe / fist / palm / point / wave)
        → mqtt.py publish { gesture: "swipe_left", confidence: 0.91, ts: ... }

HA receives via MQTT → fires event.mirror_gesture → automation 05 routes.
```

### `src/gestures.py` — classifier contract

```python
def classify(landmarks_sequence: list) -> dict | None:
    """Returns { gesture: str, confidence: float, payload: dict } or None."""
```

Gestures in v1: `wake, resize_grow, resize_shrink, focus, mode_next, mode_prev, tile_fullscreen, tile_minimize, lock, media_pause, alert_ack`.

### Privacy

- `face_blur: true` → gaussian blur face bbox before any processing beyond face detection.
- No frames leave the addon. Only event dicts over MQTT.
- Rolling window = 3 frames. No persistence.
- Addon process exits webcam handle on `enabled: false`. LED goes dark.

---

## 8. MQTT topics

| Topic | Direction | Payload |
|-------|-----------|---------|
| `mirror/gesture` | addon → HA | `{"gesture":"swipe_left","confidence":0.91,"ts":1745351220}` |
| `mirror/metrics` | frontend → HA | `{"fps":52,"heap_mb":142,"dom":2102,"ts":...}` |
| `mirror/audit/layout` | python_script → HA | `{"rev":1745351200,"mode":"relax","theme":"minimal-dark"}` |
| `mirror/audit/theme_coerced` | frontend → HA | `{"requested":"editorial","applied":"minimal-dark","mode":"ops"}` |

All topics MQTT-discovery-capable via `ha/mqtt/discovery.yaml`.

---

## 9. Install wizard — `installer/install.sh`

Whiptail-driven, run once on fresh mirror box by a sudoer:

```
1. Detect display + available modes                 (wlr-randr / xrandr)
2. Prompt orientation + resolution                  (portrait/landscape × 4k/1440p/1080p)
3. Prompt HA URL + long-lived token                 (tested before write)
4. Prompt optional: Plex URL + token
5. Prompt optional: Immich URL + API key
6. Prompt optional: Frigate URL
7. Prompt optional: Grocy URL + API key
8. Prompt webcam index (for gesture)                (lsusb + v4l2)
9. Create 'mirror' user with autologin              (GDM custom.conf)
10. Write /etc/mirror/config.env                    (all settings)
11. Copy HA CA cert (if self-signed) → trust store  (update-ca-certificates)
12. Install Node 20 + pnpm                          (NodeSource apt repo)
13. git clone <repo> /opt/mirror && pnpm install && pnpm build
14. Drop systemd units + enable + start             (frontend, kiosk, metrics)
15. Launch verification: wait 15s, curl localhost:3000 → 200
16. Optionally install HA addon mirror-gesture      (prints instructions)
17. Done banner: URL to open on desktop browser for remote edit mode
```

Never skips signature / cert validation. On cert failure, aborts with clear message.

### `/etc/mirror/config.env`

```bash
HA_URL=https://ha.local:8123
HA_TOKEN=eyJ0eXAiOi...
HA_CA_CERT=/etc/mirror/ha.crt
MIRROR_USER=mirror
MIRROR_ORIENTATION=portrait
MIRROR_RESOLUTION=1080p
MIRROR_ROTATION=cw
PLEX_URL=https://plex.home.local:32400
PLEX_TOKEN=xxxxx
IMMICH_URL=https://immich.home.local
IMMICH_KEY=xxxxx
FRIGATE_URL=https://frigate.home.local
GROCY_URL=https://grocy.home.local
GROCY_KEY=xxxxx
WEBCAM_INDEX=0
GESTURE_ENABLED=false
FRONTEND_PORT=3000
```

Node reads with `NODE_EXTRA_CA_CERTS=$HA_CA_CERT`.

---

## 10. systemd units

### `mirror-frontend.service` (system-level)

```ini
[Unit]
Description=Smart Mirror Frontend (SvelteKit)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/mirror/config.env
Environment=NODE_ENV=production
Environment=NODE_EXTRA_CA_CERTS=/etc/mirror/ha.crt
WorkingDirectory=/opt/mirror/frontend
ExecStart=/usr/bin/node build/index.js
Restart=always
RestartSec=5
User=mirror
Group=mirror
# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/var/log/mirror

[Install]
WantedBy=multi-user.target
```

### `mirror-kiosk.service` (mirror user-level)

```ini
[Unit]
Description=Mirror Kiosk Chromium
After=mirror-frontend.service graphical-session.target
Wants=mirror-frontend.service
PartOf=graphical-session.target

[Service]
Type=simple
EnvironmentFile=/etc/mirror/config.env
ExecStartPre=/usr/bin/sleep 3
ExecStartPre=/bin/sh -c 'until curl -sf http://localhost:${FRONTEND_PORT} > /dev/null; do sleep 1; done'
ExecStart=/opt/mirror/installer/chromium/mirror-kiosk.sh
Restart=always
RestartSec=3

[Install]
WantedBy=graphical-session.target
```

### `mirror-kiosk.sh`

```bash
#!/bin/sh
exec chromium \
  --kiosk \
  --app=http://localhost:${FRONTEND_PORT:-3000} \
  --autoplay-policy=no-user-gesture-required \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI \
  --noerrdialogs \
  --hide-crash-restore-bubble \
  --no-first-run \
  --enable-features=VaapiVideoDecoder,VaapiVideoEncoder \
  --ignore-gpu-blocklist \
  --use-gl=egl
```

### `mirror-metrics.service` (optional companion)

Tiny curl loop that reads `http://localhost:3000/metrics` JSON and POSTs to HA REST `/api/states/sensor.mirror_frontend_fps`. Every 60s.

---

## 11. Resolution switcher — `scripts/set-mode-via-ssh.sh`

```bash
#!/bin/bash
# Called by HA rest_command.mirror_set_resolution over SSH.
# /etc/sudoers.d/mirror: `%mirror ALL=NOPASSWD: /usr/bin/wlr-randr, /bin/systemctl`
set -e
RES=$1  # 4k|1440p|1080p
ROT=$2  # cw|ccw|none

declare -A MODE=( [4k]="3840x2160@60" [1440p]="2560x1440@60" [1080p]="1920x1080@60" )
declare -A TX=(   [cw]="90" [ccw]="270" [none]="normal" )

wlr-randr --output "$(wlr-randr --json | jq -r '.[0].name')" \
  --mode "${MODE[$RES]}" --transform "${TX[$ROT]}"

systemctl --user --machine=mirror@ restart mirror-kiosk.service
```

### `rest_command.yaml`

```yaml
mirror_set_resolution:
  url: "ssh://mirror@mirror.local/usr/local/bin/set-mode-via-ssh.sh"
  method: POST
  payload: '{ "res": "{{ res }}", "rot": "{{ rot }}" }'
```

(Uses HA ssh integration or `shell_command` if HA runs near-local.)

---

## 12. Media integrations — prerequisites

| Service | HA integration | Needed for |
|---------|----------------|-----------|
| Plex | Core `plex` integration | `plex_player`, `plex_now_playing`, `plex_recent` tiles |
| Immich | REST sensor per album OR `immich-home-assistant` custom | `immich_slideshow` |
| Frigate | `blakeblackshear/frigate-hass-integration` | `frigate_camera`, `event_timeline` |
| Uptime Kuma | MQTT push from Kuma | `service_status` |
| Glances | `glances` integration | `host_health` |
| Grocy | Core `grocy` integration | inventory tiles |
| GitHub | REST sensor OR `github` integration | `pr_list`, `project_board` |

All required tokens / URLs collected in install wizard step 3–7.

---

## 13. Security

- HA long-lived token stored in `/etc/mirror/config.env` (root:mirror, 0640).
- Self-signed HA cert trusted via `update-ca-certificates`. Never `--ignore-certificate-errors` flag.
- Gesture addon LED-on webcam only. Face blur enabled by default.
- SSH between HA and mirror box uses key-only, no passwords.
- systemd hardening: `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome=read-only`.
- Frontend service runs as `mirror`, never root.
- Kiosk chromium disables devtools (`--disable-features=DevTools`).

---

## 14. Backend build phases (subset of full plan)

| Phase | Backend deliverable | Hours |
|-------|---------------------|-------|
| 0 | systemd units skeleton + `mirror` user autologin + kiosk → about:blank | 4 |
| 2a | HA entities (input_select/boolean/text/number) + template sensors | 3 |
| 2b | `python_script.build_mirror_layout` stub (writes minimal layout) + 1 automation | 4 |
| 3 | Layout revision sensor + `/local/mirror/` serve path + WS wiring test | 2 |
| 6–10 | Layout JSON templates (20 files) | 20 |
| 5 | HA Plex integration + sensors feeding plex tiles | 2 |
| 5 | HA Frigate integration + go2rtc setup | 3 |
| 5 | HA Immich integration | 2 |
| 11 | MQTT discovery + gesture addon Dockerfile + MediaPipe + publisher | 14 |
| 12 | Resolution switcher (rest_command + script + sudoers) | 3 |
| 13 | Installer wizard (whiptail, full flow) | 8 |
| 13 | systemd production units + metrics reporter | 3 |
| 14 | Automations (all 8 YAMLs) + scripts | 5 |
| 15 | Cert trust script + HA CA bundle | 1 |
| 15 | Security review of tokens, SSH, addon | 2 |

**Total backend scope: ~76 h** across ~10 sessions.

---

## 15. Open items (backend)

- [ ] Confirm MQTT broker (HA Mosquitto addon assumed — or an external one?)
- [ ] Confirm SSH between HA and mirror box (direction? HA host IP?)
- [ ] Confirm Grocy deployment target (HA addon? separate?)
- [ ] Confirm Uptime Kuma: MQTT push plugin, or HA pulling its status API?
- [ ] Confirm Plex Pass availability (affects transcode decisions)
- [ ] Confirm webcam model (affects addon config + LED assumption)

---

## 16. Contracts with frontend (back-ref)

Backend owns everything the frontend never invents. Frontend contract recap:

| What | Backend writes | Frontend reads |
|------|----------------|----------------|
| Layout JSON | `python_script.build_mirror_layout` → `www/mirror/layout.json` | GET on revision bump |
| Layout revision | `sensor.mirror_layout_revision` | WS state_changed subscription |
| Mode / theme / orientation / resolution | `input_select.*` | via WS states, pure display |
| Edit mode toggle | `input_boolean.mirror_edit_mode` | enables drag/resize |
| Gesture events | addon → MQTT → HA event bus | WS event subscription |
| Patch from edit/gesture | frontend → `mirror.patch_layout` service | frontend sends, backend merges |
| Telemetry | frontend POST `/api/states/sensor.mirror_frontend_*` | — |

---

Next: `PHASES.md` for autonomous phased development, then `AGENT_INSTRUCTIONS.md` for the automation workflow.
