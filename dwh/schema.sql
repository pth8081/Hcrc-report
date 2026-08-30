/* dwh/schema.sql — Cấu trúc bảng Data Warehouse trung tâm HCRC
   Giả định CSDL Data Warehouse đã được tạo sẵn (ví dụ HCRC_DWH) — script này chỉ
   tạo schema "dwh" + các bảng bên trong, KHÔNG tạo CSDL mới. An toàn chạy lại
   nhiều lần (mọi CREATE đều kiểm tra tồn tại trước). */

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'dwh')
BEGIN
    EXEC('CREATE SCHEMA dwh');
END
GO

-- Bảng sự kiện trung tâm: mọi domain báo cáo nằm trong một bảng, phân biệt bằng
-- cột Domain. Dimensions/Measures lưu JSON để linh hoạt theo từng loại báo cáo;
-- SourceSystem + Domain + EntityCode là khoá nghiệp vụ dùng để upsert (xem
-- etl/lib/upsert.js). Thêm cột trích xuất PERSISTED từ JSON khi có báo cáo thực
-- sự cần lọc/nhóm nhanh theo trường đó — không thêm trước khi cần.
IF OBJECT_ID('dwh.ReportFacts', 'U') IS NULL
BEGIN
    CREATE TABLE dwh.ReportFacts (
        Id            BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        SourceSystem  VARCHAR(50)   NOT NULL,
        Domain        VARCHAR(50)   NOT NULL,
        EntityCode    NVARCHAR(100) NULL,
        EventDate     DATE          NOT NULL,
        Dimensions    NVARCHAR(MAX) NOT NULL,
        Measures      NVARCHAR(MAX) NULL,
        SyncedAt      DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UX_ReportFacts_Source_Domain_Entity
            UNIQUE (SourceSystem, Domain, EntityCode)
    );
    CREATE INDEX IX_ReportFacts_Domain_Date
        ON dwh.ReportFacts (Domain, EventDate DESC) INCLUDE (SourceSystem, EntityCode);
END
GO

-- Mốc đồng bộ gần nhất (watermark) của từng nguồn — ETL đọc trước khi extract,
-- ghi lại sau khi upsert thành công (xem etl/lib/syncState.js).
IF OBJECT_ID('dwh.SyncState', 'U') IS NULL
BEGIN
    CREATE TABLE dwh.SyncState (
        SourceSystem VARCHAR(50)  NOT NULL PRIMARY KEY,
        LastSyncedAt DATETIME2(3) NOT NULL
    );
END
GO

-- Nhật ký từng lượt chạy ETL — tra soát khi có sự cố, làm căn cứ cảnh báo email
-- (xem etl/lib/syncLog.js, etl/lib/mailer.js).
IF OBJECT_ID('dwh.SyncLog', 'U') IS NULL
BEGIN
    CREATE TABLE dwh.SyncLog (
        Id           BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        SourceSystem VARCHAR(50)   NOT NULL,
        Status       VARCHAR(20)   NOT NULL,   -- 'SUCCESS' | 'FAILED'
        RowCount     INT           NOT NULL DEFAULT 0,
        ErrorMessage NVARCHAR(MAX) NULL,
        StartedAt    DATETIME2(3)  NOT NULL,
        FinishedAt   DATETIME2(3)  NOT NULL
    );
    CREATE INDEX IX_SyncLog_Source_StartedAt ON dwh.SyncLog (SourceSystem, StartedAt DESC);
END
GO

-- LƯU Ý: dwh.ReportCatalog (định nghĩa báo cáo) đã CHUYỂN sang app.ReportCatalog
-- trong app/schema.sql (CSDL HCRC_RP) — cùng chỗ với Roles/RoleReportAccess để
-- phân quyền theo từng báo cáo JOIN được trực tiếp, không cần Linked Server.
-- dwh giờ chỉ còn thuần dữ liệu: ReportFacts, SyncState, SyncLog.
