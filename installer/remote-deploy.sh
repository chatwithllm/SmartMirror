#!/usr/bin/env bash
# Deploy the currently-checked-out branch + gesture service to a
# kiosk PC over SSH.
#
# Run this from a machine that already has SSH access to the kiosk.
# It pulls from origin (not your local worktree), rebuilds the
# frontend on the kiosk, and runs install-gesture.sh.
#
#   bash installer/remote-deploy.sh <user>@<host>
#
# Idempotent — safe to re-run.
#
# Notes:
#   - The remote payload is uploaded as a file and executed under
#     `ssh -t`, so sudo on the kiosk gets a real TTY for its
#     password prompt.
#   - SSH connection multiplexing means you only enter the password
#     (or get prompted by your key agent) once.

set -euo pipefail

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  cat <<USAGE
usage: bash $0 <user>@<host>
example: bash $0 admin@192.168.20.106

Deploys the currently-checked-out branch's HEAD to the kiosk:
  1. git fetch + checkout + reset --hard on /opt/mirror
  2. pnpm install + build (as mirror user)
  3. restart mirror-frontend.service
  4. run installer/install-gesture.sh
  5. tail journalctl for 10 s

The user you ssh as must be sudo-capable on the kiosk. You'll be
prompted for the sudo password the first time.
USAGE
  exit 1
fi

REPO_ROOT="$(git -C "$(dirname -- "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$REPO_ROOT"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
COMMIT="$(git rev-parse --short HEAD)"

# Pre-flight: deploy pulls from origin, so local must match origin.
echo "==> local: verifying branch is in sync with origin"
git fetch origin "$BRANCH"
local_sha="$(git rev-parse HEAD)"
origin_sha="$(git rev-parse "origin/$BRANCH")"
if [[ "$local_sha" != "$origin_sha" ]]; then
  echo "ERROR: local $BRANCH ($local_sha) ≠ origin/$BRANCH ($origin_sha)"
  echo "push first:  git push origin $BRANCH"
  exit 1
fi

cat <<INFO

About to deploy:
  branch : $BRANCH
  commit : $COMMIT
  target : $TARGET
  repo   : /opt/mirror (existing kiosk checkout)
  steps  : checkout → pnpm build → restart frontend → install-gesture.sh

INFO
read -rp "proceed? [y/N] " ans
[[ "$ans" =~ ^[Yy]$ ]] || { echo "aborted"; exit 1; }

# SSH connection multiplexing: type the password once, reuse the
# socket for scp + ssh exec.
SSH_CTRL="$(mktemp -u "${TMPDIR:-/tmp}/mirror-ssh-ctrl.XXXXXX")"
SSH_OPTS=(
  -o "ControlMaster=auto"
  -o "ControlPath=$SSH_CTRL"
  -o "ControlPersist=10m"
)
cleanup() {
  ssh "${SSH_OPTS[@]}" -O exit "$TARGET" >/dev/null 2>&1 || true
  rm -f "$SSH_CTRL" "${LOCAL_PAYLOAD:-}"
}
trap cleanup EXIT

echo "==> ssh smoke test (you'll be prompted for the password once)"
ssh "${SSH_OPTS[@]}" "$TARGET" 'echo "remote: $(whoami)@$(hostname) ok"' || {
  echo "ssh failed; check connectivity and credentials"
  exit 1
}

# Build the remote payload locally. BRANCH is baked in via printf %q
# so we don't have to wrestle with heredoc-quoting rules.
LOCAL_PAYLOAD="$(mktemp "${TMPDIR:-/tmp}/mirror-deploy.XXXXXX.sh")"
{
  printf '#!/usr/bin/env bash\nset -euo pipefail\nBRANCH=%q\n\n' "$BRANCH"
  cat <<'REMOTE'
echo "[remote] hostname=$(hostname) user=$(whoami)"

echo "[remote] pre-checks"
id mirror >/dev/null 2>&1 || { echo "ERROR: mirror user not present"; exit 1; }
[[ -d /opt/mirror/.git ]] || { echo "ERROR: /opt/mirror is not a git checkout"; exit 1; }
ls -1 /dev/video* 2>/dev/null | head -3 \
  || echo "(no /dev/video* enumerated — webcam not plugged in? Continuing anyway.)"

echo "[remote] pull branch ${BRANCH}"
sudo -u mirror -H bash -lc "
  cd /opt/mirror
  if ! git diff-index --quiet HEAD --; then
    echo 'ERROR: local changes in /opt/mirror; aborting' >&2
    git status -s >&2
    exit 1
  fi
  git fetch origin '${BRANCH}'
  git checkout '${BRANCH}'
  git reset --hard 'origin/${BRANCH}'
  git --no-pager log -1 --oneline
"

echo "[remote] rebuild frontend"
sudo -u mirror -H bash -lc "
  cd /opt/mirror/frontend
  pnpm install --frozen-lockfile
  pnpm build
"

echo "[remote] restart mirror-frontend"
sudo systemctl restart mirror-frontend.service
for i in $(seq 1 30); do
  if curl -sfo /dev/null http://localhost:3000; then
    echo "[remote] frontend responding on :3000"
    break
  fi
  sleep 1
done
curl -sfo /dev/null http://localhost:3000 || {
  echo "ERROR: frontend not live after 30 s; inspect:"
  echo "  journalctl -u mirror-frontend -n 40"
  exit 1
}

echo "[remote] running install-gesture.sh"
sudo bash /opt/mirror/installer/install-gesture.sh

echo "[remote] tailing mirror-gesture for 10 s"
sudo timeout 10 journalctl -u mirror-gesture.service -f --no-pager || true

echo "[remote] final status"
systemctl is-active mirror-gesture.service \
  && echo "✓ mirror-gesture active" \
  || { echo "✗ mirror-gesture not active"; exit 1; }
systemctl is-active mirror-frontend.service \
  && echo "✓ mirror-frontend active" \
  || { echo "✗ mirror-frontend not active"; exit 1; }
REMOTE
} > "$LOCAL_PAYLOAD"

REMOTE_PAYLOAD="/tmp/mirror-deploy.$$.$(date +%s).sh"

echo "==> uploading deploy script to $TARGET:$REMOTE_PAYLOAD"
scp "${SSH_OPTS[@]}" -q "$LOCAL_PAYLOAD" "$TARGET:$REMOTE_PAYLOAD"

echo "==> driving remote deploy (sudo will prompt on the kiosk)"
ssh -t "${SSH_OPTS[@]}" "$TARGET" "bash '$REMOTE_PAYLOAD'; rm -f '$REMOTE_PAYLOAD'"

cat <<NEXT

==> deploy complete

Next: walk docs/gesture-smoke.md from step 3 onward.

  # SSE channel — leave running, gestures appear here
  ssh $TARGET 'curl -N http://localhost:3000/api/gesture/stream'

  # Service logs — watch while you wave at the camera
  ssh $TARGET 'journalctl -u mirror-gesture.service -f'

NEXT
