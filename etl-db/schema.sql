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

-- Nhật ký THAO TÁC (ai làm gì) — khác etl.SyncLog (log CHẠY JOB tự động).
-- Ghi qua lib/auditLog.js, gắn ở mọi route sửa dữ liệu trên etl-admin/ +
-- đăng nhập (thành công lẫn thất bại). Cùng khuôn với app.AuditLog bên
-- rp-server (rp-db/schema.sql) — cố ý lặp lại, không dùng chung bảng/service
-- (mỗi hệ thống tự viết vào CSDL riêng của mình, xem etl/lib/auditLog.js).
IF OBJECT_ID('admin.AuditLog', 'U') IS NULL
BEGIN
    CREATE TABLE admin.AuditLog (
        Id           BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        UserId       INT           NULL REFERENCES admin.AdminUsers(Id),
        Username     NVARCHAR(50)  NOT NULL,
        Module       VARCHAR(50)   NOT NULL,
        ActionType   VARCHAR(100)  NOT NULL,
        TargetObject NVARCHAR(200) NULL,
        Description  NVARCHAR(MAX) NOT NULL,
        IpAddress    VARCHAR(100)  NULL,
        Status       VARCHAR(20)   NOT NULL DEFAULT 'SUCCESS',
        CreatedAt    DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_AuditLog_CreatedAt ON admin.AuditLog(CreatedAt DESC);
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

-- ĐÃ NGỪNG DÙNG (từ bản gỡ tính năng "Ánh xạ mã chi nhánh" — xem VERSION.md)
-- — etl/jobs/runSync.js/etl/lib/tableSyncEngine.js KHÔNG còn đọc cột này
-- nữa, EntityCode luôn giữ nguyên mã gốc từ nguồn. Giữ lại cột (không ALTER
-- DROP) chỉ để không phải đụng dữ liệu cũ trên các bản cài đã chạy trước
-- đây — an toàn để bỏ qua/NULL hoá, không ảnh hưởng gì tới đồng bộ.
IF COL_LENGTH('etl.SyncJobs', 'BranchCodeMapType') IS NULL
BEGIN
    ALTER TABLE etl.SyncJobs ADD BranchCodeMapType VARCHAR(50) NULL;
END
GO

-- ĐÃ NGỪNG DÙNG (từ bản gỡ tính năng "Ánh xạ mã chi nhánh" — xem VERSION.md)
-- — không còn route/UI/code nào đọc hoặc ghi bảng này nữa (thay bằng
-- etl.DiemStkMapping bên dưới, áp dụng ở TẦNG BÁO CÁO thay vì lúc đồng bộ).
-- Giữ lại bảng (không DROP) chỉ để không mất dữ liệu lịch sử trên các bản
-- cài đã dùng tính năng này trước đây — an toàn để trống, không cần dọn.
--
-- (Lịch sử: từng dùng để quy đổi 1 chi nhánh có NHIỀU mã khác nhau tuỳ bảng
-- nguồn — vd DSMART16: bảng doanh thu/tồn kho dùng STK_ID, bảng giao dịch
-- dùng BU_ID — về cùng 1 EntityCode chuẩn trước khi ghi dwh.ReportFacts. Bị
-- bỏ vì chỉ giữ được ĐÚNG 1 mã chuẩn/mã gốc, không phân biệt được theo thời
-- điểm — sai khi 1 chi nhánh đổi mã kho theo thời gian.)
IF OBJECT_ID('etl.BranchCodeMap', 'U') IS NULL
BEGIN
    CREATE TABLE etl.BranchCodeMap (
        Id          INT           IDENTITY(1,1) NOT NULL PRIMARY KEY,
        LoaiMaKhac  VARCHAR(50)   NOT NULL,
        MaKhac      NVARCHAR(50)  NOT NULL,
        MaChuan     NVARCHAR(100) NOT NULL,
        TenSieuThi  NVARCHAR(200) NULL,
        TrangThai   VARCHAR(20)   NULL,
        ImportedAt  DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
        ImportedBy  NVARCHAR(50)  NULL,
        CONSTRAINT UX_BranchCodeMap_Loai_MaKhac UNIQUE (LoaiMaKhac, MaKhac)
    );
END
GO

-- Ánh xạ "mã Điểm" (BU_ID, dùng NGUYÊN VẸN trong file chỉ tiêu LDTD/HCRC —
-- KHÔNG đổi gì file chỉ tiêu) sang 1 hoặc NHIỀU mã kho STK_ID thật trong
-- dwh.ReportFacts — khác hẳn etl.BranchCodeMap ở trên (1 mã gốc <-> ĐÚNG 1
-- mã chuẩn): 1 mã Điểm có thể gộp NHIỀU kho STK_ID (kho là khái niệm ẢO
-- trong phần mềm, không phải vật lý — 1 siêu thị vẫn CHỈ 1 diện tích), và
-- tập kho DÙNG ĐỂ TÍNH THAY ĐỔI THEO KỲ: "MaStkCu" cho kỳ QUÁ KHỨ/cùng kỳ
-- năm trước, "MaStkMoi" cho kỳ HIỆN TẠI — do mã kho có thể đổi theo thời
-- gian trong lúc mã Điểm (BU_ID) không đổi (rp-server/lib/compositeReportRunner.js
-- dùng đúng tập nào theo dateOffsetYears của từng khối, xem
-- lib/diemStkMapping.js phía rp-server). NHIỀU mã trong 1 ô, cách nhau dấu
-- phẩy (KHÔNG dấu cách) — theo đúng yêu cầu người dùng để dễ khai/dễ đọc
-- trong Excel hơn là tách nhiều dòng.
--
-- MaStkCu/MaStkMoi CÓ THỂ để trống (siêu thị mới mở chưa từng có kho cũ,
-- hoặc đã đóng không còn kho mới) — rp-server coi là "không có dữ liệu" cho
-- đúng kỳ đó, KHÔNG báo lỗi/không hiện số 0.
--
-- RÀNG BUỘC NGHIỆP VỤ (đã xác nhận với người dùng): 1 mã STK_ID chỉ thuộc
-- ĐÚNG 1 mã Điểm — vì mã Điểm SINH RA mã STK_ID nên về lý thuyết KHÔNG BAO
-- GIỜ trùng giữa 2 mã Điểm khác nhau — ràng buộc này không diễn tả được
-- bằng UNIQUE CONSTRAINT thường (giá trị nằm trong chuỗi cách-nhau-dấu-phẩy),
-- nên etl/lib/diemStkMappingImport.js tự kiểm tra và CHẶN HẲN (từ chối toàn
-- bộ file, không nhập phần nào) nếu phát hiện trùng — xem chú thích ở đó.
IF OBJECT_ID('etl.DiemStkMapping', 'U') IS NULL
BEGIN
    CREATE TABLE etl.DiemStkMapping (
        Id          INT           IDENTITY(1,1) NOT NULL PRIMARY KEY,
        MaDiem      NVARCHAR(50)  NOT NULL,
        MaStkCu     NVARCHAR(500) NULL,
        MaStkMoi    NVARCHAR(500) NULL,
        TenSieuThi  NVARCHAR(200) NULL,
        ImportedAt  DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
        ImportedBy  NVARCHAR(50)  NULL,
        CONSTRAINT UX_DiemStkMapping_MaDiem UNIQUE (MaDiem)
    );
END
GO

-- Danh sách "hàng Core" (mặt hàng BẮT BUỘC luôn phải có hàng) do admin tự
-- khai/upload — dùng cho báo cáo "Core stock = 0" (SourceType='coreZeroStock',
-- xem rp-server/lib/coreZeroStockRunner.js + hướng_dẫn_báo_cáo.md mục 14).
-- KHÁC HẲN báo cáo "Top bán chạy đang tồn kho = 0" (bc-ton-kho-0, mục 12) ở
-- chỗ danh sách mặt hàng ở ĐÂY LÀ CỐ ĐỊNH (do admin định nghĩa mặt hàng nào
-- là "Core", không tự xếp hạng theo doanh số) — áp dụng CHUNG cho MỌI kho
-- cùng loại hình (LoaiDiem='MART' hay 'MINIMART'), không khai riêng theo
-- từng kho (xác nhận của người dùng — xem VERSION.md).
--
-- MaHang (BẮT BUỘC, khớp ĐÚNG cột "Mã hàng"/SKU_CODE — CHÍNH LÀ giá trị
-- Dimensions.MaHangHienThi đã đồng bộ ở domain banhang_sku/tonkho_sku, xem
-- mục 12) là khoá dùng để LỌC dữ liệu thật — MH (mã hàng/mã vạch nội bộ
-- khác trong file nguồn DSMART16, nếu có) chỉ lưu để ĐỐI CHIẾU/tham khảo,
-- KHÔNG dùng để join dữ liệu (tránh sai nếu chưa xác nhận đúng ý nghĩa cột
-- này với DBA).
IF OBJECT_ID('etl.CoreItemList', 'U') IS NULL
BEGIN
    CREATE TABLE etl.CoreItemList (
        Id          INT           IDENTITY(1,1) NOT NULL PRIMARY KEY,
        LoaiDiem    VARCHAR(20)   NOT NULL,
        MaHang      NVARCHAR(50)  NOT NULL,
        MH          NVARCHAR(50)  NULL,
        TenHang     NVARCHAR(300) NULL,
        MaNganh     NVARCHAR(50)  NULL,
        TenNganh    NVARCHAR(200) NULL,
        ImportedAt  DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
        ImportedBy  NVARCHAR(50)  NULL,
        CONSTRAINT UX_CoreItemList_LoaiDiem_MaHang UNIQUE (LoaiDiem, MaHang),
        CONSTRAINT CK_CoreItemList_LoaiDiem CHECK (LoaiDiem IN ('MART', 'MINIMART'))
    );
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
        RowsProcessed INT          NOT NULL DEFAULT 0,   -- "RowCount" là từ khoá dành riêng của T-SQL, không đặt tên cột trùng
        ErrorMessage NVARCHAR(MAX) NULL,
        StartedAt    DATETIME2(3)  NOT NULL,
        FinishedAt   DATETIME2(3)  NOT NULL
    );
    CREATE INDEX IX_SyncLog_Job_StartedAt ON etl.SyncLog (SyncJobId, StartedAt DESC);
END
GO

-- Nhật ký VẬN HÀNH chung, KHÔNG gắn với 1 lượt chạy job cụ thể — kết nối
-- pool cố định (RP/DWH/ADMIN/DWH_TARGET_IMPORTER — xem db.js) thành công/
-- thất bại, kết nối Nguồn dữ liệu tự khai thành công/thất bại (xem
-- lib/dataSourcePool.js), cảnh báo cấu hình thiếu (vd chưa khai SMTP) —
-- những dòng trước giờ CHỈ in ra console/pm2 log, không xem lại được qua
-- web (xem lib/systemLog.js, hiển thị ở routes/admin/log.js mục "Nhật ký
-- hệ thống"). KHÁC etl.SyncLog (log CHẠY JOB, có SyncJobId/Status/
-- RowsProcessed riêng) — bảng này chỉ 3 cột phẳng, ghi TỰ DO từ bất kỳ đâu
-- trong code, không ràng buộc khoá ngoại.
IF OBJECT_ID('etl.SystemLog', 'U') IS NULL
BEGIN
    CREATE TABLE etl.SystemLog (
        Id        BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Level     VARCHAR(10)   NOT NULL,   -- 'INFO' | 'WARN' | 'ERROR'
        Message   NVARCHAR(1000) NOT NULL,
        CreatedAt DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_SystemLog_CreatedAt ON etl.SystemLog (CreatedAt DESC);
END
GO

-- Xác thực hai yếu tố (2FA/TOTP) — BẮT BUỘC cho Role='admin' (xem
-- lib/twoFactor.js + routes/admin/twoFactor.js). TwoFactorSecretEncrypted mã
-- hoá bằng ETL_ENCRYPTION_KEY (lib/crypto.js) — KHÔNG lưu plaintext.
-- TwoFactorEnabled=0 sau khi tạo tài khoản/bị admin khác "Đặt lại 2FA" ->
-- lần đăng nhập kế tiếp bị chặn ở màn đăng ký 2FA trước khi vào được gì khác.
IF COL_LENGTH('admin.AdminUsers', 'TwoFactorSecretEncrypted') IS NULL
BEGIN
    ALTER TABLE admin.AdminUsers ADD
        TwoFactorSecretEncrypted NVARCHAR(500) NULL,
        TwoFactorEnabled         BIT           NOT NULL DEFAULT 0,
        TwoFactorEnrolledAt      DATETIME2(3)  NULL;
END
GO

-- Thu hồi phiên đăng nhập (JWT) — JWT tự chứa (self-contained), verify chữ
-- ký xong là qua, KHÔNG tự phát hiện được đổi mật khẩu/gỡ 2FA/đổi vai
-- trò/khoá tài khoản cho tới khi token tự hết hạn. requireAdminAuth()
-- (lib/adminAuth.js) so claim "iat" (issued-at) của token với
-- SessionsInvalidatedAt — token phát hành TRƯỚC lần thu hồi gần nhất bị từ
-- chối dù chữ ký còn đúng. Xem lib/sessionRevocation.js.
IF COL_LENGTH('admin.AdminUsers', 'SessionsInvalidatedAt') IS NULL
BEGIN
    ALTER TABLE admin.AdminUsers ADD SessionsInvalidatedAt DATETIME2(3) NULL;
END
GO

-- Mã khôi phục dùng 1 lần (10 mã/tài khoản, hash bcrypt, hiện nguyên văn cho
-- admin đúng 1 lần lúc bật 2FA) — tự cứu được khi không có admin nào khác
-- trong etl-admin/ để nhờ "Đặt lại 2FA" (xem routes/admin/twoFactor.js).
IF OBJECT_ID('admin.AdminTwoFactorRecoveryCodes', 'U') IS NULL
BEGIN
    CREATE TABLE admin.AdminTwoFactorRecoveryCodes (
        Id         INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        AdminUserId INT          NOT NULL REFERENCES admin.AdminUsers(Id) ON DELETE CASCADE,
        CodeHash   CHAR(60)     NOT NULL, -- bcrypt
        UsedAt     DATETIME2(3) NULL,
        CreatedAt  DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_AdminTwoFactorRecoveryCodes_AdminUserId ON admin.AdminTwoFactorRecoveryCodes (AdminUserId);
END
GO

-- ===== Nhóm quyền (thay mô hình 3 Role cố định ở trên bằng nhóm quyền admin
-- tự tạo tuỳ ý — mirror app.Roles/app.RoleMenuAccess bên rp-server, xem
-- rp-db/schema.sql) =====
--
-- admin.AdminUsers.Role (cột cũ ở trên) VẪN GIỮ NGUYÊN, không xoá — từ nay
-- CHỈ còn là nhãn hiển thị/lịch sử, KHÔNG còn được đọc để quyết định quyền
-- (nguồn sự thật DUY NHẤT từ đây là admin.AdminUserRoles/RoleMenuAccess, xem
-- lib/adminPermissions.js) — seedAdmin.js/route tạo tài khoản vẫn ghi cột
-- này (tương thích ngược, tránh phải dò sửa mọi chỗ khác có thể còn đọc nó)
-- nhưng ghi ĐỒNG THỜI cả AdminUserRoles.
IF OBJECT_ID('admin.Roles', 'U') IS NULL
BEGIN
    CREATE TABLE admin.Roles (
        Id           INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Code         VARCHAR(50)   NOT NULL,
        Name         NVARCHAR(200) NOT NULL,
        IsSystemRole BIT           NOT NULL DEFAULT 0,
        CONSTRAINT UX_Roles_Code UNIQUE (Code)
    );
END
GO

IF OBJECT_ID('admin.AdminUserRoles', 'U') IS NULL
BEGIN
    CREATE TABLE admin.AdminUserRoles (
        AdminUserId INT NOT NULL REFERENCES admin.AdminUsers(Id) ON DELETE CASCADE,
        RoleId      INT NOT NULL REFERENCES admin.Roles(Id) ON DELETE CASCADE,
        CONSTRAINT PK_AdminUserRoles PRIMARY KEY (AdminUserId, RoleId)
    );
END
GO

-- MenuCode = 1 trong các trang CỐ ĐỊNH của etl-admin/ (khai trong code —
-- lib/adminPermissions.js — KHÔNG có bảng MenuItems riêng như rp-db: số
-- trang ít, cố định theo route thật, không có CRUD thêm trang mới). CanEdit
-- phân biệt "chỉ xem" (mặc định) với "xem + thêm/sửa/xoá" — giữ ĐÚNG khả
-- năng vai trò `viewer` cũ đang có (xem được nhưng không sửa), khác hẳn
-- app.RoleMenuAccess bên rp-server (ở đó chỉ có "thấy trang hay không", vì
-- rp-server không có khái niệm 1 trang vừa xem vừa sửa cho người không phải
-- admin).
IF OBJECT_ID('admin.RoleMenuAccess', 'U') IS NULL
BEGIN
    CREATE TABLE admin.RoleMenuAccess (
        RoleId   INT         NOT NULL REFERENCES admin.Roles(Id) ON DELETE CASCADE,
        MenuCode VARCHAR(50) NOT NULL,
        CanEdit  BIT         NOT NULL DEFAULT 0,
        CONSTRAINT PK_RoleMenuAccess PRIMARY KEY (RoleId, MenuCode)
    );
END
GO

-- Seed 3 nhóm quyền mặc định — khớp CHÍNH XÁC hành vi 3 Role cũ (không đổi
-- quyền của tài khoản đang chạy khi nâng cấp) — an toàn chạy lại nhiều lần.
IF NOT EXISTS (SELECT 1 FROM admin.Roles WHERE Code = 'admin')
    INSERT INTO admin.Roles (Code, Name, IsSystemRole) VALUES ('admin', N'Admin hệ thống', 1);
IF NOT EXISTS (SELECT 1 FROM admin.Roles WHERE Code = 'viewer')
    INSERT INTO admin.Roles (Code, Name, IsSystemRole) VALUES ('viewer', N'Chỉ xem', 0);
IF NOT EXISTS (SELECT 1 FROM admin.Roles WHERE Code = 'target_importer')
    INSERT INTO admin.Roles (Code, Name, IsSystemRole) VALUES ('target_importer', N'Nhập chỉ tiêu', 0);
GO

-- viewer (cũ): xem được Nguồn dữ liệu/Đồng bộ dữ liệu/Log/Nhật ký thao
-- tác/Dashboard/Tài khoản quản trị (đúng danh sách route dùng
-- blockTargetImporter cũ) — KHÔNG xem được Nhập chỉ tiêu/Ánh xạ mã chi
-- nhánh (2 trang đó trước đây chặn cả viewer, không phải chỉ target_importer).
IF NOT EXISTS (SELECT 1 FROM admin.RoleMenuAccess rma JOIN admin.Roles r ON rma.RoleId = r.Id WHERE r.Code = 'viewer')
BEGIN
    DECLARE @viewerRoleId INT = (SELECT Id FROM admin.Roles WHERE Code = 'viewer');
    INSERT INTO admin.RoleMenuAccess (RoleId, MenuCode, CanEdit)
    SELECT @viewerRoleId, v.MenuCode, 0
    FROM (VALUES ('data-sources'), ('sync-jobs'), ('log'), ('audit-log'), ('dashboard'), ('users')) AS v(MenuCode);
END
GO

-- target_importer (cũ): CHỈ trang Nhập chỉ tiêu, có sửa (đúng
-- requireTargetImporterRole cũ cho phép admin HOẶC target_importer ghi) —
-- seed CŨ, giữ nguyên để không ghi lại nếu DB đã chạy qua bản trước (dòng
-- 'sales-targets' được TÁCH thành 'sales-targets-corp'/'sales-targets-hcrc'
-- ở khối migrate NGAY DƯỚI ĐÂY, không sửa lại seed gốc này).
IF NOT EXISTS (SELECT 1 FROM admin.RoleMenuAccess rma JOIN admin.Roles r ON rma.RoleId = r.Id WHERE r.Code = 'target_importer')
BEGIN
    DECLARE @targetImporterRoleId INT = (SELECT Id FROM admin.Roles WHERE Code = 'target_importer');
    INSERT INTO admin.RoleMenuAccess (RoleId, MenuCode, CanEdit) VALUES (@targetImporterRoleId, 'sales-targets', 1);
END
GO

-- Tách trang "Nhập chỉ tiêu" (MenuCode cũ 'sales-targets') thành 2 trang ĐỘC
-- LẬP theo đúng 2 báo cáo tiêu thụ chỉ tiêu — "Lãnh đạo Tập đoàn" và "HCRC"
-- (xem routes/admin/roles.js MENU_CATALOG + routes/admin/salesTargets.js).
-- Theo YÊU CẦU RÕ của người dùng: 2 báo cáo này KHÔNG được gộp chung vai
-- trò với nhau (kể cả vai trò `target_importer` cũ) — mỗi báo cáo có 1 NHÓM
-- NGHIỆP VỤ RIÊNG quản lý/nhập liệu, không liên quan/không cùng IT quản lý
-- — nên KHÔNG tự động copy quyền cũ sang CẢ 2 trang mới (khác cách làm ban
-- đầu — xem lịch sử Git nếu cần đối chiếu). Thay vào đó: xoá sạch mọi dòng
-- RoleMenuAccess còn giữ MenuCode cũ đã hết hiệu lực, và seed 2 vai trò MỚI
-- HOÀN TOÀN, mỗi vai trò CHỈ gắn ĐÚNG 1 trong 2 trang mới.
--
-- Vai trò `target_importer` cũ giữ nguyên (không xoá, tránh vỡ tài khoản
-- đang gán) nhưng từ nay KHÔNG còn trang nào cả — admin PHẢI chủ động vào
-- "Vai trò" gán lại từng tài khoản đang có vai trò này sang ĐÚNG 1 trong 2
-- vai trò mới bên dưới theo đúng nhóm nghiệp vụ họ phụ trách (không đoán hộ
-- vì không có cơ sở để tự chọn đúng).
DELETE FROM admin.RoleMenuAccess WHERE MenuCode = 'sales-targets';

-- Đổi tên Code 'target_importer_corp' -> 'target_importer_LDTD' (viết tắt
-- "Lãnh Đạo Tập Đoàn", theo yêu cầu người dùng cho dễ phân biệt) — UPDATE
-- thay vì xoá+tạo lại để KHÔNG mất admin.AdminUserRoles/RoleMenuAccess đã
-- gán nếu DB đã chạy qua bản seed 'target_importer_corp' cũ (6.31). Chỉ
-- chạy nếu Code cũ còn tồn tại và Code mới CHƯA có (an toàn chạy lại nhiều lần).
IF EXISTS (SELECT 1 FROM admin.Roles WHERE Code = 'target_importer_corp')
   AND NOT EXISTS (SELECT 1 FROM admin.Roles WHERE Code = 'target_importer_LDTD')
    UPDATE admin.Roles SET Code = 'target_importer_LDTD' WHERE Code = 'target_importer_corp';
GO

IF NOT EXISTS (SELECT 1 FROM admin.Roles WHERE Code = 'target_importer_LDTD')
    INSERT INTO admin.Roles (Code, Name, IsSystemRole) VALUES ('target_importer_LDTD', N'Nhập chỉ tiêu - Lãnh đạo Tập đoàn', 0);
IF NOT EXISTS (SELECT 1 FROM admin.Roles WHERE Code = 'target_importer_hcrc')
    INSERT INTO admin.Roles (Code, Name, IsSystemRole) VALUES ('target_importer_hcrc', N'Nhập chỉ tiêu - HCRC', 0);
GO

IF NOT EXISTS (SELECT 1 FROM admin.RoleMenuAccess rma JOIN admin.Roles r ON rma.RoleId = r.Id WHERE r.Code = 'target_importer_LDTD')
BEGIN
    DECLARE @targetImporterLDTDRoleId INT = (SELECT Id FROM admin.Roles WHERE Code = 'target_importer_LDTD');
    INSERT INTO admin.RoleMenuAccess (RoleId, MenuCode, CanEdit) VALUES (@targetImporterLDTDRoleId, 'sales-targets-corp', 1);
END
IF NOT EXISTS (SELECT 1 FROM admin.RoleMenuAccess rma JOIN admin.Roles r ON rma.RoleId = r.Id WHERE r.Code = 'target_importer_hcrc')
BEGIN
    DECLARE @targetImporterHcrcRoleId INT = (SELECT Id FROM admin.Roles WHERE Code = 'target_importer_hcrc');
    INSERT INTO admin.RoleMenuAccess (RoleId, MenuCode, CanEdit) VALUES (@targetImporterHcrcRoleId, 'sales-targets-hcrc', 1);
END
GO

-- Migrate dữ liệu CŨ: mỗi tài khoản admin.AdminUsers đã có -> gán đúng nhóm
-- quyền tương ứng theo cột Role cũ (idempotent — chỉ thêm dòng CHƯA có).
INSERT INTO admin.AdminUserRoles (AdminUserId, RoleId)
SELECT u.Id, r.Id
FROM admin.AdminUsers u
JOIN admin.Roles r ON r.Code = u.Role
WHERE NOT EXISTS (SELECT 1 FROM admin.AdminUserRoles aur WHERE aur.AdminUserId = u.Id AND aur.RoleId = r.Id);
GO
