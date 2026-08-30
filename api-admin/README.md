# api-admin

Trang quản trị API Server — đối tác API, kết nối hiện tại (realtime), lịch
sử, top truy vấn. Ứng dụng RIÊNG, tách khỏi `rp-user/` (quản trị nội bộ) —
xem tài liệu kiến trúc "Quản Trị API HCRC" cho lý do tách.

## Cài đặt

```bash
cd api-admin
npm install
npm run dev   # http://localhost:5174, proxy /admin sang api-server (cổng 4002)
```

Cần `api-server` đang chạy và đã có tài khoản quản trị (`npm run seed:admin`
trong `api-server/`) để đăng nhập được.

## Build production

```bash
npm run build   # ra dist/, phục vụ tĩnh CHỈ trong mạng nội bộ/VPN — không
                 # cùng đường ra Internet với frontend công khai của API
                 # (xem api-server/README.md, mục Nginx)
```

## 4 trang

- **Đối tác** — CRUD `api.ApiConsumers`, luân chuyển key (chỉ vai trò `admin`).
- **Kết nối hiện tại** — request `/api/v1/*` đang xử lý (SSE, tức thời) + số kết nối CSDL đang dùng trong từng pool.
- **Lịch sử** — `api.RequestLog`, lọc theo endpoint/thời gian, phân trang.
- **Top truy vấn** — tổng hợp theo endpoint/đối tác, 1 giờ/24 giờ/7 ngày qua.

## Còn thiếu ở bước khung này

- Trang "Cài đặt" (đổi `REQUEST_LOG_RETENTION_DAYS`, giới hạn tần suất mặc định...) qua giao diện — hiện chỉ sửa được qua `.env` của `api-server`.
- Biểu đồ cho Top truy vấn — hiện là bảng số liệu thô.
