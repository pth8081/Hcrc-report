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

### Vì sao có STK Cũ/STK Mới (xác nhận 28/9/2026, nguyên văn người dùng)

"Hậu tố là tôi định nghĩa, nên mã STK cũ và STK mới là do tôi tạo ra để
phân biệt hai điểm dùng chung một mã (BU_ID) nhưng khi tôi đóng cửa điểm
cũ tôi phải tạo ra mã STK mới để phân biệt với điểm cũ, và doanh thu/giao
dịch sẽ tính theo STK mới."

→ STK_ID (kho) và HẬU TỐ dùng để tạo mã STK **đều do CHÍNH NGƯỜI DÙNG tự
định nghĩa/tạo ra** (không phải DSMART, không phải rp-server suy luận) —
đúng khi 1 mã Điểm (BU_ID) đóng cửa rồi mở lại, người dùng tạo 1 STK_ID
MỚI (khác STK_ID CŨ) để phân biệt 2 giai đoạn của CÙNG 1 mã Điểm. Từ thời
điểm đó, doanh thu/giao dịch HIỆN TẠI tính theo STK MỚI — khớp đúng thiết
kế `MaStkMoi` (hiện tại) / `MaStkCu` (quá khứ, chỉ dùng khi
`MaStkCu == MaStkMoi`, tức điểm CHƯA từng đóng-mở lại).

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
thu/Chỉ tiêu — đây là lý do tồn tại `buildBuIdLookup()`. Cột `BuId` trong
bảng ánh xạ **BẮT BUỘC điền TƯỜNG MINH để mã Điểm đó có dữ liệu Giao
dịch** — xem mục "Bỏ hẳn quy tắc tự suy '+00'" bên dưới (28/9/2026, ghi đè
đoạn "hầu như không bao giờ cần điền" cũ).

## Chuỗi nguồn gốc dữ liệu — AI TẠO RA MÃ NÀO (xác nhận 28/9/2026)

Người dùng làm rõ thêm chiều quan hệ, SỬA LẠI cách diễn đạt sai ở mục trên
("BU_ID vật lý... do phần mềm POS tự sinh" dễ hiểu nhầm thành rp-server
tự suy đoán/tính toán — KHÔNG ĐÚNG tinh thần). Chuỗi đúng:

1. **BU_ID** — lấy THẲNG từ DSMART (hệ POS), là mã GỐC, nguồn phát sinh
   ĐẦU TIÊN. Không phải rp-server suy luận ra hậu tố "00" — đó là đúng
   nguyên văn giá trị DSMART gán, người dùng đọc được trực tiếp từ DSMART.
2. **Mã Điểm** = BU_ID đó — CỐ ĐỊNH, không đổi theo thời gian (khớp quy
   tắc 1). Đây là mã người dùng dùng xuyên suốt file chỉ tiêu/báo cáo.
3. **STK_ID** — do CHÍNH NGƯỜI DÙNG tự tạo ra, gắn theo từng mã Điểm
   (BU_ID), để chia nhỏ theo kho/ngành hàng khi cần quản lý (1 mã Điểm có
   thể có nhiều STK_ID) — đây là mã PHÁI SINH, người dùng tự quản lý qua
   bảng "Ánh xạ Điểm - STK_ID" (`MaStkCu`/`MaStkMoi`), KHÔNG phải DSMART
   cấp.

→ Thứ tự đúng: **DSMART cấp BU_ID → BU_ID = Mã Điểm (cố định) → người dùng
tự tạo STK_ID gắn theo Mã Điểm**. Quy tắc "+00" (mục dưới) chỉ là HÌNH THỨC
mã BU_ID mà DSMART thể hiện — dữ liệu GỐC đọc thẳng từ nguồn, không phải
công thức rp-server bịa ra. Cột `BuId` trong bảng ánh xạ tồn tại để chép
lại ĐÚNG giá trị gốc đó khi 1 mã Điểm không theo đúng hình thức "+00"
thường thấy — không phải "ghi đè quy tắc", mà là "chép đúng dữ liệu gốc".

## Bỏ hẳn quy tắc tự suy "+00" (xác nhận 28/9/2026, nguyên văn người dùng)

"Coi như bạn không lấy file ánh xạ STK của tôi để xử lý mà vẫn quy tắc 00
à? Đây không phải quy tắc mà do người tạo kho tạo mà" — người dùng chỉ rõ:
hậu tố "00" quan sát được qua các mẫu SQL đã kiểm tra (6 mã Điểm) **KHÔNG
PHẢI quy tắc DSMART công bố áp dụng chung cho MỌI mã Điểm** — chỉ là cách
người tạo kho ở NHỮNG điểm đó đặt ra, có thể KHÁC ở điểm khác. Tự động áp
dụng "+00" làm mặc định cho MỌI mã Điểm (kể cả mã CHƯA kiểm tra) có rủi ro
**SAI ÂM THẦM** (gộp nhầm doanh thu/giao dịch vào sai mã Điểm mà không ai
biết để kiểm tra lại) — nguy hiểm hơn hẳn hiện trống.

Được hỏi lại rõ ràng, người dùng CHỌN phương án an toàn: **KHÔNG suy đoán
— chỉ hiện dữ liệu Giao dịch khi có BU_ID thật (tường minh) trong bảng ánh
xạ.** Mã Điểm nào CHƯA khai `BuId` thì cột "Giao dịch" TRỐNG cho mã đó
(giống hành vi trước khi có tính năng này), CHỜ admin xác nhận đúng BU_ID
qua SQL thật (`SELECT DISTINCT h.BU_ID, d.STK_ID FROM STRANS d JOIN
TRANSHDR h ON h.TRANS_NUM = d.TRANS_NUM WHERE d.STK_ID IN (...)`, có thể
chạy 1 lần với TOÀN BỘ STK_ID trong `MaStkMoi` của mọi mã Điểm để lấy đủ
BU_ID 1 lượt, không cần kiểm tra từng mã 1) rồi điền vào bảng "Ánh xạ Điểm
- STK_ID". Đã bỏ hẳn `DEFAULT_BU_ID_SUFFIX = '00'` và logic tự suy trong
`buildBuIdLookup()` (rp-server/lib/diemStkMapping.js) — xem "Kết luận
thiết kế" bên dưới (đã cập nhật).

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

- **BU_ID → mã Điểm**: đọc **CHỈ từ 1 cột `BuId` DUY NHẤT**, tường minh,
  trong bảng "Ánh xạ Điểm - STK_ID" (KHÔNG tách `BuIdCu`/`BuIdMoi` theo kỳ
  — điều này đã làm SAI ở 1 bản code trước đó trong phiên này, đã sửa lại
  đúng theo file này). **KHÔNG còn tự suy "mã Điểm + 00"** khi để trống
  (đã bỏ hẳn, xem mục "Bỏ hẳn quy tắc tự suy '+00'" ở trên) — mã Điểm chưa
  khai `BuId` thì domain `giaodich_chinhanh` của mã đó KHÔNG khớp gì cả,
  rơi về "không có dữ liệu" (an toàn, không đoán bừa).
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
