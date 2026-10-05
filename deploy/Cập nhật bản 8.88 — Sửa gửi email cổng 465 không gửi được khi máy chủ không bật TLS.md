# Cập nhật bản 8.88 — Sửa gửi email cổng 465 không gửi được khi máy chủ không bật TLS (rp-user/rp-server)

## Báo cáo của người dùng

1. Ảnh chụp `/var/log/mail.log` của Postfix nội bộ (`br-serv-sendmail`) —
   nhiều dòng "lost connection after CONNECT" từ các IP nội bộ của hệ
   thống HCRC, `commands=0/0` (mất kết nối ngay, không gửi được lệnh SMTP
   nào).
2. Tiếp theo, ảnh chụp trang "Thiết lập email" (rp-user), bấm "Gửi thử",
   báo lỗi rõ:
   > Máy chủ SMTP 172.16.80.41:465 từ chối/lỗi gửi thử — Lỗi SMTP:
   > 08008F731287F0000:error:0A00010B:SSL routines:tls_validate_record_header:
   > wrong version number:.../deps/openssl/openssl/ssl/record/methods/tlsany_meth.c:77:

## Nguyên nhân

Lỗi OpenSSL "wrong version number" là dấu hiệu RẤT ĐẶC TRƯNG: ứng dụng
gửi ClientHello TLS (byte đầu tiên của bắt tay TLS) tới 1 cổng máy chủ
đang nói SMTP THUẦN (không mã hoá) — máy chủ không hiểu được byte TLS,
đóng kết nối ngay — khớp hoàn toàn với "lost connection after CONNECT"
(`commands=0/0`) thấy trong `mail.log`.

`rp-server/lib/mailer.js` (từ bản 8.63) có dòng:

```js
const secure = row.SmtpPort === 465 ? true : !!row.Secure;
```

ÉP CỨNG `secure=true` MỖI KHI cổng là 465, **bất kể** admin đã tick hay
bỏ tick "Secure" trong "Thiết lập email" — dựa trên giả định lúc đó
"không có gateway SMTP thật nào dùng cổng 465 ở chế độ không mã hoá".
Giả định này đúng với ĐA SỐ trường hợp (465 = SMTPS chuẩn), nhưng **SAI**
với chính Postfix nội bộ của người dùng: máy chủ `172.16.80.41` nghe cổng
465 nhưng **không thật sự bật TLS ở đó** (có thể do cấu hình nội bộ đặc
thù, hoặc port-forward nhầm từ 25 sang 465). Vì bị ép cứng trong code,
**admin hoàn toàn không có cách nào** bỏ tick "Secure" để thử gửi không
mã hoá trên cổng 465 — mọi lần "Gửi thử" đều lỗi giống hệt nhau, dù đã
sửa checkbox trên giao diện.

Giao diện ("Thiết lập email") cũng có 1 dòng hint SAI theo đúng giả định
cũ: *"Cổng 465 luôn dùng TLS ngay từ đầu kết nối — hệ thống tự gửi bằng
chế độ này dù ô trên có tick hay không."* — khẳng định checkbox KHÔNG CÓ
TÁC DỤNG ở cổng 465, càng khiến admin không nghĩ tới việc thử bỏ tick.

## Đã làm

### 1. `rp-server/lib/mailer.js` — bỏ ép cứng, tôn trọng đúng cấu hình đã lưu

```js
const secure = !!row.Secure;
```

Cổng 465 không còn được "ưu tiên" ép secure=true — `secure` LUÔN theo
đúng giá trị checkbox admin đã lưu, ở BẤT KỲ cổng nào.

### 2. Diễn giải lỗi "wrong version number" rõ ràng hơn

```js
function describeMailError(err) {
  const message = err?.message || String(err);
  if (/wrong version number|wrong_version_number/i.test(message)) {
    return `${message}\n→ Máy chủ SMTP này có vẻ KHÔNG bật TLS ngay từ đầu ở cổng đang dùng (dù đã tick "Secure") — thử BỎ tick "Secure" rồi gửi thử lại.`;
  }
  return message;
}
```

Áp dụng trong `sendMail()` — giữ NGUYÊN thông điệp OpenSSL gốc (để còn
tra cứu/báo cáo khi cần) + thêm 1 dòng hướng dẫn cụ thể NGAY SAU. Dùng
chung cho CẢ nút "Gửi thử" (`routes/emailSettings.js`) LẪN lịch gửi báo
cáo tự động (`jobs/reportEmailScheduler.js`, `jobs/anomalyAlertScheduler.js`)
— đều gọi qua `sendMail()` dùng chung.

### 3. `EmailSettingsPage.jsx` — sửa lại hint cho đúng + hướng dẫn cụ thể

Hint cũ ("hệ thống tự gửi bằng chế độ này dù ô trên có tick hay không")
đổi thành:

> Cổng 465 thường dùng TLS ngay từ đầu kết nối — đã tự tick "Secure" ở
> trên. Nếu "Gửi thử" báo lỗi OpenSSL kiểu "wrong version number"/
> "wrong_version_number", máy chủ SMTP này KHÔNG thật sự bật TLS ở cổng
> 465 — hãy BỎ tick "Secure" rồi thử lại.

Việc TỰ TICK "Secure" khi đổi sang cổng 465 (tiện tay, đúng đa số trường
hợp) vẫn giữ nguyên — chỉ không còn bị ép buộc lúc GỬI THẬT.

### 4. `rp-user/src/styles.css` — xuống dòng rõ cho lỗi nhiều dòng

```css
.form-error { color: #b3261e; font-size: 13px; white-space: pre-line; }
```

Câu gợi ý 2 dòng của `describeMailError()` giờ xuống dòng rõ ràng thay vì
dính liền thành 1 hàng dài khó đọc.

## Đã kiểm chứng

Mock CSDL thật, gọi thẳng `sendMail()`:

1. Cổng 465, `Secure` đã lưu = **false** (admin chủ ý bỏ tick) → gửi
   đúng `secure:false` — KHÔNG còn bị ép `true`.
2. Cổng 465, `Secure` đã lưu = **true** (trường hợp thông thường) → vẫn
   gửi `secure:true` như trước — KHÔNG đổi hành vi phổ biến.
3. Lỗi "wrong version number" → thông điệp trả về GIỮ NGUYÊN lỗi gốc +
   thêm đúng câu gợi ý.

Build `rp-user && npx vite build` sạch.

## Các bước triển khai

1. `git pull origin main`.
2. `pm2 restart hcrc-rp-server` (BẮT BUỘC — đổi logic gửi email).
3. `cd rp-user && npm run build`, copy `dist/` mới.
4. Kiểm tra: "Thiết lập email" → cổng 465 → BỎ tick "Secure" (nếu máy chủ
   thật không bật TLS ở cổng đó, như trường hợp người dùng) → "Gửi thử"
   → gửi thành công (trước đây luôn báo lỗi "wrong version number" dù đã
   bỏ tick).

## Nếu vẫn chưa gửi được sau bản này

Thử lại với "Secure" đã BỎ TICK ở cổng 465. Nếu vẫn lỗi, kiểm tra thêm:
- Đúng cổng Postfix THẬT SỰ đang nghe (hỏi lại đội quản trị mạng) — có
  thể cổng chuẩn hơn là 25 hoặc 587 thay vì 465.
- Postfix có yêu cầu đăng nhập (Username/Password) không, hay cho gửi
  thẳng theo dải IP nội bộ (relay) — xem gợi ý preset "Postfix" ngay
  trên trang.

## File thay đổi

- `rp-server/lib/mailer.js` — bỏ ép cứng `secure=true` ở cổng 465, thêm
  `describeMailError()`.
- `rp-user/src/modules/system/email-settings/EmailSettingsPage.jsx` —
  sửa lại hint cổng 465 cho đúng + hướng dẫn cụ thể khi gặp lỗi.
- `rp-user/src/styles.css` — `.form-error` thêm `white-space: pre-line`.
