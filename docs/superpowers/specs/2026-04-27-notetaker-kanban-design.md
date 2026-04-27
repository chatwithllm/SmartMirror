# notetaker-kanban — Bidirectional sync between Claude Code sessions and SmartKanban

**Status:** Design approved. Awaiting user review before implementation plan.
**Date:** 2026-04-27
**Author:** chatwithllm + Claude (brainstorming session)
**Repos affected:** new `notetaker-kanban`, additive PR to `SmartKanban` (a.k.a. KanbanClaude), additive PR to `SmartMirror`.

---

## 1. Motivation

User runs many parallel projects (SmartMirror, SmartKanban, ARGUS, future). Cards capture intent, but lifecycle updates (started, in-progress, deployed local, deployed prod, blocked) are **manual** — and forgotten more often than not. SmartKanban becomes stale; the mirror's `/my-day` view shows an unrealistic picture.

Goal: a generic agent ("notetaker") that watches Claude Code dev sessions and writes accurate, near-real-time card state back to SmartKanban — without disrupting how the user works. Mirror reads the result and surfaces it in a glanceable tile.

The product's job is **recording reality**, not setting priority. Hence "notetaker."

---

## 2. Naming convention (project-wide)

Rule for all repos under `WorkingFolder/`: `<role>-<product>[-<modifier>]`, lowercase kebab. Roles:

| Prefix | Meaning | Example |
|---|---|---|
| `app-` | End-user app | `app-mirror`, `app-kanban` |
| `bridge-` | Dumb pipe between two systems | `bridge-ha-mqtt` |
| `notetaker-` | Auto-records work into a system of record | `notetaker-kanban` |
| `tile-` | SmartMirror tile | `tile-active-work` |
| `lib-` | Reusable code, no UI | `lib-ha-client` |
| `tool-` | CLI / dev utility | `tool-deploy-wrapper` |
| `lab-` | Experiment / throwaway | `lab-whisper-local` |

Existing repos retain their names; convention applies going forward.

---

## 3. Goals & non-goals

### Goals

- Generic — works in any git repo, not SmartMirror-specific.
- Zero-friction onboarding — one slash command (`/kanban-start`) per repo.
- Survives forgetfulness — `/kanban-start` mid-development reads existing git history and synthesizes an accurate card.
- No daemons, no global processes — slash commands + hooks + a small CLI helper.
- Privacy-respecting — no file content leaves the machine; bash commands and prompts are truncated and redacted.
- Read-back on the mirror via a single new tile.
- Additive only on the SmartKanban side — no breaking changes to existing API or data model.

### Non-goals

- Not a replacement for the SmartKanban Telegram capture flow.
- Not a multi-developer collaboration tool (v1 is solo-dev).
- Not a CI/CD platform — it observes deploys, doesn't run them.
- Not a Jira/Linear bridge (yet — naming leaves room).
- No mirror-side write actions — tile is read-only.

---

## 4. Architecture overview

```
┌─────────────────── User dev machine ──────────────────┐
│                                                        │
│  Claude Code session in repo /path/to/AnyProject       │
│    │                                                   │
│    ├─ ~/.claude/commands/kanban-*.md  (slash cmds)    │
│    ├─ ~/.claude/hooks/notetaker-buffer.sh             │
│    │     (PostToolUse, UserPromptSubmit, Stop         │
│    │      → JSONL append)                              │
│    └─ /path/to/AnyProject/.kanban/                    │
│         ├─ config.json   (committed: project_key,     │
│         │                  kanban_url, main_branch)    │
│         ├─ local.json    (gitignored: branch↔card     │
│         │                  map, auth, last_flush)      │
│         └─ buffer.jsonl  (raw events, drained on      │
│                            flush)                       │
│                                                        │
│  git hooks (post-checkout, post-commit) ──┐           │
│  bin/kanban-deploy wrapper ───────────────┤           │
│                                           ▼           │
└──────────────────── HTTPS ────────────────┼───────────┘
                                            │
                              ┌─────────────▼──────────┐
                              │   SmartKanban server   │
                              │   (existing Fastify)   │
                              │                        │
                              │  REUSE /api/cards CRUD │
                              │  ADD: project column   │
                              │  ADD: scope on tokens  │
                              │  ADD: POST activity    │
                              │  ADD: api token routes │
                              └─────────────┬──────────┘
                                            │
                              ┌─────────────▼──────────┐
                              │   SmartMirror          │
                              │   New tile:            │
                              │   tile-active-work     │
                              │   (polls cards API)    │
                              └────────────────────────┘
```

Three repos, one feature:

1. **`notetaker-kanban`** (new, standalone) — slash commands, hooks, CLI helpers. Installed once per machine. Generic across all projects.
2. **`SmartKanban`** PR — additive: `project` column on cards, `scope` on tokens, new `POST /api/cards/:id/activity`, new `/api/tokens` routes, Settings → API Tokens panel.
3. **`SmartMirror`** PR — one tile (`tile-active-work`) that polls SmartKanban and renders in-flight cards.

`notetaker-kanban` does not import either of the other two repos. SmartMirror tile reads kanban API. SmartKanban knows nothing about either client.

---

## 5. Data flow

### 5.1 Write path — `/kanban-start` (mid-development case)

1. User runs `/kanban-start` in a Claude session inside any git repo.
2. Slash command checks `.kanban/config.json`. Absent → bootstrap (write config, ensure `.kanban/local.json` is gitignored, register repo path in `~/.notetaker-kanban/repos.json`).
3. Resolve `project_key`:
   - `.kanban/config.json:project_key` (if present)
   - `git config --get notetaker.project`
   - normalized `git config --get remote.origin.url` (strip protocol, strip `.git`, lowercase)
   - basename of repo root (fallback)
4. Read `git log $(git merge-base origin/<main_branch> HEAD)..HEAD --oneline` and `git diff origin/<main_branch>...HEAD --stat`.
5. Claude (current session) summarizes via prompt template (Section 5.5). Output is structured JSON: `{title, description, tags, status, needs_review}`.
6. User confirms or edits.
7. POST `/api/cards` with `project=<project_key>` and `source=manual`. Returns `card_id`.
8. Save `branch_card_map[<branch>] = <card_id>` in `.kanban/local.json`.
9. Hooks become active for that branch on subsequent edits.

### 5.2 Write path — buffered events from hooks

Every Claude tool use that the user-level hook matches:

1. Hook script runs (`~/.claude/hooks/notetaker-buffer.sh <event_type>`).
2. Resolves repo root via `git rev-parse --show-toplevel`. Not in a repo → exit 0.
3. Reads `.kanban/config.json`. Absent → exit 0.
4. Reads current branch. Looks up `branch_card_map[<branch>]` in `.kanban/local.json`. Missing → exit 0.
5. Builds JSONL event (Section 6.2), atomic-appends to `.kanban/buffer.jsonl`.
6. On `session_stop` event, optionally spawns background flush.

Hook exit code is always 0. Errors written to `.kanban/buffer.errors.log`.

### 5.3 Write path — flush (`/kanban-flush` or background)

1. Read `.kanban/buffer.jsonl`.
2. Group events by `card_id` (in case branch was switched mid-session).
3. For each group, build aggregates: prompt count, unique files touched, tool counts, bash success/fail, time span.
4. Build LLM prompt (Section 5.5) with aggregates + recent prompts.
5. LLM source:
   - Foreground (`/kanban-flush`): use the Claude session.
   - Background (`Stop` hook): direct OpenRouter call using `OPENROUTER_API_KEY` env var. If unset, skip summary; post raw aggregates as activity body.
6. POST `/api/cards/:id/activity` with `{type: 'session_summary', body: <summary>, details: <aggregates>}`.
7. Atomically truncate `buffer.jsonl` (write to `buffer.jsonl.new`, rename).
8. Append flush record to `.kanban/flush.log`.

### 5.4 Write path — milestone slash commands

`/kanban-deployed-local`, `/kanban-deployed-prod`, `/kanban-feedback`, `/kanban-block`, etc.:

1. Resolve `card_id` from `branch_card_map[<branch>]`.
2. PATCH `/api/cards/:id` to update tags / status. Tags merged client-side (read existing tags via `GET /api/cards/:id`, append new, PATCH). Server contract for `tags` field on PATCH (replace vs merge) **must be verified in Phase 1 testing** — assumption here is "replaces array."
3. POST `/api/cards/:id/activity` with semantic `type` (e.g. `'deployed_local'`, `'feedback'`).
4. No LLM call.

If `card_id` missing for current branch: print "no card linked, run `/kanban-start` first" and exit non-zero.

### 5.5 LLM prompt template (used by `/kanban-start` and flush)

For `/kanban-start` backfill:

```
You are summarizing in-progress dev work for a kanban card.

Branch: {branch}
Project: {project_key}
Commits since branching from {main_branch}:
{git log --oneline}

Files touched (line counts):
{git diff --stat}

Buffer events (recent prompts + edits, if any):
{recent buffer entries}

Output JSON:
{
  "title": "<short imperative title, ≤60 chars>",
  "description": "<2-4 sentences, what's being built and why>",
  "tags": ["<lowercase, kebab>", ...],
  "status": "today" | "in-progress",
  "needs_review": <true if work looks incomplete>
}
```

For flush summary:

```
Summarize this Claude Code dev session for a kanban activity entry.

Aggregates:
- prompts: {n}
- files touched: {paths}
- bash commands: {n} ({n_success} ok, {n_fail} failed)
- duration: {minutes} min

Recent prompts (truncated):
{first_3_prompts}
...
{last_3_prompts}

Output 2-3 short bullets describing what changed and why. Plain markdown,
no preamble.
```

### 5.6 Read path — mirror tile

1. SmartMirror tile (`tile-active-work`) polls `GET /api/cards?status=in-progress,today` every 30s using a **mirror-scope** token.
2. Renders card rows with project label, branch, status, tag-driven visual states.
3. WS upgrade is a future enhancement; v1 polls.

### 5.7 Read path — git/CI signals (post-v1, listed for completeness)

- `post-checkout` git hook → if branch matches `feat/*|fix/*` and no card linked, prompt next slash command.
- `post-push` to `main` → tag linked card `#merged`.
- GitHub Action (when first multi-dev project arrives) → comment kanban with PR url, move card to Done on merge.

---

## 6. Per-repo design

### 6.1 `notetaker-kanban` (new standalone)

```
notetaker-kanban/
├── README.md
├── install.sh                       # copies files to ~/.claude/, edits settings.json
├── uninstall.sh                     # reverse
├── commands/                        # → ~/.claude/commands/
│   ├── kanban-start.md
│   ├── kanban-link.md
│   ├── kanban-unlink.md
│   ├── kanban-status.md
│   ├── kanban-doing.md
│   ├── kanban-today.md
│   ├── kanban-block.md
│   ├── kanban-unblock.md
│   ├── kanban-done.md
│   ├── kanban-deployed-local.md
│   ├── kanban-deployed-prod.md
│   ├── kanban-feedback.md
│   ├── kanban-comment.md
│   ├── kanban-flush.md
│   ├── kanban-buffer.md
│   ├── kanban-list.md
│   └── kanban-pull.md
├── hooks/                           # → ~/.claude/hooks/
│   └── notetaker-buffer.sh
├── bin/                             # → ~/.local/bin/ or similar
│   ├── kanban-deploy                # wrapper: kanban-deploy local|prod -- <cmd>
│   └── notetaker-flush              # standalone flush (used by Stop hook + cron)
├── lib/                             # shared shell helpers sourced by scripts
│   ├── config.sh                    # read/write .kanban/config.json + local.json
│   ├── api.sh                       # curl-based POST/PATCH + auth
│   ├── git.sh                       # branch + project_key resolution
│   └── buffer.sh                    # atomic JSONL append, redaction
└── tests/
    ├── config.bats
    ├── git.bats
    ├── buffer.bats
    ├── redaction.bats
    └── integration/
        ├── kanban-start.bats        # hits a mock/local kanban server
        └── flush.bats
```

Implementation language: **Bash** for hook script and CLI helpers; **slash command markdown** with embedded shell + Claude reasoning for slash commands. No Node runtime needed in the bridge itself; it relies on the user's `curl`, `jq`, `git`, `flock` (Linux) / `shlock` or `mkdir`-lock (macOS).

**Dependencies (host machine):** `git` (assumed), `curl` (assumed), `jq` (must install — `brew install jq` on macOS, `apt install jq` on Debian). `install.sh` checks for `jq` and bails with a clear message if missing.

If shell complexity grows past comfort, can extract to a small Node script invoked by the slash command. Decide at Phase 3.

### 6.2 Buffer schema (JSONL)

One JSON object per line, no nested newlines.

```json
{"ts":"2026-04-29T15:32:11Z","event":"user_prompt","branch":"feat/voice-control","card_id":"c_42","payload":{"prompt":"<truncated 500 chars>","cwd":"/path/to/repo"}}
{"ts":"2026-04-29T15:33:02Z","event":"file_edit","branch":"feat/voice-control","card_id":"c_42","payload":{"tool":"Edit","file":"src/lib/voice/wake.ts","old_lines":4,"new_lines":12}}
{"ts":"2026-04-29T15:33:18Z","event":"bash_run","branch":"feat/voice-control","card_id":"c_42","payload":{"cmd":"<truncated 200 chars>","exit_code":0}}
{"ts":"2026-04-29T15:45:00Z","event":"session_stop","branch":"feat/voice-control","card_id":"c_42","payload":{}}
```

Truncation rules:

- `user_prompt.prompt`: 500-char cap.
- `bash_run.cmd`: 200-char cap. Strip env vars matching `/(TOKEN|SECRET|KEY|PASSWORD|API_KEY)/i`.
- `file_edit`: never store file content, only path + line counts.
- Buffer file size cap: 10 MB. Force-flush on exceed.

### 6.3 Config files

**`.kanban/config.json`** (committed, team-shared):

```json
{
  "version": 1,
  "project_key": "github.com/chatwithllm/SmartMirror",
  "kanban_url": "http://localhost:3001",
  "main_branch": "main"
}
```

**`.kanban/local.json`** (gitignored, per-developer):

```json
{
  "branch_card_map": { "feat/voice-control": "c_42" },
  "auth": { "kind": "token_env", "var": "KANBAN_TOKEN" },
  "last_flush": "2026-04-29T15:45:00Z",
  "llm": {
    "kind": "session",
    "fallback": {
      "kind": "openrouter",
      "model": "google/gemini-2.0-flash-001",
      "key_env": "OPENROUTER_API_KEY"
    }
  },
  "flush": {
    "auto_on_stop": true,
    "max_buffer_lines": 5000,
    "max_buffer_bytes": 10485760
  },
  "redact": {
    "env_var_patterns": ["TOKEN", "SECRET", "KEY", "PASSWORD", "API_KEY"]
  }
}
```

**`~/.notetaker-kanban/repos.json`** (machine-global registry):

```json
{
  "repos": [
    {"path":"/Users/x/WorkingFolder/SmartMirror","project_key":"github.com/chatwithllm/SmartMirror","added":"2026-04-29T15:00:00Z"},
    {"path":"/Users/x/WorkingFolder/ARGUS","project_key":"github.com/chatwithllm/ARGUS","added":"2026-04-29T16:00:00Z"}
  ]
}
```

### 6.4 Hook wiring (added to `~/.claude/settings.json` by `install.sh`)

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "matcher": "*", "hooks": [{ "type": "command", "command": "~/.claude/hooks/notetaker-buffer.sh user_prompt" }]}
    ],
    "PostToolUse": [
      { "matcher": "Edit|Write|MultiEdit", "hooks": [{ "type": "command", "command": "~/.claude/hooks/notetaker-buffer.sh file_edit" }]},
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "~/.claude/hooks/notetaker-buffer.sh bash_run" }]}
    ],
    "Stop": [
      { "matcher": "*", "hooks": [{ "type": "command", "command": "~/.claude/hooks/notetaker-buffer.sh session_stop" }]}
    ]
  }
}
```

`install.sh` wraps inserted entries with marker comments (or a sentinel JSON property) so `uninstall.sh` can find and remove them surgically.

### 6.5 Slash command surface (full list)

#### Lifecycle

| Command | Args | Action |
|---|---|---|
| `/kanban-start` | `[title]` opt | Bootstrap repo if needed. If branch already mapped, print existing link and exit. Else read git history, LLM-summarize, propose card, confirm, POST. |
| `/kanban-link` | `<card-id>` | Bind current branch to existing card. No LLM. |
| `/kanban-unlink` | none | Remove branch ↔ card mapping. |
| `/kanban-status` | none | Print project_key, current branch, mapped card_id, last flush, buffer line count. |

#### State transitions

| Command | Args | Action |
|---|---|---|
| `/kanban-doing` | none | PATCH card → `status=in-progress`. |
| `/kanban-today` | none | PATCH card → `status=today`. |
| `/kanban-block` | `<reason>` | Tag `#blocked`, comment reason. |
| `/kanban-unblock` | none | Remove `#blocked`. |
| `/kanban-done` | none | PATCH → `status=done`. Manual override. |

#### Milestones

| Command | Args | Action |
|---|---|---|
| `/kanban-deployed-local` | none | Tag `#deployed-local`, activity entry. |
| `/kanban-deployed-prod` | none | Tag `#deployed-prod`, status → done. |
| `/kanban-feedback` | `<text>` | Append `[feedback] <text>` to description + activity. Tag `#has-feedback`. |
| `/kanban-comment` | `<text>` | Free-form activity append. |

#### Buffer

| Command | Args | Action |
|---|---|---|
| `/kanban-flush` | none | Drain buffer, summarize, post activity. |
| `/kanban-buffer` | none | Show buffer contents (debug). |

#### Discovery

| Command | Args | Action |
|---|---|---|
| `/kanban-list` | `[project]` opt | List active cards for current project (or named). |
| `/kanban-pull` | `<card-id>` | Show full card detail in session. |

### 6.6 Deploy wrapper

`bin/kanban-deploy`:

```
kanban-deploy local -- ./scripts/deploy-local.sh
kanban-deploy prod  -- npm run deploy:prod
```

1. Resolve repo + branch + card_id (same logic as slash commands).
2. Run inner command, capture exit code + duration.
3. On exit 0: tag `#deployed-local` or `#deployed-prod`; on prod, also `status=done`. Activity entry includes duration.
4. On non-zero: tag `#deploy-failed-local|prod`, activity with stderr tail.

If card_id missing: still run inner command (don't block deploys), log warning to `.kanban/buffer.errors.log`.

### 6.7 SmartKanban PR scope

Migration:

```sql
-- server/migrations/2026-04-29-notetaker.sql
ALTER TABLE cards ADD COLUMN IF NOT EXISTS project TEXT;
CREATE INDEX IF NOT EXISTS cards_project_idx ON cards(project) WHERE archived = false;

ALTER TABLE mirror_tokens ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'mirror';
ALTER TABLE mirror_tokens ADD CONSTRAINT mirror_tokens_scope_chk CHECK (scope IN ('mirror', 'api'));
```

Append same to `server/schema.sql` for fresh installs.

Code changes:

- `server/src/cards.ts` — list query accepts `?project=<key>` filter (single value or comma-separated).
- `server/src/routes/cards.ts` — POST/PATCH accept `project` field.
- `server/src/routes/cards.ts` — new `POST /api/cards/:id/activity` endpoint:
  - Body: `{type: string, body: string, details?: object}`.
  - Auth: `api`-scope token, with visibility check on card.
  - Side effect: insert into existing `activity_log` table.
  - WS broadcast: `card.updated` (existing event).
- `server/src/auth.ts` — `requireApiScope` middleware checks token's scope; rejects `mirror` tokens on write endpoints.
- `server/src/routes/api_tokens.ts` — new:
  - `POST /api/tokens {label, scope: 'api'}` → `{token, url}`
  - `GET /api/tokens` → list
  - `DELETE /api/tokens/:token` → revoke
- `web/src/components/SettingsApiTokens.tsx` — Settings panel mirroring existing Mirror tokens UI.

Tests:

- Migration idempotency (run twice).
- Cards list filter by project.
- POST activity: happy path, auth scope reject, visibility reject.
- Token scope middleware: mirror token blocked on write, api token allowed.
- API token CRUD routes.
- Smoke test for Settings panel.

LOC: ~430 total, mostly tests.

### 6.8 SmartMirror PR scope

`frontend/src/lib/tiles/ActiveWorkTile/`:

- `ActiveWorkTile.svelte` — main tile, polls + renders.
- `card-row.svelte` — single card line, applies tag-driven visual states.
- `ActiveWorkTile.config.ts` — props: `kanbanUrl`, `mirrorToken`, `projects?`, `maxCards?`, `showFeedback?`, `refreshSeconds?`.
- Tile registry entry.
- Tile authoring docs update.

Visual states per card row:

| Tag/state | Visual |
|---|---|
| `#deployed-local` | small green dot before status |
| `#deployed-prod` | green checkmark |
| `#blocked` | amber bar on left edge |
| `#has-feedback` | gentle pulse animation |
| no activity > 24h | dimmed text |
| activity < 5m | bold + "now" |

Empty state: single line `No active work` in dim. Failure (network, 401): show last-known + footer like `stale 3m ago` or `Auth error — regenerate mirror token`. Mirror is read-only; no clicks.

Project label: last segment of `project_key` (e.g. `SmartMirror`). Optional `projectAliases` config for shorter labels.

LOC: ~300.

---

## 7. Failure modes (consolidated)

| Scenario | Component | Behavior |
|---|---|---|
| Kanban down during slash command | slash | Print error, abort. Buffer keeps growing. |
| Kanban down during hook | hook | Buffer-only. No effect. |
| Kanban down during flush | flush | Preserve buffer, exit non-zero. Retry next flush. |
| Kanban down during deploy wrapper | wrapper | Run real deploy. Defer kanban update to `.kanban/pending-milestones.jsonl`. |
| LLM down during `/kanban-start` | slash | Fall back to interactive prompt. |
| LLM down during background flush | flush | Post raw aggregates without summary. |
| Token expired/revoked | slash + flush | Clean error pointing to Settings → API Tokens. |
| Buffer corruption (partial line) | flush | Skip malformed lines, log, process valid ones. |
| Buffer > 10 MB | hook | Force-spawn background flush. |
| Two Claude sessions same repo same branch | hooks | POSIX-atomic single-line append. Flush dedups by content hash. |
| Branch renamed mid-session | hook | New branch lookup, no mapping → silent skip. User runs `/kanban-link`. |
| Card deleted server-side | slash | PATCH 404 → prompt to unlink, remove from local.json. |
| Repo moved on disk | flush + cron | `notetaker-flush --gc` prunes registry. |
| `local.json` accidentally committed | bootstrap | Bootstrap appends to `.gitignore` and warns if already committed. |
| `/kanban-start` twice on same branch | slash | Idempotent — print existing link, exit 0. |
| Detached HEAD | hooks + slash | Skip / tell user to checkout. |
| Mirror token used for write | server | 403 from scope middleware. |

### Critical invariants

1. Hooks always exit 0.
2. Buffer single-line appends are atomic (< PIPE_BUF).
3. Slash command errors are explicit and user-visible.
4. Server changes are additive only.
5. Token scopes are enforced server-side.
6. No secret data lands in cards (redaction at hook + flush).
7. No background daemons (cron/launchd is OS-managed).

---

## 8. Testing strategy

### `notetaker-kanban` repo

- Bash unit tests (`tests/`, `bats` or similar): config bootstrap, project_key resolution priority, buffer append atomicity, redaction, branch resolution edge cases.
- Integration tests against a local kanban server: `/kanban-start` end-to-end, `/kanban-flush` end-to-end, kanban 5xx → buffer preserved, kanban 401 → clean error.
- Slash command snapshot tests: prompt template, expected HTTP payloads.

### SmartKanban PR

- Extend existing `node:test` suite: migration idempotency, cards list filter, activity POST, scope middleware, API token CRUD.
- Web smoke test for the new Settings panel.

### SmartMirror PR

- Tile renders cards from mock API response.
- Empty state.
- Stale state.
- Tag-driven visual states.
- Poll cadence.

### Manual end-to-end checklist

```
1. Fresh kanban, generate api token, export.
2. Fresh repo, no commits → /kanban-start (interactive) → card created.
3. Make 3 commits, exercise hooks, verify buffer.jsonl.
4. /kanban-flush → activity entry on card.
5. /kanban-deployed-local → tag set.
6. kanban-deploy local -- ./scripts/deploy-local.sh → real deploy + tag.
7. /kanban-feedback "x" → tag + comment.
8. /kanban-deployed-prod → status done.
9. cd ../other-repo → /kanban-start → separate card, separate project.
10. Mirror tile shows both projects.
11. Delete card via web → next slash command offers unlink.
12. Revoke token → slash command shows clean error.
```

### Observability

- `.kanban/flush.log` per repo — flush attempts, success/fail, count.
- `.kanban/buffer.errors.log` per repo — malformed lines, redaction events.
- Server `activity_log` (existing) — all card mutations.
- `/kanban-status` slash command — single-screen health summary.

No metrics infra in v1.

---

## 9. Build sequencing

| Phase | Scope | Repo | Est LOC | Est time |
|---|---|---|---|---|
| 1 | Server foundation: migration, project field, activity POST, token scopes, API token routes, Settings panel | SmartKanban | ~430 | 1 day |
| 2 | Bridge MVP: scaffold, `/kanban-start` with LLM backfill, config writers, HTTP client | notetaker-kanban | ~600 | 1 day |
| 3 | Hooks + flush: buffer hook, install/uninstall, flush CLI, redaction | notetaker-kanban | ~500 | 1 day |
| 4 | Milestone commands + deploy wrapper + bash sniffer | notetaker-kanban | ~400 | 0.5 day |
| 5 | Mirror tile (`tile-active-work`) | SmartMirror | ~300 | 0.5 day |
| 6 | Polish: `/kanban-pull`, cron flush, uninstall script, docs | notetaker-kanban | ~200 | 0.5 day |

Critical path: Phase 1 unblocks 2 and 5. Phase 5 can run in parallel with Phases 3 and 4. Total ~4-5 days mechanical work; real complexity sits in Phase 3 (atomic buffer + flush logic) and Phase 1 (token scope correctness).

```
Phase 1 ──┬──→ Phase 2 ──→ Phase 3 ──→ Phase 4
          │
          └──→ Phase 5 (parallel)
                                       │
                                       └─→ Phase 6
```

---

## 10. Open questions (deferred to impl plan)

1. **Background flush LLM source.** When `Stop` hook spawns flush and no `OPENROUTER_API_KEY` is set: skip activity post, or post raw aggregates? **Default:** raw aggregates with `summary_failed=true` flag. Decide at Phase 3.
2. **Bash-sniffer false positives.** Regex match on `deploy` is loose. Mitigate via narrow whitelist (`./deploy*.sh`, `vercel deploy`, `fly deploy`, `gh release`). **Default:** narrow whitelist; skip on uncertainty. Decide at Phase 4.
3. **Multi-developer repo sharing.** v1 stores `branch_card_map` per-dev in `local.json`. If shared mapping becomes desirable, move to committed `config.json`. **Default:** per-dev. Reconsider when first multi-dev project arrives.
4. **Git/CI signal layer (post-checkout / post-push / GitHub Action).** Defined but post-v1. **Default:** ship after Phase 6 if real demand.
5. **HA integration** (LED on door for blocked cards, etc.). **Out of scope** for v1.
6. **Mirror token write attempt — verify visibility filter on token-auth.** Confirm during Phase 1 testing.
7. **PATCH tag semantics on SmartKanban.** Spec assumes PATCH `/api/cards/:id` with `tags: [...]` replaces the array. If server actually merges, the read-then-write helper in `lib/api.sh` simplifies. Verify in Phase 1.

---

## 11. Repo home for this spec

This document lives at `SmartMirror/docs/superpowers/specs/2026-04-27-notetaker-kanban-design.md` for now (the conversation that produced it ran inside the SmartMirror working directory). Once the `notetaker-kanban` repo is created in Phase 2, the spec is copied there and this copy can either remain as a back-reference or be deleted.

---

## 12. Approval

- [x] Approach confirmed (3 — stateless hooks + slash-command intelligence)
- [x] Naming convention adopted (`notetaker-kanban`)
- [x] Architecture overview approved
- [x] Slash command surface approved
- [x] Hook + buffer design approved
- [x] Project identity + config approved
- [x] SmartKanban server changes approved
- [x] SmartMirror tile approved
- [x] Failure modes + testing approved
- [x] Build sequencing approved
- [ ] User reviews this written spec → green light for implementation plan
