/* etl-db/schema.sql — Cấu trúc bảng CSDL HCRC_ETL: tài khoản quản trị ETL
   (admin.AdminUsers), nguồn dữ liệu (etl.DataSources), cấu hình đồng bộ
   (etl.SyncJobs), trạng thái + nhật ký đồng bộ (etl.SyncState/etl.SyncLog).
   TÁCH RIÊNG hoàn toàn khỏi HCRC_RP và HCRC_API — xem tài liệu kiến trúc
   "Quản Trị ETL HCRC". etl.SyncState/etl.SyncLog CHUYỂN từ dwh/schema.sql
   sang đây (đó là trạng thái vận hành ETL, không phải dữ liệu báo cáo) —
   dwh/schema.sql giờ chỉ còn dwh.ReportFacts. Giả định CSDL HCRC_ETL đã
   được tạo sẵn — script này chỉ tạo schema + bảng bên trong, KHÔNG tạo CSDL
   mới. An toàn chạy lại nhiều lần. */

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'admin')
BEGIN
    EXEC('CREATE SCHEMA admin');
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'etl')
BEGIN
    EXEC('CREATE SCHEMA etl');
END
GO

-- Tài khoản quản trị etl-admin/. 3 giá trị Role: 'admin' (CRUD nguồn + job
-- đồng bộ, đổi tài khoản), 'viewer' (chỉ xem Dashboard/Log), và
-- 'target_importer' (CHỈ trang "Nhập chỉ tiêu" — xem
-- routes/admin/salesTargets.js, dùng tài khoản CSDL RIÊNG hẹp hơn cả
-- etl_writer, xem dwh/grants.sql — không thấy/sửa được DataSources hay
-- SyncJobs, tách biệt khỏi hạ tầng ETL thật) — cùng mô hình gọn đã dùng cho
-- api-admin, không cần cây menu như HCRC_RP.
IF OBJECT_ID('admin.AdminUsers', 'U') IS NULL
BEGIN
    CREATE TABLE admin.AdminUsers (
        Id           INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Username     NVARCHAR(50)  NOT NULL,
        PasswordHash NVARCHAR(200) NOT NULL,
        FullName     NVARCHAR(200) NOT NULL,
        Role         VARCHAR(20)   NOT NULL DEFAULT 'viewer',
        IsActive     BIT           NOT NULL DEFAULT 1,
        CreatedAt    DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
        LastLoginAt  DATETIME2(3)  NULL,
        CONSTRAINT UX_AdminUsers_Username UNIQUE (Username)
    );
END
GO

-- Máy chủ/CSDL nguồn — thay cho các biến SRC_*_... trong .env cũ.
-- PasswordEncrypted mã hoá bằng ETL_ENCRYPTION_KEY (AES-256-GCM, xem
-- etl/lib/crypto.js) — khoá RIÊNG của ETL, không dùng chung với Report/API
-- Server. Engine quyết định adapter nào xử lý nguồn này (xem etl/lib/dbAdapters/)
-- — 'mysql' dùng chung cho cả MySQL và MariaDB (cùng driver, cùng adapter).
IF OBJECT_ID('etl.DataSources', 'U') IS NULL
BEGIN
    CREATE TABLE etl.DataSources (
        Id                INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Name              NVARCHAR(200) NOT NULL,
        Engine            VARCHAR(20)   NOT NULL DEFAULT 'mssql', -- 'mssql' | 'mysql'
        Server            NVARCHAR(200) NOT NULL,
        Port              INT           NOT NULL DEFAULT 1433,
        DatabaseName      NVARCHAR(100) NOT NULL,
        Username          NVARCHAR(100) NOT NULL,
        PasswordEncrypted NVARCHAR(500) NOT NULL,
        Encrypt           BIT           NOT NULL DEFAULT 1,
        TrustServerCert   BIT           NOT NULL DEFAULT 0,
        IsActive          BIT           NOT NULL DEFAULT 1,
        CreatedAt         DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Một job = một bảng nguồn đồng bộ vào dwh.ReportFacts (Type='table',
-- KHÔNG cần code — chọn qua duyệt schema thật, xem etl/lib/schemaBrowser.js),
-- HOẶC một connector viết tay trong etl/sources/ (Type='custom' — chỉ tham
-- chiếu bằng CustomConnectorKey, không tự sinh câu SQL).
--
-- Bảng liên kết (Join*) TUỲ CHỌN — tối đa 1, bắt buộc CÙNG DataSourceId (SQL
-- Server/MySQL không nối xuyên máy chủ trong 1 câu lệnh). NULL = không nối.
IF OBJECT_ID('etl.SyncJobs', 'U') IS NULL
BEGIN
    CREATE TABLE etl.SyncJobs (
        Id                         INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Name                       NVARCHAR(200) NOT NULL,
        Type                       VARCHAR(10)   NOT NULL,   -- 'table' | 'custom'
        DataSourceId               INT           NOT NULL REFERENCES etl.DataSources(Id),

        SourceSchema               NVARCHAR(100) NULL,
        SourceTable                NVARCHAR(100) NULL,
        KeyColumn                  NVARCHAR(100) NULL,       -- -> EntityCode
        DateColumn                 NVARCHAR(100) NULL,       -- -> EventDate
        UpdatedAtColumn            NVARCHAR(100) NULL,       -- watermark đồng bộ tăng dần
        DimensionColumnsJson       NVARCHAR(MAX) NULL,       -- mảng tên cột (bảng chính) -> Dimensions
        MeasureColumnsJson         NVARCHAR(MAX) NULL,       -- mảng tên cột -> Measures

        JoinSchema                 NVARCHAR(100) NULL,
        JoinTable                  NVARCHAR(100) NULL,
        JoinType                   VARCHAR(5)    NULL,       -- 'LEFT' | 'INNER'
        MainJoinColumn             NVARCHAR(100) NULL,
        LookupJoinColumn           NVARCHAR(100) NULL,
        LookupDimensionColumnsJson NVARCHAR(MAX) NULL,       -- mảng tên cột (bảng liên kết) -> Dimensions

        CustomConnectorKey         VARCHAR(50)   NULL,       -- khớp source.key trong etl/sources/ nếu Type='custom'

        TargetDomain               VARCHAR(50)   NOT NULL,   -- dwh.ReportFacts.Domain
        CronExpression             VARCHAR(50)   NOT NULL DEFAULT '*/15 * * * *',
        IsActive                   BIT           NOT NULL DEFAULT 1,
        -- TẮT mặc định — dwh.ReportFacts vẫn ghi đè (1 dòng/thực thể) y hệt
        -- trước đây. BẬT khi domain này cần giữ lịch sử nhiều ngày (vd báo
        -- cáo cần so cùng kỳ năm trước) — mỗi EventDate khác nhau tự nhiên
        -- thành 1 dòng riêng, không bị ngày sau ghi đè. Xem etl/lib/upsert.js
        -- + dwh/schema.sql (mục nâng cấp khoá UNIQUE dwh.ReportFacts).
        KeepHistory                BIT           NOT NULL DEFAULT 0,
        CreatedAt                  DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Nâng cấp từ bản trước (bảng đã tồn tại nhưng thiếu cột KeepHistory) — an
-- toàn chạy lại nhiều lần.
IF COL_LENGTH('etl.SyncJobs', 'KeepHistory') IS NULL
BEGIN
    ALTER TABLE etl.SyncJobs ADD KeepHistory BIT NOT NULL DEFAULT 0;
END
GO

-- Chuyển từ dwh.SyncState — khoá theo SyncJobId thay vì chuỗi SourceSystem tự do.
IF OBJECT_ID('etl.SyncState', 'U') IS NULL
BEGIN
    CREATE TABLE etl.SyncState (
        SyncJobId    INT          NOT NULL PRIMARY KEY REFERENCES etl.SyncJobs(Id),
        LastSyncedAt DATETIME2(3) NOT NULL
    );
END
GO

-- Chuyển từ dwh.SyncLog.
IF OBJECT_ID('etl.SyncLog', 'U') IS NULL
BEGIN
    CREATE TABLE etl.SyncLog (
        Id           BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        SyncJobId    INT           NOT NULL REFERENCES etl.SyncJobs(Id),
        Status       VARCHAR(20)   NOT NULL,   -- 'SUCCESS' | 'FAILED'
        RowCount     INT           NOT NULL DEFAULT 0,
        ErrorMessage NVARCHAR(MAX) NULL,
        StartedAt    DATETIME2(3)  NOT NULL,
        FinishedAt   DATETIME2(3)  NOT NULL
    );
    CREATE INDEX IX_SyncLog_Job_StartedAt ON etl.SyncLog (SyncJobId, StartedAt DESC);
END
GO
