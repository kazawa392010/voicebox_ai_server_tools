# XiaoZhi integration notes

This document deliberately separates two protocols that are both called MCP in the XiaoZhi ecosystem.

## 1. Device MCP is not this cloud tool server

In the ESP32 firmware repository, `McpServer::AddTool` registers tools implemented on the device. The backend connects to the device over its configured transport (commonly WebSocket or MQTT), sends MCP `initialize`, then `tools/list`, and later `tools/call`. The wire envelope used by the device protocol wraps JSON-RPC in a XiaoZhi message such as `{ "type":"mcp", "session_id":"...", "payload":{...} }`.

That is a backend-to-device control flow. It does not mean a firmware build that only registers its local `McpServer` will automatically discover a separately hosted cloud `/mcp` endpoint.

Reference documents in the XiaoZhi ESP32 repository:

- https://github.com/78/xiaozhi-esp32/blob/main/docs/mcp-usage.md
- https://github.com/78/xiaozhi-esp32/blob/main/docs/mcp-protocol.md

## 2. Connect to the XiaoZhi server-MCP client

The current upstream `xinnan-tech/xiaozhi-esp32-server` repository includes a server-side MCP manager and a sample `mcp_server_settings.json`. Its sample explicitly supports `stdio`, `sse`, and `streamable-http`; for remote HTTP servers it uses `url`, `transport: "streamable-http"`, and a `headers` object. The sample instructs operators to copy the configuration into the backend `data` directory as `.mcp_server_settings.json`.

References (check the exact tag/commit deployed on your server):

- Sample: https://github.com/xinnan-tech/xiaozhi-esp32-server/blob/main/main/xiaozhi-server/mcp_server_settings.json
- Integration guide: https://github.com/xinnan-tech/xiaozhi-esp32-server/blob/main/docs/homeassistant-integration.md

For that backend configuration format, add this entry inside the existing `mcpServers` object (do not overwrite other MCP entries):

```json
{
  "VoiceBox AI Tool Server": {
    "url": "https://YOUR_RENDER_HOST/mcp",
    "transport": "streamable-http",
    "headers": {
      "Authorization": "Bearer YOUR_DEVICE_API_KEY"
    }
  }
}
```

Steps:

1. In the XiaoZhi backend repository, copy `xiaozhi-server/mcp_server_settings.json` into its `data` directory and name it `.mcp_server_settings.json` if the file does not already exist.
2. Merge the `VoiceBox AI Tool Server` entry into `mcpServers`; preserve all existing entries and valid JSON syntax.
3. Put the same secret as this service's `DEVICE_API_KEY` in the Bearer header. Do not commit this config file or secret to a public Git repository, and never send the secret to ESP32 firmware.
4. Restart the XiaoZhi Python/backend service so it reloads the MCP server configuration.
5. Check backend logs for a successful MCP connection and confirm the discovered tool list contains `voicebox.graphics.plot_2d`.
6. Test that graph tool before enabling external providers. Only tools enabled in this service's ENV are returned by `tools/list`.

The deployed backend still needs a client library/version that supports Streamable HTTP and a protocol version this server can negotiate. If the connection fails, verify the exact backend tag, MCP SDK version, transport support, URL, and Bearer header first. Do not assume the ESP32 firmware itself connects to this URL: the backend process is the MCP client.

## 3. If the backend has no remote MCP endpoint feature

Implement a small server-side plugin/bridge in the XiaoZhi backend:

1. Create an MCP client using the MCP SDK matching the backend's supported protocol version.
2. Connect to `https://YOUR_RENDER_HOST/mcp` using Streamable HTTP and Bearer auth.
3. On backend startup or configuration refresh, call `tools/list` and convert each tool name, description and `inputSchema` into the backend's LLM tool/function format.
4. When the LLM asks to call a tool, validate the requested name against the discovered list, then call MCP `tools/call`.
5. Parse the server's JSON response from `content[0].text` or `structuredContent`; pass `speech_text`/`data` back into the conversation.
6. Treat `display` as a separate action payload. Do not read binary images into the LLM prompt unless specifically needed.
7. Apply backend-level authorization so a device/user only sees its own account data. Do not share a VietSchool CSV between users.

Do not send the API key to the ESP32 firmware or expose it in TTS, prompts, or logs. It belongs between the backend and this server.

## 4. What the AI can see

Only enabled MCP tools appear in `tools/list`. At default settings:

- Search, VietSchool CSV import, draw, 2D graph, 3D graph are listed.
- Music, image generation and map tools are hidden until enabled by ENV.
- A tool can still return a provider-not-configured error when it is deliberately enabled without valid provider credentials; configure providers before exposing them to users.

## 5. Bitmap delivery to ESP32 TFT

The MCP response contains a display metadata object with an `asset_url`. That object is not automatically an ESP32 display instruction.

Two valid integration choices:

**Backend-mediated device command:** after a tool call returns `display.type=bitmap|chart|map`, the XiaoZhi backend sends a custom device command or invokes a custom device MCP tool that tells the firmware to fetch/display the asset.

**Firmware receiver:** add a firmware-side handler that receives a trusted asset URL, downloads the HTTPS capability URL immediately (the random asset ID authorizes this short-lived read; no API secret is put in the URL), checks `X-Image-Width`, `X-Image-Height`, `X-Pixel-Format` and exact body length, then writes pixels to the TFT. This requires firmware changes unless the existing fork already supports capability-URL RGB565 downloads.

Do not assume the stock screen preview tool accepts RGB565. A preview tool may expect JPEG or a different URL format. Confirm the current firmware implementation before wiring the result to it.

## 6. Audio delivery

`voicebox.music.play` returns `display.type=audio`, `stream_url` and format. The backend must route that result to a music-playback action, not append it to TTS. If the firmware does not have an HTTP MP3 stream player, music playback requires firmware/backend work. The server intentionally does not proxy the audio through Render.

## 7. Things that must be configured on the XiaoZhi side

- Remote MCP endpoint/client or plugin bridge.
- HTTPS endpoint and Bearer secret stored server-side.
- Tool discovery/refresh behavior.
- Conversion between MCP content and the backend's LLM tool-call format.
- Per-device/user authorization and tool visibility.
- Display action routing for RGB565 assets.
- Optional audio action routing for stream URLs.

The audio capture, ASR, LLM session and normal TTS path remain in the existing XiaoZhi stack. This service only handles tool calls.
