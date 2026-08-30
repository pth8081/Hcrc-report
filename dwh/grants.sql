/* dwh/grants.sql — MẪU quyền hạn chế tối thiểu (least privilege) cho CSDL
   Data Warehouse (HCRC_DWH). KHÔNG tự chạy trong quy trình cài đặt (khác
   schema.sql) — DBA/operator xem lại, ĐỔI MẬT KHẨU thật, rồi mới chạy tay
   trên CSDL HCRC_DWH. An toàn chạy lại nhiều lần (mọi CREATE LOGIN/USER đều
   kiểm tra tồn tại trước).

   3 tài khoản khớp đúng các biến *_USER trong .env.example của 3 service:
     - etl_writer  (etl/.env.example      DWH_USER) — ETL: GHI dwh.ReportFacts
                    (upsert theo SourceSystem+Domain+EntityCode — cần cả
                    SELECT để so khớp trước khi UPDATE/INSERT).
     - rpt_reader  (rp-server/.env.example DWH_USER,
                    api-server/.env.example DWH_USER) — CHỈ ĐỌC, dùng CHUNG
                    cho cả 2 service vì cả 2 chỉ SELECT dwh.ReportFacts, không
                    ghi gì. Nếu muốn tách quyền/nhật ký theo từng service
                    riêng, tạo 2 login CÙNG quyền SELECT thay vì dùng chung.

   KHÔNG cấp quyền gì trên các CSDL khác (HCRC_ETL/HCRC_API/HCRC_RP) — mỗi
   service chỉ được biết CSDL của chính mình + CSDL DWH theo đúng vai trò ở
   trên, không có quyền vượt biên. */

USE HCRC_DWH;
GO

-- ===== etl_writer — ETL ghi dwh.ReportFacts =====
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'etl_writer')
BEGIN
    CREATE LOGIN etl_writer WITH PASSWORD = 'DOI-MAT-KHAU-NAY-THANH-GIA-TRI-NGAU-NHIEN-THAT';
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
    CREATE LOGIN rpt_reader WITH PASSWORD = 'DOI-MAT-KHAU-NAY-THANH-GIA-TRI-NGAU-NHIEN-THAT';
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'rpt_reader')
BEGIN
    CREATE USER rpt_reader FOR LOGIN rpt_reader;
END
GO
GRANT SELECT ON SCHEMA::dwh TO rpt_reader;
GO
