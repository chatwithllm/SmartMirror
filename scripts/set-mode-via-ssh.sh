#!/usr/bin/env bash
# Smart Mirror — resolution / rotation switcher.
# Called by HA rest_command.mirror_set_resolution over SSH. Allow-listed
# in /etc/sudoers.d/mirror:
#   %mirror ALL=NOPASSWD: /usr/bin/wlr-randr, /bin/systemctl
set -euo pipefail

RES="${1:-1080p}"   # 4k|1440p|1080p
ROT="${2:-none}"    # cw|ccw|none

declare -A MODE=(
  [4k]="3840x2160@60"
  [1440p]="2560x1440@60"
  [1080p]="1920x1080@60"
)
declare -A TX=(
  [cw]="90"
  [ccw]="270"
  [none]="normal"
)

if [[ -z "${MODE[$RES]:-}" ]]; then
  echo "unknown resolution: $RES" >&2
  exit 2
fi
if [[ -z "${TX[$ROT]:-}" ]]; then
  echo "unknown rotation: $ROT" >&2
  exit 2
fi

OUT_NAME="$(wlr-randr --json | python3 -c 'import sys,json; print(json.load(sys.stdin)[0]["name"])')"
wlr-randr --output "$OUT_NAME" --mode "${MODE[$RES]}" --transform "${TX[$ROT]}"
systemctl --user --machine=mirror@ restart mirror-kiosk.service
