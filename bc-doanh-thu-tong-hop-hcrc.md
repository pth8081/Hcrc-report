# Báo cáo `bc-doanh-thu-tong-hop-hcrc`/`bc-doanh-thu-tong-hop-ldtd` — "Báo cáo tổng hợp doanh thu siêu thị (HCRC)/(LĐTĐ)"

Tài liệu triển khai riêng cho báo cáo MỚI (bản 10.82, theo yêu cầu người
dùng, dựa trên file mẫu thật đội vận hành đang tự tổng hợp tay —
`Bao_cao_ban_Doanh_thu_hang_ngay_he_thong_HCRC_T11.2026.xlsx`, mỗi sheet 1
ngày trong tháng, mỗi dòng 1 siêu thị).

⚠️ **BẢN 11.7 — SỬA LỖI HIỆU NĂNG (lần 2): báo cáo VẪN CHẬM sau bản
11.4** (theo yêu cầu người dùng, báo cáo vẫn treo lâu ở "Đang lọc...").
Bản 11.4 chỉ sửa việc GỌI LẶP LẠI domain 3 lần — nhưng mỗi lượt gọi vẫn
đi qua cách PHÂN TRANG OFFSET/FETCH (mỗi trang là 1 truy vấn riêng, SQL
Server quét lại TỪ ĐẦU rồi skip offset ở MỖI LƯỢT) — mới là nguyên nhân
CHÍNH gây chậm cho domain lớn (`doanhthu_nganhhang`, cả năm có thể hàng
trăm nghìn dòng). Sửa `fetchRawRows()` đọc 1 truy vấn DUY NHẤT, không
OFFSET/FETCH — xem "VERSION.md" mục bản 11.7 (cùng loại sự cố đã gặp ở
domain tồn kho lớn, bản 9.83/9.87).

⚠️ **BẢN 11.6 — SỬA LỖI: Số Bill/Số giao dịch/DT bán buôn-lẻ/Lãi gộp bị
CỘNG GẤP ĐÔI ở những ngày Live và Lịch sử trùng nhau** (theo yêu cầu
người dùng — *"Số bill và số giao dịch bạn đang lấy sai... lấy ở chỗ
doanh thu cuối ngày của lãnh đạo tập đoàn là luôn đúng"*). Domain
`doanhthu_nganhhang`/`giaodich_chinhanh` được job "Live" VÀ job "Lịch
sử" CÙNG ghi — ràng buộc UNIQUE của `dwh.ReportFacts` chỉ chặn trùng
CÙNG 1 SourceSystem, không chặn trùng GIỮA 2 SourceSystem — nên 1 ngày
có thể có 2 dòng thật. "Doanh thu cuối ngày" dedupe đúng (giữ `SyncedAt`
mới nhất) từ trước; bản 11.4 (gộp hàm fetch-once về runner.js) BỎ QUÊN
bước này, cộng thẳng mọi dòng → SAI (cao hơn thực tế) ở ngày bị trùng.
Sửa `bucketByDay()` trong `lib/doanhThuTongHopHcrcRunner.js` thêm dedupe
— xem "VERSION.md" mục bản 11.6. Lỗi này đã có SẴN từ bản 10.87 ("Xuất
Excel theo tháng"), bản 11.4 vô tình lan ra cả web/Excel/PDF thường.

⚠️ **BẢN 11.5 — SỬA LỖI: KHÔNG THỂ khai `LoaiChuoi='KHO'` ở etl-admin**
(phát hiện khi người dùng hỏi "khai Kho ở chỗ nào" sau khi xem demo bản
11.4 không có nhóm Kho). Từ bản 10.99, trang "Ánh xạ Điểm - STK_ID" đã
ghi hướng dẫn khai `KHO` nhưng dropdown + validate phía server CHƯA TỪNG
chấp nhận giá trị này — **không ai khai được `KHO` trên thực tế cho tới
bản này**. Sửa `etl/lib/diemStkMappingImport.js` (`LOAI_CHUOI_HOP_LE`) +
`etl-admin/src/pages/DiemStkMappingPage.jsx` (thêm `<option value="KHO">`)
— xem "VERSION.md" mục bản 11.5. Từ bản này mới khai được thật, nhóm
"III. CHUỖI KHO" ở mục dưới mới có cơ hội xuất hiện.

⚠️ **BẢN 11.4 — Sửa chậm + thêm nhóm Mart/Mini Mart/Kho cho CẢ web/Xuất
Excel/Xuất PDF (không chỉ "Xuất Excel theo tháng")** (theo yêu cầu người
dùng — báo cáo chạy rất chậm, "Xuất file theo tháng" báo "Failed to
fetch", và xác nhận **"Cả 3 nơi luôn — web, Excel, PDF"** khi được hỏi áp
dụng nhóm Mart/Mini Mart/Kho ở đâu).

**Nguyên nhân chậm**: `lib/doanhThuTongHopHcrcRunner.js` (hàm chạy báo
cáo CHUNG cho cả web + Xuất Excel/PDF, xem mục 2 bên dưới) TRƯỚC ĐÂY fetch
domain `doanhthu_nganhhang`/`giaodich_chinhanh` RIÊNG 3 LẦN (khối Ngày/
Tháng/Năm — mỗi lần 1 lượt gọi DWH + phân trang riêng), dù khối Năm (rộng
nhất) ĐÃ CHỨA SẴN toàn bộ dữ liệu khối Ngày/Tháng (cùng neo "hôm nay") —
dư 2/3 số lượt gọi không cần thiết, ngày càng chậm khi DWH tích luỹ nhiều
tháng.

**Sửa**: áp ĐÚNG mẫu fetch-1-lần-gom-theo-ngày đã chạy ổn ở "Xuất Excel
theo tháng" (bản 10.87) vào `doanhThuTongHopHcrcRunner.js` — fetch raw
rows mỗi domain CHỈ 1 lần (đầu năm → hôm nay), gom theo ngày trong bộ
nhớ, cắt lại cho Ngày/Tháng/Năm (không gọi DWH thêm) — công thức tính
GIỮ NGUYÊN, chỉ đổi cách lấy dữ liệu. Đồng thời ÁP DỤNG THÊM nhóm "I.
CHUỖI MART"/"II. CHUỖI MINIMART"/"III. CHUỖI KHO" + dòng "TỔNG <nhóm>"/
"Tổng cộng" (trước chỉ có ở "Xuất Excel theo tháng", bản 10.87/10.99) cho
CẢ báo cáo xem trên web lẫn "Xuất Excel"/"Xuất PDF" thường — vì cả 3 nơi
đều gọi CHUNG đúng 1 hàm `runDoanhThuTongHopHcrcReport()` (xem
`routes/reports.js`), không cần sửa gì thêm ở `DataTable.jsx`/
`exportExcel.js`/`exportPdf.js` (đã sẵn hiểu cờ `__isSectionHeader`/
`__isSubtotal`/`__isGrandTotal` từ trước). Các hàm nhóm/fetch-1-lần
(`groupRowsByChain`/`buildSubtotalRow`/`buildGroupedRows`/
`fetchRawRows`/`bucketByDay`/...) gộp về `doanhThuTongHopHcrcRunner.js`
làm nguồn chung — `doanhThuTongHopHcrcMonthlyExport.js` nay IMPORT LẠI từ
đó thay vì định nghĩa riêng.

**Triển khai**: `git pull origin main` rồi khởi động lại `rp-server` —
KHÔNG cần chạy script seed nào (không đổi `DefinitionJson` lưu CSDL).

**Kiểm tra**: mở báo cáo trên web — thấy nhóm MART/MINIMART/KHO (nếu có
mã Điểm khai `LoaiChuoi='KHO'`) + dòng "TỔNG <nhóm>"/"Tổng cộng", tải
nhanh hơn rõ rệt; "Xuất Excel"/"Xuất PDF" thường (KHÔNG phải "Xuất Excel
theo tháng") của báo cáo này cũng ra ĐÚNG cấu trúc nhóm đó; "Xuất file
theo tháng" không còn lỗi "Failed to fetch". Số liệu từng siêu thị PHẢI Y
HỆT bản trước bản này (chỉ đổi cách lấy dữ liệu + thêm nhóm, không đổi
công thức).

⚠️ **BẢN 11.0 — Thêm khối "TỔNG HỢP THEO LOẠI HÌNH" cuối mỗi sheet**
(theo yêu cầu người dùng — *"làm phần tổng cộng theo hàng ngày mart, mini
mart, kho, tổng là được"*, xác nhận thêm vào CUỐI mỗi sheet của "Xuất
Excel theo tháng" đang có, KHÔNG tạo báo cáo riêng). Sau toàn bộ danh sách
từng siêu thị + nhóm MART/MINIMART/KHO + dòng "TỔNG HCRC" (bản 10.87/
10.99), mỗi sheet có thêm 1 khối tóm tắt ở cuối — tiêu đề "TỔNG HỢP THEO
LOẠI HÌNH", 4 dòng **Mart / Mini Mart / Kho / Tổng cộng** — nhắc lại ĐÚNG
số liệu các dòng "TỔNG MART"/"TỔNG MINIMART"/"TỔNG KHO"/"TỔNG HCRC" đã
tính ở trên (KHÔNG tính lại — dùng chung object đã tính, tránh lệch số
giữa 2 chỗ), chỉ đổi nhãn ngắn gọn hơn, gộp liền nhau để xem nhanh không
phải cuộn tìm rải rác theo từng nhóm.

**Sửa**: `lib/doanhThuTongHopHcrcMonthlyExport.js` —
`buildGroupedSheetRows()` giữ lại các dòng tổng đã tính (`recapRows`),
thêm khối mới ở cuối mảng rows mỗi sheet.

**Triển khai**: `git pull origin main` rồi khởi động lại `rp-server`
(không cần script/VIEW mới).

**Kiểm tra**: bấm "Xuất Excel theo tháng" — cuối mỗi sheet (sau "TỔNG
HCRC") có thêm khối "TỔNG HỢP THEO LOẠI HÌNH" với 4 dòng Mart/Mini Mart/
Kho/Tổng cộng, số liệu khớp đúng các dòng "TỔNG MART"/"TỔNG MINIMART"/
"TỔNG KHO"/"TỔNG HCRC" ở phần trên cùng sheet đó.

⚠️ **BẢN 10.99 (SỬA bản 10.98) — Thêm nhóm "III. CHUỖI KHO" vào "Xuất Excel
theo tháng"**. Bản 10.98 từng dựng NHẦM 1 báo cáo RIÊNG "Doanh thu Bán
buôn theo loại hình" để đáp ứng yêu cầu "tách doanh thu mart, mini mart,
kho, tổng" — người dùng chỉ ra đây là HIỂU SAI: yêu cầu thật là thêm nhóm
**"CHUỖI KHO"** vào ĐÚNG tính năng "Xuất Excel theo tháng" đã có (bản
10.87), khớp đúng file mẫu thật `Bao_cao_ban_Doanh_thu_hang_ngay_he_thong_HCRC_T11.2026.xlsx`
người dùng gửi lại (ảnh/file xác nhận: Nhóm "I. CHUỖI MART" → dòng "TỔNG
MART", 2 dòng "KHO INTIMEX"/"KHO ĐTT" → dòng "TỔNG KHO", Nhóm "VI. CHUỖI
MINIMART" → dòng "TỔNG MINIMART", cuối cùng "TỔNG HCRC").

**Nguyên nhân 3 dòng Kho = 0 ở bản 10.87**: KHÔNG phải vì DSMART16 không
có dữ liệu Kho — chỉ vì file mẫu LÚC ĐÓ chưa khai `LoaiChuoi='KHO'` cho
đúng mã Điểm của 2 kho này ở "Ánh xạ Điểm - STK_ID", nên rơi vào nhóm
"CHƯA PHÂN NHÓM" (ẩn, không tách riêng). Đã xác nhận lại với người dùng
(bản 10.99): **2 kho này CÓ Mã Điểm/STK_ID thật trong DSMART16**.

**Sửa**: `lib/doanhThuTongHopHcrcMonthlyExport.js` — `GROUP_ORDER` thêm
`'KHO'` (trước chỉ `['MART', 'MINIMART']`) + màu riêng cho section. Cơ chế
nhóm/dòng tổng (`groupRowsByChain`/`buildSubtotalRow`/`buildGroupedSheetRows`)
ĐÃ CÓ SẴN từ bản 10.87, generic theo `GROUP_ORDER` — KHÔNG cần viết lại
logic nhóm, chỉ cần thêm đúng 1 giá trị vào danh sách.

**Triển khai**: `git pull origin main` rồi khởi động lại `rp-server`
(KHÔNG cần script/VIEW mới). Admin cần: khai `LoaiChuoi='KHO'` (chữ hoa,
không dấu) ở etl-admin → "Ánh xạ Điểm - STK_ID" cho ĐÚNG mã Điểm của từng
kho — mã Điểm nào chưa khai LoaiChuoi (dù MART/MINIMART/KHO) vẫn rơi vào
nhóm "CHƯA PHÂN NHÓM" như cũ, không tự suy đoán.

**Kiểm tra**: bấm "Xuất Excel theo tháng (1 sheet/ngày)" — mỗi sheet có
đủ 3 nhóm "I. CHUỖI MART"/"... CHUỖI MINIMART"/"... CHUỖI KHO" (số La Mã
tự tăng theo thứ tự `GROUP_ORDER`), mỗi nhóm có dòng "TỔNG <nhóm>", và
"TỔNG HCRC" ở cuối = tổng cả 3 nhóm.

## 1. Báo cáo này làm gì

Mỗi dòng = 1 siêu thị (mã Điểm), hiển thị **3 KHỐI SỐ LIỆU CÙNG LÚC** tính
từ ĐÚNG 1 ngày được chọn ("ngày neo"):

- **Khối Ngày** — số liệu ĐÚNG ngày đó: Số Bill, DT Bán buôn/Bán lẻ/Tổng
  cộng, Lãi gộp, Tỉ lệ lãi gộp/DT, DT bán lẻ bình quân/Bill, DT bán lẻ
  bình quân/m² — kèm Kế hoạch DT/Bill **CỦA CẢ THÁNG** (xác nhận với người
  dùng — khớp đúng số liệu mẫu, kế hoạch không tách riêng theo từng ngày),
  Kế hoạch TB giỏ hàng (= Kế hoạch DT / Kế hoạch Bill), % Hoàn thành DT
  luỹ kế tháng, và **Dự kiến hoàn thành kế hoạch** (dự báo — xác nhận với
  người dùng: `(DT luỹ kế tháng / số ngày đã qua) × tổng số ngày trong
  tháng`, so với Kế hoạch DT tháng).
- **Khối Tháng** — cộng dồn từ đầu tháng tới ngày đó (cùng các số liệu
  như khối Ngày, trừ phần Kế hoạch).
- **Khối Năm** — cộng dồn từ đầu năm tới ngày đó (không có Lãi gộp, theo
  đúng file mẫu).
- **KH luỹ kế năm** — Kế hoạch DT của CẢ NĂM + % hoàn thành (DT luỹ kế năm
  / Kế hoạch DT năm).

Kèm thông tin tĩnh mỗi siêu thị: Mã QLKV, Mã điểm, Mã ST/CH (STK_ID),
Tên siêu thị, Nhóm chuỗi (MART/MINIMART), Diện tích, Địa điểm, **Số lượng
nhân sự** (xem công thức ĐÃ SỬA ở bản 10.95 ngay dưới đây).

⚠️ **BẢN 10.93 — SỬA LỖI "Số lượng nhân sự" luôn = 0 (lần 1)**. Nguyên
nhân: TRƯỚC ĐÂY đếm theo `app.UserStoreAccess` — bảng này CHỈ có dòng
khi Admin CHỦ ĐỘNG giới hạn phạm vi xem dữ liệu của 1 người (mặc định
MỌI tài khoản "xem được toàn bộ", không có dòng nào ở bảng này) — gần
như luôn RỖNG trong thực tế. Đổi sang đếm theo `app.Users.Department`
(đồng bộ từ HCRC Workspace) + suy ra Mã Điểm qua
`resolveMaDiemForDepartment()` + bảng "Ánh xạ Phòng ban → Siêu thị"
(`rp-server/routes/users.js`, `/system-department-mapping`) — admin tự
khai các Department không khớp thẳng tên siêu thị.

⚠️ **BẢN 10.95 — SỬA LỖI "Số lượng nhân sự" vẫn = 0 (lần 2)**, theo xác
nhận trực tiếp của người dùng: *"ai tôi cho xem báo cáo tôi mới active
rồi, nên mặc định tài khoản chưa active"*. Nguyên nhân: bản 10.93 vẫn
lọc `WHERE IsActive = 1` — nhưng `IsActive` CHỈ có nghĩa "được admin cấp
quyền ĐĂNG NHẬP xem báo cáo", HOÀN TOÀN KHÁC "đang làm việc hay không" —
tài khoản mới đồng bộ từ HWS luôn mặc định `IsActive = 0` (admin phải tự
bấm "Mở khoá"), nên TUYỆT ĐẠI ĐA SỐ nhân viên siêu thị (không cần đăng
nhập xem báo cáo) MÃI MÃI bị lọc loại, dù đang làm việc bình thường. Sửa
sang đếm theo "còn xuất hiện trong danh bạ HWS ở **lần đồng bộ gần
nhất**" (`LastSyncedAt` so với `MAX(LastSyncedAt)`, xem chú thích đầy đủ
ở `lib/doanhThuTongHopHcrcRunner.js`) — KHÔNG còn phụ thuộc `IsActive`.

⚠️ **Phạm vi bản 10.82 — CHỈ phần XEM TRÊN WEB** (bảng số liệu, không
phân trang, có nhóm cột màu Ngày/Tháng/Năm/KH luỹ kế giống Excel/PDF).
**Phase 2 — xuất Excel 1 sheet/ngày — đã làm ở BẢN 10.87**, xem mục ghi
chú riêng bên dưới.

⚠️ **BẢN 10.94 (SỬA bản 10.92) — "KH doanh thu" khối năm = CỘNG DỒN Chỉ
tiêu THÁNG đã có, BỎ chỗ nhập Chỉ tiêu cả năm riêng** (theo yêu cầu người
dùng: *"chỗ KH doanh thu thì bạn cộng dồn theo tháng đã có target doanh
thu tháng LĐTĐ và HCRC cho từng ST/CH rồi nên không cần thêm phần upload
mới (bỏ đi) và cộng dồn đến tháng hiện tại"*).

**Bản 10.92 trước đó** đã thêm 2 trang/2 domain Chỉ tiêu CẢ NĂM riêng
(`sales-targets-hcrc-year`/`sales-targets-ldtd-year`) để sửa lỗi "KH luỹ
kế năm" sai ("% hoàn thành" ra số vô lý vd 33828%, do tra nhầm domain
THÁNG với kỳ "cả năm") — nhưng người dùng cho biết **Chỉ tiêu THÁNG đã
nhập đủ cho từng ST/CH ở 2 domain tháng sẵn có** (`sales-targets-hcrc`/
`sales-targets-ldtd`), không cần nhập thêm số "cả năm" riêng.

**Giải pháp đúng (bản 10.94)** — **ĐÃ BỎ HẲN** 2 trang/2 domain Chỉ tiêu
cả năm của bản 10.92. "KH doanh thu" (khối năm) giờ = **CỘNG DỒN Chỉ
tiêu THÁNG** (đúng domain `sales-targets-hcrc`/`sales-targets-ldtd` sẵn
có) **từ ĐẦU NĂM tới ĐÚNG THÁNG HIỆN TẠI** (không phải cả 12 tháng, cũng
không phải chỉ 1 tháng) — dùng NGUYÊN cơ chế cộng dồn nhiều kỳ có sẵn của
`runSalesTargetsBlockRange()`/`aggregateTargetRowsByEntity()`
(`rp-server/lib/salesTargetsReader.js`, vốn đã cộng dồn đúng cho khối
"Tháng"/"Năm" của DOANH THU THẬT từ trước — chỉ cần đổi khoảng truyền
vào cho Chỉ tiêu, không cần domain/bảng/trang nhập nào mới).

⚠️ **BẢN 10.90 — TÁCH 2 BÁO CÁO HCRC/LĐTĐ + sửa công thức "Tổng cộng"**
(theo yêu cầu người dùng, kèm ảnh mẫu đối chiếu công thức). **2 báo cáo
RIÊNG, CÙNG dữ liệu doanh thu/siêu thị, CHỈ khác nguồn Chỉ tiêu** (giống
hệt cách đã tách "Doanh thu theo ngành hàng"/"(LDTD)" trước đó):
- `bc-doanh-thu-tong-hop-hcrc` — "Báo cáo tổng hợp doanh thu siêu thị
  (HCRC)" — Chỉ tiêu đọc domain `sales-targets-hcrc` (như cũ).
- `bc-doanh-thu-tong-hop-ldtd` (MỚI) — "Báo cáo tổng hợp doanh thu siêu
  thị (LĐTĐ)" — Chỉ tiêu đọc domain `sales-targets-ldtd` (Chỉ tiêu của
  Lãnh đạo Tập đoàn, nhập ở etl-admin → "Chỉ tiêu Lãnh đạo Tập đoàn").

`definition.targetDomain` (DefinitionJson) quyết định domain Chỉ tiêu nào
được đọc — `lib/doanhThuTongHopHcrcRunner.js`/`doanhThuTongHopHcrcMonthlyExport.js`
đều nhận tham số này (mặc định `sales-targets-hcrc` nếu không khai, giữ
đúng hành vi báo cáo HCRC cũ). Route `export-month` cũng đổi sang kiểm
tra theo `SourceType='doanhThuTongHopHcrc'` (không hardcode 1 ReportId cố
định nữa) để cả 2 báo cáo đều xuất được.

**Cột "Tổng cộng"** — đối chiếu ảnh mẫu người dùng gửi (công thức ghi rõ
"5=3+4") — đổi sang TÍNH TRỰC TIẾP `DT bán buôn + DT bán lẻ` (trước đây
lấy thẳng `measures.DoanhThu` từ domain, có thể lệch nếu domain tính
thêm thành phần khác ngoài buôn/lẻ) — áp dụng cả 3 khối Ngày/Tháng/Năm, cả
Phase 1 lẫn Phase 2.

⚠️ **BẢN 10.86 — ĐỔI NGUỒN DOANH THU** (theo đề xuất người dùng, triển
khai thật trên server phát hiện vẫn CHƯA có số liệu cho tới khi làm thêm
VIEW/job mới — người dùng chỉ ra domain `doanhthu_nganhhang` ĐÃ CÓ SẴN và
ĐANG CHẠY thật sự tách Bán buôn/Bán lẻ rồi, dùng luôn cho nhanh): **BỎ**
VIEW `vw_DoanhThuTongHopHCRC`/domain `doanhthu_tonghop_hcrc` — báo cáo
GIỜ ĐÂY tái dùng 2 domain ĐÃ CÓ SẴN (`doanhthu_chinhanh` cho Diện
tích/Nhóm chuỗi, `doanhthu_nganhhang` cho Bán buôn/Bán lẻ/Lãi gộp, cộng
dồn bỏ chiều ngành hàng). **KHÔNG CẦN tạo VIEW mới/job đồng bộ mới nữa**
— xem lại mục 2/3 bên dưới. Cột "Địa điểm" (STOCK.PLACE) CHƯA có domain
nào cung cấp, TẠM để trống (null) — sẽ bổ sung sau nếu người dùng cần,
không chặn số liệu Doanh thu/Lãi gộp/Bán buôn-lẻ chính.

⚠️ **BẢN 10.87 — THÊM "Xuất Excel theo tháng (1 sheet/ngày)"** (Phase 2,
theo yêu cầu người dùng — "tháng nào 29 thì 29 sheet, tháng nào 30 thì 30
sheet... ngày 17/11 thì 17 sheet"). Nút MỚI "Xuất Excel theo tháng (1
sheet/ngày)" chỉ hiện ở trang xem báo cáo này — bấm ra 1 file .xlsx,
**số SHEET = đúng số ngày từ đầu tháng tới "ngày neo"** (giá trị đang chọn
ở bộ lọc "Ngày báo cáo", mặc định hôm nay) — KHÔNG cố định 31 sheet như
file mẫu gốc người dùng gửi (file mẫu có cả sheet "31.11" dù tháng 11 chỉ
30 ngày, toàn bộ số liệu dòng đó = 0 — là sheet THỪA giữ lại khi người
dùng tự copy từ 1 tháng 31 ngày trước đó, không phải dữ liệu thật — bản
này KHÔNG lặp lại lỗi/phần thừa đó).

Mỗi sheet tên `DD.MM` (vd `17.11`), đúng cấu trúc file mẫu:
- Nhóm **"I. CHUỖI MART"** — các siêu thị `Nhóm chuỗi = MART` — dòng
  **"TỔNG MART"** (cộng dồn đúng các đo lường thô rồi TÍNH LẠI tỉ lệ/bình
  quân từ tổng đó, KHÔNG lấy trung bình cộng các tỉ lệ từng dòng).
- Nhóm **"II. CHUỖI MINIMART"** tương tự — dòng **"TỔNG MINIMART"**.
- Dòng **"TỔNG HCRC"** (cộng cả 2 nhóm).
- Cột "TT" đánh số LẠI từ 1 ở mỗi nhóm (khớp đúng file mẫu).

**KHÔNG đưa vào** 3 dòng "KHO INTIMEX"/"KHO ĐTT"/"TỔNG KHO" có trong file
mẫu gốc — kiểm tra kỹ file mẫu thấy CẢ 3 dòng này LUÔN = 0 ở MỌI cột MỌI
ngày (không có domain/bảng dữ liệu nào trong hệ thống biết tới các dòng
"kho" này — người dùng tự gõ tay/giữ chỗ trong file thủ công trước đây).
Nếu cần thêm lại, báo lại để bổ sung (vd luôn ghi 0 cứng, hoặc đọc từ 1
nguồn dữ liệu cụ thể nếu có).

**Hiệu năng**: KHÔNG gọi lại Data Warehouse riêng cho từng ngày (tránh
hàng chục lượt gọi/lần xuất) — chỉ gọi 1 LẦN cho mỗi domain (khoảng rộng
nhất: đầu năm → ngày neo), gộp nhóm theo ngày NGAY TRONG BỘ NHỚ rồi tính
từng sheet — xem `rp-server/lib/doanhThuTongHopHcrcMonthlyExport.js`.

**Triển khai**: không cần VIEW/job gì thêm (tái dùng đúng nguồn dữ liệu
bản 10.86) — chỉ cần `git pull` + build lại `rp-user` (route mới
`POST /api/reports/bc-doanh-thu-tong-hop-hcrc/export-month`, không cần
chạy script seed nào).

**Kiểm tra**: bấm nút "Xuất Excel theo tháng (1 sheet/ngày)" ở ngày neo
bất kỳ (vd 17/11) — file tải về phải có ĐÚNG 17 sheet tên `01.11` tới
`17.11`, mỗi sheet có đủ nhóm MART/MINIMART + dòng Tổng, số liệu khớp
đúng số xem được trên web (Phase 1) khi đổi "Ngày báo cáo" sang ngày
tương ứng từng sheet.

## 2. Nguồn dữ liệu

- **Doanh thu/Lãi gộp/Bán buôn-lẻ** (từ bản 10.86): dùng lại NGUYÊN domain
  `doanhthu_nganhhang` ĐÃ CÓ SẴN (đang chạy thật, dùng cho báo cáo "Doanh
  thu theo ngành hàng") — gộp theo (STK_ID, DEPT_ID, ngày), bộ máy báo cáo
  (`doanhThuTongHopHcrcRunner.js`) CỘNG DỒN THÊM 1 bước bỏ chiều DEPT_ID
  để ra đúng 1 dòng/siêu thị. KHÔNG tạo VIEW/job mới (ĐÃ BỎ VIEW
  `vw_DoanhThuTongHopHCRC`/domain `doanhthu_tonghop_hcrc` của bản 10.82).
- **Diện tích/Nhóm chuỗi**: dùng lại NGUYÊN domain `doanhthu_chinhanh` đã
  có (chỉ lấy dimension `dienTich`/`chain`, không lấy đo lường doanh thu
  của domain này — số doanh thu lấy từ `doanhthu_nganhhang` ở trên).
- **Số Bill**: dùng lại NGUYÊN domain `giaodich_chinhanh` đã có (KHÔNG
  tạo gì mới).
- **Chỉ tiêu (Kế hoạch DT/Bill)**: dùng lại NGUYÊN domain `sales-targets-hcrc`
  đã có cho báo cáo "Doanh thu cuối ngày" (theo yêu cầu người dùng — dùng
  chung, không nhập Chỉ tiêu riêng).
- **Số lượng nhân sự**: đếm trực tiếp từ `app.UserStoreAccess` (CSDL RP,
  KHÔNG qua ETL/DSMART16) — số tài khoản được gán quyền xem mỗi mã Điểm.
- **Mã QLKV**: cột MỚI admin tự khai ở etl-admin → "Ánh xạ Điểm - STK_ID"
  (`etl.DiemStkMapping.MaQLKV`, giống cách `TenSieuThi`/`LoaiChuoi` đã
  được khai tay ở đó — KHÔNG đọc từ DSMART16). `LoaiChuoi` đã khai tay ở
  đó LUÔN ưu tiên ghi đè cột "Nhóm chuỗi" lấy từ `doanhthu_chinhanh` (theo
  đúng quy ước có sẵn của `lib/diemStkMapping.js`).

**Bộ máy chạy báo cáo**: `rp-server/lib/doanhThuTongHopHcrcRunner.js`
(SourceType MỚI `'doanhThuTongHopHcrc'`, đăng ký ở `lib/reportRunner.js`)
— KHÔNG dùng `lib/compositeReportRunner.js` (báo cáo đó chỉ hiểu "1 khối
= 1 khoảng ngày người dùng chọn", trong khi báo cáo này cần 3 khối Ngày/
Tháng/Năm tính SONG SONG từ 1 ngày neo) — nhưng TÁI DÙNG tối đa các hàm
phụ trợ đã có của file đó (`fetchAllReportRows`/`aggregateDailyRowsByEntity`)
và của `lib/diemStkMapping.js` (`remapRowsToDiem`/`buildBuIdLookup`).

## 3. Các bước triển khai (theo đúng thứ tự)

⚠️ **Từ bản 10.86** — 2 bước "tạo VIEW mới"/"tạo job đồng bộ mới" của bản
10.82 KHÔNG CÒN CẦN NỮA (đã đổi sang tái dùng domain `doanhthu_nganhhang`/
`doanhthu_chinhanh` có sẵn, đang chạy thật) — CHỈ cần cập nhật code +
chạy lại bước tạo báo cáo. Nếu bạn ĐÃ LỠ tạo job "Doanh thu tổng hợp
HCRC - Live (DSMART16)" ở etl-admin (bản 10.82) thì XOÁ job đó đi (không
dùng tới nữa, để tránh nhầm lẫn job thừa), KHÔNG cần chạy VIEW SQL của
bản 10.82 (file vẫn còn trong repo để tham khảo nếu sau này cần lại).

| # | Việc | Ai làm |
|---|---|---|
⚠️ **Từ bản 10.94** — nếu server ĐÃ LỠ chạy qua bản 10.92 (2 trang "Chỉ
tiêu cả năm"), chạy lại `etl-db/schema.sql` sẽ TỰ DỌN quyền thừa (2 trang
đó không còn route/menu nào nữa, dữ liệu CŨ đã nhập ở 2 domain
`sales-targets-hcrc-year`/`sales-targets-ldtd-year` (nếu có) ĐƠN GIẢN
KHÔNG CÒN ĐƯỢC ĐỌC NỮA, không cần xoá tay — không ảnh hưởng gì).

| # | Việc | Ai làm |
|---|---|---|
| 1 | Chạy `etl-db/schema.sql` trên CSDL ETL (an toàn chạy lại nhiều lần) — thêm cột `MaQLKV` vào `etl.DiemStkMapping` | DBA/IT |
| 2 | `git pull origin main` — lấy code mới nhất | IT/Dev |
| 3 | Khởi động lại `etl` + build lại `etl-admin` (bỏ 2 trang Chỉ tiêu cả năm của bản 10.92) | IT/Dev |
| 4 | Chạy `node rp-server/scripts/seedDoanhThuTongHopHcrcReport.js [menuCode]` (thư mục `rp-server/`) — **TẠO CẢ 2 báo cáo** (HCRC + LĐTĐ), mặc định đặt ở menu `reports-kinh-doanh` | Admin rp-user / IT-Dev |
| 5 | Vào Hệ thống → Phân quyền, gán quyền xem RIÊNG cho `bc-doanh-thu-tong-hop-hcrc` VÀ `bc-doanh-thu-tong-hop-ldtd` (có thể cấp khác nhau — vd chỉ lãnh đạo tập đoàn xem được báo cáo LĐTĐ) | Admin rp-user |
| 6 | (TUỲ CHỌN, khuyến nghị) Vào etl-admin → "Ánh xạ Điểm - STK_ID" → điền cột "Mã QLKV" cho các mã Điểm cần nhóm theo khu vực quản lý | Admin etl-admin |
| 7 | Chỉ tiêu THÁNG (domain `sales-targets-hcrc`/`sales-targets-ldtd`) PHẢI ĐÃ NHẬP ĐỦ cho từng ST/CH, từng tháng từ đầu năm tới tháng hiện tại — "KH doanh thu" (khối năm) chỉ cộng dồn đúng những gì đã nhập ở đây, KHÔNG có chỗ nhập riêng nào khác | Admin etl-admin (đúng nhóm phụ trách Chỉ tiêu) |

## 4. Cách kiểm tra sau khi triển khai xong

Mở báo cáo, để nguyên ngày mặc định (hôm nay) hoặc chọn 1 ngày bất kỳ đã
có doanh thu — mỗi siêu thị phải ra đủ 3 khối Ngày/Tháng/Năm, số liệu
Tháng/Năm PHẢI LỚN HƠN HOẶC BẰNG số liệu Ngày (luỹ kế từ đầu kỳ). Nếu đã
khai Chỉ tiêu cho mã Điểm/tháng đó, cột "Kế hoạch DT" phải ra đúng số đã
nhập (KHÔNG rỗng) và "% Hoàn thành DT luỹ kế" phải tính được.

Nếu CHƯA khai `MaQLKV`/`LoaiChuoi` cho 1 mã Điểm, 2 cột đó hiện rỗng —
bình thường, không phải lỗi.

**Riêng cho bản 10.90**: mở CẢ 2 báo cáo "(HCRC)"/"(LĐTĐ)" cùng 1 ngày —
mọi cột DOANH THU (Số Bill/DT bán buôn/bán lẻ/Tổng cộng/Lãi gộp...) phải
RA Y HỆT NHAU ở cả 2 báo cáo (cùng nguồn dữ liệu siêu thị); CHỈ cột
"Kế hoạch DT"/"Kế hoạch Bill"/"KH doanh thu"/"% hoàn thành" được PHÉP
khác nhau (2 nguồn Chỉ tiêu riêng biệt) — nếu 2 báo cáo ra SỐ DOANH THU
khác nhau là có lỗi, báo lại ngay.

**Riêng cho bản 10.94**: khối "KH luỹ kế năm", cột "KH doanh thu" phải
ra ĐÚNG = TỔNG Chỉ tiêu THÁNG (`sales-targets-hcrc`/`sales-targets-ldtd`)
của mã Điểm đó từ tháng 1 tới ĐÚNG tháng hiện tại (vd đang ở tháng 11 →
cộng Chỉ tiêu tháng 1-11, KHÔNG cộng tháng 12), "% hoàn thành" phải là
SỐ HỢP LÝ (vài chục %). Thiếu Chỉ tiêu THÁNG của 1 mã Điểm ở BẤT KỲ
tháng nào trong khoảng đó → "KH doanh thu" của mã Điểm đó bị THIẾU đúng
phần tháng chưa nhập (không rỗng hẳn nếu còn tháng khác đã nhập) — không
phải lỗi, chỉ cần nhập bổ sung đủ Chỉ tiêu THÁNG còn thiếu.
