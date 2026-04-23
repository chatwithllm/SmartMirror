# Smart Mirror — Autonomous Agent Instructions

How to execute `PHASES.md` end-to-end without human intervention. Hand this (plus the 4 spec docs) to any capable agent runner.

---

## 1. Inputs the human must supply once, up front

| Variable | Example | Used for |
|----------|---------|----------|
| `REPO_PATH` | `/Users/assistant/WorkingFolder/SmartMirror` | Local working copy |
| `REPO_URL` | `git@github.com:<user>/smart-mirror.git` | Remote push target |
| `DEFAULT_BRANCH` | `main` | Target for PR merges |
| `GH_TOKEN` | GitHub PAT with `repo` + `workflow` scopes | PR create/merge/CI |
| `HA_URL` | `https://ha.local:8123` | Later phases (03+) to test WS |
| `HA_TOKEN` | long-lived token | Same |
| `MIRROR_SSH` | `mirror@10.0.0.50` | Deploy + kiosk reload (phase 14) |
| `NOTIFY_METHOD` | `gh-issue` \| `slack-webhook` \| `email` \| `signal-cli` | Final ping target |
| `NOTIFY_TARGET` | e.g. `@chatwithllm`, slack webhook URL, email addr | Same |
| `ALLOW_PARALLEL` | `true` \| `false` | Phases 07–10 run concurrently if true |

Store these in `.env.agent` at repo root (gitignored) OR pass as agent runtime env.

---

## 2. Bootstrap

```bash
cd "$REPO_PATH"
git init .                      # if not already
git remote add origin "$REPO_URL" 2>/dev/null || true
git branch -M main
git add .                       # bring in existing spec/mockup files
git commit -m "chore: bootstrap smart-mirror repo with specs + mockups"
git push -u origin main
```

Create a GitHub project board `Smart Mirror v1.0.0` with 14 phase cards (or use Milestones). Each phase opens an issue on start and closes it on merge.

---

## 3. Main loop

For phase N in 0..14:
```
1. Open tracking issue #phase-N.
2. Checkout a new branch off latest main.
3. Implement per PHASES.md §Phase NN.
4. Write/update tests.
5. Run local checks:
     pnpm check
     pnpm test
     pnpm test:e2e -- --project=smoke
     yamllint ha/
     shellcheck installer/**/*.sh
6. Commit with conventional commits.
7. Push branch.
8. Open PR referencing the spec sections touched.
9. Wait for CI. On red: fix, push again. Max 2 retries.
10. If still failing → open `needs-human` issue with full context → skip to next independent phase.
11. On green: merge PR (merge commit, NOT squash).
12. Branch KEPT — do NOT delete.
13. Close phase issue.
14. Update CHANGELOG.md with phase summary.
```

### Parallel execution (if `ALLOW_PARALLEL=true`)

Phases 07, 08, 09, 10 are independent. Run up to 4 sub-agents concurrently against branches:
- `phase-07-inventory`
- `phase-08-work-focus`
- `phase-09-security-night`
- `phase-10-morning-ambience`

Merge order to main after all four green: 07 → 08 → 09 → 10 (linear to keep history readable).

---

## 4. Branch preservation

**Critical constraint:** never delete any phase branch until phase 14 merged AND smoke test passes.

```bash
# enforced by pre-delete hook:
.git/hooks/pre-push:
  if [[ "$2" == *":refs/heads/phase-"* ]] && [[ "$(cat)" == "0000000000000000000000000000000000000000 "* ]]; then
    echo "refusing to delete phase branch" >&2
    exit 1
  fi
```

Also add branch protection on remote for pattern `phase-*` — block deletion.

On GitHub:
```bash
gh api -X PUT repos/<user>/smart-mirror/branches/phase-00-kiosk/protection \
  -f required_status_checks=null \
  -f enforce_admins=false \
  -f restrictions=null \
  -f required_pull_request_reviews=null \
  -F allow_deletions=false
```
Or use the repo Rules UI once, globbed to `phase-*`.

---

## 5. Commit + PR hygiene

### Conventional Commits
- `feat(frontend): PlexPlayerTile with hls.js`
- `fix(ha): python_script revision bump off-by-one`
- `chore(installer): whiptail wizard skeleton`
- `docs: update FRONTEND_SPEC §9 with router map`
- `test(diff): cover swap case`

### Co-author trailer
Every commit:
```
Co-Authored-By: Claude <noreply@anthropic.com>
```

### Never
- `--no-verify` to skip hooks
- `git push --force` on shared branches (main, phase-*)
- Commit `.env`, tokens, keys, or anything in `/etc/mirror/`
- Force-merge without CI
- Amend and force-push a PR commit that already has review comments

---

## 6. Test gates

Every PR must pass:
- `pnpm check` (svelte-check + tsc)
- `pnpm test` (vitest)
- `pnpm test:e2e` at least the `smoke` project
- `yamllint ha/` (zero warnings)
- `shellcheck installer/**/*.sh`
- `markdownlint docs/ README.md`
- `gitleaks detect` (no secrets)

CI enforces via `.github/workflows/ci.yml`. Agent does not bypass.

---

## 7. Dependency declarations

Agent is allowed to add new dependencies only when a phase explicitly needs them. Must justify in PR body. Prefer:
- Native Web APIs before libraries
- Svelte ecosystem packages over React-ports
- Libraries with <50 KB gzipped footprint
- Actively maintained (last release <12 months)

Add to `package.json` with exact pinned versions, not ranges.

---

## 8. Final ping — notification channels

When phase 14 merges AND the smoke test passes:

### `gh-issue` method (default)
Create issue `#release-v1.0.0`, mention `$NOTIFY_TARGET`:

```markdown
# ✅ Smart Mirror v1.0.0 — build complete

All 14 phases merged. All branches preserved.

| Phase | Branch | PR | Merged |
|-------|--------|----|--------|
| 00 | phase-00-kiosk | #1 | ✅ |
| 01 | phase-01-frontend-skeleton | #2 | ✅ |
| ... | ... | ... | ... |

## Smoke test
- FPS: 52 (budget ≥45) ✅
- Heap: 138 MB (budget <180) ✅
- DOM nodes: 2104 (budget <3000) ✅
- WS reconnect: works ✅
- Plex HW decode: confirmed via chrome://media-internals ✅

## Known follow-ups
<auto-populated from CHANGELOG.md "Known Issues">

## Next
- Human review of UX flow
- Physical deploy to mirror box
- First week of telemetry monitoring

cc @$NOTIFY_TARGET
```

### `slack-webhook`
POST JSON to `$NOTIFY_TARGET` URL:
```json
{
  "text": "✅ Smart Mirror v1.0.0 build complete",
  "blocks": [{
    "type": "section",
    "text": { "type": "mrkdwn", "text": "All 14 phases merged. Release: <$REPO_URL/releases/tag/v1.0.0>" }
  }]
}
```

### `email`
SMTP via `msmtp` or similar; subject `[smart-mirror] v1.0.0 build complete`.

### `signal-cli`
`signal-cli -u <sender> send -m "<summary>" $NOTIFY_TARGET`

---

## 9. Stuck / needs-human protocol

Agent encounters:
- Ambiguous spec
- Tool or library choice not listed in specs
- Flaky test not reproducible after 2 retries
- Permissions or secrets missing
- Third-party service down

→ Open issue `needs-human/<short-desc>` with:
```
## Context
<what phase, what branch, what step>

## What I tried
1. ...
2. ...

## Error output
```
<paste>
```

## Decision blocking me
<plain question>

## Workaround
<continuing with phases that don't depend on this>
```

Then **move on to next independent phase**. Revisit blocked phase when human closes the issue with an answer.

---

## 10. Resuming after a restart

Agent can be restarted at any point. On resume:
```bash
cd "$REPO_PATH"
git fetch --all --prune
# inspect: which phase branches exist? which merged to main?
gh pr list --state merged --limit 50
gh branch list --all
# pick up at first phase in PHASES.md that is not yet merged into main
```

State is entirely in git + GitHub. No hidden state files.

---

## 11. Off-limits

Agent must NEVER:
- Touch anything outside `$REPO_PATH` or `$MIRROR_SSH`
- Ssh-key-add / modify ssh config
- Open ports on HA or mirror box
- Disable HA's SSL or trust-all-certs
- Install system packages without whiptail install.sh running
- Post to public endpoints (Imgur, Pastebin, etc.) — kiosk is LAN only
- Add analytics, telemetry to third parties
- Use `.claude_cache` or similar — all state must be in git

---

## 12. Handoff — when human must step in

| Event | Agent action | Human must |
|-------|-------------|-----------|
| Spec ambiguity | Open `needs-human` issue | Answer in comment, label `ready` |
| Secret needed (token, cert) | Open issue, DO NOT proceed | Add secret to repo / `.env`, comment `ready` |
| Physical hardware (webcam pick, TV mount) | Best-effort with placeholder, flag in CHANGELOG | Buy + install + confirm |
| CI provider outage | Wait + retry (up to 1h), then fail phase | Re-run CI, agent resumes |
| Sustained low test coverage | Block phase, open issue | Decide relax budget or add test time |

---

## 13. First message the human sends to start the agent

Template:

```
You are executing the Smart Mirror autonomous build.

Read in order:
1. DESIGN_SPEC.md
2. FRONTEND_SPEC.md
3. BACKEND_SPEC.md
4. PHASES.md
5. AGENT_INSTRUCTIONS.md

Env vars in .env.agent:
  REPO_PATH=$REPO_PATH
  REPO_URL=$REPO_URL
  DEFAULT_BRANCH=main
  GH_TOKEN=$GH_TOKEN
  HA_URL=$HA_URL
  HA_TOKEN=$HA_TOKEN
  MIRROR_SSH=$MIRROR_SSH
  NOTIFY_METHOD=gh-issue
  NOTIFY_TARGET=@chatwithllm
  ALLOW_PARALLEL=true

Start at Phase 00. Work through all 14 phases per PHASES.md.
Keep every phase branch alive. Do not squash. Do not force-push main.
Ping via gh-issue when phase 14 merges + smoke test passes.
Resume from wherever git indicates if restarted.
```

That single message plus the 5 spec docs = everything needed.

---

## 14. Estimated wall-clock time

- Agent running 24/7 with no human blocks, no CI flakes: **~5–7 days** (≈160h agent time against ~160h total spec phases).
- Realistic with answers for `needs-human` issues: **~10–14 days**.
- Physical phases (webcam mount, install on real mirror box) add 1–2 days of human-in-the-loop.

## 15. When v1.0.0 ships

Final state of the repo:
- `main` branch green, tagged v1.0.0
- 14 `phase-*` branches preserved
- GitHub release with CHANGELOG
- `#release-v1.0.0` issue with smoke test results
- Running mirror: kiosk boots, HA drives layouts, all 10 modes + 4 themes functional, optional gesture subsystem
