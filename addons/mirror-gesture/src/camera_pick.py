"""Pick the first capture-capable /dev/videoN.

Some Logitech webcams (Brio, C920) enumerate as multiple /dev/video*
nodes — typically /dev/video0 (capture) and /dev/video1 (metadata).
Hardcoding /dev/video0 gambles on enumeration order, which can flip
across reboots after a USB renumbering. We probe with `v4l2-ctl
--info` and pick the first node whose capabilities include "Video
Capture". Falls back to /dev/video0 if v4l2-ctl is unavailable.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
from pathlib import Path

log = logging.getLogger("mirror-gesture.camera_pick")


def _capture_capable(dev: Path) -> bool:
    if not shutil.which("v4l2-ctl"):
        # Without v4l2-ctl we can't introspect; assume yes and let
        # OpenCV reject it if it's wrong. The Logitechs we care about
        # typically have video0 as capture anyway.
        return True
    try:
        out = subprocess.run(
            ["v4l2-ctl", "--device", str(dev), "--info"],
            capture_output=True,
            text=True,
            timeout=2,
            check=False,
        )
    except (subprocess.TimeoutExpired, OSError) as exc:
        log.warning("v4l2-ctl probe failed for %s: %s", dev, exc)
        return False
    return "Video Capture" in (out.stdout or "")


def pick(explicit_index: int | None) -> int:
    """Return a /dev/videoN index. Honours an explicit index when set."""
    if explicit_index is not None:
        log.info("camera index %d (explicit)", explicit_index)
        return explicit_index

    devices = sorted(Path("/dev").glob("video*"))
    for dev in devices:
        # /dev/video10+ exists on some boards; we just want the index.
        try:
            idx = int(dev.name.removeprefix("video"))
        except ValueError:
            continue
        if _capture_capable(dev):
            log.info("camera index %d (auto-picked from %s)", idx, dev)
            return idx

    log.warning("no capture-capable /dev/video* found; defaulting to 0")
    return 0
