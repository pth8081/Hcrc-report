# API Server

Cổng dữ liệu cho hệ thống ngoài + trang quản trị tự cấu hình (`api-admin/`).
Ba nhóm route, ba mức xác thực hoàn toàn tách biệt:

- `/api/v1/reports/*` — báo cáo tổng hợp, đọc từ Data Warehouse (`HCRC_DWH`, chỉ đọc). Xác thực: API key.
- `/api/v1/inventory|loyalty|vouchers/*` — tra cứu realtime, đọc thẳng CSDL OLTP qua view riêng. Xác thực: API key.
- `/admin/*` — trang quản trị (`api-admin/`): quản lý đối tác API, xem kết nối hiện tại/lịch sử/top truy vấn. Xác thực: cookie phiên (tài khoản riêng, CSDL riêng `HCRC_API`).

## Cài đặt

```bash
cd api-server
npm install
cp .env.example .env   # điền DWH_*, OLTP_*, ADMIN_* (CSDL HCRC_API), ADMIN_JWT_SECRET
```

Chạy `api-db/schema.sql` trên CSDL `HCRC_API` (một lần — an toàn chạy lại
nhiều lần). Tạo tài khoản quản trị đầu tiên cho `api-admin/`:

```bash
npm run seed:admin -- ten-dang-nhap mat-khau "Họ Tên" admin
```

## Chạy

```bash
npm start
```

## Cấp API key cho một hệ thống đối tác

Qua `api-admin/` (trang "Đối tác" → Thêm), hoặc gọi thẳng:

```bash
curl -X POST http://localhost:4002/admin/consumers \
  -H "Content-Type: application/json" -b "hcrc_api_admin_token=..." \
  -d '{"name":"HeThongDoiTacA","scopes":["reports","realtime"],"rateLimitPerMinute":120}'
```

Response trả về `apiKey` — **chỉ hiện đúng một lần**, CSDL chỉ lưu bản băm
SHA-256 (`api.ApiConsumers.ApiKeyHash`). Mất key thì luân chuyển key mới
(`POST /admin/consumers/:id/rotate`), không lấy lại được key cũ.

## Còn thiếu để dùng thật

- **Tên view/cột thật cho 3 route realtime** (`routes/v1/realtime.js`) — đang là khung với TODO, cần schema OLTP thật để thay đúng tên `api_rt.TonKho`/`api_rt.DiemThe`/`api_rt.Voucher`.
- **Giới hạn tần suất riêng theo từng đối tác** — `api.ApiConsumers.RateLimitPerMinute` đã có cột, nhưng `server.js` hiện vẫn dùng một ngưỡng chung (`RATE_LIMIT_PER_MINUTE`) cho toàn bộ `/api/v1` — nâng cấp sau nếu cần giới hạn khác nhau giữa các đối tác.
- **OpenAPI spec** — chưa viết, nên có trước khi giao cho hệ thống ngoài tích hợp thật.
- **Nginx**: `/admin/*` PHẢI chỉ mở trong mạng nội bộ/VPN — không proxy ra Internet cùng domain với `/api/v1/*`. `lib/adminIpAllowlist.js` (biến `ADMIN_ALLOWED_IPS`) chỉ là lớp phòng thủ bổ sung, không thay được cấu hình Nginx.

## API — `/api/v1/*` (đối tác, API key)

| Endpoint | Scope | Mô tả |
|---|---|---|
| `GET /api/v1/health` | — | Kiểm tra tình trạng, không cần key |
| `GET /api/v1/reports/:reportId/run` | `reports` | Chạy báo cáo, lọc qua query string, trả JSON phân trang |
| `GET /api/v1/inventory/:sku` | `realtime` | Tồn kho theo SKU |
| `GET /api/v1/loyalty/:memberCode` | `realtime` | Điểm thẻ thành viên |
| `GET /api/v1/vouchers/:code` | `realtime` | Trạng thái voucher |

## API — `/admin/*` (nội bộ, cookie phiên)

| Endpoint | Vai trò | Mô tả |
|---|---|---|
| `POST /admin/auth/login`, `/logout`, `GET /me` | — | Đăng nhập/đăng xuất |
| `GET/POST/PUT/DELETE /admin/consumers` | `admin` sửa, ai đăng nhập cũng xem được | CRUD đối tác API |
| `POST /admin/consumers/:id/rotate` | `admin` | Luân chuyển key |
| `GET /admin/live/stream` | — | SSE: request đang chạy realtime |
| `GET /admin/live/pools` | — | Số kết nối CSDL đang dùng/tối đa (DWH, OLTP) |
| `GET /admin/history` | — | Lịch sử request, lọc + phân trang |
| `GET /admin/stats/top?since=1h\|24h\|7d` | — | Top endpoint/đối tác theo số lượt gọi |
