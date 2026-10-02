/* deploy/Thiết lập VIEW + tài khoản etl_reader tại mỗi siêu thị Thành viên.sql
   ============================================================================
   Chạy NGUYÊN VĂN file này trên CSDL DSMART16 TẠI TỪNG SIÊU THỊ (35 lần,
   1 lần/siêu thị) — gộp đúng 3 việc của "Bước 1" + phần "Nguồn dữ liệu"
   trong "báo cáo doanh thu thành viên.md" vào 1 file duy nhất để setup
   nhanh, KHÔNG đổi logic/công thức gì so với tài liệu đó:
     1. Tạo 2 VIEW V_HCRC_DOANHTHU_CHINHANH / V_HCRC_GIAODICH_CHINHANH
        (NGUYÊN VĂN "Script A" — xem "báo cáo doanh thu cuối ngày.md" nếu
        cần đọc lại lịch sử/lý do chọn công thức, không bắt buộc).
     2. Tạo login SQL Server "etl_reader" (CHỈ ĐỌC) — tài khoản report-
        system dùng để đồng bộ Live mỗi 2 phút (xem etl/scripts/
        seedThanhVienLiveSync.js, Username đã cố định "etl_reader").
     3. Cấp quyền SELECT CHỈ TRÊN ĐÚNG 2 VIEW ở trên — KHÔNG cấp quyền trực
        tiếp lên STRANS/STOCK hay bất kỳ bảng nào khác (nguyên tắc tối
        thiểu hoá quyền — đúng khuyến nghị đã áp dụng cho 7 tài khoản nội
        bộ, xem "Hướng dẫn cấp quyền SQL Server cho 4 CSDL...").

   AN TOÀN CHẠY LẠI NHIỀU LẦN — mọi bước đều kiểm tra tồn tại trước khi tạo
   (IF NOT EXISTS), không tạo trùng/không ghi đè mật khẩu cũ nếu login đã có
   sẵn từ trước (xem chú thích ngay tại bước 2 bên dưới).

   BẮT BUỘC: đổi mật khẩu ở dòng CREATE LOGIN bên dưới thành 1 giá trị ngẫu
   nhiên thật trước khi chạy (KHÔNG dùng nguyên placeholder) — rồi dùng
   ĐÚNG mật khẩu đó khi điền vào `password` của siêu thị này trong mảng
   STORES ở etl/scripts/seedThanhVienLiveSync.js.

   Nếu CSDL tại siêu thị KHÔNG đặt tên "DSMART16" (tên khác do lịch sử),
   sửa lại dòng "USE DSMART16;" ngay dưới đây cho khớp tên thật trước khi
   chạy — phần còn lại của file giữ nguyên không cần sửa gì thêm.
   ============================================================================ */

USE DSMART16;
GO

/* ===================== 1. Tạo 2 VIEW (NGUYÊN VĂN Script A) ===================== */

-- VIEW 1: Doanh thu + Lãi gộp + Diện tích + Nhóm chuỗi, gộp theo (chi nhánh, ngày).
-- STRANS = bảng CHI TIẾT giao dịch thật. STOCK.TYPE (KHÔNG phải STYPE_ID —
-- cột đó luôn trống) phân loại '01'=MART, '02'=MINIMART.
-- STRANS có sẵn cột SURPLUS = LÃI GỘP hệ thống POS đã tự tính SẴN cho TỪNG
-- DÒNG giao dịch — KHÔNG cần tra cứu/tính giá vốn từ đâu khác. AMOUNT
-- KHÔNG bao gồm SURPLUS — doanh thu đúng = AMOUNT + SURPLUS. TRANS_CODE:
-- 211/221/232 = bán, 212/222 = TRẢ HÀNG tương ứng (ghi AMOUNT DƯƠNG, phải
-- TRỪ RIÊNG chứ không tự netting qua SUM). Chỉ lấy 5 mã này — các mã khác
-- (vd 333) bị LOẠI HẲN khỏi "Doanh thu". STATUS đọc THẲNG từ STRANS (không
-- cần JOIN TRANSHDR).
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
-- trong STRANS (không cần TRANSHDR), đếm SoGiaoDich = COUNT(DISTINCT
-- TRANS_NUM) thay vì COUNT(*) dòng header — cùng lọc TRANS_CODE/trừ trả
-- hàng như VIEW 1. BU_ID GIỮ NGUYÊN ĐẦY ĐỦ (KHÔNG rút gọn LEFT(BU_ID,3))
-- làm EntityCode, khớp đúng etl.DiemStkMapping.MaDiem.
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

/* ===================== 2. Tạo login/user "etl_reader" (CHỈ ĐỌC) ===================== */

-- Login đã có sẵn (vd siêu thị này trước đó đã khai chung 1 tài khoản đọc
-- khác) -> KHÔNG tạo lại/KHÔNG ghi đè mật khẩu cũ (an toàn chạy lại nhiều
-- lần) — nếu cần ĐỔI mật khẩu, dùng ALTER LOGIN riêng, không sửa khối này.
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'etl_reader')
BEGIN
    CREATE LOGIN etl_reader WITH PASSWORD = 'DOI-MAT-KHAU-NAY-THANH-GIA-TRI-NGAU-NHIEN-THAT';
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'etl_reader')
BEGIN
    CREATE USER etl_reader FOR LOGIN etl_reader;
END
GO

/* ============== 3. Cấp quyền SELECT CHỈ trên 2 VIEW ở trên ============== */
-- CỐ Ý không GRANT SELECT ON SCHEMA::dbo hay lên STRANS/STOCK trực tiếp —
-- etl_reader chỉ cần đọc qua 2 VIEW đã lọc/gộp sẵn ở trên (đúng những gì
-- etl/scripts/seedThanhVienLiveSync.js cấu hình: SourceTable = tên VIEW),
-- không cần (và không nên) thấy dữ liệu thô của toàn bộ CSDL.
GRANT SELECT ON OBJECT::dbo.V_HCRC_DOANHTHU_CHINHANH TO etl_reader;
GRANT SELECT ON OBJECT::dbo.V_HCRC_GIAODICH_CHINHANH TO etl_reader;
GO

/* ===================== Kiểm tra lại sau khi chạy ===================== */
-- 1) Views -> thấy đủ V_HCRC_DOANHTHU_CHINHANH + V_HCRC_GIAODICH_CHINHANH.
-- 2) Security -> Logins -> thấy "etl_reader".
-- 3) Chạy thử (cùng phiên SSMS, không cần đăng nhập lại) để xác nhận VIEW
--    chạy được không lỗi:
--      SELECT TOP 5 * FROM V_HCRC_DOANHTHU_CHINHANH;
--      SELECT TOP 5 * FROM V_HCRC_GIAODICH_CHINHANH;
-- 4) Xác nhận ĐÚNG quyền của etl_reader (chạy câu dưới SAU KHI đăng nhập
--    LẠI bằng chính tài khoản etl_reader, không chạy bằng tài khoản admin):
--      SELECT * FROM fn_my_permissions(NULL, 'DATABASE');
--    Phải thấy CÓ quyền SELECT trên 2 VIEW trên, KHÔNG thấy quyền gì trên
--    STRANS/STOCK trực tiếp.
