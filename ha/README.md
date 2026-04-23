# Smart Mirror · Home Assistant config

The frontend resolves layouts locally from bundled JSONs under
`frontend/src/lib/layout/bundled/`. HA only needs the input-helper
entities so the frontend has something to watch.

## Layout

```
ha/
├── README.md
└── packages/
    ├── README.md
    └── mirror.yaml     # single-file package (helpers only)
```

## Install

1. Copy `ha/packages/mirror.yaml` → `/config/packages/mirror.yaml` on HA.
2. In `configuration.yaml` add one line under your `homeassistant:` block:

   ```yaml
   homeassistant:
     packages: !include_dir_named packages
   ```

3. Ensure there is **no** existing `http:` block that's missing CORS —
   add or extend it:

   ```yaml
   http:
     cors_allowed_origins:
       - http://localhost:3000
       - http://<mirror-box-ip>:3000
   ```

4. *Developer Tools → YAML → Check Configuration* → *Restart*.

## Flipping the mirror

- `input_select.mirror_preset` — pick a bundle (e.g. `ops-ops`,
  `morning-minimal`). Frontend polls every 2s and swaps layout + theme.
- `input_select.mirror_mode` — optional forced mode. Leave on `auto`
  for preset to drive.
- `input_select.mirror_theme` — optional forced theme. Leave on `auto`.
- `input_select.mirror_orientation` — `portrait` or `landscape`.
- `input_boolean.mirror_edit_mode`, `mirror_gesture_enable`,
  `mirror_dnd` — future phase hooks.

## What we removed vs. the spec

Original backend spec (`BACKEND_SPEC.md §3-§6`) wired a
`python_script.build_mirror_layout` that wrote a layout JSON to disk
and bumped a revision sensor. Real HA python_script sandboxes block
`import json`, `open()`, `now()`, etc. — the flow didn't survive.

We pivoted to frontend-side layout resolution: the 20 layout JSONs
live in the client bundle and `lib/layout/resolver.ts` does the
preset → (mode, theme, orientation) → bundled layout match. HA side
shrinks to helpers only, which also sidesteps the
`hass.states.set(...)` silent-reject issue on newer HA installs.
