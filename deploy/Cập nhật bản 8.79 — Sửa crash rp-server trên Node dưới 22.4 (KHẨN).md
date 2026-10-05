# Cập nhật bản 8.79 — Sửa crash rp-server trên Node < 22.4 (KHẨN)

## Báo cáo của người dùng

Gửi ảnh chụp:
1. Trang đăng nhập report.hcrc.vn — ô "Mã xác nhận" trống, không hiện ảnh captcha.
2. DevTools (Network tab) — request `captcha` trả về **502 Bad Gateway**.
3. DevTools (Console tab) — lỗi `Không tải được captcha: Error: Không kết
   nối được backend`, cả `/api/auth/captcha` lẫn `/api/me` đều 502.
4. Log PM2 (`pm2 logs hcrc-rp-server`):
   ```
   TypeError: tls.getCACertificates is not a function
       at Object.<anonymous> (/opt/Hcrc-report/rp-server/lib/trustedCa.js:43:26)
       ...
       at Object.<anonymous> (/opt/Hcrc-report/rp-server/routes/trustedCa.js:13:59)
       ...
       at Object.<anonymous> (/opt/Hcrc-report/rp-server/server.js:36:25)
   ```
5. `pm2 status` — `hcrc-rp-server` (2 cluster worker) ở trạng thái **`errored`**,
   mọi tiến trình khác (`hcrc-etl`, `hcrc-api-server`, `hcrc-etl-admin`,
   `hcrc-api-admin`, `hcrc-rp-user`) đều `online` bình thường.

## Root cause thật — KHÔNG phải lỗi captcha

Log PM2 (ảnh 4) chỉ ra chính xác vấn đề: `hcrc-rp-server` **crash ngay
lúc khởi động**, không chạy được dù chỉ 1 giây. Ảnh 2+3 (502 Bad Gateway
trên captcha VÀ `/api/me`) là **hậu quả trực tiếp** — backend không hề
chạy thì MỌI API đều 502, không riêng gì captcha.

`rp-server/lib/trustedCa.js` (tính năng "CA tin cậy", bản 8.72) gọi
`tls.getCACertificates('default')` (dòng 43) và `tls.setDefaultCACertificates()`
(qua `applyTrustedCas()`, gọi ở dòng 114) **ngay lúc module được
`require()`** — ngoài mọi try/catch, không có bất kỳ lớp bảo vệ nào.

Hai API này **chỉ có từ Node.js >= 22.4**. Comment cũ trong code ghi
nhầm "Node >= ~20, có sẵn" — trong khi `rp-server/package.json` còn khai
`"engines": {"node": ">=18.0.0"}`, tức là bản thân dự án tuyên bố hỗ trợ
Node 18+. Server production đang chạy Node **cũ hơn 22.4**, nên khi
`server.js` chạy `require('./routes/trustedCa')` → `require('./lib/trustedCa')`,
dòng `tls.getCACertificates(...)` ném `TypeError: ... is not a function`
ngay lập tức — làm sập TOÀN BỘ tiến trình `hcrc-rp-server` (cả 2 cluster
worker, khớp đúng ảnh 5).

**Đã dựng lại đúng lỗi để xác nhận**: xoá `tls.getCACertificates` trước
khi `require()` file `trustedCa.js` thật — tái hiện chính xác
`TypeError: tls.getCACertificates is not a function`.

## Đã sửa

`lib/trustedCa.js` tự kiểm tra (`SUPPORTED = typeof tls.getCACertificates
=== 'function' && typeof tls.setDefaultCACertificates === 'function'`)
**trước khi gọi** 2 API này:

- Node không hỗ trợ → **TẮT GỌN** tính năng "CA tin cậy" thay vì crash cả
  tiến trình:
  - Log 1 dòng cảnh báo rõ ràng lúc khởi động (`console.warn`).
  - `listTrustedCas()` trả mảng rỗng (trang "Chứng chỉ TLS" vẫn mở được
    bình thường, chỉ không có CA nào để hiện).
  - `addTrustedCa()`/`removeTrustedCa()` trả lỗi rõ ràng (HTTP 503: "Tính
    năng CA tin cậy cần Node.js >= 22.4, máy chủ đang chạy &lt;phiên bản
    thật&gt;...") thay vì ném lỗi 500 làm crash.
- Node có đủ API → hoạt động y hệt trước đây, không đổi hành vi.

Mọi tính năng KHÁC của rp-server (đăng nhập, captcha, báo cáo, 2FA,
WebAuthn...) **hoàn toàn không phụ thuộc** `lib/trustedCa.js` — chúng chỉ
bị crash LÂY do lỗi xảy ra ở top-level lúc `require()` kéo sập cả tiến
trình Node, không phải do logic nghiệp vụ của chúng có vấn đề.

## Đã kiểm chứng

- **Dựng lại đúng lỗi**: xoá `tls.getCACertificates`/`setDefaultCACertificates`
  trước khi `require()` — xác nhận module THẬT (không giả logic) nạp
  thành công (không còn ném lỗi); `listTrustedCas()` trả `[]`;
  `addTrustedCa()` và `removeTrustedCa()` đều trả đúng lỗi 503 với thông
  điệp rõ ràng.
- **Kiểm chứng KHÔNG hồi quy** (Node có đủ API, đường thường): dùng CA
  tự ký thật tạo bằng `openssl` — `addTrustedCa()` thêm đúng, lưu file
  `.pem`, `listTrustedCas()` thấy ngay; `removeTrustedCa()` xoá đúng,
  danh sách về rỗng lại. Hành vi y hệt trước bản 8.79.

## Các bước triển khai (KHẨN — làm ngay)

1. `git pull origin main`.
2. `pm2 restart hcrc-rp-server` (BẮT BUỘC — sửa thuần code backend,
   KHÔNG đổi CSDL, KHÔNG cần `npm install`, KHÔNG cần build lại
   `rp-user`).
3. Kiểm tra ngay sau khi restart:
   - `pm2 status hcrc-rp-server` → cả 2 worker chuyển sang `online`
     (không còn `errored`).
   - `pm2 logs hcrc-rp-server` → không còn dòng
     `TypeError: tls.getCACertificates is not a function`; có thể thấy 1
     dòng cảnh báo mới `⚠️ Tính năng "CA tin cậy" cần Node.js >= 22.4...`
     nếu Node trên server vẫn cũ hơn 22.4 — dòng này BÌNH THƯỜNG, không
     phải lỗi.
   - Mở lại `https://report.hcrc.vn/login` → captcha hiện ảnh 4 chữ số
     bình thường, đăng nhập được.
4. **(Tuỳ chọn, chỉ nếu cần dùng tính năng "CA tin cậy")**: trang "Chứng
   chỉ TLS" (chỉ tài khoản vai trò hệ thống thấy) → mục "CA tin cậy" sẽ
   trống và báo lỗi rõ ràng nếu bấm "Thêm CA tin cậy" trong khi Node vẫn
   cũ hơn 22.4. Muốn dùng lại tính năng này: nâng cấp Node.js trên server
   lên >= 22.4 rồi `pm2 restart hcrc-rp-server` lại. **Không bắt buộc** —
   mọi tính năng khác của rp-server chạy bình thường dù không nâng cấp.

## File thay đổi

- `rp-server/lib/trustedCa.js` — thêm kiểm tra `SUPPORTED` trước khi gọi
  `tls.getCACertificates`/`setDefaultCACertificates`; `applyTrustedCas()`,
  `listTrustedCas()`, `addTrustedCa()`, `removeTrustedCa()` đều tự tắt
  gọn/báo lỗi rõ ràng thay vì crash khi Node không hỗ trợ.
