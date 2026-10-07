"""One-shot diagnostic for the gesture service — check every link separately.

    sudo -u mirror /opt/mirror/gesture/.venv/bin/python -m mirror_gesture.selftest
    sudo -u mirror …selftest --fire      # also publish a real `wake` gesture

Every dependency is exercised in isolation so a failure names the broken
link instead of surfacing as "gestures don't work". Read-only against the
kiosk: the default auth probe deliberately sends an UNKNOWN gesture name,
which the server rejects with 400 *after* the bearer check passes — so a
wrong token is distinguishable from a right one without pushing a gesture
into the UI.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

PASS, WARN, FAIL = "PASS", "WARN", "FAIL"
results: list[tuple[str, str, str]] = []


def check(status: str, label: str, detail: str = "") -> None:
    results.append((status, label, detail))
    print(f"[{status}] {label}" + (f" — {detail}" if detail else ""))


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    fire = "--fire" in argv

    print(f"python {sys.version.split()[0]}  uid={os.getuid()}  cwd={os.getcwd()}\n")

    # --- 1. vision stack -----------------------------------------------------
    try:
        import cv2
        import mediapipe as mp
        import numpy as np

        check(PASS, "imports", f"cv2 {cv2.__version__} | numpy {np.__version__} | mediapipe {mp.__version__}")
        if not mp.__version__.startswith("0.10."):
            check(FAIL, "mediapipe pin", f"expected 0.10.x (mp.solutions), got {mp.__version__}")
        if not np.__version__.startswith("1."):
            check(WARN, "numpy pin", f"expected <2, got {np.__version__}")
        try:
            hands = mp.solutions.hands.Hands(max_num_hands=1)
            hands.close()
            check(PASS, "mp.solutions.hands", "constructs")
        except Exception as exc:  # noqa: BLE001
            check(FAIL, "mp.solutions.hands", repr(exc))
        haar = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        check(PASS if os.path.exists(haar) else WARN, "face-blur cascade",
              "present" if os.path.exists(haar) else "missing (FACE_BLUR would no-op)")
    except Exception as exc:  # noqa: BLE001
        check(FAIL, "vision stack import", repr(exc))
        return summary()

    # --- 2. config ----------------------------------------------------------
    from .camera_pick import pick as pick_camera
    from .config import load as load_config

    cfg = load_config()
    check(PASS, "config", f"local={cfg.local_url} ha={cfg.ha_url or '<disabled>'} "
                          f"blur={cfg.face_blur} fps={cfg.fps_limit} cooldown={cfg.cooldown_ms}ms "
                          f"floor={cfg.confidence_floor}")
    check(PASS if cfg.local_token else FAIL, "bearer token",
          f"{len(cfg.local_token)} chars" if cfg.local_token else
          "MIRROR_GESTURE_TOKEN empty — nothing will be published")

    # --- 3. camera ----------------------------------------------------------
    try:
        idx = pick_camera(cfg.camera_index)
        cap = cv2.VideoCapture(idx)
        if not cap.isOpened():
            check(FAIL, "camera open", f"index {idx} would not open — not in the `video` group, "
                                       f"device absent, or held by another process")
        else:
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, cfg.width)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, cfg.height)
            frame = None
            for _ in range(30):  # some UVC cams need a moment for the first frame
                ok, f = cap.read()
                if ok and f is not None:
                    frame = f
                    break
                time.sleep(0.1)
            if frame is None:
                check(FAIL, "camera read", "opened but returned no frame")
            else:
                h, w = frame.shape[:2]
                check(PASS, "camera read", f"index {idx} {w}x{h} "
                                           f"mean_luma={frame.mean():.1f}")
                if frame.mean() < 15:
                    check(WARN, "camera image", "very dark — MediaPipe needs ~200 lux on the hand")
                # A quick live detector proof, using the real model.
                res = mp.solutions.hands.Hands(max_num_hands=1).process(
                    cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                check(PASS if res.multi_hand_landmarks else WARN, "hand detection",
                      "hand found" if res.multi_hand_landmarks else
                      "no hand in frame right now (expected unless you are waving at it)")
        cap.release()
    except Exception as exc:  # noqa: BLE001
        check(FAIL, "camera", repr(exc))

    # --- 4. local UI bus ----------------------------------------------------
    url = f"{cfg.local_url.rstrip('/')}/api/gesture"
    gesture = "wake" if fire else "__selftest__"
    body = json.dumps({"gesture": gesture, "confidence": 1.0, "ts": time.time()}).encode()
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {cfg.local_token}",
    })
    try:
        with urllib.request.urlopen(req, timeout=3) as resp:
            check(PASS, "POST /api/gesture", f"HTTP {resp.status} {resp.read()[:40].decode(errors='replace')}")
    except urllib.error.HTTPError as exc:
        if exc.code == 400:
            check(PASS, "POST /api/gesture",
                  "HTTP 400 bad gesture — expected: bearer accepted, unknown name rejected "
                  "(nothing was published)")
        elif exc.code == 403:
            check(FAIL, "POST /api/gesture",
                  "HTTP 403 — token mismatch with the frontend, or MIRROR_GESTURE_TOKEN is unset "
                  "in its environment. Re-run the installer to regenerate and restart both units.")
        else:
            check(WARN, "POST /api/gesture", f"HTTP {exc.code}")
    except Exception as exc:  # noqa: BLE001
        check(FAIL, "POST /api/gesture", f"{type(exc).__name__}: {exc}")

    # --- 5. SSE channel -----------------------------------------------------
    try:
        with urllib.request.urlopen(f"{cfg.local_url.rstrip('/')}/api/gesture/stream", timeout=3) as resp:
            first = resp.readline().decode(errors="replace").strip()
            check(PASS if first.startswith(":") else WARN, "SSE /api/gesture/stream",
                  f"first line: {first[:60]!r}")
    except Exception as exc:  # noqa: BLE001
        check(FAIL, "SSE /api/gesture/stream", repr(exc))

    # --- 6. HA side channel -------------------------------------------------
    if cfg.ha_url:
        try:
            r = urllib.request.Request(f"{cfg.ha_url}/api/states/{cfg.enable_entity}",
                                       headers={"Authorization": f"Bearer {cfg.ha_token}"})
            with urllib.request.urlopen(r, timeout=3) as resp:
                state = json.loads(resp.read().decode()).get("state")
                check(PASS if state == "on" else WARN, f"HA {cfg.enable_entity}",
                      f"state={state}" + ("" if state == "on" else
                                          " — the service will NOT acquire the camera"))
        except urllib.error.HTTPError as exc:
            check(FAIL, "HA enable entity", f"HTTP {exc.code} — check HA_URL/HA_TOKEN and that the "
                                            f"helper exists")
        except Exception as exc:  # noqa: BLE001
            check(WARN, "HA enable entity", f"{type(exc).__name__}: {exc} (defaults to enabled)")
    else:
        check(WARN, "HA side channel", "HA_URL unset — mode_next/mode_prev/lock will be local-only")

    return summary()


def summary() -> int:
    n = {s: sum(1 for r in results if r[0] == s) for s in (PASS, WARN, FAIL)}
    print(f"\n{n[PASS]} pass, {n[WARN]} warn, {n[FAIL]} fail")
    for status, label, detail in results:
        if status == FAIL:
            print(f"  FAIL {label}: {detail}")
    return 1 if n[FAIL] else 0


if __name__ == "__main__":
    raise SystemExit(main())
