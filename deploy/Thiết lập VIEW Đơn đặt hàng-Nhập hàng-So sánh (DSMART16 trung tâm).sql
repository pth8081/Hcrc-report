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
   không hề lấy 2 mã này). Thêm `130`/`330` vào `WHERE TRANS_CODE IN (...)`
   bên dưới — rp-server/lib/purchaseOrderRunner.js đã sửa tương ứng (bản
   9.27) để phân loại đúng đặt/nhập + bộ lọc "Kênh mua".

   ‼️ SỬA LẠI Ý NGHĨA MÃ — bản 10.12, 26/10/2026 (theo yêu cầu người dùng)
   ‼️ Ghi chú 13/10/2026 ở trên đã GÁN SAI — `133` không phải mã "đặt
   hàng", đã xác nhận lại đúng:
     130 = Đặt hàng, kênh "mua riêng"      133 = Nhập hàng, kênh "mua riêng"
     330 = Đặt hàng, kênh "mua chung"      333 = Nhập hàng, kênh "mua chung" (qua Fuji)
   (CẢ 2 kênh đều có đủ cặp đặt/nhập — không phải "mua riêng chỉ có mã đặt"
   như ghi nhầm trước đây). Chỉ ảnh hưởng CÁCH DIỄN GIẢI cột `LoaiGiaoDich`
   ở tầng ứng dụng (`TRANS_CODE_DAT`/`TRANS_CODE_NHAP` trong
   rp-server/lib/purchaseOrderRunner.js, bản 10.12) — VIEW này KHÔNG cần
   sửa gì (đã SELECT nguyên `TRANS_CODE` thô, không tự diễn giải ý nghĩa).

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

   ‼️ THÊM 23/10/2026 (bản 10.2) — CỘT `MaNganhHang`/`TenNganhHang` (JOIN
   thêm `DEPTLIST` qua `SKU_DEF.DEPT_ID`) ‼️ Thêm để lọc 6 báo cáo "Đơn đặt
   hàng"/"Đơn nhập hàng"/"So sánh đặt–nhận"/... theo ngành hàng (theo yêu
   cầu người dùng) — khớp ĐÚNG cách JOIN `SKU_DEF.DEPT_ID` →
   `DEPTLIST.DEPT_ID` → `DEPT_NAME_U` đã dùng cho VIEW doanh thu ngành hàng
   (`V_HCRC_DOANHTHU_NGANHHANG`, xem "báo cáo doanh thu-nhập hàng theo
   ngành hàng.md" mục 2). THUẦN THÊM CỘT (`LEFT JOIN`), không đổi cột nào
   khác — 6 báo cáo cũ không ảnh hưởng.

   ‼️ SỬA 28/10/2026 (bản 10.24) — "ĐẶT HÀNG" (130/330) KHÔNG NẰM Ở STRANS,
   PHẢI LẤY TỪ ON_ORDER/FN_ORDER ‼️
   Người dùng báo cáo "Đơn đặt hàng" LUÔN trống ở CẢ 2 kênh dù job đồng bộ
   chạy bình thường — chạy thử đếm `SELECT TRANS_CODE, COUNT(*) FROM STRANS
   WHERE TRANS_CODE IN ('130','133','330','333') AND TRAN_DATE >=
   '2026-10-01' GROUP BY TRANS_CODE` xác nhận THẬT: `133`/`333` có hàng chục
   nghìn dòng, còn `130`/`330` ra ĐÚNG 0 DÒNG — tức giả định "đặt và nhập
   đều nằm chung STRANS" (06/10/2026) chỉ ĐÚNG MỘT NỬA. DBA xác nhận lại:
   "đặt hàng" (130/330) nằm ở 2 bảng KHÁC — `ON_ORDER` (đơn đặt CÒN MỞ,
   8.147+26.911 dòng mã 130/330 trong tháng 10/2026) và `FN_ORDER` (đơn đặt
   ĐÃ ĐÓNG/đã nhận xong, tháng hiện tại — 14.421+65.680 dòng). Đã kiểm tra
   trùng lặp: 2.483 ĐƠN (`TRANS_NUM`) xuất hiện ở CẢ 2 bảng, nhưng đếm lại
   theo CẤP DÒNG MẶT HÀNG (`TRANS_NUM`+`IDX`) thì ra ĐÚNG 0 — tức "trùng" ở
   cấp đơn chỉ vì 1 đơn có NHIỀU mặt hàng, mặt hàng NÀY đã nhận xong (chuyển
   sang `FN_ORDER`) còn mặt hàng KHÁC CÙNG đơn vẫn còn mở (`ON_ORDER`) —
   KHÔNG phải dữ liệu nhân đôi, gộp `UNION ALL` theo `(TRANS_NUM, IDX)` an
   toàn tuyệt đối.

   `ST_ORDER`/`ST_ORDER_ARC` (DBA xác nhận nguyên văn: "Đơn hàng đã xóa")
   CỐ Ý KHÔNG đưa vào VIEW — đây là đơn ĐÃ XOÁ, ngược quy tắc đã chốt từ
   trước ("loại cả đơn xóa... chỉ lấy đơn đặt thực tế và nhập thực tế").

   `ON_ORDER`/`FN_ORDER` dùng CHUNG khuôn 116 cột với `STRANS`/`ST_ORDER`
   (đã đối chiếu INFORMATION_SCHEMA.COLUMNS, giống hệt tên/kiểu từng cột).

   ‼️ SỬA NGAY TRONG NGÀY 28/10/2026 — `ORD_QTY`/`PRICE` KHÔNG DÙNG ĐƯỢC,
   DÙNG `QTY`/`AMOUNT÷QTY` GIỐNG NHẬP HÀNG ‼️ Bản đầu tiên của bản 10.24
   (lên production cùng ngày) DÙNG THẲNG `ORD_QTY` (SL đặt) và `PRICE`
   (đơn giá) theo lời DBA xác nhận — nhưng người dùng báo cáo thật ngay sau
   khi chạy: báo cáo "Đơn đặt hàng" đã CÓ dữ liệu (đúng), nhưng cột "SL
   đặt"/"Đơn giá" ra 0 HẾT trong khi "Thành tiền" vẫn có số thật (vô lý về
   số học). Kiểm tra lại bằng SQL THẬT (2 dòng CÙNG `SKU_ID`/`TRAN_DATE`, 1
   dòng "Đã nhập 1 phần" 1 dòng "Đã nhập hết"):
   `ORD_QTY`=0 VÀ `PRICE`=0 cho CẢ 2 dòng — không dùng được, trong khi
   `QTY`=2 khớp ĐÚNG với `DLV_QTY`=2 của dòng đã nhận xong (và `DLV_QTY`=0
   ở dòng chưa nhận xong — đúng ý nghĩa "số đã giao"), còn
   `AMOUNT/QTY`=68.880/2=34.440 là đơn giá hợp lý. Kết luận: `ORD_QTY`/
   `PRICE` KHÔNG hề được DSmart16 ghi dữ liệu cho `TRANS_CODE` 130/330 (ít
   nhất ở dữ liệu thật đã kiểm tra — luôn ra 0), SL đặt thật nằm ở cột
   `QTY` — ĐÚNG Y HỆT cách `STRANS` đang dùng cho nhập hàng (nhánh 1 bên
   dưới). Tin SQL THẬT hơn lời mô tả (giống bài học lần gán nhầm `133` =
   "đặt hàng" trước đây — luôn kiểm chứng lại bằng dữ liệu thật trước khi
   tin tưởng tuyệt đối mô tả bằng lời) — ĐÃ SỬA cả 2 nhánh ĐẶT HÀNG dùng
   `QTY AS SoLuongRaw`/`AMOUNT / NULLIF(QTY, 0) AS DonGiaRaw`, giống hệt
   công thức nhánh NHẬP HÀNG.

   `SoDon` của nhánh đặt hàng dùng `ISNULL(REF, TRANS_NUM)` (phòng trường
   hợp `REF` để trống cho CHÍNH dòng đặt — khác dòng nhập ở `STRANS` LUÔN
   có `REF` trỏ về đơn gốc) — dòng đặt vốn CHÍNH LÀ đơn gốc nên dùng
   `TRANS_NUM` của nó làm `SoDon` khi không có `REF` là hợp lý.

   Cấu trúc lại VIEW thành 3 nhánh `UNION ALL` (nhập hàng từ `STRANS`, đặt
   hàng CÒN MỞ từ `ON_ORDER`, đặt hàng ĐÃ ĐÓNG từ `FN_ORDER`) rồi JOIN
   `SUPPLIER`/`SKU_DEF`/`DEPTLIST` 1 LẦN DUY NHẤT trên kết quả đã gộp —
   tránh lặp lại 3 lần JOIN giống hệt nhau cho 3 nhánh. `rp-server/lib/
   purchaseOrderRunner.js` KHÔNG cần sửa gì — vẫn đọc đúng khuôn cột cũ,
   chỉ khác NGUỒN dữ liệu (nhiều hơn, có thêm dòng 130/330 thật).

   Nếu CSDL không đặt tên "DSMART16" (tên khác do lịch sử), sửa lại dòng
   "USE DSMART16;" ngay dưới đây cho khớp tên thật trước khi chạy.
   ============================================================================ */

USE DSMART16;
GO

CREATE OR ALTER VIEW dbo.vw_DonDatHangChiNhanh AS
SELECT
    CAST(m.TRANS_NUM AS VARCHAR(50)) + '|' + CAST(m.IDX AS VARCHAR(10)) AS MaThucThe,  -- khoá 1 dòng giao dịch (1 lần đặt HOẶC 1 lần nhận)
    CAST(m.TRAN_DATE AS DATE)   AS EventDate,
    m.STOPED_DT                 AS UpdatedAt,        -- watermark — chưa chắc, xem cảnh báo ở trên (tầng ứng dụng dùng EventDate, không dùng cột này — xem seedDonDatHangSync.js)
    m.BU_ID                     AS MaDiem,           -- ánh xạ ra mã Điểm chuẩn ở tầng rp-server (buildBuIdLookup())
    NULL                        AS TenDiem,          -- hệ thống LUÔN ưu tiên tên trong bảng Ánh xạ Điểm-STK
    m.SoDonRaw                  AS SoDon,            -- MÃ ĐƠN HÀNG GỐC — xem cách tính riêng từng nhánh bên dưới
    m.TRANS_CODE                AS LoaiGiaoDich,     -- '130'/'330'=đặt hàng, '133'/'333'=nhập hàng — đã xác nhận lại, xem ghi chú 26/10/2026 (bản 10.12) ở trên
    CAST(m.DUE_DATE AS DATE)    AS NgayGiao,
    m.SUPP_ID                   AS MaNCC,
    s.SUPP_NAME_U                AS TenNCC,          -- SUPP_NAME_U (Unicode, đã xác nhận 12/10/2026 qua INFORMATION_SCHEMA.COLUMNS) — SUPP_NAME (không _U) lỗi font
    m.STAFF_ID                  AS NguoiDat,
    m.SKU_ID                    AS MaHang,
    NULL                        AS TenHang,          -- cần JOIN bảng danh mục hàng hoá nếu muốn hiện tên (chưa có, hiện mã)
    k.SKU_CODE                   AS MaHangHienThi,   -- THÊM bản 9.95 — mã hàng HIỂN THỊ (khớp domain banhang_sku/tonkho_sku), KHÁC MaHang (SKU_ID thô)
    k.DEPT_ID                    AS MaNganhHang,     -- THÊM bản 10.2
    dl.DEPT_NAME_U                AS TenNganhHang,   -- THÊM bản 10.2 — Unicode, KHÔNG dùng DEPT_NAME (lỗi font)
    m.UNIT_SYMB                 AS DVT,
    m.STATUS                    AS TrangThai,
    CASE m.STATUS
        WHEN 'C' THEN N'Chưa nhập'
        WHEN 'P' THEN N'Đã nhập 1 phần'
        WHEN 'F' THEN N'Đã nhập hết'
        WHEN 'M' THEN N'Đơn sửa'
        ELSE m.STATUS
    END                         AS TrangThaiLabel,
    m.SoLuongRaw                AS SoLuong,
    m.DonGiaRaw                 AS DonGia,
    m.ThanhTienRaw              AS ThanhTien
FROM (
    -- Nhánh 1 — NHẬP HÀNG (133/333), nguồn STRANS (bản 8.92, KHÔNG đổi) —
    -- STRANS không có cột PRICE, DonGia suy từ AMOUNT/QTY. CAST SoDonRaw về
    -- VARCHAR(50) tường minh — ĐỒNG NHẤT kiểu với 2 nhánh dưới (tránh SQL
    -- Server tự suy kiểu lệch giữa các nhánh UNION ALL).
    SELECT TRANS_NUM, IDX, TRAN_DATE, STOPED_DT, BU_ID, CAST(REF AS VARCHAR(50)) AS SoDonRaw, TRANS_CODE, DUE_DATE, SUPP_ID, STAFF_ID, SKU_ID, UNIT_SYMB, STATUS,
           QTY AS SoLuongRaw, AMOUNT / NULLIF(QTY, 0) AS DonGiaRaw, AMOUNT AS ThanhTienRaw
    FROM dbo.STRANS
    WHERE TRANS_CODE IN ('133','333') AND STATUS NOT IN ('D','E')

    UNION ALL
    -- Nhánh 2 — ĐẶT HÀNG (130/330) CÒN MỞ (chưa nhận xong), nguồn ON_ORDER
    -- (THÊM 28/10/2026, bản 10.24 — xem cảnh báo ở trên).
    -- SỬA 28/10/2026 (cùng bản 10.24, phát hiện ngay sau khi lên production
    -- lần đầu): DBA nói ORD_QTY/PRICE là cột đúng, nhưng kiểm tra SQL THẬT
    -- (2 dòng cùng SKU_ID/TRAN_DATE, 1 "Đã nhập 1 phần" 1 "Đã nhập hết") lại
    -- ra ORD_QTY=0 VÀ PRICE=0 cho CẢ 2 dòng, trong khi QTY=2 khớp ĐÚNG
    -- DLV_QTY=2 của dòng đã nhận xong, và AMOUNT/QTY=34.440 hợp lý — tức
    -- ORD_QTY/PRICE KHÔNG hề được ghi dữ liệu cho TRANS_CODE 130/330 (luôn
    -- 0), SL đặt thật nằm ở QTY — giống HỆT cách STRANS dùng cho nhập hàng
    -- (nhánh 1). Tin SQL THẬT hơn lời mô tả (bài học từ lần gán nhầm mã
    -- 133="đặt hàng" trước đây) — đổi lại dùng QTY + AMOUNT/NULLIF(QTY,0).
    -- SoDonRaw: ISNULL CAST VARCHAR(50) tường minh TRƯỚC khi fallback —
    -- tránh lỗi cắt ngắn ký tự nếu REF là char NGẮN HƠN TRANS_NUM (ISNULL
    -- lấy độ dài theo tham số ĐẦU); NULLIF(RTRIM(REF),'') coi REF toàn dấu
    -- cách (char rỗng kiểu cũ, không phải NULL thật) cũng là "chưa có".
    SELECT TRANS_NUM, IDX, TRAN_DATE, STOPED_DT, BU_ID,
           ISNULL(NULLIF(RTRIM(CAST(REF AS VARCHAR(50))), ''), CAST(TRANS_NUM AS VARCHAR(50))) AS SoDonRaw,
           TRANS_CODE, DUE_DATE, SUPP_ID, STAFF_ID, SKU_ID, UNIT_SYMB, STATUS,
           QTY AS SoLuongRaw, AMOUNT / NULLIF(QTY, 0) AS DonGiaRaw, AMOUNT AS ThanhTienRaw
    FROM dbo.ON_ORDER
    WHERE TRANS_CODE IN ('130','330') AND STATUS NOT IN ('D','E')

    UNION ALL
    -- Nhánh 3 — ĐẶT HÀNG (130/330) ĐÃ ĐÓNG (đã nhận xong, tháng hiện tại),
    -- nguồn FN_ORDER (THÊM 28/10/2026, bản 10.24). Xác nhận bằng SQL thật:
    -- KHÔNG trùng dòng với nhánh 2 (trùng ở cấp ĐƠN là bình thường — khác
    -- dòng mặt hàng (IDX) của cùng 1 đơn, không trùng khi so cả TRANS_NUM+IDX).
    -- SoLuongRaw/DonGiaRaw: dùng QTY/AMOUNT giống nhánh 2 — xem ghi chú ở trên.
    SELECT TRANS_NUM, IDX, TRAN_DATE, STOPED_DT, BU_ID,
           ISNULL(NULLIF(RTRIM(CAST(REF AS VARCHAR(50))), ''), CAST(TRANS_NUM AS VARCHAR(50))) AS SoDonRaw,
           TRANS_CODE, DUE_DATE, SUPP_ID, STAFF_ID, SKU_ID, UNIT_SYMB, STATUS,
           QTY AS SoLuongRaw, AMOUNT / NULLIF(QTY, 0) AS DonGiaRaw, AMOUNT AS ThanhTienRaw
    FROM dbo.FN_ORDER
    WHERE TRANS_CODE IN ('130','330') AND STATUS NOT IN ('D','E')
) m
LEFT JOIN dbo.SUPPLIER s ON s.SUPP_ID = m.SUPP_ID
LEFT JOIN dbo.SKU_DEF k ON k.SKU_ID = m.SKU_ID        -- THÊM bản 9.95 — lấy SKU_CODE (mã hàng hiển thị)
LEFT JOIN dbo.DEPTLIST dl ON dl.DEPT_ID = k.DEPT_ID;   -- THÊM bản 10.2 — lấy tên ngành hàng
GO

/* ===================== (Tuỳ chọn) Cấp quyền đọc cho tài khoản đồng bộ ===================== */
-- CHỈ chạy nếu đồng bộ đơn đặt hàng dùng 1 tài khoản CHỈ ĐỌC riêng (khác
-- tài khoản DSMART16_USER đã dùng cho báo cáo doanh thu cuối ngày) —
-- nếu dùng LẠI đúng tài khoản đã có sẵn và tài khoản đó đã có quyền SELECT
-- trên schema dbo, BỎ QUA bước này, không cần chạy.
-- GRANT SELECT ON dbo.vw_DonDatHangChiNhanh TO <tên_login_chỉ_đọc>;
-- GO
