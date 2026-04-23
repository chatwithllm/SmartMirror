"""Tiny MQTT publisher. Uses paho-mqtt; network errors are retried forever."""

from __future__ import annotations

import json
import logging
import time
from typing import Any

log = logging.getLogger("mirror-gesture.mqtt")


class MqttPublisher:
    def __init__(self, host: str, port: int, topic: str) -> None:
        self.host = host
        self.port = port
        self.topic = topic
        self._client: Any = None

    def connect(self) -> None:
        try:
            import paho.mqtt.client as mqtt
        except Exception as exc:
            log.error("paho-mqtt not installed: %s", exc)
            return
        self._client = mqtt.Client()
        while True:
            try:
                self._client.connect(self.host, self.port, keepalive=30)
                self._client.loop_start()
                return
            except Exception as exc:
                log.warning("mqtt connect failed (%s); retrying", exc)
                time.sleep(2)

    def publish(self, payload: dict[str, Any]) -> None:
        if not self._client:
            return
        self._client.publish(self.topic, json.dumps(payload, separators=(",", ":")))

    def close(self) -> None:
        if self._client:
            try:
                self._client.loop_stop()
                self._client.disconnect()
            except Exception:
                pass
            self._client = None
