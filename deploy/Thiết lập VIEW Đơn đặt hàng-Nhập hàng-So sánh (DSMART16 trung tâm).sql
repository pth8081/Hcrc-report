/* deploy/Thiết lập VIEW Đơn đặt hàng-Nhập hàng-So sánh (DSMART16 trung tâm).sql
   ============================================================================
   Chạy NGUYÊN VĂN file này trên CSDL DSMART16 TRUNG TÂM (1 LẦN DUY NHẤT —
   KHÁC "Thiết lập VIEW ... tại mỗi siêu thị Thành viên.sql" phải chạy 35
   lần, vì đây là CSDL trung tâm chứa đơn hàng của TẤT CẢ siêu thị cùng 1
   nơi, phân biệt bằng cột BU_ID trong cùng bảng) để phục vụ 3 báo cáo:
   "Đơn đặt hàng", "Đơn nhập hàng", "So sánh đặt–nhận" — xem đầy đủ bối
   cảnh/thiết kế trong `bc-don-dat-hang.md` (gốc repo).

   ‼️ CẬP NHẬT 06/10/2026 — ĐÃ CÓ ĐỦ DANH SÁCH 116 CỘT THẬT của ST_ORDER ‼️
   Tên cột bên dưới dùng ĐÚNG tên thật (không còn tên phỏng đoán), NHƯNG
   VẪN CÒN 6 ĐIỂM CẦN DBA XÁC NHẬN Ý NGHĨA (đã biết TÊN cột, chưa chắc Ý
   NGHĨA đúng) trước khi chạy — xem đủ 6 câu hỏi ở mục 2 của
   `bc-don-dat-hang.md`. Các dòng có đánh dấu `<<<` bên dưới là các điểm
   đó — ĐỪNG chạy nguyên văn khi DBA chưa xác nhận xong cả 6 điểm.

   Tóm tắt 6 điểm cần xác nhận:
     1. `ORD_QTY` vs `ORDP_QTY` — cột nào đúng là "SL đặt" (cột "Theo đơn"
        trên phiếu)? Bản dưới đang dùng `ORD_QTY`.
     2. `DLV_QTY` — xác nhận đúng là "SL thực nhận" (cột "Thực nhận" trên
        phiếu), và giá trị khi `STATUS='C'` (chưa nhập) là `0` hay `NULL`.
     3. Tên bảng "danh mục hàng hoá" (JOIN `SKU_ID` lấy Tên hàng) và "danh
        mục nhà cung cấp" (JOIN `SUPP_ID` lấy Tên NCC) — `ST_ORDER` không
        có cột tên trực tiếp, chỉ có mã. VIEW dưới đây tạm để `NULL`,
        CHƯA JOIN — cần DBA cho tên 2 bảng này để hoàn thiện.
     4. `DELIVER_DT` — có đúng là ngày giao/nhận THỰC TẾ không (khác
        `DUE_DATE` = ngày giao dự kiến)?
     5. Watermark cập nhật — `ST_ORDER` KHÔNG có cột nào rõ nghĩa "lần sửa
        gần nhất" (`UPDATED` chỉ là cờ bit). Bản dưới tạm dùng `STOPED_DT`
        — CẦN XÁC NHẬN có đúng nghĩa không, hay cần đổi chiến lược đồng bộ.
     6. `TRANS_CODE='330'` — xác nhận đây là mã CỐ ĐỊNH DUY NHẤT cho "đơn
        đặt hàng" trong `ST_ORDER`, hay bảng còn chứa giao dịch khác.

   Vế TRÁI của mỗi dòng `AS` (tên cột nguồn) PHẢI sửa nếu DBA xác nhận
   khác với bản dưới — vế PHẢI (tên alias sau `AS`) GIỮ NGUYÊN, khớp đúng
   tên cột mà `etl/scripts/seedDonDatHangSync.js` đã viết sẵn để đọc lại.

   AN TOÀN CHẠY LẠI NHIỀU LẦN sau khi đã xác nhận đủ — dùng
   `CREATE OR ALTER VIEW`, không lỗi nếu VIEW đã tồn tại từ lần chạy trước.

   Nếu CSDL không đặt tên "DSMART16" (tên khác do lịch sử), sửa lại dòng
   "USE DSMART16;" ngay dưới đây cho khớp tên thật trước khi chạy.
   ============================================================================ */

USE DSMART16;
GO

/* ===================== VIEW gộp ST_ORDER (tháng hiện tại) + ST_ORDER_ARC (tháng quá khứ) ===================== */

CREATE OR ALTER VIEW dbo.vw_DonDatHangChiNhanh AS
SELECT
    CAST(TRANS_NUM AS VARCHAR(50)) + '|' + CAST(IDX AS VARCHAR(10)) AS MaThucThe,  -- khoá 1 dòng hàng trong 1 đơn (IDX = STT dòng — ĐÃ XÁC NHẬN cấu trúc 1 dòng = 1 SKU)
    CAST(TRAN_DATE AS DATE)     AS EventDate,        -- Ngày đặt — tên cột đã chắc, <<< xác nhận Ý NGHĨA — điểm phụ, ít rủi ro
    STOPED_DT                   AS UpdatedAt,        -- <<< Watermark — CHƯA CHẮC — điểm 5
    BU_ID                       AS MaDiem,           -- ĐÃ XÁC NHẬN đúng — ánh xạ ra mã Điểm chuẩn ở tầng rp-server (buildBuIdLookup())
    NULL                        AS TenDiem,          -- Không có tên siêu thị trực tiếp trong ST_ORDER — hệ thống LUÔN ưu tiên tên trong bảng Ánh xạ Điểm-STK
    TRANS_NUM                   AS SoDon,
    CAST(DUE_DATE AS DATE)      AS NgayGiao,         -- Ngày giao DỰ KIẾN
    CAST(DELIVER_DT AS DATE)    AS NgayNhanThat,     -- <<< MỚI — có thể là ngày giao/nhận THỰC TẾ — điểm 4
    SUPP_ID                     AS MaNCC,
    NULL                        AS TenNCC,           -- <<< Cần JOIN bảng danh mục NCC — điểm 3
    STAFF_ID                    AS NguoiDat,
    SKU_ID                      AS MaHang,
    NULL                        AS TenHang,          -- <<< Cần JOIN bảng danh mục hàng hoá — điểm 3
    UNIT_SYMB                   AS DVT,
    STATUS                      AS TrangThai,
    CASE STATUS
        WHEN 'C' THEN N'Chưa nhập'
        WHEN 'P' THEN N'Đã nhập 1 phần'
        WHEN 'F' THEN N'Đã nhập hết'
        WHEN 'M' THEN N'Đơn sửa'
        WHEN 'D' THEN N'Đã xoá'
        WHEN 'E' THEN N'Đã huỷ'
        ELSE STATUS
    END                         AS TrangThaiLabel,
    ORD_QTY                     AS SoLuongTheoDon,   -- <<< CHƯA CHẮC — ORD_QTY hay ORDP_QTY? — điểm 1
    DLV_QTY                     AS SoLuongThucNhan,  -- <<< khá chắc, vẫn cần xác nhận — điểm 2
    ORD_PRICE                   AS DonGia,
    AMOUNT                      AS ThanhTien
FROM dbo.ST_ORDER
WHERE TRANS_CODE = '330'  -- <<< lọc đúng loại "đơn đặt hàng" — điểm 6
UNION ALL
SELECT
    CAST(TRANS_NUM AS VARCHAR(50)) + '|' + CAST(IDX AS VARCHAR(10)), CAST(TRAN_DATE AS DATE), STOPED_DT, BU_ID, NULL,
    TRANS_NUM, CAST(DUE_DATE AS DATE), CAST(DELIVER_DT AS DATE), SUPP_ID, NULL, STAFF_ID, SKU_ID, NULL, UNIT_SYMB, STATUS,
    CASE STATUS
        WHEN 'C' THEN N'Chưa nhập' WHEN 'P' THEN N'Đã nhập 1 phần' WHEN 'F' THEN N'Đã nhập hết'
        WHEN 'M' THEN N'Đơn sửa' WHEN 'D' THEN N'Đã xoá' WHEN 'E' THEN N'Đã huỷ' ELSE STATUS
    END,
    ORD_QTY, DLV_QTY, ORD_PRICE, AMOUNT
FROM dbo.ST_ORDER_ARC
WHERE TRANS_CODE = '330';
GO

/* ===================== (Tuỳ chọn) Cấp quyền đọc cho tài khoản đồng bộ ===================== */
-- CHỈ chạy nếu đồng bộ đơn đặt hàng dùng 1 tài khoản CHỈ ĐỌC riêng (khác
-- tài khoản DSMART16_USER đã dùng cho báo cáo doanh thu cuối ngày) —
-- nếu dùng LẠI đúng tài khoản đã có sẵn và tài khoản đó đã có quyền SELECT
-- trên schema dbo, BỎ QUA bước này, không cần chạy.
-- GRANT SELECT ON dbo.vw_DonDatHangChiNhanh TO <tên_login_chỉ_đọc>;
-- GO
