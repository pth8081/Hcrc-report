/* deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW PMH Full Barcode (DSMART16 trung tâm).sql
   ============================================================================
   BẢN 11.57 — Nguồn dữ liệu cho sheet "Full Barcode" của báo cáo gộp nhiều
   sheet "PMH" (Phòng Mua Hàng, theo yêu cầu người dùng, dựa trên file mẫu
   thật "Mẫu Báo Cáo PMH.xlsx") — xem "bc-pmh.md".

   MỤC ĐÍCH: liệt kê TOÀN BỘ barcode đã đăng ký cho mỗi mã hàng (1 mã hàng
   có thể có NHIỀU barcode) + thông tin cơ bản/giá đi kèm.

   NGUỒN TỪNG CỘT — ĐÃ XÁC NHẬN qua các VIEW khác ĐANG CHẠY THẬT trong hệ
   thống (không đoán mới):
     - Barcode/SKU_ID — `dbo.BARCODE` (bảng RIÊNG, KHÔNG phải
       `SKU_DEF.BARCODE` — cột đó CHỈ giữ ĐÚNG 1 mã vạch MẶC ĐỊNH/SKU, xem
       domain `mavach_mahang` đã có sẵn — ĐÚNG mẫu VIEW
       `dbo.vw_MaVachTheoSKU`, "Thiết lập VIEW Mã vạch theo SKU
       (DSMART16).sql").
     - Mã hàng/Tên hàng/Mã nhóm/Tên nhóm — `dbo.SKU_DEF` (SKU_CODE,
       FULL_NAME_U, GRP_ID, GRP_NAME — đã xác nhận có sẵn, xem
       "bc-thay-doi-gia.md" mục ghi chú GRP_ID/GRP_NAME).
     - Mã NCC/Tên NCC/Đơn vị/Giá nhập — ĐÚNG mẫu
       `dbo.vw_TonKhoChiTietTheoSKU` ("Thiết lập VIEW Tồn kho Chi tiết theo
       SKU (DSMART16).sql") — DSMART16 KHÔNG có khái niệm "NCC mặc định
       của mã hàng" ở bảng danh mục (đã xác nhận ở VIEW đó) — lấy NCC/đơn
       giá của GIAO DỊCH MUA GẦN NHẤT (OUTER APPLY `dbo.STRANS`,
       TRANS_CODE IN ('130','133','330','333') = mua riêng/mua chung, đặt/
       nhập — cùng 4 mã đã xác nhận ở "bc-don-dat-hang.md"). KHÁC VIEW gốc
       ở chỗ KHÔNG lọc theo STK_ID (view gốc theo TỪNG CHI NHÁNH, view này
       theo TOÀN CHUỖI — "Full Barcode" là danh mục cấp công ty, không có
       khái niệm chi nhánh) — lấy giao dịch gần nhất BẤT KỲ CHI NHÁNH NÀO.
     - Giá bán lẻ — `dbo.RTPRICE` (ĐÚNG mẫu `dbo.vw_GiaBanTheoSKU`, "Thiết
       lập VIEW Giá bán theo SKU (DSMART16).sql") — ⚠️ GIẢ ĐỊNH CHƯA CHỐT:
       RTPRICE khoá theo (ZONE_CODE, SKU_ID) — 1 mã hàng có thể có NHIỀU
       giá bán khác nhau theo TỪNG VÙNG GIÁ, nhưng sheet mẫu "Full Barcode"
       KHÔNG có cột vùng giá (chỉ 1 giá/dòng) — TẠM lấy giá của vùng giá
       CÓ MÃ NHỎ NHẤT (ORDER BY ZONE_CODE ASC) làm đại diện, CHƯA CHỐT với
       người dùng — nếu cần giá CHÍNH XÁC theo từng vùng, dùng riêng báo
       cáo "Giá bán theo SKU" (API đối tác) hoặc báo lại để tách thêm cột
       "Vùng giá" ở đây.
     - Giá Vốn chỉ định — `dbo.STK_INFO.AVERIMPPR` (ĐÃ xác nhận DBA thật,
       xem "Thiết lập VIEW Tồn kho Giá trị theo Ngành hàng (DSMART16).sql"
       — "AVERIMPPR là lựa chọn ĐÃ có xác nhận DBA thật") — ⚠️ GIẢ ĐỊNH
       CHƯA CHỐT: STK_INFO khoá theo (STK_ID, SKU_ID) — giá vốn bình quân
       có thể khác nhau giữa các chi nhánh (nhập hàng khác đợt/khác giá) —
       "Full Barcode" không có khái niệm chi nhánh nên lấy TRUNG BÌNH
       CỘNG giá vốn bình quân của TẤT CẢ chi nhánh đang có mã hàng đó
       (AVG(AVERIMPPR)) làm đại diện — CHƯA CHỐT, có thể lệch so với giá
       vốn THẬT tại 1 chi nhánh cụ thể.

   ⚠️ CHƯA CÓ NGUỒN XÁC NHẬN (để NULL, chờ DBA xác nhận bảng/cột thật —
   KHÔNG đoán, xem "bc-pmh.md" mục "Chưa có nguồn"):
     - Thuế Nhập (import tax) — chưa tìm thấy cột thuế suất nào trên
       SKU_DEF/STK_INFO/STRANS trong các VIEW đã xây trước đây.
     - Trạng Thái (mã hàng, vd '01'/'03' trong file mẫu) — chưa tìm thấy
       cột trạng thái mã hàng nào (STRANS.STATUS/STOCK.TYPE là trạng thái
       CHỨNG TỪ/LOẠI CHI NHÁNH, không phải trạng thái MÃ HÀNG).

   ‼️ LƯU Ý HIỆU NĂNG ‼️ — OUTER APPLY tìm giao dịch gần nhất chạy 1 lần/
   dòng `dbo.BARCODE` (91.260 dòng, xem domain `mavach_mahang` đã đồng bộ)
   — KHÁC `vw_TonKhoChiTietTheoSKU` ở chỗ KHÔNG lọc STK_ID (quét
   `dbo.STRANS` CẢ CHUỖI thay vì 1 chi nhánh) — CÓ THỂ CHẬM HƠN view gốc.
   Chạy thử `SELECT TOP 20 * FROM dbo.vw_PMH_FullBarcode` TRƯỚC khi tạo
   job đồng bộ — báo lại NGAY nếu quá chậm (vài giây bình thường, vài
   chục giây/treo thì cần thêm INDEX trên `STRANS(SKU_ID, TRANS_CODE,
   TRAN_DATE)` nếu chưa có, hoặc đổi cách lấy NCC/đơn giá sang nguồn khác.

   AN TOÀN CHẠY LẠI NHIỀU LẦN — `CREATE OR ALTER VIEW`.
   ============================================================================ */

USE DSMART16;
GO

CREATE OR ALTER VIEW dbo.vw_PMH_FullBarcode AS
SELECT
    RTRIM(b.BARCODE) + '_' + CAST(b.SKU_ID AS VARCHAR(50)) AS MaThucThe,
    RTRIM(b.BARCODE)                AS MaVach,
    CAST(b.SKU_ID AS VARCHAR(50))   AS SkuId,
    k.SKU_CODE                      AS MaHangHienThi,
    k.FULL_NAME_U                   AS TenHang,
    k.GRP_ID                        AS MaNhom,
    k.GRP_NAME                      AS TenNhom,
    latest.SUPP_ID                   AS MaNCC,
    s.SUPP_NAME_U                    AS TenNCC,
    RTRIM(latest.UNIT_SYMB)          AS DonVi,
    latest.DonGia                    AS GiaNhapTheoNCC,
    price.RTPRICE                    AS GiaBanLe,
    vonAvg.GiaVonBinhQuan             AS GiaVonChiDinh,
    CAST(GETDATE() AS DATE)          AS EventDate
FROM dbo.BARCODE b
JOIN dbo.SKU_DEF k ON k.SKU_ID = b.SKU_ID
OUTER APPLY (
    SELECT TOP 1 x.SUPP_ID, x.UNIT_SYMB, x.AMOUNT / NULLIF(x.QTY, 0) AS DonGia
    FROM dbo.STRANS x
    WHERE x.SKU_ID = b.SKU_ID
      AND x.TRANS_CODE IN ('130','133','330','333')
      AND x.STATUS NOT IN ('D','E')
    ORDER BY x.TRAN_DATE DESC
) latest
LEFT JOIN dbo.SUPPLIER s ON s.SUPP_ID = latest.SUPP_ID
OUTER APPLY (
    SELECT TOP 1 p.RTPRICE
    FROM dbo.RTPRICE p
    WHERE p.SKU_ID = b.SKU_ID AND RTRIM(p.ZONE_CODE) <> ''
    ORDER BY p.ZONE_CODE ASC
) price
OUTER APPLY (
    SELECT AVG(v.AVERIMPPR) AS GiaVonBinhQuan
    FROM dbo.STK_INFO v
    WHERE v.SKU_ID = b.SKU_ID
) vonAvg
WHERE RTRIM(b.BARCODE) <> '';
GO

-- Kiểm tra nhanh sau khi tạo — phải thấy đủ cột, Giá bán lẻ/Giá Vốn chỉ
-- định/Giá nhập theo NCC có số (không NULL hàng loạt trừ mã hàng thật sự
-- chưa từng bán/nhập/chưa có giá):
SELECT TOP 20 * FROM dbo.vw_PMH_FullBarcode;
-- Đối chiếu 1 mã hàng CÓ NHIỀU barcode (đúng mục đích sheet):
SELECT * FROM dbo.vw_PMH_FullBarcode WHERE MaHangHienThi = (
  SELECT TOP 1 MaHangHienThi FROM dbo.vw_PMH_FullBarcode GROUP BY MaHangHienThi HAVING COUNT(*) > 1
);
