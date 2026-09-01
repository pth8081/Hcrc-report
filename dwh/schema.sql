/* dwh/schema.sql — Cấu trúc bảng Data Warehouse trung tâm HCRC.
   Giả định CSDL Data Warehouse đã được tạo sẵn (ví dụ HCRC_DWH) — script này chỉ
   tạo schema "dwh" + bảng bên trong, KHÔNG tạo CSDL mới. An toàn chạy lại
   nhiều lần (mọi CREATE đều kiểm tra tồn tại trước).

   dwh giờ CHỈ CÒN dwh.ReportFacts — thuần dữ liệu. Mọi cấu hình/trạng thái
   vận hành đã chuyển sang các CSDL quản trị riêng của từng server:
     - app.ReportCatalog (định nghĩa báo cáo)              -> HCRC_RP (rp-db/schema.sql)
     - etl.SyncState / etl.SyncLog / etl.DataSources / etl.SyncJobs
                                                              -> HCRC_ETL (etl-db/schema.sql)
   Lý do: đây là cấu hình/trạng thái vận hành của từng server, không phải dữ
   liệu báo cáo — và mỗi server tự có CSDL quản trị riêng, tách biệt hoàn
   toàn (xem tài liệu kiến trúc "Quản Trị ETL HCRC"). */

/* ===== KHUYẾN NGHỊ VẬN HÀNH: bật READ_COMMITTED_SNAPSHOT (RCSI) =====
   CHƯA tự động bật trong script này — ALTER DATABASE ... SET
   READ_COMMITTED_SNAPSHOT ON cần WITH ROLLBACK IMMEDIATE để áp dụng ngay
   (buộc huỷ MỌI giao dịch khác đang mở trên CSDL này), không an toàn chạy
   tự động trong 1 script "chạy lại nhiều lần được" như file này — DBA tự
   chạy 1 lần vào cửa sổ bảo trì, KHÔNG có kết nối nào khác đang hoạt động:

     ALTER DATABASE CURRENT SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;

   LÝ DO CẦN: etl/lib/upsert.js ghi dwh.ReportFacts bằng transaction DELETE
   (dọn lịch sử) + MERGE, có thể mang HÀNG NGHÌN dòng/lượt (xem chú thích
   đầu file đó). Mặc định SQL Server dùng khoá dòng kiểu READ COMMITTED —
   khi số khoá dòng giữ trong 1 statement vượt ngưỡng (~5000), SQL Server tự
   ĐỘNG LEO THANG lên khoá cấp TRANG/BẢNG, có thể khoá cả bảng
   dwh.ReportFacts trong suốt transaction ETL — mọi SELECT của rp-server/
   api-server (bất kỳ Domain nào khác, không chỉ domain đang đồng bộ) bị
   CHẶN/timeout đúng lúc chạy ETL đêm. RCSI cho SELECT đọc bản snapshot
   (không cần khoá, không bị writer chặn) mà KHÔNG đổi bất kỳ hành vi ghi
   nào — writer vẫn khoá như cũ, chỉ reader không còn chờ writer nữa. Đánh
   đổi: tempdb dùng nhiều hơn (lưu version store) — bảng dwh.ReportFacts
   hiện tại không lớn tới mức đáng lo, giám sát dung lượng tempdb nếu dữ
   liệu tăng nhiều về sau. */

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'dwh')
BEGIN
    EXEC('CREATE SCHEMA dwh');
END
GO

-- Bảng sự kiện trung tâm: mọi domain báo cáo nằm trong một bảng, phân biệt bằng
-- cột Domain. Dimensions/Measures lưu JSON để linh hoạt theo từng loại báo cáo;
-- SourceSystem + Domain + EntityCode + EventDate là khoá nghiệp vụ dùng để
-- upsert (xem etl/lib/upsert.js). EventDate NẰM TRONG khoá (khác thiết kế cũ
-- chỉ 3 cột đầu) để job có bật KeepHistory (etl.SyncJobs, xem etl-db/schema.sql)
-- giữ được 1 dòng RIÊNG mỗi ngày, không bị ngày sau ghi đè — job KHÔNG bật
-- KeepHistory vẫn chỉ có đúng 1 dòng/thực thể như trước, do
-- etl/lib/upsert.js tự dọn dòng khác EventDate trước khi MERGE (invariant
-- "1 dòng/thực thể" giờ đảm bảo ở TẦNG ỨNG DỤNG thay vì tầng CSDL, để 1
-- bảng phục vụ được cả 2 kiểu domain). Thêm cột trích xuất PERSISTED từ
-- JSON khi có báo cáo thực sự cần lọc/nhóm nhanh theo trường đó — không
-- thêm trước khi cần.
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
        CONSTRAINT UX_ReportFacts_Source_Domain_Entity_Date
            UNIQUE (SourceSystem, Domain, EntityCode, EventDate)
    );
    CREATE INDEX IX_ReportFacts_Domain_Date
        ON dwh.ReportFacts (Domain, EventDate DESC) INCLUDE (SourceSystem, EntityCode);
END
GO

-- Nâng cấp từ bản trước: khoá UNIQUE cũ (SourceSystem, Domain, EntityCode,
-- KHÔNG có EventDate) khiến MỌI domain đều bị ghi đè, không job nào giữ
-- được lịch sử dù bật KeepHistory. An toàn đổi cho job KeepHistory=0 (xem
-- etl/lib/upsert.js) vì code tự dọn dòng khác EventDate trước khi MERGE —
-- hành vi "1 dòng/thực thể" giữ nguyên, chỉ chuyển từ CSDL sang ứng dụng.
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UX_ReportFacts_Source_Domain_Entity')
BEGIN
    ALTER TABLE dwh.ReportFacts DROP CONSTRAINT UX_ReportFacts_Source_Domain_Entity;
END
IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UX_ReportFacts_Source_Domain_Entity_Date')
BEGIN
    ALTER TABLE dwh.ReportFacts ADD CONSTRAINT UX_ReportFacts_Source_Domain_Entity_Date
        UNIQUE (SourceSystem, Domain, EntityCode, EventDate);
END
GO

-- CHECK chống chuỗi rỗng/toàn khoảng trắng lọt vào khoá nghiệp vụ (etl job
-- cấu hình sai SourceSystem/Domain = '' vẫn PASS NOT NULL nhưng vô nghĩa,
-- vỡ mọi truy vấn lọc theo domain phía report). Không CHECK theo danh sách
-- domain cố định (enum) vì domain là do từng job etl tự đặt, không có danh
-- mục tập trung để đối chiếu — chỉ chặn rỗng, không đoán giá trị nghiệp vụ.
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ReportFacts_SourceSystem_NotEmpty')
BEGIN
    ALTER TABLE dwh.ReportFacts WITH CHECK ADD CONSTRAINT CK_ReportFacts_SourceSystem_NotEmpty
        CHECK (LEN(LTRIM(RTRIM(SourceSystem))) > 0);
END
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ReportFacts_Domain_NotEmpty')
BEGIN
    ALTER TABLE dwh.ReportFacts WITH CHECK ADD CONSTRAINT CK_ReportFacts_Domain_NotEmpty
        CHECK (LEN(LTRIM(RTRIM(Domain))) > 0);
END
GO

-- EntityCode NULL-able (khác SalesTargets.EntityCode NOT NULL bên dưới) —
-- CÓ CHỦ ĐÍCH: một số Domain là số liệu tổng hợp toàn công ty/không gắn 1
-- thực thể cụ thể (vd tổng doanh thu toàn hệ thống theo ngày), lúc đó
-- EntityCode để NULL hợp lệ. SQL Server coi 2 giá trị NULL là TRÙNG NHAU khi
-- kiểm tra UNIQUE (khác chuẩn ANSI/Postgres coi NULL<>NULL) — nên khoá
-- UX_ReportFacts_Source_Domain_Entity_Date phía trên vẫn chỉ cho phép ĐÚNG 1
-- dòng/ngày khi EntityCode NULL, invariant "1 dòng/thực thể" (etl/lib/upsert.js)
-- không hề bị nới lỏng bởi cột nullable này.
-- KHÔNG có FK từ EntityCode tới 1 bảng dimension tập trung — thiết kế hiện
-- tại CHƯA có bảng dimension liệt kê mọi mã thực thể hợp lệ theo từng
-- SourceSystem (mỗi job etl tự biết mã thực thể của nguồn nó đồng bộ), nên
-- CSDL không tự kiểm tra được EntityCode có "thật" hay không — rủi ro nhập
-- sai mã bị đẩy hết sang tầng ứng dụng (etl job + validate phía nhập tay
-- dwh.SalesTargets). Muốn khoá chặt hơn cần thêm 1 bảng dimension trung tâm
-- (thay đổi kiến trúc lớn, chưa làm ở đây vì chưa có yêu cầu nghiệp vụ cụ thể).

-- Chỉ tiêu (target/KPI) nhập tay theo tháng, TÁCH BẢNG RIÊNG khỏi
-- dwh.ReportFacts (không chung Domain) — để có thể GRANT quyền GHI ở mức
-- ĐÚNG BẢNG này cho 1 tài khoản hẹp (vd "dwh_target_importer", xem
-- dwh/grants.sql), không đụng gì tới dwh.ReportFacts. SQL Server không giới
-- hạn GRANT theo từng dòng/Domain trong 1 bảng, nên tách bảng là cách duy
-- nhất đạt least-privilege thật ở đây.
--
-- Domain khớp với dwh.ReportFacts.Domain của báo cáo áp dụng chỉ tiêu này
-- (vd cùng domain doanh thu chi nhánh) — dùng để phân biệt khi nhiều báo
-- cáo khác nhau đều cần chỉ tiêu riêng. PeriodMonth LUÔN là ngày 1 của
-- tháng áp dụng (vd '2026-08-01' cho chỉ tiêu tháng 8/2026) — nhập cuối
-- tháng trước, dùng suốt tháng đó. TargetsJson linh hoạt (giống Measures
-- bên ReportFacts) — mỗi lần nhập, tên cột trong file Excel (ngoài mã siêu
-- thị + tháng) trở thành đúng tên khoá trong JSON này, không cố định trước
-- trong code (xem etl/lib/salesTargetsImport.js).
IF OBJECT_ID('dwh.SalesTargets', 'U') IS NULL
BEGIN
    CREATE TABLE dwh.SalesTargets (
        Id            BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Domain        VARCHAR(50)   NOT NULL,
        EntityCode    NVARCHAR(100) NOT NULL,
        PeriodMonth   DATE          NOT NULL,
        TargetsJson   NVARCHAR(MAX) NOT NULL,
        ImportedAt    DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
        ImportedBy    NVARCHAR(50)  NULL,
        CONSTRAINT UX_SalesTargets_Domain_Entity_Period
            UNIQUE (Domain, EntityCode, PeriodMonth)
    );
    CREATE INDEX IX_SalesTargets_Domain_Period
        ON dwh.SalesTargets (Domain, PeriodMonth DESC) INCLUDE (EntityCode);
END
GO

-- Cùng lý do CK_ReportFacts_*_NotEmpty phía trên: chặn chuỗi rỗng/toàn
-- khoảng trắng lọt vào khoá nghiệp vụ khi nhập chỉ tiêu tay (etl/lib/salesTargetsImport.js).
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_SalesTargets_Domain_NotEmpty')
BEGIN
    ALTER TABLE dwh.SalesTargets WITH CHECK ADD CONSTRAINT CK_SalesTargets_Domain_NotEmpty
        CHECK (LEN(LTRIM(RTRIM(Domain))) > 0);
END
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_SalesTargets_EntityCode_NotEmpty')
BEGIN
    ALTER TABLE dwh.SalesTargets WITH CHECK ADD CONSTRAINT CK_SalesTargets_EntityCode_NotEmpty
        CHECK (LEN(LTRIM(RTRIM(EntityCode))) > 0);
END
GO

/* ===== Tối ưu lọc theo Dimensions =====
   Lọc báo cáo theo bất kỳ field nào NGOÀI entityCode/eventDate/sourceSystem
   đều dịch thành JSON_VALUE(Dimensions, '$.field') (xem
   rp-server/lib/reportEngine.js và api-server/lib/reportEngine.js —
   resolveColumn()) — không index được, SQL Server phải quét + parse JSON
   của TỪNG DÒNG trong Domain đó mỗi lần lọc. Với Domain còn ít dữ liệu
   không đáng bận tâm; khi ĐÃ XÁC ĐỊNH RÕ một báo cáo cụ thể chậm vì lọc theo
   1 field Dimensions cố định, thêm CỘT TRÍCH XUẤT PERSISTED + INDEX cho
   đúng field đó (không thêm hàng loạt "phòng khi cần" — mỗi cột persisted
   tốn thêm chỗ lưu + chi phí tính lại mỗi lần ETL upsert dòng đó).

   Mẫu (đổi 'deptCode' + NVARCHAR(100) cho đúng field/kiểu dữ liệu thật):

     ALTER TABLE dwh.ReportFacts
       ADD DeptCode AS CAST(JSON_VALUE(Dimensions, '$.deptCode') AS NVARCHAR(100)) PERSISTED;
     CREATE INDEX IX_ReportFacts_DeptCode
       ON dwh.ReportFacts (DeptCode) INCLUDE (Domain, EventDate);

   Sau đó khai thêm đúng 1 dòng vào PERSISTED_DIMENSION_COLUMNS trong CẢ 2
   bản reportEngine.js (rp-server VÀ api-server — bản sao cố ý trùng lặp,
   xem chú thích đầu file đó) để câu lọc TỰ ĐỘNG chuyển sang dùng cột mới
   này thay vì JSON_VALUE(...) — không cần sửa gì khác. */
