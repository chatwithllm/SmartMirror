#!/usr/bin/env bash
# One-shot helper to sign the mirror's kiosk Chromium profile into a
# YouTube (Premium) account. The kiosk runs --app mode locked to the
# local frontend, so there's no UI path to reach youtube.com. This
# script stops the kiosk, reopens Chrome against the same
# --user-data-dir with the sign-in URL, and lets the user sign in
# normally. Closing the Chrome window re-enables the kiosk
# (systemd Restart=always brings it back).
#
# Run on the mirror box, in front of the TV (needs DISPLAY=:0):
#
#   sudo bash /opt/mirror/installer/youtube-signin.sh
#
# After signing in, YouTube cookies live in /home/mirror/.config/
# mirror-chrome, so the kiosk's /embed iframes pick up Premium
# (ad-free) for the same YouTube account.

set -euo pipefail

PROFILE="/home/mirror/.config/mirror-chrome"
MIRROR_UID="$(id -u mirror 2>/dev/null || echo 1001)"
XDG="/run/user/${MIRROR_UID}"

if [[ $EUID -ne 0 ]]; then
  echo "must run as root (uses sudo -u mirror under the hood)" >&2
  exit 1
fi

BROWSER=""
for cand in /usr/bin/google-chrome /usr/bin/chromium /usr/bin/chromium-browser /snap/bin/chromium; do
  [[ -x "$cand" ]] && BROWSER="$cand" && break
done
[[ -n "$BROWSER" ]] || { echo "no chromium/chrome binary found" >&2; exit 127; }

echo "[yt-signin] stopping mirror-kiosk"
sudo -u mirror XDG_RUNTIME_DIR="$XDG" systemctl --user stop mirror-kiosk || true
# Also make sure no leftover Chrome is holding the profile lock.
sudo -u mirror pkill -9 -f 'mirror-chrome' 2>/dev/null || true
sleep 1

echo "[yt-signin] launching Chrome with the kiosk profile"
echo "  → sign in to YouTube, then close the Chrome window when done."
echo "  → kiosk auto-restarts after Chrome exits."

# Run foreground so the script waits for the user to finish signing in.
sudo -u mirror \
  DISPLAY=":0" \
  XDG_RUNTIME_DIR="$XDG" \
  "$BROWSER" \
    --user-data-dir="$PROFILE" \
    --password-store=basic \
    --no-first-run \
    --no-default-browser-check \
    "https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F" \
  || true

echo "[yt-signin] restarting mirror-kiosk"
sudo -u mirror XDG_RUNTIME_DIR="$XDG" systemctl --user start mirror-kiosk || true
echo "[yt-signin] done"
