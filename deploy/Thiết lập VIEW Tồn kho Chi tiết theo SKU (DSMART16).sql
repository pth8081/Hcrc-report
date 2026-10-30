/* deploy/Thiết lập VIEW Tồn kho Chi tiết theo SKU (DSMART16).sql
   ============================================================================
   BẢN 9.43+ — Báo cáo "Tồn kho" mới (nhóm Mua hàng), theo yêu cầu người
   dùng: lọc theo ngành hàng, theo siêu thị, theo nhà cung cấp, theo kênh
   mua (mua riêng/mua chung), điều kiện lớn hơn/nhỏ hơn trên Tồn kho hiện
   tại.

   NGUỒN DỮ LIỆU (đã xác nhận với người dùng — xem hội thoại): báo cáo lấy
   TỒN KHO HIỆN TẠI (như VIEW `vw_TonKhoTheoSKU` đã có ở bc-ton-kho-0.md),
   lọc theo Nhà cung cấp/Kênh mua của ĐƠN ĐẶT/NHẬP HÀNG GẦN NHẤT của ĐÚNG mã
   hàng đó tại ĐÚNG chi nhánh đó (KHÔNG phải nhà cung cấp "mặc định" của mã
   hàng — DSMART16 không có khái niệm này, SUPP_ID chỉ tồn tại trên bảng
   giao dịch mua hàng `STRANS`, xem bc-don-dat-hang.md).

   VIEW NÀY MỞ RỘNG `vw_TonKhoTheoSKU` (GIỮ NGUYÊN VIEW đó, không sửa —
   báo cáo "Top bán chạy đang tồn kho = 0"/"Tồn kho theo ngưỡng" vẫn dùng
   nguyên), thêm:
     - Ngành hàng (SKU_DEF.DEPT_ID -> DEPTLIST.DEPT_NAME_U, cùng join đã
       xác nhận hoạt động ở "báo cáo doanh thu-nhập hàng theo ngành hàng.md").
     - Nhà cung cấp + Kênh mua của ĐƠN GẦN NHẤT (OUTER APPLY tìm dòng
       STRANS mới nhất cùng STK_ID+SKU_ID, TRANS_CODE IN ('130','133','330','333')
       — 4 mã đã xác nhận ở "VIEW Đơn đặt hàng Lịch sử (DSMART16_EOM).sql":
       130/133 = mua riêng, 330/333 = mua chung).

   ‼️ LƯU Ý HIỆU NĂNG ‼️ — OUTER APPLY chạy 1 lần/dòng STK_INFO (mỗi chi
   nhánh × mỗi mã hàng), có thể chậm nếu danh mục hàng rất lớn — chạy thử
   VIEW này (`SELECT TOP 20 * FROM dbo.vw_TonKhoChiTietTheoSKU`) trước, báo
   lại nếu quá chậm (vài giây là bình thường, vài chục giây/treo thì cần
   tối ưu lại — có thể thêm INDEX trên STRANS(STK_ID, SKU_ID, TRANS_CODE,
   TRAN_DATE) nếu chưa có).

   AN TOÀN CHẠY LẠI NHIỀU LẦN — `CREATE OR ALTER VIEW`.

   SỬA bản 10.46 (theo yêu cầu người dùng — API "Tồn kho" cho đối tác cần
   thêm "ngày nhập hàng gần nhất") — thêm CỘT MỚI `NgayNhapGanNhat`, qua 1
   OUTER APPLY THỨ 2, RIÊNG BIỆT với `latest` đã có ở trên. KHÔNG dùng
   chung `latest` được — `latest` lấy GẦN NHẤT trong CẢ 4 mã (130/133 =
   mua riêng ĐẶT/NHẬP, 330/333 = mua chung ĐẶT/NHẬP), nên có thể ra NGÀY
   ĐẶT HÀNG (130/330) nếu đặt mới hơn lần nhập gần nhất — SAI Ý "ngày
   NHẬP". `latestNhap` dưới đây CHỈ xét `133`/`333` (đúng 2 mã "nhập hàng",
   xem "bc-don-dat-hang.md" mục "KẾT LUẬN THIẾT KẾ").

   SỬA bản 10.50 (theo yêu cầu người dùng — API "Tồn kho" cho đối tác cần
   thêm mã vạch) — thêm CỘT MỚI `MaVach`, lấy từ `SKU_DEF.BARCODE` (bảng
   `k` ĐÃ JOIN SẴN từ trước, không JOIN thêm bảng nào). Đã xác nhận bằng
   dữ liệu thật (DBA chạy `SELECT TOP 5 * FROM dbo.SKU_DEF`) — cột
   `BARCODE` char(20) có giá trị mã vạch chuẩn EAN-13 thật (vd
   "8934696001589"), cột `UPC_CODE` char(20) RỖNG ở mọi dòng mẫu nên
   KHÔNG dùng. `BARCODE` là cột CHAR cố định độ dài, cần `RTRIM` bỏ
   khoảng trắng đệm bên phải, và `NULLIF(..., '')` để trả `NULL` (không
   phải chuỗi rỗng) cho mã hàng chưa khai mã vạch.
   ============================================================================ */

USE DSMART16;
GO

CREATE OR ALTER VIEW dbo.vw_TonKhoChiTietTheoSKU AS
SELECT
    d.STK_ID + '_' + CAST(d.SKU_ID AS VARCHAR(50)) AS MaThucThe,
    d.STK_ID                    AS MaChiNhanh,
    st.STK_NAME_U                AS TenChiNhanh,
    k.SKU_CODE                  AS MaHangHienThi,
    k.FULL_NAME_U                AS TenHang,
    NULLIF(RTRIM(k.BARCODE), '') AS MaVach,  -- bản 10.50 — mã vạch thật (EAN-13), SKU_DEF đã JOIN sẵn
    k.DEPT_ID                   AS MaNganhHang,
    dl.DEPT_NAME_U                AS TenNganhHang,
    latest.SUPP_ID               AS MaNCC,
    s.SUPP_NAME_U                 AS TenNCC,
    CASE WHEN latest.TRANS_CODE IN ('130','133') THEN N'Mua riêng'
         WHEN latest.TRANS_CODE IN ('330','333') THEN N'Mua chung'
         ELSE NULL END           AS KenhMua,
    CAST(GETDATE() AS DATE)      AS EventDate,
    (d.M_BEGIN + d.M_IMP - d.M_EXP) AS SoLuongTon,  -- DBA xác nhận: SL tồn cuối (xem bc-ton-kho-0.md)
    latestNhap.TRAN_DATE          AS NgayNhapGanNhat,  -- bản 10.46 — CHỈ 133/333 (nhập hàng thật), KHÔNG lẫn ngày đặt
    GETDATE()                    AS UpdatedAt
FROM dbo.STK_INFO d
JOIN dbo.SKU_DEF k ON k.SKU_ID = d.SKU_ID
JOIN dbo.STOCK st ON st.STK_ID = d.STK_ID
LEFT JOIN dbo.DEPTLIST dl ON dl.DEPT_ID = k.DEPT_ID
OUTER APPLY (
    SELECT TOP 1 x.SUPP_ID, x.TRANS_CODE
    FROM dbo.STRANS x
    WHERE x.STK_ID = d.STK_ID AND x.SKU_ID = d.SKU_ID
      AND x.TRANS_CODE IN ('130','133','330','333')
      AND x.STATUS NOT IN ('D','E')
    ORDER BY x.TRAN_DATE DESC
) latest
LEFT JOIN dbo.SUPPLIER s ON s.SUPP_ID = latest.SUPP_ID
OUTER APPLY (
    SELECT TOP 1 CAST(y.TRAN_DATE AS DATE) AS TRAN_DATE
    FROM dbo.STRANS y
    WHERE y.STK_ID = d.STK_ID AND y.SKU_ID = d.SKU_ID
      AND y.TRANS_CODE IN ('133','333')
      AND y.STATUS NOT IN ('D','E')
    ORDER BY y.TRAN_DATE DESC
) latestNhap;
GO

-- Kiểm tra nhanh sau khi tạo — phải thấy đủ cột, tên ngành hàng/NCC KHÔNG
-- lỗi font (đã dùng *_U), 1 vài dòng CÓ MaNCC/TenNCC/KenhMua (mã hàng có
-- lịch sử đặt/nhập hàng), 1 vài dòng NULL (mã hàng chưa từng có đơn —
-- bình thường, không phải lỗi):
SELECT TOP 20 * FROM dbo.vw_TonKhoChiTietTheoSKU ORDER BY SoLuongTon DESC;
SELECT TOP 20 * FROM dbo.vw_TonKhoChiTietTheoSKU WHERE MaNCC IS NOT NULL;
-- bản 10.46 — kiểm tra riêng cột mới, phải thấy 1 vài dòng CÓ NgayNhapGanNhat
-- (mã hàng có lịch sử nhập hàng thật), 1 vài dòng NULL (chưa từng nhập) —
-- bình thường, không phải lỗi:
SELECT TOP 20 MaHangHienThi, TenHang, NgayNhapGanNhat FROM dbo.vw_TonKhoChiTietTheoSKU WHERE NgayNhapGanNhat IS NOT NULL;
-- bản 10.50 — kiểm tra cột MaVach, phải thấy mã vạch 13 số thật (vd
-- "8934696001589"), không còn khoảng trắng đệm ở cuối:
SELECT TOP 20 MaHangHienThi, TenHang, MaVach FROM dbo.vw_TonKhoChiTietTheoSKU WHERE MaVach IS NOT NULL;
