#!/usr/bin/env bash
# Push the Smart Mirror Lovelace dashboard into HA via the WebSocket API.
#
# Run on the mirror box as the mirror user (so /etc/mirror/config.env
# is readable):
#
#   sudo -u mirror bash /opt/mirror/installer/ha-dashboard.sh
#
# Idempotent: if the "mirror" dashboard already exists it updates the
# config instead of creating a duplicate.

set -euo pipefail

ENV_FILE="/etc/mirror/config.env"
VENV_DIR="/opt/mirror/.venv-ha"
PY_SCRIPT="/tmp/mirror_push_dashboard.py"
DASH_YAML="/opt/mirror/ha/dashboards/mirror.yaml"

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

if [[ ! -f "$DASH_YAML" ]]; then
  echo "dashboard yaml missing: $DASH_YAML" >&2
  exit 1
fi

# Preflight: python + venv + pip available.
if ! python3 -c 'import venv, ensurepip' 2>/dev/null; then
  echo "python3 venv/pip missing. Install once:" >&2
  echo "  sudo apt-get install -y python3 python3-venv python3-pip" >&2
  echo "Then re-run: sudo -u mirror bash $0" >&2
  exit 1
fi

# Ensure venv with PyYAML + websockets. Rebuild if incomplete (e.g. a
# previous run created the dir before python3-venv was installed, so
# pip never landed).
if [[ ! -x "$VENV_DIR/bin/python" || ! -x "$VENV_DIR/bin/pip" ]]; then
  echo "[ha-dashboard] (re)creating venv at $VENV_DIR"
  rm -rf "$VENV_DIR"
  python3 -m venv "$VENV_DIR"
fi
"$VENV_DIR/bin/pip" install --quiet --upgrade pip >/dev/null
"$VENV_DIR/bin/pip" install --quiet websockets pyyaml >/dev/null

cat > "$PY_SCRIPT" <<'PY'
import asyncio, json, os, sys, ssl, yaml, websockets
from urllib.parse import urlparse

HA_URL = os.environ["HA_URL"].rstrip("/")
HA_TOKEN = os.environ["HA_TOKEN"]
DASH_YAML = os.environ["DASH_YAML"]

URL_PATH = "smart-mirror"
TITLE = "Smart Mirror"
ICON = "mdi:monitor-dashboard"

with open(DASH_YAML) as f:
    doc = yaml.safe_load(f)
# The repo YAML has top-level title/views. HA wants only the config
# body (views, etc.) for lovelace/config/save.
config_body = {k: v for k, v in doc.items() if k != "title"}

u = urlparse(HA_URL)
ws_scheme = "wss" if u.scheme == "https" else "ws"
ws_url = f"{ws_scheme}://{u.netloc}/api/websocket"

ssl_ctx = None
if ws_scheme == "wss":
    ca = os.environ.get("NODE_EXTRA_CA_CERTS")
    ssl_ctx = ssl.create_default_context(cafile=ca) if ca and os.path.exists(ca) else ssl._create_unverified_context()

async def rpc(ws, msg_id, payload):
    payload = {"id": msg_id, **payload}
    await ws.send(json.dumps(payload))
    while True:
        resp = json.loads(await ws.recv())
        if resp.get("id") == msg_id and resp.get("type") == "result":
            return resp

async def main():
    async with websockets.connect(ws_url, ssl=ssl_ctx, max_size=4_000_000) as ws:
        hello = json.loads(await ws.recv())
        if hello.get("type") != "auth_required":
            print("unexpected handshake:", hello, file=sys.stderr); sys.exit(1)
        await ws.send(json.dumps({"type": "auth", "access_token": HA_TOKEN}))
        ack = json.loads(await ws.recv())
        if ack.get("type") != "auth_ok":
            print("auth failed:", ack, file=sys.stderr); sys.exit(1)
        print("[ha-dashboard] authenticated")

        # 1. List dashboards, find url_path == mirror.
        r = await rpc(ws, 1, {"type": "lovelace/dashboards/list"})
        if not r.get("success"):
            print("list failed:", r, file=sys.stderr); sys.exit(1)
        existing = next((d for d in r["result"] if d.get("url_path") == URL_PATH), None)

        # 2. Create if missing, else update.
        if existing is None:
            r = await rpc(ws, 2, {
                "type": "lovelace/dashboards/create",
                "url_path": URL_PATH,
                "title": TITLE,
                "icon": ICON,
                "show_in_sidebar": True,
                "require_admin": False,
                "mode": "storage",
            })
            if not r.get("success"):
                print("create failed:", r, file=sys.stderr); sys.exit(1)
            print(f"[ha-dashboard] created dashboard /{URL_PATH}")
        else:
            r = await rpc(ws, 2, {
                "type": "lovelace/dashboards/update",
                "dashboard_id": existing["id"],
                "title": TITLE,
                "icon": ICON,
                "show_in_sidebar": True,
                "require_admin": False,
            })
            if not r.get("success"):
                print("update failed:", r, file=sys.stderr); sys.exit(1)
            print(f"[ha-dashboard] updated dashboard /{URL_PATH}")

        # 3. Save config body.
        r = await rpc(ws, 3, {
            "type": "lovelace/config/save",
            "url_path": URL_PATH,
            "config": config_body,
        })
        if not r.get("success"):
            print("save config failed:", r, file=sys.stderr); sys.exit(1)
        print(f"[ha-dashboard] saved lovelace config for /{URL_PATH}")

asyncio.run(main())
PY

DASH_YAML="$DASH_YAML" HA_URL="$HA_URL" HA_TOKEN="$HA_TOKEN" \
  NODE_EXTRA_CA_CERTS="${NODE_EXTRA_CA_CERTS:-/etc/mirror/ha.crt}" \
  "$VENV_DIR/bin/python" "$PY_SCRIPT"

rm -f "$PY_SCRIPT"
echo "[ha-dashboard] done — open HA sidebar → Smart Mirror"
