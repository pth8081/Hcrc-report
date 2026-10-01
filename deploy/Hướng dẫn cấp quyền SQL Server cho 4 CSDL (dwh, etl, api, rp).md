# Hướng dẫn cấp quyền SQL Server cho 4 CSDL nội bộ (dwh, etl, api, rp)

Gửi DBA/IT chạy khi: (a) dựng máy chủ SQL Server MỚI (vd đổi/khôi phục
server như đợt vừa rồi), hoặc (b) gặp lỗi kiểu *"The SELECT/UPDATE
permission was denied on the object '...', database '...'"* — lỗi đó NGHĨA
LÀ tài khoản service đang dùng CHƯA được cấp đúng quyền trên CSDL đó, cách
sửa DUY NHẤT là chạy lại đúng file `grants.sql` tương ứng bên dưới.

File này CHỈ TỔNG HỢP LẠI 4 file `grants.sql` ĐÃ CÓ SẴN trong mã nguồn
(`dwh/grants.sql`, `etl-db/grants.sql`, `api-db/grants.sql`,
`rp-db/grants.sql`) cho dễ tra cứu/chạy liền — **4 file đó mới là nguồn
chuẩn**, sửa quyền thì sửa ở đó, không sửa riêng ở đây.

---

## 0. Tổng quan — 7 tài khoản CSDL, service nào dùng tài khoản nào

| Tài khoản | Nằm ở CSDL | Service dùng | Phạm vi quyền |
|---|---|---|---|
| `etl_writer` | `HCRC_DWH` | `etl` (đồng bộ dữ liệu) | ĐỌC+GHI toàn bộ schema `dwh` |
| `rpt_reader` | `HCRC_DWH` | `rp-server` + `api-server` (dùng CHUNG 1 tài khoản) | CHỈ ĐỌC toàn bộ schema `dwh` |
| `dwh_target_importer` | `HCRC_DWH` | `etl` (riêng route "Nhập chỉ tiêu") | CHỈ `dwh.SalesTargets` (đọc+ghi) + CHỈ ĐỌC `dwh.ReportFacts` |
| `etl_admin` | `HCRC_ETL` | `etl` | ĐỌC+GHI schema `admin` + schema `etl` |
| `etl_diem_stk_reader` | `HCRC_ETL` | `rp-server` (tuỳ chọn — chỉ cần nếu dùng Ánh xạ Điểm/Core) | CHỈ ĐỌC `etl.DiemStkMapping` + `etl.CoreItemList` |
| `api_admin` | `HCRC_API` | `api-server` | ĐỌC+GHI schema `admin` + schema `api` |
| `rp_app` | `HCRC_RP` | `rp-server` | ĐỌC+GHI schema `app` |

**Quy tắc chung của cả 4 file**: mỗi service CHỈ được cấp đúng những gì nó
thật sự cần (least privilege) — `rp-server`/`api-server` không bao giờ được
GHI vào `dwh`, không service nào được đụng vào CSDL quản trị của service
khác. Mật khẩu mẫu trong cả 4 file là `DOI-MAT-KHAU-NAY-THANH-GIA-TRI-NGAU-NHIEN-THAT`
— **BẮT BUỘC đổi thành mật khẩu thật trước khi chạy**, và mật khẩu đó phải
khớp ĐÚNG với biến `*_PASSWORD` tương ứng trong file `.env` của service dùng
tài khoản đó (xem cột ".env" ở mục 2).

**KHÔNG liên quan tới `etl_reader`**: đó là tên tài khoản QUY ƯỚC cho các
kết nối CHỈ ĐỌC tới 35 CSDL DSMART16 của TỪNG CỬA HÀNG "Thành viên" (nguồn
dữ liệu bên ngoài, khai qua etl-admin → Nguồn dữ liệu) — hoàn toàn khác 7
tài khoản nội bộ ở trên, DBA của từng cửa hàng tự tạo/cấp quyền riêng, không
nằm trong phạm vi file này.

---

## 1. Thứ tự chạy (dựng CSDL mới từ đầu)

1. Tạo 4 CSDL rỗng: `CREATE DATABASE HCRC_DWH; CREATE DATABASE HCRC_ETL; CREATE DATABASE HCRC_API; CREATE DATABASE HCRC_RP;`
2. Chạy 4 file schema (tạo bảng): `dwh/schema.sql`, `etl-db/schema.sql`, `api-db/schema.sql`, `rp-db/schema.sql`.
3. Chạy 4 file quyền (mục 2 bên dưới) — **đã đổi mật khẩu thật**.
4. Điền đúng mật khẩu đó vào `.env` của từng service (`etl/.env`,
   `rp-server/.env`, `api-server/.env`) — biến tương ứng liệt kê ở mục 2.
5. Restart service (`pm2 restart etl rp-server api-server`).

**Chỉ cần sửa lỗi quyền trên CSDL đã có sẵn dữ liệu** (vd dựng lại server
mới, phục hồi từ backup): bỏ qua bước 1-2, chạy thẳng bước 3 — cả 4 file
`grants.sql` AN TOÀN CHẠY LẠI NHIỀU LẦN (tự kiểm tra `IF NOT EXISTS` trước
khi tạo login/user, chạy lại không báo lỗi "đã tồn tại").

---

## 2. SQL cụ thể từng CSDL

### 2.1. `HCRC_DWH` — file `dwh/grants.sql`

Dùng cho: `etl` (biến `DWH_USER`/`DWH_PASSWORD`), `etl`
(`DWH_TARGET_IMPORTER_USER`/`_PASSWORD`), `rp-server` (`DWH_USER`/`DWH_PASSWORD`),
`api-server` (`DWH_USER`/`DWH_PASSWORD`).

```sql
USE HCRC_DWH;
GO

-- ===== etl_writer — ETL ghi dwh.ReportFacts =====
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'etl_writer')
BEGIN
    CREATE LOGIN etl_writer WITH PASSWORD = '<MAT_KHAU_THAT_1>';
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'etl_writer')
BEGIN
    CREATE USER etl_writer FOR LOGIN etl_writer;
END
GO
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dwh TO etl_writer;
GO

-- ===== rpt_reader — rp-server + api-server chỉ đọc =====
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'rpt_reader')
BEGIN
    CREATE LOGIN rpt_reader WITH PASSWORD = '<MAT_KHAU_THAT_2>';
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'rpt_reader')
BEGIN
    CREATE USER rpt_reader FOR LOGIN rpt_reader;
END
GO
GRANT SELECT ON SCHEMA::dwh TO rpt_reader;
GO

-- ===== dwh_target_importer — CHỈ nhập chỉ tiêu, CHỈ đúng 1 bảng =====
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'dwh_target_importer')
BEGIN
    CREATE LOGIN dwh_target_importer WITH PASSWORD = '<MAT_KHAU_THAT_3>';
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'dwh_target_importer')
BEGIN
    CREATE USER dwh_target_importer FOR LOGIN dwh_target_importer;
END
GO
GRANT SELECT, INSERT, UPDATE ON dwh.SalesTargets TO dwh_target_importer;
GRANT SELECT ON dwh.ReportFacts TO dwh_target_importer;
GO
```

> Lỗi *"The UPDATE permission was denied on the object 'SalesTargets',
> database 'HCRC_DWH'"* (đã gặp thật) nghĩa là đoạn `dwh_target_importer`
> ở trên CHƯA được chạy trên server đang dùng, hoặc mật khẩu trong `.env`
> của `etl` không khớp mật khẩu thật đã đặt — chạy lại đúng đoạn này rồi
> đối chiếu `.env` (biến `DWH_TARGET_IMPORTER_USER`/`DWH_TARGET_IMPORTER_PASSWORD`).

### 2.2. `HCRC_ETL` — file `etl-db/grants.sql`

Dùng cho: `etl` (biến `ADMIN_USER`/`ADMIN_PASSWORD`), `rp-server` TUỲ CHỌN
(biến `ETL_DIEM_STK_USER`/`ETL_DIEM_STK_PASSWORD` — chỉ cần nếu có báo cáo
dùng Ánh xạ Điểm/Danh sách hàng Core).

```sql
USE HCRC_ETL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'etl_admin')
BEGIN
    CREATE LOGIN etl_admin WITH PASSWORD = '<MAT_KHAU_THAT_4>';
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'etl_admin')
BEGIN
    CREATE USER etl_admin FOR LOGIN etl_admin;
END
GO
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::admin TO etl_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::etl TO etl_admin;
GO

-- ===== etl_diem_stk_reader — rp-server CHỈ đọc etl.DiemStkMapping/CoreItemList =====
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'etl_diem_stk_reader')
BEGIN
    CREATE LOGIN etl_diem_stk_reader WITH PASSWORD = '<MAT_KHAU_THAT_5>';
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'etl_diem_stk_reader')
BEGIN
    CREATE USER etl_diem_stk_reader FOR LOGIN etl_diem_stk_reader;
END
GO
GRANT SELECT ON etl.DiemStkMapping TO etl_diem_stk_reader;
GRANT SELECT ON etl.CoreItemList TO etl_diem_stk_reader;
GO
```

### 2.3. `HCRC_API` — file `api-db/grants.sql`

Dùng cho: `api-server` (biến `ADMIN_USER`/`ADMIN_PASSWORD`).

```sql
USE HCRC_API;
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'api_admin')
BEGIN
    CREATE LOGIN api_admin WITH PASSWORD = '<MAT_KHAU_THAT_6>';
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'api_admin')
BEGIN
    CREATE USER api_admin FOR LOGIN api_admin;
END
GO
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::admin TO api_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::api TO api_admin;
GO
```

### 2.4. `HCRC_RP` — file `rp-db/grants.sql`

Dùng cho: `rp-server` (biến `RP_USER`/`RP_PASSWORD`).

```sql
USE HCRC_RP;
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'rp_app')
BEGIN
    CREATE LOGIN rp_app WITH PASSWORD = '<MAT_KHAU_THAT_7>';
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'rp_app')
BEGIN
    CREATE USER rp_app FOR LOGIN rp_app;
END
GO
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::app TO rp_app;
GO
```

---

## 3. Đối chiếu với `.env` — bảng tra nhanh

| File `.env` | Biến `*_USER` | Biến `*_PASSWORD` | Phải khớp tài khoản |
|---|---|---|---|
| `etl/.env` | `DWH_USER` | `DWH_PASSWORD` | `etl_writer` |
| `etl/.env` | `DWH_TARGET_IMPORTER_USER` | `DWH_TARGET_IMPORTER_PASSWORD` | `dwh_target_importer` |
| `etl/.env` | `ADMIN_USER` | `ADMIN_PASSWORD` | `etl_admin` |
| `rp-server/.env` | `RP_USER` | `RP_PASSWORD` | `rp_app` |
| `rp-server/.env` | `DWH_USER` | `DWH_PASSWORD` | `rpt_reader` |
| `rp-server/.env` | `ETL_DIEM_STK_USER` | `ETL_DIEM_STK_PASSWORD` | `etl_diem_stk_reader` |
| `api-server/.env` | `DWH_USER` | `DWH_PASSWORD` | `rpt_reader` |
| `api-server/.env` | `ADMIN_USER` | `ADMIN_PASSWORD` | `api_admin` |

Sai 1 trong 2 (login chưa cấp quyền ĐÚNG ở CSDL, hoặc mật khẩu trong `.env`
không khớp) đều gây lỗi tương tự — kiểm tra CẢ HAI khi gặp lỗi kết nối/lỗi
quyền.

---

## 4. Kiểm tra lại quyền đã cấp đúng chưa (chẩn đoán)

Chạy trên ĐÚNG CSDL đang nghi ngờ (`USE HCRC_DWH;` trước, ví dụ), đăng nhập
bằng tài khoản `sa`/admin (không phải tài khoản service):

```sql
-- 1. Login có tồn tại ở cấp SERVER không?
SELECT name, is_disabled FROM sys.server_principals WHERE name = 'dwh_target_importer';

-- 2. User có được tạo ở cấp CSDL hiện tại không?
SELECT name FROM sys.database_principals WHERE name = 'dwh_target_importer';

-- 3. User này đang có quyền gì THẬT SỰ trên đúng bảng hay nghi ngờ?
--    (EXECUTE AS giả lập "nhìn bằng mắt" tài khoản đó, REVERT trả lại quyền sa)
EXECUTE AS USER = 'dwh_target_importer';
SELECT * FROM fn_my_permissions('dwh.SalesTargets', 'OBJECT');
REVERT;
```

Cột `permission_name` ở câu cuối phải thấy `SELECT`/`INSERT`/`UPDATE` cho
đúng bảng đang kiểm tra — thiếu dòng nào nghĩa là GRANT tương ứng chưa chạy
(chạy lại đúng đoạn SQL ở mục 2).

---

## 5. Lưu ý khi dựng lại/di chuyển sang máy chủ SQL Server MỚI

Đây là tình huống đã gặp thật (restore CSDL `dwh` từ máy test sang server
mới): **restore/copy riêng file dữ liệu KHÔNG mang theo login cấp SERVER**
(login nằm ở CSDL hệ thống `master`, không nằm trong file `.bak`/`.mdf` của
`HCRC_DWH`) — server mới LUÔN cần chạy lại ĐỦ CẢ 4 file `grants.sql` ở mục 2,
kể cả khi CSDL đã có sẵn dữ liệu đầy đủ. Thiếu bước này là nguyên nhân phổ
biến nhất của lỗi *"permission was denied"* ngay sau khi chuyển server.
