#!/usr/bin/env python3
"""Verify the gesture classifier against REAL MediaPipe hand geometry.

The pose heuristics in gestures.py are hand-rolled (y-axis finger extension,
wrist-x deltas, raw thumb-index distance). Those are exactly the parts of the
system that can be wrong in a way that only shows up in front of a camera, so
this checks them against the landmark prototxts Google ships for named poses
(fist / pointing_up / thumb_up / victory, the canonical upright hand, and the
holistic-result hands from a full-height photo) rather than invented
coordinates.

Run inside the service venv:
    cd /opt/mirror/gesture && .venv/bin/python tests/pose_check.py testdata
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from mirror_gesture.gestures import (
    PALM_STILLNESS_THRESHOLD,
    PINCH_OPEN,
    PINCH_SHUT,
    SWIPE_DX_THRESHOLD,
    _fist,
    _palm_open,
    _pinch_distance,
    _point,
    _wrist_motion,
    classify,
)

HAND_SECTIONS = {"landmarks", "left_hand_landmarks", "right_hand_landmarks"}


class LM:
    __slots__ = ("x", "y", "z")

    def __init__(self, x: float, y: float, z: float = 0.0) -> None:
        self.x, self.y, self.z = float(x), float(y), float(z)


class Hand:
    def __init__(self, pts: list[LM]) -> None:
        self.landmark = pts


def _groups(text: str):
    """Yield (name, body) for every braced group, via brace matching."""
    stack: list[tuple[str, int]] = []
    for m in re.finditer(r"([A-Za-z_]\w*)\s*\{|\{|\}", text):
        if m.group(0) == "}":
            if stack:
                name, start = stack.pop()
                yield name, text[start:m.start()]
        else:
            stack.append((m.group(1) or "", m.end()))


def _points(body: str) -> list[LM]:
    pts = []
    for lm in re.finditer(r"landmark\s*\{([^}]*)\}", body):
        d = dict(re.findall(r"(\w+):\s*(-?[\d.eE+-]+)", lm.group(1)))
        if "x" in d and "y" in d:
            pts.append(LM(d["x"], d.get("y", 0.0), d.get("z", 0.0)))
    return pts


def parse_hands(path: Path) -> list[Hand]:
    text = path.read_text()
    hands = [Hand(p) for name, body in _groups(text) if name in HAND_SECTIONS
             for p in [_points(body)] if len(p) == 21]
    if not hands:
        # Bare top-level list of 21 landmark blocks (expected_*_hand_landmarks).
        p = _points(text)
        if len(p) == 21:
            hands.append(Hand(p))
    return hands


def d(a: LM, b: LM) -> float:
    return ((a.x - b.x) ** 2 + (a.y - b.y) ** 2) ** 0.5


def shifted(hand: Hand, dx: float) -> Hand:
    return Hand([LM(l.x + dx, l.y, l.z) for l in hand.landmark])


def pinched(hand: Hand, scale: float) -> Hand:
    pts = [LM(l.x, l.y, l.z) for l in hand.landmark]
    it, tt = pts[8], pts[4]
    tt.x = it.x + (tt.x - it.x) * scale
    tt.y = it.y + (tt.y - it.y) * scale
    return Hand(pts)


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "testdata")
    files = sorted(f for f in root.iterdir() if f.suffix in {".pbtxt", ".prototxt"})
    print(f"thresholds: swipe_dx={SWIPE_DX_THRESHOLD} pinch_shut={PINCH_SHUT} "
          f"pinch_open={PINCH_OPEN} stillness={PALM_STILLNESS_THRESHOLD}\n")

    findings: list[str] = []
    open_hands: list[tuple[str, Hand]] = []

    for path in files:
        for i, hand in enumerate(parse_hands(path)):
            pose = {
                "palm_open": _palm_open(hand), "fist": _fist(hand), "point": _point(hand),
                "thumb_i8": round(d(hand.landmark[4], hand.landmark[8]), 3),
                "thumb_i5": round(d(hand.landmark[4], hand.landmark[5]), 3),
                "still": classify([hand] * 3),
            }
            still = pose["still"]
            name = f"{path.name}" + (f"#{i}" if i else "")
            print(f"{name}\n  {pose}")
            if pose["palm_open"]:
                open_hands.append((name, hand))

    print("\n--- intended mapping, exercised with real geometry ---")

    def verdict(label: str, got, want: str) -> None:
        name = (got or {}).get("gesture")
        ok = name == want
        print(f"  [{'PASS' if ok else 'FAIL'}] {label:<32} -> {str(name):<16} (want {want})")
        if not ok:
            findings.append(f"{label}: got {name}, want {want}")

    if open_hands:
        label, hand = open_hands[0]
        step = SWIPE_DX_THRESHOLD
        verdict(f"swipe right ({label})",
                classify([shifted(hand, -step), shifted(hand, 0.0), shifted(hand, step)]), "mode_next")
        verdict(f"swipe left ({label})",
                classify([shifted(hand, step), shifted(hand, 0.0), shifted(hand, -step)]), "mode_prev")
        d0 = _pinch_distance(hand)
        shut_s, open_s = PINCH_SHUT * 0.5 / d0, PINCH_OPEN * 1.5 / d0
        verdict("pinch open",
                classify([pinched(hand, shut_s), hand, pinched(hand, open_s)]), "tile_fullscreen")
        verdict("pinch shut",
                classify([pinched(hand, open_s), hand, pinched(hand, shut_s)]), "tile_minimize")
        verdict("open palm held still", classify([hand] * 3), "media_pause")
        print(f"  note: real thumb-index distance d0={d0:.3f} "
              f"(thresholds {PINCH_SHUT} shut / {PINCH_OPEN} open)")
    else:
        findings.append("no real open-palm geometry in testdata — palm_open never true, "
                        "so wake/media_pause/mode_next cannot be validated")

    for path in files:
        for hand in parse_hands(path):
            if "fist" in path.name and _fist(hand):
                verdict("fist held", classify([hand] * 3), "lock")
                break
        for hand in parse_hands(path):
            if "pointing" in path.name and _point(hand):
                verdict("index pointing", classify([hand] * 3), "focus")
                break

    # Cross-pose collisions: a pose whose OWN name is not in the vocabulary
    # must not silently fire an unrelated gesture.
    for path in files:
        for hand in parse_hands(path):
            got = (classify([hand] * 3) or {}).get("gesture")
            if "thumb_up" in path.name and got == "lock":
                findings.append(
                    "thumb_up classifies as `lock` — _fist() ignores the thumb, so a "
                    "thumbs-up (a friendly, common gesture) disables the gesture service "
                    "for 5 minutes via the HA lock automation")
                break

    print(f"\n{len(findings)} finding(s)")
    for f in findings:
        print("  -", f)
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
