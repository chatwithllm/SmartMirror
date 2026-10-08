#!/usr/bin/env bash
# Install / update the kiosk-local gesture service.
#
# Idempotent: safe to re-run. Creates a venv at /opt/mirror/gesture,
# copies the Python source from this repo, drops a systemd unit,
# generates MIRROR_GESTURE_TOKEN if missing, and starts the service.
#
# Run as root on the kiosk PC after the main installer (mirror user
# + /etc/mirror/config.env must already exist).
set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$REPO_ROOT/addons/mirror-gesture"
TARGET_DIR="/opt/mirror/gesture"
VENV_DIR="$TARGET_DIR/.venv"
ENV_FILE="/etc/mirror/config.env"
UNIT_SRC="$REPO_ROOT/installer/systemd/mirror-gesture.service"
UNIT_DST="/etc/systemd/system/mirror-gesture.service"

require_root() {
  if [[ $EUID -ne 0 ]]; then
    echo "must be run as root" >&2
    exit 1
  fi
}

ensure_user() {
  if ! id -u mirror >/dev/null 2>&1; then
    echo "mirror user not found — run installer/install.sh first" >&2
    exit 1
  fi
}

ensure_packages() {
  # v4l-utils for camera_pick.py's v4l2-ctl probe; python3-venv for venv.
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    python3 python3-venv python3-pip v4l-utils libgl1
}

ensure_token() {
  install -d -m 0750 -o root -g mirror /etc/mirror
  touch "$ENV_FILE"
  chmod 0640 "$ENV_FILE"
  chown root:mirror "$ENV_FILE"
  if ! grep -q '^MIRROR_GESTURE_TOKEN=' "$ENV_FILE"; then
    local tok
    tok="$(openssl rand -hex 32)"
    echo "MIRROR_GESTURE_TOKEN=$tok" >> "$ENV_FILE"
    echo "wrote MIRROR_GESTURE_TOKEN to $ENV_FILE"
  fi
}

# The frontend reads /etc/mirror/config.env into process.env at boot
# ($env/dynamic/private), so a token written while it is running does not
# exist as far as it is concerned: it answers every gesture POST with 403
# until it is restarted. Restart it whenever we install, so the running
# frontend and the running addon always share one token.
restart_frontend() {
  if systemctl cat mirror-frontend.service >/dev/null 2>&1; then
    systemctl restart mirror-frontend.service
    echo "restarted mirror-frontend.service to pick up $ENV_FILE"
  else
    echo "mirror-frontend.service not installed yet — nothing to restart"
  fi
}

sync_source() {
  install -d -m 0755 -o mirror -g mirror "$TARGET_DIR"
  # Copy src/ + pyproject.toml; not the deleted addon shell.
  rsync -a --delete \
    --exclude='__pycache__' \
    "$SRC_DIR/src/" "$TARGET_DIR/src/"
  install -m 0644 -o mirror -g mirror "$SRC_DIR/pyproject.toml" "$TARGET_DIR/pyproject.toml"
  chown -R mirror:mirror "$TARGET_DIR"
}

build_venv() {
  if [[ ! -d "$VENV_DIR" ]]; then
    sudo -u mirror python3 -m venv "$VENV_DIR"
  fi
  sudo -u mirror "$VENV_DIR/bin/pip" install --upgrade pip wheel
  sudo -u mirror "$VENV_DIR/bin/pip" install -e "$TARGET_DIR"
}

install_unit() {
  install -m 0644 "$UNIT_SRC" "$UNIT_DST"
  systemctl daemon-reload
  systemctl enable mirror-gesture.service
  systemctl restart mirror-gesture.service
}

main() {
  require_root
  ensure_user
  ensure_packages
  ensure_token
  sync_source
  build_venv
  install_unit
  restart_frontend
  systemctl --no-pager --full status mirror-gesture.service || true
  echo "done. tail logs with: journalctl -u mirror-gesture.service -f"
}

main "$@"
