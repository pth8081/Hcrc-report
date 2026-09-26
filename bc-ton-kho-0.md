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
| 2 | Tạo 2 job "Theo bảng" trên etl-admin, trỏ đúng 2 VIEW | Admin etl-admin |
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
hàng/chuyển kho/nhập hàng):

```sql
CREATE VIEW dbo.vw_BanHangTheoSKU AS
SELECT
    s.STK_ID + '_' + CAST(s.SKU_ID AS VARCHAR(50)) AS MaThucThe,  -- Cột khoá (EntityCode)
    s.STK_ID     AS MaChiNhanh,
    st.STK_NAME  AS TenChiNhanh,
    k.SKU_CODE   AS MaHangHienThi,
    k.FULL_NAME  AS TenHang,
    CAST(s.TRAN_DATE AS DATE) AS EventDate,     -- Cột ngày
    SUM(s.QTY)   AS SoLuongBan,                 -- Measures
    MAX(s.TRAN_DATE) AS UpdatedAt               -- Cột watermark
FROM dbo.STRANS s
JOIN dbo.SKU_DEF k ON k.SKU_ID = s.SKU_ID
JOIN dbo.STOCK st ON st.STK_ID = s.STK_ID
WHERE s.TRANS_CODE IN ('01', '02')  -- CHỈ VÍ DỤ — thay đúng mã bán lẻ thật
GROUP BY s.STK_ID, st.STK_NAME, s.SKU_ID, k.SKU_CODE, k.FULL_NAME, CAST(s.TRAN_DATE AS DATE);
```

**VIEW tồn kho theo SKU** — nguồn `DSTK_INFO` đã có sẵn 1 dòng/chi nhánh/mặt
hàng/ngày, không cần `GROUP BY`:

```sql
CREATE VIEW dbo.vw_TonKhoTheoSKU AS
SELECT
    d.STK_ID + '_' + CAST(d.SKU_ID AS VARCHAR(50)) AS MaThucThe,
    d.STK_ID    AS MaChiNhanh,
    st.STK_NAME AS TenChiNhanh,
    k.SKU_CODE  AS MaHangHienThi,
    k.FULL_NAME AS TenHang,
    d.WORK_DATE AS EventDate,
    d.STOCK_QTY AS SoLuongTon,
    d.WORK_DATE AS UpdatedAt
FROM dbo.DSTK_INFO d
JOIN dbo.SKU_DEF k ON k.SKU_ID = d.SKU_ID
JOIN dbo.STOCK st ON st.STK_ID = d.STK_ID;
```

(Đổi tên bảng/cột đúng CSDL thật nếu khác cấu trúc DSMART16 chuẩn.)

## Bước 2 — Admin etl-admin tạo 2 job "Theo bảng"

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
kỳ), Tồn kho hiện tại — cộng thêm 4 cột "Chờ nhập"/"Đã nhập" ở Bước 2b nếu
đã khai domain tương ứng (bỏ trống domain nào thì cột đó không hiện, không
bắt buộc khai đủ cả 4).

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

## Ghi chú kỹ thuật (cho ai cần đọc code)

- Bộ máy tính toán: `rp-server/lib/topSellingZeroStockRunner.js`
  (`SourceType='topZeroStock'`) — KHÔNG dùng `definition.columns` như báo
  cáo thường, có logic xếp hạng + công thức tồn kho riêng.
- Các hàm đọc `dwh.ReportFacts` dùng chung với báo cáo "Core stock = 0":
  `rp-server/lib/reportFactsHelpers.js`.
- Script tạo báo cáo: `rp-server/scripts/seedTopZeroStockReport.js`.
