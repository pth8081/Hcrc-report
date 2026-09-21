# Cách chạy 2 loại script cập nhật (SQL và Node) cho DSMART16/LDTD-HCRC

File này tách riêng phần "chạy script như thế nào" từ hướng dẫn cập nhật
tổng (`deploy/Cập nhật bản 6.28-6.50 — Báo cáo doanh thu LDTD-HCRC.md`) để
dễ gửi riêng cho người trực tiếp thao tác.

Có **3 loại script khác nhau**, mục đích khác nhau — làm đúng loại nào cần
loại đó, không thay thế nhau được. (Cập nhật: thêm mục 3 — `dwh/grants.sql`
— từ bản 6.52, chưa có trong bản gửi trước đó nếu bạn đang cầm file cũ.)

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

**Lỗi thường gặp — `Failed to connect ... self-signed certificate`**: máy
chủ SQL Server đang dùng chứng chỉ TỰ KÝ (rất phổ biến với server nội bộ
không mua chứng chỉ CA công cộng) — mặc định script BẬT mã hoá kết nối
nhưng KHÔNG tin chứng chỉ tự ký. Thêm 1 dòng vào `.env` rồi chạy lại:
```
DSMART16_TRUST_CERT=true
```
(1 biến DUY NHẤT áp dụng cho CẢ 2 nguồn Live/Lịch sử — script hiện KHÔNG có
biến riêng cho từng bên. Nếu sau này 2 CSDL nằm ở 2 server khác nhau và chỉ
1 bên tự ký chứng chỉ, phải sửa thêm code mới tách được — báo lại nếu gặp
đúng trường hợp này.)

> ⚠️ **Nếu đã từng chạy `seedLdtdHcrcReports.js` TRƯỚC bản 6.51 — PHẢI CHẠY
> LẠI ít nhất 1 lần** dù không đổi gì ở DSMART16. Bản 6.51 đổi NỘI DUNG
> script này (thêm `targetGranularity: "day"` cho đúng chỉ tiêu theo ngày)
> — script UPDATE ghi đè TOÀN BỘ cấu hình báo cáo mỗi lần chạy, nên chỉ
> deploy code mới (`git pull` + `pm2 restart rp-server`) KHÔNG tự cập nhật
> báo cáo đã tạo từ trước — phải chạy lại đúng lệnh ở mục 2.2 để ghi đè lại.

---

## 3. Script SQL (`dwh/grants.sql`) — chạy trên CSDL DWH (khác CSDL `etl` ở mục 1)

**Mục đích**: cấp quyền cho các tài khoản CSDL dùng chung giữa etl/rp-server/
api-server trên CSDL Data Warehouse (DWH) — KHÔNG BẮT BUỘC cho mọi bản, chỉ
cần chạy khi file này có thay đổi (xem `VERSION.md`, tìm dòng nhắc tới
`dwh/grants.sql`). **Từ bản 6.52**: thêm 1 quyền ĐỌC (`GRANT SELECT ON
dwh.ReportFacts TO dwh_target_importer`) để tính năng "cảnh báo mã siêu thị
sai khi nhập chỉ tiêu LDTD/HCRC" hoạt động.

**Có bắt buộc không?** KHÔNG bắt buộc để hệ thống chạy được — thiếu quyền
này chỉ khiến tính năng cảnh báo im lặng không hiện gì (import chỉ tiêu vẫn
thành công bình thường, chỉ mất cảnh báo). Khuyến nghị chạy để tận dụng đủ
tính năng.

**Cách chạy** (giống mục 1, nhưng chọn đúng CSDL DWH — thường tên
`HCRC_DWH`, khác CSDL `etl`):
1. Mở SSMS → Connect vào server chứa CSDL DWH → chọn đúng CSDL đó (xem
   dòng `USE HCRC_DWH;` đầu file `dwh/grants.sql` để biết tên CSDL thật).
2. Mở file `dwh/grants.sql` → chọn hết → copy → dán vào Query mới → **Execute**.
3. An toàn chạy lại toàn bộ file (mọi `CREATE LOGIN`/`CREATE USER` đều kiểm
   tra tồn tại trước, không reset mật khẩu tài khoản đã có) — không cần tách
   riêng dòng `GRANT` mới, chạy nguyên file như lần đầu là đủ.

> Cần quyền `sa`/`db_owner` trên CSDL DWH để chạy (khác tài khoản CHỈ ĐỌC
> dùng ở mục 2.1) — nhờ DBA chạy giúp nếu không có quyền này.

---

## Bảng tóm tắt nhanh

| | Script SQL (mục 1) | Script Node (mục 2) | Script SQL (mục 3) |
|---|---|---|---|
| File | `etl-db/schema.sql` | `etl/scripts/seedLdtdHcrcSync.js`, `rp-server/scripts/seedLdtdHcrcReports.js` | `dwh/grants.sql` |
| Chạy bằng | SSMS hoặc `sqlcmd` | `node <file>.js` | SSMS hoặc `sqlcmd` |
| Chạy ở đâu | Trực tiếp trên SQL Server (CSDL `etl`) | Máy có Node.js + kết nối mạng tới DSMART16 | Trực tiếp trên SQL Server (CSDL DWH) |
| Khi nào cần | Sau mỗi lần code có đổi `etl-db/schema.sql` (xem `VERSION.md`) | Sau khi tạo/sửa VIEW DSMART16, hoặc đổi tài khoản/địa chỉ kết nối, **hoặc sau bản 6.51 dù đã chạy trước đó** | Chỉ khi `dwh/grants.sql` có đổi (xem `VERSION.md`) — không bắt buộc, chỉ ảnh hưởng 1 tính năng cảnh báo |
| Chạy lại nhiều lần | An toàn | An toàn | An toàn |
