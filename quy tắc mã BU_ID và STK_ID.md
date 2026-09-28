# Quy tắc mã BU_ID và STK_ID

File này là NGUỒN THAM CHIẾU DUY NHẤT cho việc lấy dữ liệu Giao dịch/Doanh
thu theo mã Điểm/BU_ID/STK_ID — **đối chiếu file này TRƯỚC khi sửa bất kỳ
logic nào** liên quan (rp-server/lib/compositeReportRunner.js,
rp-server/lib/diemStkMapping.js, bảng "Ánh xạ Điểm - STK_ID"). Mỗi khi có
thay đổi/phát hiện mới về quy tắc, PHẢI cập nhật lại file này trước, không
chỉ sửa code.

## Quy tắc đã xác nhận (nguyên văn người dùng, 28/9/2026)

1. Mã **BU_ID** là mã điểm, **KHÔNG THAY ĐỔI** theo thời gian (1 mã Điểm chỉ
   có 1 BU_ID duy nhất, dùng chung cho mọi kỳ — không tách cũ/mới).
2. Mã **STK Cũ**: xác định giao dịch, doanh thu trong **QUÁ KHỨ**.
3. Mã **STK Mới**: xác định giao dịch, doanh thu **HIỆN TẠI (live)**.
4. Khi lấy báo cáo doanh thu, **LUÔN hiển thị tên siêu thị** map với mã
   BU_ID đã cập nhật vào bảng "Ánh xạ Điểm - STK_ID" (file upload) — KHÔNG
   hiển thị mã trần, **kể cả khi CHƯA có giao dịch hiện tại (live)**.
5. File này là nguồn tham chiếu duy nhất — mỗi khi thay đổi, đối chiếu lại
   file này trước.

## Quy tắc đã xác nhận trước đó (phiên làm việc trước, không mâu thuẫn)

- Nếu `MaStkCu == MaStkMoi` (siêu thị chưa từng đổi kho): **VẪN có** dữ
  liệu giao dịch/doanh thu "cùng kỳ năm trước" bình thường.
- Nếu `MaStkCu != MaStkMoi` (đã đổi kho — đóng cửa/mở lại dưới kho mới):
  siêu thị coi như đã đổi điểm giao dịch — dữ liệu **QUÁ KHỨ bị loại hẳn**
  (không hiển thị "cùng kỳ năm trước"), CHỈ còn doanh thu/giao dịch
  **HIỆN TẠI**.

## Làm rõ 2 lớp "BU_ID" — TRÁNH NHẦM LẪN (28/9/2026)

Người dùng xác nhận trực tiếp: **"Mã điểm chính là mã BU_ID"** — đúng, về Ý
NGHĨA NGHIỆP VỤ, mã Điểm và BU_ID là MỘT khái niệm (khớp quy tắc 1 ở trên).
KHÔNG có mâu thuẫn với phần "Dữ liệu thật đã xác nhận bằng SQL" bên dưới —
2 lớp này khác NGỮ CẢNH, không khác NỘI DUNG:

- **BU_ID nghiệp vụ** = mã Điểm bạn dùng trong file chỉ tiêu, cột `MaDiem`
  của bảng "Ánh xạ Điểm - STK_ID" — vd `"217"`. Đây là cái người dùng gọi
  là "BU_ID". KHÔNG đổi theo thời gian.
- **Cột `BU_ID` vật lý trong bảng `TRANSHDR`** (CSDL DSMART16, hệ POS) —
  do chính phần mềm POS tự sinh, LƯU THÊM hậu tố `"00"` so với mã Điểm (vd
  `"21700"`) — đây là quy ước KỸ THUẬT riêng của DSMART16, KHÔNG phải do
  rp-server tự đặt ra hay đoán bừa, đã xác nhận bằng SQL thật (xem dưới).

Code phải DỊCH từ lớp vật lý (đọc thô từ TRANSHDR) về lớp nghiệp vụ (mã
Điểm, khớp `MaDiem` trong bảng ánh xạ) TRƯỚC khi ghép với khối Doanh
thu/Chỉ tiêu — đây là lý do tồn tại `buildBuIdLookup()`. Cột `BuId` (tuỳ
chọn) trong bảng ánh xạ **hầu như KHÔNG BAO GIỜ cần điền** — chỉ dùng khi 1
mã Điểm cụ thể có giá trị vật lý KHÔNG theo đúng quy tắc "+00" (ngoại lệ
hiếm, do lỗi khai báo phía POS).

## Dữ liệu thật đã xác nhận bằng SQL (28/9/2026)

- Bảng `TRANSHDR` (nguồn domain `giaodich_chinhanh`) **KHÔNG có cột
  `STK_ID`** — chỉ có `BU_ID`. Cột `STK_ID` chỉ tồn tại ở bảng `STRANS`
  (nguồn domain `doanhthu_chinhanh`).
- `BU_ID` **KHÔNG PHẢI** chuỗi giống mã Điểm — nó là mã Điểm + hậu tố `"00"`
  cố định (vd mã Điểm `"217"` → `BU_ID "21700"`, mã Điểm `"002"` →
  `BU_ID "00200"`) — xác nhận qua `SELECT DISTINCT h.BU_ID, d.STK_ID FROM
  STRANS d JOIN TRANSHDR h ON h.TRANS_NUM = d.TRANS_NUM WHERE d.STK_ID IN
  (...)`.
- Vì `TRANSHDR` không có `STK_ID`, **không có cách join trực tiếp để tách
  BU_ID theo "kỳ cũ/kỳ mới"** — khớp đúng quy tắc (1) ở trên: BU_ID là 1
  giá trị DUY NHẤT, ổn định, không tách theo kỳ.

## Kết luận thiết kế (áp dụng cho code)

- **BU_ID → mã Điểm**: dùng **1 quy tắc suy luận DUY NHẤT** (mã Điểm +
  `"00"`), có thể ghi đè tường minh qua **1 cột `BuId` DUY NHẤT** trong
  bảng "Ánh xạ Điểm - STK_ID" (KHÔNG tách `BuIdCu`/`BuIdMoi` theo kỳ —
  điều này đã làm SAI ở 1 bản code trước đó trong phiên này, đang được sửa
  lại đúng theo file này).
- **STK_ID → mã Điểm** (domain doanh thu): VẪN tách theo kỳ
  `MaStkCu`/`MaStkMoi` như thiết kế cũ — đây là chỗ THẬT SỰ có khái niệm
  "cũ/mới" (kho có thể đổi qua thời gian).
- **"Cùng kỳ năm trước" của Giao dịch** vẫn bị gate bởi `requireStkStability`
  (so sánh `MaStkCu` với `MaStkMoi` — nếu khác nhau, loại khỏi "cùng kỳ")
  dù bản thân BU_ID không đổi — vì gốc rễ quyết định "siêu thị có đổi điểm
  bán hay không" nằm ở STK (kho), không phải BU_ID.
- **Tên siêu thị hiển thị trên báo cáo**: LUÔN lấy từ `TenSieuThi` trong
  bảng "Ánh xạ Điểm - STK_ID" theo đúng mã Điểm (BU_ID đã dịch ngược),
  không phụ thuộc việc mã Điểm đó đã có dữ liệu Giao dịch hiện tại (live)
  hay chưa.
