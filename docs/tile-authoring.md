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

## ActiveWorkTile (`active-work`)

Surfaces in-flight kanban cards from a SmartKanban instance. Read-only.

### Props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `kanbanUrl` | string | required | Base URL of the SmartKanban server, e.g. `http://kanban.local:3001`. |
| `mirrorToken` | string | required | Mirror-scope token from SmartKanban Settings → Mirror tokens. |
| `projects` | string[] | (all) | Optional filter — only show cards whose `project` is in this list. |
| `maxCards` | number | 5 | Truncate to N rows; remainder shown as `+N more`. |
| `showFeedback` | boolean | true | Pulse on cards tagged `has-feedback`. |
| `refreshSeconds` | number | 30 | Poll interval. |
| `projectAliases` | Record<string,string> | `{}` | Map full `project_key` → short label. |

### Tag-driven visuals

| Tag | Visual |
|---|---|
| `deployed-local` | Small green dot before status |
| `deployed-prod` | Green checkmark, status reads "prod" |
| `blocked` | Amber bar on left edge of row |
| `has-feedback` | Soft blue dot pulses on right edge |

### Layout config example

```json
{
  "type": "active-work",
  "id": "active-1",
  "props": {
    "kanbanUrl": "http://kanban.local:3001",
    "mirrorToken": "<mirror-token>",
    "maxCards": 5,
    "projectAliases": {
      "github.com/chatwithllm/smartmirror": "Mirror",
      "github.com/chatwithllm/argus": "Argus"
    }
  }
}
```
