# Verify Plex HW decode on the mirror box

## 1. Confirm Chromium sees VA-API

On the mirror box, open `chrome://gpu` in the kiosk session (accessible via
keyboard if you temporarily drop out of `--kiosk`):

Expected rows:

- **Video Decode** · `Hardware accelerated`
- **Vulkan** · `Disabled` (OK — we rely on VA-API + GBM)

If `Video Decode` is `Software only`, enable VA-API:

```
chrome://flags/#enable-features-VaapiVideoDecoder  → Enabled
chrome://flags/#ignore-gpu-blocklist               → Enabled
```

The flags are already forced by `installer/chromium/mirror-kiosk.sh`.

## 2. Play a title, then open `chrome://media-internals`

Start the Plex tile (relax mode), then `chrome://media-internals` →
*Active Players* → expand the current player. Look for:

```
video_decoder   VaapiVideoDecoder
hw_decoded      true
```

If `VideoDecoderSoftwareDecoder` appears, then Plex is sending a codec
Chromium's VA-API can't accept (H.265 on some older Celerons, or HDR
in a format the panel can't play through). Either:

1. Lower `maxVideoBitrate` in `RES_CAPS` (see `lib/resolution/tile-props.ts`)
2. Force Plex direct-play with H.264 by setting `_meta.forceDirectPlay: true`
   on the `plex_player` tile props (Phase 05 honors the field)
3. Drop the panel resolution via `mirror.set_resolution` to 1080p

## 3. Benchmark

```bash
vainfo            # profiles list — needs H.264 at minimum
intel_gpu_top     # per-engine GPU usage while the tile plays
```

`Render/3D` engine should be mostly idle; `Video` engine should sit around
30–60% during 4K playback. If `Render/3D` climbs, software decode is active.

## 4. Decode errors

When the frontend detects a fatal hls.js error it emits a
`mirror:decode_failed` DOM event and the Plex tile swaps to a static
poster overlay. Subscribe on the HA side by listening for that event via
the frontend's telemetry POST (Phase 14 adds the forward).
