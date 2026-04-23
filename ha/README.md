# Smart Mirror · Home Assistant config

This folder contains HA config snippets that drive the mirror. Drop them
into your HA `/config/` tree (via git-sync, rsync, or the HA Samba/VSCode
addon) and include them from `configuration.yaml`.

## Layout at a glance

```
ha/
├── input_select.yaml     # mirror_preset, mirror_mode, mirror_theme, …
├── input_boolean.yaml    # mirror_edit_mode, guest_mode, party_mode, …
├── input_text.yaml       # mirror_focused_tile
├── input_number.yaml     # mirror_override_minutes
├── sensor.yaml           # template: mirror_layout_revision, any_service_down
├── python_scripts/
│   └── build_mirror_layout.py   # called by automation to rebuild layout
├── automations/
│   └── 00_mirror_mode_selector.yaml
├── layouts/
│   └── work.portrait.json       # per-mode reference layouts (richer set lands later)
└── mqtt/                         # gesture addon discovery (Phase 13)
```

## Wiring it into `configuration.yaml`

```yaml
# configuration.yaml
input_select:  !include ha/input_select.yaml
input_boolean: !include ha/input_boolean.yaml
input_text:    !include ha/input_text.yaml
input_number:  !include ha/input_number.yaml

template: !include ha/sensor.yaml

python_script:

automation mirror: !include_dir_merge_list ha/automations/
```

Enable the `python_script` integration once:

```yaml
# configuration.yaml
python_script:
```

Then drop `ha/python_scripts/build_mirror_layout.py` under
`/config/python_scripts/build_mirror_layout.py`. HA picks it up on restart.

## Verifying the Phase 02 deliverables

1. **Config check.** From the HA UI go to *Developer Tools → YAML → Check
   Configuration*. Expect no errors.
2. **Reload YAML.** *Developer Tools → YAML → All YAML*.
3. **Call the service.** *Developer Tools → Services*, pick
   `python_script.build_mirror_layout`, service data `{}`, hit *Call Service*.
4. **Confirm the sensor.** In *Developer Tools → States*, search for
   `sensor.mirror_layout_file`. Its state is the new revision (epoch int)
   and its attributes include `mode`, `theme`, `orientation`, `resolution`,
   `layout_json`, `written_at`.
5. **Confirm revision bump.** `sensor.mirror_layout_revision` should mirror
   the same integer (template sensor defined in `sensor.yaml`).

## What's intentionally missing here

- Writing `www/mirror/layout.json` to disk. HA's `python_script` sandbox
  blocks file I/O; Phase 03 replaces this with either a native integration
  or a shell_command that persists the `layout_json` attribute.
- Full automation set (Plex focus swap, perf downshift, gesture router,
  edit-mode timeout). They land in phases 05, 13, 14. See
  [BACKEND_SPEC.md §5](../BACKEND_SPEC.md).
- Rich per-mode layout JSONs (there are 20 total — one per mode × orientation).
  Phases 04–10 port the mockup DOMs into layout tiles; this folder only ships
  `work.portrait.json` as a smoke fixture for now.

## Upgrading from an earlier phase

The config is append-only so far: new files, no schema changes. If HA
complains about duplicate helper IDs after updating, remove any manually
created `mirror_*` helpers from the UI — the files own these.
