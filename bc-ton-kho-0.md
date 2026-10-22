# Báo cáo `bc-ton-kho-0` — "Top bán chạy đang tồn kho = 0"

Tài liệu triển khai riêng cho ĐÚNG 1 báo cáo này — dành cho team IT/DBA thực
hiện từng bước. Không cần đọc `hướng_dẫn_báo_cáo.md` (tài liệu tổng, giải
thích khung kiến trúc chung) để làm báo cáo này, trừ khi cần tra cứu sâu hơn
về cách hệ thống hoạt động.

## 1. Báo cáo này làm gì

Mỗi ngày, hệ thống tự động:
1. Với MỖI chi nhánh, tính TOP N mặt hàng **bán chạy nhất** (theo SỐ LƯỢNG,
   không phải doanh thu) trong 1 khoảng thời gian người xem tự chọn (hôm
   qua / 7 ngày / 30 ngày / trong ngày).
2. Trong đúng danh sách TOP đó, lọc ra mặt hàng nào **ĐANG HẾT HÀNG** (tồn
   kho ước tính hôm nay ≤ ngưỡng, mặc định 0).

Khác với báo cáo "Core stock = 0" (`bc-core-ton-kho-0.md`) — báo cáo đó
KHÔNG tự xếp hạng, mà dùng 1 danh sách mặt hàng cố định do admin tự khai.
Báo cáo này thì ngược lại: **không cần khai/upload danh sách gì cả**, hệ
thống tự tính lại mỗi lần chạy, dựa thẳng vào dữ liệu bán hàng/tồn kho đã
đồng bộ.

**Công thức tồn kho ước tính hôm nay** (điểm quan trọng nhất, hỏi lại người
dùng nếu số liệu có vẻ sai):

```
Tồn ước tính hôm nay = Tồn cuối kỳ NGÀY HÔM QUA (dòng gần nhất TRƯỚC hôm nay)
                        − Số lượng bán PHÁT SINH ĐÚNG HÔM NAY
```

- **KHÔNG cộng lại** bất kỳ hàng nào vừa nhập trong ngày (dù từ NCC hay điều
  chuyển nội bộ) — mục đích là phát hiện đã bán hết vốn tồn cũ, không để lô
  hàng vừa về "che" mất tín hiệu sắp/đã hết hàng.
- Mặt hàng CHƯA TỪNG có dữ liệu tồn kho (chưa đồng bộ được ngày hôm qua) thì
  **bị loại khỏi báo cáo**, KHÔNG mặc định tính là tồn = 0.

## 2. Việc cần làm (theo đúng thứ tự)

| # | Việc | Ai làm |
|---|---|---|
| 1 | Tạo 2 VIEW bắt buộc trên CSDL nguồn (DSMART16) | DBA |
| 2 | Tạo 2 job "Theo bảng", trỏ đúng 2 VIEW — chạy `node scripts/seedZeroStockSkuSync.js` (xem Bước 2), hoặc thao tác tay trên etl-admin | Admin etl-admin / IT-Dev |
| 3 | (Tuỳ chọn) Tạo 4 VIEW + 4 job "Chờ nhập"/"Đã nhập" | DBA + Admin etl-admin |
| 4 | Chạy script tạo báo cáo | IT/Dev |
| 5 | Gán quyền xem báo cáo | Admin rp-user |
| 6 | Kiểm tra báo cáo có số liệu | IT/Dev |

Không làm đủ bước 1+2 thì báo cáo **luôn hiện ra TRỐNG** — không phải lỗi,
chỉ là chưa có dữ liệu nguồn để tính.

## Bước 1 — DBA tạo 2 VIEW bắt buộc trên DSMART16

Mục đích: gộp sẵn "Mã thực thể" = `<Mã chi nhánh>_<Mã hàng>` NGAY TẠI NGUỒN,
vì mỗi job ETL "Theo bảng" chỉ đọc 1 bảng/view, không tự gộp (SUM) được
nhiều dòng trùng khoá khi ghi vào kho dữ liệu trung tâm.

**VIEW doanh số theo SKU** — danh sách mã `TRANS_CODE` dưới đây CHỈ LÀ VÍ
DỤ, DBA phải đối chiếu với đội DSMART16 xem mã nào là bán lẻ THẬT (khác trả
hàng/chuyển kho/nhập hàng) — xem gợi ý đối chiếu ở cuối mục này.

Dùng `CREATE OR ALTER VIEW` (an toàn chạy lại nhiều lần, không lỗi "đã tồn
tại") và BẮT BUỘC có `GO` giữa 2 câu — `CREATE VIEW`/`CREATE OR ALTER VIEW`
phải là câu ĐẦU TIÊN trong 1 batch, dán 2 câu liền nhau KHÔNG có `GO` ở
giữa sẽ báo lỗi "Incorrect syntax near the keyword 'CREATE'":

```sql
USE DSMART16;
GO

CREATE OR ALTER VIEW dbo.vw_BanHangTheoSKU AS
SELECT
    s.STK_ID + '_' + CAST(s.SKU_ID AS VARCHAR(50)) AS MaThucThe,  -- Cột khoá (EntityCode)
    s.STK_ID     AS MaChiNhanh,
    st.STK_NAME_U  AS TenChiNhanh,  -- STK_NAME_U (Unicode) chứ KHÔNG phải STK_NAME (lỗi font)
    k.SKU_CODE   AS MaHangHienThi,
    k.FULL_NAME_U  AS TenHang,  -- FULL_NAME_U (Unicode) chứ KHÔNG phải FULL_NAME (lỗi font, xem "giá vốn dsmart.md")
    CAST(s.TRAN_DATE AS DATE) AS EventDate,     -- Cột ngày
    SUM(s.QTY)   AS SoLuongBan,                 -- Measures
    MAX(s.TRAN_DATE) AS UpdatedAt               -- Cột watermark
FROM dbo.STRANS s
JOIN dbo.SKU_DEF k ON k.SKU_ID = s.SKU_ID
JOIN dbo.STOCK st ON st.STK_ID = s.STK_ID
WHERE s.TRANS_CODE IN ('01', '02')  -- CHỈ VÍ DỤ — thay đúng mã bán lẻ thật
GROUP BY s.STK_ID, st.STK_NAME_U, s.SKU_ID, k.SKU_CODE, k.FULL_NAME_U, CAST(s.TRAN_DATE AS DATE);
GO
```

**VIEW tồn kho theo SKU:**

‼️ **CẬP NHẬT 14/10/2026** — bảng `DSTK_INFO` (mẫu ban đầu bên dưới giả định
có sẵn 1 dòng/chi nhánh/mặt hàng/ngày) **TRỐNG HOÀN TOÀN** ở hệ thống thật
đã triển khai — không phải lỗi, chỉ là CSDL đó không dùng bảng này để lưu
tồn kho. Đã TRA LẠI + DBA XÁC NHẬN: bảng tồn kho THẬT là **`STK_INFO`**
(kiểu "sổ cái luỹ kế", KHÔNG có cột ngày snapshot từng ngày như
`DSTK_INFO`) — công thức DBA xác nhận:
```
SL tồn cuối   = M_BEGIN + M_IMP - M_EXP
Giá trị tồn cuối = M_BEGAMT + M_IMPAMT - M_EXPAMT   (nếu cần, báo cáo này chưa dùng)
```
Vì `STK_INFO` không có cột ngày lịch sử sẵn, VIEW lấy số dư TẠI THỜI ĐIỂM
đồng bộ (`GETDATE()`) làm `EventDate` — hệ thống TỰ xây lịch sử theo ngày
qua các lần chạy job hàng ngày (BẮT BUỘC bật "Giữ lịch sử theo ngày"), chứ
KHÔNG đọc được lịch sử có sẵn trong nguồn (không có).

```sql
CREATE OR ALTER VIEW dbo.vw_TonKhoTheoSKU AS
SELECT
    d.STK_ID + '_' + CAST(d.SKU_ID AS VARCHAR(50)) AS MaThucThe,
    d.STK_ID     AS MaChiNhanh,
    st.STK_NAME_U  AS TenChiNhanh,  -- STK_NAME_U (Unicode) chứ KHÔNG phải STK_NAME (lỗi font)
    k.SKU_CODE   AS MaHangHienThi,
    k.FULL_NAME_U  AS TenHang,  -- FULL_NAME_U (Unicode) chứ KHÔNG phải FULL_NAME (lỗi font, xem "giá vốn dsmart.md")
    CAST(GETDATE() AS DATE) AS EventDate,
    (d.M_BEGIN + d.M_IMP - d.M_EXP) AS SoLuongTon,  -- DBA xác nhận: SL tồn cuối
    GETDATE() AS UpdatedAt
FROM dbo.STK_INFO d
JOIN dbo.SKU_DEF k ON k.SKU_ID = d.SKU_ID
JOIN dbo.STOCK st ON st.STK_ID = d.STK_ID;
GO
```

Nếu CSDL khác lại CÓ `DSTK_INFO` với dữ liệu thật (đã có sẵn lịch sử theo
ngày) — dùng mẫu CŨ bên dưới thay vì bản trên (kiểm tra bằng
`SELECT COUNT(*) FROM dbo.DSTK_INFO;` trước, >0 dòng mới dùng mẫu này):

```sql
CREATE OR ALTER VIEW dbo.vw_TonKhoTheoSKU AS
SELECT
    d.STK_ID + '_' + CAST(d.SKU_ID AS VARCHAR(50)) AS MaThucThe,
    d.STK_ID    AS MaChiNhanh,
    st.STK_NAME_U AS TenChiNhanh,
    k.SKU_CODE  AS MaHangHienThi,
    k.FULL_NAME_U AS TenHang,
    d.WORK_DATE AS EventDate,
    d.STOCK_QTY AS SoLuongTon,
    d.WORK_DATE AS UpdatedAt
FROM dbo.DSTK_INFO d
JOIN dbo.SKU_DEF k ON k.SKU_ID = d.SKU_ID
JOIN dbo.STOCK st ON st.STK_ID = d.STK_ID;
GO
```

(Đổi tên bảng/cột đúng CSDL thật nếu khác cấu trúc DSMART16 chuẩn — luôn
kiểm tra `SELECT TOP 5 * FROM <VIEW>;` ra dữ liệu thật trước khi coi là
xong, xem hướng dẫn đối chiếu ở trên.)

**Kiểm tra VIEW có dữ liệu THẬT trước khi qua Bước 2** — `CREATE VIEW`
chạy "thành công" chỉ xác nhận cú pháp đúng, KHÔNG xác nhận mã `TRANS_CODE`
đã chọn đúng. Luôn chạy thử `SELECT TOP 5 * FROM dbo.vw_BanHangTheoSKU;`/
`SELECT TOP 5 * FROM dbo.vw_TonKhoTheoSKU;` — nếu RỖNG, đối chiếu lại
`TRANS_CODE` bằng câu sau (mã có SỐ LƯỢNG LỚN NHẤT trong vài ngày gần đây
thường là mã bán lẻ thật — xem thêm mã `211`/`221`/`232` đã xác nhận dùng
cho `STRANS` ở "báo cáo doanh thu cuối ngày.md"):
```sql
SELECT TRANS_CODE, COUNT(*) AS SoDong
FROM dbo.STRANS
WHERE TRAN_DATE >= DATEADD(DAY, -7, GETDATE())
GROUP BY TRANS_CODE
ORDER BY SoDong DESC;
```
Và nếu `vw_TonKhoTheoSKU` rỗng, kiểm tra bảng `DSTK_INFO` có dữ liệu không:
```sql
SELECT COUNT(*) AS SoDong, MAX(WORK_DATE) AS NgayGanNhat FROM dbo.DSTK_INFO;
```

## Bước 2 — Admin etl-admin tạo 2 job "Theo bảng"

**Cách nhanh (khuyến nghị)** — đã có script tự tạo/cập nhật CẢ 2 job này
bằng 1 lệnh, thay vì bấm tay từng ô trên etl-admin (script tự đối chiếu
đúng 2 VIEW ở Bước 1 trước khi tạo, báo lỗi rõ nếu thiếu VIEW/cột):

```bash
cd etl
node scripts/seedZeroStockSkuSync.js
```

Cần khai `DSMART16_SERVER`/`DSMART16_USER`/`DSMART16_PASSWORD` trong `.env`
trước (xem chú thích đầu file script) — dùng CHUNG với `scripts/seedLdtdHcrcSync.js`
nếu báo cáo LDTD/HCRC đã chạy script đó rồi (tự dùng lại đúng Nguồn dữ liệu
"DSMART16 - Live", không tạo kết nối trùng). Chạy xong thì BỎ QUA phần thao
tác tay bên dưới, sang thẳng Bước 2b/Bước 3.

**Cách thủ công (thao tác tay trên etl-admin, nếu không dùng script trên):**

**Job doanh số:**
- Bảng nguồn: `dbo.vw_BanHangTheoSKU`.
- Cột khoá (EntityCode): `MaThucThe`. Cột ngày: `EventDate`. Cột watermark:
  `UpdatedAt`.
- Dimensions: tick `MaChiNhanh`, `TenChiNhanh`, `MaHangHienThi`, `TenHang`.
- Measures: tick `SoLuongBan`.
- Domain: `banhang_sku`.
- **BẬT "Giữ lịch sử theo ngày"** — BẮT BUỘC (không phải tuỳ chọn): báo cáo
  cần cộng dồn nhiều ngày cho lựa chọn "7 ngày"/"30 ngày gần nhất" — tắt đi
  sẽ chỉ còn đúng 1 ngày mới nhất, sai hoàn toàn với 2 lựa chọn đó.

**Job tồn kho:**
- Bảng nguồn: `dbo.vw_TonKhoTheoSKU`.
- Cột khoá (EntityCode): `MaThucThe`. Cột ngày: `EventDate`. Cột watermark:
  `UpdatedAt`.
- Dimensions: tick `MaChiNhanh`, `TenChiNhanh`, `MaHangHienThi`, `TenHang`.
- Measures: tick `SoLuongTon`.
- Domain: `tonkho_sku`.
- **BẬT "Giữ lịch sử theo ngày"** — BẮT BUỘC: báo cáo cần dòng tồn kho của
  NGÀY HÔM QUA (dòng gần nhất TRƯỚC hôm nay) — tắt đi sẽ chỉ còn đúng 1
  ngày mới nhất, không lùi được về hôm qua.

## Bước 2b (TUỲ CHỌN) — 4 cột "Chờ nhập"/"Đã nhập"

Bỏ qua bước này thì báo cáo VẪN CHẠY BÌNH THƯỜNG, chỉ là không có 4 cột
tham khảo dưới đây. Làm được nếu muốn hiển thị thêm số lượng hàng đang chờ
giao/đã giao hôm nay, tách theo nguồn NCC/Điều chuyển nội bộ.

**VIEW "Chờ/đã nhập từ NCC"** — nguồn `RV_ORDER` — `DELIVER_DT`/`FINISH_DT`
NULL nghĩa là đơn CHƯA giao (chọn đúng cột thể hiện "đã giao hàng thật" với
DBA):

```sql
-- "Chờ nhập" — số lượng đang treo TẠI THỜI ĐIỂM đồng bộ, KHÔNG lọc theo
-- ngày phát sinh đơn (đơn có thể đặt từ trước).
CREATE VIEW dbo.vw_ChoNhapNCCTheoSKU AS
SELECT
    STK_ID + '_' + CAST(SKU_ID AS VARCHAR(50)) AS MaThucThe,
    CAST(GETDATE() AS DATE) AS EventDate,
    SUM(QTY) AS SoLuongChoNhap,
    GETDATE() AS UpdatedAt
FROM dbo.RV_ORDER
WHERE STATUS <> 'X'          -- CHỈ VÍ DỤ — đối chiếu đúng mã "huỷ" với DBA
  AND DELIVER_DT IS NULL     -- CHỈ VÍ DỤ — đối chiếu đúng cột "đã giao" với DBA
GROUP BY STK_ID, SKU_ID;

-- "Đã nhập" — gộp theo NGÀY GIAO THẬT, giữ lịch sử nhiều ngày (không chỉ
-- hôm nay) — hệ thống tự lọc đúng "hôm nay" lúc chạy báo cáo.
CREATE VIEW dbo.vw_DaNhapNCCTheoSKU AS
SELECT
    STK_ID + '_' + CAST(SKU_ID AS VARCHAR(50)) AS MaThucThe,
    CAST(DELIVER_DT AS DATE) AS EventDate,
    SUM(QTY) AS SoLuongDaNhap,
    MAX(UPDATED) AS UpdatedAt
FROM dbo.RV_ORDER
WHERE STATUS <> 'X' AND DELIVER_DT IS NOT NULL
GROUP BY STK_ID, SKU_ID, CAST(DELIVER_DT AS DATE);
```

**VIEW "Chờ/đã nhập điều chuyển"** — nguồn `DLVTRANS` (điều chuyển nội bộ
giữa các chi nhánh) — `RCV_DATE` NULL nghĩa là chi nhánh nhận CHƯA thực
nhận hàng, nhóm theo `OSTK_ID` (chi nhánh NHẬN, không phải chi nhánh xuất):

```sql
CREATE VIEW dbo.vw_ChoNhapDieuChuyenTheoSKU AS
SELECT
    OSTK_ID + '_' + CAST(SKU_ID AS VARCHAR(50)) AS MaThucThe,
    CAST(GETDATE() AS DATE) AS EventDate,
    SUM(QTY) AS SoLuongChoNhap,
    GETDATE() AS UpdatedAt
FROM dbo.DLVTRANS
WHERE RCV_DATE IS NULL       -- CHỈ VÍ DỤ — đối chiếu đúng cột "đã nhận" với DBA
GROUP BY OSTK_ID, SKU_ID;

CREATE VIEW dbo.vw_DaNhapDieuChuyenTheoSKU AS
SELECT
    OSTK_ID + '_' + CAST(SKU_ID AS VARCHAR(50)) AS MaThucThe,
    CAST(RCV_DATE AS DATE) AS EventDate,
    SUM(QTY) AS SoLuongDaNhap,
    MAX(RCV_DATE) AS UpdatedAt
FROM dbo.DLVTRANS
WHERE RCV_DATE IS NOT NULL
GROUP BY OSTK_ID, SKU_ID, CAST(RCV_DATE AS DATE);
```

**etl-admin**: tạo 4 job "Theo bảng" (nếu dùng cột nào) trỏ 4 VIEW trên,
EntityCode = `MaThucThe`, Measures tick đúng `SoLuongChoNhap`/`SoLuongDaNhap`
(ĐÚNG TÊN — hệ thống đọc cố định 2 tên Measures này), KHÔNG cần Dimensions
(đã có sẵn từ `banhang_sku`/`tonkho_sku`). Domain đặt tên tuỳ ý, ví dụ
`chonhap_ncc`/`danhap_ncc`/`chonhap_dieuchuyen`/`danhap_dieuchuyen` — BẬT
"Giữ lịch sử theo ngày" cho 2 job "Đã nhập" (cần nhiều ngày để lọc đúng
"hôm nay"); job "Chờ nhập" bật/tắt đều được (chỉ đọc dòng mới nhất).

## Bước 2c (bản 9.95) — "Chờ nhập/Đã nhập (NCC)" TÁI DÙNG domain `don_dat_hang` (KHUYẾN NGHỊ, không cần DBA xây VIEW mới)

**Thay cho Bước 2b** (VIEW `vw_ChoNhapNCCTheoSKU`/`vw_DaNhapNCCTheoSKU` ở
trên — nguồn `RV_ORDER`, **CHƯA từng xây thật**, 2 domain `chonhap_ncc`/
`danhap_ncc` không có job nào trỏ tới, khiến 2 cột "Chờ nhập (NCC)"/"Đã
nhập hôm nay (NCC)" LUÔN TRỐNG — đúng hiện tượng người dùng gửi ảnh PDF báo
cáo thật, bản 9.95): hệ thống đã có job đồng bộ "Đơn đặt hàng - nhập hàng
(DSMART16)" (domain `don_dat_hang`, dùng cho 6 báo cáo "Đơn đặt hàng"/"Đơn
nhập hàng"/"So sánh đặt–nhận"/..., xem `bc-don-dat-hang.md`) — **TÁI DÙNG
LUÔN domain này**, không cần DBA xây thêm VIEW `RV_ORDER` nào.

**Công thức** (ĐÚNG công thức đã xác nhận, đang chạy thật ở báo cáo "So
sánh đặt–nhận" — KHÔNG phải công thức mới, xem
`rp-server/lib/purchaseOrderRunner.js:aggregateByOrder()`): với mỗi đơn
(nhóm theo Siêu thị + Số đơn + Mã hàng), SoLuongTheoDon = tổng SL các dòng
ĐẶT (133/130/330), SoLuongThucNhan = tổng SL các dòng NHẬN (333) CÙNG đơn
đó (xử lý đúng "nhận nhiều lần"):
- **"Chờ nhập (NCC)"** = tổng, qua MỌI đơn đặt trong **90 ngày gần nhất**
  (đổi được qua `pendingWindowDays`), của phần DƯƠNG (SoLuongTheoDon −
  SoLuongThucNhan) — CLAMP VỀ 0 THEO TỪNG ĐƠN TRƯỚC KHI cộng dồn (1 đơn bị
  nhận THỪA do nhập sai KHÔNG được "bù" cho đơn khác đang thiếu).
- **"Đã nhập hôm nay (NCC)"** = tổng SL mọi dòng `333` có ngày = đúng hôm
  nay.

Xem đầy đủ code + chú thích ở `rp-server/lib/donDatHangTonKhoHelper.js`.

**GIỚI HẠN QUAN TRỌNG** — `don_dat_hang` CHỈ có dữ liệu từ NHÀ CUNG CẤP, 2
cột "...(Điều chuyển)" (chuyển hàng nội bộ giữa chi nhánh) **VẪN CẦN** DBA
xây VIEW/job riêng như Bước 2b nếu muốn có — KHÔNG xử lý được bằng cách
này.

**Việc cần làm (CHỈ 1 lần, đã làm sẵn ở bản 9.95 — chỉ còn phần DBA/resync
dưới đây cần chạy trên server thật)**:

| # | Việc | Ai làm |
|---|---|---|
| 1 | Chạy lại VIEW `dbo.vw_DonDatHangChiNhanh` (Live + Lịch sử) — đã thêm cột `MaHangHienThi` (JOIN `SKU_DEF`, lấy mã hàng HIỂN THỊ — khớp đúng domain `banhang_sku`/`tonkho_sku`, KHÁC `MaHang`=SKU_ID thô) | DBA |
| 2 | Chạy `node scripts/resyncDonDatHangLiveForSkuCode.js --confirm` (trong `etl/`) — bắt job "Live" kéo lại dữ liệu gần đây để có đủ `MaHangHienThi` (xem lý do watermark ở đầu file script) | IT/Dev |
| 3 | Chạy lại `node scripts/seedTopZeroStockReport.js` (trong `rp-server/`) — DefinitionJson đã bật `useDonDatHangForNcc: true` sẵn | IT/Dev |
| 4 | Theo dõi etl-admin → Đồng bộ → Log tới khi job "Đơn đặt hàng - nhập hàng (DSMART16)" chạy xong 1 lượt | IT/Dev |
| 5 | Mở lại báo cáo — 2 cột "Chờ nhập (NCC)"/"Đã nhập hôm nay (NCC)" phải có số cho đơn hàng trong ~90 ngày gần nhất | IT/Dev |

**Bước 1 — SQL chạy lại** (an toàn, `CREATE OR ALTER`, THUẦN THÊM cột,
không đổi `MaHang`/cột nào khác — 6 báo cáo mua hàng cũ KHÔNG ảnh hưởng):
chạy lại nguyên văn `deploy/Thiết lập VIEW Đơn đặt hàng-Nhập hàng-So sánh
(DSMART16 trung tâm).sql` (Live) + `deploy/Thiết lập VIEW Đơn đặt hàng
Lịch sử (DSMART16_EOM).sql` (Lịch sử, nếu đã chạy trước đó).

**Tại sao cần Bước 2 (resync) riêng** — y hệt lỗi watermark đã gặp bản
8.1/9.68/9.86: job "Live" dùng `EventDate` làm watermark, những ngày ĐÃ
đồng bộ TRƯỚC KHI VIEW thêm `MaHangHienThi` sẽ KHÔNG BAO GIỜ tự có cột đó
dù job chạy lại bao nhiêu lần — PHẢI ép kéo lại. KHÔNG cần resync job
"Lịch sử" (DSMART16_EOM) — đơn hàng quá khứ xa không còn ý nghĩa "đang chờ
nhập" (chỉ dùng cửa sổ 90 ngày gần nhất).

## Bước 3 — Tạo báo cáo (IT/Dev)

Chạy 1 lệnh — script tự tạo/cập nhật báo cáo, chạy lại nhiều lần vẫn an
toàn (không tạo trùng):

```bash
cd rp-server
node scripts/seedTopZeroStockReport.js
```

Mặc định gán vào menu "Báo cáo vận hành" (`reports-van-hanh`). Muốn đổi
menu khác: `node scripts/seedTopZeroStockReport.js <menuCode>`.

Script tạo báo cáo `bc-ton-kho-0` với `DefinitionJson`:

```json
{
  "title": "Top bán chạy đang tồn kho = 0",
  "salesDomain": "banhang_sku",
  "stockDomain": "tonkho_sku",
  "pendingSupplierDomain": "chonhap_ncc",
  "pendingTransferDomain": "chonhap_dieuchuyen",
  "receivedSupplierDomain": "danhap_ncc",
  "receivedTransferDomain": "danhap_dieuchuyen",
  "topN": 50,
  "threshold": 0,
  "filters": [
    {
      "field": "rankWindow",
      "type": "select",
      "label": "Khoảng thời gian xếp hạng",
      "options": [
        { "value": "1", "label": "Ngày hôm trước" },
        { "value": "7", "label": "7 ngày gần nhất" },
        { "value": "30", "label": "30 ngày gần nhất" },
        { "value": "daily", "label": "Trong ngày" }
      ]
    },
    {
      "field": "branches",
      "type": "multiSelect",
      "label": "Chi nhánh",
      "optionsSource": { "domain": "banhang_sku", "valueField": "MaChiNhanh", "labelField": "TenChiNhanh" }
    }
  ]
}
```

Muốn đổi `topN`/`threshold` hoặc tên domain khác mặc định: sửa tay qua
rp-user (Hệ thống → Biểu mẫu) hoặc sửa script rồi chạy lại.

Cột hiển thị CỐ ĐỊNH: Chi nhánh, Mã hàng, Tên hàng, Số lượng bán (trong
kỳ), **Tồn kho hôm qua**, **Bán hôm nay**, Tồn kho hiện tại — 2 cột in đậm
(bản 9.36, theo yêu cầu người dùng) hiện rõ 2 số dùng để TÍNH ra "Tồn kho
hiện tại" (= Tồn kho hôm qua − Bán hôm nay), để người xem tự đối chiếu
được phép tính thay vì chỉ thấy kết quả cuối — CỐ Ý tách riêng "Bán hôm
nay" với "Số lượng bán (trong kỳ)" ở trên (cột đó theo "Khoảng thời gian
xếp hạng" người xem chọn, có thể là 7/30 ngày — KHÁC "Bán hôm nay", công
thức tồn kho LUÔN dùng đúng hôm nay bất kể chọn khoảng nào). Cộng thêm 4
cột "Chờ nhập"/"Đã nhập" ở Bước 2b nếu đã khai domain tương ứng (bỏ trống
domain nào thì cột đó không hiện, không bắt buộc khai đủ cả 4).

## Bước 4 — Gán quyền xem

Script ở Bước 3 **KHÔNG tự gán quyền xem**. Vào rp-user → Hệ thống → Phân
quyền, gán quyền xem `bc-ton-kho-0` cho đúng vai trò cần dùng báo cáo.

## Bước 5 — Kiểm tra

1. Theo dõi etl-admin → Log cho tới khi 2 job bắt buộc (và 4 job tuỳ chọn
   nếu có làm) chạy THÀNH CÔNG.
2. Mở báo cáo trên rp-user — kiểm tra:
   - Có mặt hàng hiện ra, đúng chi nhánh.
   - Cột "Tồn kho hiện tại" luôn ≤ 0 (hoặc ≤ ngưỡng đã đặt).
   - Thử đổi bộ lọc "Khoảng thời gian xếp hạng" — danh sách top có thay
     đổi hợp lý.
3. Thử xuất Excel/PDF — kiểm tra không bị lỗi, số liệu khớp bảng xem trên
   web.

## Hỏi & đáp (khi số liệu có vẻ sai)

**Báo cáo trống trơn, không có dòng nào?**
Thường là do 2 job bắt buộc (Bước 2) chưa chạy xong, hoặc chưa mặt hàng
nào trong bất kỳ chi nhánh nào vừa lọt TOP N vừa đang hết hàng cùng lúc —
kiểm tra Log trước, không phải lỗi báo cáo.

**Mặt hàng rõ ràng đang hết hàng nhưng KHÔNG thấy trong báo cáo?**
Kiểm tra: (1) mặt hàng đó có nằm trong TOP N bán chạy của chi nhánh đó
trong đúng khoảng thời gian đang chọn không — hàng bán chậm dù hết hàng vẫn
KHÔNG được coi là "hết hàng đáng chú ý" theo thiết kế báo cáo này; (2) mặt
hàng đó đã có ÍT NHẤT 1 dòng tồn kho của "hôm qua" chưa — chưa từng đồng bộ
tồn kho thì bị loại, không mặc định = 0.

**Tồn kho hiện ra có vẻ sai (không khớp thực tế)?**
Đối chiếu lại đúng công thức ở mục 1 — không cộng lại hàng nhập trong
ngày là CỐ Ý, không phải lỗi.

**Muốn đổi ngưỡng (vd tồn ≤ 5 thay vì ≤ 0)?**
Sửa `threshold` trong `DefinitionJson` qua rp-user (Hệ thống → Biểu mẫu),
không cần sửa code/deploy lại.

**Cột "Chờ nhập (NCC)"/"Đã nhập hôm nay (NCC)" trống trơn (bản 9.95)?**
Kiểm tra theo đúng thứ tự: (1) đã chạy lại VIEW `vw_DonDatHangChiNhanh`
(thêm cột `MaHangHienThi`) chưa; (2) đã chạy
`resyncDonDatHangLiveForSkuCode.js --confirm` + đợi job "Live" chạy xong 1
lượt chưa (dữ liệu CŨ đã đồng bộ trước đó KHÔNG tự có `MaHangHienThi`); (3)
`DefinitionJson` có đúng `useDonDatHangForNcc: true` không (chạy lại
`seedTopZeroStockReport.js` nếu chưa) — xem đủ ở Bước 2c.

**Đổi số ngày tính "Chờ nhập" (khác 90 ngày)?**
Sửa `pendingWindowDays` trong `DefinitionJson` qua rp-user (Hệ thống →
Biểu mẫu), không cần sửa code/deploy lại.

**Báo cáo bị Timeout/lỗi `TimeoutError...tarn/PendingOperation.js` (cạn
connection pool)?** Dùng CHUNG `rp-server/lib/reportFactsHelpers.js` với
báo cáo "Core stock = 0" — xem đầy đủ nguyên nhân (thiếu index
seek theo cặp Domain+EntityCode cho domain tồn kho triệu dòng) + cách sửa
(index `IX_ReportFacts_Domain_Entity_Date` trong `dwh/schema.sql`, bản
9.87) ở `bc-core-ton-kho-0.md` mục "Hỏi & đáp" — KHÔNG chép lại ở đây.

## Ghi chú kỹ thuật (cho ai cần đọc code)

- Bộ máy tính toán: `rp-server/lib/topSellingZeroStockRunner.js`
  (`SourceType='topZeroStock'`) — KHÔNG dùng `definition.columns` như báo
  cáo thường, có logic xếp hạng + công thức tồn kho riêng.
- Các hàm đọc `dwh.ReportFacts` dùng chung với báo cáo "Core stock = 0":
  `rp-server/lib/reportFactsHelpers.js`.
- Script tạo báo cáo: `rp-server/scripts/seedTopZeroStockReport.js`.
- Script tạo 2 job đồng bộ bắt buộc (Bước 2): `etl/scripts/seedZeroStockSkuSync.js`.
- "Chờ nhập/Đã nhập (NCC)" tái dùng `don_dat_hang` (bản 9.95, xem Bước 2c):
  `rp-server/lib/donDatHangTonKhoHelper.js` (aggregation SQL riêng, không
  đụng tới `lib/purchaseOrderRunner.js`) + `etl/scripts/resyncDonDatHangLiveForSkuCode.js`.
