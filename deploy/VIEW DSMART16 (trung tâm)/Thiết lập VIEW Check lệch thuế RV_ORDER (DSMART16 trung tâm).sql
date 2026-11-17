/* deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Check lệch thuế RV_ORDER (DSMART16 trung tâm).sql
   ============================================================================
   BẢN 10.80 — Báo cáo MỚI "Check lệch thuế RV_ORDER" (theo yêu cầu người
   dùng, dựa trên file mẫu thật "Check_RV_ORDER...xlsx" đội vận hành đang
   tự xuất tay để rà soát).

   ĐÃ XÁC NHẬN VỚI DBA DSMART16 (17/11/2026):
   - `RV_ORDER.OSTK_ID` = Mã NCC NỘI BỘ (NCC mua chung với FJ).
   - `RV_ORDER.SUPP_ID` = Mã NCC THỰC GIAO.
   - "Lệch giữa mã thuế và giá trị thuế" = `TAX_CODE` (mã thuế, vd T1/T5)
     KHÔNG phải miễn thuế ('K0'/rỗng) NHƯNG `TAX_AMT` (giá trị thuế) = 0 —
     ĐÃ xác nhận bằng dữ liệu thật: toàn bộ dòng `TRANS_CODE = '315'` hiện
     tại đều rơi vào tình trạng này (TAX_AMT luôn ghi 0 dù TAX_CODE khác
     K0) — VIEW này lọc SẴN chỉ ra đúng các dòng lệch, không cần báo cáo
     tự lọc lại.

   Đây là VIEW CẢNH BÁO/KIỂM TRA (giống "bc-canh-bao-ton.md") — lọc SẴN
   trong VIEW, không phải VIEW dữ liệu gốc đầy đủ.

   AN TOÀN CHẠY LẠI NHIỀU LẦN — `CREATE OR ALTER VIEW`.
   ============================================================================ */

USE DSMART16;
GO

CREATE OR ALTER VIEW dbo.vw_CheckLechThueRVOrder AS
SELECT
    RTRIM(r.TRANS_NUM) + '_' + CAST(r.IDX AS VARCHAR(10)) AS MaThucThe,
    CAST(r.TRAN_DATE AS DATE)   AS EventDate,
    RTRIM(r.TRANS_NUM)          AS SoChungTu,
    RTRIM(r.SKU_ID)             AS MaHang,
    k.SKU_CODE                   AS MaHangHienThi,
    k.FULL_NAME_U                 AS TenHang,
    RTRIM(r.OSTK_ID)            AS MaNccNoiBo,
    s1.SUPP_NAME_U                AS TenNccNoiBo,
    RTRIM(r.SUPP_ID)            AS MaNccThucGiao,
    s2.SUPP_NAME_U                AS TenNccThucGiao,
    RTRIM(r.TAX_CODE)           AS MaThue,
    r.AMOUNT                    AS TongGiaTri,
    r.TAX_AMT                   AS GiaTriThue
FROM dbo.RV_ORDER r
LEFT JOIN dbo.SKU_DEF k ON k.SKU_ID = r.SKU_ID
LEFT JOIN dbo.SUPPLIER s1 ON s1.SUPP_ID = r.OSTK_ID
LEFT JOIN dbo.SUPPLIER s2 ON s2.SUPP_ID = r.SUPP_ID
WHERE r.TRANS_CODE = '315'
  AND RTRIM(r.TAX_CODE) NOT IN ('K0', '')
  AND ISNULL(r.TAX_AMT, 0) = 0
  AND r.AMOUNT <> 0;
GO

-- Kiểm tra nhanh sau khi tạo — phải ra nhiều dòng (hiện tại gần như 100%
-- chứng từ TRANS_CODE=315 đang lệch):
SELECT TOP 20 * FROM dbo.vw_CheckLechThueRVOrder ORDER BY EventDate DESC;
