# Cập nhật bản 8.89-8.90 (làm 1 lần)

**Mục đích**: gộp 2 bản liên tiếp (8.89 + 8.90) thành 1 lượt triển khai
duy nhất cho server đã deploy tới bản 8.88. 2 bản này ĐỘC LẬP về chức
năng (không phụ thuộc lẫn nhau) nhưng gộp lại vì phát hành sát nhau.

---

# Phần 1 — Bản 8.89: Đăng nhập bằng vân tay/Face ID THAY THẾ HOÀN TOÀN mật khẩu + nhớ tên đăng nhập (cả 3 app)

## Yêu cầu của người dùng

Gửi ảnh chụp màn hình đăng nhập của 1 app khác (có ô username nhớ sẵn
"Tài khoản khác", mật khẩu, mã captcha 4 số, và nút nổi bật "Đăng nhập
bằng vân tay / Face ID") kèm yêu cầu:

> 1. Nhớ username
> 2. Vân tay ngay chỗ đăng nhập và mã captcha
> 3. Khi đăng nhập vân tay hoặc khuôn mặt những nút khác disable ko thao
>    tác được

Đã hỏi lại và được xác nhận: vân tay/Face ID thay thế HOÀN TOÀN mật khẩu
(không chỉ thay bước 2FA như WebAuthn đã có từ bản 8.40/8.78), áp dụng
đồng bộ cả 3 app (rp-user, etl-admin, api-admin).

## Phân biệt với WebAuthn đã có (bản 8.40/8.78)

| | WebAuthn cũ (2FA) | Vân tay mới (bản 8.89) |
|---|---|---|
| Khi nào dùng được | SAU KHI đã gõ đúng mật khẩu | NGAY màn hình đăng nhập đầu tiên |
| Thay thế gì | Chỉ bước nhập mã 6 số 2FA | TOÀN BỘ mật khẩu + captcha + 2FA |
| Route backend | `/webauthn/login/options`+`/verify` (cần token 2FA "pending") | `/webauthn/login-by-username/options`+`/verify` (chỉ cần `username`) |
| Đối tượng | Chỉ role admin/vai trò hệ thống (bắt buộc bật 2FA) | Bất kỳ ai đã đăng ký thiết bị |

Giống đúng cơ chế "passkey" mà Google/Microsoft/GitHub đang dùng.

## Thiết kế chống dò username / đăng nhập giả danh

`/webauthn/login-by-username/options` LUÔN trả về HTTP 200 với dữ liệu
hợp lệ, bất kể `username` gửi lên có tồn tại hay không — username không
tồn tại thì `allowCredentials` rỗng (không hiện gợi ý "không có tài khoản
này", tránh kẻ xấu dò ai có tài khoản).

Bảo mật thật nằm ở `/verify`: server CHỈ chấp nhận đúng `CredentialId` đã
được khoá sẵn vào đúng `userId`/`adminUserId` LÚC gọi `/options` (lưu
trong 1 challenge token dùng 1 lần, hết hạn 5 phút) — chặn đúng kiểu tấn
công "dùng thiết bị CỦA MÌNH để đăng nhập giả làm username CỦA NGƯỜI
KHÁC" (đã viết test case riêng xác nhận bị từ chối).

## Đã làm

1. **Backend (3 app)** — thêm 2 route mới `POST /webauthn/login-by-username/options`
   + `/verify` ở `rp-server`/`etl`/`api-server`, dùng chung rate-limit với
   trang đăng nhập mật khẩu thường.
2. **`AuthContext.jsx` (3 app)** — thêm `webauthnPasswordlessOptions`/
   `webauthnPasswordlessVerify`.
3. **`LoginPage.jsx` (3 app)** — nhớ username ở `localStorage` (mỗi app 1
   khoá riêng) sau MỖI lần đăng nhập thành công; hiện link "Tài khoản
   khác" để gõ tên khác; nút "Đăng nhập bằng vân tay / Face ID" cạnh nút
   "Đăng nhập" thường; khoá TOÀN BỘ ô/nút khác (`disabled`) trong lúc
   đang chờ xác thực vân tay/Face ID, kể cả bước 2FA cũ.
4. **`CaptchaField.jsx` (3 app)** — thêm prop `disabled`.
5. **`styles.css` (3 app)** — thêm `.remembered-account-row`/
   `.remembered-account-name` (tái dùng `.biometric-btn`/`.link-button`
   có sẵn từ trước).

## Đã kiểm chứng

3 bộ test (Node `http` thật + Express thật, mock DB) cho cả 3 backend:
username tồn tại → đúng thiết bị; username không tồn tại → vẫn 200 (không
lộ thông tin); thiết bị của người khác → từ chối; chữ ký giả → từ chối;
token dùng 1 lần. Build sạch cả 3 frontend.

---

# Phần 2 — Bản 8.90: Sửa proxy nội bộ không theo kịp khi backend chuyển sang HTTPS (PM2-only, cả 3 app)

## Báo cáo của người dùng

> Nay tôi add CA vào ETL và lỗi mã captcha luôn, bạn có biết vì sao ko?
> Và hệ thống ngoài cũng ko trust được ssl vừa add

Xác nhận deployment KHÔNG dùng Nginx (PM2-only, dùng `deploy/serve-static.js`).

## Nguyên nhân

`deploy/serve-static.js` (tiến trình phục vụ giao diện tĩnh bằng PM2 —
`hcrc-rp-user`/`hcrc-api-admin`/`hcrc-etl-admin`) có 1 proxy nội bộ
(`proxyToBackend()`) tự chuyển tiếp `/api`/`/admin/...` sang đúng backend
song sinh (`hcrc-rp-server`/`hcrc-api-server`/`hcrc-etl`), vì không có
Nginx đứng trước định tuyến thay.

Proxy này LUÔN gọi bằng `http.request()`, bất kể backend đang HTTP hay đã
chuyển HTTPS. Sau khi upload "Chứng chỉ TLS" cho ETL + `pm2 restart
hcrc-etl` (đúng hướng dẫn), cổng 4003 chỉ còn hiểu TLS — proxy vẫn gửi
byte HTTP thường vào → backend từ chối ngay (`socket hang up`) → MỌI API
qua proxy lỗi, bao gồm cả mã xác nhận (captcha). Xảy ra NGAY CẢ KHI không
dùng Nginx — đúng chế độ "PM2-only" mà tính năng "Chứng chỉ TLS" (bản
8.71) nói là được hỗ trợ, nhưng 2 tính năng chưa từng được nối với nhau.

(Giả thuyết ban đầu về cách gán `ca`/`cert` khi tạo HTTPS server đã được
kiểm chứng lại bằng test TLS thật và LOẠI BỎ — không phải nguyên nhân gây
lỗi captcha; vẫn sửa cho đúng theo tài liệu Node, phòng ngừa.)

## Đã làm

1. **`deploy/serve-static.js`** — `proxyToBackend()` tự phát hiện backend
   song sinh đã HTTPS chưa (dùng lại đúng biến `TLS_CERT_DIR` sẵn có) và
   tự chuyển sang `https.request()` khi cần.
2. **3 trang "Chứng chỉ TLS"** — thêm cảnh báo rõ: nếu KHÔNG dùng Nginx,
   phải thêm `TLS_CERT_DIR` vào tiến trình giao diện tương ứng + restart.
3. **`lib/tlsServer.js` (3 backend)** — nối CA/chain vào `cert` thay vì
   gán riêng `ca` (phòng ngừa, không phải nguyên nhân chính).

## Đã kiểm chứng

Test TLS thật (chain 3 cấp root→intermediate→leaf): proxy CŨ lỗi `socket
hang up` với backend HTTPS; proxy MỚI trả đúng JSON 200; backend HTTP
thường không đổi hành vi (regression test). Build sạch cả 3 frontend.

## Về "hệ thống ngoài không trust SSL vừa add"

Nếu chứng chỉ do CA NỘI BỘ (không phải CA công cộng như Let's Encrypt)
cấp, đây là hành vi ĐÚNG — hệ thống ngoài chưa cài CA gốc đó sẽ luôn báo
không trust. Cách xử lý: (1) dùng chứng chỉ từ CA công cộng, hoặc (2) cài
CA gốc nội bộ vào kho tin cậy của TỪNG hệ thống bên ngoài cần kết nối tới.

---

# Các bước triển khai (gộp cả 2 bản)

1. `git pull origin main`.
2. Restart đủ cả 6 tiến trình:
   ```bash
   pm2 restart hcrc-rp-server hcrc-etl hcrc-api-server
   pm2 restart hcrc-rp-user hcrc-api-admin hcrc-etl-admin
   ```
3. Build lại cả 3 frontend:
   ```bash
   cd rp-user && npm run build && cd ..
   cd etl-admin && npm run build && cd ..
   cd api-admin && npm run build && cd ..
   ```
   (copy `dist/` mới cho cả 3 — bản 8.89 đổi `LoginPage.jsx`/
   `CaptchaField.jsx`/`styles.css`, bản 8.90 đổi thêm
   `TlsCertificatePage.jsx`, cả hai đều chỉ ảnh hưởng frontend).
4. **CHỈ áp dụng cho ai ĐÃ upload "Chứng chỉ TLS" cho 1 backend nào đó,
   qua `deploy/serve-static.js` (PM2-only, KHÔNG Nginx)**: nếu CHƯA có,
   thêm `TLS_CERT_DIR` vào mục `env` của tiến trình giao diện tương ứng
   trong `deploy/ecosystem.config.js`:
   - Backend ETL (`hcrc-etl`) → thêm vào `hcrc-etl-admin`:
     `TLS_CERT_DIR: '../etl/certs'`
   - Backend Report (`hcrc-rp-server`) → thêm vào `hcrc-rp-user`:
     `TLS_CERT_DIR: '../rp-server/certs'`
   - Backend API (`hcrc-api-server`) → thêm vào `hcrc-api-admin`:
     `TLS_CERT_DIR: '../api-server/certs'`
   
   Rồi `pm2 restart` đúng tiến trình giao diện đó LẦN NỮA.
5. Kiểm tra:
   - **Bản 8.89**: mỗi app — đăng nhập bằng mật khẩu 1 lần → đăng xuất →
     mở lại trang đăng nhập → username hiện sẵn + nút "Đăng nhập bằng vân
     tay / Face ID" xuất hiện (nếu tài khoản đã đăng ký thiết bị ở "Tài
     khoản của tôi") → bấm vào, xác thực → vào thẳng, không hỏi mật
     khẩu/captcha/2FA; lúc đang chờ xác thực, mọi ô/nút khác bị khoá.
   - **Bản 8.90** (chỉ nếu đã làm bước 4): mở trang đăng nhập app đã
     upload chứng chỉ cho backend tương ứng → mã xác nhận hiện ảnh bình
     thường, đăng nhập được (trước đây báo "Không kết nối được backend").

## Nếu không thật sự cần backend chạy HTTPS (bản 8.90)

Đa số trường hợp — đơn giản hơn là xoá chứng chỉ đã upload nhầm, quay về
HTTP như cũ, không cần làm bước 4 ở trên:
```bash
rm etl/certs/*.pem        # hoặc rp-server/certs/*.pem, api-server/certs/*.pem
pm2 restart hcrc-etl      # hoặc hcrc-rp-server, hcrc-api-server
```

## File thay đổi

**Bản 8.89**: `rp-server/routes/webauthn.js`, `etl/routes/admin/webauthn.js`,
`api-server/routes/admin/webauthn.js`, `*/src/lib/AuthContext.jsx`,
`*/src/pages/LoginPage.jsx` (rp-user có thêm `TwoFactorVerifyStep`),
`*/src/components/CaptchaField.jsx`, `*/src/styles.css` (cả 3 app).

**Bản 8.90**: `deploy/serve-static.js`,
`*/src/pages/TlsCertificatePage.jsx` (cả 3 app, rp-user ở
`modules/system/tls-certificate/`), `rp-server/lib/tlsServer.js`,
`etl/lib/tlsServer.js`, `api-server/lib/tlsServer.js`.
