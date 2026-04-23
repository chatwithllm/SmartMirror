#!/usr/bin/env sh
# Kiosk Chromium launcher. Called by mirror-kiosk.service (Phase 00).
# Target URL: about:blank until Phase 01 ships the frontend on :3000.

set -eu

# shellcheck disable=SC1091
[ -f /etc/mirror/config.env ] && . /etc/mirror/config.env

TARGET="${FRONTEND_URL:-about:blank}"
# Phase 01 will set FRONTEND_URL=http://localhost:${FRONTEND_PORT:-3000}

exec chromium \
  --kiosk \
  --app="$TARGET" \
  --autoplay-policy=no-user-gesture-required \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI \
  --noerrdialogs \
  --hide-crash-restore-bubble \
  --no-first-run \
  --enable-features=VaapiVideoDecoder,VaapiVideoEncoder \
  --ignore-gpu-blocklist \
  --use-gl=egl
