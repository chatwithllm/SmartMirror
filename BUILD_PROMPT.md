# Smart Mirror — Autonomous Build Prompt

Copy-paste this file (or its § 1 block) to any fresh agent instance. The agent reads this, resumes from git state, completes remaining work, pings on done.

---

## 1. The prompt (hand this verbatim to a fresh agent)

```
You are the autonomous build agent for the Smart Mirror project.

Read these docs in order before doing anything:
  1. DESIGN_SPEC.md     — product, hardware, modes, themes
  2. FRONTEND_SPEC.md   — SvelteKit app, tiles, grid, themes, gesture client
  3. BACKEND_SPEC.md    — HA entities, python_scripts, automations, addon
  4. PHASES.md          — 14 phases with acceptance criteria
  5. AGENT_INSTRUCTIONS.md — workflow rules, branch preservation
  6. BUILD_PROMPT.md    — (this file) resume protocol + rules

Then:
  A. Load .env.agent (see § 2 below). If missing, print what's needed and stop.
  B. Run the resume protocol (§ 4 below): inspect git state, read .agent/state.json,
     determine which phase to work on next, and what's left in that phase.
  C. Execute the main loop (§ 5 below) until all 14 phases merge + smoke test
     passes OR token budget is about to run out (§ 6).
  D. On completion, send the release ping via NOTIFY_METHOD / NOTIFY_TARGET.
  E. On token-budget pressure, checkpoint cleanly per § 6 and exit.

Never delete phase-* branches. Never force-push main. Never squash merge.
Every commit: Conventional Commits + Claude co-author trailer.
Never commit secrets. All constraints in AGENT_INSTRUCTIONS.md § 11 apply.
```

---

## 2. Required env (store in `.env.agent`, gitignored)

```bash
# Repo
REPO_PATH=/absolute/path/to/smart-mirror
REPO_URL=git@github.com:<user>/smart-mirror.git
DEFAULT_BRANCH=main
GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxx

# Home Assistant (phases 02+)
HA_URL=https://ha.local:8123
HA_TOKEN=eyJ0eXAiOi...

# Mirror box (phases 14+)
MIRROR_SSH=mirror@10.0.0.50           # or "later" if not yet provisioned

# Notification on build complete
NOTIFY_METHOD=gh-issue                # gh-issue | slack-webhook | email | signal-cli
NOTIFY_TARGET=@chatwithllm            # handle, webhook url, email, etc.

# Behavior
ALLOW_PARALLEL=true                   # phases 07–10 can run concurrently
MAX_CI_RETRIES=2                      # then open needs-human issue + skip
MAX_TOKENS_SOFT_CAP=0.85              # checkpoint if > 85% budget used
```

---

## 3. Repo state map

| Path | Tracked? | Purpose |
|------|----------|---------|
| `.env.agent` | ❌ gitignored | Secrets + config for the agent |
| `.agent/state.json` | ✅ tracked | Machine-readable progress ledger |
| `.agent/notes/<phase-NN>.md` | ✅ tracked | Per-phase human-readable log |
| `DESIGN_SPEC.md` / `FRONTEND_SPEC.md` / `BACKEND_SPEC.md` | ✅ | Source of truth for what to build |
| `PHASES.md` | ✅ | Acceptance criteria per phase |
| `AGENT_INSTRUCTIONS.md` | ✅ | Workflow rules |
| `BUILD_PROMPT.md` | ✅ | This file |
| `mockups/` | ✅ | Visual reference — port DOM to layout JSON |
| `frontend/` | ✅ | SvelteKit app (phase 01+) |
| `ha/` | ✅ | HA config (phase 02+) |
| `installer/` | ✅ | Shell scripts + systemd units (phase 00+) |
| `addons/mirror-gesture/` | ✅ | HA addon (phase 13) |
| `CHANGELOG.md` | ✅ | Running log of merged phases |
| `.github/workflows/ci.yml` | ✅ | CI gate for every PR |
| phase branches `phase-00-*` … `phase-14-*` | ✅ remote | Preserved forever |

Git history + `.agent/state.json` are the only sources of build state. Nothing else.

---

## 4. Resume protocol (run on every boot)

Order of operations **every time the agent starts**:

```bash
cd "$REPO_PATH"
source .env.agent

# 1. Sync remote
git fetch --all --prune
git checkout "$DEFAULT_BRANCH"
git pull --ff-only origin "$DEFAULT_BRANCH"

# 2. Read ledger
STATE=$(cat .agent/state.json 2>/dev/null || echo '{}')

# 3. Enumerate phase status via GitHub
gh pr list --state merged --limit 50 --json number,title,headRefName
gh pr list --state open   --limit 50 --json number,title,headRefName,isDraft,mergeable,statusCheckRollup
gh issue list --label needs-human --state open --json number,title
```

### Decision tree on boot

```
IF any PR has CI failing and retry_count < MAX_CI_RETRIES:
    → Resume that branch, fix failures, push.
ELIF any PR open and mergeable and CI green:
    → Merge it (merge commit). Proceed.
ELIF state.json.blocked_on is set:
    → Verify the blocking needs-human issue is still open. If closed
      with resolution, resume that phase. Else skip to next independent.
ELIF state.json.current_phase < 14 and its branch has uncommitted WIP
     (see § 7 recovery):
    → Restore the WIP commit, re-run tests, continue.
ELSE:
    → Pick the next phase from PHASES.md that has no merged PR.
      Respect phase dependency graph (PHASES.md § "Phase dependencies").
      If ALLOW_PARALLEL=true and multiple independent phases queued,
      open N branches and interleave work.
```

### `.agent/state.json` — shape

```json
{
  "schema": 1,
  "updated_at": "2026-04-22T23:42:00Z",
  "phases": {
    "00": { "status": "merged", "pr": 1, "branch": "phase-00-kiosk" },
    "01": { "status": "merged", "pr": 2, "branch": "phase-01-frontend-skeleton" },
    "02": { "status": "merged", "pr": 3, "branch": "phase-02-ha-wiring" },
    "03": { "status": "merged", "pr": 4, "branch": "phase-03-control-loop" },
    "04": { "status": "merged", "pr": 5, "branch": "phase-04-core-tiles" },
    "05": {
      "status": "in_progress",
      "pr": 6,
      "branch": "phase-05-plex-tile",
      "last_commit": "a4f2c1b",
      "acceptance": {
        "done":   ["hls.js integration", "bitrate from res caps"],
        "pending":["hw decode verify doc", "layout.relax-minimal updated"],
        "blocked":[]
      },
      "notes": "plex test URL missing; using fixture until human provides"
    },
    "06": { "status": "queued" },
    "07": { "status": "queued" },
    "08": { "status": "queued" },
    "09": { "status": "queued" },
    "10": { "status": "queued" },
    "11": { "status": "queued" },
    "12": { "status": "queued" },
    "13": { "status": "queued" },
    "14": { "status": "queued" }
  },
  "blocked_on": null,
  "token_budget": {
    "soft_cap": 0.85,
    "current_used_est": 0.31
  },
  "last_heartbeat": "2026-04-22T23:42:00Z"
}
```

Update this file **at the end of every meaningful step** — new commit, test-pass, test-fail, blocked, resumed. Commit it with `chore(agent): state update after <step>`.

---

## 5. Main loop (once resume is complete)

```
LOOP until phases["14"].status == "merged" AND smoke_test == "passed":

    phase_id = first phase in PHASES.md whose status != "merged"
               AND whose dependencies are all "merged"

    IF phases[phase_id].status == "queued":
        1. Open tracking issue: "Phase NN — <title>"
        2. git checkout "$DEFAULT_BRANCH" && git pull --ff-only
        3. git checkout -b "phase-NN-<slug>"
        4. phases[phase_id].status = "in_progress"
        5. Commit state.json update, push branch

    Execute incremental steps for that phase:
        - Pick next "pending" acceptance item
        - Implement narrowly
        - Write test(s)
        - Run local gates (pnpm check, pnpm test, yamllint, shellcheck)
        - On pass: commit + push + move item to "done"
        - On fail: retry once with fix; if still fails, escalate per § 8
        - Checkpoint state.json every commit

    When all acceptance "done" and none "pending":
        1. Open PR (if not already) with template from PHASES.md
        2. Wait on CI
        3. On green: merge (merge commit), close issue, mark phases[phase_id].status = "merged"
        4. Append CHANGELOG.md entry
        5. Commit state.json and push to main
        6. Branch STAYS (do not delete)

    Periodically (every 10 commits OR 30 min wall-clock):
        - Check token budget usage. If > MAX_TOKENS_SOFT_CAP: checkpoint (§ 6) and exit.

END LOOP

After loop exits with all 14 merged:
    1. Run tests/e2e-smoke.sh
    2. Tag release: git tag v1.0.0 && git push origin v1.0.0
    3. Create release-v1.0.0 issue with results
    4. Send notification via NOTIFY_METHOD (§ AGENT_INSTRUCTIONS.md § 8)
    5. Final state.json: { "status": "complete" }
```

---

## 6. Token-budget checkpoint (soft stop)

Agent monitors its own context/token consumption. When estimated usage > `MAX_TOKENS_SOFT_CAP` (default 0.85):

```
1. Stop picking up new work — finish only the in-flight edit.
2. Run `pnpm check` + `pnpm test` on current branch.
3. Commit everything staged + unstaged with:
     git commit -m "wip(phase-NN): checkpoint at <timestamp>

     Acceptance done: <bullet list>
     Acceptance pending: <bullet list>
     Next step: <one line>

     Co-Authored-By: Claude <noreply@anthropic.com>"
4. Push the branch (never force).
5. Update .agent/state.json with latest acceptance + notes + last_commit.
6. Commit state.json to main: `chore(agent): checkpoint before token exhaustion`.
7. Push main.
8. Print final status summary to stdout:
     "Checkpointed at phase NN. Next instance: run this prompt again;
      resume protocol will pick up from branch phase-NN-<slug> commit <sha>."
9. Exit cleanly.
```

The WIP commit is *intentional* and gitignored-safe. On next boot, resume protocol detects it as "in_progress with unmerged WIP" and continues from that SHA.

**Hard budget overrun (no graceful window):** next agent still recovers — git has the work (up to last push), `state.json` has the last heartbeat. Worst case a few minutes of unpushed edits are lost; the phase isn't.

---

## 7. WIP recovery on resume

If a phase branch has a `wip(phase-NN):` tip commit when the agent boots:

```
1. git checkout phase-NN-<slug>
2. Read the commit body for "Acceptance pending" and "Next step".
3. Re-run local gates. Note which fail.
4. Continue work.
5. When the phase finishes, the trailing wip commit is KEPT in history
   (do NOT squash/rebase to remove it — history transparency > tidiness).
6. The merge commit into main absorbs the full history (merge commit, not squash).
```

Example log after phase 05 finishes:
```
*   Merge pull request #6 from phase-05-plex-tile
|\
| * feat(frontend): PlexPlayerTile hw decode verify doc
| * test(plex): decode error fallback to static poster
| * wip(phase-05): checkpoint at 2026-04-22T23:42    <-- checkpoint kept
| * feat(frontend): bitrate from RES_CAPS
| * feat(frontend): PlexPlayerTile with hls.js
|/
```

---

## 8. Error escalation ladder

```
Step          What agent does
────────────────────────────────────────────────────────────────
1. Test fail  Read failure, apply targeted fix, re-run once.
2. Retry 2   Full revert of suspicious diff, re-approach.
3. Give up   Open `needs-human` issue. Commit WIP with body:
              "Blocked on: <one-line question>". Set
              phases[NN].blocked_on = issue_number. SKIP to next
              independent phase if ALLOW_PARALLEL else checkpoint.
4. Human     Labels issue `ready` with a comment that contains
              the unblock info (token, decision, permission).
5. Resume    Agent resume protocol detects "ready" label, reads
              the unblock comment, pops the block, continues.
```

---

## 9. Concurrency rules (when ALLOW_PARALLEL=true)

- Max 4 phase branches in flight simultaneously.
- Only **independent** phases per PHASES.md § "Phase dependencies": {07, 08, 09, 10} is the only legal parallel set.
- Each parallel sub-agent has its own `.agent/state.json` entry; root state.json is updated atomically (single writer — main agent) based on reports.
- Merge order into main for parallel batch: numeric ascending. If 08 finishes before 07, 08 waits for 07 to land first.

---

## 10. Smoke test (final gate before notification)

`tests/e2e-smoke.sh` lives in phase 14 deliverables. Runs:

```
1. Boot a throwaway VM (or the real mirror box if reachable).
2. Run installer/install.sh --non-interactive against fixture config.
3. Verify curl http://<box>:3000 returns 200 and <title> contains "Mirror".
4. curl HA: `input_select.select_option input_select.mirror_preset option=relax-minimal`
5. Poll sensor.mirror_layout_revision — expect bump within 10s.
6. Assert frontend reports FPS >= 45 via /metrics endpoint.
7. Assert heap < 180MB and DOM nodes < 3000.
8. Kill network briefly — frontend survives without restart.
```

Pass = all assertions green. Fail = open issue, DO NOT ping yet. Keep iterating phase 14 until it passes.

---

## 11. Notification payload template (when done)

(Re-stated concise; full in AGENT_INSTRUCTIONS.md § 8.)

```
✅ Smart Mirror v1.0.0 build complete

14/14 phases merged. All branches preserved.
Release: <REPO_URL>/releases/tag/v1.0.0

Smoke test:
  FPS              52  (budget ≥45)  ✅
  Heap             138 MB (<180)    ✅
  DOM nodes        2104 (<3000)     ✅
  WS reconnect     ok               ✅
  Plex HW decode   verified         ✅

Known follow-ups:
  - <from CHANGELOG.md "Known Issues">

Ping: $NOTIFY_TARGET
```

---

## 12. Do / don't (compressed)

**Do:**
- Read all 5 spec files on every boot (context rebuild).
- Commit small + often; every green test.
- Keep phase branches alive forever.
- Use conventional commits + Claude co-author trailer.
- Update `.agent/state.json` after every non-trivial step.
- Merge-commit PRs; never squash.
- Respect the CI gate.

**Don't:**
- Force-push main.
- Delete phase branches.
- Disable tests or hooks.
- Commit secrets, tokens, `.env`.
- Trust yourself — always cross-check with specs.
- Skip the smoke test.
- Send the release ping before v1.0.0 tag + smoke pass.

---

## 13. Quick cold-boot checklist

Paste into terminal to verify agent is primed:

```bash
set -euo pipefail
cd "${REPO_PATH:?export REPO_PATH}"
test -f .env.agent || { echo "missing .env.agent"; exit 1; }
set -a; . .env.agent; set +a
git remote get-url origin > /dev/null || { echo "no origin remote"; exit 1; }
git fetch --all --prune
gh auth status 2>&1 | grep -q "Logged in"
test -f DESIGN_SPEC.md FRONTEND_SPEC.md BACKEND_SPEC.md PHASES.md AGENT_INSTRUCTIONS.md
echo "ok — read BUILD_PROMPT.md § 1 and begin"
```

---

## 14. When the human (re)starts the agent

Minimal message, any time:

> Continue the Smart Mirror autonomous build. Follow `BUILD_PROMPT.md`. Resume from current git state per § 4. Checkpoint + exit cleanly if you approach token budget per § 6. Ping via the configured channel when v1.0.0 ships.

That's it. Resume is automatic. State is git.

---

## 15. When you (the human) want status, no wait

```bash
cat .agent/state.json | jq '.phases | to_entries | map({phase:.key, status:.value.status})'
gh pr list --state all --limit 20
cat CHANGELOG.md | head -40
```

Three commands = full picture.
