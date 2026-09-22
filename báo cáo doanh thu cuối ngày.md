# Hướng dẫn từng bước: tạo báo cáo "Báo cáo nhanh doanh thu" cho Lãnh đạo Tập đoàn (LDTD) và HCRC

File này ĐỘC LẬP, đủ để làm từ đầu đến cuối không cần mở file khác — gồm cả
VIEW SQL, thao tác trên giao diện (kèm ảnh), và nguyên khối `DefinitionJson`
để dán thẳng vào rp-user. Phần giải thích kiến trúc/lý do kỹ thuật sâu hơn
(vì sao 2 domain riêng, các domain DSMART16 khác ngoài 2 báo cáo này...) xem
thêm `hướng_dẫn_báo_cáo.md` mục 11/15 — nhưng không bắt buộc phải đọc để
làm theo file này.

**DSMART16 thật ra là 2 CSDL riêng** — `DSMART16` (dữ liệu ĐANG PHÁT SINH
trong tháng hiện tại, "Live") và `DSMART16_EOM` (dữ liệu các tháng ĐÃ ĐÓNG
sổ trong quá khứ — "End Of Month"). Vì cột "Cùng kỳ năm trước"/"Tỷ lệ %
LFL" của báo cáo cần dữ liệu 1 NĂM TRƯỚC — chắc chắn không còn nằm trong
`DSMART16` (DB Live chỉ giữ tháng hiện tại) mà nằm trong `DSMART16_EOM` —
nên phải đọc dữ liệu doanh thu/giao dịch từ **CẢ 2 CSDL**, không phải 1.
May mắn là kiến trúc ETL đã có sẵn cơ chế đúng cho việc này (mục 11
`hướng_dẫn_báo_cáo.md` gọi đây là mô hình "2 nguồn Live + Lịch sử") — chỉ
cần tạo 2 "Nguồn dữ liệu" (1 trỏ `DSMART16`, 1 trỏ `DSMART16_EOM`) rồi tạo
2 Sync Job CÙNG 1 Domain cho mỗi loại số liệu (1 job đọc Live, 1 job đọc
Lịch sử) — dữ liệu 2 nguồn tự động ghép thành 1 dải liên tục khi báo cáo
chạy, không cần cấu hình gì thêm ở phía rp-user. Xem chi tiết ở Bước 2.

> **Lưu ý về ảnh minh hoạ**: ảnh chụp dưới đây lấy từ ĐÚNG giao diện thật
> của etl-admin/rp-user (không phải hình vẽ tay), nhưng dữ liệu hiển thị
> (tên nguồn, số liệu chỉ tiêu, danh sách báo cáo...) là **dữ liệu mẫu**
> dựng trong môi trường thử nghiệm — không phải dữ liệu thật của DSMART16.
> Bố cục nút bấm/ô nhập là chính xác 100%; tên/số bạn thấy khi làm thật sẽ
> khác (đúng theo dữ liệu bạn có).

---

## Tổng quan các bước

1. Tạo 2 VIEW — **trên CẢ 2 CSDL** `DSMART16` và `DSMART16_EOM` (làm ở SQL
   Server Management Studio hoặc công cụ quản trị CSDL — KHÔNG phải trên
   giao diện web).
2. etl-admin → **Nguồn dữ liệu**: khai 2 kết nối (Live + Lịch sử) →
   **Đồng bộ**: tạo 4 job đồng bộ (Doanh thu × 2 nguồn, Giao dịch × 2
   nguồn — mỗi cặp CÙNG 1 Domain để tự ghép).
3. etl-admin → **Chỉ tiêu Lãnh đạo Tập đoàn** / **Chỉ tiêu HCRC**: nhập file
   chỉ tiêu tháng cho từng bên.
4. rp-user → **Hệ thống → Biểu mẫu**: tạo 2 báo cáo (LDTD, HCRC) bằng
   `DefinitionJson`.
5. rp-user → **Hệ thống → Phân quyền**: gán quyền xem đúng báo cáo cho đúng
   nhóm.
6. rp-user → **Hệ thống → Lịch gửi email báo cáo**: đặt lịch gửi tự động
   (không bắt buộc).
7. Kiểm tra lại.

---

## Bước 1 — Tạo VIEW trên CẢ 2 CSDL DSMART16 (làm trước, ngoài giao diện web)

> **Đã kiểm chứng lại bằng dữ liệu THẬT (không còn là dự đoán theo tên
> cột)** — bản trước của mục này dùng bảng `DSTK_INFO` cho VIEW "Doanh
> thu", nhưng thực tế `DSTK_INFO` HOÀN TOÀN TRỐNG (0 dòng) trên cả
> `DSMART16` lẫn `DSMART16_EOM` — không phải bảng chứa dữ liệu bán hàng
> thật. Bảng đúng là **`STRANS`** (Live) / **`STRANS_EOM`** + các bảng
> `STRANS_YYYYMM` theo tháng (Lịch sử). Xem lại toàn bộ script bên dưới —
> ĐÃ đổi khác hẳn bản trước, không chỉ sửa 2 dòng như cũ.

"Ngoài giao diện web" nghĩa là chạy trực tiếp trên CSDL DSMART16 bằng 1
công cụ quản trị SQL Server — KHÔNG phải vào etl-admin/rp-user (2 trang đó
cố tình không có chỗ gõ SQL tuỳ ý, chỉ duyệt bảng/cột có sẵn, vì lý do an
toàn).

**Công cụ**: SQL Server Management Studio (SSMS — phổ biến nhất, tải miễn
phí từ Microsoft) hoặc Azure Data Studio. Dùng bản IT/DBA đã cài sẵn nếu có.

**Các bước cụ thể — LẶP LẠI CHO CẢ 2 CSDL** (`DSMART16` rồi `DSMART16_EOM`
— 2 lượt Connect + New Query + Execute riêng, VIEW là object CỦA TỪNG CSDL,
tạo ở CSDL này không tự có ở CSDL kia dù cùng 1 máy chủ `172.16.70.20`).
Tên VIEW **giống hệt nhau** ở cả 2 CSDL (`V_HCRC_DOANHTHU_CHINHANH`/
`V_HCRC_GIAODICH_CHINHANH`) — nhưng nội dung câu lệnh **khác nhau khá
nhiều** ở VIEW Doanh thu (2 CSDL dùng 2 bảng nguồn khác cấu trúc — xem giải
thích ở Script B, đã dựng sẵn thành 2 script riêng ngay dưới đây, không
cần tự sửa tay):

1. Mở SSMS → hộp thoại "Connect to Server" hiện ra:
   - **Server name**: địa chỉ máy chủ SQL Server đang chạy DSMART16 (hỏi
     DBA/IT nếu chưa biết — thường dạng `192.168.x.x` hoặc
     `tenmaychu\SQLEXPRESS`). Thường CẢ 2 CSDL nằm CHUNG 1 máy chủ, chỉ
     khác tên Database — nếu vậy chỉ cần Connect 1 lần, đổi CSDL ở bước 2.
   - **Authentication**: SQL Server Authentication → nhập Username/Password
     của **tài khoản có quyền tạo VIEW** trên CSDL đó.
   - Bấm **Connect**.
2. Cây bên trái (Object Explorer) → mở rộng **Databases** → chọn CSDL
   `DSMART16` (lượt đầu) hoặc `DSMART16_EOM` (lượt sau).
3. Bấm **New Query** (hoặc `Ctrl+N`) — mở cửa sổ soạn thảo trống, đang trỏ
   đúng CSDL vừa chọn ở bước 2 (kiểm tra lại ô chọn Database ở thanh công
   cụ phía trên cửa sổ Query, ngay cạnh nút Execute — chọn NHẦM CSDL sẽ
   tạo VIEW vào sai chỗ mà không báo lỗi gì).
4. Dán nguyên **Script A** (đang ở CSDL `DSMART16`) hoặc **Script B**
   (đang ở CSDL `DSMART16_EOM`) — 2 script khác nhau, xem ngay dưới đây.
   Cả 2 script đã điền sẵn mã MART/MINIMART thật (`STOCK.TYPE = '01'`/`'02'`)
   — KHÔNG cần điền gì thêm, dán chạy thẳng.
5. Bấm **Execute** (hoặc phím `F5`). Không có dòng lỗi đỏ ở khung kết quả
   phía dưới là thành công.
6. Kiểm tra: mở rộng CSDL đó → mục **Views** → thấy đủ
   `V_HCRC_DOANHTHU_CHINHANH` và `V_HCRC_GIAODICH_CHINHANH` trong danh sách.
7. Lặp lại đúng bước 2-6 cho CSDL còn lại.

**Về quyền — ai nên làm bước này**: tài khoản chạy `CREATE VIEW` ở đây
KHÁC tài khoản sẽ khai ở etl-admin (mục "Nguồn dữ liệu", Bước 2 dưới) —
tài khoản khai ở etl-admin chỉ nên **CHỈ ĐỌC** (SELECT), không đủ quyền tạo
VIEW. Vì vậy bước này thường là việc của **DBA/IT quản trị DSMART16** — gửi
2 đoạn SQL này cho họ chạy giúp nếu bạn không có tài khoản quyền cao hơn.
Sau khi VIEW đã tồn tại, tài khoản chỉ-đọc dùng ở etl-admin cần được cấp
thêm quyền `SELECT` trên đúng 2 VIEW đó (DBA cấp quyền, không cần quyền tạo
VIEW).

**VIEW có tồn tại mãi mãi không?** Có — `CREATE VIEW` tạo ra 1 object lưu
CỐ ĐỊNH trong CSDL (giống như tạo 1 bảng), KHÔNG tự hết hạn, KHÔNG mất khi
khởi động lại máy chủ SQL Server, KHÔNG cần chạy lại. VIEW chỉ mất đi nếu
có ai đó chủ động chạy `DROP VIEW <tên>`. Cần lưu ý 2 điều:

- VIEW **không lưu dữ liệu riêng** — nó chỉ là 1 câu `SELECT` đã lưu sẵn
  tên. Mỗi lần job đồng bộ (Bước 2) đọc VIEW, SQL Server tự chạy LẠI câu
  `SELECT` đó trên dữ liệu THẬT MỚI NHẤT của `STRANS`/`TRANSHDR`/`STOCK`/
  `COSTPRICE` (Live) hoặc `STRANS_YYYYMM`/`STRANS_EOM`/`TRANSHDR_ARC`
  (Lịch sử) — không phải đọc số liệu cũ đã "chụp" từ lúc tạo VIEW.
- Nếu sau này DBA đổi cấu trúc 1 trong 4 bảng nguồn (đổi tên cột, xoá cột
  đang dùng trong VIEW...), VIEW sẽ báo lỗi khi chạy — cần sửa lại câu
  `CREATE VIEW` (dùng `ALTER VIEW` để sửa, không cần xoá tạo lại) cho khớp
  cấu trúc mới. Việc này hiếm khi xảy ra với 1 hệ thống đã ổn định như
  DSMART16.

### Script A — chạy trên CSDL `DSMART16` (Live)

```sql
-- VIEW 1: Doanh thu + Lãi gộp + Diện tích + Nhóm chuỗi, gộp theo (chi nhánh, ngày)
-- STRANS = bảng CHI TIẾT giao dịch thật (KHÔNG phải DSTK_INFO — bảng đó
-- rỗng, đã xác nhận bằng SELECT COUNT(*) thật). JOIN sang TRANSHDR qua
-- TRANS_NUM CHỈ để lấy STATUS đáng tin (loại đúng giao dịch huỷ).
-- STOCK.TYPE (KHÔNG phải STYPE_ID — cột đó luôn trống) phân loại
-- '01'=MART, '02'=MINIMART, đã xác nhận qua tên chi nhánh thật.
-- COSTPRICE.STK_ID LUÔN TRỐNG (giá vốn dùng CHUNG toàn hệ thống, không
-- theo từng chi nhánh) — CHỈ JOIN theo SKU_ID + MEC_YM, KHÔNG có STK_ID.
CREATE OR ALTER VIEW V_HCRC_DOANHTHU_CHINHANH AS
SELECT
    d.STK_ID, CAST(d.TRAN_DATE AS DATE) AS WORK_DATE,
    SUM(d.QTY) AS SoLuongBan,
    SUM(d.AMOUNT) AS doanhThu,
    SUM(d.VAT_AMT) AS TienVAT,
    SUM(d.DISCOUNT) AS TienGiamGia,
    SUM(d.COMM_AMT) AS HoaHong,
    SUM(d.AMOUNT) - SUM(d.QTY * ISNULL(c.COSTPRICE, 0)) AS laiGop,
    MAX(s.DIMENSION) AS dienTich,
    MAX(CASE WHEN s.TYPE = '01' THEN 'MART'
             WHEN s.TYPE = '02' THEN 'MINIMART'
             ELSE s.TYPE END) AS chain
FROM STRANS d
JOIN TRANSHDR h
    ON h.TRANS_NUM = d.TRANS_NUM
JOIN STOCK s
    ON s.STK_ID = d.STK_ID
LEFT JOIN COSTPRICE c
    ON c.SKU_ID = d.SKU_ID
   AND c.MEC_YM = LEFT(CONVERT(char(8), d.TRAN_DATE, 112), 6)
WHERE h.STATUS <> 'D' -- 'D' = Huỷ (đã xác nhận với người quản trị DSMART16); 'N'=Mới, 'M'=Sửa đều tính vào doanh thu
GROUP BY d.STK_ID, CAST(d.TRAN_DATE AS DATE);
GO

-- VIEW 2: Số giao dịch, gộp theo (chi nhánh, ngày) — BU_ID chưa phải mã chuẩn,
-- sẽ quy đổi ở Bước 2 bằng "Ánh xạ mã chi nhánh"
CREATE OR ALTER VIEW V_HCRC_GIAODICH_CHINHANH AS
SELECT BU_ID, CAST(TRAN_DATE AS DATE) AS TRAN_DATE,
       COUNT(*) AS SoGiaoDich, SUM(AMOUNT) AS TongTien,
       SUM(DISCOUNT) AS TongGiamGia, SUM(VAT_AMT) AS TongVAT
FROM TRANSHDR
WHERE STATUS <> 'D' -- 'D' = Huỷ
GROUP BY BU_ID, CAST(TRAN_DATE AS DATE);
GO
```

**Mã `STATUS` đã xác nhận với người quản trị DSMART16** (bảng `TRANSHDR`,
áp dụng chung cho cả `STRANS`/`STRANS_EOM`/`TRANSHDR_ARC`): `N` = Mới,
`M` = Sửa (vẫn là giao dịch hợp lệ, tính vào doanh thu), `D` = Huỷ (LOẠI
khỏi doanh thu/giao dịch). Trước đây bản hướng dẫn dùng nhầm `STATUS <>
'X'` — mã `'X'` KHÔNG tồn tại trong dữ liệu thật, không lọc được gì.

### Script B — chạy trên CSDL `DSMART16_EOM` (Lịch sử)

**KHÁC HẲN Script A, không chỉ đổi 2 dòng như dự đoán ban đầu** — 2 điều
đã xác nhận bằng dữ liệu thật:

1. `DSMART16_EOM` KHÔNG có 1 bảng `STRANS_EOM` duy nhất chứa đủ lịch sử —
   dữ liệu bị chia thành **93 bảng theo tháng** (`STRANS_201812` …
   `STRANS_202608`, cùng cấu trúc HỆT `STRANS_EOM`, đã đối chiếu từng cột
   bằng file schema thật) + `STRANS_EOM` (vùng đệm ~1-2 tháng gần nhất).
   Phải `UNION ALL` hết các bảng này mới đủ dữ liệu cho "Cùng kỳ năm
   trước" (dùng script sinh SQL tự động bên dưới, KHÔNG gõ tay 93 tên
   bảng).
2. **`TRANS_NUM` giữa `STRANS_EOM` và `TRANSHDR_ARC` sinh theo 2 QUY TẮC
   KHÁC NHAU** (vd `STRANS_EOM` có dạng `004AB2212609001203` xen chữ cái,
   `TRANSHDR_ARC` thuần số) — **JOIN qua `TRANS_NUM` như Script A KHÔNG
   khớp được** ở CSDL này (đã kiểm chứng: JOIN ra 0 dòng dù cả 2 bảng đều
   có dữ liệu riêng). Vì vậy VIEW "Doanh thu" ở `DSMART16_EOM` dùng THẲNG
   cột `STATUS` có sẵn TRONG chính `STRANS_EOM`/`STRANS_YYYYMM` (không
   JOIN sang `TRANSHDR_ARC`) — đã đối chiếu số liệu 1 ngày/1 chi nhánh
   trùng giữa Live và EOM, chênh lệch < 0.5%, đủ tin cậy.

`STOCK`/`COSTPRICE` vẫn CHỈ có ở `DSMART16` (không có ở EOM, đúng dự đoán
ban đầu) — tham chiếu chéo `DSMART16.dbo.STOCK`/`DSMART16.dbo.COSTPRICE`
như cũ.

```sql
-- VIEW 1: Doanh thu — GỘP (UNION ALL) toàn bộ bảng STRANS_YYYYMM + STRANS_EOM.
-- Chạy nguyên khối này (kể cả phần DECLARE/EXEC) — KHÔNG tách riêng câu
-- CREATE VIEW, vì danh sách 93 bảng được sinh TỰ ĐỘNG từ sys.tables, không
-- gõ tay để tránh gõ sai/sót tên bảng.
DECLARE @sql NVARCHAR(MAX);

SELECT @sql = STRING_AGG(
    'SELECT STK_ID, SKU_ID, TRAN_DATE, QTY, AMOUNT, VAT_AMT, DISCOUNT, COMM_AMT FROM '
    + QUOTENAME(name) + ' WHERE STATUS <> ''D''',
    ' UNION ALL '
)
FROM sys.tables
WHERE name LIKE 'STRANS[_][0-9][0-9][0-9][0-9][0-9][0-9]' OR name = 'STRANS_EOM';

SET @sql = N'
CREATE OR ALTER VIEW V_HCRC_DOANHTHU_CHINHANH AS
SELECT
    d.STK_ID, CAST(d.TRAN_DATE AS DATE) AS WORK_DATE,
    SUM(d.QTY) AS SoLuongBan,
    SUM(d.AMOUNT) AS doanhThu,
    SUM(d.VAT_AMT) AS TienVAT,
    SUM(d.DISCOUNT) AS TienGiamGia,
    SUM(d.COMM_AMT) AS HoaHong,
    SUM(d.AMOUNT) - SUM(d.QTY * ISNULL(c.COSTPRICE, 0)) AS laiGop,
    MAX(s.DIMENSION) AS dienTich,
    MAX(CASE WHEN s.TYPE = ''01'' THEN ''MART''
             WHEN s.TYPE = ''02'' THEN ''MINIMART''
             ELSE s.TYPE END) AS chain
FROM (' + @sql + N') d
JOIN DSMART16.dbo.STOCK s ON s.STK_ID = d.STK_ID
LEFT JOIN DSMART16.dbo.COSTPRICE c ON c.SKU_ID = d.SKU_ID
   AND c.MEC_YM = LEFT(CONVERT(char(8), d.TRAN_DATE, 112), 6)
GROUP BY d.STK_ID, CAST(d.TRAN_DATE AS DATE);';

EXEC sp_executesql @sql;
GO

-- VIEW 2: Giao dịch — TRANSHDR_ARC là 1 bảng lưu trữ ĐẦY ĐỦ (đã xác nhận
-- phủ từ 2018 tới nay), KHÔNG cần UNION ALL như VIEW 1.
CREATE OR ALTER VIEW V_HCRC_GIAODICH_CHINHANH AS
SELECT BU_ID, CAST(TRAN_DATE AS DATE) AS TRAN_DATE,
       COUNT(*) AS SoGiaoDich, SUM(AMOUNT) AS TongTien,
       SUM(DISCOUNT) AS TongGiamGia, SUM(VAT_AMT) AS TongVAT
FROM TRANSHDR_ARC
WHERE STATUS <> 'D'
GROUP BY BU_ID, CAST(TRAN_DATE AS DATE);
GO
```

> **Bảo trì lâu dài — QUAN TRỌNG**: đoạn tạo VIEW "Doanh thu" ở trên phải
> **CHẠY LẠI mỗi khi có thêm bảng `STRANS_YYYYMM` mới** (hệ thống DSMART16
> tự tạo thêm bảng tháng mới định kỳ) — vì `CREATE VIEW` chỉ chụp danh
> sách bảng tại THỜI ĐIỂM chạy, không tự nhận bảng phát sinh sau đó. Dùng
> `CREATE OR ALTER` nên chạy lại bao nhiêu lần cũng an toàn (không tạo
> trùng).

**Tự động chạy lại hàng tháng — dùng SQL Server Agent (khuyên dùng, đỡ
phải nhớ tay)**: gói đoạn sinh VIEW ở trên thành 1 stored procedure trên
`DSMART16_EOM` (chạy 1 lần — NGUYÊN VĂN đoạn `DECLARE...EXEC sp_executesql`
đã chạy tay ở trên, chỉ bọc thêm `CREATE OR ALTER PROCEDURE ... AS BEGIN
... END`, không đổi logic bên trong nên không cần lồng thêm dấu nháy đơn):

```sql
CREATE OR ALTER PROCEDURE dbo.sp_HCRC_RebuildDoanhThuView AS
BEGIN
    DECLARE @sql NVARCHAR(MAX);

    SELECT @sql = STRING_AGG(
        'SELECT STK_ID, SKU_ID, TRAN_DATE, QTY, AMOUNT, VAT_AMT, DISCOUNT, COMM_AMT FROM '
        + QUOTENAME(name) + ' WHERE STATUS <> ''D''',
        ' UNION ALL '
    )
    FROM sys.tables
    WHERE name LIKE 'STRANS[_][0-9][0-9][0-9][0-9][0-9][0-9]' OR name = 'STRANS_EOM';

    SET @sql = N'
    CREATE OR ALTER VIEW V_HCRC_DOANHTHU_CHINHANH AS
    SELECT
        d.STK_ID, CAST(d.TRAN_DATE AS DATE) AS WORK_DATE,
        SUM(d.QTY) AS SoLuongBan,
        SUM(d.AMOUNT) AS doanhThu,
        SUM(d.VAT_AMT) AS TienVAT,
        SUM(d.DISCOUNT) AS TienGiamGia,
        SUM(d.COMM_AMT) AS HoaHong,
        SUM(d.AMOUNT) - SUM(d.QTY * ISNULL(c.COSTPRICE, 0)) AS laiGop,
        MAX(s.DIMENSION) AS dienTich,
        MAX(CASE WHEN s.TYPE = ''01'' THEN ''MART''
                 WHEN s.TYPE = ''02'' THEN ''MINIMART''
                 ELSE s.TYPE END) AS chain
    FROM (' + @sql + N') d
    JOIN DSMART16.dbo.STOCK s ON s.STK_ID = d.STK_ID
    LEFT JOIN DSMART16.dbo.COSTPRICE c ON c.SKU_ID = d.SKU_ID
       AND c.MEC_YM = LEFT(CONVERT(char(8), d.TRAN_DATE, 112), 6)
    GROUP BY d.STK_ID, CAST(d.TRAN_DATE AS DATE);';

    EXEC sp_executesql @sql;
END
GO
```

Stored procedure trên đã điền sẵn mã MART/MINIMART thật, KHÔNG cần sửa gì
thêm. Chạy thử ngay: `EXEC dbo.sp_HCRC_RebuildDoanhThuView;` — không lỗi là
xong bước này.

Sau đó tạo Job gọi lại ĐÚNG stored procedure này vào ngày 2 mỗi tháng
(chừa 1 ngày sau khi bảng tháng mới thường được tạo) — @command ở đây chỉ
1 dòng gọi procedure, không lồng dấu nháy phức tạp:

```sql
USE msdb;
GO
EXEC dbo.sp_add_job
    @job_name = N'HCRC - Cap nhat lai VIEW V_HCRC_DOANHTHU_CHINHANH';
GO
EXEC dbo.sp_add_jobstep
    @job_name = N'HCRC - Cap nhat lai VIEW V_HCRC_DOANHTHU_CHINHANH',
    @step_name = N'Goi stored procedure sinh lai VIEW',
    @database_name = N'DSMART16_EOM',
    @subsystem = N'TSQL',
    @command = N'EXEC dbo.sp_HCRC_RebuildDoanhThuView;';
GO
EXEC dbo.sp_add_schedule
    @schedule_name = N'Hang thang - ngay 2',
    @freq_type = 16,          -- Hàng tháng
    @freq_interval = 2,       -- Ngày 2
    @active_start_time = 30000; -- 03:00:00
GO
EXEC dbo.sp_attach_schedule
    @job_name = N'HCRC - Cap nhat lai VIEW V_HCRC_DOANHTHU_CHINHANH',
    @schedule_name = N'Hang thang - ngay 2';
GO
EXEC dbo.sp_add_jobserver
    @job_name = N'HCRC - Cap nhat lai VIEW V_HCRC_DOANHTHU_CHINHANH';
GO
```

Cần quyền `SQLAgentOperatorRole` trở lên để chạy đoạn tạo Job này — nếu
không có, nhờ DBA chạy giúp. Sau khi tạo, kiểm tra lại: SQL Server Agent →
Jobs → thấy đúng tên job, chuột phải → "Start Job at Step..." để chạy thử
ngay 1 lần (không cần đợi tới ngày 2).

**Không có SQL Server Agent (bản Express) hoặc không có quyền tạo Job** —
bỏ qua phần Job, chỉ cần tạo stored procedure ở trên rồi đặt lịch nhắc
(Outlook/Google Calendar/lịch nhắc việc nội bộ) cho DBA tự chạy tay
`EXEC dbo.sp_HCRC_RebuildDoanhThuView;` mỗi đầu tháng, hoặc bất cứ khi nào
thấy cột "Cùng kỳ năm trước" thiếu dữ liệu của tháng gần đây (xem Bước 7).

**Đã xác nhận đầy đủ bằng dữ liệu thật** (không còn placeholder nào trong
2 script trên):

1. `STOCK.TYPE` (KHÔNG phải `STYPE_ID` — cột đó luôn trống ở mọi dòng, đã
   xác nhận `SELECT DISTINCT STYPE_ID FROM STOCK` chỉ ra 1 giá trị trống) là
   cột phân loại MART/MINIMART thật: `'01'` = MART (118 chi nhánh, tên
   "Siêu thị BRGMart..."), `'02'` = MINIMART (168 chi nhánh) — đã xác nhận
   qua tên chi nhánh thật và người quản trị DSMART16. *Lưu ý nhỏ*: trong mẫu
   `TYPE='02'` có vài dòng tên "Kho hàng..." (không phải branding MiniMart
   bán lẻ) — nhiều khả năng là kho trung chuyển được xếp chung nhóm `02`;
   không ảnh hưởng báo cáo nếu các kho này không phát sinh giao dịch bán lẻ
   (STRANS).
2. `COSTPRICE.MEC_YM` — định dạng `YYYYMM` (vd `'202609'`) đã xác nhận đúng
   qua dữ liệu thật, không cần sửa.
3. **Phát hiện thêm (không có trong hướng dẫn gốc)**: `COSTPRICE.STK_ID`
   LUÔN TRỐNG ở 100% dòng (đã xác nhận: số dòng trống = tổng số dòng bảng).
   COSTPRICE là bảng giá vốn DÙNG CHUNG toàn hệ thống (1 giá/SKU/tháng,
   KHÔNG theo từng chi nhánh) — nếu JOIN theo cả `STK_ID` (như bản gốc từng
   giả định) thì KHÔNG BAO GIỜ khớp, khiến giá vốn luôn = 0 và "Lãi gộp"
   luôn bằng đúng doanh thu (sai, nhưng KHÔNG báo lỗi gì). Cả 2 script trên
   đã sửa: JOIN COSTPRICE CHỈ theo `SKU_ID + MEC_YM`, KHÔNG có `STK_ID`.

---

## Bước 2 — etl-admin: khai 2 Nguồn dữ liệu + tạo 4 job đồng bộ

Vì DSMART16 là **2 CSDL riêng** (`DSMART16` Live + `DSMART16_EOM` Lịch sử
— xem giải thích ở đầu file), mỗi loại số liệu (Doanh thu, Giao dịch) cần
**2 job** — 1 đọc CSDL Live, 1 đọc CSDL Lịch sử, CÙNG 1 Domain để tự ghép
lại thành 1 dải liên tục khi báo cáo chạy. Tổng cộng **4 job**, không phải
2.

> **Có cách làm nhanh hơn bấm tay 4 lần**: sau khi tạo xong 2 VIEW ở Bước 1,
> chạy `node etl/scripts/seedLdtdHcrcSync.js` (điền `DSMART16_SERVER`/
> `DSMART16_USER`/`DSMART16_PASSWORD` vào `.env` trước — xem chú thích đầu
> file script) — script tự tạo/CẬP NHẬT đúng 2 Nguồn dữ liệu + 4 job dưới
> đây (chạy lại nhiều lần AN TOÀN, tự nhận diện job/nguồn đã có để sửa thay
> vì tạo trùng), tự kiểm tra VIEW đã tồn tại trước khi tạo job. Đọc tiếp
> mục dưới nếu muốn hiểu rõ từng ô trên giao diện, hoặc muốn tự bấm tay.

### 2.1 — Khai 2 "Nguồn dữ liệu"

Vào etl-admin, menu **"Nguồn dữ liệu"** (sidebar bên trái). Điền form 2
lần, mỗi lần 1 kết nối:

**Nguồn 1 — Live**:
- **Tên nguồn**: "DSMART16 - Live".
- **Loại**: SQL Server.
- **Server**: địa chỉ máy chủ SQL Server (giống bước 1).
- **Database**: `DSMART16`.
- **Username/Password**: tài khoản **CHỈ ĐỌC** (SELECT) — KHÔNG dùng tài
  khoản đã tạo VIEW ở Bước 1 (tài khoản đó quyền rộng hơn cần thiết).
- Bấm **"Kiểm tra kết nối"** trước, thấy ✅ mới bấm **"Lưu nguồn dữ liệu"**.

**Nguồn 2 — Lịch sử**: y hệt, chỉ đổi **Tên nguồn**: "DSMART16 - Lịch sử",
**Database**: `DSMART16_EOM`. Tên này PHẢI khớp đúng chữ với tên script
`etl/scripts/seedLdtdHcrcSync.js` tìm/cập nhật theo (xem hộp "cách làm
nhanh hơn" ở trên) — nếu đã tự tạo nguồn này qua giao diện với tên khác,
đổi lại đúng "DSMART16 - Lịch sử" (nút "Sửa") trước khi chạy script, để
script chỉ CẬP NHẬT thay vì tạo thêm 1 nguồn trùng.

Sau khi lưu cả 2, danh sách hiện như sau:

![Trang Nguồn dữ liệu — 2 nguồn Live + Lịch sử](hinh-huong-dan-ldtd-hcrc/11-nguon-du-lieu-danh-sach.png)

### 2.2 — Tạo 4 job đồng bộ

Vào menu **"Đồng bộ"**. Tạo lần lượt 4 job — form giống hệt nhau, chỉ khác
**Chọn nguồn dữ liệu**/**Domain**/**Lịch chạy** theo bảng dưới:

| # | Tên job (gợi ý) | Nguồn dữ liệu | Bảng/view chính | Cột khoá | Cột ngày | Domain | Ánh xạ mã chi nhánh | Lịch chạy |
|---|---|---|---|---|---|---|---|---|
| 1 | Doanh thu chi nhánh - Live | DSMART16 - Live | `dbo.V_HCRC_DOANHTHU_CHINHANH` | `STK_ID` | `WORK_DATE` | `doanhthu_chinhanh` | (để trống) | `*/15 * * * *` |
| 2 | Doanh thu chi nhánh - Lịch sử | DSMART16 - Lịch sử | `dbo.V_HCRC_DOANHTHU_CHINHANH` | `STK_ID` | `WORK_DATE` | `doanhthu_chinhanh` | (để trống) | `0 3 * * *` |
| 3 | Giao dịch chi nhánh - Live | DSMART16 - Live | `dbo.V_HCRC_GIAODICH_CHINHANH` | `BU_ID` | `TRAN_DATE` | `giaodich_chinhanh` | `BU_ID` | `*/15 * * * *` |
| 4 | Giao dịch chi nhánh - Lịch sử | DSMART16 - Lịch sử | `dbo.V_HCRC_GIAODICH_CHINHANH` | `BU_ID` | `TRAN_DATE` | `giaodich_chinhanh` | `BU_ID` | `0 3 * * *` |

Cả 4 job đều: **Cột thời gian cập nhật (watermark)** = giống Cột ngày;
job 1-2 tick Dimensions `dienTich`/`chain` + Measures `doanhThu`/`laiGop`;
job 3-4 tick Measures `SoGiaoDich`; **BẬT "Giữ lịch sử theo ngày"** ở CẢ 4
job (bắt buộc, không riêng job Live — thiếu ở job nào thì domain đó mất
dữ liệu ngày cũ của đúng nguồn đó); KHÔNG tick "Thêm bảng/view liên kết"
(VIEW đã tự JOIN sẵn).

**Vì sao lịch chạy job Lịch sử thưa hơn (`0 3 * * *` = 3h sáng/ngày thay vì
15 phút/lần)**: CSDL `DSMART16_EOM` là kho lưu trữ tháng ĐÃ ĐÓNG SỔ, không
phát sinh giao dịch mới trong ngày — chạy dày như job Live chỉ tốn tải CSDL
vô ích. Job Live vẫn cần chạy dày vì dữ liệu HÔM NAY đang phát sinh liên
tục.

**Vì sao domain của job 1 và job 2 phải TRÙNG NHAU (`doanhthu_chinhanh`)**
— đây là điểm khác với lý do tách domain doanh thu/giao dịch: 2 job cùng
đọc CÙNG 1 VIEW (`V_HCRC_DOANHTHU_CHINHANH`), CÙNG khoá `STK_ID` — không hề
xung đột ghi đè như trường hợp doanh thu-vs-giao dịch (khác bảng/khác
khoá). Mỗi `Nguồn dữ liệu` tự có 1 `SourceSystem` riêng (etl tự sinh, không
phải gõ tay), nên khoá ghi thật sự vào Data Warehouse là
`(SourceSystem, Domain, EntityCode, EventDate)` — 2 job Live/Lịch sử khác
nhau ở `SourceSystem` (2 nguồn khác nhau), nên KHÔNG BAO GIỜ ghi đè lên
nhau dù có cùng `EventDate` — dữ liệu 2 nguồn xếp cạnh nhau thành 1 dải
liên tục theo thời gian.

**Lưu ý đã xác nhận với DBA — `DSMART16_EOM` NHẬN THÊM dữ liệu mỗi khi hết
tháng** (không phải đổ 1 lần rồi thôi) — nghĩa là đúng những ngày quanh lúc
đóng sổ tháng, có khả năng 1 chi nhánh/1 ngày tồn tại dữ liệu Ở CẢ 2 nguồn
cùng lúc (bản Live "đóng băng" trước khi bị dọn khỏi `DSMART16`, VÀ bản mới
chép sang `DSMART16_EOM`) — 2 dòng khác `SourceSystem` như trên, KHÔNG ghi
đè nhau, nhưng CÓ trùng `EntityCode`+`EventDate`. Báo cáo composite
(`rp-server/lib/compositeReportRunner.js`) đã có sẵn cơ chế an toàn cho
đúng trường hợp này: phát hiện 1 chi nhánh có >1 dòng trong cùng 1 khối ở
cùng 1 ngày → **loại hẳn chi nhánh đó khỏi báo cáo ngày hôm đó** (ghi cảnh
báo ở Log/console, KHÔNG hiện số sai/số gấp đôi). Quyết định đã chốt: CHẤP
NHẬN hiện trạng này (không sửa code để tự chọn nguồn nào đúng hơn) — ảnh
hưởng chỉ đúng 1-2 ngày/tháng, các ngày còn lại bình thường. Xem cách phát
hiện việc này xảy ra ở Bước 7.

Điền xong cả 4 job (job 1 minh hoạ, các job sau đổi đúng bảng trên):

![Form tạo job — điền đầy đủ (job Doanh thu - Live)](hinh-huong-dan-ldtd-hcrc/02-dong-bo-form-day-du.png)

Sau khi tạo đủ 4 job, trang "Đồng bộ" hiện như sau — 2 job đầu cùng domain
`doanhthu_chinhanh`, 2 job sau cùng domain `giaodich_chinhanh`:

![Trang Đồng bộ — đủ 4 job](hinh-huong-dan-ldtd-hcrc/12-dong-bo-4-job.png)

**Riêng Ánh xạ mã chi nhánh (`BU_ID`)** — job 3 VÀ job 4 đều cần bật, vì cả
2 đều đọc từ `TRANSHDR` (khoá gốc `BU_ID`, chưa phải mã chuẩn). Khai sẵn
bảng quy đổi ở menu **"Ánh xạ mã chi nhánh"** (mỗi dòng: `BU_ID` nào ứng
với mã siêu thị chuẩn nào) TRƯỚC khi 2 job này chạy thật — chưa khai đủ
vẫn chạy được, chỉ ghi cảnh báo ở Log cho những mã chưa khai (xem
`etl/README.md`).

---

## Bước 3 — etl-admin: nhập chỉ tiêu

**Chỉ tiêu ở đây là chỉ tiêu THEO NGÀY** (không phải chia đều cả tháng) —
khớp đúng 2 mẫu file Excel thật đội Lãnh đạo Tập đoàn/HCRC đang dùng để
tính chỉ tiêu ngày từ tỷ lệ N-1/LFL. Hệ thống TỰ NHẬN DIỆN định dạng file
theo tên cột (xem chi tiết trong `etl/lib/salesTargetsImport.js`) — tải
NGUYÊN VĂN file mẫu thật lên, không cần đổi tên cột gì cả.

### Chỉ tiêu Lãnh đạo Tập đoàn

Vào menu **"Chỉ tiêu Lãnh đạo Tập đoàn"** (sidebar). Trang KHÔNG có ô nhập
Domain — đã khoá cứng sẵn `sales-targets-ldtd`, không lo trùng với bên kia:

![Trang Chỉ tiêu Lãnh đạo Tập đoàn](hinh-huong-dan-ldtd-hcrc/03-chi-tieu-ldtd.png)

1. File Excel (.xlsx) đúng mẫu thật đội Lãnh đạo Tập đoàn gửi — dòng 1 là
   ghi chú (bỏ qua), dòng 2 là header, dữ liệu từ dòng 3, cột cố định:

   | Ngày/tháng | Ngày | Điểm | Nhóm điểm | Doanh thu | Bill |
   |---|---|---|---|---|---|
   | 20260901 | 01 | 001 | Mart | 212013820.47 | 831.43 |
   | 20260902 | 02 | 001 | Mart | 215404906.78 | 844.73 |

   `Ngày/tháng` = ngày áp dụng (chấp nhận số YYYYMMDD hoặc ô định dạng
   ngày thật). `Điểm` = mã siêu thị (EntityCode). `Nhóm điểm` (Mart/Mini) —
   ghi thêm vào TargetsJson để tham khảo, báo cáo hiện tại không dùng field
   này. `Doanh thu`/`Bill` — 2 chỉ tiêu, hệ thống TỰ CẮT phần thập phân
   (không làm tròn), lưu thành `ChiTieuDoanhThu`/`ChiTieuGiaoDich` — khớp
   sẵn công thức trong DefinitionJson Bước 4, không cần đổi gì. Phải điền
   ĐỦ CẢ 2 cột Doanh thu và Bill ở 1 dòng (không điền riêng lẻ 1 trong 2).
2. Bấm **"Choose File"**, chọn file → bấm **"Nhập chỉ tiêu"**.
3. Bảng "Chỉ tiêu đã nhập" cập nhật ngay — mỗi dòng có nút "Sửa" để chỉnh
   riêng 1 siêu thị/1 ngày (mở/đóng cửa giữa tháng, hoặc chỉnh tay 1 ngày)
   mà không cần chuẩn bị lại cả file.

### Chỉ tiêu HCRC

Vào menu **"Chỉ tiêu HCRC"** (domain khoá cứng `sales-targets-hcrc` — độc
lập hoàn toàn với trang trên). File Excel đúng mẫu thật đội HCRC gửi lại
khác hẳn về hình dạng — dòng 1 là header, mỗi dòng là 1 CẶP (ngày, chi
nhánh, loại chỉ tiêu) thay vì 1 dòng/1 cột cho mỗi chỉ tiêu:

![Trang Chỉ tiêu HCRC](hinh-huong-dan-ldtd-hcrc/04-chi-tieu-hcrc.png)

| Kỳ | Loại đối tượng chứa | Mã đối tượng chứa | Mã loại chỉ tiêu | Giá trị chỉ tiêu |
|---|---|---|---|---|
| 20260901 | 02 | 203 | 01 | 58855013 |
| 20260901 | 02 | 203 | 03 | 258 |

Hệ thống tự GHÉP các dòng cùng (`Kỳ`, `Mã đối tượng chứa`) thành 1 dòng chỉ
tiêu, ánh xạ `Mã loại chỉ tiêu` → tên field theo bảng cố định trong
`etl/lib/salesTargetsImport.js` (`HCRC_TARGET_TYPE_MAP`): `"01"` →
`ChiTieuDoanhThu`, `"03"` → `ChiTieuGiaoDich`.

> **Bảng ánh xạ mã "01"/"03" ở trên là SUY LUẬN từ độ lớn số liệu mẫu**
> (file mẫu thật không có cột chú giải "Tên loại chỉ tiêu" điền sẵn) — XÁC
> NHẬN LẠI với đội kế hoạch HCRC bằng dữ liệu thật trước khi coi là chính
> thức. Nếu mã sai hoặc phát sinh mã loại chỉ tiêu mới, sửa hằng số
> `HCRC_TARGET_TYPE_MAP` trong `etl/lib/salesTargetsImport.js` (mã lạ không
> có trong bảng sẽ bị TỪ CHỐI rõ ràng khi nhập, không âm thầm bỏ qua).

**Lưu ý chung cho cả 2 mẫu** — không có cột đánh dấu "đã đóng cửa" như mẫu
tổng quát cũ (`TrangThai`): siêu thị đóng cửa giữa tháng thì đơn giản là
KHÔNG gửi dòng của những ngày sau khi đóng, không cần đánh dấu gì thêm.

**Cảnh báo tự động mã gõ sai/nhầm** — sau khi nhập file, hệ thống đối chiếu
mọi `Điểm`/`Mã đối tượng chứa` trong file với danh sách EntityCode ĐANG CÓ
THẬT trong dữ liệu đồng bộ (domain `doanhthu_chinhanh`) — mã nào không khớp
bất kỳ chi nhánh nào đang có dữ liệu sẽ hiện cảnh báo ngay dưới kết quả
nhập, dạng "N mã KHÔNG khớp bất kỳ chi nhánh nào...". **Đây chỉ là CẢNH
BÁO, không chặn nhập** — dòng chỉ tiêu đó vẫn được lưu bình thường, tự bỏ
qua nếu siêu thị mới mở chưa kịp có dữ liệu đồng bộ (chưa có gì để đối
chiếu thì không cảnh báo gì). Cảnh báo này giúp bắt sớm lỗi gõ nhầm mã siêu
thị — trước đây nhập vẫn thành công nhưng dòng chỉ tiêu đó ÂM THẦM không
bao giờ ghép được vào báo cáo (không có lỗi/cảnh báo gì khác báo hiệu).

---

## Bước 4 — rp-user: tạo báo cáo

> **Cách làm nhanh**: chạy `node rp-server/scripts/seedLdtdHcrcReports.js`
> — script tự tạo/CẬP NHẬT đúng 2 báo cáo `bc-doanh-thu-ldtd`/
> `bc-doanh-thu-hcrc` với nguyên khối `DefinitionJson` dưới đây (chạy lại
> nhiều lần an toàn, không tạo trùng). Script CHƯA gán quyền xem — vẫn cần
> làm Bước 5 (giao diện) sau đó. Đọc tiếp mục dưới nếu muốn tự dán tay qua
> giao diện hoặc muốn hiểu rõ từng ô.

Vào rp-user, menu **"Hệ thống → Biểu mẫu"**, tab **"Báo cáo"** (mặc định).

**Tên field cần đối chiếu lại theo đúng tên bạn đặt khi tạo Sync Job/nhập
chỉ tiêu** (`dienTich`, `doanhThu`, `laiGop`, `SoGiaoDich`,
`ChiTieuDoanhThu`, `ChiTieuGiaoDich`) — JSON dưới đây khớp đúng tên đã dùng
xuyên suốt file này (Bước 2/3), không cần sửa nếu bạn làm đúng theo trên.

### Báo cáo Lãnh đạo Tập đoàn

Điền form:

- **Mã báo cáo**: `bc-doanh-thu-ldtd`
- **Tiêu đề**: `Báo cáo nhanh doanh thu - Lãnh đạo Tập đoàn`
- **Domain**: `doanhthu_chinhanh`
- **Trang báo cáo**: chọn 1 trang (vd "Báo cáo kinh doanh")
- **SourceType**: chọn **"Ghép nhiều nguồn (composite)"**
- **DefinitionJson**: dán nguyên khối sau:

```json
{
  "title": "Báo cáo nhanh doanh thu - Lãnh đạo Tập đoàn",
  "domain": "doanhthu_chinhanh",
  "filters": [
    { "field": "eventDate", "type": "dateRange", "label": "Khoảng ngày báo cáo" }
  ],
  "blocks": [
    { "key": "current", "sourceType": "directDb", "domain": "doanhthu_chinhanh" },
    { "key": "currentGD", "sourceType": "directDb", "domain": "giaodich_chinhanh" },
    { "key": "lastYear", "sourceType": "directDb", "domain": "doanhthu_chinhanh", "dateOffsetYears": -1 },
    { "key": "lastYearGD", "sourceType": "directDb", "domain": "giaodich_chinhanh", "dateOffsetYears": -1 },
    { "key": "target", "isTarget": true, "targetDomain": "sales-targets-ldtd", "targetGranularity": "day" }
  ],
  "columns": [
    { "key": "tenCuaHang", "label": "Siêu thị/Cửa hàng", "formula": "entityCode" },
    { "key": "dienTich", "label": "Diện tích", "formula": "current.dimensions.dienTich" },

    { "key": "dt_chiTieu", "label": "Doanh thu - Chỉ tiêu", "formula": "target.ChiTieuDoanhThu" },
    { "key": "dt_thucDat", "label": "Doanh thu - Thực đạt", "formula": "current.measures.doanhThu" },
    { "key": "dt_tyLeDat", "label": "Doanh thu - Tỉ lệ đạt (%)", "formula": "ROUND(current.measures.doanhThu / target.ChiTieuDoanhThu * 100, 1)" },
    { "key": "dt_cungKy", "label": "Doanh thu - Cùng kỳ năm 2025", "formula": "lastYear.measures.doanhThu" },
    { "key": "dt_lfl", "label": "Doanh thu - Tỷ lệ % LFL", "formula": "ROUND(current.measures.doanhThu / lastYear.measures.doanhThu * 100, 1)" },

    { "key": "lg_tyLe", "label": "Lãi gộp - Tỷ lệ (%)", "formula": "ROUND(current.measures.laiGop / current.measures.doanhThu * 100, 1)" },
    { "key": "lg_giaTri", "label": "Lãi gộp - Giá trị", "formula": "current.measures.laiGop" },

    { "key": "gd_chiTieu", "label": "Giao dịch - Chỉ tiêu", "formula": "target.ChiTieuGiaoDich" },
    { "key": "gd_thucDat", "label": "Giao dịch - Thực đạt", "formula": "currentGD.measures.SoGiaoDich" },
    { "key": "gd_tyLeDat", "label": "Giao dịch - Tỷ lệ đạt (%)", "formula": "ROUND(currentGD.measures.SoGiaoDich / target.ChiTieuGiaoDich * 100, 1)" },
    { "key": "gd_cungKy", "label": "Giao dịch - Cùng kỳ năm 2025", "formula": "lastYearGD.measures.SoGiaoDich" },
    { "key": "gd_lfl", "label": "Giao dịch - Tỷ lệ % LFL", "formula": "ROUND(currentGD.measures.SoGiaoDich / lastYearGD.measures.SoGiaoDich * 100, 1)" },

    { "key": "trungBinhGD", "label": "Trung bình GD", "formula": "ROUND(current.measures.doanhThu / currentGD.measures.SoGiaoDich, 0)" },
    { "key": "doanhThuTrenM2", "label": "Doanh thu/m2", "formula": "ROUND(current.measures.doanhThu / current.dimensions.dienTich, 0)" }
  ],
  "groupBy": {
    "field": "current.dimensions.chain",
    "groups": [
      { "value": "MART", "label": "Tổng cộng MART" },
      { "value": "MINIMART", "label": "Tổng cộng MINIMART" }
    ],
    "grandTotalLabel": "Tổng cộng",
    "labelColumn": "tenCuaHang"
  }
}
```

Form lúc đang dán JSON (khung cuộn xuống thấy phần cuối, khối `target`):

![Form tạo báo cáo — DefinitionJson](hinh-huong-dan-ldtd-hcrc/05-bao-cao-form.png)

Bấm **"Tạo báo cáo"**. Danh sách bên dưới cập nhật ngay:

![Danh sách báo cáo sau khi tạo](hinh-huong-dan-ldtd-hcrc/06-bao-cao-danh-sach.png)

### Báo cáo HCRC

Lặp lại y hệt, đổi:

- **Mã báo cáo**: `bc-doanh-thu-hcrc`
- **Tiêu đề**: `Báo cáo nhanh doanh thu - HCRC`
- **DefinitionJson**: HỆT khối trên, chỉ đổi `title` và `targetDomain` của
  khối `target`:

```json
{
  "title": "Báo cáo nhanh doanh thu - HCRC",
  "domain": "doanhthu_chinhanh",
  "filters": [
    { "field": "eventDate", "type": "dateRange", "label": "Khoảng ngày báo cáo" }
  ],
  "blocks": [
    { "key": "current", "sourceType": "directDb", "domain": "doanhthu_chinhanh" },
    { "key": "currentGD", "sourceType": "directDb", "domain": "giaodich_chinhanh" },
    { "key": "lastYear", "sourceType": "directDb", "domain": "doanhthu_chinhanh", "dateOffsetYears": -1 },
    { "key": "lastYearGD", "sourceType": "directDb", "domain": "giaodich_chinhanh", "dateOffsetYears": -1 },
    { "key": "target", "isTarget": true, "targetDomain": "sales-targets-hcrc", "targetGranularity": "day" }
  ],
  "columns": [
    { "key": "tenCuaHang", "label": "Siêu thị/Cửa hàng", "formula": "entityCode" },
    { "key": "dienTich", "label": "Diện tích", "formula": "current.dimensions.dienTich" },

    { "key": "dt_chiTieu", "label": "Doanh thu - Chỉ tiêu", "formula": "target.ChiTieuDoanhThu" },
    { "key": "dt_thucDat", "label": "Doanh thu - Thực đạt", "formula": "current.measures.doanhThu" },
    { "key": "dt_tyLeDat", "label": "Doanh thu - Tỉ lệ đạt (%)", "formula": "ROUND(current.measures.doanhThu / target.ChiTieuDoanhThu * 100, 1)" },
    { "key": "dt_cungKy", "label": "Doanh thu - Cùng kỳ năm 2025", "formula": "lastYear.measures.doanhThu" },
    { "key": "dt_lfl", "label": "Doanh thu - Tỷ lệ % LFL", "formula": "ROUND(current.measures.doanhThu / lastYear.measures.doanhThu * 100, 1)" },

    { "key": "lg_tyLe", "label": "Lãi gộp - Tỷ lệ (%)", "formula": "ROUND(current.measures.laiGop / current.measures.doanhThu * 100, 1)" },
    { "key": "lg_giaTri", "label": "Lãi gộp - Giá trị", "formula": "current.measures.laiGop" },

    { "key": "gd_chiTieu", "label": "Giao dịch - Chỉ tiêu", "formula": "target.ChiTieuGiaoDich" },
    { "key": "gd_thucDat", "label": "Giao dịch - Thực đạt", "formula": "currentGD.measures.SoGiaoDich" },
    { "key": "gd_tyLeDat", "label": "Giao dịch - Tỷ lệ đạt (%)", "formula": "ROUND(currentGD.measures.SoGiaoDich / target.ChiTieuGiaoDich * 100, 1)" },
    { "key": "gd_cungKy", "label": "Giao dịch - Cùng kỳ năm 2025", "formula": "lastYearGD.measures.SoGiaoDich" },
    { "key": "gd_lfl", "label": "Giao dịch - Tỷ lệ % LFL", "formula": "ROUND(currentGD.measures.SoGiaoDich / lastYearGD.measures.SoGiaoDich * 100, 1)" },

    { "key": "trungBinhGD", "label": "Trung bình GD", "formula": "ROUND(current.measures.doanhThu / currentGD.measures.SoGiaoDich, 0)" },
    { "key": "doanhThuTrenM2", "label": "Doanh thu/m2", "formula": "ROUND(current.measures.doanhThu / current.dimensions.dienTich, 0)" }
  ],
  "groupBy": {
    "field": "current.dimensions.chain",
    "groups": [
      { "value": "MART", "label": "Tổng cộng MART" },
      { "value": "MINIMART", "label": "Tổng cộng MINIMART" }
    ],
    "grandTotalLabel": "Tổng cộng",
    "labelColumn": "tenCuaHang"
  }
}
```

---

## Bước 5 — rp-user: gán quyền xem

Vào **"Hệ thống → Phân quyền"**, bấm tab **"Vai trò"** (mặc định trang mở
ra tab "Người dùng" — nhớ bấm sang tab này):

![Tab Vai trò](hinh-huong-dan-ldtd-hcrc/07-phan-quyen-vai-tro.png)

Nếu chưa có 2 vai trò "Lãnh đạo Tập đoàn"/"HCRC", tạo mới bằng form phía
trên (Mã + Tên). Sau đó với từng vai trò, bấm **"Gán quyền"**:

1. **Menu được thấy** — tick trang chứa báo cáo (vd "Báo cáo kinh doanh").
2. **Báo cáo được chạy** — tick ĐÚNG báo cáo của nhóm đó (`Lãnh đạo Tập
   đoàn` tick `bc-doanh-thu-ldtd`, `HCRC` tick `bc-doanh-thu-hcrc` —
   KHÔNG tick chéo).
3. Bấm **"Lưu"**.

![Modal Gán quyền — đã tick menu + báo cáo](hinh-huong-dan-ldtd-hcrc/08-phan-quyen-gan-quyen.png)

Lặp lại cho vai trò còn lại (chọn đúng báo cáo tương ứng).

---

## Bước 6 — rp-user: đặt lịch gửi email tự động (không bắt buộc, nhưng thường cần cho báo cáo cuối ngày)

Vào **"Hệ thống → Lịch gửi email báo cáo"**. Trang này gửi tự động MỘT báo
cáo cho danh sách người nhận theo lịch — dùng cấu hình SMTP chung đã khai ở
trang "Thiết lập email" (khai 1 lần cho cả hệ thống, không nằm trong phạm
vi file này).

Điền form "Thêm đồng bộ mới" (phần trên trang):

1. **Tên lịch**: đặt tên dễ nhận, vd "Doanh thu ngày - Lãnh đạo Tập đoàn".
2. **Báo cáo**: chọn đúng `bc-doanh-thu-ldtd` vừa tạo ở Bước 4.
3. Tab **"Đơn giản"** (mặc định) → **Tần suất**: "Hàng ngày". **Giờ gửi**:
   mặc định 1 dòng `07:00` — bấm **"+ Thêm giờ gửi"** nếu cần gửi nhiều lần
   trong ngày (vd thêm dòng `17:00` để gửi cả sáng lẫn chiều — mỗi giờ theo
   dõi thành công/lỗi riêng).
4. **Người nhận**: gõ danh sách email, phân tách dấu phẩy (vd
   `bangiamdoc@hcrc.vn, ketoantruong@hcrc.vn`).
5. **Tiêu đề email (Subject)**: gõ `{ngay}` ở chỗ muốn chèn ngày gửi, vd
   `Báo Cáo Nhanh Doanh Thu, Ngày: {ngay}`. Để trống thì dùng mẫu mặc định.
6. **Cách gửi**: giữ **"File đính kèm (Excel/PDF)"** (đơn giản nhất) rồi
   chọn **Định dạng xuất** — Excel hoặc PDF. (Có tuỳ chọn khác "Bảng ngay
   trong nội dung email" kèm tô màu cảnh báo theo ngưỡng — không bắt buộc,
   xem thêm ở `hướng_dẫn_báo_cáo.md` mục 4 nếu cần).
7. Bấm **"Tạo lịch"**.

Form lúc đã điền đủ (2 giờ gửi 09:00 và 17:00):

![Form tạo lịch gửi email — điền đầy đủ](hinh-huong-dan-ldtd-hcrc/09-lich-gui-email-form.png)

Sau khi tạo, lịch xuất hiện trong bảng bên dưới — bấm **"Gửi ngay"** để thử
gửi ngay lập tức (không cần đợi tới giờ đã đặt), kiểm tra hộp thư người
nhận có tới không:

![Danh sách lịch — đã gửi thử thành công](hinh-huong-dan-ldtd-hcrc/10-lich-gui-email-da-gui.png)

Lặp lại y hệt cho báo cáo HCRC (`bc-doanh-thu-hcrc`) — đặt tên lịch, người
nhận riêng theo đúng nhóm HCRC.

---

## Bước 7 — Kiểm tra

1. **etl-admin → Đồng bộ** — đối chiếu cả **4 job** đã chạy ít nhất 1 lần
   (xem menu "Log"), không báo lỗi — kể cả 2 job "Lịch sử" (chạy lần đầu
   có thể mất thời gian hơn Live vì kéo nguyên lịch sử nhiều tháng/năm).
2. **etl-admin → Log** — nếu job Giao dịch (Live hoặc Lịch sử) báo "còn mã
   BU_ID chưa ánh xạ", bổ sung tiếp vào "Ánh xạ mã chi nhánh".
3. Mở báo cáo LDTD ở rp-user, chọn "Khoảng ngày báo cáo" là **hôm nay**
   (điền CÙNG 1 ngày ở cả 2 ô từ/đến), bấm chạy — kiểm tra:
   - Đủ số siêu thị đang hoạt động, đúng nhóm MART/MINIMART.
   - Cột "Lãi gộp - Tỷ lệ (%)" KHÔNG phải 100% ở mọi siêu thị (nếu đúng
     100% ở mọi dòng — kiểm tra lại VIEW có JOIN `COSTPRICE` nhầm theo cả
     `STK_ID` không, xem lại Bước 1).
   - Cột Giao dịch có số liệu (không trống toàn bộ — nếu trống, kiểm tra
     lại "Ánh xạ mã chi nhánh").
   - **Cột "Cùng kỳ năm 2025" và "Tỷ lệ % LFL" có số liệu** (không trống)
     — đây là cột lấy từ CSDL Lịch sử (`DSMART16_EOM`), nếu trống nghĩa là
     2 job "Lịch sử" (Doanh thu + Giao dịch) chưa chạy được hoặc VIEW ở
     `DSMART16_EOM` chưa tạo đúng — quay lại kiểm tra Bước 1/2.2.
   - **Thử chọn 1 khoảng nhiều ngày** (vd 3 ngày gần nhất, ô từ khác ô đến)
     — mọi cột số liệu (Doanh thu, Giao dịch, Chỉ tiêu, Lãi gộp, Cùng kỳ
     năm trước) phải CỘNG DỒN đúng theo 3 ngày đó; riêng Diện tích/nhóm
     MART-MINIMART KHÔNG đổi (không cộng dồn, xem
     `rp-server/lib/compositeReportRunner.js`).
4. Đối chiếu 1 siêu thị bất kỳ: mở lại báo cáo, đổi "Khoảng ngày báo cáo"
   sang **đúng ngày này năm ngoái** (1 ngày, from=to) — số ở cột "Thực đạt"
   của lần chạy đó phải KHỚP với số ở cột "Cùng kỳ năm 2025" khi chạy báo
   cáo cho ngày hôm nay (cùng 1 số liệu, chỉ khác đọc từ domain `directDb`
   bình thường hay từ khối `lastYear`/`dateOffsetYears: -1`) — xác nhận dữ
   liệu Lịch sử đúng, không bị lệch ngày.
5. Sửa thử 1 dòng chỉ tiêu ở trang "Chỉ tiêu Lãnh đạo Tập đoàn", xác nhận
   báo cáo HCRC KHÔNG đổi theo (và ngược lại) — xác nhận đúng 2 domain chỉ
   tiêu độc lập.
6. Ở trang Phân quyền, đăng nhập thử bằng 1 tài khoản chỉ có vai trò "HCRC"
   — xác nhận CHỈ thấy báo cáo `bc-doanh-thu-hcrc`, không thấy báo cáo
   LDTD.
7. **Đúng vào ngày/vài ngày quanh lúc hết tháng** (khi `DSMART16_EOM` vừa
   nhận thêm dữ liệu tháng mới đóng sổ — xem lưu ý ở Bước 2.2) — kiểm tra
   Log của etl (hoặc console rp-server) có dòng cảnh báo
   `"trả về NHIỀU HƠN 1 dòng cho entityCode"` không. Có dòng này nghĩa là
   đúng chi nhánh/ngày đó tạm thời BỊ THIẾU trên báo cáo composite (hành vi
   ĐÃ BIẾT, chấp nhận được — xem giải thích Bước 2.2) — không phải lỗi cấu
   hình, tự hết sau khi qua ngày giao thời (dữ liệu Live phía đó không còn
   nữa, chỉ còn đúng 1 dòng từ Lịch sử).

8. **Chỉ tiêu là THEO NGÀY** (Bước 3) — đổi "Khoảng ngày báo cáo" sang 1
   ngày khác đã nhập chỉ tiêu, xác nhận cột "Chỉ tiêu" đổi số ĐÚNG theo
   ngày đó (khác số của ngày hôm nay), không phải 1 số cố định lặp lại suốt
   tháng. Nếu cột "Chỉ tiêu" trống ở ngày đã có nhập liệu — kiểm tra lại
   `"targetGranularity": "day"` có trong DefinitionJson của khối `target`
   không (Bước 4), thiếu dòng này báo cáo sẽ tra sai theo ngày 1 đầu tháng.
9. **Chọn khoảng nhiều ngày có xen 1 siêu thị đóng cửa giữa chừng** (đánh
   dấu `TrangThai=DaDong` ở 1 ngày trong khoảng, xem "Nhập chỉ tiêu") — xác
   nhận siêu thị đó VẪN xuất hiện trong báo cáo với "Chỉ tiêu" chỉ tính
   NHỮNG NGÀY còn mở (không cộng nhầm chỉ tiêu ngày đã đóng) — khác trường
   hợp đóng cửa CẢ khoảng đã chọn (khi đó siêu thị mới bị loại hẳn).

Xong — 2 báo cáo cuối ngày độc lập cho Lãnh đạo Tập đoàn và HCRC đã sẵn
sàng, cùng 1 format cột, chỉ khác nguồn chỉ tiêu.
