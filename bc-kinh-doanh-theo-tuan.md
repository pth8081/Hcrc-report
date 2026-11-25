# Báo cáo kinh doanh theo tuần

Bản 11.24, theo yêu cầu đội MKT — dựa trên file mẫu thật đội MKT gửi
("FORM BÁO CÁO - BC KD T3 2026.xlsx"). Gộp cùng domain/VIEW với "Báo cáo
khách hàng theo tuần" (`bc-khach-hang-theo-tuan`, xem file riêng của báo
cáo đó — chỉ cần đọc lại phần "2. Nguồn dữ liệu" bên dưới 1 lần, không
chép lại ở file khác).

## 1. Báo cáo này làm gì

Mỗi dòng = 1 "mã Điểm" (siêu thị/chi nhánh), so sánh 2 cặp kỳ:

- **W / W-1 / Tỷ lệ W/W-1** — "W" (tuần) là **7 ngày liên tiếp, KẾT THÚC
  ĐÚNG ngày được chọn** (bộ lọc "Ngày trong tuần muốn xem", mặc định hôm
  nay) — ví dụ chọn 17/6/2026 thì W = 11/6 → 17/6/2026. **KHÔNG phải tuần
  dương lịch Thứ Hai → Chủ Nhật** — đã đối chiếu với số liệu thật trong
  file mẫu MKT (17/6/2026 là Thứ Tư, không phải Chủ Nhật) để xác nhận quy
  tắc này. "W-1" = 7 ngày liền trước đó (ví dụ 4/6 → 10/6/2026).
- **MTD / MTD-1 / Tỷ lệ MTD/MTD-1** — "MTD" = từ ngày 1 đầu tháng (của
  tháng chứa ngày được chọn) đến đúng ngày được chọn. "MTD-1" = **cùng
  khoảng ngày/tháng đó nhưng lùi đúng 1 năm dương lịch** (ví dụ chọn
  17/6/2026 → MTD-1 = 1/6/2025 → 17/6/2025).

Cho **6 chỉ số**, mỗi chỉ số có 2 biến thể TOTAL (bán lẻ nói chung) và QUA
THẺ (bán lẻ có thẻ thành viên Elite):

| Chỉ số | Công thức |
|---|---|
| Doanh số | `AMOUNT + SURPLUS + VAT_AMT` (GỒM VAT) của giao dịch bán (221) trừ trả hàng (222) |
| Số Bill | `COUNT(DISTINCT TRANS_NUM)` của giao dịch bán (221) trừ trả hàng (222) |
| AOV | Doanh số ÷ Số Bill (tính ở tầng báo cáo, không có trong VIEW) |

**"QUA THẺ"** = cùng công thức trên nhưng CHỈ tính giao dịch có
`CARD_ID` khác rỗng (mã thẻ thành viên app Elite — xem mục 2).

**"TOTAL" ở đây nghĩa là BÁN LẺ, ĐÃ LOẠI HẲN BÁN BUÔN** — đúng ghi chú có
sẵn trong file mẫu MKT: *"Đã loại trừ giao dịch bán buôn trong bán lẻ"*.
Cụ thể: chỉ tính `TRANS_CODE = '221'` (bán) trừ `'222'` (trả) — **loại
hẳn** `'211'`/`'212'` (bán buôn) **và** `'232'` (bán buôn cho đại lý theo
đơn, người dùng xác nhận trực tiếp) — **KHÁC HẲN** công thức "Số Bill" đã
dùng ở domain `giaodich_chinhanh` (Doanh thu cuối ngày, dùng
211+221+232 trừ 212+222, GỘP CHUNG buôn+lẻ) — không nhầm 2 công thức này
với nhau.

Mỗi dòng còn hiện: Mã Điểm (MĐ), Mã kho (MK), Tên siêu thị, **Loại**
(Mart/Mini Mart/Kho), **Miền**, **Vùng QL** (người quản lý vùng) — 2 cột
cuối MỚI, admin tự khai (xem mục 2). Dòng được nhóm theo **Loại**
(I. CHUỖI MART / II. CHUỖI MINIMART), mỗi nhóm có dòng "TỔNG <nhóm>",
cuối bảng có dòng "Tổng cộng" — các tỉ lệ/AOV ở dòng tổng được **tính lại
từ tổng các số thô** của nhóm, không phải trung bình cộng các dòng.

**Quy ước "Tỷ lệ" khi không có dữ liệu kỳ trước** (đã CHỌN khác 1 vài ô
trong file Excel mẫu — IFERROR(...,0) phía công thức gốc): kỳ trước = 0
hoặc không có dữ liệu → tỷ lệ để **TRỐNG (null)**, không hiện 0% giả —
đúng quy ước `divOrNull`/`pctOrNull` dùng thống nhất trong toàn hệ thống.
Báo lại nếu MKT muốn đổi lại thành 0%.

## 2. Nguồn dữ liệu

**VIEW mới** `dbo.V_HCRC_DOANHTHU_THE_CHINHANH` trên DSMART16 (Live) +
DSMART16_EOM (Lịch sử) — SQL đầy đủ ở
`"deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Doanh thu theo Thẻ chi
nhánh (Script A+B, DSMART16 + DSMART16_EOM).sql"` (Script A chạy trên
DSMART16, Script B chạy trên DSMART16_EOM, kèm stored procedure bảo trì
`sp_HCRC_RebuildDoanhThuTheView` — đọc file đó để biết lý do kỹ thuật đầy
đủ, bao gồm cách xác định `CARD_ID` = mã thẻ thành viên Elite).

VIEW trả về theo `(STK_ID, WORK_DATE)`: `SoBillTotal`, `SoBillThe`,
`DoanhSoTotal`, `DoanhSoThe`.

**Domain ETL mới**: `doanhthu_the_chinhanh` — xem
`etl/scripts/seedDoanhThuTheSync.js` (mục 3 bên dưới).

**Miền/Vùng QL** — 2 cột MỚI trong `etl.DiemStkMapping` (bảng "Ánh xạ
Điểm - STK_ID" đã có sẵn, dùng chung cho nhiều báo cáo khác) — admin tự
khai qua etl-admin, KHÔNG có nguồn DSMART16 nào cung cấp khái niệm này.
Để trống = báo cáo hiện ô trống (không suy đoán).

## 3. Các bước triển khai (theo đúng thứ tự)

1. **Tạo VIEW** — chạy Script A (`"deploy/VIEW DSMART16 (trung tâm)/Thiết
   lập VIEW Doanh thu theo Thẻ chi nhánh (Script A+B, DSMART16 +
   DSMART16_EOM).sql"`) trên CSDL `DSMART16` (Live).
   - (Tuỳ chọn, cho "Cùng kỳ năm trước"/MTD-1) chạy thêm Script B trên
     `DSMART16_EOM`, và thêm 1 step gọi `sp_HCRC_RebuildDoanhThuTheView`
     vào job SQL Server Agent "HCRC - Cap nhat lai VIEW
     V_HCRC_DOANHTHU_CHINHANH" đã có sẵn (xem file SQL, mục "BẢO TRÌ LÂU
     DÀI") — để VIEW Lịch sử tự cập nhật khi DSMART16 tạo thêm bảng
     `STRANS_YYYYMM` mới mỗi tháng.
2. **Tạo job đồng bộ** — `node etl/scripts/seedDoanhThuTheSync.js` (chỉ
   tạo job Live) hoặc `node etl/scripts/seedDoanhThuTheSync.js
   --with-history` (tạo cả job Lịch sử, SAU KHI đã chạy Script B ở bước
   1). Yêu cầu đã chạy `seedLdtdHcrcSync.js` trước đó (tái dùng 2 "Nguồn
   dữ liệu" DSMART16 Live/Lịch sử đã có).
3. **Tạo báo cáo** — `node rp-server/scripts/seedKinhDoanhTuanReport.js`
   (mặc định đưa vào menu `reports-adhoc` = "Báo cáo MKT").
4. **Gán quyền xem** — Hệ thống → Phân quyền, gán quyền cho
   `bc-kinh-doanh-theo-tuan` (mặc định KHÔNG ai xem được, kể cả admin).
5. (Tuỳ chọn) **Khai Miền/Vùng QL** — etl-admin → "Ánh xạ Điểm - STK_ID",
   sửa từng dòng hoặc nhập file Excel (cột `Mien`/`VungQL` mới, xem file
   mẫu "Tải file mẫu" ở trang đó).

## 4. Cách kiểm tra sau khi triển khai

1. `SELECT TOP 20 * FROM dbo.V_HCRC_DOANHTHU_THE_CHINHANH ORDER BY
   WORK_DATE DESC;` trên DSMART16 — phải thấy `SoBillThe/DoanhSoThe <=
   SoBillTotal/DoanhSoTotal` (qua thẻ là tập con của tổng).
2. Chờ job đồng bộ chạy xong (≤15 phút) — etl-admin → "Đồng bộ" → đúng
   job "Doanh thu theo Thẻ chi nhánh - Live (DSMART16)" không báo lỗi.
3. Mở báo cáo "Báo cáo kinh doanh theo tuần" (menu "Báo cáo MKT") — chọn
   1 ngày đã có dữ liệu, kiểm tra số liệu 1-2 siêu thị khớp với số liệu
   đội MKT đang tự tổng hợp tay (đối chiếu Doanh số TOTAL/QUA THẺ, Số
   Bill, AOV — và đặc biệt kiểm tra TOTAL ở đây KHÔNG lớn hơn con số
   "Doanh thu cuối ngày" của CÙNG siêu thị/ngày đó quá nhiều, vì đã loại
   bán buôn — ngược lại nếu bằng/lớn hơn thì khả năng công thức bị sai).
