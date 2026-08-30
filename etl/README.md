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

## Giữ lịch sử theo ngày (KeepHistory)

Mặc định, `dwh.ReportFacts` chỉ giữ ĐÚNG 1 dòng/thực thể — mỗi lượt đồng
bộ ghi đè dòng cũ (khớp theo `SourceSystem + Domain + EntityCode`,
`EventDate` chỉ cập nhật giá trị mới nhất). Với domain cần so sánh cùng kỳ
(vd doanh thu ngày, cần so với đúng ngày này năm trước), bật **"Giữ lịch sử
theo ngày"** khi tạo/sửa job (`etl-admin/`, trang "Đồng bộ") — mỗi
`EventDate` khác nhau tự nhiên thành 1 dòng riêng, ngày cũ KHÔNG bị ngày
mới ghi đè (đồng bộ nhiều lần trong CÙNG 1 ngày vẫn cập nhật đúng dòng của
ngày đó, do `EventDate` không đổi giữa các lần chạy trong ngày).

**TẮT theo mặc định** — không đổi hành vi các job đang có, chỉ bật khi thật
sự cần lịch sử (mỗi ngày 1 dòng cũng đồng nghĩa nhiều dòng hơn theo thời
gian — không bật "phòng khi cần" cho mọi domain). Cột `EventDate` PHẢI là
ngày nghiệp vụ thật của bản ghi (không phải "ngày đồng bộ") — connector
chọn sai cột ở đây (vd cột "cập nhật lần cuối" đổi liên tục) sẽ khiến job
`KeepHistory=1` tạo dòng mới mỗi lần chạy dù cùng 1 ngày, không đúng ý
muốn.

## Nhập chỉ tiêu (target/KPI)

Trang "Nhập chỉ tiêu" (`etl-admin/`) — upload file Excel (.xlsx) chỉ tiêu
kinh doanh theo tháng cho từng siêu thị, ghi vào `dwh.SalesTargets` (bảng
RIÊNG khỏi `dwh.ReportFacts` — xem `dwh/schema.sql`). Dùng cho báo cáo cần
so "Thực đạt" với "Chỉ tiêu" (report bên `rp-server` đọc bảng này qua
`SourceType='composite'`, xem `rp-server/README.md`).

**Vì sao đặt ở `etl`, không phải `rp-server`** — chỉ `etl` được GHI vào
DWH (`rp-server`/`api-server` chỉ có quyền đọc, xem `dwh/grants.sql`); đặt
tính năng ghi ở nơi khác sẽ phải nới quyền ghi cho service đó, phá đúng
ranh giới "chỉ etl ghi DWH" xuyên suốt kiến trúc.

**Quyền hẹp hơn cả `etl_writer` bình thường của ETL** — route này dùng
RIÊNG tài khoản CSDL `dwh_target_importer` (biến `DWH_TARGET_IMPORTER_*`
trong `.env`), CHỈ có quyền trên đúng 1 bảng `dwh.SalesTargets`, không đụng
được `dwh.ReportFacts` dù chạy trong cùng tiến trình `etl` — xem
`dwh/grants.sql`. Ở tầng ứng dụng, thêm vai trò `target_importer` trong
`admin.AdminUsers.Role` — tài khoản gán vai trò này CHỈ thấy trang "Nhập
chỉ tiêu" trong `etl-admin/`, không thấy Nguồn dữ liệu/Đồng bộ (hạ tầng ETL
thật) — cấp cho nhân sự chỉ cần nhập chỉ tiêu hàng tháng, không phải quản
trị ETL đầy đủ.

**Định dạng file** — dòng 1 là header, 2 cột đầu CỐ ĐỊNH tên `MaSieuThi` và
`Thang` (dạng `YYYY-MM`), các cột sau tuỳ ý — tên cột trở thành tên khoá
chỉ tiêu (vd `ChiTieuDoanhThu`, `ChiTieuGiaoDich`), không cố định trước
trong code. Nhập lại đúng domain + tháng sẽ GHI ĐÈ (upsert theo khoá
`Domain + EntityCode + PeriodMonth`), không cộng dồn — nhập cuối tháng
trước để có sẵn chỉ tiêu khi tháng mới bắt đầu.

**Cột `TrangThai` (tuỳ chọn) — đóng cửa siêu thị** — ghi `DaDong` để LOẠI
HẲN siêu thị đó khỏi báo cáo `composite` tháng này (xem
`rp-server/lib/compositeReportRunner.js`), để trống hoặc ghi `HoatDong` =
hiện bình thường. CỐ Ý chỉ loại khi có đánh dấu tường minh `DaDong` —
THIẾU cả dòng chỉ tiêu (chưa kịp nhập, hoặc quên) KHÔNG bị coi là đóng cửa,
siêu thị đó vẫn hiện ra bình thường (chỉ trống cột Chỉ tiêu) — tránh mất
siêu thị khỏi báo cáo chỉ vì lỗi nhập liệu. File có thể CHỈ có cột
`TrangThai` (không kèm số liệu chỉ tiêu nào) nếu mục đích chỉ là đánh dấu
đóng cửa hàng loạt.

**Sửa/thêm 1 siêu thị giữa tháng — không cần re-upload cả file** — mục
"Sửa / thêm 1 siêu thị" ngay dưới bảng chỉ tiêu (nút "Sửa" ở mỗi dòng tự
điền sẵn dữ liệu hiện có, hoặc "Thêm siêu thị mới" cho dòng trống). Dùng
khi giữa tháng phát sinh mở/đóng 1-2 siêu thị, không cần chuẩn bị lại
nguyên file Excel. Route `PUT /admin/sales-targets/one` — GHI ĐÈ nguyên
`TargetsJson` của đúng siêu thị + tháng đó (giống hệt semantics upload
file, chỉ khác 1 dòng thay vì cả file) — giao diện tự tải dữ liệu hiện có
lên form trước khi cho sửa nên không lo mất chỉ tiêu khác chỉ vì tick 1 ô
"Đã đóng cửa".

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
nhiều lần).

Tài khoản CSDL dùng trong `.env` (`ADMIN_USER`, `DWH_USER`, và
`DWH_TARGET_IMPORTER_USER` nếu dùng tính năng "Nhập chỉ tiêu" — xem mục
riêng bên dưới) nên tạo với quyền tối thiểu chứ không phải tài khoản
`sa`/`db_owner` — xem mẫu tham khảo `etl-db/grants.sql` (CSDL của chính
etl) và `dwh/grants.sql` (CSDL DWH — `etl_writer` ghi `dwh.ReportFacts`,
`dwh_target_importer` CHỈ ghi `dwh.SalesTargets`) ở thư mục gốc repo. Cả 2
file KHÔNG tự chạy, cần DBA xem lại và đổi mật khẩu mẫu trước khi dùng.

Tạo tài khoản quản trị đầu tiên cho `etl-admin/`:

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

Tiến trình này **KHÔNG** có route công khai nào — khác `api-server`
(`/api/v1/*`) và `rp-server` (toàn bộ `/api/*`) — vì `etl` nắm giữ mật khẩu
của TOÀN BỘ nguồn dữ liệu đã cấu hình (`etl.DataSources`, có thể hàng chục
CSDL cửa hàng/chi nhánh), rủi ro cao nhất trong 3 hệ thống nếu bị xâm nhập.
`/admin/*` của `etl` VẪN CÓ THỂ đứng sau CÙNG Nginx với 2 hệ kia (mô hình
khuyến nghị khi cả 3 chạy chung 1 máy chủ — xem `deploy/nginx.conf` +
`deploy/README.md` ở thư mục gốc repo) — miễn là trên domain RIÊNG, chỉ mở
`allow`/`deny` cho IP nội bộ/VPN ở tầng Nginx (domain `etl-admin.*` trong
mẫu cấu hình), KHÔNG chung domain/route với `/api/v1/*` hay `/api/*` công
khai. Dù triển khai qua Nginx chung hay tách máy chủ hoàn toàn riêng, luôn
giữ:

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
