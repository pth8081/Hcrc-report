# Hướng dẫn cập nhật hệ thống lên bản 8.40

Gửi IT/DBA thực hiện đúng theo thứ tự bên dưới. File này CHỈ nói về việc
**đưa code đã có sẵn trong Git lên máy chủ đang chạy thật** — không giải
thích tính năng (xem `VERSION.md` mục 8.40 trong mã nguồn nếu cần biết chi
tiết).

**Không đổi CSDL, không đổi backend** — CHỈ build lại giao diện `rp-user`.

---

## Bước 1 — Lấy code mới nhất

```bash
git pull origin main
```

---

## Bước 2 — Build lại giao diện rp-user

```bash
cd rp-user && npm run build && cd ..
```

Copy `dist/` mới vào đúng chỗ đang phục vụ.

---

## Bước 3 — Kiểm tra sau khi cập nhật

- [ ] Đăng nhập bằng tài khoản Admin hệ thống (đã bật 2FA) → vào "Tài
      khoản của tôi" → thấy mục "Bảo mật — Xác thực hai yếu tố" với nút
      "Đặt lại mã 2FA".
- [ ] Bấm nút đó → nhập đúng mã 6 số hiện tại → hiện mã QR MỚI → quét bằng
      app Authenticator trên 1 thiết bị khác → nhập mã 6 số mới hiện ra →
      xác nhận → hiện 10 mã khôi phục mới (chỉ 1 lần).
- [ ] Đăng xuất, đăng nhập lại → bước 2FA giờ phải dùng mã từ thiết bị
      MỚI (mã/QR CŨ không còn dùng được).
- [ ] Tài khoản KHÔNG phải vai trò hệ thống → vào "Tài khoản của tôi" →
      KHÔNG thấy mục "Bảo mật" này (đúng ý, 2FA không áp dụng).

Có mục nào không đúng như trên, báo lại người phụ trách để kiểm tra tiếp.
