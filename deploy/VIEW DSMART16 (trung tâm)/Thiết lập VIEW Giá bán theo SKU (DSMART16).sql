/* deploy/Thiết lập VIEW Giá bán theo SKU (DSMART16).sql
   ============================================================================
   BẢN 10.71+ — API "Giá bán" (giá thường + giá khuyến mại) cho đối tác
   ngoài (BRG Scan and Checkout và các app khác cần tra giá theo mã hàng),
   theo yêu cầu người dùng.

   NGUỒN DỮ LIỆU (đã xác nhận bằng dữ liệu thật, không đoán — xem hội thoại
   điều tra `PTPRICE`/`RTPRICE`/`RDISCINF`):
     - `dbo.RTPRICE` — bảng giá, khoá theo (ZONE_CODE, SKU_ID). Cột
       `RTPRICE` = giá thường. Cột `DISC_CODE`/`DISC_RTPR` — khi `DISC_CODE`
       KHÁC rỗng, `DISC_RTPR` là giá ĐÃ TÍNH SẴN sau khi áp khuyến mại đang
       hiệu lực (xác nhận qua mẫu thật — DSMART tự cập nhật liên tục trong
       ngày, rất có thể qua stored procedure `spK_PriceSync` có sẵn) —
       KHÔNG cần tự tính lại luật khuyến mại phức tạp ở bảng `RDISCINF`.
     - `dbo.SKU_DEF` — mã hàng/tên hàng/mã vạch, CÙNG join đã dùng ở VIEW
       Tồn kho (`FULL_NAME_U`, `BARCODE`).
     - Giá áp theo VÙNG (`ZONE_CODE`), KHÔNG áp riêng từng siêu thị — 1
       siêu thị thuộc đúng 1 vùng, xem `dbo.STOCK.ZONE_CODE` (đồng bộ RIÊNG
       qua job nhỏ "Vùng giá theo siêu thị", xem
       `etl/scripts/seedZoneStkSync.js` — KHÔNG gộp vào VIEW này).

   AN TOÀN CHẠY LẠI NHIỀU LẦN — `CREATE OR ALTER VIEW`.
   ============================================================================ */

USE DSMART16;
GO

CREATE OR ALTER VIEW dbo.vw_GiaBanTheoSKU AS
SELECT
    RTRIM(p.ZONE_CODE) + '_' + CAST(p.SKU_ID AS VARCHAR(50)) AS MaThucThe,
    RTRIM(p.ZONE_CODE)              AS MaVungGia,
    k.SKU_CODE                      AS MaHangHienThi,
    k.FULL_NAME_U                   AS TenHang,
    NULLIF(RTRIM(k.BARCODE), '')    AS MaVach,
    p.RTPRICE                       AS GiaThuong,
    CASE WHEN RTRIM(p.DISC_CODE) <> '' THEN p.DISC_RTPR ELSE NULL END AS GiaKhuyenMai,
    CASE WHEN RTRIM(p.DISC_CODE) <> '' THEN 1 ELSE 0 END AS CoKhuyenMai,
    CAST(GETDATE() AS DATE)         AS EventDate,
    p.MODI_DATE                     AS CapNhatNguon
FROM dbo.RTPRICE p
JOIN dbo.SKU_DEF k ON k.SKU_ID = p.SKU_ID
WHERE RTRIM(p.ZONE_CODE) <> '';  -- bỏ dòng ZONE_CODE rỗng (9 dòng thấy ở mẫu — dữ liệu lỗi/chưa gán vùng, không tra được giá theo siêu thị nào)
GO

-- Kiểm tra nhanh sau khi tạo:
SELECT TOP 20 * FROM dbo.vw_GiaBanTheoSKU ORDER BY CapNhatNguon DESC;
-- Phải thấy cả dòng CoKhuyenMai=1 (có GiaKhuyenMai) lẫn CoKhuyenMai=0 (GiaKhuyenMai NULL):
SELECT TOP 20 * FROM dbo.vw_GiaBanTheoSKU WHERE CoKhuyenMai = 1 ORDER BY CapNhatNguon DESC;
-- Đối chiếu đúng mã hàng/vùng đã biết (vd mã Điểm 001 = ST 120 Hàng Trống, thuộc vùng 002):
SELECT TOP 20 * FROM dbo.vw_GiaBanTheoSKU WHERE MaVungGia = '002';
