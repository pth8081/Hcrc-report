# Phiên bản

Phiên bản chung của toàn bộ hệ thống HCRC (ETL, Data Warehouse, Report
Server, API Server và các giao diện quản trị) — tăng ở mỗi lần merge vào
`main`, theo kiểu semver không chặt (patch cho fix nhỏ, minor cho tính năng
mới, major khi đổi cấu trúc phá vỡ tương thích ngược).

## 0.31.0 — Xác thực hai yếu tố (2FA/TOTP) BẮT BUỘC cho tài khoản admin (cả 3 hệ thống)

Chỉ áp dụng cho vai trò **admin** (ETL: `Role='admin'`; API Server:
`Role='admin'`; Report Server: vai trò `IsSystemRole=1`) — vai trò khác
(`viewer`/`target_importer`/user thường) không đổi gì, đăng nhập như cũ.
Tài khoản admin CHƯA bật 2FA bị chặn ngay ở màn "bắt buộc đăng ký" trước khi
vào được bất kỳ trang nào khác — không có đường tắt.

- **`lib/twoFactor.js`** (mới, 1 bản/service, `otplib` + `qrcode`) — sinh/xác
  thực mã TOTP (RFC 6238, dung sai ±30s bù lệch đồng hồ), sinh QR
  (`otpauth://`, nhãn RIÊNG theo từng hệ thống — "HCRC ETL"/"HCRC
  API"/"HCRC Report" — 1 điện thoại/1 app dùng chung được cho cả 3 hệ
  thống, NHƯNG mỗi hệ thống có secret RIÊNG, không dùng chung 1 secret),
  10 mã khôi phục dùng 1 lần (hash bcrypt, hiện nguyên văn đúng 1 lần lúc
  bật 2FA). Secret mã hoá bằng `crypto.js`/`*_ENCRYPTION_KEY` sẵn có của
  từng service — không lưu plaintext. Chống dùng lại đúng 1 mã TOTP vừa
  xác thực thành công (chống replay, trong bộ nhớ tiến trình theo userId).
- **Schema** (`etl-db`, `api-db`, `rp-db`) — thêm `TwoFactorSecretEncrypted`/
  `TwoFactorEnabled`/`TwoFactorEnrolledAt` vào `admin.AdminUsers`/`app.Users`
  + bảng mới `AdminTwoFactorRecoveryCodes`/`UserTwoFactorRecoveryCodes`.
- **Luồng đăng nhập chèn thêm bước** (`lib/adminAuth.js`/`lib/auth.js`) —
  token TRUNG GIAN mới (`pending`/`setupRequired`/`enroll`, TTL 10 phút,
  trả trong JSON KHÔNG đặt cookie) tách biệt hoàn toàn khỏi token phiên
  ĐẦY ĐỦ (KHÔNG bao giờ mang claim `twofa`) — `requireAdminAuth`/`requireAuth`
  từ chối thẳng bất kỳ token nào mang claim này, phòng thủ chiều sâu chống
  lỗi logic lỡ gán nhầm cookie phiên từ token chưa đủ 2 yếu tố.
- **`routes/admin/twoFactor.js`/`routes/twoFactor.js`** (mới) — `POST
  /setup` (đăng ký lần đầu HOẶC đổi thiết bị — đổi thiết bị đòi phiên đầy
  đủ + mã hiện tại, chứng minh còn kiểm soát thiết bị cũ), `POST /confirm`
  (xác nhận mã đầu tiên -> lưu secret + bật 2FA + sinh 10 mã khôi phục +
  vào phiên luôn), `POST /verify` (đăng nhập lần sau -> mã 6 số hoặc mã
  khôi phục). KHÔNG có route tự tắt 2FA (mâu thuẫn với "bắt buộc") — chỉ
  peer-reset (dưới) mới gỡ được, và gỡ xong vẫn bắt đăng ký lại ngay.
- **"Đặt lại 2FA" giúp admin khác** — `POST /:id/reset-2fa` (users.js cả 3
  service) — 1 admin gỡ 2FA giúp admin KHÁC bị mất thiết bị, LUÔN ghi audit
  log rõ ai gỡ cho ai. `api-server` trước đây KHÔNG có route quản lý
  `admin.AdminUsers` nào (tài khoản chỉ tạo qua `scripts/seedAdmin.js`) —
  thêm `routes/admin/users.js` tối giản (chỉ xem danh sách + đặt lại 2FA,
  CHƯA thêm CRUD đầy đủ, giữ nguyên quy ước cũ).
- **Khôi phục 2 lớp**: 10 mã khôi phục tự dùng khi không có admin khác để
  nhờ, CỘNG peer-reset khi có — không phụ thuộc hẳn vào 1 cơ chế.
- **Frontend** (`etl-admin`/`api-admin`/`rp-user`) — `LoginPage.jsx` xử lý
  3 nhánh phản hồi đăng nhập (`ok`/`pending`/`setupRequired`): màn nhập mã
  (kèm lối "dùng mã khôi phục"), màn bắt buộc đăng ký (QR + xác nhận + hiện
  10 mã khôi phục ĐÚNG 1 LẦN trước khi vào hệ thống). Trang "Phân quyền"/
  "Tài khoản quản trị" thêm cột 2FA + nút "Đặt lại 2FA" (chỉ hiện cho hàng
  admin, `rp-user` còn ẩn nút với người xem không phải Admin hệ thống).
- Test tích hợp ĐẦY ĐỦ (dựng Express app thật + fake CSDL trong bộ nhớ, gọi
  HTTP thật qua `fetch`) cho ETL và Report Server: đăng nhập không cần 2FA
  (vai trò khác admin), setupRequired → setup → confirm → phiên, pending →
  verify (mã đúng/sai, chống replay chờ qua cửa sổ TOTP thật), mã khôi phục
  dùng đúng 1 lần, phòng thủ chặn token `twofa` lọt vào cookie phiên,
  peer-reset + audit log, bắt đăng ký lại sau khi bị reset. Smoke test riêng
  cho API Server (route `users.js` mới). `vite build` sạch cả 3 giao diện.

## 0.30.0 — Sẵn sàng vận hành production: crash resilience, health check thật, đóng dần sạch, chặn cấu hình sai NGAY lúc khởi động

Rà soát lần 2 (sau đợt bảo mật 0.28.0): lần này về VẬN HÀNH (khác lỗ hổng
bảo mật) — 1 Blocker thật sự (không có gì chặn restart-loop vô hạn khi
tiến trình lỗi ngay lúc khởi động, không bắt lỗi không mong muốn) + vài
việc nên làm trước khi có traffic thật. Áp dụng ĐỒNG NHẤT cho cả 3 service.

- **`lib/processGuards.js`** (mới, 1 bản/service) — `uncaughtException`/
  `unhandledRejection` giờ CHỦ ĐỘNG thoát (`process.exit(1)`) thay vì để
  tiến trình "sống dở chết dở" ở trạng thái không còn đáng tin (Node mặc
  định không tự thoát, chỉ log ra rồi tiếp tục chạy) — PM2 khởi động lại
  SẠCH. `SIGTERM`/`SIGINT` (PM2 `reload`/`stop`) giờ ĐÓNG DẦN: ngừng nhận
  request mới, đợi request đang xử lý xong, đóng hết pool CSDL rồi mới
  thoát — có hạn mức 10s chống treo vô thời hạn.
- **`db.js`** (cả 3 bản) — thêm `assertConfigured(prefix)` (tách khỏi
  `getPool()`) + `closeAll()` (api-server/rp-server trước đây CHƯA có,
  chỉ etl có) — dùng cho cả kiểm tra lúc khởi động lẫn đóng dần lúc tắt.
- **`server.js`** (cả 3) — kiểm tra cấu hình BẮT BUỘC (biến kết nối CSDL,
  JWT secret, khoá mã hoá) NGAY trước `app.listen` — trước đây các hàm này
  (`getSecret()`, `getKey()`) chỉ được gọi LƯỜI lúc dùng thật (lượt đăng
  nhập/mã hoá đầu tiên), README từng ghi "lỗi ngay lúc khởi động" nhưng
  thực tế CHƯA đúng — giờ đúng thật. KHÔNG mở kết nối CSDL thật lúc khởi
  động (chỉ kiểm tra biến môi trường), tránh làm chậm/rung lắc nếu CSDL
  tạm thời chưa sẵn sàng.
- **`deploy/ecosystem.config.js`** — `min_uptime`/`max_restarts` — PM2
  trước đây restart VÔ HẠN nếu tiến trình thoát ngay lúc khởi động (cấu
  hình sai) — giờ dừng sau 10 lần, chuyển trạng thái `errored` rõ ràng
  thay vì cắm restart-loop tốn CPU.
- **`routes/health.js`/`routes/v1/health.js`/etl `GET /health`** — PING
  THẬT các pool CSDL (`SELECT 1`) thay vì chỉ trả "tiến trình đang chạy" —
  503 nếu 1 pool không kết nối được, nêu rõ pool nào.
- **`deploy/README.md`** — thêm mục xoay vòng log (`pm2-logrotate` +
  xác nhận logrotate Nginx khớp 4 file `hcrc-*.access.log` mới), gia hạn
  chứng chỉ TLS (certbot renewal-hook tự reload Nginx — trước đây thiếu,
  chứng chỉ gia hạn xong Nginx vẫn phục vụ bản CŨ tới khi reload thủ công),
  và ghi rõ sao lưu CSDL là trách nhiệm DBA/hạ tầng (trước đây không nhắc
  tới ở đâu, dễ hiểu lầm "không cần lo").
- 4 bộ test độc lập (`processGuards.js`, `assertConfigured` × 3 service,
  health check ping) + **smoke test THẬT**: spawn từng `server.js` làm
  tiến trình con — xác nhận thiếu cấu hình thoát ngay (không `app.listen`),
  đủ cấu hình khởi động thành công (không cần CSDL thật), rồi SIGTERM thoát
  sạch trong vài giây.

## 0.29.0 — "Kiểm tra schema" — đối chiếu lại job/endpoint ĐÃ LƯU với schema thật hiện tại (ETL, API Server)

Trước đây ETL/API Server chỉ đối chiếu cấu hình với schema thật của nguồn
ĐÚNG LÚC LƯU (POST/PUT) — nếu sau đó ai đó đổi tên/xoá cột hay bảng trên
CSDL nguồn mà không ai vào sửa lại job/endpoint đó, hệ thống không biết gì
cả, chỉ lộ ra khi job CHẠY THẬT (hoặc đối tác ngoài GỌI THẬT endpoint) và
báo lỗi SQL. Report Server không cần tính năng này — không cấu hình theo
kiểu "1 bảng + danh sách cột" như ETL/API Server (đọc từ Data Warehouse
hoặc gọi API Server, không tự duyệt schema CSDL nguồn nào).

- **`etl/routes/admin/syncJobs.js`** — `POST /:id/check-schema` (mới): nạp
  lại job đã lưu, chạy `validateTableJobSchema()` (hàm ĐÃ CÓ, dùng chung
  với lúc Lưu) đối chiếu với schema THẬT hiện tại — trả `{ok, error?}`.
  Job Type='custom' trả `{ok:true, skipped:true}` (không có bảng/cột để
  kiểm tra). Đọc-only, ghi audit log kết quả (khớp/lệch).
- **`api-server/routes/admin/realtimeEndpoints.js`** — `POST
  /:endpoint/check-schema` (mới), cùng khuôn — dùng lại
  `assertFullSchemaMatches()` đã có.
- **`etl-admin/.../SyncJobsPage.jsx`** + **`api-admin/.../RealtimeEndpointsPage.jsx`**
  — nút "Kiểm tra schema" trên mỗi dòng, hiện cho cả `viewer` (đọc-only,
  không giới hạn admin).
- Phạm vi: chỉ kiểm tra bảng/cột CÒN TỒN TẠI hay không (khớp đúng logic
  validate sẵn có) — CHƯA kiểm tra đổi kiểu dữ liệu cột.
- 2 bộ test độc lập (etl + api-server) + `vite build` cả 2 giao diện.

## 0.28.1 — Cấu hình fail2ban cho máy chủ triển khai (bổ sung, khuyến nghị)

Lớp phòng thủ THÊM ở tầng firewall — chặn hẳn IP sau nhiều lần thất bại,
KHÔNG thay thế rate-limit/chặn brute-force đã có sẵn trong code (lớp ứng
dụng, request vẫn phải vào tới Node mới bị từ chối) mà bổ sung: sau đủ
ngưỡng, IP bị chặn thẳng ở firewall, không còn chạm được tới Nginx/Node.

- **`deploy/nginx.conf`** — mỗi domain ghi `access_log` RIÊNG
  (`hcrc-report`/`hcrc-api`/`hcrc-api-admin`/`hcrc-etl-admin.access.log`) —
  trước đây dùng chung log mặc định, không tách được theo domain để
  fail2ban theo dõi đúng chỗ.
- **`deploy/fail2ban/`** (mới) — `jail.local` + 3 filter riêng:
  `hcrc-admin-login` (đăng nhập sai `/admin/auth/login`, dùng chung cho
  api-admin + etl-admin), `hcrc-report-login` (đăng nhập sai
  `/api/auth/login` của rp-server), `hcrc-api-abuse` (401/429 dồn dập trên
  `/api/v1/*` — ngưỡng cao hơn 2 jail đăng nhập vì đây là traffic đối tác
  máy-tới-máy, không phải người gõ tay). `bantime.increment` tăng dần thời
  gian cấm với IP tái phạm. `[sshd]` bật sẵn (dùng filter có sẵn của
  fail2ban) cho máy chủ có SSH — mục tiêu kinh điển nhất của fail2ban.
  `deploy/fail2ban/README.md` — hướng dẫn cài đặt + kiểm tra.
- 1 test độc lập xác nhận cả 3 failregex khớp đúng dòng log lỗi thật (401
  trên đúng path đăng nhập/429 trên `/api/v1/*`), KHÔNG khớp nhầm request
  thành công hay path khác domain.

## 0.28.0 — Rà soát bảo mật toàn diện (ETL/API Server/Report Server): sửa các lỗ hổng phát hiện

Rà soát chuyên sâu lần 2 (sau Phase 0-3) trên toàn bộ code đã thêm qua các
đợt tính năng B-J — 3 audit độc lập, mỗi hệ thống 1 audit. Không phát hiện
lỗi Critical/High mới ở API Server/Report Server; 1 lỗi HIGH ở ETL (phân
quyền), còn lại Medium/Low — đã sửa hết:

**ETL (HIGH — phân quyền `target_importer`/`viewer`)**: các route GET hạ
tầng thật (`etl.DataSources` — host/port/username, duyệt schema thật;
`etl.SyncJobs`; `admin.AuditLog`; `admin.AdminUsers`) trước đây chỉ có
`requireAdminAuth` — bất kỳ vai trò nào đăng nhập được, kể cả
`target_importer` (vai trò hẹp, giao diện đã ẩn hẳn các trang này khỏi
menu — `etl-admin/src/components/Layout.jsx`), đều gọi thẳng API đọc được
dữ liệu hạ tầng nhạy cảm dù chưa từng thấy trang đó qua giao diện.
- **`etl/lib/adminAuth.js`** — thêm `blockTargetImporter()`: chặn đúng
  `target_importer`, KHÔNG đổi hành vi `viewer` (vẫn xem được như thiết kế
  hiện có trên giao diện — không phải mọi route đều siết về admin-only).
- Gắn vào 8 route GET: `dataSources.js` (danh sách + 3 route duyệt schema),
  `syncJobs.js` (danh sách + custom-connectors), `auditLog.js`, `users.js`.

**ETL (LOW)**: `PUT /admin/users/:id` không kiểm tra whitelist `role` (POST
có, PUT thì không) — thêm kiểm tra `['admin','viewer','target_importer']`.

**ETL (MEDIUM — DoS)**: `.xlsx` nhập hàng loạt (`dataSourcesImport.js`,
`salesTargetsImport.js`) giới hạn 5MB nén nhưng không giới hạn số dòng sau
khi giải nén (dữ liệu lặp lại nén rất tốt) — thêm `MAX_IMPORT_ROWS=5000`,
chặn NGAY sau khi đọc sheet, trước khi lặp/mã hoá mật khẩu từng dòng.

**API Server (MEDIUM)**: `POST /api/v1/oauth/token` không đọc
`RateLimitPerMinute` từ `api.ApiConsumers` — token phát ra thiếu trường
này, `verifyToken()` rơi về "0 = không giới hạn", đối tác `AuthMethod='oauth2'`
thoát hẳn giới hạn riêng admin đã đặt. Đã thêm cột vào câu SELECT + payload
token (`routes/v1/oauth.js`).

**API Server (LOW)**: so sánh `client_secret` dùng `!==` chuỗi thường (rò
rỉ thời gian xử lý) thay vì `crypto.timingSafeEqual` như `lib/hmacAuth.js`
đã dùng — đồng bộ lại cách so sánh.

**Report Server (MEDIUM — DoS)**: báo cáo `SourceType='composite'` không
giới hạn số "khối" (`blocks`) — mỗi khối `apiReport`/`apiRealtime` chạy
song song (`Promise.all`) giữ 1 lượt gọi HTTP tới 30s, khối `directDb`
không tự chọn nguồn dùng chung pool DWH — 1 báo cáo nhiều khối, gọi lặp
lại, có thể chiếm hết pool/mở nhiều kết nối HTTP đồng thời, ảnh hưởng báo
cáo của người dùng khác. Thêm `MAX_COMPOSITE_BLOCKS=15` trong
`validateCompositeDefinition()` (`routes/reportCatalog.js`).

**Cluster mode**: xác nhận CHƯA cấu hình (PM2 chạy mỗi service ở chế độ
`fork`, 1 tiến trình — `deploy/ecosystem.config.js`) — thiết kế có chủ đích
hiện tại (tự restart khi crash, không multi-core/không zero-downtime
deploy), không phải thiếu sót cần sửa ngay.

5 bộ test độc lập cho toàn bộ fix trên (fakeModule pattern) + xác nhận cả
3 service (`etl`, `api-server`, `rp-server`) load sạch sau khi sửa.

## 0.27.1 — Dashboard ETL: bộ lọc "Đang lỗi/Quá hạn" + tìm kiếm theo tên job

Tiếp nối 0.27.0 — với vài chục kết nối/job, bảng "Từng job" trên Dashboard
dài dần, khó rà soát. Cân nhắc phương án cho phép admin CHỌN kết nối nào
hiện trên Dashboard (ẩn bớt) nhưng đánh giá đây là phản tác dụng cho mục
đích giám sát (dễ vô tình ẩn đúng kết nối đang lỗi) — thay bằng bộ lọc XEM
tạm thời, không đổi cấu hình/dữ liệu gì:

- **`etl/routes/admin/dashboard.js`** — `jobs` kèm thêm `LastRunStatus`/
  `LastRunError`/`LastRunAt` (lượt chạy GẦN NHẤT, không chỉ mốc thành công
  cuối) và `IsOverdue` (dùng lại `isJobOverdue()` từ `lib/syncStatus.js` —
  không viết lại logic ước lượng chu kỳ cron).
- **`etl-admin/.../DashboardPage.jsx`** — ô tìm kiếm theo tên job (áp dụng
  cả 3 bảng) + tab "Tất cả/Đang lỗi/Quá hạn" lọc riêng bảng "Từng job".
  Bảng "Từng job" hiện thêm cột lượt chạy gần nhất (icon ✅/⛔) và cờ "⚠️ Quá
  hạn".
- 1 test độc lập (route trả đúng `LastRunStatus`/`IsOverdue`) + `vite
  build` etl-admin.

## 0.27.0 — ETL: chặn cứng khi lượt đồng bộ sắp xoá lịch sử nhiều ngày + theo dõi trạng thái đồng bộ theo từng nguồn dữ liệu

Chuẩn bị cho việc backfill dữ liệu lịch sử (vd đồng bộ từ 2025 đến hiện tại
qua 33+ kết nối chi nhánh) — 2 rủi ro cần xử lý: (1) quên tích "Giữ lịch sử"
khiến lượt đồng bộ hàng ngày sau đó âm thầm xoá sạch dữ liệu cũ; (2) không
có chỗ rà soát nhanh 33+ kết nối đang lỗi/quá hạn.

- **`etl/lib/upsert.js`** — thêm `shouldBlockHistoryWipe()` (hàm thuần, test
  độc lập không cần CSDL): trước khi thực hiện bước dọn dữ liệu cũ (chỉ chạy
  khi `KeepHistory=false`), đo khoảng cách ngày (span) của các dòng SẮP bị
  xoá. Span vượt 3 ngày (`STALE_HISTORY_SPAN_DAYS`) — dấu hiệu domain lịch
  sử nhiều ngày bị lỡ tắt "Giữ lịch sử" — thì **CHẶN CỨNG**: không xoá,
  không MERGE, ném lỗi để lượt chạy đó hiện LỖI rõ ràng trên Dashboard/Log
  (rollback toàn bộ transaction, dữ liệu cũ không đụng gì). Dọn "chốt số
  mới nhất" bình thường (span 1-2 ngày, đúng thiết kế cũ) vẫn chạy như cũ,
  không bị chặn nhầm.
- **`etl/lib/syncStatus.js`** (mới) — tổng hợp trạng thái đồng bộ THEO TỪNG
  NGUỒN dữ liệu (gộp mọi `etl.SyncJobs` trỏ vào nguồn đó): lần chạy gần
  nhất, trạng thái, và đếm job "quá hạn" (đang bật nhưng lâu hơn 3× chu kỳ
  cron của chính nó mà chưa chạy lại — ước lượng chu kỳ từ 2 dạng cron thực
  tế đang dùng, `*/N phút` hoặc giờ cố định hàng ngày).
- **`etl/routes/admin/dataSources.js`** — `GET /` trả kèm `SyncStatus` theo
  từng nguồn (null = nguồn chưa gắn job nào).
- **`etl-admin/.../DataSourcesPage.jsx`** — cột "Đồng bộ" mới trên trang
  "Nguồn dữ liệu": lần chạy gần nhất + cảnh báo đỏ "N job quá hạn" — rà soát
  nhanh nhiều kết nối cùng lúc mà không cần đối chiếu qua Dashboard.
- 3 bộ test độc lập (`shouldBlockHistoryWipe`, `syncStatus.js`, route
  `dataSources.js`) + `vite build` etl-admin.

## 0.26.0 — Lịch gửi email: Subject riêng + gửi qua nội dung email (HTML body) có tô màu cảnh báo

Case thật: báo cáo đối chiếu doanh thu siêu thị ↔ trung tâm, gửi định kỳ
NGAY TRONG NỘI DUNG EMAIL (không phải file đính kèm), tô đỏ ô "Chênh lệch"
khi vượt ngưỡng. Trước đây `app.ReportEmailSchedules` chỉ gửi được file
đính kèm (Excel/PDF) với Subject cố định 1 mẫu duy nhất.

- **`rp-db/schema.sql`** — thêm 4 cột vào `app.ReportEmailSchedules`:
  `Subject` (rỗng = dùng mẫu mặc định, hỗ trợ placeholder `{ngay}` -> ngày
  gửi thật), `DeliveryMode` (`'attachment'` mặc định | `'body'`),
  `HighlightColumnKey`/`HighlightThreshold` (chỉ áp dụng khi
  `DeliveryMode='body'` — tô đỏ ô nào có |giá trị| vượt ngưỡng).
- **`rp-server/lib/emailBodyRenderer.js`** (mới) — dựng bảng HTML (style
  inline, đúng ràng buộc email client) từ `{columns, rows}`, tô đỏ đúng 1
  cột theo ngưỡng của lịch, escape HTML chống XSS/lỗi hiển thị.
- **`rp-server/lib/mailer.js`** — `sendMail()` nhận thêm tham số `html`.
- **`rp-server/jobs/reportEmailScheduler.js`** — `runSchedule()` rẽ nhánh
  theo `DeliveryMode`: `'body'` gửi HTML không đính kèm; `'attachment'`
  giữ nguyên hành vi cũ. Subject tự điền được thay `{ngay}` bằng ngày gửi
  thật; để trống vẫn ra đúng mẫu cũ (tương thích ngược).
- **`rp-server/routes/reportEmailSchedules.js`** — POST/PUT nhận/lưu 4
  trường mới, `GET /reports` trả kèm danh sách cột để chọn "cột tô màu".
- **`rp-user/.../EmailSchedulesPage.jsx`** — ô Subject, chọn "Cách gửi"
  (đính kèm/nội dung email), khi chọn nội dung email hiện thêm ô chọn cột
  + ngưỡng cảnh báo.
- Ngưỡng/cột tô màu lưu THEO TỪNG LỊCH GỬI (không cố định trong định
  nghĩa báo cáo) — cùng 1 báo cáo, nhiều lịch gửi có thể đặt ngưỡng khác
  nhau. Tô màu hiện CHỈ áp dụng email HTML body (rp-user/Excel/PDF vẫn ra
  đúng số, không tô màu — phạm vi hẹp có chủ đích, mở rộng sau nếu cần).
- 3 bộ test độc lập (`emailBodyRenderer`, `reportEmailScheduler` rẽ nhánh
  DeliveryMode + placeholder Subject, route CRUD) + `hướng_dẫn_báo_cáo.md`
  mục 4 — hướng dẫn đầy đủ case đối chiếu siêu thị/trung tâm (kiến trúc 2
  đường ETL độc lập gặp nhau ở DWH dưới 2 Domain khác nhau, KHÔNG vi phạm
  nguyên tắc "không lấy từ data warehouse" vì DWH chỉ là nơi chứa tạm để
  ghép, không phải nguồn sự thật DÙNG CHUNG cho 2 số liệu).

## 0.25.1 — Báo cáo composite chạy các khối SONG SONG thay vì tuần tự

Báo cáo `SourceType='composite'` (ghép nhiều nguồn — nhiều Domain DWH, nhiều
endpoint API Server, chỉ tiêu) trước đây chạy từng khối TUẦN TỰ (`for...await`)
— độ trễ báo cáo bằng TỔNG thời gian mọi khối cộng lại. Càng dùng nhiều khối
`apiReport`/`apiRealtime` (mỗi khối 1 lượt gọi HTTP riêng tới API Server) thì
càng chậm thêm.

- **`rp-server/lib/compositeReportRunner.js`** — `runCompositeReport()` đổi
  sang `Promise.all(definition.blocks.map(...))`: mọi khối bắt đầu chạy
  CÙNG LÚC, độ trễ tổng bằng khối CHẬM NHẤT thay vì tổng mọi khối. Vòng ghép
  (merge theo `entityCode`) vẫn duyệt kết quả theo ĐÚNG thứ tự
  `definition.blocks` như cũ (`Promise.all` giữ nguyên thứ tự mảng kết quả
  khớp thứ tự mảng đầu vào, bất kể khối nào resolve trước) — thứ tự dòng trả
  về, logic `groupBy`/dòng tổng không đổi, chỉ nhanh hơn.
- 4 test độc lập: đo thời gian chạy thật (3 khối 60ms/40ms/10ms xong trong
  ~60ms chứ không phải 110ms), xác nhận mọi khối bắt đầu gần như đồng thời,
  xác nhận kết quả ghép đúng dữ liệu + đúng thứ tự dù khối resolve sau lại
  có độ trễ ngắn hơn khối resolve trước, và hồi quy `groupBy`/dòng tổng vẫn
  tính đúng.

## 0.25.0 — Endpoint realtime hỗ trợ JOIN 1 bảng liên kết (api-server tự ghép, client chỉ nhận kết quả)

Trước đây `api.RealtimeEndpointDefs` chỉ SELECT được đúng 1 bảng — dữ liệu
cần ghép từ 2 bảng (vd `Vouchers.UsedByCustomerId` → tên khách hàng thật ở
bảng `Customers` riêng) không có cách nào xử lý ngoài bắt báo cáo/đối tác
tự tra thêm 1 lượt gọi khác. Theo đúng yêu cầu "API Server xử lý, client
chỉ nhận kết quả" — thêm JOIN TUỲ CHỌN, TỐI ĐA 1 bảng (đúng scope
`etl.SyncJobs` đã dùng cho ETL — không hỗ trợ N-way join, cần ghép 3+ bảng
thì tạo VIEW phía nguồn thay vì mở rộng thêm).

- **`api-db/schema.sql`** — thêm 6 cột vào `api.RealtimeEndpointDefs`:
  `JoinSchema, JoinTable, JoinType, MainJoinColumn, LookupJoinColumn,
  JoinColumnsJson` (tất cả NULL = không có bảng liên kết, hành vi cũ giữ
  nguyên 100%). Migration `IF COL_LENGTH(...) IS NULL` cho DB đã có sẵn.
- **`api-server/lib/realtimeEngine.js`** — `runLookup`/`runList` SELECT
  kèm `LEFT`/`INNER JOIN` nếu endpoint có cấu hình bảng liên kết. Cột bảng
  chính/liên kết qua alias `m.`/`j.` (tránh lỗi "ambiguous column name"
  nếu 2 bảng tình cờ trùng tên cột — vẫn KHÔNG hỗ trợ alias đổi tên cột,
  trùng tên là lỗi cấu hình báo rõ lúc chạy, giống hệt quy ước không alias
  đã có). Kết quả trả về là 1 dòng/danh sách PHẲNG, đúng tên cột gốc — client
  không biết (và không cần biết) dữ liệu đến từ mấy bảng.
- **`api-server/routes/admin/realtimeEndpoints.js`** — `validatePayload` +
  `assertSchemaMatches` mở rộng: có `joinTable` thì bắt buộc kèm
  `joinSchema/mainJoinColumn/lookupJoinColumn`, đối chiếu CẢ bảng liên kết
  với schema thật lúc lưu (giống bảng chính, cùng cơ chế 0.21.6).
- **`api-admin` `RealtimeEndpointsPage.jsx`** — thêm khối "Thêm bảng/view
  liên kết" (tick bật/tắt, chọn bảng qua dropdown duyệt schema thật, chọn
  cột nối 2 chiều, chọn cột lấy thêm) — cùng mẫu UI đã dùng cho etl-admin
  "Đồng bộ".
- **`hướng_dẫn_báo_cáo.md`** mục 3 (Kiểm tra voucher) — cập nhật ví dụ dùng
  thẳng JOIN thật (`UsedByCustomerId` → `Customers.CustomerName`) thay vì
  giả định 1 bảng phẳng sẵn có.
- 7 nhóm test độc lập: câu SQL sinh đúng JOIN/alias/ORDER BY, endpoint
  không cấu hình JOIN thì hành vi cũ y hệt, validate thiếu field bắt buộc,
  đối chiếu sai cột bảng liên kết báo đúng lỗi, không JOIN thì `JoinTable`
  ghi `null`. `vite build` sạch cho `api-admin`.

## 0.24.1 — Báo cáo tra cứu 1 mã qua API Server (`lookupField`) — vd Kiểm tra voucher

Trước đây `SourceType='apiRealtime'` chỉ gọi được `GET /v1/realtime/.../list`
(danh sách phân trang) — báo cáo có ô lọc nhưng gõ gì cũng bị bỏ qua, không
dùng được cho case "nhập 1 mã, ra đúng 1 dòng kết quả" (vd tra cứu voucher:
chưa dùng → trạng thái + ngày hết hạn; đã dùng → trạng thái + ngày/người/
nơi sử dụng). Endpoint tra-1-khoá (`GET /v1/realtime/.../{key}`) đã có sẵn ở
api-server từ trước, chỉ chưa có phía báo cáo nào gọi tới.

- **`rp-server/lib/apiReportClient.js`** — thêm `DefinitionJson.lookupField`
  (tuỳ chọn, tên 1 field trong `filters`): có field này thì `apiRealtime`
  chuyển từ `/list` sang `GET /v1/realtime/{ApiTarget}/{giá trị lọc}`. Chưa
  nhập giá trị lọc → trả 0 dòng, KHÔNG gọi API Server. Mã không tồn tại
  (API trả 404) → trả 0 dòng, không phải lỗi. Lỗi thật (401/403/500...) vẫn
  ném ra như cũ — `callApiServerLookup()` chỉ coi RIÊNG 404 là "không có",
  không nuốt lỗi khác. Không đặt `lookupField` thì hành vi `/list` cũ giữ
  nguyên 100%, không ảnh hưởng báo cáo đang chạy.
- Không cần đổi schema DB (DefinitionJson vốn là JSON tự do) và không cần
  sửa UI rp-user (ô lọc kiểu `text` đã vẽ sẵn qua `FilterForm.jsx`, cấu hình
  `lookupField` gõ thẳng trong ô DefinitionJson như mọi SourceType khác).
- **`hướng_dẫn_báo_cáo.md`** — thêm mục 3 "Báo cáo tra cứu 1 mã qua API
  Server (lookupField)" — đầy đủ các bước api-admin (Nguồn dữ liệu, Endpoint
  realtime, Đối tác) + rp-user (Kết nối API Server, tạo báo cáo với ví dụ
  DefinitionJson đầy đủ, case Kiểm tra voucher).
- **`rp-server/README.md`** — cập nhật mục "Báo cáo lấy dữ liệu qua API
  Server (realtime)" cho đúng khả năng mới (trước đó ghi "chưa hỗ trợ lọc
  động" — nay đúng 1 phần, vẫn đúng cho chế độ list).
- 7 nhóm test độc lập (`fakeModule` + `fetch` giả lập): voucher chưa dùng
  (UsedAt/UsedBy/UsedLocation null), voucher đã dùng (đủ ngày/người/nơi sử
  dụng), chưa nhập mã (0 dòng, 0 lượt gọi mạng), mã không tồn tại (0 dòng,
  không lỗi), lỗi thật vẫn throw, mã có ký tự đặc biệt được `encodeURIComponent`
  đúng, và hồi quy xác nhận chế độ `/list` cũ (không đặt `lookupField`)
  không đổi hành vi.

## 0.24.0 — Module "Nhật ký thao tác" (etl + api-server) + log đăng nhập cả 3 hệ thống

Trước đây chỉ rp-server có nhật ký "ai làm gì" (`app.AuditLog` + trang
"Log"); etl và api-server chỉ có log HỆ THỐNG (`etl.SyncLog`, `api.RequestLog`)
chứ không có log THAO TÁC admin. Cũng chưa hệ thống nào lưu lịch sử đăng
nhập (chỉ đếm tạm trong RAM để chặn brute-force + đè `LastLoginAt`). Tính
năng này nhân bản đúng mẫu `app.AuditLog`/`logAction()` của rp-server sang
etl và api-server — **cố ý KHÔNG dựng 1 service log tập trung đọc chung 3
CSDL** (phá vỡ mô hình cô lập bảo mật đang dùng, tạo thêm 1 điểm lỗi chung
không cần thiết — cùng lý do `portal/` chỉ là danh mục tĩnh, không gọi API
tổng hợp).

- **`etl-db/schema.sql`, `api-db/schema.sql`** — thêm `admin.AuditLog`
  (Id, UserId, Username, Module, ActionType, TargetObject, Description,
  IpAddress, Status, CreatedAt), cùng khuôn `app.AuditLog` bên rp-server.
- **`etl/lib/auditLog.js`, `api-server/lib/auditLog.js`** (mới) —
  `logAction()`, đọc `req.admin` (JWT payload admin-only, khác `req.user`
  bên rp-server) thay vì `req.user`. Lỗi ghi log bị nuốt, không làm hỏng
  request gốc.
- **Gắn vào mọi route sửa dữ liệu**: etl (`dataSources.js`, `syncJobs.js`,
  `salesTargets.js`, `users.js`), api-server (`dataSources.js`,
  `consumers.js`, `reportCatalog.js`, `realtimeEndpoints.js`). Riêng
  `consumers.js` (đối tác API) — **tuyệt đối không ghi bí mật thật**
  (apiKey/clientSecret/hmacSecret) vào log, chỉ ghi tên + phương thức xác
  thực; có test riêng xác nhận không có chuỗi giống bí mật nào lọt vào mô
  tả log.
- **Log đăng nhập** (thành công LẪN thất bại) — thêm cho CẢ 3 hệ thống
  (kể cả rp-server, trước đây cũng chưa có) — `etl/routes/admin/auth.js`,
  `api-server/routes/admin/auth.js`, `rp-server/server.js`. Thất bại vẫn
  ghi được username đã gõ (kể cả sai/không tồn tại) vì logAction chỉ cần
  `req.ip` + tên, không cần đã xác thực.
- **`etl/routes/admin/auditLog.js`, `api-server/routes/admin/auditLog.js`**
  (mới) — `GET /admin/audit-log`, lọc username/module/khoảng ngày, phân
  trang, cùng khuôn `rp-server/routes/auditLog.js`.
- **`etl-admin`, `api-admin` `AuditLogPage.jsx`** (mới) — trang "Nhật ký
  thao tác", tách riêng khỏi trang "Log"/"Lịch sử" hệ thống đang có (khác
  loại dữ liệu — user action vs. system run/request).
- **Dọn dẹp tự động** — `etl.SyncLog` và `app.AuditLog` (rp-server) trước
  đây KHÔNG có retention, phình vô hạn. Thêm `etl/jobs/cleanupLogs.js`
  (`cleanupSyncLog` + `cleanupAuditLog`), `api-server/jobs/cleanupAuditLog.js`,
  `rp-server/jobs/cleanupAuditLog.js` — cùng mẫu `api-server/jobs/cleanupRequestLog.js`
  đã có sẵn. Mặc định giữ 90 ngày, cấu hình qua `SYNC_LOG_RETENTION_DAYS`/
  `AUDIT_LOG_RETENTION_DAYS`/`CLEANUP_CRON`. rp-server trước đây chưa có
  hạ tầng `node-cron` cấp server.js nào — thêm mới cho việc này.
- **Phạm vi cố ý bỏ qua** (theo yêu cầu): KHÔNG log việc người dùng thường
  xem/xuất báo cáo ở rp-server (chỉ log thao tác CẤU HÌNH của admin) — xem
  báo cáo diễn ra thường xuyên hơn nhiều so với sửa cấu hình, log mọi lượt
  xem sẽ phình bảng rất nhanh mà giá trị thấp.
- 24 test độc lập (`fakeModule`): `logAction()` ghi đúng dữ liệu + nuốt lỗi
  DB, log đăng nhập đúng thành công/thất bại (giữ đúng username đã gõ khi
  sai), `cleanup*` tính đúng ngưỡng ngày theo env var, route
  `GET /admin/audit-log` lọc đúng, mọi route sửa dữ liệu đều gọi
  `logAction` đúng `actionType`, và xác nhận riêng `consumers.js` không
  lộ bí mật vào log. `vite build` sạch cho `etl-admin` + `api-admin`.

## 0.23.0 — Tự động test kết nối lúc lưu + nhiều giờ gửi email/lịch

Hai tính năng độc lập, gộp chung 1 bản merge.

### Tự động test kết nối (etl-admin + api-admin)

Lưu nguồn dữ liệu (tạo/sửa 1 nguồn, hoặc nhập hàng loạt) giờ TỰ ĐỘNG gọi
`testConnection()` ngay sau khi ghi — không cần bấm riêng nút "Kiểm tra kết
nối" trước nữa. **KHÔNG chặn lưu** nếu kết nối lỗi (quyết định có chủ đích —
đôi khi cấu hình được khai báo trước khi DB/firewall đích thật sự mở), chỉ
trả kèm kết quả để admin biết ngay và tự quyết định sửa hay để đó.

- **`etl/lib/dataSourcePool.js`, `api-server/lib/dataSourcePool.js`** — thêm
  `testConnectionsBatch(items, concurrency=5)`: test NHIỀU cấu hình song
  song có giới hạn (không thử tuần tự — quá chậm cho hàng chục chi nhánh;
  không thử toàn bộ cùng lúc — dễ quá tải), lỗi 1 item không ảnh hưởng các
  item khác, kết quả LUÔN đúng thứ tự items dù thứ tự hoàn thành khác nhau.
- **`etl/routes/admin/dataSources.js`, `api-server/routes/admin/dataSources.js`**
  — POST/PUT trả kèm `connectionTest: {ok, error?}`; POST /import trả kèm
  `connectionResults: [{name, ok, error?}]` theo tên từng dòng vừa ghi
  (test dùng đúng mật khẩu PLAINTEXT của dòng đó trước khi mã hoá, không
  cần đọc lại DB). PUT khi không gửi password mới thì giải mã mật khẩu cũ
  để test (etl còn phải đọc lại Engine hiện có — PUT không cho đổi Engine).
- **`etl-admin/api-admin` `DataSourcesPage.jsx`** — hiển thị kết quả ngay
  sau khi lưu/nhập, không cần thao tác thêm.
- 20 test độc lập (`fakeModule`): giới hạn song song đúng, thứ tự kết quả
  đúng, lỗi cô lập, không chặn lưu khi kết nối lỗi, PUT dùng đúng mật khẩu
  giải mã + Engine hiện có, import trả `connectionResults` đúng tên dòng.

### Nhiều giờ gửi email/lịch (rp-server + rp-user)

Một lịch gửi email báo cáo giờ có thể gửi **nhiều lần/ngày** (vd 07:00 VÀ
17:00), mỗi giờ gửi theo dõi thành công/lỗi RIÊNG (không gộp chung 1 lần
gửi gần nhất như trước).

- **`rp-db/schema.sql`** — bảng con `app.ReportEmailScheduleTimes`
  (`ScheduleId` FK `ON DELETE CASCADE`, `CronExpression`, `LastRunAt`,
  `LastStatus`, `LastError` RIÊNG cho từng giờ gửi). Di dời dữ liệu
  `CronExpression` cũ của `app.ReportEmailSchedules` sang bảng con
  (idempotent — chỉ chèn cho lịch chưa có dòng nào). **Không xoá** cột cũ
  trên bảng cha (tránh ALTER phá vỡ dữ liệu/parse-order khi DROP COLUMN
  trong script idempotent) — giờ chỉ còn là cột hiển thị/tương thích ngược,
  `LastRunAt/LastStatus/LastError` ở đó được CẢ MỌI giờ gửi cùng cập nhật,
  coi là "lần gửi gần nhất bất kỳ giờ nào" cho tiện xem nhanh.
- **`rp-server/jobs/reportEmailScheduler.js`** — viết lại: `scheduledTasks`
  giờ khoá theo `TimeId` (1 lịch N giờ gửi = N cron task độc lập, trước đây
  1 lịch = 1 task). `runningSchedules` (chặn chồng lượt) vẫn khoá theo
  `ScheduleId` — 2 giờ gửi CÙNG lịch chặn lẫn nhau (tránh gửi trùng email
  cho cùng người nhận nếu report chạy lâu hơn khoảng cách 2 giờ gửi).
  `rescheduleJob(scheduleId)` bỏ đăng ký MỌI giờ gửi thuộc lịch đó rồi nạp
  lại đúng danh sách hiện có. `runNow()` ("Gửi ngay") KHÔNG gắn với giờ gửi
  cụ thể nào — chỉ cập nhật lịch cha.
- **`rp-server/routes/reportEmailSchedules.js`** — body POST/PUT đổi từ
  `cronExpression` (1 chuỗi) sang `cronExpressions` (mảng). PUT cập nhật
  danh sách giờ gửi kiểu DIFF (giữ nguyên + lịch sử của giờ không đổi, chỉ
  xoá giờ bị bỏ/thêm giờ mới) thay vì xoá hết ghi lại. GET trả kèm `Times`
  (mảng giờ gửi + trạng thái riêng từng giờ).
- **`rp-user/.../EmailSchedulesPage.jsx`** — "Giờ gửi" từ 1 ô thành danh
  sách Thêm/Xoá tự do (chế độ Đơn giản: cùng tần suất/thứ trong tuần, chỉ
  giờ khác nhau — đúng nhu cầu thường gặp; chế độ Nâng cao: danh sách biểu
  thức cron thô, mỗi giờ gửi có thể khác hẳn kiểu ngày nếu cần). "Số lần
  gửi" = độ dài danh sách, không có ô đếm riêng. Bảng danh sách lịch hiện
  từng giờ gửi kèm trạng thái thành công/lỗi riêng.
- 11 test độc lập (`fakeModule`, node-cron giả lập để không hẹn giờ thật):
  validate `cronExpressions` (rỗng/sai định dạng/trùng lặp), PUT diff đúng
  (giữ/xoá/thêm), đăng ký đúng N cron task theo TimeId, 2 giờ gửi cùng lịch
  chặn lẫn nhau, chạy tự động cập nhật CẢ giờ gửi lẫn lịch cha, `runNow`
  chỉ đụng lịch cha.

## 0.22.0 — Nhập hàng loạt kết nối DB (etl-admin + api-admin)

Tính năng mới: tải file Excel (.xlsx) để tạo/sửa NHIỀU `DataSources` (kết
nối CSDL nguồn) cùng lúc, thay vì bấm form từng cái — dùng khi cần khai báo
kết nối cho hàng chục chi nhánh cùng cấu trúc, hoặc muốn script hoá việc cấp
phát/đổi cấu hình kết nối (đúng lúc save-time schema validation ở 0.21.6 phát
huy tác dụng nhất — báo lỗi ngay nếu 1 dòng gõ sai).

- **`etl/lib/dataSourcesImport.js`** (mới) — parse `.xlsx` (cột bắt buộc:
  `Name, Server, DatabaseName, Username, Password`; tuỳ chọn: `Engine`
  (`mssql`/`mysql`, mặc định `mssql`), `Port`, `Encrypt`, `TrustServerCert`)
  + `upsertDataSources` (staging + `MERGE etl.DataSources`, khoá theo
  `Name`). Mật khẩu được **mã hoá TỪNG DÒNG trước khi vào staging table**
  (IV ngẫu nhiên mỗi dòng) — plaintext không chạm câu SQL.
- **`api-server/lib/dataSourcesImport.js`** (mới) — tương tự, không có cột
  `Engine` (đúng phạm vi `api.DataSources`, chỉ SQL Server). Thêm dependency
  `exceljs` + `multer` vào `api-server/package.json` (etl đã có sẵn từ tính
  năng "Nhập chỉ tiêu").
- **`etl/routes/admin/dataSources.js`** và
  **`api-server/routes/admin/dataSources.js`** — thêm `POST /import`
  (multer memoryStorage, không lưu file gốc ra đĩa), gọi `invalidate(id)`
  cho mọi nguồn vừa ghi để job/endpoint đang chạy nạp lại kết nối mới ngay,
  không cần khởi động lại service.
- **`etl-admin/src/pages/DataSourcesPage.jsx`**,
  **`api-admin/src/pages/DataSourcesPage.jsx`** — thêm khối "Nhập hàng
  loạt" (upload file + hiển thị kết quả thêm mới/cập nhật/dòng bị bỏ qua),
  cùng khuôn UI với trang "Nhập chỉ tiêu". `api-admin/src/lib/api.js` được
  bổ sung tham số `isFormData` (etl-admin đã có từ trước).
- Khoá cập nhật là `Name` (không phải khoá DB, `DataSources` không có
  UNIQUE trên cột này) — chạy lại file với 1 dòng sửa (đổi mật khẩu, đổi
  server...) chỉ dòng đó đổi, không tạo trùng.
- 20 test độc lập (`fakeModule` + file `.xlsx` dựng bằng ExcelJS thật): cả 2
  bên — file hợp lệ, thiếu cột bắt buộc, thiếu trường, sai Engine/Port, mật
  khẩu luôn được mã hoá trước khi staging (không bao giờ plaintext trong
  SQL), đếm inserted/updated/ids đúng theo MERGE, rollback khi lỗi giữa
  transaction, route trả 400/200 đúng tình huống, `invalidate()` gọi đúng
  id. `npx vite build` sạch cho cả `etl-admin` và `api-admin`.

## 0.21.6 — Đối chiếu bảng/cột với schema thật ngay lúc lưu cấu hình (etl + api-server)

Không phải fix bảo mật (đã xác nhận ở 0.21.5 — `assertSafeIdentifier` chặn
chèn SQL dù tên bảng/cột đúng hay sai). Mục tiêu: báo lỗi NGAY lúc LƯU cấu
hình job đồng bộ / endpoint realtime, thay vì đợi tới lúc job chạy (hoặc tới
lúc đối tác gọi endpoint) mới lộ ra — quan trọng nhất khi cấu hình được tạo
qua script/gọi API thẳng (bỏ qua dropdown duyệt schema trên etl-admin/
api-admin), ví dụ cấu hình hàng loạt nhiều chi nhánh cùng cấu trúc bảng.

- **`etl/routes/admin/syncJobs.js`** — thêm `assertTableConfigMatchesSchema`/
  `validateTableJobSchema` (dùng `lib/schemaBrowser.js`, cùng nguồn dropdown
  trên etl-admin/): POST job Type='table' đối chiếu bảng chính + bảng liên
  kết (nếu có) với schema thật của DataSource đã chọn; PUT đối chiếu lại
  `dimensionColumns`/`measureColumns` mới (2 trường duy nhất PUT cho sửa) với
  bảng chính của job hiện có. Sai tên bảng/cột -> 400 kèm tên bảng/cột cụ thể,
  không lưu. Job Type='custom' không bị áp (không có bảng nguồn để đối chiếu).
- **`api-server/routes/admin/realtimeEndpoints.js`** — thêm
  `assertSchemaMatches` tương tự, áp cho cả POST và PUT (endpoint realtime
  cho sửa cả bảng/cột qua PUT, khác etl).
- Cập nhật lại comment đầu file ở `etl/lib/tableSyncEngine.js` và
  `api-server/lib/realtimeEngine.js` (viết sai từ 0.21.5, nay đã đúng thực
  tế) — `assertSafeIdentifier` vẫn là lớp chống chèn SQL DUY NHẤT ở tầng
  chạy, vì schema nguồn có thể đổi sau khi lưu (đổi tên/xoá cột) mà job/
  endpoint không hay biết.
- 13 test độc lập (`fakeModule` + gọi thẳng route handler): bảng/cột đúng ->
  201/200; sai tên bảng, sai tên cột đơn, sai tên cột bảng liên kết, sai cột
  PUT -> 400 kèm đúng tên bảng/cột; Type='custom' không bị áp.

## 0.21.5 — Soát SQL injection (etl/rp-server/api-server) — không có lỗ hổng

Rà soát toàn bộ 3 hệ thống — KHÔNG phát hiện lỗ hổng SQL injection nào.
Mọi giá trị đều qua `.input()`/`@param` (mssql) hoặc named placeholder
(mysql2); 2 nơi DUY NHẤT phải ghép tên bảng/cột thẳng vào câu SQL (không
tham số hoá được định danh) — `etl/lib/tableSyncEngine.js` và
`api-server/lib/realtimeEngine.js` — đều bắt buộc qua `assertSafeIdentifier`
(regex `^[A-Za-z0-9_]+$`) trên MỌI định danh trước khi ghép, không có
đường nào bỏ qua.

- **Sửa comment sai lệch** (không phải lỗi bảo mật, chỉ sai mô tả) — cả 2
  file trên từng ghi "tên bảng/cột đã xác nhận tồn tại thật lúc lưu (qua
  schemaBrowser.js)", nhưng route lưu cấu hình thực tế KHÔNG tự đối chiếu
  lại với schema thật (chỉ kiểm tra định dạng, hoặc không kiểm tra gì ở
  `etl/routes/admin/syncJobs.js`) — sửa lại đúng thực tế: tên sai/không
  tồn tại chỉ lộ ra lúc CHẠY (lỗi SQL "invalid object name" bình thường,
  không phải injection).

## 0.21.4 — portal/: danh mục ứng dụng dạng dữ liệu, dễ thêm ứng dụng mới

- **`portal/src/apps.js`** (mới) — danh mục ứng dụng portal hiển thị, mỗi
  ứng dụng 1 phần tử `{key, title, desc, envVar, fallback, audience}`.
  Thêm ứng dụng mới CHỈ cần thêm 1 phần tử vào đây + 1 biến `VITE_*_URL`
  trong `.env` — KHÔNG cần sửa `index.html` nữa (`src/main.js` tự vẽ thẻ
  theo danh sách, lưới thẻ tự giãn theo số lượng qua `auto-fit`). Vẫn giữ
  nguyên tắc cũ: thuần tĩnh, KHÔNG gọi API, không đăng nhập, không cá nhân
  hoá — hiện toàn bộ danh mục cho mọi người, đúng vai trò "danh bạ nội bộ"
  chứ không phải lớp kiểm soát truy cập.
- Mỗi thẻ giờ có thêm nhãn **"Công khai"/"Nội bộ · VPN"** — chỉ để nhân
  viên biết trước cần VPN hay không, không kiểm soát gì (portal không biết
  ai đang xem).

## 0.21.3 — Hướng dẫn cấu hình báo cáo (hướng_dẫn_báo_cáo.md) + hiện cột Id

- **`hướng_dẫn_báo_cáo.md`** (mới, thư mục gốc repo) — hướng dẫn CẤU HÌNH
  từng báo cáo cụ thể (khác README kỹ thuật của từng service), bắt đầu với
  2 cách dựng báo cáo doanh thu chi nhánh: hoàn toàn qua Data Warehouse
  (mục 1), và "hôm nay" qua API Server + Chỉ tiêu/Cùng kỳ vẫn qua Data
  Warehouse (mục 2) — từng bước cụ thể qua etl-admin/api-admin/rp-user,
  kèm `DefinitionJson` mẫu đầy đủ. Báo cáo mới dựng sau này sẽ thêm mục
  vào cùng file này.
- **`rp-user`** — `ApiConnectionsPanel.jsx`/`DataSourcesPanel.jsx` (tab
  "Kết nối API Server"/"Nguồn dữ liệu bổ sung" trong "Biểu mẫu") giờ hiện
  cột `Id` — báo cáo `SourceType='composite'` cần số Id này để khai
  `blocks[].apiConnectionId`/`dataSourceId` trong `DefinitionJson` (không
  có UI có cấu trúc riêng cho composite), trước đây không có cách nào xem
  số Id qua giao diện.

## 0.21.2 — Sửa/thêm 1 siêu thị vào chỉ tiêu tháng — không cần re-upload file

10 test mới.

- **`PUT /admin/sales-targets/one`** (mới, `etl/routes/admin/salesTargets.js`)
  — upsert ĐÚNG 1 dòng (`domain`, `entityCode`, `periodMonth`, `trangThai`,
  `targets`), tái dùng `upsertSalesTargets()` sẵn có (staging + MERGE),
  cùng quyền hẹp `DWH_TARGET_IMPORTER`/vai trò `target_importer` như route
  upload file.
- **Trang "Nhập chỉ tiêu"** (`etl-admin/`) — mục "Sửa / thêm 1 siêu thị":
  nút "Sửa" mỗi dòng tự điền sẵn dữ liệu hiện có (không mất chỉ tiêu khác
  chỉ vì tick 1 ô "Đã đóng cửa" — route ghi đè nguyên `TargetsJson`, giao
  diện tự tải dữ liệu cũ lên form trước khi cho sửa), nút "Thêm siêu thị
  mới" cho dòng trống — dùng khi giữa tháng phát sinh mở/đóng 1-2 siêu thị.

## 0.21.1 — Đánh dấu đóng cửa siêu thị (TrangThai) trong chỉ tiêu tháng

12 test mới.

- **Cột `TrangThai` (tuỳ chọn)** trong file Excel "Nhập chỉ tiêu"
  (`etl-admin/`) — `DaDong` LOẠI HẲN siêu thị đó khỏi báo cáo `composite`
  tháng này (cả dòng dữ liệu lẫn mọi dòng "Tổng cộng"), để trống/`HoatDong`
  = hiện bình thường.
- **CỐ Ý chỉ loại khi đánh dấu TƯỜNG MINH** — thiếu cả dòng chỉ tiêu (chưa
  kịp nhập, hoặc quên) KHÔNG bị coi là đóng cửa, siêu thị đó vẫn hiện ra
  bình thường (chỉ trống cột Chỉ tiêu) — tránh mất siêu thị khỏi báo cáo
  chỉ vì lỗi/sai sót nhập liệu tháng đó.
- File chỉ tiêu có thể CHỈ chứa cột `TrangThai` (không kèm số liệu) nếu mục
  đích chỉ là đánh dấu đóng cửa hàng loạt.
- Mở siêu thị mới KHÔNG cần cấu hình gì ở đây — báo cáo composite không có
  danh sách cố định, tự động xuất hiện ngay khi có dữ liệu.

## 0.21.0 — SourceType='composite': ghép nhiều nguồn + dòng "Tổng cộng"

Bước 3 (cuối) cho báo cáo doanh thu chi nhánh — ghép "Thực đạt" (DWH hoặc
realtime qua API Server) + "Chỉ tiêu" (`dwh.SalesTargets`) + "Cùng kỳ năm
trước" (DWH, lệch 1 năm) vào cùng 1 dòng, cộng dồn dòng "Tổng cộng" theo
nhóm — 25 test mới (9+8+4 backend, 4 regression xác nhận không ảnh hưởng
`directDb`/`apiReport`/`externalApi`).

- **`SourceType='composite'`** (mới, `rp-db/schema.sql` — migration idempotent
  thêm vào CHECK constraint) — `DefinitionJson.blocks`: mỗi khối tự chọn
  `directDb`/`apiReport`/`apiRealtime`, hoặc `isTarget:true` (đọc
  `dwh.SalesTargets`). Ghép theo `entityCode`, công thức
  (`lib/formulaEngine.js`, KHÔNG đổi) tham chiếu field dạng
  `"tenKhoi.field..."` — xem `rp-server/README.md` mục "Báo cáo ghép nhiều
  nguồn (composite)" cho ví dụ đầy đủ.
- **`lib/compositeReportRunner.js`** (mới) + **`lib/salesTargetsReader.js`**
  (mới, CHỈ ĐỌC `dwh.SalesTargets`) — tái dùng nguyên `runReport()`/
  `runApiReport()` đã có cho từng khối, không viết lại logic fetch.
  `dateOffsetYears` dịch đúng ngày dương lịch (vd `-1` = cùng ngày năm
  trước); khối target tính `PeriodMonth` = ngày 1 tháng chứa ngày yêu cầu.
- **`groupBy`** (tuỳ chọn trong `DefinitionJson`) — dòng "Tổng cộng" theo
  nhóm + tổng toàn báo cáo, tính bằng CỘNG DỒN DỮ LIỆU THÔ rồi chạy lại
  đúng công thức (SUM/SUM, không phải trung bình cộng % từng dòng). Giá trị
  không khớp nhóm nào đã khai vẫn xuất hiện, không âm thầm mất.
- **`rp-server/routes/reportCatalog.js`** — `validateCompositeDefinition()`
  (mới) kiểm tra `blocks` ngay lúc lưu (key trùng, thiếu domain/apiTarget/
  targetDomain tuỳ loại khối) — lỗi lộ ra ngay, không đợi tới lúc chạy thật.
- **`rp-user`** — `ReportCatalogPanel.jsx` thêm `composite` vào danh sách
  SourceType chọn được (theo đúng quy ước JSON thô sẵn có, không thêm UI
  cấu trúc riêng); `FilterForm.jsx` thêm kiểu lọc `"date"` (ô chọn ngày —
  dùng cho bộ lọc `eventDate` của composite, cũng dùng được cho báo cáo
  khác cần lọc 1 ngày đơn thay vì khoảng ngày).
- **Xuất file** (`lib/exportExcel.js`/`lib/exportPdf.js`) — dòng "Tổng cộng"
  (đánh dấu `__isSubtotal`) in đậm, khớp file mẫu.

## 0.20.0 — Giữ lịch sử theo ngày cho dwh.ReportFacts (opt-in mỗi job)

Bước 2 cho báo cáo cần so cùng kỳ năm trước (đúng ngày dương lịch) — 13
test mới.

- **`dwh.ReportFacts`** — khoá UNIQUE đổi từ `(SourceSystem, Domain,
  EntityCode)` thành thêm `EventDate`. Migration idempotent (drop constraint
  cũ nếu có, tạo constraint mới) — an toàn chạy lại nhiều lần trên CSDL đã
  triển khai.
- **`etl.SyncJobs.KeepHistory`** (mới, `BIT DEFAULT 0`) — TẮT mặc định,
  không đổi hành vi job đang có. BẬT qua checkbox "Giữ lịch sử theo ngày"
  khi tạo/sửa job (`etl-admin/`).
- **`etl/lib/upsert.js`** — `upsertReportFacts(pool, rows, {keepHistory})`:
  `keepHistory=false` (mặc định) tự dọn dòng khác `EventDate` của cùng thực
  thể TRƯỚC khi MERGE (giữ đúng "1 dòng/thực thể" như thiết kế cũ, chuyển
  từ tầng CSDL sang tầng ứng dụng); `keepHistory=true` bỏ qua bước dọn — mỗi
  ngày 1 dòng riêng.

## 0.19.0 — Nhập chỉ tiêu (target/KPI) qua etl-admin

Bước đầu cho báo cáo doanh thu chi nhánh cần so "Thực đạt" với "Chỉ tiêu"
(vd báo cáo nhanh doanh thu BRGMart) — 20 test mới.

- **`dwh.SalesTargets`** (mới, `dwh/schema.sql`) — bảng RIÊNG khỏi
  `dwh.ReportFacts`, lưu chỉ tiêu theo `Domain + EntityCode + PeriodMonth`,
  `TargetsJson` linh hoạt (tên chỉ tiêu không cố định trước trong code).
- **Trang "Nhập chỉ tiêu"** (`etl-admin/`, mới) — upload file Excel (.xlsx),
  dòng 1 header, 2 cột cố định `MaSieuThi`/`Thang`, các cột sau tự do trở
  thành tên chỉ tiêu. Nhập lại đúng domain+tháng GHI ĐÈ (upsert), không cộng
  dồn.
- **Tài khoản CSDL RIÊNG, hẹp hơn `etl_writer`** — `dwh_target_importer`
  (`dwh/grants.sql`), CHỈ có quyền trên đúng bảng `dwh.SalesTargets`, không
  đụng được `dwh.ReportFacts` dù chạy trong cùng tiến trình `etl` — route
  "Nhập chỉ tiêu" dùng pool RIÊNG (`DWH_TARGET_IMPORTER_*` trong `.env`),
  không dùng chung pool `DWH` thường.
- **Vai trò `target_importer`** (mới, `admin.AdminUsers.Role`) — CHỈ thấy
  trang "Nhập chỉ tiêu" trong `etl-admin/`, không thấy Nguồn dữ liệu/Đồng bộ
  — cấp cho nhân sự chỉ cần nhập chỉ tiêu hàng tháng, không phải quản trị
  ETL đầy đủ. `admin` vẫn vào được mọi trang như cũ.

## 0.18.0 — Cấu hình Nginx triển khai 1 máy chủ ứng dụng + 1 máy chủ CSDL riêng

- **`deploy/nginx.conf`** — mẫu cấu hình Nginx đầy đủ cho mô hình cả 3 hệ
  thống (`etl/`, `rp-server/`, `api-server/`, chạy bằng PM2 qua
  `deploy/ecosystem.config.js` đã có sẵn) + 4 giao diện tĩnh (`portal/`,
  `rp-user/`, `api-admin/`, `etl-admin/`) trên CÙNG 1 máy chủ, CSDL trên
  máy chủ khác. 5 domain: `report.*`/`api.*`/`portal.*` công khai (`api.*`
  CHỈ lộ `/api/v1/*`, không gì khác), `api-admin.*`/`etl-admin.*` nội bộ/VPN
  (chặn bằng `allow`/`deny` ngay tầng Nginx, độc lập với
  `*_ADMIN_ALLOWED_IPS` ở tầng ứng dụng — 2 lớp phòng thủ riêng). File này
  đã được 2 README (`rp-server/`, `api-server/`) tham chiếu tới từ giai đoạn
  0/1 trước đây ("Xem mẫu cấu hình Nginx thật ở `deploy/nginx.conf`") — giờ
  mới thực sự tồn tại.
- **`deploy/README.md`** (mới) — hướng dẫn triển khai đầy đủ: cài đặt/build/
  chạy PM2 trên máy chủ ứng dụng, chạy schema + `grants.sql` trên máy chủ
  CSDL riêng, DNS/TLS cho 5 domain, danh sách kiểm tra sau triển khai (đúng
  domain nào 404 `/admin`, đúng `TRUST_PROXY_HOPS` qua log IP thật).
- `etl/README.md` — cập nhật mục "Triển khai": làm rõ `/admin/*` của `etl`
  VẪN có thể đứng sau Nginx CHUNG với 2 hệ kia (khác hướng dẫn cũ ngụ ý nên
  tách hẳn), miễn là domain riêng + `allow`/`deny` nội bộ, không chung
  route với `/api/v1/*`/`/api/*` công khai.

## 0.17.0 — Rà soát bảo mật/hiệu năng (Giai đoạn 3)

Nốt các mục còn lại của đợt rà soát bảo mật + hiệu năng trước khi public
`api-server`/`rp-server` ra Internet — 24 test mới.

- **Pin thuật toán JWT tường minh** (`algorithms: ['HS256']`) ở MỌI lệnh gọi
  `jwt.verify` (phiên admin cả 3 service, OAuth2 access token api-server,
  phiên rp-user) — phòng thủ chiều sâu chống tấn công đổi thuật toán ký
  (algorithm confusion), dù thư viện `jsonwebtoken` hiện đại đã mặc định an
  toàn hơn các bản cũ.
- **Chặn NaN/âm cho `page`/`pageSize`** ở MỌI route còn thiếu (đã sửa ở giai
  đoạn 0 cho `rp-server` `/reports/:id/run`, giờ thêm `api-server`
  `/api/v1/reports/:id/run` và `/api/v1/realtime/:endpoint/list`) — trước
  đây `parseInt(x || '1', 10)` với `x` là chuỗi không phải số (vd
  `?pageSize=abc`) vẫn ra `NaN` (chỉ `''`/`undefined` mới rơi về `'1'` đúng
  cách), truyền `NaN` xuống `OFFSET`/`FETCH NEXT` của SQL Server.
- **CORS tuỳ chọn cho `/api/v1/*`** (`api-server/lib/corsAllowlist.js`, biến
  `CORS_ALLOWED_ORIGINS`) — TẮT MẶC ĐỊNH (không đổi hành vi hiện tại), chỉ
  bật khi operator khai rõ từng origin cần cho phép gọi thẳng từ trình duyệt
  (không có tuỳ chọn "*"). Không áp cho `/admin/*`.
- **Chặn kích thước cache AST công thức** (`lib/formulaEngine.js`, cả
  rp-server và api-server) — `astCache` trước đây là `Map` không giới hạn,
  giờ chặn tối đa 500 mục theo kiểu LRU (Map giữ thứ tự chèn, không cần thư
  viện ngoài).
- **Thêm mẫu GRANT quyền tối thiểu** — `dwh/grants.sql`, `etl-db/grants.sql`,
  `api-db/grants.sql`, `rp-db/grants.sql` (KHÔNG tự chạy, DBA xem lại + đổi
  mật khẩu mẫu trước khi dùng) — khớp đúng tên tài khoản đã khai trong
  `.env.example` từng service, chỉ cấp quyền lên đúng schema mỗi tài khoản
  thật sự cần, không dùng `sa`/`db_owner`.

## 0.16.0 — Hiệu năng cho traffic công khai (Giai đoạn 2)

Theo kết quả rà soát hiệu năng — chuẩn bị cho `api-server`/`rp-server` nhận
traffic thật từ Internet, 17 test mới.

- **`PERSISTED_DIMENSION_COLUMNS`** (`lib/reportEngine.js`, cả rp-server và
  api-server) — cơ chế cho phép chuyển 1 field Dimensions cụ thể từ lọc qua
  `JSON_VALUE(Dimensions, '$.field')` (luôn quét + parse JSON từng dòng,
  không index được) sang CỘT THẬT có index, khi đã xác định rõ 1 báo cáo
  chậm vì field đó. `dwh/schema.sql` thêm hướng dẫn đầy đủ (mục "Tối ưu lọc
  theo Dimensions") kèm mẫu SQL `ALTER TABLE ... PERSISTED` + `CREATE INDEX`
  — chỉ cần thêm đúng 1 dòng vào map này ở CẢ 2 bản `reportEngine.js`, không
  sửa gì khác. Map RỖNG mặc định — không đoán field nào "chắc sẽ cần", chỉ
  thêm khi đã xác định thật.
- **Tăng pool CSDL mặc định** — `DWH_POOL_MAX`/`RP_POOL_MAX`/`ADMIN_POOL_MAX`
  từ 10 lên 20 trong `.env.example` (etl giữ nguyên — không lộ ra Internet,
  job chạy tuần tự theo thiết kế) — điểm khởi đầu hợp lý hơn cho traffic
  công khai, không phải con số cuối cùng.
- **Cache TTL ngắn cho `/reports/:id/run`** (`lib/reportResultCache.js`,
  biến `REPORT_CACHE_TTL_MS`, mặc định 30 giây, `=0` để tắt) — cả rp-server
  (`POST /api/reports/:id/run`) lẫn api-server (`GET /api/v1/reports/:id/run`).
  Khoá cache gồm đủ mọi tham số ảnh hưởng kết quả (reportId, filters, page,
  pageSize, và `fields` với api-server) — sai 1 chi tiết là cache miss, chạy
  lại thật. Quyền gọi (`ConsumerReportAccess`/kiểm tra vai trò) LUÔN chạy
  thật mỗi request, KHÔNG bị cache bỏ qua — đã kiểm tra bằng test riêng.
  KHÔNG áp cho `/export` hay `jobs/reportEmailScheduler.js` (lịch gửi email
  luôn cần dữ liệu mới nhất tại thời điểm gửi, không lấy từ cache).

## 0.15.0 — Bảo mật chiều sâu trước khi public (Giai đoạn 1)

Tiếp theo 0.14.0 (nhóm CRITICAL/HIGH) — nhóm MEDIUM, phòng thủ nhiều lớp
(defense-in-depth), 44 test.

- **`helmet()`** cho cả 3 server (etl/api-server/rp-server) — header bảo
  mật cơ bản (`X-Content-Type-Options`, `X-Frame-Options`, HSTS...), tắt CSP
  mặc định (không cần cho JSON API thuần, giao diện tĩnh Nginx phục vụ riêng).
- **Chống phát lại (replay) cho HMAC** (api-server, `AuthMethod='hmac'`) —
  trước đây chỉ kiểm tra `X-Timestamp` trong cửa sổ ±5 phút, 1 request bị
  chặn bắt vẫn gửi lại y nguyên được nhiều lần trong cửa sổ đó với chữ ký
  vẫn hợp lệ. `lib/hmacAuth.js` giờ nhớ chữ ký ĐÃ DÙNG, từ chối nếu thấy lại.
- **Cookie phiên `secure` tự động bật khi `NODE_ENV=production`** (cả 3
  server) — trước đây chỉ dựa vào biến `*_COOKIE_SECURE` trong `.env`, quên
  đặt là cookie phiên gửi qua HTTP thường một khi public.
- **Tên biến bí mật ký JWT RIÊNG cho từng service** — đổi `ADMIN_JWT_SECRET`
  (trùng tên giữa etl và api-server) thành `ETL_ADMIN_JWT_SECRET`/
  `API_ADMIN_JWT_SECRET`; đổi `JWT_SECRET` (rp-server) thành `RP_JWT_SECRET`
  — tránh operator lỡ copy `.env` giữa 2 service làm phiên dùng chéo được.
  **Thêm `issuer`/`audience` cho MỌI JWT** (phiên admin cả 3 service, token
  OAuth2 đối tác) — dù 2 service lỡ dùng CHUNG giá trị secret, token phát
  hành bởi bên này vẫn bị bên kia từ chối (đã kiểm tra bằng test mô phỏng
  đúng kịch bản "operator copy nhầm .env"). Khởi động LỖI NGAY nếu secret
  còn là giá trị mẫu trong `.env.example`, không chạy "được" với secret ai
  cũng đọc được từ repo. **Yêu cầu operator đổi tên biến trong `.env` thật
  khi nâng cấp** — không tự tương thích ngược, cố ý (buộc xác nhận lại).
- **`ETL_ADMIN_ALLOWED_IPS`** (`etl/lib/adminIpAllowlist.js`, mới) — ETL là
  dịch vụ duy nhất trong 3 trước đây KHÔNG có lớp phòng thủ IP bổ sung cho
  `/admin/*`, dù nắm giữ mật khẩu của toàn bộ nguồn dữ liệu đã cấu hình —
  giờ có cùng cơ chế `api-server` đã có từ trước.
- **Chống chạy chồng lấn cho cron job** (ETL `jobs/scheduler.js` VÀ Report
  Server `jobs/reportEmailScheduler.js`) — 1 job/lịch chạy lâu hơn chu kỳ
  cron của chính nó (nguồn chậm, báo cáo lớn) trước đây có thể tự "đụng"
  chính nó ở lượt tiếp theo (ETL: tranh chấp khoá MERGE; lịch email: gửi
  trùng email + nhân đôi bộ nhớ export). Nút "Chạy thử"/"Gửi ngay" trên giao
  diện cũng đi qua cùng cơ chế chặn thay vì gọi tắt.
- **Giới hạn thời gian tầng HTTP server** (`requestTimeout`/`headersTimeout`/
  `timeout`, cả 3 server) — chống client cố tình gửi request/body nhỏ giọt
  giữ kết nối (và connection CSDL đã mượn) mở gần như vô hạn.
- Rà soát riêng các route "test kết nối"/"gửi thử" còn trả nguyên
  `err.message` (dataSources/apiConnections/emailSettings/reportCatalog/
  reportEmailSchedules) — xác nhận đây là tính năng debug CÓ CHỦ ĐÍCH cho
  admin cấu hình hạ tầng nội bộ do chính họ kiểm soát, không phải lỗ hổng
  (khác điểm đã sửa ở 0.14.0: `externalConnections.js`, nơi mục tiêu là bên
  ngoài KHÔNG đáng tin) — không sửa, tránh làm mất công cụ hữu ích.

## 0.14.0 — Vá lỗ hổng bảo mật chặn trước khi public API Server & Report Server (Giai đoạn 0)

Theo kết quả rà soát chuyên sâu bảo mật + hiệu năng của cả 3 hệ thống (ETL,
API Server, Report Server) trước khi đưa `api-server`/`rp-server` ra
Internet. Đây là nhóm lỗ hổng **CRITICAL/HIGH** — bắt buộc trước khi public,
mỗi mục kèm test riêng, tổng cộng 63 test.

- **Rate limiter api-server không còn bị vượt qua bằng cách đổi header** —
  `keyGenerator` cũ khoá "bucket" theo `X-API-Key`/`X-Key-Id`/`Authorization`
  do người gọi TỰ khai, CHƯA xác thực — đổi giá trị mỗi request là có bucket
  riêng, vô hiệu hoá giới hạn, dồn được vào `POST /api/v1/oauth/token` (luôn
  đụng CSDL trước khi biết `client_id` hợp lệ hay không) làm cạn pool CSDL
  admin. Giờ khoá theo `req.ip` thật (yêu cầu `trust proxy` đúng, xem dưới).
- **`trust proxy`** (`TRUST_PROXY_HOPS`, mặc định 1) — thêm cho cả 3 server
  (etl/api-server/rp-server). Thiếu dòng này khi có Nginx đứng trước, `req.ip`
  luôn là IP của Nginx cho MỌI request — làm hỏng ngầm giới hạn IP riêng
  từng đối tác, `adminIpAllowlist`, giới hạn tần suất, và cột `IpAddress`
  trong log kiểm toán.
- **Chống dò mật khẩu đăng nhập** — `lib/loginRateLimit.js` (bản sao 3 nơi:
  etl/api-server/rp-server), tối đa 10 lần sai liên tiếp theo (IP+username)
  /15 phút, đăng nhập đúng xoá ngay bộ đếm. Kèm vá dò username qua chênh
  lệch thời gian phản hồi (`verifyCredentials` giờ chạy `bcrypt.compare`
  với hash giả ngay cả khi username không tồn tại).
- **Chặn SSRF cho "Kết nối API đối tác"** (rp-server) — `lib/urlSafety.js`
  mới: `BaseUrl`/`TokenUrl` không được trỏ tới địa chỉ nội bộ/riêng tư (RFC
  1918, loopback, link-local — gồm `169.254.169.254`, metadata cloud), kiểm
  tra cả lúc lưu lẫn ngay trước mỗi lần gọi thật. Trước đây admin (hoặc ai
  chiếm được phiên admin) có thể trỏ kết nối vào mạng nội bộ, biến rp-server
  công khai thành bàn đạp dò mạng.
- **Sửa path traversal khi tải file mẫu báo cáo** (rp-server) — tên file lưu
  giờ qua `path.basename()` + lọc `\`, không dùng thẳng `file.originalname`
  — trước đây tải file tên `../../../etc/cron.d/evil.xlsx` có thể ghi ra
  ngoài thư mục `templates/`.
- **Chặn `pageSize` không giới hạn ở `rp-server` `/api/reports/:id/run`** —
  khớp đúng `api-server` (`Math.min(...,1000)`), có thêm chặn NaN/âm. Trước
  đây gọi với `pageSize` rất lớn ép trả cả triệu dòng trong 1 response, bỏ
  qua luôn giới hạn 5000 dòng của `/export`.
- **`api.ConsumerRealtimeAccess`** (bảng mới, api-db) — CÙNG khuôn
  `ConsumerReportAccess` nhưng cho endpoint realtime: trước đây bất kỳ đối
  tác nào có scope `realtime` gọi được MỌI endpoint đã tạo, bất kể nguồn dữ
  liệu (`api.DataSources`) đứng sau — nguy hiểm khi nhiều chi nhánh/siêu thị
  dùng chung API Server (1 đối tác đọc được realtime của MỌI chi nhánh).
  Trang "Đối tác" (`api-admin/`) thêm nút "Realtime được gọi".
- **Giới hạn tần suất riêng theo từng đối tác giờ THỰC SỰ có hiệu lực** —
  `api.ApiConsumers.RateLimitPerMinute` trước đây chỉ lưu trong CSDL, không
  middleware nào đọc (đã tự ghi nhận trong README cũ là việc "làm sau").
  `lib/consumerRateLimit.js` mới: cửa sổ cố định 60 giây theo `consumer.id`,
  áp SAU xác thực — độc lập với bộ giới hạn theo IP nặc danh TRƯỚC xác thực.
  Với `authMethod='oauth2'`, giá trị nhúng thẳng vào access token JWT lúc
  cấp (giống `scopes`/`allowedIps` đã làm).
- Nhân tiện khoá cứng `algorithms: ['HS256']` cho mọi `jwt.verify()`/`jwt.sign()`
  trong cả 3 server — phòng thủ chiều sâu chống alg-confusion, dù thư viện
  `jsonwebtoken` hiện tại đã mặc định an toàn.

## 0.13.0 — ETL chọn được VIEW làm nguồn đồng bộ (không chỉ bảng thật)

- `etl-admin/` — bước "chọn bảng" (bảng chính lẫn bảng liên kết) khi tạo Sync
  Job giờ liệt kê CẢ **VIEW**, không chỉ `BASE TABLE` như trước — đúng khớp
  với API Server đã hỗ trợ từ trước (`api-server/lib/schemaBrowser.js`).
  `etl/lib/dbAdapters/mssql.js`/`mysql.js`:`listTables()` mở `WHERE
  TABLE_TYPE IN ('BASE TABLE', 'VIEW')`, thêm cột `tableType` để giao diện
  hiện nhãn "(bảng)"/"(view)" trong dropdown.
- **Không chỉ để xem trước** — VIEW chọn được dùng THẲNG làm nguồn đồng bộ
  THẬT (`tableSyncEngine.js` dùng nguyên tên đã chọn làm `FROM`, không có
  nhánh riêng cho VIEW, xử lý y hệt bảng thật). Hữu ích khi: (1) cần gộp
  nhiều hơn 1 bảng liên kết mà `etl.SyncJobs` chỉ hỗ trợ tối đa 1 JOIN — phía
  nguồn (vd từng CSDL cửa hàng BRG Mart) tự tạo VIEW gộp sẵn; (2) chỉ muốn lộ
  đúng cột cần cho tài khoản chỉ đọc của ETL, không cấp quyền thẳng trên bảng
  gốc (nguyên tắc least-privilege).
- `listForeignKeys()` (gợi ý tự động chọn cột nối) thường trả rỗng cho VIEW
  (không có ràng buộc khoá ngoại thật) — hành vi đúng, không phải lỗi, chỉ
  mất phần gợi ý tự động.
- Test: `test-etl-schema-browser-views.js` (3/3 — xác nhận câu SQL của cả 2
  adapter MSSQL/MySQL đã gồm VIEW và trả `tableType`).

## 0.12.1 — Soát lại cấu hình nguồn dữ liệu ETL & API Server

- Rà soát theo yêu cầu: (1) ETL cấu hình được đích Data Warehouse VÀ nhiều
  CSDL nguồn (mỗi chi nhánh/siêu thị trong chuỗi một dòng, vd BRG Mart); (2)
  API Server cấu hình được kết nối Data Warehouse VÀ nhiều CSDL khác cần lấy
  dữ liệu realtime. Xác nhận CẢ HAI đã đúng: DWH là kết nối tĩnh qua `.env`
  (đích chung, không cần nhiều); nguồn nhiều CSDL là bảng động không giới hạn
  số dòng — `etl.DataSources` (trang "Nguồn dữ liệu", `etl-admin/`, hỗ trợ cả
  MSSQL/MySQL) và `api.DataSources` (trang "Nguồn dữ liệu", `api-admin/`, chỉ
  MSSQL) — mỗi `SyncJob`/`RealtimeEndpointDef` có khoá ngoại chọn ĐÚNG 1
  nguồn cụ thể. Không phát hiện thiếu chức năng.
- Sửa 1 chỗ comment đầu `api-server/db.js` còn mô tả pool `getPool('OLTP')`
  đã bỏ từ trước (không còn nơi nào gọi tới) — cập nhật đúng thực tế 2 pool
  hiện có (`DWH`, `ADMIN`) và trỏ rõ sang `lib/dataSourcePool.js` cho nguồn
  động, tránh gây hiểu nhầm khi đọc code.

## 0.12.0 — Lịch gửi email báo cáo tự động (rp-server)

- Bảng mới **`app.ReportEmailSchedules`** (rp-db) — mỗi dòng là 1 lịch: báo
  cáo (`ReportId`), lịch chạy (`CronExpression`), người nhận, bộ lọc cố định
  (`FilterValuesJson`), định dạng xuất (`excel`/`pdf`), bật/tắt, lần gửi gần
  nhất + trạng thái/lỗi. Trang mới "Lịch gửi email báo cáo" trong menu Hệ
  thống.
- **Lịch chạy dựng qua giao diện** (Tần suất Hàng ngày/Hàng tuần + chọn thứ +
  Giờ gửi), không bắt gõ cron tay — tab "Nâng cao" vẫn nhận cron thô cho lịch
  phức tạp hơn. `rp-server/jobs/reportEmailScheduler.js` — job `node-cron`
  ĐẦU TIÊN của rp-server (thêm dependency `node-cron`, chưa từng có job nền
  nào trước đây), nạp lại từ CSDL mỗi 60 giây, cùng khuôn hoàn toàn với
  `etl/jobs/scheduler.js` (`registerJob`/`unregisterJob`/`refresh`/
  `rescheduleJob`) — CRUD gọi `rescheduleJob(id)` ngay sau ghi, không đợi chu
  kỳ 60 giây.
- **Bộ lọc theo ngày dùng PRESET tương đối, không phải giá trị cố định** —
  `lib/reportEmailFilters.js`: lọc kiểu `dateRange` chỉ nhận Hôm nay/Hôm
  qua/7 ngày qua/30 ngày qua/Tuần này/Tháng này/Tháng trước, tính lại thành
  `{from,to}` THẬT NGAY LÚC GỬI — khác một ngày cố định lưu sẵn (vô nghĩa với
  báo cáo lặp lại hàng ngày, vì hôm nay và hôm sau cần ra kết quả khác nhau).
  Lọc loại khác (multiSelect/select) dùng giá trị cố định thật.
- **"Gửi ngay"** — nút trên mỗi dòng, chạy thật NGAY LẬP TỨC (không đợi giờ
  đã đặt, hoạt động cả khi lịch đang tắt) để kiểm tra cấu hình trước khi tin
  tưởng giao cho lịch tự động — lỗi thật (SMTP sai, báo cáo lỗi, người nhận
  sai định dạng...) trả `400` kèm thông điệp rõ ràng lên giao diện ngay, khác
  lúc job tự chạy theo giờ (chỉ ghi `LastStatus='FAILED'`/`LastError` + log,
  không có ai đợi xem ngay lúc đó).
- **Tách dùng chung**: `lib/mailer.js` (gửi email qua cấu hình SMTP chung —
  trước đây "Gửi thử" tự dựng transport tại chỗ, giờ dùng chung với lịch gửi
  tự động); `lib/reportRunner.js` (tách `loadDefinition`/`runDefinition` ra
  khỏi `routes/reports.js`, dùng chung với job lịch gửi — chạy báo cáo đúng
  1 chỗ logic dù gọi từ HTTP hay từ cron).
- Test: `test-report-email-filters.js` (16/16 — presets ngày + resolveFilterValues),
  `test-report-email-scheduler.js` (7/7 — vòng đời cron + luồng gửi thật/lỗi),
  `test-report-email-schedules-route.js` (11/11 — CRUD qua HTTP thật, validate
  cron/email/báo cáo), `test-reports-route-regression.js` (4/4 — xác nhận tách
  `reportRunner.js` không đổi hành vi `/run`/`/export`), `test-cron-helpers.js`
  (6/6 — round-trip form đơn giản ↔ chuỗi cron).

## 0.11.0 — OAuth2 Client Credentials & HMAC ký request (2 chiều)

- **API Server (chiều vào — đối tác gọi mình)** — `api.ApiConsumers` thêm
  `AuthMethod` (`apiKey`/`oauth2`/`hmac`, mặc định `apiKey` — không đổi được
  sau khi tạo, cần tạo đối tác mới nếu đổi cách xác thực). `ApiKeyHash` giờ
  nullable; thêm `ClientId`/`ClientSecretHash` (oauth2) và
  `HmacKeyId`/`HmacSecretEncrypted` (hmac, mã hoá qua `lib/crypto.js` như
  mật khẩu `DataSources`). **Lưu ý SQL Server**: đổi `UNIQUE` constraint cũ
  trên `ApiKeyHash` thành 3 unique index CÓ LỌC (`WHERE col IS NOT NULL`) cho
  `ApiKeyHash`/`ClientId`/`HmacKeyId` — SQL Server (khác Postgres) coi nhiều
  `NULL` là trùng nhau dưới `UNIQUE` thường, sẽ vỡ ngay từ đối tác oauth2/hmac
  thứ 2 nếu không lọc.
  - `POST /api/v1/oauth/token` (mới, `api-server/lib/oauthTokens.js` +
    `routes/v1/oauth.js`) — đổi `client_id`/`client_secret` (form body hoặc
    Basic header) lấy access token: JWT tự chứa `{sub,name,scopes,allowedIps}`
    (ký bằng `OAUTH_JWT_SECRET`, TTL `OAUTH_TOKEN_TTL_SECONDS`, mặc định
    3600s) — xác minh không cần tra CSDL/cache, cùng kiểu với
    `lib/adminAuth.js`. Đánh đổi: đổi quyền/IP chỉ có hiệu lực với token cấp
    SAU đó, token đã phát vẫn giữ quyền cũ tới khi hết hạn.
  - HMAC ký request (`lib/hmacAuth.js`) — đối tác gửi kèm header
    `X-Key-Id`/`X-Timestamp`/`X-Signature`, server tính lại chữ ký từ
    `METHOD\npath\ntimestamp\nrawBody` (cần `req.rawBody` — thêm `verify` vào
    `express.json()`), so sánh bằng `crypto.timingSafeEqual`, chấp nhận lệch
    giờ trong 5 phút (chặn replay).
  - `lib/apiAuth.js`: `authenticate()` thử theo thứ tự Bearer → HMAC header →
    `X-API-Key`, trả về CÙNG hình dạng consumer bất kể phương thức nào thành
    công — logic kiểm scope/IP allowlist đã có (0.10.0) không đổi.
  - Trang "Đối tác" (`api-admin/`): chọn `AuthMethod` lúc tạo; banner bí mật
    hiện đúng hình dạng theo phương thức (apiKey / clientId+clientSecret /
    hmacKeyId+hmacSecret); "Luân chuyển bí mật" giữ nguyên định danh công
    khai (ClientId/HmacKeyId), chỉ đổi phần bí mật.
- **Report Server (chiều ra — mình gọi đối tác)** — `app.ExternalApiConnections`
  (0.10.0) thêm 2 `AuthType`: `oauth2ClientCredentials` (thêm cột `TokenUrl`
  — `lib/externalApiConnectionPool.js` tự `POST grant_type=client_credentials`,
  cache token theo `expires_in` với 10 giây an toàn trước hạn, tự xin lại khi
  hết hạn) và `hmacSignature` (`lib/hmacSign.js`, ký theo ĐÚNG quy ước
  api-server dùng để xác minh — đã kiểm tra chữ ký 2 chiều khớp nhau). Đây là
  quy ước RIÊNG ghép cặp giữa 2 hệ thống HCRC, không phải chuẩn chung — đối
  tác thật hầu như dùng quy ước ký khác, cần code riêng nếu vậy (đã ghi rõ
  trong README + UI).
- Test: `test-hmac-auth.js`, `test-oauth-tokens.js`, `test-apiauth-dispatch.js`,
  `test-oauth-route.js`, `test-external-oauth-hmac.js` (script Node độc lập,
  fake module qua `require.cache`) — bao gồm xác minh THỰC rằng chữ ký
  `rp-server/lib/hmacSign.js` tạo ra được `api-server/lib/hmacAuth.js` chấp
  nhận, không chỉ đọc code suy luận khớp.

## 0.10.0 — Report Server gọi thẳng API đối tác & giới hạn IP theo đối tác

- **`SourceType='externalApi'`** (rp-db) — báo cáo giờ gọi được THẲNG một API
  do đối tác bên ngoài xây dựng, không qua API Server. Bảng mới
  `app.ExternalApiConnections`: Base URL + `AuthType` (`none`/`headerKey`/
  `queryParam`/`basicAuth` — bao được cả API key riêng lẫn Bearer token tĩnh
  qua `headerKey`). `DefinitionJson` thêm `externalPath` (URL, chèn được
  `{field}` từ bộ lọc), `externalShape` (`lookup`/`list`), `externalListPath`
  (JSON path tới dữ liệu trong response). `columns` dùng đường dẫn JSON phẳng
  hoặc cột công thức {key,label,formula} — TÁI DÙNG nguyên `lib/formulaEngine.js`
  đã có, không viết lại. **Chưa hỗ trợ** OAuth2 Client Credentials hay HMAC
  ký request — phức tạp hơn hẳn, làm khi có đối tác cụ thể cần.
- rp-server: `lib/externalApiConnectionPool.js`, `lib/externalReportClient.js`
  (dựng request/áp xác thực/trích JSON theo path/chiếu cột — đã test cả 3
  kiểu xác thực + JSON path lồng nhau + công thức), `routes/externalConnections.js`
  (CRUD). Tab mới "Kết nối API đối tác" + nút **"Chạy thử"** ngay trên form
  báo cáo (gọi thật với cấu hình đang soạn, chưa cần lưu) — API đối tác
  không kiểm soát được, rủi ro sai cấu hình (path/JSON path) cao hơn hẳn nội
  bộ, nên test được trước khi kích hoạt cho người dùng quan trọng hơn các
  `SourceType` khác.
- **Giới hạn IP theo từng đối tác API** — `api.ApiConsumers` thêm `AllowedIps`
  (api-db), phân tách dấu phẩy, chấp nhận IP đơn lẫn CIDR (IPv4). Kiểm tra
  SAU KHI key đã hợp lệ (`lib/apiAuth.js` + `lib/ipMatch.js`, đã test cả CIDR
  lẫn IPv4-mapped IPv6 qua proxy) — để trống = không giới hạn, hành vi cũ.
  Khác `lib/adminIpAllowlist.js` (danh sách CHUNG cho `/admin/*`) — đây RIÊNG
  từng đối tác, cho `/api/v1/*`. Cấu hình qua ô "IP cho phép" trên trang "Đối
  tác" (`api-admin/`).

## 0.9.0 — Tuỳ biến dữ liệu ra ngoài & công thức tính toán

- **Cột tính toán (công thức)** — một phần tử `DefinitionJson.columns` giờ có
  thể là `{ key, label, formula }` thay vì tên field thô, vd
  `{"key":"tyLeLoiNhuan","formula":"ROUND(measures.loiNhuan / measures.doanhThu * 100, 1)"}`.
  Bộ đánh giá mới `lib/formulaEngine.js` (tokenizer + parser + evaluator TỰ
  VIẾT, KHÔNG `eval()`/`Function()` — đã kiểm bằng thử nghiệm sandbox-escape)
  hỗ trợ `+ - * /`, so sánh, `&& ||`, và `ROUND/ABS/MIN/MAX/IF`. Cú pháp kiểm
  tra ngay lúc lưu báo cáo. Có ở CẢ 2 bản `reportEngine.js` (rp-server và
  api-server) — công thức chạy ở bên nào thực sự truy vấn Data Warehouse cho
  báo cáo đó (`SourceType`), đúng nguyên tắc đã thống nhất.
- `reportEngine.js` thêm `describeColumns()` — mọi response trả `columns`
  dạng `[{key,label}]` THỐNG NHẤT (dù cột là field thô hay công thức, dù báo
  cáo `directDb` hay đi qua API Server) — rp-user không còn tự suy `label`
  từ tên field ở phía frontend nữa. `exportExcel.js`/`exportPdf.js` cũng đổi
  theo hình dạng này (header đẹp hơn cho cột công thức, dùng `label`).
- **Tuỳ biến dữ liệu cho đối tác API** — bảng mới `api.ConsumerReportAccess`:
  MẶC ĐỊNH một đối tác không gọi được báo cáo nào dù `apiKey` có scope
  `reports` hợp lệ, phải được admin gán rõ ràng (trang "Đối tác" trên
  `api-admin/`, nút "Báo cáo được gọi") — cùng khuôn với
  `app.RoleReportAccess` đã có bên rp-server. Cộng với `?fields=a,b,c` trên
  `GET /v1/reports/:reportId/run` — trong báo cáo được gọi, đối tác chỉ lấy
  đúng cột cần, sai tên cột báo lỗi 400 rõ ràng. 2 lớp độc lập: một kiểm soát
  *gọi được gì*, một kiểm soát *thấy gì trong đó*.
- Chưa làm: đổi tên trường theo hợp đồng riêng từng đối tác (field alias) và
  so sánh theo kỳ (tăng trưởng %, cần 2 lượt query) — để sau, khi có nhu cầu
  thật (xem tài liệu "Dữ Liệu Tuỳ Biến & Công Thức HCRC").

## 0.8.0 — Endpoint realtime tự định nghĩa qua giao diện (không cần code)

- Thay hẳn mô hình "mỗi endpoint realtime = 1 route viết cứng" (3 route
  `inventory`/`loyalty`/`vouchers` cố định trong code) bằng **admin tự tạo
  endpoint qua `api-admin/`**: chọn 1 nguồn đã có (`api.DataSources`, có thể
  là nhiều máy chủ OLTP khác nhau — đã hỗ trợ sẵn từ trước), DUYỆT bảng/view
  + cột THẬT của nguồn đó (không gõ tay), chọn cột khoá + cột sắp xếp + cột
  hiển thị — trang mới "Endpoint realtime". Thêm loại dữ liệu realtime mới
  (đơn hàng, giao hàng...) không cần lập trình viên viết route, cùng tinh
  thần "Theo bảng" đã làm cho ETL.
- Bảng mới `api.RealtimeEndpointDefs` (api-db) thay hẳn `api.RealtimeEndpoints`
  cũ (đã `DROP TABLE`, chỉ lưu ánh xạ Endpoint->DataSourceId, không có dữ
  liệu nghiệp vụ nên xoá an toàn). `api-server`: `lib/schemaBrowser.js`
  (duyệt bảng/cột thật, MSSQL-only — tương đương `etl/lib/schemaBrowser.js`
  bên ETL), `lib/realtimeEngine.js` (chạy SELECT động có tham số hoá +
  allowlist định danh, cùng nguyên tắc `etl/lib/tableSyncEngine.js`),
  `routes/admin/realtimeEndpoints.js` (CRUD định nghĩa). 2 route DÙNG CHUNG
  cho MỌI endpoint thay 6 route cũ: `GET /v1/realtime/{endpoint}/{key}` (tra
  1 khoá) và `GET /v1/realtime/{endpoint}/list` (danh sách phân trang).
- **Sửa một lỗi tồn tại từ bản 0.7.0**: `rp-server/lib/apiReportClient.js`
  (luồng `SourceType='apiRealtime'`) đã gọi
  `{baseUrl}/api/v1/realtime/{apiTarget}/list` từ trước, nhưng
  `api-server/server.js` khi đó mount router realtime thẳng ở `/api/v1`
  (không có tiền tố `/realtime`) — nghĩa là đường gọi này CHƯA BAO GIỜ khớp,
  sẽ luôn lỗi 404 nếu có ai dùng thật. Phát hiện khi tổng quát hoá routing
  cho endpoint tự định nghĩa; nhân tiện sửa luôn bằng cách mount đúng tiền
  tố `/api/v1/realtime` — cũng giải quyết gọn việc tên endpoint (giờ tự do,
  admin đặt) có thể trùng với `/api/v1/reports` nếu vẫn mount chung gốc
  `/api/v1` như cũ.

## 0.7.0 — Report Server lấy dữ liệu qua API Server (realtime)

- `app.ReportCatalog` (rp-db) thêm `SourceType` (`'directDb'` mặc định,
  `'apiReport'`, `'apiRealtime'`) + `ApiConnectionId`/`ApiTarget` — một báo
  cáo giờ có thể lấy dữ liệu QUA API Server thay vì đọc thẳng CSDL, dùng khi
  API Server đã có sẵn kết nối realtime tới hệ nguồn (tồn kho/điểm thẻ/
  voucher...) mà Report Server không cần tự mở thêm một đường kết nối trực
  tiếp riêng tới cùng hệ đó. Bảng mới `app.ApiConnections` lưu BaseUrl + API
  key (mã hoá bằng `APP_ENCRYPTION_KEY` sẵn có) — quản lý qua tab "Kết nối
  API Server" mới trên trang "Biểu mẫu" (`rp-user/`).
- rp-server: `lib/apiConnectionPool.js` (cache kết nối HTTP theo Id, giống
  tinh thần `lib/dataSourcePool.js`), `lib/apiReportClient.js` (gọi API
  Server, forward nguyên `{columns, rows}` — không chiếu cột lại lần 2),
  `routes/apiConnections.js` (CRUD). `routes/reports.js` giờ rẽ nhánh theo
  `SourceType` khi chạy/xuất báo cáo.
- **Sửa một lỗi tồn tại từ trước**: `api-server/routes/v1/reports.js` vẫn
  đang query `dwh.ReportCatalog` — bảng đã bị XOÁ khỏi `dwh/schema.sql` từ
  lượt chuyển `ReportCatalog` sang `app` schema (rp-db) ở bản 0.3.0, khiến
  endpoint `/v1/reports/:reportId/run` lỗi 100% nếu có ai gọi. Phát hiện khi
  định tái dùng endpoint này cho luồng `apiReport` — không thể tái dùng
  `app.ReportCatalog` bên HCRC_RP (API Server không đọc được CSDL của Report
  Server, đúng nguyên tắc cô lập DB), nên thêm bảng RIÊNG `api.ReportCatalog`
  (CSDL HCRC_API, api-db) — danh mục báo cáo tổng hợp API Server tự quản lý,
  độc lập với danh mục của Report Server — và sửa route đọc đúng bảng này.
  Quản lý qua trang "Báo cáo" mới trên `api-admin/`
  (`routes/admin/reportCatalog.js`).
- `api-server/routes/v1/realtime.js` thêm 3 route `GET /{endpoint}/list`
  (`inventory`/`loyalty`/`vouchers`) — danh sách phân trang, khác 3 route cũ
  chỉ tra được đúng 1 khoá (SKU/mã thẻ/mã voucher) — cần cho báo cáo dạng
  bảng (`SourceType='apiRealtime'`). Cùng TODO tên view/cột thật như 3 route
  cũ (chưa có schema OLTP thật).

## 0.6.1 — Đổi tên report-server/frontend cho khớp quy ước rp-*

- `report-server/` → `rp-server/`, `frontend/` → `rp-user/` — khớp hoàn toàn
  prefix `rp-` đã dùng cho CSDL (`rp-db/`), tránh nhầm giữa 2 tên gọi khác
  nhau cho cùng một hệ thống. `rp-user` (không phải `rp-admin`) vì app này
  phục vụ CẢ người dùng thường lẫn admin trong 1 SPA — phân biệt bằng phân
  quyền theo menu, không tách app như `api-admin`/`etl-admin`.
- Đã cập nhật mọi tham chiếu: `package.json`/`package-lock.json` (tên gói
  `hcrc-rp-server`, `hcrc-rp-user`), `deploy/ecosystem.config.js`, toàn bộ
  comment trong `rp-db/schema.sql`, `rp-server/`, `rp-user/`, `api-server/`,
  `etl/`, `api-admin/`, `etl-admin/`, `portal/` trỏ tới 2 thư mục này. Chỉ đổi
  tên thư mục/gói — không đổi API, route, biến môi trường, hay schema CSDL
  (`app.*` trong `rp-db/schema.sql` giữ nguyên).

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
