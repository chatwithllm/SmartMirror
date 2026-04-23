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
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

: "${HA_URL:?HA_URL missing in $ENV_FILE}"
: "${HA_TOKEN:?HA_TOKEN missing in $ENV_FILE}"

CA="${NODE_EXTRA_CA_CERTS:-/etc/mirror/ha.crt}"
CURL_EXTRA=()
if [[ -f "$CA" ]]; then CURL_EXTRA+=(--cacert "$CA"); fi

echo "[ha-reload] calling homeassistant.reload_all"
http_code=$(curl -sS -o /tmp/ha-reload.out -w '%{http_code}' \
  -X POST \
  -H "Authorization: Bearer $HA_TOKEN" \
  -H "Content-Type: application/json" \
  "${CURL_EXTRA[@]}" \
  "$HA_URL/api/services/homeassistant/reload_all" \
  -d '{}' || true)

if [[ "$http_code" != "200" ]]; then
  echo "[ha-reload] HTTP $http_code" >&2
  cat /tmp/ha-reload.out >&2 || true
  rm -f /tmp/ha-reload.out
  exit 1
fi
rm -f /tmp/ha-reload.out
echo "[ha-reload] ok — YAML reloaded"
