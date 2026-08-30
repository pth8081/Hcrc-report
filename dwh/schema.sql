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
