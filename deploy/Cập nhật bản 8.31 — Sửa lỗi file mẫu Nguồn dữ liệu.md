# Hướng dẫn cập nhật hệ thống lên bản 8.31

Gửi IT/DBA thực hiện đúng theo thứ tự bên dưới. File này CHỈ nói về việc
**đưa code đã có sẵn trong Git lên máy chủ đang chạy thật** — không giải
thích tính năng (xem `VERSION.md` mục 8.31 trong mã nguồn nếu cần biết chi
tiết).

**Đã XÁC NHẬN không đổi cấu trúc CSDL nào ở đợt này** — KHÔNG cần chạy lại
file `schema.sql` hay script seed nào. **Chỉ sửa 1 file backend
(`etl/lib/dataSourcesImport.js`), KHÔNG cần build lại giao diện nào.**

---

## Bước 1 — Lấy code mới nhất

```bash
git pull origin main
```

---

## Bước 2 — Restart `hcrc-etl`

```bash
pm2 restart hcrc-etl
```

---

## Bước 3 — Kiểm tra sau khi cập nhật

- [ ] etl-admin → Nguồn dữ liệu → bấm "Tải file mẫu" → mở file vừa tải:
      dòng 1 phải là header (`Name, Server, DatabaseName, Username,
      Password, Engine, Port, Encrypt, TrustServerCert`), dòng 2 là dòng
      ví dụ ("DSMART16 - VIDU") — KHÔNG còn dòng câu hướng dẫn phía trên
      header như bản cũ.
- [ ] Nhập thử lại file "Nguồn dữ liệu" 34 siêu thị Thành viên (file đã
      gửi riêng người dùng, header đã sửa đúng dòng 1 từ trước) — phải
      nhập được, không còn báo "File thiếu cột bắt buộc 'Name'".

Có mục nào không đúng như trên, báo lại người phụ trách để kiểm tra tiếp.
