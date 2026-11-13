/* deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Mã vạch theo SKU (DSMART16).sql
   ============================================================================
   BẢN 10.75 — SỬA LỖI THẬT: API "Giá bán" tra bằng `maVach` trước đây chỉ
   khớp ĐÚNG 1 mã vạch MẶC ĐỊNH (cột `SKU_DEF.BARCODE`, tương ứng
   `dbo.BARCODE.ISDEFAULT = 1`) — xác nhận bằng dữ liệu thật: mã hàng
   290926750000 (G7 Cà phê 3in1) có TỚI 3 mã vạch đăng ký trong
   `dbo.BARCODE` (8935024122310, 8935024123096, 8935024912607 — chỉ mã
   cuối là `ISDEFAULT=1`), nhưng đối tác quét ĐÚNG 1 trong 2 mã KHÔNG mặc
   định lại báo "Không tìm thấy giá" dù mã vạch đó HOÀN TOÀN HỢP LỆ trên
   DSMART16.

   VIEW NÀY lấy TOÀN BỘ mã vạch từ `dbo.BARCODE` (không chỉ mã mặc định),
   dùng cho job đồng bộ RIÊNG `mavach_mahang` (xem
   `etl/scripts/seedMaVachSync.js`) — tách biệt khỏi `vw_GiaBanTheoSKU`
   (không gộp để domain giá không bị NHÂN BA mỗi SKU theo số mã vạch).

   `dbo.BARCODE` KHÔNG có cột ngày giờ nào (đã xác nhận qua
   INFORMATION_SCHEMA.COLUMNS) — không thể đồng bộ tăng dần theo mốc thời
   gian thật. Bảng nhỏ (91.260 dòng, đã xác nhận) nên quét lại TOÀN BỘ mỗi
   lượt là đủ nhanh — dùng `EventDate = CAST(GETDATE() AS DATE)` làm CẢ
   DateColumn lẫn UpdatedAtColumn, giống đúng cách "Tồn kho" đã làm cho
   bảng nguồn không có cột cập nhật mịn (xem "bc-ton-kho-chi-tiet.md").

   AN TOÀN CHẠY LẠI NHIỀU LẦN — `CREATE OR ALTER VIEW`.
   ============================================================================ */

USE DSMART16;
GO

CREATE OR ALTER VIEW dbo.vw_MaVachTheoSKU AS
SELECT
    RTRIM(b.BARCODE) + '_' + CAST(b.SKU_ID AS VARCHAR(50)) AS MaThucThe,
    RTRIM(b.BARCODE)                AS MaVach,
    k.SKU_CODE                      AS MaHangHienThi,
    CAST(GETDATE() AS DATE)         AS EventDate
FROM dbo.BARCODE b
JOIN dbo.SKU_DEF k ON k.SKU_ID = b.SKU_ID
WHERE RTRIM(b.BARCODE) <> '';
GO

-- Kiểm tra nhanh sau khi tạo — mã hàng ví dụ (SKU_ID 290926750000, G7 Cà
-- phê 3in1) phải ra ĐỦ 3 mã vạch, không phải 1:
SELECT v.* FROM dbo.vw_MaVachTheoSKU v
JOIN dbo.SKU_DEF k ON k.SKU_CODE = v.MaHangHienThi
WHERE k.SKU_ID = '290926750000';
SELECT TOP 20 * FROM dbo.vw_MaVachTheoSKU;
