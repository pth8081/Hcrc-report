/* api-db/grants.sql — MẪU quyền hạn chế tối thiểu (least privilege) cho CSDL
   quản trị API Server (HCRC_API). KHÔNG tự chạy trong quy trình cài đặt
   (khác schema.sql) — DBA/operator xem lại, ĐỔI MẬT KHẨU thật, rồi mới chạy
   tay trên CSDL HCRC_API. An toàn chạy lại nhiều lần.

   1 tài khoản duy nhất khớp api-server/.env.example (ADMIN_USER=api_admin) —
   tiến trình api-server/ ĐỌC LẪN GHI cả 2 schema:
     - admin.AdminUsers          — đăng nhập trang quản trị api-admin/.
     - api.ApiConsumers/…        — đối tác API, nguồn dữ liệu realtime, định
                                    nghĩa endpoint realtime, danh mục báo cáo,
                                    quyền truy cập theo đối tác, nhật ký
                                    request (api.RequestLog — ghi mỗi lượt
                                    gọi /api/v1/*).
   Không tách quyền đọc/ghi riêng vì CÙNG 1 tiến trình luôn cần cả hai
   (khác dwh/grants.sql, nơi rp-server/api-server CHỈ đọc DWH).

   LƯU Ý: api_admin KHÔNG cần và KHÔNG nên có quyền gì trên các nguồn dữ liệu
   THẬT mà admin cấu hình trong api.DataSources (CSDL OLTP nguồn cho các
   endpoint realtime) — những kết nối đó dùng tài khoản CHỈ ĐỌC riêng do
   admin tự khai khi tạo DataSource qua api-admin/, không liên quan gì tới
   login api_admin ở đây. Quyền đọc dwh.ReportFacts (cho /api/v1/reports) đã
   cấp riêng qua dwh/grants.sql (tài khoản rpt_reader dùng chung với
   rp-server), KHÔNG lặp lại ở đây. */

USE HCRC_API;
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'api_admin')
BEGIN
    CREATE LOGIN api_admin WITH PASSWORD = 'DOI-MAT-KHAU-NAY-THANH-GIA-TRI-NGAU-NHIEN-THAT';
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
