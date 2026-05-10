"""HTTP fan-out for classified gestures.

Replaces the old MQTT publisher. Two channels:

- Local UI bus: POST http://localhost:3000/api/gesture with a Bearer
  token shared via /etc/mirror/config.env. The SvelteKit server fans
  out to every browser tab via SSE.

- HA event bus: POST {HA_URL}/api/events/mirror_gesture so the
  existing 05_mirror_gesture_router.yaml automation can fan out
  mode_next/prev/lock to global state.

Failures are logged and swallowed — a transient HTTP hiccup must
never crash the camera loop.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import Any

log = logging.getLogger("mirror-gesture.http")

_TIMEOUT_SEC = 1.5


class HttpPublisher:
    def __init__(
        self,
        local_url: str,
        local_token: str,
        ha_url: str,
        ha_token: str,
    ) -> None:
        self.local_endpoint = f"{local_url.rstrip('/')}/api/gesture"
        self.local_token = local_token
        self.ha_endpoint = (
            f"{ha_url.rstrip('/')}/api/events/mirror_gesture" if ha_url else ""
        )
        self.ha_token = ha_token

    def _post(self, url: str, headers: dict[str, str], payload: dict[str, Any]) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        req = urllib.request.Request(  # noqa: S310 — kiosk-local + HA only
            url,
            data=body,
            method="POST",
            headers={"Content-Type": "application/json", **headers},
        )
        try:
            with urllib.request.urlopen(req, timeout=_TIMEOUT_SEC) as resp:  # noqa: S310
                if resp.status >= 400:
                    log.warning("POST %s → HTTP %d", url, resp.status)
        except urllib.error.URLError as exc:
            log.warning("POST %s failed: %s", url, exc)
        except OSError as exc:
            log.warning("POST %s socket error: %s", url, exc)

    def publish(self, gesture: str, confidence: float, ts: float) -> None:
        payload = {"gesture": gesture, "confidence": float(confidence), "ts": float(ts)}

        if self.local_token:
            self._post(
                self.local_endpoint,
                {"Authorization": f"Bearer {self.local_token}"},
                payload,
            )
        else:
            log.debug("MIRROR_GESTURE_TOKEN unset; skipping local POST")

        if self.ha_endpoint and self.ha_token:
            self._post(
                self.ha_endpoint,
                {"Authorization": f"Bearer {self.ha_token}"},
                payload,
            )
