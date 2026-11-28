# Báo cáo `bc-pmh-full-barcode` — "Full Barcode"

Tài liệu triển khai riêng cho báo cáo MỚI (bản 11.57, SỬA bản 11.58, theo
yêu cầu người dùng, dựa trên file mẫu thật "Mẫu Báo Cáo PMH.xlsx" sheet
"Full Barcode" — Phòng Mua Hàng).

**LỊCH SỬ KIẾN TRÚC (quan trọng để hiểu các file liên quan)**: bản 11.57
ban đầu gộp sheet này + 2 báo cáo "Thay đổi giá" đã có thành 1 báo cáo
DUY NHẤT `bc-pmh` (đúng mẫu "BRG Weekly Post", chọn "sheet" qua bộ lọc nội
bộ). Bản 11.58, theo yêu cầu người dùng ("Tôi nghĩ mỗi một sheet đấy là
thành một báo cáo riêng nhé. Tên báo cáo thì giống tên mà trong ghi
trong sheet ấy") — ĐỔI LẠI: mỗi sheet là 1 báo cáo RIÊNG trong menu, tên
= đúng tên sheet trong file mẫu. Đã BỎ HẲN `bc-pmh`/`lib/pmhRunner.js`/
`scripts/seedPmhReport.js` — file NÀY mô tả báo cáo thay thế.

## 1. Báo cáo này làm gì

Danh mục TOÀN BỘ barcode đã đăng ký trên DSMART16 (1 mã hàng có thể có
NHIỀU barcode — mỗi barcode 1 dòng riêng) kèm thông tin cơ bản + giá,
snapshot MỖI NGÀY (không giữ lịch sử thay đổi — xem đồng bộ).

11 cột đã có nguồn (khớp tên cột trong file mẫu gốc): Barcode, SKU_ID, Mã
hàng, Tên hàng, Mã nhóm, Tên nhóm, Mã NCC, Tên nhà cung cấp, ĐVT, Giá bán
lẻ, Giá nhập theo NCC, Giá Vốn chỉ định.

**2 cột CHƯA CÓ NGUỒN XÁC NHẬN** (để trống/NULL, KHÔNG đoán — xem VIEW
nguồn mục 2 cho chi tiết đã tìm ở đâu):
- **Thuế Nhập** (thuế suất nhập khẩu) — chưa tìm thấy cột nào trên
  `SKU_DEF`/`STK_INFO`/`STRANS` qua các VIEW đã xây trước đây.
- **Trạng Thái** (mã hàng, vd '01'/'03' trong file mẫu) — chưa tìm thấy
  cột trạng thái MÃ HÀNG nào (`STRANS.STATUS`/`STOCK.TYPE` là trạng thái
  CHỨNG TỪ/LOẠI CHI NHÁNH, khác hẳn trạng thái mã hàng).

Khi có DBA xác nhận 2 cột trên, bổ sung tiếp vào VIEW `vw_PMH_FullBarcode`
(mục 2) rồi chạy lại `node rp-server/scripts/seedPmhFullBarcodeReport.js`
để báo cáo nhận cột mới — không cần đổi kiến trúc đã có.

**6 sheet khác của file mẫu gốc "Mẫu Báo Cáo PMH.xlsx" CHƯA LÀM** (chờ
DBA xác nhận nguồn, hoặc đã có sẵn ở báo cáo khác):

| Sheet mẫu gốc | Trạng thái |
|---|---|
| Thay đổi giá bán tức thời | ĐÃ CÓ — báo cáo riêng `bc-thay-doi-gia-tuc-thoi` (xem "bc-thay-doi-gia.md"), không cần làm thêm gì. |
| Thay đổi giá bán từ thời điểm | ĐÃ CÓ — báo cáo riêng `bc-thay-doi-gia-tu-thoi-diem` (cùng file trên). |
| Giá mua theo NCC | CHƯA LÀM — DSMART16 không có khái niệm "NCC mặc định/lịch sử giá mua theo NCC" ở bảng danh mục, chỉ có giao dịch mua (`STRANS`), không có bảng LỊCH SỬ. Cần DBA chỉ đúng bảng/cách tính. |
| BC thay đổi GBKM (giá bán khuyến mãi) | CHƯA LÀM — chỉ có giá KM HIỆN TẠI (`RTPRICE.DISC_RTPR`), không có bảng LỊCH SỬ thay đổi giá KM. |
| BC thay đổi GN KM (giá nhập khuyến mãi) | CHƯA LÀM — tương tự, không có bảng lịch sử. |
| BC thay đổi GN thường (giá nhập thường) | CHƯA LÀM — tương tự, không có bảng lịch sử giá nhập. |
| Báo cáo trạng thái mã hàng theo kho | CHƯA LÀM — cần cột "Trạng Thái" (xem mục trên), chưa tìm thấy nguồn. |
| Sheet7 (báo cáo doanh số KM) | BỎ QUA — sheet mẫu không có cột nào, người dùng xác nhận bỏ qua. |

## 2. Nguồn dữ liệu

Domain `pmh_full_barcode`, VIEW MỚI `dbo.vw_PMH_FullBarcode` trên CSDL
`DSMART16` — xem đầy đủ chú thích nguồn từng cột (+ 3 giả định CHƯA CHỐT:
đại diện 1 giá bán lẻ/vùng giá nhỏ nhất, giá vốn TRUNG BÌNH mọi chi
nhánh, NCC của giao dịch mua gần nhất TOÀN CHUỖI) tại:
`deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW PMH Full Barcode (DSMART16 trung tâm).sql`

## 3. Các bước triển khai (theo đúng thứ tự)

| # | Việc | Ai làm |
|---|---|---|
| 1 | Chạy file `.sql` ở mục 2 trên CSDL `DSMART16` — kiểm tra ngay bằng 2 câu `SELECT` cuối file (tốc độ + đối chiếu 1 mã hàng nhiều barcode) | DBA |
| 2 | Chạy `node etl/scripts/seedPmhFullBarcodeSync.js` (thư mục `etl/`) — tạo job đồng bộ domain `pmh_full_barcode`, tái dùng Nguồn dữ liệu "DSMART16 - Live" đã có | Admin etl-admin / IT-Dev |
| 3 | Chờ job đồng bộ chạy xong ít nhất 1 lượt (etl-admin → Đồng bộ → xem "Lần chạy gần nhất") | IT/Dev |
| 4 | Chạy `node rp-server/scripts/seedPmhFullBarcodeReport.js [menuCode]` (thư mục `rp-server/`) — tạo báo cáo `bc-pmh-full-barcode` trong danh mục; mặc định đặt ở menu `reports-mua-hang` ("Báo cáo Mua hàng") | Admin rp-user / IT-Dev |
| 5 | Vào Hệ thống → Phân quyền, gán quyền xem `bc-pmh-full-barcode` cho đúng vai trò cần dùng — mặc định KHÔNG ai xem được, kể cả admin | Admin rp-user |

## 4. Cách kiểm tra sau khi triển khai xong

Mở báo cáo "Full Barcode" (menu "Báo cáo Mua hàng") — phải thấy đủ 11 cột
có dữ liệu (2 cột Thuế Nhập/Trạng Thái CHƯA có, không hiện), Giá bán lẻ/
Giá Vốn chỉ định/Giá nhập theo NCC có số (không NULL hàng loạt trừ mã
hàng thật sự chưa từng bán/nhập). Lọc/xem 1 mã hàng CÓ NHIỀU barcode (đối
chiếu với câu `SELECT` thứ 2 ở cuối file VIEW) — phải thấy đủ các dòng,
mỗi dòng 1 barcode khác nhau, còn lại các cột khác GIỐNG NHAU (vì cùng 1
mã hàng).

Bấm "Xuất Excel" — phải ra ĐỦ TOÀN BỘ dữ liệu (không bị cắt ở 5.000 dòng,
dù domain có ~91.260 dòng — `lib/reportRunner.js:runDefinitionForExport()`
tự lặp trang cho mọi báo cáo `directDb`), cột "TT" phải đánh số LIÊN TỤC
1..hết (không lặp lại "1, 2, 3..." giữa file).
