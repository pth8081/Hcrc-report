# Phiên bản

Phiên bản chung của toàn bộ hệ thống HCRC (ETL, Data Warehouse, Report
Server, API Server và các giao diện quản trị) — tăng ở mỗi lần merge vào
`main`, theo kiểu semver không chặt (patch cho fix nhỏ, minor cho tính năng
mới, major khi đổi cấu trúc phá vỡ tương thích ngược).

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
