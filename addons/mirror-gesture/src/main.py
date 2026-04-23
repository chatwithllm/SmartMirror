"""
Smart Mirror gesture addon — main loop.

Reads webcam via OpenCV, optionally blurs detected faces, runs MediaPipe
Hands on each frame, classifies gestures from a rolling landmark window,
and publishes confident hits to MQTT.

The HA side listens on the MQTT topic and emits `event.mirror_gesture`,
which the frontend's gesture router turns into actions.
"""

from __future__ import annotations

import json
import logging
import os
import signal
import sys
import time
from typing import Any

from .camera import open_camera
from .gestures import classify
from .privacy import blur_faces
from .mqtt import MqttPublisher

log = logging.getLogger("mirror-gesture")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


def load_options() -> dict[str, Any]:
    path = "/data/options.json"
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return {
        "camera_index": int(os.environ.get("CAMERA_INDEX", 0)),
        "resolution": [640, 480],
        "fps_limit": 15,
        "mqtt_host": os.environ.get("MQTT_HOST", "core-mosquitto"),
        "mqtt_port": int(os.environ.get("MQTT_PORT", 1883)),
        "mqtt_topic": os.environ.get("MQTT_TOPIC", "mirror/gesture"),
        "face_blur": True,
        "enabled": False,
    }


def main() -> int:
    opts = load_options()
    if not opts.get("enabled"):
        log.info("gesture addon disabled via options; exiting cleanly")
        return 0

    try:
        import cv2
        import mediapipe as mp
    except Exception as exc:
        log.error("mediapipe/opencv not installed: %s", exc)
        return 1

    mp_hands = mp.solutions.hands
    hands = mp_hands.Hands(
        max_num_hands=1,
        min_detection_confidence=0.6,
        min_tracking_confidence=0.5,
    )

    cap = open_camera(opts["camera_index"], opts["resolution"])
    publisher = MqttPublisher(opts["mqtt_host"], int(opts["mqtt_port"]), opts["mqtt_topic"])
    publisher.connect()

    window: list[Any] = []
    frame_interval = 1.0 / max(1, int(opts["fps_limit"]))

    def shutdown(*_: Any) -> None:
        log.info("gesture addon shutting down")
        cap.release()
        publisher.close()
        sys.exit(0)

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    last_tick = 0.0
    while True:
        if time.time() - last_tick < frame_interval:
            time.sleep(0.002)
            continue
        last_tick = time.time()

        ok, frame = cap.read()
        if not ok:
            log.warning("camera read failed; sleeping 1s")
            time.sleep(1.0)
            continue

        if opts.get("face_blur"):
            frame = blur_faces(frame)

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = hands.process(rgb)
        if result.multi_hand_landmarks:
            window.append(result.multi_hand_landmarks[0])
            if len(window) > 3:
                window.pop(0)
            classification = classify(window)
            if classification and classification["confidence"] >= 0.7:
                publisher.publish(
                    {
                        "gesture": classification["gesture"],
                        "confidence": float(classification["confidence"]),
                        "ts": time.time(),
                    }
                )
        else:
            window.clear()


if __name__ == "__main__":
    sys.exit(main())
