# notetaker-kanban Phase 2-4+6 — Bridge implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the standalone `notetaker-kanban` repo: slash commands, hooks, deploy wrapper, and flush logic that records Claude Code dev work into SmartKanban automatically.

**Architecture:** Stateless hooks → repo-local JSONL buffer → slash-command intelligence. Slash commands run inside Claude Code sessions and use the active session's LLM for summarization. Hooks are pure shell, never call network. A small `notetaker-flush` CLI drains the buffer and posts to SmartKanban via Bearer-auth.

**Tech Stack:** Bash 5+, `jq`, `curl`, `git`, `flock`/`shlock`. Slash commands are markdown with frontmatter consumed by Claude Code. Tests use [`bats-core`](https://github.com/bats-core/bats-core).

**Spec:** [`docs/superpowers/specs/2026-04-27-notetaker-kanban-design.md`](../specs/2026-04-27-notetaker-kanban-design.md), Sections 6.1-6.6.

**Depends on:** Phase 1 server PR merged + deployed (Bearer auth + `project` field + activity POST live).

**Repo to create:** `~/WorkingFolder/notetaker-kanban` (new git repo).

> ⚠ Status enum: SmartKanban uses `'backlog' | 'today' | 'in_progress' | 'done'` (snake_case). Bridge must use `in_progress` when PATCHing `status`. Tag values remain kebab-case (`#in-progress`, `#deployed-local`, etc.).

---

## File Structure

```
notetaker-kanban/
├── README.md
├── LICENSE                                    # MIT
├── .gitignore
├── install.sh                                 # interactive: copies files, edits ~/.claude/settings.json
├── uninstall.sh
├── commands/                                  # → ~/.claude/commands/
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
├── hooks/
│   └── notetaker-buffer.sh                    # → ~/.claude/hooks/
├── bin/
│   ├── kanban-deploy                          # deploy wrapper
│   └── notetaker-flush                        # buffer drainer (also called from Stop hook)
├── lib/                                       # sourced by scripts
│   ├── config.sh                              # config read/write helpers
│   ├── api.sh                                 # curl-based POST/PATCH
│   ├── git.sh                                 # branch + project_key resolution
│   ├── buffer.sh                              # atomic JSONL append + redaction
│   └── log.sh                                 # tiny logging helper
└── tests/
    ├── helpers.bash                           # bats helpers (mock kanban server, temp repo)
    ├── config.bats
    ├── git.bats
    ├── buffer.bats
    ├── redaction.bats
    └── integration/
        ├── kanban-start.bats
        ├── flush.bats
        └── deploy-wrapper.bats
```

Per-repo runtime artifacts (created by `/kanban-start` in each user repo):

```
<user-repo>/
├── .gitignore                                 # appended: .kanban/local.json, .kanban/buffer*, .kanban/flush.log, .kanban/pending-milestones.jsonl, .kanban/buffer.errors.log
└── .kanban/
    ├── config.json                            # committed
    ├── local.json                             # gitignored
    ├── buffer.jsonl                           # gitignored
    ├── buffer.errors.log                      # gitignored
    ├── flush.log                              # gitignored
    └── pending-milestones.jsonl               # gitignored, only created on milestone-while-offline
```

User-machine global:

```
~/.notetaker-kanban/
└── repos.json                                 # registry of opted-in repo paths
```

---

## Task 1: Repo scaffold + tooling

**Files:**
- Create: `notetaker-kanban/` directory + skeleton files

- [ ] **Step 1: Create the repo skeleton**

```bash
mkdir -p ~/WorkingFolder/notetaker-kanban/{commands,hooks,bin,lib,tests/integration}
cd ~/WorkingFolder/notetaker-kanban
git init
```

- [ ] **Step 2: Add `.gitignore`**

Write `.gitignore`:

```
# bats artifacts
test_output/
*.log

# editor
.vscode/
.idea/

# OS
.DS_Store
```

- [ ] **Step 3: Add MIT `LICENSE`**

```bash
curl -s https://raw.githubusercontent.com/licenses/license-templates/master/templates/mit.txt > LICENSE
sed -i.bak "s/{{ year }}/$(date +%Y)/; s/{{ organization }}/chatwithllm/" LICENSE
rm LICENSE.bak
```

- [ ] **Step 4: Stub `README.md`**

Write a one-paragraph stub. Detailed README is Task 12.

```md
# notetaker-kanban

Generic Claude Code → SmartKanban bridge. Watches your dev sessions across any project and records reality into a central kanban board, automatically.

See [docs/superpowers/specs/2026-04-27-notetaker-kanban-design.md](https://github.com/chatwithllm/SmartMirror/blob/main/docs/superpowers/specs/2026-04-27-notetaker-kanban-design.md) in SmartMirror for the full spec.

## Status

Implementation in progress.
```

- [ ] **Step 5: Install bats-core for tests**

```bash
brew install bats-core
bats --version
```

Expected: `Bats 1.x.y`. (If not on macOS, see https://github.com/bats-core/bats-core#installation.)

- [ ] **Step 6: Initial commit**

```bash
git add .
git commit -m "chore: scaffold notetaker-kanban repo"
```

---

## Task 2: `lib/config.sh` — config readers/writers

**Files:**
- Create: `lib/config.sh`
- Create: `tests/config.bats`
- Create: `tests/helpers.bash`

- [ ] **Step 1: Write the failing test**

Write `tests/helpers.bash`:

```bash
# tests/helpers.bash
setup_temp_repo() {
  TMP_REPO="$(mktemp -d)"
  cd "$TMP_REPO"
  git init -q
  git config user.email t@t.local
  git config user.name t
}

teardown_temp_repo() {
  cd /
  rm -rf "$TMP_REPO"
}

# Source library files relative to repo root.
source_lib() {
  REPO_ROOT="${BATS_TEST_DIRNAME%/tests*}"
  source "$REPO_ROOT/lib/config.sh"
}
```

Write `tests/config.bats`:

```bash
#!/usr/bin/env bats
load helpers

setup() { setup_temp_repo; source_lib; }
teardown() { teardown_temp_repo; }

@test "config_init creates .kanban/config.json with project_key" {
  config_init "github.com/me/foo" "http://localhost:3001" "main"
  [ -f .kanban/config.json ]
  run jq -r '.project_key' .kanban/config.json
  [ "$output" = "github.com/me/foo" ]
  run jq -r '.kanban_url' .kanban/config.json
  [ "$output" = "http://localhost:3001" ]
  run jq -r '.main_branch' .kanban/config.json
  [ "$output" = "main" ]
  run jq -r '.version' .kanban/config.json
  [ "$output" = "1" ]
}

@test "config_init creates .kanban/local.json with empty branch_card_map" {
  config_init "k" "http://x" "main"
  [ -f .kanban/local.json ]
  run jq -e '.branch_card_map' .kanban/local.json
  [ "$status" -eq 0 ]
}

@test "config_init appends .kanban/local.json to .gitignore (idempotent)" {
  config_init "k" "http://x" "main"
  config_init "k" "http://x" "main"   # second run no-op
  count=$(grep -c '^\.kanban/local\.json$' .gitignore)
  [ "$count" -eq 1 ]
}

@test "config_get_card_id returns empty for unmapped branch" {
  config_init "k" "http://x" "main"
  run config_get_card_id "feat/foo"
  [ -z "$output" ]
}

@test "config_set_card_id then config_get_card_id round-trips" {
  config_init "k" "http://x" "main"
  config_set_card_id "feat/foo" "c_42"
  run config_get_card_id "feat/foo"
  [ "$output" = "c_42" ]
}

@test "config_init is idempotent — second run preserves branch_card_map" {
  config_init "k" "http://x" "main"
  config_set_card_id "feat/foo" "c_42"
  config_init "k" "http://x" "main"
  run config_get_card_id "feat/foo"
  [ "$output" = "c_42" ]
}
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
cd ~/WorkingFolder/notetaker-kanban
bats tests/config.bats 2>&1 | tail -20
```

Expected: all FAIL (lib/config.sh doesn't exist).

- [ ] **Step 3: Implement `lib/config.sh`**

```bash
# lib/config.sh
# Helpers for reading and writing the per-repo .kanban/ config files.

# Resolve the path to .kanban/ in the nearest enclosing git repo.
config_dir() {
  local root
  root="$(git rev-parse --show-toplevel 2>/dev/null)" || return 1
  echo "$root/.kanban"
}

# Initialize a fresh repo: write config.json (committed), local.json (gitignored), .gitignore append.
# Idempotent: existing files are preserved (only newly missing keys are filled).
config_init() {
  local project_key="$1"
  local kanban_url="$2"
  local main_branch="${3:-main}"
  local dir
  dir="$(config_dir)" || { echo "not a git repo" >&2; return 1; }
  mkdir -p "$dir"

  if [ ! -f "$dir/config.json" ]; then
    jq -n \
      --arg pk "$project_key" \
      --arg ku "$kanban_url" \
      --arg mb "$main_branch" \
      '{ version: 1, project_key: $pk, kanban_url: $ku, main_branch: $mb }' \
      > "$dir/config.json"
  fi

  if [ ! -f "$dir/local.json" ]; then
    jq -n \
      '{
        branch_card_map: {},
        last_flush: null,
        flush: { auto_on_stop: true, max_buffer_lines: 5000, max_buffer_bytes: 10485760 },
        redact: { env_var_patterns: ["TOKEN","SECRET","KEY","PASSWORD","API_KEY"] }
      }' > "$dir/local.json"
  fi

  local gi="$(git rev-parse --show-toplevel)/.gitignore"
  touch "$gi"
  for line in ".kanban/local.json" ".kanban/buffer.jsonl" ".kanban/buffer.errors.log" ".kanban/flush.log" ".kanban/pending-milestones.jsonl"; do
    if ! grep -qxF "$line" "$gi"; then
      echo "$line" >> "$gi"
    fi
  done
}

# Print the project_key. Resolution order:
#   1. .kanban/config.json
#   2. git config notetaker.project
#   3. normalized git remote.origin.url
#   4. basename of repo root
config_project_key() {
  local dir; dir="$(config_dir)" || return 1
  if [ -f "$dir/config.json" ]; then
    local pk
    pk="$(jq -r '.project_key // empty' "$dir/config.json")"
    if [ -n "$pk" ]; then echo "$pk"; return 0; fi
  fi
  local git_pk
  git_pk="$(git config --get notetaker.project 2>/dev/null)"
  if [ -n "$git_pk" ]; then echo "$git_pk"; return 0; fi
  local origin
  origin="$(git config --get remote.origin.url 2>/dev/null)"
  if [ -n "$origin" ]; then
    # normalize: strip protocol, trailing .git, lowercase
    echo "$origin" | sed -E 's|^[a-z]+://||; s|^git@||; s|:|/|; s|\.git$||' | tr '[:upper:]' '[:lower:]'
    return 0
  fi
  basename "$(git rev-parse --show-toplevel)"
}

# Get the card_id mapped to a branch (or empty).
config_get_card_id() {
  local branch="$1"
  local dir; dir="$(config_dir)" || return 1
  jq -r --arg b "$branch" '.branch_card_map[$b] // empty' "$dir/local.json"
}

# Map a branch to a card_id (overwrites).
config_set_card_id() {
  local branch="$1"
  local card_id="$2"
  local dir; dir="$(config_dir)" || return 1
  local tmp="$dir/local.json.tmp.$$"
  jq --arg b "$branch" --arg c "$card_id" \
    '.branch_card_map[$b] = $c' \
    "$dir/local.json" > "$tmp"
  mv "$tmp" "$dir/local.json"
}

# Remove the mapping for a branch.
config_unset_card_id() {
  local branch="$1"
  local dir; dir="$(config_dir)" || return 1
  local tmp="$dir/local.json.tmp.$$"
  jq --arg b "$branch" 'del(.branch_card_map[$b])' \
    "$dir/local.json" > "$tmp"
  mv "$tmp" "$dir/local.json"
}

# Print kanban_url + KANBAN_TOKEN env var name.
config_kanban_url() { jq -r '.kanban_url' "$(config_dir)/config.json"; }
config_main_branch() { jq -r '.main_branch' "$(config_dir)/config.json"; }
```

- [ ] **Step 4: Run tests, expect PASS**

```bash
bats tests/config.bats 2>&1 | tail -20
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/config.sh tests/config.bats tests/helpers.bash
git commit -m "feat(config): config_init, project_key resolution, branch_card_map helpers"
```

---

## Task 3: `lib/git.sh` — branch + project resolution

**Files:**
- Create: `lib/git.sh`
- Create: `tests/git.bats`

- [ ] **Step 1: Write the failing test**

```bash
# tests/git.bats
#!/usr/bin/env bats
load helpers

setup() {
  setup_temp_repo
  REPO_ROOT="${BATS_TEST_DIRNAME%/tests*}"
  source "$REPO_ROOT/lib/git.sh"
}
teardown() { teardown_temp_repo; }

@test "git_current_branch returns checked-out branch" {
  echo x > a; git add a; git commit -q -m init
  git checkout -q -b feat/foo
  run git_current_branch
  [ "$output" = "feat/foo" ]
}

@test "git_current_branch returns empty on detached HEAD" {
  echo x > a; git add a; git commit -q -m init
  local sha; sha="$(git rev-parse HEAD)"
  git checkout -q "$sha"
  run git_current_branch
  [ -z "$output" ]
}

@test "git_branch_commits_since_main returns commits on branch only" {
  echo a > a; git add a; git commit -q -m "first on main"
  git checkout -q -b feat/work
  echo b > b; git add b; git commit -q -m "feat: add b"
  echo c > c; git add c; git commit -q -m "feat: add c"
  run git_branch_commits_since_main "main"
  [[ "$output" = *"feat: add b"* ]]
  [[ "$output" = *"feat: add c"* ]]
  [[ "$output" != *"first on main"* ]]
}
```

- [ ] **Step 2: Run; confirm fail**

```bash
bats tests/git.bats 2>&1 | tail -20
```

Expected: FAIL — lib/git.sh missing.

- [ ] **Step 3: Implement `lib/git.sh`**

```bash
# lib/git.sh

# Print current branch, or empty if detached HEAD or not in a repo.
git_current_branch() {
  local b
  b="$(git symbolic-ref --quiet --short HEAD 2>/dev/null)" || return 0
  echo "$b"
}

# Print one-line commit log on the current branch since merge-base with the given main branch.
git_branch_commits_since_main() {
  local main_branch="${1:-main}"
  local base
  base="$(git merge-base HEAD "$main_branch" 2>/dev/null || true)"
  if [ -z "$base" ]; then
    git log --oneline
    return 0
  fi
  git log --oneline "${base}..HEAD"
}

# Print diff stat on the current branch since merge-base.
git_branch_diffstat_since_main() {
  local main_branch="${1:-main}"
  local base
  base="$(git merge-base HEAD "$main_branch" 2>/dev/null || true)"
  if [ -z "$base" ]; then
    git diff --stat HEAD
    return 0
  fi
  git diff --stat "${base}...HEAD"
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
bats tests/git.bats 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add lib/git.sh tests/git.bats
git commit -m "feat(git): branch + commits-since-main helpers"
```

---

## Task 4: `lib/buffer.sh` — atomic JSONL append + redaction

**Files:**
- Create: `lib/buffer.sh`
- Create: `tests/buffer.bats`
- Create: `tests/redaction.bats`

- [ ] **Step 1: Write the failing tests**

`tests/buffer.bats`:

```bash
#!/usr/bin/env bats
load helpers

setup() {
  setup_temp_repo
  REPO_ROOT="${BATS_TEST_DIRNAME%/tests*}"
  source "$REPO_ROOT/lib/config.sh"
  source "$REPO_ROOT/lib/buffer.sh"
  config_init "p" "http://x" "main"
  echo a > a; git add a; git commit -q -m init
  config_set_card_id "main" "c_1"
}
teardown() { teardown_temp_repo; }

@test "buffer_append writes one JSON line" {
  buffer_append "user_prompt" "main" "c_1" '{"prompt":"hello"}'
  run wc -l < .kanban/buffer.jsonl
  [ "$(echo $output | tr -d ' ')" = "1" ]
}

@test "buffer_append output is valid JSON with required keys" {
  buffer_append "user_prompt" "main" "c_1" '{"prompt":"hello"}'
  run jq -r '.event' .kanban/buffer.jsonl
  [ "$output" = "user_prompt" ]
  run jq -r '.branch' .kanban/buffer.jsonl
  [ "$output" = "main" ]
  run jq -r '.card_id' .kanban/buffer.jsonl
  [ "$output" = "c_1" ]
  run jq -r '.payload.prompt' .kanban/buffer.jsonl
  [ "$output" = "hello" ]
}

@test "buffer_append concurrent writes preserve all lines" {
  for i in $(seq 1 50); do
    buffer_append "x" "main" "c_1" "{\"i\":$i}" &
  done
  wait
  run wc -l < .kanban/buffer.jsonl
  [ "$(echo $output | tr -d ' ')" = "50" ]
  # all lines must parse as JSON
  while read -r line; do
    echo "$line" | jq . > /dev/null || return 1
  done < .kanban/buffer.jsonl
}

@test "buffer_size_bytes reports current size" {
  buffer_append "x" "main" "c_1" '{}'
  run buffer_size_bytes
  [ "$output" -gt 0 ]
}
```

`tests/redaction.bats`:

```bash
#!/usr/bin/env bats
load helpers

setup() {
  REPO_ROOT="${BATS_TEST_DIRNAME%/tests*}"
  source "$REPO_ROOT/lib/buffer.sh"
}

@test "buffer_truncate caps to 500 chars" {
  long="$(head -c 600 < /dev/urandom | base64 | head -c 600)"
  result="$(buffer_truncate "$long" 500)"
  [ "${#result}" -le 500 ]
}

@test "buffer_redact strips TOKEN/SECRET/KEY/PASSWORD env-var values" {
  out="$(buffer_redact 'export FOO=ok BAR_TOKEN=abc123 PASSWORD=p MY_SECRET=s API_KEY=k')"
  [[ "$out" != *"abc123"* ]]
  [[ "$out" != *"=p"*  ]] || [[ "$out" =~ "PASSWORD=<redacted>" ]]
  [[ "$out" != *"=s"*  ]] || [[ "$out" =~ "SECRET=<redacted>" ]]
  [[ "$out" != *"=k"*  ]] || [[ "$out" =~ "API_KEY=<redacted>" ]]
  [[ "$out" == *"FOO=ok"* ]]
}
```

- [ ] **Step 2: Run, expect FAIL**

```bash
bats tests/buffer.bats tests/redaction.bats 2>&1 | tail -20
```

- [ ] **Step 3: Implement `lib/buffer.sh`**

```bash
# lib/buffer.sh

# Truncate string to max length.
buffer_truncate() {
  local s="$1"
  local max="${2:-500}"
  printf '%.*s' "$max" "$s"
}

# Redact env-var-style assignments matching sensitive name patterns.
# Replaces VALUE in `NAME=VALUE` where NAME contains TOKEN|SECRET|KEY|PASSWORD|API_KEY.
buffer_redact() {
  local input="$1"
  echo "$input" | sed -E 's/([A-Za-z_]*(TOKEN|SECRET|KEY|PASSWORD|API_KEY)[A-Za-z_]*)=[^[:space:]]+/\1=<redacted>/g'
}

# Append one JSON line to .kanban/buffer.jsonl.
# Args: event, branch, card_id, payload (must be a JSON object string).
# Lines are kept under 4KB by truncating payload string fields if needed.
buffer_append() {
  local event="$1"
  local branch="$2"
  local card_id="$3"
  local payload_json="$4"

  local dir
  dir="$(git rev-parse --show-toplevel 2>/dev/null)/.kanban" || return 0
  [ -d "$dir" ] || return 0

  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  local line
  line="$(jq -cn \
    --arg ts "$ts" \
    --arg event "$event" \
    --arg branch "$branch" \
    --arg card_id "$card_id" \
    --argjson payload "$payload_json" \
    '{ts:$ts, event:$event, branch:$branch, card_id:$card_id, payload:$payload}')"

  # Atomic append: single write call, line size well under PIPE_BUF (4KB).
  printf '%s\n' "$line" >> "$dir/buffer.jsonl"
}

# Print current buffer size in bytes (or 0).
buffer_size_bytes() {
  local f
  f="$(git rev-parse --show-toplevel 2>/dev/null)/.kanban/buffer.jsonl" || { echo 0; return; }
  if [ -f "$f" ]; then
    wc -c < "$f" | tr -d ' '
  else
    echo 0
  fi
}

# Atomically truncate the buffer (rename → empty new file).
buffer_truncate_file() {
  local f
  f="$(git rev-parse --show-toplevel 2>/dev/null)/.kanban/buffer.jsonl" || return 1
  : > "$f"
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
bats tests/buffer.bats tests/redaction.bats 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add lib/buffer.sh tests/buffer.bats tests/redaction.bats
git commit -m "feat(buffer): atomic JSONL append + redaction helpers"
```

---

## Task 5: `lib/api.sh` — kanban API client + mock test server

**Files:**
- Create: `lib/api.sh`
- Create: `tests/helpers.bash` (extend with mock server helper)

- [ ] **Step 1: Add mock kanban server helper to `tests/helpers.bash`**

Append to `tests/helpers.bash`:

```bash
# Spin up a simple mock kanban server using `nc` or python http.server.
# Returns the URL via $MOCK_KANBAN_URL and writes a request log to $MOCK_KANBAN_LOG.
start_mock_kanban() {
  MOCK_KANBAN_DIR="$(mktemp -d)"
  MOCK_KANBAN_LOG="$MOCK_KANBAN_DIR/requests.log"
  MOCK_KANBAN_PORT=$((20000 + RANDOM % 10000))
  MOCK_KANBAN_URL="http://127.0.0.1:$MOCK_KANBAN_PORT"

  python3 -c "
import http.server, json, sys, threading
log_path = '$MOCK_KANBAN_LOG'

class H(http.server.BaseHTTPRequestHandler):
    def _log(self, body):
        with open(log_path, 'a') as f:
            f.write(json.dumps({'method': self.command, 'path': self.path, 'headers': dict(self.headers), 'body': body}) + '\n')
    def do_POST(self):
        n = int(self.headers.get('content-length', '0'))
        body = self.rfile.read(n).decode('utf-8') if n else ''
        self._log(body)
        if self.path == '/api/cards':
            self.send_response(201)
            self.send_header('content-type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{\"id\":\"c_mock\",\"title\":\"mock\",\"project\":\"mock\",\"status\":\"in_progress\",\"tags\":[]}')
        elif self.path.startswith('/api/cards/') and self.path.endswith('/activity'):
            self.send_response(201)
            self.send_header('content-type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{\"ok\":true}')
        else:
            self.send_response(404); self.end_headers()
    def do_PATCH(self):
        n = int(self.headers.get('content-length', '0'))
        body = self.rfile.read(n).decode('utf-8') if n else ''
        self._log(body)
        self.send_response(200)
        self.send_header('content-type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{\"id\":\"c_mock\",\"title\":\"mock\",\"tags\":[],\"status\":\"in_progress\"}')
    def do_GET(self):
        self._log('')
        if self.path.startswith('/api/cards/'):
            self.send_response(200); self.send_header('content-type', 'application/json'); self.end_headers()
            self.wfile.write(b'{\"id\":\"c_mock\",\"title\":\"mock\",\"tags\":[\"a\",\"b\"],\"status\":\"in_progress\"}')
        else:
            self.send_response(404); self.end_headers()
    def log_message(self, *a): pass

srv = http.server.ThreadingHTTPServer(('127.0.0.1', $MOCK_KANBAN_PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
import time
while True: time.sleep(60)
" &
  MOCK_KANBAN_PID=$!
  # wait for server up
  for _ in $(seq 1 20); do
    curl -s "$MOCK_KANBAN_URL/api/health" >/dev/null && break || sleep 0.1
  done
  sleep 0.2
  export MOCK_KANBAN_URL MOCK_KANBAN_PID MOCK_KANBAN_LOG
}

stop_mock_kanban() {
  [ -n "$MOCK_KANBAN_PID" ] && kill "$MOCK_KANBAN_PID" 2>/dev/null
  rm -rf "$MOCK_KANBAN_DIR"
}
```

- [ ] **Step 2: Implement `lib/api.sh`**

```bash
# lib/api.sh
# Wrappers around curl POST / PATCH / GET for the kanban API.
# Auth: Bearer token from $KANBAN_TOKEN env var (or var named in local.json).

api_url() { config_kanban_url; }

# Resolve token from $KANBAN_TOKEN environment variable.
# (Earlier draft made the var name configurable, but every user will use KANBAN_TOKEN
# and bash indirection ${!var} requires bash 4+. macOS default /bin/bash is 3.2 — keep simple.)
api_token() { printf '%s' "${KANBAN_TOKEN:-}"; }

# Print "Authorization: Bearer <token>" line, or empty if missing.
api_auth_header() {
  local t; t="$(api_token)"
  [ -n "$t" ] && printf 'authorization: Bearer %s' "$t"
}

# POST /api/cards. Args: JSON body. Echoes the new card_id (or empty + nonzero on failure).
api_create_card() {
  local body="$1"
  local url="$(api_url)/api/cards"
  local resp
  resp="$(curl -sS -w '\n%{http_code}' -X POST "$url" \
    -H "$(api_auth_header)" \
    -H 'content-type: application/json' \
    -d "$body")" || return 1
  local code; code="$(echo "$resp" | tail -n1)"
  local payload; payload="$(echo "$resp" | sed '$d')"
  if [ "$code" != "201" ]; then
    echo "create_card failed: $code $payload" >&2
    return 1
  fi
  echo "$payload" | jq -r '.id'
}

# GET /api/cards/:id, echoes card JSON.
api_get_card() {
  local id="$1"
  local url="$(api_url)/api/cards/$id"
  curl -sSf "$url" -H "$(api_auth_header)"
}

# PATCH /api/cards/:id with a JSON body. Echoes updated card JSON (or empty + nonzero on failure).
api_patch_card() {
  local id="$1"; local body="$2"
  local url="$(api_url)/api/cards/$id"
  local resp
  resp="$(curl -sS -w '\n%{http_code}' -X PATCH "$url" \
    -H "$(api_auth_header)" \
    -H 'content-type: application/json' \
    -d "$body")" || return 1
  local code; code="$(echo "$resp" | tail -n1)"
  local payload; payload="$(echo "$resp" | sed '$d')"
  if [ "$code" != "200" ]; then
    echo "patch_card failed: $code $payload" >&2
    return 1
  fi
  echo "$payload"
}

# Append tags merge-style: read existing, union with new, PATCH.
api_add_tags() {
  local id="$1"; shift
  local current_tags
  current_tags="$(api_get_card "$id" | jq -r '.tags | @json')"
  local new_tags
  new_tags="$(jq -cn --argjson cur "$current_tags" --argjson add "$(printf '%s\n' "$@" | jq -R . | jq -s .)" \
    '($cur + $add) | unique')"
  api_patch_card "$id" "$(jq -cn --argjson t "$new_tags" '{tags:$t}')"
}

api_remove_tag() {
  local id="$1"; local tag="$2"
  local current_tags
  current_tags="$(api_get_card "$id" | jq -r '.tags | @json')"
  local new_tags
  new_tags="$(echo "$current_tags" | jq --arg t "$tag" 'map(select(. != $t))')"
  api_patch_card "$id" "$(jq -cn --argjson t "$new_tags" '{tags:$t}')"
}

# POST /api/cards/:id/activity. Args: id, type, body, [details JSON object].
api_post_activity() {
  local id="$1"; local type="$2"; local body="$3"; local details="${4:-{\}}"
  local url="$(api_url)/api/cards/$id/activity"
  local payload
  payload="$(jq -cn --arg t "$type" --arg b "$body" --argjson d "$details" '{type:$t, body:$b, details:$d}')"
  curl -sSf -X POST "$url" \
    -H "$(api_auth_header)" \
    -H 'content-type: application/json' \
    -d "$payload" >/dev/null
}
```

- [ ] **Step 3: Write integration test for `api_create_card` against mock**

`tests/integration/api.bats`:

```bash
#!/usr/bin/env bats
load ../helpers

setup() {
  setup_temp_repo
  REPO_ROOT="${BATS_TEST_DIRNAME%/tests*}"
  source "$REPO_ROOT/lib/config.sh"
  source "$REPO_ROOT/lib/api.sh"
  start_mock_kanban
  config_init "p1" "$MOCK_KANBAN_URL" "main"
  export KANBAN_TOKEN="test-token"
}
teardown() { stop_mock_kanban; teardown_temp_repo; }

@test "api_create_card sends Bearer header and returns id" {
  result="$(api_create_card '{"title":"hi","project":"p1"}')"
  [ "$result" = "c_mock" ]
  grep -q "Bearer test-token" "$MOCK_KANBAN_LOG"
}

@test "api_post_activity hits /activity endpoint" {
  api_post_activity "c_42" "session_summary" "edited 3 files" '{"files":3}'
  grep -q '/api/cards/c_42/activity' "$MOCK_KANBAN_LOG"
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
bats tests/integration/api.bats 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add lib/api.sh tests/helpers.bash tests/integration/api.bats
git commit -m "feat(api): curl-based kanban API client + mock-server tests"
```

---

## Task 6: Hook script `hooks/notetaker-buffer.sh`

**Files:**
- Create: `hooks/notetaker-buffer.sh`

- [ ] **Step 1: Implement the hook script**

```bash
#!/usr/bin/env bash
# hooks/notetaker-buffer.sh — invoked by Claude Code hooks.
# Always exits 0. Errors written to .kanban/buffer.errors.log.
set -u
event_type="${1:-unknown}"

# Read full hook event JSON from stdin (Claude provides it).
hook_input="$(cat)"

# Find repo root; bail if not in git.
repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0

# Bail if .kanban not bootstrapped.
[ -d "$repo_root/.kanban" ] || exit 0
[ -f "$repo_root/.kanban/local.json" ] || exit 0

# Locate the lib/ directory of the installed bridge.
# Convention: install.sh symlinks lib into ~/.claude/notetaker-kanban/lib/
LIB_DIR="${NOTETAKER_LIB_DIR:-$HOME/.claude/notetaker-kanban/lib}"
# shellcheck disable=SC1091
source "$LIB_DIR/buffer.sh" 2>/dev/null || exit 0
# shellcheck disable=SC1091
source "$LIB_DIR/config.sh" 2>/dev/null || exit 0

errlog="$repo_root/.kanban/buffer.errors.log"
log_err() { echo "[$(date -u +%FT%TZ)] $*" >> "$errlog" 2>/dev/null || true; }

# Resolve current branch and mapped card.
branch="$(git -C "$repo_root" symbolic-ref --quiet --short HEAD 2>/dev/null)" || exit 0
[ -n "$branch" ] || exit 0
card_id="$(cd "$repo_root" && jq -r --arg b "$branch" '.branch_card_map[$b] // empty' .kanban/local.json 2>/dev/null)"
[ -n "$card_id" ] || exit 0

cd "$repo_root"

case "$event_type" in
  user_prompt)
    prompt="$(echo "$hook_input" | jq -r '.user_prompt // .prompt // ""' 2>/dev/null | head -c 500)"
    cwd="$(echo "$hook_input" | jq -r '.cwd // ""' 2>/dev/null)"
    payload="$(jq -cn --arg p "$prompt" --arg c "$cwd" '{prompt:$p, cwd:$c}')"
    buffer_append "user_prompt" "$branch" "$card_id" "$payload" 2>>"$errlog" || log_err "user_prompt append failed"
    ;;
  file_edit)
    tool="$(echo "$hook_input" | jq -r '.tool_name // .tool // ""' 2>/dev/null)"
    file="$(echo "$hook_input" | jq -r '.tool_input.file_path // .file_path // .params.file_path // ""' 2>/dev/null)"
    payload="$(jq -cn --arg t "$tool" --arg f "$file" '{tool:$t, file:$f}')"
    buffer_append "file_edit" "$branch" "$card_id" "$payload" 2>>"$errlog" || log_err "file_edit append failed"
    ;;
  bash_run)
    cmd="$(echo "$hook_input" | jq -r '.tool_input.command // .params.command // ""' 2>/dev/null | head -c 200)"
    cmd="$(buffer_redact "$cmd")"
    code="$(echo "$hook_input" | jq -r '.tool_response.exit_code // 0' 2>/dev/null)"
    payload="$(jq -cn --arg c "$cmd" --argjson e "$code" '{cmd:$c, exit_code:$e}')"
    buffer_append "bash_run" "$branch" "$card_id" "$payload" 2>>"$errlog" || log_err "bash_run append failed"
    ;;
  session_stop)
    buffer_append "session_stop" "$branch" "$card_id" '{}' 2>>"$errlog" || log_err "session_stop append failed"
    # Spawn flush in background, never wait.
    auto="$(jq -r '.flush.auto_on_stop // true' .kanban/local.json 2>/dev/null)"
    if [ "$auto" = "true" ]; then
      ( "$LIB_DIR/../bin/notetaker-flush" --background >/dev/null 2>&1 & disown ) || true
    fi
    ;;
  *)
    log_err "unknown event type: $event_type"
    ;;
esac

# Force flush if buffer too big.
size="$(buffer_size_bytes)"
max="$(jq -r '.flush.max_buffer_bytes // 10485760' .kanban/local.json 2>/dev/null || echo 10485760)"
if [ "$size" -gt "$max" ]; then
  ( "$LIB_DIR/../bin/notetaker-flush" --background >/dev/null 2>&1 & disown ) || true
fi

exit 0
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x hooks/notetaker-buffer.sh
```

- [ ] **Step 3: Smoke test the hook (no flush yet)**

```bash
mkdir -p /tmp/hooktest && cd /tmp/hooktest
git init -q
git commit -q --allow-empty -m init
mkdir -p .kanban
cat > .kanban/config.json <<'EOF'
{"version":1,"project_key":"test","kanban_url":"http://localhost:9999","main_branch":"main"}
EOF
cat > .kanban/local.json <<'EOF'
{"branch_card_map":{"main":"c_test"},"auth":{"kind":"token_env","var":"KANBAN_TOKEN"},"flush":{"auto_on_stop":false}}
EOF

NOTETAKER_LIB_DIR="$HOME/WorkingFolder/notetaker-kanban/lib" \
  echo '{"user_prompt":"hello world","cwd":"/tmp"}' \
  | "$HOME/WorkingFolder/notetaker-kanban/hooks/notetaker-buffer.sh" user_prompt

cat .kanban/buffer.jsonl
```

Expected: one JSON line with `event:"user_prompt"`, `branch:"main"`, `card_id:"c_test"`, payload prompt `"hello world"`.

- [ ] **Step 4: Commit**

```bash
cd ~/WorkingFolder/notetaker-kanban
git add hooks/notetaker-buffer.sh
git commit -m "feat(hooks): notetaker-buffer.sh stateless event recorder"
```

---

## Task 7: `bin/notetaker-flush` — buffer drainer

**Files:**
- Create: `bin/notetaker-flush`
- Create: `tests/integration/flush.bats`

- [ ] **Step 1: Write the failing integration test**

`tests/integration/flush.bats`:

```bash
#!/usr/bin/env bats
load ../helpers

setup() {
  setup_temp_repo
  REPO_ROOT="${BATS_TEST_DIRNAME%/tests*}"
  source "$REPO_ROOT/lib/config.sh"
  source "$REPO_ROOT/lib/buffer.sh"
  start_mock_kanban
  config_init "p" "$MOCK_KANBAN_URL" "main"
  echo a > a; git add a; git commit -q -m init
  config_set_card_id "main" "c_42"
  export KANBAN_TOKEN="test-token"
  export NOTETAKER_LIB_DIR="$REPO_ROOT/lib"
  export NOTETAKER_NO_LLM=1   # skip LLM for unit tests
}
teardown() { stop_mock_kanban; teardown_temp_repo; }

@test "notetaker-flush posts activity entries and truncates the buffer" {
  buffer_append "user_prompt" "main" "c_42" '{"prompt":"add wake word"}'
  buffer_append "file_edit"   "main" "c_42" '{"tool":"Edit","file":"src/wake.ts"}'
  buffer_append "file_edit"   "main" "c_42" '{"tool":"Edit","file":"src/wake.ts"}'
  buffer_append "bash_run"    "main" "c_42" '{"cmd":"npm test","exit_code":0}'
  buffer_append "session_stop" "main" "c_42" '{}'

  run "$REPO_ROOT/bin/notetaker-flush"
  [ "$status" -eq 0 ]

  # buffer truncated
  size="$(wc -c < .kanban/buffer.jsonl | tr -d ' ')"
  [ "$size" = "0" ]

  # activity POST visible in mock log
  grep -q '/api/cards/c_42/activity' "$MOCK_KANBAN_LOG"
}

@test "notetaker-flush handles empty buffer gracefully" {
  : > .kanban/buffer.jsonl
  run "$REPO_ROOT/bin/notetaker-flush"
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Implement `bin/notetaker-flush`**

```bash
#!/usr/bin/env bash
# bin/notetaker-flush — drain .kanban/buffer.jsonl, summarize, post activity.
set -u
BACKGROUND=0
ALL=0
for arg in "$@"; do
  case "$arg" in
    --background) BACKGROUND=1 ;;
    --all) ALL=1 ;;
  esac
done

LIB_DIR="${NOTETAKER_LIB_DIR:-$HOME/.claude/notetaker-kanban/lib}"
# shellcheck disable=SC1091
source "$LIB_DIR/config.sh"
# shellcheck disable=SC1091
source "$LIB_DIR/buffer.sh"
# shellcheck disable=SC1091
source "$LIB_DIR/api.sh"

flush_one_repo() {
  local repo="$1"
  cd "$repo" || return 1
  [ -f .kanban/buffer.jsonl ] || return 0
  local size; size="$(wc -c < .kanban/buffer.jsonl | tr -d ' ')"
  [ "$size" -gt 0 ] || return 0

  # Group lines by card_id.
  local card_ids
  card_ids="$(jq -r '.card_id' .kanban/buffer.jsonl 2>/dev/null | sort -u)"
  if [ -z "$card_ids" ]; then
    : > .kanban/buffer.jsonl
    return 0
  fi

  while IFS= read -r card_id; do
    [ -n "$card_id" ] || continue
    flush_one_card "$card_id" || echo "flush failed for $card_id" >> .kanban/flush.log
  done <<< "$card_ids"

  : > .kanban/buffer.jsonl
  echo "[$(date -u +%FT%TZ)] flushed $size bytes" >> .kanban/flush.log
}

flush_one_card() {
  local card_id="$1"
  # Aggregate
  local prompt_count files unique_files bash_count fail_count first_ts last_ts prompts_first prompts_last
  prompt_count="$(jq -s 'map(select(.card_id==$c and .event=="user_prompt")) | length' --arg c "$card_id" .kanban/buffer.jsonl)"
  unique_files="$(jq -r --arg c "$card_id" 'select(.card_id==$c and .event=="file_edit") | .payload.file' .kanban/buffer.jsonl | sort -u | wc -l | tr -d ' ')"
  bash_count="$(jq -s 'map(select(.card_id==$c and .event=="bash_run")) | length' --arg c "$card_id" .kanban/buffer.jsonl)"
  fail_count="$(jq -s 'map(select(.card_id==$c and .event=="bash_run" and .payload.exit_code != 0)) | length' --arg c "$card_id" .kanban/buffer.jsonl)"
  first_ts="$(jq -r --arg c "$card_id" 'select(.card_id==$c) | .ts' .kanban/buffer.jsonl | head -1)"
  last_ts="$(jq -r --arg c "$card_id" 'select(.card_id==$c) | .ts' .kanban/buffer.jsonl | tail -1)"
  prompts_first="$(jq -r --arg c "$card_id" 'select(.card_id==$c and .event=="user_prompt") | .payload.prompt' .kanban/buffer.jsonl | head -3)"
  prompts_last="$(jq -r --arg c "$card_id" 'select(.card_id==$c and .event=="user_prompt") | .payload.prompt' .kanban/buffer.jsonl | tail -3)"
  files_list="$(jq -r --arg c "$card_id" 'select(.card_id==$c and .event=="file_edit") | .payload.file' .kanban/buffer.jsonl | sort -u | head -20)"

  local body
  if [ "${NOTETAKER_NO_LLM:-0}" = "1" ] || [ -z "${OPENROUTER_API_KEY:-}" ]; then
    # Raw aggregates fallback.
    body="prompts=$prompt_count files=$unique_files bash=$bash_count fail=$fail_count span=${first_ts}..${last_ts}"
    body+=$'\nfiles touched:\n'"$files_list"
  else
    body="$(llm_summarize "$prompt_count" "$unique_files" "$bash_count" "$fail_count" "$first_ts" "$last_ts" "$prompts_first" "$prompts_last" "$files_list")"
  fi

  local details
  details="$(jq -cn \
    --argjson p "$prompt_count" \
    --argjson f "$unique_files" \
    --argjson b "$bash_count" \
    --argjson fl "$fail_count" \
    --arg fts "$first_ts" \
    --arg lts "$last_ts" \
    '{prompts:$p, files:$f, bash:$b, bash_failed:$fl, span_start:$fts, span_end:$lts}')"

  api_post_activity "$card_id" "session_summary" "$body" "$details"
}

# Direct OpenRouter call — used only when not in a Claude session.
llm_summarize() {
  local prompt_count="$1" files="$2" bash="$3" fail="$4" first="$5" last="$6"
  local pf="$7" pl="$8" filelist="$9"
  local model="${OPENROUTER_MODEL:-google/gemini-2.0-flash-001}"
  local prompt
  prompt="$(cat <<EOF
Summarize this Claude Code dev session for a kanban activity entry.

Aggregates:
- prompts: $prompt_count
- files touched: $files
- bash: $bash ($fail failed)
- span: $first → $last

Recent prompts (first 3):
$pf
Recent prompts (last 3):
$pl
Files touched:
$filelist

Output 2-3 short bullets describing what changed and why. Plain markdown, no preamble.
EOF
)"
  local body
  body="$(jq -cn --arg m "$model" --arg p "$prompt" \
    '{model:$m, messages:[{role:"user",content:$p}]}')"
  local resp
  resp="$(curl -sSf https://openrouter.ai/api/v1/chat/completions \
    -H "authorization: Bearer $OPENROUTER_API_KEY" \
    -H 'content-type: application/json' \
    -d "$body" 2>/dev/null)" || { echo "(LLM unavailable; raw aggregates only)"; return 0; }
  echo "$resp" | jq -r '.choices[0].message.content // empty'
}

# Main
if [ "$ALL" = "1" ]; then
  registry="$HOME/.notetaker-kanban/repos.json"
  [ -f "$registry" ] || exit 0
  jq -r '.repos[].path' "$registry" | while read -r r; do
    [ -d "$r" ] && flush_one_repo "$r"
  done
else
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
  flush_one_repo "$repo_root"
fi
```

- [ ] **Step 3: Make executable + run tests**

```bash
chmod +x bin/notetaker-flush
bats tests/integration/flush.bats 2>&1 | tail -30
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add bin/notetaker-flush tests/integration/flush.bats
git commit -m "feat(flush): notetaker-flush drainer with raw-aggregate fallback"
```

---

## Task 8: Slash command — `/kanban-start`

**Files:**
- Create: `commands/kanban-start.md`

- [ ] **Step 1: Author the slash command**

Slash commands live in `~/.claude/commands/<name>.md`. Frontmatter declares description and tools allowed. The body is the prompt Claude executes.

```md
---
description: "Bootstrap or resume kanban tracking for the current branch. Reads git history, summarizes via LLM, creates a card."
allowed-tools: ["Bash", "Read", "Edit", "Write"]
---

# /kanban-start

You are about to bootstrap kanban tracking for the current branch in this repo (or resume tracking on an existing card if already linked).

## Steps you must follow exactly:

1. Source the bridge libs:
   ```bash
   export NOTETAKER_LIB_DIR="${NOTETAKER_LIB_DIR:-$HOME/.claude/notetaker-kanban/lib}"
   source "$NOTETAKER_LIB_DIR/config.sh"
   source "$NOTETAKER_LIB_DIR/git.sh"
   source "$NOTETAKER_LIB_DIR/api.sh"
   ```

2. Verify environment:
   ```bash
   [ -n "${KANBAN_URL:-}" ]   || { echo "Set KANBAN_URL in your shell rc"; exit 1; }
   [ -n "${KANBAN_TOKEN:-}" ] || { echo "Set KANBAN_TOKEN in your shell rc (Settings → API tokens)"; exit 1; }
   git rev-parse --show-toplevel >/dev/null 2>&1 || { echo "not in a git repo"; exit 1; }
   ```

3. Detect current branch. If detached HEAD, abort.
   ```bash
   BRANCH="$(git_current_branch)"
   [ -n "$BRANCH" ] || { echo "detached HEAD — checkout a branch first"; exit 1; }
   ```

4. If `.kanban/config.json` doesn't exist, bootstrap:
   ```bash
   if [ ! -f "$(config_dir)/config.json" ]; then
     PK="$(config_project_key)"
     config_init "$PK" "$KANBAN_URL" "main"
     # register repo path globally
     mkdir -p "$HOME/.notetaker-kanban"
     REG="$HOME/.notetaker-kanban/repos.json"
     [ -f "$REG" ] || echo '{"repos":[]}' > "$REG"
     ROOT="$(git rev-parse --show-toplevel)"
     jq --arg p "$ROOT" --arg pk "$PK" --arg ts "$(date -u +%FT%TZ)" \
       '.repos += [{path:$p, project_key:$pk, added:$ts}] | .repos |= unique_by(.path)' \
       "$REG" > "$REG.tmp" && mv "$REG.tmp" "$REG"
   fi
   ```

5. Check for an existing branch→card mapping:
   ```bash
   EXISTING="$(config_get_card_id "$BRANCH")"
   if [ -n "$EXISTING" ]; then
     echo "Branch '$BRANCH' already linked to card $EXISTING."
     echo "View: $KANBAN_URL  (open the board)"
     exit 0
   fi
   ```

6. Read git history since merge-base with main:
   ```bash
   MAIN="$(config_main_branch)"
   COMMITS="$(git_branch_commits_since_main "$MAIN")"
   DIFFSTAT="$(git_branch_diffstat_since_main "$MAIN")"
   ```

7. Now YOU (the LLM) propose a kanban card by analyzing the commits and diffstat above. Output a JSON object with these exact keys:
   ```json
   {
     "title": "<imperative, ≤60 chars>",
     "description": "<2-4 sentences>",
     "tags": ["<lowercase-kebab>", ...],
     "status": "today",
     "needs_review": false
   }
   ```

   - `status` must be one of: `backlog`, `today`, `in_progress`, `done` (snake_case).
   - If there are no commits on the branch, ask the user: "What is this branch for?" and use their answer as the title; status=`today`.

8. Show the JSON to the user. Ask: "OK to create? You can edit any field." Wait for explicit confirmation before continuing.

9. POST to kanban:
   ```bash
   PROJECT="$(config_project_key)"
   PAYLOAD="$(jq -cn --arg t "$TITLE" --arg d "$DESC" --argjson tg "$TAGS_JSON" --arg s "$STATUS" --arg p "$PROJECT" \
     '{title:$t, description:$d, tags:$tg, status:$s, project:$p, source:"manual"}')"
   CARD_ID="$(api_create_card "$PAYLOAD")"
   [ -n "$CARD_ID" ] || { echo "create failed"; exit 1; }
   config_set_card_id "$BRANCH" "$CARD_ID"
   echo "✓ Created card $CARD_ID for branch $BRANCH"
   echo "  Project: $PROJECT"
   echo "  $KANBAN_URL"
   ```

10. Print final summary to user.

## Failure handling

- If any step fails, print the failing command's output and exit non-zero.
- Never delete `.kanban/local.json` or rewrite committed `config.json`.
- If POST returns 401 or 403: tell user "Token rejected — generate new one in Settings → API tokens" and exit.
```

- [ ] **Step 2: Smoke test (manual, since slash commands run inside Claude)**

Document the test in `README.md` (Task 12). Skip live test until install.sh exists.

- [ ] **Step 3: Commit**

```bash
git add commands/kanban-start.md
git commit -m "feat(slash): /kanban-start with LLM backfill"
```

---

## Task 9: State + milestone slash commands

**Files:**
- Create: `commands/kanban-doing.md`, `kanban-today.md`, `kanban-block.md`, `kanban-unblock.md`, `kanban-done.md`, `kanban-deployed-local.md`, `kanban-deployed-prod.md`, `kanban-feedback.md`, `kanban-comment.md`, `kanban-flush.md`, `kanban-buffer.md`, `kanban-link.md`, `kanban-unlink.md`, `kanban-status.md`, `kanban-list.md`, `kanban-pull.md`

- [ ] **Step 1: Establish a shared command preamble**

Each slash command's body starts with the same 4-step preamble:

```md
1. Source libs:
   ```bash
   export NOTETAKER_LIB_DIR="${NOTETAKER_LIB_DIR:-$HOME/.claude/notetaker-kanban/lib}"
   source "$NOTETAKER_LIB_DIR/config.sh"
   source "$NOTETAKER_LIB_DIR/api.sh"
   ```
2. Verify env: KANBAN_URL + KANBAN_TOKEN set.
3. Resolve branch + card_id:
   ```bash
   BRANCH="$(git symbolic-ref --quiet --short HEAD || true)"
   CARD_ID="$(config_get_card_id "$BRANCH")"
   [ -n "$CARD_ID" ] || { echo "no card linked for branch $BRANCH; run /kanban-start"; exit 1; }
   ```
4. Run the command-specific action.
```

- [ ] **Step 2: Write each command body (use the table below)**

Each command file has frontmatter `description:` and `allowed-tools: ["Bash"]`, followed by the preamble + the specific action.

| Command | Specific action |
|---|---|
| `kanban-doing.md` | `api_patch_card "$CARD_ID" '{"status":"in_progress"}' && api_post_activity "$CARD_ID" "state_change" "moved to In Progress" '{}'` |
| `kanban-today.md` | Same pattern, `status: today`. |
| `kanban-done.md` | Same pattern, `status: done`. |
| `kanban-block.md` | Read first arg as `REASON`. `api_add_tags "$CARD_ID" "blocked"`; `api_post_activity "$CARD_ID" "blocked" "$REASON"`. |
| `kanban-unblock.md` | `api_remove_tag "$CARD_ID" "blocked"`; activity `unblocked`. |
| `kanban-deployed-local.md` | `api_add_tags "$CARD_ID" "deployed-local"`; activity `deployed_local "deployed locally at $(date -u +%FT%TZ)"`. |
| `kanban-deployed-prod.md` | `api_add_tags "$CARD_ID" "deployed-prod"`; `api_patch_card "$CARD_ID" '{"status":"done"}'`; activity `deployed_prod`. |
| `kanban-feedback.md` | `REASON="$*"`; `api_add_tags "$CARD_ID" "has-feedback"`; `api_post_activity "$CARD_ID" "feedback" "$REASON"`. |
| `kanban-comment.md` | `MSG="$*"`; `api_post_activity "$CARD_ID" "comment" "$MSG"`. |
| `kanban-flush.md` | `"$NOTETAKER_LIB_DIR/../bin/notetaker-flush"`. |
| `kanban-buffer.md` | `cat "$(git rev-parse --show-toplevel)/.kanban/buffer.jsonl" \| jq .` (debug only). |
| `kanban-link.md` | Read first arg `ID`; `config_set_card_id "$BRANCH" "$ID"`; activity `linked` on card to confirm. |
| `kanban-unlink.md` | `config_unset_card_id "$BRANCH"`. |
| `kanban-status.md` | Print project_key, branch, card_id, last_flush, buffer line count. |
| `kanban-list.md` | `curl -sSf "$KANBAN_URL/api/cards?project=$(config_project_key)&status=in_progress" -H "$(api_auth_header)" \| jq .` |
| `kanban-pull.md` | Read `ID`; `api_get_card "$ID" \| jq .`. |

For each, write the full markdown file. Below is the canonical template for `kanban-doing.md`:

```md
---
description: "Move the active card to In Progress."
allowed-tools: ["Bash"]
---

# /kanban-doing

```bash
export NOTETAKER_LIB_DIR="${NOTETAKER_LIB_DIR:-$HOME/.claude/notetaker-kanban/lib}"
source "$NOTETAKER_LIB_DIR/config.sh"
source "$NOTETAKER_LIB_DIR/api.sh"
[ -n "${KANBAN_URL:-}" ] && [ -n "${KANBAN_TOKEN:-}" ] || { echo "set KANBAN_URL and KANBAN_TOKEN"; exit 1; }
BRANCH="$(git symbolic-ref --quiet --short HEAD || true)"
CARD_ID="$(config_get_card_id "$BRANCH")"
[ -n "$CARD_ID" ] || { echo "no card linked for branch $BRANCH; run /kanban-start"; exit 1; }
api_patch_card "$CARD_ID" '{"status":"in_progress"}' >/dev/null
api_post_activity "$CARD_ID" "state_change" "moved to In Progress" '{}'
echo "✓ $CARD_ID → In Progress"
```
```

Write all 16 files using this template, replacing the body for each command.

- [ ] **Step 3: Commit**

```bash
git add commands/
git commit -m "feat(slash): state, milestone, buffer, discovery commands"
```

---

## Task 10: Deploy wrapper `bin/kanban-deploy`

**Files:**
- Create: `bin/kanban-deploy`
- Create: `tests/integration/deploy-wrapper.bats`

- [ ] **Step 1: Write the failing test**

```bash
# tests/integration/deploy-wrapper.bats
#!/usr/bin/env bats
load ../helpers

setup() {
  setup_temp_repo
  REPO_ROOT="${BATS_TEST_DIRNAME%/tests*}"
  source "$REPO_ROOT/lib/config.sh"
  start_mock_kanban
  config_init "p" "$MOCK_KANBAN_URL" "main"
  echo a > a; git add a; git commit -q -m init
  config_set_card_id "main" "c_42"
  export KANBAN_TOKEN="t"
  export NOTETAKER_LIB_DIR="$REPO_ROOT/lib"
  export PATH="$REPO_ROOT/bin:$PATH"
}
teardown() { stop_mock_kanban; teardown_temp_repo; }

@test "kanban-deploy local -- runs inner cmd, exit 0 → tags deployed-local + activity" {
  run kanban-deploy local -- /bin/echo "deployed"
  [ "$status" -eq 0 ]
  grep -q '/api/cards/c_42' "$MOCK_KANBAN_LOG"
  # tag-merge call (PATCH)
  grep -q 'PATCH' "$MOCK_KANBAN_LOG"
  # activity call
  grep -q '/api/cards/c_42/activity' "$MOCK_KANBAN_LOG"
}

@test "kanban-deploy prod -- on success, sets status=done + tag deployed-prod" {
  run kanban-deploy prod -- /bin/true
  [ "$status" -eq 0 ]
  # body of PATCH should mention status=done
  grep -q 'status' "$MOCK_KANBAN_LOG"
}

@test "kanban-deploy still runs inner cmd even when no card linked" {
  config_unset_card_id "main"
  run kanban-deploy local -- /bin/echo ok
  [ "$status" -eq 0 ]
  [[ "$output" = *"ok"* ]]
}

@test "kanban-deploy on inner-cmd failure tags deploy-failed-local" {
  run kanban-deploy local -- /bin/false
  [ "$status" -ne 0 ]
}
```

- [ ] **Step 2: Implement `bin/kanban-deploy`**

```bash
#!/usr/bin/env bash
# bin/kanban-deploy local|prod -- <real-deploy-cmd>
set -u
ENV_NAME="${1:-}"
shift || true
[ "${1:-}" = "--" ] && shift

[ "$ENV_NAME" = "local" ] || [ "$ENV_NAME" = "prod" ] || {
  echo "usage: kanban-deploy local|prod -- <cmd> [args...]"
  exit 2
}

LIB_DIR="${NOTETAKER_LIB_DIR:-$HOME/.claude/notetaker-kanban/lib}"
# shellcheck disable=SC1091
source "$LIB_DIR/config.sh"
# shellcheck disable=SC1091
source "$LIB_DIR/api.sh"

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || REPO_ROOT=""
BRANCH="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
CARD_ID=""
if [ -n "$REPO_ROOT" ] && [ -n "$BRANCH" ] && [ -f "$REPO_ROOT/.kanban/local.json" ]; then
  CARD_ID="$(cd "$REPO_ROOT" && config_get_card_id "$BRANCH")"
fi

START_TS="$(date -u +%FT%TZ)"
"$@"
RC=$?
END_TS="$(date -u +%FT%TZ)"

# Always reflect to kanban if we have a card; never block the deploy.
if [ -n "$CARD_ID" ] && [ -n "${KANBAN_URL:-}" ] && [ -n "${KANBAN_TOKEN:-}" ]; then
  if [ "$RC" -eq 0 ]; then
    if [ "$ENV_NAME" = "prod" ]; then
      api_add_tags "$CARD_ID" "deployed-prod" >/dev/null || true
      api_patch_card "$CARD_ID" '{"status":"done"}' >/dev/null || true
      api_post_activity "$CARD_ID" "deployed_prod" "deployed prod ($START_TS → $END_TS)" \
        "$(jq -cn --arg s "$START_TS" --arg e "$END_TS" --argjson rc 0 '{start:$s,end:$e,exit_code:$rc}')" || true
    else
      api_add_tags "$CARD_ID" "deployed-local" >/dev/null || true
      api_post_activity "$CARD_ID" "deployed_local" "deployed local ($START_TS → $END_TS)" \
        "$(jq -cn --arg s "$START_TS" --arg e "$END_TS" --argjson rc 0 '{start:$s,end:$e,exit_code:$rc}')" || true
    fi
  else
    api_add_tags "$CARD_ID" "deploy-failed-$ENV_NAME" >/dev/null || true
    api_post_activity "$CARD_ID" "deploy_failed" "deploy failed ($ENV_NAME, exit=$RC)" \
      "$(jq -cn --arg s "$START_TS" --arg e "$END_TS" --argjson rc "$RC" '{start:$s,end:$e,exit_code:$rc}')" || true
  fi
fi

exit "$RC"
```

- [ ] **Step 3: Make executable + run tests**

```bash
chmod +x bin/kanban-deploy
bats tests/integration/deploy-wrapper.bats 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add bin/kanban-deploy tests/integration/deploy-wrapper.bats
git commit -m "feat(deploy): kanban-deploy wrapper for local/prod milestones"
```

---

## Task 11: `install.sh` and `uninstall.sh`

**Files:**
- Create: `install.sh`
- Create: `uninstall.sh`

- [ ] **Step 1: Write `install.sh`**

```bash
#!/usr/bin/env bash
# install.sh — copies commands + hook script into ~/.claude/, registers hooks in settings.json.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

# Pre-flight checks.
for cmd in jq curl git; do
  command -v "$cmd" >/dev/null || { echo "ERROR: $cmd not found. Install it first."; exit 1; }
done

CLAUDE_DIR="$HOME/.claude"
COMMANDS_DIR="$CLAUDE_DIR/commands"
HOOKS_DIR="$CLAUDE_DIR/hooks"
SETTINGS="$CLAUDE_DIR/settings.json"
LIB_LINK="$CLAUDE_DIR/notetaker-kanban"

mkdir -p "$COMMANDS_DIR" "$HOOKS_DIR"

# 1. Symlink the bridge dir under ~/.claude (so hooks find lib/ via $LIB_DIR).
[ -L "$LIB_LINK" ] || ln -s "$REPO_ROOT" "$LIB_LINK"

# 2. Copy slash commands.
cp -v "$REPO_ROOT/commands/"*.md "$COMMANDS_DIR/"

# 3. Copy hook script.
cp -v "$REPO_ROOT/hooks/notetaker-buffer.sh" "$HOOKS_DIR/"
chmod +x "$HOOKS_DIR/notetaker-buffer.sh"

# 4. Add bin/ to PATH via shell rc (idempotent — only appends if missing).
RC_FILE="$HOME/.zshrc"
[ -f "$RC_FILE" ] || RC_FILE="$HOME/.bashrc"
PATH_LINE='export PATH="$HOME/.claude/notetaker-kanban/bin:$PATH"'
grep -qF "$PATH_LINE" "$RC_FILE" 2>/dev/null || echo "$PATH_LINE" >> "$RC_FILE"

# 5. Patch ~/.claude/settings.json with hook entries.
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"

# Idempotent: jq merges entries marked with "_notetaker_kanban": true so we can find/remove them later.
TMP="$(mktemp)"
jq '
  .hooks //= {} |
  .hooks.UserPromptSubmit //= [] |
  .hooks.PostToolUse //= [] |
  .hooks.Stop //= [] |
  .hooks.UserPromptSubmit |=
    (map(select(._notetaker_kanban != true)) +
     [{ "_notetaker_kanban": true, "matcher": "*", "hooks": [{"type":"command","command":"~/.claude/hooks/notetaker-buffer.sh user_prompt"}] }]) |
  .hooks.PostToolUse |=
    (map(select(._notetaker_kanban != true)) +
     [
       { "_notetaker_kanban": true, "matcher": "Edit|Write|MultiEdit", "hooks": [{"type":"command","command":"~/.claude/hooks/notetaker-buffer.sh file_edit"}] },
       { "_notetaker_kanban": true, "matcher": "Bash",                  "hooks": [{"type":"command","command":"~/.claude/hooks/notetaker-buffer.sh bash_run"}] }
     ]) |
  .hooks.Stop |=
    (map(select(._notetaker_kanban != true)) +
     [{ "_notetaker_kanban": true, "matcher": "*", "hooks": [{"type":"command","command":"~/.claude/hooks/notetaker-buffer.sh session_stop"}] }])
' "$SETTINGS" > "$TMP" && mv "$TMP" "$SETTINGS"

echo
echo "✓ Installed."
echo "Now set in your shell rc (e.g. ~/.zshrc):"
echo "  export KANBAN_URL=http://localhost:3001"
echo "  export KANBAN_TOKEN=<from SmartKanban Settings → API tokens>"
echo
echo "Then in any git repo, run /kanban-start in a Claude session."
```

- [ ] **Step 2: Write `uninstall.sh`**

```bash
#!/usr/bin/env bash
# uninstall.sh — surgical removal: deletes our hook entries, slash commands, hook script, symlink, PATH line.
set -u
CLAUDE_DIR="$HOME/.claude"
SETTINGS="$CLAUDE_DIR/settings.json"

if [ -f "$SETTINGS" ]; then
  TMP="$(mktemp)"
  jq '
    .hooks.UserPromptSubmit //= [] | .hooks.PostToolUse //= [] | .hooks.Stop //= [] |
    .hooks.UserPromptSubmit |= map(select(._notetaker_kanban != true)) |
    .hooks.PostToolUse      |= map(select(._notetaker_kanban != true)) |
    .hooks.Stop             |= map(select(._notetaker_kanban != true))
  ' "$SETTINGS" > "$TMP" && mv "$TMP" "$SETTINGS"
fi

rm -f "$CLAUDE_DIR/commands/kanban-"*.md
rm -f "$CLAUDE_DIR/hooks/notetaker-buffer.sh"
rm -f "$CLAUDE_DIR/notetaker-kanban"   # symlink

# Remove PATH line from common shell rcs.
PATH_LINE='export PATH="$HOME/.claude/notetaker-kanban/bin:$PATH"'
for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
  [ -f "$rc" ] || continue
  grep -vF "$PATH_LINE" "$rc" > "$rc.tmp" && mv "$rc.tmp" "$rc"
done

echo "✓ Uninstalled. Per-repo .kanban/ directories are left in place — delete manually if desired."
```

- [ ] **Step 3: Make both executable**

```bash
chmod +x install.sh uninstall.sh
```

- [ ] **Step 4: Run install on a fresh `~/.claude` (or carefully on existing)**

If existing: back up first.

```bash
cp ~/.claude/settings.json ~/.claude/settings.json.bak.$(date +%s) 2>/dev/null || true
./install.sh
```

Expected output: success message, KANBAN_URL/TOKEN instructions.

Verify:
```bash
ls ~/.claude/commands/kanban-*.md
ls ~/.claude/hooks/notetaker-buffer.sh
ls ~/.claude/notetaker-kanban   # should be symlink → repo
jq '.hooks' ~/.claude/settings.json | head -40
```

- [ ] **Step 5: Test uninstall reversibility**

```bash
./uninstall.sh
ls ~/.claude/commands/kanban-*.md   # expected: no matches
jq '.hooks' ~/.claude/settings.json | grep _notetaker_kanban  # expected: none
```

Re-run install for development use:
```bash
./install.sh
```

- [ ] **Step 6: Commit**

```bash
git add install.sh uninstall.sh
git commit -m "feat: install + uninstall scripts"
```

---

## Task 12: README + end-to-end manual smoke

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write the full README**

```md
# notetaker-kanban

Generic Claude Code → SmartKanban bridge. Records your dev work into a kanban board automatically, across any project, without you thinking about it.

## What it does

- `/kanban-start` in any Claude session creates a card from your branch's git history (LLM-summarized) and links it to the branch.
- Hooks watch your edits/prompts/bash and buffer them locally.
- `/kanban-flush` (or end-of-session) summarizes the buffer and posts an activity entry to the card.
- `/kanban-deployed-local`, `/kanban-deployed-prod`, `/kanban-feedback` mark milestones.
- `kanban-deploy local|prod -- ./your-deploy.sh` wraps deploy scripts and tags the card on success/fail.
- A SmartMirror tile (`tile-active-work`) reads back the in-flight cards.

## Requirements

- macOS or Linux. Claude Code installed.
- `git`, `curl`, `jq`. (`brew install jq` on macOS.)
- A SmartKanban instance with the Phase 1 PR (project column + api tokens). See [the design spec][spec].

[spec]: https://github.com/chatwithllm/SmartMirror/blob/main/docs/superpowers/specs/2026-04-27-notetaker-kanban-design.md

## Install

```bash
git clone <this-repo> ~/WorkingFolder/notetaker-kanban
cd ~/WorkingFolder/notetaker-kanban
./install.sh
```

Add to your shell rc:
```bash
export KANBAN_URL=http://localhost:3001     # or wherever your SmartKanban runs
export KANBAN_TOKEN=<from SmartKanban Settings → API tokens>
```

## Usage

In any git repo, in a Claude Code session:

```
/kanban-start
```

That's it. From then on, the bridge tracks your work on this branch automatically.

Other commands:

| Command | What it does |
|---|---|
| `/kanban-doing` | Move card to In Progress |
| `/kanban-today` | Move card to Today |
| `/kanban-block <reason>` | Tag #blocked + comment |
| `/kanban-deployed-local` | Tag #deployed-local |
| `/kanban-deployed-prod` | Tag #deployed-prod, status=done |
| `/kanban-feedback <text>` | Append feedback to card |
| `/kanban-flush` | Drain buffer → activity entry |
| `/kanban-status` | Show current branch's card link, last flush, buffer size |
| `/kanban-list` | List your in-flight cards in this project |
| `/kanban-pull <id>` | Show full card detail in session |

Wrap deploy scripts:
```bash
kanban-deploy local -- ./scripts/deploy-local.sh
kanban-deploy prod  -- npm run deploy:prod
```

## Uninstall

```bash
./uninstall.sh
```

Per-repo `.kanban/` directories are left untouched.

## Architecture

See [the design spec][spec] for the full story.

## License

MIT.
```

- [ ] **Step 2: End-to-end manual smoke**

Pre-req: SmartKanban running, Phase 1 PR merged. Generate an api token via Settings.

```bash
export KANBAN_URL=http://localhost:3001
export KANBAN_TOKEN=<paste>

# Pick a real repo to test in.
cd ~/WorkingFolder/SmartMirror   # or any repo
git checkout -b notetaker-test
echo "// touch" >> README.md && git add README.md && git commit -m "test: notetaker bring-up"
```

In a Claude Code session opened from this repo, run:

- `/kanban-start` → confirm proposed card → expect "✓ Created card c_xxx".
- Make a real edit (e.g. fix a typo) → save → confirm hooks wrote to `.kanban/buffer.jsonl`.
- `/kanban-flush` → expect "session_summary" entry in card activity (check via SmartKanban web UI or `curl -H "authorization: Bearer $KANBAN_TOKEN" $KANBAN_URL/api/cards/c_xxx/activity`).
- `/kanban-doing` → status changes.
- `kanban-deploy local -- echo "fake deploy"` → tag added.
- `/kanban-feedback "test feedback"` → tag + comment.
- `/kanban-deployed-prod` → status=done.
- `/kanban-status` → matches.

Cleanup:
```bash
git checkout main
git branch -D notetaker-test
rm -rf .kanban   # if undesired
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README + usage + smoke test"
```

---

## Task 13: Open-source the repo (optional)

- [ ] **Step 1: Push to GitHub**

```bash
gh repo create chatwithllm/notetaker-kanban --public --source=. --remote=origin --push
```

- [ ] **Step 2: Announce in SmartMirror README** (optional cross-link).

---

## Self-review notes

- Status enum on server is snake_case (`in_progress`); commands consistently use that. Tags stay kebab.
- Bash sniffer for stray deploy commands (Section 5.7 / Phase 4 sniffer in spec) is **not** in this plan — moved to backlog. Wrapper-only is sufficient for v1; sniffer adds false-positive risk and zero new capability when wrapper is used.
- Background flush LLM call uses OpenRouter directly. If `OPENROUTER_API_KEY` unset, posts raw aggregates with `summary_failed=true` flag (the activity entry's body still contains useful stats).
- Atomic JSONL append: `printf '%s\n' "$line" >> file` is POSIX-atomic for line size < PIPE_BUF (~4KB). All buffer lines are well under that cap.
- `install.sh` marks every entry it adds with `"_notetaker_kanban": true` so `uninstall.sh` can find and remove only those entries, leaving user-customized hooks alone.
- Tests use a Python-based mock kanban server because reproducing Fastify's behavior in netcat is fiddly. Python is universally available on macOS/Linux. Mock returns canned `c_mock` for any POST, and logs all requests for assertion.
