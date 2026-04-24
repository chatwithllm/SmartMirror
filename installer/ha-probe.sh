#!/usr/bin/env bash
# Print current HA state for the mirror_* helper entities. Useful for
# debugging when an entity is expected to exist but doesn't show up
# after a YAML reload.
#
# Run as mirror user:
#   sudo -u mirror bash /opt/mirror/installer/ha-probe.sh

set -euo pipefail

ENV_FILE="/etc/mirror/config.env"
if [[ ! -r "$ENV_FILE" ]]; then
  echo "cannot read $ENV_FILE — run as mirror user" >&2
  exit 1
fi
set -a
# shellcheck source=/dev/null
. "$ENV_FILE"
set +a

: "${HA_URL:?HA_URL missing}"
: "${HA_TOKEN:?HA_TOKEN missing}"

CA="${NODE_EXTRA_CA_CERTS:-/etc/mirror/ha.crt}"
CURL_EXTRA=()
[[ -f "$CA" ]] && CURL_EXTRA+=(--cacert "$CA")

ENTITIES=(
  input_select.mirror_preset
  input_select.mirror_mode
  input_boolean.mirror_screen_on
  input_text.mirror_focused_tile
  input_text.mirror_yt_video
  input_button.mirror_yt_toggle
  input_number.mirror_overscan_top
  sensor.mirror_cpu
  sensor.mirror_uptime
)

printf '%-40s %-16s %s\n' 'entity_id' 'state' 'notes'
printf -- '-%.0s' {1..80}; printf '\n'

for eid in "${ENTITIES[@]}"; do
  body=$(curl -sS -w '\n%{http_code}' \
    -H "Authorization: Bearer $HA_TOKEN" \
    "${CURL_EXTRA[@]}" \
    "$HA_URL/api/states/$eid" || true)
  code=$(printf '%s' "$body" | tail -n1)
  json=$(printf '%s' "$body" | sed '$d')
  case "$code" in
    200)
      state=$(printf '%s' "$json" | python3 -c 'import sys, json; print(json.load(sys.stdin).get("state",""))' 2>/dev/null || echo "?")
      printf '%-40s %-16s %s\n' "$eid" "$state" "ok"
      ;;
    404) printf '%-40s %-16s %s\n' "$eid" "-" "MISSING (404)" ;;
    *)   printf '%-40s %-16s %s\n' "$eid" "-" "HTTP $code" ;;
  esac
done
