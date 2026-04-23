"""Camera capture helpers. Kept isolated so tests can mock it."""

from __future__ import annotations

from typing import Any


def open_camera(index: int, resolution: list[int]) -> Any:
    import cv2

    cap = cv2.VideoCapture(int(index))
    if resolution and len(resolution) == 2:
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, resolution[0])
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, resolution[1])
    return cap
