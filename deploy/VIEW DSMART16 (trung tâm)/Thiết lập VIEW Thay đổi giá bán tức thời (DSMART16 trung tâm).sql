/* deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Thay đổi giá bán tức thời (DSMART16 trung tâm).sql
   ============================================================================
   BẢN 10.79 — Báo cáo MỚI "Thay đổi giá bán tức thời" (theo yêu cầu người
   dùng, dựa trên file mẫu thật "Price_Changes...xlsx" — sheet "Thay đổi
   giá bán tức thời" có ghi chú ngay trong file: nguồn là bảng `HISRTPR`
   kết hợp `SKU_DEF`, cột `LASTRTPR` = Giá cũ, `RTPRICE` = Giá mới).

   ĐÃ XÁC NHẬN BẰNG DỮ LIỆU THẬT (17/11/2026) — `HISRTPR` là bảng LOG mỗi
   lần giá bán lẻ (RTPRICE) của 1 mã hàng ở 1 vùng giá thay đổi (ghi NGAY
   LÚC thay đổi, cột `[DATE]` là datetime đầy đủ giờ:phút:giây, KHÔNG có
   watermark NULL như các domain khác đã gặp lỗi trước đây — cột `DATE`
   luôn có giá trị thật).

   Mẫu đã test: mã hàng 296015670000 (Sầu riêng tách vỏ L1) — 28/10/2026
   11:39:20, vùng 001: LASTRTPR=399000 -> RTPRICE=409000. Khớp đúng dữ liệu
   người dùng gửi.

   BẢN 10.84 — thêm `MaNhomHang` (theo yêu cầu người dùng, kèm ảnh mẫu
   khoanh đỏ cột "Mã nhóm hàng"/"Đơn vị") + `DonVi`. ĐÃ XÁC NHẬN BẰNG DỮ
   LIỆU THẬT (17/11/2026, SQL trực tiếp qua đúng tài khoản ETL đang đọc
   nguồn "DSMART16 - Live") — `dbo.SKU_DEF` (bảng ĐÃ JOIN SẴN trong VIEW
   này từ bản 10.79, alias `k`) có sẵn cột `GRP_ID` (varchar) — KHÔNG cần
   bảng `SKU_REF` nào khác (bảng đó chỉ là nhầm lẫn kiểm tra ban đầu,
   SKU_DEF đã có đủ). `DonVi` lấy từ `HISRTPR.UNIT_SYMB` (cùng dòng log
   giá, không cần JOIN thêm). `MaNganhHang` (DEPT_ID) đã có sẵn từ bản
   10.79 (chỉ chưa hiện ra cột báo cáo, nay bổ sung ở
   rp-server/scripts/seedThayDoiGiaReports.js).

   AN TOÀN CHẠY LẠI NHIỀU LẦN — `CREATE OR ALTER VIEW`.
   ============================================================================ */

USE DSMART16;
GO

CREATE OR ALTER VIEW dbo.vw_ThayDoiGiaTucThoi AS
SELECT
    RTRIM(h.SKU_ID) + '_' + RTRIM(h.ZONE_CODE) + '_' + CONVERT(VARCHAR(23), h.[DATE], 121) AS MaThucThe,
    CAST(h.[DATE] AS DATE)      AS EventDate,
    h.[DATE]                    AS ThoiDiemThayDoi,
    RTRIM(h.ZONE_CODE)          AS MaVungGia,
    k.SKU_CODE                  AS MaHangHienThi,
    k.FULL_NAME_U                AS TenHang,
    k.DEPT_ID                   AS MaNganhHang,
    dl.DEPT_NAME_U                AS TenNganhHang,
    RTRIM(k.GRP_ID)              AS MaNhomHang,
    RTRIM(h.UNIT_SYMB)           AS DonVi,
    h.LASTRTPR                  AS GiaCu,
    h.RTPRICE                   AS GiaMoi
FROM dbo.HISRTPR h
JOIN dbo.SKU_DEF k ON k.SKU_ID = h.SKU_ID
LEFT JOIN dbo.DEPTLIST dl ON dl.DEPT_ID = k.DEPT_ID
WHERE RTRIM(h.ZONE_CODE) <> '';
GO

-- Kiểm tra nhanh sau khi tạo — mã hàng mẫu phải ra đúng dòng 28/10/2026,
-- vùng 001, GiaCu=399000, GiaMoi=409000:
SELECT TOP 20 * FROM dbo.vw_ThayDoiGiaTucThoi
WHERE MaHangHienThi = (SELECT SKU_CODE FROM dbo.SKU_DEF WHERE SKU_ID = '296015670000')
ORDER BY ThoiDiemThayDoi DESC;
