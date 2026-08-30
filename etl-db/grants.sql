/* etl-db/grants.sql — MẪU quyền hạn chế tối thiểu (least privilege) cho CSDL
   quản trị ETL (HCRC_ETL). KHÔNG tự chạy trong quy trình cài đặt (khác
   schema.sql) — DBA/operator xem lại, ĐỔI MẬT KHẨU thật, rồi mới chạy tay
   trên CSDL HCRC_ETL. An toàn chạy lại nhiều lần.

   1 tài khoản duy nhất khớp etl/.env.example (ADMIN_USER=etl_admin) — tiến
   trình etl/ ĐỌC LẪN GHI cả 2 schema (admin.AdminUsers cho đăng nhập trang
   quản trị, etl.* cho DataSources/SyncJobs/SyncState/SyncLog), không tách
   quyền đọc/ghi riêng vì cùng 1 tiến trình luôn cần cả hai.

   LƯU Ý: etl_admin KHÔNG cần và KHÔNG nên có quyền gì trên các nguồn dữ liệu
   THẬT mà admin cấu hình trong etl.DataSources (các CSDL OLTP nguồn của
   từng chi nhánh/siêu thị) — những kết nối đó dùng tài khoản CHỈ ĐỌC riêng
   do admin tự khai khi tạo DataSource qua etl-admin/, không liên quan gì
   tới login etl_admin ở đây (đó là tài khoản cho CSDL QUẢN TRỊ của chính
   ETL, không phải nguồn dữ liệu ETL đi đồng bộ). */

USE HCRC_ETL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'etl_admin')
BEGIN
    CREATE LOGIN etl_admin WITH PASSWORD = 'DOI-MAT-KHAU-NAY-THANH-GIA-TRI-NGAU-NHIEN-THAT';
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
