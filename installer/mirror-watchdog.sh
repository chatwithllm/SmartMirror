#!/usr/bin/env bash
# mirror-watchdog — keeps the kiosk healthy without the browser in
# the loop.
#
# Two responsibilities:
#   1. Liveness: poll /api/admin/health every WATCHDOG_INTERVAL_S
#      seconds. After WATCHDOG_FAIL_THRESHOLD consecutive failures,
#      restart mirror-frontend.service and bounce Chromium.
#   2. HA fallback: poll the mirror_reload_browser / mirror_restart_
#      frontend / mirror_reboot input_buttons directly via the HA REST
#      API. When the press timestamp changes, dispatch the action
#      locally. This makes HA controls work even when the browser is
#      hung (the kiosk's own button-poll loop has stalled).
#
# Configured via /etc/mirror/config.env (HA_URL, HA_TOKEN,
# FRONTEND_PORT). Runs as the mirror user under
# mirror-watchdog.service.

set -euo pipefail

CONFIG="/etc/mirror/config.env"
STATE_DIR="/var/lib/mirror-watchdog"
LOG_TAG="mirror-watchdog"

INTERVAL_S="${WATCHDOG_INTERVAL_S:-15}"
FAIL_THRESHOLD="${WATCHDOG_FAIL_THRESHOLD:-3}"
# How stale the browser heartbeat file may grow before we bounce
# Chromium. Page sends a beat every 5s; 60s gives plenty of slack
# for slow gpu processes / first paint while still catching wedges.
HEARTBEAT_FILE="${HEARTBEAT_FILE:-/run/mirror/heartbeat}"
HEARTBEAT_STALE_S="${HEARTBEAT_STALE_S:-60}"

if [[ -f "$CONFIG" ]]; then
  set -a
  # shellcheck source=/dev/null
  . "$CONFIG"
  set +a
fi

FRONTEND_PORT="${FRONTEND_PORT:-3000}"
HEALTH_URL="http://127.0.0.1:${FRONTEND_PORT}/api/admin/health"

mkdir -p "$STATE_DIR"

log() { logger -t "$LOG_TAG" -- "$*"; }

restart_frontend() {
  log "restarting mirror-frontend.service"
  /usr/bin/sudo -n /usr/bin/systemctl restart mirror-frontend.service \
    || log "failed to restart mirror-frontend (sudoers?)"
}

bounce_chromium() {
  log "bouncing Chromium"
  /usr/bin/pkill -9 -f chrome 2>/dev/null || true
}

reboot_kiosk() {
  log "rebooting kiosk"
  /usr/bin/sudo -n /usr/bin/systemctl reboot
}

# ---------- Liveness probe ----------
fails=0
check_liveness() {
  if /usr/bin/curl -fsS -m 5 "$HEALTH_URL" >/dev/null 2>&1; then
    if (( fails > 0 )); then
      log "frontend healthy again after ${fails} fail(s)"
    fi
    fails=0
    return
  fi
  fails=$(( fails + 1 ))
  log "health probe failed (${fails}/${FAIL_THRESHOLD})"
  if (( fails >= FAIL_THRESHOLD )); then
    restart_frontend
    bounce_chromium
    fails=0
    # Give the service time to come up before the next probe — avoids
    # re-restarting during startup.
    sleep $(( INTERVAL_S * 2 ))
  fi
}

# ---------- Browser heartbeat check ----------
# Server is healthy but Chromium might still be wedged on a stale DOM.
# Page POSTs /api/admin/heartbeat every 5s; if its file gets older
# than HEARTBEAT_STALE_S the browser's event loop has stopped (or the
# tab has been backgrounded for too long — kiosk doesn't background,
# so any pause = real wedge). Bounce Chromium; mirror-kiosk respawns.
hb_warned=0
check_heartbeat() {
  [[ -f "$HEARTBEAT_FILE" ]] || return 0   # file appears on first beat
  local now mtime age
  now=$(date +%s)
  mtime=$(stat -c %Y "$HEARTBEAT_FILE" 2>/dev/null || echo 0)
  (( mtime > 0 )) || return 0
  age=$(( now - mtime ))
  if (( age > HEARTBEAT_STALE_S )); then
    log "browser heartbeat stale (${age}s > ${HEARTBEAT_STALE_S}s) — bouncing Chromium"
    bounce_chromium
    # Touch the file so we don't re-fire immediately while chrome
    # respawns + first paints (next beat may take ~10-15s).
    touch "$HEARTBEAT_FILE" 2>/dev/null || true
    hb_warned=0
    return
  fi
  # Half-stale warning, once per stretch, so logs don't drown.
  if (( age > HEARTBEAT_STALE_S / 2 )) && (( hb_warned == 0 )); then
    log "browser heartbeat aging (${age}s)"
    hb_warned=1
  fi
  if (( age <= HEARTBEAT_STALE_S / 2 )); then
    hb_warned=0
  fi
}

# ---------- HA input_button fallback ----------
ha_get_state() {
  # echoes the entity state, or empty string on failure
  local entity="$1"
  /usr/bin/curl -fsS -m 5 \
    -H "Authorization: Bearer ${HA_TOKEN:-}" \
    "${HA_URL%/}/api/states/${entity}" 2>/dev/null \
    | /usr/bin/jq -r '.state // empty' 2>/dev/null \
    || true
}

dispatch_action() {
  local action="$1"
  case "$action" in
    reload_browser)   bounce_chromium ;;
    restart_frontend) restart_frontend ;;
    reboot)           reboot_kiosk ;;
    *)                log "unknown action: $action" ;;
  esac
}

declare -A BUTTONS=(
  [input_button.mirror_reload_browser]=reload_browser
  [input_button.mirror_restart_frontend]=restart_frontend
  [input_button.mirror_reboot]=reboot
)

check_ha_buttons() {
  [[ -n "${HA_URL:-}" && -n "${HA_TOKEN:-}" ]] || return 0
  for entity in "${!BUTTONS[@]}"; do
    local cur last state_file
    cur="$(ha_get_state "$entity")"
    [[ -n "$cur" && "$cur" != "unknown" && "$cur" != "unavailable" ]] || continue
    state_file="${STATE_DIR}/${entity}"
    last="$(cat "$state_file" 2>/dev/null || echo "")"
    if [[ -n "$last" && "$cur" != "$last" ]]; then
      log "HA press: $entity (${last} → ${cur})"
      dispatch_action "${BUTTONS[$entity]}"
    fi
    printf '%s\n' "$cur" > "$state_file"
  done
}

log "started (interval=${INTERVAL_S}s threshold=${FAIL_THRESHOLD} health=${HEALTH_URL})"

trap 'log "stopping"; exit 0' SIGTERM SIGINT

while true; do
  check_liveness
  check_heartbeat
  check_ha_buttons
  sleep "$INTERVAL_S"
done
