#!/usr/bin/env bash
# Smart Mirror installer — one-shot deploy on a fresh Ubuntu Desktop box.
#
# Handles every deploy gotcha we hit in the field:
#   - System deps (Node 20, pnpm, Chrome, xrandr/wlr-randr, xdotool, wmctrl, va-api)
#   - mirror user + autologin (detects GDM vs lightdm)
#   - GNOME keyring bypass (--password-store=basic)
#   - Frontend build under the mirror user
#   - systemd unit with LogsDirectory=mirror (no ReadWritePaths race)
#   - Rotation persisted via ~mirror/.xprofile + monitors.xml
#   - Kiosk waits on http://localhost:3000 before chromium launches
#
# Usage:
#   sudo bash installer/install.sh                 # interactive
#   sudo bash installer/install.sh --dry-run       # preview only
#   sudo bash installer/install.sh --non-interactive --orientation portrait-cw \
#        --ha-url https://ha.local:8123 --ha-token eyJ...
#
# Re-running the installer is safe: every step is idempotent. The script
# re-uses an existing mirror user, re-writes config.env, rebuilds the
# frontend, refreshes units, and bounces services.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$REPO_ROOT/frontend"

# ---------- flags ----------
DRY_RUN=0
NONINTERACTIVE=0
ORIENTATION=""
HA_URL=""
HA_TOKEN=""
SKIP_SYSTEM_DEPS=0
SKIP_BUILD=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --non-interactive) NONINTERACTIVE=1; shift ;;
    --orientation) ORIENTATION="$2"; shift 2 ;;
    --ha-url) HA_URL="$2"; shift 2 ;;
    --ha-token) HA_TOKEN="$2"; shift 2 ;;
    --skip-system-deps) SKIP_SYSTEM_DEPS=1; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    -h|--help)
      cat <<EOF
Usage: $0 [options]

  --dry-run                 Print intended changes; do not modify system.
  --non-interactive         Skip prompts; requires --orientation/--ha-url/--ha-token.
  --orientation NAME        portrait-cw | portrait-ccw | landscape
  --ha-url URL              Home Assistant URL (https://ha.local:8123)
  --ha-token TOKEN          HA long-lived access token
  --skip-system-deps        Assume deps already installed (advanced)
  --skip-build              Assume frontend already built (advanced)
  -h, --help                This help.
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
  local content="$1"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '\033[90m  would write:\033[0m %s (%d bytes)\n' "$path" "${#content}"
  else
    install -d -m 0755 "$(dirname "$path")"
    printf '%s' "$content" > "$path"
    log "wrote $path"
  fi
}

ensure_apt_pkg() {
  local pkgs=("$@")
  local missing=()
  for p in "${pkgs[@]}"; do
    dpkg -s "$p" >/dev/null 2>&1 || missing+=("$p")
  done
  if [[ ${#missing[@]} -eq 0 ]]; then return; fi
  log "apt install: ${missing[*]}"
  run apt-get install -y --no-install-recommends "${missing[@]}"
}

# ---------- preflight ----------
preflight() {
  log "preflight"
  [[ "$(uname -s)" == "Linux" ]] || warn "not Linux — dry-run only"
  if [[ "$DRY_RUN" -eq 0 && "$EUID" -ne 0 ]]; then
    die "must run as root (or use --dry-run). try: sudo $0"
  fi
  if [[ "$NONINTERACTIVE" -eq 1 ]]; then
    [[ -n "$ORIENTATION" ]] || die "--non-interactive requires --orientation"
  fi
}

# ---------- prompts ----------
prompt_orientation() {
  if [[ -n "$ORIENTATION" ]]; then echo "$ORIENTATION"; return; fi
  if [[ "$NONINTERACTIVE" -eq 1 || "$DRY_RUN" -eq 1 ]]; then echo "portrait-cw"; return; fi
  command -v whiptail >/dev/null 2>&1 || { echo "portrait-cw"; return; }
  whiptail --title "Mirror · orientation" --menu \
    "Choose display orientation." 14 60 4 \
    "portrait-cw"  "Portrait · rotate 90° clockwise (default)" \
    "portrait-ccw" "Portrait · rotate 90° counter-clockwise" \
    "landscape"    "Landscape · no rotation" \
    3>&1 1>&2 2>&3 || echo "portrait-cw"
}

prompt_ha_url() {
  if [[ -n "$HA_URL" ]]; then echo "$HA_URL"; return; fi
  if [[ "$NONINTERACTIVE" -eq 1 || "$DRY_RUN" -eq 1 ]]; then echo "http://ha.local:8123"; return; fi
  command -v whiptail >/dev/null 2>&1 || { echo "http://ha.local:8123"; return; }
  whiptail --title "Mirror · Home Assistant" --inputbox \
    "Home Assistant URL (include http:// or https://):" \
    10 70 "http://ha.local:8123" \
    3>&1 1>&2 2>&3 || echo "http://ha.local:8123"
}

prompt_ha_token() {
  if [[ -n "$HA_TOKEN" ]]; then echo "$HA_TOKEN"; return; fi
  if [[ "$NONINTERACTIVE" -eq 1 || "$DRY_RUN" -eq 1 ]]; then echo ""; return; fi
  command -v whiptail >/dev/null 2>&1 || { echo ""; return; }
  whiptail --title "Mirror · HA token" --passwordbox \
    "Paste a long-lived HA access token (or leave blank to set later):" \
    10 70 \
    3>&1 1>&2 2>&3 || echo ""
}

# ---------- system deps ----------
install_system_deps() {
  if [[ "$SKIP_SYSTEM_DEPS" -eq 1 ]]; then log "skipping system deps (--skip-system-deps)"; return; fi
  log "install system deps"
  run apt-get update -qq
  ensure_apt_pkg curl ca-certificates gnupg whiptail unclutter \
    x11-xserver-utils x11-utils xdotool wmctrl \
    vainfo intel-media-va-driver-non-free \
    build-essential
  # Node 20
  if ! command -v node >/dev/null 2>&1 || [[ "$(node --version 2>&1 | sed 's/v//' | cut -d. -f1)" -lt 20 ]]; then
    log "installing Node 20 via NodeSource"
    run bash -c 'curl -fsSL https://deb.nodesource.com/setup_20.x | bash -'
    ensure_apt_pkg nodejs
  fi
  # pnpm via corepack
  if ! command -v pnpm >/dev/null 2>&1; then
    run corepack enable pnpm || run npm install -g pnpm@10
  fi
  # Google Chrome (apt package — avoids snap kiosk pain)
  if ! command -v google-chrome >/dev/null 2>&1; then
    log "installing Google Chrome"
    local deb=/tmp/google-chrome-stable_current_amd64.deb
    run curl -fsSL -o "$deb" https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
    run apt-get install -y "$deb"
  fi
}

# ---------- mirror user ----------
create_mirror_user() {
  log "ensure mirror user"
  if id mirror >/dev/null 2>&1; then
    log "user mirror already exists"
  else
    run useradd -m -s /bin/bash -c "Smart Mirror Kiosk" mirror
  fi
  run usermod -aG video,audio,input mirror
  # nopasswdlogin group lets the display manager skip the password prompt
  # even when the account has no password set.
  if ! getent group nopasswdlogin >/dev/null 2>&1; then
    run groupadd -r nopasswdlogin
  fi
  run usermod -aG nopasswdlogin mirror
  # autologin group (lightdm convention)
  if ! getent group autologin >/dev/null 2>&1; then
    run groupadd -r autologin
  fi
  run usermod -aG autologin mirror
}

# ---------- display manager autologin ----------
configure_autologin() {
  local dm=""
  if systemctl is-active --quiet gdm.service || systemctl is-active --quiet gdm3.service; then
    dm="gdm"
  elif systemctl is-active --quiet lightdm.service; then
    dm="lightdm"
  else
    # Default to whichever is installed
    if [[ -d /etc/gdm3 ]]; then dm="gdm"; elif [[ -d /etc/lightdm ]]; then dm="lightdm"; else dm="none"; fi
  fi
  log "display manager: $dm"
  case "$dm" in
    gdm)
      write_file /etc/gdm3/custom.conf "$(cat <<'EOF'
[daemon]
AutomaticLoginEnable=true
AutomaticLogin=mirror
WaylandEnable=true

[security]

[xdmcp]

[chooser]

[debug]
EOF
)"
      ;;
    lightdm)
      # Wipe any pre-existing autologin-user line in the main config
      if [[ -f /etc/lightdm/lightdm.conf && "$DRY_RUN" -eq 0 ]]; then
        cp -f /etc/lightdm/lightdm.conf /etc/lightdm/lightdm.conf.pre-mirror-bak || true
      fi
      write_file /etc/lightdm/lightdm.conf "$(cat <<'EOF'
[Seat:*]
autologin-user=mirror
autologin-user-timeout=0
user-session=ubuntu
EOF
)"
      # Remove stale drop-ins that might conflict
      if [[ -d /etc/lightdm/lightdm.conf.d ]]; then
        run rm -f /etc/lightdm/lightdm.conf.d/50-mirror-autologin.conf
      fi
      ;;
    none)
      warn "no display manager detected; autologin not configured"
      ;;
  esac
}

# ---------- monitors.xml + .xprofile + autostart (rotation) ----------
install_rotation() {
  local orient="$1"
  local tmpl="$SCRIPT_DIR/monitors/${orient}.xml.tmpl"
  if [[ -f "$tmpl" ]]; then
    log "install monitors.xml for $orient (Wayland GNOME reads this)"
    run install -d -m 0755 /home/mirror/.config
    if [[ "$DRY_RUN" -eq 0 ]]; then
      install -m 0644 "$tmpl" /home/mirror/.config/monitors.xml
      chown -R mirror:mirror /home/mirror/.config
    else
      printf '\033[90m  would install:\033[0m /home/mirror/.config/monitors.xml\n'
    fi
  fi

  local xrotate
  case "$orient" in
    portrait-cw)  xrotate="left"   ;;   # field-tested: CW-mounted panels want 'left'
    portrait-ccw) xrotate="right"  ;;
    landscape)    xrotate="normal" ;;
  esac

  # Standalone rotation helper — idempotent, session-type aware.
  if [[ "$DRY_RUN" -eq 0 ]]; then
    install -d -m 0755 /usr/local/bin
    cat > /usr/local/bin/mirror-rotate.sh <<ROTATE_EOF
#!/bin/sh
# Applies display rotation on session start. Honours X11 and Wayland.
set -e
ROTATE="$xrotate"
case "\$ROTATE" in
  left)     TRANSFORM=270 ;;
  right)    TRANSFORM=90  ;;
  inverted) TRANSFORM=180 ;;
  *)        TRANSFORM=0   ;;
esac

if [ "\${XDG_SESSION_TYPE:-}" = "wayland" ] || [ -n "\${WAYLAND_DISPLAY:-}" ]; then
  if command -v wlr-randr >/dev/null 2>&1; then
    OUT=\$(wlr-randr 2>/dev/null | awk '/^[A-Z].*-[0-9]+/ {print \$1; exit}')
    [ -n "\$OUT" ] && wlr-randr --output "\$OUT" --transform "\$TRANSFORM" || true
  fi
else
  if command -v xrandr >/dev/null 2>&1; then
    OUT=\$(xrandr 2>/dev/null | awk '/ connected/ {print \$1; exit}')
    [ -n "\$OUT" ] && xrandr --output "\$OUT" --rotate "\$ROTATE" || true
  fi
fi
ROTATE_EOF
    chmod +x /usr/local/bin/mirror-rotate.sh
    log "wrote /usr/local/bin/mirror-rotate.sh"
  else
    printf '\033[90m  would write:\033[0m /usr/local/bin/mirror-rotate.sh\n'
  fi

  # Legacy .xprofile path (some sessions still source it).
  write_file /home/mirror/.xprofile "$(cat <<'EOF'
#!/bin/sh
/usr/local/bin/mirror-rotate.sh || true
EOF
)"
  run chmod +x /home/mirror/.xprofile
  run chown mirror:mirror /home/mirror/.xprofile

  # XDG autostart — fires on every graphical session start (X or Wayland).
  run install -d -m 0755 -o mirror -g mirror /home/mirror/.config/autostart
  write_file /home/mirror/.config/autostart/mirror-rotate.desktop "$(cat <<'EOF'
[Desktop Entry]
Type=Application
Name=Mirror Rotation
Exec=/usr/local/bin/mirror-rotate.sh
X-GNOME-Autostart-enabled=true
NoDisplay=true
EOF
)"
  run chown mirror:mirror /home/mirror/.config/autostart/mirror-rotate.desktop
}

# ---------- /etc/mirror/config.env ----------
write_config_env() {
  local orient="$1" ha_url="$2" ha_token="$3"
  log "write /etc/mirror/config.env"
  write_file /etc/mirror/config.env "$(cat <<EOF
# Managed by mirror installer — re-run installer to regenerate.
HA_URL=$ha_url
HA_TOKEN=$ha_token
MIRROR_USER=mirror
MIRROR_ORIENTATION=$orient
MIRROR_RESOLUTION=1080p
FRONTEND_PORT=3000
GESTURE_ENABLED=false
EOF
)"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    chmod 0640 /etc/mirror/config.env
    chown root:mirror /etc/mirror/config.env
    # Ensure HA_CA_CERT exists so Node's NODE_EXTRA_CA_CERTS doesn't spam.
    [[ -f /etc/mirror/ha.crt ]] || install -m 0644 /dev/null /etc/mirror/ha.crt
  fi
}

# ---------- frontend build ----------
build_frontend() {
  if [[ "$SKIP_BUILD" -eq 1 ]]; then log "skipping frontend build (--skip-build)"; return; fi
  log "build frontend as mirror user"
  run chown -R mirror:mirror "$REPO_ROOT"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    sudo -u mirror -H bash -lc "cd '$FRONTEND_DIR' && pnpm install --frozen-lockfile && pnpm build"
  else
    printf '\033[90m  would run:\033[0m cd %s && pnpm install --frozen-lockfile && pnpm build (as mirror)\n' "$FRONTEND_DIR"
  fi
}

# ---------- kiosk script ----------
install_kiosk_script() {
  log "install /usr/local/bin/mirror-kiosk.sh"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '\033[90m  would write:\033[0m /usr/local/bin/mirror-kiosk.sh\n'
    return
  fi
  install -d -m 0755 /usr/local/bin
  cat > /usr/local/bin/mirror-kiosk.sh <<'KIOSK_EOF'
#!/bin/sh
set -e

if [ -f /etc/mirror/config.env ]; then . /etc/mirror/config.env; fi
PORT="${FRONTEND_PORT:-3000}"
URL="http://localhost:${PORT}"

# Apply rotation BEFORE we measure the viewport — XDG autostart may not
# have fired yet when the systemd user unit launches.
if [ -x /usr/local/bin/mirror-rotate.sh ]; then
  /usr/local/bin/mirror-rotate.sh >/dev/null 2>&1 || true
  sleep 1
fi

# Wait for the frontend to respond (max 60s).
for _ in $(seq 1 60); do
  curl -sf "$URL" >/dev/null 2>&1 && break
  sleep 1
done

# Real viewport — xdpyinfo honours rotation, xrandr connected line holds
# the rotated rect, mode-line asterisk is raw panel mode (last resort).
RES=$(xdpyinfo 2>/dev/null | awk '/dimensions:/ {print $2; exit}')
if [ -z "$RES" ]; then
  RES=$(xrandr 2>/dev/null | awk '/ connected/ {for(i=1;i<=NF;i++) if ($i ~ /^[0-9]+x[0-9]+\+/) {split($i,a,"+"); print a[1]; exit}}')
fi
[ -z "$RES" ] && RES=$(xrandr --current 2>/dev/null | awk '/\*/ {print $1; exit}')
[ -z "$RES" ] && RES="1920x1080"
W=${RES%x*}
H=${RES#*x}

BROWSER=""
for cand in /usr/bin/google-chrome /usr/bin/chromium /usr/bin/chromium-browser /snap/bin/chromium; do
  [ -x "$cand" ] && BROWSER="$cand" && break
done
[ -n "$BROWSER" ] || { echo "no chromium/chrome binary found" >&2; exit 127; }

# GNOME under X11 ignores Chrome's --kiosk — background a helper that
# force-fullscreens the window via wmctrl + xdotool F11 once it appears.
(
  for _ in $(seq 1 30); do
    if command -v wmctrl >/dev/null 2>&1 && wmctrl -l 2>/dev/null | grep -q 'Smart Mirror'; then
      wmctrl -r 'Smart Mirror' -b add,fullscreen 2>/dev/null || true
      command -v xdotool >/dev/null 2>&1 && xdotool search --name 'Smart Mirror' key F11 2>/dev/null || true
      break
    fi
    sleep 1
  done
) &

exec "$BROWSER" \
  --kiosk \
  --app="$URL" \
  --window-position=0,0 \
  --window-size="${W},${H}" \
  --start-fullscreen \
  --password-store=basic \
  --no-default-browser-check \
  --no-first-run \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI \
  --noerrdialogs \
  --hide-crash-restore-bubble \
  --autoplay-policy=no-user-gesture-required \
  --enable-features=VaapiVideoDecoder,VaapiVideoEncoder \
  --ignore-gpu-blocklist \
  --remote-debugging-port=9222 \
  --remote-allow-origins=* \
  --user-data-dir=/home/mirror/.config/mirror-chrome
KIOSK_EOF
  chmod +x /usr/local/bin/mirror-kiosk.sh
}

# ---------- systemd units ----------
install_systemd_units() {
  local fe_src="$SCRIPT_DIR/systemd/mirror-frontend.service"
  local kiosk_src="$SCRIPT_DIR/systemd/mirror-kiosk.service"
  [[ -f "$fe_src" ]] || die "missing: $fe_src"
  [[ -f "$kiosk_src" ]] || die "missing: $kiosk_src"
  # Ensure units point at the right WorkingDirectory regardless of clone path.
  local fe_rendered
  fe_rendered=$(sed "s|^WorkingDirectory=.*|WorkingDirectory=$FRONTEND_DIR|" "$fe_src")
  write_file /etc/systemd/system/mirror-frontend.service "$fe_rendered"
  write_file /etc/systemd/user/mirror-kiosk.service "$(cat "$kiosk_src")"

  run systemctl daemon-reload
  # Pre-seed /var/log/mirror directory ownership if LogsDirectory isn't honored
  # on this systemd version. Cheap belt-and-braces.
  if [[ "$DRY_RUN" -eq 0 ]]; then
    install -d -o mirror -g mirror -m 0755 /var/log/mirror
  fi

  run systemctl enable --now mirror-frontend.service
  # user units need linger so they start after GDM autologs the mirror user
  run loginctl enable-linger mirror || true
  run systemctl --machine=mirror@ --user daemon-reload || true
  run systemctl --machine=mirror@ --user enable mirror-kiosk.service || true
}

# ---------- launch verification ----------
launch_verify() {
  if [[ "$DRY_RUN" -eq 1 ]]; then return; fi
  log "waiting for http://localhost:3000 (up to 60s)"
  local i=0
  while (( i < 60 )); do
    curl -sf http://localhost:3000 >/dev/null 2>&1 && { log "frontend live ✅"; return; }
    sleep 1; ((i+=1))
  done
  warn "frontend did not respond in 60s; inspect with: journalctl -u mirror-frontend -n 40"
}

# ---------- main ----------
main() {
  preflight
  log "mode: $([[ $DRY_RUN -eq 1 ]] && echo DRY-RUN || echo APPLY)"
  local orient ha_url ha_token
  orient="$(prompt_orientation)"
  ha_url="$(prompt_ha_url)"
  ha_token="$(prompt_ha_token)"
  log "orientation=$orient  ha_url=$ha_url  ha_token=$([[ -n "$ha_token" ]] && echo 'set' || echo '(blank)')"

  install_system_deps
  create_mirror_user
  configure_autologin
  install_rotation "$orient"
  write_config_env "$orient" "$ha_url" "$ha_token"
  install_kiosk_script
  build_frontend
  install_systemd_units
  launch_verify

  log "done."
  log "reboot to kick autologin → kiosk, or: sudo systemctl --machine=mirror@ --user start mirror-kiosk"
  [[ "$DRY_RUN" -eq 1 ]] && log "(dry-run — nothing changed)"
}

main "$@"
