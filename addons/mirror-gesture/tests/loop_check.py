#!/usr/bin/env python3
"""End-to-end test of the gesture service main loop, with no camera needed.

Substitutes the two hardware-ish pieces — the V4L2 capture and MediaPipe's
Hands — and drives the REAL main loop (config → capture → classify →
cooldown → HTTP publish). A stub HTTP server stands in for the SvelteKit
/api/gesture route and records exactly what arrived, so the wire format,
the bearer header and the cooldown behaviour are all asserted rather than
assumed.

Run inside the service venv:
    cd /opt/mirror/gesture && .venv/bin/python tests/loop_check.py
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pose_check import Hand, LM, parse_hands, shifted  # noqa: E402

PORT = 3111
TOKEN = "test-token-not-a-real-secret"
received: list[dict] = []
HERE = Path(__file__).resolve().parent


class Handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802
        raw = self.rfile.read(int(self.headers.get("content-length", 0)))
        try:
            body = json.loads(raw or b"{}")
        except Exception:
            body = {"<unparseable>": raw[:200].decode("utf-8", "replace")}
        received.append({
            "path": self.path,
            "auth": self.headers.get("authorization"),
            "ctype": self.headers.get("content-type"),
            "body": body,
        })
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"ok":true}')

    def log_message(self, *a):
        pass


def palm_like(hand: Hand) -> bool:
    return all(hand.landmark[t].y < hand.landmark[m].y
               for t, m in ((8, 5), (12, 9), (16, 13), (20, 17)))


def main() -> int:
    data = Path(os.environ.get("HAND_DIR", str(HERE.parent / "testdata")))
    hands: list[Hand] = []
    for path in sorted(data.iterdir()):
        if path.suffix in {".pbtxt", ".prototxt"}:
            hands.extend(parse_hands(path))
    open_palm = next((h for h in hands if palm_like(h)), None)
    fist = next((h for h in hands if h is not open_palm and not palm_like(h)), None)
    if open_palm is None or fist is None:
        print(f"need an open palm and a closed hand in {data}")
        return 2
    print(f"geometry: {len(hands)} real hand sets; using open palm + "
          f"{'fist' if fist else '?'} from testdata")

    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    os.environ.update({
        "MIRROR_LOCAL_URL": f"http://127.0.0.1:{PORT}",
        "MIRROR_GESTURE_TOKEN": TOKEN,
        "HA_URL": "", "HA_TOKEN": "",
        "FACE_BLUR": "0",
        "FPS_LIMIT": "15",
        "GESTURE_COOLDOWN_MS": "800",
        "CAMERA_INDEX": "0",
    })

    import cv2
    import mediapipe as mp
    import numpy as np
    import mirror_gesture.main as svc

    class FakeCap:
        opened = True

        def __init__(self, *_a, **_k):
            pass

        def isOpened(self):  # noqa: N802
            return self.opened

        def set(self, *_a):
            return True

        def read(self):
            # Two-tone capture: dark left, bright right. The loop must mirror
            # it before detection, so the detector sees it bright on the LEFT.
            f = np.zeros((480, 640, 3), dtype=np.uint8)
            f[:, :320] = 30
            f[:, 320:] = 220
            return True, f

        def release(self):
            pass

    # Frame script: open palm held (→ wake on entry, then media_pause once),
    # a fast right swipe (→ mode_next), the hand leaving, then a held fist
    # (→ lock). Mirrors the documented demo order.
    step = 0.12
    script = (
        [("h", [open_palm])] * 5
        + [("none", None)]                      # ONE dropped detection frame
        + [("h", [open_palm])] * 3              # palm still held
        + [("h", [shifted(open_palm, dx)]) for dx in (-step, 0.0, step)]
        + [("none", None)] * 30                 # hand genuinely leaves (>0.7s)
        + [("h", [fist])] * 5
    )
    calls = {"i": 0}
    state: dict = {}

    class Result:
        def __init__(self, lm):
            self.multi_hand_landmarks = lm

    class StubHands:
        def __init__(self, **_k):
            pass

        def process(self, rgb):
            # Record what the detector actually received, so the x-mirror is
            # verified from the frame rather than assumed.
            state["left_third_mean"] = float(rgb[:, :100].mean())
            kind, payload = script[min(calls["i"], len(script) - 1)]
            calls["i"] += 1
            return Result(None if kind == "none" else list(payload))

        def close(self):
            pass

    cv2.VideoCapture = FakeCap
    svc.pick_camera = lambda *_: 0
    mp.solutions.hands.Hands = StubHands
    svc.signal.signal = lambda *_: None  # test owns the lifecycle

    threading.Thread(target=svc.main, daemon=True).start()
    time.sleep(11)

    fails: list[str] = []
    print(f"\n{len(received)} POST(s) received")
    for r in received:
        print(f"  {r['path']}  auth={'ok' if r['auth'] else 'NONE'}  {r['body']}")

    if not received:
        fails.append("no POSTs at all — the loop never published")
    for r in received:
        if r["path"] != "/api/gesture":
            fails.append(f"wrong path: {r['path']}")
        if r["auth"] != f"Bearer {TOKEN}":
            fails.append(f"bad/missing bearer: {r['auth']!r}")
        if r["ctype"] != "application/json":
            fails.append(f"wrong content-type: {r['ctype']!r}")
        b = r["body"]
        if set(b) != {"gesture", "confidence", "ts"}:
            fails.append(f"unexpected body keys: {sorted(b)}")
        if not (0.0 <= float(b.get("confidence", -1)) <= 1.0):
            fails.append(f"confidence out of range: {b.get('confidence')}")
        if abs(float(b.get("ts", 0)) - time.time()) > 120:
            fails.append(f"ts is not a recent unix timestamp: {b.get('ts')}")

    gestures = [r["body"].get("gesture") for r in received]
    print(f"\ngesture sequence: {gestures}")
    counts = Counter(gestures)
    print(f"per-gesture counts: {dict(counts)}")

    # Mirror geometry: the detector must see the mirrored capture (a pitch
    # seen through a one-way mirror is reversed), or every left/right gesture
    # is inverted for the person standing in front of it.
    if state.get("left_third_mean", 0) < 150:
        fails.append(f"frame was NOT mirrored before detection "
                     f"(left third mean {state.get('left_third_mean', 0):.0f}, want >150)")
    if "mode_next" not in gestures:
        fails.append("swipe right never produced mode_next")
    if "lock" not in gestures:
        fails.append("held fist never produced lock")
    if counts.get("lock", 0) != 1:
        fails.append(f"held fist produced {counts.get('lock', 0)} `lock` events, want exactly 1 "
                     f"— each extra one disables the gesture service for 5 minutes")
    # Regression: a dropped detection frame must not look like a new entry.
    wake_ts = [float(r["body"]["ts"]) for r in received
               if r["body"].get("gesture") == "wake"]
    too_close = [round(b - a, 2) for a, b in zip(wake_ts, wake_ts[1:]) if b - a < 1.5]
    if too_close:
        fails.append(f"wake re-fired inside the 1.5s hand-gone horizon: {too_close}")
    if not gestures or gestures[0] != "wake":
        fails.append("hand entering frame did not publish wake first "
                     "(the demo's proof-of-life step)")

    # Cooldown: repeated identical frames inside one 800 ms window must
    # produce one event. `wake` is a rising-edge event, counted separately.
    leaks = {g: n for g, n in counts.items()
             if n > 1 and g not in ("wake", "mode_next", "mode_prev")}
    if leaks:
        fails.append(f"cooldown leak — repeated fires: {leaks}")

    print(f"\n{len(fails)} failure(s)")
    for f in fails:
        print("  -", f)
    print("RESULT:", "FAIL" if fails else "PASS")
    sys.stdout.flush()
    os._exit(1 if fails else 0)


if __name__ == "__main__":
    main()
