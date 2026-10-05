/* deploy/Thiết lập VIEW Đơn đặt hàng-Nhập hàng-So sánh (DSMART16 trung tâm).sql
   ============================================================================
   Chạy NGUYÊN VĂN file này trên CSDL DSMART16 TRUNG TÂM (1 LẦN DUY NHẤT —
   KHÁC "Thiết lập VIEW ... tại mỗi siêu thị Thành viên.sql" phải chạy 35
   lần, vì đây là CSDL trung tâm chứa đơn hàng của TẤT CẢ siêu thị cùng 1
   nơi, phân biệt bằng 1 cột mã siêu thị trong cùng bảng) để phục vụ 3 báo
   cáo: "Đơn đặt hàng", "Đơn nhập hàng", "So sánh đặt–nhận" — xem đầy đủ bối
   cảnh/thiết kế trong `bc-don-dat-hang.md` (gốc repo) và
   `deploy/Cập nhật bản 8.75 — Báo cáo Đơn đặt hàng-Nhập hàng-So sánh.md`.

   ‼️ BẮT BUỘC — FILE NÀY DÙNG TÊN CỘT PHỎNG ĐOÁN, CHƯA PHẢI TÊN THẬT ‼️
   Phần "Nguồn dữ liệu" trong bối cảnh dưới đây được suy ra từ 1 file PDF
   mẫu "Phiếu đặt hàng" in ra (không phải đọc trực tiếp cấu trúc bảng SQL)
   — DBA PHẢI ĐỐI CHIẾU VÀ SỬA LẠI đúng tên cột thật của `ST_ORDER`/
   `ST_ORDER_ARC` (vế TRÁI của mỗi dòng `AS`, phần có đánh dấu "<<<" bên
   dưới) TRƯỚC KHI chạy — KHÔNG được chạy nguyên văn khi chưa đối chiếu.
   Vế PHẢI (tên alias sau `AS`) PHẢI GIỮ NGUYÊN — khớp đúng tên cột mà
   `etl/scripts/seedDonDatHangSync.js` đã viết sẵn để đọc lại từ VIEW này.

   5 điểm CẦN DBA XÁC NHẬN LẠI trước khi chạy thật (chi tiết xem mục 2 của
   `bc-don-dat-hang.md`):
     1. Tên cột NGÀY ĐẶT thật (vd `ORDER_DT`) — dưới đây tạm đặt `NgayDat`.
     2. Tên cột WATERMARK cập nhật (phản ánh ĐÚNG lần sửa gần nhất, kể cả
        khi đơn chuyển trạng thái C→P→F hoặc bị sửa — STATUS='M') — KHÔNG
        dùng cột ngày đặt (không đổi khi đơn được cập nhật sau đó).
     3. Tên cột MÃ SIÊU THỊ thật trong `ST_ORDER` (dưới đây tạm đặt
        `STK_ID`) — xác nhận đúng là CSDL trung tâm, 1 cột phân biệt siêu
        thị ngay trong cùng bảng (không phải nhiều CSDL tách riêng).
     4. `SoLuongThucNhan` khi `STATUS='C'` (chưa nhập) trả về `0` hay
        `NULL` — cả 2 đều cho kết quả ĐÚNG ở báo cáo "So sánh", chỉ cần
        biết trước để không nhầm là lỗi dữ liệu.
     5. `ST_ORDER`/`ST_ORDER_ARC` có đúng cấu trúc "1 dòng = 1 dòng hàng
        (SKU) trong 1 đơn" hay là "1 dòng = 1 đơn hàng" (SL/mã hàng nằm ở
        bảng khác, cần JOIN thêm) — VIEW dưới đây giả định dòng chi tiết.

   AN TOÀN CHẠY LẠI NHIỀU LẦN sau khi đã sửa đúng tên cột — dùng
   `CREATE OR ALTER VIEW`, không lỗi nếu VIEW đã tồn tại từ lần chạy trước.

   Nếu CSDL không đặt tên "DSMART16" (tên khác do lịch sử), sửa lại dòng
   "USE DSMART16;" ngay dưới đây cho khớp tên thật trước khi chạy.
   ============================================================================ */

USE DSMART16;
GO

/* ===================== VIEW gộp ST_ORDER (tháng hiện tại) + ST_ORDER_ARC (tháng quá khứ) ===================== */

CREATE OR ALTER VIEW dbo.vw_DonDatHangChiNhanh AS
SELECT
    CAST(SoDon AS VARCHAR(50)) + '|' + CAST(STT AS VARCHAR(10)) AS MaThucThe,  -- khoá duy nhất 1 dòng hàng trong 1 đơn
    CAST(NgayDat AS DATE)       AS EventDate,        -- <<< SỬA: tên cột NGÀY ĐẶT thật (vd ORDER_DT) — điểm 1
    UpdatedAt                   AS UpdatedAt,        -- <<< SỬA: tên cột WATERMARK cập nhật thật — điểm 2
    STK_ID                      AS MaDiem,           -- <<< SỬA: tên cột MÃ SIÊU THỊ thật — điểm 3 (mã thô, hệ thống báo cáo tự ánh xạ lại thành mã Điểm chuẩn, không sửa gì thêm ở đây)
    TenSieuThiDSmart            AS TenDiem,          -- tên siêu thị theo DSmart16 (dự phòng, hệ thống ưu tiên dùng bảng Ánh xạ Điểm-STK nếu có)
    SoDon                       AS SoDon,
    CAST(NgayGiao AS DATE)      AS NgayGiao,
    MaNCC                       AS MaNCC,
    TenNCC                      AS TenNCC,
    NguoiDat                    AS NguoiDat,
    MaHang                      AS MaHang,
    TenHang                     AS TenHang,
    MaVach                      AS MaVach,
    DVT                         AS DVT,
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
    SoLuongTheoDon              AS SoLuongTheoDon,   -- SL đặt (cột "Theo đơn" trên phiếu) — tên cột thật cần xác nhận
    SoLuongThucNhan             AS SoLuongThucNhan,  -- SL nhận thật (cột "Thực nhận" trên phiếu) — xem điểm 4 về giá trị khi STATUS='C'
    DonGia                      AS DonGia,
    ThanhTien                   AS ThanhTien
FROM dbo.ST_ORDER
UNION ALL
SELECT
    CAST(SoDon AS VARCHAR(50)) + '|' + CAST(STT AS VARCHAR(10)), CAST(NgayDat AS DATE), UpdatedAt, STK_ID, TenSieuThiDSmart,
    SoDon, CAST(NgayGiao AS DATE), MaNCC, TenNCC, NguoiDat, MaHang, TenHang, MaVach, DVT, STATUS,
    CASE STATUS
        WHEN 'C' THEN N'Chưa nhập' WHEN 'P' THEN N'Đã nhập 1 phần' WHEN 'F' THEN N'Đã nhập hết'
        WHEN 'M' THEN N'Đơn sửa' WHEN 'D' THEN N'Đã xoá' WHEN 'E' THEN N'Đã huỷ' ELSE STATUS
    END,
    SoLuongTheoDon, SoLuongThucNhan, DonGia, ThanhTien
FROM dbo.ST_ORDER_ARC;
GO

/* ===================== (Tuỳ chọn) Cấp quyền đọc cho tài khoản đồng bộ ===================== */
-- CHỈ chạy nếu đồng bộ đơn đặt hàng dùng 1 tài khoản CHỈ ĐỌC riêng (khác
-- tài khoản DSMART16_USER đã dùng cho báo cáo doanh thu cuối ngày) —
-- nếu dùng LẠI đúng tài khoản đã có sẵn và tài khoản đó đã có quyền SELECT
-- trên schema dbo, BỎ QUA bước này, không cần chạy.
-- GRANT SELECT ON dbo.vw_DonDatHangChiNhanh TO <tên_login_chỉ_đọc>;
-- GO
