/* api-db/grants-dsmart16-voucher.sql — MẪU quyền hạn chế tối thiểu (least
   privilege) cho tài khoản SQL Server kết nối tới DSMART16 (Live) dùng
   riêng cho API check/redeem voucher (api-server/lib/voucherRedeemService.js
   — xem api-voucher-check-redeem.md).

   KHÁC api-db/schema.sql/grants.sql: file NÀY chạy trên CSDL DSMART16
   (hệ POS, KHÔNG do repo này quản lý schema), KHÔNG PHẢI trên HCRC_API —
   DBA phía DSMART16 xem lại, ĐỔI MẬT KHẨU theo đúng chính sách công ty
   (mẫu dưới đây CHỈ LÀ VÍ DỤ, không dùng nguyên văn cho môi trường thật),
   rồi chạy tay trên CSDL DSMART16. An toàn chạy lại nhiều lần.

   1 tài khoản DUY NHẤT: hcrc_voucher_svc — CHỈ 2 quyền SELECT + UPDATE,
   CHỈ ĐÚNG 1 BẢNG dbo.PMCRDINF (không GRANT theo SCHEMA::dbo — tài khoản
   này KHÔNG được đọc/ghi bất kỳ bảng nào khác trong DSMART16, kể cả bảng
   liên quan doanh thu/tồn kho mà ETL đã dùng tài khoản RIÊNG khác để đồng
   bộ — xem etl-db/grants.sql). KHÔNG cấp INSERT/DELETE (voucherRedeemService.js
   chỉ cần UPDATE STATUS, không bao giờ thêm/xoá dòng PMCRDINF).

   Điền đúng tài khoản này vào api-server/.env (VOUCHER_DSMART16_USER/
   VOUCHER_DSMART16_PASSWORD) rồi chạy `npm run seed:voucher-datasource`
   (xem api-voucher-check-redeem.md Bước 4). NẾU cần đổi tên bảng schema
   thật (vd không phải "dbo" — DBA xác nhận), sửa lại GRANT bên dưới cho
   đúng, KHÔNG cần sửa gì ở code (bảng/schema chỉ ảnh hưởng câu GRANT ở
   đây, code voucherRedeemService.js dùng nguyên `PMCRDINF` không schema,
   SQL Server tự phân giải theo default schema của login — an toàn nhất
   là gán default schema = dbo cho login này, đã làm ở dưới). */

USE DSMART16;
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'hcrc_voucher_svc')
BEGIN
    CREATE LOGIN hcrc_voucher_svc WITH PASSWORD = 'DOI-MAT-KHAU-NAY-THANH-GIA-TRI-NGAU-NHIEN-THAT', CHECK_POLICY = ON;
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'hcrc_voucher_svc')
BEGIN
    CREATE USER hcrc_voucher_svc FOR LOGIN hcrc_voucher_svc WITH DEFAULT_SCHEMA = dbo;
END
GO
-- CỐ Ý GRANT theo TỪNG BẢNG (dbo.PMCRDINF), KHÔNG theo SCHEMA::dbo — tài
-- khoản này KHÔNG được đọc/ghi bất kỳ bảng nào khác trong DSMART16.
GRANT SELECT, UPDATE ON dbo.PMCRDINF TO hcrc_voucher_svc;
GO
