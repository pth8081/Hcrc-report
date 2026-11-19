-- Thiết lập VIEW Doanh thu-Giao dịch chi nhánh (Script A+B, DSMART16 + DSMART16_EOM)
-- ============================================================================
-- MỤC ĐÍCH FILE NÀY: dựng lại 2 VIEW NGUỒN cho toàn bộ hệ "Báo cáo nhanh
-- doanh thu HCRC/LĐTĐ" + "Báo cáo tổng hợp doanh thu siêu thị (HCRC/LĐTĐ)"
-- (domain `doanhthu_chinhanh`/`giaodich_chinhanh`) khi dựng 1 môi trường
-- HCRC trung tâm HOÀN TOÀN MỚI, hoặc khi cần tạo lại VIEW trên 1 máy chủ
-- DSMART16 khác. Nội dung SQL dưới đây CHÉP NGUYÊN VĂN (không đổi 1 ký tự
-- nào trong câu lệnh) từ "báo cáo doanh thu cuối ngày.md" — file .md đó mới
-- là TÀI LIỆU GỐC đầy đủ giải thích NGHIỆP VỤ/CÔNG THỨC (vì sao AMOUNT+
-- SURPLUS, vì sao TRANS_CODE 211/221/232 trừ 212/222, vì sao STATUS<>'D',
-- lịch sử điều tra số liệu...) — file NÀY chỉ gom lại đúng phần SQL cần
-- copy-paste chạy, đặt đúng chỗ cùng các VIEW .sql khác trong thư mục này
-- (bản 11.2, theo yêu cầu người dùng — "để khi deploy một cái mới thì tôi
-- chỉ cần lấy thông tin trong đấy").
--
-- SAU KHI VIEW đã tạo xong (cả 2 CSDL) — xem file
-- "Hướng dẫn thiết lập HCRC trung tâm từ đầu (VIEW + đồng bộ).md" (CÙNG thư
-- mục) để biết bước tiếp theo (tạo Nguồn dữ liệu + Job đồng bộ qua
-- `node etl/scripts/seedLdtdHcrcSync.js`).
-- ============================================================================


-- ============================================================================
-- SCRIPT A — chạy trên CSDL `DSMART16` (Live)
-- ============================================================================
-- VIEW 1: Doanh thu + Lãi gộp + Diện tích + Nhóm chuỗi, gộp theo (chi nhánh, ngày)
-- STRANS = bảng CHI TIẾT giao dịch thật. STOCK.TYPE (KHÔNG phải STYPE_ID —
-- cột đó luôn trống) phân loại '01'=MART, '02'=MINIMART, đã xác nhận qua
-- tên chi nhánh thật. Doanh thu = AMOUNT + SURPLUS (SURPLUS = lãi gộp POS
-- tự tính sẵn từng dòng). TRANS_CODE 211/221/232 = giao dịch bán (211=bán
-- buôn, 221=bán lẻ, 232=chưa xác nhận nghĩa cụ thể), 212/222 = TRẢ HÀNG
-- tương ứng (AMOUNT ghi DƯƠNG, phải TRỪ RIÊNG). STATUS đọc thẳng từ STRANS
-- ('D' = Huỷ, loại khỏi doanh thu/giao dịch). Xem đầy đủ lý do/lịch sử điều
-- tra ở "báo cáo doanh thu cuối ngày.md" mục "Script A".
CREATE OR ALTER VIEW V_HCRC_DOANHTHU_CHINHANH AS
SELECT
    d.STK_ID, CAST(d.TRAN_DATE AS DATE) AS WORK_DATE,
    SUM(CASE WHEN d.TRANS_CODE IN ('211','221','232') THEN d.QTY ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE IN ('212','222') THEN d.QTY ELSE 0 END) AS SoLuongBan,
    SUM(CASE WHEN d.TRANS_CODE IN ('211','221','232') THEN d.AMOUNT + d.SURPLUS ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE IN ('212','222') THEN d.AMOUNT + d.SURPLUS ELSE 0 END) AS doanhThu,
    SUM(CASE WHEN d.TRANS_CODE IN ('211','221','232') THEN d.VAT_AMT ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE IN ('212','222') THEN d.VAT_AMT ELSE 0 END) AS TienVAT,
    SUM(CASE WHEN d.TRANS_CODE IN ('211','221','232') THEN d.DISCOUNT ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE IN ('212','222') THEN d.DISCOUNT ELSE 0 END) AS TienGiamGia,
    SUM(CASE WHEN d.TRANS_CODE IN ('211','221','232') THEN d.COMM_AMT ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE IN ('212','222') THEN d.COMM_AMT ELSE 0 END) AS HoaHong,
    SUM(CASE WHEN d.TRANS_CODE IN ('211','221','232') THEN d.SURPLUS ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE IN ('212','222') THEN d.SURPLUS ELSE 0 END) AS laiGop,
    MAX(s.DIMENSION) AS dienTich,
    MAX(CASE WHEN s.TYPE = '01' THEN 'MART'
             WHEN s.TYPE = '02' THEN 'MINIMART'
             ELSE s.TYPE END) AS chain
FROM STRANS d
JOIN STOCK s ON s.STK_ID = d.STK_ID
WHERE d.STATUS <> 'D' -- 'D' = Huỷ; cột có sẵn trong STRANS, không cần JOIN TRANSHDR
  AND d.TRANS_CODE IN ('211','221','232','212','222')
GROUP BY d.STK_ID, CAST(d.TRAN_DATE AS DATE);
GO

-- VIEW 2: Số giao dịch, gộp theo (chi nhánh, ngày) — BU_ID có sẵn TRỰC TIẾP
-- trong STRANS, đếm SoGiaoDich = COUNT(DISTINCT TRANS_NUM), trừ số trả
-- hàng. BU_ID GIỮ NGUYÊN ĐẦY ĐỦ (KHÔNG rút gọn LEFT(BU_ID,3)) — khớp đúng
-- etl.DiemStkMapping.MaDiem.
CREATE OR ALTER VIEW V_HCRC_GIAODICH_CHINHANH AS
SELECT BU_ID, CAST(TRAN_DATE AS DATE) AS TRAN_DATE,
    COUNT(DISTINCT CASE WHEN TRANS_CODE IN ('211','221','232') THEN TRANS_NUM ELSE NULL END)
      - COUNT(DISTINCT CASE WHEN TRANS_CODE IN ('212','222') THEN TRANS_NUM ELSE NULL END) AS SoGiaoDich,
    SUM(CASE WHEN TRANS_CODE IN ('211','221','232') THEN AMOUNT + SURPLUS ELSE 0 END)
      - SUM(CASE WHEN TRANS_CODE IN ('212','222') THEN AMOUNT + SURPLUS ELSE 0 END) AS TongTien,
    SUM(CASE WHEN TRANS_CODE IN ('211','221','232') THEN DISCOUNT ELSE 0 END)
      - SUM(CASE WHEN TRANS_CODE IN ('212','222') THEN DISCOUNT ELSE 0 END) AS TongGiamGia,
    SUM(CASE WHEN TRANS_CODE IN ('211','221','232') THEN VAT_AMT ELSE 0 END)
      - SUM(CASE WHEN TRANS_CODE IN ('212','222') THEN VAT_AMT ELSE 0 END) AS TongVAT
FROM STRANS
WHERE STATUS <> 'D' -- 'D' = Huỷ
  AND TRANS_CODE IN ('211','221','232','212','222')
GROUP BY BU_ID, CAST(TRAN_DATE AS DATE);
GO

-- Kiểm tra: mở rộng DSMART16 → Views → thấy đủ V_HCRC_DOANHTHU_CHINHANH và
-- V_HCRC_GIAODICH_CHINHANH.


-- ============================================================================
-- SCRIPT B — chạy trên CSDL `DSMART16_EOM` (Lịch sử) — CHẠY TAY 1 LẦN
-- ============================================================================
-- KHÁC HẲN Script A: DSMART16_EOM KHÔNG có 1 bảng STRANS_EOM duy nhất chứa
-- đủ lịch sử — dữ liệu chia thành ~93 bảng theo tháng (STRANS_YYYYMM) +
-- STRANS_EOM (vùng đệm gần nhất) — phải UNION ALL hết (sinh TỰ ĐỘNG từ
-- sys.tables, KHÔNG gõ tay tên bảng). STATUS đọc THẲNG từ STRANS_YYYYMM/
-- STRANS_EOM (KHÔNG JOIN TRANSHDR_ARC — TRANS_NUM sinh khác quy tắc, JOIN
-- không khớp). STOCK chỉ có ở DSMART16 — tham chiếu chéo
-- DSMART16.dbo.STOCK. Cùng công thức SURPLUS/TRANS_CODE như Script A. Xem
-- đầy đủ lý do/lịch sử điều tra ở "báo cáo doanh thu cuối ngày.md" mục
-- "Script B".
--
-- Chạy NGUYÊN KHỐI (không chèn GO giữa các dòng) — biến @sql dùng chung cho
-- cả 2 VIEW, GO sẽ xoá biến giữa chừng.
DECLARE @sql NVARCHAR(MAX);

-- CAST(... AS NVARCHAR(MAX)) BẮT BUỘC — thiếu ép kiểu này STRING_AGG suy
-- luận nhầm kiểu ngắn, lỗi "aggregation result exceeded the limit of 8000
-- bytes" khi ghép đủ ~93 bảng.
SELECT @sql = STRING_AGG(
    CAST('SELECT STK_ID, SKU_ID, BU_ID, TRAN_DATE, TRANS_NUM, TRANS_CODE, QTY, AMOUNT, SURPLUS, VAT_AMT, DISCOUNT, COMM_AMT FROM '
    + QUOTENAME(name) + ' WITH (NOLOCK) WHERE STATUS <> ''D'' AND TRANS_CODE IN (''211'',''221'',''232'',''212'',''222'')' AS NVARCHAR(MAX)),
    ' UNION ALL '
)
FROM sys.tables
WHERE name LIKE 'STRANS[_][0-9][0-9][0-9][0-9][0-9][0-9]' OR name = 'STRANS_EOM';

-- VIEW 1: Doanh thu — công thức GIỐNG HỆT Script A.
DECLARE @sqlDoanhThu NVARCHAR(MAX) = N'
CREATE OR ALTER VIEW V_HCRC_DOANHTHU_CHINHANH AS
SELECT
    d.STK_ID, CAST(d.TRAN_DATE AS DATE) AS WORK_DATE,
    SUM(CASE WHEN d.TRANS_CODE IN (''211'',''221'',''232'') THEN d.QTY ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE IN (''212'',''222'') THEN d.QTY ELSE 0 END) AS SoLuongBan,
    SUM(CASE WHEN d.TRANS_CODE IN (''211'',''221'',''232'') THEN d.AMOUNT + d.SURPLUS ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE IN (''212'',''222'') THEN d.AMOUNT + d.SURPLUS ELSE 0 END) AS doanhThu,
    SUM(CASE WHEN d.TRANS_CODE IN (''211'',''221'',''232'') THEN d.VAT_AMT ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE IN (''212'',''222'') THEN d.VAT_AMT ELSE 0 END) AS TienVAT,
    SUM(CASE WHEN d.TRANS_CODE IN (''211'',''221'',''232'') THEN d.DISCOUNT ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE IN (''212'',''222'') THEN d.DISCOUNT ELSE 0 END) AS TienGiamGia,
    SUM(CASE WHEN d.TRANS_CODE IN (''211'',''221'',''232'') THEN d.COMM_AMT ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE IN (''212'',''222'') THEN d.COMM_AMT ELSE 0 END) AS HoaHong,
    SUM(CASE WHEN d.TRANS_CODE IN (''211'',''221'',''232'') THEN d.SURPLUS ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE IN (''212'',''222'') THEN d.SURPLUS ELSE 0 END) AS laiGop,
    MAX(s.DIMENSION) AS dienTich,
    MAX(CASE WHEN s.TYPE = ''01'' THEN ''MART''
             WHEN s.TYPE = ''02'' THEN ''MINIMART''
             ELSE s.TYPE END) AS chain
FROM (' + @sql + N') d
JOIN DSMART16.dbo.STOCK s ON s.STK_ID = d.STK_ID
GROUP BY d.STK_ID, CAST(d.TRAN_DATE AS DATE);';

EXEC sp_executesql @sqlDoanhThu;

-- VIEW 2: Giao dịch — cùng nguồn UNION ALL như VIEW 1.
DECLARE @sqlGiaoDich NVARCHAR(MAX) = N'
CREATE OR ALTER VIEW V_HCRC_GIAODICH_CHINHANH AS
SELECT d.BU_ID, CAST(d.TRAN_DATE AS DATE) AS TRAN_DATE,
    COUNT(DISTINCT CASE WHEN d.TRANS_CODE IN (''211'',''221'',''232'') THEN d.TRANS_NUM ELSE NULL END)
      - COUNT(DISTINCT CASE WHEN d.TRANS_CODE IN (''212'',''222'') THEN d.TRANS_NUM ELSE NULL END) AS SoGiaoDich,
    SUM(CASE WHEN d.TRANS_CODE IN (''211'',''221'',''232'') THEN d.AMOUNT + d.SURPLUS ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE IN (''212'',''222'') THEN d.AMOUNT + d.SURPLUS ELSE 0 END) AS TongTien,
    SUM(CASE WHEN d.TRANS_CODE IN (''211'',''221'',''232'') THEN d.DISCOUNT ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE IN (''212'',''222'') THEN d.DISCOUNT ELSE 0 END) AS TongGiamGia,
    SUM(CASE WHEN d.TRANS_CODE IN (''211'',''221'',''232'') THEN d.VAT_AMT ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE IN (''212'',''222'') THEN d.VAT_AMT ELSE 0 END) AS TongVAT
FROM (' + @sql + N') d
GROUP BY d.BU_ID, CAST(d.TRAN_DATE AS DATE);';

EXEC sp_executesql @sqlGiaoDich;
GO

-- Kiểm tra: mở rộng DSMART16_EOM → Views → thấy đủ 2 VIEW như Script A.


-- ============================================================================
-- BẢO TRÌ LÂU DÀI (DSMART16_EOM) — QUAN TRỌNG, KHÔNG BỎ QUA
-- ============================================================================
-- Đoạn Script B ở trên phải CHẠY LẠI mỗi khi DSMART16 tự tạo thêm bảng
-- STRANS_YYYYMM mới (CREATE VIEW chỉ chụp danh sách bảng tại THỜI ĐIỂM
-- chạy). Đóng gói thành stored procedure + SQL Server Agent Job chạy tự
-- động hàng tháng (khuyên dùng, đỡ phải nhớ tay) — chạy đoạn dưới đây 1 LẦN
-- trên DSMART16_EOM để tạo procedure + job đó.

CREATE OR ALTER PROCEDURE dbo.sp_HCRC_RebuildDoanhThuView AS
BEGIN
    DECLARE @sql NVARCHAR(MAX);

    SELECT @sql = STRING_AGG(
        CAST('SELECT STK_ID, SKU_ID, BU_ID, TRAN_DATE, TRANS_NUM, TRANS_CODE, QTY, AMOUNT, SURPLUS, VAT_AMT, DISCOUNT, COMM_AMT FROM '
        + QUOTENAME(name) + ' WITH (NOLOCK) WHERE STATUS <> ''D'' AND TRANS_CODE IN (''211'',''221'',''232'',''212'',''222'')' AS NVARCHAR(MAX)),
        ' UNION ALL '
    )
    FROM sys.tables
    WHERE name LIKE 'STRANS[_][0-9][0-9][0-9][0-9][0-9][0-9]' OR name = 'STRANS_EOM';

    DECLARE @sqlDoanhThu NVARCHAR(MAX) = N'
    CREATE OR ALTER VIEW V_HCRC_DOANHTHU_CHINHANH AS
    SELECT
        d.STK_ID, CAST(d.TRAN_DATE AS DATE) AS WORK_DATE,
        SUM(CASE WHEN d.TRANS_CODE IN (''211'',''221'',''232'') THEN d.QTY ELSE 0 END)
          - SUM(CASE WHEN d.TRANS_CODE IN (''212'',''222'') THEN d.QTY ELSE 0 END) AS SoLuongBan,
        SUM(CASE WHEN d.TRANS_CODE IN (''211'',''221'',''232'') THEN d.AMOUNT + d.SURPLUS ELSE 0 END)
          - SUM(CASE WHEN d.TRANS_CODE IN (''212'',''222'') THEN d.AMOUNT + d.SURPLUS ELSE 0 END) AS doanhThu,
        SUM(CASE WHEN d.TRANS_CODE IN (''211'',''221'',''232'') THEN d.VAT_AMT ELSE 0 END)
          - SUM(CASE WHEN d.TRANS_CODE IN (''212'',''222'') THEN d.VAT_AMT ELSE 0 END) AS TienVAT,
        SUM(CASE WHEN d.TRANS_CODE IN (''211'',''221'',''232'') THEN d.DISCOUNT ELSE 0 END)
          - SUM(CASE WHEN d.TRANS_CODE IN (''212'',''222'') THEN d.DISCOUNT ELSE 0 END) AS TienGiamGia,
        SUM(CASE WHEN d.TRANS_CODE IN (''211'',''221'',''232'') THEN d.COMM_AMT ELSE 0 END)
          - SUM(CASE WHEN d.TRANS_CODE IN (''212'',''222'') THEN d.COMM_AMT ELSE 0 END) AS HoaHong,
        SUM(CASE WHEN d.TRANS_CODE IN (''211'',''221'',''232'') THEN d.SURPLUS ELSE 0 END)
          - SUM(CASE WHEN d.TRANS_CODE IN (''212'',''222'') THEN d.SURPLUS ELSE 0 END) AS laiGop,
        MAX(s.DIMENSION) AS dienTich,
        MAX(CASE WHEN s.TYPE = ''01'' THEN ''MART''
                 WHEN s.TYPE = ''02'' THEN ''MINIMART''
                 ELSE s.TYPE END) AS chain
    FROM (' + @sql + N') d
    JOIN DSMART16.dbo.STOCK s ON s.STK_ID = d.STK_ID
    GROUP BY d.STK_ID, CAST(d.TRAN_DATE AS DATE);';

    EXEC sp_executesql @sqlDoanhThu;

    DECLARE @sqlGiaoDich NVARCHAR(MAX) = N'
    CREATE OR ALTER VIEW V_HCRC_GIAODICH_CHINHANH AS
    SELECT d.BU_ID, CAST(d.TRAN_DATE AS DATE) AS TRAN_DATE,
        COUNT(DISTINCT CASE WHEN d.TRANS_CODE IN (''211'',''221'',''232'') THEN d.TRANS_NUM ELSE NULL END)
          - COUNT(DISTINCT CASE WHEN d.TRANS_CODE IN (''212'',''222'') THEN d.TRANS_NUM ELSE NULL END) AS SoGiaoDich,
        SUM(CASE WHEN d.TRANS_CODE IN (''211'',''221'',''232'') THEN d.AMOUNT + d.SURPLUS ELSE 0 END)
          - SUM(CASE WHEN d.TRANS_CODE IN (''212'',''222'') THEN d.AMOUNT + d.SURPLUS ELSE 0 END) AS TongTien,
        SUM(CASE WHEN d.TRANS_CODE IN (''211'',''221'',''232'') THEN d.DISCOUNT ELSE 0 END)
          - SUM(CASE WHEN d.TRANS_CODE IN (''212'',''222'') THEN d.DISCOUNT ELSE 0 END) AS TongGiamGia,
        SUM(CASE WHEN d.TRANS_CODE IN (''211'',''221'',''232'') THEN d.VAT_AMT ELSE 0 END)
          - SUM(CASE WHEN d.TRANS_CODE IN (''212'',''222'') THEN d.VAT_AMT ELSE 0 END) AS TongVAT
    FROM (' + @sql + N') d
    GROUP BY d.BU_ID, CAST(d.TRAN_DATE AS DATE);';

    EXEC sp_executesql @sqlGiaoDich;
END
GO

-- Chạy thử ngay: EXEC dbo.sp_HCRC_RebuildDoanhThuView; — không lỗi là xong.

-- Tạo Job SQL Server Agent gọi lại procedure trên vào ngày 2 mỗi tháng
-- (chừa 1 ngày sau khi DSMART16 thường tạo bảng tháng mới). Cần quyền
-- SQLAgentOperatorRole trở lên — nhờ DBA chạy giúp nếu không có.
USE msdb;
GO
EXEC dbo.sp_add_job
    @job_name = N'HCRC - Cap nhat lai VIEW V_HCRC_DOANHTHU_CHINHANH';
GO
EXEC dbo.sp_add_jobstep
    @job_name = N'HCRC - Cap nhat lai VIEW V_HCRC_DOANHTHU_CHINHANH',
    @step_name = N'Goi stored procedure sinh lai VIEW',
    @database_name = N'DSMART16_EOM',
    @subsystem = N'TSQL',
    @command = N'EXEC dbo.sp_HCRC_RebuildDoanhThuView;';
GO
EXEC dbo.sp_add_schedule
    @schedule_name = N'Hang thang - ngay 2',
    @freq_type = 16,              -- Hàng tháng
    @freq_interval = 2,           -- Ngày 2
    @freq_recurrence_factor = 1,  -- BẮT BUỘC khi @freq_type=16 (số tháng giữa 2 lần chạy)
    @active_start_time = 30000; -- 03:00:00
GO
EXEC dbo.sp_attach_schedule
    @job_name = N'HCRC - Cap nhat lai VIEW V_HCRC_DOANHTHU_CHINHANH',
    @schedule_name = N'Hang thang - ngay 2';
GO
EXEC dbo.sp_add_jobserver
    @job_name = N'HCRC - Cap nhat lai VIEW V_HCRC_DOANHTHU_CHINHANH';
GO

-- Kiểm tra: SQL Server Agent → Jobs → thấy đúng tên job, chuột phải →
-- "Start Job at Step..." để chạy thử.
