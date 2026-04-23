#!/usr/bin/env bash
# List HA media_player.* and remote.* entities so you can pick the
# Samsung TV entity_id to wire into ha/packages/mirror.yaml.
#
# Run as mirror user (config.env readable):
#
#   sudo -u mirror bash /opt/mirror/installer/ha-list-media.sh

set -euo pipefail

ENV_FILE="/etc/mirror/config.env"
if [[ ! -r "$ENV_FILE" ]]; then
  echo "cannot read $ENV_FILE — run as mirror user: sudo -u mirror bash $0" >&2
  exit 1
fi
# shellcheck source=/dev/null
set -a
. "$ENV_FILE"
set +a

: "${HA_URL:?HA_URL missing in $ENV_FILE}"
: "${HA_TOKEN:?HA_TOKEN missing in $ENV_FILE}"

CA="${NODE_EXTRA_CA_CERTS:-/etc/mirror/ha.crt}"
CURL_EXTRA=()
if [[ -f "$CA" ]]; then CURL_EXTRA+=(--cacert "$CA"); fi

# Pull /api/states and filter for media_player/remote/switch entities
# whose name hints at a TV. jq output: entity_id\tstate\tfriendly_name.
TMP_PY=$(mktemp --suffix=.py)
cat > "$TMP_PY" <<'PY'
import json, sys
data = json.load(sys.stdin)
rows = []
for e in data:
    eid = e.get("entity_id", "")
    dom = eid.split(".", 1)[0]
    name = (e.get("attributes") or {}).get("friendly_name", "")
    state = e.get("state", "")
    hint_tv = any(t in eid.lower() or t in name.lower() for t in ("tv", "samsung", "tizen", "lg", "sony"))
    if dom in ("media_player", "remote") or (dom == "switch" and hint_tv):
        rows.append((dom, eid, state, name))
rows.sort()
fmt = "%-12s%-45s%-18s%s"
print(fmt % ("domain", "entity_id", "state", "friendly_name"))
print("-" * 110)
for row in rows:
    print(fmt % row)
if not rows:
    print("(no media_player / remote entities found)")
PY

curl -sS -H "Authorization: Bearer $HA_TOKEN" "${CURL_EXTRA[@]}" \
  "$HA_URL/api/states" \
  | python3 "$TMP_PY"

rm -f "$TMP_PY"
