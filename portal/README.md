# portal

Cổng chọn hệ thống — điểm vào duy nhất cho người dùng, bấm vào đâu thì
**chuyển hẳn trang** (không phải route SPA) sang đúng ứng dụng đã có sẵn.
Danh mục ứng dụng khai trong `src/apps.js` — hiện có `rp-user/` (Report),
`etl-admin/` (ETL), `api-admin/` (API). Trang KHÔNG có form đăng nhập,
KHÔNG gọi API nào, không giữ cookie/state — thuần tĩnh, hiện TOÀN BỘ danh
mục cho MỌI người xem (không cá nhân hoá theo ai đang xem, vì trang không
biết đó là ai) — xem tài liệu kiến trúc "Cổng Đăng Nhập HCRC" cho lý do
chọn cách này thay vì gộp nhiều ứng dụng thành một hoặc thêm đăng nhập
riêng cho portal.

**Nhãn "Công khai"/"Nội bộ · VPN"** trên mỗi thẻ CHỈ để nhân viên biết cần
VPN hay không trước khi bấm — KHÔNG kiểm soát gì cả (portal không biết ai
đang xem). Quyền truy cập THẬT nằm ở chính từng ứng dụng (tài khoản/vai
trò riêng) và ở tầng mạng/Nginx (xem `deploy/README.md`).

## Thêm ứng dụng mới vào danh mục

Sửa `src/apps.js` — thêm 1 phần tử `{ key, title, desc, envVar, fallback,
audience }`, rồi thêm đúng biến `envVar` đó vào `.env`/`.env.example`.
KHÔNG cần sửa `index.html` — `src/main.js` tự vẽ thêm 1 thẻ theo danh sách
này, lưới thẻ tự giãn theo số lượng.

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
