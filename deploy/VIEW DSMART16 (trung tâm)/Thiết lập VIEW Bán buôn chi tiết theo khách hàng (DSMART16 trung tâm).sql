/* deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Bán buôn chi tiết theo khách hàng (DSMART16 trung tâm).sql
   ============================================================================
   BẢN 10.81 — Báo cáo MỚI "Bán buôn chi tiết theo khách hàng" (theo yêu
   cầu người dùng, dựa trên file mẫu thật "Ban_buon_chi_tiet_ngay...xlsx"
   đội vận hành đang tự xuất tay).

   ĐÃ XÁC NHẬN BẰNG DỮ LIỆU THẬT + DBA (17/11/2026):
   - Giao dịch BÁN BUÔN là `dbo.STRANS` với `TRANS_CODE IN ('211','212')`
     (211=bán buôn, 212=trả hàng buôn — ĐÚNG công thức Doanh thu/Bán buôn
     đã chốt ở "báo cáo doanh thu-nhập hàng theo ngành hàng.md", tái dùng
     nguyên không đổi).
   - Nối sang khách hàng BUÔN qua CẶP CỘT `OSTK_ID`/`OSTK_TYPE = '04'`
     (KHÔNG phải `CUST_ID` — bảng STRANS không có cột này) — `OSTK_ID` lúc
     đó CHÍNH LÀ mã khách.
   - Bảng khách hàng DOANH NGHIỆP/bán buôn là `dbo.DEALER` (KHÔNG phải
     `dbo.CUSTOMER` — bảng đó chỉ chứa khách lẻ/thành viên cá nhân, mã
     "23..."). Đã test khớp CHÍNH XÁC mã khách mẫu "240000000018" ra đúng
     "Công ty TNHH Maersk", mã số thuế (`TAX_ID`) "0303728327".
   - `cs_grp`/`cs_level` (tên cột trong file Excel mẫu) = `DEALER.GRP_ID`/
     `DEALER.CS_LEVEL`.
   - "Doanh số" (gồm VAT) = `AMOUNT + SURPLUS + VAT_AMT`; "Doanh thu"
     (chưa gồm VAT) = `AMOUNT + SURPLUS` — đã xác nhận khớp CHÍNH XÁC với
     số liệu thật trong file Excel mẫu (vd 252.777,78 + 20.222,22 =
     273.000,00).

   **Tên siêu thị**: VIEW này CHỈ trả `STK_ID` thô — dịch sang tên CHUẨN ở
   tầng báo cáo qua "Ánh xạ Điểm - STK_ID" (bắt buộc theo `CLAUDE.md`),
   KHÔNG JOIN thẳng `dbo.STOCK` ở đây.

   BẢN 10.88 — thêm `MaNhomHang` (theo yêu cầu người dùng — "Mã ngành
   hàng, Nhóm hàng và mã NCC... mấy cái này đã có thông tin ở báo cáo
   trước rồi") — `dbo.SKU_DEF` (alias `k`) ĐÃ JOIN SẴN từ bản 10.81, chỉ
   cần chọn thêm cột `GRP_ID` (giống đúng cách đã làm cho VIEW "Thay đổi
   giá bán tức thời" ở bản 10.84) — KHÔNG JOIN thêm bảng nào.
   `MaNganhHang`/`MaNCC` đã có SẴN từ bản 10.81 (chỉ chưa hiện cột báo
   cáo, bổ sung ở rp-server/scripts/seedBanBuonChiTietReport.js).

   AN TOÀN CHẠY LẠI NHIỀU LẦN — `CREATE OR ALTER VIEW`.
   ============================================================================ */

USE DSMART16;
GO

CREATE OR ALTER VIEW dbo.vw_BanBuonChiTiet AS
SELECT
    RTRIM(s.STK_ID) + '_' + RTRIM(s.OSTK_ID) + '_' + RTRIM(s.SKU_ID) AS MaThucThe,
    RTRIM(s.STK_ID)             AS STK_ID,
    CAST(s.TRAN_DATE AS DATE)  AS WORK_DATE,
    RTRIM(s.OSTK_ID)            AS MaKhach,
    MAX(cu.CUST_NAME_U)          AS TenKhach,
    MAX(RTRIM(cu.GRP_ID))       AS NhomKhach,
    MAX(cu.CS_LEVEL)            AS CapKhach,
    MAX(cu.TAX_ID)               AS MaSoThueKhach,
    RTRIM(s.SKU_ID)             AS MaHang,
    MAX(k.SKU_CODE)              AS MaHangHienThi,
    MAX(k.FULL_NAME_U)            AS TenHang,
    MAX(NULLIF(RTRIM(k.BARCODE), '')) AS MaVach,
    MAX(k.DEPT_ID)               AS MaNganhHang,
    MAX(dl.DEPT_NAME_U)           AS TenNganhHang,
    MAX(RTRIM(k.GRP_ID))         AS MaNhomHang,
    MAX(RTRIM(s.TAX_CODE))      AS MaThueMatHang,
    MAX(RTRIM(s.SUPP_ID))       AS MaNCC,
    MAX(sup.SUPP_NAME_U)         AS TenNCC,
    SUM(CASE WHEN s.TRANS_CODE = '211' THEN s.QTY ELSE 0 END)
      - SUM(CASE WHEN s.TRANS_CODE = '212' THEN s.QTY ELSE 0 END) AS SoLuongBan,
    SUM(CASE WHEN s.TRANS_CODE = '211' THEN s.AMOUNT + s.SURPLUS ELSE 0 END)
      - SUM(CASE WHEN s.TRANS_CODE = '212' THEN s.AMOUNT + s.SURPLUS ELSE 0 END) AS DoanhThu,
    SUM(CASE WHEN s.TRANS_CODE = '211' THEN s.AMOUNT + s.SURPLUS + s.VAT_AMT ELSE 0 END)
      - SUM(CASE WHEN s.TRANS_CODE = '212' THEN s.AMOUNT + s.SURPLUS + s.VAT_AMT ELSE 0 END) AS DoanhSo
FROM dbo.STRANS s
JOIN dbo.DEALER cu ON cu.CUST_ID = s.OSTK_ID
JOIN dbo.SKU_DEF k ON k.SKU_ID = s.SKU_ID
LEFT JOIN dbo.DEPTLIST dl ON dl.DEPT_ID = k.DEPT_ID
LEFT JOIN dbo.SUPPLIER sup ON sup.SUPP_ID = s.SUPP_ID
WHERE s.TRANS_CODE IN ('211', '212') AND s.OSTK_TYPE = '04' AND RTRIM(s.OSTK_ID) <> ''
GROUP BY s.STK_ID, s.OSTK_ID, s.SKU_ID, CAST(s.TRAN_DATE AS DATE);
GO

-- Kiểm tra nhanh sau khi tạo — khách hàng mẫu "Công ty TNHH Maersk" phải
-- ra đúng tên, mã số thuế, và nhiều dòng mã hàng:
SELECT TOP 20 * FROM dbo.vw_BanBuonChiTiet WHERE MaKhach = '240000000018' ORDER BY WORK_DATE DESC;
