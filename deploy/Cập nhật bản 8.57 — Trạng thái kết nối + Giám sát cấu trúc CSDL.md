# Cập nhật bản 8.57 — Trạng thái kết nối + Giám sát cấu trúc CSDL

## Vấn đề

Theo yêu cầu người dùng, hệ thống cần 2 tính năng mới để chủ động biết
sớm các vấn đề ở nguồn dữ liệu, không phải đợi job đồng bộ chạy lỗi mới
phát hiện:

1. Xem được NGAY nguồn dữ liệu nào đang kết nối được / mất kết nối tới
   CSDL nguồn, không cần tự tay mở kết nối thử từng nguồn.
2. Biết NGAY LẬP TỨC nếu cấu trúc bảng/cột mà job đồng bộ đang phụ thuộc
   bị thay đổi (xoá cột, đổi tên cột, đổi kiểu dữ liệu) ở phía CSDL
   nguồn — trước đây chỉ có nút kiểm tra TAY ở trang Sync Jobs, và chỉ
   kiểm tra cột còn tồn tại hay không (không phát hiện đổi kiểu dữ liệu).

Phạm vi đã được xác nhận với người dùng (demo đã gửi trước khi triển
khai thật):
- "Trạng thái kết nối": áp dụng cho **cả `etl-admin` và `api-admin`**,
  chạy nền định kỳ mỗi 10-15 phút, trang chỉ hiện kết quả đã lưu (không
  mở kết nối thật mỗi lần vào trang) + nút "Kiểm tra lại ngay".
- "Giám sát cấu trúc CSDL": chỉ `etl-admin` (api-server không có khái
  niệm Sync Job phụ thuộc cấu trúc bảng nguồn như ETL), mức đầy đủ — phát
  hiện CẢ đổi kiểu dữ liệu cột, không chỉ kiểm tra tồn tại — chạy 1
  lần/ngày (6h sáng).

## Thay đổi

### 1. Trạng thái kết nối (`etl` + `api-server`, `etl-admin` + `api-admin`)

**`etl/lib/connectionHealthChecker.js`** (mới) / **`api-server/lib/connectionHealthChecker.js`**
(mới, mirror, không có cột `Engine` vì `api.DataSources` luôn là
SQL Server) — `checkAllConnections()`: lấy mọi `DataSources` đang bật,
gọi `testConnectionsBatch()` (đã có sẵn trong `lib/dataSourcePool.js`,
song song giới hạn 5 luồng) để thử kết nối thật, rồi `MERGE` kết quả vào
bảng mới `DataSourceConnectionStatus` (1 dòng/nguồn, luôn ghi đè — không
lưu lịch sử).

**`etl/routes/admin/connectionStatus.js`** / **`api-server/routes/admin/connectionStatus.js`**
(mới) — `GET /` đọc danh sách đã lưu (JOIN với `DataSources`); `POST
/check-now` ép gọi lại `checkAllConnections()` ngay rồi trả kết quả mới —
dùng cho nút "Kiểm tra lại ngay" trên trang. Cả 2 đều bọc
`requireMenuAccess('connection-status')`.

**`etl/server.js`** / **`api-server/server.js`** — trong khối
`isSchedulerLeader()` (chỉ 1 node chạy, tránh PM2 cluster trùng lặp):
gọi `checkAllConnections()` 1 lần ngay lúc khởi động (để trang không
trống nếu service vừa restart) + `cron.schedule('*/15 * * * *', ...)`
lặp lại mỗi 15 phút.

**`etl-admin/src/pages/ConnectionStatusPage.jsx`** / **`api-admin/src/pages/ConnectionStatusPage.jsx`**
(mới, giống nhau) — bảng danh sách nguồn dữ liệu + trạng thái, tổng số
nguồn đang mất kết nối ở đầu trang, nút "Kiểm tra lại ngay". 3 trạng thái
hiển thị tách biệt — `isConnected`: `true` (🟢 Kết nối được) / `false`
(🔴 Mất kết nối) / `null` (⏳ Chưa kiểm tra — nguồn vừa tạo, job nền chưa
chạy lượt đầu) — cố ý KHÔNG gộp `null` vào `false` để tránh admin hiểu
nhầm "chưa kiểm tra" thành "đang lỗi thật". Nguồn mất kết nối/chưa kiểm
tra luôn nổi lên đầu danh sách.

**Bảng mới** (`etl-db/schema.sql`, `api-db/schema.sql`):
`DataSourceConnectionStatus (DataSourceId PK/FK, IsConnected bit,
ErrorMessage nvarchar(500), LastCheckedAt datetime2)`.

### 2. Giám sát cấu trúc CSDL (chỉ `etl`, `etl-admin`)

**`etl/lib/schemaMonitor.js`** (mới) — `runSchemaCheck()`: với MỖI
`DataSources` có ít nhất 1 `SyncJobs` đang bật, lấy cấu trúc cột thật của
từng bảng đang dùng (qua `schemaBrowser.js` có sẵn, `INFORMATION_SCHEMA`),
so với mốc (`SchemaSnapshots`) lưu từ lần kiểm tra trước — phát hiện cột
bị xoá, cột đổi kiểu dữ liệu (so `dataType`/`isNullable`), cột mới thêm.
Lần đầu kiểm tra 1 bảng (chưa có mốc) chỉ lưu mốc, không báo gì (tránh
báo "mọi cột đều mới" — toàn nhiễu). Có thay đổi thật → ghi vào
`SchemaChangeLog` (lịch sử, không ghi đè) + gọi `mailer.js` gửi email
cảnh báo ngay. Cả 2 bảng dùng CHUNG 1 mốc thời gian tính 1 lần trong JS
cho mỗi lượt kiểm tra, để truy lại đúng "thay đổi của lần kiểm tra gần
nhất" (so khớp `SchemaChangeLog.DetectedAt` với
`SchemaSnapshots.CapturedAt`) mà không cần thêm cột mã lượt chạy riêng.

**`etl/lib/mailer.js`** — thêm `alertSchemaChange(changedTables)`, dùng
lại cấu hình SMTP đã có; nếu SMTP chưa cấu hình, chỉ bỏ qua gửi email
(log cảnh báo), KHÔNG làm job lỗi.

**`etl/routes/admin/schemaMonitor.js`** (mới) — `GET /` đọc lịch sử thay
đổi + trạng thái lần kiểm tra gần nhất; `POST /check-now` ép kiểm tra
ngay. Bọc `requireMenuAccess('schema-monitor')`.

**`etl/server.js`** — trong khối `isSchedulerLeader()`:
`cron.schedule(process.env.SCHEMA_MONITOR_CRON || '0 6 * * *', () =>
runSchemaCheck(), { timezone: 'Asia/Ho_Chi_Minh' })` — **không** chạy
ngay lúc khởi động (khác job kết nối ở trên) vì chụp mốc đầu tiên đúng
lúc service vừa khởi động dễ trùng lúc đang triển khai dở (thêm/sửa Sync
Job), nên để cố định 1 khung giờ mỗi ngày cho nhất quán.

**`etl-admin/src/pages/SchemaMonitorPage.jsx`** (mới) — lịch sử thay đổi
cấu trúc theo bảng, phân loại rõ xoá cột/đổi kiểu/thêm cột, nút "Kiểm
tra lại ngay".

**Bảng mới** (`etl-db/schema.sql`): `SchemaSnapshots` (1 dòng/bảng, luôn
ghi đè — chỉ để so sánh lượt sau, không phải lịch sử) và `SchemaChangeLog`
(append-only, lưu mọi thay đổi từng phát hiện).

### 3. Khác

**`etl/routes/admin/roles.js`** / **`api-server/routes/admin/roles.js`**
— thêm `connection-status`/`schema-monitor` (api-server chỉ thêm
`connection-status`) vào `MENU_CATALOG` để trang "Vai trò" vẽ được
checkbox cấp quyền — **CHƯA cấp cho vai trò nào**, quản trị viên tự cấp
sau khi triển khai (theo nguyên tắc không tự động cấp quyền áp dụng
xuyên suốt hệ thống).

## Các bước triển khai

1. `git pull origin main`.
2. Chạy lại `etl-db/schema.sql` (3 bảng mới) và `api-db/schema.sql` (1
   bảng mới).
3. `pm2 restart hcrc-etl` và `pm2 restart hcrc-api-server` (BẮT BUỘC —
   route API mới + job `cron.schedule` mới).
4. `cd etl-admin && npm run build`, copy `dist/` mới; `cd api-admin &&
   npm run build`, copy `dist/` mới.
5. Vào trang "Vai trò" (cả 2 giao diện) → cấp quyền xem "Trạng thái kết
   nối" (và "Giám sát cấu trúc CSDL" — chỉ `etl-admin`) cho vai trò cần
   dùng.
6. Kiểm tra `.env` (etl, api-server) có `SMTP_HOST`/`ALERT_EMAIL_TO` để
   nhận được email cảnh báo khi cấu trúc CSDL thay đổi — không bắt buộc,
   job vẫn chạy/ghi lịch sử nếu chưa cấu hình, chỉ không gửi được email.
7. Kiểm tra: mở "Trạng thái kết nối" → thấy trạng thái từng nguồn dữ
   liệu (bấm "Kiểm tra lại ngay" để test không cần đợi job nền); mở
   "Giám sát cấu trúc CSDL" (`etl-admin`) → "Chưa kiểm tra lần nào" cho
   tới 6h sáng hôm sau (có thể đổi tạm biến môi trường
   `SCHEMA_MONITOR_CRON` để test sớm hơn, vd `*/5 * * * *`).

Không đổi cấu trúc bảng/CSDL nguồn dữ liệu hiện có, không ảnh hưởng job
đồng bộ đang chạy.
