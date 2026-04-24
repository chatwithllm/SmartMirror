#!/usr/bin/env bash
# Fetch HA's current in-memory log via /api/error_log and filter for
# the kinds of lines we typically care about when debugging the
# mirror package (input_text/input_button errors, package parse
# issues, entity rejections).
#
# Run as mirror user:
#   sudo -u mirror bash /opt/mirror/installer/ha-log.sh

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

echo "[ha-log] fetching /api/error_log, filtering for mirror-package noise"
curl -sS -H "Authorization: Bearer $HA_TOKEN" "${CURL_EXTRA[@]}" \
  "$HA_URL/api/error_log" \
  | grep -iE 'mirror|input_text|input_button|input_select|input_boolean|input_number|package|extra keys|not allowed|invalid|unknown|error|warning' \
  | tail -60

echo
echo "[ha-log] also: /api/config/core/check_config (validation without restart)"
curl -sS -X POST -H "Authorization: Bearer $HA_TOKEN" "${CURL_EXTRA[@]}" \
  "$HA_URL/api/config/core/check_config" \
  | python3 -m json.tool 2>/dev/null || true
