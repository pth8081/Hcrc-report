# portal

Cổng chọn hệ thống — điểm vào duy nhất cho người dùng, bấm vào đâu thì
**chuyển hẳn trang** (không phải route SPA) sang đúng ứng dụng đã có sẵn:
`rp-user/` (Report), `etl-admin/` (ETL), `api-admin/` (API). Trang này
KHÔNG có form đăng nhập, không gọi API nào, không giữ cookie/state — chỉ 3
đường dẫn. Xem tài liệu kiến trúc "Cổng Đăng Nhập HCRC" cho lý do chọn cách
này thay vì gộp 3 ứng dụng thành một.

## Cài đặt

```bash
cd portal
npm install
cp .env.example .env   # điền URL thật của 3 ứng dụng (mặc định trỏ localhost, đúng cổng dev)
npm run dev             # http://localhost:5176
```

## Build production

```bash
npm run build   # ra dist/ — file tĩnh thuần, phục vụ qua Nginx ở bất kỳ đâu
```

`portal/` là ứng dụng DUY NHẤT trong 4 ứng dụng frontend cần lộ ra ngoài
rộng rãi — 3 đích đến (`rp-user/`, `api-admin/`, `etl-admin/`) vẫn giữ
đúng chính sách mạng riêng của từng bên (vd `api-admin/`/`etl-admin/` chỉ
mở trong mạng nội bộ/VPN).
