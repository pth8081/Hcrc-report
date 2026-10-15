/* deploy/Thiết lập VIEW Doanh thu-Nhập hàng theo Ngành hàng Lịch sử (DSMART16_EOM).sql
   ============================================================================
   BẢN 9.41+ — "Cùng kỳ năm trước" cho 2 báo cáo "Doanh thu/Nhập hàng theo
   ngành hàng" (xem rp-server/scripts/seedNganhHangReports.js). CÙNG LÝ DO/
   KỸ THUẬT đã áp dụng cho "báo cáo doanh thu cuối ngày.md" Script B + VIEW
   Đơn đặt hàng Lịch sử: domain Live (VIEW V_HCRC_DOANHTHU_NGANHHANG/
   V_HCRC_NHAPHANG_NGANHHANG trên CSDL `DSMART16`) chỉ đọc bảng `STRANS`
   (giao dịch gần đây) — dữ liệu quá khứ nằm ở CSDL RIÊNG `DSMART16_EOM`
   (~93 bảng `STRANS_YYYYMM` + `STRANS_EOM`). FILE NÀY tạo 2 VIEW CÙNG TÊN
   trên `DSMART16_EOM`, UNION ALL toàn bộ các bảng đó (sinh SQL tự động từ
   sys.tables, không gõ tay ~93 tên bảng — mirror kỹ thuật Script B).

   ĐÃ XÁC NHẬN (chạy `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
   WHERE TABLE_NAME IN ('SKU_DEF','DEPTLIST')` trên `DSMART16_EOM` — kết
   quả RỖNG): 2 bảng `SKU_DEF`/`DEPTLIST` (tra ngành hàng) CHỈ có ở CSDL
   `DSMART16`, giống hệt `STOCK`/`SUPPLIER` đã gặp ở Script B/VIEW Đơn đặt
   hàng Lịch sử — VIEW dưới đây JOIN CHÉO `DSMART16.dbo.SKU_DEF`/
   `DSMART16.dbo.DEPTLIST` (CÙNG 1 SQL Server instance, đã có tiền lệ hoạt
   động thật — nếu báo lỗi "Invalid object name", 2 CSDL nằm KHÁC server,
   báo lại để đổi hướng).

   Sau khi chạy xong file này, chạy:
     node etl/scripts/seedNganhHangSync.js --with-history
   để tạo 2 job đồng bộ "Lịch sử (DSMART16_EOM)" (cùng TargetDomain
   doanhthu_nganhhang/nhaphang_nganhhang với job Live — phân biệt bằng
   SourceSystem khác nhau theo DataSourceId, không đè lên nhau) — rp-server/
   scripts/seedNganhHangReports.js (khối "lastYear") hiện đọc domain Live —
   SAU KHI có job Lịch sử, sửa khối "lastYear" của 2 báo cáo thêm
   `historicalDomain` trỏ đúng domain đó (xem
   lib/compositeReportRunner.js:fetchSplitDomainRows()) để "Cùng kỳ năm
   trước" có số liệu.

   AN TOÀN CHẠY LẠI NHIỀU LẦN — `CREATE OR ALTER VIEW`/`PROCEDURE`.
   ============================================================================ */

USE DSMART16_EOM;
GO

/* ===================== VIEW 1: Doanh thu theo ngành hàng ===================== */
DECLARE @sqlDoanhThuSrc NVARCHAR(MAX);

-- CAST(... AS NVARCHAR(MAX)) BẮT BUỘC (xem Script B) — thiếu ép kiểu này
-- STRING_AGG suy luận nhầm kiểu ngắn, lỗi "aggregation result exceeded the
-- limit of 8000 bytes" khi ghép đủ ~93 bảng. Lọc TRANS_CODE/STATUS NGAY
-- TRONG từng bảng con — khớp ĐÚNG công thức VIEW Live
-- (V_HCRC_DOANHTHU_NGANHHANG trên DSMART16): STATUS<>'D', 5 mã bán/trả hàng.
SELECT @sqlDoanhThuSrc = STRING_AGG(
    CAST('SELECT STK_ID, SKU_ID, TRAN_DATE, TRANS_CODE, QTY, AMOUNT, SURPLUS FROM '
    + QUOTENAME(name) + ' WITH (NOLOCK) WHERE STATUS <> ''D'' AND TRANS_CODE IN (''211'',''221'',''232'',''212'',''222'')' AS NVARCHAR(MAX)),
    ' UNION ALL '
)
FROM sys.tables
WHERE name LIKE 'STRANS[_][0-9][0-9][0-9][0-9][0-9][0-9]' OR name = 'STRANS_EOM';

DECLARE @sqlDoanhThuView NVARCHAR(MAX) = N'
CREATE OR ALTER VIEW dbo.V_HCRC_DOANHTHU_NGANHHANG AS
SELECT
    d.STK_ID + ''_'' + sd.DEPT_ID AS MaThucThe,
    d.STK_ID,
    sd.DEPT_ID,
    dl.DEPT_NAME_U AS TenNganhHang,
    CAST(d.TRAN_DATE AS DATE) AS WORK_DATE,
    SUM(CASE WHEN d.TRANS_CODE IN (''211'',''221'',''232'') THEN d.QTY ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE IN (''212'',''222'') THEN d.QTY ELSE 0 END) AS SoLuongBan,
    SUM(CASE WHEN d.TRANS_CODE IN (''211'',''221'',''232'') THEN d.AMOUNT + d.SURPLUS ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE IN (''212'',''222'') THEN d.AMOUNT + d.SURPLUS ELSE 0 END) AS DoanhThu,
    SUM(CASE WHEN d.TRANS_CODE IN (''211'',''221'',''232'') THEN d.SURPLUS ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE IN (''212'',''222'') THEN d.SURPLUS ELSE 0 END) AS LaiGop
FROM (' + @sqlDoanhThuSrc + N') d
JOIN DSMART16.dbo.SKU_DEF sd ON sd.SKU_ID = d.SKU_ID
LEFT JOIN DSMART16.dbo.DEPTLIST dl ON dl.DEPT_ID = sd.DEPT_ID
GROUP BY d.STK_ID, sd.DEPT_ID, dl.DEPT_NAME_U, CAST(d.TRAN_DATE AS DATE);';

EXEC sp_executesql @sqlDoanhThuView;
GO

/* ===================== VIEW 2: Nhập hàng theo ngành hàng ===================== */
USE DSMART16_EOM;
GO
DECLARE @sqlNhapHangSrc NVARCHAR(MAX);

-- TRANS_CODE='333', STATUS NOT IN ('D','E') — khớp ĐÚNG VIEW Live
-- (V_HCRC_NHAPHANG_NGANHHANG trên DSMART16) + bc-don-dat-hang.md (nguồn
-- nhập hàng xác nhận là STRANS, không phải RV_ORDER).
SELECT @sqlNhapHangSrc = STRING_AGG(
    CAST('SELECT STK_ID, SKU_ID, TRAN_DATE, QTY, AMOUNT FROM '
    + QUOTENAME(name) + ' WITH (NOLOCK) WHERE TRANS_CODE = ''333'' AND STATUS NOT IN (''D'',''E'')' AS NVARCHAR(MAX)),
    ' UNION ALL '
)
FROM sys.tables
WHERE name LIKE 'STRANS[_][0-9][0-9][0-9][0-9][0-9][0-9]' OR name = 'STRANS_EOM';

DECLARE @sqlNhapHangView NVARCHAR(MAX) = N'
CREATE OR ALTER VIEW dbo.V_HCRC_NHAPHANG_NGANHHANG AS
SELECT
    m.STK_ID + ''_'' + sd.DEPT_ID AS MaThucThe,
    m.STK_ID,
    sd.DEPT_ID,
    dl.DEPT_NAME_U AS TenNganhHang,
    CAST(m.TRAN_DATE AS DATE) AS WORK_DATE,
    SUM(m.QTY) AS SoLuongNhap,
    SUM(m.AMOUNT) AS GiaTriNhap
FROM (' + @sqlNhapHangSrc + N') m
JOIN DSMART16.dbo.SKU_DEF sd ON sd.SKU_ID = m.SKU_ID
LEFT JOIN DSMART16.dbo.DEPTLIST dl ON dl.DEPT_ID = sd.DEPT_ID
GROUP BY m.STK_ID, sd.DEPT_ID, dl.DEPT_NAME_U, CAST(m.TRAN_DATE AS DATE);';

EXEC sp_executesql @sqlNhapHangView;
GO

-- Kiểm tra nhanh sau khi chạy — phải thấy số dòng + tổng tiền hợp lý của
-- NĂM TRƯỚC (VIEW Live không có dữ liệu xa vậy), tên ngành hàng KHÔNG lỗi
-- font (đã dùng DEPT_NAME_U):
SELECT TOP 20 * FROM dbo.V_HCRC_DOANHTHU_NGANHHANG ORDER BY WORK_DATE DESC;
SELECT TOP 20 * FROM dbo.V_HCRC_NHAPHANG_NGANHHANG ORDER BY WORK_DATE DESC;
GO

/* ===================== Tự động chạy lại hàng tháng ===================== */
-- Mỗi khi DSMART16_EOM tự tạo thêm bảng STRANS_YYYYMM mới, 2 VIEW ở trên
-- KHÔNG tự nhận bảng mới (CREATE VIEW chỉ chụp danh sách bảng tại thời
-- điểm chạy) — gói lại thành 1 stored procedure chạy lại cả 2 VIEW, giống
-- hệt sp_HCRC_RebuildDoanhThuView/sp_HCRC_RebuildDonDatHangView đã có.
USE DSMART16_EOM;
GO
CREATE OR ALTER PROCEDURE dbo.sp_HCRC_RebuildNganhHangView AS
BEGIN
    DECLARE @sqlDoanhThuSrc NVARCHAR(MAX);
    SELECT @sqlDoanhThuSrc = STRING_AGG(
        CAST('SELECT STK_ID, SKU_ID, TRAN_DATE, TRANS_CODE, QTY, AMOUNT, SURPLUS FROM '
        + QUOTENAME(name) + ' WITH (NOLOCK) WHERE STATUS <> ''D'' AND TRANS_CODE IN (''211'',''221'',''232'',''212'',''222'')' AS NVARCHAR(MAX)),
        ' UNION ALL '
    )
    FROM sys.tables
    WHERE name LIKE 'STRANS[_][0-9][0-9][0-9][0-9][0-9][0-9]' OR name = 'STRANS_EOM';

    DECLARE @sqlDoanhThuView NVARCHAR(MAX) = N'
    CREATE OR ALTER VIEW dbo.V_HCRC_DOANHTHU_NGANHHANG AS
    SELECT
        d.STK_ID + ''_'' + sd.DEPT_ID AS MaThucThe,
        d.STK_ID,
        sd.DEPT_ID,
        dl.DEPT_NAME_U AS TenNganhHang,
        CAST(d.TRAN_DATE AS DATE) AS WORK_DATE,
        SUM(CASE WHEN d.TRANS_CODE IN (''211'',''221'',''232'') THEN d.QTY ELSE 0 END)
          - SUM(CASE WHEN d.TRANS_CODE IN (''212'',''222'') THEN d.QTY ELSE 0 END) AS SoLuongBan,
        SUM(CASE WHEN d.TRANS_CODE IN (''211'',''221'',''232'') THEN d.AMOUNT + d.SURPLUS ELSE 0 END)
          - SUM(CASE WHEN d.TRANS_CODE IN (''212'',''222'') THEN d.AMOUNT + d.SURPLUS ELSE 0 END) AS DoanhThu,
        SUM(CASE WHEN d.TRANS_CODE IN (''211'',''221'',''232'') THEN d.SURPLUS ELSE 0 END)
          - SUM(CASE WHEN d.TRANS_CODE IN (''212'',''222'') THEN d.SURPLUS ELSE 0 END) AS LaiGop
    FROM (' + @sqlDoanhThuSrc + N') d
    JOIN DSMART16.dbo.SKU_DEF sd ON sd.SKU_ID = d.SKU_ID
    LEFT JOIN DSMART16.dbo.DEPTLIST dl ON dl.DEPT_ID = sd.DEPT_ID
    GROUP BY d.STK_ID, sd.DEPT_ID, dl.DEPT_NAME_U, CAST(d.TRAN_DATE AS DATE);';
    EXEC sp_executesql @sqlDoanhThuView;

    DECLARE @sqlNhapHangSrc NVARCHAR(MAX);
    SELECT @sqlNhapHangSrc = STRING_AGG(
        CAST('SELECT STK_ID, SKU_ID, TRAN_DATE, QTY, AMOUNT FROM '
        + QUOTENAME(name) + ' WITH (NOLOCK) WHERE TRANS_CODE = ''333'' AND STATUS NOT IN (''D'',''E'')' AS NVARCHAR(MAX)),
        ' UNION ALL '
    )
    FROM sys.tables
    WHERE name LIKE 'STRANS[_][0-9][0-9][0-9][0-9][0-9][0-9]' OR name = 'STRANS_EOM';

    DECLARE @sqlNhapHangView NVARCHAR(MAX) = N'
    CREATE OR ALTER VIEW dbo.V_HCRC_NHAPHANG_NGANHHANG AS
    SELECT
        m.STK_ID + ''_'' + sd.DEPT_ID AS MaThucThe,
        m.STK_ID,
        sd.DEPT_ID,
        dl.DEPT_NAME_U AS TenNganhHang,
        CAST(m.TRAN_DATE AS DATE) AS WORK_DATE,
        SUM(m.QTY) AS SoLuongNhap,
        SUM(m.AMOUNT) AS GiaTriNhap
    FROM (' + @sqlNhapHangSrc + N') m
    JOIN DSMART16.dbo.SKU_DEF sd ON sd.SKU_ID = m.SKU_ID
    LEFT JOIN DSMART16.dbo.DEPTLIST dl ON dl.DEPT_ID = sd.DEPT_ID
    GROUP BY m.STK_ID, sd.DEPT_ID, dl.DEPT_NAME_U, CAST(m.TRAN_DATE AS DATE);';
    EXEC sp_executesql @sqlNhapHangView;
END
GO

-- Chạy thử ngay: EXEC dbo.sp_HCRC_RebuildNganhHangView; -- không lỗi là xong.

/* ===================== Job SQL Server Agent (tuỳ chọn, khuyên dùng) =====================
   Giống hệt job đã tạo cho sp_HCRC_RebuildDoanhThuView/
   sp_HCRC_RebuildDonDatHangView — nếu đã có 1 trong 2 job đó, CÓ THỂ chỉ
   cần thêm 1 step gọi thêm dbo.sp_HCRC_RebuildNganhHangView vào CÙNG job,
   thay vì tạo job mới. Dưới đây tạo job RIÊNG cho rõ ràng, độc lập. */
USE msdb;
GO
EXEC dbo.sp_add_job
    @job_name = N'HCRC - Cap nhat lai VIEW theo Nganh hang';
GO
EXEC dbo.sp_add_jobstep
    @job_name = N'HCRC - Cap nhat lai VIEW theo Nganh hang',
    @step_name = N'Goi stored procedure sinh lai 2 VIEW',
    @database_name = N'DSMART16_EOM',
    @subsystem = N'TSQL',
    @command = N'EXEC dbo.sp_HCRC_RebuildNganhHangView;';
GO
EXEC dbo.sp_add_schedule
    @schedule_name = N'Hang thang - ngay 2 (Nganh hang)',
    @freq_type = 16,              -- Hàng tháng
    @freq_interval = 2,           -- Ngày 2
    @freq_recurrence_factor = 1,  -- BẮT BUỘC khi @freq_type=16
    @active_start_time = 32000; -- 03:20:00 (lệch giờ so với 2 job rebuild VIEW khác, tránh chạy trùng)
GO
EXEC dbo.sp_attach_schedule
    @job_name = N'HCRC - Cap nhat lai VIEW theo Nganh hang',
    @schedule_name = N'Hang thang - ngay 2 (Nganh hang)';
GO
EXEC dbo.sp_add_jobserver
    @job_name = N'HCRC - Cap nhat lai VIEW theo Nganh hang';
GO

/* Không có SQL Server Agent (bản Express)/không có quyền tạo Job — bỏ qua
   phần Job, chỉ cần có stored procedure ở trên, đặt lịch nhắc DBA tự chạy
   tay EXEC dbo.sp_HCRC_RebuildNganhHangView; mỗi đầu tháng. */
