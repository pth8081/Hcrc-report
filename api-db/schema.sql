/* api-db/schema.sql — Cấu trúc bảng CSDL HCRC_API: tài khoản quản trị API
   (admin.AdminUsers), đối tác gọi API (api.ApiConsumers), nhật ký request
   (api.RequestLog), nguồn dữ liệu OLTP cho các endpoint realtime tự định
   nghĩa (api.DataSources, api.RealtimeEndpointDefs — thay hẳn OLTP_* tĩnh
   trong .env, xem tài liệu kiến trúc "Cổng Đăng Nhập HCRC", mục 01, điểm 4).
   TÁCH RIÊNG hoàn toàn khỏi HCRC_RP và HCRC_DWH — xem tài liệu kiến trúc
   "Quản Trị API HCRC", mục 02, cho lý do tách. Giả định CSDL HCRC_API đã
   được tạo sẵn — script này chỉ tạo schema + bảng bên trong, KHÔNG tạo CSDL
   mới. An toàn chạy lại nhiều lần. */

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'admin')
BEGIN
    EXEC('CREATE SCHEMA admin');
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'api')
BEGIN
    EXEC('CREATE SCHEMA api');
END
GO

-- Tài khoản quản trị trang api-admin/. Chỉ 2 giá trị Role: 'admin' (CRUD đối
-- tác, đổi cài đặt) và 'viewer' (chỉ xem thống kê) — không cần cây menu như
-- app.MenuItems bên HCRC_RP, quy mô trang quản trị API nhỏ hơn nhiều.
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

-- Đối tác gọi API. ApiKeyHash = SHA-256 (hex, 64 ký tự) của key thật — KHÔNG
-- lưu key gốc, chỉ hiện MỘT LẦN DUY NHẤT lúc tạo/luân chuyển (xem
-- api-server/lib/adminAuth.js vì sao SHA-256 chứ không phải bcrypt như mật
-- khẩu). Scopes lưu dạng chuỗi phân tách dấu phẩy (vd "reports,realtime"),
-- khớp đúng cơ chế requireApiKey(...scopes) đã có ở lib/apiAuth.js.
IF OBJECT_ID('api.ApiConsumers', 'U') IS NULL
BEGIN
    CREATE TABLE api.ApiConsumers (
        Id                 INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Name               NVARCHAR(200) NOT NULL,
        ApiKeyHash         CHAR(64)      NOT NULL,
        Scopes             NVARCHAR(200) NOT NULL,
        RateLimitPerMinute INT           NOT NULL DEFAULT 120,
        IsActive           BIT           NOT NULL DEFAULT 1,
        CreatedAt          DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
        LastUsedAt         DATETIME2(3)  NULL,
        CONSTRAINT UX_ApiConsumers_ApiKeyHash UNIQUE (ApiKeyHash)
    );
END
GO

-- Một dòng = một lượt gọi /api/v1/*. Ghi KHÔNG CHỜ (fire-and-forget, xem
-- lib/requestLogger.js) — không được chặn đường phản hồi cho hệ thống ngoài.
-- Sẽ lớn nhanh — có job dọn định kỳ theo REQUEST_LOG_RETENTION_DAYS (xem
-- jobs/cleanupRequestLog.js).
IF OBJECT_ID('api.RequestLog', 'U') IS NULL
BEGIN
    CREATE TABLE api.RequestLog (
        Id          BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        ConsumerId  INT           NULL REFERENCES api.ApiConsumers(Id),
        Endpoint    VARCHAR(200)  NOT NULL,
        Method      VARCHAR(10)   NOT NULL,
        StatusCode  INT           NOT NULL,
        DurationMs  INT           NOT NULL,
        IpAddress   VARCHAR(100)  NULL,
        RequestedAt DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_RequestLog_RequestedAt ON api.RequestLog (RequestedAt DESC);
    CREATE INDEX IX_RequestLog_Consumer_Requested ON api.RequestLog (ConsumerId, RequestedAt DESC);
    CREATE INDEX IX_RequestLog_Endpoint_Requested ON api.RequestLog (Endpoint, RequestedAt DESC);
END
GO

-- Nguồn dữ liệu bổ sung cho các endpoint realtime (tồn kho/điểm thẻ/voucher)
-- — thay hẳn OLTP_* tĩnh trong .env. PasswordEncrypted mã hoá bằng
-- API_ENCRYPTION_KEY (AES-256-GCM, xem api-server/lib/crypto.js) — khoá
-- RIÊNG của API Server, không dùng chung với Report Server/ETL. Chỉ hỗ trợ
-- SQL Server (đúng phạm vi 3 endpoint realtime hiện tại, không cần đa
-- engine như etl.DataSources).
IF OBJECT_ID('api.DataSources', 'U') IS NULL
BEGIN
    CREATE TABLE api.DataSources (
        Id                INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Name              NVARCHAR(200) NOT NULL,
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

-- ĐÃ THAY BẰNG api.RealtimeEndpointDefs bên dưới (chỉ gán nguồn là chưa đủ —
-- mỗi endpoint giờ còn cần biết bảng/cột/khoá cụ thể). An toàn xoá: bảng này
-- chỉ lưu ánh xạ Endpoint->DataSourceId, không có dữ liệu nghiệp vụ.
IF OBJECT_ID('api.RealtimeEndpoints', 'U') IS NOT NULL
BEGIN
    DROP TABLE api.RealtimeEndpoints;
END
GO

-- Định nghĩa MỘT endpoint realtime — admin tự tạo qua api-admin/ (chọn nguồn
-- trong api.DataSources rồi duyệt bảng/cột THẬT, không gõ tay — xem
-- api-server/lib/schemaBrowser.js), không cần lập trình viên viết route mới
-- mỗi khi thêm một loại dữ liệu realtime (xem api-server/lib/realtimeEngine.js
-- cho phần chạy query động dựa vào định nghĩa này). Endpoint = 'inventory'
-- | 'loyalty' | 'vouchers' | bất kỳ tên nào khác admin đặt (chữ thường/số/
-- gạch ngang). ColumnsJson = mảng JSON tên cột hiển thị (SELECT + trả về);
-- KeyColumn dùng cho GET /v1/realtime/{endpoint}/{key} (tra 1 khoá),
-- OrderColumn dùng cho GET /v1/realtime/{endpoint}/list (phân trang).
IF OBJECT_ID('api.RealtimeEndpointDefs', 'U') IS NULL
BEGIN
    CREATE TABLE api.RealtimeEndpointDefs (
        Endpoint     VARCHAR(50)   NOT NULL PRIMARY KEY,
        Label        NVARCHAR(200) NOT NULL,
        DataSourceId INT           NOT NULL REFERENCES api.DataSources(Id),
        SchemaName   NVARCHAR(128) NOT NULL,
        TableName    NVARCHAR(128) NOT NULL,
        KeyColumn    NVARCHAR(128) NOT NULL,
        ColumnsJson  NVARCHAR(MAX) NOT NULL,
        OrderColumn  NVARCHAR(128) NOT NULL,
        IsActive     BIT           NOT NULL DEFAULT 1,
        CreatedAt    DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Danh mục báo cáo tổng hợp lộ ra qua GET /api/v1/reports/{ReportId}/run
-- (đọc dwh.ReportFacts, xem routes/v1/reports.js) — CSDL RIÊNG của API
-- Server, tự quản lý qua api-admin/, KHÔNG dùng chung với app.ReportCatalog
-- bên HCRC_RP (Report Server): API Server không đọc được HCRC_RP (cô lập DB
-- theo đúng nguyên tắc kiến trúc), và danh sách báo cáo lộ ra cho hệ thống
-- ngoài/nội bộ khác cần do admin API Server tự quyết định, không tự động
-- theo Report Server. Report Server khi cấu hình một báo cáo lấy "Qua API
-- Server" (app.ReportCatalog.SourceType = 'apiReport') phải trỏ đúng
-- ReportId đã đăng ký tại đây (ApiTarget bên app.ReportCatalog).
IF OBJECT_ID('api.ReportCatalog', 'U') IS NULL
BEGIN
    CREATE TABLE api.ReportCatalog (
        ReportId       VARCHAR(80)   NOT NULL PRIMARY KEY,
        Title          NVARCHAR(200) NOT NULL,
        Domain         VARCHAR(50)   NOT NULL,
        DefinitionJson NVARCHAR(MAX) NOT NULL,
        IsActive       BIT           NOT NULL DEFAULT 1,
        CreatedAt      DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Đối tác nào được gọi báo cáo nào — MẶC ĐỊNH KHÔNG được gọi báo cáo nào cho
-- tới khi admin gán rõ ràng ở đây (qua trang "Đối tác" trên api-admin/), dù
-- API key có scope 'reports' hợp lệ. Cùng khuôn với app.RoleReportAccess đã
-- có bên rp-server (Report Server) — chỉ đổi chủ thể từ vai trò sang đối tác
-- API. Đây là lớp kiểm soát AI ĐƯỢC GỌI CÁI GÌ; ?fields= trên
-- GET /v1/reports/:reportId/run là lớp khác — HỌ THẤY GÌ TRONG ĐÓ — 2 lớp
-- độc lập, không thay được nhau (xem routes/v1/reports.js).
IF OBJECT_ID('api.ConsumerReportAccess', 'U') IS NULL
BEGIN
    CREATE TABLE api.ConsumerReportAccess (
        ConsumerId INT         NOT NULL REFERENCES api.ApiConsumers(Id) ON DELETE CASCADE,
        ReportId   VARCHAR(80) NOT NULL REFERENCES api.ReportCatalog(ReportId) ON DELETE CASCADE,
        CONSTRAINT PK_ConsumerReportAccess PRIMARY KEY (ConsumerId, ReportId)
    );
END
GO
