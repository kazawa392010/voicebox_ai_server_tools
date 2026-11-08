# Deploy VoiceBox AI Tool Server lên Render

Project này đã cấu hình theo kiểu **Render Blueprint** bằng file `render.yaml` ở thư mục gốc. Nên dùng Render thay vì Netlify cho backend này vì VoiceBox là Node.js Web Service có REST API, MCP Streamable HTTP và endpoint binary tải bitmap.

## 1. Chuẩn bị source trên GitHub

1. Tải và giải nén `voicebox-tool-server.zip`.
2. Tạo một repository mới trên GitHub, ví dụ `voicebox-tool-server`.
3. Upload **toàn bộ nội dung bên trong thư mục** `voicebox-tool-server` lên root của repository. Không upload cả thư mục lồng thêm một cấp.
4. Đảm bảo thấy `render.yaml`, `package.json`, `src/`, `tests/` ngay ở trang đầu repository.
5. Không upload `.env`, `node_modules/`, `dist/` hoặc API key thật. `.gitignore` đã cấu hình các mục này.
6. Commit lên nhánh `main`.

## 2. Tạo service từ Blueprint

1. Mở https://dashboard.render.com/.
2. Chọn **New +** → **Blueprint**.
3. Kết nối GitHub nếu Render yêu cầu.
4. Chọn repository `voicebox-tool-server` và nhánh `main`.
5. Render đọc `render.yaml`. Kiểm tra service `voicebox-ai-tool-server`, region `Singapore`, plan `Free`.
6. Chọn **Apply** để tạo service và bắt đầu deploy.

Blueprint tự tạo `DEVICE_API_KEY` bằng `generateValue: true`; không cần tự ghi secret vào GitHub. Các provider cần API key riêng đang để tắt để deploy lần đầu an toàn.

## 3. Kiểm tra sau deploy

Render sẽ cung cấp domain dạng `https://voicebox-ai-tool-server.onrender.com` (tên có thể được Render yêu cầu đổi nếu đã tồn tại).

Mở endpoint health:

```text
https://YOUR-SERVICE.onrender.com/health
```

Kết quả cần có `ok: true`.

Để gọi endpoint được bảo vệ, vào Render → service → **Environment**, sao chép giá trị `DEVICE_API_KEY` và dùng trong header `Authorization: Bearer ...`. Không đưa key này vào firmware, URL, GitHub hoặc ảnh chụp công khai.

Lấy danh sách tool:

```bash
curl -H "Authorization: Bearer YOUR_DEVICE_API_KEY" \
  https://YOUR-SERVICE.onrender.com/v1/tools
```

Thử vẽ đồ thị 2D:

```bash
curl -X POST https://YOUR-SERVICE.onrender.com/v1/tools/execute \
  -H "Authorization: Bearer YOUR_DEVICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"voicebox.graphics.plot_2d","input":{"expression":"2*x+3"}}'
```

Trên PowerShell có thể dùng `curl.exe` thay cho alias `curl` nếu lệnh bị PowerShell diễn giải khác.

## 4. Kết nối backend XiaoZhi

Sau khi service chạy, dùng URL:

```text
https://YOUR-SERVICE.onrender.com/mcp
```

Thêm entry Streamable HTTP vào `mcpServers` trong file `.mcp_server_settings.json` của backend XiaoZhi theo mẫu tại `docs/xiaozhi-mcp-servers.example.json`. Đặt cùng giá trị `DEVICE_API_KEY` vào header Bearer ở backend. Không gửi API key xuống ESP32.

MCP server này không tự khiến firmware tự động hiển thị ảnh. Backend XiaoZhi vẫn cần bridge kết quả `display.asset_url` thành lệnh gửi xuống thiết bị; xem `docs/XIAOZHI_INTEGRATION.md` và `docs/ESP32_RESPONSE_PROTOCOL.md`.

## 5. Cấu hình provider tùy chọn

Chỉ bật khi đã có API key và đọc điều khoản nhà cung cấp:

- Search: `SEARCH_ENABLED=true` đã bật; adapter Wikipedia không cần key. Có thể thêm `SEARXNG_BASE_URL` nếu quản lý một SearXNG instance.
- Music: đặt `MUSIC_ENABLED=true`, `MUSIC_JAMENDO_CLIENT_ID` hợp lệ.
- Image: đặt `IMAGE_ENABLED=true`, `IMAGE_API_URL` và `IMAGE_API_KEY` theo provider tương thích với adapter.
- VietSchool API: để tắt cho đến khi có API contract chính thức. Nhập CSV được hỗ trợ riêng.
- Map: mặc định tắt. Không bật OSM standard tiles trên Render Free nếu không có cache bền vững phù hợp policy hoặc provider tile có điều khoản phù hợp.

Mọi secret đặt trong Render → Environment, không commit vào repository.

## 6. Giới hạn Render Free

- Service có thể spin down khi không có traffic; request đầu tiên sau thời gian ngủ có thể chậm.
- RAM và cache asset chỉ tồn tại trong vòng đời process. URL bitmap hết hạn hoặc mất khi service restart/sleep.
- Không có database hoặc persistent disk trong cấu hình này.
- Không dùng cron, self-ping hoặc worker để cố giữ service luôn chạy.
- ESP32/backend phải xử lý lỗi timeout, asset hết hạn và cold start.

## 7. Nếu deploy lỗi

1. Mở Render → service → **Events** và **Logs**.
2. Kiểm tra Build Command đã chạy `npm install --include=dev --no-audit --no-fund && npm run build`.
3. Kiểm tra Start Command là `npm start`.
4. Kiểm tra health check là `/health`.
5. Kiểm tra `DEVICE_API_KEY` đã được Render sinh ra.
6. Mở `BUILD_STATUS.md` để xem những kiểm tra đã chạy trong môi trường tạo project. Sau khi dependency cài được, chạy `npm run check` để type-check/build và test toàn bộ.
