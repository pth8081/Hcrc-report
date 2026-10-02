# Hướng dẫn cập nhật hệ thống lên bản 8.31-8.32

Gửi IT/DBA thực hiện đúng theo thứ tự bên dưới. File này CHỈ nói về việc
**đưa code đã có sẵn trong Git lên máy chủ đang chạy thật** — không giải
thích tính năng (xem `VERSION.md` mục 8.31/8.32 trong mã nguồn nếu cần
biết chi tiết).

**Đã XÁC NHẬN không đổi cấu trúc CSDL nào ở đợt này** — KHÔNG cần chạy lại
file `schema.sql` hay script seed nào. **Chỉ sửa 2 file backend
(`etl/lib/dataSourcesImport.js`, `etl/lib/syncJobsImport.js`), KHÔNG cần
build lại giao diện nào.**

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
- [ ] etl-admin → Đồng bộ → bấm "Tải file mẫu" → mở file vừa tải: dòng 1
      phải là header (`Name, DataSourceName, TargetDomain, ...`), dòng
      2-3 là 2 dòng ví dụ ("... - ST VIDU") — cũng KHÔNG còn dòng câu
      hướng dẫn phía trên header.
- [ ] Nhập thử lại file "Nguồn dữ liệu" 34 siêu thị Thành viên (file đã
      gửi riêng người dùng, header đã sửa đúng dòng 1 từ trước) — phải
      nhập được, không còn báo "File thiếu cột bắt buộc 'Name'".
- [ ] Sau khi nhập xong 34 Nguồn dữ liệu, nhập tiếp file "Sync Job" 68
      dòng (đã gửi riêng người dùng) — phải nhập được đủ 68 dòng, không
      báo "không tìm thấy Nguồn dữ liệu" (tên 2 file đã đối chiếu khớp
      100% trước khi gửi).

Có mục nào không đúng như trên, báo lại người phụ trách để kiểm tra tiếp.
