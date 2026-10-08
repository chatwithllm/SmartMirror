# Gesture pointer: closed palm moves, double clench selects

Status: design, agreed 2026-10-07. Supersedes the discrete-gesture-only approach
for pointer interaction; the existing discrete gestures stay as they are.

## Vocabulary

| Pose | Meaning |
|---|---|
| Fist, hand moving | the pointer follows the hand (cursor mode) |
| Fist, then open | pointer holds position where it stopped |
| Open, close, open, close within 1.2 s | **select** whatever the pointer is on |
| Fist held still >= 2.5 s without moving | **lock** (privacy: releases the camera) |

## Why this shape

- A fist is the most reliably detected pose we have on this hardware: compact,
  self-occluding and cheap for the detector, unlike an open palm whose finger
  spread varies with distance and angle.
- Movement and selection both come from the same muscle movement (closing the
  hand), so there is no mode to remember and no separate "pointing" pose to hold.
- Selection is discrete and therefore robust at the frame rate we actually get.

## The frame-rate constraint, stated plainly

The detector costs ~110 ms/frame on this box, flat across capture resolutions,
so the loop runs at ~7 fps regardless of tuning. A cursor bound 1:1 to the index
tip therefore trails the hand by 150-300 ms and overshoots. This design compensates:

- **smoothing** - the published position is an exponential moving average, not the
  raw tip, trading latency for stability;
- **magnetising** - the pointer snaps to the nearest focusable element within a
  threshold, so the UI highlights a target rather than tracking a free-floating dot;
- **no sub-pixel ambition** - targets are whole tiles and section headers, never
  small controls.

If a faster detector path is found (MediaPipe Tasks HandLandmarker is untested
here), the snapping distance can shrink and free pointing becomes viable. Until
then, snapped movement is the honest design.

## Wire format change

`POST /api/gesture` currently carries `{gesture, confidence, ts}`. A pointer needs
position, so the payload gains an optional field:

```json
{"gesture": "pointer_move", "confidence": 0.8, "ts": 1791377871.4,
 "x": 0.42, "y": 0.77, "source": "fist"}
```

`x`/`y` are normalised to the *user's* frame of reference, not the sensor's: the
camera image is already mirrored before detection, so a hand moved right produces
an increasing `x`. Coordinate frames are the single most common source of
"it moves the wrong way" bugs here and are pinned by a test.

Server-side this fans out over the existing SSE bus as a `pointer` event; the
frontend is the only thing that decides what a position means for layout. The
addon never learns about tiles.

## Failure modes this design must survive

- **Detector drops the hand mid-move.** The pointer must hold position, not jump
  to origin or to a stale average; a dropped frame is not a movement.
- **A clench during movement is not a select.** Selection requires the hand to be
  still at the moment of the second clench - otherwise moving the cursor across
  the screen would select whatever it passed.
- **Accidental lock.** The 2.5 s hold must also require stillness, so a fist used
  for positioning a pointer never locks the mirror.
- **No silent successes.** Every accepted action shows something on screen. The
  current `media_pause` silently no-ops when no player is mounted, which makes a
  working gesture indistinguishable from a broken one - the failure that wasted
  the most time in this project so far.
