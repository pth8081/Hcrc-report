/* ============================================================================
   VIEW "Doanh thu theo Mã hàng-Ngành hàng" (bản 10.40, DSMART16 trung tâm)

   THEO YÊU CẦU NGƯỜI DÙNG — "Báo cáo nhập hàng theo ngành hàng" đã có bộ
   lọc "Mã hàng" (ảnh chụp thật) nhưng "Doanh thu theo ngành hàng" (HCRC/
   LDTD) THÌ CHƯA, vì VIEW nguồn `V_HCRC_DOANHTHU_NGANHHANG` đã CỘNG GỘP
   SẴN theo (STK_ID, DEPT_ID, ngày) — KHÔNG còn giữ lại mã hàng từng dòng.

   Người dùng đồng ý KHÔNG đụng vào VIEW/2 báo cáo hiện có (để tránh rủi
   ro tăng tải/ảnh hưởng dữ liệu đang chạy) — thay vào đó tạo VIEW + domain
   + báo cáo MỚI HOÀN TOÀN, CÙNG CÔNG THỨC Doanh thu/Lãi gộp đã chốt (xem
   "báo cáo doanh thu-nhập hàng theo ngành hàng.md" mục 2 — nguyên bản
   STRANS/TRANS_CODE/SURPLUS), CHỈ KHÁC: KHÔNG gộp SKU_ID vào GROUP BY —
   giữ lại TỪNG MÃ HÀNG làm 1 dòng riêng, để lọc được theo Mã hàng.

   ⚠️ LƯU Ý QUAN TRỌNG VỀ DUNG LƯỢNG: VIEW gốc cho ra ~1 dòng/(siêu thị,
   ngành hàng, ngày). VIEW này cho ra ~1 dòng/(siêu thị, MÃ HÀNG, ngày) —
   có thể nhiều hơn HÀNG TRĂM/HÀNG NGHÌN LẦN số dòng đồng bộ mỗi ngày (tuỳ
   số mã hàng đang hoạt động) — đã được người dùng xác nhận chấp nhận đánh
   đổi này.

   Chỉ làm "Phase 1 — hệ gốc/trung tâm" (domain mới `doanhthu_sku_nganhhang`,
   đọc DSMART16 trung tâm) — CHƯA làm bản "Lịch sử (DSMART16_EOM)"/"(Thành
   viên)" ở bản này (có thể thêm sau nếu người dùng cần, theo đúng mẫu
   seedNganhHangSync.js/seedThanhVienHistorySync.js đã có).

   Nếu CSDL không đặt tên "DSMART16", sửa lại dòng "USE DSMART16;" cho khớp
   tên thật trước khi chạy.
   ============================================================================ */

USE DSMART16;
GO

CREATE OR ALTER VIEW dbo.V_HCRC_DOANHTHU_SKU_NGANHHANG AS
SELECT
    s.STK_ID + '_' + s.SKU_ID AS MaThucThe,
    s.STK_ID,
    s.SKU_ID                   AS MaHang,
    d.SKU_CODE                 AS MaHangHienThi,     -- mã hàng hiển thị (khớp quy ước domain banhang_sku/tonkho_sku)
    d.FULL_NAME_U               AS TenHang,           -- tên thật, Unicode (xem "giá vốn dsmart.md" mục 5, bản 8.9)
    d.DEPT_ID                   AS MaNganhHang,
    dl.DEPT_NAME_U               AS TenNganhHang,     -- Unicode, KHÔNG dùng DEPT_NAME (lỗi font)
    CAST(s.TRAN_DATE AS DATE)  AS WORK_DATE,
    SUM(CASE WHEN s.TRANS_CODE IN ('211','221','232') THEN s.QTY ELSE 0 END)
      - SUM(CASE WHEN s.TRANS_CODE IN ('212','222') THEN s.QTY ELSE 0 END) AS SoLuongBan,
    SUM(CASE WHEN s.TRANS_CODE IN ('211','221','232') THEN s.AMOUNT + s.SURPLUS ELSE 0 END)
      - SUM(CASE WHEN s.TRANS_CODE IN ('212','222') THEN s.AMOUNT + s.SURPLUS ELSE 0 END) AS DoanhThu,
    SUM(CASE WHEN s.TRANS_CODE = '221' THEN s.AMOUNT + s.SURPLUS ELSE 0 END)
      - SUM(CASE WHEN s.TRANS_CODE = '222' THEN s.AMOUNT + s.SURPLUS ELSE 0 END) AS DoanhThuBanLe,
    SUM(CASE WHEN s.TRANS_CODE = '211' THEN s.AMOUNT + s.SURPLUS ELSE 0 END)
      - SUM(CASE WHEN s.TRANS_CODE = '212' THEN s.AMOUNT + s.SURPLUS ELSE 0 END) AS DoanhThuBanBuon,
    SUM(CASE WHEN s.TRANS_CODE IN ('211','221','232') THEN s.SURPLUS ELSE 0 END)
      - SUM(CASE WHEN s.TRANS_CODE IN ('212','222') THEN s.SURPLUS ELSE 0 END) AS LaiGop,
    SUM(CASE WHEN s.TRANS_CODE = '221' THEN s.SURPLUS ELSE 0 END)
      - SUM(CASE WHEN s.TRANS_CODE = '222' THEN s.SURPLUS ELSE 0 END) AS LaiGopBanLe,
    SUM(CASE WHEN s.TRANS_CODE = '211' THEN s.SURPLUS ELSE 0 END)
      - SUM(CASE WHEN s.TRANS_CODE = '212' THEN s.SURPLUS ELSE 0 END) AS LaiGopBanBuon,
    SUM(CASE WHEN s.TRANS_CODE = '318' THEN s.AMOUNT + s.SURPLUS ELSE 0 END) AS GiaTriHongHuy
FROM dbo.STRANS s
JOIN dbo.SKU_DEF d ON d.SKU_ID = s.SKU_ID
LEFT JOIN dbo.DEPTLIST dl ON dl.DEPT_ID = d.DEPT_ID
WHERE s.STATUS <> 'D' AND s.TRANS_CODE IN ('211','221','232','212','222','318')
GROUP BY s.STK_ID, s.SKU_ID, d.SKU_CODE, d.FULL_NAME_U, d.DEPT_ID, dl.DEPT_NAME_U, CAST(s.TRAN_DATE AS DATE);
GO
