/* deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Doanh thu tổng hợp theo siêu thị HCRC (DSMART16 trung tâm).sql
   ============================================================================
   ⚠️ KHÔNG CÒN DÙNG TỪ BẢN 10.86 — báo cáo đã đổi sang tái dùng domain
   `doanhthu_nganhhang`/`doanhthu_chinhanh` có sẵn thay vì VIEW này (xem
   "bc-doanh-thu-tong-hop-hcrc.md" mục ghi chú bản 10.86). GIỮ LẠI file
   này chỉ để tham khảo — KHÔNG CẦN chạy nữa.

   BẢN 10.82 — Báo cáo MỚI "Báo cáo tổng hợp doanh thu siêu thị hàng ngày"
   (theo yêu cầu người dùng, dựa trên file mẫu thật đội vận hành đang tự
   tổng hợp tay — "Bao_cao_ban_Doanh_thu_hang_ngay_he_thong_HCRC_T11.2026.xlsx",
   mỗi sheet 1 ngày, mỗi dòng 1 siêu thị, 3 khối Ngày/Tháng/Năm).

   VIEW này GỘP THEO (STK_ID, ngày) — Y HỆT GROUP BY của
   `V_HCRC_DOANHTHU_CHINHANH` đã chốt (xem "báo cáo doanh thu cuối ngày.md"
   Script A — STRANS.TRANS_CODE 211/221/232=bán, 212/222=trả, AMOUNT+SURPLUS
   = doanh thu, SURPLUS = lãi gộp), CHỈ THÊM: tách DoanhThuBanLe/DoanhThuBanBuon
   (công thức ĐÃ chốt ở `V_HCRC_DOANHTHU_NGANHHANG`, xem "báo cáo doanh
   thu-nhập hàng theo ngành hàng.md") + cột `DiaDiem` (STOCK.PLACE, CHƯA
   từng lấy ra ở domain nào khác).

   KHÔNG đụng/sửa VIEW `V_HCRC_DOANHTHU_CHINHANH` đã có (theo đúng tiền lệ
   "tạo MỚI HOÀN TOÀN, không sửa VIEW đang chạy" — xem
   "bc-doanh-thu-sku-nganhhang.md" mục 1).

   AN TOÀN CHẠY LẠI NHIỀU LẦN — `CREATE OR ALTER VIEW`.
   ============================================================================ */

USE DSMART16;
GO

CREATE OR ALTER VIEW dbo.vw_DoanhThuTongHopHCRC AS
SELECT
    d.STK_ID + '_' + CONVERT(VARCHAR(10), CAST(d.TRAN_DATE AS DATE), 112) AS MaThucThe,
    d.STK_ID,
    CAST(d.TRAN_DATE AS DATE) AS WORK_DATE,
    SUM(CASE WHEN d.TRANS_CODE IN ('211','221','232') THEN d.AMOUNT + d.SURPLUS ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE IN ('212','222') THEN d.AMOUNT + d.SURPLUS ELSE 0 END) AS DoanhThu,
    SUM(CASE WHEN d.TRANS_CODE = '221' THEN d.AMOUNT + d.SURPLUS ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE = '222' THEN d.AMOUNT + d.SURPLUS ELSE 0 END) AS DoanhThuBanLe,
    SUM(CASE WHEN d.TRANS_CODE = '211' THEN d.AMOUNT + d.SURPLUS ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE = '212' THEN d.AMOUNT + d.SURPLUS ELSE 0 END) AS DoanhThuBanBuon,
    SUM(CASE WHEN d.TRANS_CODE IN ('211','221','232') THEN d.SURPLUS ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE IN ('212','222') THEN d.SURPLUS ELSE 0 END) AS LaiGop,
    MAX(s.DIMENSION)  AS DienTich,
    MAX(s.PLACE)       AS DiaDiem,
    MAX(CASE WHEN s.TYPE = '01' THEN 'MART'
             WHEN s.TYPE = '02' THEN 'MINIMART'
             ELSE s.TYPE END) AS Chain
FROM dbo.STRANS d
JOIN dbo.STOCK s ON s.STK_ID = d.STK_ID
WHERE d.STATUS <> 'D' -- 'D' = Huỷ
  AND d.TRANS_CODE IN ('211','221','232','212','222')
GROUP BY d.STK_ID, CAST(d.TRAN_DATE AS DATE);
GO
