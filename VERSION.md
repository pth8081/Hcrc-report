# Phiên bản

Phiên bản chung của toàn bộ hệ thống HCRC (ETL, Data Warehouse, Report
Server, API Server và các giao diện quản trị) — tăng ở mỗi lần merge vào
`main`, theo kiểu semver không chặt (patch cho fix nhỏ, minor cho tính năng
mới, major khi đổi cấu trúc phá vỡ tương thích ngược).

## 0.6.0 — Cổng đăng nhập chung & đa kết nối cho API Server

- `portal/` — trang tĩnh mới, điểm vào duy nhất: 3 lựa chọn (Report/ETL/API),
  bấm vào đâu điều hướng CẢ TRANG sang đúng ứng dụng đã có sẵn
  (`frontend/`/`etl-admin/`/`api-admin/`) — không gộp 3 ứng dụng thành một,
  giữ nguyên cô lập tài khoản/CSDL/JWT đã thống nhất ở 3 lượt trước (xem tài
  liệu kiến trúc "Cổng Đăng Nhập HCRC", Phương án A).
- API Server nay cũng dùng được nhiều kết nối cấu hình qua giao diện, khớp
  đúng mô hình Report/ETL đã có: `api.DataSources` (CSDL `HCRC_API`, mật
  khẩu mã hoá bằng `API_ENCRYPTION_KEY` riêng) + `api.RealtimeEndpoints` gán
  từng endpoint (`inventory`/`loyalty`/`vouchers`) cho đúng một nguồn — thay
  hẳn `OLTP_*` tĩnh trong `.env`. Trang "Nguồn dữ liệu" mới trên
  `api-admin/`; `/admin/live/pools` báo cáo cả pool DWH lẫn từng nguồn
  realtime đang mở.

## 0.5.1 — Đổi tên thư mục cho nhất quán

- `app/` → `rp-db/` — schema CSDL `HCRC_RP` của Report Server. Tên cũ (`app/`)
  đặt từ trước khi có quy ước `<viết-tắt>-db/` (`api-db/`, `etl-db/`), dễ
  khiến người đọc lướt qua tưởng Report Server chưa có CSDL riêng. Chỉ đổi
  tên thư mục — schema SQL bên trong vẫn tên `app` (`app.Users`,
  `app.ReportCatalog`...), không đổi.

## 0.5.0 — Quản trị ETL

- CSDL riêng `HCRC_ETL` (`etl-db/schema.sql`) — tách khỏi `HCRC_RP` và
  `HCRC_API`: nguồn dữ liệu (`etl.DataSources`), cấu hình đồng bộ
  (`etl.SyncJobs`), trạng thái/log (`etl.SyncState`/`etl.SyncLog`, chuyển từ
  `dwh/schema.sql` — `dwh` giờ chỉ còn `dwh.ReportFacts`), tài khoản quản trị
  (`admin.AdminUsers`).
- ETL đổi từ script chạy nền thành một server thật (`etl/server.js`) — vừa
  chạy lịch đồng bộ, vừa phục vụ `/admin/*`.
- Hai kiểu đồng bộ: **theo bảng** (chọn nguồn → duyệt bảng/cột thật → gán
  cột, không cần code — hỗ trợ thêm một bảng liên kết cùng nguồn) và **tuỳ
  biến** (connector viết tay trong `etl/sources/`, dùng khi cần join nhiều
  bảng/tính toán).
- Hỗ trợ nhiều loại CSDL nguồn qua lớp adapter (`etl/lib/dbAdapters/`) — SQL
  Server và MySQL/MariaDB (dùng chung driver `mysql2`).
- Lịch chạy đổi trên giao diện có hiệu lực trong tối đa 1 phút, không cần
  khởi động lại tiến trình.
- `etl-admin/` — giao diện quản trị riêng: Dashboard, Nguồn dữ liệu, Đồng
  bộ, Log, Phân quyền.

## 0.4.0 — Quản trị API

- CSDL riêng `HCRC_API` — tách khỏi `HCRC_RP`: đối tác gọi API
  (`api.ApiConsumers`, API key rời khỏi `.env`), tài khoản quản trị
  (`admin.AdminUsers`), nhật ký request (`api.RequestLog`).
- API key băm SHA-256 (không phải bcrypt — bị so khớp mỗi lượt gọi ngoài).
- Ghi nhật ký request không chặn phản hồi (fire-and-forget); "kết nối hiện
  tại" đẩy qua Server-Sent Events; số kết nối CSDL đang dùng đọc trực tiếp
  từ pool.
- `api-admin/` — giao diện quản trị riêng: Đối tác, Kết nối hiện tại, Lịch
  sử, Top truy vấn.

## 0.3.0 — CSDL ứng dụng & phân quyền

- CSDL riêng `HCRC_RP` — Users/Roles, phân quyền 2 lớp (theo menu + theo
  từng báo cáo), danh mục báo cáo (`ReportCatalog`, chuyển từ `dwh`), danh
  mục dùng chung, cấu hình email, nhật ký hệ thống.
- Report Server nâng cấp: đăng nhập thật (thay tài khoản admin tạm qua
  `.env`), nguồn dữ liệu bổ sung cho từng báo cáo (`ReportDataSources`).
- `frontend/` — giao diện người dùng: Trang chủ, Dashboard, 3 nhóm báo cáo,
  Hệ thống (Phân quyền/Biểu mẫu/Log/Danh mục/Thiết lập email).

## 0.2.0 — Report Server & API Server

- `report-server/` — báo cáo động theo định nghĩa lưu trong CSDL, xuất
  Excel/PDF.
- `api-server/` — cổng dữ liệu cho hệ thống ngoài: báo cáo tổng hợp (đọc
  Data Warehouse) và tra cứu realtime (tồn kho/điểm thẻ/voucher, đọc thẳng
  CSDL OLTP qua pool tách biệt).

## 0.1.0 — ETL & Data Warehouse

- `dwh/schema.sql` — Data Warehouse trung tâm, bảng sự kiện hợp nhất
  `ReportFacts`.
- `etl/` — đồng bộ tăng dần từ nhiều máy chủ MSSQL nguồn, mỗi nguồn một
  connector độc lập.
