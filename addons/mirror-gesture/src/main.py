"""Smart Mirror gesture service — kiosk-local main loop.

Runs as a systemd unit on the kiosk PC (User=mirror, group video).
Reads the USB webcam, classifies hand gestures with MediaPipe, and
fans the result out to two HTTP endpoints:

  - http://localhost:3000/api/gesture     (UI gestures → SSE → browser)
  - {HA_URL}/api/events/mirror_gesture    (mode/lock → HA fan-out)

Camera handling:

  - Auto-picks /dev/videoN by capability (override with CAMERA_INDEX).
  - When ``input_boolean.mirror_gesture_enable`` is off, releases the
    camera entirely so the LED goes dark — re-acquires on enable. This
    gives a visible privacy contract.
"""

from __future__ import annotations

import logging
import signal
import sys
import time
import urllib.error
import urllib.request
from typing import Any

from .camera_pick import pick as pick_camera
from .config import Config, load as load_config
from .gestures import Cooldown, classify
from .http_publisher import HttpPublisher
from .privacy import blur_faces

log = logging.getLogger("mirror-gesture")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


def _ha_enabled(cfg: Config) -> bool:
    """Poll the HA enable boolean. On any failure, default to enabled
    so a flaky network never silently mutes the gesture service —
    operators can always disable via systemd if HA is broken."""
    if not cfg.ha_url or not cfg.ha_token:
        return True
    url = f"{cfg.ha_url}/api/states/{cfg.enable_entity}"
    req = urllib.request.Request(  # noqa: S310 — HA only
        url,
        headers={"Authorization": f"Bearer {cfg.ha_token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=1.5) as resp:  # noqa: S310
            import json as _json
            payload = _json.loads(resp.read().decode("utf-8"))
            return str(payload.get("state", "on")).lower() == "on"
    except (urllib.error.URLError, OSError) as exc:
        log.debug("enable poll failed: %s — assuming enabled", exc)
        return True


class CameraHandle:
    """Open-on-demand camera wrapper. Releases the device when paused
    so the webcam LED actually turns off."""

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self._cap: Any = None
        self._index: int | None = None

    def acquire(self) -> Any:
        if self._cap is not None:
            return self._cap
        import cv2  # local import — keeps test imports cheap

        idx = pick_camera(self.cfg.camera_index)
        cap = cv2.VideoCapture(idx)
        if self.cfg.width:
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.cfg.width)
        if self.cfg.height:
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.cfg.height)
        log.info("camera opened: index=%d %dx%d", idx, self.cfg.width, self.cfg.height)
        self._cap = cap
        self._index = idx
        return cap

    def release(self) -> None:
        if self._cap is None:
            return
        try:
            self._cap.release()
        except Exception:  # noqa: BLE001
            pass
        log.info("camera released (index=%s)", self._index)
        self._cap = None


def main() -> int:
    cfg = load_config()
    log.info(
        "starting: local=%s ha=%s blur=%s cooldown=%dms floor=%.2f",
        cfg.local_url,
        cfg.ha_url or "<disabled>",
        cfg.face_blur,
        cfg.cooldown_ms,
        cfg.confidence_floor,
    )

    try:
        import cv2  # noqa: F401  — fail fast if missing
        import mediapipe as mp
    except Exception as exc:  # noqa: BLE001
        log.error("opencv/mediapipe import failed: %s", exc)
        return 1

    mp_hands = mp.solutions.hands
    hands = mp_hands.Hands(
        max_num_hands=1,
        min_detection_confidence=0.6,
        min_tracking_confidence=0.5,
    )

    handle = CameraHandle(cfg)
    publisher = HttpPublisher(cfg.local_url, cfg.local_token, cfg.ha_url, cfg.ha_token)
    cooldown = Cooldown(cfg.cooldown_ms)

    window: list[Any] = []
    frame_interval = 1.0 / max(1, cfg.fps_limit)
    enable_check_interval = 1.0
    last_tick = 0.0
    last_enable_check = 0.0
    enabled = True

    def shutdown(*_: Any) -> None:
        log.info("shutting down")
        handle.release()
        sys.exit(0)

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    while True:
        now = time.time()

        # Re-poll the HA gating boolean once a second.
        if now - last_enable_check >= enable_check_interval:
            last_enable_check = now
            new_enabled = _ha_enabled(cfg)
            if new_enabled != enabled:
                enabled = new_enabled
                if enabled:
                    log.info("gesture enable → on; reacquiring camera")
                else:
                    log.info("gesture enable → off; releasing camera")
                    handle.release()
                    window.clear()

        if not enabled:
            time.sleep(0.5)
            continue

        if now - last_tick < frame_interval:
            time.sleep(0.002)
            continue
        last_tick = now

        cap = handle.acquire()
        ok, frame = cap.read()
        if not ok:
            log.warning("camera read failed; sleeping 1 s")
            time.sleep(1.0)
            continue

        if cfg.face_blur:
            frame = blur_faces(frame)

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = hands.process(rgb)
        if result.multi_hand_landmarks:
            window.append(result.multi_hand_landmarks[0])
            if len(window) > 3:
                window.pop(0)
            classification = classify(window)
            if (
                classification
                and classification["confidence"] >= cfg.confidence_floor
                and cooldown.allow(classification["gesture"])
            ):
                publisher.publish(
                    classification["gesture"],
                    classification["confidence"],
                    time.time(),
                )
        else:
            window.clear()


if __name__ == "__main__":
    sys.exit(main())
