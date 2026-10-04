# Cập nhật bản 8.71 — Upload chứng chỉ TLS qua giao diện web

## Tóm tắt yêu cầu người dùng

> "Tôi muốn có một cái giao diện để upload certificate cho các trang ETL,
> API và report cấu hình trực tiếp trên giao diện UI khi tôi upload CA,
> private key và public key lên hệ thống cho PM2 — để cho team IT họ tiện
> dụng cho việc cấu hình sau này."

Hiện trạng TRƯỚC bản này: TLS do **Nginx** đảm nhiệm (chứng chỉ Let's
Encrypt qua certbot) — 6 tiến trình PM2 (3 backend + 3 giao diện tĩnh) đều
chạy HTTP thường. Có 1 chế độ khác là "PM2-only" (không Nginx — xem
`deploy/Hướng dẫn triển khai PM2.md`) — khi đó hệ thống KHÔNG có HTTPS ở
đâu cả. Người dùng muốn thêm khả năng: **mỗi tiến trình PM2 tự chạy
HTTPS trực tiếp** bằng chứng chỉ upload qua UI, phục vụ đúng topology
"PM2-only" muốn có HTTPS mà không cần dựng Nginx riêng.

**Tính năng hoàn toàn TỰ CHỌN (opt-in), mặc định TẮT** — hệ thống đang
dùng Nginx để lo TLS không cần quan tâm gì tới bản này.

## Kiến trúc

### Lưu trữ: file trên đĩa, KHÔNG lưu CSDL

Mỗi backend (`etl`, `api-server`, `rp-server`) có 1 thư mục `certs/`
riêng (`<app>/certs/key.pem`, `cert.pem`, `ca.pem` — CA tuỳ chọn), quyền
`0600`, KHÔNG commit vào Git (`.gitignore`). Đây là lựa chọn có chủ đích:

- Khởi động server KHÔNG cần chờ kết nối CSDL mới biết chạy HTTP hay
  HTTPS (đọc file đồng bộ, tức thì) — giữ nguyên đặc tính khởi động nhanh
  hiện tại.
- Cùng đúng tinh thần Nginx/certbot đã làm từ trước giờ — chứng chỉ TLS
  luôn là file trên đĩa, không phải bản ghi CSDL.
- `admin.AuditLog`/`app.AuditLog` vẫn ghi 1 dòng mỗi lần upload (ai, lúc
  nào) — đủ để tra lại lịch sử, không cần lưu lại NỘI DUNG chứng chỉ 2 nơi.

### `lib/tlsServer.js` (giống hệt ở cả 3 backend)

- `createAppServer(app)` — thay cho `app.listen(PORT, cb)` cũ: trả về
  `https.Server` nếu có đủ `key.pem`+`cert.pem` hợp lệ, ngược lại
  `http.Server` như cũ.
- `assertKeyMatchesCert(keyPem, certPem, caPem)` — dùng
  `tls.createSecureContext()` kiểm tra key KHỚP ĐÚNG cert TRƯỚC khi ghi
  file. Ném lỗi rõ ràng ("key values mismatch") ngay lúc upload thay vì
  để hỏng TLS lúc có người kết nối thật.
- `applyCertificateLive()` — gọi `server.setSecureContext()` để áp dụng
  chứng chỉ MỚI cho MỌI kết nối TLS mới NGAY, không cần restart, không
  rớt kết nối đang có — CHỈ hoạt động nếu server HIỆN TẠI đã là
  `https.Server` (tức là KHÔNG phải lần upload đầu tiên). Lần upload ĐẦU
  TIÊN (chuyển từ HTTP sang HTTPS) **bắt buộc `pm2 restart` 1 lần** — Node
  không hỗ trợ "nâng cấp" 1 `http.Server` đang chạy thành `https.Server`.
- `readCertInfo()` — đọc subject/issuer/hiệu lực bằng
  `crypto.X509Certificate` (có sẵn từ Node 15.6, không cần gói ngoài) để
  hiển thị, KHÔNG BAO GIỜ trả lại nội dung private key.

### Route + trang quản trị (3 app)

- `routes/admin/tlsCertificate.js` (etl, api-server) /
  `routes/tlsCertificate.js` (rp-server) — `GET /` (trạng thái), `POST /`
  (upload, multer 3 trường file: `privateKey`, `certificate`,
  `caCertificate`). Gate `requireSystemRoleActor` — mức chặt NHẤT đang có
  trong hệ thống (nắm private key = giả mạo được chính danh tính TLS của
  cả hệ thống).
- Trang "Chứng chỉ TLS" ở etl-admin/api-admin/rp-user — **KHÔNG đi qua hệ
  thống RoleMenuAccess/app.MenuItems thông thường** (không có menuCode) —
  CHỈ hiện/dùng được cho tài khoản vai trò hệ thống thật (`isSystemRole`),
  không thể "lỡ tay" giao cho 1 tài khoản quản lý thông thường nào khác,
  mirror đúng cách "Tài khoản của tôi" (rp-user) không đi qua menu DB.

### `deploy/serve-static.js` (3 giao diện tĩnh)

Thêm biến môi trường TUỲ CHỌN `TLS_CERT_DIR` — trỏ tới ĐÚNG thư mục
`certs/` của tiến trình backend SONG SINH (vd `TLS_CERT_DIR=../etl/certs`
cho tiến trình phục vụ etl-admin). Đọc lại y hệt 2 file `key.pem`/`cert.pem`
(+ `ca.pem` nếu có) — KHÔNG tự ghi gì, chỉ đọc. Vì đây là tiến trình PM2
RIÊNG (không chia sẻ bộ nhớ với backend), KHÔNG tự hot-reload được khi
backend áp dụng chứng chỉ mới — cần `pm2 restart` tiến trình giao diện
tĩnh đó mỗi lần.

## Câu hỏi đã trả lời: "Service nội bộ nhận diện/tin tưởng CA của nhau thế nào khi gọi chéo qua HTTPS?"

Từ bản 8.70, `rp-server` gọi sang `api-server` qua HTTP nội bộ
(`INTERNAL_API_SERVER_URL`). Nếu sau bản 8.71 **api-server bật HTTPS bằng
chứng chỉ ký bởi CA NỘI BỘ/tự tạo** (không phải CA công khai như Let's
Encrypt), cuộc gọi `fetch()` từ rp-server sẽ THẤT BẠI với lỗi
`self signed certificate`/`unable to verify the first certificate` —
**cùng loại lỗi đã gặp với Postfix tự ký ở bản 8.67**, chỉ khác đây là
giữa 2 service CỦA CHÍNH HỆ THỐNG thay vì gọi ra SMTP ngoài.

**Xử lý ĐÚNG — KHÔNG tắt kiểm tra chứng chỉ** (`rejectUnauthorized:false`
hay `NODE_TLS_REJECT_UNAUTHORIZED=0` đều nguy hiểm vì mất khả năng phát
hiện giả mạo, và biến `NODE_TLS_REJECT_UNAUTHORIZED` còn tắt kiểm tra cho
**TOÀN BỘ** kết nối HTTPS của cả tiến trình, kể cả gọi ra ngoài) — mà
**thêm ĐÚNG CA đó vào danh sách tin tưởng CỦA BÊN GỌI**, dùng biến môi
trường CÓ SẴN của Node:

```
NODE_EXTRA_CA_CERTS=/đường-dẫn/tới/ca.pem
```

Đặt trong `.env` (hoặc `deploy/ecosystem.config.js`, mục `env`) của bên
GỌI — vd nếu rp-server gọi api-server, đặt ở `rp-server/.env`, trỏ tới 1
**bản copy file CA** mà api-server dùng (IT copy file này sang máy/máy chủ
đang chạy rp-server, 1 lần, mỗi khi CA nội bộ đổi). Node đọc biến này lúc
khởi động module TLS — đặt TRƯỚC `dotenv.config()` chạy (đã là dòng ĐẦU
TIÊN ở cả 3 `server.js`) là đủ, **KHÔNG cần sửa code gì** (`fetch()` đã
dùng sẵn trong `lib/internalApiClient.js` tự tôn trọng biến này).

Nếu CA đó là CA công khai thật (Let's Encrypt, DigiCert...) — KHÔNG cần
làm gì cả, Node đã tin tưởng sẵn mọi CA công khai, y hệt gọi ra bất kỳ
website HTTPS nào khác.

## Những gì KHÔNG đổi

- Hệ thống đang dùng Nginx để lo TLS: không ảnh hưởng gì, không cần làm
  gì ở bản này.
- Chưa từng upload chứng chỉ nào qua trang mới: hành vi y hệt trước giờ
  (HTTP thường) — tính năng mặc định tắt (opt-in).
- Không đụng tới CSDL nào (không có bảng mới, không cần chạy lại
  `schema.sql`).

## Kiểm chứng đã làm (trước khi giao)

Dùng chứng chỉ test thật (tạo bằng `openssl req -x509`), không chỉ đọc
code:
- Cặp key/cert KHỚP ĐÚNG → chấp nhận; cặp KHÔNG khớp → bị từ chối với lỗi
  rõ ràng ("key values mismatch").
- Chưa upload gì → `createAppServer()` trả `http.Server`; sau khi lưu
  chứng chỉ → trả `https.Server`.
- `readCertInfo()` đọc đúng subject/hiệu lực từ file vừa lưu.
- Upload chứng chỉ MỚI (giả lập gia hạn) → `applyCertificateLive()` áp
  dụng ngay (hot-reload), `readCertInfo()` phản ánh đúng chứng chỉ mới mà
  KHÔNG cần restart tiến trình.
- `deploy/serve-static.js` với `TLS_CERT_DIR` trỏ tới file cert thật →
  `curl -k https://127.0.0.1:<cổng>/__version` trả về đúng dữ liệu (HTTPS
  thật, không chỉ đọc code).
- Demo giao diện "Chứng chỉ TLS" (etl-admin) bằng Playwright: trạng thái
  ban đầu ("Chưa upload... đang chạy HTTP"), upload file thật → hiện đúng
  banner "Lần upload ĐẦU TIÊN — cần restart" kèm lệnh `pm2 restart` chính
  xác.

## Các bước triển khai

**Bỏ qua TOÀN BỘ các bước dưới đây nếu hệ thống đang dùng Nginx để lo
TLS** — tính năng này không liên quan/không cần thiết trong trường hợp đó.

1. `git pull origin main`.
2. `pm2 restart hcrc-etl hcrc-api-server hcrc-rp-server` (BẮT BUỘC — thêm
   route/lib mới; KHÔNG đổi hành vi nếu chưa upload chứng chỉ nào, an toàn
   restart bất kỳ lúc nào).
3. Build + copy `dist/` mới cho cả 3 giao diện (`etl-admin`, `api-admin`,
   `rp-user`) — trang "Chứng chỉ TLS" mới.
4. Vào từng giao diện (chỉ tài khoản vai trò hệ thống thấy mục "Chứng chỉ
   TLS") → upload private key + public cert (+ CA/chain nếu CA cấp kèm
   file chuỗi riêng) → đọc kỹ thông báo:
   - **Lần đầu** (đang HTTP) → trang báo rõ lệnh `pm2 restart` cần chạy —
     chạy lệnh đó trên máy chủ để chuyển hẳn sang HTTPS.
   - **Lần sau** (gia hạn/thay chứng chỉ) → áp dụng NGAY, không cần làm
     gì thêm.
5. (Tuỳ chọn) Muốn giao diện TĨNH (rp-user/api-admin/etl-admin) CŨNG chạy
   HTTPS, không chỉ backend: thêm `TLS_CERT_DIR` vào mục `env` của ĐÚNG
   tiến trình giao diện đó trong `deploy/ecosystem.config.js`, trỏ tới
   thư mục `certs/` của backend song sinh, rồi `pm2 restart` tiến trình
   giao diện đó. Mỗi lần backend áp dụng chứng chỉ MỚI sau này, nhớ
   `pm2 restart` lại tiến trình giao diện tĩnh tương ứng (không tự
   hot-reload qua được, 2 tiến trình PM2 riêng).
6. (Chỉ nếu 2 service NỘI BỘ gọi lẫn nhau qua HTTPS bằng CA tự tạo — vd
   rp-server gọi api-server qua `INTERNAL_API_SERVER_URL`, bản 8.70) Copy
   file CA.pem sang máy/máy chủ bên GỌI, đặt
   `NODE_EXTRA_CA_CERTS=/đường-dẫn/ca.pem` trong `.env` của service đó,
   restart — xem mục "Câu hỏi đã trả lời" ở trên.
7. Kiểm tra lại: `curl -k https://<ip-máy-chủ>:<cổng>/` cho từng tiến
   trình đã bật HTTPS trả về đúng dữ liệu (`-k` vì chứng chỉ nội bộ/tự ký
   chưa chắc được trình duyệt test tin tưởng sẵn — trình duyệt thật của
   nhân viên cần cài CA nội bộ vào máy nếu dùng CA tự tạo, hoặc dùng CA
   công khai thật để tránh bước này).

## File thay đổi

- `etl/lib/tlsServer.js`, `api-server/lib/tlsServer.js`,
  `rp-server/lib/tlsServer.js` (mới, giống hệt nhau).
- `etl/routes/admin/tlsCertificate.js`,
  `api-server/routes/admin/tlsCertificate.js`,
  `rp-server/routes/tlsCertificate.js` (mới).
- `etl/server.js`, `api-server/server.js`, `rp-server/server.js` — dùng
  `createAppServer()` thay `app.listen()` trực tiếp.
- `etl-admin/src/pages/TlsCertificatePage.jsx`,
  `api-admin/src/pages/TlsCertificatePage.jsx`,
  `rp-user/src/modules/system/tls-certificate/TlsCertificatePage.jsx`
  (mới) + `App.jsx`/`Layout.jsx` mỗi app (route + mục nav riêng, chỉ hiện
  cho `isSystemRole`).
- `deploy/serve-static.js` — hỗ trợ `TLS_CERT_DIR`.
- `etl/.gitignore`, `api-server/.gitignore`, `rp-server/.gitignore` —
  thêm `certs/`.
