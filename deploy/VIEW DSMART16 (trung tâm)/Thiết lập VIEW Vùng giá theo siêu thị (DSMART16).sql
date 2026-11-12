/* deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Vùng giá theo siêu thị (DSMART16).sql
   ============================================================================
   BẢN 10.73 — SỬA LỖI THẬT: job đồng bộ "Vùng giá theo siêu thị - Live
   (DSMART16)" (bản 10.71, đọc TRỰC TIẾP dbo.STOCK, UpdatedAtColumn=MODI_DATE)
   BỎ SÓT VĨNH VIỄN mọi siêu thị có `STOCK.MODI_DATE` = NULL — xác nhận
   bằng dữ liệu thật: mã Điểm "267" (STK_ID '12671', "Cửa hàng HaproFood
   Ecohome3") có `MODI_DATE = NULL` → điều kiện `WHERE MODI_DATE >=
   @lastSyncedAt` luôn UNKNOWN (không phải TRUE) với NULL, dòng này
   KHÔNG BAO GIỜ được chọn để đồng bộ, dù đã có sẵn trong STOCK — API
   "Giá bán" báo lỗi "Chưa xác định được vùng giá" cho đúng siêu thị này.
   Đây CHÍNH XÁC cùng loại lỗi đã ghi nhận ở bản 8.24 ("cột cập nhật lúc
   NULL/thô khiến watermark bỏ sót dòng vĩnh viễn") — xem chú thích
   floorToDay() ở etl/lib/tableSyncEngine.js.

   SỬA: thay vì đồng bộ TRỰC TIẾP từ bảng `STOCK`, tạo VIEW NÀY —
   COALESCE(MODI_DATE, OPEN_DATE, ngày cố định xa trong quá khứ) đảm bảo
   CỘT NGÀY DÙNG LÀM WATERMARK KHÔNG BAO GIỜ NULL, dòng nào cũng được
   chọn đồng bộ bất kể STOCK có ghi MODI_DATE hay không.

   AN TOÀN CHẠY LẠI NHIỀU LẦN — `CREATE OR ALTER VIEW`.
   ============================================================================ */

USE DSMART16;
GO

CREATE OR ALTER VIEW dbo.vw_VungGiaTheoSieuThi AS
SELECT
    RTRIM(s.STK_ID)                                    AS STK_ID,
    s.STK_NAME_U                                        AS TenSieuThi,
    RTRIM(s.ZONE_CODE)                                  AS ZONE_CODE,
    COALESCE(s.MODI_DATE, s.OPEN_DATE, '1900-01-01')    AS CapNhatHoacMo
FROM dbo.STOCK s;
GO

-- Kiểm tra nhanh sau khi tạo — đúng siêu thị từng bị bỏ sót (mã kho
-- '12671') phải xuất hiện ở đây dù ZONE_CODE có thể vẫn rỗng (lỗi RIÊNG,
-- cần DBA khai bổ sung ZONE_CODE cho đúng siêu thị này trên STOCK):
SELECT TOP 20 * FROM dbo.vw_VungGiaTheoSieuThi ORDER BY CapNhatHoacMo DESC;
SELECT * FROM dbo.vw_VungGiaTheoSieuThi WHERE STK_ID = '12671';
