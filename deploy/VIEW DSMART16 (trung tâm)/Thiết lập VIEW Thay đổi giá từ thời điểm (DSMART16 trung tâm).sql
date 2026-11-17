/* deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Thay đổi giá từ thời điểm (DSMART16 trung tâm).sql
   ============================================================================
   BẢN 10.79 — Báo cáo MỚI "Thay đổi giá từ thời điểm" (theo yêu cầu người
   dùng, dựa trên file mẫu thật "Price_Changes...xlsx" — sheet "Thay đổi
   giá từ thời điểm" có ghi chú ngay trong file: nguồn là bảng `RTPRPRG`
   kết hợp `SKU_DEF`, cột `A_RTPR` = Giá mới, `A_DATE` = Ngày áp dụng, lọc
   theo `MODI_DATE`).

   ĐÃ XÁC NHẬN BẰNG DỮ LIỆU THẬT (17/11/2026) — `RTPRPRG` là bảng các ĐỢT
   THAY ĐỔI GIÁ ĐƯỢC LÊN LỊCH TRƯỚC (chưa áp dụng ngay, áp dụng vào đúng
   ngày `A_DATE` trong tương lai) — khác hẳn `HISRTPR` (ghi log thay đổi
   NGAY LÚC xảy ra). `RTPRICE` ở bảng này là giá HIỆN TẠI (trước khi đổi) =
   "Giá cũ", `A_RTPR` là giá SẼ ÁP DỤNG = "Giá mới". 1 "đợt" (`PR_DOC`) có
   thể gồm NHIỀU mã hàng/vùng giá cùng lúc — mẫu test thật 17/11/2026 thấy
   đợt "100261117004"/"TDG 002 12.12.26" đổi giá CÙNG LÚC 8 mã hàng ở vùng
   002, áp dụng rải rác 19/11 hoặc 10/12/2026 tuỳ mã hàng.

   `MaThucThe` ghép `PR_DOC + SKU_ID + ZONE_CODE` (KHÔNG dùng cột `IDX` —
   đã xác nhận `IDX` KHÔNG phải số thứ tự duy nhất trong 1 đợt, nhiều mã
   hàng khác nhau cùng đợt có thể trùng `IDX`).

   AN TOÀN CHẠY LẠI NHIỀU LẦN — `CREATE OR ALTER VIEW`.
   ============================================================================ */

USE DSMART16;
GO

CREATE OR ALTER VIEW dbo.vw_ThayDoiGiaTuThoiDiem AS
SELECT
    RTRIM(p.PR_DOC) + '_' + RTRIM(p.SKU_ID) + '_' + RTRIM(p.ZONE_CODE) AS MaThucThe,
    CAST(p.MODI_DATE AS DATE)   AS EventDate,
    p.MODI_DATE                  AS CapNhatLuc,
    RTRIM(p.ZONE_CODE)          AS MaVungGia,
    k.SKU_CODE                  AS MaHangHienThi,
    k.FULL_NAME_U                AS TenHang,
    k.DEPT_ID                   AS MaNganhHang,
    dl.DEPT_NAME_U                AS TenNganhHang,
    p.RTPRICE                   AS GiaCu,
    p.A_RTPR                    AS GiaMoi,
    CAST(p.A_DATE AS DATE)      AS NgayApDung,
    RTRIM(p.PR_DOC)             AS MaDotThayDoi,
    p.DESCRIPT                  AS MoTaDot
FROM dbo.RTPRPRG p
JOIN dbo.SKU_DEF k ON k.SKU_ID = p.SKU_ID
LEFT JOIN dbo.DEPTLIST dl ON dl.DEPT_ID = k.DEPT_ID
WHERE RTRIM(p.ZONE_CODE) <> '';
GO

-- Kiểm tra nhanh sau khi tạo:
SELECT TOP 20 * FROM dbo.vw_ThayDoiGiaTuThoiDiem ORDER BY CapNhatLuc DESC;
