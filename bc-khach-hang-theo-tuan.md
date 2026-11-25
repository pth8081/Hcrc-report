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
  thức (Mart/Mini Mart/Kho), Tên CH — **Mã CH đứng TRƯỚC Mã điểm** (khác
  thứ tự MĐ-trước-MK của "Báo cáo kinh doanh theo tuần").
- Vẫn nhóm theo Hình thức (I. CHUỖI MART/II. CHUỖI MINIMART) + dòng
  "TỔNG <nhóm>"/"Tổng cộng" — giống báo cáo kia.
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

## 2. Nguồn dữ liệu

Y HỆT "Báo cáo kinh doanh theo tuần" — xem `bc-kinh-doanh-theo-tuan.md`
mục 2. KHÔNG cần VIEW/job đồng bộ riêng.

## 3. Các bước triển khai

1. Đã làm xong bước 1-2 ở `bc-kinh-doanh-theo-tuan.md` (VIEW + job đồng
   bộ domain `doanhthu_the_chinhanh`) — báo cáo này KHÔNG cần thêm gì ở
   tầng dữ liệu.
2. **Tạo báo cáo** — `node rp-server/scripts/seedKhachHangTuanReport.js`
   (đưa vào menu `reports-adhoc` = "Báo cáo MKT").
3. **Gán quyền xem** — Hệ thống → Phân quyền, gán quyền cho
   `bc-khach-hang-theo-tuan` (mặc định KHÔNG ai xem được).

## 4. Cách kiểm tra sau khi triển khai

Mở báo cáo "Báo cáo khách hàng theo tuần" (menu "Báo cáo MKT") — chọn 1
ngày đã có dữ liệu, đối chiếu Bill/AOV/Doanh số (TOTAL + qua thẻ) của 1-2
siêu thị với số liệu đội MKT đang tự tổng hợp tay. Lưu ý LFL chỉ CÓ SỐ
nếu domain đã có dữ liệu Lịch sử (DSMART16_EOM) trùng đúng tháng cùng kỳ
năm trước — nếu LFL luôn trống, kiểm tra lại job "...- Lịch sử
(DSMART16_EOM)" đã tạo/chạy xong chưa (xem `bc-kinh-doanh-theo-tuan.md`
mục 3, bước 1 — cần `--with-history`).
