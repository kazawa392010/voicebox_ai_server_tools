# VoiceBox AI Tool Server

Dịch vụ gateway Node.js 22 + TypeScript + Fastify dành cho ESP32-S3 VoiceBox AI. Server cung cấp MCP Streamable HTTP và REST API để backend AI có thể gọi các tool tìm kiếm, đọc CSV điểm học tập, tìm nhạc có giấy phép, tạo bitmap RGB565, tạo ảnh từ provider ngoài và truy vấn bản đồ.

> Đây là backend độc lập, không thay thế XiaoZhi server và không tự động làm firmware ESP32 nhận thêm tool. Đọc [`docs/XIAOZHI_INTEGRATION.md`](docs/XIAOZHI_INTEGRATION.md) trước khi nối vào backend hiện tại. Cấu hình mẫu remote MCP nằm tại [`docs/xiaozhi-mcp-servers.example.json`](docs/xiaozhi-mcp-servers.example.json).

## Tính năng có sẵn

| Tool | Trạng thái mặc định | Ghi chú |
|---|---|---|
| `voicebox.search_web` | Bật | Wikipedia; tùy chọn SearXNG |
| `voicebox.vietschool.get_scores` | Bật | CSV do người dùng xuất; hỗ trợ dấu phẩy/chấm phẩy, decimal comma và quoted multiline; chưa giả lập API chính thức |
| `voicebox.music.search` | Tắt | Jamendo, cần client ID; chỉ trả track có license CC |
| `voicebox.music.play` | Tắt | Trả direct stream URL từ provider hợp lệ |
| `voicebox.graphics.draw` | Bật | Primitive 2D |
| `voicebox.graphics.plot_2d` | Bật | Parser toán an toàn, không `eval` |
| `voicebox.graphics.plot_3d` | Bật | Wireframe z=f(x,y), giới hạn 24×24 subdivisions |
| `voicebox.image.generate` | Tắt | Provider API do người vận hành cấu hình |
| `voicebox.map.snapshot` | Tắt | OpenStreetMap standard raster tile (one tile per request, RAM cache capped at 16 unexpired tiles) |
| `voicebox.map.route` | Tắt | OSRM-compatible route; không có traffic realtime |

## Yêu cầu

- Node.js 22 trở lên.
- npm 10 trở lên.
- Một `DEVICE_API_KEY` đủ dài để bảo vệ API.
- API key riêng chỉ cần bật provider tương ứng.

## Chạy local

```powershell
Copy-Item .env.example .env
# Sửa DEVICE_API_KEY trong .env trước khi chạy
npm install
npm run dev
```

Node.js 22 tự nạp file `.env` qua `--env-file-if-exists`; không cần thêm package dotenv.

Build production:

```bash
npm run build
npm start
```

Kiểm tra:

```bash
curl http://localhost:10000/health
curl -H "Authorization: Bearer YOUR_DEVICE_API_KEY" http://localhost:10000/v1/tools
```

REST tool call:

```bash
curl -X POST http://localhost:10000/v1/tools/execute \
  -H "Authorization: Bearer YOUR_DEVICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"voicebox.graphics.plot_2d","input":{"expression":"2*x+3"}}'
```

Kết quả chứa `display.asset_url`. Gọi URL đó để nhận binary RGB565. ID asset ngẫu nhiên 128-bit chính là capability token có TTL, vì vậy endpoint asset không cần nhúng API secret hay yêu cầu Bearer token. Một frame 128×160 luôn bằng `128 * 160 * 2 = 40960` byte.

## MCP Streamable HTTP

Endpoint: `POST /mcp` (GET/DELETE cũng được chuyển tiếp cho transport MCP). SDK sử dụng MCP TypeScript SDK v2 và Streamable HTTP. Client gửi `initialize`, sau đó `tools/list`, `tools/call` theo giao thức MCP.

Ví dụ `tools/list`:

```bash
curl -X POST https://YOUR_HOST/mcp \
  -H "Authorization: Bearer YOUR_DEVICE_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

## Environment

Xem `.env.example`. Các nhóm quan trọng:

- Bảo mật: `DEVICE_API_KEY`, `RATE_LIMIT_MAX`, `REQUEST_BODY_LIMIT_BYTES`.
- Bitmap: `DISPLAY_WIDTH`, `DISPLAY_HEIGHT`, `BITMAP_ENDIAN`, `ASSET_TTL_SECONDS`, `ASSET_MAX_BYTES`.
- Search: `SEARCH_ENABLED`, `SEARXNG_BASE_URL`.
- VietSchool CSV: `VIETSCHOOL_ENABLED` chỉ dành cho adapter trực tiếp tương lai; CSV vẫn hoạt động. Chưa có API contract công khai được cấu hình nên server không tự gọi endpoint đoán mò.
- Music: `MUSIC_ENABLED=true`, `MUSIC_PROVIDER=jamendo`, `MUSIC_JAMENDO_CLIENT_ID=...`.
- Image: `IMAGE_ENABLED=true`, `IMAGE_API_URL=https://...`, `IMAGE_API_KEY=...`. Provider cần trả JSON `{ "image_base64": "...", "mime_type": "image/png" }`.
- Map: `MAP_ENABLED=true`, `MAP_PROVIDER=osm`, `OSM_CONTACT_EMAIL=...`. Standard OSM tiles are best-effort, not an unlimited free CDN; low-volume, on-demand only. `MAP_ROUTING_URL` is an optional custom OSRM-compatible route server; default demo supports driving only.

Không đặt secret trong Git. Không truyền URL tùy ý từ tool input để server fetch; URL provider chỉ đến từ ENV do người vận hành tin cậy cấu hình.

## Deploy lên Render (đã có cấu hình)

Project có sẵn `render.yaml` ở thư mục gốc. Đây là **Render Blueprint**, cấu hình Node Web Service trên Free plan tại Singapore, tự build TypeScript, chạy `npm start`, health check `/health` và tự sinh `DEVICE_API_KEY`. Các provider chưa có API key đều mặc định tắt.

Cách deploy nhanh:

1. Upload toàn bộ nội dung project lên root một GitHub repository. Không upload `.env`, `node_modules/` hoặc `dist/`.
2. Mở https://dashboard.render.com/ → **New +** → **Blueprint**.
3. Chọn repository và nhánh `main`.
4. Kiểm tra cấu hình service trong `render.yaml`, sau đó chọn **Apply**.
5. Khi deploy xong, mở `https://YOUR-SERVICE.onrender.com/health`; kết quả phải có `ok: true`.
6. Lấy `DEVICE_API_KEY` trong Render → service → **Environment** để gọi REST/MCP bằng header `Authorization: Bearer ...`.

Chi tiết từng bước, lệnh kiểm tra API và cách kết nối backend XiaoZhi nằm trong [`DEPLOY_RENDER.md`](DEPLOY_RENDER.md). Netlify không được cấu hình cho backend này vì mô hình Functions không phù hợp bằng một Web Service thường trực cho MCP + REST + binary asset endpoint.

Render Free có thể spin down khi không có traffic; RAM và bitmap asset cache bị mất khi process restart/sleep. Không dùng self-ping hoặc cron để né giới hạn. Đọc [`docs/RENDER_DEPLOY.md`](docs/RENDER_DEPLOY.md) và [BUILD_STATUS.md](BUILD_STATUS.md) trước khi triển khai thật.

## Sửa lỗi build Render ngày 2026-11-08

Nếu repository được deploy từ commit cũ và gặp lỗi TypeScript ở `app.ts`, `mcp-server.ts` hoặc `raster.ts`, áp dụng bản vá kèm theo `FIX_RENDER_TYPESCRIPT.md`. Bản vá giữ strict TypeScript, dùng Zod v4 cho MCP SDK v2 và không tắt kiểm tra kiểu. Xem `BUILD_STATUS.md` để phân biệt kiểm tra cú pháp đã chạy với full build/test chưa được xác minh do giới hạn kết nối npm trong môi trường tạo bundle.

## Kiểm thử

```bash
npm test
npm run check
```

Tests bao gồm khởi động Fastify, health, auth, MCP initialize/tools-list/tools-call, REST tools/call, giới hạn request, bitmap size/endianness, tải asset binary, parser biểu thức, đồ thị 2D/3D, CSV VietSchool, search/music qua HTTP mock, lỗi upstream, timeout, giới hạn đồng thời và giới hạn bộ nhớ. Không test nào giả vờ có API key thật của provider ngoài.

## Giới hạn có chủ đích

- VietSchool API trực tiếp chưa được bật: chỉ triển khai khi có API documentation hoặc hợp đồng tích hợp chính thức. CSV là đường dự phòng đã hoạt động.
- Search dùng Wikipedia không cần key và SearXNG nếu có instance riêng. Wikipedia không phải công cụ search toàn web.
- Music chỉ dùng Jamendo khi có client ID; chỉ lọc track có `license_ccurl`. Provider/giấy phép cần được xác minh trước khi phát hành sản phẩm.
- Image provider cần trả `image_base64` PNG/JPEG; server không chạy model tạo ảnh.
- Map snapshot dùng đúng một OpenStreetMap tile theo tọa độ, gửi User-Agent có contact và cache theo cache headers trong RAM (tối đa 16 tile chưa hết hạn; khi đầy server từ chối tile mới thay vì xóa tile cũ); cần `OSM_CONTACT_EMAIL`, attribution và không được bulk-download. Render Free làm mất cache khi spin-down/restart, nên RAM cache không bảo đảm thời hạn 7 ngày của OSM trong mọi tình huống. Giữ map tắt trên Render Free nếu chưa có cache bền vững hoặc nhà cung cấp tile có điều khoản phù hợp. OSRM public demo không có SLA và không phải dữ liệu giao thông trực tiếp.
- MCP server không có nghĩa firmware XiaoZhi tự thấy tool. Backend XiaoZhi phải được cấu hình làm MCP client hoặc expose endpoint MCP qua tính năng phù hợp.
- Bitmap RGB565 không tự hiện trên firmware XiaoZhi mặc định. Firmware/backend cần luồng nhận bitmap và vẽ TFT, xem tài liệu protocol.
