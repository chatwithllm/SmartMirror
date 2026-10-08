"""Gesture classifier.

Given a rolling window of MediaPipe Hands landmarks, return a
classification dict or None. Rule-based for v1; a learned model is
post-v1. v2 adds:

  - point      ⇒ `focus`           (only index extended)
  - pinch open ⇒ `tile_fullscreen` (thumb-index distance grows)
  - pinch shut ⇒ `tile_minimize`   (thumb-index distance shrinks)
  - palm hold  ⇒ `media_pause`     (open palm, ~no motion across window)
  - palm swipe ⇒ `mode_next/prev`  (open palm, wrist x-delta past threshold)
  - fist hold  ⇒ `lock`            (closed fist, persistent across window)
  - palm enter ⇒ `wake`            (emitted by the main loop on the rising
                                    edge — a transition, not a pose)
"""

from __future__ import annotations

import math
import time
from typing import Any

# Landmark indices per MediaPipe Hands.
# https://developers.google.com/mediapipe/solutions/vision/hand_landmarker
_TIPS = (8, 12, 16, 20)   # index, middle, ring, pinky tips
_MCPS = (5, 9, 13, 17)    # corresponding metacarpophalangeal joints
_THUMB_TIP = 4
_INDEX_MCP = 5
_INDEX_TIP = 8
_WRIST = 0


# --- pose primitives ---------------------------------------------------------

def _ext_finger(hand: Any, tip: int, mcp: int) -> bool:
    """Tip is above its MCP (smaller y in image space) ⇒ extended."""
    try:
        return hand.landmark[tip].y < hand.landmark[mcp].y
    except Exception:  # noqa: BLE001 — landmark missing is unrecoverable
        return False


def _dist(a: Any, b: Any) -> float:
    return math.hypot(a.x - b.x, a.y - b.y)


# Measured on real MediaPipe landmark sets (tests/testdata):
#   fist      d(thumb_tip, index_mcp) = 0.051
#   thumbs-up d(thumb_tip, index_mcp) = 0.230
# 0.12 sits between them with a wide margin either side.
THUMB_FOLDED_DISTANCE = 0.12


def _thumb_folded(hand: Any) -> bool:
    """Thumb tip tucked against the index MCP (folded across the palm).

    Without this, `_fist` ignores the thumb entirely and a thumbs-up reads
    as a fist → `lock` → the HA automation turns the gesture service off
    for five minutes and releases the camera. A thumbs-up is a gesture
    people make constantly; it must not be a kill switch.
    """
    try:
        return _dist(hand.landmark[_THUMB_TIP], hand.landmark[_INDEX_MCP]) < THUMB_FOLDED_DISTANCE
    except Exception:  # noqa: BLE001
        return False


def _palm_open(hand: Any) -> bool:
    return all(_ext_finger(hand, t, m) for t, m in zip(_TIPS, _MCPS, strict=True))


def _fist(hand: Any) -> bool:
    return _thumb_folded(hand) and all(
        not _ext_finger(hand, t, m) for t, m in zip(_TIPS, _MCPS, strict=True)
    )


def _point(hand: Any) -> bool:
    """Index extended, middle/ring/pinky curled."""
    return (
        _ext_finger(hand, 8, 5)
        and not _ext_finger(hand, 12, 9)
        and not _ext_finger(hand, 16, 13)
        and not _ext_finger(hand, 20, 17)
    )


def _wrist_dx(first: Any, last: Any) -> float:
    return float(last.landmark[_WRIST].x - first.landmark[_WRIST].x)


def _wrist_motion(window: list[Any]) -> float:
    """Sum of consecutive wrist deltas — proxy for "how still is the hand"."""
    total = 0.0
    for i in range(1, len(window)):
        a, b = window[i - 1], window[i]
        dx = b.landmark[_WRIST].x - a.landmark[_WRIST].x
        dy = b.landmark[_WRIST].y - a.landmark[_WRIST].y
        total += math.hypot(dx, dy)
    return total


def _pinch_distance(hand: Any) -> float:
    a, b = hand.landmark[_THUMB_TIP], hand.landmark[_INDEX_TIP]
    return math.hypot(a.x - b.x, a.y - b.y)


# --- main entry --------------------------------------------------------------

# Tunables. These are deliberately conservative for a Logitech C270 at
# ~60-90 cm. Recalibrate against real footage if you change cameras.
SWIPE_DX_THRESHOLD = 0.12          # normalized image x-delta
PALM_STILLNESS_THRESHOLD = 0.04    # sum of wrist motion across window
PINCH_OPEN = 0.18                  # > this distance ⇒ open
PINCH_SHUT = 0.06                  # < this distance ⇒ shut


def classify(window: list[Any]) -> dict[str, Any] | None:
    if len(window) < 2:
        return None
    first, last = window[0], window[-1]
    dx = _wrist_dx(first, last)
    motion = _wrist_motion(window)

    # Swipe (palm + significant horizontal motion). Check first because
    # a swipe is a special case of palm-open.
    if _palm_open(last) and dx > SWIPE_DX_THRESHOLD:
        return {"gesture": "mode_next", "confidence": 0.85, "payload": {}}
    if _palm_open(last) and dx < -SWIPE_DX_THRESHOLD:
        return {"gesture": "mode_prev", "confidence": 0.85, "payload": {}}

    # Lock: closed fist, persistent across the whole window (not just last).
    if all(_fist(h) for h in window):
        return {"gesture": "lock", "confidence": 0.8, "payload": {}}

    # Pinch open / shut — thumb-index distance edges. Compare last vs
    # earliest so a held pose doesn't keep firing (cooldown also gates).
    d_first, d_last = _pinch_distance(first), _pinch_distance(last)
    if d_first < PINCH_SHUT and d_last > PINCH_OPEN:
        return {"gesture": "tile_fullscreen", "confidence": 0.78, "payload": {}}
    if d_first > PINCH_OPEN and d_last < PINCH_SHUT:
        return {"gesture": "tile_minimize", "confidence": 0.78, "payload": {}}

    # Point ⇒ cycle focus.
    if _point(last):
        return {"gesture": "focus", "confidence": 0.75, "payload": {}}

    # Open palm + low motion ⇒ pause/play media.
    if _palm_open(last) and motion < PALM_STILLNESS_THRESHOLD:
        return {"gesture": "media_pause", "confidence": 0.72, "payload": {}}

    # No catch-all. `wake` means "a hand has just entered the frame", which is
    # a transition the main loop emits on the rising edge — it cannot be
    # inferred from landmark geometry, and returning it here for a *held* palm
    # was actively harmful: a palm held with slight drift falls through to this
    # point (its motion exceeds PALM_STILLNESS_THRESHOLD) and alternated with
    # `media_pause` frame-to-frame, each flip resetting the other's one-shot
    # gate so a held palm fired both about twice a second. A drifting palm is
    # simply "hand present, no gesture".
    return None


# --- cooldown / debounce -----------------------------------------------------

# Gestures that describe a *held pose* rather than a movement. classify()
# reports the same pose on every frame it is held, so these must fire once
# per occurrence — see HoldGate.
ONE_SHOT = frozenset({"lock", "media_pause", "tile_fullscreen", "tile_minimize", "wake"})


class Cooldown:
    """Per-gesture cooldown so a held pose doesn't fire every frame.

    Time source is injectable so tests don't need real wall-clock.
    """

    def __init__(self, cooldown_ms: int, *, now: Any = None) -> None:
        self._cooldown_s = cooldown_ms / 1000.0
        self._now = now or time.monotonic
        self._last: dict[str, float] = {}

    def allow(self, gesture: str) -> bool:
        t = self._now()
        last = self._last.get(gesture, 0.0)
        if t - last < self._cooldown_s:
            return False
        self._last[gesture] = t
        return True


class HoldGate:
    """Pass a held pose once per occurrence, not once per cooldown window.

    A cooldown alone is not enough for the ONE_SHOT gestures: classify()
    keeps emitting `lock` for every frame of a fist, so an 800 ms cooldown
    turned a single deliberate hold into a `lock` every 800 ms — measured:
    thirteen `lock` events from one five-second fist. `lock` disables the
    gesture service for five minutes via the HA automation, and
    `media_pause` toggles playback, so both must fire once per hold.

    The gate passes the first frame of a run and suppresses the rest until
    the pose has been absent for longer than `max_gap_s` (while a pose is
    held, classify() emits it every frame, so gaps stay ~frame-length).
    """

    def __init__(self, max_gap_s: float = 0.5, *, now: Any = None) -> None:
        self._max_gap = max_gap_s
        self._now = now or time.monotonic
        self._active: str | None = None
        self._last = 0.0

    def allow(self, gesture: str) -> bool:
        t = self._now()
        if gesture == self._active and (t - self._last) <= self._max_gap:
            self._last = t
            return False
        self._active = gesture
        self._last = t
        return True
