/* app/schema.sql — Cấu trúc bảng CSDL ứng dụng HCRC_RP (người dùng, phân
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

-- Cây menu TĨNH, khớp đúng các route thật trong frontend/ — seed một lần khi
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
-- và report-server/lib/dataSourcePool.js). PasswordEncrypted mã hoá bằng
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

-- Định nghĩa báo cáo ("Biểu mẫu") — CHUYỂN từ dwh.ReportCatalog sang đây (xem
-- ghi chú cuối dwh/schema.sql). DataSourceId NULL = dùng Data Warehouse mặc
-- định (.env của report-server), khác NULL = dùng app.ReportDataSources.
IF OBJECT_ID('app.ReportCatalog', 'U') IS NULL
BEGIN
    CREATE TABLE app.ReportCatalog (
        ReportId       VARCHAR(80)   NOT NULL PRIMARY KEY,
        Title          NVARCHAR(200) NOT NULL,
        Domain         VARCHAR(50)   NOT NULL,
        MenuItemId     INT           NOT NULL REFERENCES app.MenuItems(Id),
        DataSourceId   INT           NULL REFERENCES app.ReportDataSources(Id),
        DefinitionJson NVARCHAR(MAX) NOT NULL,
        IsActive       BIT           NOT NULL DEFAULT 1
    );
END
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

-- Seed cây menu tĩnh — khớp đúng route trong frontend/src/App.jsx. An toàn
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
GO

-- Seed vai trò Admin (IsSystemRole=1) — luôn cần tồn tại để gán cho tài khoản
-- quản trị đầu tiên (xem report-server/scripts/seedAdmin.js).
IF NOT EXISTS (SELECT 1 FROM app.Roles WHERE Code = 'admin')
    INSERT INTO app.Roles (Code, Name, IsSystemRole) VALUES ('admin', N'Quản trị hệ thống', 1);
GO
