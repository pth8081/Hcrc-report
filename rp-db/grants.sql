/* rp-db/grants.sql — MẪU quyền hạn chế tối thiểu (least privilege) cho CSDL
   quản trị Report Server (HCRC_RP). KHÔNG tự chạy trong quy trình cài đặt
   (khác schema.sql) — DBA/operator xem lại, ĐỔI MẬT KHẨU thật, rồi mới chạy
   tay trên CSDL HCRC_RP. An toàn chạy lại nhiều lần.

   1 tài khoản duy nhất khớp rp-server/.env.example (RP_USER=rp_app) — tiến
   trình rp-server/ ĐỌC LẪN GHI toàn bộ schema app.* (người dùng/vai trò,
   danh mục báo cáo, nguồn dữ liệu báo cáo, kết nối tới api-server
   (app.ApiConnections), kết nối hệ thống ngoài (app.ExternalApiConnections),
   lịch gửi email báo cáo, nhật ký thao tác admin).

   LƯU Ý: rp_app KHÔNG cần và KHÔNG nên có quyền gì trên các nguồn dữ liệu
   THẬT mà admin cấu hình trong app.ReportDataSources (CSDL OLTP nguồn cho
   báo cáo trực tiếp, nếu có) — những kết nối đó dùng tài khoản CHỈ ĐỌC riêng
   do admin tự khai qua rp-user/, không liên quan gì tới login rp_app ở đây.
   Quyền đọc dwh.ReportFacts đã cấp riêng qua dwh/grants.sql (tài khoản
   rpt_reader), KHÔNG lặp lại ở đây. */

USE HCRC_RP;
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'rp_app')
BEGIN
    CREATE LOGIN rp_app WITH PASSWORD = 'DOI-MAT-KHAU-NAY-THANH-GIA-TRI-NGAU-NHIEN-THAT';
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'rp_app')
BEGIN
    CREATE USER rp_app FOR LOGIN rp_app;
END
GO
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::app TO rp_app;
GO
