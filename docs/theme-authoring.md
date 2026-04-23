# Authoring a new theme

1. Duplicate one of `frontend/src/lib/themes/*.css` (e.g. `minimal-dark.css`).
2. Rename to `my-theme.css`, selector `:root[data-theme='my-theme']`.
3. Override any of the ~30 CSS custom properties (see BACKEND_SPEC §7).
4. Add to `ThemeName` enum in `lib/layout/schema.ts`.
5. Add the import branch in `lib/themes/loader.ts`.
6. Add allowed (mode × theme) entries in `lib/themes/compat.ts`.
7. Mirror the COMPAT change in `ha/python_scripts/build_mirror_layout.py`.
8. Visual audit: run `pnpm dev`, cycle through modes, confirm nothing regresses.

Tile components must only read theme tokens — never hardcode colours.
