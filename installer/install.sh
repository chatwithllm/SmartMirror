#!/usr/bin/env bash
# Smart Mirror installer — Phase 00 skeleton.
# Full wizard lands in Phase 14. This stub:
#   * prompts orientation + HA URL (whiptail)
#   * creates the `mirror` user + GDM autologin
#   * writes /etc/mirror/config.env
#   * installs monitors.xml rotation per orientation
#   * drops systemd units (kiosk only; frontend unit lands in phase 01)
#   * supports --dry-run to print every intended change without touching state

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ---------- flags ----------
DRY_RUN=0
NONINTERACTIVE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --non-interactive) NONINTERACTIVE=1; shift ;;
    -h|--help)
      cat <<EOF
Usage: $0 [--dry-run] [--non-interactive]

  --dry-run           Print intended changes; do not modify system.
  --non-interactive   Use defaults for all prompts (CI / smoke tests).
EOF
      exit 0
      ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

# ---------- helpers ----------
log()  { printf '\033[36m[mirror-install]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[mirror-install] warn:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31m[mirror-install] fatal:\033[0m %s\n' "$*" >&2; exit 1; }

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '\033[90m  would run:\033[0m %s\n' "$*"
  else
    "$@"
  fi
}

write_file() {
  local path="$1"; shift
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '\033[90m  would write:\033[0m %s (%d bytes)\n' "$path" "${#1}"
  else
    install -d -m 0755 "$(dirname "$path")"
    printf '%s' "$1" > "$path"
    log "wrote $path"
  fi
}

# ---------- preflight ----------
preflight() {
  log "preflight"
  [[ "$(uname -s)" == "Linux" ]] || warn "not Linux — dry-run recommended"
  if [[ "$DRY_RUN" -eq 0 && "$EUID" -ne 0 ]]; then
    die "must run as root (or use --dry-run). try: sudo $0"
  fi
  command -v whiptail >/dev/null 2>&1 || {
    if [[ "$NONINTERACTIVE" -eq 0 && "$DRY_RUN" -eq 0 ]]; then
      die "whiptail missing. install with: apt-get install whiptail"
    fi
  }
}

# ---------- prompts ----------
prompt_orientation() {
  if [[ "$NONINTERACTIVE" -eq 1 ]]; then
    echo "portrait-cw"; return
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "portrait-cw"; return
  fi
  whiptail --title "Mirror · orientation" --menu \
    "Choose display orientation." 14 60 4 \
    "portrait-cw"  "Portrait · rotate 90° clockwise (default)" \
    "portrait-ccw" "Portrait · rotate 90° counter-clockwise" \
    "landscape"    "Landscape · no rotation" \
    3>&1 1>&2 2>&3
}

prompt_ha_url() {
  if [[ "$NONINTERACTIVE" -eq 1 ]]; then
    echo "https://ha.local:8123"; return
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "https://ha.local:8123"; return
  fi
  whiptail --title "Mirror · Home Assistant" --inputbox \
    "Home Assistant URL (include https:// and port):" \
    10 70 "https://ha.local:8123" \
    3>&1 1>&2 2>&3
}

prompt_ha_token() {
  if [[ "$NONINTERACTIVE" -eq 1 || "$DRY_RUN" -eq 1 ]]; then
    echo "placeholder-token"; return
  fi
  whiptail --title "Mirror · HA token" --passwordbox \
    "Paste a long-lived access token (Profile → Security → Long-lived access tokens):" \
    10 70 3>&1 1>&2 2>&3
}

# ---------- core steps ----------
create_mirror_user() {
  log "create mirror user"
  if id mirror >/dev/null 2>&1; then
    log "user 'mirror' already exists"
  else
    run useradd -m -s /bin/bash -c "Smart Mirror Kiosk" mirror
    run usermod -aG video,audio,input mirror
  fi
}

enable_autologin() {
  log "enable GDM autologin for mirror user"
  local tmpl="$SCRIPT_DIR/gdm/custom.conf.tmpl"
  [[ -f "$tmpl" ]] || die "missing template: $tmpl"
  local content
  content="$(cat "$tmpl")"
  write_file /etc/gdm3/custom.conf "$content"
}

install_monitors_xml() {
  local orient="$1"
  local tmpl="$SCRIPT_DIR/monitors/${orient}.xml.tmpl"
  [[ -f "$tmpl" ]] || die "missing template: $tmpl"
  log "install monitors.xml for $orient"
  run install -d -m 0755 /home/mirror/.config
  local content
  content="$(cat "$tmpl")"
  write_file /home/mirror/.config/monitors.xml "$content"
  run chown -R mirror:mirror /home/mirror/.config
}

write_config_env() {
  local orient="$1" ha_url="$2" ha_token="$3"
  log "write /etc/mirror/config.env"
  local content
  content=$(cat <<EOF
# Smart Mirror runtime configuration — managed by installer
# Edit cautiously; re-run installer to regenerate.
HA_URL=$ha_url
HA_TOKEN=$ha_token
MIRROR_USER=mirror
MIRROR_ORIENTATION=$orient
MIRROR_RESOLUTION=1080p
FRONTEND_PORT=3000
GESTURE_ENABLED=false
EOF
)
  write_file /etc/mirror/config.env "$content"
  run chmod 0640 /etc/mirror/config.env
  run chown root:mirror /etc/mirror/config.env
}

install_systemd_units() {
  log "install systemd units (Phase 00: kiosk only)"
  local kiosk_unit_src="$SCRIPT_DIR/systemd/mirror-kiosk.service"
  [[ -f "$kiosk_unit_src" ]] || die "missing: $kiosk_unit_src"
  local kiosk_sh="$SCRIPT_DIR/chromium/mirror-kiosk.sh"
  [[ -f "$kiosk_sh" ]] || die "missing: $kiosk_sh"

  write_file /etc/systemd/user/mirror-kiosk.service "$(cat "$kiosk_unit_src")"
  write_file /usr/local/bin/mirror-kiosk.sh "$(cat "$kiosk_sh")"
  run chmod +x /usr/local/bin/mirror-kiosk.sh

  run systemctl --machine=mirror@ --user daemon-reload
  run systemctl --machine=mirror@ --user enable mirror-kiosk.service
}

# ---------- main ----------
main() {
  preflight
  log "mode: $([[ $DRY_RUN -eq 1 ]] && echo DRY-RUN || echo APPLY)"
  local orient ha_url ha_token
  orient="$(prompt_orientation)"
  ha_url="$(prompt_ha_url)"
  ha_token="$(prompt_ha_token)"

  log "selected: orientation=$orient, ha_url=$ha_url"

  create_mirror_user
  enable_autologin
  install_monitors_xml "$orient"
  write_config_env "$orient" "$ha_url" "$ha_token"
  install_systemd_units

  log "done. reboot to launch kiosk."
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "(dry-run — nothing changed on system)"
  fi
}

main "$@"
