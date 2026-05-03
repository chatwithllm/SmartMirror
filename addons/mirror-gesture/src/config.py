"""Runtime config for the kiosk-local gesture service.

Reads from environment (populated by systemd via EnvironmentFile=
/etc/mirror/config.env). All settings have sane defaults so the
service can start and complain via journald if a critical secret is
missing — better than failing silently.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

log = logging.getLogger("mirror-gesture.config")


@dataclass(frozen=True)
class Config:
    # Camera selection. CAMERA_INDEX overrides v4l2 auto-pick.
    camera_index: int | None
    width: int
    height: int
    fps_limit: int

    # Privacy + classifier knobs.
    face_blur: bool
    cooldown_ms: int
    confidence_floor: float

    # Local fan-out: POST UI gestures to the kiosk's own SvelteKit
    # server, which fans out via SSE to the browser.
    local_url: str
    local_token: str

    # Side channel: POST event.mirror_gesture into HA so the existing
    # automation can fan out mode_next/prev/lock to global state.
    # Empty HA_URL == HA wiring disabled (kiosk runs UI-only).
    ha_url: str
    ha_token: str

    # Gating helper. Polled every second; off ⇒ release the camera so
    # the LED actually goes dark.
    enable_entity: str


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError:
        log.warning("env %s not an int (%r); falling back to %d", name, raw, default)
        return default


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return float(raw)
    except ValueError:
        log.warning("env %s not a float (%r); falling back to %f", name, raw, default)
        return default


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name, "").strip().lower()
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    return default


def load() -> Config:
    idx_raw = os.environ.get("CAMERA_INDEX", "").strip()
    idx: int | None = int(idx_raw) if idx_raw.isdigit() else None
    return Config(
        camera_index=idx,
        width=_env_int("CAMERA_WIDTH", 640),
        height=_env_int("CAMERA_HEIGHT", 480),
        fps_limit=_env_int("FPS_LIMIT", 15),
        face_blur=_env_bool("FACE_BLUR", True),
        cooldown_ms=_env_int("GESTURE_COOLDOWN_MS", 800),
        confidence_floor=_env_float("GESTURE_CONFIDENCE_FLOOR", 0.7),
        local_url=os.environ.get("MIRROR_LOCAL_URL", "http://localhost:3000"),
        local_token=os.environ.get("MIRROR_GESTURE_TOKEN", ""),
        ha_url=os.environ.get("HA_URL", "").rstrip("/"),
        ha_token=os.environ.get("HA_TOKEN", ""),
        enable_entity=os.environ.get(
            "GESTURE_ENABLE_ENTITY", "input_boolean.mirror_gesture_enable"
        ),
    )
