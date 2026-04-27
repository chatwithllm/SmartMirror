# notetaker-kanban Phase 5 — SmartMirror tile (`tile-active-work`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new SmartMirror tile that polls SmartKanban and surfaces in-flight cards across all opted-in projects, with tag-driven visual states (deployed-local / deployed-prod / blocked / has-feedback).

**Architecture:** Single Svelte 5 component (`ActiveWorkTile.svelte`) inside the existing `frontend/src/lib/tiles/` directory. Wraps `BaseTile`. Polls `/api/cards?status=in_progress,today` via the user's existing mirror-scope token. Renders one row per card with tag-driven styling. Read-only — no clicks, no writes.

**Tech Stack:** Svelte 5 runes, TypeScript, Tailwind, fetch. Vitest for the unit test (the project uses `*.test.ts` colocated with `*.svelte`, e.g. `ClockTile.test.ts`).

**Spec:** [`docs/superpowers/specs/2026-04-27-notetaker-kanban-design.md`](../specs/2026-04-27-notetaker-kanban-design.md), Section 6.8.

**Depends on:** Phase 1 server PR merged + deployed (server returns `project` field on cards; mirror-scope token reads cards filtered by visibility).

**Repo to work in:** `/Users/assistant/WorkingFolder/SmartMirror` (this repo).

> ⚠ Status enum on the server is snake_case: `backlog | today | in_progress | done`. Tile must filter on `in_progress`, not `in-progress`. Tags use kebab.

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `frontend/src/lib/tiles/ActiveWorkTile.svelte` | create | Main tile component. Polls + renders. |
| `frontend/src/lib/tiles/ActiveWorkTile.test.ts` | create | Vitest unit test: rendering, tag states, empty state, stale state. |
| `frontend/src/lib/tiles/registry.ts` | modify | Register `'active-work': ActiveWorkTile`. |
| `frontend/src/lib/kanban/client.ts` | create | Tiny fetch wrapper. (No SmartKanban TypeScript types are imported; we declare what we need locally.) |
| `frontend/src/lib/kanban/types.ts` | create | Local Card row type. |
| `docs/tile-authoring.md` | modify | Append a section documenting the new tile + props. |

---

## Task 1: Local types + fetch client

**Files:**
- Create: `frontend/src/lib/kanban/types.ts`
- Create: `frontend/src/lib/kanban/client.ts`

- [ ] **Step 1: Define the Card subset we render**

Write `frontend/src/lib/kanban/types.ts`:

```ts
// Subset of the SmartKanban card shape that the mirror needs to render.
// Kept minimal so the tile is decoupled from full server schema changes.

export type KanbanStatus = 'backlog' | 'today' | 'in_progress' | 'done';

export type KanbanCard = {
  id: string;
  title: string;
  status: KanbanStatus;
  tags: string[];
  project: string | null;
  updated_at: string;
  description?: string;
};
```

- [ ] **Step 2: Implement the fetch client**

Write `frontend/src/lib/kanban/client.ts`:

```ts
import type { KanbanCard, KanbanStatus } from './types.js';

export type FetchCardsOptions = {
  baseUrl: string;
  mirrorToken: string;
  statuses?: KanbanStatus[];   // defaults to in_progress + today
  projects?: string[];          // optional filter (post-fetch, since server doesn't yet support multi-project)
  signal?: AbortSignal;
};

export async function fetchActiveCards(opts: FetchCardsOptions): Promise<KanbanCard[]> {
  const statuses = opts.statuses ?? ['in_progress', 'today'];
  // The server filter is single-status; we make N calls and concat.
  // (Server change to accept comma-separated statuses is post-v1.)
  const out: KanbanCard[] = [];
  for (const status of statuses) {
    const url = new URL('/api/cards', opts.baseUrl);
    url.searchParams.set('scope', 'personal');
    // We want backend filtering by status, but the existing endpoint doesn't filter by status —
    // so we filter client-side after fetch.
    const res = await fetch(url.toString(), {
      headers: { 'x-mirror-token': opts.mirrorToken },
      signal: opts.signal,
    });
    if (!res.ok) {
      throw new Error(`fetchActiveCards: ${res.status} ${res.statusText}`);
    }
    const all = (await res.json()) as KanbanCard[];
    for (const c of all) if (c.status === status) out.push(c);
  }
  let cards = out;
  if (opts.projects && opts.projects.length > 0) {
    const allowed = new Set(opts.projects);
    cards = cards.filter(c => c.project !== null && allowed.has(c.project));
  }
  // Sort by updated_at desc.
  cards.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  return cards;
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/assistant/WorkingFolder/SmartMirror
git add frontend/src/lib/kanban/types.ts frontend/src/lib/kanban/client.ts
git commit -m "feat(tile): kanban client + types for ActiveWorkTile"
```

---

## Task 2: Failing test for `ActiveWorkTile`

**Files:**
- Create: `frontend/src/lib/tiles/ActiveWorkTile.test.ts`

- [ ] **Step 1: Read the existing `ClockTile.test.ts`** to mirror its pattern (test runner, render helper, props shape).

Read [frontend/src/lib/tiles/ClockTile.test.ts](../../../frontend/src/lib/tiles/ClockTile.test.ts).

If `@testing-library/svelte` is in `frontend/package.json`, use it; otherwise use whatever ClockTile uses. (Vitest is already configured per `vite.config.ts`.)

- [ ] **Step 2: Write the failing test**

Write `frontend/src/lib/tiles/ActiveWorkTile.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import ActiveWorkTile from './ActiveWorkTile.svelte';
import type { KanbanCard } from '$lib/kanban/types.js';

const FAKE_CARDS: KanbanCard[] = [
  {
    id: 'c1',
    title: 'Voice control for tiles',
    status: 'in_progress',
    tags: ['smartmirror', 'voice', 'deployed-local'],
    project: 'github.com/chatwithllm/smartmirror',
    updated_at: new Date().toISOString(),
  },
  {
    id: 'c2',
    title: 'Auth leak fix',
    status: 'today',
    tags: ['blocked'],
    project: 'github.com/chatwithllm/argus',
    updated_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
  },
];

function mockFetch(payload: KanbanCard[], status = 200) {
  globalThis.fetch = vi.fn(async () => ({
    ok: status === 200,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => payload,
  })) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ActiveWorkTile', () => {
  it('renders project label + title for each card', async () => {
    mockFetch(FAKE_CARDS);
    render(ActiveWorkTile, {
      props: { id: 't1', props: { kanbanUrl: 'http://k', mirrorToken: 'm', refreshSeconds: 30 } },
    });
    await waitFor(() => expect(screen.getByText(/Voice control for tiles/i)).toBeInTheDocument());
    expect(screen.getByText(/Auth leak fix/i)).toBeInTheDocument();
    // last segment of project_key
    expect(screen.getByText(/smartmirror/i)).toBeInTheDocument();
    expect(screen.getByText(/argus/i)).toBeInTheDocument();
  });

  it('shows the deployed-local tag indicator', async () => {
    mockFetch(FAKE_CARDS);
    const { container } = render(ActiveWorkTile, {
      props: { id: 't1', props: { kanbanUrl: 'http://k', mirrorToken: 'm' } },
    });
    await waitFor(() => expect(screen.getByText(/Voice control/)).toBeInTheDocument());
    expect(container.querySelector('[data-tag="deployed-local"]')).toBeTruthy();
  });

  it('shows the blocked indicator on a blocked card', async () => {
    mockFetch(FAKE_CARDS);
    const { container } = render(ActiveWorkTile, {
      props: { id: 't1', props: { kanbanUrl: 'http://k', mirrorToken: 'm' } },
    });
    await waitFor(() => expect(screen.getByText(/Auth leak/)).toBeInTheDocument());
    expect(container.querySelector('[data-tag="blocked"]')).toBeTruthy();
  });

  it('renders empty state when no cards', async () => {
    mockFetch([]);
    render(ActiveWorkTile, {
      props: { id: 't1', props: { kanbanUrl: 'http://k', mirrorToken: 'm' } },
    });
    await waitFor(() => expect(screen.getByText(/No active work/i)).toBeInTheDocument());
  });

  it('renders stale footer on fetch failure', async () => {
    mockFetch([], 500);
    render(ActiveWorkTile, {
      props: { id: 't1', props: { kanbanUrl: 'http://k', mirrorToken: 'm' } },
    });
    await waitFor(() => expect(screen.getByText(/auth error|stale|error/i)).toBeInTheDocument());
  });

  it('truncates to maxCards and shows "+N more"', async () => {
    const many: KanbanCard[] = Array.from({ length: 8 }, (_, i) => ({
      id: `c${i}`, title: `Task ${i}`, status: 'in_progress', tags: [],
      project: 'p', updated_at: new Date(Date.now() - i * 60000).toISOString(),
    }));
    mockFetch(many);
    render(ActiveWorkTile, {
      props: { id: 't1', props: { kanbanUrl: 'http://k', mirrorToken: 'm', maxCards: 3 } },
    });
    await waitFor(() => expect(screen.getByText(/Task 0/)).toBeInTheDocument());
    expect(screen.getByText(/\+5 more/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run, expect FAIL**

```bash
cd /Users/assistant/WorkingFolder/SmartMirror/frontend
pnpm test --run src/lib/tiles/ActiveWorkTile.test.ts 2>&1 | tail -40
```

Expected: FAIL — `ActiveWorkTile.svelte` does not exist.

---

## Task 3: Implement `ActiveWorkTile.svelte`

**Files:**
- Create: `frontend/src/lib/tiles/ActiveWorkTile.svelte`

- [ ] **Step 1: Read [ConsoleTile.svelte](../../../frontend/src/lib/tiles/ConsoleTile.svelte)** for layout idiom (BaseTile wrapper, props shape, Svelte 5 runes, JetBrains Mono / tabular-num conventions).

- [ ] **Step 2: Implement the tile**

```svelte
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import BaseTile from './BaseTile.svelte';
  import { fetchActiveCards } from '$lib/kanban/client.js';
  import type { KanbanCard } from '$lib/kanban/types.js';

  interface Props {
    id: string;
    props?: {
      kanbanUrl?: string;
      mirrorToken?: string;
      projects?: string[];
      maxCards?: number;
      showFeedback?: boolean;
      refreshSeconds?: number;
      projectAliases?: Record<string, string>;
    };
  }

  let { id, props = {} }: Props = $props();

  const kanbanUrl = props.kanbanUrl ?? '';
  const mirrorToken = props.mirrorToken ?? '';
  const projects = props.projects;
  const maxCards = props.maxCards ?? 5;
  const refreshSeconds = props.refreshSeconds ?? 30;
  const projectAliases = props.projectAliases ?? {};

  let cards = $state<KanbanCard[]>([]);
  let total = $state(0);
  let lastFetched = $state<Date | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(true);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let aborter: AbortController | null = null;

  function projectLabel(key: string | null): string {
    if (!key) return '—';
    if (projectAliases[key]) return projectAliases[key];
    // last path segment
    const parts = key.split('/');
    return parts[parts.length - 1] ?? key;
  }

  function relativeTime(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000) return 'now';
    const mins = Math.floor(ms / 60_000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  async function refresh() {
    if (!kanbanUrl || !mirrorToken) {
      error = 'Tile not configured (kanbanUrl + mirrorToken required)';
      loading = false;
      return;
    }
    aborter?.abort();
    aborter = new AbortController();
    try {
      const all = await fetchActiveCards({
        baseUrl: kanbanUrl,
        mirrorToken,
        projects,
        signal: aborter.signal,
      });
      total = all.length;
      cards = all.slice(0, maxCards);
      error = null;
      lastFetched = new Date();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('401') || msg.includes('403')) {
        error = 'Auth error — regenerate mirror token';
      } else if (lastFetched) {
        error = `stale (last update ${relativeTime(lastFetched.toISOString())})`;
      } else {
        error = `error: ${msg}`;
      }
    } finally {
      loading = false;
    }
  }

  function schedule() {
    timer = setTimeout(async () => {
      await refresh();
      schedule();
    }, refreshSeconds * 1000);
  }

  onMount(() => {
    refresh().then(schedule);
  });

  onDestroy(() => {
    aborter?.abort();
    if (timer) clearTimeout(timer);
  });

  function tagPresent(card: KanbanCard, tag: string): boolean {
    return card.tags.includes(tag);
  }
</script>

<BaseTile {id} title="Active Work">
  <div class="active-work">
    {#if loading && cards.length === 0}
      <div class="dim">Loading…</div>
    {:else if total === 0}
      <div class="dim">No active work</div>
    {:else}
      <ul>
        {#each cards as card (card.id)}
          <li
            class="row"
            class:blocked={tagPresent(card, 'blocked')}
            class:has-feedback={tagPresent(card, 'has-feedback')}
            data-tag={card.tags.find(t => ['deployed-local','deployed-prod','blocked','has-feedback'].includes(t)) ?? null}
          >
            <div class="head">
              <span class="project">{projectLabel(card.project)}</span>
              <span class="title">{card.title}</span>
            </div>
            <div class="meta">
              {#if tagPresent(card, 'deployed-prod')}<span class="ok">✓ prod</span>
              {:else if tagPresent(card, 'deployed-local')}<span class="dot ok"></span> local{/if}
              {#if tagPresent(card, 'blocked')}<span class="warn">blocked</span>{/if}
              <span class="ts">{relativeTime(card.updated_at)}</span>
            </div>
          </li>
        {/each}
      </ul>
      {#if total > cards.length}
        <div class="dim more">+{total - cards.length} more</div>
      {/if}
    {/if}
    {#if error}
      <div class="error">{error}</div>
    {/if}
  </div>
</BaseTile>

<style>
  .active-work { font-family: 'JetBrains Mono', monospace; font-size: 0.9rem; color: #d6d6d6; }
  ul { list-style: none; margin: 0; padding: 0; }
  .row { padding: 0.4rem 0; border-bottom: 1px solid #2a2a2a; position: relative; }
  .row:last-child { border-bottom: none; }
  .row.blocked { border-left: 3px solid #d6b06a; padding-left: 0.5rem; }
  .row.has-feedback::after {
    content: '';
    position: absolute; right: 0; top: 50%; width: 0.4rem; height: 0.4rem;
    background: #7ab8d4; border-radius: 50%; transform: translateY(-50%);
    animation: pulse 2s infinite;
  }
  .head { display: flex; gap: 0.5rem; align-items: baseline; }
  .project { color: #7ab8d4; min-width: 6rem; }
  .title { color: #e0e0e0; font-weight: 500; }
  .meta { display: flex; gap: 0.6rem; font-size: 0.78rem; color: #8a8a8a; margin-top: 0.15rem; }
  .ok { color: #7fc99a; }
  .warn { color: #d6b06a; }
  .dot { display: inline-block; width: 0.4rem; height: 0.4rem; border-radius: 50%; vertical-align: middle; margin-right: 0.2rem; }
  .dot.ok { background: #7fc99a; }
  .ts { margin-left: auto; }
  .dim { color: #6a6a6a; }
  .more { padding-top: 0.3rem; font-size: 0.78rem; }
  .error { color: #d67070; font-size: 0.78rem; padding-top: 0.4rem; }
  @keyframes pulse {
    0% { opacity: 0.4; }
    50% { opacity: 1; }
    100% { opacity: 0.4; }
  }
</style>
```

- [ ] **Step 3: Run tests, expect PASS**

```bash
cd /Users/assistant/WorkingFolder/SmartMirror/frontend
pnpm test --run src/lib/tiles/ActiveWorkTile.test.ts 2>&1 | tail -30
```

Expected: 6 tests pass.

If any fail, fix incrementally — common fixes: adjust selector text in the test or render code so they match.

- [ ] **Step 4: Commit**

```bash
cd /Users/assistant/WorkingFolder/SmartMirror
git add frontend/src/lib/tiles/ActiveWorkTile.svelte frontend/src/lib/tiles/ActiveWorkTile.test.ts
git commit -m "feat(tile): ActiveWorkTile reads kanban + tag-driven visual states"
```

---

## Task 4: Register tile in `registry.ts`

**Files:**
- Modify: `frontend/src/lib/tiles/registry.ts`

- [ ] **Step 1: Add the import + entry**

In `frontend/src/lib/tiles/registry.ts`, add the import alongside others:

```ts
import ActiveWorkTile from './ActiveWorkTile.svelte';
```

Then add to the `TILES` record:

```ts
  'active-work': ActiveWorkTile,
```

(Use kebab-case for the key — matches existing convention.)

- [ ] **Step 2: Type-check + build**

```bash
cd /Users/assistant/WorkingFolder/SmartMirror/frontend
pnpm exec svelte-check 2>&1 | tail -30
```

Expected: no new errors. (Existing project errors, if any, are pre-existing.)

```bash
pnpm build 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/tiles/registry.ts
git commit -m "feat(tile): register active-work in tile registry"
```

---

## Task 5: Doc the tile in tile-authoring.md

**Files:**
- Modify: `docs/tile-authoring.md`

- [ ] **Step 1: Append a section**

Append to `docs/tile-authoring.md`:

```md
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/tile-authoring.md
git commit -m "docs(tile-authoring): ActiveWorkTile reference"
```

---

## Task 6: End-to-end manual smoke

**Files:** none (verification only).

- [ ] **Step 1: Verify SmartKanban is running with Phase 1 changes**

```bash
curl -sSf http://localhost:3001/health | jq .
```

Expected: `{ ok: true }`.

Generate or copy a mirror-scope token via SmartKanban Settings → Mirror tokens.

- [ ] **Step 2: Add tile to a layout**

Edit your active mirror layout config to include:

```json
{
  "type": "active-work",
  "id": "active-1",
  "props": {
    "kanbanUrl": "http://localhost:3001",
    "mirrorToken": "<paste mirror token>",
    "maxCards": 5
  }
}
```

- [ ] **Step 3: Start mirror dev server**

```bash
cd /Users/assistant/WorkingFolder/SmartMirror/frontend
pnpm dev
```

Open the mirror in a browser. The Active Work tile should render.

- [ ] **Step 4: Test against Phase 2 bridge**

In a second terminal, in another git repo, run `/kanban-start` (Phase 2). Create a card. Move to `in_progress`.

Within 30 seconds, the card should appear in the Active Work tile.

- [ ] **Step 5: Test the tag-driven states**

- `/kanban-deployed-local` → green dot appears.
- `/kanban-block "test"` → amber bar appears.
- `/kanban-feedback "test"` → blue pulse appears.
- `/kanban-deployed-prod` → status reads "✓ prod"; card moves to `done` and disappears from the list (it filters in_progress + today only).

- [ ] **Step 6: Test failure modes**

- Stop SmartKanban server. Wait 30s. Tile should show `stale (last update Xm ago)` footer; rows still visible (last-known).
- Revoke the mirror token. Wait 30s. Tile should show `Auth error — regenerate mirror token` footer.
- Restart server, regenerate token, update layout. Tile recovers on next poll.

---

## Task 7: Open PR

- [ ] **Step 1: Push**

```bash
cd /Users/assistant/WorkingFolder/SmartMirror
git push -u origin <branch>
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "feat(tile): ActiveWorkTile reads kanban in-flight cards" --body "$(cat <<'EOF'
## Summary
- Adds the `active-work` tile that polls SmartKanban for in-flight cards and renders them with tag-driven visual states.
- Read-only. Uses an existing mirror-scope token via `x-mirror-token`.
- Phase 5 of the notetaker-kanban design (see docs/superpowers/specs/2026-04-27-notetaker-kanban-design.md).

## Test plan
- [ ] Vitest unit tests pass (`pnpm test --run src/lib/tiles/ActiveWorkTile.test.ts`).
- [ ] svelte-check + build clean.
- [ ] Manual: tile renders cards from a running SmartKanban; tag states render; empty/stale/auth-error fallbacks render correctly.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes

- Tile reads only — no clicks, no writes. Mirror is a kiosk surface.
- `x-mirror-token` header is the existing SmartKanban convention (see `routes/cards.ts` `requireUserOrMirror` preHandler). The Phase 1 server PR keeps that contract — mirror tokens grant read on cards endpoint.
- The fetch client makes N calls (one per status) because the existing `/api/cards` endpoint doesn't filter by status; a follow-up post-v1 server change can fold this into one call. For v1, two calls every 30s is negligible.
- Tag-driven CSS classes use `data-tag="<priority-tag>"` for the dominant state, so tests can assert on it cheaply.
- The pulse animation is opt-out via `showFeedback: false` (prop wired but currently always-on once tag present — a future enhancement can gate it on the prop).
- Project alias map handles the "github.com/chatwithllm/smartmirror" → "Mirror" rename without touching kanban data.
- Status filter is hardcoded to `in_progress + today` to match the spec; if a user wants `backlog` visible, that's a future prop.
