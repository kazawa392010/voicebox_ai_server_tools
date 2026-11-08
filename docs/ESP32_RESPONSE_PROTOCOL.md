# ESP32 response protocol

Every REST call returns one envelope:

```json
{
  "ok": true,
  "request_id": "...",
  "tool": "voicebox.graphics.plot_2d",
  "speech_text": "Đã tạo đồ thị...",
  "display": {
    "type": "chart",
    "width": 128,
    "height": 160,
    "format": "RGB565_LE",
    "asset_url": "https://service.onrender.com/v1/assets/<opaque-id>",
    "expires_in": 90
  },
  "data": { "pixel_bytes": 40960 }
}
```

## Bitmap download

Request `GET /v1/assets/:id` directly. The opaque 128-bit asset ID is a short-lived capability token; do not put `DEVICE_API_KEY` in the URL or firmware.

- HTTP body is raw binary. No Base64 wrapper.
- `Content-Type: application/octet-stream`.
- `X-Image-Width`, `X-Image-Height`, `X-Pixel-Format` metadata headers.
- `RGB565_LE` means each pixel is a 16-bit value written low byte first. For 128×160 the exact body length is 40960 bytes.
- URL expires after `ASSET_TTL_SECONDS` or earlier if the RAM cap evicts it. Fetch immediately.
- If your firmware expects big-endian RGB565, set `BITMAP_ENDIAN=BE` and rebuild/redeploy the server config.

## Important firmware/backend work

The default XiaoZhi screen image tool commonly expects a URL/image workflow, not necessarily this raw RGB565 protocol. A firmware receiver must request the authenticated binary with an HTTP client, validate width/height/format/length, and pass pixels to the TFT driver. Do not pass `RGB565_LE` to a JPEG decoder. If the backend owns the device MCP connection, it can translate the structured tool response into a device-side display command.

## Audio

`voicebox.music.search` returns metadata. `voicebox.music.play` returns `display.type=audio` plus a provider stream URL. The backend/firmware must route that URL to an audio playback component; TTS output is not the same thing as music playback. The ESP32 should connect to the source directly so the Render service does not proxy the audio body.
