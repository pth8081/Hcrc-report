# etl-admin

Trang quản trị ETL — nguồn dữ liệu, cấu hình đồng bộ (chọn bảng/cột thật,
không cần code), Dashboard, Log, Phân quyền. Ứng dụng RIÊNG, tách khỏi
`rp-user/` và `api-admin/` — xem tài liệu kiến trúc "Quản Trị ETL HCRC".

## Cài đặt

```bash
cd etl-admin
npm install
npm run dev   # http://localhost:5175, proxy /admin sang ETL Server (cổng 4003)
```

Cần `etl` (`npm start` trong thư mục `etl/`) đang chạy và đã có tài khoản
quản trị (`npm run seed:admin`) để đăng nhập được.

## Build production

```bash
npm run build   # ra dist/, phục vụ tĩnh CHỈ trong mạng nội bộ — không lộ ra
                 # Internet, cùng lý do với /admin/* của ETL Server
```

## 5 trang

- **Dashboard** — tổng số job/nguồn, job lỗi 24h qua, các lượt chạy gần nhất.
- **Nguồn dữ liệu** — CRUD `etl.DataSources` (SQL Server hoặc MySQL/MariaDB), kiểm tra kết nối.
- **Đồng bộ** — tạo job "theo bảng" (duyệt bảng/cột thật của nguồn, tuỳ chọn thêm 1 bảng liên kết) hoặc "tuỳ biến" (chọn connector viết sẵn); chạy thử/bật-tắt/xoá.
- **Log** — `etl.SyncLog`, lọc theo trạng thái, phân trang.
- **Phân quyền** — CRUD `admin.AdminUsers` (vai trò `admin`/`viewer`).

## Còn thiếu ở bước khung này

- Sửa job "theo bảng" chỉ đổi được tên/lịch/bật-tắt/domain/cột Dimensions-Measures qua giao diện — đổi bảng nguồn/bảng liên kết phải xoá job cũ, tạo job mới.
- Chưa hiển thị kiểu dữ liệu cột khi duyệt schema (API đã trả về `dataType`, giao diện chưa hiện) — hữu ích khi cần phân biệt cột nào hợp lý làm cột ngày/watermark.
