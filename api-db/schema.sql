/* api-db/schema.sql — Cấu trúc bảng CSDL HCRC_API: tài khoản quản trị API
   (admin.AdminUsers), đối tác gọi API (api.ApiConsumers), nhật ký request
   (api.RequestLog). TÁCH RIÊNG hoàn toàn khỏi HCRC_RP và HCRC_DWH — xem tài
   liệu kiến trúc "Quản Trị API HCRC", mục 02, cho lý do tách. Giả định CSDL
   HCRC_API đã được tạo sẵn — script này chỉ tạo schema + bảng bên trong,
   KHÔNG tạo CSDL mới. An toàn chạy lại nhiều lần. */

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
