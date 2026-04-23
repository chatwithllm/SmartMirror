#!/usr/bin/env bash
# Smart Mirror one-shot bootstrap.
#
# Run on a fresh Ubuntu Desktop box as an admin (sudo) user:
#
#   curl -fsSL https://raw.githubusercontent.com/chatwithllm/SmartMirror/main/installer/bootstrap.sh \
#     | sudo bash -s -- --orientation portrait-cw --ha-url http://ha.local:8123 --ha-token TOKEN
#
# Clones the repo into /opt/mirror and runs the hardened installer.
# All flags forward to installer/install.sh. See --help there.

set -euo pipefail

REPO_URL="${MIRROR_REPO_URL:-https://github.com/chatwithllm/SmartMirror.git}"
REF="${MIRROR_REF:-main}"          # or a tag like v1.0.1
TARGET="${MIRROR_PREFIX:-/opt/mirror}"

if [[ "$EUID" -ne 0 ]]; then
  echo "bootstrap: must run as root (use sudo)" >&2
  exit 1
fi

echo "[bootstrap] apt prereqs"
apt-get update -qq
apt-get install -y --no-install-recommends git ca-certificates curl

if [[ -d "$TARGET/.git" ]]; then
  echo "[bootstrap] refreshing $TARGET"
  git -C "$TARGET" fetch --all --tags --prune
  git -C "$TARGET" checkout "$REF"
  git -C "$TARGET" pull --ff-only || true
else
  echo "[bootstrap] cloning $REPO_URL → $TARGET (ref: $REF)"
  mkdir -p "$(dirname "$TARGET")"
  git clone --branch "$REF" "$REPO_URL" "$TARGET"
fi

echo "[bootstrap] running installer"
exec bash "$TARGET/installer/install.sh" "$@"
