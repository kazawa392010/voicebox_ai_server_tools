# Architecture

```text
VoiceBox ESP32-S3
  | audio/session protocol (unchanged)
  v
XiaoZhi backend / LLM
  | server-MCP client or plugin bridge (must be configured)
  v
VoiceBox AI Tool Server (Fastify)
  |-- MCP Streamable HTTP (/mcp)
  |-- REST (/v1/tools/execute)
  |-- ToolRegistry -> ToolExecutor -> providers
  |-- RAM AssetStore (TTL + count/byte caps)
  `-- health (/health)
```

## Design decisions

- Stateless HTTP request handling. MCP handler is constructed per request via the MCP SDK factory. No application session state, DB or Redis.
- All tool definitions live in one registry. REST and MCP call the same executor, validators and timeout boundary.
- External provider URLs are operator configuration, never arbitrary user input. This reduces SSRF risk.
- Tool-level enable flags are evaluated at startup. `/v1/tools` returns enabled state; MCP only advertises enabled tools.
- AssetStore is an in-memory FIFO/TTL store capped by number of assets and aggregate bytes. Assets disappear on restart or service spin-down.
- Graphics are rasterized in-process with bounded width/height, command count, expression length and 3D resolution.
- No `eval`, `new Function`, browser engine, local AI model, filesystem asset cache, background worker or self-ping.

## Dependencies

- Fastify 5: HTTP server and request lifecycle.
- `@fastify/rate-limit`: per-instance IP rate limit.
- MCP SDK v2 packages: official MCP server + Node request adapter, mounted on the native Fastify instance and implementing the 2026-07-28 protocol specification.
- Zod 4: runtime schema validation.
- `pngjs` and `jpeg-js`: pure-JS PNG/JPEG decode for configured image/map providers.

## Limits and failure isolation

The executor rejects work above the configured concurrency cap, validates input before execution, and applies a per-tool timeout/AbortSignal. Provider errors are translated into a small error envelope; provider credentials and private student data are not logged. Synchronous raster tasks have strict maximum input sizes/resolutions because JavaScript timers cannot preempt a running CPU loop.
