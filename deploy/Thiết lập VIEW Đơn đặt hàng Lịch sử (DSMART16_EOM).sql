/* deploy/Thiết lập VIEW Đơn đặt hàng Lịch sử (DSMART16_EOM).sql
   ============================================================================
   BẢN 9.21 — BỔ SUNG, theo báo cáo người dùng: 6 báo cáo Mua hàng CHỈ lấy
   được dữ liệu trong tháng hiện tại, KHÔNG lấy được lịch sử nhiều năm —
   giống hệt lỗi "Cùng kỳ năm trước" đã gặp ở báo cáo doanh thu (xem
   "báo cáo doanh thu cuối ngày.md" Script B) — NGUYÊN NHÂN GIỐNG NHAU:

   `deploy/Thiết lập VIEW Đơn đặt hàng-Nhập hàng-So sánh (DSMART16 trung
   tâm).sql` (VIEW "Live") chỉ đọc bảng `STRANS` trên CSDL `DSMART16` —
   bảng này CHỈ giữ giao dịch gần đây (tháng hiện tại/vài tháng gần nhất).
   Dữ liệu CŨ HƠN đã được DSMART16 tự chuyển sang CSDL RIÊNG `DSMART16_EOM`
   (chia thành ~93 bảng `STRANS_YYYYMM`, vd `STRANS_202509`) — job đồng bộ
   "Đơn đặt hàng - nhập hàng (DSMART16)" (chỉ trỏ VIEW Live) KHÔNG BAO GIỜ
   thấy được phần dữ liệu này, dù đã ép đồng bộ lại từ đầu (xoá
   etl.SyncState) — vì nguồn nó đọc đơn giản là KHÔNG CÓ dữ liệu đó.

   FILE NÀY tạo VIEW THỨ 2, CÙNG TÊN (`vw_DonDatHangChiNhanh`) nhưng chạy
   trên CSDL `DSMART16_EOM` — UNION ALL hết các bảng `STRANS_YYYYMM` +
   `STRANS_EOM` (sinh SQL tự động từ `sys.tables`, không gõ tay ~93 tên
   bảng — mirror ĐÚNG kỹ thuật "Script B" trong "báo cáo doanh thu cuối
   ngày.md"). Sau khi tạo VIEW này, chạy
   `etl/scripts/seedDonDatHangHistorySync.js` để tạo job đồng bộ "Lịch sử"
   THỨ 2 (cùng TargetDomain `don_dat_hang` với job "Live" — 2 job cùng ghi
   vào `dwh.ReportFacts`, phân biệt bằng SourceSystem khác nhau theo
   DataSourceId, không đè lên nhau).

   ‼️ GIẢ ĐỊNH CẦN XÁC NHẬN (chạy thử sẽ tự lộ nếu sai, báo lỗi rõ ràng) ‼️
   1. `DSMART16` và `DSMART16_EOM` nằm CÙNG 1 SQL Server instance — VIEW
      dưới đây JOIN chéo CSDL `DSMART16.dbo.SUPPLIER` (lấy tên NCC) — cách
      này ĐÃ CÓ TIỀN LỆ hoạt động thật (Script B doanh thu JOIN
      `DSMART16.dbo.STOCK` y hệt). Nếu 2 CSDL ở 2 SERVER KHÁC NHAU, JOIN
      này sẽ lỗi "Invalid object name 'DSMART16.dbo.SUPPLIER'" — báo lại
      cho tôi, sẽ bỏ JOIN này (TenNCC để NULL cho dữ liệu lịch sử, giống
      TenDiem/TenHang đã chấp nhận NULL ở VIEW Live).
   2. Các cột `IDX`/`REF`/`SUPP_ID`/`STAFF_ID`/`UNIT_SYMB`/`DUE_DATE` có
      tồn tại trong `STRANS_YYYYMM`/`STRANS_EOM` không — tài liệu doanh thu
      chỉ xác nhận tập cột KHÁC (`STK_ID/SKU_ID/BU_ID/TRAN_DATE/TRANS_NUM/
      TRANS_CODE/QTY/AMOUNT/SURPLUS/VAT_AMT/DISCOUNT/COMM_AMT`), chưa xác
      nhận các cột mua hàng cần thêm. Nếu lỗi "Invalid column name 'X'",
      gửi lại NGUYÊN VĂN lỗi để sửa tiếp — SQL Server chỉ báo 1 lỗi đầu
      tiên mỗi lần chạy.

   ‼️ MỞ RỘNG 13/10/2026 — THÊM MÃ GIAO DỊCH `130`/`330` (KÊNH MUA) ‼️
   Theo yêu cầu người dùng, đã xác nhận lại TỪNG MÃ MỘT (tránh lặp lại lỗi
   đoán sai nguồn dữ liệu trước đây): hệ thống trước đây CHỈ lọc `133`/`333`
   (LOẠI BỎ HẲN giao dịch mang mã `130`/`330` — không phải lỗi đồng bộ, VIEW
   không hề lấy 2 mã này, kể cả dữ liệu lịch sử). Đã thêm `130`/`330` vào CẢ
   2 chỗ `TRANS_CODE IN (...)` bên dưới (lúc tạo VIEW lần đầu VÀ trong stored
   procedure chạy lại hàng tháng) — rp-server/lib/purchaseOrderRunner.js đã
   sửa tương ứng (bản 9.27). NẾU VIEW NÀY ĐÃ CHẠY TRƯỚC 13/10/2026, CẦN CHẠY
   LẠI NGUYÊN FILE NÀY để VIEW nhận đủ 4 mã, rồi vào etl-admin → Đồng bộ →
   "Chạy thử" lại job "Đơn đặt hàng - nhập hàng - Lịch sử (DSMART16_EOM)" để
   đồng bộ bù phần dữ liệu `130`/`330` trước đây bị bỏ sót (dữ liệu CŨ đã
   đồng bộ không tự có thêm, chỉ job chạy LẠI mới quét ra được).

   ‼️ SỬA LẠI Ý NGHĨA MÃ — bản 10.12, 26/10/2026 (theo yêu cầu người dùng)
   ‼️ Ghi chú 13/10/2026 ở trên đã GÁN SAI — `133` không phải mã "đặt
   hàng", đã xác nhận lại đúng:
     130 = Đặt hàng, kênh "mua riêng"      133 = Nhập hàng, kênh "mua riêng"
     330 = Đặt hàng, kênh "mua chung"      333 = Nhập hàng, kênh "mua chung" (qua Fuji)
   (CẢ 2 kênh đều có đủ cặp đặt/nhập). Chỉ ảnh hưởng CÁCH DIỄN GIẢI cột
   `LoaiGiaoDich` ở tầng ứng dụng (rp-server/lib/purchaseOrderRunner.js,
   bản 10.12) — VIEW này KHÔNG cần chạy lại vì lý do này (đã SELECT nguyên
   `TRANS_CODE` thô).

   AN TOÀN CHẠY LẠI NHIỀU LẦN — `CREATE OR ALTER VIEW`/`PROCEDURE`, không
   lỗi nếu đã tồn tại từ lần chạy trước.

   ‼️ THÊM 22/10/2026 (bản 9.95) — CỘT `MaHangHienThi` (JOIN chéo
   `DSMART16.dbo.SKU_DEF`, cùng kỹ thuật JOIN chéo CSDL đã dùng cho
   `SUPPLIER` ở trên) ‼️ Lý do + bối cảnh đầy đủ: xem ghi chú "THÊM
   22/10/2026" ở file "Thiết lập VIEW Đơn đặt hàng-Nhập hàng-So sánh
   (DSMART16 trung tâm).sql" (VIEW Live) — áp dụng Y HỆT ở đây cho VIEW
   Lịch sử, PHẢI khớp đúng khuôn cột với VIEW Live (rp-server không phân
   biệt dữ liệu tới từ job nào). THUẦN THÊM CỘT — không đổi `MaHang`/cột
   nào khác, 6 báo cáo cũ không ảnh hưởng.

   ‼️ THÊM 23/10/2026 (bản 10.2) — CỘT `MaNganhHang`/`TenNganhHang` (JOIN
   chéo `DSMART16.dbo.DEPTLIST` qua `SKU_DEF.DEPT_ID`) ‼️ Xem ghi chú "THÊM
   23/10/2026" ở VIEW Live — áp dụng Y HỆT ở đây.

   ‼️ SỬA 28/10/2026 (bản 10.24) — THÊM NGUỒN "ĐẶT HÀNG LỊCH SỬ"
   (`FN_ORDER_ARC`) + SỬA LỖI stored procedure THIẾU DEPTLIST ‼️
   Giống hệt phát hiện ở VIEW Live (xem ghi chú 28/10/2026 ở file "...
   (DSMART16 trung tâm).sql") — dữ liệu "đặt hàng" (130/330) KHÔNG nằm
   trong `STRANS`/`STRANS_YYYYMM` (0 dòng), DBA xác nhận nằm ở `ON_ORDER`/
   `FN_ORDER` (tháng hiện tại, xem VIEW Live) VÀ `FN_ORDER_ARC` (lịch sử —
   **1 BẢNG DUY NHẤT** chứa MỌI tháng quá khứ, KHÁC `STRANS_YYYYMM` phải
   tách ~93 bảng riêng theo tháng — DBA xác nhận qua câu lệnh mẫu dùng
   `DSMART16_EOM.DBO.FN_ORDER_ARC`, tức bảng này nằm Ở ĐÚNG CSDL
   `DSMART16_EOM` mà file này đang chạy, không cần JOIN chéo CSDL cho riêng
   bảng này). KHÔNG có `ON_ORDER_ARC` — đơn CÒN MỞ không có khái niệm lịch
   sử (đóng xong thì dữ liệu nằm hẳn ở `FN_ORDER`/`FN_ORDER_ARC`, không ở
   `ON_ORDER` nữa). `ST_ORDER`/`ST_ORDER_ARC` (đơn ĐÃ XOÁ) CỐ Ý không dùng,
   giống VIEW Live.

   **PHÁT HIỆN THÊM (lỗi có sẵn từ bản 10.2)**: đoạn stored procedure
   `sp_HCRC_RebuildDonDatHangView` bên dưới (chạy lại TỰ ĐỘNG hàng tháng)
   THIẾU JOIN `DEPTLIST`/cột `MaNganhHang`/`TenNganhHang` so với đoạn tạo
   VIEW lần đầu ở TRÊN — bản 10.2 khi thêm ngành hàng chỉ sửa đúng 1 chỗ,
   quên đồng bộ chỗ còn lại. Hậu quả: lần server tự chạy lại VIEW vào ngày
   2 hàng tháng (xem job SQL Server Agent cuối file) sẽ ÂM THẦM XOÁ MẤT 2
   cột `MaNganhHang`/`TenNganhHang` khỏi VIEW (bộ lọc "Ngành hàng" trên 6
   báo cáo Mua hàng sẽ hỏng, không có cảnh báo gì) — ĐÃ SỬA đồng bộ lại 2
   đoạn cho GIỐNG HỆT nhau trong lần cập nhật này.
   ============================================================================ */

USE DSMART16_EOM;
GO

DECLARE @sql NVARCHAR(MAX);

-- CAST(... AS NVARCHAR(MAX)) BẮT BUỘC (xem Script B doanh thu) — thiếu ép
-- kiểu này STRING_AGG suy luận nhầm kiểu ngắn, lỗi "aggregation result
-- exceeded the limit of 8000 bytes" khi ghép đủ ~93 bảng.
-- Lọc TRANS_CODE/STATUS NGAY TRONG từng bảng con (trước khi UNION ALL ~93
-- bảng) — tối ưu, đỡ quét thừa dữ liệu không dùng tới. CHỈ '133'/'333'
-- (nhập hàng) — '130'/'330' (đặt hàng) không nằm ở STRANS/STRANS_YYYYMM
-- (đã xác nhận THẬT bằng SQL, bản 10.24), lấy riêng từ FN_ORDER_ARC bên
-- dưới thay vì lẫn vào đây.
SELECT @sql = STRING_AGG(
    CAST('SELECT TRANS_NUM, IDX, TRAN_DATE, BU_ID, CAST(REF AS VARCHAR(50)) AS SoDonRaw, TRANS_CODE, DUE_DATE, SUPP_ID, STAFF_ID, SKU_ID, UNIT_SYMB, STATUS, QTY AS SoLuongRaw, AMOUNT / NULLIF(QTY, 0) AS DonGiaRaw, AMOUNT AS ThanhTienRaw FROM '
    + QUOTENAME(name) + ' WITH (NOLOCK) WHERE STATUS NOT IN (''D'',''E'') AND TRANS_CODE IN (''133'',''333'')' AS NVARCHAR(MAX)),
    ' UNION ALL '
)
FROM sys.tables
WHERE name LIKE 'STRANS[_][0-9][0-9][0-9][0-9][0-9][0-9]' OR name = 'STRANS_EOM';

-- THÊM bản 10.24 — nhánh "đặt hàng" lịch sử (130/330), nguồn FN_ORDER_ARC
-- (1 bảng DUY NHẤT, nằm NGAY TRONG DSMART16_EOM — không cần JOIN chéo CSDL
-- cho riêng bảng này). SoDonRaw dùng ISNULL+NULLIF+RTRIM+CAST VARCHAR(50)
-- tường minh — tránh lỗi cắt ngắn ký tự nếu REF là char NGẮN HƠN TRANS_NUM,
-- và coi REF toàn dấu cách (char rỗng kiểu cũ) cũng là "chưa có".
-- SỬA NGAY TRONG NGÀY 28/10/2026 (cùng bản 10.24) — ORD_QTY/PRICE KHÔNG
-- dùng được (kiểm tra SQL thật ra toàn 0 cho TRANS_CODE 130/330, dù DBA mô
-- tả khác) — dùng QTY/AMOUNT÷QTY giống hệt nhánh nhập hàng — xem ghi chú
-- đầy đủ ở VIEW Live.
SET @sql = @sql + N' UNION ALL SELECT TRANS_NUM, IDX, TRAN_DATE, BU_ID, ISNULL(NULLIF(RTRIM(CAST(REF AS VARCHAR(50))), ''''), CAST(TRANS_NUM AS VARCHAR(50))) AS SoDonRaw, TRANS_CODE, DUE_DATE, SUPP_ID, STAFF_ID, SKU_ID, UNIT_SYMB, STATUS, QTY AS SoLuongRaw, AMOUNT / NULLIF(QTY, 0) AS DonGiaRaw, AMOUNT AS ThanhTienRaw FROM dbo.FN_ORDER_ARC WITH (NOLOCK) WHERE STATUS NOT IN (''D'',''E'') AND TRANS_CODE IN (''130'',''330'')';

-- Cùng khuôn cột/alias với VIEW "Live" (dbo.vw_DonDatHangChiNhanh trên
-- DSMART16) — rp-server/lib/purchaseOrderRunner.js không cần biết dữ liệu
-- tới từ job Live hay Lịch sử, chỉ cần đúng tên cột.
DECLARE @sqlView NVARCHAR(MAX) = N'
CREATE OR ALTER VIEW dbo.vw_DonDatHangChiNhanh AS
SELECT
    CAST(d.TRANS_NUM AS VARCHAR(50)) + ''|'' + CAST(d.IDX AS VARCHAR(10)) AS MaThucThe,
    CAST(d.TRAN_DATE AS DATE)   AS EventDate,
    d.BU_ID                     AS MaDiem,
    NULL                        AS TenDiem,
    d.SoDonRaw                  AS SoDon,
    d.TRANS_CODE                AS LoaiGiaoDich,
    CAST(d.DUE_DATE AS DATE)    AS NgayGiao,
    d.SUPP_ID                   AS MaNCC,
    s.SUPP_NAME_U                AS TenNCC,
    d.STAFF_ID                  AS NguoiDat,
    d.SKU_ID                    AS MaHang,
    NULL                        AS TenHang,
    k.SKU_CODE                   AS MaHangHienThi,   -- THÊM bản 9.95
    k.DEPT_ID                    AS MaNganhHang,     -- THÊM bản 10.2
    dl.DEPT_NAME_U                AS TenNganhHang,   -- THÊM bản 10.2
    d.UNIT_SYMB                 AS DVT,
    d.STATUS                    AS TrangThai,
    CASE d.STATUS
        WHEN ''C'' THEN N''Chưa nhập''
        WHEN ''P'' THEN N''Đã nhập 1 phần''
        WHEN ''F'' THEN N''Đã nhập hết''
        WHEN ''M'' THEN N''Đơn sửa''
        ELSE d.STATUS
    END                         AS TrangThaiLabel,
    d.SoLuongRaw                AS SoLuong,
    d.DonGiaRaw                 AS DonGia,
    d.ThanhTienRaw              AS ThanhTien
FROM (' + @sql + N') d
LEFT JOIN DSMART16.dbo.SUPPLIER s ON s.SUPP_ID = d.SUPP_ID
LEFT JOIN DSMART16.dbo.SKU_DEF k ON k.SKU_ID = d.SKU_ID        -- THÊM bản 9.95
LEFT JOIN DSMART16.dbo.DEPTLIST dl ON dl.DEPT_ID = k.DEPT_ID;';  -- THÊM bản 10.2

EXEC sp_executesql @sqlView;
GO

/* ===================== Tự động chạy lại hàng tháng ===================== */
-- Mỗi khi DSMART16 tự tạo thêm bảng STRANS_YYYYMM mới, VIEW ở trên KHÔNG tự
-- nhận bảng mới (CREATE VIEW chỉ chụp danh sách bảng tại thời điểm chạy) —
-- gói lại thành stored procedure, chạy lại định kỳ (giống hệt
-- sp_HCRC_RebuildDoanhThuView đã có cho báo cáo doanh thu).
USE DSMART16_EOM;
GO
-- SỬA bản 10.24 — đồng bộ LẠI cho GIỐNG HỆT đoạn tạo VIEW lần đầu ở trên
-- (trước đó THIẾU JOIN DEPTLIST/cột MaNganhHang/TenNganhHang — lỗi có sẵn
-- từ bản 10.2, xem cảnh báo "PHÁT HIỆN THÊM" ở đầu file) — ĐỒNG THỜI thêm
-- nhánh FN_ORDER_ARC (đặt hàng lịch sử) giống VIEW Live.
CREATE OR ALTER PROCEDURE dbo.sp_HCRC_RebuildDonDatHangView AS
BEGIN
    DECLARE @sql NVARCHAR(MAX);

    SELECT @sql = STRING_AGG(
        CAST('SELECT TRANS_NUM, IDX, TRAN_DATE, BU_ID, CAST(REF AS VARCHAR(50)) AS SoDonRaw, TRANS_CODE, DUE_DATE, SUPP_ID, STAFF_ID, SKU_ID, UNIT_SYMB, STATUS, QTY AS SoLuongRaw, AMOUNT / NULLIF(QTY, 0) AS DonGiaRaw, AMOUNT AS ThanhTienRaw FROM '
        + QUOTENAME(name) + ' WITH (NOLOCK) WHERE STATUS NOT IN (''D'',''E'') AND TRANS_CODE IN (''133'',''333'')' AS NVARCHAR(MAX)),
        ' UNION ALL '
    )
    FROM sys.tables
    WHERE name LIKE 'STRANS[_][0-9][0-9][0-9][0-9][0-9][0-9]' OR name = 'STRANS_EOM';

    -- SỬA NGAY TRONG NGÀY 28/10/2026 (cùng bản 10.24) — QTY/AMOUNT÷QTY thay
    -- ORD_QTY/PRICE (kiểm tra SQL thật ra toàn 0) — xem ghi chú ở đoạn tạo
    -- VIEW lần đầu phía trên cùng file.
    SET @sql = @sql + N' UNION ALL SELECT TRANS_NUM, IDX, TRAN_DATE, BU_ID, ISNULL(NULLIF(RTRIM(CAST(REF AS VARCHAR(50))), ''''), CAST(TRANS_NUM AS VARCHAR(50))) AS SoDonRaw, TRANS_CODE, DUE_DATE, SUPP_ID, STAFF_ID, SKU_ID, UNIT_SYMB, STATUS, QTY AS SoLuongRaw, AMOUNT / NULLIF(QTY, 0) AS DonGiaRaw, AMOUNT AS ThanhTienRaw FROM dbo.FN_ORDER_ARC WITH (NOLOCK) WHERE STATUS NOT IN (''D'',''E'') AND TRANS_CODE IN (''130'',''330'')';

    DECLARE @sqlView NVARCHAR(MAX) = N'
    CREATE OR ALTER VIEW dbo.vw_DonDatHangChiNhanh AS
    SELECT
        CAST(d.TRANS_NUM AS VARCHAR(50)) + ''|'' + CAST(d.IDX AS VARCHAR(10)) AS MaThucThe,
        CAST(d.TRAN_DATE AS DATE)   AS EventDate,
        d.BU_ID                     AS MaDiem,
        NULL                        AS TenDiem,
        d.SoDonRaw                  AS SoDon,
        d.TRANS_CODE                AS LoaiGiaoDich,
        CAST(d.DUE_DATE AS DATE)    AS NgayGiao,
        d.SUPP_ID                   AS MaNCC,
        s.SUPP_NAME_U                AS TenNCC,
        d.STAFF_ID                  AS NguoiDat,
        d.SKU_ID                    AS MaHang,
        NULL                        AS TenHang,
        k.SKU_CODE                   AS MaHangHienThi,   -- THÊM bản 9.95
        k.DEPT_ID                    AS MaNganhHang,     -- SỬA bản 10.24 — thiếu từ bản 10.2, bổ sung lại cho khớp VIEW Live
        dl.DEPT_NAME_U                AS TenNganhHang,   -- SỬA bản 10.24 — thiếu từ bản 10.2, bổ sung lại cho khớp VIEW Live
        d.UNIT_SYMB                 AS DVT,
        d.STATUS                    AS TrangThai,
        CASE d.STATUS
            WHEN ''C'' THEN N''Chưa nhập''
            WHEN ''P'' THEN N''Đã nhập 1 phần''
            WHEN ''F'' THEN N''Đã nhập hết''
            WHEN ''M'' THEN N''Đơn sửa''
            ELSE d.STATUS
        END                         AS TrangThaiLabel,
        d.SoLuongRaw                AS SoLuong,
        d.DonGiaRaw                 AS DonGia,
        d.ThanhTienRaw              AS ThanhTien
    FROM (' + @sql + N') d
    LEFT JOIN DSMART16.dbo.SUPPLIER s ON s.SUPP_ID = d.SUPP_ID
    LEFT JOIN DSMART16.dbo.SKU_DEF k ON k.SKU_ID = d.SKU_ID        -- THÊM bản 9.95
    LEFT JOIN DSMART16.dbo.DEPTLIST dl ON dl.DEPT_ID = k.DEPT_ID;';  -- SỬA bản 10.24 — thiếu từ bản 10.2

    EXEC sp_executesql @sqlView;
END
GO

-- Chạy thử ngay: EXEC dbo.sp_HCRC_RebuildDonDatHangView; -- không lỗi là xong.

/* ===================== Job SQL Server Agent (tuỳ chọn, khuyên dùng) =====================
   Giống hệt job đã tạo cho sp_HCRC_RebuildDoanhThuView (xem "báo cáo doanh
   thu cuối ngày.md") — nếu đã có job đó, CÓ THỂ chỉ cần thêm 1 step gọi
   thêm dbo.sp_HCRC_RebuildDonDatHangView vào CÙNG job, thay vì tạo job mới.
   Dưới đây tạo job RIÊNG cho rõ ràng, độc lập. */
USE msdb;
GO
EXEC dbo.sp_add_job
    @job_name = N'HCRC - Cap nhat lai VIEW vw_DonDatHangChiNhanh';
GO
EXEC dbo.sp_add_jobstep
    @job_name = N'HCRC - Cap nhat lai VIEW vw_DonDatHangChiNhanh',
    @step_name = N'Goi stored procedure sinh lai VIEW',
    @database_name = N'DSMART16_EOM',
    @subsystem = N'TSQL',
    @command = N'EXEC dbo.sp_HCRC_RebuildDonDatHangView;';
GO
EXEC dbo.sp_add_schedule
    @schedule_name = N'Hang thang - ngay 2 (Don dat hang)',
    @freq_type = 16,              -- Hàng tháng
    @freq_interval = 2,           -- Ngày 2
    @freq_recurrence_factor = 1,  -- BẮT BUỘC khi @freq_type=16
    @active_start_time = 31000; -- 03:10:00 (lệch 10 phút so với job doanh thu, tránh chạy trùng giờ)
GO
EXEC dbo.sp_attach_schedule
    @job_name = N'HCRC - Cap nhat lai VIEW vw_DonDatHangChiNhanh',
    @schedule_name = N'Hang thang - ngay 2 (Don dat hang)';
GO
EXEC dbo.sp_add_jobserver
    @job_name = N'HCRC - Cap nhat lai VIEW vw_DonDatHangChiNhanh';
GO

/* Không có SQL Server Agent (bản Express)/không có quyền tạo Job — bỏ qua
   phần Job, chỉ cần có stored procedure ở trên, đặt lịch nhắc DBA tự chạy
   tay EXEC dbo.sp_HCRC_RebuildDonDatHangView; mỗi đầu tháng. */
