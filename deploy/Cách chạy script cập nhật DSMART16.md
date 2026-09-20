# Cách chạy 2 loại script cập nhật (SQL và Node) cho DSMART16/LDTD-HCRC

File này tách riêng phần "chạy script như thế nào" từ hướng dẫn cập nhật
tổng (`deploy/Cập nhật bản 6.28-6.50 — Báo cáo doanh thu LDTD-HCRC.md`) để
dễ gửi riêng cho người trực tiếp thao tác.

Có **2 loại script khác nhau**, mục đích khác nhau — làm đúng loại nào cần
loại đó, không thay thế nhau được.

---

## 1. Script SQL (`etl-db/schema.sql`) — chạy 1 lần trên CSDL `etl` nội bộ

**Mục đích**: cập nhật cấu trúc/dữ liệu hệ thống (bảng, vai trò...) trong
CSDL `etl` — CSDL nội bộ của hệ thống báo cáo, KHÁC với DSMART16 (nguồn dữ
liệu bán hàng bên ngoài).

**Cách A — dùng SQL Server Management Studio (SSMS, khuyên dùng)**:
1. Mở SSMS, Connect vào server đang chứa CSDL **`etl`**.
2. Chọn đúng CSDL `etl` ở ô Database trên thanh công cụ.
3. Mở file `etl-db/schema.sql` (trong thư mục mã nguồn trên máy bạn) →
   chọn hết (Ctrl+A) → copy → dán vào 1 cửa sổ Query mới trong SSMS.
4. Bấm **Execute** (phím F5). File dùng `IF NOT EXISTS`/`GO` nên chạy toàn
   bộ 1 lần là đủ, không lỗi dù trước đó đã chạy các bản cũ hơn rồi.

**Cách B — dùng `sqlcmd`** (nếu chạy được từ dòng lệnh trên máy chủ):
```bash
sqlcmd -S <địa_chỉ_server_etl> -U <user> -P <password> -d etl -i etl-db/schema.sql
```

---

## 2. Script Node (`.js`) — chạy trên máy có kết nối tới DSMART16 và CSDL etl/rp

**Mục đích**: tự động tạo/cập nhật cấu hình "Nguồn dữ liệu"/"Job đồng bộ"
(bên etl) và "Báo cáo" (bên rp-server) — thay cho việc bấm tay qua giao
diện web nhiều lần.

**Điều kiện trước khi chạy**: đã tạo xong 2 VIEW
(`V_HCRC_DOANHTHU_CHINHANH`, `V_HCRC_GIAODICH_CHINHANH`) trên CẢ 2 CSDL
DSMART16 (Live + Lịch sử) — xem chi tiết Bước 1 trong file
`báo cáo doanh thu cuối ngày.md`.

**2.1 — Tạo/cập nhật 2 "Nguồn dữ liệu" + 4 job đồng bộ**:
```bash
cd etl
```
Mở (hoặc tạo mới) file `.env` trong thư mục `etl`, thêm đúng 3 dòng, điền
thông tin thật:
```
DSMART16_SERVER=172.16.70.20
DSMART16_USER=<tài khoản CHỈ ĐỌC>
DSMART16_PASSWORD=<mật khẩu>
```
Rồi chạy:
```bash
node scripts/seedLdtdHcrcSync.js
```

**2.2 — Tạo/cập nhật 2 báo cáo (Lãnh đạo Tập đoàn / HCRC)**:
```bash
cd rp-server
node scripts/seedLdtdHcrcReports.js
```
(rp-server đã có sẵn kết nối CSDL riêng trong `.env` của nó — KHÔNG cần
thêm biến môi trường nào khác cho script này.)

**Chạy lại có sao không?** Không — cả 2 script đều **an toàn chạy lại
nhiều lần** (idempotent): khớp theo tên đã có sẵn để CẬP NHẬT thay vì tạo
trùng. Đổi thông tin kết nối/mật khẩu DSMART16 thì chỉ cần sửa lại `.env`
rồi chạy lại `seedLdtdHcrcSync.js` là đủ.

---

## Bảng tóm tắt nhanh

| | Script SQL (mục 1) | Script Node (mục 2) |
|---|---|---|
| File | `etl-db/schema.sql` | `etl/scripts/seedLdtdHcrcSync.js`, `rp-server/scripts/seedLdtdHcrcReports.js` |
| Chạy bằng | SSMS hoặc `sqlcmd` | `node <file>.js` |
| Chạy ở đâu | Trực tiếp trên SQL Server (CSDL `etl`) | Máy có Node.js + kết nối mạng tới DSMART16 |
| Khi nào cần | Sau mỗi lần code có đổi `etl-db/schema.sql` (xem `VERSION.md`) | Sau khi tạo/sửa VIEW DSMART16, hoặc đổi tài khoản/địa chỉ kết nối |
| Chạy lại nhiều lần | An toàn | An toàn |
