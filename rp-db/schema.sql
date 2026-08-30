/* rp-db/schema.sql — Cấu trúc bảng CSDL ứng dụng HCRC_RP (người dùng, phân
   quyền, danh mục báo cáo, log, danh mục dùng chung, cấu hình email).
   TÁCH RIÊNG khỏi Data Warehouse (dwh/schema.sql) — đây là cấu hình vận hành
   ứng dụng, không phải dữ liệu nghiệp vụ để báo cáo. Giả định CSDL HCRC_RP đã
   được tạo sẵn — script này chỉ tạo schema "app" + bảng bên trong, KHÔNG tạo
   CSDL mới. An toàn chạy lại nhiều lần. */

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'app')
BEGIN
    EXEC('CREATE SCHEMA app');
END
GO

IF OBJECT_ID('app.Users', 'U') IS NULL
BEGIN
    CREATE TABLE app.Users (
        Id           INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Username     NVARCHAR(50)  NOT NULL,
        PasswordHash NVARCHAR(200) NOT NULL,
        FullName     NVARCHAR(200) NOT NULL,
        Email        NVARCHAR(200) NULL,
        IsActive     BIT           NOT NULL DEFAULT 1,
        CreatedAt    DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
        LastLoginAt  DATETIME2(3)  NULL,
        CONSTRAINT UX_Users_Username UNIQUE (Username)
    );
END
GO

-- IsSystemRole = 1 -> vai trò Admin: bỏ qua mọi kiểm tra RoleMenuAccess/
-- RoleReportAccess, luôn đủ quyền (xem lib/permissions.js) — không xoá được.
IF OBJECT_ID('app.Roles', 'U') IS NULL
BEGIN
    CREATE TABLE app.Roles (
        Id           INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Code         VARCHAR(50)   NOT NULL,
        Name         NVARCHAR(200) NOT NULL,
        IsSystemRole BIT           NOT NULL DEFAULT 0,
        CONSTRAINT UX_Roles_Code UNIQUE (Code)
    );
END
GO

IF OBJECT_ID('app.UserRoles', 'U') IS NULL
BEGIN
    CREATE TABLE app.UserRoles (
        UserId INT NOT NULL REFERENCES app.Users(Id) ON DELETE CASCADE,
        RoleId INT NOT NULL REFERENCES app.Roles(Id) ON DELETE CASCADE,
        CONSTRAINT PK_UserRoles PRIMARY KEY (UserId, RoleId)
    );
END
GO

-- Cây menu TĨNH, khớp đúng các route thật trong rp-user/ — seed một lần khi
-- cài đặt (xem cuối file), không có route CRUD cho bảng này: menu là code,
-- không phải dữ liệu người dùng tự tạo.
IF OBJECT_ID('app.MenuItems', 'U') IS NULL
BEGIN
    CREATE TABLE app.MenuItems (
        Id        INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Code      VARCHAR(50)   NOT NULL,
        ParentId  INT           NULL REFERENCES app.MenuItems(Id),
        Label     NVARCHAR(200) NOT NULL,
        Path      VARCHAR(200)  NOT NULL,
        SortOrder INT           NOT NULL DEFAULT 0,
        CONSTRAINT UX_MenuItems_Code UNIQUE (Code)
    );
END
GO

IF OBJECT_ID('app.RoleMenuAccess', 'U') IS NULL
BEGIN
    CREATE TABLE app.RoleMenuAccess (
        RoleId     INT NOT NULL REFERENCES app.Roles(Id) ON DELETE CASCADE,
        MenuItemId INT NOT NULL REFERENCES app.MenuItems(Id) ON DELETE CASCADE,
        CONSTRAINT PK_RoleMenuAccess PRIMARY KEY (RoleId, MenuItemId)
    );
END
GO

-- Nguồn dữ liệu bổ sung cho báo cáo — chỉ dùng khi MỘT báo cáo cụ thể cần đọc
-- từ máy chủ khác Data Warehouse mặc định (xem app.ReportCatalog.DataSourceId
-- và rp-server/lib/dataSourcePool.js). PasswordEncrypted mã hoá bằng
-- APP_ENCRYPTION_KEY trong .env (AES-256-GCM) — KHÔNG BAO GIỜ lưu chữ rõ.
IF OBJECT_ID('app.ReportDataSources', 'U') IS NULL
BEGIN
    CREATE TABLE app.ReportDataSources (
        Id                INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Name              NVARCHAR(200) NOT NULL,
        Server            NVARCHAR(200) NOT NULL,
        Port              INT           NOT NULL DEFAULT 1433,
        DatabaseName      NVARCHAR(100) NOT NULL,
        Username          NVARCHAR(100) NOT NULL,
        PasswordEncrypted NVARCHAR(500) NOT NULL,
        Encrypt           BIT           NOT NULL DEFAULT 1,
        TrustServerCert   BIT           NOT NULL DEFAULT 0,
        CreatedAt         DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Kết nối tới API Server — dùng khi một báo cáo lấy dữ liệu QUA API Server
-- thay vì đọc thẳng CSDL (xem app.ReportCatalog.SourceType bên dưới). Lý do
-- có bảng này riêng, không tái dùng app.ReportDataSources: đây là kết nối
-- HTTP + API key, khác hẳn kết nối SQL Server trực tiếp. ApiKeyEncrypted mã
-- hoá cùng cách (APP_ENCRYPTION_KEY, AES-256-GCM) — key gốc lấy từ trang "Đối
-- tác API" (api-admin/), cấp cho consumer tên "rp-server" với scope tương
-- ứng ('reports' và/hoặc 'realtime', xem api-server/lib/apiAuth.js).
IF OBJECT_ID('app.ApiConnections', 'U') IS NULL
BEGIN
    CREATE TABLE app.ApiConnections (
        Id              INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Name            NVARCHAR(200) NOT NULL,
        BaseUrl         NVARCHAR(300) NOT NULL,
        ApiKeyEncrypted NVARCHAR(500) NOT NULL,
        CreatedAt       DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Kết nối tới API do ĐỐI TÁC BÊN NGOÀI xây dựng — khác hẳn app.ApiConnections
-- (đó luôn là API Server CỦA CHÍNH MÌNH). Ở đây rp-server chủ động gọi RA một
-- hệ thống không do HCRC kiểm soát, nên: (1) không giả định API đó theo đúng
-- khuôn X-API-Key/HCRC — AuthType cho phép chọn cách xác thực khớp với API
-- đối tác; (2) không có health endpoint chắc chắn tồn tại để kiểm tra kết
-- nối đáng tin — xem lib/externalApiConnectionPool.js:testConnection().
--   'none'       — không xác thực (API công khai/đã whitelist theo IP).
--   'headerKey'  — 1 header tuỳ tên + giá trị (AuthKeyName/AuthValueEncrypted).
--                  Bao được cả kiểu Bearer token tĩnh: đặt AuthKeyName =
--                  'Authorization', AuthValueEncrypted = 'Bearer xxx'.
--   'queryParam' — 1 tham số query string tuỳ tên + giá trị, cùng 2 cột trên.
--   'basicAuth'  — AuthUsername + AuthPasswordEncrypted, tự dựng header
--                  "Authorization: Basic base64(user:pass)" lúc gọi.
--   'oauth2ClientCredentials' — TÁI DÙNG AuthKeyName/AuthValueEncrypted làm
--                  ClientId/ClientSecret (mã hoá) — thêm TokenUrl (endpoint
--                  đối tác cấp) để rp-server tự đổi lấy access token ngắn
--                  hạn (POST grant_type=client_credentials), tự cache + làm
--                  mới khi hết hạn, xem lib/externalApiConnectionPool.js.
--   'hmacSignature' — TÁI DÙNG AuthKeyName/AuthValueEncrypted làm
--                  KeyId/Secret (mã hoá) — rp-server tự ký mỗi request bằng
--                  HMAC-SHA256, gửi kèm X-Key-Id/X-Timestamp/X-Signature —
--                  ĐÚNG quy ước api-server dùng cho chiều ngược lại (xem
--                  api-server/lib/hmacAuth.js) nên chỉ khớp đối tác nào cũng
--                  theo quy ước này; đối tác có quy ước ký khác (tên header/
--                  thứ tự chuỗi ký khác) CHƯA hỗ trợ, cần code riêng.
IF OBJECT_ID('app.ExternalApiConnections', 'U') IS NULL
BEGIN
    CREATE TABLE app.ExternalApiConnections (
        Id                     INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Name                   NVARCHAR(200) NOT NULL,
        BaseUrl                NVARCHAR(300) NOT NULL,
        AuthType               VARCHAR(30)   NOT NULL DEFAULT 'none'
            CONSTRAINT CK_ExternalApiConnections_AuthType CHECK (AuthType IN ('none', 'headerKey', 'queryParam', 'basicAuth', 'oauth2ClientCredentials', 'hmacSignature')),
        AuthKeyName            NVARCHAR(200) NULL,  -- header/query param/ClientId/HMAC KeyId tuỳ AuthType
        AuthValueEncrypted     NVARCHAR(500) NULL,  -- giá trị/ClientSecret/HMAC secret tương ứng, mã hoá
        AuthUsername           NVARCHAR(200) NULL,  -- basicAuth
        AuthPasswordEncrypted  NVARCHAR(500) NULL,  -- basicAuth
        TokenUrl               NVARCHAR(300) NULL,  -- oauth2ClientCredentials — endpoint đối tác cấp token
        CreatedAt              DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Nâng cấp từ bản trước (bảng đã tồn tại nhưng AuthType chỉ có 4 giá trị,
-- thiếu TokenUrl) — an toàn chạy lại nhiều lần.
IF COL_LENGTH('app.ExternalApiConnections', 'TokenUrl') IS NULL
BEGIN
    ALTER TABLE app.ExternalApiConnections ADD TokenUrl NVARCHAR(300) NULL;
END
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ExternalApiConnections_AuthType')
BEGIN
    ALTER TABLE app.ExternalApiConnections DROP CONSTRAINT CK_ExternalApiConnections_AuthType;
END
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('app.ExternalApiConnections') AND name = 'AuthType' AND max_length < 30)
BEGIN
    ALTER TABLE app.ExternalApiConnections ALTER COLUMN AuthType VARCHAR(30) NOT NULL;
END
ALTER TABLE app.ExternalApiConnections ADD CONSTRAINT CK_ExternalApiConnections_AuthType
    CHECK (AuthType IN ('none', 'headerKey', 'queryParam', 'basicAuth', 'oauth2ClientCredentials', 'hmacSignature'));
GO

-- Định nghĩa báo cáo ("Biểu mẫu") — CHUYỂN từ dwh.ReportCatalog sang đây (xem
-- ghi chú cuối dwh/schema.sql). SourceType quyết định báo cáo lấy dữ liệu ở
-- đâu, 5 giá trị:
--   'directDb'    — đọc thẳng CSDL (mặc định, hành vi cũ): DataSourceId NULL
--                   = Data Warehouse mặc định (.env của rp-server), khác
--                   NULL = app.ReportDataSources. DefinitionJson.columns
--                   quyết định cột hiển thị.
--   'apiReport'   — gọi api-server GET /v1/reports/{ApiTarget}/run (báo cáo
--                   tổng hợp, không realtime — xem api.ReportCatalog bên
--                   HCRC_API). ApiConnectionId bắt buộc, ApiTarget = ReportId
--                   ĐÃ ĐĂNG KÝ bên api-server (2 danh mục độc lập, không tự
--                   động theo nhau — API Server tự quyết định báo cáo nào lộ
--                   ra ngoài). Cột hiển thị lấy từ response của api-server,
--                   không dùng DefinitionJson.columns.
--   'apiRealtime' — gọi api-server GET /v1/realtime/{ApiTarget}/list (danh
--                   sách realtime, vd tồn kho/điểm thẻ/voucher hiện tại —
--                   xem tài liệu kiến trúc). ApiTarget = tên endpoint
--                   ('inventory'|'loyalty'|'vouchers'). Cũng lấy cột từ
--                   response api-server.
--   'externalApi' — gọi THẲNG một API do đối tác bên ngoài xây dựng (KHÔNG
--                   qua api-server) — ExternalConnectionId bắt buộc (trỏ
--                   app.ExternalApiConnections). DefinitionJson thêm
--                   externalPath (đường dẫn URL, chèn được {field} từ bộ
--                   lọc), externalShape ('lookup' 1 bản ghi | 'list' nhiều
--                   dòng), externalListPath (JSON path tới mảng/object kết
--                   quả trong response, bỏ trống = lấy nguyên response).
--                   columns dùng đường dẫn JSON phẳng (vd "trangThai",
--                   "thongTin.capNhatLuc") hoặc cột công thức {key,label,formula}
--                   giống các SourceType khác — xem lib/externalReportClient.js.
--   'composite'   — ghép NHIỀU khối nguồn (blocks trong DefinitionJson)
--                   thành 1 dòng/thực thể theo entityCode, rồi mới chạy
--                   cột công thức trên dòng đã ghép — dùng khi 1 báo cáo
--                   cần trộn dữ liệu "hôm nay" (directDb hoặc apiRealtime)
--                   với "cùng kỳ năm trước" + "chỉ tiêu" (luôn directDb,
--                   đọc dwh.ReportFacts/dwh.SalesTargets). Xem
--                   lib/compositeReportRunner.js đầu file cho hình dạng
--                   DefinitionJson.blocks đầy đủ. KHÔNG dùng
--                   DefinitionJson.columns dạng field thô đơn giản như
--                   'directDb' — mọi cột nên là công thức tham chiếu
--                   "tenKhoi.field..." (dữ liệu đã lồng theo từng khối).
-- 'apiReport'/'apiRealtime'/'externalApi'/'composite' đều KHÔNG cần
-- DataSourceId ở CỘT NÀY — Report Server không tự mở thêm kết nối DB riêng
-- cho các loại này ('composite' có thể tự khai dataSourceId RIÊNG cho từng
-- khối trong DefinitionJson.blocks).
IF OBJECT_ID('app.ReportCatalog', 'U') IS NULL
BEGIN
    CREATE TABLE app.ReportCatalog (
        ReportId       VARCHAR(80)   NOT NULL PRIMARY KEY,
        Title          NVARCHAR(200) NOT NULL,
        Domain         VARCHAR(50)   NOT NULL,
        MenuItemId     INT           NOT NULL REFERENCES app.MenuItems(Id),
        DataSourceId   INT           NULL REFERENCES app.ReportDataSources(Id),
        SourceType     VARCHAR(20)   NOT NULL DEFAULT 'directDb'
            CONSTRAINT CK_ReportCatalog_SourceType CHECK (SourceType IN ('directDb', 'apiReport', 'apiRealtime', 'externalApi', 'composite')),
        ApiConnectionId INT          NULL REFERENCES app.ApiConnections(Id),
        ApiTarget       NVARCHAR(200) NULL,
        ExternalConnectionId INT     NULL REFERENCES app.ExternalApiConnections(Id),
        DefinitionJson NVARCHAR(MAX) NOT NULL,
        IsActive       BIT           NOT NULL DEFAULT 1
    );
END
GO

-- Nâng cấp từ các bản trước (bảng đã tồn tại nhưng thiếu cột/giá trị mới) —
-- an toàn chạy lại nhiều lần.
IF COL_LENGTH('app.ReportCatalog', 'SourceType') IS NULL
BEGIN
    ALTER TABLE app.ReportCatalog ADD SourceType VARCHAR(20) NOT NULL
        CONSTRAINT DF_ReportCatalog_SourceType DEFAULT 'directDb'
        CONSTRAINT CK_ReportCatalog_SourceType CHECK (SourceType IN ('directDb', 'apiReport', 'apiRealtime', 'externalApi'));
END
IF COL_LENGTH('app.ReportCatalog', 'ApiConnectionId') IS NULL
BEGIN
    ALTER TABLE app.ReportCatalog ADD ApiConnectionId INT NULL REFERENCES app.ApiConnections(Id);
END
IF COL_LENGTH('app.ReportCatalog', 'ApiTarget') IS NULL
BEGIN
    ALTER TABLE app.ReportCatalog ADD ApiTarget NVARCHAR(200) NULL;
END
IF COL_LENGTH('app.ReportCatalog', 'ExternalConnectionId') IS NULL
BEGIN
    ALTER TABLE app.ReportCatalog ADD ExternalConnectionId INT NULL REFERENCES app.ExternalApiConnections(Id);
END
-- Bản cũ tạo CK_ReportCatalog_SourceType chưa đủ giá trị mới nhất (thiếu
-- 'externalApi' và/hoặc 'composite') — xoá và tạo lại cho đủ, kể cả khi đã
-- đủ (rẻ, an toàn).
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ReportCatalog_SourceType')
BEGIN
    ALTER TABLE app.ReportCatalog DROP CONSTRAINT CK_ReportCatalog_SourceType;
END
ALTER TABLE app.ReportCatalog ADD CONSTRAINT CK_ReportCatalog_SourceType
    CHECK (SourceType IN ('directDb', 'apiReport', 'apiRealtime', 'externalApi', 'composite'));
GO

IF OBJECT_ID('app.RoleReportAccess', 'U') IS NULL
BEGIN
    CREATE TABLE app.RoleReportAccess (
        RoleId   INT         NOT NULL REFERENCES app.Roles(Id) ON DELETE CASCADE,
        ReportId VARCHAR(80) NOT NULL REFERENCES app.ReportCatalog(ReportId) ON DELETE CASCADE,
        CONSTRAINT PK_RoleReportAccess PRIMARY KEY (RoleId, ReportId)
    );
END
GO

-- Danh mục dùng chung (Phòng ban, Đơn vị tính, Loại báo cáo...) — một bảng
-- cho nhiều danh mục nhỏ, phân biệt bằng CategoryType, cùng tinh thần
-- dbo.Records của vpdt-pms — tránh tạo hàng chục bảng nhỏ lẻ cho mỗi danh mục.
IF OBJECT_ID('app.Categories', 'U') IS NULL
BEGIN
    CREATE TABLE app.Categories (
        Id           INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        CategoryType VARCHAR(50)   NOT NULL,
        Code         VARCHAR(50)   NOT NULL,
        Name         NVARCHAR(200) NOT NULL,
        ParentId     INT           NULL REFERENCES app.Categories(Id),
        SortOrder    INT           NOT NULL DEFAULT 0,
        IsActive     BIT           NOT NULL DEFAULT 1,
        CONSTRAINT UX_Categories_Type_Code UNIQUE (CategoryType, Code)
    );
END
GO

-- Thiết lập email — CHỈ một dòng (Id luôn = 1). PasswordEncrypted mã hoá cùng
-- cách với app.ReportDataSources.
IF OBJECT_ID('app.EmailSettings', 'U') IS NULL
BEGIN
    CREATE TABLE app.EmailSettings (
        Id                INT NOT NULL PRIMARY KEY CHECK (Id = 1),
        SmtpHost          NVARCHAR(200) NOT NULL,
        SmtpPort          INT           NOT NULL DEFAULT 587,
        Secure            BIT           NOT NULL DEFAULT 0,
        Username          NVARCHAR(200) NULL,
        PasswordEncrypted NVARCHAR(500) NULL,
        FromAddress       NVARCHAR(200) NOT NULL,
        FromName          NVARCHAR(200) NULL,
        UpdatedAt         DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Lịch gửi email tự động cho MỘT báo cáo cụ thể (vd "Doanh thu hàng ngày —
-- gửi 07:00 cho Ban GĐ") — dùng cấu hình SMTP chung ở app.EmailSettings.
-- FilterValuesJson lưu bộ lọc áp KHI CHẠY TỰ ĐỘNG, dạng
-- { "<field>": { "kind": "dateRangePreset", "preset": "today" } }  -- lọc
-- 'dateRange' PHẢI dùng preset TƯƠNG ĐỐI (hôm nay/7 ngày qua/...), tính lại
-- mỗi lần chạy — giá trị ngày CỐ ĐỊNH vô nghĩa với báo cáo gửi lặp lại hàng
-- ngày. Các loại lọc khác dùng { "kind": "fixed", "value": "..." } — xem
-- rp-server/lib/reportEmailFilters.js (áp dụng) và
-- rp-server/jobs/reportEmailScheduler.js (chạy lịch, node-cron).
IF OBJECT_ID('app.ReportEmailSchedules', 'U') IS NULL
BEGIN
    CREATE TABLE app.ReportEmailSchedules (
        Id               INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Name             NVARCHAR(200) NOT NULL,
        ReportId         VARCHAR(80)   NOT NULL REFERENCES app.ReportCatalog(ReportId),
        CronExpression   VARCHAR(50)   NOT NULL,
        Recipients       NVARCHAR(1000) NOT NULL,
        FilterValuesJson NVARCHAR(MAX) NULL,
        ExportFormat     VARCHAR(10)   NOT NULL DEFAULT 'excel' CHECK (ExportFormat IN ('excel', 'pdf')),
        IsActive         BIT           NOT NULL DEFAULT 1,
        CreatedBy        INT           NULL REFERENCES app.Users(Id),
        CreatedAt        DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
        LastRunAt        DATETIME2(3)  NULL,
        LastStatus       VARCHAR(20)   NULL,
        LastError        NVARCHAR(1000) NULL
    );
END
GO

IF OBJECT_ID('app.AuditLog', 'U') IS NULL
BEGIN
    CREATE TABLE app.AuditLog (
        Id           BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        UserId       INT           NULL REFERENCES app.Users(Id),
        Username     NVARCHAR(50)  NOT NULL,
        Module       VARCHAR(50)   NOT NULL,
        ActionType   VARCHAR(100)  NOT NULL,
        TargetObject NVARCHAR(200) NULL,
        Description  NVARCHAR(MAX) NOT NULL,
        IpAddress    VARCHAR(100)  NULL,
        Status       VARCHAR(20)   NOT NULL DEFAULT 'SUCCESS',
        CreatedAt    DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_AuditLog_CreatedAt ON app.AuditLog (CreatedAt DESC);
END
GO

-- Seed cây menu tĩnh — khớp đúng route trong rp-user/src/App.jsx. An toàn
-- chạy lại nhiều lần (kiểm tra Code trước khi insert từng dòng).
IF NOT EXISTS (SELECT 1 FROM app.MenuItems WHERE Code = 'home')
    INSERT INTO app.MenuItems (Code, ParentId, Label, Path, SortOrder) VALUES ('home', NULL, N'Trang chủ', '/', 1);
IF NOT EXISTS (SELECT 1 FROM app.MenuItems WHERE Code = 'dashboard')
    INSERT INTO app.MenuItems (Code, ParentId, Label, Path, SortOrder) VALUES ('dashboard', NULL, N'Dashboard', '/dashboard', 2);
IF NOT EXISTS (SELECT 1 FROM app.MenuItems WHERE Code = 'reports-kinh-doanh')
    INSERT INTO app.MenuItems (Code, ParentId, Label, Path, SortOrder) VALUES ('reports-kinh-doanh', NULL, N'Báo cáo kinh doanh', '/reports/kinh-doanh', 3);
IF NOT EXISTS (SELECT 1 FROM app.MenuItems WHERE Code = 'reports-van-hanh')
    INSERT INTO app.MenuItems (Code, ParentId, Label, Path, SortOrder) VALUES ('reports-van-hanh', NULL, N'Báo cáo vận hành', '/reports/van-hanh', 4);
IF NOT EXISTS (SELECT 1 FROM app.MenuItems WHERE Code = 'reports-mua-hang')
    INSERT INTO app.MenuItems (Code, ParentId, Label, Path, SortOrder) VALUES ('reports-mua-hang', NULL, N'Báo cáo Mua hàng', '/reports/mua-hang', 5);
IF NOT EXISTS (SELECT 1 FROM app.MenuItems WHERE Code = 'system')
    INSERT INTO app.MenuItems (Code, ParentId, Label, Path, SortOrder) VALUES ('system', NULL, N'Hệ thống', '/system', 6);
GO

IF NOT EXISTS (SELECT 1 FROM app.MenuItems WHERE Code = 'system-permissions')
    INSERT INTO app.MenuItems (Code, ParentId, Label, Path, SortOrder)
    SELECT 'system-permissions', Id, N'Phân quyền', '/system/permissions', 1 FROM app.MenuItems WHERE Code = 'system';
IF NOT EXISTS (SELECT 1 FROM app.MenuItems WHERE Code = 'system-report-catalog')
    INSERT INTO app.MenuItems (Code, ParentId, Label, Path, SortOrder)
    SELECT 'system-report-catalog', Id, N'Biểu mẫu', '/system/report-catalog', 2 FROM app.MenuItems WHERE Code = 'system';
IF NOT EXISTS (SELECT 1 FROM app.MenuItems WHERE Code = 'system-audit-log')
    INSERT INTO app.MenuItems (Code, ParentId, Label, Path, SortOrder)
    SELECT 'system-audit-log', Id, N'Log', '/system/audit-log', 3 FROM app.MenuItems WHERE Code = 'system';
IF NOT EXISTS (SELECT 1 FROM app.MenuItems WHERE Code = 'system-categories')
    INSERT INTO app.MenuItems (Code, ParentId, Label, Path, SortOrder)
    SELECT 'system-categories', Id, N'Danh mục', '/system/categories', 4 FROM app.MenuItems WHERE Code = 'system';
IF NOT EXISTS (SELECT 1 FROM app.MenuItems WHERE Code = 'system-email-settings')
    INSERT INTO app.MenuItems (Code, ParentId, Label, Path, SortOrder)
    SELECT 'system-email-settings', Id, N'Thiết lập email', '/system/email-settings', 5 FROM app.MenuItems WHERE Code = 'system';
IF NOT EXISTS (SELECT 1 FROM app.MenuItems WHERE Code = 'system-email-schedules')
    INSERT INTO app.MenuItems (Code, ParentId, Label, Path, SortOrder)
    SELECT 'system-email-schedules', Id, N'Lịch gửi email báo cáo', '/system/email-schedules', 6 FROM app.MenuItems WHERE Code = 'system';
GO

-- Seed vai trò Admin (IsSystemRole=1) — luôn cần tồn tại để gán cho tài khoản
-- quản trị đầu tiên (xem rp-server/scripts/seedAdmin.js).
IF NOT EXISTS (SELECT 1 FROM app.Roles WHERE Code = 'admin')
    INSERT INTO app.Roles (Code, Name, IsSystemRole) VALUES ('admin', N'Quản trị hệ thống', 1);
GO
