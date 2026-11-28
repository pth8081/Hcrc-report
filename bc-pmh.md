# Báo cáo `bc-pmh` — "PMH" (Phòng Mua Hàng)

Tài liệu triển khai riêng cho báo cáo MỚI (bản 11.57, theo yêu cầu người
dùng, dựa trên file mẫu thật "Mẫu Báo Cáo PMH.xlsx" — "Một báo cáo và in
ra nhiều sheet... khi chọn cái báo cáo nó trên web ấy, thì sẽ được chọn
từng sheet một để xem báo cáo trên web. Còn xuất ra cả báo cáo với tất cả
các sheet. Giống như báo cáo weekly post của MKT") — kiến trúc ĐÚNG mẫu
`bc-brg-weekly-post` (xem "bc-brg-weekly-post.md") — 1 ReportId DUY NHẤT,
bộ lọc nội bộ "Chọn sheet" chuyển giữa các sheet trên web; nút riêng "Xuất
Excel đủ N sheet" xuất 1 file .xlsx gộp TẤT CẢ sheet.

## 1. Báo cáo này làm gì

Tập hợp các báo cáo phục vụ Phòng Mua Hàng (giá/NCC/barcode/trạng thái mã
hàng) vào 1 chỗ, nhiều sheet, theo file mẫu `Mẫu Báo Cáo PMH.xlsx` người
dùng cung cấp (7 sheet có dữ liệu + 1 sheet "Sheet7" rỗng, bỏ qua).

**v1 (bản 11.57) CHỈ làm 3/7 sheet** — sheet nào có nguồn DSMART16 đã xác
nhận chắc chắn, hoặc TÁI DÙNG báo cáo đã có sẵn:

1. **"Full Barcode"** — danh mục TOÀN BỘ barcode đã đăng ký (1 mã hàng có
   thể có NHIỀU barcode) kèm thông tin cơ bản + giá, snapshot MỖI NGÀY
   (không giữ lịch sử thay đổi — xem đồng bộ). 11 cột đã có nguồn:
   Barcode, SKU_ID, Mã hàng, Tên hàng, Mã nhóm, Tên nhóm, Mã NCC, Tên nhà
   cung cấp, ĐVT, Giá bán lẻ, Giá nhập theo NCC, Giá Vốn chỉ định.
2. **"Thay đổi giá bán tức thời"** — TÁI DÙNG NGUYÊN báo cáo đã có sẵn
   `bc-thay-doi-gia-tuc-thoi` (xem "bc-thay-doi-gia.md") làm 1 sheet trong
   PMH — KHÔNG định nghĩa lại cột, đọc thẳng cấu hình báo cáo gốc mỗi lần
   chạy.
3. **"Thay đổi giá bán từ thời điểm"** — TÁI DÙNG NGUYÊN báo cáo đã có sẵn
   `bc-thay-doi-gia-tu-thoi-diem` (cùng file trên), tương tự mục 2.

**CHƯA LÀM (chờ DBA xác nhận nguồn trước khi làm tiếp)**:

| Sheet mẫu gốc | Lý do chưa làm |
|---|---|
| Giá mua theo NCC | DSMART16 không có khái niệm "NCC mặc định/lịch sử giá mua theo NCC" ở bảng danh mục — chỉ có giao dịch mua (`STRANS`), không có bảng LỊCH SỬ giá mua theo từng NCC. Cần DBA chỉ đúng bảng/cách tính. |
| BC thay đổi GBKM (giá bán khuyến mãi) | Chỉ có giá KM HIỆN TẠI (`RTPRICE.DISC_RTPR`), không có bảng LỊCH SỬ thay đổi giá KM. |
| BC thay đổi GN KM (giá nhập khuyến mãi) | Tương tự — không có bảng lịch sử. |
| BC thay đổi GN thường (giá nhập thường) | Tương tự — không có bảng lịch sử giá nhập (khác giá BÁN, đã có 2 sheet ở trên nhờ `HISRTPR`/`RTPRPRG`). |
| Báo cáo trạng thái mã hàng theo kho | Cần cột "Trạng Thái" (vd '01'/'03') — xem mục dưới, chưa tìm thấy nguồn. |
| Sheet7 (báo cáo doanh số KM) | Sheet mẫu KHÔNG có cột nào — người dùng xác nhận bỏ qua. |

**2 cột CHƯA CÓ NGUỒN XÁC NHẬN ở sheet "Full Barcode"** (để trống/NULL,
KHÔNG đoán — xem VIEW nguồn mục 2):
- **Thuế Nhập** (thuế suất nhập khẩu) — chưa tìm thấy cột nào trên
  `SKU_DEF`/`STK_INFO`/`STRANS` qua các VIEW đã xây trước đây.
- **Trạng Thái** (mã hàng, vd '01'/'03' trong file mẫu) — chưa tìm thấy
  cột trạng thái MÃ HÀNG nào (`STRANS.STATUS`/`STOCK.TYPE` là trạng thái
  CHỨNG TỪ/LOẠI CHI NHÁNH, khác hẳn trạng thái mã hàng).

Khi có DBA xác nhận 2 cột trên + nguồn cho 4 sheet "Chưa làm", bổ sung
tiếp vào VIEW `vw_PMH_FullBarcode` (mục 2) và `lib/pmhRunner.js`
(`SHEET_OPTIONS`) — không cần đổi kiến trúc đã có.

## 2. Nguồn dữ liệu

**Sheet "Full Barcode"** — domain MỚI `pmh_full_barcode`, VIEW MỚI
`dbo.vw_PMH_FullBarcode` trên CSDL `DSMART16` — xem đầy đủ chú thích nguồn
từng cột (+ 3 giả định CHƯA CHỐT: đại diện 1 giá bán lẻ/vùng giá nhỏ
nhất, giá vốn TRUNG BÌNH mọi chi nhánh, NCC của giao dịch mua gần nhất
TOÀN CHUỖI) tại:
`deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW PMH Full Barcode (DSMART16 trung tâm).sql`

**Sheet "Thay đổi giá bán tức thời"/"từ thời điểm"** — DÙNG CHUNG domain/
VIEW với 2 báo cáo `bc-thay-doi-gia-tuc-thoi`/`bc-thay-doi-gia-tu-thoi-diem`
ĐÃ CÓ SẴN — xem "bc-thay-doi-gia.md" mục 2, KHÔNG chép lại ở đây. PMH chỉ
ĐỌC THẲNG `DefinitionJson` của 2 báo cáo đó mỗi lần chạy (xem
`lib/pmhRunner.js:loadReuseDefinition()`), không tạo bản sao cấu hình.

## 3. Các bước triển khai (theo đúng thứ tự)

| # | Việc | Ai làm |
|---|---|---|
| 1 | Chạy file `.sql` ở mục 2 (VIEW "Full Barcode") trên CSDL `DSMART16` — kiểm tra ngay bằng 2 câu `SELECT` cuối file (tốc độ + đối chiếu 1 mã hàng nhiều barcode) | DBA |
| 2 | Chạy `node etl/scripts/seedPmhFullBarcodeSync.js` (thư mục `etl/`) — tạo job đồng bộ domain `pmh_full_barcode`, tái dùng Nguồn dữ liệu "DSMART16 - Live" đã có | Admin etl-admin / IT-Dev |
| 3 | Chờ job đồng bộ chạy xong ít nhất 1 lượt (etl-admin → Đồng bộ → xem "Lần chạy gần nhất") | IT/Dev |
| 4 | Xác nhận 2 báo cáo `bc-thay-doi-gia-tuc-thoi`/`bc-thay-doi-gia-tu-thoi-diem` ĐÃ tồn tại và đang hoạt động (nếu chưa, triển khai theo "bc-thay-doi-gia.md" trước) | IT/Dev |
| 5 | Chạy `node rp-server/scripts/seedPmhReport.js [menuCode]` (thư mục `rp-server/`) — tạo báo cáo `bc-pmh` trong danh mục; mặc định đặt ở menu `reports-adhoc`, truyền tham số khác nếu muốn đặt menu khác. Script tự kiểm tra bước 4 trước khi tạo, báo lỗi rõ nếu thiếu | Admin rp-user / IT-Dev |
| 6 | Vào Hệ thống → Phân quyền, gán quyền xem `bc-pmh` cho đúng vai trò cần dùng — mặc định KHÔNG ai xem được, kể cả admin | Admin rp-user |

## 4. Cách kiểm tra sau khi triển khai xong

Mở báo cáo "PMH" — bộ lọc "Chọn sheet" phải có đúng 3 lựa chọn: "Full
Barcode", "Thay đổi giá bán tức thời", "Thay đổi giá bán từ thời điểm".

- **"Full Barcode"** — phải thấy đủ 11 cột có dữ liệu (2 cột Thuế
  Nhập/Trạng Thái CHƯA có trong v1, không hiện), Giá bán lẻ/Giá Vốn chỉ
  định/Giá nhập theo NCC có số (không NULL hàng loạt trừ mã hàng thật sự
  chưa từng bán/nhập). Lọc/xem 1 mã hàng CÓ NHIỀU barcode (đối chiếu với
  câu `SELECT` thứ 2 ở cuối file VIEW) — phải thấy đủ các dòng, mỗi dòng 1
  barcode khác nhau, còn lại các cột khác GIỐNG NHAU (vì cùng 1 mã hàng).
- **2 sheet "Thay đổi giá"** — số liệu phải KHỚP Y HỆT khi mở trực tiếp 2
  báo cáo gốc `bc-thay-doi-gia-tuc-thoi`/`bc-thay-doi-gia-tu-thoi-diem`
  (cùng bộ lọc ngày) — vì PMH chỉ đọc lại đúng cấu hình đó, không tính
  toán riêng.
- **"Xuất Excel đủ 3 sheet"** — bấm nút này (KHÁC "Xuất Excel" thường, chỉ
  xuất 1 sheet đang xem) — phải ra 1 file `.xlsx` có ĐỦ 3 tab, tab "Full
  Barcode" có ĐỦ toàn bộ dòng (không bị cắt ở 5.000 dòng — xem chú thích
  `routes/reports.js:fetchAllSheetRows()` nếu cần đối chiếu cơ chế).
