/* deploy/Thiết lập VIEW Đơn đặt hàng-Nhập hàng-So sánh (DSMART16 trung tâm).sql
   ============================================================================
   Chạy NGUYÊN VĂN file này trên CSDL DSMART16 TRUNG TÂM (1 LẦN DUY NHẤT —
   KHÁC "Thiết lập VIEW ... tại mỗi siêu thị Thành viên.sql" phải chạy 35
   lần, vì đây là CSDL trung tâm chứa đơn hàng của TẤT CẢ siêu thị cùng 1
   nơi, phân biệt bằng 1 cột mã siêu thị trong cùng bảng) để phục vụ 3 báo
   cáo: "Đơn đặt hàng", "Đơn nhập hàng", "So sánh đặt–nhận" — xem đầy đủ bối
   cảnh/thiết kế trong `bc-don-dat-hang.md` (gốc repo) và
   `deploy/Cập nhật bản 8.75 — Báo cáo Đơn đặt hàng-Nhập hàng-So sánh.md`.

   ‼️ BẮT BUỘC — FILE NÀY VẪN CHƯA ĐỦ, CÒN THIẾU CỘT HÀNG HOÁ ‼️
   Cập nhật 06/10/2026 (sau khi chạy SQL kiểm tra thật trên ST_ORDER):
     ĐÃ XÁC NHẬN: mã siêu thị = cột **BU_ID** (KHÔNG phải STK_ID như đoán
     ban đầu — khớp đúng "quy tắc mã BU_ID và STK_ID.md"), cột STATUS tồn
     tại đúng tên, và nhiều cột khác đã lộ tên thật (TRANS_NUM, TRANS_CODE,
     TRAN_DATE, TRAN_TIME, EF_DATE, DUE_DATE, DELIVER_DT, FINISH_DT,
     STOPED_DT, REF_NO, REF_DATE, REF_TYPE, REF, EXPIRY_DT).
     VẪN CHƯA THẤY cột nào cho: mã hàng, tên hàng, số lượng đặt, số lượng
     thực nhận, đơn giá, thành tiền, mã/tên nhà cung cấp — CHƯA ĐỦ DỮ LIỆU
     để hoàn thiện VIEW này. KHÔNG CHẠY file này cho tới khi đã bổ sung đủ.
   Xem đầy đủ danh sách "còn thiếu gì" + câu SELECT kiểm tra tiếp theo ở
   mục 2 của `bc-don-dat-hang.md` (gốc repo) — file NÀY sẽ được cập nhật
   lại ngay khi có đủ thông tin.

   5 điểm CẦN DBA XÁC NHẬN LẠI trước khi chạy thật (chi tiết xem mục 2 của
   `bc-don-dat-hang.md`):
     1. [MỚI, QUAN TRỌNG NHẤT] Toàn bộ cột còn lại của `ST_ORDER` — đặc
        biệt mã hàng/tên hàng/SL đặt/SL nhận/đơn giá/thành tiền/NCC. Nếu
        KHÔNG có trong `ST_ORDER`, cần tên bảng chi tiết (dòng hàng) liên
        kết qua `TRANS_NUM`.
     2. [MỚI] `TRANS_CODE` — mẫu đã xem toàn bộ là `'330'`, xác nhận đây
        có phải mã CỐ ĐỊNH cho "đơn đặt hàng" hay bảng còn chứa mã khác
        (nếu có, VIEW cần thêm `WHERE TRANS_CODE = '330'`).
     3. Tên cột NGÀY ĐẶT thật — `TRAN_DATE` là ứng viên (đã xác nhận TỒN
        TẠI, chưa xác nhận Ý NGHĨA đúng là ngày đặt).
     4. Tên cột WATERMARK cập nhật (phản ánh ĐÚNG lần sửa gần nhất, kể cả
        khi đơn chuyển trạng thái C→P→F hoặc bị sửa — STATUS='M') — ứng
        viên: `STOPED_DT`/`FINISH_DT` (đã xác nhận tồn tại, chưa xác nhận
        ý nghĩa).
     5. `SoLuongThucNhan` khi `STATUS='C'` (chưa nhập) trả về `0` hay
        `NULL` — cả 2 đều cho kết quả ĐÚNG ở báo cáo "So sánh", chỉ cần
        biết trước để không nhầm là lỗi dữ liệu.
     6. `ST_ORDER`/`ST_ORDER_ARC` có đúng cấu trúc "1 dòng = 1 dòng hàng
        (SKU) trong 1 đơn" hay là "1 dòng = 1 đơn hàng" (SL/mã hàng nằm ở
        bảng khác, cần JOIN thêm) — mẫu dữ liệu đã xem gợi ý CÓ THỂ là
        header lặp theo số lần cập nhật, CẦN XÁC NHẬN RÕ.

   Vế TRÁI của mỗi dòng `AS` (tên cột nguồn) PHẢI sửa đúng tên cột thật khi
   đã đủ thông tin — vế PHẢI (tên alias sau `AS`) GIỮ NGUYÊN, khớp đúng tên
   cột mà `etl/scripts/seedDonDatHangSync.js` đã viết sẵn để đọc lại.

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
    CAST(SoDon AS VARCHAR(50)) + '|' + CAST(STT AS VARCHAR(10)) AS MaThucThe,  -- <<< CHƯA XÁC NHẬN — khoá duy nhất 1 dòng hàng, có thể TRANS_NUM đã đủ làm khoá nếu ST_ORDER là header — điểm 6
    CAST(NgayDat AS DATE)       AS EventDate,        -- <<< SỬA: tên cột NGÀY ĐẶT thật — ứng viên TRAN_DATE (đã xác nhận tồn tại) — điểm 3
    UpdatedAt                   AS UpdatedAt,        -- <<< SỬA: tên cột WATERMARK cập nhật thật — ứng viên STOPED_DT/FINISH_DT — điểm 4
    BU_ID                       AS MaDiem,           -- ĐÃ XÁC NHẬN đúng tên cột thật (06/10/2026) — mã siêu thị thô, hệ thống báo cáo tự ánh xạ lại thành mã Điểm chuẩn qua cột BuId trong bảng "Ánh xạ Điểm - STK_ID", không sửa gì thêm ở đây
    TenSieuThiDSmart            AS TenDiem,          -- tên siêu thị theo DSmart16 (dự phòng, hệ thống ưu tiên dùng bảng Ánh xạ Điểm-STK nếu có)
    SoDon                       AS SoDon,            -- <<< CHƯA XÁC NHẬN — có thể chính là TRANS_NUM
    CAST(NgayGiao AS DATE)      AS NgayGiao,         -- <<< CHƯA XÁC NHẬN — có thể là DUE_DATE/DELIVER_DT (đã xác nhận tồn tại)
    MaNCC                       AS MaNCC,            -- <<< CHƯA THẤY cột này — điểm 1
    TenNCC                      AS TenNCC,           -- <<< CHƯA THẤY — điểm 1
    NguoiDat                    AS NguoiDat,         -- <<< CHƯA THẤY — điểm 1
    MaHang                      AS MaHang,           -- <<< CHƯA THẤY — điểm 1
    TenHang                     AS TenHang,          -- <<< CHƯA THẤY — điểm 1
    MaVach                      AS MaVach,           -- <<< CHƯA THẤY — điểm 1
    DVT                         AS DVT,              -- <<< CHƯA THẤY — điểm 1
    STATUS                      AS TrangThai,        -- ĐÃ XÁC NHẬN đúng tên cột thật (06/10/2026)
    CASE STATUS
        WHEN 'C' THEN N'Chưa nhập'
        WHEN 'P' THEN N'Đã nhập 1 phần'
        WHEN 'F' THEN N'Đã nhập hết'
        WHEN 'M' THEN N'Đơn sửa'
        WHEN 'D' THEN N'Đã xoá'
        WHEN 'E' THEN N'Đã huỷ'
        ELSE STATUS
    END                         AS TrangThaiLabel,
    SoLuongTheoDon              AS SoLuongTheoDon,   -- <<< CHƯA THẤY — SL đặt (cột "Theo đơn" trên phiếu) — điểm 1
    SoLuongThucNhan             AS SoLuongThucNhan,  -- <<< CHƯA THẤY — SL nhận thật (cột "Thực nhận" trên phiếu) — điểm 1, xem thêm điểm 5
    DonGia                      AS DonGia,           -- <<< CHƯA THẤY — điểm 1
    ThanhTien                   AS ThanhTien         -- <<< CHƯA THẤY — điểm 1
FROM dbo.ST_ORDER
UNION ALL
SELECT
    CAST(SoDon AS VARCHAR(50)) + '|' + CAST(STT AS VARCHAR(10)), CAST(NgayDat AS DATE), UpdatedAt, BU_ID, TenSieuThiDSmart,
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
