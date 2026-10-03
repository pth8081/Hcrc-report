# Hướng dẫn cập nhật hệ thống lên bản 8.41

Gửi IT/DBA thực hiện đúng theo thứ tự bên dưới. File này CHỈ nói về việc
**đưa code đã có sẵn trong Git lên máy chủ đang chạy thật** — không giải
thích tính năng (xem `VERSION.md` mục 8.41 trong mã nguồn nếu cần biết chi
tiết).

**QUAN TRỌNG — bản này có 3 việc khác các bản trước**: (1) thêm bảng CSDL
mới, (2) thêm gói npm mới, (3) **BẮT BUỘC khai domain thật** vào `.env`
trước khi tính năng dùng được (thiếu thì tính năng tự tắt, không ảnh hưởng
đăng nhập thường — không phải lỗi khẩn cấp, nhưng phải làm mới dùng được).

---

## Bước 1 — Lấy code mới nhất

```bash
git pull origin main
```

---

## Bước 2 — Chạy lại schema.sql (thêm bảng mới, an toàn chạy lại nhiều lần)

```bash
cd rp-db
# Chạy đúng cách đang dùng để áp schema.sql vào CSDL HCRC_RP (sqlcmd hoặc
# SSMS) — file tự kiểm tra IF OBJECT_ID(...) IS NULL, không tạo trùng/mất
# dữ liệu cũ.
```

---

## Bước 3 — Khai domain thật vào `.env` của `rp-server`

Mở `rp-server/.env`, thêm (hoặc sửa nếu đã có dòng trống từ `.env.example`):

```bash
WEBAUTHN_RP_NAME=HCRC Report
WEBAUTHN_RP_ID=report.hcrc.vidu.vn
WEBAUTHN_RP_ORIGIN=https://report.hcrc.vidu.vn
```

Đổi `report.hcrc.vidu.vn` thành ĐÚNG domain thật đang phục vụ `rp-user`
(domain người dùng gõ lên trình duyệt để vào trang Báo cáo) —
**`WEBAUTHN_RP_ID` chỉ có tên domain** (không `https://`, không `/`,
không port), **`WEBAUTHN_RP_ORIGIN` phải có `https://`** đầy đủ. Sai domain
= tính năng báo lỗi ngay khi bấm đăng ký/dùng vân tay (không phải lỗi code).

---

## Bước 4 — Cài gói mới + build lại

```bash
cd rp-server && npm install && cd ..
cd rp-user && npm run build && cd ..
```

Copy `rp-user/dist/` mới vào đúng chỗ đang phục vụ.

---

## Bước 5 — Restart `rp-server`

```bash
pm2 restart hcrc-rp-server
```

---

## Bước 6 — Kiểm tra sau khi cập nhật (BẮT BUỘC dùng thiết bị thật — điện
## thoại/laptop có vân tay/Face ID, không mô phỏng được bằng công cụ)

- [ ] Đăng nhập bằng tài khoản Admin hệ thống → "Tài khoản của tôi" → thấy
      mục "Bảo mật — Vân tay/Face ID" (chỉ hiện nếu trình duyệt/máy hỗ trợ
      WebAuthn — Chrome/Edge/Safari bản mới trên máy có cảm biến).
- [ ] Đặt tên thiết bị, bấm "Đăng ký thiết bị mới" → trình duyệt tự hiện
      hộp thoại xin vân tay/Face ID → quét thành công → thiết bị xuất hiện
      trong danh sách.
- [ ] Đăng xuất, đăng nhập lại (đúng mật khẩu) → tới bước "Xác thực hai
      yếu tố" → thấy thêm nút "Dùng vân tay/Face ID" → bấm → quét vân tay/
      Face ID → **vào thẳng hệ thống, KHÔNG phải gõ thêm mã 6 số nào**.
- [ ] Vẫn còn nhập được mã 6 số như cũ nếu không bấm nút vân tay (không
      phá luồng cũ).
- [ ] Gỡ thử 1 thiết bị ở "Tài khoản của tôi" → đăng nhập lại → nút "Dùng
      vân tay/Face ID" vẫn hiện (nếu còn thiết bị khác) nhưng báo lỗi rõ
      ràng nếu bấm đúng thiết bị vừa gỡ.
- [ ] Nếu CHƯA khai `WEBAUTHN_RP_ID`/`WEBAUTHN_RP_ORIGIN` — xác nhận mục
      "Bảo mật — Vân tay/Face ID" báo lỗi rõ ràng (không phải trắng trang/
      crash) khi bấm đăng ký.

Có mục nào không đúng như trên, báo lại người phụ trách để kiểm tra tiếp.
