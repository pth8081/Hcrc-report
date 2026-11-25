# Báo cáo khách hàng theo tuần

Bản 11.24, theo yêu cầu đội MKT — dựa trên file mẫu thật đội MKT gửi
("Form báo cáo hàng tuần thứ 6.xlsx"). **Dùng CHUNG domain/VIEW với "Báo
cáo kinh doanh theo tuần"** (`bc-kinh-doanh-theo-tuan`) — đọc file
`bc-kinh-doanh-theo-tuan.md` mục 1/2 trước (công thức Doanh số/Số Bill/
"qua thẻ"/"TOTAL = bán lẻ, loại hẳn bán buôn", VIEW `V_HCRC_DOANHTHU_THE_CHINHANH`,
domain `doanhthu_the_chinhanh`) — file này CHỈ nêu điểm KHÁC.

## 1. Khác gì "Báo cáo kinh doanh theo tuần"

- **KHÔNG có MTD/MTD-1** — thay bằng **LFL** ("Trung bình tuần cùng kỳ
  năm trước") = tổng Doanh số/Số Bill của **CẢ THÁNG DƯƠNG LỊCH** chứa
  ngày được chọn, **lùi đúng 1 năm**, chia cho (số ngày trong tháng đó ÷
  7) — ra "trung bình 1 tuần" của tháng đó năm trước. Công thức này đã
  dò ngược và khớp ĐÚNG số liệu thật trong file mẫu (vd 1 siêu thị có Bill
  tổng LFL = 4947.366667 khớp đúng 21203 Bill thật trong tháng 6/2023 ×
  7 ÷ 30 ngày).
- **AOV LFL** = Doanh số LFL ÷ Số Bill LFL (2 giá trị "trung bình tuần" đã
  chia sẵn — hệ số chia tháng tự triệt tiêu trong phép chia, không cần
  tính lại từ tổng tháng).
- **2 loại Tỷ lệ**: "Tỷ lệ W/W-1" (như báo cáo kia) và **"Tỷ lệ W/LFL"**
  (so Tuần này với trung bình tuần cùng kỳ năm trước) — KHÔNG có tỷ lệ
  nào khác.
- **Thứ tự nhóm/cột** theo đúng file mẫu: Bill tổng → Bill qua thẻ Elite
  → AOV tổng → AOV qua thẻ Elite → Doanh số tổng → Doanh số qua thẻ (mỗi
  nhóm 5 cột: W, W-1, LFL, Tỷ lệ W/W-1, Tỷ lệ W/LFL).
- **Cột định danh dòng**: TT, Mã CH (= mã kho MaStkMoi), Mã điểm, Hình
  thức (Mart/Mini Mart), Tên CH — **Mã CH đứng TRƯỚC Mã điểm** (khác
  thứ tự MĐ-trước-MK của "Báo cáo kinh doanh theo tuần").
- Vẫn nhóm theo Hình thức (I. CHUỖI MART/II. CHUỖI MINIMART) + dòng
  "TỔNG <nhóm>"/"Tổng cộng" — giống báo cáo kia. **KHÔNG hiện mã Điểm
  `LoaiChuoi = 'KHO'`** (bản 11.27 — GIỐNG HỆT "Báo cáo kinh doanh theo
  tuần", xem `bc-kinh-doanh-theo-tuan.md` mục 1).
- **KHÔNG dùng** cột Miền/Vùng QL (file mẫu báo cáo này không có 2 cột
  đó — chỉ "Báo cáo kinh doanh theo tuần" dùng).
- **Bộ lọc "Từ ngày - Đến ngày" (`customRange`, bản 11.25, tuỳ chọn)** —
  GIỐNG HỆT cơ chế của "Báo cáo kinh doanh theo tuần" (xem
  `bc-kinh-doanh-theo-tuan.md` mục 1, đoạn "Từ ngày - Đến ngày") — điền đủ
  2 ô thì "W" đổi thành tổng cộng dồn khoảng đã chọn, "W-1" = khoảng liền
  trước cùng số ngày. Riêng **"LFL" KHÔNG đổi theo khoảng này** — vẫn tính
  theo THÁNG chứa ngày neo (neo = "Đến ngày" khi dùng khoảng tuỳ chỉnh).

Ghi chú "(không bao gồm 07 Siêu thị chuyển đổi sang FujiMart)" trong file
mẫu — KHÔNG cần xử lý riêng: siêu thị đã chuyển đổi/ngừng dùng DSMART16
tự nhiên không còn dữ liệu mới, tự "biến mất" khỏi số liệu.

## 1b. Sheet "Biểu đồ" khi "Xuất Excel" (bản 11.26)

**Theo yêu cầu người dùng** (phát hiện qua đối chiếu lại file mẫu gốc —
"Form báo cáo hàng tuần thứ 6.xlsx" có 1 sheet "Biểu đồ" RIÊNG, tách
khỏi sheet "Báo cáo", với 4 biểu đồ cột minh hoạ). File `.xlsx` tải về
từ nút "Xuất Excel" của báo cáo này giờ có THÊM 1 sheet "Biểu đồ" ngay
sau sheet dữ liệu, chứa **3 ẢNH TĨNH** (không phải biểu đồ Excel "sống"
— không sửa lại được trong Excel như biểu đồ gốc, do thư viện xuất Excel
dùng (`exceljs`) không hỗ trợ tạo chart Excel thật):

1. **"Biểu đồ tổng số Bill"** — 2 nhóm cột Mart/Mini Mart, mỗi nhóm 3
   cột Trung bình cùng kỳ năm trước (LFL)/Tuần trước/Tuần này — lấy
   ĐÚNG số ở dòng "TỔNG Mart"/"TỔNG Mini Mart" của sheet dữ liệu.
2. **"Biểu đồ AOV — Chuỗi Mart"** — 2 nhóm cột AOV tổng/AOV qua thẻ,
   cùng 3 cột LFL/Tuần trước/Tuần này, từ dòng "TỔNG Mart".
3. **"Biểu đồ AOV — Chuỗi Mini Mart"** — tương tự, từ dòng "TỔNG Mini
   Mart".

**KHÔNG làm biểu đồ thứ 4 của file mẫu** ("Thực trạng sử dụng thẻ" — Số
lần TB thẻ active/tháng, Số lần KH sử dụng thẻ, Tỷ lệ) — xác nhận với
người dùng: dữ liệu này đến từ 1 file Excel KHÁC ("Data tổng hợp.xlsx",
liên kết ngoài trong file mẫu gốc), nhóm MKT tự tổng hợp tay, KHÔNG có
trong DSMART16/hệ thống báo cáo này. Nếu sau này xác nhận được nguồn dữ
liệu thật (vd đồng bộ được từ app Elite/CRM), có thể bổ sung thêm 1 ảnh
nữa ở `lib/khachHangTuanRunner.js:buildChartImages()`.

Kỹ thuật: vẽ TRỰC TIẾP bằng `@napi-rs/canvas` (Canvas 2D, build sẵn theo
nền tảng, KHÔNG cần công cụ build hệ thống như gói `canvas` cũ) — xem
`lib/chartImage.js`. Font tiếng Việt TÁI DÙNG font đã có sẵn cho xuất PDF
(`@openfonts/inter_vietnamese`), KHÔNG phụ thuộc font cài trên server.

## 2. Nguồn dữ liệu

Y HỆT "Báo cáo kinh doanh theo tuần" — xem `bc-kinh-doanh-theo-tuan.md`
mục 2. KHÔNG cần VIEW/job đồng bộ riêng.

## 3. Các bước triển khai

1. Đã làm xong bước 1-2 ở `bc-kinh-doanh-theo-tuan.md` (VIEW + job đồng
   bộ domain `doanhthu_the_chinhanh`) — báo cáo này KHÔNG cần thêm gì ở
   tầng dữ liệu.
2. **(bản 11.26) `cd rp-server && npm install`** — thêm gói mới
   `@napi-rs/canvas` (vẽ sheet "Biểu đồ" khi "Xuất Excel", xem mục 1b) —
   BẮT BUỘC chạy lại `npm install` trước khi `pm2 restart rp-server`,
   nếu không báo cáo khác vẫn chạy bình thường nhưng "Xuất Excel" của
   ĐÚNG báo cáo này sẽ lỗi (thiếu module).
3. **Tạo báo cáo** — `node rp-server/scripts/seedKhachHangTuanReport.js`
   (đưa vào menu `reports-adhoc` = "Báo cáo MKT").
4. **Gán quyền xem** — Hệ thống → Phân quyền, gán quyền cho
   `bc-khach-hang-theo-tuan` (mặc định KHÔNG ai xem được).

## 4. Cách kiểm tra sau khi triển khai

Mở báo cáo "Báo cáo khách hàng theo tuần" (menu "Báo cáo MKT") — chọn 1
ngày đã có dữ liệu, đối chiếu Bill/AOV/Doanh số (TOTAL + qua thẻ) của 1-2
siêu thị với số liệu đội MKT đang tự tổng hợp tay. Lưu ý LFL chỉ CÓ SỐ
nếu domain đã có dữ liệu Lịch sử (DSMART16_EOM) trùng đúng tháng cùng kỳ
năm trước — nếu LFL luôn trống, kiểm tra lại job "...- Lịch sử
(DSMART16_EOM)" đã tạo/chạy xong chưa (xem `bc-kinh-doanh-theo-tuan.md`
mục 3, bước 1 — cần `--with-history`).

Bấm "Xuất Excel", mở file tải về — phải thấy ĐỦ 2 sheet ("Báo cáo" +
"Biểu đồ"), sheet "Biểu đồ" có 3 ảnh biểu đồ cột hiện ĐÚNG số khớp dòng
"TỔNG Mart"/"TỔNG Mini Mart" ở sheet "Báo cáo", chữ tiếng Việt hiển thị
đúng (không ô vuông/dấu hỏi — nếu lỗi font, kiểm tra lại bước 2 ở mục 3
đã `npm install` đủ gói `@napi-rs/canvas` chưa).
