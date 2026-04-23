# Start on a new machine

Self-contained quickstart. Follow steps 1–6. Paste the prompt at step 7.

Everything in this repo is already safe on GitHub. Your local `.env.agent` and working tree can be thrown away.

---

## 1. Install tools

### Ubuntu / Debian

```bash
sudo apt-get update
sudo apt-get install -y git curl build-essential

# Node 20 + pnpm
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pnpm

# GitHub CLI
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list
sudo apt-get update
sudo apt-get install -y gh
```

### macOS

```bash
# Homebrew required: https://brew.sh
brew install git node pnpm gh
```

### Claude Code

If not already installed:

```bash
# macOS
brew install --cask claude-code

# Linux / other — see https://claude.ai/code or install via npm:
npm install -g @anthropic-ai/claude-code
```

---

## 2. Clone repo

```bash
git clone https://github.com/chatwithllm/SmartMirror.git ~/SmartMirror
cd ~/SmartMirror
```

---

## 3. Auth GitHub

```bash
gh auth login
# answer: github.com → HTTPS → login with web browser → paste code shown
gh auth setup-git
gh auth status   # verify "Logged in" + scopes include repo, workflow
```

---

## 4. Create `.env.agent`

```bash
cat > .env.agent <<'EOF'
REPO_PATH=PLACEHOLDER
REPO_URL=https://github.com/chatwithllm/SmartMirror.git
DEFAULT_BRANCH=main

HA_URL=later
HA_TOKEN=later
MIRROR_SSH=later

NOTIFY_METHOD=gh-issue
NOTIFY_TARGET=@chatwithllm

ALLOW_PARALLEL=true
MAX_CI_RETRIES=2
MAX_TOKENS_SOFT_CAP=0.85
EOF

# fill in REPO_PATH with the actual path
sed -i.bak "s|REPO_PATH=PLACEHOLDER|REPO_PATH=$(pwd)|" .env.agent && rm .env.agent.bak
chmod 600 .env.agent
cat .env.agent    # verify
```

Fill in `HA_URL`, `HA_TOKEN`, `MIRROR_SSH` **later** — agent opens a `needs-human` issue when it needs them (starts at Phase 02 for HA, Phase 14 for mirror box).

---

## 5. Open Claude Code in that folder

```bash
cd ~/SmartMirror
claude
```

(Or however your installation starts it — `claude-code`, a shortcut, etc.)

---

## 6. Enable auto mode

Inside Claude Code session, type `/auto` (or use whatever your version calls continuous-execution mode). This lets the agent run without asking permission for routine actions.

---

## 7. Paste this prompt

Copy everything between the `====` lines, paste into Claude Code, send.

```
========================================================================
Continue the Smart Mirror autonomous build at this repo.

Read these 6 docs in order before doing anything:
  1. DESIGN_SPEC.md       — product, hardware, modes, themes
  2. FRONTEND_SPEC.md     — SvelteKit app, tiles, grid, themes
  3. BACKEND_SPEC.md      — Home Assistant, python_scripts, addon
  4. PHASES.md            — 14 phases with acceptance criteria
  5. AGENT_INSTRUCTIONS.md — workflow rules
  6. BUILD_PROMPT.md      — boot + resume protocol

Env in .env.agent (already written).

Run resume protocol from BUILD_PROMPT.md §4:
  * git fetch --all --prune
  * read .agent/state.json
  * inspect `gh pr list --state all` and open `needs-human` issues
  * determine the next work unit:
      - if a phase branch has an OPEN PR and CI green → merge it
      - if a phase branch has an OPEN PR and CI red  → fix then push
      - if blocked on a needs-human issue → check if ready label set
      - otherwise pick next queued phase per PHASES.md dependency graph

Current state as of the last session that handed off:
  * main has all 6 specs + 10 mockups + bootstrap (README, LICENSE,
    CI workflow, .gitignore, .editorconfig, CHANGELOG, .agent/state.json)
  * PR #1 is open for phase-00-kiosk; CI was running — check status
    first, merge if green, fix + push if red
  * Next phases in order: 01 (frontend skeleton) → 02 (HA wiring) → ...

Rules (from BUILD_PROMPT.md §12):
  * Merge commits only (never squash)
  * Phase branches kept alive forever (never delete)
  * Conventional Commits + Co-Authored-By: Claude <noreply@anthropic.com>
  * Update .agent/state.json after every meaningful step, commit it
  * Never force-push main
  * Never commit secrets
  * CI must be green before merge; max 2 retries then open needs-human
  * Phases 07–10 may run in parallel (independent bundles)
  * On token usage > 85%: checkpoint per BUILD_PROMPT.md §6 and exit

On completion (all 14 phases merged + smoke test passes):
  * Tag v1.0.0, push tag, create GitHub release
  * Open issue #release-v1.0.0 mentioning @chatwithllm
  * Set .agent/state.json.status = "complete", commit, push

Begin now. Confirm in one sentence, then execute.
========================================================================
```

---

## 8. When tokens run out (or you close the session)

Just open Claude Code in the same folder again, paste:

```
========================================================================
Continue the Smart Mirror build at this repo. Follow BUILD_PROMPT.md.
Resume from git state per §4. Checkpoint + exit cleanly if approaching
token budget per §6. Ping via gh-issue when v1.0.0 ships.
========================================================================
```

State lives in git + `.agent/state.json`. Agent figures out where it left off.

---

## 9. When agent opens a `needs-human` issue

Watch: https://github.com/chatwithllm/SmartMirror/issues?q=is%3Aissue+label%3Aneeds-human

When one appears:
1. Read the question.
2. Comment the answer (token, URL, decision).
3. Add label `ready`.

Next time agent runs, it reads the comment and unblocks.

---

## 10. Watch progress

```bash
# overview
cat .agent/state.json | python3 -c "import json,sys; d=json.load(sys.stdin); [print(f\"  {k}: {v['status']}\") for k,v in d['phases'].items()]"

# PRs
gh pr list --state all --limit 20

# latest CI run
gh run list --limit 5
```

Or visit https://github.com/chatwithllm/SmartMirror/pulls in the browser.

---

## 11. When hardware is ready (Mirror box)

When you have the Celeron mini PC + 43" TV + Ubuntu Desktop ready:

1. On the mirror box, add the SSH key of wherever the agent runs to `~/.ssh/authorized_keys` on the `mirror` user (or your admin user).
2. On the agent machine, update `.env.agent`:
   ```
   MIRROR_SSH=mirror@<ip-or-hostname>
   ```
3. Paste the short restart prompt (step 8). Agent picks up Phase 14 smoke test.

---

## 12. What each machine is doing

- **Dev machine** (your laptop / desktop): runs Claude Code + agent. Pushes commits. Needs git, node, pnpm, gh, Claude Code.
- **Home Assistant box**: runs HA itself. Agent never touches it directly — agent only writes `ha/` YAML files in the repo; you (or HA's git-sync addon) pull them into HA config. Agent will put instructions in PR bodies.
- **Mirror box** (Celeron + 43" TV): only needed at Phase 14+. The installer.sh runs here.

Agent can do phases 00–13 entirely on the dev machine. Phase 14 is the only one that touches the mirror box (via SSH).

---

## Done

Repo URL: https://github.com/chatwithllm/SmartMirror
Issues: https://github.com/chatwithllm/SmartMirror/issues
PRs: https://github.com/chatwithllm/SmartMirror/pulls
Actions: https://github.com/chatwithllm/SmartMirror/actions

Once this file is on your new machine (it's already in the repo after clone), you're all set.
