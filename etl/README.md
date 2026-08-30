# ETL

Đồng bộ dữ liệu từ nhiều máy chủ MSSQL/MySQL/MariaDB vào Data Warehouse
trung tâm (`HCRC_DWH`). Một tiến trình vừa chạy lịch đồng bộ nền, vừa phục
vụ `/admin/*` cho trang quản trị riêng `etl-admin/` — CSDL quản trị
(`HCRC_ETL`) tách biệt hoàn toàn khỏi `HCRC_RP` (Report Server) và
`HCRC_API` (API Server).

## Hai kiểu đồng bộ

- **Theo bảng** (`Type = 'table'`) — cấu hình hoàn toàn qua `etl-admin/`:
  chọn nguồn → duyệt bảng/VIEW/cột thật → chọn cột khoá/ngày/watermark/
  Dimensions/Measures, tuỳ chọn thêm **một** bảng/view liên kết cùng nguồn.
  Không cần code. Chọn VIEW hoạt động y hệt chọn bảng thật (câu SELECT chạy
  đồng bộ dùng thẳng tên đã chọn) — hữu ích khi cần gộp hơn 1 bảng (VIEW phía
  nguồn tự JOIN sẵn) hoặc chỉ muốn lộ đúng cột cần cho tài khoản chỉ đọc của
  ETL, không đụng bảng gốc.
- **Tuỳ biến** (`Type = 'custom'`) — khi cần join nhiều bảng, tính toán,
  logic nghiệp vụ riêng: viết một connector trong `sources/` (xem
  `sources/_template.js`), đăng ký job trên `etl-admin/` tham chiếu đúng
  `CustomConnectorKey`. Lịch chạy/bật-tắt/xem log vẫn quản lý qua giao diện
  như job "theo bảng" — chỉ khác câu SQL/logic chuyển đổi nằm trong code.

## Cài đặt

```bash
cd etl
npm install
cp .env.example .env   # điền DWH_*, ADMIN_* (CSDL HCRC_ETL), ETL_ADMIN_JWT_SECRET, ETL_ENCRYPTION_KEY
```

Tạo khoá mã hoá (dùng để mã hoá mật khẩu các nguồn lưu trong `etl.DataSources`):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Chạy `etl-db/schema.sql` trên CSDL `HCRC_ETL` (một lần — an toàn chạy lại
nhiều lần). Tạo tài khoản quản trị đầu tiên cho `etl-admin/`:

```bash
npm run seed:admin -- ten-dang-nhap mat-khau "Họ Tên" admin
```

## Chạy

```bash
npm start           # chạy nền theo lịch + phục vụ /admin/* (production)
npm run dev          # tự khởi động lại khi sửa code
npm run sync:once    # chạy toàn bộ job đang bật MỘT LẦN rồi thoát — test nhanh
```

`npm start` KHÔNG nên lộ ra Internet — toàn bộ `/admin/*` chỉ dành cho người
vận hành nội bộ, tương tự lưu ý về `/admin/*` ở `api-server/README.md`.

## Nguồn nhiều loại CSDL

`etl.DataSources.Engine` — `'mssql'` hoặc `'mysql'` (dùng chung cho cả MySQL
và MariaDB, cùng driver `mysql2`). Thêm PostgreSQL sau này chỉ cần thêm một
file trong `lib/dbAdapters/`, xem `lib/dbAdapters/index.js`.

Duyệt schema (chọn bảng/VIEW/cột trên `etl-admin/`) chỉ cần tài khoản **chỉ
đọc** trên nguồn — catalog view của cả hai engine chỉ hiện bảng/VIEW mà tài
khoản đang kết nối có quyền `SELECT`. Cùng tài khoản đó dùng được cho cả
duyệt schema lẫn đồng bộ dữ liệu thật, không cần tài khoản thứ hai. Kho đích
(`HCRC_DWH`) vẫn cần tài khoản có quyền ghi riêng (`DWH_USER`).

## Triển khai

Tiến trình này **KHÔNG** nên lộ ra Internet — khác `api-server`/`rp-server`
(xem README của 2 nơi đó) — vì `etl` nắm giữ mật khẩu của TOÀN BỘ nguồn dữ
liệu đã cấu hình (`etl.DataSources`, có thể hàng chục CSDL cửa hàng/chi
nhánh), rủi ro cao nhất trong 3 hệ thống nếu bị xâm nhập. Nếu vẫn proxy
`/admin/*` qua cùng Nginx với 2 hệ kia (khuyến nghị KHÔNG làm vậy), nhớ:

- **`TRUST_PROXY_HOPS`** (mặc định 1) — khớp đúng số lớp proxy đứng trước,
  nếu không giới hạn tần suất theo IP sẽ vô nghĩa (mọi request trông như
  cùng 1 IP của Nginx).
- **Chống dò mật khẩu đăng nhập** (`lib/loginRateLimit.js`) — tối đa 10 lần
  sai liên tiếp theo (IP + username) trong 15 phút.
- **`ETL_ADMIN_ALLOWED_IPS`** (`lib/adminIpAllowlist.js`) — danh sách IP
  được phép gọi `/admin/*`, lớp phòng thủ BỔ SUNG cùng kiểu `api-server` đã
  có từ trước — kiểm soát chính vẫn phải là không proxy `/admin/*` ra
  Internet ở Nginx/tường lửa.
- **`ETL_ADMIN_JWT_SECRET`** (đổi tên từ `ADMIN_JWT_SECRET` cũ) — tên biến
  RIÊNG, khác hẳn `api-server`/`rp-server`, để operator không lỡ copy nhầm
  `.env` giữa 2 service. Token còn có `issuer`/`audience` riêng kiểm tra khi
  xác minh — dù 2 service lỡ dùng CHUNG giá trị secret, token của bên này
  vẫn bị bên kia từ chối. Khởi động LỖI NGAY nếu secret còn là giá trị mẫu.
- **Chống chạy chồng lấn** (`jobs/scheduler.js`) — 1 job đọc bảng lớn từ
  nguồn chậm, chạy lâu hơn chu kỳ cron của chính nó, không còn tự "đụng"
  chính nó ở lượt tiếp theo. Nút "Chạy thử" (`/admin/sync-jobs/:id/run-now`)
  cũng đi qua cùng cơ chế — bấm khi job đang tự chạy theo lịch sẽ bị bỏ qua
  (ghi log), không chạy chồng.
- **Header bảo mật** (`helmet()`) và **giới hạn thời gian tầng HTTP server**
  (chống client gửi request/body nhỏ giọt giữ kết nối mở gần như vô hạn).

## API — `/admin/*`

| Endpoint | Vai trò | Mô tả |
|---|---|---|
| `POST /admin/auth/login`, `/logout`, `GET /me` | — | Đăng nhập/đăng xuất |
| `GET/POST/PUT /admin/users`, `POST /:id/reset-password` | `admin` sửa | Phân quyền — tài khoản quản trị ETL |
| `GET/POST/PUT/DELETE /admin/data-sources` | `admin` sửa | Nguồn dữ liệu |
| `POST /admin/data-sources/test` | `admin` | Kiểm tra kết nối một cấu hình chưa lưu |
| `GET /admin/data-sources/:id/tables` | — | Duyệt bảng/VIEW thật của một nguồn |
| `GET /admin/data-sources/:id/tables/:schema/:table/columns` | — | Duyệt cột thật |
| `GET /admin/data-sources/:id/tables/:schema/:table/foreign-keys` | — | Gợi ý cặp cột nối (nếu có khoá ngoại thật — VIEW thường không có, trả rỗng) |
| `GET/POST/PUT/DELETE /admin/sync-jobs` | `admin` sửa | Cấu hình đồng bộ |
| `GET /admin/sync-jobs/custom-connectors` | — | Danh sách connector "tuỳ biến" có sẵn trong code |
| `POST /admin/sync-jobs/:id/run-now` | `admin` | Chạy thử một job ngay |
| `GET /admin/log` | — | Nhật ký đồng bộ, lọc + phân trang |
| `GET /admin/dashboard` | — | Tổng hợp tình trạng đồng bộ |

## Còn thiếu để dùng thật

- Adapter PostgreSQL — chưa xây, chưa có yêu cầu (xem `lib/dbAdapters/index.js`).
- Sửa (`PUT /admin/sync-jobs/:id`) chỉ đổi tên/lịch/bật-tắt/domain/cột — đổi
  bảng nguồn hay bảng liên kết phải xoá job cũ, tạo job mới (tránh cấu hình
  nửa vời).
- Chưa có job dọn `etl.SyncLog` cũ định kỳ — bảng này lớn dần theo số lượt
  chạy, cần thêm khi cần (giống `api-server/jobs/cleanupRequestLog.js`).
