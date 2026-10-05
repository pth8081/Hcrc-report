# Cập nhật bản 8.89 — Đăng nhập bằng vân tay/Face ID THAY THẾ HOÀN TOÀN mật khẩu + nhớ tên đăng nhập (cả 3 app)

## Yêu cầu của người dùng

Gửi ảnh chụp màn hình đăng nhập của 1 app khác (có ô username nhớ sẵn
"Tài khoản khác", mật khẩu, mã captcha 4 số, và nút nổi bật "Đăng nhập
bằng vân tay / Face ID") kèm yêu cầu:

> 1. Nhớ username
> 2. Vân tay ngay chỗ đăng nhập và mã captcha
> 3. Khi đăng nhập vân tay hoặc khuôn mặt những nút khác disable ko thao
>    tác được

Đã hỏi lại 2 điểm quan trọng về bảo mật trước khi làm, và được xác nhận:

- **Kiểu đăng nhập vân tay**: vân tay thay thế HOÀN TOÀN mật khẩu (không
  phải chỉ thay bước 2FA như WebAuthn đã có từ bản 8.40/8.78) — ai đã
  đăng ký thiết bị ở "Tài khoản của tôi" bấm vân tay là vào thẳng, KHÔNG
  cần gõ mật khẩu/captcha/mã 2FA nào nữa.
- **Phạm vi áp dụng**: cả 3 app (rp-user, etl-admin, api-admin), đồng bộ
  ngang nhau — đúng quy ước đã dùng cho mọi tính năng 2FA/WebAuthn trước
  đây.

## Phân biệt với WebAuthn đã có (bản 8.40/8.78)

| | WebAuthn cũ (2FA) | Vân tay mới (bản 8.89) |
|---|---|---|
| Khi nào dùng được | SAU KHI đã gõ đúng mật khẩu | NGAY màn hình đăng nhập đầu tiên |
| Thay thế gì | Chỉ bước nhập mã 6 số 2FA | TOÀN BỘ mật khẩu + captcha + 2FA |
| Route backend | `/webauthn/login/options`+`/verify` (cần token 2FA "pending") | `/webauthn/login-by-username/options`+`/verify` (chỉ cần `username`) |
| Đối tượng | Chỉ role admin/vai trò hệ thống (bắt buộc bật 2FA) | Bất kỳ ai đã đăng ký thiết bị |

Giống đúng cơ chế "passkey" mà Google/Microsoft/GitHub đang dùng.

## Thiết kế chống dò username / đăng nhập giả danh

`/webauthn/login-by-username/options` **LUÔN trả về HTTP 200** với dữ
liệu hợp lệ, bất kể `username` gửi lên có tồn tại hay không — username
không tồn tại thì `allowCredentials` rỗng (không hiện gợi ý "không có tài
khoản này", tránh kẻ xấu dò ai có tài khoản).

Bảo mật thật nằm ở `/verify`: server CHỈ chấp nhận đúng `CredentialId` đã
được khoá sẵn vào đúng `userId`/`adminUserId` LÚC gọi `/options` (lưu
trong 1 challenge token dùng 1 lần, hết hạn 5 phút) — chặn đúng kiểu tấn
công "dùng thiết bị CỦA MÌNH để đăng nhập giả làm username CỦA NGƯỜI
KHÁC" (đã viết test case riêng xác nhận bị từ chối).

## Đã làm

### 1. Backend — 2 route mới ở cả 3 app

`rp-server/routes/webauthn.js`, `etl/routes/admin/webauthn.js`,
`api-server/routes/admin/webauthn.js` — thêm:

- `POST /webauthn/login-by-username/options` — nhận `{ username }`, tra
  thiết bị đã đăng ký của username đó (không báo lỗi nếu không có), trả
  options WebAuthn chuẩn + 1 token thử thách.
- `POST /webauthn/login-by-username/verify` — nhận `{ token, response }`,
  xác thực chữ ký vân tay/Face ID thật (`verifyAuthenticationResponse()`),
  đúng thiết bị đã khoá sẵn vào username đó → cấp cookie phiên đăng nhập
  đầy đủ luôn, ghi log hoạt động "Đăng nhập thành công (vân tay/Face ID...
  — không cần mật khẩu)".

Dùng chung giới hạn số lần thử sai (rate-limit) với trang đăng nhập mật
khẩu thường (khoá theo `username` thuần, KHÁC khoá `2fa:${username}` của
route 2FA cũ — route này là đăng nhập CHÍNH, không phải lớp phụ).

### 2. `AuthContext.jsx` (cả 3 app) — expose 2 hàm gọi API mới

```js
const webauthnPasswordlessOptions = useCallback((username) =>
  api.post('/webauthn/login-by-username/options', { username }), []);
const webauthnPasswordlessVerify = useCallback(async (token, response) => {
  const result = await api.post('/webauthn/login-by-username/verify', { token, response });
  await refresh();
  return result;
}, [refresh]);
```

### 3. `LoginPage.jsx` (cả 3 app) — nhớ username + nút vân tay + khoá nút khi đang xác thực

- **Nhớ username**: lưu ở `localStorage` (mỗi app 1 khoá riêng:
  `hcrc_rp_remembered_username`, `hcrc_etl_admin_remembered_username`,
  `hcrc_api_admin_remembered_username`) NGAY SAU mỗi lần đăng nhập thành
  công (mật khẩu LẪN vân tay). Lần mở trang sau hiện sẵn tên kèm link
  "Tài khoản khác" để gõ username khác — CHỈ xoá khỏi ô hiện tại lúc bấm
  link đó, KHÔNG động vào `localStorage` ngay (chỉ ghi đè khi đăng nhập
  THÀNH CÔNG bằng tên khác) — tránh mất nhớ chỉ vì bấm nhầm.
- **Nút vân tay**: hiện ngay dưới nút "Đăng nhập" thường, khi trình duyệt
  hỗ trợ WebAuthn VÀ đã có username (gõ tay hoặc nhớ sẵn) — bấm vào gọi
  `webauthnPasswordlessOptions` → `startAuthentication()` (trình duyệt tự
  hiện hộp thoại vân tay/Face ID) → `webauthnPasswordlessVerify` → vào
  thẳng hệ thống.
- **Khoá nút khác lúc đang xác thực** (đúng yêu cầu #3): 1 cờ
  `busy = submitting || webauthnBusy`, gắn `disabled={busy}` vào TẤT CẢ:
  ô username (lúc đang gõ)/link "Tài khoản khác"/ô mật khẩu/`CaptchaField`
  (cả ô nhập và nút ⟲ đổi mã)/nút "Đăng nhập"/nút vân tay — không thao
  tác được gì khác cho tới khi xong. Áp dụng luôn cho bước xác thực 2FA
  cũ (`TwoFactorVerifyStep`) để đồng bộ hành vi.

### 4. `CaptchaField.jsx` (cả 3 app) — thêm prop `disabled`

### 5. `styles.css` (cả 3 app) — thêm `.remembered-account-row`/`.remembered-account-name`

Tái dùng `.biometric-btn`/`.link-button` đã có sẵn từ bản 8.40/8.41/8.78
cho nút vân tay mới — không cần thêm CSS riêng.

## Đã kiểm chứng

Viết lại 3 bộ test (Node `http` thật + Express thật mount router, chỉ
mock lớp DB/audit-log) cho cả 3 backend, mỗi bộ xác nhận:

1. Username tồn tại → `/options` trả đúng `allowCredentials` của thiết
   bị họ đã đăng ký.
2. Username KHÔNG tồn tại → vẫn trả 200, `allowCredentials` rỗng (không
   lộ thông tin "có/không có tài khoản này").
3. Dùng `CredentialId` của NGƯỜI KHÁC cho username hiện tại → `/verify`
   từ chối (400), KHÔNG cấp cookie phiên — chặn đúng kiểu tấn công giả
   danh.
4. Chữ ký giả (không qua được `verifyAuthenticationResponse()` thật) →
   từ chối, không đăng nhập.
5. Token thử thách dùng 1 lần — gọi `/verify` lại với token đã dùng →
   "hết hạn".

Build sạch (`npx vite build`) cả 3 frontend: rp-user, etl-admin, api-admin.

## Các bước triển khai

1. `git pull origin main`.
2. `pm2 restart hcrc-rp-server hcrc-etl hcrc-api-server` (BẮT BUỘC — thêm
   route mới ở cả 3 backend).
3. `cd rp-user && npm run build`, `cd etl-admin && npm run build`,
   `cd api-admin && npm run build` — copy `dist/` mới cho cả 3.
4. Kiểm tra: đăng nhập bằng mật khẩu 1 lần ở mỗi app → đăng xuất → mở lại
   trang đăng nhập → username hiện sẵn + nút "Đăng nhập bằng vân tay /
   Face ID" xuất hiện (nếu tài khoản đó đã đăng ký thiết bị ở "Tài khoản
   của tôi") → bấm vào, xác thực vân tay/Face ID → vào thẳng, không hỏi
   gì thêm. Thử bấm nút vân tay rồi quan sát: mọi ô/nút khác trên form bị
   khoá (xám, không bấm được) trong lúc chờ xác thực.

## Lưu ý cho người chưa đăng ký thiết bị nào

Không có gì thay đổi — nút "Đăng nhập bằng vân tay / Face ID" chỉ hiện
khi trình duyệt hỗ trợ WebAuthn và đã gõ/nhớ sẵn username; nếu username
đó chưa đăng ký thiết bị nào, bấm vào trình duyệt sẽ tự báo "không có
thiết bị nào khớp" (không phải lỗi hệ thống) — vẫn gõ mật khẩu đăng nhập
bình thường. Muốn dùng vân tay, vào "Tài khoản của tôi" đăng ký thiết bị
trước.

## File thay đổi

- `rp-server/routes/webauthn.js`, `etl/routes/admin/webauthn.js`,
  `api-server/routes/admin/webauthn.js` — 2 route mới
  `/login-by-username/options` + `/login-by-username/verify`.
- `rp-user/src/lib/AuthContext.jsx`, `etl-admin/src/lib/AuthContext.jsx`,
  `api-admin/src/lib/AuthContext.jsx` — `webauthnPasswordlessOptions`/
  `webauthnPasswordlessVerify`.
- `rp-user/src/pages/LoginPage.jsx`, `etl-admin/src/pages/LoginPage.jsx`,
  `api-admin/src/pages/LoginPage.jsx` — nhớ username, nút vân tay, khoá
  toàn bộ form lúc đang xác thực.
- `rp-user/src/components/CaptchaField.jsx`,
  `etl-admin/src/components/CaptchaField.jsx`,
  `api-admin/src/components/CaptchaField.jsx` — thêm prop `disabled`.
- `rp-user/src/styles.css`, `etl-admin/src/styles.css`,
  `api-admin/src/styles.css` — `.remembered-account-row`/
  `.remembered-account-name`.
