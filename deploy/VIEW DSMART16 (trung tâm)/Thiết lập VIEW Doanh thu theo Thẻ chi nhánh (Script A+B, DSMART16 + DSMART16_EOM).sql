-- Thiết lập VIEW Doanh thu theo Thẻ chi nhánh (Script A+B, DSMART16 + DSMART16_EOM)
-- ============================================================================
-- BẢN 11.24 — 2 báo cáo MỚI cho đội MKT: "Báo cáo kinh doanh theo tuần"
-- (bc-kinh-doanh-theo-tuan) + "Báo cáo khách hàng theo tuần"
-- (bc-khach-hang-theo-tuan) — dựa trên 3 file mẫu thật đội MKT gửi
-- ("FORM BÁO CÁO - BC KD T3 2026.xlsx", "Form báo cáo hàng tuần thứ
-- 6.xlsx", "BRG_Weekly_Post...xlsx" — file thứ 3 làm SAU, domain riêng).
--
-- ĐÃ XÁC NHẬN BẰNG DỮ LIỆU THẬT (25/11/2026, DBA chạy trực tiếp trên
-- DSMART16):
--   - "Qua thẻ" (file 1) và "Thẻ Elite" (file 2) là CÙNG 1 khái niệm —
--     KHÔNG có cột/bảng "phương thức thanh toán ngân hàng" riêng, cũng
--     KHÔNG có bảng "ELITE" riêng. `STRANS.CARD_ID` (char) chính là mã
--     thẻ thành viên (app Elite) — mẫu thật "E14000205328", liên kết tới
--     khách qua `OSTK_ID`/`OSTK_TYPE='03'` (KHÁC `'04'` dùng cho NCC/
--     DEALER). Người dùng xác nhận: TẠM THỜI cứ coi "qua thẻ" = CARD_ID
--     có giá trị, KHÔNG phân biệt theo hạng thành viên (GRP_ID ở
--     dbo.CUSTOMER chỉ có 4 mã số 3000/3001/3002/3003, không có tên
--     "Elite" nào trong CSDL — không dùng cột này).
--   - "Doanh số" = AMOUNT + SURPLUS + VAT_AMT (GỒM VAT — đúng quy ước đã
--     chốt ở VIEW "Bán buôn chi tiết theo khách hàng", KHÁC "Doanh thu"
--     (CHƯA gồm VAT) đã dùng ở domain `doanhthu_chinhanh`).
--   - "Số Bill" = COUNT(DISTINCT TRANS_NUM).
--
-- ⚠️ CHỈ TÍNH BÁN LẺ, LOẠI HẲN BÁN BUÔN (bản 11.24, SỬA LẠI sau khi đối
-- chiếu với file mẫu THẬT đội MKT gửi lại — file ghi rõ ngay dòng đầu:
-- "Thời gian cập nhật dữ liệu: Đã loại trừ giao dịch bán buôn trong bán
-- lẻ"): domain `doanhthu_chinhanh`/`giaodich_chinhanh` (Doanh thu cuối
-- ngày) dùng TRANS_CODE 211+221+232 trừ 212+222 — GỘP CHUNG bán buôn +
-- bán lẻ ("211=bán buôn, 221=bán lẻ, 232=chưa xác nhận nghĩa cụ thể" —
-- xem "Thiết lập VIEW Doanh thu-Giao dịch chi nhánh..."). Báo cáo MKT
-- này CHỈ muốn đo hiệu quả BÁN LẺ (khách hàng cá nhân/thẻ Elite) — người
-- dùng xác nhận trực tiếp 232 "cũng là bán buôn nhưng cho đại lý theo
-- đơn" — nên domain MỚI này CHỈ dùng TRANS_CODE 221 (bán) trừ 222 (trả),
-- LOẠI HẲN 211/212 (buôn) VÀ 232 (buôn cho đại lý) — KHÁC HẲN công thức
-- "Số Bill" đã dùng ở domain `giaodich_chinhanh` (211+221+232 trừ
-- 212+222) — KHÔNG áp nhầm công thức đó vào đây.
--
-- KHÔNG sửa VIEW/domain `doanhthu_chinhanh`/`giaodich_chinhanh` đang chạy
-- (tránh rủi ro báo cáo hiện có) — domain MỚI HOÀN TOÀN `doanhthu_the_chinhanh`,
-- gộp sẵn CẢ "Tổng" (bán lẻ) lẫn "Qua thẻ" (Số Bill + Doanh số) trong CÙNG
-- 1 VIEW, theo (chi nhánh, ngày) — tầng báo cáo tự tính AOV (= Doanh số /
-- Số Bill) + các mốc so sánh Tuần này/Tuần trước/MTD/MTD năm trước/LFL.
--
-- ⚠️ LƯU Ý RỦI RO SCHEMA LỊCH SỬ (Script B) — nếu 1 vài bảng STRANS_YYYYMM
-- CŨ (DSMART16_EOM) KHÔNG có cột CARD_ID (tính năng thẻ Elite có thể mới
-- thêm sau), Script B bên dưới sẽ lỗi "Invalid column name 'CARD_ID'" khi
-- UNION ALL. Nếu gặp lỗi này, báo lại để sửa Script B bỏ qua CARD_ID ở
-- CÁC BẢNG THÁNG không có cột đó (coi như "chưa có" dữ liệu thẻ cho giai
-- đoạn đó — hợp lý vì tính năng thẻ Elite chưa tồn tại lúc đó).
-- ============================================================================


-- ============================================================================
-- SCRIPT A — chạy trên CSDL `DSMART16` (Live)
-- ============================================================================
CREATE OR ALTER VIEW dbo.V_HCRC_DOANHTHU_THE_CHINHANH AS
SELECT
    d.STK_ID, CAST(d.TRAN_DATE AS DATE) AS WORK_DATE,
    COUNT(DISTINCT CASE WHEN d.TRANS_CODE = '221' THEN d.TRANS_NUM ELSE NULL END)
      - COUNT(DISTINCT CASE WHEN d.TRANS_CODE = '222' THEN d.TRANS_NUM ELSE NULL END) AS SoBillTotal,
    COUNT(DISTINCT CASE WHEN d.TRANS_CODE = '221' AND RTRIM(ISNULL(d.CARD_ID,'')) <> '' THEN d.TRANS_NUM ELSE NULL END)
      - COUNT(DISTINCT CASE WHEN d.TRANS_CODE = '222' AND RTRIM(ISNULL(d.CARD_ID,'')) <> '' THEN d.TRANS_NUM ELSE NULL END) AS SoBillThe,
    SUM(CASE WHEN d.TRANS_CODE = '221' THEN d.AMOUNT + d.SURPLUS + d.VAT_AMT ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE = '222' THEN d.AMOUNT + d.SURPLUS + d.VAT_AMT ELSE 0 END) AS DoanhSoTotal,
    SUM(CASE WHEN d.TRANS_CODE = '221' AND RTRIM(ISNULL(d.CARD_ID,'')) <> '' THEN d.AMOUNT + d.SURPLUS + d.VAT_AMT ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE = '222' AND RTRIM(ISNULL(d.CARD_ID,'')) <> '' THEN d.AMOUNT + d.SURPLUS + d.VAT_AMT ELSE 0 END) AS DoanhSoThe
FROM dbo.STRANS d
WHERE d.STATUS <> 'D'
  AND d.TRANS_CODE IN ('221','222')
GROUP BY d.STK_ID, CAST(d.TRAN_DATE AS DATE);
GO

-- Kiểm tra nhanh: SELECT TOP 20 * FROM dbo.V_HCRC_DOANHTHU_THE_CHINHANH
-- ORDER BY WORK_DATE DESC; — phải thấy SoBillThe/DoanhSoThe <= SoBillTotal/
-- DoanhSoTotal (qua thẻ là tập con của tổng).


-- ============================================================================
-- SCRIPT B — chạy trên CSDL `DSMART16_EOM` (Lịch sử) — CHẠY TAY 1 LẦN
-- ============================================================================
-- Mirror ĐÚNG kỹ thuật UNION ALL tự động ~93 bảng STRANS_YYYYMM + STRANS_EOM
-- đã dùng ở "Thiết lập VIEW Doanh thu-Giao dịch chi nhánh (Script A+B...).sql"
-- — xem file đó để biết đầy đủ lý do kỹ thuật. Chạy NGUYÊN KHỐI (không
-- chèn GO giữa các dòng).
DECLARE @sql NVARCHAR(MAX);

SELECT @sql = STRING_AGG(
    CAST('SELECT STK_ID, TRAN_DATE, TRANS_NUM, TRANS_CODE, AMOUNT, SURPLUS, VAT_AMT, CARD_ID FROM '
    + QUOTENAME(name) + ' WITH (NOLOCK) WHERE STATUS <> ''D'' AND TRANS_CODE IN (''221'',''222'')' AS NVARCHAR(MAX)),
    ' UNION ALL '
)
FROM sys.tables
WHERE name LIKE 'STRANS[_][0-9][0-9][0-9][0-9][0-9][0-9]' OR name = 'STRANS_EOM';

DECLARE @sqlView NVARCHAR(MAX) = N'
CREATE OR ALTER VIEW dbo.V_HCRC_DOANHTHU_THE_CHINHANH AS
SELECT
    d.STK_ID, CAST(d.TRAN_DATE AS DATE) AS WORK_DATE,
    COUNT(DISTINCT CASE WHEN d.TRANS_CODE = ''221'' THEN d.TRANS_NUM ELSE NULL END)
      - COUNT(DISTINCT CASE WHEN d.TRANS_CODE = ''222'' THEN d.TRANS_NUM ELSE NULL END) AS SoBillTotal,
    COUNT(DISTINCT CASE WHEN d.TRANS_CODE = ''221'' AND RTRIM(ISNULL(d.CARD_ID,'''')) <> '''' THEN d.TRANS_NUM ELSE NULL END)
      - COUNT(DISTINCT CASE WHEN d.TRANS_CODE = ''222'' AND RTRIM(ISNULL(d.CARD_ID,'''')) <> '''' THEN d.TRANS_NUM ELSE NULL END) AS SoBillThe,
    SUM(CASE WHEN d.TRANS_CODE = ''221'' THEN d.AMOUNT + d.SURPLUS + d.VAT_AMT ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE = ''222'' THEN d.AMOUNT + d.SURPLUS + d.VAT_AMT ELSE 0 END) AS DoanhSoTotal,
    SUM(CASE WHEN d.TRANS_CODE = ''221'' AND RTRIM(ISNULL(d.CARD_ID,'''')) <> '''' THEN d.AMOUNT + d.SURPLUS + d.VAT_AMT ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE = ''222'' AND RTRIM(ISNULL(d.CARD_ID,'''')) <> '''' THEN d.AMOUNT + d.SURPLUS + d.VAT_AMT ELSE 0 END) AS DoanhSoThe
FROM (' + @sql + N') d
GROUP BY d.STK_ID, CAST(d.TRAN_DATE AS DATE);';

EXEC sp_executesql @sqlView;
GO

-- Kiểm tra: mở rộng DSMART16_EOM → Views → thấy V_HCRC_DOANHTHU_THE_CHINHANH.


-- ============================================================================
-- BẢO TRÌ LÂU DÀI (DSMART16_EOM) — QUAN TRỌNG, KHÔNG BỎ QUA
-- ============================================================================
-- Giống hệt lý do ở "Thiết lập VIEW Doanh thu-Giao dịch chi nhánh..." —
-- Script B phải chạy lại mỗi khi DSMART16 tự tạo thêm bảng STRANS_YYYYMM
-- mới. Đóng gói thành stored procedure, gọi THÊM 1 step vào CHÍNH job
-- "HCRC - Cap nhat lai VIEW V_HCRC_DOANHTHU_CHINHANH" đã có sẵn (nếu đã
-- tạo job đó) thay vì tạo job mới — đỡ phải nhớ thêm 1 job.
CREATE OR ALTER PROCEDURE dbo.sp_HCRC_RebuildDoanhThuTheView AS
BEGIN
    DECLARE @sql NVARCHAR(MAX);
    SELECT @sql = STRING_AGG(
        CAST('SELECT STK_ID, TRAN_DATE, TRANS_NUM, TRANS_CODE, AMOUNT, SURPLUS, VAT_AMT, CARD_ID FROM '
        + QUOTENAME(name) + ' WITH (NOLOCK) WHERE STATUS <> ''D'' AND TRANS_CODE IN (''221'',''222'')' AS NVARCHAR(MAX)),
        ' UNION ALL '
    )
    FROM sys.tables
    WHERE name LIKE 'STRANS[_][0-9][0-9][0-9][0-9][0-9][0-9]' OR name = 'STRANS_EOM';

    DECLARE @sqlView NVARCHAR(MAX) = N'
    CREATE OR ALTER VIEW V_HCRC_DOANHTHU_THE_CHINHANH AS
    SELECT
        d.STK_ID, CAST(d.TRAN_DATE AS DATE) AS WORK_DATE,
        COUNT(DISTINCT CASE WHEN d.TRANS_CODE = ''221'' THEN d.TRANS_NUM ELSE NULL END)
          - COUNT(DISTINCT CASE WHEN d.TRANS_CODE = ''222'' THEN d.TRANS_NUM ELSE NULL END) AS SoBillTotal,
        COUNT(DISTINCT CASE WHEN d.TRANS_CODE = ''221'' AND RTRIM(ISNULL(d.CARD_ID,'''')) <> '''' THEN d.TRANS_NUM ELSE NULL END)
          - COUNT(DISTINCT CASE WHEN d.TRANS_CODE = ''222'' AND RTRIM(ISNULL(d.CARD_ID,'''')) <> '''' THEN d.TRANS_NUM ELSE NULL END) AS SoBillThe,
        SUM(CASE WHEN d.TRANS_CODE = ''221'' THEN d.AMOUNT + d.SURPLUS + d.VAT_AMT ELSE 0 END)
          - SUM(CASE WHEN d.TRANS_CODE = ''222'' THEN d.AMOUNT + d.SURPLUS + d.VAT_AMT ELSE 0 END) AS DoanhSoTotal,
        SUM(CASE WHEN d.TRANS_CODE = ''221'' AND RTRIM(ISNULL(d.CARD_ID,'''')) <> '''' THEN d.AMOUNT + d.SURPLUS + d.VAT_AMT ELSE 0 END)
          - SUM(CASE WHEN d.TRANS_CODE = ''222'' AND RTRIM(ISNULL(d.CARD_ID,'''')) <> '''' THEN d.AMOUNT + d.SURPLUS + d.VAT_AMT ELSE 0 END) AS DoanhSoThe
    FROM (' + @sql + N') d
    GROUP BY d.STK_ID, CAST(d.TRAN_DATE AS DATE);';

    EXEC sp_executesql @sqlView;
END
GO

-- Chạy thử ngay: EXEC dbo.sp_HCRC_RebuildDoanhThuTheView; — không lỗi là xong.

-- Thêm 1 step gọi procedure trên vào job "HCRC - Cap nhat lai VIEW
-- V_HCRC_DOANHTHU_CHINHANH" đã có sẵn (SQL Server Agent → Jobs → đúng tên
-- job → Steps → New Step):
--   Step name: Goi stored procedure sinh lai VIEW The
--   Database:  DSMART16_EOM
--   Command:   EXEC dbo.sp_HCRC_RebuildDoanhThuTheView;
-- Nếu CHƯA có job đó (môi trường mới, chưa từng tạo "Doanh thu-Giao dịch
-- chi nhánh"), tạo job riêng — xem mẫu đầy đủ "sp_add_job"/"sp_add_jobstep"
-- ở file "Thiết lập VIEW Doanh thu-Giao dịch chi nhánh (Script A+B...).sql".
