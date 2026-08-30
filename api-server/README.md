# API Server

Cổng dữ liệu cho hệ thống ngoài **và nội bộ** (API key không phân biệt hai
bên — cấp cho app nội bộ y hệt đối tác ngoài) + trang quản trị tự cấu hình
(`api-admin/`). Ba nhóm route, ba mức xác thực hoàn toàn tách biệt:

- `/api/v1/reports/*` — báo cáo tổng hợp, đọc từ Data Warehouse (`HCRC_DWH`, chỉ đọc, nguồn mặc định qua `.env`). Xác thực: API key.
- `/api/v1/inventory|loyalty|vouchers/*` — tra cứu realtime, mỗi endpoint đọc từ một nguồn được **gán riêng qua trang quản trị** (`api.DataSources` + `api.RealtimeEndpoints`, KHÔNG còn tĩnh qua `.env`). Xác thực: API key.
- `/admin/*` — trang quản trị (`api-admin/`): đối tác API, nguồn dữ liệu realtime, kết nối hiện tại/lịch sử/top truy vấn. Xác thực: cookie phiên (tài khoản riêng, CSDL riêng `HCRC_API`).

## Cài đặt

```bash
cd api-server
npm install
cp .env.example .env   # điền DWH_*, ADMIN_* (CSDL HCRC_API), ADMIN_JWT_SECRET, API_ENCRYPTION_KEY
```

Tạo khoá mã hoá (dùng để mã hoá mật khẩu các nguồn lưu trong `api.DataSources`):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Chạy `api-db/schema.sql` trên CSDL `HCRC_API` (một lần — an toàn chạy lại
nhiều lần). Tạo tài khoản quản trị đầu tiên cho `api-admin/`:

```bash
npm run seed:admin -- ten-dang-nhap mat-khau "Họ Tên" admin
```

## Cấu hình nguồn dữ liệu cho 3 endpoint realtime

Qua trang "Nguồn dữ liệu" trên `api-admin/`:

1. Thêm một nguồn (`api.DataSources`) — server/database/tài khoản **chỉ
   đọc**, kiểm tra kết nối trước khi lưu.
2. Gán nguồn đó cho từng endpoint (`inventory`/`loyalty`/`vouchers`) — một
   endpoint có thể trỏ một nguồn khác endpoint kia, không bắt buộc dùng
   chung.

Endpoint chưa được gán nguồn sẽ trả lỗi rõ ràng thay vì âm thầm dùng cấu
hình cũ — không có "nguồn mặc định" ngầm định cho nhóm realtime này (khác
`/api/v1/reports`, vẫn có `HCRC_DWH` làm mặc định qua `.env`).

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
| `GET/POST/PUT/DELETE /admin/data-sources` | `admin` sửa | CRUD nguồn dữ liệu realtime |
| `POST /admin/data-sources/test` | `admin` | Kiểm tra kết nối một cấu hình chưa lưu |
| `GET /admin/data-sources/realtime-endpoints` | — | Nguồn đang gán cho từng endpoint |
| `PUT /admin/data-sources/realtime-endpoints/:endpoint` | `admin` | Đổi nguồn gán cho một endpoint |
| `GET /admin/live/stream` | — | SSE: request đang chạy realtime |
| `GET /admin/live/pools` | — | Số kết nối CSDL đang dùng/tối đa (DWH) |
| `GET /admin/history` | — | Lịch sử request, lọc + phân trang |
| `GET /admin/stats/top?since=1h\|24h\|7d` | — | Top endpoint/đối tác theo số lượt gọi |
