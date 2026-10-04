# Cập nhật bản 8.73 — Thu hẹp "CA tin cậy" chỉ còn report server

## Tóm tắt yêu cầu người dùng

Sau bản 8.72 (xem `deploy/Cập nhật bản 8.72 — CA tin cậy cho cuộc gọi
HTTPS ra ngoài.md`) — làm tính năng "CA tin cậy" cho CẢ 3 hệ thống (etl,
api-server, rp-server) — người dùng chỉ định rõ lại phạm vi:

> "Phần này thì bạn chỉ cần làm trên report server thôi nhé."

Tức là tính năng "CA tin cậy" (quản lý CA mà chính hệ thống tin tưởng khi
TỰ GỌI RA 1 hệ thống khác dùng HTTPS ký bởi CA nội bộ/tự tạo) chỉ cần tồn
tại ở **report server** (rp-server + rp-user), **không cần** ở etl hay
api-server.

## Lý do thu hẹp

- Trong 2 ví dụ thực tế đã nêu ở bản 8.72 (rp-server gọi api-server qua
  `lib/internalApiClient.js`; rp-server gọi ra "HCRC Workspace" qua
  `lib/hcrcWorkspaceClient.js`), **bên GỌI RA luôn là rp-server** — etl và
  api-server hiện tại không tự gọi ra bất kỳ hệ thống ngoài nào qua HTTPS
  cần tới cơ chế tin cậy CA tuỳ chỉnh.
- Giữ tính năng ở cả 3 nơi chỉ làm tăng diện quản trị (admin phải nhớ
  kiểm tra 3 trang thay vì 1) mà không có nhu cầu thật — thu hẹp về đúng
  nơi cần dùng.

## Thay đổi

**Gỡ bỏ HOÀN TOÀN khỏi etl và api-server** (giữ nguyên ở rp-server/
rp-user):

- Xoá file `etl/lib/trustedCa.js`, `etl/routes/admin/trustedCa.js`,
  `api-server/lib/trustedCa.js`, `api-server/routes/admin/trustedCa.js`.
- Bỏ đăng ký route `require('./routes/admin/trustedCa')` +
  `app.use('/admin/trusted-ca', ...)` khỏi `etl/server.js` và
  `api-server/server.js`.
- Gỡ phần "CA tin cậy (cho các cuộc gọi ra ngoài)" (bảng danh sách CA +
  form thêm CA) khỏi `etl-admin/src/pages/TlsCertificatePage.jsx` và
  `api-admin/src/pages/TlsCertificatePage.jsx` — 2 trang này trở lại
  đúng phạm vi bản 8.71 (chỉ còn upload chứng chỉ TLS cho chính tiến
  trình đó, không còn phần quản lý CA tin cậy).

**KHÔNG đổi gì** (giữ nguyên hoàn toàn như bản 8.72):

- `rp-server/lib/trustedCa.js`, `rp-server/routes/trustedCa.js`,
  `rp-server/server.js` (route `/api/trusted-ca`).
- `rp-user/src/modules/system/tls-certificate/TlsCertificatePage.jsx` —
  vẫn đầy đủ phần "CA tin cậy" như bản 8.72.

## Những gì KHÔNG đổi (ngoài phạm vi trên)

- Trang "Chứng chỉ TLS" (bản 8.71, upload cert cho CHÍNH tiến trình tự
  chạy HTTPS) vẫn còn đủ ở CẢ 3 hệ thống — chỉ phần "CA tin cậy" (bản
  8.72, bổ sung SAU vào CÙNG trang) bị gỡ khỏi etl/api-server.
- Không đụng CSDL nào.
- File `.pem` CA đã từng thêm (nếu có) ở `etl/certs/trusted-ca/` hoặc
  `api-server/certs/trusted-ca/` không còn được đọc sau khi restart (code
  đọc nó đã bị xoá) — có thể xoá thủ công thư mục này, không bắt buộc
  (không ảnh hưởng gì nếu để lại, chỉ là file rác không dùng).

## Các bước triển khai

1. `git pull origin main`.
2. `pm2 restart hcrc-etl hcrc-api-server` (BẮT BUỘC — bỏ route
   `/admin/trusted-ca`, require file đã xoá). **`hcrc-rp-server` KHÔNG
   cần restart** — không có thay đổi gì ở rp-server.
3. `cd etl-admin && npm run build`, `cd ../api-admin && npm run build`,
   copy `dist/` mới cho 2 giao diện này (trang "Chứng chỉ TLS" bỏ phần
   "CA tin cậy"). **`rp-user` KHÔNG cần build lại.**
4. Không có bước kiểm tra riêng — admin etl-admin/api-admin chỉ còn thấy
   phần upload chứng chỉ TLS (đúng như bản 8.71), không còn phần "CA tin
   cậy" (đúng ý thu hẹp). Trang "Chứng chỉ TLS" của rp-user vẫn đầy đủ cả
   2 phần như trước.

## File thay đổi

- Xoá: `etl/lib/trustedCa.js`, `etl/routes/admin/trustedCa.js`,
  `api-server/lib/trustedCa.js`, `api-server/routes/admin/trustedCa.js`.
- Sửa: `etl/server.js`, `api-server/server.js` (bỏ đăng ký route),
  `etl-admin/src/pages/TlsCertificatePage.jsx`,
  `api-admin/src/pages/TlsCertificatePage.jsx` (gỡ phần "CA tin cậy").
- Không đổi: toàn bộ `rp-server/` và `rp-user/` liên quan tới "CA tin
  cậy".
