# Báo cáo `bc-core-ton-kho-0-mart` / `bc-core-ton-kho-0-minimart` — "Core stock = 0"

Tài liệu triển khai riêng cho ĐÚNG 2 báo cáo này (1 tính năng, 2 báo cáo
song song Mart/Minimart) — dành cho team IT/DBA thực hiện từng bước. Không
cần đọc `hướng_dẫn_báo_cáo.md` (tài liệu tổng) để làm báo cáo này.

## 1. Báo cáo này làm gì

Kiểm tra hằng ngày: trong danh sách mặt hàng **BẮT BUỘC luôn phải có hàng**
("hàng Core") mà admin tự khai, mặt hàng nào ĐANG HẾT HÀNG (tồn kho ước
tính hôm nay ≤ ngưỡng, mặc định 0) ở kho nào.

Khác hẳn báo cáo "Top bán chạy đang tồn kho = 0" (`bc-ton-kho-0.md`):
- Báo cáo đó **tự xếp hạng** theo doanh số bán, không cần khai danh sách gì.
- Báo cáo NÀY dùng **1 danh sách mặt hàng cố định** do admin tự khai/upload,
  áp dụng CHUNG cho MỌI kho **cùng loại hình** (Mart hoặc Minimart) — không
  khai riêng theo từng kho. Vì Mart và Minimart có ý nghĩa kinh doanh khác
  nhau, đây là **2 báo cáo riêng biệt**, không phải 1 báo cáo + bộ lọc.

Công thức tính tồn kho ước tính hôm nay **DÙNG LẠI Y HỆT** công thức đã
chốt ở báo cáo "Top bán chạy..." (`bc-ton-kho-0.md`):

```
Tồn ước tính hôm nay = Tồn cuối kỳ NGÀY HÔM QUA (dòng gần nhất TRƯỚC hôm nay)
                        − Số lượng bán PHÁT SINH ĐÚNG HÔM NAY
```

KHÔNG cộng lại hàng nhập trong ngày — xem giải thích đầy đủ ở
`bc-ton-kho-0.md` mục 1.

## 2. So khớp với file mẫu Excel khách hàng đang dùng

Khách hàng cung cấp file mẫu `Stock_Core_....xlsx` (2 sheet "Core Mart-G"/
"Core mini-G", pre-filter sẵn "Bỏ khóa"+"Lấy tồn = 0"). Báo cáo này XUẤT RA
ĐÚNG CÙNG BỘ CỘT với file mẫu đó (trừ cột "MH" — mã nội bộ chỉ dùng để đối
chiếu danh sách Core, không hiện lại trong kết quả báo cáo vì không có ý
nghĩa nghiệp vụ với người xem báo cáo):

| Cột trong báo cáo | Cột trong file mẫu | Ghi chú |
|---|---|---|
| Mã điểm | Mã điểm | Tuỳ chọn — tự tra qua "Ánh xạ Điểm - STK_ID", để trống nếu kho chưa khai ánh xạ |
| Mã kho | Mã kho | STK_ID thật |
| Tên kho | Tên kho | |
| Mã hàng | Mã hàng | Khoá đối chiếu với danh sách Core |
| Tên hàng | Tên hàng | |
| Đvt | Đvt | Tuỳ chọn — khai khi upload danh sách Core |
| Mã ngành | Mã ngành | Tuỳ chọn — khai khi upload danh sách Core |
| Tên ngành | Tên ngành | Tuỳ chọn — khai khi upload danh sách Core |
| — (đã lọc, không hiện cột) | Khóa All | Mặt hàng đang khoá bị LOẠI HẲN khỏi báo cáo, không hiện cột 0/1 (đúng hành vi file mẫu, vốn đã pre-filter "Bỏ khóa") |
| — (đã lọc, không hiện cột) | Khóa theo kho | Như trên |
| Tồn Kho | Tồn Kho | |
| Ngày bán cuối | Ngày bán cuối | LUÔN hiện (không tuỳ chọn) |
| Ngày nhập cuối | Ngày nhập cuối | Tuỳ chọn — cần khai `lastReceivedDomain` |
| SL đang đặt | SL đang đặt | Tuỳ chọn — cần khai `pendingOrderDomain` |
| Ngày đặt | Ngày đặt | Tuỳ chọn — đi kèm SL đang đặt |
| Mã đang đặt | Mã đang đặt | Tuỳ chọn — tự suy ra = 1 nếu SL đang đặt > 0 |

Khác biệt CÓ CHỦ ĐÍCH duy nhất: "Khóa All"/"Khóa theo kho" trong file mẫu
là 2 cột dữ liệu (đã pre-filter = 0 hết vì file mẫu tự lọc trước khi xuất);
báo cáo này áp dụng ĐÚNG cùng logic lọc đó NGAY TRONG HỆ THỐNG (mặt hàng
đang khoá bị loại khỏi kết quả), nên không cần hiện lại 2 cột đó — kết quả
cuối cùng người xem thấy là như nhau.

Pivot tổng hợp ở cột S–W của file mẫu (Row Labels/Tên kho/Count of Mã
hàng/Sum of Mã đang đặt) là bảng tự tổng hợp riêng của người dùng (Excel
PivotTable) — CHƯA có trong báo cáo này (có thể làm sau nếu cần, không nằm
trong yêu cầu ban đầu).

## 3. Việc cần làm (theo đúng thứ tự)

| # | Việc | Ai làm |
|---|---|---|
| 1 | Đã có 2 job `banhang_sku`/`tonkho_sku` chưa? | Admin etl-admin (dùng lại từ `bc-ton-kho-0.md`, KHÔNG tạo job mới) |
| 2 | Đã có job doanh thu chi nhánh với Dimension `chain` chưa? | Admin etl-admin (dùng lại, KHÔNG tạo job mới) |
| 3 | Khai danh sách hàng Core (Mart + Minimart) | Admin etl-admin |
| 4 | (Tuỳ chọn) Khóa All/Khóa theo kho/SL đang đặt/Ngày nhập cuối | DBA + Admin etl-admin |
| 5 | Chạy script tạo 2 báo cáo | IT/Dev |
| 6 | Gán quyền xem 2 báo cáo + quyền Sửa trang "Danh sách hàng Core" | Admin rp-user/etl-admin |
| 7 | Kiểm tra báo cáo có số liệu | IT/Dev |

Thiếu BẤT KỲ mục nào trong 1-3 thì báo cáo tương ứng **luôn trả về TRỐNG**
— không phải lỗi, chỉ là chưa đủ dữ liệu để đối chiếu.

## Bước 1+2 — Dùng lại hạ tầng đã có (KHÔNG tạo job mới)

Báo cáo này **KHÔNG cần VIEW/job riêng cho phần bắt buộc**:
- 2 job `banhang_sku`/`tonkho_sku` — dùng lại NGUYÊN VẸN từ báo cáo "Top
  bán chạy tồn kho=0" (xem `bc-ton-kho-0.md` Bước 1+2). Nếu server chưa
  từng làm báo cáo đó, làm theo đúng 2 bước đó TRƯỚC.
- Dimension `chain` (giá trị `MART`/`MINIMART`) — dùng lại từ job doanh thu
  chi nhánh (`doanhthu_chinhanh`) đã tạo cho báo cáo LDTD/HCRC (xem
  `hướng_dẫn_báo_cáo.md` mục 1, Bước 1 — "Tick vào Dimensions ít nhất:
  `chain`"). Nếu job đó CHƯA tick Dimension `chain`, vào etl-admin sửa lại
  job (tick thêm `chain`), không cần tạo job mới.

Đây là cách để mỗi kho biết mình thuộc Mart hay Minimart, mà không cần bất
kỳ VIEW/job mới nào riêng cho báo cáo này.

## Bước 3 — Admin etl-admin khai danh sách hàng Core

Vào trang **"Danh sách hàng Core"** (yêu cầu quyền Sửa cho MỌI thao tác kể
cả xem — cùng nguyên tắc trang "Ánh xạ Điểm - STK_ID"):

1. Bấm **"Tải file mẫu"** — tải về file `.xlsx` đúng khuôn 2 sheet cố định
   **"Core Mart"** và **"Core Minimart"**.
2. Điền dữ liệu theo đúng cột (xem bảng dưới) — CÓ THỂ dùng lại trực tiếp
   file `Stock_Core_....xlsx` khách hàng đang có, chỉ cần đổi tên 2 sheet
   thành đúng **"Core Mart"**/**"Core Minimart"** (file gốc đặt tên
   "Core Mart-G"/"Core mini-G") và xoá các cột không dùng (Mã điểm, Mã kho,
   Tên kho, Khóa All, Khóa theo kho, Tồn Kho, Ngày bán cuối, Ngày nhập
   cuối, SL đang đặt, Ngày đặt, Mã đang đặt, và toàn bộ khối pivot — báo
   cáo TỰ TÍNH LẠI những cột này, chỉ cần giữ đúng khoá `MaHang` + vài cột
   tham khảo).
3. Upload lại file qua nút **"Nhập file danh sách Core"**.

| Cột | Bắt buộc? | Ý nghĩa |
|---|---|---|
| `MaHang` | **BẮT BUỘC** | Phải khớp ĐÚNG mã hàng (SKU_CODE) đã đồng bộ ở domain `banhang_sku`/`tonkho_sku` (cột "Mã hàng" trong file mẫu khách hàng, KHÔNG phải cột "MH") |
| `MH` | Tuỳ chọn | Mã hàng/mã vạch nội bộ khác — CHỈ lưu để đối chiếu, KHÔNG dùng để lọc dữ liệu |
| `TenHang` | Tuỳ chọn | Tên hàng — tham khảo (báo cáo tự lấy TenHang thật từ domain `tonkho_sku`, cột này ở danh sách Core chỉ để đối chiếu khi xem) |
| `Dvt` | Tuỳ chọn | Đơn vị tính — hiện trong cột "Đvt" của báo cáo |
| `MaNganh` | Tuỳ chọn | Hiện trong cột "Mã ngành" của báo cáo |
| `TenNganh` | Tuỳ chọn | Hiện trong cột "Tên ngành" của báo cáo |

**QUAN TRỌNG — mỗi lần upload là THAY HẲN (replace), không phải cộng dồn**:
sheet nào có trong file thì XOÁ HẾT danh sách cũ của ĐÚNG loại điểm đó rồi
ghi lại toàn bộ theo file mới — mã hàng nào bị xoá khỏi file rồi nhập lại
sẽ KHÔNG CÒN thuộc diện Core nữa. Sheet nào KHÔNG có trong file (vd chỉ
upload 1 sheet "Core Mart") thì danh sách hiện tại của loại điểm kia
("Core Minimart") GIỮ NGUYÊN, không bị xoá. Điều này khác hẳn "Ánh xạ Điểm
- STK_ID" (upsert cộng dồn theo khoá).

Có nút **"Xuất tất cả (Excel)"** để tải lại đúng danh sách đang lưu (cùng
khuôn file mẫu) — dùng để đối chiếu/chỉnh sửa rồi upload lại.

## Bước 4 (TUỲ CHỌN) — Khóa All / Khóa theo kho / SL đang đặt / Ngày nhập cuối

Bỏ qua bước này thì 2 báo cáo VẪN CHẠY BÌNH THƯỜNG, chỉ là không lọc được
mặt hàng đang khoá và không có các cột tham khảo "SL đang đặt"/"Ngày
đặt"/"Mã đang đặt"/"Ngày nhập cuối".

```sql
-- "Khóa All"/"Khóa theo kho" — Measures = 1 nghĩa là ĐANG khoá (mặt hàng bị
-- LOẠI KHỎI báo cáo hoàn toàn, không hiện dòng), 0/NULL nghĩa là KHÔNG
-- khoá. EventDate = ngày đồng bộ (snapshot tính lại mỗi lần chạy job).
CREATE VIEW dbo.vw_KhoaAllTheoSKU AS
SELECT
    STK_ID + '_' + CAST(SKU_ID AS VARCHAR(50)) AS MaThucThe,
    CAST(GETDATE() AS DATE) AS EventDate,
    CASE WHEN LOCK_ALL_FLAG = 1 THEN 1 ELSE 0 END AS KhoaAll,  -- CHỈ VÍ DỤ — đối chiếu đúng cột với DBA
    GETDATE() AS UpdatedAt
FROM dbo.SKU_LOCK_INFO;

CREATE VIEW dbo.vw_KhoaTheoKhoTheoSKU AS
SELECT
    STK_ID + '_' + CAST(SKU_ID AS VARCHAR(50)) AS MaThucThe,
    CAST(GETDATE() AS DATE) AS EventDate,
    CASE WHEN LOCK_BY_STORE_FLAG = 1 THEN 1 ELSE 0 END AS KhoaTheoKho,  -- CHỈ VÍ DỤ
    GETDATE() AS UpdatedAt
FROM dbo.SKU_LOCK_INFO;

-- "SL đang đặt" — THAM KHẢO, KHÔNG ảnh hưởng việc lọc tồn=0. "Ngày đặt"
-- trong báo cáo lấy từ chính EventDate của dòng gần nhất (không cần cột
-- riêng). "Mã đang đặt" (0/1) báo cáo TỰ SUY RA = 1 khi SL đang đặt > 0,
-- không cần VIEW tính sẵn.
CREATE VIEW dbo.vw_DangDatTheoSKU AS
SELECT
    STK_ID + '_' + CAST(SKU_ID AS VARCHAR(50)) AS MaThucThe,
    CAST(ORDER_DT AS DATE) AS EventDate,   -- ngày đặt hàng thật
    SUM(QTY) AS SoLuongDangDat,
    MAX(UPDATED) AS UpdatedAt
FROM dbo.RV_ORDER
WHERE STATUS <> 'X'
GROUP BY STK_ID, SKU_ID, CAST(ORDER_DT AS DATE);

-- "Ngày nhập cuối" — ngày GẦN NHẤT mặt hàng được nhập kho (bất kỳ lúc nào,
-- KHÔNG giới hạn "hôm nay" — khác 4 domain "Đã nhập hôm nay" ở
-- bc-ton-kho-0.md). Có thể dùng lại đúng nguồn RV_ORDER/DLVTRANS đã có,
-- chỉ cần giữ lịch sử nhiều ngày (không SUM về 1 dòng "hôm nay").
CREATE VIEW dbo.vw_NgayNhapCuoiTheoSKU AS
SELECT
    STK_ID + '_' + CAST(SKU_ID AS VARCHAR(50)) AS MaThucThe,
    CAST(DELIVER_DT AS DATE) AS EventDate,
    SUM(QTY) AS SoLuongDaNhap,
    MAX(UPDATED) AS UpdatedAt
FROM dbo.RV_ORDER
WHERE STATUS <> 'X' AND DELIVER_DT IS NOT NULL
GROUP BY STK_ID, SKU_ID, CAST(DELIVER_DT AS DATE);
```

**etl-admin**: tạo job "Theo bảng" (nếu dùng) trỏ đúng VIEW trên, EntityCode
= `MaThucThe`, Measures tick đúng `KhoaAll`/`KhoaTheoKho`/`SoLuongDangDat`/
`SoLuongDaNhap` (ĐÚNG TÊN — hệ thống đọc cố định các tên Measures này),
KHÔNG cần Dimensions (đã có sẵn từ `banhang_sku`/`tonkho_sku`). Domain đặt
tên tuỳ ý, ví dụ `core_khoa_all`/`core_khoa_theo_kho`/`core_dang_dat`/
`core_ngay_nhap_cuoi`. Job "Ngày nhập cuối" cần **BẬT "Giữ lịch sử theo
ngày"** (cần nhiều ngày để tìm đúng ngày GẦN NHẤT); 3 job còn lại bật/tắt
đều được (chỉ đọc dòng mới nhất). **CẢ 4 domain này ĐỀU TUỲ CHỌN.**

## Bước 5 — Tạo 2 báo cáo (IT/Dev)

Chạy 1 lệnh — tạo LUÔN CẢ 2 báo cáo Mart/Minimart, an toàn chạy lại nhiều
lần:

```bash
cd rp-server
node scripts/seedCoreZeroStockReports.js
```

Mặc định gán vào menu "Báo cáo vận hành". Muốn đổi menu:
`node scripts/seedCoreZeroStockReports.js <menuCode>`.

Script tạo báo cáo `bc-core-ton-kho-0-mart` với `DefinitionJson`:

```json
{
  "title": "Core stock = 0 (Mart)",
  "loaiDiem": "MART",
  "salesDomain": "banhang_sku",
  "stockDomain": "tonkho_sku",
  "chainDomain": "doanhthu_chinhanh",
  "lockAllDomain": "core_khoa_all",
  "lockByStoreDomain": "core_khoa_theo_kho",
  "pendingOrderDomain": "core_dang_dat",
  "lastReceivedDomain": "core_ngay_nhap_cuoi",
  "threshold": 0,
  "filters": [
    {
      "field": "branches",
      "type": "multiSelect",
      "label": "Chi nhánh",
      "optionsSource": { "domain": "banhang_sku", "valueField": "MaChiNhanh", "labelField": "TenChiNhanh" }
    }
  ]
}
```

(Báo cáo `bc-core-ton-kho-0-minimart` giống hệt, chỉ đổi `loaiDiem:
"MINIMART"` và `title`.) Muốn đổi ngưỡng hoặc tên domain khác mặc định:
sửa tay qua rp-user (Hệ thống → Biểu mẫu) hoặc sửa script rồi chạy lại.

## Bước 6 — Gán quyền

1. Vào rp-user → Hệ thống → Phân quyền, gán quyền xem 2 báo cáo
   `bc-core-ton-kho-0-mart`/`bc-core-ton-kho-0-minimart` cho đúng vai trò
   (script Bước 5 KHÔNG tự gán).
2. Vào etl-admin → Hệ thống → Vai trò, gán quyền **Sửa** trang "Danh sách
   hàng Core" cho vai trò admin cần khai/cập nhật danh sách — trang này
   KHÔNG có mức "chỉ xem" riêng.

## Bước 7 — Kiểm tra

1. Theo dõi etl-admin → Log cho tới khi mọi job liên quan (Bước 1/2/4)
   chạy THÀNH CÔNG.
2. Vào "Danh sách hàng Core" — xác nhận đã có danh sách cho ĐÚNG loại điểm
   muốn xem báo cáo.
3. Mở 2 báo cáo trên rp-user — kiểm tra:
   - Chỉ mặt hàng thuộc danh sách Core mới xuất hiện.
   - Cột "Tồn Kho" luôn ≤ 0 (hoặc ≤ ngưỡng đã đặt).
   - Nếu đã khai Bước 4: mặt hàng đang khoá KHÔNG xuất hiện; "SL đang
     đặt"/"Ngày đặt"/"Mã đang đặt"/"Ngày nhập cuối" hiện đúng.
4. Thử xuất Excel/PDF — so khớp cột với bảng ở mục 2.

## Hỏi & đáp

**Báo cáo trống trơn?**
Kiểm tra theo đúng thứ tự: (1) đã upload danh sách hàng Core cho ĐÚNG loại
điểm (Mart/Minimart) chưa; (2) job `banhang_sku`/`tonkho_sku` đã chạy
xong chưa; (3) job doanh thu chi nhánh đã tick Dimension `chain` và chạy
xong chưa.

**1 mặt hàng chắc chắn hết hàng nhưng KHÔNG thấy trong báo cáo?**
Kiểm tra: (1) mã hàng đó có TRONG danh sách Core của ĐÚNG loại điểm không
(kiểm tra chính tả/khoảng trắng — phải khớp CHÍNH XÁC cột `MaHang`); (2)
kho đó có Dimension `chain` đúng loại điểm (MART/MINIMART) không; (3) mặt
hàng đó có bị "Khóa All"/"Khóa theo kho" không (nếu có khai Bước 4) —
đang khoá thì LOẠI HẲN, đây là hành vi ĐÚNG THIẾT KẾ, không phải lỗi.

**Cột "Mã điểm" luôn trống?**
Kho đó CHƯA khai "Ánh xạ Điểm - STK_ID" — không bắt buộc phải khai (báo
cáo vẫn chạy đúng, chỉ là không hiện Mã điểm cho kho đó).

**Muốn đổi ngưỡng?**
Sửa `threshold` trong `DefinitionJson` qua rp-user, không cần sửa code.

## Ghi chú kỹ thuật (cho ai cần đọc code)

- Bộ máy tính toán: `rp-server/lib/coreZeroStockRunner.js`
  (`SourceType='coreZeroStock'`).
- Đọc danh sách Core: `rp-server/lib/coreItemList.js` (đọc
  `etl.CoreItemList` qua pool `ETL_DIEM_STK`, cache 60s).
- Tra ngược "Mã điểm": dùng lại `rp-server/lib/diemStkMapping.js` (không
  cần job/cấu hình riêng).
- Các hàm đọc `dwh.ReportFacts` dùng chung với báo cáo "Top bán chạy tồn
  kho=0": `rp-server/lib/reportFactsHelpers.js`.
- Import/xuất danh sách Core: `etl/lib/coreItemListImport.js`,
  `etl/routes/admin/coreItemList.js`.
- Script tạo báo cáo: `rp-server/scripts/seedCoreZeroStockReports.js`.
