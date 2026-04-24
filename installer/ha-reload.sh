#!/usr/bin/env bash
# Reload HA YAML configuration without a full restart.
#
# Run on the mirror box as the mirror user (config.env readable):
#
#   sudo -u mirror bash /opt/mirror/installer/ha-reload.sh
#
# Calls homeassistant.reload_all (HA >= 2023.4) via REST. Picks up new
# input_button / input_select / etc. entities added via packages/ without
# bouncing the whole HA process.

set -euo pipefail

ENV_FILE="/etc/mirror/config.env"
if [[ ! -r "$ENV_FILE" ]]; then
  echo "cannot read $ENV_FILE — run as mirror user: sudo -u mirror bash $0" >&2
  exit 1
fi
set -a
# shellcheck source=/dev/null
. "$ENV_FILE"
set +a

: "${HA_URL:?HA_URL missing in $ENV_FILE}"
: "${HA_TOKEN:?HA_TOKEN missing in $ENV_FILE}"

CA="${NODE_EXTRA_CA_CERTS:-/etc/mirror/ha.crt}"
CURL_EXTRA=()
if [[ -f "$CA" ]]; then CURL_EXTRA+=(--cacert "$CA"); fi

call_reload() {
  local service="$1"
  local code
  code=$(curl -sS -o /tmp/ha-reload.out -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer $HA_TOKEN" \
    -H "Content-Type: application/json" \
    "${CURL_EXTRA[@]}" \
    "$HA_URL/api/services/$service" \
    -d '{}' || true)
  if [[ "$code" == "200" ]]; then
    echo "[ha-reload] $service ok"
  else
    echo "[ha-reload] $service HTTP $code" >&2
    cat /tmp/ha-reload.out >&2 || true
    echo >&2
  fi
  rm -f /tmp/ha-reload.out
}

# homeassistant.reload_all handles most things, but in practice some
# input_* domains only reload cleanly when hit directly — especially
# when a new entity is added to an existing block.
call_reload homeassistant/reload_all
call_reload input_text/reload
call_reload input_boolean/reload
call_reload input_select/reload
call_reload input_number/reload
call_reload input_button/reload
call_reload automation/reload
call_reload rest_command/reload 2>/dev/null || true

echo "[ha-reload] done"
