# Hướng dẫn cập nhật hệ thống lên bản 6.50 (gộp các bản 6.28 → 6.50)

Gửi IT/DBA thực hiện đúng theo thứ tự bên dưới. File này CHỈ nói về việc
**đưa code đã có sẵn trong Git lên máy chủ đang chạy thật** — không giải
thích tính năng (xem `VERSION.md` mục 6.28-6.50 trong mã nguồn nếu cần biết
chi tiết từng thay đổi).

Đợt cập nhật này gồm: tính năng báo cáo "Báo cáo nhanh doanh thu — Lãnh đạo
Tập đoàn/HCRC" (đọc dữ liệu DSMART16), tách trang "Nhập chỉ tiêu" thành 2
trang riêng theo 2 nhóm nghiệp vụ, thêm nút "Sửa" cho Báo cáo/Job đồng
bộ/Nguồn dữ liệu/Đối tác API (đỡ phải xoá-tạo-lại), và sửa giao diện di
động (sidebar dạng menu ẩn/hiện trên điện thoại).

---

## Bước 1 — Lấy code mới nhất

Trên máy chủ đang chạy thật (KHÔNG phải máy dev), vào đúng thư mục gốc mã
nguồn rồi chạy:

```bash
git pull origin main
```

---

## Bước 2 — Build lại 3 giao diện (etl-admin, api-admin, rp-user)

3 giao diện này là file tĩnh (HTML/CSS/JS build sẵn) — sửa code xong PHẢI
build lại, không tự nhận code mới nếu chỉ `git pull`:

```bash
cd etl-admin && npm run build && cd ..
cd api-admin && npm run build && cd ..
cd rp-user   && npm run build && cd ..
```

Sau khi build xong, copy đúng thư mục `dist/` mới của từng app vào đúng
chỗ Nginx (hoặc `serve-static.js`) đang trỏ tới, theo cấu hình đã dùng lúc
triển khai ban đầu (xem `deploy/Hướng dẫn triển khai PM2.md` mục 7, hoặc
`deploy/Hướng dẫn triển khai sử dụng PM2 + Nginx.md`).

---

## Bước 3 — Restart 3 backend Node

Code route/logic phía server (`etl`, `rp-server`, `api-server`) chạy nền
qua PM2 — PHẢI restart để nạp code mới, `git pull` không tự làm việc này:

```bash
pm2 restart etl
pm2 restart rp-server
pm2 restart api-server
```

(Chạy `pm2 list` trước nếu không nhớ chính xác tên 3 process đã đặt lúc
`pm2 start`.)

---

## Bước 4 — Chạy lại file schema CSDL `etl` (BẮT BUỘC, có đổi ở đợt này)

Bản 6.30-6.33 có thêm/sửa dữ liệu trong CSDL `etl` (tách vai trò "Nhập chỉ
tiêu" thành 2 vai trò riêng). File `etl-db/schema.sql` viết an toàn để
chạy lại nhiều lần (dùng `IF NOT EXISTS`), **chạy nguyên cả file, không chỉ
đoạn cuối** — các đoạn cũ tự bỏ qua vì đã tồn tại.

**Cách 1 — SQL Server Management Studio (SSMS)**:
1. Connect vào server đang chứa CSDL `etl`.
2. Chọn đúng CSDL `etl` ở ô Database.
3. Mở file `etl-db/schema.sql` (trong mã nguồn) → chọn hết → copy → dán
   vào cửa sổ Query mới trong SSMS.
4. Bấm **Execute** (F5).

**Cách 2 — dòng lệnh `sqlcmd`** (nếu chạy được từ server):
```bash
sqlcmd -S <địa_chỉ_server_etl> -U <user> -P <password> -d etl -i etl-db/schema.sql
```

> Sau bước này, admin cần vào **etl-admin → Vai trò** gán lại tài khoản nào
> đang giữ vai trò "Nhập chỉ tiêu" (cũ) sang đúng 1 trong 2 vai trò mới
> (Lãnh đạo Tập đoàn / HCRC) — việc này KHÔNG tự động, script chỉ tạo vai
> trò mới, không tự đoán ai thuộc nhóm nào.

---

## Bước 5 — (Tuỳ, chỉ khi làm báo cáo doanh thu LDTD/HCRC) 2 script tạo cấu hình ETL/báo cáo

Chỉ cần làm bước này khi đã tạo xong 2 VIEW (`V_HCRC_DOANHTHU_CHINHANH`,
`V_HCRC_GIAODICH_CHINHANH`) trên CẢ 2 CSDL DSMART16 — xem chi tiết ở file
`báo cáo doanh thu cuối ngày.md` Bước 1. Script này **an toàn chạy lại
nhiều lần** (tự cập nhật thay vì tạo trùng).

**5.1 — Tạo/cập nhật 2 Nguồn dữ liệu + 4 job đồng bộ ETL**:
```bash
cd etl
# Tạo/sửa file .env, thêm 3 dòng (điền đúng thông tin thật):
#   DSMART16_SERVER=<địa chỉ IP máy chủ DSMART16>
#   DSMART16_USER=<tài khoản CHỈ ĐỌC>
#   DSMART16_PASSWORD=<mật khẩu>
node scripts/seedLdtdHcrcSync.js
```

**5.2 — Tạo/cập nhật 2 báo cáo (Lãnh đạo Tập đoàn / HCRC)**:
```bash
cd rp-server
node scripts/seedLdtdHcrcReports.js
```
(rp-server đã có sẵn kết nối CSDL riêng trong `.env` của nó, không cần
thêm biến môi trường nào khác cho script này.)

---

## Bước 6 — Kiểm tra sau khi cập nhật

- [ ] `etl-admin → Vai trò`: thấy 2 vai trò mới "Nhập chỉ tiêu - Lãnh đạo
      Tập đoàn" và "Nhập chỉ tiêu - HCRC".
- [ ] `etl-admin → Đồng bộ`, `→ Nguồn dữ liệu`, `rp-user → Biểu mẫu`,
      `api-admin → Đối tác`: mỗi dòng trong bảng đều có nút **"Sửa"**
      (trước đây chỉ có Xoá/Tắt-Bật).
- [ ] `rp-user → Xác thực HCRC Workspace`: có nút "Xem khoá API hiện tại".
- [ ] Mở bất kỳ trang nào trên điện thoại (màn hẹp) — thấy thanh trên
      cùng có nút ☰, bấm mở ra menu dạng trượt, không còn bị tràn ngang
      phải cuộn ngang mới xem hết trang.
- [ ] (Nếu đã làm Bước 5) `etl-admin → Nguồn dữ liệu`: có 2 nguồn
      "DSMART16 - Live" và "DSMART16 - Lịch sử"; `→ Đồng bộ`: có đủ 4 job.
- [ ] (Nếu đã làm Bước 5) `rp-user → Báo cáo`: có 2 báo cáo "Báo cáo nhanh
      doanh thu - Lãnh đạo Tập đoàn" và "- HCRC".

Có mục nào không đúng như trên, báo lại người phụ trách để kiểm tra tiếp.
