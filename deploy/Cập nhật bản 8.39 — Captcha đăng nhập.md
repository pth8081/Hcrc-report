# Hướng dẫn cập nhật hệ thống lên bản 8.39

Gửi IT/DBA thực hiện đúng theo thứ tự bên dưới. File này CHỈ nói về việc
**đưa code đã có sẵn trong Git lên máy chủ đang chạy thật** — không giải
thích tính năng (xem `VERSION.md` mục 8.39 trong mã nguồn nếu cần biết chi
tiết).

**QUAN TRỌNG — bản này thêm 1 gói npm MỚI** (`svg-captcha`, tự vẽ ảnh
captcha, không cần Internet lúc chạy) cho CẢ 3 backend (`rp-server`,
`etl`, `api-server`) — `git pull` thôi CHƯA đủ, phải `npm install` lại ở
cả 3 nơi. Không đổi cấu trúc CSDL.

---

## Bước 1 — Lấy code mới nhất

```bash
git pull origin main
```

---

## Bước 2 — Cài gói mới cho cả 3 backend

```bash
cd rp-server && npm install && cd ..
cd etl && npm install && cd ..
cd api-server && npm install && cd ..
```

---

## Bước 3 — Build lại cả 3 giao diện

```bash
cd rp-user && npm run build && cd ..
cd etl-admin && npm run build && cd ..
cd api-admin && npm run build && cd ..
```

Copy từng thư mục `dist/` mới vào đúng chỗ đang phục vụ.

---

## Bước 4 — Restart cả 3 backend

```bash
pm2 restart hcrc-rp-server
pm2 restart hcrc-etl
pm2 restart hcrc-api-server
```

---

## Bước 5 — Kiểm tra sau khi cập nhật

- [ ] Màn hình Đăng nhập cả 3 app (ETL/API/Report) hiện thêm ô "Mã xác
      nhận" (ảnh 4 chữ số + nút ⟲) ngay dưới ô Mật khẩu.
- [ ] Nhập SAI mã xác nhận (dù đúng tài khoản/mật khẩu) → báo lỗi "Mã xác
      nhận không đúng hoặc đã hết hạn", ảnh captcha TỰ ĐỘNG đổi sang ảnh
      mới (không phải ảnh cũ).
- [ ] Nhập ĐÚNG mã xác nhận + đúng tài khoản/mật khẩu → đăng nhập bình
      thường (qua 2FA như cũ nếu tài khoản có bật).
- [ ] Bấm nút ⟲ → ảnh captcha đổi ngay, không cần tải lại trang.
- [ ] Đợi hơn 5 phút KHÔNG bấm đăng nhập rồi mới bấm → báo lỗi mã hết hạn
      (đúng thiết kế, không phải lỗi).

Có mục nào không đúng như trên, báo lại người phụ trách để kiểm tra tiếp.
