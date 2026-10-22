/* deploy/Thiết lập VIEW Đơn đặt hàng-Nhập hàng-So sánh (DSMART16 trung tâm).sql
   ============================================================================
   Chạy NGUYÊN VĂN file này trên CSDL DSMART16 TRUNG TÂM (1 LẦN DUY NHẤT —
   KHÁC "Thiết lập VIEW ... tại mỗi siêu thị Thành viên.sql" phải chạy 35
   lần, vì đây là CSDL trung tâm chứa đơn hàng của TẤT CẢ siêu thị cùng 1
   nơi, phân biệt bằng cột BU_ID trong cùng bảng) để phục vụ 3 báo cáo:
   "Đơn đặt hàng", "Đơn nhập hàng", "So sánh đặt–nhận" — xem đầy đủ bối
   cảnh/thiết kế trong `bc-don-dat-hang.md` (gốc repo).

   ‼️ CẬP NHẬT 06/10/2026 — NGUỒN DỮ LIỆU LÀ STRANS, KHÔNG PHẢI ST_ORDER ‼️
   Qua trao đổi với DBA: nguồn dữ liệu THẬT là bảng `STRANS` (bảng ĐÃ dùng
   sẵn cho báo cáo doanh thu cuối ngày), lọc `TRANS_CODE IN ('133','333')`
   — ĐÃ XÁC NHẬN: `133` = đặt hàng, `333` = nhập hàng, MỖI LOẠI LÀ 1 DÒNG
   RIÊNG (KHÁC thiết kế ban đầu tưởng SL đặt + SL nhận chung 1 dòng). Cột
   `REF` = "mã đơn hàng gốc" (ĐÃ XÁC NHẬN) — dùng để nhóm NHIỀU LẦN nhận
   hàng (nhiều dòng `333`) lại với đúng 1 đơn đặt (`133`) ban đầu — xử lý
   gộp (SUM) nằm ở tầng ứng dụng (`rp-server/lib/purchaseOrderRunner.js`),
   KHÔNG cần gộp trong VIEW này (VIEW trả về dòng THÔ, 1 dòng/1 lần giao
   dịch).

   ‼️ ĐÃ SỬA 06/10/2026 — STRANS KHÔNG CÓ CỘT `PRICE` ‼️
   Chạy thử lần đầu báo lỗi `Invalid column name 'PRICE'` — xác nhận
   `STRANS` KHÔNG có cột đơn giá riêng (giống báo cáo doanh thu cuối ngày,
   bảng này chỉ có `QTY`/`AMOUNT`, không có `PRICE`). Đã sửa: `DonGia` tính
   = `AMOUNT / NULLIF(QTY, 0)` (đơn giá suy ra từ thành tiền/số lượng),
   `ThanhTien` = `AMOUNT` (giữ nguyên). Nếu vẫn còn lỗi "Invalid column
   name" cho cột khác (`IDX`/`DUE_DATE`/`SUPP_ID`/`STAFF_ID`/`UNIT_SYMB`/
   `STOPED_DT`/`REF`), gửi lại thông báo lỗi NGUYÊN VĂN để sửa tiếp —
   SQL Server có thể chỉ báo 1 lỗi đầu tiên mỗi lần chạy, không báo hết
   cùng lúc.

   Cũng còn 1 cột chưa chắc: `STOPED_DT` làm watermark (`UpdatedAt`) — nếu
   sau này đồng bộ không bắt được đơn mới cập nhật/nhận hàng thêm, đây là
   chỗ cần xem lại đầu tiên.

   ‼️ CẬP NHẬT 07/10/2026 — JOIN TÊN NHÀ CUNG CẤP TỪ BẢNG `SUPPLIER` ‼️
   Người dùng xác nhận bảng danh mục nhà cung cấp là `SUPPLIER`, cột mã
   `SUPP_ID` (char, khớp đúng tên/kiểu với `STRANS.SUPP_ID`) và tên
   `SUPP_NAME` (nvarchar) — đã thêm `LEFT JOIN` lấy tên thật thay vì để
   `NULL` như trước. Dùng `LEFT JOIN` (không phải `INNER JOIN`) để đơn
   hàng có mã NCC không khớp được dòng nào trong `SUPPLIER` (dữ liệu rác/
   NCC đã xoá) vẫn hiện ra, chỉ riêng tên NCC để trống thay vì mất nguyên
   dòng đơn hàng.

   ‼️ SỬA 12/10/2026 — LỖI FONT TÊN NCC: DÙNG `SUPP_NAME_U`, KHÔNG PHẢI
   `SUPP_NAME` ‼️
   Người dùng báo cáo tên NCC ra chữ lỗi font ("HTX s¶n xuÊt..." thay vì
   "HTX sản xuất..."). Xác nhận qua INFORMATION_SCHEMA.COLUMNS: `SUPPLIER`
   có CẢ 2 cột `SUPP_NAME` (nvarchar, bảng mã cũ — lỗi font) VÀ `SUPP_NAME_U`
   (nvarchar, Unicode — ĐÚNG) — đã đổi JOIN dùng `SUPP_NAME_U`. VIEW này
   NẾU ĐÃ CHẠY TRƯỚC 12/10/2026 (dùng `SUPP_NAME` cũ) PHẢI CHẠY LẠI NGUYÊN
   FILE NÀY (CREATE OR ALTER, an toàn) để hết lỗi font — job đồng bộ
   KHÔNG tự sửa dữ liệu CŨ đã đồng bộ, chỉ dòng đồng bộ MỚI SAU KHI chạy
   lại VIEW mới đúng; dữ liệu cũ đã lưu lỗi font cần đồng bộ lại (xem
   etl-admin → Đồng bộ → "Chạy thử" lại job domain `don_dat_hang`).

   ‼️ MỞ RỘNG 13/10/2026 — THÊM MÃ GIAO DỊCH `130`/`330` (KÊNH MUA) ‼️
   Theo yêu cầu người dùng, đã xác nhận lại TỪNG MÃ MỘT (tránh lặp lại lỗi
   đoán sai nguồn dữ liệu trước đây): hệ thống trước đây CHỈ lọc `133`/`333`
   (LOẠI BỎ HẲN giao dịch mang mã `130`/`330` — không phải lỗi đồng bộ, VIEW
   không hề lấy 2 mã này). Ý nghĩa đã xác nhận:
     133 = Đặt hàng, kênh "mua riêng"      130 = Đặt hàng, kênh "mua riêng"
     330 = Đặt hàng, kênh "mua chung"      333 = Nhập hàng, kênh "mua chung" (qua Fuji)
   ("mua riêng" CHỈ có 2 mã đặt, không có mã nhập riêng). Thêm `130`/`330`
   vào `WHERE TRANS_CODE IN (...)` bên dưới — rp-server/lib/purchaseOrderRunner.js
   đã sửa tương ứng (bản 9.27) để phân loại đúng đặt/nhập + bộ lọc "Kênh mua".

   AN TOÀN CHẠY LẠI NHIỀU LẦN — dùng `CREATE OR ALTER VIEW`, không lỗi nếu
   VIEW đã tồn tại từ lần chạy trước.

   ‼️ THÊM 22/10/2026 (bản 9.95) — CỘT `MaHangHienThi` (JOIN `SKU_DEF`) ‼️
   Thêm để tái dùng domain `don_dat_hang` cho báo cáo "Top bán chạy đang
   tồn kho = 0" (`bc-ton-kho-0.md` mục "Chờ nhập/Đã nhập (NCC)") — domain đó
   khoá theo `MaHangHienThi` (= `SKU_DEF.SKU_CODE`, mã hàng HIỂN THỊ), KHÁC
   `MaHang` ở trên (= `SKU_ID` thô, khoá nội bộ DSMART16) — 2 giá trị THƯỜNG
   KHÁC NHAU, không dùng lẫn được. Cột MỚI này THUẦN THÊM (`LEFT JOIN`),
   KHÔNG đổi `MaHang`/bất kỳ cột nào khác — 6 báo cáo "Đơn đặt hàng"/"Đơn
   nhập hàng"/"So sánh đặt–nhận"/... đang dùng `MaHang` KHÔNG bị ảnh hưởng.
   Xem `bc-ton-kho-0.md` mục "Chờ nhập/Đã nhập (NCC) — tái dùng don_dat_hang"
   để biết đủ bối cảnh + các bước triển khai còn lại (tick Dimension mới +
   resync job Live).

   Nếu CSDL không đặt tên "DSMART16" (tên khác do lịch sử), sửa lại dòng
   "USE DSMART16;" ngay dưới đây cho khớp tên thật trước khi chạy.
   ============================================================================ */

USE DSMART16;
GO

CREATE OR ALTER VIEW dbo.vw_DonDatHangChiNhanh AS
SELECT
    CAST(m.TRANS_NUM AS VARCHAR(50)) + '|' + CAST(m.IDX AS VARCHAR(10)) AS MaThucThe,  -- khoá 1 dòng giao dịch (1 lần đặt HOẶC 1 lần nhận)
    CAST(m.TRAN_DATE AS DATE)   AS EventDate,
    m.STOPED_DT                 AS UpdatedAt,        -- watermark — chưa chắc, xem cảnh báo ở trên
    m.BU_ID                     AS MaDiem,           -- ánh xạ ra mã Điểm chuẩn ở tầng rp-server (buildBuIdLookup())
    NULL                        AS TenDiem,          -- hệ thống LUÔN ưu tiên tên trong bảng Ánh xạ Điểm-STK
    m.REF                       AS SoDon,            -- MÃ ĐƠN HÀNG GỐC (đã xác nhận) — dùng nhóm nhiều lần nhận hàng
    m.TRANS_CODE                AS LoaiGiaoDich,     -- '133'/'130'=đặt hàng, '333'=nhập hàng, '330'=đặt hàng (kênh mua chung) — đã xác nhận, xem ghi chú 13/10/2026 ở trên
    CAST(m.DUE_DATE AS DATE)    AS NgayGiao,
    m.SUPP_ID                   AS MaNCC,
    s.SUPP_NAME_U                AS TenNCC,          -- SUPP_NAME_U (Unicode, đã xác nhận 12/10/2026 qua INFORMATION_SCHEMA.COLUMNS) — SUPP_NAME (không _U) lỗi font
    m.STAFF_ID                  AS NguoiDat,
    m.SKU_ID                    AS MaHang,
    NULL                        AS TenHang,          -- cần JOIN bảng danh mục hàng hoá nếu muốn hiện tên (chưa có, hiện mã)
    k.SKU_CODE                   AS MaHangHienThi,   -- THÊM bản 9.95 — mã hàng HIỂN THỊ (khớp domain banhang_sku/tonkho_sku), KHÁC MaHang (SKU_ID thô)
    m.UNIT_SYMB                 AS DVT,
    m.STATUS                    AS TrangThai,
    CASE m.STATUS
        WHEN 'C' THEN N'Chưa nhập'
        WHEN 'P' THEN N'Đã nhập 1 phần'
        WHEN 'F' THEN N'Đã nhập hết'
        WHEN 'M' THEN N'Đơn sửa'
        ELSE m.STATUS
    END                         AS TrangThaiLabel,
    m.QTY                       AS SoLuong,
    m.AMOUNT / NULLIF(m.QTY, 0) AS DonGia,           -- STRANS không có cột PRICE — suy ra từ AMOUNT/QTY
    m.AMOUNT                    AS ThanhTien
FROM dbo.STRANS m
LEFT JOIN dbo.SUPPLIER s ON s.SUPP_ID = m.SUPP_ID
LEFT JOIN dbo.SKU_DEF k ON k.SKU_ID = m.SKU_ID        -- THÊM bản 9.95 — lấy SKU_CODE (mã hàng hiển thị)
WHERE m.TRANS_CODE IN ('133','333','130','330') AND m.STATUS NOT IN ('D','E');  -- loại hẳn đơn đã xoá/đã huỷ (theo yêu cầu người dùng); 130/330 thêm bản 9.27
GO

/* ===================== (Tuỳ chọn) Cấp quyền đọc cho tài khoản đồng bộ ===================== */
-- CHỈ chạy nếu đồng bộ đơn đặt hàng dùng 1 tài khoản CHỈ ĐỌC riêng (khác
-- tài khoản DSMART16_USER đã dùng cho báo cáo doanh thu cuối ngày) —
-- nếu dùng LẠI đúng tài khoản đã có sẵn và tài khoản đó đã có quyền SELECT
-- trên schema dbo, BỎ QUA bước này, không cần chạy.
-- GRANT SELECT ON dbo.vw_DonDatHangChiNhanh TO <tên_login_chỉ_đọc>;
-- GO
