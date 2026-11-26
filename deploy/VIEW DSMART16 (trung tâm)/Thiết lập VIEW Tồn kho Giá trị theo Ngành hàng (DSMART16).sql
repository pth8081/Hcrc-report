/* deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Tồn kho Giá trị theo Ngành hàng (DSMART16).sql
   ============================================================================
   BẢN 11.32 — Nguồn dữ liệu cho báo cáo VẬN HÀNH mới "DIO theo ngành hàng"
   (Days Inventory Outstanding — số ngày tồn kho tương đương với tốc độ bán
   ra), báo cáo ĐẦU TIÊN trong 4 báo cáo vận hành mới theo yêu cầu người
   dùng (xem phương án đã gửi — "DIO theo ngành hàng" ưu tiên 1, không cần
   khai báo tay, mọi nguồn đã có sẵn trong hệ thống).

   MỤC ĐÍCH: tính GIÁ TRỊ TỒN KHO hiện tại, gộp theo CHI NHÁNH (STK_ID) ×
   NGÀNH HÀNG (DEPT_ID) — dùng làm TỬ SỐ công thức DIO. MẪU SỐ ("Giá vốn
   bán ra trung bình 3 tháng") tính thẳng từ domain `doanhthu_nganhhang"
   ĐÃ CÓ SẴN (Doanh thu − Lãi gộp = Giá vốn, xem "giá vốn dsmart.md" mục 8),
   KHÔNG cần VIEW riêng cho phần đó — xem đầy đủ công thức DIO ở
   rp-server/lib/dioNganhHangRunner.js.

   CÔNG THỨC GiaTriTon — TÁI DÙNG NGUYÊN VẸN 2 điều đã được DBA/người dùng
   xác nhận ở 2 tài liệu khác (KHÔNG tạo giả định/công thức mới):
     - SoLuongTon = M_BEGIN + M_IMP - M_EXP (STK_INFO) — ĐÚNG công thức đã
       chốt ở VIEW "vw_TonKhoChiTietTheoSKU" (xem "bc-ton-kho-chi-tiet.md"
       + "Thiết lập VIEW Tồn kho Chi tiết theo SKU (DSMART16).sql").
     - Giá vốn đơn vị = STK_INFO.AVERIMPPR (giá vốn bình quân DSMART tự duy
       trì) — ĐÃ CHỐT dùng được, xem "giá vốn dsmart.md" mục 3 (CHỈ đáng
       tin cho thời điểm HIỆN TẠI — đúng nhu cầu ở đây, "tồn kho" luôn là
       số liệu TẠI THỜI ĐIỂM chạy báo cáo, không có khái niệm "tồn kho
       tháng cũ").
   KHÔNG dùng `STK_INFO.END_AMT` (cột "giá trị tồn cuối kỳ" có sẵn trên
   bảng) — "giá vốn dsmart.md" mục 2 ghi rõ cột này "chưa dùng", chưa ai
   xác nhận đáng tin; AVERIMPPR là lựa chọn ĐÃ có xác nhận DBA thật.

   ⚠️ CÔNG THỨC DIO ĐẦY ĐỦ Ở RUNNER CHƯA CHỐT VỚI NGƯỜI DÙNG (xem chú thích
   đầu rp-server/lib/dioNganhHangRunner.js) — sửa công thức đó KHÔNG cần
   đụng VIEW này (VIEW chỉ cấp "Giá trị tồn", không tính DIO).

   AN TOÀN CHẠY LẠI NHIỀU LẦN — `CREATE OR ALTER VIEW`.
   ============================================================================ */

USE DSMART16;
GO

CREATE OR ALTER VIEW dbo.V_HCRC_TONKHO_NGANHHANG AS
SELECT
    si.STK_ID + '_' + k.DEPT_ID AS MaThucThe,
    si.STK_ID, k.DEPT_ID,
    dl.DEPT_NAME_U AS TenNganhHang,
    CAST(GETDATE() AS DATE) AS EventDate,
    SUM((si.M_BEGIN + si.M_IMP - si.M_EXP) * si.AVERIMPPR) AS GiaTriTon
FROM dbo.STK_INFO si
JOIN dbo.SKU_DEF k ON k.SKU_ID = si.SKU_ID
LEFT JOIN dbo.DEPTLIST dl ON dl.DEPT_ID = k.DEPT_ID
GROUP BY si.STK_ID, k.DEPT_ID, dl.DEPT_NAME_U;
GO

-- Kiểm tra nhanh sau khi tạo — phải thấy đủ cột, GiaTriTon > 0 ở hầu hết
-- dòng (chi nhánh/ngành hàng không còn hàng ra 0 hoặc âm nhẹ (hàng trả/
-- điều chỉnh) — không phải lỗi, chỉ bất thường nếu ÂM LỚN/RA NULL HÀNG
-- LOẠT):
SELECT TOP 20 * FROM dbo.V_HCRC_TONKHO_NGANHHANG ORDER BY GiaTriTon DESC;
SELECT COUNT(*) AS SoDongAm FROM dbo.V_HCRC_TONKHO_NGANHHANG WHERE GiaTriTon < 0;
