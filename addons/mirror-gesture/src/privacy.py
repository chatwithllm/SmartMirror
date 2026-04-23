"""Gaussian blur over detected face bboxes before any hand processing."""

from __future__ import annotations

from typing import Any


def blur_faces(frame: Any) -> Any:
    try:
        import cv2
    except Exception:
        return frame

    # Use built-in Haar cascade for lightweight face detect.
    face_cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    cascade = cv2.CascadeClassifier(face_cascade_path)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = cascade.detectMultiScale(gray, scaleFactor=1.3, minNeighbors=5)
    for (x, y, w, h) in faces:
        roi = frame[y:y + h, x:x + w]
        frame[y:y + h, x:x + w] = cv2.GaussianBlur(roi, (25, 25), 0)
    return frame
