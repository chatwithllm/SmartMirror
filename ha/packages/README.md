# HA package — drop-in installer

`mirror.yaml` in this folder is a single HA package that merges every
mirror-specific config key (`input_select`, `input_boolean`, `input_text`,
`input_number`, `template`, `python_script`, `rest_command`, `automation`,
`script`) without colliding with anything you already have.

## Wire it up

1. Copy `ha/packages/mirror.yaml` → `/config/packages/mirror.yaml` on HA.
2. Copy `ha/python_scripts/*.py` → `/config/python_scripts/` on HA.
3. In your HA `configuration.yaml`, under the existing `homeassistant:`
   block, add one line:

   ```yaml
   homeassistant:
     # ... whatever you already have ...
     packages: !include_dir_named packages
   ```

4. Keep `python_script:` in `configuration.yaml` (it's empty-init — the
   package already declares it but it's fine to leave it out of the
   main file if you prefer).
5. *Developer Tools → YAML → Check Configuration* → *Restart*.

## Why a package (instead of separate includes)?

Your `configuration.yaml` already defines `script:`, `automation:`,
`template:`, `input_number:`, `rest_command:`. Adding those keys again at
the top level (via `!include` or inline) is a YAML error. HA's **packages**
feature merges multiple YAML files under *any* top-level key — dicts merge
by key, lists concatenate. So this one file slots into your existing
config with zero collisions.

## Per-layout JSONs

The 20 layout JSONs under `ha/layouts/` aren't wired by the package —
they're read by `build_mirror_layout.py` when it calls `load_template()`.
Either copy them to `/config/ha/layouts/` (matches the python_script's
default path) or point the script at wherever you put them.
