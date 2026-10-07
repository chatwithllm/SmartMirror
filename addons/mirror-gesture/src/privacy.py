"""Gaussian blur over detected face bboxes before any hand processing."""

from __future__ import annotations

from typing import Any

_CASCADE: Any = None


def _cascade() -> Any:
    """Load the Haar cascade once.

    The previous version built a CascadeClassifier on every frame, which
    re-reads and re-parses the XML ~15x a second for the life of the
    service. It is the same file every time; cache it.
    """
    global _CASCADE
    if _CASCADE is None:
        import cv2

        _CASCADE = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
    return _CASCADE


def blur_faces(frame: Any) -> Any:
    try:
        import cv2
    except Exception:
        return frame

    cascade = _cascade()
    if cascade.empty():
        # Cascade unavailable — fail open on the frame, but the operator
        # should know the privacy step is not being applied.
        return frame

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = cascade.detectMultiScale(gray, scaleFactor=1.3, minNeighbors=5)
    for (x, y, w, h) in faces:
        roi = frame[y:y + h, x:x + w]
        if roi.size:
            frame[y:y + h, x:x + w] = cv2.GaussianBlur(roi, (25, 25), 0)
    return frame
