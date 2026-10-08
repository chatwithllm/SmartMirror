"""Module entry point so `python -m mirror_gesture` works.

The systemd unit's ExecStart is `python -m mirror_gesture`; without
this file that invocation fails with "No module named
mirror_gesture.__main__" and the service dies before opening the
camera.
"""

from .main import main

if __name__ == "__main__":
    raise SystemExit(main())
