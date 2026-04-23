# Architecture (at-a-glance)

```
Home Assistant
  ├── input_select.mirror_{preset,mode,theme,orientation,resolution}
  ├── input_boolean.mirror_{edit_mode,gesture_enable,dnd}
  ├── sensor.mirror_layout_{revision,file}    ← python_script writes layout_json attr
  ├── automations (time / state / gesture / perf)
  ├── python_scripts (build_mirror_layout, patch_mirror_layout)
  └── rest_command.mirror_set_resolution      ← SSH → mirror box

Mirror box (Ubuntu / kiosk user)
  ├── systemd: mirror-frontend.service (Node SSR, :3000)
  ├── systemd: mirror-kiosk.service    (chromium --kiosk; waits on :3000)
  ├── scripts/set-mode-via-ssh.sh      (wlr-randr rotate + restart kiosk)
  └── fonts, certs, /etc/mirror/config.env

Frontend (SvelteKit)
  ├── layout/schema.ts (zod)  ─┐
  ├── layout/fetch.ts + diff.ts │  HA WS → state_changed → fetch → store
  ├── ha/client.ts / subscribe.ts
  ├── themes/loader.ts + compat.ts
  ├── tiles/registry.ts (39 types)
  ├── gesture/{events,router}.ts
  ├── grid/{Grid,edit-mode,burnin}
  └── telemetry/{fps,report}

Gesture addon (HA addon container)
  ├── MediaPipe Hands + face blur
  └── MQTT mirror/gesture → automation → events + services
```

See `FRONTEND_SPEC.md`, `BACKEND_SPEC.md`, `DESIGN_SPEC.md` for the long form.
