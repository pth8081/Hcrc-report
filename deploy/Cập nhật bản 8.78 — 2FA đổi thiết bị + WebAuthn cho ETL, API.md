# Cập nhật bản 8.78 — 2FA đổi thiết bị + Vân tay/Face ID (WebAuthn) cho ETL, API

## Yêu cầu của người dùng

> [Gửi ảnh chụp trang "Tài khoản bảo mật" của rp-user] "Bạn xem các trang
> ETL, API và report xem đã có cái tính năng giống hình ảnh này liên quan
> đến xác thực hai yếu tố chưa? Cho phép đổi thiết bị Authent và thêm
> thiết bị Authent."

Kiểm tra xác nhận: `rp-user` đã có **cả 2** tính năng này từ bản 8.39/8.40
(đổi thiết bị 2FA) và bản 8.40/8.41 (vân tay/Face ID). **`etl-admin` và
`api-admin` chưa có tính năng nào trong 2 tính năng này.**

Người dùng chọn: **"Làm cả 2 — đồng bộ đầy đủ ngang rp-user"**, cho **cả
etl-admin lẫn api-admin**.

**Lưu ý quy tắc đã có từ trước, vẫn giữ nguyên ở bản này** (người dùng
nhắc lại rõ): "nếu tôi xác thực bằng vân tay thì không cần phải nhập
Authent nữa — cho tất cả ba trang ETL, API và Report." Tức là xác thực
vân tay/Face ID thành công **THAY HẲN** bước nhập mã 2FA, không phải thêm
1 lớp bảo mật nữa.

## Tính năng 1 — "Đặt lại mã 2FA" (đổi thiết bị Authenticator)

Backend route xử lý việc này (`POST /admin/2fa/setup` nhánh "đổi thiết
bị" — nhận `currentCode` thay vì `token`) **đã có sẵn từ trước** ở cả
`etl/routes/admin/twoFactor.js` và `api-server/routes/admin/twoFactor.js`
— chỉ **thiếu giao diện gọi tới**. Bản này thêm `TwoFactorResetFlow` vào
`AccountPage.jsx` của cả 2 app (port nguyên khối từ rp-user, không đổi
logic backend):

- Bước 1: nhập đúng mã 6 số HIỆN TẠI (chứng minh vẫn còn thiết bị cũ).
- Bước 2: quét mã QR MỚI trên thiết bị/app Authenticator khác, nhập mã
  xác nhận.
- Bước 3: nhận 10 mã khôi phục MỚI (mã cũ ngừng dùng được ngay).

Chỉ hiện với tài khoản **vai trò hệ thống** (`isSystemRole`) — tài khoản
thường không có 2FA để đặt lại.

## Tính năng 2 — Vân tay/Face ID (WebAuthn) — MỚI hoàn toàn

Mirror chính xác `rp-server`/`rp-user` (bản 8.40/8.41), đổi tên bảng/cột/
middleware cho đúng quy ước etl-admin, api-admin:

| | rp-server/rp-user | etl/etl-admin, api-server/api-admin |
|---|---|---|
| Bảng CSDL | `app.UserWebAuthnCredentials` | `admin.AdminWebAuthnCredentials` |
| Cột khoá ngoài | `UserId` | `AdminUserId` |
| Pool CSDL | `getPool('RP')` | `getPool('ADMIN')` |
| Middleware phiên | `requireAuth`, `req.user.*` | `requireAdminAuth`, `req.admin.*` |

**Backend** (`routes/admin/webauthn.js`, mới — cả `etl/` và
`api-server/`) — 6 route:

- `GET /devices`, `DELETE /devices/:id` — quản lý thiết bị (cần phiên
  đầy đủ) — **scoped đúng theo `AdminUserId` gọi** (admin A không thấy/
  gỡ được thiết bị của admin B).
- `POST /register/options`, `POST /register/verify` — đăng ký thiết bị
  mới (đăng ký được nhiều thiết bị, vd điện thoại + máy tính riêng).
- `POST /login/options`, `POST /login/verify` — đăng nhập bằng thiết bị
  đã đăng ký. **Điểm mấu chốt**: nhận token "pending" **Y HỆT** token
  `POST /2fa/verify` nhận (do `POST /admin/auth/login` cấp sau khi đúng
  mật khẩu) — xác thực vân tay xong là `setSessionCookie()` + cấp cookie
  phiên ĐẦY ĐỦ ngay, **không** yêu cầu nhập thêm gì — đúng yêu cầu "không
  cần phải nhập Authent nữa".

**Biến môi trường mới** — `WEBAUTHN_RP_NAME`/`WEBAUTHN_RP_ID`/
`WEBAUTHN_RP_ORIGIN` (`etl/.env.example`, `api-server/.env.example`) — để
trống 1 trong 2 biến ID/ORIGIN thì tính năng vân tay tự tắt ở app đó (API
trả lỗi rõ ràng khi bấm đăng ký/đăng nhập), **không** crash server, không
ảnh hưởng "Đặt lại mã 2FA" hay đăng nhập bằng mật khẩu thường.

**Giao diện**:

- `WebauthnDevicesSection` (`AccountPage.jsx`, cả 2 app) — đăng ký/gỡ
  thiết bị, chỉ hiện khi trình duyệt hỗ trợ (`browserSupportsWebAuthn()`).
- Nút "🫆 Dùng vân tay / Face ID" (`LoginPage.jsx`, bước
  `TwoFactorVerifyStep`, cả 2 app) — đặt NGAY TRÊN ô nhập mã 6 số, chỉ
  hiện khi trình duyệt hỗ trợ, bấm xong gọi thẳng `onDone()` nếu thành
  công — bỏ qua hoàn toàn form nhập mã bên dưới.

**Gói npm mới**: `@simplewebauthn/server` (`etl`, `api-server`),
`@simplewebauthn/browser` (`etl-admin`, `api-admin`) — đúng phiên bản đã
dùng ở rp-server/rp-user (`^14.0.3`/`^14.0.0`).

## Đã kiểm chứng

- **Mock DB + mock `@simplewebauthn/server` THẬT** (gọi thẳng route
  handler, không giả logic nghiệp vụ), chạy cho cả `etl/routes/admin/
  webauthn.js` lẫn `api-server/routes/admin/webauthn.js`:
  - Đăng ký thiết bị lưu đúng `AdminUserId`, `DeviceLabel`.
  - `GET /devices` chỉ trả đúng thiết bị của admin gọi — xác nhận KHÔNG
    rò giữa 2 admin khác nhau.
  - `DELETE /devices/:id` bị chặn đúng khi admin cố gỡ thiết bị KHÔNG
    phải của mình.
  - Đăng nhập bằng vân tay hoàn tất ngay (cấp cookie phiên) chỉ với
    token "pending" + phản hồi WebAuthn khớp — xác nhận BỎ QUA hoàn toàn
    bước nhập mã 2FA.
  - Dùng thiết bị của admin KHÁC để đăng nhập bị từ chối đúng.
  - `Counter` tăng đúng sau mỗi lần đăng nhập thành công (chống nhân bản
    khoá, theo cơ chế chuẩn WebAuthn).
- **Build sạch**: `etl-admin && npx vite build`, `api-admin && npx vite
  build` — không lỗi.
- **Demo bằng mock server + Playwright**: xác nhận "Tài khoản của tôi"
  hiện đúng cả 2 mục mới ("Bảo mật — Xác thực hai yếu tố" + "Bảo mật —
  Vân tay / Face ID"), và nút "Dùng vân tay / Face ID" hiện đúng vị trí ở
  bước xác thực hai yếu tố khi đăng nhập.

## Các bước triển khai (giống bản 8.41, nhân đôi cho etl-admin VÀ api-admin)

1. `git pull origin main`.
2. Chạy lại `etl-db/schema.sql` (thêm bảng `admin.AdminWebAuthnCredentials`,
   an toàn chạy lại nhiều lần) **và** `api-db/schema.sql` (bảng cùng tên,
   CSDL riêng `HCRC_API`).
3. Thêm vào `etl/.env`:
   ```
   WEBAUTHN_RP_NAME=HCRC ETL
   WEBAUTHN_RP_ID=<domain thật etl-admin, không có https://>
   WEBAUTHN_RP_ORIGIN=https://<domain thật etl-admin>
   ```
4. Thêm vào `api-server/.env`:
   ```
   WEBAUTHN_RP_NAME=HCRC API
   WEBAUTHN_RP_ID=<domain thật api-admin, không có https://>
   WEBAUTHN_RP_ORIGIN=https://<domain thật api-admin>
   ```
5. `cd etl && npm install` **và** `cd api-server && npm install` (gói mới
   `@simplewebauthn/server`).
6. `cd etl-admin && npm run build`, copy `dist/` mới **và** `cd api-admin
   && npm run build`, copy `dist/` mới (gói mới `@simplewebauthn/browser`).
7. `pm2 restart hcrc-etl` **và** `pm2 restart hcrc-api-server` (BẮT BUỘC
   — route mới `/admin/webauthn/*`).
8. Kiểm tra bằng THIẾT BỊ THẬT (điện thoại/laptop có vân tay/Face ID,
   không mô phỏng được), **làm ở CẢ 2 app**:
   - [ ] "Tài khoản của tôi" (tài khoản Admin hệ thống) có mục "Bảo mật —
         Xác thực hai yếu tố" — thử "Đặt lại mã 2FA" 1 lần, mã cũ ngừng
         dùng được.
   - [ ] "Tài khoản của tôi" có mục "Bảo mật — Vân tay / Face ID" (chỉ
         hiện nếu trình duyệt/máy hỗ trợ WebAuthn) — đăng ký 1 thiết bị.
   - [ ] Đăng xuất, đăng nhập lại (đúng mật khẩu) → bước "Xác thực hai
         yếu tố" → thấy nút "Dùng vân tay/Face ID" → bấm → quét → **vào
         thẳng hệ thống, KHÔNG phải gõ thêm mã 6 số nào**.
   - [ ] Vẫn nhập được mã 6 số như cũ nếu không bấm nút vân tay (không
         phá luồng cũ).
   - [ ] Gỡ thử 1 thiết bị → đăng nhập lại bằng đúng thiết bị vừa gỡ →
         báo lỗi rõ ràng, không crash.
   - [ ] Nếu CHƯA khai `WEBAUTHN_RP_ID`/`WEBAUTHN_RP_ORIGIN` ở app nào —
         xác nhận mục "Bảo mật — Vân tay/Face ID" ở ĐÚNG app đó báo lỗi
         rõ ràng (không trắng trang/crash) khi bấm đăng ký.

## File thay đổi

- `etl-db/schema.sql`, `api-db/schema.sql` — bảng mới
  `admin.AdminWebAuthnCredentials`.
- `etl/routes/admin/webauthn.js`, `api-server/routes/admin/webauthn.js`
  (mới) — 6 route quản lý thiết bị + đăng ký + đăng nhập.
- `etl/server.js`, `api-server/server.js` — mount
  `app.use('/admin/webauthn', ...)`.
- `etl/package.json`, `api-server/package.json` — thêm
  `@simplewebauthn/server`.
- `etl-admin/package.json`, `api-admin/package.json` — thêm
  `@simplewebauthn/browser`.
- `etl/.env.example`, `api-server/.env.example` — thêm
  `WEBAUTHN_RP_NAME`/`WEBAUTHN_RP_ID`/`WEBAUTHN_RP_ORIGIN`.
- `etl-admin/src/lib/AuthContext.jsx`, `api-admin/src/lib/AuthContext.jsx`
  — thêm 6 hàm `webauthn*`.
- `etl-admin/src/pages/AccountPage.jsx`, `api-admin/src/pages/
  AccountPage.jsx` — thêm `TwoFactorResetFlow` + `WebauthnDevicesSection`.
- `etl-admin/src/pages/LoginPage.jsx`, `api-admin/src/pages/LoginPage.jsx`
  — thêm nút "Dùng vân tay / Face ID" ở bước xác thực hai yếu tố.
- `etl-admin/src/styles.css`, `api-admin/src/styles.css` — thêm
  `.security-card`, `.biometric-btn`.
