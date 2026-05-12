#!/usr/bin/env bash
# Manual "Restart SmartMirror" — invoked from the desktop icon. Bounces
# the frontend service + kills Chromium so mirror-kiosk respawns it.
# Designed to be runnable by the mirror user without a password
# (mirror-frontend sudoers drop-in covers the systemctl call).

set -euo pipefail

LOG_TAG="mirror-restart"
log() { logger -t "$LOG_TAG" -- "$*"; echo "[$LOG_TAG] $*"; }

log "restart requested by user"

if /usr/bin/sudo -n /usr/bin/systemctl restart mirror-frontend.service; then
  log "mirror-frontend restarted"
else
  log "WARN: sudo systemctl restart failed (sudoers?)"
fi

/usr/bin/pkill -9 -f chrome 2>/dev/null || true
log "Chromium bounced — mirror-kiosk will respawn it within ~5s"

# Brief pause so the user sees the action took effect.
sleep 2
log "done"
