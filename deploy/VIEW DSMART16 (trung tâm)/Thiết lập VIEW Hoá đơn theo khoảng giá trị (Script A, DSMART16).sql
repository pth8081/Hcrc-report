-- Thiết lập VIEW Hoá đơn theo khoảng giá trị (Script A, DSMART16)
-- ============================================================================
-- BẢN 11.47 — THEO YÊU CẦU ĐỘI MKT, bổ sung thêm cho "Báo cáo khách hàng
-- theo tuần" (bc-khach-hang-theo-tuan) — dựa trên file mẫu thật đội MKT
-- gửi ("Báo cáo khách hàng theo tuần MKT BO SUNG.xlsx") — thêm 2 nhóm 14
-- khoảng GIÁ TRỊ hoá đơn (bill), 1 nhóm cho TẤT CẢ giao dịch bán lẻ, 1
-- nhóm CHỈ giao dịch có thẻ BRG Elite/app BRGMart. MỖI khoảng tách 2 cột
-- — "Số lượng" (đếm số hoá đơn rơi vào khoảng đó) + "Giá trị" (CỘNG DỒN
-- giá trị các hoá đơn đó — vd 10 hoá đơn cùng 45.000đ thì Số lượng=10,
-- Giá trị=450.000) — theo yêu cầu người dùng, xác nhận trực tiếp qua hội
-- thoại (không có trong file mẫu gốc, file mẫu CHỈ có 14 cột đếm).
--
-- ⚠️ GIẢ ĐỊNH CẦN XÁC NHẬN (chưa có trong file mẫu gốc, không suy ra
-- được 100% từ tên cột — nêu rõ để đối chiếu trước khi chạy thật):
--   1. "Giá trị hoá đơn" = TỔNG AMOUNT+SURPLUS+VAT_AMT của CÙNG 1
--      TRANS_NUM (1 hoá đơn = 1 TRANS_NUM) — ĐÚNG công thức "Doanh số"
--      đã chốt cho domain `doanhthu_the_chinhanh` (xem "Thiết lập VIEW
--      Doanh thu theo Thẻ chi nhánh...sql"), GỒM VAT.
--   2. CHỈ tính hoá đơn BÁN (TRANS_CODE = '221') — KHÔNG trừ/gộp hoá đơn
--      TRẢ HÀNG ('222') vào phân bổ khoảng giá trị (1 hoá đơn trả hàng
--      KHÔNG phải "hoá đơn mua" theo đúng nghĩa cột "Hoá đơn" của MKT —
--      khác domain `doanhthu_the_chinhanh` vốn TRỪ số bill trả hàng khỏi
--      tổng số bill, ở đây chỉ ĐƠN GIẢN không đếm nó vào khoảng nào).
--   3. Mỗi "khoảng <X" là 1 khoảng RIÊNG (không chồng lấn, cộng dồn ĐÚNG
--      bằng tổng số/giá trị hoá đơn) — cận trên lấy ĐÚNG theo tên cột,
--      cận dưới = cận trên của cột liền trước (cột đầu tiên cận dưới =
--      0): <50k, [50k-100k), [100k-150k), [150k-200k), [200k-250k),
--      [250k-300k), [300k-350k), [350k-400k), [400k-500k), [500k-1tr),
--      [1tr-1.5tr), [1.5tr-2tr), [2tr-3tr), >=3tr. (Khoảng cuối cùng của
--      file mẫu ghi "HĐ >3.000.000đ" — ĐÚNG dấu ">", khác 13 khoảng
--      trước đều ghi "<".)
--   4. Khoảng "HĐ <2.000.0000đ" trong file mẫu gốc THỪA 1 số 0 (lẽ ra
--      phải là "2.000.000đ" = 2 triệu, khớp đúng thứ tự tăng dần giữa
--      khoảng trước "<1.500.000đ" và khoảng sau "<3.000.000đ") — ĐÃ SỬA
--      LẠI đúng "2.000.000đ" khi triển khai, coi đây là lỗi đánh máy của
--      file mẫu.
--   5. "Qua thẻ BRG Elite/app BRGMart" = CÙNG định nghĩa `CARD_ID` đã
--      chốt ở domain `doanhthu_the_chinhanh` (KHÔNG phải khái niệm mới).
--
-- KHÔNG sửa VIEW/domain `doanhthu_the_chinhanh` đang chạy (tránh rủi ro
-- báo cáo hiện có) — domain MỚI HOÀN TOÀN `hoadon_khoanggia_chinhanh`.
--
-- CHỈ LÀM "Live" (DSMART16) — KHÔNG làm "Lịch sử" (DSMART16_EOM): 2 nhóm
-- cột mới này trong file mẫu CHỈ có 1 cột "W" (tuần này), KHÔNG có W-1/
-- LFL như 6 nhóm chỉ số cũ — không cần dữ liệu lịch sử năm trước.
-- ============================================================================

USE DSMART16;
GO

CREATE OR ALTER VIEW dbo.V_HCRC_HOADON_KHOANGGIA_CHINHANH AS
WITH BillTotals AS (
    -- 1 dòng/hoá đơn (TRANS_NUM) — gộp các dòng chi tiết CÙNG hoá đơn lại
    -- để tính ĐÚNG giá trị CẢ hoá đơn trước khi xếp khoảng.
    SELECT
        s.STK_ID,
        CAST(s.TRAN_DATE AS DATE) AS WORK_DATE,
        s.TRANS_NUM,
        MAX(CASE WHEN RTRIM(ISNULL(s.CARD_ID,'')) <> '' THEN 1 ELSE 0 END) AS CoThe,
        SUM(s.AMOUNT + s.SURPLUS + s.VAT_AMT) AS GiaTriHoaDon
    FROM dbo.STRANS s
    WHERE s.STATUS <> 'D' AND s.TRANS_CODE = '221'
    GROUP BY s.STK_ID, CAST(s.TRAN_DATE AS DATE), s.TRANS_NUM
)
SELECT
    STK_ID, WORK_DATE,

    -- ===== Số lượng + Giá trị — TẤT CẢ giao dịch (14 khoảng x 2 cột) =====
    SUM(CASE WHEN GiaTriHoaDon < 50000 THEN 1 ELSE 0 END) AS B50KTotalSL,
    SUM(CASE WHEN GiaTriHoaDon < 50000 THEN GiaTriHoaDon ELSE 0 END) AS B50KTotalGT,
    SUM(CASE WHEN GiaTriHoaDon >= 50000 AND GiaTriHoaDon < 100000 THEN 1 ELSE 0 END) AS B100KTotalSL,
    SUM(CASE WHEN GiaTriHoaDon >= 50000 AND GiaTriHoaDon < 100000 THEN GiaTriHoaDon ELSE 0 END) AS B100KTotalGT,
    SUM(CASE WHEN GiaTriHoaDon >= 100000 AND GiaTriHoaDon < 150000 THEN 1 ELSE 0 END) AS B150KTotalSL,
    SUM(CASE WHEN GiaTriHoaDon >= 100000 AND GiaTriHoaDon < 150000 THEN GiaTriHoaDon ELSE 0 END) AS B150KTotalGT,
    SUM(CASE WHEN GiaTriHoaDon >= 150000 AND GiaTriHoaDon < 200000 THEN 1 ELSE 0 END) AS B200KTotalSL,
    SUM(CASE WHEN GiaTriHoaDon >= 150000 AND GiaTriHoaDon < 200000 THEN GiaTriHoaDon ELSE 0 END) AS B200KTotalGT,
    SUM(CASE WHEN GiaTriHoaDon >= 200000 AND GiaTriHoaDon < 250000 THEN 1 ELSE 0 END) AS B250KTotalSL,
    SUM(CASE WHEN GiaTriHoaDon >= 200000 AND GiaTriHoaDon < 250000 THEN GiaTriHoaDon ELSE 0 END) AS B250KTotalGT,
    SUM(CASE WHEN GiaTriHoaDon >= 250000 AND GiaTriHoaDon < 300000 THEN 1 ELSE 0 END) AS B300KTotalSL,
    SUM(CASE WHEN GiaTriHoaDon >= 250000 AND GiaTriHoaDon < 300000 THEN GiaTriHoaDon ELSE 0 END) AS B300KTotalGT,
    SUM(CASE WHEN GiaTriHoaDon >= 300000 AND GiaTriHoaDon < 350000 THEN 1 ELSE 0 END) AS B350KTotalSL,
    SUM(CASE WHEN GiaTriHoaDon >= 300000 AND GiaTriHoaDon < 350000 THEN GiaTriHoaDon ELSE 0 END) AS B350KTotalGT,
    SUM(CASE WHEN GiaTriHoaDon >= 350000 AND GiaTriHoaDon < 400000 THEN 1 ELSE 0 END) AS B400KTotalSL,
    SUM(CASE WHEN GiaTriHoaDon >= 350000 AND GiaTriHoaDon < 400000 THEN GiaTriHoaDon ELSE 0 END) AS B400KTotalGT,
    SUM(CASE WHEN GiaTriHoaDon >= 400000 AND GiaTriHoaDon < 500000 THEN 1 ELSE 0 END) AS B500KTotalSL,
    SUM(CASE WHEN GiaTriHoaDon >= 400000 AND GiaTriHoaDon < 500000 THEN GiaTriHoaDon ELSE 0 END) AS B500KTotalGT,
    SUM(CASE WHEN GiaTriHoaDon >= 500000 AND GiaTriHoaDon < 1000000 THEN 1 ELSE 0 END) AS B1TrTotalSL,
    SUM(CASE WHEN GiaTriHoaDon >= 500000 AND GiaTriHoaDon < 1000000 THEN GiaTriHoaDon ELSE 0 END) AS B1TrTotalGT,
    SUM(CASE WHEN GiaTriHoaDon >= 1000000 AND GiaTriHoaDon < 1500000 THEN 1 ELSE 0 END) AS B1Tr5TotalSL,
    SUM(CASE WHEN GiaTriHoaDon >= 1000000 AND GiaTriHoaDon < 1500000 THEN GiaTriHoaDon ELSE 0 END) AS B1Tr5TotalGT,
    SUM(CASE WHEN GiaTriHoaDon >= 1500000 AND GiaTriHoaDon < 2000000 THEN 1 ELSE 0 END) AS B2TrTotalSL,
    SUM(CASE WHEN GiaTriHoaDon >= 1500000 AND GiaTriHoaDon < 2000000 THEN GiaTriHoaDon ELSE 0 END) AS B2TrTotalGT,
    SUM(CASE WHEN GiaTriHoaDon >= 2000000 AND GiaTriHoaDon < 3000000 THEN 1 ELSE 0 END) AS B3TrTotalSL,
    SUM(CASE WHEN GiaTriHoaDon >= 2000000 AND GiaTriHoaDon < 3000000 THEN GiaTriHoaDon ELSE 0 END) AS B3TrTotalGT,
    SUM(CASE WHEN GiaTriHoaDon >= 3000000 THEN 1 ELSE 0 END) AS BTren3TrTotalSL,
    SUM(CASE WHEN GiaTriHoaDon >= 3000000 THEN GiaTriHoaDon ELSE 0 END) AS BTren3TrTotalGT,

    -- ===== Số lượng + Giá trị — CHỈ giao dịch qua thẻ Elite/app (14 x 2) =====
    SUM(CASE WHEN CoThe = 1 AND GiaTriHoaDon < 50000 THEN 1 ELSE 0 END) AS B50KTheSL,
    SUM(CASE WHEN CoThe = 1 AND GiaTriHoaDon < 50000 THEN GiaTriHoaDon ELSE 0 END) AS B50KTheGT,
    SUM(CASE WHEN CoThe = 1 AND GiaTriHoaDon >= 50000 AND GiaTriHoaDon < 100000 THEN 1 ELSE 0 END) AS B100KTheSL,
    SUM(CASE WHEN CoThe = 1 AND GiaTriHoaDon >= 50000 AND GiaTriHoaDon < 100000 THEN GiaTriHoaDon ELSE 0 END) AS B100KTheGT,
    SUM(CASE WHEN CoThe = 1 AND GiaTriHoaDon >= 100000 AND GiaTriHoaDon < 150000 THEN 1 ELSE 0 END) AS B150KTheSL,
    SUM(CASE WHEN CoThe = 1 AND GiaTriHoaDon >= 100000 AND GiaTriHoaDon < 150000 THEN GiaTriHoaDon ELSE 0 END) AS B150KTheGT,
    SUM(CASE WHEN CoThe = 1 AND GiaTriHoaDon >= 150000 AND GiaTriHoaDon < 200000 THEN 1 ELSE 0 END) AS B200KTheSL,
    SUM(CASE WHEN CoThe = 1 AND GiaTriHoaDon >= 150000 AND GiaTriHoaDon < 200000 THEN GiaTriHoaDon ELSE 0 END) AS B200KTheGT,
    SUM(CASE WHEN CoThe = 1 AND GiaTriHoaDon >= 200000 AND GiaTriHoaDon < 250000 THEN 1 ELSE 0 END) AS B250KTheSL,
    SUM(CASE WHEN CoThe = 1 AND GiaTriHoaDon >= 200000 AND GiaTriHoaDon < 250000 THEN GiaTriHoaDon ELSE 0 END) AS B250KTheGT,
    SUM(CASE WHEN CoThe = 1 AND GiaTriHoaDon >= 250000 AND GiaTriHoaDon < 300000 THEN 1 ELSE 0 END) AS B300KTheSL,
    SUM(CASE WHEN CoThe = 1 AND GiaTriHoaDon >= 250000 AND GiaTriHoaDon < 300000 THEN GiaTriHoaDon ELSE 0 END) AS B300KTheGT,
    SUM(CASE WHEN CoThe = 1 AND GiaTriHoaDon >= 300000 AND GiaTriHoaDon < 350000 THEN 1 ELSE 0 END) AS B350KTheSL,
    SUM(CASE WHEN CoThe = 1 AND GiaTriHoaDon >= 300000 AND GiaTriHoaDon < 350000 THEN GiaTriHoaDon ELSE 0 END) AS B350KTheGT,
    SUM(CASE WHEN CoThe = 1 AND GiaTriHoaDon >= 350000 AND GiaTriHoaDon < 400000 THEN 1 ELSE 0 END) AS B400KTheSL,
    SUM(CASE WHEN CoThe = 1 AND GiaTriHoaDon >= 350000 AND GiaTriHoaDon < 400000 THEN GiaTriHoaDon ELSE 0 END) AS B400KTheGT,
    SUM(CASE WHEN CoThe = 1 AND GiaTriHoaDon >= 400000 AND GiaTriHoaDon < 500000 THEN 1 ELSE 0 END) AS B500KTheSL,
    SUM(CASE WHEN CoThe = 1 AND GiaTriHoaDon >= 400000 AND GiaTriHoaDon < 500000 THEN GiaTriHoaDon ELSE 0 END) AS B500KTheGT,
    SUM(CASE WHEN CoThe = 1 AND GiaTriHoaDon >= 500000 AND GiaTriHoaDon < 1000000 THEN 1 ELSE 0 END) AS B1TrTheSL,
    SUM(CASE WHEN CoThe = 1 AND GiaTriHoaDon >= 500000 AND GiaTriHoaDon < 1000000 THEN GiaTriHoaDon ELSE 0 END) AS B1TrTheGT,
    SUM(CASE WHEN CoThe = 1 AND GiaTriHoaDon >= 1000000 AND GiaTriHoaDon < 1500000 THEN 1 ELSE 0 END) AS B1Tr5TheSL,
    SUM(CASE WHEN CoThe = 1 AND GiaTriHoaDon >= 1000000 AND GiaTriHoaDon < 1500000 THEN GiaTriHoaDon ELSE 0 END) AS B1Tr5TheGT,
    SUM(CASE WHEN CoThe = 1 AND GiaTriHoaDon >= 1500000 AND GiaTriHoaDon < 2000000 THEN 1 ELSE 0 END) AS B2TrTheSL,
    SUM(CASE WHEN CoThe = 1 AND GiaTriHoaDon >= 1500000 AND GiaTriHoaDon < 2000000 THEN GiaTriHoaDon ELSE 0 END) AS B2TrTheGT,
    SUM(CASE WHEN CoThe = 1 AND GiaTriHoaDon >= 2000000 AND GiaTriHoaDon < 3000000 THEN 1 ELSE 0 END) AS B3TrTheSL,
    SUM(CASE WHEN CoThe = 1 AND GiaTriHoaDon >= 2000000 AND GiaTriHoaDon < 3000000 THEN GiaTriHoaDon ELSE 0 END) AS B3TrTheGT,
    SUM(CASE WHEN CoThe = 1 AND GiaTriHoaDon >= 3000000 THEN 1 ELSE 0 END) AS BTren3TrTheSL,
    SUM(CASE WHEN CoThe = 1 AND GiaTriHoaDon >= 3000000 THEN GiaTriHoaDon ELSE 0 END) AS BTren3TrTheGT
FROM BillTotals
GROUP BY STK_ID, WORK_DATE;
GO

-- Kiểm tra nhanh: SELECT TOP 20 * FROM dbo.V_HCRC_HOADON_KHOANGGIA_CHINHANH
-- ORDER BY WORK_DATE DESC; — cộng 14 cột "...TotalSL" của 1 dòng phải
-- bằng ĐÚNG tổng số hoá đơn bán (221) ngày đó (KHÔNG nhất thiết bằng
-- SoBillTotal ở domain `doanhthu_the_chinhanh` vì domain đó CÓ trừ hoá
-- đơn trả hàng, domain này KHÔNG trừ — xem giả định số 2 ở trên); cộng
-- 14 cột "...TotalGT" phải bằng TỔNG giá trị các hoá đơn bán ngày đó;
-- mỗi cột "...The..." <= cột "...Total..." tương ứng.
