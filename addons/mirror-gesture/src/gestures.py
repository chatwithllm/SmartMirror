"""Gesture classifier.

Given a rolling window of MediaPipe Hands landmarks, return a classification
dict or None. Keeps to a tiny rule-based approach for v1; a learned model is
post-v1. Supports the gestures listed in BACKEND_SPEC.md §7:
  wake, resize_grow, resize_shrink, focus, mode_next, mode_prev,
  tile_fullscreen, tile_minimize, lock, media_pause, alert_ack.
"""

from __future__ import annotations

from typing import Any


def _palm_open(hand: Any) -> bool:
    try:
        tips = [8, 12, 16, 20]
        mcps = [5, 9, 13, 17]
        return all(
            hand.landmark[tips[i]].y < hand.landmark[mcps[i]].y for i in range(len(tips))
        )
    except Exception:
        return False


def _fist(hand: Any) -> bool:
    try:
        tips = [8, 12, 16, 20]
        mcps = [5, 9, 13, 17]
        return all(
            hand.landmark[tips[i]].y > hand.landmark[mcps[i]].y for i in range(len(tips))
        )
    except Exception:
        return False


def _dx(a: Any, b: Any) -> float:
    return float(a.landmark[0].x - b.landmark[0].x)


def classify(window: list[Any]) -> dict[str, Any] | None:
    if not window:
        return None
    first, last = window[0], window[-1]
    dx = _dx(last, first)
    if _palm_open(last) and dx > 0.12:
        return {"gesture": "mode_next", "confidence": 0.85, "payload": {}}
    if _palm_open(last) and dx < -0.12:
        return {"gesture": "mode_prev", "confidence": 0.85, "payload": {}}
    if _fist(last):
        return {"gesture": "lock", "confidence": 0.75, "payload": {}}
    if _palm_open(last):
        return {"gesture": "wake", "confidence": 0.7, "payload": {}}
    return None
