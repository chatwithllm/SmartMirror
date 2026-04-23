# Authoring a new tile

1. Create `frontend/src/lib/tiles/MyTypeTile.svelte`:

```svelte
<script lang="ts">
  import BaseTile from './BaseTile.svelte';
  interface Props { id: string; props?: { /* your props */ } }
  let { id, props = {} }: Props = $props();
</script>

<BaseTile {id} type="my_type" label="My tile">
  <!-- your content -->
</BaseTile>
```

2. Register in `frontend/src/lib/tiles/registry.ts`.
3. Add a smoke test in `frontend/src/lib/tiles/*.test.ts` (render + non-empty).
4. Add a sample layout under `ha/layouts/` that exercises the tile.
5. Commit with `feat(frontend): MyType tile`.

## Design conventions

- Use only CSS custom properties from the active theme — no hex literals.
- Use `data-testid` on interactive elements + root wrapper.
- Expose an `entity_id` or `demo` prop so the tile renders in isolation.
- Dispatch a `mirror:*` CustomEvent on significant actions (for HA integration
  and future telemetry).
