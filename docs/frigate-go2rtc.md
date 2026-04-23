# Frigate + go2rtc config snippet

The FrigateCameraTile consumes a go2rtc WebSocket stream. Point it at the
HA addon's go2rtc instance (port 1984 by default).

## Addon configuration excerpt

```yaml
# frigate addon config
go2rtc:
  streams:
    driveway:
      - rtsp://camuser:passwd@10.0.0.12:554/stream1
      - ffmpeg:driveway#audio=opus
    backyard:
      - rtsp://camuser:passwd@10.0.0.13:554/stream1
```

## Frontend wiring

```json
{
  "id": "cam-drive",
  "type": "frigate_camera",
  "props": {
    "camera": "driveway",
    "go2rtc_base": "http://frigate.local:1984",
    "stream": "mse",
    "muted": true
  }
}
```

## Latency targets

| Stream | Target | Notes |
|--------|--------|-------|
| MSE | <500 ms | Default path on Chromium |
| WebRTC | <200 ms | Fallback if MSE unsupported |

`chrome://media-internals` shows the decoder in use; VaapiVideoDecoder
means hardware-accelerated decode is active.
