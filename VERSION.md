# Phiên bản

Phiên bản chung của toàn bộ hệ thống HCRC (ETL, Data Warehouse, Report
Server, API Server và các giao diện quản trị) — tăng ở mỗi lần merge vào
`main`.

**QUY TẮC ĐÁNH SỐ (áp dụng từ phiên bản 4.1 trở đi)**: CHỈ 2 SỐ, dạng
`X.Y` — mỗi lần merge tăng `Y` thêm 1; khi `Y` chạm `9`, lần merge KẾ TIẾP
tăng `X` thêm 1 và `Y` VỀ LẠI `0` (vd `4.9` → lần sau là `5.0`, `5.9` →
lần sau là `6.0`). KHÔNG còn số thứ 3 (patch) — mọi thay đổi, dù nhỏ hay
lớn, đều tăng `Y` (hoặc `X` khi tràn) đúng 1 nấc, không phân biệt patch/
minor/major như quy tắc semver cũ.
Các mục **0.1.0 → 0.41.0** bên dưới là LỊCH SỬ theo quy tắc CŨ (semver
không chặt: patch/minor/major), GIỮ NGUYÊN không đánh số lại — `0.41.0`
(gần nhất theo quy tắc cũ) tương ứng **`4.1`** theo quy tắc mới, là điểm
bắt đầu đếm tiếp từ đây.

**TỰ ĐỘNG, không cần nhắc**: mọi lần merge vào `main` PHẢI kèm 1 mục mới ở
đây trong CÙNG một lượt (đọc số mới nhất bên dưới, tự tăng theo quy tắc
trên, tự viết tóm tắt thay đổi) — không đợi người dùng yêu cầu riêng, không
hỏi lại số tiếp theo là gì.

**TỰ ĐỘNG, không cần nhắc (từ bản 8.31, theo yêu cầu người dùng 03/10/2026,
tới khi người dùng bảo dừng)**: mọi lần merge PHẢI kèm thêm 1 mục mới ở
ĐẦU file `deploy/Nhật ký triển khai (từ bản 8.31).md` — tóm tắt CÁC BƯỚC
triển khai thật trên server (lệnh chạy, file cần sửa tay, thứ tự làm),
không chỉ mô tả tính năng như mục ở trên. KHÔNG thay thế việc vẫn tạo file
riêng `deploy/Cập nhật bản X.Y — ....md` cho từng bản như trước giờ. (File
gộp này ban đầu tạo ở bản 8.36 ghi "từ bản 8.34"; đã lùi mốc về đúng bản
8.31 theo yêu cầu người dùng, đổi tên file + bổ sung đủ 3 mục 8.31-8.33.)

**SỬA SỐ bản 9.100-9.103 → 10.0-10.3 (theo yêu cầu người dùng, phát hiện
đánh số sai quy tắc)**: `Y` đã vô tình được đếm như số NGUYÊN không giới
hạn (9.95 → 9.96 → ... → 9.99 → 9.100 → 9.101...) thay vì áp dụng ĐÚNG quy
tắc tràn ở trên — mốc tràn (`Y` chạm "9" lặp lại, ở đây là `99`) phải lập
tức tăng `X` lên `10` và `Y` VỀ `0`, giống hệt cách `4.9 → 5.0` đã làm
trước đó. Đã đổi lại TOÀN BỘ tham chiếu "`9.100`"/"`9.101`"/"`9.102`"/
"`9.103`" thành "`10.0`"/"`10.1`"/"`10.2`"/"`10.3`" trong file này, nhật
ký triển khai, và mọi chú thích code/tài liệu liên quan — CHỈ sửa CÁCH
GHI SỐ (đổi tên hiển thị), KHÔNG đổi bất kỳ nội dung/hành vi nào đã làm.
Lịch sử Git (nội dung commit message cũ) vẫn còn ghi "Bản 9.100"/"9.10x"
(không sửa lại lịch sử Git) — coi 2 cách gọi này là ĐỒNG NHẤT 1 bản,
không phải 2 bản khác nhau.

## 10.22 — SỬA bản 10.21: PDF 2 báo cáo gốc đổi hẳn màu CORPORATE + chữ nét hơn cho 2 báo cáo Thành viên

**Theo yêu cầu người dùng** (phản hồi ngay sau khi xem demo bản 10.21):
"báo cáo cuối ngày hcrc (HO) và báo cáo cuối ngày LĐTD (HO) chuyển sang
mẫu báo cáo mới giống web và excel mà... chỉ có bản PDF báo cáo cuối ngày
HCRC (thành viên) và LDTD (Thành viên) là không thay đổi nhưng hai báo
cáo này làm chữ nét hơn lên nhé" — bản 10.21 mới chỉ thêm khối thẻ tổng
doanh thu lên TRÊN bảng chi tiết, còn CHÍNH bảng chi tiết của PDF 2 báo
cáo gốc vẫn giữ nguyên bảng màu CŨ (xanh lá/cam/vàng/tím) — **thiếu sót**,
không khớp đúng demo đã gửi (bảng màu CORPORATE navy/vàng đồng).

**Đã sửa**:
- `scripts/seedLdtdHcrcReports.js`: `legacyPdfColors` đổi từ cứng `true`
  cho cả 4 báo cáo sang `legacyPdfColors: !pdfSummaryCards` — 2 báo cáo
  GỐC (`pdfSummaryCards: true`) giờ PDF dùng bảng màu CORPORATE (khớp
  đúng web/Excel), 2 báo cáo "(Thành viên)" (`pdfSummaryCards: false`)
  PDF giữ NGUYÊN bảng màu cũ như trước (không đổi gì thêm ngoài font).
- `lib/exportPdf.js`: nhúng thêm font Inter weight 500 (medium, trước chỉ
  có 400/700) — dòng dữ liệu THƯỜNG (không phải Tổng cộng, vốn đã đậm) của
  2 báo cáo "(Thành viên)" (nhánh `useLegacyColors`) đổi từ regular sang
  medium — "nét hơn" như yêu cầu, không đậm bằng bold để còn phân biệt rõ
  dòng Tổng cộng.

Verify: mock test lại cả 4 báo cáo PDF (render ảnh xem trực tiếp) — 2 báo
cáo gốc đúng bảng màu navy/vàng đồng + khối thẻ, vẫn đúng 1 trang A4; 2
báo cáo Thành viên đúng bảng màu cũ (không đổi), không có khối thẻ, chữ
dữ liệu rõ hơn. Excel/web/email KHÔNG đổi gì thêm (đã đúng từ bản 10.21).

## 10.21 — Thêm khối "thẻ tổng doanh thu" cho 4 báo cáo Doanh thu cuối ngày

**Theo yêu cầu người dùng**: "Bạn tìm cho mình một cái báo cáo nó mang
tính hiện đại hơn, nó thể hiện được cái doanh thu của tổng, doanh thu của
Minimart và doanh thu của Mart nó rõ ràng hơn, không phải nhìn vào một cái
dòng... màu sắc hiện đại, giống các cái đơn vị tổ chức quốc tế tài chính"
— demo nhiều vòng qua Artifact (dữ liệu mẫu, rồi dữ liệu THẬT từ file PDF
người dùng gửi — 34 cửa hàng, cả báo cáo gộp cột đo chiều rộng theo nội
dung thật tránh cắt chữ) trước khi code.

**Đã làm**: thêm khối 3 thẻ "Tổng doanh thu toàn hệ thống"/"Doanh thu khối
MART"/"Doanh thu khối MINIMART" phía TRÊN bảng chi tiết (giữ nguyên hoàn
toàn, không đổi gì) — mỗi thẻ hiện doanh thu thực đạt to/rõ, kèm % đạt chỉ
tiêu, mũi tên so cùng kỳ (▲ xanh/▼ đỏ) — tông màu navy/vàng đồng "kiểu báo
cáo tài chính quốc tế", tách biệt hẳn bảng màu xanh lá/cam/vàng/tím của
bảng chi tiết. Hàm dùng chung `computeSummaryCards()`
(`rp-server/lib/reportCellFormat.js`) đọc lại đúng 3 dòng "Tổng cộng"/
"Tổng cộng MART"/"Tổng cộng MINIMART" đã có sẵn trong báo cáo (không tính
lại/không truy vấn gì thêm) — dùng CHUNG cho cả 4 kênh xuất, tránh lệch số.

Phạm vi áp dụng (theo đúng yêu cầu người dùng):
- **Web + Excel + email** — CẢ 4 báo cáo (LDTD/HCRC gốc + "(Thành viên)").
- **PDF** — CHỈ 2 báo cáo GỐC (`bc-doanh-thu-ldtd`/`bc-doanh-thu-hcrc`).
  2 báo cáo "(Thành viên)" **giữ nguyên PDF như cũ** (chưa có khối thẻ),
  để làm sau — PDF vẫn đúng 1 trang A4 (khối thẻ CÓ chiều cao cố định,
  trừ thẳng vào ngân sách chiều cao TRƯỚC khi dò cỡ chữ bảng chi tiết ở
  `lib/exportPdf.js`, test với đúng 34 dòng dữ liệu thật vẫn thoải mái).

**Sửa 1 lỗi thật phát sinh trong lúc code** (phát hiện qua render PDF thử,
chưa tới tay người dùng): dòng "Chỉ tiêu: ..." trong thẻ PDF ban đầu đè
lên số doanh thu lớn phía trên (tính sai khoảng cách giữa 3 dòng chữ
tuyệt đối theo toạ độ) — đã sửa lại offset, verify bằng render + nhìn ảnh
thật, không còn chồng chữ.

Verify: mock test (dữ liệu thật 34 cửa hàng) cho cả 4 kênh — web (dựng
app thật + Playwright), Excel (LibreOffice render), PDF cả 2 trường hợp
(so sánh `pdftotext` xác nhận PDF "(Thành viên)" giống hệt bản CHƯA có
summaryCards — đúng yêu cầu "giữ nguyên"), email HTML (Playwright). Build
sạch `rp-user`.

## 10.20 — Nâng cấp UI/UX chuyên nghiệp hơn + rà soát responsive mobile 5.0"-6.8"

**Theo yêu cầu người dùng**: "Bạn rà soát lại ba giao diện quản trị ETL
admin, API admin và report. Xem lại UI UX và responsive đối với các màn
hình 5.0, 6.3, 6.7 và 6.8 mobile... Nâng cấp UI UX cho chuyên nghiệp hơn
đi."

**Đã làm**: dựng cả 3 app bằng dev server thật + Playwright (mock API,
không cần CSDL) ở 4 kích thước đại diện 360/390/414/430px CSS (tương ứng
5.0"/6.3"/6.7"/6.8") — chụp lại login, danh sách/bảng dữ liệu, modal,
sidebar di động của nhiều trang. Không phát hiện tràn ngang (đã sửa hết từ
các bản trước), nhưng phát hiện giao diện NHÌN THIẾU CHUYÊN NGHIỆP — form/
bảng nổi trần trực tiếp trên nền xám, không có ranh giới thị giác rõ ràng,
`<h2>` ở etl-admin/api-admin rơi về kiểu mặc định trình duyệt (không khớp
hệ thống chữ chung).

Nâng cấp CSS dùng chung cho cả 3 app (giữ nguyên màu thương hiệu riêng
từng app — tím etl-admin/xanh lá api-admin/cam rp-user):
- Form (`.inline-form`/`.stacked-form`/`.filter-form`) và bảng dữ liệu
  (`.table-scroll`) có khung thẻ bo tròn + viền + bóng nhẹ, thay vì nổi
  trần trên nền trang.
- Input/select/textarea bo tròn hơn (4px→8px), viền sáng theo màu thương
  hiệu khi đang gõ (focus) — trước đây không phân biệt rõ ô đang focus.
- Nút bấm bo tròn hơn, tăng vùng chạm gần mức khuyến nghị 44px (padding
  7px 14px → 9px 16px), đổ bóng nhẹ + hiệu ứng bấm xuống.
- Thêm `h2`/`h4` còn thiếu ở etl-admin/api-admin (rp-user đã có từ
  trước) — đồng bộ cả 3 app.
- **Sửa 1 lỗi thật phát sinh TRONG QUÁ TRÌNH nâng cấp**: thêm
  `white-space: nowrap` cho nút (tránh chữ bị ngắt giữa từ, vd "Kiểm tra
  kết nối" từng vỡ 2 dòng) để lộ ra `.inline-actions`/`.modal-actions`
  THIẾU `flex-wrap: wrap` từ trước — khiến hàng nút TRÀN ra ngoài khung
  trên màn hình hẹp thay vì tự xuống dòng. Đã thêm `flex-wrap: wrap`.
- Nút ☰ mở menu di động tăng vùng chạm (padding 4px 8px → 10px 12px).
- Hàng bảng sáng nhẹ khi rê/chạm (`tbody tr:hover`).
- KHÔNG đổi cấu trúc bảng báo cáo chính của rp-user (`.table-scroll--report`,
  sticky header/cột nhiều dòng tiêu đề) — rủi ro lệch dòng cao, chỉ chỉnh
  khoảng cách/hover ở mức an toàn.

Verify: build sạch cả 3 app; quét lại TOÀN BỘ 4 kích thước × nhiều trang
bằng Playwright — không còn trang nào tràn ngang; demo ảnh gửi người dùng
xác nhận trước khi merge.

## 10.19 — SỬA LỖI THẬT: modal (vd "Gán quyền") bị bảng dữ liệu phía sau xuyên thủng lên trên, trên mobile

**Theo yêu cầu người dùng**: chụp màn hình trang "Vai trò" (etl-admin)
trên điện thoại — modal "Gán quyền" hiện chữ/nút của BẢNG "Vai trò" phía
sau đè chồng lộn xộn lên trên bảng quyền ("Trang"/"Xem"/"Sửa-Xoá"), không
đọc/thao tác được. Khác HẲN lỗi đã sửa ở bản 10.8 (modal không phủ toàn
màn hình) — modal ở đây ĐÃ render qua Portal đúng, nằm đúng vị trí cuối
`<body>`.

**Nguyên nhân thật**: `.modal` (CSS dùng chung 3 app) không khai
`z-index` (mặc định = `auto`), trong khi 2 cột GHIM CỐ ĐỊNH của
`DataTable` khi cuộn ngang trên mobile (nút Sửa/Xoá bên phải, checkbox
chọn dòng bên trái — bản 9.05/8.62) có `z-index: 1` riêng. Theo đúng quy
tắc CSS, phần tử có z-index CỤ THỂ (dù chỉ 1) LUÔN vẽ đè lên phần tử
z-index:auto, BẤT KỂ thứ tự DOM — nên 2 cột ghim của bảng "Vai trò" phía
sau (đang hiển thị dưới lớp nền mờ của modal) xuyên thủng lên trên modal,
dù modal đã nằm sau nó trong DOM. Lỗi áp dụng cho MỌI modal mở trên MỌI
trang có bảng dữ liệu cuộn ngang phía sau — không riêng trang "Vai trò".

**Đã sửa**: thêm `z-index: 100` vào `.modal` (`etl-admin`/`api-admin`/
`rp-user` — đều dùng chung 1 quy ước CSS) — cao hơn MỌI z-index khác đã
có trong cả 3 app (cao nhất trước đó là 60). Xem chi tiết + ghi chú lâu
dài trong `CLAUDE.md` (bổ sung vào mục quy ước modal Portal bản 10.8).

Verify: dựng lại ĐÚNG trang "Vai trò" bằng dev server thật + Playwright
(mock API, không cần CSDL) ở khung hình điện thoại 390×844, tái hiện
ĐÚNG lỗi người dùng chụp (xác nhận bug có thật trong code, không phải do
bản deploy cũ) — sau khi thêm `z-index: 100`, chụp lại: modal "Gán
quyền" hiện sạch sẽ, không còn bị bảng phía sau xuyên qua; `elementFromPoint`
xác nhận `.modal` luôn là phần tử trên cùng tại mọi điểm trong vùng modal.
`npm run build` sạch cả 3 app.

## 10.18 — SỬA bản 10.17: báo cáo HCRC/LDTD phải lấy đúng Chỉ tiêu hàng ngày theo TỪNG nguồn riêng

**Theo yêu cầu người dùng**: "Cái này phải áp dụng cho phần báo cáo doanh
thu ngành hàng HCRC và báo cáo doanh thu ngành hàng lãnh đạo tập đoàn.
Nếu chọn theo doanh thu ngành hàng lãnh đạo tập đoàn thì phải lấy thông
tin từ cái chỉ tiêu doanh thu hàng ngày của lãnh đạo tập đoàn. Nếu chọn
là doanh thu ngành hàng HCRC thì phải lấy cái chỉ tiêu doanh thu hàng
ngày của HCRC" — bản 10.17 lỡ đọc CỐ ĐỊNH domain "Chỉ tiêu HCRC" cho dòng
"Tổng cộng" của CẢ 2 báo cáo "Doanh thu theo ngành hàng" (HCRC) và "(LDTD)",
đúng ra mỗi báo cáo phải lấy đúng nguồn Chỉ tiêu hàng ngày RIÊNG của mình.

**Đã sửa**: `rp-server/lib/nganhHangBrgRunner.js` — chọn domain Chỉ tiêu
hàng ngày theo ĐÚNG `targetDomain` của báo cáo đang chạy: báo cáo HCRC
(`sales-targets-nganhhang-dt`) đọc "Chỉ tiêu HCRC" (`sales-targets-hcrc`),
báo cáo LDTD (`sales-targets-nganhhang-dt-ldtd`) đọc "Chỉ tiêu Lãnh đạo
Tập đoàn" (`sales-targets-ldtd`) — 2 nguồn hoàn toàn độc lập, không còn
dùng chung 1 nguồn như bản 10.17.

Verify: demo PDF bằng dữ liệu giả lập, chạy ĐÚNG hàm thật đã sửa — chọn
CÙNG 1 siêu thị ở 2 báo cáo cho ra 2 số Chỉ tiêu KHÁC NHAU đúng theo từng
nguồn (đã gửi người dùng xác nhận trước khi merge); mock test 11/11 PASS
(bổ sung case LDTD vào `node --check` + test cũ của bản 10.17).

## 10.17 — Doanh thu theo ngành hàng: dòng "Tổng cộng" lấy Chỉ tiêu theo "Chỉ tiêu HCRC" khi chọn siêu thị

**Theo yêu cầu người dùng** (tiếp nối yêu cầu lớn tạm dừng ở bản 10.1):
"chọn siêu thị thì sẽ lấy chỉ tiêu theo siêu thị ở phần chỉ tiêu doanh
thu hàng ngày" cho báo cáo "Doanh thu theo ngành hàng" — xác nhận dùng
nguồn **HCRC** (không phải Lãnh đạo Tập đoàn), chỉ áp dụng ở dòng "Tổng
cộng", và khi chọn nhiều siêu thị thì CỘNG DỒN.

**Đã làm**: `rp-server/lib/nganhHangBrgRunner.js` — khi người dùng chọn 1
hoặc nhiều siêu thị ở bộ lọc riêng của 1 khối (BRG/LFL/NSO), dòng "Tổng
cộng" của ĐÚNG khối đó lấy Chỉ tiêu Tổng = Chỉ tiêu HCRC
(`sales-targets-hcrc`) của (các) siêu thị đã chọn, thay cho cộng các
dòng ngành hàng. Cột "Chỉ tiêu — Bán lẻ"/"Bán buôn" của dòng Tổng cộng về
"—" khi override kích hoạt (nguồn HCRC không tách kênh). KHÔNG chọn siêu
thị nào → GIỮ NGUYÊN hành vi cũ. Các dòng ngành hàng không bị ảnh hưởng.
Áp dụng cho CẢ 2 báo cáo dùng chung runner này (HCRC lẫn LDTD).

Chi tiết nghiệp vụ, verify: xem mục 19 file
`báo cáo doanh thu-nhập hàng theo ngành hàng.md`.

## 10.16 — SỬA LỖI THẬT: "Trạng thái kết nối"/"Giám sát Log CSDL" đồng loạt báo lỗi "not a function"

**Theo yêu cầu người dùng**: "Tự nhiên lỗi một loạt, bạn kiểm tra giúp" —
kèm ảnh hàng loạt dòng "Lỗi kiểm tra" cùng 1 thời điểm (15:00:07
27/10/2026), cùng 1 nội dung lỗi, cho RẤT NHIỀU nguồn khác nhau — bao gồm
cả 2 CSDL LÕI của chính hệ thống (`HCRC_DWH`, `HCRC_ETL`), không chỉ riêng
vài máy chủ chi nhánh DSMART16 — xác nhận đây KHÔNG PHẢI lỗi của 1 vài
nguồn cụ thể mà là lỗi hệ thống của tính năng "Giám sát Log CSDL" (bản
10.5).

**Nguyên nhân**: `etl/lib/logSpaceMonitor.js` dùng
`sys.dm_db_log_space_usage()` — hàm hệ thống này chỉ hoạt động đúng khi
CSDL có COMPATIBILITY LEVEL >= 130 (SQL Server 2016). Ban đầu nghi ngờ
"bản SQL Server cũ" nhưng đã xác nhận lại với người dùng: engine SQL
Server THẬT đang dùng là **bản 2019** (đủ mới) — nguyên nhân thật là
COMPATIBILITY LEVEL (cấu hình RIÊNG theo từng CSDL, KHÔNG tự nâng theo
bản engine — rất hay gặp khi CSDL được restore/migrate từ hệ thống cũ
sang máy chủ mới mà không đổi lại mức này) của các CSDL đang kiểm tra
(cả CSDL lõi lẫn máy chủ DSMART16 chi nhánh) vẫn đang giữ mức CŨ (< 130),
khiến object này không được nhận diện đúng là hàm dù engine hỗ trợ — lỗi
xảy ra ĐỒNG LOẠT, đúng khớp triệu chứng.

**Đã sửa**: thử `sys.dm_db_log_space_usage()` TRƯỚC (giữ nguyên lợi ích
chỉ cần quyền VIEW DATABASE STATE cho CSDL nào ĐÃ nâng compatibility
level) — gặp đúng lỗi "not a function"/"Invalid object name" thì TỰ ĐỘNG
chuyển sang `DBCC SQLPERF(LOGSPACE)` (lệnh LEGACY, hoạt động trên MỌI
phiên bản/compatibility level SQL Server, không bị giới hạn này) — tự lọc
đúng dòng của CSDL đang kiểm tra trong kết quả trả về (DBCC trả cả server,
không riêng 1 CSDL như DMF). Lỗi KHÁC (vd sai mật khẩu, mất kết nối) vẫn
báo nguyên như cũ, KHÔNG âm thầm chuyển sang DBCC.

**Lưu ý đánh đổi quyền**: `DBCC SQLPERF(LOGSPACE)` thường cần quyền VIEW
SERVER STATE (cấp INSTANCE, rộng hơn VIEW DATABASE STATE mà DMF cần) — máy
chủ nào SAU KHI đã thử cả 2 cách vẫn còn lỗi, nhiều khả năng do tài khoản
kết nối THIẾU quyền này; lỗi trả về lúc đó sẽ RÕ RÀNG (không còn câu khó
hiểu "not a function"), admin tự biết cần cấp thêm quyền gì.

Verify: mock test (giả lập `mssql.ConnectionPool` theo 3 kịch bản — DMF
hoạt động/DMF báo "not a function"/DMF báo lỗi khác) — 8 assertion: DMF
hoạt động bình thường thì KHÔNG gọi fallback; DMF báo đúng lỗi "not a
function" thì TỰ ĐỘNG gọi `DBCC SQLPERF(LOGSPACE)`; lỗi KHÁC không kích
hoạt fallback — PASS 8/8; `node --check` qua.

## 10.15 — SỬA LỖI THẬT: thu hồi voucher Fuji luôn báo lỗi 500 ("OUTPUT clause without INTO clause")

**Theo yêu cầu người dùng**: "Hệ thống fuji thu hồi voucher đang báo lỗi
ntn bạn xem điều chỉnh lại phần redeem cho fuji" — kèm ảnh log lỗi lặp lại
liên tục (nhiều lượt trong ngày) cho `POST /api/v1/vouchers/fuji/redeem`.

**Nguyên nhân (xác định được chính xác từ nguyên văn lỗi SQL Server trong
log)**: *"The target table 'PMCRDINF' of the DML statement cannot have any
enabled triggers if the statement contains an OUTPUT clause without INTO
clause."* — đây là giới hạn CỦA SQL SERVER: KHÔNG được dùng `OUTPUT ...`
(không có `INTO`) trên câu UPDATE/INSERT/DELETE nếu bảng đích đang có BẤT
KỲ trigger nào đang BẬT, bất kể trigger đó làm gì. CSDL Fuji có bật ít
nhất 1 trigger trên bảng `PMCRDINF` (CSDL HCRC gốc không có trigger này,
nên trước đây chưa từng gặp lỗi) — khớp đúng thread troubleshooting lỗi
403 trước đó (đã loại trừ hết nguyên nhân cấu hình quyền/IP, hoá ra lỗi
nằm Ở BƯỚC SAU, lúc redeem thật chạy câu UPDATE).

**Đã sửa**: đổi câu `UPDATE ... OUTPUT INSERTED.col AS alias WHERE ...`
thành `UPDATE ... OUTPUT INSERTED.col INTO @bảng_biến_tạm WHERE ...; SELECT
... FROM @bảng_biến_tạm;` — giới hạn trên CHỈ áp dụng khi OUTPUT trả thẳng
ra client, KHÔNG áp dụng khi ghi vào bảng biến tạm, nên né được hoàn toàn
mà KHÔNG cần đổi/biết gì về trigger phía Fuji. Áp dụng cho:
- `api-server/lib/voucherRedeemService.js` (`redeemVoucher()`) — lỗi
  người dùng báo.
- `api-server/lib/realtimeWriteEngine.js` (`runRedeem()`, engine endpoint
  ghi tổng quát admin tự cấu hình bảng qua api-admin) — CÙNG lỗi tiềm ẩn
  cho BẤT KỲ bảng đối tác nào có trigger, sửa trước phòng ngừa dù chưa có
  báo cáo lỗi (cùng kỹ thuật, cùng rủi ro).

Không đổi kiểu dữ liệu trả về (`DECIMAL(18,2)`/`NVARCHAR(50)` khớp đúng
kiểu cột đích cuối cùng ở `api.VoucherRedemptions`/kiểu tham số so khớp —
không mất thêm độ chính xác nào so với trước). Không cần DBA/đối tác làm
gì — sửa hoàn toàn ở tầng ứng dụng.

Verify: mock test (giả lập pool trả lỗi/kết quả theo đúng câu SQL mới) —
8 assertion: câu UPDATE không còn `OUTPUT` trần trước `WHERE`, có đúng
`OUTPUT ... INTO @Updated` + `DECLARE @Updated TABLE`, kết quả
`redeemVoucher()`/`runRedeem()` vẫn parse đúng y hệt trước (không đổi
hành vi) — PASS cả 2 file; `node --check` qua.

## 10.14 — ETL: 5 mục "Chỉ tiêu" bắt buộc quyền SỬA mới thấy (giống 4 mục "Cấu hình khác")

**Theo yêu cầu người dùng**: "không phải chỉ xem các mục chỉ tiêu đâu, cho
phép phân quyền để up chỉ tiêu ấy. Và sửa giống 4 mục kia kìa." — sau khi
tôi báo hạ tầng phân quyền (trang "Vai trò") đã đủ 2 cấp Xem/Sửa cho cả 9
mục, người dùng phản hồi muốn 5 mục "Chỉ tiêu" hoạt động CHẶT giống 4 mục
"Cấu hình khác" (Ánh xạ Điểm/Siêu thị NSO/Danh sách hàng Core/Cảnh báo
hàng tồn): không còn mức "chỉ xem" riêng, PHẢI có quyền SỬA mới thấy mục
đó trên sidebar — tránh hiểu nhầm cấp quyền "Xem" là đã cho nhập được.

**Đã sửa** (`etl-admin/src/components/Layout.jsx`): thêm `editOnly: true`
cho 5 mục trong nhóm "Chỉ tiêu" (`sales-targets-corp`, `sales-targets-hcrc`,
`sales-targets-nganhhang-dt`, `sales-targets-nganhhang-nh`,
`sales-targets-nganhhang-dt-ldtd`) — y hệt cách 4 mục "Cấu hình khác" đã
làm từ trước. Từ bản này, admin PHẢI tick "Sửa" (không phải "Xem") ở trang
"Vai trò" thì người được gán mới thấy đúng mục chỉ tiêu đó trên sidebar VÀ
thấy được form "Nhập chỉ tiêu" (form upload vốn đã ẩn/hiện theo đúng quyền
Sửa từ trước, không đổi gì ở `SalesTargetsPage.jsx`).

**Lưu ý**: nếu trước đây có vai trò nào chỉ được tick "Xem" (không "Sửa")
cho 1 trong 5 mục này, sau khi deploy họ sẽ KHÔNG còn thấy mục đó trên
sidebar nữa — cần vào "Vai trò" tick thêm "Sửa" nếu vẫn muốn họ truy cập
được.

Verify: build thật `Layout.jsx` (esbuild, mock `useAuth` trả về role chỉ
có quyền Xem cho 2 mục chỉ tiêu) + Playwright — xác nhận nhóm "Chỉ tiêu"
không còn hiện trên sidebar khi role đó không có quyền Sửa; `npm run build`
qua không lỗi.

## 10.13 — Bỏ cột "Mã siêu thị" thừa ở trang "Chỉ tiêu Nhập hàng theo ngành hàng"

**Theo yêu cầu người dùng**: "chỗ nhập chỉ tiêu ngành hàng nhập ... tôi chỉ
cần 3 cột thôi, là mã hàng này, tháng này, mã ngành này và chỉ tiêu thôi.
Trong file này có thêm mã siêu thị, bật bỏ đi không cần thiết mã siêu thị
đâu. Ngành hàng làm gì có mã siêu thị."

**Nguyên nhân**: trang "Chỉ tiêu Nhập hàng theo ngành hàng"
(`sales-targets-nganhhang-nh`) dùng chung component với "Chỉ tiêu Doanh
thu theo ngành hàng"/"(LDTD)" nhưng từ bản 9.85 CHƯA được đánh dấu
`isNganhHangOnly` (etl-admin) và CHƯA bật `genericNoStoreCode=true` ở
route backend (`etl/server.js`) như 2 trang kia — khiến file mẫu/xuất Excel
vẫn còn cột `MaSieuThi` thừa, và nhãn cột trên giao diện hiện "Mã siêu
thị" thay vì "Mã ngành hàng".

**Đã sửa**: thêm `'sales-targets-nganhhang-nh'` vào `isNganhHangOnly`
(`etl-admin/src/pages/SalesTargetsPage.jsx`) + thêm `true` (tham số
`genericNoStoreCode`) vào route `/admin/sales-targets-nganhhang-nh`
(`etl/server.js`). File mẫu/"Xuất Excel" giờ CHỈ còn đúng 3 cột:
`Thang`, `MaNganhHang`, `ChiTieuGiaTriNhap`. Nhãn cột/placeholder trên
giao diện đổi "Mã siêu thị" → "Mã ngành hàng".

**Lưu ý dữ liệu đã nhập trước đây**: 1 số dòng chỉ tiêu "nh" hiện có trong
CSDL (mã 1001/1002/2001/2002, ngày 2026-10-01) có vẻ ĐÃ bị nhập NHẦM bằng
file mẫu của trang "Doanh thu theo ngành hàng" (có các trường
`ChiTieuDoanhThuBanLe/BanBuon/LaiGop...` thay vì đúng `ChiTieuGiaTriNhap`)
— do hệ thống không chặn tên cột lạ lúc nhập. Những dòng này cần người
dùng tự xoá (đã có sẵn chọn nhiều + xoá hàng loạt trên trang) rồi nhập lại
bằng file mẫu MỚI (bấm "Tải file mẫu" sau khi deploy bản này).

Verify: gọi trực tiếp hàm sinh file mẫu thật (`buildGenericTemplate`,
`etl/lib/salesTargetsImport.js`) với `noStoreCode: true`, đọc lại bằng
`exceljs` — xác nhận đúng 3 cột header `Thang/MaNganhHang/ChiTieuGiaTriNhap`,
không còn `MaSieuThi`; `node --check` + `npm run build` (etl-admin) qua
không lỗi.

## 10.12 — Sửa lại SAI ý nghĩa mã giao dịch 130/133/330/333 (6 báo cáo Mua hàng)

**Theo yêu cầu người dùng**: "Bạn xem bạn đang dùng ở bảng nào nhỉ? Bởi vì
là khi tôi lấy báo cáo ấy, thì đặt hàng thì tôi chỉ lấy được đặt hàng của
mua riêng, mà nhập hàng thì tôi chỉ lấy được nhập hàng của mua chung" →
sau khi kiểm tra code và báo lại, người dùng xác nhận lại đúng: *"130 là
đặt hàng mua riêng. 133 là nhập hàng mua riêng. 330 là đặt hàng mua chung.
333 là nhập hàng mua chung."*

**Lỗi cũ (bản 9.27)**: gán NHẦM `133` cũng là mã ĐẶT HÀNG (trùng vai trò
với `130`) — khiến kênh "mua riêng" KHÔNG CÓ mã nhập hàng nào cả. Báo cáo
"Đơn nhập hàng"/"Giá trị nhập hàng theo đơn" trước bản này chỉ lọc
`transCode: ['333']` nên CHỈ RA được dữ liệu mua chung — đúng khớp triệu
chứng người dùng báo.

**Đã sửa**: `TRANS_CODE_DAT = ['130','330']` (mã ĐẶT, cả 2 kênh),
`TRANS_CODE_NHAP = ['133','333']` (mã NHẬP, cả 2 kênh), `KENH_MUA_CODES =
{ rieng: ['130','133'], chung: ['330','333'] }` (`rp-server/lib/
purchaseOrderRunner.js`) — và đổi `transCode` của 4 báo cáo: "Đơn đặt
hàng"/"Giá trị đặt hàng theo đơn" → `['130','330']`, "Đơn nhập hàng"/"Giá
trị nhập hàng theo đơn" → `['133','333']` (`rp-server/scripts/
seedPurchaseOrderReports.js`). "So sánh đặt–nhận"/"So sánh giá trị đặt–nhập
theo NCC" KHÔNG đổi code (đã gộp cả 4 mã từ trước, chỉ đổi Ý NGHĨA phân
loại đặt/nhận theo đúng hằng số mới ở trên). VIEW nguồn
(`dbo.vw_DonDatHangChiNhanh`) KHÔNG cần sửa/chạy lại — đã SELECT nguyên
`TRANS_CODE` thô từ trước, chỉ sửa cách DIỄN GIẢI ở tầng ứng dụng. Cập
nhật lại tài liệu `bc-don-dat-hang.md` (mục 5b mới) + hint bộ lọc "Kênh
mua".

**QUAN TRỌNG**: phải chạy lại `node scripts/seedPurchaseOrderReports.js`
sau khi deploy code — 4 báo cáo trên đã LƯU SẴN `transCode` CŨ (sai) trong
CSDL (`app.ReportCatalog.DefinitionJson`), sửa code nguồn không tự cập
nhật lại các dòng đã lưu; script idempotent, an toàn chạy lại.

Verify: mock test `rp-server/lib/purchaseOrderRunner.js` (giả lập 4 dòng
giao dịch 130/133/330/333 CÙNG 1 đơn) — 7 assertion: "Đơn đặt hàng" đủ 2
dòng (130+330), "Đơn nhập hàng" đủ 2 dòng (133+333 — ĐÂY LÀ lỗi cũ: trước
bản này chỉ 1 dòng), bộ lọc "Kênh mua=Mua riêng" ra đúng 1 dòng cho cả 2
báo cáo (trước bản này báo "Đơn nhập hàng" lọc mua riêng sẽ RA RỖNG),
"So sánh đặt–nhận" gộp đúng SL đặt=30/SL thực nhận=24 — PASS; `node
--check` qua cho 2 file JS.

## 10.11 — ETL: gộp menu "Chỉ tiêu" + "Cấu hình khác" đóng/mở, đổi tên ngành hàng (HCRC)

**Theo yêu cầu người dùng**: "ảnh 1 bạn sửa giúp tôi chỉ tiêu doanh thu
ngành hàng thành chỉ tiêu doanh thu ngành hàng (HCRC) và nhóm các chỉ tiêu
thành một nhóm ở menu bart là 'Chỉ tiêu' và nhòm các các cái còn lại như
ảnh 2 thành nhóm ở menu là 'Cấu hình khác'" — sau đó yêu cầu thêm: nhóm
phải THU GỌN mặc định, bấm vào tiêu đề nhóm mới xổ danh sách con ra (dạng
accordion), không liệt kê hết luôn.

**Đã sửa** (`etl-admin/src/components/Layout.jsx` + `styles.css`):
- Đổi nhãn hiển thị "Chỉ tiêu Doanh thu theo ngành hàng" → "Chỉ tiêu Doanh
  thu theo ngành hàng (HCRC)" — CHỈ đổi chữ hiển thị, giữ nguyên route
  (`/sales-targets-nganhhang-dt`) và `menuCode` (`sales-targets-nganhhang-dt`)
  → không đổi quyền, không đổi code xử lý số liệu.
- Gộp 5 mục "Chỉ tiêu ..." vào 1 nhóm đóng/mở "🎯 Chỉ tiêu".
- Gộp 4 mục "Ánh xạ Điểm - STK_ID / Siêu thị NSO / Danh sách hàng Core /
  Cảnh báo hàng tồn" vào 1 nhóm đóng/mở "⚙️ Cấu hình khác".
- Mặc định cả 2 nhóm ĐÓNG (chỉ hiện tiêu đề + mũi tên ▶); bấm vào tiêu đề
  thì xổ ra danh sách mục con (▼), bấm lại thì thu gọn — độc lập 2 nhóm,
  có thể mở cùng lúc. Vào thẳng URL của 1 trang thuộc nhóm (vd theo
  link/bookmark) thì nhóm đó tự mở sẵn.
- Các mục không thuộc 2 nhóm trên (Dashboard, Đồng bộ, Phân quyền...) giữ
  nguyên vị trí/hành vi như cũ, không đổi.

Thuần túy sửa GIAO DIỆN sidebar (thêm state đóng/mở + 1 chuỗi nhãn) —
không đổi route, không đổi quyền (`menuCode`), không đổi code tính
toán/truy vấn báo cáo → không ảnh hưởng báo cáo/số liệu đang chạy.

Verify: `npm run build` (etl-admin) qua không lỗi; demo thật bằng cách
bundle `Layout.jsx` thật (esbuild, mock `useAuth`) + Playwright — ảnh chụp
xác nhận: mặc định đóng cả 2 nhóm, bấm mở hiện đúng danh sách + nhãn mới
"(HCRC)".



**Theo yêu cầu người dùng**: "Tôi muốn báo cáo doanh thu ngành hàng (LĐTD)
và doanh thu ngành hàng HCRC lấy được thông tin doanh thu ngay cả khi
không có dữ liệu chỉ tiêu."

**Quy tắc cũ (bản 9.77)**: 2 báo cáo này (`bc-doanh-thu-nganhhang`/
`bc-doanh-thu-nganhhang-ldtd`, `lib/nganhHangBrgRunner.js`) CHỈ hiện dòng
cho ngành hàng ĐÃ có Chỉ tiêu nhập trong đúng kỳ đang xem — ngành hàng
chưa nhập Chỉ tiêu bị ẩn hẳn khỏi báo cáo VÀ không cộng vào "Tổng cộng",
dù có doanh thu thật phát sinh.

**Đã sửa**: mở rộng điều kiện hiện dòng thành (Chỉ tiêu CÓ) HOẶC (doanh
thu thật CÓ, kỳ hiện tại hoặc cùng kỳ năm trước, bất kỳ siêu thị nào) —
giữ nguyên hành vi cũ (ngành hàng có Chỉ tiêu vẫn hiện dù chưa phát sinh
doanh thu), đồng thời đáp ứng yêu cầu mới (doanh thu luôn hiện được dù
thiếu Chỉ tiêu, cột "Chỉ tiêu"/"% so chỉ tiêu" hiện "—"). Ngành hàng
KHÔNG có cả 2 (Chỉ tiêu lẫn doanh thu) vẫn ẩn như cũ, tránh hiện 12 dòng
trắng không cần thiết. "Tổng cộng" mỗi khối tự động cộng đúng doanh thu
của dòng mới hiện thêm.

Verify: mock test `rp-server/lib/nganhHangBrgRunner.js` (giả lập hoàn
toàn không có dữ liệu Chỉ tiêu, 1 ngành hàng có doanh thu thật) — 7
assertion: ngành hàng có doanh thu không Chỉ tiêu PHẢI hiện, Chỉ tiêu
hiện "—", doanh thu hiện đúng số, Tổng cộng cộng đúng, ngành hàng không
có gì cả vẫn ẩn — PASS; `node --check` qua.

## 10.9 — Sửa lỗi UI mất thông tin trong modal "Đối tác" (api-admin) — checkbox tràn khỏi khung

**Theo yêu cầu người dùng** (phát hiện thật khi tự cấu hình đối tác "fuji" cho
API Voucher — ảnh chụp màn hình "Sửa — fuji" cho thấy các checkbox quyền
(`reports`/`realtime`/.../`voucherRedeemedFeed`) bị cắt mất, chỉ thấy tới
`voucherCheck` rồi mất chữ): "giao diện UI/UX chỗ này rất khó để cấu hình
vì nó mất thông tin, rà soát lại xem chỗ nào bị như thế này thì xử lý giúp
tôi luôn ở cả etl, report luôn nữa nhé."

**Nguyên nhân**: CSS `.scope-picker` (`api-admin/src/styles.css`) — khung
chứa danh sách checkbox dùng CHUNG cho mọi khung chọn nhiều mục trong
`ConsumersPage.jsx` (quyền/scope, "Cấu hình Voucher được gọi", "Realtime
được gọi", "Trường dữ liệu voucher đã thu hồi"...) — đặt `display: flex`
xếp hàng NGANG nhưng THIẾU `flex-wrap: wrap`. Khi danh sách đủ dài (6
quyền, hoặc nhãn dài như `voucherRedeemedFeed`), các mục bị đẩy tràn ra
ngoài khung `.modal-body` hẹp (420px) và bị cắt mất hẳn khỏi tầm nhìn —
đúng "mất thông tin" người dùng mô tả.

**Đã rà soát cả 3 app** — CHỈ api-admin bị lỗi này (7 chỗ dùng
`.scope-picker` trong `ConsumersPage.jsx`, 1 sửa CSS chung áp dụng cho cả
7). etl-admin và rp-user dùng cách xếp từng checkbox MỘT DÒNG DỌC (bên
trong `.modal-body` vốn `flex-direction: column`), không có khung ngang
nào tương tự nên không gặp lỗi tràn kiểu này.

**Đã sửa**: thêm `flex-wrap: wrap;` vào `.scope-picker` — các mục tự xuống
dòng khi hết chỗ thay vì bị cắt, không đổi layout/kích thước gì khác.

Verify: dựng lại đúng HTML/CSS thật của `.scope-picker` bằng Playwright,
chụp ảnh xác nhận cả 6 mục quyền (kể cả `voucherRedeemedFeed` dài nhất)
hiện đầy đủ, xuống dòng gọn gàng, không còn mục nào bị cắt; `npm run
build` api-admin thành công.

## 10.8 — Sửa lỗi modal không thao tác được trên mobile (render qua Portal)

**Theo yêu cầu người dùng**: báo lỗi thật kèm ảnh chụp màn hình — mở
etl-admin trên điện thoại (qua trình duyệt trong app, vd Zalo), bấm "Gán
vai trò" ở trang "Phân quyền" → hộp thoại hiện LỆCH/KẸT theo từng dòng
bảng (nhiều mảng xám chồng lên từng dòng khác nhau) thay vì phủ kín toàn
màn hình, không bấm được nút nào trong hộp thoại.

**Nguyên nhân**: `.modal { position: fixed; inset: 0; }` (CSS dùng chung
cả 3 app) đúng về CSS, nhưng một số trình duyệt trong app/WebView di động
tính sai vị trí phần tử `position: fixed` khi nó NẰM TRONG cây DOM có 1
khối cuộn ngang gần đó (bảng dữ liệu `.table-scroll`) — dù modal chỉ là
SIBLING chứ không phải con của bảng, một số WebView vẫn định vị sai.

**Đã làm**: tạo `src/components/Modal.jsx` dùng chung cả 3 app — dùng
`ReactDOM.createPortal` đưa modal render THẲNG vào `document.body` (thoát
hẳn khỏi cây DOM của trang, không còn phụ thuộc vị trí lồng nhau nữa), kèm
khoá cuộn nền (`document.body.style.overflow = 'hidden'`) lúc mở. Thay
TOÀN BỘ 43 chỗ dùng `<div className="modal">` trực tiếp (18 file, cả 3
app) sang `<Modal>` — CSS `.modal`/`.modal-body` giữ nguyên, chỉ đổi NƠI
RENDER. Thêm quy ước bắt buộc vào `CLAUDE.md` — mọi modal MỚI sau này đều
phải dùng `<Modal>`, không viết `<div className="modal">` trực tiếp nữa.

Verify: `npm run build` cả 3 app (`etl-admin`/`rp-user`/`api-admin`) thành
công, rà soát xác nhận không còn `<div className="modal">` nào sót lại
trong 18 file đã sửa, không có import trùng lặp.

## 10.7 — "Danh sách voucher đã thu hồi — feed cho đối tác" (đối tác tự chạy job định kỳ, không cần tự đối soát)

**Theo yêu cầu người dùng**: "đối tác có một hệ thống phần mềm họ tự chạy
job để kiểm tra xem voucher đã thu hồi hay chưa... API gửi thông tin
những voucher nào mà họ kiểm tra đã sử dụng rồi... thông tin nào mình trả
về thì tôi có thể tự chọn cấu hình cho họ." Trước bản này, đối tác chỉ có
2 lựa chọn: tra từng mã 1 (`GET .../voucher-redeemed/{maVoucher}`) hoặc
kéo TOÀN BỘ danh sách rồi TỰ so sánh với lần trước (`GET
.../voucher-redeemed/list`) — không có cách nào lấy ĐÚNG phần MỚI từ lần
gọi trước mà không tự đối soát.

**Đã làm**:
- `api-server/lib/voucherRedeemedFeedService.js` (mới) — endpoint kiểu
  con trỏ (`sinceId`, dựa trên `Id BIGINT IDENTITY` của `api.VoucherRedemptions`,
  KHÔNG dùng mốc thời gian để tránh lỗi khi nhiều dòng cùng giờ): đối tác
  gửi `sinceId` nhận ở lần gọi trước, nhận về đúng các dòng MỚI + `nextSinceId`
  dùng cho lần gọi sau, `hasMore` báo còn trang tiếp không.
- Đối soát "mồ côi" (`reconcileOrphanRedemptions`, chạy ngay lúc khởi
  động + định kỳ mỗi 15 phút, có `isSchedulerLeader()` tránh chạy trùng
  nhiều tiến trình) — bù các lượt thu hồi mà `api.VoucherRedemptions`
  bị LỠ ghi do lỗi (`RedeemAuditFailedError` đã biết từ trước, STATUS đổi
  thành công nhưng ghi nhật ký audit lỗi sau 3 lần thử lại): so khớp
  `PMCRDINF.STATUS=0` với các `CARD_ID` đã biết, voucher nào đã dùng mà
  CHƯA có dòng audit thì tự thêm bù, đánh dấu `TransNum='RECONCILED'` để
  phân biệt với lượt thu hồi ghi đúng luồng.
- Cấu hình trường dữ liệu trả về THEO TỪNG ĐỐI TÁC: cột mới
  `api.ApiConsumers.VoucherRedeemedFeedFieldsJson` — admin (`api-admin` →
  Đối tác → "Trường dữ liệu voucher đã thu hồi") chọn tick 1 phần trong
  5 trường (`Barcode`/`ValueAmt`/`StkId`/`TransNum`/`RedeemedAt`), NULL =
  trả về ĐỦ cả 5 (mặc định không cấu hình gì).
- Route mới (`api-server/routes/v1/vouchers.js`): `GET
  /api/v1/vouchers/redeemed/since` (cấu hình mặc định) và `GET
  /api/v1/vouchers/:configKey/redeemed/since` (đa cấu hình, dùng chung
  `api.VoucherSettings`/`api.ConsumerVoucherAccess` đã có từ bản 9.59) —
  yêu cầu scope RIÊNG `voucherRedeemedFeed` (không tự động cấp qua scope
  `voucherCheck`/`voucherRedeem` đã có).
- Cập nhật tài liệu gửi đối tác `api-voucher-redeemed-gui-doi-tac.md` —
  thêm mục 3 mô tả đầy đủ endpoint mới (tham số, response mẫu, bảng
  trường, cách tích hợp vòng lặp `sinceId`/`nextSinceId`/`hasMore`).

Verify: `node --check` 4 file sửa (`voucherRedeemedFeedService.js`,
`vouchers.js`, `server.js`, `consumers.js`); `npm run build` `api-admin`
thành công; mock test `queryRedeemedFeed`/`parseAllowedFields`/
`reconcileOrphanRedemptions` (18 assertion: phân trang đúng cursor, lọc
đúng trường được cấu hình, cách ly đúng theo `configKey`, phát hiện đúng
dòng mồ côi, không ghi trùng khi chạy lại nhiều lần) — PASS.

## 10.6 — "Chỉ 1 phiên đăng nhập" — đăng nhập nơi mới tự động vô hiệu phiên cũ

**Theo yêu cầu người dùng**: "khi nó in thì phiên muộn hơn sẽ giữ lại và
phiên cũ sẽ bị tự động disable đi" — áp dụng cho CẢ 3 app (rp-user,
etl-admin, api-admin). Trước bản này, 1 tài khoản đăng nhập được ĐỒNG THỜI
ở nhiều thiết bị/trình duyệt — mỗi lần đăng nhập phát hành 1 JWT độc lập,
không có cơ chế nào biết/huỷ các phiên khác đang tồn tại.

**Đã làm**: thêm cột `CurrentSessionId` (`app.Users`/`admin.AdminUsers`,
cả 3 CSDL `rp-db`/`etl-db`/`api-db`) — DÙNG CHUNG đúng cơ chế/CSDL/cache
30 giây đã có sẵn cho "Thu hồi phiên" (`SessionsInvalidatedAt`, xem
`lib/sessionRevocation.js` cả 3 app): mỗi lần `issueToken()` phát hành 1
phiên ĐẦY ĐỦ (đăng nhập thường/2FA/WebAuthn) đều sinh 1 mã ngẫu nhiên MỚI
(claim `"sid"` trong JWT) và ghi đè `CurrentSessionId` NGAY LẬP TỨC —
`requireAuth()`/`requireAdminAuth()` so `"sid"` của token đang dùng với
`CurrentSessionId` hiện tại, KHÁC NHAU thì coi như bị thu hồi (y hệt cơ
chế `SessionsInvalidatedAt`, cùng 1 round-trip CSDL, không tốn thêm). Tài
khoản CHƯA từng đăng nhập qua code có cờ này (`CurrentSessionId IS NULL`,
trước khi nâng cấp) — KHÔNG bị ép đăng xuất ngay, chỉ bắt đầu theo dõi từ
lượt đăng nhập tiếp theo (tránh văng toàn bộ người dùng ra khỏi hệ thống
ngay lúc deploy).

`issueToken()` đổi hẳn từ hàm ĐỒNG BỘ sang BẤT ĐỒNG BỘ (cần ghi CSDL
trước khi ký token) — 15 nơi gọi (5 chỗ/app × 3 app: đăng nhập thường,
2FA xác thực, 2FA setup, WebAuthn đăng nhập, WebAuthn đăng ký mới) đều đã
thêm `await`.

Verify: mock test `isSessionRevoked()`/`setCurrentSession()`/
`revokeSessions()` (10 assertion: `CurrentSessionId` NULL không ép đăng
xuất, sid khớp hợp lệ, sid lệch bị thu hồi, đăng nhập phiên mới làm phiên
cũ bị thu hồi NGAY không chờ hết cache, thu hồi theo thời gian cũ vẫn
hoạt động đúng, cache cập nhật tại chỗ không round-trip CSDL thừa) —
PASS; `node --check` toàn bộ 18 file sửa (3 schema.sql + 5 file/app ×
3 app).

## 10.5 — "Giám sát Log CSDL" + cảnh báo email khi transaction log vượt ngưỡng

**Theo yêu cầu người dùng** (sau sự cố thật bản 10.4/sự cố HCRC_DWH: transaction
log phình to ~329GB chiếm gần hết ổ đĩa, làm MỌI job ETL ghi `dwh.ReportFacts`
đồng loạt lỗi `EREQUEST`, mà KHÔNG AI BIẾT cho tới khi admin tình cờ phát hiện
qua etl-admin → Log): "Tôi muốn monitor log dữ liệu của tất cả các cái database
mà report kết nối vào... cảnh báo ngưỡng log quá lớn... có thể gửi email."

**Đã làm**: `etl/lib/logSpaceMonitor.js` (mới) — kiểm tra ĐỊNH KỲ mỗi 15 phút
(cùng chu kỳ "Trạng thái kết nối" đã có) dung lượng transaction log
(`sys.dm_db_log_space_usage()`, chỉ cần quyền VIEW DATABASE STATE) của:
- CSDL lõi `DWH`/`ADMIN` (HCRC_DWH/HCRC_ETL) — LUÔN kiểm tra, dùng lại
  đúng thông tin kết nối sẵn có trong `.env` của etl, không cần cấu hình
  thêm. `RP`/`API` (HCRC_RP/HCRC_API) TUỲ CHỌN — chỉ kiểm tra khi khai
  thêm `RP_*`/`API_*` trong `.env` (khuyến nghị dùng login RIÊNG, chỉ
  quyền VIEW DATABASE STATE, không dùng chung tài khoản ghi dữ liệu thật).
- MỌI `etl.DataSources` đang bật, CHỈ `Engine='mssql'` (MySQL không có
  khái niệm transaction log kiểu này, bỏ qua hẳn).

Nguồn nào lỗi kết nối/thiếu quyền chỉ đánh dấu lỗi RÕ RÀNG cho đúng dòng
đó, KHÔNG làm hỏng cả lượt kiểm tra. Vượt ngưỡng (`LOG_SPACE_ALERT_SIZE_MB`
mặc định 20000MB VÀ/HOẶC `LOG_SPACE_ALERT_PERCENT` mặc định 90%) → gửi
email cảnh báo qua `lib/mailer.js:alertLogSpaceHigh()` (DÙNG LẠI đúng
kênh `SMTP_HOST`/`ALERT_EMAIL_TO` đã có từ trước, không thêm cấu hình SMTP
riêng) — chống gửi lặp lại liên tục mỗi 15 phút bằng
`LOG_SPACE_ALERT_COOLDOWN_MINUTES` (mặc định 360 = 6 tiếng, mỗi kết nối
tính cooldown ĐỘC LẬP nhau).

Kết quả lưu bảng mới `etl.LogSpaceStatus` (etl-db/schema.sql) — trang mới
**etl-admin → "Giám sát Log CSDL"** (`LogSpaceStatusPage.jsx`, MenuCode
`log-space-status`, CHƯA gán quyền cho vai trò nào, admin tự gán qua
"Vai trò") đọc lại, có nút "Kiểm tra lại ngay" (mirror đúng "Trạng thái
kết nối" bản 8.57, dùng ĐÚNG `checkAllLogSpace()` y hệt job nền).

Verify: mock test `checkAllLogSpace()` (22 assertion — bỏ qua RP/API
chưa cấu hình, vượt ngưỡng theo size HOẶC percent, lỗi kết nối không tính
vượt ngưỡng, cooldown chặn gửi lặp lại ĐỘC LẬP theo từng kết nối, hết
cooldown gửi lại) đều PASS; `node --check` toàn bộ file sửa; build
etl-admin thành công.

## 10.4 — Vá lỗ hổng bảo mật CRITICAL `proxy-addr` (giả mạo IP) ở `api-server`

**Theo yêu cầu người dùng** (rà soát bảo mật hệ thống API): `npm audit`
phát hiện 11 lỗ hổng ở `api-server` (1 critical, 2 high, 8 moderate).
Nghiêm trọng nhất: `proxy-addr` 1.1.0-2.0.7 (qua `express`) — lỗ hổng
**giả mạo IP** khi dùng cấu hình `trust proxy` (đúng cấu hình hệ thống
đang dùng, `server.js`) qua địa chỉ IPv4-mapped IPv6. Nguy hiểm hơn bình
thường vì `req.ip` là nền cho NHIỀU lớp kiểm soát bảo mật khác đang có:
`ADMIN_ALLOWED_IPS` (IP allowlist trang quản trị), `allowedIps` riêng
từng đối tác API, và rate-limit theo IP — giả mạo được IP có thể vượt
qua CẢ 3 lớp đó cùng lúc.

**Đã sửa**: `npm audit fix` trong `api-server/` (chỉ đổi
`package-lock.json`, không đổi `package.json` — các range `^` đã cho
phép bản vá) — nâng `proxy-addr` 1.1.0-2.0.7 → **2.0.8**, kèm vá luôn 5
lỗ hổng khác không cần breaking change: `express` → 4.22.3, `qs` →
6.16.1, `compression` → 1.8.2, `multer` → 2.5.0, `ip-address` → 10.7.4,
`brace-expansion` → 1.1.21/2.1.7. Verify: `node --check` toàn bộ
`server.js`/`routes/`/`lib/`, khởi động thử server (dừng đúng ở bước
kiểm tra `.env` thiếu — không có lỗi module/syntax), và test trực tiếp
`proxy-addr@2.0.8` với địa chỉ IPv4-mapped IPv6 giả mạo — xác nhận KHÔNG
còn bị đánh lừa coi là nằm trong subnet tin cậy.

**CÒN LẠI 1 lỗ hổng CHƯA vá** (cố ý, cần breaking change): `uuid`
(qua `exceljs`/`node-cron`, moderate) — `npm audit fix --force` sẽ nâng
`node-cron@4.6.0`/`exceljs@3.4.0` (breaking change), cần test lại lịch
cron thật trước khi lên production — CHƯA làm trong bản này, để riêng
chờ xác nhận người dùng. 2 lỗ hổng khác đã phát hiện ở `api-admin`
(`react-router`, open redirect, chỉ ảnh hưởng trang nội bộ/VPN) cũng
CHƯA vá cùng lý do (breaking change, cần test).

## 10.3 — "Core stock = 0" tự động lấy Mã NCC/Tên NCC từ domain `don_dat_hang`

**Theo yêu cầu người dùng** (mục 3/4 trong yêu cầu lớn "chỉ tiêu ngành
hàng theo siêu thị + tồn kho + so sánh đặt/nhập"): báo cáo "Core stock =
0" (Mart/Minimart) thêm cột thông tin Mã NCC/Tên NCC — KHÔNG phải NCC
mua/đặt gần đây, mà NCC đã TỪNG NHẬP mã hàng đó — "nhà cung cấp mà mã
hàng đó nhập không phải NCC nhập gần nhất vì có thể mã hàng tồn tại lâu
rồi và lâu chưa nhập" (nguyên văn người dùng) — tức KHÔNG được bó trong 1
khung ngày gần đây.

**Đã làm**: tái dùng domain `don_dat_hang` (đã đồng bộ sẵn cho 6 báo cáo
"Đơn đặt hàng"/"Đơn nhập hàng", không cần VIEW/job mới) —
`rp-server/lib/donDatHangTonKhoHelper.js` thêm hàm MỚI
`loadLatestNccReceivedMapByEntity()` — quét TOÀN BỘ domain (không giới
hạn ngày, khác hẳn cửa sổ `pendingWindowDays` 90 ngày của "Chờ nhập (NCC)"
ở bản 9.95), lấy dòng NHẬP (`LoaiGiaoDich='333'`) GẦN NHẤT trong số đã có
cho mỗi (kho, mã hàng). `rp-server/lib/coreZeroStockRunner.js` thêm cờ
TUỲ CHỌN `useDonDatHangForNcc` — CHỈ dùng làm DỰ PHÒNG khi dòng Core đó
CHƯA khai tay Mã NCC/Tên NCC trong "Danh sách hàng Core" (khai tay LUÔN
ưu tiên hơn, coi là admin chủ động ghi đè) — đã bật `true` sẵn trong
`rp-server/scripts/seedCoreZeroStockReports.js` cho cả 2 báo cáo Mart/
Minimart. Verify qua mock test (9 assertion: khai tay giữ nguyên, chưa
khai tay dùng auto, cả 2 đều thiếu thì null, cờ tắt giữ hành vi cũ). Xem
"bc-core-ton-kho-0.md" mục "Bản 10.3".

## 10.2 — Thêm Ngành hàng vào VIEW `don_dat_hang` + bộ lọc Ngành hàng cho 6 báo cáo mua hàng

**Theo yêu cầu người dùng** (mục 4 trong yêu cầu lớn): báo cáo so sánh
đặt hàng/nhập hàng cần lọc thêm theo Ngành hàng (đã có sẵn lọc NCC/Siêu
thị/Kênh mua — chỉ thiếu Ngành hàng).

**Đã làm**: VIEW `dbo.vw_DonDatHangChiNhanh` (Live DSMART16 + Lịch sử
DSMART16_EOM, cả 2 nhánh dynamic SQL) thêm `MaNganhHang`/`TenNganhHang`
(JOIN `DEPTLIST` qua `SKU_DEF.DEPT_ID`, dùng cột Unicode `DEPT_NAME_U` —
mirror đúng pattern đã dùng ở `V_HCRC_DOANHTHU_NGANHHANG`) — thuần thêm
cột, 6 báo cáo cũ không ảnh hưởng. `etl/scripts/seedDonDatHangSync.js`/
`seedDonDatHangHistorySync.js` cập nhật `dimensionColumns`.
`rp-server/scripts/seedPurchaseOrderReports.js` thêm `NGANH_HANG_FILTER`
(multiSelect, `optionsSource.domain` — cơ chế lọc SQL-level có sẵn, KHÔNG
cần sửa `purchaseOrderRunner.js`) vào cả 6 báo cáo. Job Live cần resync 1
lần (`etl/scripts/resyncDonDatHangLiveForSkuCode.js --confirm`, script
TÁI DÙNG nguyên vẹn từ bản 9.95 — cơ chế domain-agnostic, áp dụng cho MỌI
lần thêm cột Dimension mới vào VIEW này, không riêng MaHangHienThi) — job
Lịch sử KHÔNG cần resync (dữ liệu CŨ chỉ thiếu 2 cột mới, không sai dữ
liệu đã có, resync sẽ mất nhiều thời gian không cần thiết).

## 10.1 — Chia Chỉ tiêu ngành hàng theo tỷ lệ ngày khi chọn khoảng ngày không đúng nguyên 1 tháng

**Theo yêu cầu người dùng** (mục 1 trong yêu cầu lớn): báo cáo "Doanh
thu/Nhập hàng theo ngành hàng" (HCRC + LDTĐ) khi người dùng chọn 1 ngày
hoặc vài ngày KHÔNG phải nguyên 1 tháng, Chỉ tiêu vẫn lấy NGUYÊN giá trị
cả tháng (`runSalesTargetsBlockRange()`) — sai khi so sánh với doanh thu
thực tế của ĐÚNG số ngày đã chọn.

**Đã sửa**: `rp-server/lib/nganhHangBrgRunner.js` thêm hàm MỚI
`loadNganhHangTargetsProportional()` — với MỖI tháng trong khoảng ngày đã
chọn, tính tỷ lệ = (số ngày của tháng đó đã chọn) ÷ (tổng số ngày của
tháng đó), nhân tỷ lệ này vào MỌI trường số trong Chỉ tiêu rồi CỘNG DỒN
qua các tháng — chọn ĐÚNG nguyên 1 tháng tự nhiên ra tỷ lệ 1.0 (khớp
hành vi CŨ, không cần xử lý riêng "nguyên tháng" vs "lẻ ngày"). THAY hẳn
`runSalesTargetsBlockRange()` cho 2 báo cáo ngành hàng (CHỈ 2 báo cáo
này) — KHÔNG đổi hành vi báo cáo LDTD/HCRC "doanh thu cuối ngày" (vẫn
dùng `runSalesTargetsBlockRange()` nguyên vẹn, cố ý lấy NGUYÊN tháng).
Verify qua mock test (14 assertion: tháng thường/tháng nhuận, nguyên
tháng = hành vi cũ, lẻ 5/31 ngày, lẻ ngày bắc cầu 2 tháng, `TrangThai`
"Đã đóng" bị loại, thực thể không có chỉ tiêu).

**LƯU Ý — mục 2 của yêu cầu lớn (chỉ tiêu theo siêu thị thay đổi nguồn
sang hệ `sales-targets-corp`/`sales-targets-hcrc`) ĐANG TẠM DỪNG** theo
lựa chọn của người dùng ("Dừng lại, để tôi nghĩ thêm") — hệ nguồn đó chỉ
có Chỉ tiêu Total (không có Bán lẻ/Bán buôn/Lãi gộp riêng), sẽ cần người
dùng quyết định thêm trước khi làm.

## 10.0 — Sửa lỗi thật: `deploy/ecosystem.config.js` khởi động sai đường dẫn tuỳ nơi gõ lệnh

**Theo báo cáo người dùng** (sau khi server reboot mất hết tiến trình
PM2, chạy lại theo hướng dẫn vẫn lỗi): `pm2 start
/opt/hcrc-report/deploy/ecosystem.config.js` báo
`Error: Script not found: /opt/etl/server.js` (thiếu hẳn
`Hcrc-report/`) và `Script not found: /opt/Hcrc-report/serve-static.js`
(thiếu `deploy/`) — dù chính file `ecosystem.config.js` VẪN được tìm
thấy và đọc đúng.

**Nguyên nhân** — `cwd`/`script` trong file cấu hình dùng chuỗi TƯƠNG ĐỐI
(`'../etl'`, `'serve-static.js'`) — PM2 tính các đường dẫn này DỰA THEO
nơi đang đứng lúc gõ `pm2 start` (hoặc cwd mặc định của PM2 daemon),
KHÔNG PHẢI luôn đúng là thư mục chứa chính file cấu hình như tưởng — gõ
lệnh từ thư mục khác gốc repo ra sai đường dẫn, dù file cấu hình đó vẫn
nạp được bình thường (chỉ riêng `cwd`/`script` TRONG file bị tính sai).

**Đã sửa**: `deploy/ecosystem.config.js` — đổi mọi `cwd`/`script`/
`STATIC_DIST_DIR` sang `path.join(__dirname, ...)` — `__dirname` của
Node LUÔN LÀ thư mục THẬT chứa file này (đã phân giải symlink), hoàn
toàn độc lập với nơi gõ lệnh/user chạy — loại bỏ hẳn sự mơ hồ, chạy đúng
dù gõ `pm2 start` từ bất kỳ thư mục nào, với đường dẫn tuyệt đối hay
tương đối tới file cấu hình.

## 9.99 — Thêm cột "Lãi gộp — Chỉ tiêu" (số tiền) theo yêu cầu người dùng

**Theo yêu cầu người dùng** (sau bản 9.98): đã xác nhận vị trí "% so chỉ
tiêu" ổn, nhưng còn thiếu CHÍNH số tiền Chỉ tiêu Lãi gộp (Total/Bán lẻ/Bán
buôn) đã nhập vào file Chỉ tiêu — báo cáo chỉ hiện % so sánh, không hiện
lại số tiền gốc (khác "Doanh thu — Chỉ tiêu" đã có số tiền gốc từ trước).

**Đã sửa**: thêm nhóm cột MỚI "Lãi gộp — Chỉ tiêu" (Total/Bán lẻ/Bán
buôn) ở `rp-server/lib/nganhHangBrgRunner.js`, đứng NGAY SAU "Giá trị
hàng hỏng hủy", TRƯỚC "Lãi gộp — % so chỉ tiêu" (mirror đúng cấu trúc
"Doanh thu — Chỉ tiêu" đứng trước "% so chỉ tiêu" của Doanh thu). Biến
tính toán ĐÃ CÓ SẴN từ bản 9.73/9.74 (dùng cho % so chỉ tiêu), chỉ THÊM
vào object trả về — không đổi công thức nào. Verify qua mock test trực
tiếp `computeRowFields()`. Xem "báo cáo doanh thu-nhập hàng theo ngành
hàng.md" mục 18.

## 9.98 — Đổi vị trí cột "Lãi gộp — % so chỉ tiêu" theo yêu cầu người dùng

**Theo yêu cầu người dùng** (gửi kèm file Chỉ tiêu Lãi gộp Total/Bán
lẻ/Bán buôn đã nhập): cột "Lãi gộp — % so chỉ tiêu" (có công thức từ bản
9.73/9.74, không phải tính năng mới) nằm Ở CUỐI nhóm "Lãi gộp" — muốn đổi
sang đứng NGAY SAU "Giá trị hàng hỏng hủy", TRƯỚC "Lãi gộp — Tỷ lệ".

**Đã sửa**: đổi thứ tự trong `COLUMNS`/`COLUMN_GROUPS`/
`COLUMN_SUPER_GROUPS` ở `rp-server/lib/nganhHangBrgRunner.js` — thuần đổi
vị trí hiển thị (đã kiểm tra khớp key giữa 3 mảng), không đổi công thức
tính. Xem "báo cáo doanh thu-nhập hàng theo ngành hàng.md" mục 17 (gồm
lưu ý cột vẫn hiện "—" nếu Chỉ tiêu Lãi gộp chưa được nhập cho đúng kỳ
đang xem — không phải lỗi).

## 9.97 — Sửa lỗi thật khi chạy resync bản 9.96: DELETE 1 lệnh cho ~1,3 triệu dòng bị timeout

**Theo báo cáo người dùng** (chạy thật trên server test): `node
scripts/resyncDoanhThuNganhHangLichSu.js --confirm` báo lỗi `Failed to
cancel request in 5000ms` — domain `doanhthu_nganhhang` SourceSystem
`ds3` có tới **1.276.466 dòng** (giữ lịch sử theo ngày nhiều năm), xoá
bằng 1 lệnh `DELETE` DUY NHẤT vượt quá request timeout mặc định (30
giây), trình điều khiển cố huỷ request nhưng cũng thất bại.

**Đã sửa**: `etl/scripts/resyncDoanhThuNganhHangLichSu.js` — xoá theo
từng đợt 5.000 dòng (`DELETE TOP (5000) ... ` lặp lại tới khi hết), mỗi
đợt là 1 transaction ngắn riêng, không còn vượt timeout, cũng nhả khoá
giữa các đợt (đỡ ảnh hưởng các job ETL khác đang ghi đồng thời vào
`dwh.ReportFacts`). In tiến độ mỗi 100.000 dòng.

## 9.96 — Sửa cột "% so cùng kỳ năm trước" (Bán lẻ/Bán buôn) trống ở báo cáo Doanh thu/Lãi gộp theo ngành hàng

**Theo báo cáo người dùng** (ảnh chụp thật): "Total" của "% so cùng kỳ
năm trước" vẫn ra số, nhưng "Bán lẻ"/"Bán buôn" trống 100% (cả Doanh thu
lẫn Lãi gộp). Xác nhận qua SQL thật (`etl.SyncJobs.MeasureColumnsJson` +
`dwh.ReportFacts.Measures`): job "Doanh thu theo ngành hàng - Lịch sử
(DSMART16_EOM)" vẫn chạy với cấu hình CŨ (3 số đo), **chưa từng được chạy
lại `seedNganhHangSync.js --with-history` sau bản 9.68** (lúc bản 9.68
thêm 5 số đo mới vào VIEW) — nên job này CHƯA BAO GIỜ lấy
`DoanhThuBanLe`/`DoanhThuBanBuon`/`LaiGopBanLe`/`LaiGopBanBuon`/
`GiaTriHongHuy` cho bất kỳ ngày nào, bất kể watermark đã chạy xa tới đâu.
KHÁC lỗi watermark ở bản 9.86/9.88 (đó là job không bao giờ QUAY LẠI ngày
cũ — ở đây job vẫn đi qua đúng ngày, chỉ chưa từng YÊU CẦU đủ cột).

**Đã sửa**: thêm `etl/scripts/resyncDoanhThuNganhHangLichSu.js` (mới,
dry-run mặc định, tự kiểm tra MeasureColumnsJson đã đủ 8 số đo chưa trước
khi cho phép resync) — kết hợp chạy lại `seedNganhHangSync.js
--with-history` (cập nhật cấu hình) rồi script mới (xoá dữ liệu Lịch sử
cũ + reset watermark). Theo thống nhất với người dùng: chọn nạp lại TOÀN
BỘ lịch sử (đơn giản, dùng lại hạ tầng đã có) thay vì xây thêm script nạp
ưu tiên theo khoảng ngày — đánh đổi: trong lúc nạp lại (có thể NHIỀU TUẦN,
job quét ~93 bảng), cột "% so cùng kỳ năm trước" trống HẲN (kể cả Total),
cho tới khi quét xong tới đúng ngày cần so sánh. Xem chi tiết + SQL theo
dõi tiến độ ở "báo cáo doanh thu-nhập hàng theo ngành hàng.md" mục 16.

## 9.95 — Sửa cột "Chờ nhập/Đã nhập (NCC)" trống ở "Top bán chạy đang tồn kho = 0" — tái dùng domain `don_dat_hang`

**Theo báo cáo người dùng** (gửi kèm PDF xuất thật, 61 dòng): "Chờ nhập
(NCC)"/"Chờ nhập (Điều chuyển)"/"Đã nhập hôm nay (NCC)"/"Đã nhập hôm nay
(Điều chuyển)" trống 100% ở mọi dòng. Người dùng chỉ ra ETL đã có job
"Đơn đặt hàng - nhập hàng (DSMART16)" (domain `don_dat_hang`) — đúng,
nhưng 4 domain riêng báo cáo này cấu hình (`chonhap_ncc`/
`chonhap_dieuchuyen`/`danhap_ncc`/`danhap_dieuchuyen`) CHƯA từng có job
thật trỏ tới (xác nhận qua grep toàn repo) — 2 nguyên nhân khác nhau, 2
cách sửa khác nhau.

**Đã sửa phần NCC** (2 cột "...(NCC)") — TÁI DÙNG domain `don_dat_hang`
sẵn có thay vì cần DBA xây VIEW mới:
- VIEW `dbo.vw_DonDatHangChiNhanh` (Live + Lịch sử) thêm cột
  `MaHangHienThi` (JOIN `SKU_DEF`, lấy mã hàng hiển thị khớp đúng domain
  `banhang_sku`/`tonkho_sku`, KHÁC `MaHang`=SKU_ID thô) — thuần thêm cột,
  6 báo cáo mua hàng cũ không ảnh hưởng.
- `rp-server/lib/donDatHangTonKhoHelper.js` (mới) — tính "Chờ nhập (NCC)"/
  "Đã nhập hôm nay (NCC)" bằng ĐÚNG công thức đã xác nhận ở báo cáo "So
  sánh đặt–nhận" (`SoLuongTheoDon − SoLuongThucNhan`, clamp ≥0 theo từng
  đơn trước khi cộng dồn), cửa sổ 90 ngày gần nhất (`pendingWindowDays`,
  sửa được qua DefinitionJson).
- `rp-server/lib/topSellingZeroStockRunner.js` — thêm cờ TUỲ CHỌN
  `useDonDatHangForNcc` (mặc định tắt — KHÔNG đổi hành vi báo cáo cũ nào
  khác đang dùng pendingSupplierDomain/receivedSupplierDomain thật), bật
  sẵn trong `scripts/seedTopZeroStockReport.js`.
- `etl/scripts/resyncDonDatHangLiveForSkuCode.js` (mới) — bắt job Live
  kéo lại dữ liệu gần đây để có đủ `MaHangHienThi` (dữ liệu CŨ đã đồng bộ
  trước khi thêm cột sẽ KHÔNG tự có, cùng lớp lỗi watermark đã gặp bản
  9.86).

**CHƯA sửa phần "Điều chuyển"** — `don_dat_hang` chỉ có dữ liệu NCC, 2 cột
"...(Điều chuyển)" vẫn cần DBA xây VIEW/job riêng (chưa có nguồn dữ liệu
nào xác nhận) — xem `bc-ton-kho-0.md` Bước 2b.

Verify qua 2 bộ mock test (helper dịch BU_ID→STK_ID đúng/bỏ qua BU_ID
chưa khai; runner bật cờ dùng đúng helper + KHÔNG đổi hành vi cũ khi tắt
cờ) — xem `bc-ton-kho-0.md` mục "Bước 2c".

## 9.94 — Chẩn đoán (tài liệu, không đổi code): cột NCC/Luồng giao hàng/Ngày nhập cuối trống ở "Core stock = 0"

**Theo báo cáo người dùng** (gửi kèm file PDF xuất thật, 92 dòng): "Mã
NCC"/"Tên NCC"/"Luồng giao hàng" VÀ "Ngày nhập cuối"/"SL đang đặt"/"Ngày
đặt"/"Mã đang đặt" trống 100% ở mọi dòng. Xác nhận 2 nguyên nhân khác
nhau: (1) "Mã NCC"/"Tên NCC"/"Luồng giao hàng" — thiếu dữ liệu khai báo
trong file "Danh sách hàng Core" (3 cột tuỳ chọn chưa từng điền), không
phải lỗi code; (2) "Ngày nhập cuối"/"SL đang đặt"/... — 4 nguồn dữ liệu
tuỳ chọn (`core_khoa_all`/`core_khoa_theo_kho`/`core_dang_dat`/
`core_ngay_nhap_cuoi`) CHƯA TỪNG có VIEW/job thật từ lúc tạo báo cáo (xác
nhận qua chính ghi chú trong `seedCoreZeroStockReports.js`) — tính năng
còn dang dở, cần DBA viết VIEW thật + admin tạo job, không phải lỗi mới
phát sinh. Ghi chi tiết vào `bc-core-ton-kho-0.md` mục "Hỏi & đáp".

## 9.93 — Sửa lỗi chuyển tab "Báo cáo" chậm hiện sai nhóm (race condition)

**Theo báo cáo người dùng** (trên mobile): "chuyển giữa những báo cáo này
rất chậm. Nó chọn mua hàng thì nó lại ra vận hành. Chọn vận hành thì nó
lại ra doanh thu" — tức chọn 1 tab nhưng danh sách báo cáo hiện ra lại là
của tab TRƯỚC ĐÓ, đi sau 1 bước.

**Nguyên nhân**: race condition ở `rp-user/src/modules/reports/ReportsPage.jsx`
— effect gọi `GET /reports?menuCode=...` mỗi khi đổi tab KHÔNG có gì chặn
response TRỄ của tab đã rời đi — mạng di động chập chờn khiến 2 lượt gọi
về KHÔNG ĐÚNG THỨ TỰ, response của tab cũ về sau đè lên danh sách của tab
mới đang xem.

**Sửa**: thêm cờ `cancelled` (đóng theo cleanup function của effect,
chuẩn React) — response của tab đã rời đi bị bỏ qua, không còn ghi đè
state của tab đang xem. Đã verify qua mô phỏng logic (thứ tự response
đảo ngược vẫn ra đúng kết quả của tab đang xem).

## 9.92 — Làm rõ nhãn dropdown "Siêu thị" khi chưa khai "Ánh xạ Điểm - STK_ID"

**Theo báo cáo người dùng** (nhiều mục trong dropdown "Siêu thị — khối
..." của 2 báo cáo Doanh thu theo ngành hàng, VÀ dropdown "Chi nhánh" của
báo cáo "Core stock = 0", hiện thẳng mã số thay vì tên siêu thị). KHÔNG
phải lỗi — mã kho nào CHƯA khai `TenSieuThi` ở "Ánh xạ Điểm - STK_ID"
không có tên để hiện (hành vi đã có từ bản 9.56 cho Core stock=0, nay
mirror sang dropdown mới ở bản 9.90).

**Sửa**: đổi cách hiện cho rõ nghĩa — mã chưa khai tên giờ hiện dạng
`<mã> (chưa khai tên)` thay vì mã trần, áp dụng đồng nhất ở
`rp-server/lib/nganhHangBrgRunner.js` VÀ `lib/coreZeroStockRunner.js`.
KHÔNG đổi giá trị lọc, chỉ đổi chữ hiển thị. Tên đầy đủ ở mọi dropdown
chỉ có được khi khai bổ sung "Ánh xạ Điểm - STK_ID" (việc nhập dữ liệu,
không cần code gì thêm). Đã verify qua mock test. Chi tiết ở "báo cáo
doanh thu-nhập hàng theo ngành hàng.md" mục 15.

## 9.91 — Sửa lỗi khối NSO luôn ra 0 dù khai đủ "Siêu thị NSO" + "Ánh xạ Điểm - STK_ID"

**Theo báo cáo người dùng** (sau khi khai đủ "Siêu thị NSO" + "Ánh xạ
Điểm - STK_ID" đúng mã, đối chiếu kỹ qua SQL khớp hoàn toàn — khối NSO
vẫn hiện Thực đạt = 0 mọi ngành hàng). Nguyên nhân: ĐÚNG lỗi đã gặp 1 lần
ở chỗ khác (bản 9.58) — cột STK_ID nguồn DSMART là CHAR cố định độ dài,
tự đệm khoảng trắng phía sau (SSMS không thấy được) — `nganhHangBrgRunner.js`
đọc STK_ID từ Dimensions JSON KHÔNG qua đường đã được vá `.trim()` ở bản
9.58 (đường khác: `reportFactsHelpers.js`), trong khi `MaStkMoi` ở "Ánh
xạ Điểm - STK_ID" đã trim sẵn — lệch 1 khoảng trắng khiến so khớp luôn
sai, STK_ID rơi về mặc định LFL, KHÔNG BAO GIỜ vào được NSO.

**Sửa**: thêm `.trim()` ở 2 chỗ còn thiếu trong
`rp-server/lib/nganhHangBrgRunner.js`. KHÔNG cần sửa lại dữ liệu đã khai
ở "Siêu thị NSO"/"Ánh xạ Điểm - STK_ID" (đã đúng từ trước, chỉ là code so
sánh sai). Đã verify qua mock test. Chi tiết ở "báo cáo doanh thu-nhập
hàng theo ngành hàng.md" mục 14.

## 9.90 — Bộ lọc "Siêu thị" riêng theo từng khối + "Bỏ hàng hỏng hủy" (2 báo cáo Doanh thu theo ngành hàng)

**Theo yêu cầu người dùng**: "3 filter theo Total: chọn siêu thị, LFL:
Chọn siêu thị, NSO: chọn siêu thị trong NSO. Và thêm lọc Bỏ Hàng hỏng
hủy: không đưa hàng hỏng hủy vào và lãi theo doanh thu không trừ hàng
hỏng hủy."

**Thêm 4 bộ lọc mới**: 3 ô "Siêu thị" multiSelect ĐỘC LẬP theo từng khối
(Toàn hệ thống BRG/LFL/NSO — không chọn = giữ nguyên mặc định như trước,
có chọn = thu hẹp đúng khối đó, không ảnh hưởng 2 khối còn lại) + 1 ô
"Lãi gộp có trừ Giá trị hàng hỏng hủy?" (mặc định Có trừ — giữ nguyên
công thức cũ; chọn Không trừ thì Lãi gộp = margin thô theo Doanh thu, cột
"Giá trị hàng hỏng hủy" vẫn hiện số thật, kèm cảnh báo trên báo cáo).

`rp-server/lib/nganhHangBrgRunner.js` thêm `resolveNganhHangBranchOptions()`
(dropdown siêu thị theo khối) + áp dụng lọc theo từng khối +
`excludeHongHuy` trong `computeRowFields()`; `routes/reports.js` wire
`optionsSource.nganhHangBranches`; `scripts/seedNganhHangReports.js` thêm
4 filter vào definition. Đã verify qua mock test: không chọn gì → kết quả
y hệt trước bản 9.90 (không phá vỡ báo cáo hiện có). Chi tiết ở "báo cáo
doanh thu-nhập hàng theo ngành hàng.md" mục 13.

## 9.89 — Chỉ tiêu riêng theo từng khối Toàn hệ thống BRG/LFL/NSO (2 báo cáo Doanh thu theo ngành hàng)

**Theo yêu cầu người dùng**: "doanh thu ngành hành hcrc và ldtd tôi muốn
nhập file chỉ tiêu có tách doanh thu tổng, doanh thu theo LFL và doanh
thu NSO, hiện tại upload chỉ tiêu đang chỉ theo tổng nên số liệu tính
chưa đúng." Báo cáo có 3 khối lặp lại (Toàn hệ thống BRG/LFL/NSO) nhưng
trước đây chỉ có 1 bộ 4 cột Chỉ tiêu (Total) dùng CHUNG cho cả 3 khối —
"% so chỉ tiêu" của LFL/NSO vì vậy so SAI (Thực đạt của khối đó / Chỉ
tiêu TOÀN HỆ THỐNG).

**Sửa**: thêm 8 cột chỉ tiêu mới (hậu tố `_LFL`/`_NSO`) vào file Excel
chỉ tiêu — tổng 12 cột (3 khối × 4 chỉ số), hoàn toàn độc lập (người dùng
xác nhận — KHÔNG tự ràng buộc Tổng = LFL + NSO). `etl/server.js` thêm 8
cột vào file mẫu/xuất; `rp-server/lib/nganhHangBrgRunner.js` đọc ĐÚNG bộ
cột theo từng khối (`SECTIONS[].targetSuffix`) thay vì dùng chung. Áp
dụng cho cả 2 trang "Chỉ tiêu Doanh thu theo ngành hàng"/"(LDTD)". Chi
tiết + các bước triển khai ở "báo cáo doanh thu-nhập hàng theo ngành
hàng.md" mục 12.

## 9.88 — Sửa lỗi engine ETL: job "Lịch sử" timeout liên tục, không bao giờ kéo được dữ liệu quá khứ

**Theo báo cáo người dùng** (pm2 log `hcrc-etl-error`): job "Doanh thu
theo ngành hàng - Lịch sử (DSMART16_EOM)" timeout liên tục
(`Timeout: Request failed to complete in 90000ms`), chưa từng kéo được dữ
liệu quá khứ (tìm năm 2019 cũng chưa có). Nguyên nhân: LỖI TRONG CHÍNH
ENGINE ETL dùng chung mọi job "Lịch sử" (`etl/jobs/runSync.js`) — tiêu chí
chọn `requestTimeout` dài (10 phút, cần cho job Lịch sử đọc VIEW UNION ALL
nhiều năm) hay ngắn (90 giây, cho job Live hằng ngày) TRƯỚC ĐÂY chỉ dựa
vào "mốc đồng bộ = epoch chính xác", nhưng mốc đồng bộ được lưu tạm SAU
MỖI LÔ (bản 9.26) — nên job Lịch sử chỉ cần xử lý xong 1 lô đầu tiên là
mốc không còn = epoch nữa, MỌI lượt chạy sau đó (dù còn cách hiện tại
NHIỀU NĂM dữ liệu) bị coi nhầm là "incremental nhỏ" → timeout ngắn → kẹt
cứng vĩnh viễn.

**Sửa**: đổi tiêu chí sang "mốc đồng bộ còn cách hiện tại > 365 ngày" —
job Lịch sử giữ timeout dài XUYÊN SUỐT nhiều lượt chạy tới khi bắt kịp gần
hiện tại, job Live không bị ảnh hưởng. Ghi chi tiết + cách kiểm tra vào
"báo cáo doanh thu-nhập hàng theo ngành hàng.md" mục 11 (lỗi chung của
engine, áp dụng cho MỌI job Lịch sử, không riêng domain ngành hàng).

## 9.87 — Thêm index CSDL sửa dứt điểm Timeout "Core stock=0"/"Top bán chạy tồn kho=0"

**Theo báo cáo người dùng** (vẫn lỗi `TimeoutError...tarn/PendingOperation.js`
dù đã deploy bản 9.83): chẩn đoán lại sâu hơn phát hiện bản 9.83 chỉ sửa 1
trong 5 hàm đọc `dwh.ReportFacts` theo EntityCode — 4 hàm còn lại
(`loadLatestMeasureBefore`/`loadLatestMeasure`/`loadLatestMeasureWithDate`/
`loadSumOnDate` ở `rp-server/lib/reportFactsHelpers.js`, dùng bởi CẢ báo
cáo "Core stock = 0" lẫn "Top bán chạy đang tồn kho = 0") lọc
`WHERE Domain = @domain AND EntityCode IN (...)` nhưng KHÔNG có index nào
seek được theo cặp (Domain, EntityCode) — SQL Server phải quét gần hết
domain triệu dòng (`tonkho_sku`/`tonkho_chitiet_sku`) mỗi lần gọi, giữ
connection rất lâu, cạn pool khi vài báo cáo chạy cùng lúc.

**Sửa**: thêm index mới `IX_ReportFacts_Domain_Entity_Date (Domain,
EntityCode, EventDate DESC) INCLUDE (Measures)` trong `dwh/schema.sql` —
cho seek thẳng, không quét toàn domain nữa. Việc cần làm trên server: chạy
lại `dwh/schema.sql` trên `HCRC_DWH` (an toàn, chỉ tạo index mới, không
đổi dữ liệu). Chi tiết ở `bc-core-ton-kho-0.md` mục "Hỏi & đáp".

## 9.86 — Sửa lỗi watermark job "Doanh thu theo ngành hàng - Live": Bán lẻ/Bán buôn chỉ đúng từ ngày deploy 9.68

**Theo báo cáo người dùng** (kèm PDF báo cáo tháng 10/2026): "Doanh thu —
Thực đạt" cột Total đúng cả tháng, nhưng Bán lẻ/Bán buôn lệch xa Total (y
như chỉ lấy đúng 1-2 ngày gần nhất). Nguyên nhân: ĐÚNG lỗi watermark đã
gặp ở bản 8.1 (xem `resyncDoanhThuChinhanhLive.js`) — job "Doanh thu theo
ngành hàng - Live" dùng `WORK_DATE` (không đổi theo thời gian) làm cả
`UpdatedAtColumn`, nên khi VIEW thêm 5 cột `DoanhThuBanLe`/`DoanhThuBanBuon`/
`LaiGopBanLe`/`LaiGopBanBuon`/`GiaTriHongHuy` ở bản 9.68, các ngày job đã
đồng bộ TRƯỚC đó (watermark đã vượt qua) không bao giờ tự quét lại để lấy
5 cột mới — chỉ ngày deploy 9.68 trở đi mới có đủ số.

**Sửa**: thêm `etl/scripts/resyncDoanhThuNganhHangLive.js` (mirror đúng
`resyncDoanhThuChinhanhLive.js`) — xoá dữ liệu Live cũ của domain
`doanhthu_nganhhang` + reset mốc đồng bộ về epoch, KHÔNG đụng job "Nhập
hàng theo ngành hàng - Live" (không lỗi) hay job "Lịch sử (EOM)" (đang
chạy dở kéo lịch sử). Xem chi tiết + cách kiểm tra ở "báo cáo doanh thu-nhập
hàng theo ngành hàng.md" mục 10 (gồm cả giải thích Total = Bán lẻ + Bán
buôn + mã 232 không tách kênh, KHÔNG trừ hàng hỏng hủy).

## 9.85 — Đổi "Mã siêu thị" thành "Mã ngành hàng" cho 2 trang Chỉ tiêu doanh thu theo ngành hàng

**Theo báo cáo người dùng**: "bc ngành hành là mã ngành hàng ko phải mã
siêu thị nhé, bạn đổi ngay chỉ tiêu doanh thu ngành hàng và doanh thu
ngành hàng LDTD nhé" — 2 trang "Chỉ tiêu Doanh thu theo ngành hàng"/
"(LDTD)" (bản 9.73, mã thực thể LUÔN là `MaNganhHang` thuần, không có
khái niệm siêu thị) vẫn hiện nhãn "Mã siêu thị" dùng chung cho cả 5
trang Chỉ tiêu.

Thêm cờ `isNganhHangOnly` (CHỈ đúng 2 trang này — "Nhập hàng theo ngành
hàng" KHÔNG tính, vẫn hỗ trợ cả kiểu theo chi nhánh VÀ toàn công ty) —
đổi nhãn ở cột bảng, tiêu đề "Sửa / thêm", nút thêm mới, placeholder ô
nhập/JSON gợi ý, thông báo lỗi/cảnh báo liên quan. 3 trang còn lại giữ
nguyên "Mã siêu thị". Verify bằng Playwright thật (2 kịch bản menuCode
khác nhau).

## 9.84 — Thêm xoá 1 dòng + xoá hàng loạt cho bảng "Chỉ tiêu đã nhập"

**Theo yêu cầu người dùng**: "chỗ nhập chỉ tiêu có cho xóa đi được
không? Tôi muốn chọn xóa một hoặc nhiều" — trước đây bảng "Chỉ tiêu đã
nhập" (5 trang Chỉ tiêu Lãnh đạo Tập đoàn/HCRC/Doanh thu theo ngành
hàng/(LDTD)/Nhập hàng theo ngành hàng, dùng chung
`SalesTargetsPage.jsx`) chỉ có nút "Sửa", không có cách xoá.

- Backend (`etl/routes/admin/salesTargets.js`): thêm `DELETE /:id` —
  khoá theo ĐÚNG domain của trang đó, phòng xoá nhầm dòng domain khác.
  Ghi audit log.
- Frontend: thêm nút "Xoá" từng dòng + checkbox chọn nhiều + nút "Xoá N
  mục đã chọn" — đúng mẫu chuẩn CLAUDE.md (`useRowSelection` +
  `DataTable` selection).

Verify bằng Playwright thật (esbuild bundle + mock API) — xoá 1 dòng và
xoá hàng loạt đều hoạt động đúng.

## 9.83 — Giới hạn 35 ngày khi quét domain tồn kho — sửa cạn connection pool

**Theo sự cố thật người dùng gặp** tiếp sau bản 9.81 (đã bật RCSI): báo
cáo "Core stock = 0" vẫn lỗi, đổi sang `TimeoutError: operation timed
out for an unknown reason` tại `node_modules/tarn/dist/
PendingOperation.js` — hết connection pool (báo cáo Mart, Minimart, VÀ 1
job gửi email báo cáo theo lịch cùng fail).

**Chẩn đoán** bằng `SELECT Domain, COUNT(*) FROM dwh.ReportFacts GROUP
BY Domain`: domain `tonkho_sku`/`tonkho_chitiet_sku` có **5-11 TRIỆU
dòng** (giữ lịch sử MỖI NGÀY). `loadLatestDimensionsForDomain()`
(`rp-server/lib/reportFactsHelpers.js`) trước đây quét KHÔNG giới hạn
ngày (`ROW_NUMBER() OVER (PARTITION BY EntityCode ORDER BY EventDate
DESC)` trên TOÀN domain) để lấy đúng 1 dòng gần nhất/thực thể — giữ
connection CSDL rất lâu, vài báo cáo/job chạy cùng lúc cạn hết pool.

**Sửa**: thêm tham số tuỳ chọn `sinceDate` — KHÔNG truyền giữ nguyên
hành vi cũ (lệnh gọi `chainDomain` không đổi, domain nhỏ hơn hẳn). Áp
dụng `daysAgoUTC(35)` cho cả 3 nơi gọi quét `stockDomain`
(`coreZeroStockRunner.js`/`stockThresholdRunner.js`/
`stockAlertRunner.js`) — không đổi kết quả đúng (dòng gần nhất/thực thể
luôn nằm trong 35 ngày với dữ liệu đồng bộ bình thường), chỉ bớt quét
dữ liệu cũ không cần. Verify bằng test query construction (mock
pool.request/query). Đính chính luôn 1 chi tiết sai ở bản 9.81 trong
`bc-core-ton-kho-0.md` — HaproFood 198 Lò Đúc và BRG Mart L4 Sài Đồng là
2 server KHÁC NHAU, không chung IP như ghi nhầm trước đó.

## 9.82 — Sửa 5 trang "Chỉ tiêu ..." không tự tải lại khi chuyển qua lại, phải F5

**Theo báo cáo người dùng** (ảnh sidebar etl-admin): bấm chuyển giữa 5
trang "Chỉ tiêu Lãnh đạo Tập đoàn"/"Chỉ tiêu HCRC"/"Chỉ tiêu Doanh thu
theo ngành hàng"/"(LDTD)"/"Chỉ tiêu Nhập hàng theo ngành hàng" không đổi
dữ liệu trên bảng, phải F5 mới thấy đúng chỉ tiêu vừa chuyển sang.

**Nguyên nhân**: cả 5 route dùng CHUNG 1 component
`etl-admin/src/pages/SalesTargetsPage.jsx` (chỉ khác prop
`menuCode`/`apiBase`/`title`, xem `App.jsx`) — React Router giữ nguyên 1
instance khi chuyển route, nhưng effect tải dữ liệu (`reload`) trước đây
chỉ phụ thuộc `filterPeriod`, KHÔNG phụ thuộc `apiBase`, nên đổi route
không kích hoạt tải lại.

**Sửa**: thêm `apiBase` vào mảng phụ thuộc effect `reload` + effect
riêng dọn state hiển thị khác (lọc kỳ/lỗi/kết quả nhập/form sửa) khi
`apiBase` đổi. Verify bằng test thật (esbuild + Playwright, mô phỏng đổi
route qua đổi prop `apiBase`) — dữ liệu đổi đúng, không còn sót dữ liệu
trang cũ.

## 9.81 — Chẩn đoán + tài liệu: báo cáo "Core stock = 0" bị Timeout (RCSI/khoá bảng ETL)

**Theo báo cáo người dùng** (log `.pm2/logs/hcrc-*-error.log` đính kèm):
chạy báo cáo "bc-core-ton-kho-0-minimart" bị lỗi `Timeout: Request failed
to complete in 30000ms` (ETIMEOUT). Thuần CHẨN ĐOÁN + VIẾT TÀI LIỆU
(`bc-core-ton-kho-0.md`, mục Hỏi & đáp) — KHÔNG đổi code lần này.

2 nguyên nhân xác định qua log: (1) job đồng bộ "Tồn kho Chi tiết theo
SKU - Live (DSMART16)" (ĐÚNG domain báo cáo này đọc) đang kẹt/lỗi
(ECONNCLOSED) NGAY LÚC báo cáo chạy — transaction DELETE+MERGE của ETL
(`etl/lib/upsert.js`) có thể khoá cả bảng `dwh.ReportFacts` nếu CSDL DWH
CHƯA bật RCSI (rủi ro đã ghi chú sẵn ở đầu `dwh/schema.sql`), chặn SELECT
của báo cáo tới hết 30s; (2) nguồn 172.16.74.45:1433 (BRG Mart L4 Sài
Đồng + HaproFood 198 Lò Đúc, CÙNG 1 IP) không kết nối được — sự cố
mạng/tường lửa riêng, không phải lỗi phần mềm.

Khuyến nghị đã ghi vào tài liệu: `pm2 restart hcrc-etl` để gỡ job kẹt
ngay; kiểm tra mạng tới 172.16.74.45; DBA bật RCSI (`ALTER DATABASE
CURRENT SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE` — vào
khung giờ bảo trì) để xử lý TRIỆT ĐỂ; tăng `DWH_REQUEST_TIMEOUT_MS`
trong `.env` làm giải pháp tạm nếu cần.

## 9.80 — .page--wide cho trang bảng nhiều cột — bỏ cuộn ngang thừa trên desktop

**Theo báo cáo người dùng**: "Desktop vẫn chưa cải thiện mở rộng màn
hình để có thể nhìn thấy tên api... bạn xử lý màn hình này với cả hai
giao diện mobile và desktop". `.page` giới hạn `max-width: 1040px` áp
dụng cho MỌI trang (hợp lý cho form/văn bản) nhưng ép trang có bảng
nhiều cột ("Đối tác API" 7 cột dữ liệu + 9 nút hành động, "Endpoint
realtime" 7 cột + 2 cột nút, "Đồng bộ" 9 cột) phải cuộn ngang dù màn
hình desktop còn thừa rất nhiều chỗ trống bên phải.

Thêm `.page--wide { max-width: none; }` cho api-admin/etl-admin — mirror
ĐÚNG pattern đã có sẵn trong rp-user (`ReportsPage.jsx`/
`AdhocReportPage.jsx`/`PermissionsPage.jsx`, có từ trước cho vấn đề
tương tự với bảng báo cáo nhiều cột). Áp dụng CHỈ cho 3 trang bảng rộng
nhất (`ConsumersPage`, `RealtimeEndpointsPage` ở api-admin;
`SyncJobsPage` ở etl-admin) — trang form/cài đặt khác GIỮ NGUYÊN 1040px.
Verify bằng Playwright thật (esbuild bundle + dữ liệu mẫu) ở độ rộng
desktop 1600px: không còn cần cuộn ngang, đủ cả 7 cột dữ liệu + 9 nút
hành động hiện cùng lúc.

## 9.79 — ErrorBoundary cho cả 3 app + sửa "treo" khi Sửa đối tác API

**Theo báo cáo người dùng**: "Ấn sửa còn lỗi ko thấy để sửa" + "khi ấn
sửa treo luôn ko tắt được" — bấm "Sửa" trên trang "Đối tác API" đôi khi
làm màn hình đứng yên, nút "Huỷ" không phản hồi.

**Nguyên nhân gốc**: chưa app nào trong 3 app (api-admin/etl-admin/
rp-user) có error boundary — 1 lỗi JS lúc render (vd trường dữ liệu
thiếu/null) khiến React âm thầm gỡ cây giao diện mà KHÔNG nơi nào bắt
lại, để lại màn hình "treo" không cách nào thoát ngoài F5 (người dùng
không biết). Đã XÁC NHẬN bằng test thật (esbuild + `react-dom/client`
trong Playwright, dữ liệu `Scopes=undefined`): đúng kiểu lỗi gây treo —
`DataTable` crash ("Cannot read properties of undefined (reading
'join')"), không error boundary nào bắt, nút Sửa/Huỷ không còn phản hồi.

**Sửa 2 lớp**:
1. Thêm `components/ErrorBoundary.jsx` (class component bắt lỗi render
   chưa lường trước) ở cả 3 app, bọc quanh `<App/>` trong `main.jsx` —
   MỌI lỗi JS không bắt được ở nơi khác giờ hiện màn hình "Đã có lỗi xảy
   ra" + nút "Tải lại trang" thay vì treo vô hình. Verify thêm bằng kịch
   bản lỗi KHÁC hẳn (`/consumers` trả về `null`) — ErrorBoundary bắt
   đúng, hiện nút tải lại, không liên quan gì Scopes.
2. `ConsumersPage.jsx` — bọc an toàn `editing.Scopes`/`c.Scopes`
   (fallback mảng rỗng khi thiếu) + `editing.RateLimitPerMinute`
   (fallback 120) — phòng đúng kiểu dữ liệu thiếu trường đã xác định là
   nguyên nhân cụ thể.

## 9.78 — Cột "actions" tự xuống dòng khi nhiều nút, không đè lên cột ghim bên trái trên di động

**Theo báo cáo người dùng** (ảnh chụp trang "Đối tác API" trên di động —
"vẫn không nhìn thấy các thông tin liên quan đến API, tên, thông tin các
thứ... cột nó nhiều quá nên bạn phải xuống dòng"): cuộn ngang chỉ thấy
toàn nút hành động, mất hẳn cột "Tên". Nguyên nhân: `.data-table__
actions-cell` có `white-space: nowrap` buộc cả 9 nút (Sửa/Nhân bản/Tắt/
Báo cáo được gọi/Realtime được gọi/Ghi được gọi/Cấu hình Voucher được
gọi/Luân chuyển bí mật/Xoá) nằm nguyên 1 dòng — ô rộng hơn cả màn hình
di động, lúc "dính" (position: sticky; right: 0) cạnh trái bị đẩy ra
ngoài, đè lên cột "Tên" ghim bên trái (bản 9.73).

Sửa: bỏ `white-space: nowrap`, thêm `max-width: 70vw` trên
`.data-table__actions-cell` (cả 3 app, class dùng chung) — nút tự xuống
dòng trong ô khi nhiều, bảng ít nút (đa số trang, vd "Sửa Xoá") vẫn vừa
1 dòng như cũ. Verify bằng SSR (esbuild + `react-dom/server`) +
Playwright screenshot ở độ rộng di động (393px) — bảng 9 nút giờ hiện đủ
cột "Tên"/"Xác thực" không cần cuộn; bảng 2 nút không đổi.

## 9.77 — Báo cáo doanh thu ngành hàng: chỉ hiện ngành hàng ĐÃ có Chỉ tiêu trong kỳ

**Theo yêu cầu người dùng** — "khi mình up cái chỉ tiêu lên nhé, thì up
ngành hàng nào chỉ hiện ra được báo cáo ngành hàng đó nhé".
`rp-server/lib/nganhHangBrgRunner.js` không còn cố định hiện đủ 12 dòng
ngành hàng mỗi khối (BRG/LFL/NSO) nữa — lọc `NGANH_HANG_LIST` theo
`targetMap.has(item.code)` (đã đọc đúng kỳ/khoảng ngày báo cáo đang xem
qua `runSalesTargetsBlockRange`) TRƯỚC khi dựng dòng cho cả 2 báo cáo
(`bc-doanh-thu-nganhhang`/`-ldtd`, dùng chung runner). Ngành hàng CHƯA
nhập Chỉ tiêu trong kỳ đó — dù CÓ phát sinh doanh thu thật — sẽ không có
dòng riêng VÀ không cộng vào dòng "Tổng cộng" mỗi khối (Tổng cộng = tổng
CHỈ các dòng đang hiển thị, khớp đúng số cộng người xem thấy — KHÔNG
còn là tổng doanh thu toàn công ty nếu có ngành hàng còn thiếu Chỉ
tiêu). Đã kiểm tra bằng test cô lập (trích xuất `buildSegmentRows`, mock
`targetMap` 1 phần). Cập nhật `báo cáo doanh thu-nhập hàng theo ngành
hàng.md` mục 5.

## 9.76 — Thử rút "Giá trị hàng hỏng hủy" còn 1 cột, HOÀN TÁC ngay trong cùng bản

Theo yêu cầu người dùng ban đầu, rút nhóm "Giá trị hàng hỏng hủy" (báo
cáo doanh thu theo ngành hàng) từ 3 cột con Total/Bán lẻ/Bán buôn xuống
còn 1 cột Total — ngay sau đó người dùng xác nhận yêu cầu này là NHẦM
("Mình làm sai rồi... để cột bán buôn, bán lẻ này và tổng ở chỗ hàng
huỷ") và yêu cầu hoàn tác. Đã revert nguyên commit trong cùng phiên làm
việc TRƯỚC khi merge `main` — kết quả trên `main` KHÔNG đổi gì so với
bản 9.75 (vẫn đủ 3 cột con). Ghi lại ở đây để lịch sử merge khớp đúng số
commit thật, không phải vì có thay đổi hành vi.

## 9.75 — Super-group chỉ 1 nhóm con gộp thẳng 2 dòng tiêu đề, bỏ chữ lặp lại

**Theo yêu cầu người dùng** (phản hồi demo bản 9.74) — "Chỗ cột total,
bán lẻ, bán buôn merge thành 2 dòng luôn nhé": banner "Giá trị hàng hỏng
hủy" (super-group CHỈ CÓ ĐÚNG 1 nhóm con, bản 9.74) trước đó vẽ 2 Ô
CHỒNG NHAU cùng 1 chữ lặp lại (banner cấp 1 riêng + nhãn nhóm cấp 2
riêng). Giờ GỘP LUÔN thành 1 Ô duy nhất cao gấp đôi
(`rowSpan`/merge dọc Excel, 1 hình chữ nhật đôi cao ở PDF), dùng màu/chữ
TRẮNG của super-group cho Ô gộp; dòng Total/Bán lẻ/Bán buôn (lá, bên
dưới) GIỮ NGUYÊN màu nhạt của chính nhóm, không đổi theo màu đậm banner
phía trên — sửa đồng bộ `rp-server/lib/exportExcel.js` (tách
`topArgb`/`leafArgb`, trước đó dùng chung 1 biến khiến dòng lá bị nhuộm
nhầm màu đậm), `rp-server/lib/exportPdf.js` (thêm solo super-group vào
`coveredSuper` để không bị vẽ đè mất chữ trắng), `rp-user/src/components/
DataTable.jsx` (`buildSuperHeader()` đánh dấu `solo`, bỏ render dòng
nhãn nhóm cấp 2 khi solo, dựa vào `rowSpan` trình duyệt tự đẩy). Verify
bằng PDF/Excel thật + script SSR (esbuild + `react-dom/server`) kiểm
`rowspan="2"` và không còn chữ lặp.

## 9.74 — Giữ nhãn "Giá trị hàng hỏng hủy", gộp banner liền mạch 3 dải màu + URL Voucher đa máy chủ

- **Báo cáo ngành hàng** (phản hồi demo bản 9.73): thử đổi ngắn gọn
  "Giá trị hàng hỏng hủy" → "Hàng hỏng hủy" rồi người dùng yêu cầu ĐỔI
  LẠI ngay ("À không giá trị cũng được nhưng tôi muốn bạn merge cái dòng
  ở trên cho đồng bộ liền mạch với hai dòng doanh thu và lãi gộp nhìn nó
  đẹp") — giữ nguyên nhãn gốc, thêm "Giá trị hàng hỏng hủy" làm
  `columnSuperGroups` thứ 3 (tự nó 1 nhóm, màu đậm riêng `8B2E2E`) thay
  vì để trống dòng banner tạo khoảng trắng đứt quãng giữa "Doanh thu"/
  "Lãi gộp" như bản 9.73 ban đầu.
- **Trang "Cấu hình Voucher" (api-admin)**: thêm cột "Đường dẫn API" tự
  tính URL theo `ConfigKey` mỗi dòng (`VoucherSettingsPage.jsx`), viết
  lại mục Voucher trong `HuongDanPage.jsx` (đang stale từ trước khi có
  nhiều máy chủ DSMART). Giải thích thêm với người dùng: định tuyến
  Voucher thuần theo URL path (`:configKey`), KHÔNG phụ thuộc
  `api.ConsumerVoucherAccess` (bảng đó chỉ phân quyền gọi, không định
  tuyến) — ứng dụng gọi phải tự chọn đúng URL.
- **`api-thong-bao-duong-dan-da-may-chu.md`**: tài liệu liệt kê đủ
  đường dẫn API hiện có (theo yêu cầu người dùng — "phải có 1 thông báo
  về đường dẫn của tất cả api... gửi cho đối tác"), kèm `.docx` đã gửi.
- **Ghim cột đầu bên trái khi cuộn ngang** (api-admin, etl-admin
  `DataTable.jsx`) — theo phản hồi người dùng về bảng "Đối tác API" khó
  đọc tên khi cuộn ngang trên desktop lẫn mobile; mirror cơ chế sticky-
  right đã có cho cột hành động.

## 9.73 — Banner "Doanh thu"/"Lãi gộp" 3 cấp cho báo cáo ngành hàng + Chỉ tiêu tách Bán lẻ/Bán buôn

**Theo yêu cầu người dùng** (gửi kèm `MAU_BAO_CAO_THEO_NGANH_HANG.xlsx`)
— "Bc theo ngành hàng bạn đang thiếu các tiêu đề như file này... có việc
nữa là bạn làm lại file mẫu import chỉ tiêu ngành hàng hcrc và ldtd tách
chỉ tiêu bán buôn, bán lẻ nhé và ko cần mã siêu thị đâu nhé":

- Thêm `definition.columnSuperGroups` — cấp tiêu đề thứ 3 (cao hơn
  `columnGroups` đã có), gộp 4 nhóm "Doanh thu — ..." dưới 1 banner
  "Doanh thu" và 4 nhóm "Lãi gộp — ..." dưới 1 banner "Lãi gộp" — opt-in,
  implement đối xứng ở `rp-server/lib/exportExcel.js`
  (`addReportSheet()`), `rp-server/lib/exportPdf.js` (`drawHeader()`),
  `rp-user/src/components/DataTable.jsx` (`buildSuperHeader()`). Sửa kèm
  `rp-server/routes/reports.js`/`jobs/reportEmailScheduler.js` — trước
  đó KHÔNG forward `columnGroups`/`columnSuperGroups` tính động từ
  runner sang bước xuất/gửi email (lỗi thật, không chỉ thiếu tính năng).
- **Chỉ tiêu ngành hàng** (`etl/lib/salesTargetsImport.js`,
  `etl/routes/admin/salesTargets.js`, `etl/server.js`,
  `etl-admin/src/pages/SalesTargetsPage.jsx`): file mẫu MỚI tách riêng
  `ChiTieuDoanhThuBanLe`/`ChiTieuDoanhThuBanBuon`/`ChiTieuLaiGopBanLe`/
  `ChiTieuLaiGopBanBuon` (thay 2 cột `ChiTieuDoanhThu`/`ChiTieuLaiGop`
  cũ), BỎ cột `MaSieuThi` (opt-in `genericNoStoreCode=true`, không ảnh
  hưởng các import "theo bảng" khác dùng chung lib này).
- **DỮ LIỆU CŨ KHÔNG TƯƠNG THÍCH** — Chỉ tiêu đã nhập theo mẫu cũ (1 cột
  Total) CẦN NHẬP LẠI theo mẫu mới (2 cột Bán lẻ/Bán buôn riêng) mới có
  số ở các cột "Bán lẻ"/"Bán buôn" của "% so chỉ tiêu" — người dùng CHƯA
  xác nhận đã nhập lại.
- Sticky cột đầu (xem mục 9.74) code ra CÙNG ngày nhưng gộp chung 1 bản
  ở đây theo đúng thứ tự commit thật.

## 9.72 — Sửa thiếu bước "npm run build" cho api-admin ở hướng dẫn triển khai gộp 9.59-9.68

**Theo lỗi thật người dùng gặp**: sau khi làm theo `Hướng dẫn triển khai
gộp — bản 9.59 đến 9.68.md` (Phần 1 — Voucher redeem nhiều máy chủ
DSMART, thêm chi nhánh "Fuji"), trang "Cấu hình Voucher" ở api-admin vẫn
hiện giao diện CŨ (1 dropdown "Nguồn dữ liệu" + nút "Lưu", không phải
danh sách nhiều dòng/ConfigKey của bản 9.59) — bấm "Lưu" báo lỗi:

```
Phản hồi không phải JSON (Content-Type: text/html; charset=utf-8) —
kiểm tra cấu hình proxy /admin
```

**Nguyên nhân**: tài liệu hướng dẫn gốc chỉ ghi "Khởi động lại
`api-server` và `api-admin`" — THIẾU bước `npm run build` cho
`api-admin`. `api-admin` là ứng dụng React (SPA, build ra `dist/` tĩnh —
giống `rp-user`), restart tiến trình phục vụ `dist/` CŨ không áp dụng
được code frontend MỚI (`VoucherSettingsPage.jsx` bản 9.59,
`RealtimeEndpointsPage.jsx` bản 9.62) — giao diện vẫn hiện bản CŨ, gọi
API theo "hình dạng" cũ (route `PUT /admin/voucher-settings` không có
`:configKey`) trong khi backend `api-server` ĐÃ đổi sang route mới
(`PUT /admin/voucher-settings/:configKey`) — request rơi vào 404 mặc
định của Express (trả về HTML "Cannot PUT ..."), đúng khớp lỗi "Phản hồi
không phải JSON" (`api-admin/src/lib/api.js`, cơ chế phát hiện lỗi này
đã thêm từ bản 8.74).

**Sửa**: bổ sung bước `cd api-admin && npm run build` vào ĐÚNG TRƯỚC
bước "Khởi động lại `api-server` và `api-admin`" ở CẢ Phần 1 (bản
9.59-9.61) VÀ Phần 2 (bản 9.62 — `RealtimeEndpointsPage.jsx` cũng đổi,
cùng lỗi tiềm ẩn) của `Hướng dẫn triển khai gộp — bản 9.59 đến 9.68.md`
(và `.docx` tương ứng, đã tạo lại từ file `.md` đã sửa).

**Lưu ý triển khai ngay cho server đang bị chặn bởi lỗi này**:
```bash
cd api-admin && npm run build
# rồi khởi động lại api-server và api-admin như bình thường
```

## 9.71 — Sửa CHECK constraint CK_ReportCatalog_SourceType thiếu 'nganhHangBrg'

**Theo lỗi thật người dùng gặp** khi chạy `node scripts/seedNganhHangReports.js`
trên server (đang triển khai Phần 3 của bản 9.63/9.67/9.68 — 2 báo cáo
"Doanh thu theo ngành hàng"/"(LDTD)" định dạng mới 3 khối BRG/LFL/NSO):

```
Lỗi: The UPDATE statement conflicted with the CHECK constraint
"CK_ReportCatalog_SourceType". The conflict occurred in database
"HCRC_RP", table "app.ReportCatalog", column 'SourceType'.
```

**Nguyên nhân**: `rp-db/schema.sql` có CHECK constraint giới hạn các giá
trị hợp lệ của cột `app.ReportCatalog.SourceType` — khi bản 9.63 thêm
`SourceType='nganhHangBrg'` (dùng cho 2 báo cáo doanh thu theo ngành
hàng định dạng mới), **quên cập nhật danh sách trong constraint này**
(CÙNG LỖI đã xảy ra 1 lần ở bản 8.75 với `'stockThreshold'`/`'stockAlert'`
— lúc đó đã rút kinh nghiệm nhưng vẫn lặp lại ở bản 9.63). Bất kỳ CSDL
nào ĐÃ áp constraint cũ (tạo từ trước bản 9.71) sẽ bị SQL Server từ chối
ngay khi script `seedNganhHangReports.js` cố UPDATE `SourceType` sang
`'nganhHangBrg'`.

**Sửa**: `rp-db/schema.sql` — thêm `'nganhHangBrg'` vào CHECK constraint
`CK_ReportCatalog_SourceType` (đoạn code DROP + ADD lại constraint đã có
sẵn từ bản 8.75, chỉ cần bổ sung đúng giá trị còn thiếu). Đã soát lại
TOÀN BỘ danh sách `SourceType` thật đang dùng trong
`rp-server/scripts/*.js` để xác nhận không còn giá trị nào khác bị thiếu.

**Triển khai ngay** (không cần đợi `git pull` đầy đủ nếu đang bị chặn
giữa chừng) — DBA chạy trực tiếp trên CSDL `HCRC_RP` (rp-db):

```sql
ALTER TABLE app.ReportCatalog DROP CONSTRAINT CK_ReportCatalog_SourceType;
ALTER TABLE app.ReportCatalog ADD CONSTRAINT CK_ReportCatalog_SourceType
    CHECK (SourceType IN ('directDb', 'apiReport', 'apiRealtime', 'externalApi', 'composite', 'topZeroStock', 'coreZeroStock', 'stockThreshold', 'stockAlert', 'purchaseOrder', 'nganhHangBrg'));
```

Sau đó chạy lại `node scripts/seedNganhHangReports.js` ở `rp-server` —
sẽ qua được bước UPDATE. Về lâu dài nên `git pull origin main` rồi chạy
lại NGUYÊN VĂN `rp-db/schema.sql` (idempotent, an toàn chạy lại) để CSDL
khớp đúng repo, không chỉ patch tay đoạn constraint này.

## 9.70 — Sửa lỗi "mã Điểm không ra tên" khi siêu thị chưa có doanh thu trong ngày

**Theo báo cáo người dùng** (ảnh chụp email "FW: Báo cáo doanh thu LĐTĐ" —
cột "Siêu thị/Cửa hàng" hiện mã số thay vì tên cho 1 số dòng, thỉnh thoảng
xảy ra) — người dùng xác nhận nguyên nhân: siêu thị đang **kiểm kê, chưa
bắt đầu bán hàng trong ngày** nên chưa có dòng doanh thu nào, nhưng TÊN
vẫn phải hiện đúng vì đó là thông tin TĨNH (không phụ thuộc hôm đó có bán
được gì hay chưa).

**Nguyên nhân**: `remapRowsToDiem()` (`rp-server/lib/diemStkMapping.js`)
BỎ QUA HẲN mã Điểm nào CHƯA có dòng doanh thu khớp mã kho đã khai
(`matchedRows` rỗng) — khối `current` (hoặc `lastYear`) biến mất hoàn
toàn cho mã Điểm đó, kéo theo cột "Siêu thị/Cửa hàng" (đọc
`current.dimensions.tenSieuThi`) rơi về hiện MÃ ĐIỂM thô (`||` fallback
trong formula), dù dòng đó vẫn hiện trên báo cáo (nhờ có dòng Chỉ tiêu
riêng, không phụ thuộc `current`). Lỗi xảy ra ở CẢ 2 báo cáo
`bc-doanh-thu-ldtd`/`bc-doanh-thu-hcrc` (dùng chung hàm này), và cả nhóm
MART/MINIMART như nhau (đã xác nhận bằng cách đọc code, không phải do
khác biệt cấu hình giữa 2 nhóm).

**Đã loại trừ qua điều tra**: không phải lỗi tên cột Excel lúc nhập
"Ánh xạ Điểm - STK_ID" (đã đọc trực tiếp file người dùng tải lên — header
khớp chính xác `TenSieuThi`, dữ liệu tên/`LoaiChuoi` đã đầy đủ cho đúng
các mã bị báo lỗi, không có xung đột STK_ID trong file đó).

**Sửa**: `remapRowsToDiem()` không `continue` bỏ qua nữa khi
`matchedRows` rỗng (mã Điểm ĐÃ khai mã kho cho kỳ này, chỉ là CHƯA có
dòng doanh thu) — vẫn gán đúng `dimensions.tenSieuThi`/`dimensions.chain`
từ bảng ánh xạ (dữ liệu tĩnh, không cần `matchedRows`), còn `measures`
giữ nguyên rỗng `{}` — các cột đo lường (doanh thu, tỷ lệ đạt,...) đọc ra
vẫn `undefined`/"không có dữ liệu" giống Y HỆT trước đây khi khối
`current` vắng mặt hoàn toàn, KHÔNG đổi hành vi "chưa có dữ liệu ≠ số 0"
đã làm từ bản cũ. Hiệu ứng phụ (có lợi): các dòng này trước đây có thể
rơi vào nhóm "không khớp nhóm nào" (do `current.dimensions.chain` cũng
vắng mặt) — giờ nhóm đúng MART/MINIMART theo `LoaiChuoi` đã khai.

Hàm này dùng chung cho `bc-doanh-thu-ldtd`, `bc-doanh-thu-hcrc` và
`bc-top5-chi-nhanh` (`useDiemStkMapping: true`) — cả 3 đều được fix.

Đã viết script mô phỏng trực tiếp `remapRowsToDiem()` với 1 mã Điểm có
dòng doanh thu và 1 mã Điểm chưa có dòng nào, xác nhận tên/chain hiện
đúng cho cả 2 trường hợp, `measures` rỗng đúng cho mã chưa có dữ liệu.

Không cần deploy thêm bước nào ngoài build/restart `rp-server` bình
thường — không đổi schema CSDL, không đổi file cấu hình.

## 9.69 — Đổi phông chữ báo cáo sang Inter (web + Excel + PDF)

**Theo yêu cầu người dùng** — "Bạn xem có thể tham khảo phông chữ ở một
báo cáo của một cái đơn vị quốc tế nào đó nó chuyên nghiệp hơn... Tôi
thấy cái phông này nó hơi xấu." Demo 4 lựa chọn qua Artifact (phông hiện
tại/Inter/IBM Plex Sans/Be Vietnam Pro, cùng 1 bảng mẫu báo cáo ngành
hàng để so sánh thật) — người dùng chọn **Inter**.

- **Web (rp-user)**: tự lưu trữ Inter qua gói `@fontsource/inter` (KHÔNG
  tải từ fonts.googleapis.com lúc chạy — tránh phụ thuộc mạng ngoài,
  nhất quán với cách PDF tự lưu trữ font), chỉ import 5 cỡ chữ thật dùng
  (400/500/600/700/800). `styles.css` đổi `body { font-family }` từ
  `system-ui` sang `'Inter', system-ui, ...` (fallback nếu font chưa tải
  kịp/lỗi mạng). Kiểm tra qua Playwright: `getComputedStyle` ra đúng
  `Inter`, trình duyệt chỉ tải ĐÚNG bộ ký tự (Latin/Latin Extended/
  Vietnamese) thật xuất hiện trên trang (không tải thừa cyrillic/greek/…
  dù khai đủ trong CSS), không lọt vào PWA precache (woff2 không nằm
  trong `globPatterns` mặc định của `vite-plugin-pwa`).
- **Excel (rp-server/lib/exportExcel.js)**: helper `fontName()` gộp
  `name: 'Inter'` vào MỌI nơi set `cell.font =` (9 nơi, kể cả dòng dữ
  liệu THƯỜNG ở báo cáo PHẲNG — trước đây không set font nào, rơi về
  Calibri mặc định ExcelJS). **Lưu ý khác PDF**: Excel chỉ ghi TÊN font
  vào file — máy mở file PHẢI có cài Inter mới hiện đúng, không có thì
  Excel tự thay font mặc định của máy đó (không lỗi, chỉ không đổi giao
  diện).
- **PDF (rp-server/lib/exportPdf.js)**: đổi font nhúng từ Noto Sans
  Vietnamese sang Inter — gói `@openfonts/inter_vietnamese` (CÙNG cách
  tự lưu trữ, chỉ đổi tên gói/file, không đổi cơ chế nhúng qua
  `@pdf-lib/fontkit`). Đã kiểm tra font này mã hoá đủ CẢ chữ ASCII
  thường LẪN dấu thanh tiếng Việt trước khi đổi (script thử
  `embedFont`/`widthOfTextAtSize` với chuỗi hỗn hợp).
- Xoá dependency `@openfonts/noto-sans_vietnamese` (rp-server) không còn
  dùng.
- Build-check rp-user (`npm run build`, không lọt vào precache) +
  syntax-check `exportExcel.js`/`exportPdf.js` + sinh thử PDF/Excel thật
  bằng dữ liệu mẫu (kiểm `cell.font.name === 'Inter'` đọc lại qua
  ExcelJS, render PDF qua `pdftoppm` xem ảnh) + Playwright screenshot
  trang đăng nhập — đều PASS.

## 9.68 — Bán lẻ/Bán buôn + Giá trị hàng hỏng hủy cho 2 báo cáo doanh thu theo ngành hàng

**Theo yêu cầu người dùng** — "Trong bản trans bạn đã làm doanh thu cuối
ngày có tổng bán buôn và bán lẻ đó. Bảng trans có cột trans_code để phân
biệt bán buôn và bán lẻ. Bán buôn là mã 211, trả lại bán buôn 212 và bán
lẻ mã 221, trả lại bán lẻ 222, hỏng hủy ở giao dịch 318 cũng cột
trans_code... Bạn xử lý tiếp báo cáo doanh thu theo ngành hàng ldtd và
hcrc đi nhé". Demo (Artifact) 3 vòng trước khi code, sửa theo đúng góp ý:
format phải khớp file mẫu Excel (Kênh là CỘT con từng chỉ số, không tách
dòng), rồi thêm cột "Giá trị hàng hỏng hủy" + Lãi gộp Bán lẻ trừ hàng
hỏng hủy, rồi đổi cột "Khối" sang dòng tiêu đề ngang merge hết cột.

- **VIEW** `V_HCRC_DOANHTHU_NGANHHANG` (Live `DSMART16` + Lịch sử
  `DSMART16_EOM`) — thêm 5 cột `DoanhThuBanLe`/`DoanhThuBanBuon`
  (211/212, 221/222), `LaiGopBanLe`/`LaiGopBanBuon` (cùng mã), và
  `GiaTriHongHuy` (mã 318) — GIẢI QUYẾT hẳn mục 8 "🔴 BLOCKED" của bản
  9.63/9.66 (tưởng cần VIEW riêng, hoá ra cùng nguồn STRANS/STK_ID với
  doanh thu).
- **ETL** `etl/scripts/seedNganhHangSync.js` — thêm 5 measureColumns mới
  vào domain `doanhthu_nganhhang` đã có — XOÁ hẳn
  `etl/scripts/seedHangHongHuySync.js`/domain `hanghonghuy_nganhhang`
  riêng (chưa từng chạy được, luôn rỗng vì thiếu nguồn).
- **`rp-server/lib/nganhHangBrgRunner.js`** — viết lại hoàn toàn: 30 cột
  (3 ID + 8 chỉ số × 3 kênh Total/Bán lẻ/Bán buôn + 1 nhóm "Giá trị hàng
  hỏng hủy" × 3 kênh); hàng hỏng hủy gán hết cho kênh Bán lẻ (Bán buôn =
  0, giả định "bán buôn thường không có hàng hỏng hủy"); mã 232 chỉ cộng
  vào "Total" (giả định); "Lãi gộp — Giá trị" Bán lẻ/Bán buôn ĐÃ TRỪ hàng
  hỏng hủy kênh đó, Total = Bán lẻ + Bán buôn (đã trừ); "Tỷ lệ" lãi gộp
  Total chia theo Doanh thu cuối ở CẢ 3 khối (trước chỉ BRG); bỏ cột
  "Khối", thay bằng dòng tiêu đề ngang `__isSectionHeader`.
- **Hạ tầng dùng chung** (opt-in, KHÔNG ảnh hưởng báo cáo khác) —
  `rp-server/lib/reportCellFormat.js` (`computeSttValues`/
  `computeZebraFlags` bỏ qua dòng `__isSectionHeader`),
  `rp-user/src/components/DataTable.jsx`/`rp-server/lib/exportExcel.js`/
  `rp-server/lib/exportPdf.js` (vẽ dòng tiêu đề ngang merge hết cột khi
  `row.__isSectionHeader === true`).
- Build-check rp-user (`npm run build`) + syntax-check mọi file backend
  đã sửa + mock test `nganhHangBrgRunner.js` (giả lập 2 STK_ID, kiểm
  LFL/NSO/BRG, Bán lẻ/Bán buôn, hàng hỏng hủy, dòng tiêu đề ngang, STT) —
  đều PASS.
- Cập nhật `báo cáo doanh thu-nhập hàng theo ngành hàng.md` (mục 1/2/3/5/
  8 viết lại, mục 8 đổi từ 🔴 BLOCKED sang ✅ GIẢI QUYẾT) +
  `hướng_dẫn_báo_cáo.md` mục 17 (bỏ ghi chú "còn 1 việc chưa chốt").
- **2 giả định CHƯA xác nhận cuối cùng với DBA** (đã nêu rõ với người
  dùng lúc demo, chỉ cần sửa `nganhHangBrgRunner.js` nếu sai, không đụng
  VIEW/ETL): (1) mã 232 không tách kênh; (2) hàng hỏng hủy gán hết Bán lẻ.

## 9.67 — SỬA LẠI bản 9.63: gộp định dạng ngành hàng mới vào 2 báo cáo đã có (không tách báo cáo thứ 3)

**Theo yêu cầu người dùng** — bản 9.63 ban đầu dựng 1 báo cáo THỨ 3 riêng
"(BRGMART)" cho định dạng mới (3 khối + Lãi gộp + hàng hỏng hủy). Người
dùng yêu cầu sửa lại ngay: "Bạn đừng tách bc nhé... cần bạn cập nhật hai
báo cáo này thôi: 1. Báo cáo doanh thu theo ngành hàng, 2. Báo cáo doanh
thu theo ngành hàng (LDTD)... Hai báo cáo này đã có nhập chỉ tiêu riêng...
mã NSO sẽ được cập nhật chung từ file upload vào báo cáo này".

**Thay đổi**:
- `rp-server/lib/nganhHangBrgRunner.js` — BỎ hằng số `TARGET_DOMAIN`
  hardcode (`sales-targets-nganhhang-dt-brgmart`), đọc từ
  `definition.targetDomain` — thiếu field này thì throw lỗi rõ ràng ngay
  (không âm thầm chạy sai).
- `rp-server/scripts/seedNganhHangReports.js` — VIẾT LẠI: 2 báo cáo
  `bc-doanh-thu-nganhhang`/`bc-doanh-thu-nganhhang-ldtd` chuyển sang
  `SourceType='nganhHangBrg'` (định dạng mới), MỖI báo cáo GIỮ NGUYÊN
  `targetDomain` riêng đã có (`sales-targets-nganhhang-dt`/
  `sales-targets-nganhhang-dt-ldtd` — KHÔNG gộp chung, KHÔNG tạo domain
  Chỉ tiêu mới nào khác). `bc-nhap-hang-nganhhang` GIỮ NGUYÊN
  `SourceType='composite'` cũ, không đổi.
- **XOÁ** `rp-server/scripts/seedNganhHangBrgReport.js` (script tạo báo
  cáo thứ 3 — không còn cần, chưa từng chạy trên server thật).
- **XOÁ** trang Chỉ tiêu "BRGMART" riêng (`sales-targets-nganhhang-dt-brgmart`)
  — `etl/server.js`/`etl-admin/src/App.jsx`/`etl-admin/src/components/Layout.jsx`/
  `etl/routes/admin/roles.js`. Thay vào đó, thêm cột mẫu `ChiTieuLaiGop`
  vào CHÍNH 2 trang Chỉ tiêu Doanh thu theo ngành hàng ĐÃ CÓ (không đổi
  code — cơ chế field-động `parseGenericShape()` đã tự nhận mọi tên cột
  từ trước, chỉ đổi cột mẫu hiển thị gợi ý trên giao diện).
- **"Siêu thị NSO"** (bảng `etl.NsoStores`, trang etl-admin) — GIỮ
  NGUYÊN, vẫn dùng CHUNG cho cả 2 báo cáo doanh thu (đúng yêu cầu người
  dùng), chỉ sửa lại chú thích code (không còn gắn riêng với "BRGMART").
- Gộp lại tài liệu: xoá `báo cáo doanh thu-lãi gộp theo ngành hàng
  BRGMART.md` và `bc-doanh-thu-nganhhang-ldtd.md` (tách riêng không còn
  đúng — 3 báo cáo nay lại dùng CHUNG 1 tài liệu), viết lại đầy đủ `báo
  cáo doanh thu-nhập hàng theo ngành hàng.md` mô tả đúng cơ chế mới. Cập
  nhật bảng "Danh mục báo cáo" (`hướng_dẫn_báo_cáo.md` mục 17).
- Cập nhật lại `deploy/Hướng dẫn triển khai gộp — bản 9.59 đến 9.67.md`
  (đổi tên từ "...đến 9.66", gộp Phần 3/4 cũ thành 1 Phần 3 duy nhất mô
  tả ĐÚNG bước triển khai cuối cùng, không cần trải qua bản lỗi giữa
  chừng).
- Đã kiểm chứng bằng mock test riêng (4 nhóm assertion pass): `targetDomain`
  đọc đúng từ `definition` (không hardcode), 2 báo cáo dùng CHUNG 1
  runner nhưng ra Chỉ tiêu ĐỘC LẬP đúng domain riêng, thiếu `targetDomain`
  báo lỗi rõ ràng thay vì âm thầm sai.
- Build-check `etl-admin` (vite build) pass.

## 9.66 — Xác nhận: DSMART CHƯA có nguồn dữ liệu hàng hỏng hủy (BRGMART)

**Theo xác nhận của người dùng** — view `V_HCRC_HANGHONGHUY_NGANHHANG`
(bản 9.63) KHÔNG tồn tại, và DSMART hiện KHÔNG lưu dữ liệu hàng hỏng hủy ở
bất kỳ đâu (không phải chỉ thiếu VIEW gộp — thiếu hẳn nguồn gốc). Người
dùng đang tự kiểm tra bảng/nghiệp vụ nào (nếu có) ghi nhận việc này.

**Thay đổi**: chỉ cập nhật tài liệu `báo cáo doanh thu-lãi gộp theo ngành
hàng BRGMART.md` mục 2 — đánh dấu rõ BLOCKED, không còn coi view là "đã
có sẵn" như giả định ban đầu lúc thu thập yêu cầu. KHÔNG đổi code — đã
xác nhận hành vi hiện tại (domain `hanghonghuy_nganhhang` không có job
đồng bộ/không có dữ liệu) tự động làm "Giá trị hàng hỏng hủy" ra `0`
(không phải trống "—") ở khối "Toàn hệ thống BRG", "Doanh thu cuối" =
Thực đạt, Tỷ lệ lãi gộp tự dùng đúng Thực đạt làm mẫu số — báo cáo vẫn
chạy đúng với mọi cột khác, không cần sửa gì thêm cho tới khi có nguồn
dữ liệu thật.

**Theo yêu cầu người dùng** — "Mỗi một báo cáo phải làm một hướng dẫn
riêng... sau này tôi còn dựa vào đấy tôi có thể thực hiện nếu là tôi
chuyển server... hướng dẫn tổng hợp thì cũng có một hướng dẫn tổng hợp".
Rà soát phát hiện 4/21 báo cáo hiện có CHƯA có file hướng dẫn riêng (dù
quy tắc này đã nêu từ mục 12 `hướng_dẫn_báo_cáo.md` nhưng chưa được tuân
thủ đầy đủ với các báo cáo tạo gần đây).

**Thay đổi**:
- `CLAUDE.md` — thêm quy ước BẮT BUỘC mới: mọi báo cáo (có/sẽ có) PHẢI có
  1 file `.md` riêng (nghiệp vụ/nguồn dữ liệu/các bước triển khai/cách
  kiểm tra) + cập nhật mục "Danh mục báo cáo" trong `hướng_dẫn_báo_cáo.md`.
- `hướng_dẫn_báo_cáo.md` — thêm mục 17 "Danh mục báo cáo": bảng tổng hợp
  TOÀN BỘ 21 `ReportId` hiện có, trỏ đúng file hướng dẫn riêng từng cái —
  đây CHÍNH LÀ "hướng dẫn tổng hợp" người dùng yêu cầu.
- 4 file hướng dẫn riêng MỚI (trước đây thiếu):
  - `bc-doanh-thu-nganhhang-ldtd.md` — ngắn gọn, trỏ sang file ngành hàng
    gốc cho phần dùng chung (VIEW/job), chỉ nêu điểm khác (domain Chỉ
    tiêu riêng).
  - `bc-canh-bao-ton.md` — ngắn gọn, trỏ sang `bc-ton-kho-0.md` cho phần
    dùng chung (2 domain `banhang_sku`/`tonkho_sku`), nêu riêng cách khai
    ngưỡng cảnh báo.
  - `bc-ton-kho-nguong.md` — tương tự, nêu riêng 2 bộ lọc "Mức tồn kiểm
    tra"/"Chi nhánh".
  - `báo cáo doanh thu-lãi gộp theo ngành hàng BRGMART.md` — đầy đủ (yêu
    cầu nghiệp vụ, nguồn dữ liệu, cơ chế tính, định nghĩa báo cáo, kiểm
    tra) — mục 8 còn 1 việc CHƯA chốt (SQL thật của view
    `V_HCRC_HANGHONGHUY_NGANHHANG`, đã hỏi lại người dùng, chưa có câu trả
    lời) ghi rõ TRONG file, không chặn các phần còn lại.

## 9.64 — Sửa lỗi THẬT: "Tỷ lệ" lãi gộp (BRGMART) phải tính trên Doanh thu CUỐI, không phải Thực đạt thô

**Theo yêu cầu người dùng** — bản 9.63 ban đầu tính cột "Tỷ lệ" trong
cụm Lãi gộp bằng Giá trị lãi gộp ÷ Thực đạt (doanh thu TRƯỚC khi trừ
hàng hỏng hủy), trong khi đúng nghiệp vụ phải chia cho Doanh thu CUỐI
(= Thực đạt − Giá trị hàng hỏng hủy) — người dùng phát hiện ngay khi xem
demo ("Lãi gộp bạn tính theo doanh thu cuối đúng không?" → "phải tính
theo doanh thu cuối cùng chứ, đã trừ hàng hồng hủy đi rồi chứ").

**Thay đổi**: `rp-server/lib/nganhHangBrgRunner.js`:
- Khối "Toàn hệ thống BRG" (nơi DUY NHẤT có "Doanh thu cuối" — xem bản
  9.63) — cột "Tỷ lệ" nay = Giá trị lãi gộp ÷ Doanh thu cuối × 100 (thay
  vì ÷ Thực đạt). Áp dụng cho CẢ 12 dòng ngành hàng lẫn dòng "Tổng cộng
  Toàn hệ thống BRG".
- Khối "LFL"/"NSO" — KHÔNG có khái niệm "Doanh thu cuối" riêng (hàng
  hỏng hủy không tách được theo siêu thị, để trống "—") — GIỮ NGUYÊN
  chia cho Thực đạt (coi như hàng hỏng hủy = 0 ở 2 khối đó, đúng bằng
  "Doanh thu cuối" nếu có).
- KHÔNG đổi: "Giá trị" lãi gộp tuyệt đối (lấy thẳng từ cột `LaiGop` đã
  đồng bộ, không liên quan Doanh thu cuối), cột "% so chỉ tiêu" và "%
  so cùng kỳ năm trước" của Lãi gộp (so sánh GIÁ TRỊ lãi gộp, không phải
  tỷ lệ phần trăm trên doanh thu).
- Đã kiểm chứng bằng mock test riêng cho fix này (9 assertion pass):
  khối BRG chia đúng cho Doanh thu cuối, khối LFL vẫn chia cho Thực đạt,
  3 cột còn lại (Giá trị/% so chỉ tiêu/% so cùng kỳ) không bị ảnh hưởng.
- Cập nhật lại demo đã gửi người dùng (cùng link artifact, thêm banner
  giải thích đã sửa).
- CHƯA cần chạy lại script seed/migration nào — chỉ sửa công thức tính
  tại chỗ, không đổi schema/domain/báo cáo catalog.

## 9.63 — Báo cáo "Doanh thu, lãi gộp theo ngành hàng" (BRGMART) theo mẫu Excel mới + "Siêu thị NSO"

**Theo yêu cầu người dùng** — sửa lại báo cáo doanh thu ngành hàng theo
đúng mẫu Excel BRGMART đã gửi (`MAU_BAO_CAO_THEO_NGANH_HANG.xlsx`): tách
3 khối lặp lại "Toàn hệ thống BRG"/"LFL"/"NSO" cho CÙNG 12 ngành hàng
(mã tăng dần), thêm cụm "Lãi gộp" và cột "Giá trị hàng hỏng hủy"/"Doanh
thu cuối" (= Doanh thu − hàng hỏng hủy). Đã gửi demo và được xác nhận
("Tôi xác nhận bạn làm nhé") trước khi code — xem các câu hỏi/trả lời đã
chốt: chưa tách Bán lẻ/Bán buôn (chờ DBA), LFL/NSO phân loại qua 1 trang
khai báo MỚI ("Siêu thị NSO", đủ bộ nút như "Ánh xạ Điểm - STK_ID"),
"Giá trị hàng hỏng hủy" đồng bộ tự động từ DSMART
(`V_HCRC_HANGHONGHUY_NGANHHANG`), và CHỈ hiện 2 cột hàng hỏng hủy/Doanh
thu cuối ở khối "Toàn hệ thống BRG" (LFL/NSO để trống "—", vì hỏng hủy
không tách được theo siêu thị).

**Thay đổi**:
- Báo cáo mới RIÊNG (`SourceType='nganhHangBrg'`, KHÔNG đụng báo cáo
  "Doanh thu theo ngành hàng" gốc/LDTD đã có) — `rp-server/lib/nganhHangBrgRunner.js`
  (dedicated runner, mirror `purchaseOrderRunner.js`): đọc domain
  `doanhthu_nganhhang` (đã có `STK_ID`+`LaiGop` sẵn từ trước, không cần
  đồng bộ mới cho phần này), phân loại từng `STK_ID` thành LFL/NSO qua
  "Ánh xạ Điểm - STK_ID" + danh sách "Siêu thị NSO" mới (mã Điểm KHÔNG
  khai/đang khoá ở "Siêu thị NSO" MẶC ĐỊNH là LFL), tính Chỉ tiêu/Lãi gộp/
  % so cùng kỳ riêng từng khối, cộng dồn "Giá trị hàng hỏng hủy" theo tên
  ngành hàng (CHỈ ở khối "Toàn hệ thống BRG").
  `rp-server/scripts/seedNganhHangBrgReport.js` tạo bản ghi
  `app.ReportCatalog` (`bc-doanh-thu-nganhhang-brgmart`).
- `etl/scripts/seedHangHongHuySync.js` (MỚI) — job đồng bộ domain
  `hanghonghuy_nganhhang` từ view `V_HCRC_HANGHONGHUY_NGANHHANG`
  (cột `GiaTriHongHuy`/`NganhHang`/`NgayGhiNhan`, `NganhHang` là TÊN —
  phải khớp (sau `.trim()`) đúng tên 12 ngành hàng hardcode trong
  `nganhHangBrgRunner.js`, không khớp sẽ ra 0 thầm lặng cho ngành hàng đó).
- Chỉ tiêu riêng cho báo cáo này — trang etl-admin MỚI "Chỉ tiêu Doanh
  thu/Lãi gộp theo ngành hàng (BRGMART)" (`sales-targets-nganhhang-dt-brgmart`,
  domain Chỉ tiêu RIÊNG, không đụng Chỉ tiêu báo cáo gốc/LDTD), thêm field
  `ChiTieuLaiGop` bên cạnh `ChiTieuDoanhThu` sẵn có (dùng luôn cơ chế
  field-động của `etl/lib/salesTargetsImport.js:parseGenericShape()`,
  KHÔNG cần đổi schema/import code).
- "Siêu thị NSO" (MỚI, theo yêu cầu người dùng — đủ bộ nút như "Ánh xạ
  Điểm - STK_ID"): bảng `etl.NsoStores` (MaDiem/TenSieuThi/IsActive) +
  `etl/lib/nsoStoresImport.js` (nhập/xuất Excel) +
  `etl/routes/admin/nsoStores.js` (CRUD/khoá-kích hoạt/chọn nhiều-xoá
  hàng loạt theo đúng quy ước CLAUDE.md) + trang etl-admin
  `NsoStoresPage.jsx` + `rp-server/lib/nsoStores.js` (đọc cache 60s qua
  pool `ETL_DIEM_STK`, lỗi kết nối trả Set rỗng — KHÔNG làm sập báo cáo).
  `etl-db/grants.sql` thêm `GRANT SELECT ON etl.NsoStores TO etl_diem_stk_reader;`
  (CẦN chạy lại trên CSDL thật).
- `etl/routes/admin/roles.js` + `etl-admin` (`App.jsx`/`Layout.jsx`) —
  thêm 2 MenuCode mới `nso-stores`/`sales-targets-nganhhang-dt-brgmart`
  vào danh mục phân quyền + điều hướng — CHƯA gán quyền xem cho vai trò
  nào, admin tự làm sau.
- `rp-server/lib/compositeReportRunner.js` — lộ thêm (additive, không đổi
  gì hành vi cũ) 3 hàm nội bộ `fetchAllReportRows`/`remapEntityCode`/
  `aggregateDailyRowsByEntity` để runner mới tái dùng, không viết lại
  logic đọc `dwh.ReportFacts`.
- **Lưu ý thiết kế (khác bản demo hình ảnh ban đầu)**: bản demo trước khi
  xác nhận có vẽ 3 khối bằng dòng tiêu đề riêng (gộp ngang/colSpan). Hạ
  tầng hiển thị/xuất dùng chung (`DataTable.jsx`/`exportExcel.js`/
  `exportPdf.js`) CHƯA hỗ trợ dòng tiêu đề gộp ngang trong THÂN bảng (chỉ
  hỗ trợ gộp ở HEADER qua `columnGroups`) — để KHÔNG phải sửa 3 file dùng
  chung cho nhiều báo cáo khác (rủi ro ảnh hưởng ngoài phạm vi), bản thật
  dùng 1 CỘT "Khối" (Toàn hệ thống BRG/LFL/NSO) + dòng "Tổng cộng" riêng
  từng khối (tô màu đậm, cột TT tự đếm lại từ 1) thay cho dòng tiêu đề
  gộp ngang — cùng dữ liệu, chỉ khác cách trình bày phần phân khối.
- Đã kiểm chứng bằng mock test gọi THẲNG `runNganhHangBrgReport()` (mock
  DB/Ánh xạ/Chỉ tiêu/Siêu thị NSO, không đụng DSMART thật) — 24 assertion
  pass: phân loại đúng NSO/LFL qua Ánh xạ Điểm-STK_ID (kể cả STK_ID KHÔNG
  có ánh xạ → mặc định LFL), hàng hỏng hủy CHỈ cộng ở khối BRG (LFL/NSO
  = trống), Chỉ tiêu thiếu → trống (không phải 0/lỗi), TT reset đúng theo
  từng khối.
- Build-check `etl-admin` (vite build, 83 module) pass.
- CHƯA có số liệu THẬT cho tới khi: (1) tạo xong view
  `V_HCRC_HANGHONGHUY_NGANHHANG` trên DSMART16 + chạy
  `node etl/scripts/seedHangHongHuySync.js`, (2) chạy
  `node rp-server/scripts/seedNganhHangBrgReport.js`, (3) nhập Chỉ tiêu
  qua "Chỉ tiêu Doanh thu/Lãi gộp theo ngành hàng (BRGMART)", (4) khai
  "Siêu thị NSO" nếu có siêu thị mới mở, (5) chạy lại `etl-db/grants.sql`
  trên CSDL thật, (6) gán quyền xem báo cáo + 2 trang admin mới.

## 9.62 — API tra cứu voucher ĐÃ DÙNG cho đối tác ngoài (qua Endpoint realtime) + sửa lỗi khoá BARCODE còn sót

**Theo yêu cầu người dùng** — đối tác cần 1 API chỉ-đọc để tự lấy thông
tin voucher ĐÃ ĐƯỢC SỬ DỤNG về cập nhật hệ thống của họ, dùng cơ chế
"Endpoint realtime" đã có (KHÔNG đụng/đổi gì ở 2 route cố định
`/vouchers/check`/`redeem`, theo đúng yêu cầu người dùng "ko động vào
voucher redeem"). Trong lúc rà soát, phát hiện endpoint "voucher-check"
nội bộ (nhân viên tra thủ công) VẪN còn khoá theo `BARCODE` — CÙNG lỗi đã
sửa ở route `/check`/`redeem` từ bản 9.19 (cột `BARCODE` của `PMCRDINF`
THƯỜNG RỖNG trên dữ liệu thật) nhưng chưa bao giờ áp dụng sang endpoint
generic này — sửa luôn cho đồng bộ.

**Thay đổi**:
- `api-db/schema.sql` — thêm 4 cột NULLABLE vào `api.RealtimeEndpointDefs`:
  `KeyStripLeadingChar` (tổng quát hoá `normalizeCardId()` cho MỌI endpoint
  realtime, không riêng voucher) + `FilterColumn`/`FilterOperator`/
  `FilterValue` (chỉ cho xem dòng thoả 1 điều kiện, áp dụng CẢ tra 1 khoá
  lẫn `/list`). Cả 4 NULL = giữ ĐÚNG hành vi cũ, không ảnh hưởng endpoint
  đã tạo trước đó.
- `api-server/lib/realtimeEngine.js` — `runLookup()`/`runList()` áp dụng
  `stripLeadingChar()` (bỏ ký tự đầu nếu khớp) và `filterClause()` (thêm
  điều kiện WHERE) trước khi truy vấn — endpoint không khai 2 trường này
  thì hành vi KHÔNG đổi.
- `api-server/routes/admin/realtimeEndpoints.js` — validate/lưu 2 nhóm
  trường mới (Filter* phải khai ĐỦ cả 3 hoặc không khai gì; `FilterColumn`
  cũng được đối chiếu schema thật như các cột khác).
- `api-admin/src/pages/RealtimeEndpointsPage.jsx` — thêm 2 khối UI trong
  form tạo/sửa endpoint: "Mã quét/gửi lên thừa 1 ký tự đầu" + "Chỉ cho
  xem các dòng thoả 1 điều kiện".
- `api-server/scripts/seedVoucherCheckEndpoint.js` — SỬA LỖI: đổi khoá từ
  `BARCODE` sang `CARD_ID` + `KeyStripLeadingChar='C'` (nội bộ, nhân viên
  vẫn tra được MỌI trạng thái, không lọc).
- `api-server/scripts/seedVoucherRedeemedEndpoint.js` (MỚI) — seed
  endpoint `voucher-redeemed` CHỈ lộ voucher `STATUS=0` (đã dùng) cho đối
  tác ngoài, cấp quyền riêng qua "Đối tác" → "Realtime được gọi" (mặc định
  KHÔNG đối tác nào tự có quyền).
- `rp-server/scripts/seedVoucherCheckReport.js` — cập nhật cột/field báo
  cáo nội bộ "Tra cứu voucher" khớp đổi tên cột (`BARCODE`→`CARD_ID`).
- Đã kiểm chứng bằng mock test gọi THẲNG `runLookup()`/`runList()` thật
  (mock DB, không đụng DSMART thật) — 8/8 pass: bỏ ký tự `C` đúng, lọc
  đúng status ở CẢ 2 đường (tra 1 khoá lẫn danh sách), voucher chưa dùng
  bị chặn đúng ở endpoint lọc, endpoint KHÔNG lọc không đổi hành vi (không
  chèn điều kiện SQL nào).
- Viết tài liệu riêng cho đối tác: `api-voucher-redeemed-gui-doi-tac.md`.
- Cập nhật `hướng_dẫn_báo_cáo.md` mục 3/13/13.1 + `api-voucher-check-redeem.md`
  (thêm mục "Voucher đã dùng — cho đối tác NGOÀI").

## 9.61 — Bỏ hẳn script seed:voucher-datasource (chỉ dùng giao diện cho "Nguồn dữ liệu")

**Theo yêu cầu người dùng** — tiếp nối bản 9.60 (đã khuyên dùng giao diện
thay vì script cho máy chủ MỚI), người dùng yêu cầu bỏ LUÔN cả cách qua
`.env`/script cho cấu hình `default` — vì "Nguồn dữ liệu" giờ cấu hình
trên web rồi, giữ lại 2 đường (web + script/`.env`) cùng lúc dễ xung đột/
nhầm lẫn không cần thiết.

**Thay đổi**:
- Xoá hẳn `api-server/scripts/seedVoucherDataSource.js` và lệnh
  `npm run seed:voucher-datasource` (`api-server/package.json`).
- `api-server/.env.example` — bỏ hẳn khối biến `VOUCHER_DSMART16_SERVER/
  PORT/DATABASE/USER/PASSWORD/ENCRYPT/TRUST_CERT` (không còn gì đọc các
  biến này nữa).
- `api-server/scripts/seedVoucherCheckEndpoint.js` — chỉ sửa câu thông
  báo/comment (bỏ nhắc tới script đã xoá), hành vi KHÔNG đổi — vẫn tự tra
  "Nguồn dữ liệu" theo tên (`VOUCHER_DSMART16_NAME`, mặc định "DSMART16
  (Live) - Voucher"), chỉ khác giờ dòng đó PHẢI đã tạo sẵn qua api-admin.
- `api-voucher-check-redeem.md` — Bước 4 giờ CHỈ còn 1 cách DUY NHẤT
  (giao diện) cho MỌI cấu hình, kể cả `default`: "Nguồn dữ liệu" tạo
  dòng mới → "Cấu hình Voucher" chọn đúng dòng đó. Bỏ hết câu lệnh script
  khỏi bảng "Việc cần làm" và mục "Hỏi & đáp".
- `VERSION.md`/`deploy/Nhật ký triển khai...` bản 9.59/9.60 GIỮ NGUYÊN
  (lịch sử), không sửa lại — chỉ thêm mục mới này.

## 9.60 — Sửa hướng dẫn thêm máy chủ DSMART mới (bản 9.59): BỎ cách qua script, CHỈ dùng giao diện

**Theo phản hồi người dùng** — bản 9.59 có thêm biến
`VOUCHER_DSMART16_CONFIG_KEY` để chạy `seed:voucher-datasource` cho 1 máy
chủ KHÁC `default` (vd Fuji), nhưng script vẫn đọc server/user/password
qua ĐÚNG 1 bộ tên biến `VOUCHER_DSMART16_SERVER/USER/PASSWORD` dùng chung
cho mọi máy chủ — chạy cho Fuji nghĩa là phải SỬA LẠI 3 biến đó thành
thông tin Fuji trong `.env`, tự làm MẤT thông tin kết nối máy chủ
`default` đang lưu ở đó (không mất dữ liệu DB, nhưng mất chỗ lưu để chạy
lại script cho `default` lần sau) — dễ nhầm, đúng như người dùng chỉ ra.

**Thay đổi**: `api-server/scripts/seedVoucherDataSource.js` bỏ hẳn biến
`VOUCHER_DSMART16_CONFIG_KEY` — script CHỈ còn phụ trách ĐÚNG 1 dòng
`default` (đúng vai trò ban đầu: setup lần đầu không cần mở trình duyệt).
Thêm 1 máy chủ DSMART MỚI (vd "Fuji") giờ CHỈ làm qua giao diện — không
cần đụng `.env`/script: trang "Nguồn dữ liệu" tạo 1 dòng MỚI (mỗi dòng
đã tự lưu riêng server/user/password mã hoá của chính nó từ trước, không
chia sẻ gì với dòng khác), rồi "Cấu hình Voucher" trỏ vào đúng dòng đó —
đúng con đường "Cách 2" đã có sẵn ở bản 9.59, không cần code gì thêm.
Cập nhật `api-server/.env.example` + `api-voucher-check-redeem.md` khớp
đúng hướng dẫn mới.

## 9.59 — Voucher redeem nhiều máy chủ DSMART (vd thêm chi nhánh "Fuji")

**Theo yêu cầu người dùng** — thêm 1 máy chủ DSMART mới ("Fuji"), app
"HCRC Voucher Redemption" khi người dùng chọn "Fuji" trong app sẽ tự gọi
đúng server đó, còn mặc định (đối tác hiện tại) vẫn gọi đúng server/URL
CŨ, không cần đổi gì.

**Thay đổi**:
- `api-db/schema.sql` — `api.VoucherSettings` từ 1 dòng DUY NHẤT (Id=1)
  thành DANH SÁCH theo `ConfigKey` (migration `sp_rename` giữ nguyên
  `DataSourceId` cũ vào dòng `default`, an toàn chạy lại nhiều lần). Thêm
  `api.ConsumerVoucherAccess (ConsumerId, ConfigKey)` — danh sách đối tác
  nào được phép gọi cấu hình nào (mặc định KHÔNG ai được gọi cấu hình
  KHÁC `default` tới khi admin tick rõ ràng). Thêm cột
  `api.VoucherRedemptions.ConfigKey` (ghi nhận redeem qua cấu hình nào).
- `api-server/lib/voucherRedeemService.js`, `routes/v1/vouchers.js` —
  `checkVoucher()`/`redeemVoucher()` nhận thêm `configKey` (mặc định
  `'default'`). Route `/check`,`/redeem` CŨ giữ nguyên hành vi (luôn
  `default`). Thêm route MỚI `/:configKey/check`,`/:configKey/redeem` —
  app tự gọi `/vouchers/fuji/redeem` khi chọn "Fuji". `:configKey` khác
  `default` bắt buộc đối tác đã được cấp quyền ở
  `api.ConsumerVoucherAccess`, thiếu quyền trả `403` NGAY TRƯỚC khi đọc dữ
  liệu DSMART (không rò thông tin cấu hình/tồn tại voucher sang server
  khác).
- `routes/admin/voucherSettings.js` — đổi từ API 1 dòng (singleton) thành
  CRUD danh sách (`GET/POST /`, `PUT/DELETE /:configKey`) — chặn cứng xoá
  dòng `default`.
- `routes/admin/consumers.js` — thêm `GET/PUT /:id/voucher-access` (cùng
  mẫu transaction DELETE-rồi-INSERT như `realtime-access`/`write-access`
  đã có).
- `api-admin/src/pages/VoucherSettingsPage.jsx` — đổi từ 1 form thành
  trang danh sách, có "+ Tạo cấu hình mới"/Sửa/Xoá (chặn xoá `default`).
- `api-admin/src/pages/ConsumersPage.jsx` — thêm nút "Cấu hình Voucher
  được gọi" trên mỗi đối tác, tick chọn (các) mã cấu hình đối tác đó được
  phép gọi.
- `api-server/scripts/seedVoucherDataSource.js` — cập nhật theo schema
  mới (MERGE theo `ConfigKey` thay vì `Id=1`), thêm biến
  `VOUCHER_DSMART16_CONFIG_KEY` để seed thêm 1 cấu hình KHÁC `default`
  (vd `fuji`) qua script, không cần mở trình duyệt.
- Đã kiểm chứng bằng mock test dựng app Express thật + mock DB/service
  (KHÔNG đụng DSMART thật) — 9/9 pass: `/check`,`/redeem` cũ vẫn luôn
  `default`; `:configKey` khác `default` cho qua đúng khi đối tác có
  quyền, chặn `403` + KHÔNG gọi service khi chưa có quyền;
  `redeemVoucher()` nhận đúng `configKey` truyền xuống.
- Đã demo ảnh (mockup trang "Cấu hình Voucher" danh sách + modal "Cấu
  hình Voucher được gọi" trên "Đối tác") và được người dùng xác nhận
  TRƯỚC khi code.

## 9.58 — XÁC ĐỊNH NGUYÊN NHÂN THẬT: khoảng trắng thừa trong mã kho (CHAR cố định độ dài từ DSMART)

**Theo báo cáo người dùng** — chọn đúng mã kho `12061`/`22061` đã xác nhận
qua SQL tay là CÓ THẬT trong domain `tonkho_sku` (cảnh báo bản 9.57 xác
nhận domain có 817.782 dòng, không trống) nhưng code vẫn báo "KHÔNG khớp
đúng kho đang lọc".

**Nguyên nhân thật**: nguồn DSMART lưu mã kho/mã chi nhánh bằng cột kiểu
`CHAR` ĐỘ DÀI CỐ ĐỊNH — tự động đệm khoảng trắng ở cuối chuỗi (vd `"12061"`
thực ra là `"12061 "`). SSMS hiển thị y hệt mã sạch nên không phát hiện
được bằng mắt, và so sánh `WHERE ... = '12061'` trong T-SQL vẫn khớp (SQL
Server BỎ QUA khoảng trắng cuối khi so sánh chuỗi) — nhưng so sánh chuỗi
trong JavaScript (`Set.has()`, `===`) coi `"12061"` và `"12061 "` là 2 giá
trị KHÁC NHAU, nên khớp mã kho ở tầng ứng dụng bị trật hoàn toàn, dù dữ
liệu và server đều đúng.

**Thay đổi**: `rp-server/lib/reportFactsHelpers.js:loadLatestDimensionsForDomain()`
— TRIM khoảng trắng 2 đầu cho `EntityCode` VÀ từng giá trị Dimensions ngay
khi đọc dữ liệu từ CSDL, trước khi dùng để so khớp ở bất kỳ nơi nào gọi
hàm này — sửa CHUNG 1 chỗ cho MỌI báo cáo dùng domain qua hàm này (không
riêng Core stock=0), vì rủi ro y hệt áp dụng cho mọi domain đọc từ nguồn
DSMART.

## 9.57 — "Core stock = 0": chẩn đoán sâu hơn khi domain tồn kho "trống" dù CSDL xác nhận có dữ liệu

**Theo báo cáo người dùng** — chọn ĐÚNG 1 kho đã xác nhận có dữ liệu thật
qua SQL tay (y hệt truy vấn code dùng) vẫn báo "Domain tonkho_sku KHÔNG có
dòng dữ liệu nào đã đồng bộ". Đã loại trừ sai server/CSDL (log xác nhận
đúng `172.16.70.20 - HCRC_DWH`) và sai câu SQL (chạy tay y hệt vẫn ra kết
quả) — vậy lỗi nằm ở tầng ứng dụng, cần thêm dữ liệu chẩn đoán để xác định.

**Thay đổi**: `rp-server/lib/coreZeroStockRunner.js` — cảnh báo "trống" ở
Bước 3 (domain tồn kho) giờ tách RÕ 2 trường hợp khác hẳn nhau, trước đây
gộp chung 1 câu:
- Domain **HOÀN TOÀN KHÔNG có dòng nào** (0 dòng, mọi kho) — nêu rõ khả
  năng rp-server đang đọc SAI server/CSDL/pool so với nơi admin xác nhận
  có dữ liệu, dù `.env` có vẻ đúng.
- Domain **CÓ dữ liệu** nhưng không khớp đúng mã kho đang lọc — nêu rõ
  khả năng lệch ĐỊNH DẠNG mã kho (khoảng trắng/số 0 đầu/viết hoa-thường)
  giữa "Ánh xạ Điểm - STK_ID"/domain chain và domain tồn kho thật.

## 9.56 — "Core stock = 0": dropdown "Chi nhánh" bỏ hẳn quét domain bán hàng để lấy tên, CHỈ dùng "Ánh xạ Điểm - STK_ID"

**Theo yêu cầu người dùng** (tiếp nối bản 9.55 — vẫn còn lệch tên do quét
domain lớn) — thay vì cố "vá" lại cách dò tên qua `salesDomain`
(`banhang_sku`), bỏ HẲN bước đó: dropdown "Chi nhánh" giờ CHỈ lấy tên từ
`TenSieuThi` đã khai trong "Ánh xạ Điểm - STK_ID" — đúng nguồn người dùng
tự quản lý cho báo cáo doanh thu cuối ngày, đáng tin hơn và không cần quét
domain nào khác (nhanh hơn, không còn dính lỗi "chốt nhầm dòng không có
tên" như bản 9.55 nữa vì không quét dòng nào cả).

**Thay đổi**: `rp-server/lib/coreZeroStockRunner.js:resolveEligibleBranchOptions()`
— bỏ tham số `definition.salesDomain` khỏi điều kiện bắt buộc của hàm này,
bỏ hẳn đoạn quét `loadLatestDimensionsForDomain(pool, definition.salesDomain, ...)`.
STK_ID nào CHƯA khai "Ánh xạ Điểm - STK_ID" thì dropdown tạm hiện mã kho
(không phải lỗi — nhắc admin bổ sung dòng đó).

**Lưu ý**: nếu dropdown hiện TRÙNG tên ở 2 dòng khác nhau (vd "HP Vĩnh
Phúc" xuất hiện 2 lần) — đó là do "Ánh xạ Điểm - STK_ID" đang có 2 mã Điểm
khác nhau cùng khai TRÙNG `TenSieuThi` (dữ liệu trùng/thừa, không phải lỗi
code) — admin tự rà soát lại bảng đó, gộp/xoá dòng thừa.

## 9.55 — "Core stock = 0": sửa lỗi dropdown "Chi nhánh" hiện mã kho thay vì tên

**Theo báo cáo người dùng** (sau bản 9.54 — dropdown đã lọc đúng Mart/
Minimart, nhưng nhiều dòng hiện thẳng MÃ KHO (vd "12511") thay vì tên siêu
thị thật).

**Nguyên nhân**: `resolveEligibleBranchOptions()` (`rp-server/lib/coreZeroStockRunner.js`)
dựng bảng tên (`nameByStk`) bằng cách quét domain `salesDomain` (`banhang_sku`
— domain này có RẤT NHIỀU dòng/kho, 1 dòng/mã hàng) — code CŨ "chốt" tên
ngay ở dòng ĐẦU TIÊN gặp cho mỗi mã kho, DÙ dòng đó có `TenChiNhanh` RỖNG
(vd dòng của 1 mã hàng không có tên chi nhánh trong VIEW nguồn) — nên BỎ LỠ
tên thật nằm ở dòng SAU của ĐÚNG kho đó, rơi về hiện mã kho.

**Thay đổi**: Chỉ "chốt" tên khi dòng đó THẬT SỰ có `TenChiNhanh` khác
rỗng — bỏ qua dòng tên rỗng, tiếp tục quét tới khi gặp dòng có tên.

## 9.54 — "Core stock = 0": dropdown "Chi nhánh" tự lọc đúng Mart/Minimart (không hiện nhầm chi nhánh khác loại điểm)

**Theo yêu cầu người dùng** — dropdown "Chi nhánh" của 2 báo cáo "Core
stock = 0 (Mart)"/"(Minimart)" TRƯỚC ĐÂY dùng
`optionsSource: { domain: 'banhang_sku', valueField: 'MaChiNhanh',
labelField: 'TenChiNhanh' }` — hiện TOÀN BỘ chi nhánh trung tâm, KHÔNG
phân biệt Mart/Minimart, khiến người dùng liên tục chọn NHẦM chi nhánh
khác loại điểm (vd chọn "BRGMart 5 Hàm Tử Quan" — 1 chi nhánh Mart — ở báo
cáo Minimart) rồi tưởng báo cáo bị lỗi.

**Thay đổi**:
- `rp-server/lib/coreZeroStockRunner.js` — thêm `resolveEligibleBranchOptions()`
  (export mới) + tách `loadEligibleStk()` dùng CHUNG với `runCoreZeroStockReport()`
  — trả về ĐÚNG danh sách {value, label} các chi nhánh thuộc loại điểm của
  report, xác định qua domain `doanhthu_chinhanh` (chain) GỘP LoaiChuoi khai
  tay ở "Ánh xạ Điểm - STK_ID" (bản 9.52) — nhãn hiển thị ưu tiên TenSieuThi
  (bản 9.53).
- `rp-server/routes/reports.js` — thêm nhánh `optionsSource.coreZeroStockBranches`
  cho route `GET /:reportId/filter-options/:field`, cache 10 phút giống các
  nhánh optionsSource khác.
- `rp-server/scripts/seedCoreZeroStockReports.js` — đổi `optionsSource` của
  bộ lọc "Chi nhánh" từ `{ domain: 'banhang_sku', ... }` sang
  `{ coreZeroStockBranches: true }` cho cả 2 báo cáo Mart/Minimart.

**⚠️ CẦN chạy lại script seed trên server** (chỉ sửa code KHÔNG đủ — DefinitionJson
đã lưu trong CSDL app.ReportCatalog từ trước, phải chạy lại mới cập nhật
`optionsSource` mới):
```
cd rp-server && node scripts/seedCoreZeroStockReports.js
```

## 9.53 — "Core stock = 0": cột "Tên kho" cũng ưu tiên lấy từ "Ánh xạ Điểm - STK_ID"

**Theo yêu cầu người dùng** (tiếp nối bản 9.52) — file "Danh sách hàng
Core" upload đã có sẵn Mã điểm/Mã kho, chỉ cần map qua "Ánh xạ Điểm -
STK_ID" là ra được đúng tên siêu thị, không cần phụ thuộc domain
`tonkho_sku` đã đồng bộ đủ `TenChiNhanh` cho đúng kho hay chưa.

**Thay đổi**: `rp-server/lib/coreZeroStockRunner.js` — cột "Tên kho" ở báo
cáo "Core stock = 0" giờ ƯU TIÊN lấy `TenSieuThi` đã khai trong "Ánh xạ
Điểm - STK_ID" (cùng mã Điểm vừa dùng để xác định LoaiChuoi ở bản 9.52),
mới dùng lại `TenChiNhanh` tự động từ domain `tonkho_sku` nếu mã Điểm đó
chưa khai ánh xạ — cùng nguyên tắc ưu tiên đã áp dụng cho báo cáo LDTD/
HCRC (`lib/diemStkMapping.js:remapRowsToDiem()`).

## 9.52 — "Core stock = 0": dùng LẠI "Ánh xạ Điểm - STK_ID" (LoaiChuoi) khi domain chain chưa đồng bộ kho

**Theo yêu cầu người dùng** (sau khi cấp quyền CSDL ở bản 9.51 — báo lỗi
quyền đã hết, nhưng đổi sang cảnh báo "KHÔNG có kho nào thuộc loại điểm
MART/MINIMART theo domain doanhthu_chinhanh" cho các siêu thị "HaproFood
...") — xác định các kho này ĐÃ CÓ dữ liệu bán hàng/tồn kho ở domain trung
tâm `banhang_sku`/`tonkho_sku` (hiện ra được ở dropdown "Chi nhánh") nhưng
domain `doanhthu_chinhanh` (dùng để tự suy "chain" MART/MINIMART) CHƯA gắn
đúng cho mã kho của các siêu thị này.

**Thay đổi**: `rp-server/lib/coreZeroStockRunner.js` — Bước 2 (xác định
STK_ID thuộc đúng loại điểm) giờ KHÔNG chỉ dựa vào "chain" tự động từ
domain `doanhthu_chinhanh`, mà BỔ SUNG thêm các STK_ID được admin khai tay
cột **`LoaiChuoi`** (MART/MINIMART) trong "Ánh xạ Điểm - STK_ID"
(`etl.DiemStkMapping`, trang etl-admin đã có sẵn) — dùng LẠI NGUYÊN VẸN cơ
chế GHI ĐÈ `LoaiChuoi` đã áp dụng cho báo cáo LDTD/HCRC
(`lib/diemStkMapping.js:remapRowsToDiem()`), không cần đợi job đồng bộ
`doanhthu_chinhanh` chạy lại/sửa gì ở nguồn DSMART16. Cảnh báo "trống" ở
bước này cũng cập nhật, nhắc rõ thêm lối tắt khai LoaiChuoi.

**Cách dùng (không cần deploy gì thêm ngoài merge code)**: vào etl-admin →
"Ánh xạ Điểm - STK_ID" → tìm (hoặc tạo) dòng ứng với mã Điểm của siêu thị
đang thiếu (vd các "Cửa hàng HaproFood...") → khai cột `LoaiChuoi` =
`MART` hoặc `MINIMART` đúng loại → lưu lại → chạy lại báo cáo "Core stock
= 0" tương ứng.

## 9.51 — XÁC ĐỊNH NGUYÊN NHÂN THẬT "Core stock = 0" trống: THIẾU QUYỀN CSDL (không phải lỗi code)

**Kết quả cảnh báo chẩn đoán bản 9.49** (ảnh thật người dùng gửi) đã chỉ
đúng nguyên nhân: `"The SELECT permission was denied on the object
'CoreItemList', database 'HCRC_ETL', schema 'etl'."` — login
`etl_diem_stk_reader` (CSDL HCRC_ETL, dùng CHUNG cho
`rp-server/lib/diemStkMapping.js`/`coreItemList.js`/`stockAlertThresholds.js`)
**CHƯA TỪNG được cấp quyền SELECT** trên `etl.CoreItemList` trên server
THẬT — dòng `GRANT SELECT ON etl.CoreItemList TO etl_diem_stk_reader;` ĐÃ
CÓ SẴN trong `etl-db/grants.sql` nhưng chưa từng được DBA chạy lại trên
CSDL thật sau khi dòng này được thêm vào repo (tính năng Core bổ sung SAU
khi login này đã tạo xong ban đầu, chỉ để phục vụ "Ánh xạ Điểm - STK_ID").

**KHÔNG PHẢI lỗi code** — rp-server xử lý hoàn toàn đúng, chỉ là quyền
CSDL chưa khớp với tính năng mới.

**Phát hiện thêm, sửa luôn**: `etl.StockAlertThresholds` (dùng CHUNG login
này cho báo cáo "Cảnh báo hàng tồn") **CHƯA TỪNG có dòng GRANT nào** trong
`etl-db/grants.sql` — thêm vào để tránh lặp lại đúng lỗi này sau.

**Việc cần làm trên CSDL thật** (DBA/người quản trị SQL Server chạy, CHỈ
2 dòng, an toàn chạy lại nhiều lần):
```sql
USE HCRC_ETL;
GRANT SELECT ON etl.CoreItemList TO etl_diem_stk_reader;
GRANT SELECT ON etl.StockAlertThresholds TO etl_diem_stk_reader;
```
Không cần khởi động lại `rp-server` — quyền SQL Server có hiệu lực ngay
cho các kết nối MỚI từ connection pool (pool tự tạo kết nối mới định kỳ;
nếu muốn chắc chắn ngay lập tức, khởi động lại `rp-server` 1 lần).

## 9.50 — Danh sách hàng Core: phân trang (sửa treo trình duyệt khi upload file lớn)

**Theo báo cáo người dùng** — upload file Core ~26.000/~11.000 dòng (bản
9.46 đổi sang khai theo từng kho, danh sách phình to hẳn so với trước)
khiến trình duyệt (đặc biệt điện thoại) bị treo/chậm.

**Nguyên nhân**: `etl-admin/src/pages/CoreItemListPage.jsx` tải ĐỦ dữ liệu
về 1 lần (hợp lý) nhưng đưa THẲNG toàn bộ vào `DataTable` — component này
tự xác định KHÔNG phân trang (dùng cho cả báo cáo lẫn trang CRUD, trang
CRUD trước giờ luôn ngắn, không cần) — dựng hàng chục nghìn `<tr>` DOM 1
lượt, đúng lỗi "treo trình duyệt" đã gặp (và đã sửa) cho báo cáo ở bản
9.23, giờ lặp lại ở trang quản lý này vì danh sách Core đổi quy mô.

**Sửa**: `CoreItemListPage.jsx` — phân trang PHÍA CLIENT (200 dòng/trang,
dữ liệu vẫn tải đủ 1 lần, chỉ CẮT bớt số dòng đưa vào `DataTable`) + nút
"Trang trước"/"Trang sau". Không đổi backend/API nào — "Xuất tất cả
(Excel)" vẫn xuất đủ toàn bộ như cũ, không bị ảnh hưởng.

## 9.49 — Core stock = 0: phát hiện LỖI KẾT NỐI riêng cho báo cáo này (khác "chưa upload")

**Theo báo cáo người dùng, kèm ảnh thật** — sau khi deploy bản 9.48 (thêm
cảnh báo chẩn đoán), chạy lại đúng 1 kho/mã hàng đã xác nhận có khai Core
(`12061`/`2002182261`) vẫn ra cảnh báo **"Chưa có danh sách hàng Core cho
loại điểm MART"** — MÂU THUẪN trực tiếp với ảnh trang "Danh sách hàng
Core" (etl-admin) đang hiện ĐỦ **26.234 dòng MART**.

**Nguyên nhân thật**: `rp-server/lib/coreItemList.js` đọc `etl.CoreItemList`
qua **1 pool CSDL RIÊNG** (`ETL_DIEM_STK`, login `etl_diem_stk_reader`) —
**KHÁC HẲN** pool `ADMIN` mà etl-admin dùng để hiện 26.234 dòng đó. Nếu
`.env` của `rp-server` cấu hình `ETL_DIEM_STK_SERVER`/`ETL_DIEM_STK_DATABASE`
trỏ SAI (khác server/database nơi admin thực sự upload), hoặc kết nối đó
lỗi vì bất kỳ lý do gì, hàm đọc Core TRƯỚC ĐÂY bắt lỗi rồi ÂM THẦM trả về
Map rỗng — y hệt biểu hiện "thật sự chưa upload" dù bản chất là lỗi kết
nối hoàn toàn khác, và bản 9.48 chưa phân biệt được 2 trường hợp này.

**Sửa**:
- `rp-server/lib/coreItemList.js` — đổi `console.warn` sang `logWarn`
  (`lib/systemLog.js`, ghi CẢ console LẪN `app.SystemLog` — xem được qua
  rp-user Hệ thống → Log, không cần SSH server) + lưu lại lỗi gần nhất
  (`getLastLoadError()`).
- `rp-server/lib/coreZeroStockRunner.js` — cảnh báo ở Bước 1 giờ tách
  RÕ 2 trường hợp: lỗi kết nối (nêu rõ thông báo lỗi SQL thật + nhắc kiểm
  tra `ETL_DIEM_STK_*` trong `.env`, nói rõ "KHÔNG phải do chưa upload")
  khác hẳn "thật sự chưa có danh sách Core".

Đã mock-test xác nhận: lỗi kết nối -> đúng thông báo lỗi kết nối (không
còn lẫn với "chưa upload"); trường hợp thành công không đổi hành vi.

**Bước tiếp theo**: người dùng chạy lại đúng báo cáo "Core stock = 0
(Mart)" sau khi deploy — nếu cảnh báo MỚI hiện ra là lỗi kết nối, kiểm tra
`.env` của `rp-server` xem `ETL_DIEM_STK_SERVER`/`ETL_DIEM_STK_DATABASE`
có trỏ ĐÚNG server/database nơi chạy `etl-db/schema.sql`/upload Core
không (nhiều khả năng đây chính là gốc rễ cả loạt báo cáo trống trước
giờ).

## 9.48 — Báo cáo "Core stock = 0": giải thích rõ lý do khi trống (chẩn đoán)

**Theo báo cáo người dùng** — 2 báo cáo "Core stock = 0" (Mart/Minimart)
vẫn trả "Không có dữ liệu" dù đã xác nhận: danh sách Core đã upload đủ
(khớp đúng số dòng file gốc), job domain `doanhthu_chinhanh` (Dimension
"chain") đã chạy, và test TRỰC TIẾP đúng 1 kho/mã hàng đã biết chắc có
khai Core (`12061`/`2002182261`) cũng vẫn trống.

**Vấn đề**: `rp-server/lib/coreZeroStockRunner.js` (6 bước lọc tuần tự)
trước đây khi trả `rows: []` KHÔNG kèm lý do — không có cách nào (kể cả
chính đội dev) biết đang chặn ở bước nào trong 6 bước mà không truy vấn
trực tiếp CSDL sản xuất.

**Sửa**: thêm `warnings` (field đã có sẵn, dùng chung ở nhiều báo cáo
khác, `rp-user` tự hiện ⚠️ ngay trên trang — KHÔNG cần sửa gì ở frontend)
giải thích CHÍNH XÁC đang dừng ở bước nào:
1. Chưa có danh sách Core cho loại điểm đó.
2. Domain `chainDomain` chưa có kho nào thuộc đúng loại điểm (hoặc (các)
   kho đã chọn ở bộ lọc không khớp).
3. Domain tồn kho/bán hàng không có dòng nào cho đúng kho đang lọc, HOẶC
   có dòng nhưng KHÔNG mã hàng nào khớp danh sách Core của đúng kho đó
   (gợi ý kiểm tra lệch định dạng mã kho giữa file Core và dữ liệu đồng
   bộ — nguyên nhân nghi ngờ nhiều nhất hiện tại).
4. Có ứng viên khớp Core nhưng bị loại vì: thiếu dữ liệu tồn kho "hôm
   qua" / tồn hiện tại còn trên ngưỡng / đang bị khoá — kèm SỐ LƯỢNG từng
   loại.

Đã mock-test đủ cả 6 nhánh (bao gồm trường hợp thành công không có
warning) — mỗi nhánh ra đúng thông báo tương ứng.

**Bước tiếp theo**: người dùng chạy lại đúng báo cáo "Core stock = 0
(Minimart)", lọc đúng 1 chi nhánh đã biết có khai Core — thông báo ⚠️ sẽ
chỉ ra chính xác bước nào đang chặn, dựa vào đó xử lý tiếp (có thể là lệch
mã kho giữa file Core và dữ liệu đã đồng bộ, hoặc thiếu lịch sử tồn kho).

## 9.47 — "Top bán chạy đang tồn kho = 0": chọn Top 50/Top 100/Tất cả khi gửi email

**Theo yêu cầu người dùng** — lịch gửi email báo cáo "Top bán chạy đang tồn
kho = 0" cũng phải chọn được Top 50/Top 100 hoặc "Tất cả" (không giới hạn),
giống như xem trực tiếp trên web (bản 9.43/9.44).

**Thay đổi**:
- `rp-server/scripts/seedTopZeroStockReport.js` — filter "Số lượng hiển thị"
  thêm lựa chọn thứ 3 `Tất cả` (value `'all'`).
- `rp-server/lib/topSellingZeroStockRunner.js` — `topLimit === 'all'` ->
  `topN = Infinity` (không cắt bớt, trả nguyên danh sách mỗi chi nhánh).
  **Quan trọng**: "Tất cả" PHẢI được CHỌN RÕ — bỏ trống/không chọn vẫn rơi
  về Top 50 mặc định như cũ (không đổi hành vi xem trên web khi chưa đụng
  tới bộ lọc, tránh bảng quá dài làm nặng trình duyệt ngoài ý muốn).
- `rp-user/.../EmailSchedulesPage.jsx` — ô cấu hình "Bộ lọc cố định khi gửi
  tự động" cho filter kiểu `select` CÓ khai `options` (như `topLimit`) giờ
  vẽ dropdown THẬT (chọn đúng Top 50/Top 100/Tất cả) thay vì ô nhập chữ tự
  do dễ gõ sai — filter khác (multiSelect/text...) giữ nguyên như cũ.

Đã mock-test xác nhận cả 3 trường hợp: không chọn -> 50 dòng/chi nhánh (giữ
nguyên hành vi cũ), chọn Top 100 -> 100 dòng, chọn "Tất cả" -> trả đủ 120/120
dòng mock (không bị cắt).

## 9.46 — Danh sách hàng Core: khai theo TỪNG KHO (Mã kho/Mã điểm), khớp file mẫu thật người dùng đang dùng

**Theo yêu cầu người dùng**, kèm file mẫu THẬT đang dùng ("Core thg 08.2024
Loại bỏ SKU ko hiệu quả — Cập nhật 08.07.2026.xlsx") — trước đây 1 mã hàng
là Core (hay không) áp dụng CHUNG cho MỌI kho cùng loại điểm (Mart/Minimart),
không phân biệt từng kho. File thật của người dùng có "Mã kho" RIÊNG từng
dòng: 1 mã hàng có thể là Core ở kho NÀY nhưng KHÔNG PHẢI Core ở kho KHÁC
cùng loại điểm.

**Thay đổi**:
- `etl-db/schema.sql` — `etl.CoreItemList` đổi khoá duy nhất từ
  `(LoaiDiem, MaHang)` sang `(MaKho, MaHang)`, thêm cột `MaKho` (BẮT BUỘC,
  khớp Dimensions.MaChiNhanh/STK_ID), `MaDiem`/`MaNCC`/`TenNCC`/
  `LuongGiaoHang` (tham khảo, theo yêu cầu người dùng — "lưu thêm để hiện
  trong danh sách Core/báo cáo"). Migration cho deployment CŨ: **XOÁ SẠCH**
  dữ liệu Core hiện có (cấu trúc cũ không có Mã kho, không map được sang
  cấu trúc mới) — BẮT BUỘC upload lại file Core (có cột Mã kho) ngay sau
  khi chạy script.
- `rp-server/lib/coreItemList.js` — đổi `loadCoreItemListMap(loaiDiem)`
  (phẳng, Map&lt;MaHang,ref&gt;) thành `loadCoreItemListByKho(loaiDiem)`
  (Map&lt;MaKho, Map&lt;MaHang,ref&gt;&gt;).
- `rp-server/lib/coreZeroStockRunner.js` — so khớp ĐÚNG (kho, mã hàng)
  thay vì chỉ mã hàng; `maDiem` hiển thị ưu tiên lấy từ chính file Core đã
  upload, dự phòng tra "Ánh xạ Điểm - STK_ID" nếu dòng đó không khai; thêm
  3 cột hiển thị Mã NCC/Nhà cung cấp/Luồng giao hàng.
- `etl/lib/coreItemListImport.js` — parser nhận CẢ 2 quy ước tên cột/tên
  sheet cùng lúc (tương thích ngược): tên tiếng Anh cũ ("MaHang"/"MaKho",
  "Core Mart"/"Core Minimart") VÀ tên trong file thật người dùng đang dùng
  (tiếng Việt "Mã hàng"/"Mã kho", tên sheet ngắn "Mart"/"Mini") — không cần
  đổi tên cột/sheet trước khi upload. Nâng `MAX_IMPORT_ROWS` 20000 → 50000
  (Core theo từng kho làm số dòng/sheet tăng hẳn — file thật: Mart 26248
  dòng, Mini 11535 dòng).
- `etl-admin/src/pages/CoreItemListPage.jsx` — hiện thêm cột Mã kho/Mã
  điểm/Mã NCC/Nhà cung cấp/Luồng giao hàng, thêm ô lọc theo Mã kho.

**Đã kiểm chứng bằng chính file thật người dùng gửi** (không chỉ mock) —
parse thành công: MART 26234 dòng hợp lệ, MINIMART 11534 dòng hợp lệ, 13
dòng trùng cặp (Mã kho, Mã hàng) trong CHÍNH file gốc được phát hiện và báo
rõ (lỗi dữ liệu nguồn, không phải lỗi hệ thống). Mock-test riêng xác nhận
`coreZeroStockRunner.js` CHỈ tính hết hàng đúng kho đã khai Core, không lan
sang kho khác cùng loại điểm dù cùng mã hàng.

**CHƯA merge main** — đổi cấu trúc CSDL kèm XOÁ dữ liệu cũ (migration), chờ
người dùng xác nhận trước khi merge + chạy script trên server thật.

## 9.45 — KHẨN: sửa lỗi 500 "Top bán chạy đang tồn kho = 0" (và 3 báo cáo tồn kho khác) khi lọc "Tất cả" chi nhánh

**Theo báo cáo người dùng** — bấm "Lọc" báo cáo "Top bán chạy đang tồn kho
= 0" (Chi nhánh: Tất cả) trả về lỗi 500 ngay sau khi deploy bản 9.43/9.44.

**Nguyên nhân thật** — KHÔNG liên quan bản 9.44 (cột STT), mà là hệ quả
của thay đổi Top 50/100 ở bản 9.43: trước đây `entityCodes` truyền vào
`lib/reportFactsHelpers.js` (4 hàm `loadLatestMeasure*`/`loadSumOnDate`,
mỗi EntityCode gắn 1 tham số SQL riêng để chống injection) bị cắt Top N
THEO TỪNG CHI NHÁNH trước khi query, nên luôn có giới hạn (vd 50 × ~40 chi
nhánh ≈ 2000). Bản 9.43 đổi logic tính tồn kho cho MỌI thực thể có bán
trong kỳ TRƯỚC khi xếp hạng (để tiêu chí tồn kho tham gia chọn Top N) —
`entityCodes` không còn giới hạn, chọn "Tất cả" chi nhánh ra hàng chục
nghìn mã (chi nhánh × SKU), VƯỢT giới hạn **2100 tham số/câu lệnh** của
SQL Server — server từ chối cả câu query, ném lỗi không bắt được -> 500.
Lỗi này CŨNG ảnh hưởng 3 báo cáo khác dùng chung 4 hàm trên với
`entityCodes` quét nguyên domain (không giới hạn sẵn): "Core stock = 0",
"Tồn kho theo ngưỡng", "Cảnh báo hàng tồn" — chưa có báo cáo lỗi thật từ
người dùng cho 3 báo cáo này (có thể catalogue hiện tại của họ còn dưới
ngưỡng), nhưng sửa chung 1 lần để không tái phát khi danh mục hàng tăng.

**Sửa**: `rp-server/lib/reportFactsHelpers.js` — CHIA NHỎ `entityCodes`
thành nhiều lượt query (tối đa 1900 mã/lượt, an toàn dưới 2100), chạy
song song rồi GỘP kết quả lại thành 1 Map — áp dụng cho cả 4 hàm
`loadLatestMeasureBefore`/`loadLatestMeasure`/`loadLatestMeasureWithDate`/
`loadSumOnDate`. Hành vi trả về (Map EntityCode -> giá trị) giữ NGUYÊN,
không cần sửa gì ở 4 nơi gọi (`topSellingZeroStockRunner.js`/
`coreZeroStockRunner.js`/`stockThresholdRunner.js`/`stockAlertRunner.js`).
Đã mock-test xác nhận: 5000 EntityCode chia đúng 3 lượt (≤1900 tham số/
lượt), gộp lại đủ 5000 kết quả, không vượt giới hạn SQL Server.

## 9.44 — Cột STT + căn giữa toàn hệ thống + sắp xếp mã ngành hàng tăng dần

**Theo yêu cầu người dùng**, 2 việc:

1. **Cột STT (căn giữa)**: web (`rp-user/src/components/DataTable.jsx`) VÀ
   Excel (`rp-server/lib/exportExcel.js`) trước đây chưa từng canh giữa cột
   "TT" (Excel canh PHẢI theo đúng mọi cột số khác; web không có xử lý
   riêng gì — cả 2 lỗi này ảnh hưởng CẢ các báo cáo ĐÃ CÓ cột TT từ trước,
   không chỉ báo cáo mới) — chỉ PDF đã sửa đúng từ bản 8.99. Sửa cả 2 nơi
   để khớp PDF. Thêm cột "TT" cho TOÀN BỘ báo cáo còn thiếu: 3 báo cáo
   ngành hàng + "Doanh thu ngành hàng (LDTD)" (composite), 6 báo cáo nhóm
   Mua hàng (`seedPurchaseOrderReports.js`), báo cáo "Tồn kho" mới
   (`bc-ton-kho-chi-tiet`), và 4 báo cáo tồn kho còn lại (Core tồn=0, Tồn
   kho theo ngưỡng, Cảnh báo hàng tồn, Top bán chạy đang tồn kho=0 —
   `coreZeroStockRunner.js`/`stockThresholdRunner.js`/
   `stockAlertRunner.js`/`topSellingZeroStockRunner.js`, cột hiển thị CỐ
   ĐỊNH, không qua `definition.columns`). Hàm đánh số dùng chung
   `assignSttIfPresent()` (rút ra từ `lib/compositeReportRunner.js`, dời
   sang `lib/reportCellFormat.js`) — nay cũng dùng ở `lib/reportRunner.js`
   (nhánh `directDb`) và `lib/purchaseOrderRunner.js` (trước đây CHỈ
   composite report có cột TT hoạt động đúng trên web/email).
2. **Sắp xếp mã ngành hàng tăng dần** — báo cáo "Doanh thu theo ngành
   hàng"/"Nhập hàng theo ngành hàng"/"Doanh thu theo ngành hàng (LDTD)"
   thêm `definition.sortBy: {field:'entityCode', direction:'asc'}`, xử lý
   MỚI ở nhánh phẳng (không `groupBy`) của `lib/compositeReportRunner.js`
   (trước đây nhánh này KHÔNG sắp xếp gì) — so sánh ưu tiên SỐ (mã ngành
   hàng dạng chuỗi số, vd "1001"), rơi về so sánh chuỗi nếu không phải số.

Đã regression-test bằng mock (hàm `assignSttIfPresent`/so sánh `sortBy`
độc lập) + build 3 frontend — không cần chạy script seed lại dữ liệu cũ
(cột TT/sắp xếp chỉ ảnh hưởng CÁCH HIỂN THỊ, không đổi nguồn dữ liệu), chỉ
cần chạy lại các script seed báo cáo liên quan để cập nhật `DefinitionJson`
(xem deploy log).

## 9.43 — Chuyển nhóm báo cáo ngành hàng + báo cáo LDTD + Top 50/100 + Báo cáo Tồn kho mới

**Theo yêu cầu người dùng**, 4 việc:

1. **Chuyển nhóm**: "Doanh thu theo ngành hàng"/"Nhập hàng theo ngành
   hàng" chuyển từ "Báo cáo kinh doanh" sang "Báo cáo Mua hàng"
   (`rp-server/scripts/seedNganhHangReports.js` đổi `menuCode` mặc định —
   chạy lại script để áp dụng).
2. **Báo cáo "Doanh thu theo ngành hàng (LDTD)"** + trang etl-admin "Chỉ
   tiêu Doanh thu theo ngành hàng (LDTD)" — mirror đúng pattern LDTD/HCRC
   đã có: DÙNG CHUNG domain thực đạt `doanhthu_nganhhang` nhưng
   `targetDomain` RIÊNG (`sales-targets-nganhhang-dt-ldtd`) để đội LDTD tự
   nhập Chỉ tiêu độc lập.
3. **"Top bán chạy đang tồn kho = 0"** — thêm filter "Số lượng hiển thị"
   (Top 50/Top 100, người xem tự chọn, trước đây cố định 50 trong
   DefinitionJson). Đồng thời sửa thứ tự xếp hạng: tính tồn kho cho MỌI
   thực thể có bán trong kỳ (không cắt Top N trước khi biết tồn kho như
   cũ), rồi xếp hạng theo (1) bán số lượng nhiều hơn trước, (2) cùng mức
   bán thì tồn kho GẦN 0 HƠN trước — để tiêu chí tồn kho cũng tham gia
   chọn Top N, không chỉ mỗi doanh số (`rp-server/lib/topSellingZeroStockRunner.js`).
4. **Báo cáo "Tồn kho" MỚI** (nhóm Mua hàng, `bc-ton-kho-chi-tiet`) — lọc
   theo ngành hàng/siêu thị/nhà cung cấp/kênh mua (mua riêng/mua chung) +
   điều kiện lớn hơn/nhỏ hơn (2 ô số tự do). Nhà cung cấp/kênh mua lấy từ
   ĐƠN GẦN NHẤT của đúng mã hàng (DSMART16 không có "NCC mặc định" theo
   mã hàng). VIEW mới `vw_TonKhoChiTietTheoSKU` (mở rộng
   `vw_TonKhoTheoSKU`, thêm ngành hàng + NCC/kênh mua đơn gần nhất qua
   `OUTER APPLY` trên `STRANS`). `lib/reportEngine.js` (dùng chung mọi
   báo cáo `directDb`) bổ sung 2 cơ chế STRICTLY ADDITIVE: field
   `"measures.<tên>"` lọc được trên Measures (trước chỉ lọc được
   Dimensions), 2 filter type mới `numberMin`/`numberMax` (so sánh số
   thật `>`/`<`), và `filterDef.column` (TUỲ CHỌN) tách cột SQL khỏi khoá
   đọc `filterValues` khi 2 filter dùng chung 1 cột — đã chạy regression
   test xác nhận SQL báo cáo `directDb` hiện có không đổi. Xem đầy đủ:
   `bc-ton-kho-chi-tiet.md`.

**CHƯA merge main** — VIEW `vw_TonKhoChiTietTheoSKU` (mục 4) là VIEW MỚI
HOÀN TOÀN, chưa chạy thử trên server thật (đặc biệt cần xác nhận hiệu
năng `OUTER APPLY`) — chờ người dùng/DBA chạy + xác nhận kết quả trước
khi merge.

## 9.42 — Màu header bản 9.40 cho mọi báo cáo phẳng (Mua hàng/Vận hành/Báo cáo tự do/Báo cáo kinh doanh)

**Theo yêu cầu người dùng** — rà soát phát hiện: toàn hệ thống CHỈ đúng 4
báo cáo "doanh thu cuối ngày" (LDTD/HCRC gốc + Thành viên) có khai
`columnGroups` (màu theo nhóm cột) — mọi báo cáo khác (Mua hàng/Vận
hành/Báo cáo tự do/Báo cáo kinh doanh, kể cả 2 báo cáo "theo ngành hàng"
bản 9.41) là bảng PHẲNG, không có khái niệm "màu nhóm" để đổi. Thêm 1 lớp
màu nền header xanh navy nhạt (`GROUP_COLORS_CORPORATE.green`, cùng tông
bản 9.40) cho MỌI báo cáo phẳng — áp dụng ĐỒNG LOẠT cả web/Excel/PDF,
không cần khai cờ riêng từng báo cáo.

**4 báo cáo LDTD/HCRC**: Excel/web GIỮ NGUYÊN (đã ở bảng corporate từ bản
9.40, không đổi gì). PDF **GIỮ MÀU CŨ** (xanh lá/vàng gold) theo đúng yêu
cầu — thêm cờ `legacyPdfColors: true` vào `buildDefinition()` ở
`rp-server/scripts/seedLdtdHcrcReports.js`, `lib/exportPdf.js` đọc cờ này
để rơi về bảng màu gốc (mặc định MỚI của `exportPdf.js` giờ là bảng
CORPORATE, đảo ngược so với bản 9.40 — chỉ 4 báo cáo này khai cờ để giữ
hành vi cũ).

**Thay đổi**: `rp-server/lib/exportExcel.js`/`lib/exportPdf.js` (nhánh
"không columnGroups" tô fill header); `rp-user/src/components/DataTable.jsx`
thêm prop `isReport` (CHỈ `ReportBody.jsx` — nơi DUY NHẤT render bảng báo
cáo, dùng chung trang Báo cáo + ô Dashboard — truyền `true`, các trang
CRUD khác dùng chung `DataTable.jsx` không bị ảnh hưởng).

Đã demo thật (render PDF/Excel qua LibreOffice, 4 ảnh) xác nhận đúng cả 2
nhóm trước khi merge.

## 9.41 — Báo cáo Doanh thu/Nhập hàng theo ngành hàng + Chỉ tiêu toàn công ty

**Theo yêu cầu người dùng** — 2 báo cáo mới, mỗi dòng LUÔN là 1 ngành
hàng (không tách chi nhánh ra dòng riêng), có bộ lọc "Chi nhánh" tuỳ chọn
(không chọn = cộng dồn toàn hệ thống), đầy đủ Chỉ tiêu/Thực đạt/Tỷ lệ
đạt/Cùng kỳ năm trước/% LFL như báo cáo doanh thu chi nhánh. Chỉ tiêu nhập
**THEO TOÀN CÔNG TY** (1 số/ngành hàng/tháng, không tách chi nhánh) —
khác hẳn chỉ tiêu LDTD/HCRC theo từng siêu thị.

Nguồn dữ liệu: VIEW mới `V_HCRC_DOANHTHU_NGANHHANG`/
`V_HCRC_NHAPHANG_NGANHHANG` (Live, CSDL `DSMART16` — `STRANS` JOIN
`SKU_DEF`/`DEPTLIST`, dùng `DEPT_NAME_U` tránh lỗi font) + VIEW cùng tên
trên `DSMART16_EOM` (Lịch sử, UNION ALL `STRANS_YYYYMM`/`STRANS_EOM`, JOIN
chéo `DSMART16.dbo.SKU_DEF`/`DEPTLIST` — 2 bảng này không có trên EOM,
mirror kỹ thuật Script B). `etl/scripts/seedNganhHangSync.js` tạo job đồng
bộ (domain mới `doanhthu_nganhhang`/`nhaphang_nganhhang`, tái dùng nguyên
2 Nguồn dữ liệu "DSMART16 - Live"/"- Lịch sử" đã có).

**Cơ chế ghép MỚI trong `rp-server/lib/compositeReportRunner.js`** (opt-in
hoàn toàn, báo cáo nào không khai thì không đổi gì — đã chạy regression
test byte-identical trên 1 báo cáo hình dạng cũ trước khi merge):
`block.remapEntityCode` gộp lại rows thô của 1 khối về entityCode mới
(vd từ `<STK_ID>_<DEPT_ID>` về `DEPT_ID`), tuỳ chọn lọc trước theo 1
dimension khác (bộ lọc "Chi nhánh") — giải quyết việc ghép Thực đạt (khoá
chi tiết, để lọc được theo chi nhánh) với Chỉ tiêu toàn công ty (khoá
thô, không chi nhánh). `definition.preFilter` — lọc entity theo 1
dimension SAU bước ghép (dự phòng cho thiết kế khác, 2 báo cáo này chưa
dùng).

**Chỉ tiêu toàn công ty**: `etl/lib/salesTargetsImport.js` shape
"generic" (`MaSieuThi`+`Thang`+`MaNganhHang`+cột chỉ tiêu) mở rộng — để
TRỐNG `MaSieuThi`, CHỈ điền `MaNganhHang` = chỉ tiêu theo toàn công ty
(EntityCode = MaNganhHang), không ảnh hưởng hành vi ghép
`<MaSieuThi>_<MaNganhHang>` cũ. 2 trang etl-admin mới "Chỉ tiêu Doanh
thu/Nhập hàng theo ngành hàng" (`sales-targets-nganhhang-dt`/`-nh`).

Xem đầy đủ: `báo cáo doanh thu-nhập hàng theo ngành hàng.md`.

## 9.40 — Đổi màu báo cáo (Excel/web/email) sang bảng "kiểu báo cáo tài chính quốc tế"

**Theo yêu cầu người dùng** — bảng màu cũ (xanh lá chói/vàng gold/cam đất/
tím, kiểu bán lẻ BRGMART) đổi sang 1 họ màu xanh navy nhạt/vàng đồng/xám
thống nhất, "sắc nét hơn", giống phong cách báo cáo tài chính các tập
đoàn quốc tế — áp dụng cho **Excel + web (rp-user) + body email**.
**PDF CHƯA đổi** (người dùng muốn review riêng, sẽ báo khi nào chuyển).

Bảng màu mới (`GROUP_COLORS_CORPORATE`,
`rp-server/lib/reportCellFormat.js`): "Doanh thu" xanh navy nhạt
`#C9D6E0` (trước: xanh lá `#9BCC1E`), "Lãi gộp" vàng đồng/champagne
`#E3D5B8` (trước: cam đất `#FACD9C`), "Giao dịch" xám-xanh nhạt `#D7DCE3`
(trước: vàng gold `#F9CE27`), cột đơn lẻ (Trung bình GD/Doanh thu/m2) xám
xanh `#C3CEDC` (trước: tím `#9D98FD`), dòng Tổng cộng toàn báo cáo xanh
navy đậm hơn `#9FB3C8` (trước: xanh dương nhạt `#BDD7EE`), màu xen kẽ
(zebra) xám rất nhạt `#F3F5F7` (trước: cyan chói `#D1FEFF`). Viền đen giữ
nguyên như bản 8.98.

**Cách triển khai (giữ PDF cũ, đổi Excel/web/email)**: thêm hằng số
`GROUP_COLORS_CORPORATE`/`SUBTOTAL_COLOR_CORPORATE`/
`GRAND_TOTAL_COLOR_CORPORATE`/`ZEBRA_COLOR_CORPORATE` song song bảng gốc
trong `lib/reportCellFormat.js`; 3 hàm `resolveGroupColor()`/
`resolveRowFillColor()`/`resolveStandaloneColumnColor()` nhận thêm tham số
`palette` TUỲ CHỌN (mặc định bảng gốc — PDF/`lib/exportPdf.js` không đổi
gì, không truyền tham số mới). `lib/exportExcel.js` và
`lib/emailBodyRenderer.js` truyền rõ bảng CORPORATE. Web
(`rp-user/src/lib/reportGroupColors.js`) đổi thẳng giá trị hex (file này
chỉ phục vụ web, không dùng chung PDF).

## 9.39 — Sửa cột "TT" trống trên web (báo cáo doanh thu + Dashboard)

**Theo báo cáo người dùng** — cột "TT" (số thứ tự) trên bảng "Doanh thu
Realtime HCRC (Thành viên)" (và mọi báo cáo composite khác có khai cột
`key: 'stt'`) luôn trống khi xem trực tiếp trên web, dù xuất ra Excel/PDF
thì vẫn có số đúng.

**Nguyên nhân**: đánh số "TT" (`lib/reportCellFormat.js:computeSttValues()`)
trước đây CHỈ được gọi lúc xuất Excel/PDF/email
(`lib/exportExcel.js`/`lib/exportPdf.js`/`lib/emailBodyRenderer.js`) —
chưa bao giờ được gọi khi trả dữ liệu JSON cho web (`POST
/reports/:id/run`), nên cột này luôn trống trên cả trang "Báo cáo" lẫn
mỗi ô Dashboard (2 nơi dùng CHUNG 1 route, nên sửa đúng 1 chỗ là áp dụng
cho cả 2).

**Đã sửa**: `rp-server/lib/compositeReportRunner.js` — gọi đúng lại
`computeSttValues()` ngay khi trả kết quả (cả 3 nhánh: phẳng, groupBy,
topN), gán `row.stt` TRƯỚC khi trả JSON — số hiện trên web giờ khớp
TUYỆT ĐỐI với số đã xuất Excel/PDF (đánh số 1,2,3... theo từng nhóm, để
trống đúng ở dòng "Tổng cộng"). Chỉ sửa backend, không đổi gì ở
Excel/PDF/email (đã tự đúng từ trước).

## 9.38 — Nút "Khoá"/"Kích hoạt" cho "Ánh xạ Điểm - STK_ID" (etl-admin)

**Theo yêu cầu người dùng** — trang "Ánh xạ Điểm - STK_ID" trước đây chỉ
có nút "Xoá" từng dòng; nhiều khi admin cấu hình trước 1 mã Điểm (vd siêu
thị sắp mở) nhưng chưa muốn báo cáo lấy dữ liệu dòng đó ngay, rồi sau này
lại muốn bật lại — bấm "Xoá" thì mất hết cấu hình, phải khai lại từ đầu.

Thêm cột `IsActive` (mặc định `1`, `etl-db/schema.sql`) + route
`PUT /diem-stk-mapping/:id/active` (`etl/routes/admin/diemStkMapping.js`)
+ nút **"Khoá"/"Kích hoạt"** ở mỗi dòng (`etl-admin/src/pages/DiemStkMappingPage.jsx`).
Dòng đang khoá (`IsActive=0`) bị `rp-server/lib/diemStkMapping.js` BỎ QUA
HẲN khi đọc bảng ánh xạ (`WHERE IsActive = 1`) — hiệu ứng với MỌI báo cáo
dùng bảng này (composite LDTD/HCRC, Core stock=0, phạm vi dữ liệu theo
siêu thị, đơn đặt hàng...) Y HỆT bấm "Xoá", nhưng cấu hình
(MaStkCu/MaStkMoi/BuId/TenSieuThi/LoaiChuoi) vẫn GIỮ NGUYÊN trong CSDL —
bấm "Kích hoạt" là dùng lại ngay, không cần khai lại.

## 9.37 — Thêm ô tìm kiếm người dùng ở trang Phân quyền (rp-user)

**Theo yêu cầu người dùng** — trang Hệ thống → Phân quyền → tab "Người
dùng" chỉ có danh sách dài, không có cách lọc nhanh khi cần tìm 1 người
cụ thể để gán vai trò/quyền riêng.

Thêm ô tìm kiếm phía trên bảng (`rp-user/src/modules/system/permissions/UsersPage.jsx`),
lọc NGAY trên danh sách đã tải (không gọi lại API), khớp theo Username/Họ
tên/Email/Phòng ban/Chức danh/Nơi làm việc, không phân biệt hoa thường và
dấu tiếng Việt (vd gõ "linh" vẫn tìm ra "Linh", "Lính"...). Hiện kèm số
dòng tìm thấy ("Tìm thấy X/Y người dùng") và nút "Xoá tìm kiếm".

Chỉ sửa giao diện (frontend), không đổi API/CSDL.

## 9.36 — Báo cáo `bc-ton-kho-0`: thêm cột "Tồn kho hôm qua" + "Bán hôm nay"

**Theo yêu cầu người dùng** — báo cáo "Top bán chạy đang tồn kho = 0" chỉ
hiện kết quả cuối (`Tồn kho hiện tại`), người xem không tự đối chiếu được
vì sao ra đúng số đó. Thêm 2 cột hiển thị mới, lộ rõ 2 số đầu vào của công
thức `Tồn kho hiện tại = Tồn kho hôm qua − Bán hôm nay`:
- **Tồn kho hôm qua** — tồn kho snapshot gần nhất TRƯỚC hôm nay (nguồn
  giống số đang dùng để tính, không đổi logic tính).
- **Bán hôm nay** — số lượng bán ĐÚNG hôm nay (CỐ Ý khác cột "Số lượng
  bán (trong kỳ)" đã có — cột đó theo "Khoảng thời gian xếp hạng" người
  dùng chọn, có thể 7/30 ngày; công thức tồn kho luôn dùng đúng hôm nay
  bất kể chọn khoảng nào).

Chỉ thêm cột hiển thị, KHÔNG đổi công thức tính `estimatedStock` hiện có,
KHÔNG đổi CSDL. Sửa `rp-server/lib/topSellingZeroStockRunner.js` (thêm 2
cột trong `describeColumns()` + gán giá trị khi build dòng) và tài liệu
`bc-ton-kho-0.md` (mục "Cột hiển thị CỐ ĐỊNH").

## 9.35 — Sửa tài liệu `bc-ton-kho-0.md`: VIEW tồn kho dùng đúng bảng `STK_INFO` (DBA xác nhận)

**Theo thực tế triển khai + DBA xác nhận** — bảng `DSTK_INFO` (VIEW tồn
kho mẫu ban đầu) TRỐNG HOÀN TOÀN ở hệ thống thật, không phải lỗi, chỉ là
CSDL đó không dùng bảng này. Tra lại + DBA xác nhận bảng tồn kho THẬT là
`STK_INFO` (kiểu sổ cái luỹ kế, không có cột ngày snapshot sẵn) — công
thức DBA xác nhận: `SL tồn cuối = M_BEGIN + M_IMP - M_EXP`.

Đã cập nhật VIEW mẫu `vw_TonKhoTheoSKU` dùng `STK_INFO` + công thức trên,
`EventDate = GETDATE()` (tự xây lịch sử theo ngày qua các lần đồng bộ
hàng ngày, vì nguồn không có sẵn lịch sử). Giữ lại mẫu `DSTK_INFO` cũ làm
phương án dự phòng (ghi rõ điều kiện dùng — chỉ khi bảng đó thật sự có
dữ liệu).

Chỉ sửa tài liệu, không đổi code.

## 9.34 — Sửa tài liệu `bc-ton-kho-0.md`: thêm `GO`/`CREATE OR ALTER` + hướng dẫn đối chiếu TRANS_CODE

**Theo thực tế triển khai với người dùng** — 2 câu `CREATE VIEW` ở Bước 1
dán liền nhau KHÔNG có `GO` ở giữa gây lỗi "Incorrect syntax near the
keyword 'CREATE'" (CREATE VIEW phải là câu đầu tiên trong 1 batch). Đã
sửa tài liệu: thêm `GO` giữa 2 câu, đổi `CREATE VIEW` → `CREATE OR ALTER
VIEW` (an toàn chạy lại nhiều lần), và thêm hướng dẫn kiểm tra VIEW có dữ
liệu thật + câu đối chiếu `TRANS_CODE` thật qua `STRANS` trước khi coi là
xong Bước 1 (CREATE VIEW chạy "thành công" không đồng nghĩa mã lọc đúng —
gặp thật: file mẫu dùng `TRANS_CODE IN ('01','02')` chỉ là ví dụ, không
khớp dữ liệu thật nào).

Chỉ sửa tài liệu `bc-ton-kho-0.md`, không đổi code.

## 9.33 — SỬA LỖI THẬT: mobile không thấy "Tài khoản của tôi"/"Đăng xuất" khi menu dài (cả 3 app)

**Theo báo cáo người dùng** (ảnh chụp màn hình etl-admin trên điện thoại,
menu cuộn tới "Hướng dẫn" nhưng không thấy "Tài khoản của tôi") — sidebar
trên mobile là `position: fixed` (chiều cao = viewport) nhưng KHÔNG có
`overflow-y: auto` — khi vai trò thấy nhiều mục menu (vd vai trò "hệ
thống"), tổng chiều cao brand+menu+footer vượt màn hình mà KHÔNG cuộn
được, đẩy "Tài khoản của tôi"/"Đăng xuất" ra ngoài vĩnh viễn, không cách
nào bấm tới. Đã mô phỏng bằng Playwright (viewport 390×500) xác nhận lỗi
và xác nhận cách sửa đúng.

- **Sửa cả 3 file `styles.css`** (etl-admin/api-admin/rp-user) — thêm
  `.menu { overflow-y: auto; min-height: 0; }` trong khối `@media
  (max-width: 880px)` — CHỈ riêng danh sách menu cuộn, phần đầu trang
  (brand) và cuối trang (Tài khoản/Đăng xuất) LUÔN cố định hiện trên/dưới,
  không bị đẩy khuất nữa, dù menu dài bao nhiêu.
- KHÔNG đổi code JS/cấu trúc HTML (Layout.jsx), chỉ thêm CSS.

## 9.32 — Thêm "Xuất Excel" danh sách job đồng bộ (trang Đồng bộ, etl-admin)

**Theo yêu cầu người dùng** — khu vực "Nhập hàng loạt" (trang Đồng bộ)
trước đây chỉ có "Tải file mẫu" (2 dòng ví dụ) + nộp file, không có cách
xuất ra danh sách job ĐANG CÓ để sửa hàng loạt rồi nộp lại (vd đổi
`CronExpression` nhiều job cùng lúc).

- `etl/lib/syncJobsImport.js`: thêm `exportSyncJobs(pool)` — xuất mọi job
  `Type='table'` hiện có, ĐÚNG khuôn cột với file mẫu/Nhập hàng loạt
  (`Name`, `DataSourceName`, `TargetDomain`, `SourceSchema`, `SourceTable`,
  `KeyColumn`, `DateColumn`, `UpdatedAtColumn`, `DimensionColumns`,
  `MeasureColumns`, `CronExpression`, `KeepHistory`, `IsActive`) — sửa xong
  nộp thẳng lại qua "Nhập hàng loạt". Job `Type='custom'` không xuất (Nhập
  hàng loạt cũng không hỗ trợ loại đó).
- `etl/routes/admin/syncJobs.js`: route mới `GET /sync-jobs/export`.
- `etl-admin/src/pages/SyncJobsPage.jsx`: nút "Xuất Excel (danh sách hiện
  có)" cạnh "Tải file mẫu".

## 9.31 — Sửa `addThanhVienStore.js` (bản 9.30): gõ thông tin siêu thị TRONG FILE, không qua tham số dòng lệnh

**Theo yêu cầu người dùng** — bản 9.30 dùng tham số dòng lệnh
(`node scripts/addThanhVienStore.js "Tên" "IP"`), người dùng không quen
thao tác này, muốn giống hệt kiểu mảng `STORES` của
`seedThanhVienLiveSync.js` (gõ thẳng vào file). Đã sửa: thêm object
`STORE` ngay đầu file (name/server bắt buộc; port/username/password/
database/encrypt/trustServerCert tuỳ chọn, comment sẵn mẫu) — điền xong
chạy KHÔNG CẦN tham số:
```bash
cd etl
node scripts/addThanhVienStore.js
```
Script tự chặn + báo lỗi rõ nếu quên sửa `STORE.name`/`STORE.server`
(còn nguyên giá trị mẫu). Logic tạo Nguồn dữ liệu + 2 Sync Job giữ nguyên
như bản 9.30, không đổi gì khác.

## 9.30 — Script thêm 1 siêu thị Thành viên mới (không cần sửa/chạy lại file 34 siêu thị cũ)

**Theo yêu cầu người dùng** — thêm `etl/scripts/addThanhVienStore.js`, làm
ĐÚNG 2 việc cho 1 siêu thị MỚI (giống hệt 1 phần tử trong mảng `STORES`
của `scripts/seedThanhVienLiveSync.js`, cùng mặc định port/username/
password/database/VIEW/cron — không lệch cấu hình 34 siêu thị đã có):
1. Tạo/cập nhật 1 "Nguồn dữ liệu" (`DSMART16 - <Tên siêu thị>`).
2. Tạo/cập nhật 2 Sync Job Live (Doanh thu + Giao dịch, cron 2 phút/lần).

Dùng khi chỉ cần thêm 1 siêu thị, không phải sửa mảng `STORES` (34 siêu
thị) rồi chạy lại cả file — dù file đó vẫn an toàn chạy lại nhiều lần.

```bash
cd etl
node scripts/addThanhVienStore.js "Tên siêu thị mới" "IP server"
```
Vẫn cần chạy `deploy/Thiết lập VIEW + tài khoản etl_reader tại mỗi siêu
thị Thành viên.sql` tại máy chủ SQL Server của siêu thị mới TRƯỚC (như 34
siêu thị cũ) — thiếu VIEW thì 2 Sync Job bị bỏ qua, script tự báo rõ, chạy
lại sau khi có VIEW là được. Sau khi chạy xong, nhớ thêm thủ công 1 dòng
vào mảng `STORES` trong `seedThanhVienLiveSync.js` (commit git) để siêu
thị này không "biến mất" khỏi code nếu sau này setup lại môi trường.

## 9.29 — SỬA LỖI THẬT: job Lịch sử (DSMART16_EOM) vẫn lỗi "trùng khoá UNIQUE" lặp lại, không tiến được

**Theo báo cáo người dùng** (job Lịch sử đứng yên ở năm 2023, không lên
tới 2024-2026) — tra `etl.SyncLog` thấy job lỗi lặp lại
`Violation of UNIQUE KEY constraint 'UX_ReportFacts_Source_Domain_Entity_Date'`,
mỗi lần 1 khoá khác nhau. Đã TRA TẬN NGUỒN (không đoán): bảng
`STRANS_202105` có THẬT 2 dòng cùng `(TRANS_NUM, IDX)` nhưng QTY/AMOUNT
khác nhau (vd 1 giao dịch bị sửa/điều chỉnh ghi thêm dòng mới ở nguồn thay
vì UPDATE dòng cũ) — dedupeByBusinessKey() (bản 9.26) chỉ loại trùng
TRONG ĐÚNG 1 lô trích xuất; 2 dòng trùng khoá nghiệp vụ này có thể rơi
vào 2 LÔ KHÁC NHAU (OFFSET/FETCH không có tiêu chí sắp xếp phụ ổn định
giữa các lượt SELECT riêng biệt) nên không bị loại, khiến MERGE báo lỗi
và ROLLBACK NGUYÊN LÔ — job FAILED, không tiến thêm, lượt sau lại gặp
y hệt (dữ liệu nguồn không đổi).

- **`etl/lib/tableSyncEngine.js`**: thêm tiêu chí sắp xếp PHỤ (`keyCol`)
  vào `ORDER BY` của `extractTable()` — 2 dòng cùng khoá nghiệp vụ luôn
  đứng CẠNH NHAU, ổn định giữa các lượt gọi, giảm khả năng rơi vào 2 lô
  khác nhau.
- **`etl/lib/upsert.js`**: khi MERGE báo lỗi trùng khoá UNIQUE (SQL
  2627/2601), KHÔNG còn coi là lỗi fatal — tự CHIA ĐÔI lô, thử lại riêng
  từng nửa (đệ quy hội tụ dần); nếu chia tới đúng 1 dòng vẫn lỗi (dấu hiệu
  chạy chồng với 1 lượt ghi khác), thử lại thêm đúng 1 lần. Tự phục hồi
  được dù dữ liệu nguồn có bao nhiêu dòng trùng khoá, không cần biết trước
  ở đâu.
- Đã kiểm tra bằng mô phỏng (không cần CSDL thật) — xác nhận cơ chế chia
  đôi hội tụ đúng, xử lý đủ mọi dòng kể cả khi có khoá trùng.

**Không cần DBA chạy lại gì** — chỉ cần restart `etl` (data-fix, nạp code
mới), job sẽ TỰ chạy tiếp từ watermark hiện tại (không mất tiến độ đã có),
không còn bị kẹt lại ở lượt trùng khoá kế tiếp.

## 9.28 — Script bù dữ liệu 130/330 (watermark job `don_dat_hang` đã vượt qua các đơn cũ)

**Theo báo cáo người dùng** — sau khi chạy 2 file VIEW bản 9.27 (thêm
`130`/`330` vào `WHERE TRANS_CODE IN (...)`), báo cáo "Đơn đặt hàng" lọc
kênh "Mua chung"/"Mua riêng" theo mã mới vẫn **CHƯA RA DỮ LIỆU** — nguyên
nhân: 2 job đồng bộ domain `don_dat_hang` (job "Live" DSMART16 trung tâm
VÀ job "Lịch sử" DSMART16_EOM) đã chạy qua các mốc thời gian **TRƯỚC KHI**
VIEW được sửa — `etl.SyncState.LastSyncedAt` của 2 job này giờ đã vượt xa
thời điểm phát sinh các đơn `130`/`330` **TRONG QUÁ KHỨ**, nên dù VIEW đã
lọc đúng, lượt chạy định kỳ tiếp theo chỉ lấy dòng **MỚI PHÁT SINH**
(`WHERE UpdatedAt >= watermark`) — không tự quay lại bù các đơn cũ.

- Thêm `etl/scripts/resyncDonDatHangWatermark.js` — reset
  `LastSyncedAt` về EPOCH cho MỌI job `TargetDomain='don_dat_hang'`, để
  lượt chạy kế tiếp tự quét lại TOÀN BỘ nguồn. **KHÔNG xoá dữ liệu cũ**
  (khác `resyncGiaodichChinhanh.js`) — dữ liệu `133`/`333` đã đồng bộ
  trước đó vẫn đúng, `upsertReportFacts()` (MERGE theo khoá nghiệp vụ) chỉ
  cập nhật no-op các dòng cũ và chèn mới đúng các dòng `130`/`330` còn
  thiếu.
- Mặc định dry-run (chỉ xem trước, không đổi gì); truyền `--confirm` mới
  thực sự reset.

## 9.27 — THÊM MỚI: Mã giao dịch 130/330 + bộ lọc "Kênh mua" cho 6 báo cáo Mua hàng

**Theo yêu cầu người dùng** — hệ thống trước đây CHỈ lấy mã giao dịch
`133`(đặt)/`333`(nhập), LOẠI BỎ HẲN 2 mã `130`/`330` thuộc 1 kênh mua
hàng khác — không phải lỗi đồng bộ, VIEW nguồn chưa từng lọc 2 mã này.

- **Xác nhận ý nghĩa** (đã hỏi lại người dùng từng mã một, tránh lặp lại
  bài học đoán sai nguồn dữ liệu ở bản 8.92):
  - `133` = Đặt hàng, kênh **"Mua riêng"** — `130` = Đặt hàng, kênh "Mua riêng"
  - `330` = Đặt hàng, kênh **"Mua chung" (qua Fuji)** — `333` = Nhập hàng, kênh "Mua chung"
  - Kênh "Mua riêng" chỉ có 2 mã đặt, không có mã nhập riêng.
- **Sửa**: 2 file VIEW SQL (`deploy/Thiết lập VIEW Đơn đặt hàng-Nhập
  hàng-So sánh (DSMART16 trung tâm).sql` và `deploy/Thiết lập VIEW Đơn đặt
  hàng Lịch sử (DSMART16_EOM).sql`) thêm `130`/`330` vào
  `WHERE TRANS_CODE IN (...)` — **CẦN DBA CHẠY LẠI** cả 2 file trên CSDL
  tương ứng. `rp-server/lib/purchaseOrderRunner.js` sửa để nhận diện đúng
  đặt/nhập theo 4 mã.
- **Thêm bộ lọc "Kênh mua"** ("Mua riêng"/"Mua chung qua Fuji") ở CẢ 6
  báo cáo nhóm Mua hàng — kèm ghi chú giải thích ngay dưới bộ lọc, hiện
  trên web qua `FilterForm.jsx` (field `f.hint` mới).
- Không chọn gì ở bộ lọc "Kênh mua" = hiện CẢ 2 kênh gộp chung như trước
  (không đổi hành vi mặc định các báo cáo đã quen dùng).

## 9.26 — SỬA LỖI QUAN TRỌNG: job Lịch sử lỗi lặp lại vô thời hạn + 2 cải tiến giao diện

**1) SỬA LỖI THẬT (nguyên nhân chính khiến dữ liệu lịch sử Đơn đặt hàng
luôn thiếu)** — theo báo cáo người dùng (ảnh lỗi job): job "Đơn đặt hàng -
nhập hàng - Lịch sử (DSMART16_EOM)" báo lỗi lặp lại mãi mỗi lần cron chạy
lại (3h sáng): `Violation of UNIQUE KEY constraint
UX_ReportFacts_Source_Domain_Entity_Date... Cannot insert duplicate key`.

- **Nguyên nhân**: 1 lô dữ liệu đưa vào ghi (`#Staging`) chứa 2+ dòng CÙNG
  1 khoá nghiệp vụ (SourceSystem, Domain, EntityCode, EventDate) — do
  nguồn thật có dữ liệu trùng (cùng giao dịch lọt vào cả bảng tháng VÀ
  bảng `STRANS_EOM`) và/hoặc do phân trang OFFSET không có tiêu chí sắp
  xếp tuyệt đối duy nhất. MERGE cố ghi dòng thứ 2 trong khi dòng thứ nhất
  (cùng lô, chưa commit) đã chiếm khoá đó → vi phạm UNIQUE KEY → rollback
  NGUYÊN CẢ LÔ. Lỗi này KHÔNG tự hết dù thử lại bao nhiêu lần (khác lỗi
  mạng tạm thời) — job cứ lặp lại thất bại mãi mãi ở đúng lô đó.
- **Sửa**: `etl/lib/upsert.js` loại trùng khoá nghiệp vụ TRƯỚC khi ghi
  (giữ bản ghi cuối cùng gặp phải cho mỗi khoá trùng).
- **Cải tiến đi kèm**: `etl/jobs/runSync.js` giờ lưu TẠM mốc đồng bộ
  (watermark) SAU MỖI LÔ thay vì chỉ 1 lần lúc xong hẳn — nếu tiến trình
  `etl` bị khởi động lại giữa chừng (job Lịch sử có thể chạy nhiều giờ),
  lượt chạy sau tiếp tục ĐÚNG từ chỗ dở dang thay vì phải quét lại từ đầu.

**2) THAY ĐỔI giao diện đăng nhập — "thu gọn" (3 app)**: theo yêu cầu
người dùng (gửi kèm ảnh mẫu) — màn hình đăng nhập đổi từ trải dài hết
toàn bộ chiều cao màn hình sang 1 thẻ bo tròn/đổ bóng, căn giữa trang —
giữ nguyên màu sắc/chữ/hình minh hoạ riêng từng app, chỉ đổi khung bố cục.
Màn hình hẹp (điện thoại) tự quay lại kiểu trải hết màn hình như cũ.

**3) SỬA LỖI: ô ngày dd/mm/yyyy (bản 9.25) khó bấm mở lịch** — theo báo
cáo người dùng: phải bấm ĐÚNG vào icon 📅 mới mở được lịch, bấm vào chữ
thì không có phản hồi gì. Giờ gọi `input.showPicker()` ngay khi bấm vào
BẤT KỲ đâu trong ô — mở lịch ngay không cần nhắm đúng icon (trình duyệt
cũ không hỗ trợ `showPicker()` vẫn còn đường lùi như cũ, không mất gì).

## 9.25 — THAY ĐỔI: Mọi ô nhập ngày đổi sang hiện dd/mm/yyyy (3 app)

**Theo yêu cầu người dùng** — ô nhập ngày kiểu chuẩn trình duyệt
(`<input type="date">`) hiện `mm/dd/yyyy` hay `dd/mm/yyyy` tuỳ NGÔN NGỮ/
VÙNG của máy người dùng, web không tự quyết định được — máy đặt tiếng Anh
(Mỹ) sẽ luôn hiện kiểu Mỹ dù không mong muốn.

- Thêm component dùng chung `components/DateInput.jsx` (bản sao độc lập ở
  cả 3 app, cùng quy ước `LoginPage.jsx`) — vẫn DÙNG `<input type="date">`
  THẬT bên dưới (ẩn đi, vẫn nhận click/gõ phím) để giữ lịch chọn ngày có
  sẵn của hệ điều hành (tiện trên điện thoại — rp-user nhiều người dùng
  xem trên mobile), chỉ vẽ ĐÈ lên 1 lớp hiển thị LUÔN đúng dd/mm/yyyy.
  `value`/`onChange` giữ NGUYÊN hợp đồng y hệt input ngày thường (chuỗi
  ISO yyyy-mm-dd) — KHÔNG đổi gì ở backend/API, chỉ đổi cách hiển thị.
- Áp dụng cho toàn bộ 22 ô ngày ở 3 app: etl-admin (Nhật ký thao tác, Log,
  Chỉ tiêu bán hàng), api-admin (Nhật ký thao tác, Log, Lịch sử), rp-user
  (bộ lọc ngày động của MỌI báo cáo qua `FilterForm.jsx`, Dashboard, Báo
  cáo tự do, Nhật ký thao tác, Nhật ký hệ thống).

## 9.24 — SỬA LỖI: Dropdown "Nhà cung cấp" chậm ở 6 báo cáo Mua hàng

**Theo báo cáo người dùng** — mở bộ lọc "Nhà cung cấp" phải đợi một lúc
mới ra danh sách.

- **Nguyên nhân**: `routes/reports.js:GET /:reportId/filter-options/:field`
  quét `JSON_VALUE()` + `ROW_NUMBER()` trên TOÀN BỘ dòng của domain mỗi lần
  mở dropdown — domain `don_dat_hang` giờ có thêm nhiều năm dữ liệu lịch sử
  (bản 9.21/9.22) nên chậm hẳn so với trước.
- **Sửa**: thêm cache 10 phút riêng cho đường này (TÁCH khỏi cache 30 giây
  của `/run` — danh sách NCC gần như không đổi phút-qua-phút, khác kết quả
  báo cáo cần mới hơn). Lần mở ĐẦU TIÊN sau khi cache hết hạn vẫn mất thời
  gian như cũ (chưa đụng tới việc đánh index/chuyển cột tính toán trên CSDL
  — cần bàn thêm với DBA nếu muốn nhanh ngay cả lần đầu), nhưng các lần mở
  lại trong vòng 10 phút sau đó sẽ nhanh ngay.

## 9.23 — SỬA LỖI: Treo trình duyệt khi xem báo cáo Mua hàng có nhiều dữ liệu lịch sử

**Theo báo cáo người dùng** (ảnh chụp màn hình xám trống, "hệ thống treo
luôn") — sau khi bản 9.21/9.22 bổ sung dữ liệu lịch sử nhiều năm cho 6 báo
cáo Mua hàng, chọn 1 khoảng ngày (vd 1 tháng) ra rất nhiều dòng khiến trình
duyệt treo cứng khi xem trên web (không gặp lại lỗi "thiếu dữ liệu" nữa —
đã xác nhận dữ liệu lịch sử lên đúng).

- **Nguyên nhân**: `lib/purchaseOrderRunner.js` (từ bản 9.17, sửa lỗi
  "khoảng ngày rộng mất dữ liệu") cố ý lấy ĐỦ mọi dòng từ SQL, không còn
  tôn trọng tham số phân trang — ĐÚNG cho Xuất Excel/PDF (phải đủ dữ liệu),
  nhưng applying luôn cho cả lúc xem trên web (bình thường chỉ hiện tối đa
  200 dòng/trang như mọi báo cáo khác) — DataTable.jsx không ảo hoá, phải
  dựng hàng chục nghìn `<tr>` cùng lúc khi dữ liệu lịch sử lớn.
- **Sửa**: chỉ cắt bớt về 200 dòng khi gọi từ API "xem trên web"
  (`routes/reports.js` gắn cờ `capForDisplay`) — Xuất Excel/PDF, gửi email
  theo lịch, cảnh báo bất thường, widget Dashboard đều KHÔNG bị ảnh hưởng,
  vẫn nhận đủ dữ liệu như trước. Khi bị cắt, web hiện thêm dòng cảnh báo
  "Chỉ hiện N dòng đầu... Bấm Xuất Excel/PDF để xem đầy đủ"; dòng "Tổng
  cộng" (3 báo cáo có) vẫn cộng đúng TOÀN BỘ dữ liệu, không chỉ phần hiện
  ra.

## 9.22 — THÊM MỚI: Nút "Nhân bản" cho các trang Nguồn dữ liệu/Đối tác API/Job đồng bộ

**Theo yêu cầu người dùng**: nhiều kết nối (nguồn dữ liệu ETL/API/Biểu
mẫu) hoặc đối tác API dùng chung cấu hình (server/database/username/
password, hoặc cách xác thực) — chỉ khác tên. Thêm nút "Nhân bản" bên
cạnh "Sửa" để tạo 1 bản ghi mới giống hệt, chỉ cần đổi tên — không phải
gõ lại thủ công (và không phải hiện mật khẩu ra để copy).

- Nguyên tắc chung: route mới `POST /:id/duplicate` đọc NGUYÊN VẸN các cột
  (kể cả cột bí mật ĐÃ MÃ HOÁ) từ bản ghi gốc rồi INSERT bản ghi mới cùng
  giá trị, chỉ đổi `Name` — không giải mã, không gửi mật khẩu/API key qua
  request body hay hiện ra trình duyệt lúc nhân bản.
- Áp dụng cho 7 trang: `etl-admin` (Nguồn dữ liệu, Job đồng bộ — job mới
  tạo ở trạng thái TẮT để tránh chạy trùng), `api-admin` (Nguồn dữ liệu,
  Đối tác API), `rp-user` trang "Biểu mẫu" (Kết nối API, Nguồn dữ liệu bổ
  sung, Kết nối đối tác ngoài).
- **Ngoại lệ bảo mật — "Đối tác API" (api.ApiConsumers)**: KHÔNG copy bí
  mật cũ (ApiKeyHash/ClientSecretHash/HmacSecretEncrypted) — route nhân
  bản LUÔN cấp bí mật HOÀN TOÀN MỚI (chạy đúng logic sinh bí mật của route
  tạo/luân chuyển), hiện ra đúng 1 lần qua banner sau khi tạo — 2 đối tác
  không bao giờ dùng chung 1 bí mật.
- Quy ước này đã ghi vào `CLAUDE.md` để áp dụng cho mọi trang "kết nối"
  tương tự làm thêm sau này.

## 9.21 — BỔ SUNG: Nguồn Lịch sử (DSMART16_EOM) cho 6 báo cáo Mua hàng — trước chỉ lấy được tháng hiện tại

**Theo báo cáo người dùng** (ảnh chụp: lọc "Ngày đặt" nhiều tháng trước
nhưng chỉ ra đúng dữ liệu tháng hiện tại, dù đã ép đồng bộ lại từ đầu) —
domain `don_dat_hang` thiếu hẳn nguồn "Lịch sử", giống lỗi đã gặp + đã sửa
trước đây ở báo cáo doanh thu.

- **Nguyên nhân**: job đồng bộ "Đơn đặt hàng - nhập hàng (DSMART16)" chỉ
  đọc VIEW trên CSDL `DSMART16` (Live) — bảng `STRANS` ở đó chỉ giữ giao
  dịch gần đây, dữ liệu cũ hơn đã chuyển sang CSDL riêng `DSMART16_EOM`
  (~93 bảng theo tháng) mà job Live không bao giờ đọc tới.
- **Sửa**: thêm `deploy/Thiết lập VIEW Đơn đặt hàng Lịch sử (DSMART16_EOM).sql`
  (VIEW cùng tên `vw_DonDatHangChiNhanh` chạy trên `DSMART16_EOM`, UNION
  ALL tự động toàn bộ bảng `STRANS_YYYYMM`/`STRANS_EOM` + stored procedure
  tự làm mới hàng tháng) và `etl/scripts/seedDonDatHangHistorySync.js`
  (tạo job đồng bộ "Lịch sử" THỨ 2, cùng `TargetDomain` `don_dat_hang` với
  job Live — áp dụng tự động cho cả 6 báo cáo mua hàng, không cần sửa
  `rp-server`). Mirror đúng kiến trúc "Script A/Script B" đã dùng cho báo
  cáo doanh thu cuối ngày.
- Cập nhật `bc-don-dat-hang.md` mục 6.6 — thứ tự triển khai đầy đủ (DBA
  chạy SQL → chạy script seed → theo dõi Sync Jobs → kiểm tra lại báo
  cáo).

## 9.20 — SỬA LỖI THẬT: Trang "Cấu hình Voucher" (api-admin) lỗi 500 do thiếu `requireAdminAuth`

**Theo báo cáo người dùng** (Console DevTools: `GET`/`PUT /admin/voucher-settings` đều `500`; trang "Log" cho đúng dòng `Cannot read properties of undefined (reading 'sub')`).

- **Nguyên nhân**: `api-server/routes/admin/voucherSettings.js` thiếu hẳn
  middleware `requireAdminAuth` (`lib/adminAuth.js`) — route chỉ gắn
  `requireMenuAccess('voucher-settings')`, nhưng hàm này (và
  `requireMenuEdit`) đọc `req.admin.sub`, mà `req.admin` CHỈ được gán bởi
  `requireAdminAuth` chạy TRƯỚC đó. Thiếu middleware này khiến `req.admin`
  luôn `undefined` → vỡ ngay ở `req.admin.sub` → rơi vào lỗi 500 chung cho
  CẢ `GET` lẫn `PUT`. Đây là lỗi sót từ lúc tạo route này (không phải lỗi
  mới phát sinh), mọi route `/admin/*` KHÁC đều đã có đúng middleware này.
- **Sửa**: thêm `router.use(requireAdminAuth, requireMenuAccess(...))`
  đúng khuôn mọi route admin khác (`routes/admin/dataSources.js`,
  `routes/admin/realtimeEndpoints.js`...). Đã rà soát lại TOÀN BỘ 15 file
  `routes/admin/*.js` dùng `requireMenuAccess`/`requireMenuEdit` — xác
  nhận CHỈ `voucherSettings.js` thiếu, không còn trang nào khác bị lỗi
  tương tự.

## 9.19 — SỬA LỖI THẬT: API check/redeem voucher tra sai cột (BARCODE → CARD_ID)

**Theo báo cáo người dùng** (ảnh app "HCRC Voucher Redemption": quét 1
voucher ĐÃ BIẾT là đã dùng nhưng app báo "KHÔNG HỢP LỆ/không tồn tại" thay
vì "đã được sử dụng") — người dùng tự tra trực tiếp DSMART16 bằng SSMS
(`sp_columns`, `SELECT ... WHERE CARD_ID = ...`) giúp xác định đúng nguyên
nhân gốc.

- **Nguyên nhân**: `api-server/lib/voucherRedeemService.js` tra/ghi
  `PMCRDINF` theo cột `BARCODE` — cột này **THƯỜNG RỖNG** trên dữ liệu
  thật, khiến MỌI voucher hợp lệ (kể cả đã dùng/còn hạn) đều bị báo nhầm
  "không tồn tại". Mã `voucherCode` app gửi lên cũng LUÔN thừa đúng 1 ký
  tự `C` ở đầu so với `CARD_ID` lưu trong CSDL (xác nhận thật: mã quét
  `CE34000089252` ↔ `CARD_ID` lưu `E34000089252`).
- **Sửa**: đổi cột khoá tra/ghi từ `BARCODE` sang `CARD_ID`; thêm
  `normalizeCardId()` LUÔN bỏ ký tự `C`/`c` đầu (nếu có) trước khi tra —
  áp dụng cả `/check` lẫn `/redeem`, không cần đối tác (app quét mã) đổi
  gì phía họ. Đã kiểm chứng bằng mô phỏng gọi thật `checkVoucher()`/
  `redeemVoucher()` với dữ liệu giả lập đúng tình huống lỗi trước khi
  merge.
- Cập nhật tài liệu hợp đồng API (`api-voucher-check-redeem.md`,
  `api-voucher-check-redeem-gui-doi-tac.md`) và `hướng_dẫn_báo_cáo.md` mục
  13 ghi rõ quy tắc `CARD_ID`/bỏ ký tự `C` đầu này, để cấu hình "Endpoint
  realtime"/"Endpoint ghi" tổng quát sau này (nếu dùng) không lặp lại lỗi
  tương tự.

## 9.18 — Sửa lỗi 500 TOÀN BỘ báo cáo mua hàng (lỗi tự gây ra ở bản 9.17)

**Theo báo cáo người dùng** (ảnh F12/DevTools: `500 Internal Server
Error` trên `api/reports/bc-don-dat-hang/run`) — TẤT CẢ 6 báo cáo mua
hàng (Đơn đặt hàng, Đơn nhập hàng, So sánh đặt–nhận, Giá trị đặt/nhập
theo đơn, So sánh giá trị theo NCC) lỗi ngay khi bấm "Lọc"/chạy báo cáo.

- **Nguyên nhân**: khi đổi tên cột tiếng Việt ở bản 9.17, các cột tham
  chiếu field thô (không tính toán gì, vd `eventDate`, `SoDon`, `TenDiem`,
  `MaNCC`, `TenNCC`, `NgayGiao`) bị viết thành `{key, label}` nhưng THIẾU
  `formula` — hàm `projectColumns()` (`lib/reportEngine.js`) chỉ xử lý
  được 2 dạng cột: chuỗi thô, HOẶC object CÓ `formula`; object thiếu
  `formula` rơi vào nhánh `col.startsWith(...)` trong khi `col` là object
  → `TypeError: col.startsWith is not a function` → 500 cho MỌI báo cáo.
- **Sửa**: `scripts/seedPurchaseOrderReports.js` — thêm
  `formula: '<tên field>'` (tự tham chiếu đúng field gốc) vào mọi cột
  dạng này ở `commonHead()`, `COMMON_TAIL`, `orderTotalHead()`,
  `NGAY_GIAO_COL`, và 2 cột `MaNCC`/`TenNCC` khai trực tiếp trong báo cáo
  "So sánh giá trị đặt–nhập theo NCC".
- **Đã kiểm chứng trước khi merge**: viết lại mô phỏng gọi THẬT
  `describeColumns()`/`projectColumns()` từ `reportEngine.js` với TOÀN BỘ
  6 định nghĩa báo cáo thật + dữ liệu dòng giả lập — xác nhận cả 6 báo
  cáo chạy qua không còn lỗi (không chỉ `node --check` cú pháp, vì lỗi
  này chỉ lộ ra lúc THỰC THI).
- **Cần làm lại trên server sau khi `git pull`**: chạy lại
  `node scripts/seedPurchaseOrderReports.js` (ghi đè `DefinitionJson` mới
  vào DB) rồi `pm2 restart hcrc-rp-server` — giống bước triển khai bản
  9.17, phải chạy lại lần này mới hết lỗi 500.

## 9.17 — Sửa 3 lỗi + đổi tên cột tiếng Việt cho báo cáo mua hàng

**Theo báo cáo người dùng** (ảnh chụp thật "So sánh đặt–nhận" không thấy
bộ lọc Siêu thị + báo "Không có dữ liệu", yêu cầu lọc theo siêu thị/xem
được cả năm quá khứ/kiểm tra lại bộ lọc trạng thái/đổi tên cột tiếng Việt).

- `lib/purchaseOrderRunner.js` — **sửa lỗi thật**: thiếu dữ liệu khoảng
  ngày rộng (chỉ gọi SQL 1 lượt, tối đa 500 dòng — cùng lỗi/cùng cách sửa
  bản 8.99). Thêm `fetchAllReportRows()` lấy đủ dữ liệu.
- `lib/purchaseOrderRunner.js` — **sửa lỗi thật**: lọc Trạng thái trước
  đây áp vào dòng thô TRƯỚC khi gộp cặp đặt-nhận, có thể làm rụng mất
  dòng cần ghép cặp (1 đơn "Đã nhập 1 phần" có thể có dòng đặt/nhận trạng
  thái khác nhau) — chuyển lọc sang SAU khi gộp. Đã kiểm chứng bằng mô
  phỏng dữ liệu giả lập trước khi merge.
- Bộ lọc Siêu thị đã có từ bản 9.14 trong code — ảnh người dùng gửi không
  thấy là do server chưa chạy lại script seed (không phải lỗi code).
- `scripts/seedPurchaseOrderReports.js` — toàn bộ cột cả 6 báo cáo đổi từ
  chuỗi thô (`'eventDate'`, `'measures.ThanhTien'`) sang `{key,label}`
  tiếng Việt tường minh.

## 9.16 — Tìm kiếm không phân biệt dấu tiếng Việt ở mọi ô lọc multi-select

**Theo yêu cầu người dùng**: danh sách Nhà cung cấp rất dài, chọn kiểu
select khó dùng — xác nhận ô tìm kiếm (`SearchableSelect.jsx`) đã có sẵn
từ trước, dùng chung cho toàn bộ ô lọc multi-select, nhưng trước đây so
khớp CHUỖI NGUYÊN VĂN có dấu — gõ không dấu (rất phổ biến khi gõ nhanh
trên điện thoại) không ra kết quả.

- `normalizeVN()` — bỏ dấu qua NFD + xử lý riêng `đ`/`Đ` (không tách được
  qua NFD) — áp dụng cho cả chuỗi gõ tìm lẫn nhãn option.
- Áp dụng cho MỌI ô lọc multi-select trong hệ thống (component dùng
  chung), không riêng "Nhà cung cấp".

## 9.15 — Thêm dòng Tổng cộng cho 3 báo cáo giá trị đặt/nhập

**Theo yêu cầu người dùng**: "phải có tổng cộng giá trị để phần so sánh
giá nhập và đặt chính xác hơn".

- `lib/purchaseOrderRunner.js` — `appendGrandTotal()`: cộng dồn mọi
  measures số thành 1 dòng cuối, dùng đúng quy ước `__isSubtotal`/
  `__isGrandTotal` đã có sẵn (`lib/compositeReportRunner.js`) nên
  `DataTable.jsx` (web)/`exportExcel.js`/`exportPdf.js` tự nhận diện tô
  màu/in đậm, không cần đổi gì ở tầng hiển thị.
- Chỉ bật cho 3 báo cáo "giá trị" (`showGrandTotal: true`) — KHÔNG bật
  cho "Đơn đặt hàng"/"Đơn nhập hàng"/"So sánh đặt–nhận" vì có cột `DonGia`
  (đơn giá/1 đơn vị), cộng dồn đơn giá nhiều mặt hàng khác nhau ra số vô
  nghĩa, dễ hiểu lầm là "tổng giá trị".

## 9.14 — Mở rộng bộ lọc Siêu thị ra cả 6 báo cáo + sửa lỗi chọn nhãn cũ ở dropdown lọc

**Theo báo cáo người dùng** (ảnh chụp thật): dropdown "Nhà cung cấp" vẫn
hiện tên lỗi font dù VIEW nguồn đã sửa (bản 9.12), và báo cáo "Giá trị đặt
hàng theo đơn" chưa có bộ lọc Siêu thị như báo cáo So sánh theo NCC.

- `scripts/seedPurchaseOrderReports.js` — bộ lọc "Siêu thị" giờ gắn cho CẢ
  6 báo cáo (trước đây bản 9.13 chỉ gắn 1 báo cáo).
- `routes/reports.js` — **sửa lỗi thật**: dropdown filter-options trước
  dùng `MAX(JSON_VALUE(...))` chọn nhãn hiển thị — so sánh CHUỖI theo thứ
  tự chữ cái, không liên quan gì thời điểm đồng bộ, nên khi 1 giá trị có
  nhiều dòng lịch sử nhãn khác nhau có thể chọn NHẦM bản ghi CŨ. Đổi sang
  `ROW_NUMBER()...ORDER BY SyncedAt DESC` để luôn lấy đúng nhãn của lần
  đồng bộ GẦN NHẤT — áp dụng chung mọi báo cáo dùng `optionsSource.domain`.

**LƯU Ý quan trọng**: fix trên chỉ đúng từ lần đồng bộ TIẾP THEO — dữ liệu
LỊCH SỬ đã đồng bộ trước bản 9.12 vẫn cần ĐỒNG BỘ LẠI TOÀN BỘ (xoá
watermark `etl.SyncState`) mới hết hẳn lỗi font, vì "Chạy thử" bình thường
chỉ đồng bộ tăng dần.

## 9.13 — Thêm bộ lọc "Siêu thị" cho báo cáo So sánh giá trị đặt–nhập theo NCC

**Theo yêu cầu người dùng**: "cho thêm option chọn siêu thị, không chọn
gì = tất cả siêu thị, chọn siêu thị nào thì chỉ so sánh siêu thị đó thôi".

- `routes/reports.js` — `optionsSource.storeCatalog` (cơ chế lấy danh sách
  lựa chọn MỚI, khác hẳn `optionsSource.domain` thường dùng) — đọc trực
  tiếp bảng "Ánh xạ Điểm - STK_ID" thay vì domain đã đồng bộ, vì
  `Dimensions.MaDiem` trong domain `don_dat_hang` là BU_ID THÔ chưa dịch.
- `lib/purchaseOrderRunner.js` — lọc theo mã Điểm người dùng chọn SAU khi
  dịch BU_ID→MaDiem, TRƯỚC khi gộp theo NCC.
- `scripts/seedPurchaseOrderReports.js` — bộ lọc "Siêu thị" mới, chỉ gắn
  cho báo cáo "So sánh giá trị đặt–nhập theo NCC".

## 9.12 — Sửa dứt điểm lỗi font TenNCC/TenChiNhanh (SUPP_NAME_U, STK_NAME_U)

**Theo báo cáo người dùng** (ảnh chụp thật báo cáo "Đơn đặt hàng" ra chữ
lỗi font tên NCC) — người dùng chạy `INFORMATION_SCHEMA.COLUMNS` xác nhận
`SUPPLIER.SUPP_NAME_U` và `STOCK.STK_NAME_U` đều tồn tại (Unicode, đúng).

- `deploy/Thiết lập VIEW Đơn đặt hàng-Nhập hàng-So sánh (DSMART16 trung
  tâm).sql` + `bc-don-dat-hang.md` — `SUPP_NAME` → `SUPP_NAME_U`.
- `bc-ton-kho-0.md` + `deploy/Cập nhật bản 8.68 ...md` — `STK_NAME` →
  `STK_NAME_U`.

**BẮT BUỘC chạy lại VIEW trên DSMART16 trung tâm** (an toàn, `CREATE OR
ALTER`) rồi đồng bộ lại job `don_dat_hang` — job đồng bộ KHÔNG tự sửa dữ
liệu CŨ đã lưu lỗi font, chỉ dòng đồng bộ MỚI sau khi VIEW đã sửa mới
đúng.

## 9.11 — Thêm nút Sửa cho 3 panel rp-user (Nguồn dữ liệu/Kết nối API/Kết nối đối tác) + sửa lỗi validate PUT

**Theo yêu cầu người dùng** (rà soát toàn hệ thống thiếu nút Sửa, tiếp
sau bản 9.10).

- `DataSourcesPanel.jsx`, `ApiConnectionsPanel.jsx` — modal Sửa (mật
  khẩu/API key để trống = giữ nguyên).
- `ExternalConnectionsPanel.jsx` — tái dùng form tạo mới làm form sửa.
- `rp-server/routes/externalConnections.js` — **sửa lỗi thật phát hiện
  khi làm nút Sửa**: `validateAuthPayload()` dùng chung cho cả POST/PUT,
  luôn bắt buộc `authValue`/`authPassword` khác rỗng — khiến cơ chế "để
  trống = giữ nguyên bí mật cũ" (đã hứa sẵn trong comment đầu file) không
  bao giờ chạy tới được vì bị validate chặn trả 400 trước. Thêm tham số
  `isUpdate` để bỏ bắt buộc riêng 2 trường bí mật khi sửa.

## 9.10 — Thêm nút Sửa cho 3 trang api-admin (Endpoint realtime/ghi, Báo cáo)

**Theo yêu cầu người dùng** — agent rà soát 26 trang CRUD cả 3 app, xác
nhận 3 trang này ở api-admin thiếu nút Sửa dù backend đã có sẵn PUT.

- `RealtimeEndpointsPage.jsx` ("Endpoint realtime") — tái dùng nguyên form
  tạo mới (cascading chọn nguồn/bảng/cột + bảng liên kết JOIN) làm form
  sửa.
- `RealtimeWriteEndpointsPage.jsx` ("Endpoint ghi") — cùng mẫu, đơn giản
  hơn.
- `ReportCatalogPage.jsx` ("Báo cáo") — modal Sửa riêng.

## 9.09 — Sửa lỗi font tài liệu VIEW báo cáo tồn kho (FULL_NAME → FULL_NAME_U)

**Phát hiện qua rà soát** (theo yêu cầu người dùng "rà soát lại các font
chữ trên hệ thống"): `bc-ton-kho-0.md` + `deploy/Cập nhật bản 8.68 ...md`
vẫn hướng dẫn dùng `SKU_DEF.FULL_NAME` (ĐÃ XÁC NHẬN lỗi font ở tài liệu
"giá vốn dsmart.md") thay vì `FULL_NAME_U` (cột Unicode đúng) — sửa cả 2
tài liệu. Nếu VIEW này đã deploy thật, cần chạy lại VIEW trên CSDL mới hết
lỗi dữ liệu hiện có (tài liệu không tự sửa VIEW đã deploy).

## 9.08 — Thêm 3 báo cáo giá trị đặt/nhập theo đơn + theo NCC

**Theo yêu cầu người dùng**: "báo cáo giá trị tiền nhập của ncc theo đơn
hàng, giá trị đặt của nhà cung cấp theo đơn hàng và giá trị so sánh giữa
nhập và đặt theo nhà cung cấp" — thêm vào bộ 3 báo cáo "Đơn đặt hàng/Đơn
nhập hàng/So sánh đặt–nhận" đã có (bản 8.92).

- `rp-server/lib/purchaseOrderRunner.js` — thêm 2 kiểu gộp mới:
  `aggregateOrderTotal()` (1 dòng/1 đơn hàng, cộng dồn SL+giá trị TOÀN đơn,
  bỏ cấp mặt hàng) và `aggregateBySupplier()` (1 dòng/1 NCC, gộp TOÀN BỘ
  siêu thị — theo đúng lựa chọn người dùng xác nhận qua câu hỏi làm rõ,
  tách riêng Giá trị đặt/Giá trị nhập theo loại giao dịch).
- `rp-server/scripts/seedPurchaseOrderReports.js` — 3 báo cáo mới:
  "Giá trị đặt hàng theo đơn" (`bc-gia-tri-dat-theo-don`), "Giá trị nhập
  hàng theo đơn" (`bc-gia-tri-nhap-theo-don`) — mỗi dòng = 1 đơn hàng; "So
  sánh giá trị đặt–nhập theo NCC" (`bc-so-sanh-gia-tri-ncc`) — mỗi dòng =
  1 NCC, gộp cả hệ thống, không tách siêu thị.
- Dùng CHUNG VIEW/đồng bộ đã có với 3 báo cáo cũ — không cần tạo VIEW/job
  mới, chỉ seed lại `app.ReportCatalog`.

## 9.07 — Thêm nút "Sửa" cho trang "Nguồn dữ liệu" (api-admin)

**Theo báo cáo người dùng**: trang "Nguồn dữ liệu" (api-admin) chỉ có nút
"Xoá", không có nút "Sửa" để cập nhật Server/Database/Username/Password —
trong khi backend (`api-server/routes/admin/dataSources.js`) đã có sẵn
`PUT /:id` hoạt động tốt từ trước, chỉ chưa được nối ở frontend.

- `api-admin/src/pages/DataSourcesPage.jsx` — thêm `openEdit`/`saveEdit` +
  modal Sửa, đúng mẫu đã dùng ở `etl-admin/src/pages/DataSourcesPage.jsx`
  (mật khẩu để trống = giữ nguyên mật khẩu đã lưu).
- Đang rà soát toàn bộ các trang quản trị còn lại ở cả 3 app xem có thiếu
  nút "Sửa" tương tự không (xem mục kế tiếp nếu phát hiện thêm).

## 9.06 — Tách 2 API độc lập ở trang "Cấu hình Voucher" (api-admin)

**Theo báo cáo người dùng**: trang "Cấu hình Voucher" báo "Lỗi máy chủ",
dropdown "Nguồn dữ liệu" trống hoàn toàn, dù API `/data-sources` (dùng
chung ở trang "Endpoint ghi"/"Endpoint realtime") vẫn liệt kê bình thường
(xác nhận qua 2 trang đó vẫn thấy "DSMART16 (Live) - Voucher").

- `api-admin/src/pages/VoucherSettingsPage.jsx` — trước gọi `Promise.all`
  chung `/data-sources` + `/voucher-settings`, 1 trong 2 lỗi làm CẢ HAI
  đều không set state (dropdown trống theo dù phần kia chạy tốt). Nguyên
  nhân có khả năng cao nhất: bảng `api.VoucherSettings` (api-db) chưa tồn
  tại trên CSDL `HCRC_API` thật của người dùng — do chưa chạy lại
  `api-db/schema.sql` kể từ lúc có tính năng voucher (bản 6.92). Đổi sang
  `Promise.allSettled`, lỗi bên nào chỉ ảnh hưởng đúng bên đó.
- Cần chạy lại `api-db/schema.sql` trên CSDL `HCRC_API` (an toàn chạy lại
  nhiều lần, có `IF OBJECT_ID(...) IS NULL`) để tạo bù bảng
  `api.VoucherSettings` nếu đó đúng là nguyên nhân gốc.

## 9.05 — Ghim cố định cột "Sửa/Bật-Tắt/Xoá" bên phải khi cuộn ngang (3 app)

**Theo báo cáo người dùng**: trên điện thoại, bảng quản trị nhiều cột (vd
"Nguồn dữ liệu") phải cuộn ngang mới tới được cột nút thao tác, nhưng cuộn
ngang bằng tay trên di động rất khó kéo hết cỡ tới mép phải — thực tế không
bao giờ chạm được nút "Sửa" dù nút này đã luôn có sẵn trong code (chỉ nằm
ngoài vùng nhìn thấy).

- `components/DataTable.jsx` (cả 3 app: etl-admin, api-admin, rp-user) —
  cột có `key: 'actions'` (quy ước sẵn có ở MỌI trang CRUD) giờ gắn class
  `data-table__actions-cell`.
- `styles.css` (cả 3 app) — rule `.data-table__actions-cell { position:
  sticky; right: 0; ... }` ghim cố định đúng cột đó ở mép phải viewport khi
  cuộn ngang, LUÔN hiện đủ nút thao tác mà không cần cuộn tới cuối. Chỉ áp
  dụng bảng CRUD phẳng có cột `actions` — KHÔNG đụng bảng báo cáo
  `columnGroups` (không có cột này).
- Đã kiểm tra bằng trang HTML mô phỏng đúng cấu trúc + ảnh chụp màn hình độ
  rộng điện thoại (390px) — xác nhận 3 nút Sửa/Bật/Xoá hiện đủ ngay cả khi
  chưa cuộn.

## 9.04 — Script tạo API key cho đối tác App Voucher ngoài (copy gửi đối tác)

**Theo yêu cầu người dùng**: tự động hoá nốt bước cuối cùng của tính năng
voucher — cấp API key cho ứng dụng voucher ngoài (thiết bị quét mã) mà
không cần vào api-admin bấm chuột.

- `api-server/scripts/seedVoucherAppConsumer.js` — tạo/cập nhật "Đối tác"
  "App Voucher (thiết bị quét mã)" (tên đổi được qua
  `VOUCHER_APP_CONSUMER_NAME`), scope `voucherCheck` + `voucherRedeem`,
  idempotent theo tên. API key gốc in RÕ RÀNG ra màn hình trong khung, kèm
  sẵn ví dụ `curl` — copy gửi cho đội phát triển app voucher qua kênh an
  toàn. Đối tác đã tồn tại thì KHÔNG tự đổi key (tránh làm app ngoài đang
  chạy mất kết nối đột ngột) — chạy lại với `VOUCHER_APP_CONSUMER_ROTATE=true`
  khi cần cấp lại (key CŨ hết tác dụng NGAY).
- Thêm npm script `seed:voucher-app-consumer`.
- Cập nhật `api-voucher-check-redeem.md` Bước 5 với hướng dẫn Cách 1
  (script) mới, giữ Cách 2 (thủ công qua UI) làm phương án dự phòng.

## 9.03 — Tự động hoá Đối tác nội bộ + Kết nối API Server cho voucher-check

**Theo yêu cầu người dùng** ("tôi không muốn tự cấu hình trên web đâu"):
tiếp tục tự động hoá chuỗi cấp quyền nội bộ (rp-server gọi vào api-server)
mà KHÔNG đi qua trình duyệt, giữ nguyên nguyên tắc "API key chỉ hiện đúng
1 lần".

- `api-server/scripts/seedVoucherCheckConsumer.js` — tạo/cập nhật 1 "Đối
  tác" RIÊNG cho rp-server (scope `realtime`, tick endpoint
  `voucher-check`), idempotent theo tên. API key CHỈ in trần ra `stdout`
  (mọi thông báo khác qua `stderr`) để dùng trực tiếp trong lệnh nối
  chuỗi — KHÔNG lưu xuống file/.env nào. Đối tác đã tồn tại thì không tự
  đổi key (hỗ trợ `VOUCHER_CONSUMER_ROTATE=true` khi cần).
- `rp-server/scripts/seedVoucherApiConnection.js` — nhận API key qua THAM
  SỐ DÒNG LỆNH (không qua .env), tự kiểm tra api-server phản hồi
  `/api/v1/health` trước khi ghi, tạo/cập nhật `app.ApiConnections`
  idempotent theo tên.
- Lệnh nối chuỗi 1 dòng: `APIKEY=$(node scripts/seedVoucherCheckConsumer.js) && (cd ../rp-server && node scripts/seedVoucherApiConnection.js "$APIKEY")`.
- Thêm biến `API_SERVER_BASE_URL` (rp-server/.env.example) và
  `VOUCHER_CONSUMER_NAME`/`VOUCHER_CONSUMER_ROTATE` (api-server/.env.example).
- 2 npm script: `seed:voucher-check-consumer`, `seed:voucher-api-connection`.

## 9.02 — Script tự động tạo Endpoint realtime + báo cáo tra cứu voucher

**Theo yêu cầu người dùng**: cho phép kiểm tra kết nối voucher TRỰC TIẾP
trên api-server (chưa cần đợi app ngoài kết nối vào) + có sẵn báo cáo tra
cứu nội bộ trên rp-user, tất cả bằng script.

- `api-server/scripts/seedVoucherCheckEndpoint.js` — tạo/cập nhật "Endpoint
  realtime" `voucher-check` (bảng `PMCRDINF`, khoá `BARCODE`, cột hiển
  thị `STATUS/VALUE_AMT/BAL_AMT/ISS_DATE/DUE_DATE`), tự đối chiếu schema
  thật trước khi ghi (cùng cơ chế UI dùng lúc lưu tay). Sau bước này đã
  gọi thử được `GET /api/v1/realtime/voucher-check/<barcode>` trực tiếp.
- `rp-server/scripts/seedVoucherCheckReport.js` — tạo/cập nhật báo cáo
  "Tra cứu voucher" (`bc-tra-cuu-voucher`, `sourceType: apiRealtime`,
  `lookupField: barcode`), yêu cầu đã có "Kết nối API Server" (tạo tay,
  vì API key chỉ hiện 1 lần).
- 2 npm script: `seed:voucher-check-endpoint` (api-server),
  `seed:voucher-check-report` (rp-server).
- Cập nhật `api-voucher-check-redeem.md` mục "Kiểm tra voucher nội bộ"
  với Cách 1 (script) + giữ Cách 2 (thủ công) làm phương án dự phòng.

## 9.01 — Giảm dãn dòng PDF báo cáo doanh thu từ +12 xuống +10

**Theo yêu cầu người dùng** (xem demo bản +12 ở 8.99): "dãn hơi nhiều, co
vào xíu thôi" — đo lại đúng dữ liệu thật người dùng gửi, xác nhận +10
vẫn giữ nguyên cỡ chữ 7pt (không phải đánh đổi), chỉ bớt khoảng cách dư
so với +12, vẫn vừa đúng 1 trang A4 dọc.

## 9.00 — Tách domain current/currentGD theo ngày cho 2 báo cáo "(Thành viên)"

**Phát hiện qua điều tra cùng người dùng** (báo cáo "Thành viên" ra số
thấp bất thường so với báo cáo gốc cùng khoảng ngày): domain `_thanhvien`
(Live, đọc trực tiếp từng cửa hàng Thành viên) có lỗ hổng dữ liệu
10/2025-8/2026 (job "Lịch sử (Thành viên)" tập trung bị TẮT giữa chừng
lúc backfill ở bản 8.27, chưa quét hết lịch sử) — trong khi domain gốc
(dùng chung 1 nguồn/view) không có lỗ hổng vì job Lịch sử của nó chạy
liên tục nhiều năm.

- `rp-server/lib/compositeReportRunner.js` — thêm `historicalDomain` +
  `fetchSplitDomainRows()`: khối `current`/`currentGD` tự tách khoảng
  ngày yêu cầu theo ranh giới "hôm nay" (giờ Việt Nam) — ngày ĐÃ QUA đọc
  domain gốc (đã có đủ lịch sử qua job Lịch sử tập trung), CHỈ đúng hôm
  nay mới đọc domain `_thanhvien` (Live riêng từng cửa hàng). 2 báo cáo
  gốc không đổi hành vi (domain trùng `historicalDomain` → vẫn 1 lượt gọi
  như cũ).
- `rp-server/scripts/seedLdtdHcrcReports.js` — khai `historicalDomain:
  DOMAIN_GOC.*` cho 2 khối `current`/`currentGD`.

## 8.99 — Sửa 3 lỗi số liệu + chữ báo cáo doanh thu cuối ngày (4 báo cáo)

**Phát hiện qua điều tra cùng người dùng** ("báo cáo doanh thu quá khứ
đang thiếu số", "doanh thu cả 1 năm không thể thấp như vậy được") + yêu
cầu dãn dòng/căn giữa cho file Excel/PDF xuất ra.

- **`requireTargetMatch: false`** (`seedLdtdHcrcReports.js`) — TRƯỚC ĐÂY
  cờ này loại HẲN mọi thực thể không có dòng Chỉ tiêu khớp đúng kỳ xem —
  hậu quả: người dùng mới nhập Chỉ tiêu cho tháng 9-10/2026 nên MỌI
  kỳ/năm khác (dù dữ liệu Thực đạt đã có sẵn trong `dwh.ReportFacts`) bị
  ẩn TRẮNG HOÀN TOÀN. Tắt cờ này — thực thể không có Chỉ tiêu kỳ đó vẫn
  hiện bình thường, chỉ trống đúng cột Chỉ tiêu/Tỷ lệ đạt (an toàn, không
  NaN/lỗi nhờ `formulaEngine.js` lan truyền null). `requireDiemStkMapping`
  (chặn mã rác độc lập) giữ nguyên `true`.
- **Sửa lỗi giới hạn cứng 5000 dòng/lượt gọi** (`compositeReportRunner.js`,
  `fetchAllReportRows()`) — khoảng ngày rộng (cả năm, nhiều năm, nhiều chi
  nhánh) dễ vượt `REPORT_FETCH_BATCH_SIZE`, trước đây CẮT ÂM THẦM phần
  ngày xa hơn (do `ORDER BY EventDate DESC`), ra tổng Thực đạt THẤP HƠN
  thực tế mà không cảnh báo gì. Giờ phân trang LẶP LẠI (cùng kiểu vòng
  lặp ETL `extractTable()`) tới khi lấy ĐỦ dữ liệu, không giới hạn số
  ngày/chi nhánh.
- **Excel**: dãn dòng dữ liệu (cỡ chữ 10, chiều cao dòng 20, căn giữa dọc
  `vertical: middle`) — trước đây dùng mặc định ExcelJS (Calibri 11,
  không set chiều cao, căn `bottom`) khiến chữ sát 2 đường kẻ trên/dưới.
- **PDF**: căn giữa cột TT (trước chỉ căn trái như cột chữ khác); tăng
  chiều cao dòng chế độ `compactSinglePage` từ `size+4` lên `size+12` —
  đo thật bằng dữ liệu thật người dùng gửi (36 dòng/17 cột), xác nhận đây
  là mức tăng TỐI ĐA vẫn giữ nguyên cỡ chữ 7pt, không đánh đổi.

## 8.98 — Viền đen + màu gốc file mẫu BRGMART + dãn dòng tiêu đề (báo cáo doanh thu)

**Theo yêu cầu người dùng** (gửi lại file mẫu BRGMART gốc, xác nhận qua
demo trước khi lưu): "đóng khung màu đen như bản mẫu", "chữ ở giữa hai
dòng cách ra chút nữa cho rõ", "màu nền dòng và màu đậm ở chỗ khác thử
làm giống hệt form báo cáo này".

- **Viền đen**: đổi viền nhạt `#D9DEE2` (bản 8.58) sang ĐEN — khớp đúng
  file mẫu gốc — ở cả web (`.data-table--grouped`), Excel (`BORDER_ALL`),
  PDF (`BORDER_RGB`), email (`emailBodyRenderer.js`). Excel/web đã sẵn
  CHỈ áp dụng báo cáo có `columnGroups`; PDF/email trước đây áp viền nhạt
  cho MỌI báo cáo — sửa lại để viền đen CHỈ áp cho báo cáo có
  `columnGroups` (đúng 4 báo cáo Doanh thu cuối ngày), báo cáo khác giữ
  nguyên viền nhạt cũ.
- **Màu nhóm cột về lại đúng màu gốc file mẫu** (lấy mẫu pixel trực tiếp
  từ file PDF mẫu BRGMART người dùng gửi, xem
  `/tmp/.../scratchpad/color-sample-8.98`) — không giảm bão hoà như bản
  8.58 nữa: xanh lá `#9BCC1E` "Doanh thu", cam đất `#FACD9C` "Lãi gộp",
  vàng gold `#F9CE27` "Giao dịch", tím `#9D98FD` "Trung bình GD"/"Doanh
  thu/m2" + dòng Tổng cộng nhóm; xen kẽ dòng về lại cyan gốc `#D1FEFF`.
  Đổi ở `lib/reportCellFormat.js` (nguồn dùng chung Excel/PDF/email) +
  mirror `rp-user/src/lib/reportGroupColors.js` (web).
- **Dãn dòng tiêu đề**: nhãn cột 2-3 dòng (vd "Tỷ lệ"/"đạt", "Cùng
  kỳ"/"năm 2025") dãn cách rõ hơn — web (`th { line-height: 1.9 }`,
  riêng dữ liệu `td` giữ 1.5 như bản 8.97) + PDF (`lineGap` trong
  `drawWrappedCenteredText`, CHỈ cho báo cáo `compactSinglePage`/có
  `columnGroups`). Đo lại offset sticky header web (46px → 52px).

**Đã kiểm chứng**: build/syntax check sạch; xuất thử Excel/PDF/email với
CÙNG 1 bộ dữ liệu, so màu/viền khớp nhau tuyệt đối + khớp file mẫu gốc;
xác nhận báo cáo KHÔNG có `columnGroups` vẫn giữ nguyên viền nhạt cũ
(không bị đổi màu đen nhầm); demo THẬT trên vite dev server + Playwright
gửi người dùng xác nhận trước khi merge.

## 8.97 — Khung kẻ mảnh (web/Excel/PDF/email) + xác nhận làm tròn số + ẩn/chọn cột báo cáo doanh thu

**Theo yêu cầu người dùng** (tiếp nối bản 8.96): (1) "chữ và dãn dòng ok
rồi, cho mình đóng khung kẻ mảnh và nét nữa — ở cả xuất Excel/PDF, body
email và trên web"; (2) "gửi ở body mail cũng làm tròn số như xuất
excel/pdf"; (3) các báo cáo doanh thu cho phép chọn các trường ẩn đi khi
xem trên web hoặc xuất Excel/PDF (ngoài phần chọn trường gửi email đã có
từ bản 8.96).

**1. Khung kẻ mảnh**: Excel/PDF/email đã có sẵn viền mảnh `#D9DEE2` (toàn
bộ ô, từ bản 8.58/8.96) — chỉ THIẾU ở bảng web. `rp-user/src/styles.css` —
thêm `border: 1px solid var(--line)` cho `.data-table--grouped td/th` (CHỈ
4 báo cáo Doanh thu cuối ngày, không đụng bảng khác). Đo lại chiều cao
header 2 dòng bằng Playwright sau khi thêm viền — vẫn đúng 46px (không cần
đổi offset sticky).

**2. Làm tròn số body email** — ĐÃ ĐÚNG sẵn từ bản 8.96 (dùng chung
`formatCellText()`/`Math.round` ở `lib/reportCellFormat.js` cho cả 3 nơi
xuất) — xác nhận lại bằng số lẻ thật (950000.6 → "950,001", 94.6% →
"95%") khớp Y HỆT Excel/PDF, không cần sửa code.

**3. Ẩn/chọn cột báo cáo doanh thu (web + Excel/PDF)** — tính năng MỚI,
tách riêng khỏi "chọn cột gửi email" (bản 8.96, theo lịch gửi):
- `rp-server/lib/reportCellFormat.js` — thêm `filterColumns()`/
  `filterGroups()` (lọc cột theo key được chọn, GIỮ NGUYÊN thứ tự gốc +
  tính lại colSpan nhóm màu, bỏ nhóm rỗng) — gộp về 1 nguồn dùng chung,
  `lib/emailBodyRenderer.js` refactor lại để dùng đúng 2 hàm này (trước đó
  tự định nghĩa riêng, trùng lặp).
- `routes/reports.js` — `POST /:reportId/export` nhận thêm
  `visibleColumnKeys` (TUỲ CHỌN) trong body, lọc `columns`/`columnGroups`
  trước khi gọi `exportExcel()`/`exportPdf()`. `POST /:reportId/run`
  KHÔNG đổi — lọc cột cho bảng xem trên web làm NGAY TRÊN TRÌNH DUYỆT
  (không gọi lại server, rows đã có sẵn mọi field).
- `rp-user/src/lib/reportGroupColors.js` — mirror thêm `filterColumns()`/
  `filterGroups()` cho phía web.
- `rp-user/src/modules/reports/ReportsPage.jsx` — thêm ô "Cột hiển thị"
  (dùng chung `SearchableSelect`, CHỈ hiện khi báo cáo có `columnGroups` —
  hiện 4 báo cáo Doanh thu cuối ngày), không chọn gì = hiện đủ cột. Lọc
  NGAY cho bảng xem + gửi kèm đúng cột đang chọn lúc bấm "Xuất Excel"/
  "Xuất PDF" — file xuất ra KHỚP đúng những gì đang xem trên web. Là lựa
  chọn THEO PHIÊN XEM hiện tại (không lưu lại), đổi báo cáo khác thì về
  lại hiện đủ cột.

**Đã kiểm chứng**: build/syntax check sạch; test lại bộ assertion email-
body-colors (không hỏng sau refactor); demo THẬT trên vite dev server +
Playwright (không phải ảnh tĩnh) — khung kẻ mảnh trên web khớp Excel/PDF/
email, chọn bớt cột tự ẩn đúng nhóm màu + tính lại colSpan, `visibleColumnKeys`
gửi lên `/export` khớp đúng cột đang hiện trên web.

## 8.96 — Email báo cáo giống màu PDF/Excel + chọn cột gửi + bảng doanh thu dãn dòng/nét hơn

**Theo yêu cầu người dùng**: (1) email gửi báo cáo doanh thu HCRC/LĐTĐ (cả
bản Thành viên) cho chọn được cột đưa vào nội dung email, màu sắc giống
hệt file PDF/Excel xuất ra; (2) bảng kết quả báo cáo doanh thu giãn dòng,
font chữ nét hơn cho dễ nhìn.

**1. Email báo cáo (`DeliveryMode='body'`)**:
- `rp-server/lib/emailBodyRenderer.js` — VIẾT LẠI, bỏ hẳn màu tự dựng
  riêng (xám-trắng #ccc/#f2f2f2) — giờ DÙNG CHUNG
  `rp-server/lib/reportCellFormat.js` (nguồn sự thật duy nhất đã dùng cho
  `exportExcel.js`/`exportPdf.js` từ bản 8.58) để đảm bảo khớp màu TUYỆT
  ĐỐI: header 2 dòng + colSpan theo nhóm (xanh lá "Doanh thu"/cam đất "Lãi
  gộp"/vàng gold "Giao dịch"/tím cột đơn lẻ), tô màu dòng Tổng cộng/Tổng
  cộng nhóm, xen kẽ zebra. Định dạng số đổi từ dấu chấm (`toLocaleString
  ('vi-VN')`) sang dấu phẩy ngăn cách nghìn — khớp đúng Excel/PDF (trước
  đây 2 nơi hiện số KHÁC kiểu nhau).
- Thêm `BodyColumnKeysJson` (`app.ReportEmailSchedules`, ALTER TABLE an
  toàn) — chọn TẬP CỘT đưa vào email (rỗng = toàn bộ cột, tương thích
  ngược lịch gửi cũ). Lọc GIỮ NGUYÊN thứ tự cột gốc (cần thiết để nhóm
  màu còn liền kề đúng, colSpan tính lại tự động — nhóm bị chọn hết cột
  thì tự ẩn khỏi header).
- UI `EmailSchedulesPage.jsx` — thêm ô chọn nhiều cột (dùng chung
  `SearchableSelect`, giống mọi ô chọn/lọc khác trong hệ thống) khi Cách
  gửi = "Bảng ngay trong nội dung email".

**2. Bảng báo cáo doanh thu (web)**:
- `rp-user/src/styles.css` — thêm rule riêng `.data-table--grouped`
  (CHỈ 4 báo cáo Doanh thu cuối ngày LDTD/HCRC + 2 bản Thành viên có class
  này, đã rà soát không báo cáo nào khác dùng — KHÔNG đụng `.data-table`
  trần, không ảnh hưởng bảng khác trong hệ thống): tăng padding 8px→12px,
  cỡ chữ 13.5px→14px, thêm `line-height:1.5`, `td` đậm nhẹ hơn
  (400→500) cho "nét" hơn. Đo lại bằng Playwright + cập nhật offset sticky
  2 dòng tiêu đề (34px→46px) cho khớp chiều cao thật — không áng chừng,
  tránh dòng tiêu đề phụ bị dòng đầu đè lên khi cuộn dọc.

**Đã kiểm chứng**: test mock cho `emailBodyRenderer.js` (lọc cột đúng,
nhóm rỗng tự ẩn, màu/colSpan khớp đúng mã hex xác nhận ở
`reportCellFormat.js`) + demo THẬT trên `vite dev` server + Playwright
(không phải ảnh tĩnh) cho cả 2 phần — xác nhận header 2 dòng dính đúng
khi cuộn (gap=0, không đè/hở), UI chọn cột hoạt động đúng.

## 8.95 — Hiện tên nhà cung cấp thật + bộ lọc NCC cho báo cáo Đơn đặt/Nhập hàng

**Theo yêu cầu người dùng**: hỏi "báo cáo đơn đặt hàng và nhập hàng có
lấy theo nhà cung cấp không" — phát hiện cột "Nhà cung cấp" có trong cả 3
báo cáo nhưng luôn TRỐNG (VIEW để `TenNCC = NULL` tạm, chưa JOIN được
danh mục NCC) và KHÔNG có bộ lọc theo NCC. Người dùng xác nhận tên bảng
danh mục là `SUPPLIER` (DSMART16), gửi kèm cấu trúc cột thật — xác nhận
`SUPP_ID` (char, khớp `STRANS.SUPP_ID`) và `SUPP_NAME` (nvarchar).

- `deploy/Thiết lập VIEW Đơn đặt hàng-Nhập hàng-So sánh (DSMART16 trung
  tâm).sql`: thêm `LEFT JOIN dbo.SUPPLIER s ON s.SUPP_ID = m.SUPP_ID`,
  `TenNCC` nay lấy `s.SUPP_NAME` thay vì `NULL` — `LEFT JOIN` (không phải
  `INNER`) để đơn hàng có mã NCC không khớp vẫn hiện ra, chỉ tên NCC trống.
- `rp-server/scripts/seedPurchaseOrderReports.js`: thêm cột `MaNCC` (trước
  chỉ có `TenNCC`, không có mã) cho cả 3 báo cáo; thêm bộ lọc "Nhà cung
  cấp" (`NCC_FILTER`, dropdown tìm kiếm được) dùng `optionsSource` (đọc
  DANH SÁCH THẬT từ dữ liệu đã đồng bộ, đúng cơ chế đang dùng cho bộ lọc
  "Chi nhánh" ở báo cáo khác — KHÔNG phải danh sách gõ tay, tự cập nhật
  khi có NCC mới).
- `bc-don-dat-hang.md`: ghi nhận đầy đủ câu trả lời DBA, cập nhật VIEW
  mẫu mục 2 khớp đúng VIEW thật.

KHÔNG cần sửa `etl/scripts/seedDonDatHangSync.js` — cột `MaNCC` đã nằm
sẵn trong `dimensionColumns` từ bản 8.92, dữ liệu đã đồng bộ sẵn, chỉ
thiếu hiển thị ở tầng báo cáo.

**Đã kiểm chứng**: viết test mock mới (`purchaseOrderRunner.js` thật,
chỉ fake tầng CSDL) xác nhận cột `MaNCC`/`TenNCC` lên đúng giá trị và bộ
lọc NCC (multiSelect + optionsSource) không làm vỡ runner.

**Triển khai**: chạy lại VIEW SQL trên DSMART16 (đã có `CREATE OR ALTER`,
an toàn) + chạy lại `node scripts/seedPurchaseOrderReports.js` (rp-server)
— không cần đổi gì ở ETL.

## 8.94 — Vân tay/Face ID cho mọi user + Ma trận phân quyền báo cáo + Nút Sửa người dùng (cả 3 app)

**Theo yêu cầu người dùng**, 3 phần (đã gửi báo cáo phương án + ảnh demo
trước khi làm, người dùng xác nhận):

1. **Vân tay/Face ID cho MỌI user** — trước đây UI trang "Tài khoản của
   tôi" lỡ gộp chung mục "Vân tay/Face ID" vào điều kiện hiển thị của "2FA"
   (chỉ hiện với `isSystemRole`), dù backend (`routes/webauthn.js`) chưa
   từng giới hạn theo vai trò. Tách `WebauthnDevicesSection` ra khỏi khối
   2FA, hiện cho mọi user đã đăng nhập ở cả 3 app (`rp-user`, `etl-admin`,
   `api-admin`) — 2FA mã số vẫn chỉ dành cho Admin hệ thống như cũ. Sửa lại
   câu mô tả cho đúng cả 2 trường hợp (trước đây giả định đang ở bước 2FA
   "THAY VÌ gõ mã 6 số" — user thường không có 2FA, vân tay thay cho cả
   bước mật khẩu qua luồng đăng nhập không mật khẩu bản 8.89).

2. **Ma trận phân quyền báo cáo** — thêm tab "Ma trận" trong trang "Phân
   quyền" (`rp-user`), gồm 3 bảng lưới: "Theo Nhóm" (Vai trò × Báo cáo),
   "Theo Người dùng" (quyền riêng cộng dồn), "Ma trận Dashboard" (Vai trò ×
   nhóm Dashboard, 2 cột Xem/Xuất mỗi nhóm). Bấm trực tiếp vào ô để bật/tắt
   quyền, tự lưu ngay (khoá đúng 1 ô đang xử lý, không khoá cả bảng) — tái
   sử dụng NGUYÊN các route ghi quyền đã có từ trước
   (`PUT /:id/report-access`, `PUT /:id/dashboard-group-access`), chỉ thêm
   2 route đọc gộp MỚI (`GET /system/roles/access-matrix`,
   `GET /system/roles/dashboard-access-matrix`,
   `GET /system/users/access-matrix`) để tải toàn bộ ma trận trong 1 lần
   gọi thay vì mở từng Vai trò/Người dùng một. KHÔNG thay thế 2 tab cũ
   "Người dùng"/"Vai trò" — bổ sung thêm cách xem tổng quan.

3. **Nút "Sửa" người dùng (Tên/Email)** — `rp-user`: thêm nút "Sửa" +
   modal (Họ tên/Email/Điện thoại/Phòng ban/Chức danh/Nơi làm việc) ở
   `UsersPage.jsx`, dùng LẠI route `PUT /system/users/:id` đã hỗ trợ đủ các
   trường này từ trước, chỉ thiếu giao diện. `etl-admin`/`api-admin`: modal
   "Sửa" cũ chỉ sửa được Họ tên (bảng `admin.AdminUsers` trước đây KHÔNG
   có cột Email) — thêm cột `Email NVARCHAR(200) NULL` (ALTER TABLE, an
   toàn/không ảnh hưởng dữ liệu cũ) vào cả `etl-db`/`api-db`, cập nhật
   route `GET /`/`PUT /:id` + modal "Sửa" thêm trường Email.

**Đã kiểm chứng**: build-check sạch cả 3 frontend (`npm run build`),
syntax-check sạch 4 file backend sửa đổi, VÀ demo THẬT trên `vite dev`
server thật (không phải mock tĩnh) bằng Playwright + chặn API thật bằng dữ
liệu giả lập — xác nhận: (a) user vai trò thường thấy mục Vân tay, KHÔNG
thấy mục 2FA; (b) bấm ô ma trận đổi đúng trạng thái + gửi đúng danh sách
cập nhật lên server; (c) ma trận Dashboard khoá đúng cột "Xuất" khi chưa
bật "Xem"; (d) modal "Sửa" tải sẵn đúng Email hiện có.

## 8.93 — Sửa 2 lỗi phát hiện khi chạy VIEW thật lần đầu trên DSMART16 (Báo cáo Đơn đặt/Nhập hàng)

**Theo yêu cầu người dùng**: tự tạo VIEW `dbo.vw_DonDatHangChiNhanh`
(bản 8.92) trên DSMART16 thật — 2 lỗi/phát hiện lộ ra:

1. **Lỗi `Invalid column name 'PRICE'`** — `STRANS` KHÔNG có cột đơn giá
   riêng (đúng như báo cáo doanh thu cuối ngày đã xác nhận từ trước, bảng
   này chỉ có `QTY`/`AMOUNT`). Sửa `deploy/Thiết lập VIEW Đơn đặt hàng-
   Nhập hàng-So sánh (DSMART16 trung tâm).sql` + mục 2 `bc-don-dat-hang.md`:
   `DonGia` = `AMOUNT / NULLIF(QTY, 0)` thay vì đọc thẳng cột `PRICE`.
2. **Chạy VIEW thành công, `SELECT TOP 20` cho thấy cột `STOPED_DT`
   (dùng làm watermark `UpdatedAt`) NULL TRÊN TOÀN BỘ dòng mẫu** — nếu
   giữ nguyên, job đồng bộ sẽ chạy "thành công" nhưng KHÔNG BAO GIỜ lấy
   được dòng nào (`NULL >= watermark` không bao giờ `TRUE`). Sửa
   `etl/scripts/seedDonDatHangSync.js`: `updatedAtColumn` đổi từ
   `'UpdatedAt'` sang `'EventDate'` — đúng tiền lệ đã dùng cho
   `V_HCRC_GIAODICH_CHINHANH` (`seedLdtdHcrcSync.js`) — không cần sửa/
   chạy lại VIEW trên SQL Server, chỉ sửa cấu hình job.

Cũng ghi nhận thêm (không chặn, chưa sửa): dữ liệu thật xuất hiện mã
trạng thái MỚI `TrangThai = 'N'`, ngoài 6 mã C/P/F/M/D/E đã biết — VIEW
vẫn chạy đúng (không lọc nhầm, nhãn hiện tạm mã thô), cần hỏi DBA ý nghĩa
để bổ sung nhãn tiếng Việt sau.

**Vẫn CHƯA lên production hoàn toàn** — VIEW đã chạy tốt trên DSMART16,
còn thiếu: chạy `etl/scripts/seedDonDatHangSync.js` +
`rp-server/scripts/seedPurchaseOrderReports.js`, gán quyền xem, chờ đồng
bộ, kiểm tra số liệu thật trên rp-user.

## 8.92 — Chốt lại nguồn dữ liệu Báo cáo Đơn đặt hàng/Nhập hàng/So sánh: STRANS thay ST_ORDER (vẫn chưa lên production, chờ xác nhận cột SL/giá)

**Theo yêu cầu người dùng**: tiếp tục trao đổi qua ảnh chụp SQL thật với
DBA — phát hiện nguồn dữ liệu ĐÚNG không phải `ST_ORDER`/`ON_ORDER`/
`FN_ORDER` như các bản 8.75/8.91 giả định, mà là **`STRANS`** (bảng ĐÃ
dùng ổn định cho báo cáo doanh thu cuối ngày), lọc `TRANS_CODE IN
('133','333')` — `133`=đặt hàng, `333`=nhập hàng, **MỖI LOẠI 1 DÒNG
RIÊNG** (khác giả định ban đầu "SL đặt + SL nhận chung 1 dòng"). Cột
`REF` = "mã đơn hàng gốc" (xác nhận trực tiếp) — nhóm nhiều lần nhận hàng
(1 đơn có thể nhận NHIỀU ĐỢT) lại với đúng 1 đơn đặt ban đầu. Cũng xác
nhận: loại hẳn `D` (Đã xoá)/`E` (Đã huỷ) khỏi cả 3 báo cáo.

- **`rp-server/lib/purchaseOrderRunner.js`**: viết lại hoàn toàn cách xử
  lý — thêm `definition.transCode` (lọc 1 loại giao dịch, dùng cho 2 báo
  cáo đơn lẻ) và `definition.aggregateByOrder` (gộp SUM theo mã đơn hàng
  gốc + mã hàng cho báo cáo so sánh, xử lý ĐÚNG trường hợp nhận nhiều lần
  — nhiều dòng `333` cùng 1 đơn được CỘNG DỒN thay vì chỉ lấy 1 dòng).
- **`rp-server/scripts/seedPurchaseOrderReports.js`**: cập nhật 3 định
  nghĩa báo cáo theo `transCode`/`aggregateByOrder` mới; bỏ `D`/`E` khỏi
  tuỳ chọn lọc "Trạng thái" (đã loại hẳn ở VIEW, không cần hiện nữa).
- **`etl/scripts/seedDonDatHangSync.js`**: Dimensions/Measures đổi theo
  VIEW mới — thêm `LoaiGiaoDich`, gộp `SoLuongTheoDon`/`SoLuongThucNhan`
  cũ thành 1 measure `SoLuong` duy nhất (ý nghĩa tuỳ `LoaiGiaoDich`).
- **`bc-don-dat-hang.md`, `deploy/Thiết lập VIEW ... (DSMART16 trung
  tâm).sql`**: cập nhật VIEW mẫu dùng nguồn `STRANS` + `REF`/`TRANS_CODE`,
  tài liệu đầy đủ lịch sử trao đổi với DBA.

**Đã kiểm chứng**: viết lại bộ test mock (10 kiểm tra) mô phỏng đúng kịch
bản "1 đơn nhận 2 đợt" (60 + 40 = 100, khớp đơn) và "1 đơn nhận 1 phần"
(30/50, còn thiếu) — xác nhận: lọc đúng từng loại giao dịch cho 2 báo cáo
đơn lẻ (mỗi lần nhận là 1 dòng riêng), gộp SUM đúng theo mã đơn hàng gốc
cho báo cáo so sánh, công thức Chênh lệch/Tỷ lệ hoàn thành tính đúng trên
kết quả đã gộp, BU_ID chưa khai ánh xạ vẫn bị loại đúng như trước.

**Vẫn CHƯA lên production** — còn 1 điểm cần DBA xác nhận: cột số lượng/
đơn giá dùng cho 2 loại dòng `133`/`333` trong `STRANS` (đang dùng tạm
`QTY`/`PRICE`/`AMOUNT`, cùng cột đã dùng ổn định cho doanh thu — cần DBA
xác nhận có đúng hay phải dùng cột riêng kiểu `ORD_QTY`/`ORD_PRICE`).

## 8.91 — Sửa đổi lại thiết kế Báo cáo Đơn đặt hàng/Nhập hàng/So sánh dùng SAI mã STK_ID (chưa lên production, đang chờ DBA xác nhận tiếp)

**Theo yêu cầu người dùng**: báo cáo này (bản 8.75, chưa deploy) lại gửi
query kiểm tra thật trên `ST_ORDER` — đối chiếu lại "quy tắc mã BU_ID và
STK_ID.md" cho thấy thiết kế BAN ĐẦU dùng **SAI** mã — người dùng chỉ rõ
trực tiếp: *"tôi đã có mã ánh xạ STK để bạn tham chiếu cho tất cả mà, bạn
quên rồi sao?"*.

**Lỗi thiết kế ban đầu**: `rp-server/lib/purchaseOrderRunner.js` (bản
8.75) dùng `buildStkIdLookup()` (tra theo `STK_ID`) để dịch mã siêu thị
thô đồng bộ từ `ST_ORDER` sang mã Điểm chuẩn. SQL kiểm tra thật (chạy trên
`ST_ORDER`) xác nhận cột mã siêu thị đồng bộ về là **`BU_ID`** (y hệt
`TRANSHDR`, domain `giaodich_chinhanh`), **KHÔNG PHẢI** `STK_ID` (`STK_ID`
CHỈ tồn tại ở `STRANS`, domain doanh thu) — dùng sai hàm tra cứu sẽ khiến
MỌI dòng bị loại khỏi báo cáo (không khớp được STK_ID nào) khi lên thật.

- **`rp-server/lib/purchaseOrderRunner.js`**: đổi sang `buildBuIdLookup()`
  (đọc tường minh cột `BuId` trong bảng "Ánh xạ Điểm - STK_ID", KHÔNG tự
  suy "+00") — mirror ĐÚNG cách `lib/compositeReportRunner.js` đã xử lý
  domain `giaodich_chinhanh` (`block.mapBuIdToMaDiem`). `__storeScope`
  cũng đổi sang so khớp TRỰC TIẾP theo mã Điểm SAU khi dịch BU_ID (không
  còn dùng `resolveStoreScopeStkIds()`, hàm đó dành cho domain STK_ID).
- **`bc-don-dat-hang.md`**: cập nhật mục 1/2/4 — ghi rõ BU_ID đã xác nhận
  bằng SQL thật (06/10/2026), liệt kê các cột đã thấy tên thật
  (`TRANS_NUM`/`TRANS_CODE`/`TRAN_DATE`/... ) và các cột VẪN CÒN THIẾU
  (mã hàng, SL đặt/nhận, đơn giá, NCC — chưa thấy cột nào cho các mục
  này, cần DBA xác nhận tiếp).
- **`deploy/Thiết lập VIEW Đơn đặt hàng-Nhập hàng-So sánh (DSMART16 trung
  tâm).sql`**: cập nhật VIEW mẫu dùng `BU_ID` (đã xác nhận) thay `STK_ID`,
  đánh dấu rõ từng cột ĐÃ/CHƯA xác nhận.
- **`rp-server/scripts/seedPurchaseOrderReports.js`**: sửa câu nhắc cuối
  script (trước đây nói sai "khai đủ mã STK", giờ đúng "khai đủ cột
  BuId").

**Đã kiểm chứng**: viết lại bộ test mock (BU_ID thay STK_ID) — xác nhận
dịch đúng BU_ID→mã Điểm, BU_ID chưa khai bị loại khỏi báo cáo (không đoán
bừa), `__storeScope` cô lập đúng dữ liệu giữa các siêu thị, VÀ thêm 1
kiểm tra MỚI: `__storeScope` không khớp mã Điểm nào trả về RỖNG (không
phải "xem hết" — tránh lộ dữ liệu ngoài phạm vi nếu có lỗi cấu hình).

**Vẫn CHƯA lên production** — còn thiếu thông tin cột hàng hoá/số lượng/
đơn giá/nhà cung cấp trong `ST_ORDER`, đang chờ người dùng gửi tiếp kết
quả SQL kiểm tra.

## 8.90 — Sửa proxy nội bộ không theo kịp khi backend chuyển sang HTTPS (PM2-only, cả 3 app)

**Theo yêu cầu người dùng**: báo "add CA vào ETL [qua trang 'Chứng chỉ
TLS'] và lỗi mã captcha luôn. Và hệ thống ngoài cũng ko trust được ssl vừa
add", xác nhận deployment KHÔNG dùng Nginx (PM2-only, dùng
`deploy/serve-static.js`).

**Nguyên nhân chính**: `deploy/serve-static.js` — tiến trình phục vụ giao
diện tĩnh (`hcrc-rp-user`/`hcrc-api-admin`/`hcrc-etl-admin`) — có 1 proxy
nội bộ (`proxyToBackend()`) chuyển tiếp `/api`/`/admin/...` sang đúng
backend song sinh (`hcrc-rp-server`/`hcrc-api-server`/`hcrc-etl`), LUÔN
gọi bằng `http.request()` KỂ CẢ KHI backend đã chuyển sang HTTPS (sau khi
admin upload "Chứng chỉ TLS" cho backend + `pm2 restart`). Backend lúc đó
chờ bắt tay TLS nhưng nhận byte HTTP thường → MỌI request qua proxy lỗi
("socket hang up"/502 "Không kết nối được backend"), bao gồm cả mã xác
nhận (captcha) — xảy ra NGAY CẢ KHI không dùng Nginx, đúng chế độ PM2-only
mà tính năng "Chứng chỉ TLS" (bản 8.71) nói là được hỗ trợ.

- **`deploy/serve-static.js`**: `proxyToBackend()` giờ tự kiểm tra backend
  song sinh đã chuyển HTTPS chưa (dùng lại đúng `TLS_CERT_DIR` đã khai cho
  CHÍNH tiến trình này) — nếu có, chuyển sang gọi `https.request()` (kèm
  `rejectUnauthorized: false`, vì gọi thẳng `127.0.0.1` trong khi chứng
  chỉ cấp cho tên miền thật — vẫn chỉ qua loopback nội bộ, không ra
  Internet). Đã kiểm chứng bằng test TLS thật (backend HTTPS tự ký +
  proxy cũ lỗi "socket hang up", proxy mới trả đúng JSON 200; backend HTTP
  thường không đổi hành vi).
- Thêm hướng dẫn RÕ trên cả 3 trang "Chứng chỉ TLS" (lúc upload lần đầu,
  chuyển HTTP→HTTPS): nếu deployment KHÔNG dùng Nginx, PHẢI thêm
  `TLS_CERT_DIR: '../<backend>/certs'` vào `env` của tiến trình giao diện
  tương ứng trong `deploy/ecosystem.config.js` rồi `pm2 restart` tiến
  trình đó — trước đây chỉ nhắc restart backend, bỏ sót bước này khiến
  proxy vẫn hỏng dù đã deploy code sửa ở trên.
- **`etl/lib/tlsServer.js`, `rp-server/lib/tlsServer.js`,
  `api-server/lib/tlsServer.js`**: sửa thêm 1 chỗ liên quan (không phải
  nguyên nhân chính của lỗi báo — đã kiểm chứng Node/OpenSSL bản đang dùng
  tự động nối chuỗi chứng chỉ dù gán CA qua `ca`) — nối CA/chain NGAY SAU
  cert lá vào CÙNG field `cert` thay vì gán riêng `ca` (vốn chỉ dùng để
  xác minh chứng chỉ CLIENT/mTLS ở phía server theo tài liệu Node chính
  thức), để không phụ thuộc hành vi "tự động nối chuỗi" ngầm định của
  OpenSSL — an toàn hơn, không đổi hành vi hiện tại.

**Lưu ý về "hệ thống ngoài không trust SSL vừa add"**: nếu chứng chỉ vừa
upload do 1 CA NỘI BỘ (không phải CA công cộng như Let's Encrypt/CA
thương mại) cấp, đây là hành vi ĐÚNG — hệ thống bên ngoài (chưa cài đặt
CA gốc nội bộ đó) sẽ KHÔNG trust, không phải lỗi. Cần làm 1 trong 2:
(1) dùng chứng chỉ từ CA công cộng (vd Let's Encrypt, miễn phí), hoặc
(2) cài CA gốc nội bộ vào máy/hệ thống của BÊN NGOÀI cần kết nối tới.

## 8.89 — Đăng nhập bằng vân tay/Face ID THAY THẾ HOÀN TOÀN mật khẩu + nhớ tên đăng nhập (cả 3 app)

**Theo yêu cầu người dùng** (kèm ảnh màn hình đăng nhập của 1 app khác làm
mẫu): "1. Nhớ username 2. Vân tay ngay chỗ đăng nhập và mã captcha 3. Khi
đăng nhập vân tay hoặc khuôn mặt những nút khác disable ko thao tác được."
Hỏi lại và được xác nhận: vân tay/Face ID THAY THẾ HOÀN TOÀN mật khẩu (ai
đã đăng ký thiết bị ở "Tài khoản của tôi" bấm vân tay là vào thẳng, KHÔNG
cần mật khẩu/captcha/mã 2FA nào nữa), áp dụng đồng bộ cả 3 app (rp-user,
etl-admin, api-admin) — KHÁC WebAuthn đã có từ bản 8.40/8.78 (chỉ thay bước
nhập mã 2FA SAU KHI đã gõ đúng mật khẩu).

- **`rp-server/routes/webauthn.js`, `etl/routes/admin/webauthn.js`,
  `api-server/routes/admin/webauthn.js`**: thêm 2 route mới
  `/login-by-username/options` + `/login-by-username/verify` — nhận
  `username` (KHÔNG cần mật khẩu/phiên đăng nhập trước), tra sẵn thiết bị
  đã đăng ký của đúng username đó, xác thực vân tay/Face ID xong là cấp
  phiên đăng nhập đầy đủ luôn (y hệt cơ chế "passkey" của Google/Microsoft/
  GitHub). Chống dò username: `/options` LUÔN trả 200 dù username có tồn
  tại hay không (không có thiết bị thì `allowCredentials` rỗng); bảo mật
  thật nằm ở `/verify` — chỉ chấp nhận ĐÚNG thiết bị đã khoá sẵn vào đúng
  username lúc `/options` (chặn trường hợp dùng thiết bị CỦA MÌNH để đăng
  nhập giả làm username CỦA NGƯỜI KHÁC). Token thử thách dùng 1 lần, hết
  hạn 5 phút, dùng chung giới hạn số lần thử sai (rate-limit) với trang
  đăng nhập mật khẩu thường (không dùng khoá `2fa:` của route 2FA cũ).
- **`rp-user/src/lib/AuthContext.jsx`, `etl-admin/src/lib/AuthContext.jsx`,
  `api-admin/src/lib/AuthContext.jsx`**: thêm `webauthnPasswordlessOptions`/
  `webauthnPasswordlessVerify` gọi 2 route trên.
- **`LoginPage.jsx` (cả 3 app)**: username đăng nhập thành công (bằng
  CÁCH NÀO cũng được) được nhớ lại ở máy (`localStorage`, mỗi app 1 khoá
  riêng) cho lần mở trang SAU — hiện sẵn tên kèm link "Tài khoản khác" để
  gõ lại username khác (CHỈ xoá khi đăng nhập THÀNH CÔNG bằng tên khác,
  không xoá ngay lúc bấm, tránh mất nhớ chỉ vì bấm nhầm). Thêm nút "Đăng
  nhập bằng vân tay / Face ID" ngay cạnh nút "Đăng nhập" thường (hiện khi
  trình duyệt hỗ trợ WebAuthn VÀ đã có username). Lúc đang chờ xác thực
  vân tay/Face ID (`webauthnBusy=true`): disable TOÀN BỘ ô username/mật
  khẩu/captcha/nút đăng nhập thường/nút vân tay — không thao tác được gì
  khác cho tới khi xong (đúng yêu cầu #3), áp dụng luôn cho bước xác thực
  2FA cũ (`TwoFactorVerifyStep`) để đồng bộ.
- **`CaptchaField.jsx` (cả 3 app)**: thêm prop `disabled` (khoá cả ô nhập
  và nút ⟲ đổi mã).
- **`styles.css` (cả 3 app)**: thêm `.remembered-account-row` /
  `.remembered-account-name` cho khung hiện username đã nhớ (tái dùng
  `.biometric-btn`/`.link-button` có sẵn từ bản 8.40/8.41/8.78, không cần
  CSS riêng cho nút vân tay mới).

**Đã kiểm chứng**: viết lại 3 bộ test (Node `http` + Express thật, mock
DB) cho cả 3 backend — xác nhận: username tồn tại trả đúng thiết bị của
họ; username không tồn tại vẫn trả 200 (không lộ thông tin); dùng thiết bị
của NGƯỜI KHÁC để đăng nhập giả danh bị từ chối (không cấp phiên); chữ ký
giả không qua được `verifyAuthenticationResponse()` thật; token dùng 1 lần
(gọi lại bị "hết hạn"). Build sạch (`vite build`) cả 3 frontend.

## 8.88 — Sửa gửi email cổng 465 không gửi được khi máy chủ không bật TLS (rp-user/rp-server)

**Theo yêu cầu người dùng**: gửi log `/var/log/mail.log` của Postfix nội
bộ cho thấy nhiều kết nối từ server HCRC bị "lost connection after
CONNECT" (mất kết nối NGAY sau khi kết nối, không gửi được lệnh SMTP
nào) — tiếp theo gửi ảnh chụp trang "Thiết lập email", bấm "Gửi thử" báo
lỗi rõ: "Máy chủ SMTP 172.16.80.41:465 từ chối/lỗi gửi thử — Lỗi SMTP:
...SSL routines:tls_validate_record_header:wrong version number...".

**Nguyên nhân**: lỗi OpenSSL "wrong version number" là dấu hiệu RẤT ĐẶC
TRƯNG — ứng dụng gửi ClientHello TLS tới 1 cổng máy chủ đang nói SMTP
THUẦN (không mã hoá). `rp-server/lib/mailer.js` (từ bản 8.63) ÉP CỨNG
`secure=true` MỖI KHI `SmtpPort=465`, bất kể admin đã tick/bỏ tick
"Secure" trong "Thiết lập email" — giả định lúc đó "không có gateway SMTP
thật nào dùng cổng 465 ở chế độ không mã hoá" hoá ra SAI với đúng Postfix
nội bộ của người dùng (nghe cổng 465 nhưng KHÔNG bật TLS ở đó) — admin
KHÔNG CÓ CÁCH NÀO bỏ tick "Secure" để gửi không mã hoá trên cổng đó, mọi
lần "Gửi thử" đều lỗi y hệt.

- **`rp-server/lib/mailer.js`**: bỏ ép cứng — `secure` giờ LUÔN theo đúng
  giá trị admin đã lưu (`row.Secure`), kể cả ở cổng 465. Thêm
  `describeMailError()` — lỗi "wrong version number" được diễn giải thêm
  câu gợi ý rõ ràng ("máy chủ SMTP này có vẻ KHÔNG bật TLS ngay từ đầu...
  hãy BỎ tick Secure") NGAY SAU thông điệp gốc (giữ nguyên gốc để còn tra
  cứu), áp dụng cho CẢ nút "Gửi thử" lẫn lịch gửi báo cáo tự động (dùng
  chung `sendMail()`).
- **`rp-user/src/modules/system/email-settings/EmailSettingsPage.jsx`**:
  cổng 465 giờ CHỈ còn tự tick sẵn "Secure" làm GỢI Ý tiện tay lúc đổi
  cổng (vẫn sửa lại được bình thường) — câu hint cũ khẳng định "hệ thống
  tự gửi bằng chế độ này dù ô trên có tick hay không" (SAI từ bản này) đã
  đổi thành hướng dẫn cụ thể: gặp lỗi "wrong version number" thì bỏ tick
  "Secure".
- **`rp-user/src/styles.css`**: `.form-error` thêm `white-space: pre-line`
  để câu gợi ý 2 dòng của `describeMailError()` xuống dòng rõ ràng thay vì
  dính liền 1 hàng dài.

**Đã kiểm chứng**: mock gọi thẳng `sendMail()` — (1) cổng 465 với
`Secure` đã lưu = false → gửi đúng `secure:false`, không còn ép true; (2)
cổng 465 với `Secure` đã lưu = true → vẫn gửi `secure:true` như bình
thường (không đổi hành vi phổ biến); (3) lỗi "wrong version number" được
diễn giải thêm câu gợi ý, giữ nguyên thông điệp gốc. Build `rp-user &&
npx vite build` sạch.

Không đổi mặc định (preset "Postfix" vẫn gợi ý cổng 465 + tick "Secure"
sẵn, đúng với đa số Postfix thật) — chỉ thêm đường thoát cho trường hợp
máy chủ THẬT không khớp giả định đó, như của người dùng.

## 8.87 — Chặn bớt số job chạy đồng thời + không bỏ sót lỗi xin khoá (ETL)

**Theo yêu cầu người dùng**: gửi ảnh chụp `pm2 logs hcrc-etl` sau khi lên
bản 8.86 — HÀNG LOẠT job (khác chi nhánh, khác domain) vẫn báo "operation
timed out for an unknown reason" gần như ĐỒNG THỜI, hỏi lại "Lỗi mà chưa
biết nguyên nhân làm sao? Kết nối vẫn thông" (ngụ ý: không phải lỗi VPN
từng chi nhánh như bản 8.86 đã sửa — tất cả xảy ra CÙNG LÚC, không phân
biệt chi nhánh nào).

**Nguyên nhân (KHÁC bản 8.86 — không phải VPN chi nhánh)**: 34 siêu thị
"Thành viên" × 2 job (Doanh thu + Giao dịch) = 68 job, TẤT CẢ dùng CHUNG 1
lịch `*/2 * * * *` (xem `scripts/seedThanhVienLiveSync.js:LIVE_CRON`).
`node-cron` gọi CẢ 68 callback GẦN NHƯ ĐỒNG THỜI mỗi 2 phút — mỗi job cần
vài lượt kết nối tới CSDL quản trị ETL DÙNG CHUNG (pool `'ADMIN'`, mặc
định tối đa 5 connection — `db.js:ADMIN_POOL_MAX`) để xin khoá
`sp_getapplock`/đọc-ghi mốc đồng bộ/ghi log. 68 job tranh 5 connection
khiến nhiều job phải chờ quá lâu trong HÀNG ĐỢI CỦA CHÍNH POOL 'ADMIN' và
bị thư viện pool báo lỗi **CÙNG thông điệp** "operation timed out for an
unknown reason" — giống hệt lỗi mạng bản 8.86 đã sửa, nhưng đây là tranh
chấp ở pool `'ADMIN'` DÙNG CHUNG, hoàn toàn KHÔNG liên quan tới VPN/kết
nối riêng của BẤT KỲ chi nhánh nào — đúng như người dùng quan sát "kết nối
vẫn thông".

Rà soát thêm phát hiện: bước XIN KHOÁ `sp_getapplock` (mở pool 'ADMIN',
mở transaction, chạy `sp_getapplock`) trước bản này KHÔNG nằm trong bất
kỳ `try/catch` nào — lỗi ở đây rơi thẳng ra `jobs/scheduler.js`, CHỈ được
in `console.error` (pm2 log), **KHÔNG ghi vào `etl.SyncLog`, KHÔNG gửi
mail cảnh báo** — khác hẳn MỌI lỗi khác trong hệ thống (luôn ghi
FAILED + gửi cảnh báo) — giải thích vì sao các lỗi này KHÔNG hiện trên
trang "Đồng bộ" của etl-admin, chỉ thấy khi tự soi `pm2 logs`.

- **`etl/jobs/scheduler.js`**: thêm giới hạn **tối đa 4 job chạy THỰC SỰ
  đồng thời** (`MAX_CONCURRENT_JOBS`, chỉnh qua `.env`
  `ETL_MAX_CONCURRENT_JOBS`, mặc định thấp hơn `ADMIN_POOL_MAX` để chừa
  dư connection cho trang quản trị) — job vượt quá KHÔNG bị bỏ qua, chỉ
  XẾP HÀNG (FIFO) chờ tới lượt, thường chỉ vài giây (mỗi job "(TV)" đọc
  delta nhỏ rất nhanh) — dư thời gian trước chu kỳ cron 2 phút kế tiếp.
  Áp dụng chung cho cả job chạy theo lịch lẫn nút "Chạy thử".
- **`etl/jobs/runSync.js`**: bước xin khoá `sp_getapplock` giờ nằm trong
  `try/catch` đầy đủ — MỌI lỗi ở đây (kể cả lỗi pool 'ADMIN' quá tải)
  đều ghi FAILED vào `etl.SyncLog` + gửi cảnh báo như mọi lỗi khác, qua
  hàm dùng chung `recordFailure()` (gộp lại từ 3 chỗ trước đây tự lặp
  logic y hệt nhau).
- **`etl/.env.example`**: thêm `ETL_MAX_CONCURRENT_JOBS=4`, kèm ghi chú
  nên tăng CÙNG LÚC với `ADMIN_POOL_MAX` nếu hệ thống có thêm nhiều
  chi nhánh/job hơn.

**Đã kiểm chứng**: mock gọi thẳng `runJob()`/`runJobIfNotAlreadyRunning()`
— (1) lỗi xin khoá (giả lập pool 'ADMIN' quá tải) giờ ghi đúng FAILED +
gửi cảnh báo, không còn rơi ra ngoài vô hình; (2) giả lập 20 job khác
nhau kích hoạt đồng thời (mô phỏng đúng kịch bản 68 job cùng lịch) — đỉnh
điểm CHỈ 4 job chạy cùng lúc đúng như cấu hình, CẢ 20 job đều hoàn tất
(xếp hàng, không bỏ sót job nào).

Không đổi lịch chạy (CronExpression) của bất kỳ job nào, không đổi dữ
liệu đã đồng bộ. Khuyến nghị theo dõi thêm sau khi lên bản này — nếu hệ
thống vẫn còn nhiều job dồn cùng lúc do số lượng chi nhánh lớn, cân nhắc
tăng `ETL_MAX_CONCURRENT_JOBS` + `ADMIN_POOL_MAX` theo cùng tỉ lệ, hoặc
giãn lịch `*/2 * * * *` ra nhiều phút lệch nhau giữa các nhóm chi nhánh.

## 8.86 — Thử lại + rút ngắn thời gian chờ khi VPN chi nhánh chập chờn giữa chừng đồng bộ (ETL)

**Theo yêu cầu người dùng**: gửi ảnh chụp trang "Trạng thái kết nối" (35/36
nguồn "Kết nối được", chỉ 1 nguồn mất kết nối hẳn) CÙNG trang "Đồng bộ" (rất
nhiều job báo lỗi trong 24h qua) và "Job lỗi trong 24h qua" toàn lỗi
"operation timed out for an unknown reason" — hỏi "Kết nối thông suốt nhưng
nhiều job đồng bộ không chạy được... có thể thay đổi cơ chế đồng bộ dữ liệu
sao cho nhanh hơn và kết nối đảm bảo lấy dữ liệu liên tục nếu chưa được cho
đến khi chuyển sang lịch lấy dữ liệu định kỳ được không?"

**Nguyên nhân**: trang "Trạng thái kết nối" chỉ mở+đóng NGAY 1 kết nối
NGẮN để kiểm tra — vẫn qua được dù VPN đang chập chờn. Job đồng bộ THẬT giữ
1 kết nối gộp (pool) LÂU hơn nhiều để chạy câu truy vấn, và TRƯỚC bản này
mọi job (kể cả job "(TV)" chỉ đọc vài dòng mới mỗi vài phút) đều dùng CHUNG
thời gian chờ 10 PHÚT của job "Lịch sử" (hợp lý cho job đó, quá dài cho job
thường) — 1 lượt bị VPN làm treo GIỮA CHỪNG câu truy vấn phải chờ đủ 10
phút mới báo lỗi, và vì bản 8.59 CỐ Ý không thử lại lỗi xảy ra SAU KHI đã
kết nối được (đúng với lỗi thiếu cột/sai cú pháp, nhưng SAI với đúng kịch
bản VPN chập chờn giữa chừng), lượt đó thất bại hẳn, phải chờ lượt cron kế
tiếp mới có cơ hội thử lại.

- **`etl/jobs/runSync.js`**: rút ngắn thời gian chờ mỗi truy vấn
  (`requestTimeout`) xuống còn 90 giây (`DATASOURCE_INCREMENTAL_REQUEST_TIMEOUT_MS`,
  mới) cho LƯỢT CHẠY ĐỊNH KỲ (đã có mốc đồng bộ, không phải lần đầu) — lần
  chạy ĐẦU TIÊN của mọi job (kể cả job "(TV)" mới tạo) vẫn giữ nguyên 10
  phút (`DATASOURCE_REQUEST_TIMEOUT_MS`, không đổi) vì job "Lịch sử" đọc
  VIEW gộp hàng chục triệu dòng thật sự cần thời gian dài.
- Lỗi MẠNG TẠM THỜI xảy ra NGAY TRONG LÚC TRÍCH XUẤT (không chỉ lúc mở kết
  nối ban đầu như bản 8.59) giờ được THỬ LẠI NGAY trong lúc job đang chạy —
  tối đa 3 lần, cách nhau 5 giây, kèm làm mới (đóng + mở lại) kết nối trước
  mỗi lần thử để không dùng lại đúng kết nối đang "kẹt". Nhận diện lỗi mạng
  qua mã lỗi chuẩn (ETIMEOUT/ESOCKET/ECONNRESET/...) và `TimeoutError` của
  `tarn` (thư viện pool bên trong `mssql`, chính là nguồn gốc thông điệp
  "operation timed out for an unknown reason") — lỗi dữ liệu/cấu hình thật
  (thiếu cột, sai cú pháp SQL...) KHÔNG thử lại, vẫn báo lỗi ngay như cũ.
  Hết 3 lần thử nhanh vẫn lỗi mạng → dừng, ghi FAILED + gửi cảnh báo như
  bình thường — lượt cron KẾ TIẾP của chính job đó (2-3 phút sau với job
  "(TV)") tự thử lại từ đầu qua cơ chế retry 10 phút đã có từ bản 8.59.
- **`etl/lib/dataSourcePool.js`**: 1 nguồn dữ liệu giờ có thể có 2 kết nối
  gộp (pool) RIÊNG tuỳ thời gian chờ đang dùng (lần đầu / định kỳ) — không
  tranh connection giữa job backfill (có thể chạy lâu) và job định kỳ (cần
  thất bại/thử lại nhanh). `invalidate()` (gọi khi admin sửa/xoá 1 nguồn,
  hoặc khi gặp lỗi mạng tạm thời) gỡ ĐỦ CẢ 2 pool.
- **`etl/lib/dbAdapters/mssql.js`**: `createPool()` nhận thêm tham số
  `requestTimeout` tuỳ chọn — không truyền vẫn giữ nguyên mặc định cũ (mọi
  nơi gọi khác, vd "Kiểm tra kết nối"/duyệt schema, không đổi hành vi).

**Đã kiểm chứng**: mock CSDL thật, gọi thẳng `runJob()` — (1) lỗi mạng tạm
thời giữa chừng trích xuất được thử lại đúng, làm mới kết nối đúng nguồn,
lượt chạy vẫn THÀNH CÔNG; (2) lần chạy đầu tiên (chưa có mốc) giữ nguyên
thời gian chờ dài, không bị rút ngắn nhầm; (3) lỗi mạng kéo dài quá 3 lần
thử nhanh thì dừng đúng lúc, ghi FAILED + gửi cảnh báo, không treo vô hạn
trong lúc giữ khoá CSDL; (4) `dataSourcePool.js` tạo đúng 2 pool riêng cho
2 hồ sơ thời gian chờ, dùng lại đúng pool đã mở (không tạo lại mỗi lần
gọi), `invalidate()` đóng đủ cả 2.

Không đổi lịch chạy (CronExpression) của bất kỳ job nào, không đổi hành vi
job "Lịch sử"/job chạy lần đầu, không đổi dữ liệu đã đồng bộ.

## 8.85 — Sửa màn hình trắng khi vào URL không khớp route nào (rp-user)

**Theo yêu cầu người dùng**: gửi ảnh chụp vào thẳng URL
`report.hcrc.vn/system` → trang trắng hoàn toàn, không cả sidebar/topbar
— "Vấn vào system trên dashboard đang bị lỗi."

**Nguyên nhân** (lỗi có từ trước, KHÔNG liên quan bản 8.84 vừa chốt):
`App.jsx` chưa từng có route riêng cho `/system` — đây chỉ là mục CHA mở
submenu ở sidebar (`Layout.jsx`, bấm "Hệ thống" chỉ `setSystemOpen()`,
không điều hướng), các trang thật đều nằm ở `/system/<mục con>`. App
cũng KHÔNG có route bắt mọi URL còn lại (`path="*"`), nên bất kỳ URL
không khớp route nào (gõ tay `/system`, bookmark cũ trỏ đường dẫn đã đổi,
gõ sai chính tả...) đều khiến `<Routes>` không khớp được route con nào
— kể cả `<Layout>` (bọc ngoài mọi route) cũng không vẽ ra, nên mất luôn
cả sidebar/topbar, không chỉ mất nội dung trang.

- **`rp-user/src/App.jsx`** — thêm route `path="*"` ở cuối (trong
  `<Layout>`), `<Navigate to="/" replace />` — mọi URL không khớp giờ về
  thẳng trang chủ (CÓ sidebar/topbar), không còn trang trắng.
- Chỉ `rp-user` có hiện tượng này — etl-admin/api-admin không có cấu
  trúc menu cha/con 2 cấp tương tự (menu phẳng, mỗi mục đều có route
  riêng).

Không đổi route/trang nào đang hoạt động đúng — chỉ thêm 1 route "bắt
đáy" cho trường hợp không khớp.

## 8.84 — Dropdown "Chọn nhóm" thay thẻ lưới ở trang Dashboard (rp-user)

**Theo yêu cầu người dùng**: gửi 2 ảnh chụp (trang "Báo cáo" dùng
dropdown "Chọn báo cáo"; trang "Dashboard" dùng thẻ lưới 🏆/⚡ cho 2 nhóm
hiện có) kèm lời nhắn "tôi muốn làm chọn dạng droplist như Module Báo
cáo để sau này nhiều nhóm Dashboard sẽ gọn hơn, bạn nghiên cứu và gửi
demo cho mình nhé" — đã gửi demo ảnh chụp, người dùng duyệt ("Đẹp rồi,
bạn chốt luôn đi").

- **`rp-user/src/modules/dashboard/DashboardPage.jsx`** — thay khối thẻ
  lưới `.dashboard-group-grid` (mỗi nhóm 1 thẻ bấm chọn) bằng 1 dropdown
  `<select>` dùng ĐÚNG class `.report-picker` đã dùng cho "Chọn
  dashboard" (cùng trang)/"Chọn báo cáo" (trang Báo cáo) — mỗi `<option>`
  hiện `{icon} {label} ({count} ô)`, chọn gọi lại đúng `selectGroup()`
  có sẵn (không đổi logic lọc tile/lưu `lastGroup` vào
  `UserDashboardPreferences`, chỉ đổi WIDGET chọn).
- **`rp-user/src/styles.css`** — xoá các rule CSS chết của thẻ lưới cũ
  (`.dashboard-group-grid`, `.dashboard-group-card*`) — không còn nơi nào
  dùng. KHÔNG đụng `.dashboard-group`/`.dashboard-group-title` (khác tầng
  — tiêu đề nhóm Mart/Minimart BÊN TRONG 1 nhóm Dashboard đã chọn).
- Phân quyền 2 cấp (`RoleReportAccess`/`RoleDashboardGroupAccess`, bản
  8.42/8.43) và cá nhân hoá (`UserDashboardPreferences`, bản 8.45/8.46)
  hoàn toàn KHÔNG đổi — lọc tile vẫn làm ở server TRƯỚC khi về client,
  đổi UI chọn nhóm chỉ là đổi giao diện, không đổi dữ liệu người dùng
  thấy được.
- **Chỉ `rp-user`** — etl-admin/api-admin không có khái niệm "nhóm
  Dashboard" nên không áp dụng.

Gọn hơn khi hệ thống có thêm nhiều nhóm Dashboard sau này (thẻ lưới cũ
chiếm nhiều chỗ theo số nhóm, dropdown không đổi chiều cao dù có bao
nhiêu nhóm).

## 8.83 — PWA thật cho etl-admin + api-admin (đồng bộ ngang rp-user)

**Theo yêu cầu người dùng**: "Bạn triển khai PWA cho API và ETL luôn
nhé, nhớ kiểm tra và responsive cả 3 trang đảm bảo giao diện mobile
chuẩn rồi nhé" — rp-user đã là PWA thật từ bản 6.18 (lúc đó cố ý CHỈ
làm rp-user, "api-admin/etl-admin để sau"), giờ làm nốt 2 app còn lại.

- **`etl-admin`/`api-admin`**: thêm `vite-plugin-pwa` (đúng phiên bản
  rp-user đang dùng, `^1.3.0`), cấu hình `VitePWA({registerType:
  'autoUpdate', ...})` trong `vite.config.js` — mirror NGUYÊN VẸN cấu
  hình rp-user, chỉ đổi `name`/`short_name`/`description`/`theme_color`
  cho đúng từng app:
  - etl-admin: "HCRC — Quản trị ETL" / theme `#7a4f9e` (đúng `--accent`
    tím đang dùng).
  - api-admin: "HCRC — Quản trị API" / theme `#1c7566` (đúng `--accent`
    xanh ngọc đang dùng).
- **Icon mới** (`public/icons/icon-192.png`, `icon-512.png`,
  `icon-maskable-512.png`, `apple-touch-icon.png`, mỗi app) — cùng
  phong cách bo góc + glyph trắng như rp-user, glyph RIÊNG cho từng app
  để phân biệt khi cài song song nhiều app trên cùng máy: etl-admin
  dùng biểu tượng "đồng bộ" (2 mũi tên vòng tròn), api-admin dùng biểu
  tượng "API/code" (`</>`).
- **`index.html`** (cả 2 app) — thêm đủ thẻ `theme-color`, `apple-touch-icon`,
  `apple-mobile-web-app-*`, mirror rp-user.
- **`deploy/nginx.conf`** — thêm `location = /manifest.webmanifest` (khai
  đúng `Content-Type: application/manifest+json`, `Cache-Control:
  no-cache`) cho domain `api-admin.hcrc.vidu.vn` và `etl-admin.hcrc.vidu.vn`,
  mirror domain `report.hcrc.vidu.vn` đã có. `deploy/serve-static.js`
  (mô hình PM2-only) KHÔNG cần sửa — `NO_CACHE_FILES` đã dùng chung cho
  cả 3 app từ trước (`manifest.webmanifest`/`sw.js`/`registerSW.js`).
- **Kiểm tra responsive cả 3 trang** (theo yêu cầu): dùng Playwright chụp
  màn hình thật ở khung điện thoại phổ biến (390×844, kiểu iPhone 12/13)
  cho các trang quan trọng nhất của CẢ 3 app — đăng nhập, bảng dữ liệu
  chính kèm 3 nút Bật/Tắt/Xoá hàng loạt (bản 8.80, khu vực mới nhất),
  trang "Tài khoản của tôi" với 2 mục 2FA/WebAuthn mới (bản 8.78), menu
  drawer mobile. **Không phát hiện tràn ngang** (`scrollWidth >
  clientWidth`) ở bất kỳ trang nào — hạ tầng responsive (sidebar drawer
  dưới 880px, login stack dưới 860px, bảng cuộn ngang `.table-scroll`)
  đã có sẵn từ trước và hoạt động đúng, không cần sửa CSS thêm.

Sau khi cài đặt (Android Chrome: menu ⋮ → "Cài đặt ứng dụng"; iOS
Safari: nút Chia sẻ → "Thêm vào màn hình chính"), etl-admin/api-admin mở
toàn màn hình như app thật, có icon riêng, hoạt động ngoại tuyến cơ bản
(trang đã từng mở) nhờ service worker — y hệt rp-user.

## 8.82 — Script xoá hàng loạt 34 Nguồn dữ liệu + Sync Job "Thành viên" (ETL)

**Theo yêu cầu người dùng**: "Bạn làm cho tôi một script cho phép tôi
xoá nguồn và đồng bộ của 34 siêu thị này luôn nhé và tôi sẽ tạo lại bằng
script, DL đồng bộ đang không về đúng mặc dù đã làm cấu hình trước đó" —
muốn xoá sạch 34 Nguồn dữ liệu + Sync Job "Thành viên" (tạo bởi
`scripts/seedThanhVienLiveSync.js`, bản 8.15) để tạo lại từ đầu, loại trừ
khả năng cấu hình/dữ liệu cũ còn sót gây lỗi đồng bộ.

- **`etl/scripts/deleteThanhVienLiveSync.js`** (mới) — dùng ĐÚNG 34 tên
  siêu thị (copy nguyên văn từ `seedThanhVienLiveSync.js`, phải giữ khớp
  2 file) để xoá CHÍNH XÁC 34 Nguồn dữ liệu "DSMART16 - &lt;tên&gt;" +
  MỌI Sync Job đang tham chiếu (dò theo `DataSourceId` thật trong CSDL,
  không chỉ theo tên job). KHÔNG đụng Nguồn/Job nào khác (vd job "...Lịch
  sử (DSMART16_EOM)" của `seedThanhVienHistorySync.js` dùng 1 nguồn trung
  tâm riêng, không nằm trong 34 nguồn này).
- **Mặc định CHỈ xem trước (dry-run)** — liệt kê đúng những gì SẼ xoá,
  KHÔNG xoá gì. Thêm `--confirm` để xoá thật:
  ```
  node scripts/deleteThanhVienLiveSync.js            # xem trước
  node scripts/deleteThanhVienLiveSync.js --confirm  # xoá thật
  ```
- Xoá Sync Job TRƯỚC (gỡ đúng khỏi lịch cron qua `rescheduleJob()`), rồi
  mới xoá Nguồn dữ liệu (đóng pool kết nối cũ qua `invalidate()`, có
  timeout 5s theo bản 8.76, không treo) — đúng thứ tự tránh vi phạm FK.
  Siêu thị chưa từng tạo (không tìm thấy Nguồn) được bỏ qua êm, không
  báo lỗi.
- **Đã kiểm chứng bằng mock CSDL THẬT** (gọi thẳng script, không giả
  logic nghiệp vụ): dry-run không xoá gì; `--confirm` xoá ĐÚNG 33/34
  nguồn dựng sẵn + 66 job tương ứng, nguồn/job KHÔNG liên quan (mô phỏng
  DSMART16_EOM) giữ nguyên không bị đụng tới, gọi đúng `rescheduleJob()`
  cho từng job xoá và `invalidate()` cho từng nguồn xoá; chạy lại lần 2
  khi không còn gì để xoá không lỗi, thoát sạch.

Sau khi xoá, chạy lại `node scripts/seedThanhVienLiveSync.js` để tạo mới
hoàn toàn 34 Nguồn + Sync Job — script này idempotent (đã có sẵn từ bản
8.15), an toàn chạy lại nhiều lần.

## 8.81 — Xoá kèm job đồng bộ khi Nguồn dữ liệu còn job tham chiếu (ETL)

**Theo yêu cầu người dùng**: gửi ảnh chụp bị chặn xoá Nguồn dữ liệu kèm
báo "Tôi đã tắt cả nguồn và job mà ko xoá được" — sau khi đã hỏi và xác
nhận (AskUserQuestion) đây là THIẾT KẾ ĐÚNG, có chủ đích (bản 8.76, chặn
xoá khi còn Sync Job tham chiếu để không bao giờ âm thầm mất cấu hình
job), người dùng chọn phương án **thêm nút "Xoá kèm job"** thay vì tự
qua trang "Đồng bộ" xoá job trước rồi quay lại.

- **`DELETE /admin/data-sources/:id`** nhận thêm `{ cascadeJobs: true }`
  (tuỳ chọn) — có thì xoá hết các Sync Job đang tham chiếu nguồn đó
  TRƯỚC (gỡ đúng khỏi lịch cron qua `rescheduleJob()`), rồi mới xoá
  nguồn; không có (mặc định, hành vi CŨ không đổi) thì vẫn chặn như bản
  8.76, trả kèm `blockingJobs` (id + tên từng job) để frontend hiển thị.
- **`DataSourcesPage.jsx`**: bấm "Xoá" bị chặn → hỏi RIÊNG 1 lần nữa,
  nêu ĐÚNG tên từng job đang chặn ("Xoá CẢ N job này CÙNG LÚC với
  nguồn?") → đồng ý mới gọi lại với `cascadeJobs: true`. KHÔNG tự động
  xoá job nào mà không hỏi — giữ đúng tinh thần "không bao giờ âm thầm"
  của bản 8.76, chỉ gộp 2 bước (xoá job + xoá nguồn) vào 1 lượt.
- **Đã kiểm chứng bằng mock CSDL THẬT** (gọi thẳng route handler): mặc
  định vẫn chặn đúng, trả đủ `blockingJobs`; `cascadeJobs:true` xoá đúng
  CHỈ các job của ĐÚNG nguồn đang xoá (không đụng job của nguồn khác),
  gọi đúng `rescheduleJob()` gỡ khỏi lịch; nguồn không ai dùng vẫn xoá
  bình thường như cũ (`deletedJobs: 0`). Demo Playwright xác nhận đúng
  trình tự 2 hộp thoại xác nhận, nêu đúng tên 2 job thật từ ảnh chụp
  người dùng gửi ("Doanh thu (TV)..."/"Giao dịch (TV)...").

## 8.80 — Bật/Tắt hàng loạt + sửa xoá hàng loạt dừng cả loạt khi 1 mục bị chặn (ETL)

**Theo yêu cầu người dùng**: "Bạn cho phép chọn nhiều ở nguồn dữ liệu và
đồng bộ để tắt, bật nhiều cùng một lúc, xoá đang ko thể xoá được nhiều
đâu có thể phải tắt hết mới xoá được phải ko? Bạn kiểm tra luôn nhé."

**Trả lời câu hỏi "phải tắt hết mới xoá được?"**: KHÔNG đúng — Bật/Tắt
(`IsActive`) chỉ quyết định có kết nối/chạy lịch hay không, KHÔNG liên
quan gì tới việc xoá được hay không. Nguyên nhân thật khiến "xoá nhiều
không được" (trang Nguồn dữ liệu): `DELETE /data-sources/:id` (bản 8.76)
**từ chối** xoá 1 nguồn nếu còn Sync Job nào có `DataSourceId` trỏ vào
đó — dù job đó đang Bật hay Tắt đều bị chặn như nhau. Vòng lặp xoá hàng
loạt ở frontend TRƯỚC ĐÂY dừng NGAY khi gặp mục đầu tiên bị chặn kiểu
này, khiến MỌI mục SAU trong danh sách đã chọn **không được thử xoá**,
mà người dùng không biết mục nào đã xoá/mục nào bị chặn vì sao — đúng
triệu chứng "chọn nhiều, ấn xoá không ăn thua".

- **Đã sửa (cả Nguồn dữ liệu lẫn Đồng bộ)**: vòng lặp xoá hàng loạt giờ
  thử XOÁ TỪNG MỤC ĐỘC LẬP — lỗi 1 mục (vd còn job tham chiếu) KHÔNG còn
  chặn các mục khác, kết thúc gộp báo lỗi rõ ràng (tên từng mục thất bại
  + lý do thật) thay vì dừng im lặng giữa chừng.
- **Đã thêm (đúng yêu cầu)**: nút "Bật N mục đã chọn"/"Tắt N mục đã chọn"
  cạnh nút "Xoá N mục đã chọn" sẵn có, cho CẢ trang "Nguồn dữ liệu" lẫn
  "Đồng bộ" — gọi LẶP LẠI đúng `PUT /:id` đã có (như nút Bật/Tắt từng
  dòng), ép TOÀN BỘ mục đã chọn về CÙNG 1 trạng thái mong muốn (không
  đảo ngược riêng từng dòng), cùng khả năng chịu lỗi như trên.
- Bỏ câu "Các job đồng bộ dùng nguồn này sẽ lỗi" lỗi thời trong hộp thoại
  xác nhận xoá (còn sót từ TRƯỚC bản 8.76 — lúc đó xoá vẫn chạy rồi job
  mới lỗi; giờ route TỪ CHỐI hẳn, không xoá, không có job nào lỗi).
- **Đã kiểm chứng bằng Playwright + mock backend THẬT** (không giả logic
  nghiệp vụ UI): bấm "Bật N đã chọn" trên 3 nguồn trạng thái khác nhau →
  cả 3 chuyển đúng "Hoạt động"; dựng lại ĐÚNG tình huống báo lỗi (xoá 3
  nguồn, 1 nguồn trả về 400 "còn job tham chiếu") → xác nhận 2 nguồn còn
  lại XOÁ ĐÚNG, nguồn bị chặn VẪN CÒN, trang hiện rõ tên nguồn thất bại +
  lý do thật.

## 8.79 — KHẨN: Sửa crash rp-server trên Node < 22.4 (lỗi "tls.getCACertificates is not a function")

**Theo yêu cầu người dùng**: gửi log PM2 cho thấy `hcrc-rp-server` ở
trạng thái `errored` (cả 2 cluster worker) với lỗi `TypeError:
tls.getCACertificates is not a function` tại `rp-server/lib/trustedCa.js:43`,
kèm ảnh chụp trang đăng nhập không hiện captcha và DevTools báo `502 Bad
Gateway` trên `/api/auth/captcha` và `/api/me`.

**Xác nhận root cause — KHÔNG phải lỗi captcha**: `lib/trustedCa.js`
(tính năng "CA tin cậy", bản 8.72) gọi `tls.getCACertificates()` và
`tls.setDefaultCACertificates()` **ngay lúc module được `require()`**,
ngoài mọi try/catch. Hai API này chỉ có từ **Node.js >= 22.4** — comment
cũ trong code ghi nhầm "Node >= ~20", trong khi `package.json` còn khai
`"engines": {"node": ">=18.0.0"}`. Server đang chạy Node cũ hơn 22.4 nên
`require()` ném lỗi ngay lúc khởi động → **toàn bộ `hcrc-rp-server`
crash** (xác nhận đúng từ log PM2 gửi kèm) → mọi API kể cả captcha và
`/api/me` đều 502 vì backend không hề chạy, không phải lỗi riêng captcha
hay vấn đề từ bản 8.74/8.78.

- **Đã sửa**: `lib/trustedCa.js` tự nhận diện (`typeof tls.getCACertificates
  === 'function'`) lúc nạp module — nếu Node không hỗ trợ, **TẮT GỌN**
  tính năng "CA tin cậy" (log cảnh báo rõ ràng, `listTrustedCas()` trả
  `[]`, `addTrustedCa()`/`removeTrustedCa()` trả lỗi 503 rõ ràng "cần
  Node.js >= 22.4") thay vì ném lỗi làm crash cả tiến trình. Các tính
  năng khác của rp-server (đăng nhập, captcha, báo cáo...) **hoàn toàn
  không phụ thuộc** module này, chỉ bị crash lây do lỗi xảy ra ở top-level
  lúc `require()`.
- **Đã kiểm chứng bằng cách dựng lại ĐÚNG lỗi**: xoá `tls.getCACertificates`/
  `tls.setDefaultCACertificates` trước khi `require()` — xác nhận module
  THẬT (không giả logic) không còn ném lỗi, `listTrustedCas()` trả mảng
  rỗng, `addTrustedCa()`/`removeTrustedCa()` trả đúng lỗi 503. Kiểm chứng
  lại luồng BÌNH THƯỜNG (Node có đủ API) vẫn hoạt động đúng 100% bằng CA
  tự ký thật (`openssl`): thêm/liệt kê/xoá đều đúng, không có hồi quy.
- **Khuyến nghị thêm (không bắt buộc để hết crash)**: nâng Node.js trên
  server production lên >= 22.4 nếu muốn dùng lại tính năng "CA tin cậy".
  Không nâng vẫn chạy bình thường, chỉ riêng tính năng này tắt.

## 8.78 — Đồng bộ 2FA đổi/thêm thiết bị + vân tay/Face ID (WebAuthn) cho ETL, API

**Theo yêu cầu người dùng**: gửi ảnh chụp trang "Tài khoản bảo mật" của
rp-user (mục "Vân tay / Face ID của tôi" + "Xác thực hai yếu tố của tôi"),
hỏi "các trang ETL, API và report xem đã có cái tính năng giống hình ảnh
này... chưa? Cho phép đổi thiết bị Authent và thêm thiết bị Authent." —
xác nhận etl-admin/api-admin **CHƯA CÓ CẢ HAI** tính năng (rp-user đã có từ
bản 8.39/8.40). Người dùng chọn làm **cả 2** (đồng bộ đầy đủ ngang
rp-user), cho **cả etl-admin lẫn api-admin**.

**Lưu ý vẫn giữ nguyên quy tắc đã có** (theo yêu cầu người dùng, áp dụng
CẢ 3 trang ETL/API/Report): xác thực bằng vân tay/Face ID thành công thì
**KHÔNG cần nhập thêm mã 2FA** — WebAuthn ở đây THAY HẲN bước nhập mã 6
số, không phải thêm 1 bước nữa.

- **"Đặt lại mã 2FA"** (tự đăng ký lại 2FA trên thiết bị/app Authenticator
  KHÁC mà không cần nhờ Admin khác "Đặt lại 2FA" giúp) — backend route đã
  có sẵn từ trước (`POST /admin/2fa/setup` nhánh "Đổi thiết bị"), CHỈ thiếu
  giao diện gọi tới — bản này thêm `TwoFactorResetFlow` vào `AccountPage.jsx`
  (port nguyên khối từ rp-user, không đổi logic).
- **Vân tay/Face ID (WebAuthn)** — tính năng MỚI hoàn toàn cho etl-admin/
  api-admin, mirror `rp-server`/`rp-user` (bản 8.40/8.41):
  - Bảng mới `admin.AdminWebAuthnCredentials` (`etl-db/schema.sql`,
    `api-db/schema.sql`) — CredentialId/PublicKeyBase64/Counter (tăng dần
    mỗi lần dùng, phát hiện khoá bị nhân bản)/DeviceLabel, khoá ngoài
    `AdminUserId` → `admin.AdminUsers`.
  - `routes/admin/webauthn.js` (mới, cả `etl/` và `api-server/`) — 6 route:
    `GET/DELETE /devices` (quản lý thiết bị, cần phiên đầy đủ),
    `POST /register/options`, `POST /register/verify` (đăng ký thiết bị
    mới), `POST /login/options`, `POST /login/verify` (đăng nhập bằng
    thiết bị đã đăng ký — nhận token "pending" **Y HỆT** `POST /2fa/verify`,
    xác thực xong cấp cookie phiên ĐẦY ĐỦ ngay, không yêu cầu gì thêm).
  - `WEBAUTHN_RP_NAME`/`WEBAUTHN_RP_ID`/`WEBAUTHN_RP_ORIGIN` (`.env.example`
    cả 2 app) — để trống 1 trong 2 biến ID/ORIGIN thì tính năng tự tắt (API
    trả lỗi rõ ràng), KHÔNG crash server — cùng quy ước với rp-server.
  - `WebauthnDevicesSection` (`AccountPage.jsx`) — đăng ký/gỡ nhiều thiết
    bị; nút "🫆 Dùng vân tay / Face ID" (`LoginPage.jsx`, bước
    `TwoFactorVerifyStep`) — chỉ hiện khi trình duyệt hỗ trợ
    (`browserSupportsWebAuthn()`), xác thực xong gọi thẳng `onDone()`, bỏ
    qua hoàn toàn form nhập mã 6 số bên dưới.
  - `@simplewebauthn/server` (`etl`, `api-server`) + `@simplewebauthn/browser`
    (`etl-admin`, `api-admin`) — đúng phiên bản đã dùng ở rp-server/rp-user.
- **Đã kiểm chứng bằng mock DB + mock `@simplewebauthn/server` THẬT** (gọi
  thẳng các route handler, không giả logic nghiệp vụ): đăng ký thiết bị lưu
  đúng `AdminUserId`; danh sách/gỡ thiết bị **scoped đúng theo từng admin**
  (admin A không thấy/không gỡ được thiết bị của admin B); đăng nhập bằng
  vân tay **bỏ qua hẳn** bước nhập mã 2FA (chỉ cần token "pending" + phản
  hồi WebAuthn khớp thiết bị, cấp cookie phiên ngay); dùng thiết bị của
  admin khác để đăng nhập bị chặn đúng; Counter tăng sau mỗi lần đăng nhập.
  Build `etl-admin`/`api-admin` qua `vite build` sạch; demo bằng mock
  server + Playwright xác nhận cả 2 mục mới hiện đúng trên "Tài khoản của
  tôi" và nút vân tay hiện đúng vị trí ở bước xác thực hai yếu tố khi đăng
  nhập.

## 8.77 — Xuất Excel chưa mã hoá cho Nguồn dữ liệu

**Theo yêu cầu người dùng**: "phần tạo nguồn dữ liệu không xuất được file
Excel ở mục chưa mã hoá... tôi cần xuất Excel ở mục này để tôi có thể
import được."

**Xác nhận**: KHÔNG phải lỗi/bug — tính năng "xuất danh sách nguồn hiện
có ra Excel thường" **chưa từng được xây dựng**. Hệ thống trước đây chỉ
có "Xuất file mã hoá" (`.hcrcenc`, không mở được bằng Excel) và "Tải file
mẫu" (chỉ 1 dòng ví dụ TRỐNG, không phải dữ liệu thật).

**Quyết định bảo mật** (người dùng chọn qua hỏi đáp): file xuất ra để cột
**Password luôn TRỐNG** — mật khẩu thật KHÔNG BAO GIỜ chạm tới 1 file
Excel thường, kể cả chỉ để xem/xuất ra.

- **`etl/lib/dataSourcesImport.js:exportDataSourcesPlain()`** (mới) — đọc
  đúng dữ liệu thật trong `etl.DataSources` (Name/Server/Database/
  Username/Engine/Port/Encrypt/TrustServerCert), cột Password luôn để
  trống, cùng khuôn cột với "Tải file mẫu" để sửa xong nộp thẳng lại qua
  Nhập hàng loạt.
- **Sửa kèm luồng Nhập hàng loạt để "Password" không còn bắt buộc**: để
  trống nghĩa là GIỮ NGUYÊN mật khẩu cũ — CHỈ hợp lệ khi "Name" đó đã tồn
  tại (nguồn MỚI hoàn toàn vẫn bắt buộc phải có mật khẩu, không thể tạo
  nguồn rỗng mật khẩu) — khớp đúng hành vi đã có sẵn ở form sửa 1 nguồn
  (`PUT /data-sources/:id`), giờ áp dụng nhất quán cho cả đường Excel hàng
  loạt.
- **`GET /data-sources/export-plain`** (mới, `requireMenuEdit` — file lộ
  thông tin kết nối thật Server/Username/Database của mọi nguồn).
- Nút mới "Xuất Excel (danh sách hiện có, chưa mã hoá)" cạnh "Tải file
  mẫu" trong `DataSourcesPage.jsx`.
- **Đã kiểm chứng bằng mock CSDL + mã hoá/giải mã THẬT** (không giả logic
  nghiệp vụ): xác nhận cột Password luôn trống khi xuất; dòng để trống
  Password với "Name" đã tồn tại được GIỮ ĐÚNG mật khẩu cũ (giải mã khớp
  100% với mật khẩu gốc); dòng để trống Password với "Name" MỚI bị chặn
  đúng, không tạo nguồn rỗng mật khẩu.

## 8.76 — Sửa treo khi xoá hàng loạt Nguồn dữ liệu (ETL)

**Theo yêu cầu người dùng**: báo lỗi "ETL khi tôi chọn nhiều mục ở trong
đồng bộ và trong nguồn dữ liệu, ấn xoá không thể xoá được, cảm giác như
kết nối lên server bị treo."

**Nguyên nhân thật tìm được**: `etl/lib/dataSourcePool.js:invalidate()`
(gọi mỗi khi sửa/xoá 1 "Nguồn dữ liệu") đóng kết nối cũ (nếu từng mở —
vd admin từng duyệt bảng/cột nguồn đó lúc tạo Sync Job) bằng
`adapter.close(pool)` **KHÔNG có timeout nào**. Driver `tedious` (mssql)
chờ sự kiện `'end'` để coi là đóng xong — nếu nguồn DSmart16 bên kia rớt
mạng kiểu "zombie" (không có TCP RST/từ chối rõ ràng, chỉ lặng im), sự
kiện đó **không bao giờ tới** → `invalidate()` treo VĨNH VIỄN → route
`DELETE /admin/data-sources/:id` không bao giờ trả response. Vì nút "Xoá
N mục đã chọn" chạy TUẦN TỰ (đúng mẫu CLAUDE.md, `await` trong vòng
`for`), **1 nguồn "treo" chặn đứng toàn bộ các mục còn lại** trong cùng 1
lượt xoá hàng loạt — đúng mô tả "cảm giác mất kết nối server".

- **Đã sửa**: bọc `adapter.close(pool)` trong `invalidate()` bằng timeout
  5 giây (`withTimeout()`, hàm mới) — hết hạn thì BỎ QUA (chỉ cảnh báo
  log), không chặn request. Việc xoá khỏi cache (phần quan trọng, đảm bảo
  lần dùng sau kết nối MỚI đúng) đã chạy TRƯỚC, không phụ thuộc bước đóng
  pool cũ — đóng pool cũ chỉ là dọn dẹp tài nguyên tốt-nhất-có-thể, không
  đáng để treo cả thao tác admin đang chờ.
- **Đã kiểm chứng bằng cách dựng lại ĐÚNG lỗi**: giả lập `adapter.close()`
  treo vĩnh viễn (promise không bao giờ resolve) — xác nhận `invalidate()`
  THẬT (không fake logic nghiệp vụ) trả về đúng sau ~5000ms thay vì treo
  mãi mãi.
- **Sửa kèm 1 lỗi liên quan**: xoá "Nguồn dữ liệu" còn Sync Job tham chiếu
  (`etl.SyncJobs.DataSourceId` không có `ON DELETE CASCADE`, cố ý) trước
  đây ném lỗi FK violation THÔ của SQL Server — giờ kiểm tra trước, báo rõ
  tên các Sync Job đang chặn.

## 8.75 — Báo cáo Đơn đặt hàng / Đơn nhập hàng / So sánh đặt–nhận

**Theo yêu cầu người dùng**: "Tôi muốn bạn lấy cho tôi báo cáo đơn đặt
hàng, đơn nhập hàng và báo cáo so sánh giá trị giữa nhập hàng thực và đặt
hàng thực tế của toàn bộ siêu thị" — 3 báo cáo mới dựa trên dữ liệu đơn
hàng DSmart16 (bảng `ST_ORDER`/`ST_ORDER_ARC`, DBA xác nhận), CSDL **trung
tâm** (một nơi chứa đơn hàng mọi siêu thị, không phải mỗi siêu thị 1 CSDL
riêng như domain doanh thu). Chi tiết đầy đủ (nguồn dữ liệu, VIEW mẫu,
thiết kế): `bc-don-dat-hang.md`.

- **Phát hiện quan trọng từ mẫu "Phiếu đặt hàng" thật** (người dùng gửi):
  SL đặt ("Theo đơn") và SL thực nhận ("Thực nhận") nằm **TRÊN CÙNG 1
  DÒNG chứng từ** — `ST_ORDER`/`ST_ORDER_ARC` là **1 nguồn duy nhất** cho
  cả đặt lẫn nhận, KHÔNG phải 2 nguồn phải ghép composite. Nhờ vậy cả 3
  báo cáo dùng CHUNG 1 domain ETL (`don_dat_hang`) và 1 `SourceType` mới
  (`purchaseOrder`), chỉ khác nhau ở cột hiển thị.
- **`rp-server/lib/purchaseOrderRunner.js`** (mới) — tái dùng nguyên
  `lib/reportEngine.js` (filter/cột/công thức), chỉ thêm ĐÚNG 1 việc:
  `Dimensions.MaDiem` đồng bộ từ DSmart16 là mã **STK_ID thô** (CSDL trung
  tâm) — tự tra bảng "Ánh xạ Điểm - STK_ID" (`lib/diemStkMapping.js`, hàm
  mới `buildStkIdLookup()`) để **ghi đè** bằng mã Điểm + tên siêu thị
  CHUẨN của HCRC trước khi trả kết quả, theo đúng yêu cầu người dùng ("vẫn
  dựa vào bảng ánh xạ mã STK để thực hiện"). STK chưa khai ánh xạ bị LOẠI
  khỏi báo cáo (không hiện mã thô lẫn mã chuẩn). `__storeScope` (bản 8.51)
  vẫn áp dụng đúng — người dùng bị giới hạn phạm vi chỉ thấy đơn hàng của
  đúng siêu thị mình.
- **Cột "So sánh đặt–nhận"** dùng công thức có sẵn (`lib/formulaEngine.js`)
  trên CÙNG 1 dòng dữ liệu: Chênh lệch SL, Tỷ lệ hoàn thành (%), Chênh
  lệch giá trị — không cần hạ tầng composite.
- **`etl/scripts/seedDonDatHangSync.js`** (mới) — tạo Sync Job domain
  `don_dat_hang`, `KeepHistory=1` (giữ lịch sử theo ngày — yêu cầu "lấy
  theo ngày cả quá khứ").
- **`rp-server/scripts/seedPurchaseOrderReports.js`** (mới) — tạo 3
  `ReportCatalog` (`bc-don-dat-hang`/`bc-don-nhap-hang`/`bc-so-sanh-dat-nhan`),
  gắn menu "Báo cáo Mua hàng" (`reports-mua-hang`, đã có sẵn).
- **Sửa kèm 1 lỗi thật phát hiện được**: `CK_ReportCatalog_SourceType`
  (`rp-db/schema.sql`) thiếu hẳn 2 giá trị `'stockThreshold'`/`'stockAlert'`
  (bản 8.68) — mọi lần chạy lại `seedStockThresholdReport.js`/
  `seedStockAlertReport.js` trên CSDL đã áp constraint này sẽ bị SQL Server
  từ chối (vi phạm CHECK constraint) — bổ sung đủ cùng lúc với
  `'purchaseOrder'`.
- **Đã kiểm chứng bằng mock** (chưa có CSDL DSmart16 thật để nối): giả lập
  dữ liệu `dwh.ReportFacts` + `etl.DiemStkMapping`, xác nhận ĐÚNG: ghi đè
  mã Điểm/tên siêu thị, loại bỏ dòng có STK chưa khai ánh xạ, công thức so
  sánh tính đúng, VÀ **`__storeScope` cô lập đúng dữ liệu giữa các siêu
  thị khác nhau** (không rò rỉ đơn hàng của siêu thị khác).

**CHƯA CÓ SỐ LIỆU THẬT cho tới khi**: (1) DBA xác nhận đúng tên cột thật
của `ST_ORDER`/`ST_ORDER_ARC` (VIEW trong `bc-don-dat-hang.md` hiện là
**VÍ DỤ**, dùng tên cột phỏng đoán từ mẫu phiếu, CHƯA xác nhận với DBA);
(2) tạo VIEW `dbo.vw_DonDatHangChiNhanh` thật trên DSMART16; (3) chạy
`seedDonDatHangSync.js` + `seedPurchaseOrderReports.js`; (4) gán quyền
xem báo cáo.

## 8.74 — Sửa lỗi captcha đăng nhập hiện rỗng không log (KHẨN)

**Theo yêu cầu người dùng**: báo lỗi khẩn trang đăng nhập report.hcrc.vn —
ô "Mã xác nhận" hiện input + nút refresh nhưng KHÔNG hiện ảnh captcha,
kèm ảnh chụp log PM2 có nhiều lỗi khác (SELECT permission denied trên
`dwh.ReportFacts`/`etl.CoreItemList`, "Invalid object name 'app.SystemLog'",
lỗi SSL gửi email lịch báo cáo).

**Đã xác nhận các lỗi trong log PM2 KHÔNG liên quan tới captcha** — route
`GET /api/auth/captcha` (`rp-server/server.js`) không đụng CSDL nào (chỉ
sinh SVG ngẫu nhiên trong bộ nhớ, xem `rp-server/lib/captcha.js`), các lỗi
đó thuộc về những báo cáo khác (`bc-doanh-thu-hcrc`, `bc-ton-kho-0`...) —
sẽ xử lý riêng.

**Lỗi thật tìm được — lỗi code, không phải do thiếu cấu hình riêng lẻ**:
`src/lib/api.js` (cả 3 app rp-user/etl-admin/api-admin) kiểm tra
`Content-Type` của response nhưng khi KHÔNG phải JSON dù HTTP status vẫn
200 OK (vd rơi vào "SPA fallback" của `serve-static.js` khi thiếu
`PROXY_PREFIX`/`PROXY_TARGET_PORT`, hoặc Nginx trả trang lỗi HTML) —
**âm thầm coi là THÀNH CÔNG** (rp-user: trả về `Blob`; etl-admin/api-admin:
trả về `null`) thay vì báo lỗi. Hậu quả: `CaptchaField.jsx` nhận dữ liệu
rỗng/`undefined`, hiện captcha trống, và vì không có `Error` nào được ném
ra nên **không có dòng log nào cả phía server lẫn console trình duyệt** —
đúng mô tả lỗi "không hiện ảnh, không biết vì sao".

**Đã sửa** (áp dụng đồng nhất cả 3 app):
- `src/lib/api.js`: response không phải JSON → ném `Error` rõ ràng
  (kèm Content-Type thật nhận được) thay vì âm thầm trả về
  `Blob`/`null` coi như thành công.
- `CaptchaField.jsx`: thêm `console.error` khi tải captcha lỗi — trước đây
  `catch` nuốt lỗi hoàn toàn, không log gì.

**Đã kiểm chứng bằng cách dựng lại ĐÚNG lỗi**: mock server trả về
`index.html` (200, `text/html`) cho mọi request `/auth/*` — tái hiện
CHÍNH XÁC giao diện lỗi người dùng chụp gửi (captcha trống, nút refresh
vẫn hiện bình thường); sau khi sửa, lỗi hiện rõ ở console trình duyệt:
`"Phản hồi không phải JSON (Content-Type: text/html...) — kiểm tra cấu
hình proxy /api"` — xác nhận sửa đúng chỗ.

**LƯU Ý QUAN TRỌNG — bản sửa này làm lỗi HIỆN RA RÕ thay vì ẩn đi, chưa
chắc đã tự hết captcha trống** nếu nguyên nhân gốc là do triển khai
"PM2-only" (không Nginx) thiếu biến môi trường `PROXY_PREFIX=/api` +
`PROXY_TARGET_PORT=4001` ở tiến trình `hcrc-rp-user` trong
`deploy/ecosystem.config.js` (xem chú thích trong `deploy/serve-static.js`)
— cần kiểm tra `curl -i https://report.hcrc.vn/api/auth/captcha`: nếu trả
về HTML thay vì JSON, phải sửa đúng 2 biến môi trường này rồi
`pm2 restart hcrc-rp-user`, KHÔNG phải lỗi code.

## 8.73 — Thu hẹp "CA tin cậy": chỉ còn report server

**Theo yêu cầu người dùng**: sau khi bản 8.72 làm "CA tin cậy" cho cả 3 hệ
thống (etl, api-server, rp-server), người dùng chỉ định rõ: "Phần này thì
bạn chỉ cần làm trên report server thôi nhé." — gỡ bỏ HOÀN TOÀN tính năng
này khỏi etl và api-server (backend + UI etl-admin/api-admin), CHỈ giữ lại
ở rp-server/rp-user.

- Xoá `etl/lib/trustedCa.js`, `etl/routes/admin/trustedCa.js`,
  `api-server/lib/trustedCa.js`, `api-server/routes/admin/trustedCa.js` +
  bỏ đăng ký route `/admin/trusted-ca` khỏi `etl/server.js` và
  `api-server/server.js`.
- Gỡ phần "CA tin cậy (cho các cuộc gọi ra ngoài)" khỏi
  `etl-admin/src/pages/TlsCertificatePage.jsx` và
  `api-admin/src/pages/TlsCertificatePage.jsx` — 2 trang này trở lại đúng
  phạm vi bản 8.71 (chỉ upload chứng chỉ TLS cho chính máy chủ đó).
- `rp-server/lib/trustedCa.js`, `rp-server/routes/trustedCa.js`,
  `rp-server/server.js` và
  `rp-user/src/modules/system/tls-certificate/TlsCertificatePage.jsx` GIỮ
  NGUYÊN không đổi — tính năng vẫn hoạt động đầy đủ ở report server như
  bản 8.72.

**Lý do**: etl và api-server là 2 hệ thống nội bộ không cần tự gọi ra các
dịch vụ bên ngoài dùng CA tự tạo; chỉ report server mới có nhu cầu đó
(hiện tại qua `lib/internalApiClient.js` gọi sang api-server và tương lai
có thể gọi ra HCRC Workspace), nên không cần duy trì tính năng này ở cả 3
nơi.

## 8.72 — "CA tin cậy": nhận diện HTTPS của hệ thống khác khi PM2 tự gọi ra ngoài

**Theo yêu cầu người dùng**: sau bản 8.71 (PM2 tự chạy HTTPS), người dùng
hỏi tiếp "khi hệ thống PM2 call API sang hệ thống khác có sử dụng HTTPS
thì hệ thống PM2 của chúng ta cần phải làm gì để nhận diện được? Nếu cần
thì bạn cho một cái giao diện..." — bổ sung CHIỀU NGƯỢC LẠI của bản 8.71:
không chỉ tự trình diện HTTPS khi NGƯỜI KHÁC gọi VÀO, mà còn cần BIẾT TIN
AI khi CHÍNH MÌNH gọi RA (vd rp-server gọi api-server qua
`lib/internalApiClient.js`, bản 8.70, hoặc gọi ra HCRC Workspace) nếu bên
kia dùng HTTPS ký bởi CA nội bộ/tự tạo.

- **`lib/trustedCa.js`** (etl/api-server/rp-server) — dùng
  `tls.setDefaultCACertificates()` (có sẵn từ Node >= 20, không cần gói
  ngoài) để **THÊM** CA admin upload vào danh sách tin cậy MẶC ĐỊNH của cả
  tiến trình — áp dụng NGAY cho MỌI cuộc gọi `fetch()`/`https` tiếp theo,
  **KHÔNG cần restart, KHÔNG cần sửa code ở nơi gọi** (các lib hiện có như
  `internalApiClient.js`/`hcrcWorkspaceClient.js` tự động hưởng lợi vì
  dùng đúng `fetch()` chuẩn của Node). **KHÔNG dùng**
  `rejectUnauthorized:false`/`NODE_TLS_REJECT_UNAUTHORIZED=0` (tắt HẲN
  kiểm tra chứng chỉ, mù quáng tin mọi chứng chỉ kể cả giả mạo) — chỉ
  thêm ĐÚNG 1 CA cụ thể admin đã xác nhận, giữ nguyên kiểm tra cho mọi CA
  khác. Lưu mỗi CA là 1 file `.pem` riêng trong `certs/trusted-ca/`
  (KHÔNG lưu CSDL, cùng tinh thần bản 8.71).
- **Mở rộng trang "Chứng chỉ TLS"** (etl-admin/api-admin/rp-user, không
  tạo trang mới) — thêm phần "CA tin cậy (cho các cuộc gọi ra ngoài)":
  liệt kê CA đã thêm (nhãn, chủ thể, hiệu lực), thêm/xoá CA theo nhãn gợi
  nhớ (vd "HCRC Workspace", "api-server nội bộ") + file `.pem`.

**Đã kiểm chứng bằng chứng chỉ test thật** (phát hiện lỗi thiết kế ban đầu
qua chính quá trình test, sửa trước khi giao): `tls.getCACertificates
('default')` KHÔNG trả về danh sách gốc "sạch" sau lần
`setDefaultCACertificates()` đầu tiên (số lượng đổi khác hẳn) — phải chụp
lại danh sách gốc CHỈ 1 LẦN lúc module nạp rồi dùng CỐ ĐỊNH cho mọi lần
áp dụng sau, nếu không sẽ xây sai danh sách tin cậy qua nhiều lần
thêm/xoá CA mà không có dấu hiệu lỗi rõ ràng. Sau khi sửa: dựng 2 máy chủ
HTTPS giả (chứng chỉ tự ký khác nhau) — xác nhận cả 2 bị từ chối trước
khi thêm; thêm CA 1 → chỉ dịch vụ 1 gọi được (CA 2 vẫn đúng bị từ chối,
không "tin bừa tất cả"); thêm CA 2 → cả 2 gọi được, dịch vụ 1 không bị
ảnh hưởng; xoá CA 1 → dịch vụ 1 bị từ chối lại, dịch vụ 2 vẫn còn; gọi ra
HTTPS công khai thật (`example.com`) vẫn hoạt động bình thường trong suốt
quá trình (không làm hỏng danh sách CA gốc); PEM không hợp lệ bị từ chối
rõ ràng trước khi ghi file.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.72 — CA tin cậy cho cuộc gọi
HTTPS ra ngoài.md`.

## 8.71 — Upload chứng chỉ TLS qua giao diện web cho cả 3 hệ thống (PM2 tự chạy HTTPS)

**Theo yêu cầu người dùng**: "muốn có một cái giao diện để upload
certificate cho các trang ETL, API và report cấu hình trực tiếp trên
giao diện UI khi tôi upload CA, private key và public key lên hệ thống
cho PM2... để cho team IT họ tiện dụng cho việc cấu hình sau này". Chốt
kiến trúc: **mỗi tiến trình PM2 tự chạy HTTPS trực tiếp** bằng chứng chỉ
vừa upload — không cần dựng Nginx riêng, đúng mô hình "PM2-only" đã có
sẵn trong tài liệu triển khai (`deploy/Hướng dẫn triển khai PM2.md`).
Không ảnh hưởng gì tới các hệ thống ĐANG dùng Nginx để lo TLS (tính năng
hoàn toàn tự chọn, mặc định tắt).

- **`lib/tlsServer.js`** (etl/api-server/rp-server) — đọc 3 file
  `certs/{key,cert,ca}.pem` trên đĩa (CA tuỳ chọn, **KHÔNG lưu CSDL** —
  cùng tinh thần Nginx/certbot vốn đã làm từ trước giờ): có đủ file hợp
  lệ → `https.Server`, không có → `http.Server` như cũ (KHÔNG đổi hành vi
  mặc định). Kiểm tra private key KHỚP ĐÚNG public cert bằng
  `tls.createSecureContext()` TRƯỚC khi ghi file — báo lỗi rõ ràng ngay
  nếu sai, không để hỏng TLS lúc có người kết nối thật. Hỗ trợ
  **hot-reload chứng chỉ MỚI không cần restart** (`setSecureContext()`)
  cho các lần gia hạn SAU lần đầu — lần upload ĐẦU TIÊN (chuyển từ HTTP
  sang HTTPS) bắt buộc `pm2 restart` 1 lần (giới hạn của Node, không "nâng
  cấp" 1 http.Server đang chạy thành https.Server được).
- **Trang mới "Chứng chỉ TLS"** ở cả 3 giao diện quản trị (etl-admin,
  api-admin, rp-user → mục riêng ngoài "Hệ thống") — upload 3 file
  (private key + public cert bắt buộc, CA/chain tuỳ chọn), hiện trạng
  thái hiện tại (đang HTTP hay HTTPS, chủ thể/hiệu lực chứng chỉ). **CHỈ
  tài khoản vai trò hệ thống thật mới thấy/dùng được** — KHÔNG đi qua hệ
  thống RoleMenuAccess/app.MenuItems thông thường (không thể giao cho vai
  trò nào khác, nắm private key = giả mạo được chính danh tính TLS của cả
  hệ thống).
- **`deploy/serve-static.js`** (3 giao diện tĩnh) — thêm biến môi trường
  tuỳ chọn `TLS_CERT_DIR` trỏ tới đúng thư mục `certs/` của tiến trình
  backend song sinh, tự chuyển HTTPS nếu có đủ file — tiến trình RIÊNG
  (không chia sẻ bộ nhớ với backend) nên cần `pm2 restart` giao diện khi
  backend áp dụng chứng chỉ mới (không tự hot-reload được qua tiến trình
  khác).
- **Trả lời câu hỏi "làm sao các service nội bộ tin tưởng CA nội bộ của
  nhau khi gọi chéo qua HTTPS"**: dùng biến môi trường CÓ SẴN của Node
  `NODE_EXTRA_CA_CERTS` trỏ tới 1 bản copy file CA — KHÔNG tắt kiểm tra
  chứng chỉ (`rejectUnauthorized:false`/`NODE_TLS_REJECT_UNAUTHORIZED=0`
  nguy hiểm, áp dụng toàn tiến trình) — xem chi tiết ở file deploy riêng.

Đã kiểm chứng bằng chứng chỉ test thật (tạo bằng `openssl`): phát hiện
đúng cặp key/cert không khớp, chuyển HTTP↔HTTPS đúng, hot-reload chứng chỉ
mới không cần restart, `serve-static.js` phục vụ HTTPS thật qua `curl -k`.
Chi tiết đầy đủ: `deploy/Cập nhật bản 8.71 — Upload chứng chỉ TLS qua giao
diện web.md`.

## 8.70 — Upload cảnh báo hàng tồn NGAY trên rp-user (siêu thị tự upload)

**Theo yêu cầu người dùng**: sau bản 8.69 (chặn đúng theo siêu thị cho
etl-admin), người dùng làm rõ mô hình thật — **siêu thị KHÔNG có tài khoản
etl-admin, chỉ người quản trị (HO) mới vào etl-admin**; siêu thị chỉ dùng
rp-user (báo cáo). Người dùng muốn thêm đường upload MỚI: **"cho siêu thị
upload từ report gọi API, report server chặn quyền upload, report server
chỉ cho siêu thị nào upload đúng siêu thị ấy"**, và **"ETL không muốn làm
API"** — chọn hướng api-server tự có API riêng nhận trực tiếp từ rp-server,
ghi thẳng vào CSDL ETL bằng tài khoản etl đã có sẵn (không tạo tài khoản
SQL mới).

- **Trang mới "Upload cảnh báo hàng tồn"** (`rp-user`, menu `stock-alert-
  upload`, ROOT — không nằm trong "Hệ thống" để gán quyền riêng được cho
  vai trò "Siêu thị" mà không cần cấp cả nhóm cấu hình) — người dùng báo
  cáo tự chọn file Excel upload NGAY trên rp-user, hiện rõ "Phạm vi của
  bạn: [tên siêu thị]" trước khi upload.
- **rp-server** (`routes/stockAlertThresholdsUpload.js`) — nhận file, parse
  (`lib/stockAlertThresholdsUpload.js`, cùng định dạng file với etl-admin),
  **TỪ CHỐI HẲN** (400, không ghi gì) nếu file có dòng thuộc siêu thị NGOÀI
  phạm vi dữ liệu (storeScope, bản 8.50/8.51) của người đăng nhập — mirror
  đúng cơ chế bản 8.69. Thêm lại lớp chặn "zip bomb" (`lib/fileSignature.js:
  guardZipBombSize`, mirror etl) — upload mở cho MỌI người dùng báo cáo nên
  càng cần lớp này. `GET /api/me` trả thêm `storeScope` của chính người
  đăng nhập (an toàn để lộ) để trang hiện đúng phạm vi.
- **api-server** — API NỘI BỘ MỚI `POST /internal/stock-alert-thresholds`
  (`routes/internal/stockAlertThresholds.js`), xác thực bằng 1 secret cố
  định dùng chung với rp-server (`INTERNAL_API_SECRET`, KHÔNG phải cơ chế
  HMAC/API key dành cho đối tác ngoài) + IP allowlist tuỳ chọn — nhận dữ
  liệu ĐÃ được rp-server kiểm tra phạm vi, ghi thẳng vào `etl.
  StockAlertThresholds` (CSDL `HCRC_ETL`) qua pool mới `ETL_DB`, **DÙNG
  LẠI Y NGUYÊN tài khoản SQL Server `etl_admin` đã có sẵn trong etl/.env**
  (đã có quyền ghi bảng này) — theo đúng yêu cầu không tạo tài khoản SQL
  mới, không đụng gì vào etl/etl-admin. Logic ghi (REPLACE theo từng
  MaDiem có trong file) mirror đúng bản 8.69.
- `app.MenuItems` (`rp-db/schema.sql`) — thêm mục `stock-alert-upload`.

**2 đường upload giờ chạy song song, cùng ghi 1 bảng** `etl.
StockAlertThresholds`: (1) admin HO upload qua etl-admin (bản 8.68/8.69,
không đổi), (2) siêu thị tự upload qua rp-user (bản 8.70, MỚI) — etl-admin
vẫn thấy đầy đủ dữ liệu từ cả 2 đường, dùng để admin kiểm tra/sửa/xoá tổng
hợp. Chi tiết đầy đủ + cấu hình 2 biến môi trường mới:
`deploy/Cập nhật bản 8.70 — Upload cảnh báo hàng tồn từ rp-user.md`.

## 8.69 — Sửa THIẾU SÓT bản 8.68: chặn đúng theo siêu thị + sửa lỗi import xoá nhầm dữ liệu siêu thị khác

**Theo yêu cầu người dùng**: sau khi xác nhận bản 8.68, người dùng hỏi lại
"siêu thị nào tự upload file của siêu thị đấy đúng không?" — rà soát xác
nhận **ĐÚNG, đây là THIẾU SÓT thật**, gồm 2 lỗi độc lập ở trang etl-admin
"Cảnh báo hàng tồn":

1. **Lỗi nguy hiểm — import "thay hẳn" TOÀN BẢNG**:
   `etl/lib/stockAlertThresholdsImport.js:replaceStockAlertThresholds()`
   `DELETE FROM etl.StockAlertThresholds` KHÔNG lọc điều kiện gì trước khi
   ghi lại — 1 siêu thị upload file của MÌNH sẽ XOÁ SẠCH ngưỡng cảnh báo
   đã khai của MỌI siêu thị khác. **Đã sửa**: REPLACE THEO TỪNG MaDiem CÓ
   xuất hiện trong file đang upload (mirror đúng
   `coreItemListImport.js:replaceCoreItemList()` — scoped theo LoaiDiem),
   ngưỡng của các siêu thị KHÁC không có trong file giữ nguyên. File 0
   dòng dữ liệu giờ KHÔNG LÀM GÌ (trước đây xoá sạch toàn bộ danh sách —
   bỏ hẳn cơ chế "confirmEmpty" cũ, không còn cần thiết vì không còn khái
   niệm "xoá sạch qua upload"; muốn xoá 1 siêu thị, dùng nút "Xoá N mục đã
   chọn" đã có sẵn — bản 8.62).
2. **Thiếu hẳn phân quyền theo siêu thị cho etl-admin** (etl-admin TRƯỚC
   GIỜ chỉ có phân quyền theo MENU/vai trò — admin.RoleMenuAccess — CHƯA
   từng có khái niệm "tài khoản này chỉ được thấy siêu thị X", khác hẳn
   rp-user đã có từ bản 8.50/8.51 qua `app.UserStoreAccess`). **Đã thêm
   MỚI, mirror đúng tinh thần rp-user**:
   - `admin.AdminUserStoreAccess(AdminUserId, MaDiem)` (`etl-db/schema.sql`)
     — không có dòng nào = "Toàn bộ" (HO/vai trò hệ thống luôn bỏ qua bảng
     này, xem hết), có dòng = CHỈ xem/sửa/xoá/upload đúng (các) siêu thị
     đó.
   - `etl/lib/adminPermissions.js:loadContext()` — nạp thêm `storeScope`
     (null = Toàn bộ, mảng MaDiem = giới hạn), gắn sẵn vào
     `req.adminContext` qua `requireMenuAccess`/`requireMenuEdit` như
     `isSystemRole`/`menuAccess` đã có.
   - `PUT /admin/users/:id/stores` (`etl/routes/admin/users.js`) — gán
     phạm vi siêu thị cho 1 tài khoản, thao tác NHẠY CẢM
     (`requireSystemRoleActor`, giống `/:id/roles`) để tránh 1 tài khoản
     tự mở rộng phạm vi của chính mình. `GET /admin/users/store-options`
     — danh sách mã Điểm để chọn (đọc `etl.DiemStkMapping`).
   - Trang "Phân quyền" (`etl-admin/src/pages/UsersPage.jsx`) — thêm cột
     "Phạm vi siêu thị" + nút "Gán siêu thị" (modal chọn nhiều, chỉ
     `isSystemRole` thấy nút, giống "Gán vai trò").
   - `etl/routes/admin/stockAlertThresholds.js` — áp `storeScope`: `GET /`
     và `GET /export` chỉ trả dòng trong phạm vi; `DELETE /:id` trả 404
     (không lộ thông tin) nếu dòng ngoài phạm vi; `POST /import` TỪ CHỐI
     HẲN (400, không ghi gì) nếu file có MaDiem ngoài phạm vi của người
     upload, thay vì âm thầm bỏ qua hoặc âm thầm cho qua.

Đã demo xác nhận giao diện cột "Phạm vi siêu thị" + modal "Gán siêu thị"
trên trang Phân quyền. Chi tiết đầy đủ + bước triển khai: `deploy/Cập nhật
bản 8.69 — Chặn đúng theo siêu thị cho Cảnh báo hàng tồn.md`.

## 8.68 — Báo cáo tồn kho theo ngưỡng + Cảnh báo hàng tồn

**Theo yêu cầu người dùng**: thêm 2 báo cáo tồn kho mới, giống báo cáo
hàng tuần siêu thị đang làm tay — phân biệt siêu thị theo "Ánh xạ Điểm -
STK_ID" đã có sẵn, áp dụng "Phạm vi dữ liệu" (bản 8.50/8.51) để nhân sự
từng siêu thị chỉ xem đúng siêu thị đó, HO xem toàn bộ. Đã demo xác nhận
giao diện trước khi code phần CSDL/backend.

- **"Tồn kho theo ngưỡng"** (`bc-ton-kho-nguong`, `SourceType=
  'stockThreshold'`, `rp-server/lib/stockThresholdRunner.js`) — người xem
  TỰ CHỌN chiều lọc (Tồn dưới/Tồn trên) VÀ tự nhập mức ngay trên bộ lọc
  (mặc định "Tồn dưới 1" — tương đương "không còn hàng"), không cần sửa
  cấu hình/deploy lại mỗi lần đổi mức muốn xem. Thêm filter kind MỚI dùng
  chung mọi báo cáo: `'thresholdNumber'`
  (`rp-user/src/components/FilterForm.jsx`).
- **"Cảnh báo hàng tồn"** (`bc-canh-bao-ton`, `SourceType='stockAlert'`,
  `rp-server/lib/stockAlertRunner.js`) — admin upload file Excel khai
  NGƯỠNG RIÊNG cho từng cặp (Mã hàng, Siêu thị) — khác báo cáo trên (1
  ngưỡng chung) — qua trang etl-admin MỚI "Cảnh báo hàng tồn"
  (`etl.StockAlertThresholds`, menu code `stock-alert-thresholds`). Thông
  tin mỗi dòng: Mã hàng, Tên hàng, Nhà cung cấp, Siêu thị, Ngưỡng cảnh báo
  — **"Nhà cung cấp" THUẦN THÔNG TIN admin tự gõ khi khai ngưỡng, KHÔNG
  phải dữ liệu đồng bộ** (hệ thống hiện chưa đồng bộ dữ liệu nhà cung cấp
  thật từ nguồn nào).
- `rp-server/lib/diemStkMapping.js` — thêm `resolveStoreScopeStkIds()` áp
  "Phạm vi dữ liệu" cho 2 báo cáo mới (lọc theo MaChiNhanh/STK_ID — 2 báo
  cáo tồn kho=0 cũ KHÔNG áp dụng cơ chế này, ngoài phạm vi bản 8.68).

**KHÔNG CẦN VIEW MỚI NÀO** — dùng LẠI NGUYÊN VẸN đúng 2 domain
`banhang_sku`/`tonkho_sku` đã có cho báo cáo "Top bán chạy đang tồn kho =
0" (`bc-ton-kho-0.md`) — đã làm báo cáo đó rồi thì 2 báo cáo mới CÓ SỐ
LIỆU NGAY, không cần DBA làm gì thêm ở nguồn. Chi tiết đầy đủ (gồm lại 2
VIEW đó cho tiện, phòng trường hợp chưa từng làm): `deploy/Cập nhật bản
8.68 — Báo cáo tồn kho theo ngưỡng + Cảnh báo hàng tồn.md`.

## 8.67 — Sửa THIẾU SÓT: SMTP (Postfix/Exchange/Gmail) chưa hỗ trợ chứng chỉ TLS tự ký

**Theo yêu cầu người dùng**: Postfix của người dùng dùng chứng chỉ TLS
**TỰ KÝ** (không do CA công khai xác thực) — yêu cầu kiểm tra lại xem cơ
chế gửi email đã đáp ứng chưa. **Rà soát xác nhận ĐÚNG — đây là THIẾU
SÓT thật**: nhánh EWS (bản 8.65) đã có `EwsInsecureTls`, nhưng nhánh SMTP
(Postfix/Exchange qua SMTP/Gmail, dùng NHIỀU hơn) KHÔNG có cờ tương đương
— `nodemailer` mặc định LUÔN kiểm tra chứng chỉ qua danh sách CA công
khai, từ chối thẳng chứng chỉ tự ký ("self signed certificate"), khiến
gửi thất bại dù host/port/mật khẩu đều đúng. **Đã kiểm chứng bằng test
thật** (dựng máy chủ SMTPS giả dùng chứng chỉ tự ký): trước khi sửa báo
lỗi "self-signed certificate" đúng như dự đoán, sau khi sửa gửi được.

- `app.EmailSettings` (`rp-db/schema.sql`): thêm cột `SmtpInsecureTls`
  (mặc định `0` — vẫn kiểm tra chứng chỉ bình thường, không tự ý nới lỏng
  cấu hình đang chạy).
- `rp-server/lib/mailer.js`: nhánh SMTP truyền thêm
  `tls: { rejectUnauthorized: !row.SmtpInsecureTls }` vào `nodemailer`.
- `etl/lib/mailer.js` + `etl/.env.example`: thêm biến `SMTP_INSECURE_TLS`
  (mặc định `false`), cùng cơ chế cho email cảnh báo lỗi đồng bộ/đổi cấu
  trúc CSDL của ETL (đúng kênh SMTP có thể trỏ tới CÙNG Postfix nội bộ).
- `rp-user/.../EmailSettingsPage.jsx`: thêm checkbox **"Bỏ qua kiểm tra
  chứng chỉ TLS"** ở form SMTP (song song checkbox đã có cho EWS), hint
  preset Postfix nhắc rõ: BẮT BUỘC tick ô này nếu Postfix dùng chứng chỉ
  tự ký.

Đã demo xác nhận checkbox hiện đúng ở form SMTP (preset Postfix). Không
ảnh hưởng gateway dùng chứng chỉ CA công khai hợp lệ (Gmail, Exchange
Online...) — mặc định vẫn kiểm tra chứng chỉ như trước.

## 8.66 — Thêm preset Gmail, giữ đủ 4 phương thức SMTP/EWS trong "Thiết lập email"

**Theo yêu cầu người dùng**: hỏi thêm cấu hình Gmail + nhắc giữ lại lựa
chọn "Exchange — đăng nhập qua SMTP cổng 587" (đã có sẵn từ bản 8.65,
không bị gỡ) trong danh sách lựa chọn.

- `rp-user/.../EmailSettingsPage.jsx`: thêm preset **"Gmail — đăng nhập
  qua SMTP (cổng 587)"** — tự điền `smtp.gmail.com`/587/bỏ Secure, kèm ghi
  chú: Gmail **bắt buộc bật "Xác minh 2 bước"** rồi tạo **"Mật khẩu ứng
  dụng"** (App password, 16 ký tự, tại myaccount.google.com/apppasswords)
  dùng làm Password — Google đã chặn mật khẩu đăng nhập Gmail thường cho
  SMTP từ ứng dụng ngoài, giống cơ chế MFA/App password của Exchange
  Online.
- Dropdown "Loại email gateway" giờ có đủ **5 lựa chọn**: Tuỳ chỉnh /
  Postfix (không đăng nhập) / Exchange qua SMTP (587) / Gmail qua SMTP
  (587) / Exchange tại chỗ qua EWS — không bớt lựa chọn nào đã có.

Thuần frontend, không đổi CSDL/backend (Gmail dùng chung nhánh `Protocol
= 'smtp'` đã có từ bản 8.65, không cần thêm code gửi riêng). Đã demo xác
nhận đủ 5 lựa chọn trong dropdown + Gmail tự điền đúng.

## 8.65 — Gửi email qua Exchange bằng EWS (API riêng, không qua SMTP)

**Theo yêu cầu người dùng**: Postfix của người dùng là relay nội bộ,
KHÔNG cần đăng nhập — Exchange (CÀI TẠI CHỖ) thì BẮT BUỘC xác thực
username/password, và người dùng muốn "cơ chế access trực tiếp vào
mailbox để gửi" — đã hỏi lại, xác nhận đây là **Exchange Web Services
(EWS)**, dùng cho Exchange **tại chỗ (on-premise)** (đã lưu ý với người
dùng: EWS với Basic Auth username/password **KHÔNG dùng được cho Exchange
Online/Office 365** — Microsoft đã chặn từ cuối 2022, chỉ còn OAuth2/
Microsoft Graph, ngoài phạm vi bản này).

- `rp-server/lib/ewsMailer.js` (MỚI): tự dựng request SOAP bằng module
  `https` gốc của Node (không thêm thư viện ngoài) — gửi mail KHÔNG đính
  kèm dùng 1 lượt gọi `CreateItem` (`MessageDisposition=SendAndSaveCopy`);
  gửi CÓ đính kèm (vd "Lịch gửi email báo cáo" kèm file Excel/PDF) cần 3
  lượt: `CreateItem` (SaveOnly, lưu nháp) → `CreateAttachment` cho từng
  file (lấy lại `ChangeKey` MỚI NHẤT của nháp — bắt buộc, dùng `ChangeKey`
  cũ sẽ bị EWS từ chối) → `SendItem` (gửi thật bản nháp đã đính đủ file).
  Đọc thêm `ResponseClass`/`ResponseCode` trong XML trả về — EWS báo lỗi
  NGHIỆP VỤ (sai mailbox/thiếu quyền...) vẫn kèm HTTP 200 bình thường,
  không đọc thêm sẽ tưởng gửi thành công dù thất bại.
- `app.EmailSettings` (`rp-db/schema.sql`): thêm cột `Protocol` ('smtp' —
  mặc định, giữ nguyên hành vi cũ — hoặc 'ews'), `EwsUrl` (URL EWS đầy đủ,
  vd `https://mail.noibo.local/EWS/Exchange.asmx`), `EwsInsecureTls` (bỏ
  qua kiểm tra chứng chỉ TLS — cho máy chủ Exchange nội bộ dùng chứng chỉ
  tự ký, mặc định TẮT).
- `rp-server/lib/mailer.js`: `sendMail()` rẽ nhánh theo `Protocol` — 'ews'
  gọi `ewsMailer.js` (bỏ qua mọi field `Smtp*`), 'smtp' dùng `nodemailer`
  như cũ. MỌI nơi gọi `sendMail()` (Gửi thử, Lịch gửi email báo cáo, Cảnh
  báo bất thường) tự động hoạt động với cả 2 giao thức, không cần sửa gì
  thêm ở từng nơi gọi.
- `rp-user/.../EmailSettingsPage.jsx`: dropdown "Loại email gateway" có
  thêm lựa chọn "Exchange tại chỗ — API EWS" — chọn vào chuyển hẳn form
  sang EWS URL + checkbox "Bỏ qua kiểm tra chứng chỉ TLS", thay vì
  host/port/Secure của SMTP; giữ nguyên preset Postfix (không đăng nhập)
  và Exchange qua SMTP AUTH làm 2 lựa chọn khác.

Đã demo xác nhận: chọn "Postfix" vẫn ra đúng form SMTP không đổi (không
regress); chọn "Exchange tại chỗ — API EWS" chuyển đúng sang form EWS.
Không ảnh hưởng cấu hình SMTP đang chạy ổn (`Protocol` mặc định 'smtp' khi
nâng cấp, hành vi cũ giữ nguyên 100% cho tới khi admin TỰ chọn đổi sang
EWS).

## 8.64 — Gợi ý cấu hình theo loại email gateway (Postfix/Exchange) + tương thích Exchange

**Theo yêu cầu người dùng**: ngoài Postfix (bản 8.63), người dùng còn có 1
hệ thống gửi email qua Exchange, xác thực bằng username/mật khẩu — yêu cầu
rà soát tương thích + cho phép dễ dàng chọn/đổi qua lại giữa các loại
gateway lúc cấu hình.

- `rp-user/src/modules/system/email-settings/EmailSettingsPage.jsx`: thêm
  dropdown "Loại email gateway" — chọn 1 trong 4: Tuỳ chỉnh / Postfix
  (SMTPS, cổng 465) / Exchange Online-Office 365 (STARTTLS, cổng 587, tự
  điền `smtp.office365.com`, ghi chú dùng "Mật khẩu ứng dụng" nếu tài
  khoản bật MFA) / Exchange tại chỗ (STARTTLS, cổng 587). Chọn 1 loại CHỈ
  điền sẵn gợi ý host/port/Secure — mọi ô vẫn sửa tay được bình thường,
  không khoá field nào, không thêm cột CSDL mới (preset chỉ là gợi ý phía
  giao diện).
- `rp-server/lib/mailer.js` và `etl/lib/mailer.js`: thêm `requireTLS` khi
  gateway dùng cổng không mã hoá ngay từ đầu (vd 587/25) NHƯNG có khai
  Username/mật khẩu thật — bắt buộc STARTTLS nâng cấp mã hoá TRƯỚC khi gửi
  thông tin đăng nhập, tránh âm thầm gửi mật khẩu dạng chữ thường nếu
  gateway lỡ không chào STARTTLS. Exchange Online/Office 365 vốn luôn từ
  chối xác thực không mã hoá nên không đổi hành vi gateway đó, chỉ thêm 1
  lớp an toàn rõ ràng, đúng cho cả Postfix THƯỜNG (không phải SMTPS 465)
  lẫn Exchange — xác nhận tương thích cơ chế xác thực
  username/mật khẩu chuẩn (`nodemailer` tự thương lượng đúng cơ chế AUTH
  server hỗ trợ, không cần cấu hình thêm).

Đã demo xác nhận: chọn "Postfix" → tự điền 465 + tick Secure; chọn
"Exchange Online / Office 365" → tự điền `smtp.office365.com`, 587, bỏ
Secure, hiện ghi chú MFA. Không đổi CSDL, không ảnh hưởng cấu hình đang
chạy ổn (preset không tự ý ghi đè ô đã có giá trị, trừ ô port/Secure theo
đúng loại gateway vừa chọn).

## 8.63 — Sửa gửi email tương thích cổng 465 (Postfix)

**Theo yêu cầu người dùng**: email gateway thật dùng Postfix, cổng 465 —
hệ thống chưa gửi được email qua gateway này. Nguyên nhân: cổng 465 bắt
buộc bật TLS NGAY TỪ ĐẦU kết nối (SMTPS), khác cổng 587/25 (STARTTLS, bắt
đầu không mã hoá rồi mới nâng cấp) — thiếu cờ `secure:true` đúng cho cổng
465 là lỗi phổ biến nhất khiến `nodemailer` không gửi được, dù host/port/
mật khẩu đều đúng.

- `etl/lib/mailer.js` (cảnh báo lỗi đồng bộ + cảnh báo đổi cấu trúc CSDL,
  cấu hình qua `.env`): tự nhận `secure=true` khi `SMTP_PORT=465` và
  `SMTP_SECURE` CHƯA khai rõ trong `.env` — admin chỉ cần đổi đúng
  `SMTP_PORT=465`, không cần nhớ khai thêm `SMTP_SECURE=true`. Vẫn tôn
  trọng `SMTP_SECURE=true`/`false` nếu đã khai rõ ràng (không đổi hành vi
  cấu hình cũ đang chạy ổn với cổng 587).
- `rp-server/lib/mailer.js` (dùng chung cho "Thiết lập email" → nút "Gửi
  thử", "Lịch gửi email báo cáo", "Cảnh báo bất thường" — cấu hình qua
  giao diện, lưu CSDL `app.EmailSettings`): ÉP `secure=true` khi
  `SmtpPort=465`, bất kể checkbox "Secure" đã lưu trước đó — không có
  gateway SMTP thật nào dùng cổng 465 ở chế độ không mã hoá, nên ép an
  toàn theo cổng thay vì phụ thuộc người dùng nhớ tick đúng checkbox.
- `rp-user/src/modules/system/email-settings/EmailSettingsPage.jsx`: gõ
  cổng `465` tự tick sẵn "Secure" (gợi ý đúng giá trị THẬT sẽ dùng lúc
  gửi) + hiện ghi chú giải thích ngay dưới checkbox.

**KHÔNG áp dụng cho `api-server`** — rà soát xác nhận `api-server` KHÔNG
có tính năng gửi email nào (trang "Trạng thái kết nối" chỉ hiển thị, không
gửi cảnh báo qua email) — đúng yêu cầu người dùng "hệ thống nào có email
mới gửi được không thì thôi" (bỏ qua hệ thống chưa có email).

Đã demo xác nhận: `rp-user` → "Thiết lập email" gõ cổng 465 → checkbox
"Secure" tự tick + hiện ghi chú. Không đổi CSDL, không ảnh hưởng cấu hình
SMTP cổng 587/25 đang chạy ổn.

## 8.62 — Chọn nhiều dòng + xoá hàng loạt (toàn hệ thống)

**Theo yêu cầu người dùng**: ở các trang danh sách dạng bảng (Nguồn dữ
liệu, Đồng bộ, Vai trò, Ánh xạ Điểm↔STK_ID...), muốn xoá nhiều dòng phải
bấm "Xoá" + xác nhận từng dòng một — chậm, dễ bỏ sót khi cần dọn nhiều (vd
nhiều siêu thị/job đồng bộ cùng lúc). Yêu cầu thêm checkbox chọn nhiều
dòng + 1 nút xoá hàng loạt, áp dụng cho **TOÀN BỘ bảng có nút "Xoá" từng
dòng ở cả 3 giao diện** (rp-user, etl-admin, api-admin), và trở thành
**quy tắc bắt buộc cho mọi bảng làm thêm sau này** (đã ghi vào `CLAUDE.md`
ở gốc repo, cùng mục với quy tắc khoá nút bản 8.60).

**Hạ tầng dùng chung** (1 bộ, không viết riêng từng trang) — ở cả 3 app:
- `src/lib/useRowSelection.js` — hook quản lý tập ID dòng đang chọn
  (`selectedIds`, `toggle`, `toggleAll`, `isSelected`, `clear`).
- `src/components/DataTable.jsx` — nhận thêm prop tuỳ chọn `selection`, tự
  vẽ cột checkbox đầu bảng (gồm "chọn tất cả" ở header); không truyền thì
  bảng vẽ như cũ, không ảnh hưởng nơi khác.

Nút "Xoá N mục đã chọn" gọi LẶP LẠI đúng API xoá 1 dòng đã có sẵn của từng
trang (không thêm API "xoá theo danh sách" riêng — theo lựa chọn của
người dùng, ưu tiên triển khai nhanh, ít đổi backend) và tuân thủ ĐÚNG quy
tắc khoá nút bản 8.60 (tự khoá + đổi chữ "Đang xoá..." trong lúc xử lý).

**21 trang đã áp dụng** (mỗi trang chỉ thêm checkbox + nút xoá hàng loạt,
KHÔNG đổi nút "Xoá" từng dòng đã có): etl-admin (Đồng bộ, Nguồn dữ liệu,
Vai trò, Danh sách hàng Core, Ánh xạ Điểm↔STK_ID), api-admin (Nguồn dữ
liệu, Endpoint realtime đọc/ghi, Báo cáo, Đối tác, Vai trò), rp-user (Vai
trò, Danh mục, Lịch gửi email, Cảnh báo bất thường, Ánh xạ phòng/cửa
hàng, và 5 bảng trong "Danh mục báo cáo": Nguồn dữ liệu, Kết nối ngoài,
Kết nối API, Dashboard, Báo cáo).

**1 trang không áp dụng**: `rp-user` → Báo cáo đã lưu (Adhoc) — danh sách
này không vẽ bằng `DataTable` (dạng khác, không phải bảng nhiều dòng), để
nguyên như cũ.

**Lưu ý đã biết (không chặn dùng)**: vai trò hệ thống (không xoá được, nút
"Xoá" từng dòng đã ẩn sẵn) vẫn có checkbox ở bảng Vai trò (DataTable chưa
có cơ chế ẩn checkbox riêng 1 dòng) — nếu lỡ chọn kèm vai trò hệ thống rồi
bấm xoá hàng loạt, server chặn đúng như xoá từng dòng, báo lỗi rõ ràng,
không xoá nhầm.

## 8.61 — Điền đủ 34 siêu thị thật vào script tạo Nguồn dữ liệu + Sync Job (Thành viên)

**Theo yêu cầu người dùng**: thay vì nhập 2 file Excel (Nguồn dữ liệu +
Sync Job) qua giao diện etl-admin như cách đã làm trước đó, người dùng gửi
file Excel "Nguồn dữ liệu" thật (34 siêu thị, mỗi dòng Name/Server/
DatabaseName/Username/Password/Engine/Port/Encrypt/TrustServerCert) và yêu
cầu điền thẳng vào `etl/scripts/seedThanhVienLiveSync.js` (script đã có
sẵn từ bản 8.15, trước đây chỉ là bản mẫu với giá trị `CHANGE_ME`) để chạy
1 lệnh là tạo xong cả 34 Nguồn dữ liệu + 68 Sync Job Live (Doanh thu +
Giao dịch).

- `STORES` điền đủ 34 dòng thật (tên + Server/IP đúng theo file Excel).
- **Port dùng CHUNG 1 giá trị cố định `1433`** cho mọi siêu thị (theo yêu
  cầu riêng của người dùng) — KHÔNG dùng cột Port riêng từng dòng trong
  file Excel gốc (file Excel có port khác nhau từng dòng, nhưng hạ tầng
  thật của người dùng chỉ dùng 1 port cố định).
- Username/Password/DatabaseName/Encrypt/TrustServerCert dùng chung 1 giá
  trị (khớp đúng mọi dòng trong file Excel).
- Bỏ đoạn kiểm tra "còn CHANGE_ME thì dừng lại" (không cần nữa vì danh
  sách đã là dữ liệu thật).

**CẢNH BÁO BẢO MẬT (người dùng đã được thông báo và xác nhận chấp nhận)**:
khác với quy ước đã áp dụng cho 2 file Excel tương tự trước đó (không lưu
Git vì chứa mật khẩu thật) — người dùng YÊU CẦU RÕ RÀNG commit file này
nguyên văn (kèm mật khẩu CSDL thật dạng chữ thường) vào Git. Đã hỏi lại
xác nhận trước khi làm, người dùng xác nhận "Có — commit nguyên văn kể cả
mật khẩu thật". **Khuyến nghị: đổi lại mật khẩu CSDL thật ở cả 34 máy chủ
sau khi đã chạy script này**, vì mật khẩu hiện đã nằm vĩnh viễn trong lịch
sử Git của repo.

**Các bước triển khai:** `cd etl && node scripts/seedThanhVienLiveSync.js`
— BẮT BUỘC đã hoàn tất Bước 1 ("báo cáo doanh thu thành viên.md" — tạo
VIEW tại cả 34 máy chủ) trước đó, thiếu VIEW ở siêu thị nào thì Sync Job
của đúng siêu thị đó bị bỏ qua (có log rõ ràng, an toàn chạy lại nhiều
lần). Sau đó chạy tiếp (nếu chưa chạy lần nào)
`node rp-server/scripts/seedLdtdHcrcReports.js` và
`node rp-server/scripts/seedThanhVienReportPermissions.js`.

## 8.60 — Khoá nút + đổi màu lúc đang gửi dữ liệu lên server (toàn hệ thống)

**Theo yêu cầu người dùng**: trong lúc thử nút "Chạy thử" (trang Đồng bộ),
người dùng nhận thấy nút không phản ứng rõ ràng khi bấm — lo ngại người
dùng bấm lại nhiều lần liên tiếp ("ấn điên") trước khi yêu cầu trước xong,
gây gửi trùng nhiều yêu cầu lên server. Yêu cầu: mọi nút bấm gửi dữ liệu
lên server phải tự khoá (không bấm lại được) + đổi màu rõ rệt trong lúc
đang xử lý, cho tới khi xong — áp dụng cho **TOÀN BỘ hệ thống** (rp-user,
etl-admin, api-admin), và trở thành **quy tắc bắt buộc cho mọi nút làm
thêm sau này** (đã ghi vào `CLAUDE.md` ở gốc repo).

Thay đổi:
- Thêm rule CSS `button:disabled` (nền + viền xám `--line`, chữ xám
  `--ink-soft`, con trỏ `not-allowed`) vào cả 3 file `styles.css` — trước
  đây 1 nút `disabled` vẫn hiện y hệt màu accent bình thường, không phân
  biệt được bằng mắt.
- Rà soát TOÀN BỘ 3 giao diện (43 file có gọi `api.get/post/put/del` khi
  bấm nút) — thêm `useState` khoá (boolean cho nút đơn, theo ID dòng cho
  nút lặp trong bảng) + đổi chữ "Đang..." cho MỌI nút còn thiếu, dùng
  chung 1 mẫu đã có sẵn trong code (`ConnectionStatusPage.jsx`,
  `ReportCatalogPanel.jsx`). Nút lặp trong bảng dùng ID DÒNG đang xử lý
  (không dùng 1 cờ chung) — bấm "Chạy thử" ở 1 dòng không khoá nhầm nút
  khác CÙNG dòng hay bất kỳ dòng nào khác.
- `finally` LUÔN xoá cờ khoá kể cả khi lỗi — tránh khoá nút vĩnh viễn.
- Không đổi hành vi/API nào ở backend — thuần UI.

**Các bước triển khai:** `cd etl-admin && npm run build`, `cd api-admin
&& npm run build`, `cd rp-user && npm run build`, copy `dist/` mới cho cả
3 giao diện. Không đổi backend, không cần restart service nào.

## 8.59 — Tự thử lại khi mất kết nối nguồn lúc đồng bộ

**Theo yêu cầu người dùng**: sau sự cố thật (04/10/2026) — vài chi nhánh
("Thành viên") mất kết nối mạng, job Live báo lỗi liên tục mỗi 2 phút ("Lỗi
đồng bộ: operation timed out", "Lỗi kết nối nguồn #N: Failed to connect
to..."). Người dùng đề xuất: nếu quá thời gian mà job vẫn chưa đồng bộ
được thì tự thử lại cho tới khi thành công, thay vì bỏ cuộc ngay rồi đợi
đúng lịch đã đặt mới thử lại — đã phân tích phương án, xác nhận: KHÔNG thử
lại vô hạn (rủi ro nếu 1 chi nhánh mất mạng thật sự nhiều giờ/ngày), mà
thử lại nhanh dần có giới hạn (backoff, tối đa 10 phút/lượt).

Thay đổi (`etl/jobs/runSync.js` + `etl/jobs/scheduler.js` +
`etl/routes/admin/syncJobs.js`):

- Lỗi **kết nối** (mạng/timeout tới nguồn) khi job đang chạy nền theo lịch
  cron → tự thử lại NGAY, khoảng cách tăng dần 15s → 30s → 60s → 120s
  (giữ 120s/lần sau đó), trong tối đa **10 phút**. Hết 10 phút vẫn lỗi mới
  thật sự ghi nhận THẤT BẠI (như cũ) — lịch cron gốc của job (vd mỗi 2
  phút) tự động tiếp tục bình thường ở lượt kế tiếp, không cần canh giờ gì
  thêm.
- CHỈ thử lại lỗi **kết nối** (mạng/timeout) — KHÔNG thử lại lỗi do cấu
  hình sai (vd thiếu cột VIEW, sai cú pháp SQL) vì loại lỗi này không tự
  hết, thử lại chỉ phí thời gian.
- Việc thử lại xảy ra **TRƯỚC** khi giữ khoá chống chạy chồng (sp_getapplock)
  — tránh chiếm dụng kết nối CSDL nội bộ (pool `ADMIN`) suốt 10 phút nếu
  nhiều chi nhánh cùng mất kết nối 1 lúc.
- Nút **"Chạy thử"** (etl-admin, admin bấm và đang chờ ngay trên trình
  duyệt) **KHÔNG áp dụng retry** — vẫn báo lỗi ngay như trước, tránh bắt
  admin chờ tới 10 phút mới thấy kết quả.
- KHÔNG áp dụng cho job nền "Trạng thái kết nối" (bản 8.57) — trang đó cố
  ý cần biết NGAY nguồn nào mất kết nối tại đúng thời điểm kiểm tra.
- Chỉ ghi log (Nhật ký hệ thống) khi phải thử lại — KHÔNG gửi thêm email/
  cảnh báo nào mới; email cảnh báo cũ chỉ gửi khi THẬT SỰ bỏ cuộc sau 10
  phút (giữ nguyên hành vi cũ, không tăng số lượng cảnh báo).

Không đổi cấu trúc CSDL, không ảnh hưởng job đang chạy ổn định (chỉ job
đang lỗi kết nối mới thấy khác biệt).

## 8.58 — Đổi màu 4 báo cáo doanh thu cuối ngày LDTD/HCRC theo mẫu BRGMART

**Theo yêu cầu người dùng**: "làm màu báo cáo doanh thu cuối ngày HCRC,
LDTD (Thành viên) giống y hệt kiểu màu sắc" 1 file PDF mẫu BRGMART người
dùng gửi, nhưng "báo cáo nhìn sắc, mỏng chuyên nghiệp hơn" (xem demo ảnh
đã gửi, người dùng xác nhận "Ok, màu đẹp rồi"). Áp dụng ĐỒNG THỜI cả 3 nơi
hiển thị (bảng xem trên web, xuất Excel, xuất PDF — dùng chung
`rp-server/lib/reportCellFormat.js`/`rp-user/src/lib/reportGroupColors.js`),
cho ĐỦ 4 báo cáo dùng chung 1 `buildDefinition()`: "Doanh thu cuối ngày
LDTD"/"HCRC" (gốc + "(Thành viên)"). Không có báo cáo "HO" nào khác trong
hệ thống cần áp màu (đã xác nhận lại với người dùng).

Thay đổi cụ thể:
- Đổi mã màu nhóm cột đúng theo file mẫu (lấy mẫu pixel trực tiếp từ PDF):
  xanh lá = Doanh thu, cam đất = Lãi gộp, vàng gold = Giao dịch, tím =
  2 cột đơn lẻ "Trung bình GD"/"Doanh thu/m2" (MỚI — trước đây 2 cột này
  không có màu) — đã giảm độ bão hoà ~15-20% so với file mẫu gốc cho đỡ
  chói, "chuyên nghiệp hơn".
- Dòng "Tổng cộng"/"Tổng cộng MART"/"Tổng cộng MINIMART" giờ tô màu THEO
  TỪNG CỘT (cột nào giữ màu của nhóm cột đó) thay vì 1 màu tím phẳng như
  trước — đúng file mẫu; dòng Tổng cộng TOÀN báo cáo (cuối bảng) tô riêng
  1 màu xanh dương đồng nhất cho mọi cột.
- Thêm xen kẽ màu (zebra) nhẹ cho các dòng dữ liệu thường — CHỈ áp dụng
  báo cáo có `columnGroups` (4 báo cáo trên), không đổi giao diện các
  bảng/báo cáo khác trong hệ thống.
- Viền bảng Excel/PDF đổi sang màu xám nhạt (khớp đúng màu viền nhẹ đang
  dùng ở bảng web) thay vì xám đậm trước đây — "mỏng" hơn, đồng nhất cả 3
  nơi xuất.
- Thêm cơ chế mới `definition.standaloneColumnColors` (tô màu HEADER 1 cột
  đơn lẻ không thuộc `columnGroups` nào, không vẽ thêm dòng tiêu đề nhóm
  phía trên — khác hẳn `columnGroups`).

**Các bước triển khai:** xem chi tiết ở
`deploy/Cập nhật bản 8.58 — Đổi màu báo cáo doanh thu cuối ngày theo mẫu BRGMART.md`.
BẮT BUỘC chạy lại `node scripts/seedLdtdHcrcReports.js` sau khi `git pull`
— code mới KHÔNG tự áp dụng vào báo cáo đang chạy nếu không seed lại.

## 8.57 — Trạng thái kết nối + Giám sát cấu trúc CSDL

**Theo yêu cầu người dùng**: 2 tính năng mới cho `etl-admin`/`api-admin`
(demo đã gửi, người dùng xác nhận "Ok, làm luôn đi"):

1. **"Trạng thái kết nối"** (trang mới, cả 2 giao diện) — xem NGAY nguồn
   dữ liệu nào đang kết nối được/mất kết nối tới CSDL nguồn, không phải
   đợi mở kết nối thật mỗi lần vào trang. Job nền (`lib/connectionHealthChecker.js`,
   dùng lại `testConnectionsBatch()` đã có sẵn) kiểm tra lại MỌI
   `DataSources` đang bật mỗi 15 phút (+ 1 lượt ngay lúc service khởi
   động), lưu kết quả vào bảng mới `DataSourceConnectionStatus`; trang chỉ
   đọc lại kết quả đã lưu, có nút "Kiểm tra lại ngay" để ép kiểm tra tức
   thì. 3 trạng thái tách riêng: 🟢 kết nối được / 🔴 mất kết nối / ⏳ chưa
   kiểm tra lần nào (nguồn vừa tạo) — KHÔNG gộp "chưa kiểm tra" vào "mất
   kết nối" để tránh hiểu nhầm là lỗi thật.
2. **"Giám sát cấu trúc CSDL"** (trang mới, riêng `etl-admin`) — mỗi ngày
   6h sáng (giờ Việt Nam), đối chiếu cấu trúc bảng/cột mà mọi `SyncJobs`
   đang bật phụ thuộc vào (`SourceTable`, `KeyColumn`, các cột
   dimension/measure...) với lần kiểm tra trước (`lib/schemaMonitor.js`,
   dùng lại `schemaBrowser.js` có sẵn) — phát hiện CẢ cột bị xoá/đổi tên
   VÀ cột đổi kiểu dữ liệu (không chỉ kiểm tra tồn tại như nút "Kiểm tra
   cấu trúc" cũ ở trang Sync Jobs). Có thay đổi → gửi email cảnh báo ngay
   (tái dùng `lib/mailer.js`) + ghi lịch sử vào bảng mới `SchemaChangeLog`,
   xem lại được trên trang. Lần kiểm tra ĐẦU TIÊN của 1 bảng (chưa có mốc
   so sánh) chỉ lưu mốc, không báo "mọi thứ đều mới" (toàn nhiễu).

Cả 2 job chỉ chạy ở node lãnh (`isSchedulerLeader()`, tránh PM2 cluster
chạy trùng gửi email nhiều lần) — mirror đúng cơ chế cron đã có trong
`server.js`. 2 `MenuCode` mới (`connection-status`, `schema-monitor`) đã
thêm vào `MENU_CATALOG` nhưng **CHƯA cấp cho vai trò nào** — quản trị viên
phải vào trang "Vai trò" cấp quyền xem sau khi triển khai (không tự động
cấp, theo nguyên tắc không tự cấp quyền đã áp dụng xuyên suốt hệ thống).

**Các bước triển khai:** xem chi tiết ở
`deploy/Cập nhật bản 8.57 — Trạng thái kết nối + Giám sát cấu trúc CSDL.md`.

## 8.56 — Thêm cột "Trung bình giao dịch" vào 8 báo cáo Top 5 chi nhánh

**Theo yêu cầu người dùng**: 8 báo cáo "Top 5 chi nhánh" (MART/MINIMART ×
Doanh thu/Giao dịch × Cao nhất/Thấp nhất, `scripts/seedTop5ChiNhanhReports.js`)
chỉ có cột Doanh thu/Giao dịch, chưa có "Trung bình giao dịch" (giá trị
trung bình 1 bill = Doanh thu / Số giao dịch).

Thêm cột `trungBinhGD` — CÙNG công thức "Trung bình GD" đã dùng ở báo cáo
"Doanh thu cuối ngày LDTD/HCRC" (`ROUND(current.measures.doanhThu /
currentGD.measures.SoGiaoDich, 0)`). Chi nhánh chưa có giao dịch nào
trong kỳ (chia cho 0) tự động hiện rỗng, không lỗi — đã kiểm tra lại bằng
`lib/formulaEngine.js` thật trước khi gộp. Áp dụng cho CẢ 8 báo cáo (dùng
chung 1 hàm `buildDefinition()`), hiện ở cả trang Báo cáo lẫn khi xuất
Excel/PDF — không cần sửa gì ở biểu đồ Top 5 (đọc thẳng `doanhThu`/
`soGiaoDich` theo tên field, không phụ thuộc số lượng cột).

**Các bước triển khai:**
1. `git pull origin main`
2. `cd rp-server && node scripts/seedTop5ChiNhanhReports.js` (BẮT BUỘC —
   ghi đè `DefinitionJson` đã lưu trong CSDL, code mới không tự áp dụng
   nếu không chạy lại; dùng đúng `menuCode` đã seed lần đầu nếu khác mặc
   định `reports-kinh-doanh`).
3. `pm2 restart hcrc-rp-server`.
4. Kiểm tra: mở 1 trong 8 báo cáo "Top 5 ..." hoặc Dashboard "Top 5 chi
   nhánh" → bảng hiện thêm cột "Trung bình giao dịch"; xuất Excel/PDF
   cũng có cột này.

Không đổi CSDL, không đổi biểu đồ/logic xếp hạng Top 5.

## 8.55 — Script tạo tự động 2 job đồng bộ cho 3 báo cáo "hết hàng"

**Theo yêu cầu người dùng**: 3 báo cáo "hết hàng" (Top bán chạy tồn kho=0,
Core stock=0 Mart/Minimart) vốn đã có đủ code + tài liệu hướng dẫn triển
khai (`bc-ton-kho-0.md`, `bc-core-ton-kho-0.md`) từ trước, nhưng 2 job
đồng bộ BẮT BUỘC (`banhang_sku`/`tonkho_sku`) chỉ có cách tạo THỦ CÔNG qua
etl-admin. Người dùng xác nhận DBA đã tạo xong 2 VIEW `vw_BanHangTheoSKU`/
`vw_TonKhoTheoSKU` đúng tài liệu — yêu cầu dựng sẵn luôn phần "nguồn dữ
liệu đồng bộ + lịch đồng bộ" bằng code thay vì bấm tay.

Thêm `etl/scripts/seedZeroStockSkuSync.js` (mẫu theo đúng
`seedLdtdHcrcSync.js` đã có) — chạy 1 lệnh là tạo/cập nhật xong: Nguồn dữ
liệu "DSMART16 - Live" (dùng lại đúng 1 nguồn với báo cáo LDTD/HCRC nếu đã
có, không tạo kết nối trùng) + 2 job "Theo bảng" (`banhang_sku` trỏ
`vw_BanHangTheoSKU`, `tonkho_sku` trỏ `vw_TonKhoTheoSKU`), đúng cột/
Dimensions/Measures/`KeepHistory=1` theo tài liệu. Script TỰ KIỂM TRA
schema thật của nguồn trước khi tạo job, dừng lại báo lỗi rõ nếu thiếu
VIEW/cột — không tạo job nửa vời. Đã cập nhật 2 file hướng dẫn, ghi rõ
đây là cách làm khuyến nghị, giữ nguyên hướng dẫn thao tác tay làm
phương án dự phòng.

**KHÔNG tự động hoá** (đúng phạm vi người dùng yêu cầu, phần còn lại vẫn
cần làm tay theo tài liệu): 4 VIEW/job "Chờ nhập"/"Đã nhập" + 4 domain Core
"Khoá All"/"SL đang đặt"... (TUỲ CHỌN, VIEW mẫu trong tài liệu còn ghi "CHỈ
VÍ DỤ" — cần DBA xác nhận lại tên bảng/cột thật trước khi tạo); upload
danh sách hàng Core; chạy script đăng ký 2 báo cáo vào danh mục
(`rp-server/scripts/seedTopZeroStockReport.js`/`seedCoreZeroStockReports.js`
— ĐÃ CÓ SẴN từ trước, không đổi gì); gán quyền xem.

**Các bước triển khai:**
1. `git pull origin main`
2. Khai `DSMART16_SERVER`/`DSMART16_USER`/`DSMART16_PASSWORD` vào `.env`
   của `etl` (dùng chung với `seedLdtdHcrcSync.js` nếu đã khai sẵn).
3. `cd etl && node scripts/seedZeroStockSkuSync.js` — tạo 2 job đồng bộ.
4. Theo dõi etl-admin → Log tới khi 2 job chạy thành công.
5. `cd rp-server && node scripts/seedTopZeroStockReport.js && node scripts/seedCoreZeroStockReports.js` — đăng ký 3 báo cáo vào danh mục.
6. Upload danh sách hàng Core (etl-admin → "Danh sách hàng Core") cho đúng
   Mart/Minimart.
7. Gán quyền xem 3 báo cáo (rp-user → Hệ thống → Phân quyền).
8. Kiểm tra theo đúng Bước 5/7 trong 2 file hướng dẫn.

Không đổi CSDL `rp`/`rp-server`/`rp-user` — chỉ thêm 1 script phía `etl`.

## 8.54 — Rà soát bản 8.31→8.53 + vá 1 lỗ hổng lý thuyết

**Theo yêu cầu người dùng**: rà soát lại (code-review `--level max`) toàn
bộ thay đổi từ bản 8.31 đến 8.53 (bao gồm cả bản 8.53 vừa gộp), xem còn
lỗi nào phát sinh trong quá trình sửa không. Phát hiện **1 lỗ hổng lý
thuyết** (chưa có definition thật nào rơi vào, nhưng vá cho chắc theo
đúng nguyên tắc "không chắc chắn thì KHÔNG lọc" của tính năng Phạm vi dữ
liệu):

- `compositeReportRunner.js` — `entityIsMaDiem` (xác định báo cáo composite
  có "an toàn để lọc theo siêu thị" hay không, bản 8.51) dùng
  `Array.prototype.every()` trên danh sách khối KHÔNG phải `isTarget`.
  Nếu 1 báo cáo composite có MỌI khối đều `isTarget:true` (không có khối
  dữ liệu nào) thì mảng rỗng, `.every()` tự nhiên trả `true` (vacuous
  truth) — hiểu nhầm thành "mọi khối đã quy về mã Điểm chuẩn" dù không có
  khối nào để kiểm tra thật, có thể BẬT lọc theo `storeScope` trên
  `entityCode` chưa chắc là mã Điểm (lọc sai — thiếu hoặc thừa dữ liệu).
  Đã vá: thêm điều kiện phải có ÍT NHẤT 1 khối không phải target trước khi
  `.every()`.

**Các bước triển khai:**
1. `git pull origin main`
2. `pm2 restart hcrc-rp-server` (BẮT BUỘC — đổi file backend).

Không đổi CSDL/giao diện, không đổi hành vi của MỌI báo cáo đang hoạt
động hiện tại (2 file định nghĩa báo cáo composite hiện có đều đã có khối
dữ liệu thật, không rơi vào trường hợp này).

## 8.53 — Tiêu đề nhóm cột có màu + tô đậm dòng Tổng cộng trên bảng web báo cáo

**Theo yêu cầu người dùng**: bảng báo cáo xem trên web chỉ vẽ 1 dòng tiêu
đề phẳng, không màu, không tô khác biệt dòng "Tổng cộng" — trong khi file
Excel/PDF xuất ra từ CHÍNH báo cáo đó đã có tiêu đề gộp 2 dòng tô màu
theo nhóm cột ("Doanh thu"/"Lãi gộp"/"Giao dịch"...) + tô tím đậm dòng
Tổng cộng từ lâu. `definition.columnGroups` vốn chỉ `exportExcel.js`/
`exportPdf.js` đọc tới, API `/run` chưa từng trả về cho web.

Đã sửa: `/reports/:id/run` trả thêm `columnGroups` (dữ liệu có sẵn,
trước đây chưa gửi); `DataTable.jsx` dùng dữ liệu đó vẽ tiêu đề 2 dòng
tô màu KHỚP HỆT Excel/PDF (dùng chung bảng màu `GROUP_COLORS`/
`SUBTOTAL_COLOR`), tô đậm dòng `__isSubtotal`/`__isGrandTotal`. Áp dụng
TỰ ĐỘNG cho mọi báo cáo đã khai `columnGroups`, ở cả trang Báo cáo lẫn
mỗi ô Dashboard — không cần sửa từng báo cáo. Nơi không liên quan (trang
Người dùng, Vai trò...) không đổi gì. Đã demo bằng mock server +
Playwright (đúng cấu trúc 17 cột + 3 nhóm màu báo cáo thật) trước khi
gộp vào `main`, xác nhận tiêu đề dính đúng khi cuộn dọc/ngang.

**Các bước triển khai:**
1. `git pull origin main`
2. `cd rp-user && npm run build`, copy `dist/` mới.
3. `pm2 restart hcrc-rp-server` (đổi cấu trúc JSON trả về của `/run`).
4. Kiểm tra: mở báo cáo có `columnGroups` (vd "Báo cáo doanh thu cuối
   ngày LDTD") → tiêu đề 2 dòng tô màu, dòng Tổng cộng tô tím đậm; trang
   không liên quan (vd "Người dùng") → không đổi gì.

Không đổi dữ liệu/công thức/Excel/PDF/CSDL. Chi tiết đầy đủ: `deploy/Cập
nhật bản 8.53 — Tiêu đề nhóm cột có màu trên bảng web báo cáo.md`.

## 8.52 — Rà soát bản 8.31→8.51 + vá 3 lỗi phát hiện được

**Theo yêu cầu người dùng**: rà soát lại toàn bộ thay đổi từ bản 8.31 đến
8.51 (79 file, ~5500 dòng) xem còn lỗi/rủi ro nào sau khi sửa không — chạy
review tự động (toàn bộ diff) + 1 lượt rà soát sâu riêng cho đúng phần
nhạy cảm nhất (xác thực/phân quyền/lọc dữ liệu). Phát hiện 3 lỗi, **ĐÃ VÁ
CẢ 3**:

1. **[RÒ RỈ DỮ LIỆU — nghiêm trọng nhất]** "Lịch gửi email báo cáo" VÀ
   "Cảnh báo bất thường" **KHÔNG áp dụng** giới hạn "Phạm vi dữ liệu" (bản
   8.51) — 1 người bị giới hạn chỉ xem 1 siêu thị nhưng được giao menu
   "Lịch gửi email báo cáo"/"Cảnh báo bất thường" (2 menu này vốn coi như
   đủ quyền chọn BẤT KỲ báo cáo nào) vẫn có thể tạo lịch/cảnh báo trên 1
   báo cáo đang bị giới hạn và NHẬN ĐƯỢC EMAIL VỚI TOÀN BỘ DỮ LIỆU, không
   lọc gì — bỏ sót đúng 2 "đường vòng" không đi qua `routes/reports.js`/
   `routes/dashboards.js` (nơi bản 8.51 đã chặn). Đã vá: cả 2 nơi giờ tự
   tra phạm vi dữ liệu của NGƯỜI TẠO lịch/cảnh báo rồi ép vào trước khi
   chạy báo cáo, giống hệt cách `routes/reports.js` đã làm.
2. Trang "Ánh xạ Phòng ban → Siêu thị" (bản 8.49) — nút "Sửa" đổi tên
   Department bị LƯU THÀNH DÒNG MỚI thay vì đổi tên dòng cũ (do lưu theo
   đúng tên mới gõ thay vì theo Id dòng đang sửa) — dòng cũ (tên sai) vẫn
   còn nguyên, có thể gây ánh xạ sai cho ai tra theo tên cũ. Đã vá: sửa
   dòng có sẵn giờ cập nhật ĐÚNG dòng đó theo Id, báo lỗi rõ nếu đổi tên
   trùng 1 dòng khác.
3. Khung "Phạm vi dữ liệu" (trang Người dùng, bản 8.50) còn ghi chú cũ
   "bản này chỉ lưu, chưa lọc gì" — ĐÃ LỖI THỜI từ khi bản 8.51 áp dụng lọc
   thật. Đã sửa lại đúng thực tế.

**Các bước triển khai:**
1. `git pull origin main`
2. `cd rp-user && npm run build`, copy `dist/` mới.
3. `pm2 restart hcrc-rp-server` (BẮT BUỘC — vá lỗ rò rỉ dữ liệu ở lịch gửi
   email/cảnh báo bất thường).
4. Kiểm tra: tài khoản đã bị giới hạn 1 siêu thị (bản 8.50) + được giao
   menu "Lịch gửi email báo cáo" → tạo thử 1 lịch trên báo cáo Top 5/
   Realtime "Thành viên" → bấm "Gửi ngay" → email nhận được CHỈ có đúng
   siêu thị đã giới hạn (trước bản này sẽ nhận ĐỦ mọi siêu thị — đúng lỗi
   vừa vá). Tương tự với "Cảnh báo bất thường".

Không đổi CSDL, không đổi hành vi của lịch/cảnh báo do tài khoản KHÔNG bị
giới hạn tạo (vẫn chạy như cũ — đủ dữ liệu). Chi tiết đầy đủ: `deploy/Cập
nhật bản 8.52 — Rà soát và vá lỗi 8.31-8.51.md`.

## 8.51 — Áp lọc dữ liệu THẬT theo siêu thị (báo cáo composite)

**Bước 3 — LẦN ĐẦU TIÊN thật sự giới hạn số liệu hiển thị**, tiếp nối bản
8.49 (ánh xạ Department → MaDiem) và 8.50 (gán "Phạm vi dữ liệu" cho từng
người). Từ bản này, người đã được gán "Giới hạn: <siêu thị>" ở trang
Người dùng sẽ **CHỈ còn thấy đúng dòng dữ liệu của (các) siêu thị đó**
trong các báo cáo áp dụng được — không tick gì (mặc định "Toàn bộ", kể cả
HO) vẫn thấy như cũ, không ảnh hưởng gì.

**Cơ chế**: mỗi lần chạy/xuất báo cáo, server tự gắn (KHÔNG tin client gửi
lên) `MaDiem` người đó được gán vào bộ lọc, áp dụng NGAY TRƯỚC bước xếp
hạng/nhóm của báo cáo composite (dùng lại đúng cơ chế lọc hàng đã có sẵn
cho `topN`). **CHỈ áp dụng được cho báo cáo mà MỌI khối dữ liệu (trừ khối
chỉ tiêu) đã quy entityCode về đúng Mã Điểm chuẩn** (cờ `useDiemStkMapping`/
`mapBuIdToMaDiem` đã khai ở "Ánh xạ Điểm - STK_ID") — đúng nhóm báo cáo
Top 5 chi nhánh + "Báo cáo doanh thu cuối ngày HCRC (Thành viên)" (tab
Realtime trên Dashboard). Báo cáo khác KHÔNG quy về Mã Điểm thì **GIỮ
NGUYÊN không lọc** (an toàn — không phải lỗ hổng, chỉ là chưa tới lượt;
xem 8.52 dự kiến cho phần còn lại: Top bán chạy tồn kho=0, Báo cáo tự do).

Đã viết test riêng xác nhận đúng 7 tình huống trước khi gộp (thấy đủ khi
không giới hạn, chỉ đúng 1/nhiều siêu thị khi giới hạn, rỗng khi gán nhầm
mã không tồn tại, và báo cáo không đủ điều kiện thì KHÔNG bị lọc nhầm).

**Các bước triển khai:**
1. `git pull origin main`
2. `pm2 restart hcrc-rp-server` (BẮT BUỘC — đổi logic chạy báo cáo, không
   đổi CSDL/giao diện).
3. Kiểm tra: gán "Phạm vi dữ liệu" = 1 siêu thị cho 1 tài khoản test (xem
   bản 8.50) → đăng nhập tài khoản đó → mở Dashboard "Top 5 chi nhánh" hoặc
   tab Realtime → CHỈ thấy đúng siêu thị đã gán; xuất Excel/PDF cũng chỉ ra
   đúng siêu thị đó. Tài khoản "Toàn bộ" (mặc định) vẫn thấy như cũ.

Không đổi CSDL, không đổi giao diện. Chi tiết đầy đủ: `deploy/Cập nhật bản
8.51 — Áp lọc dữ liệu theo siêu thị.md`.

## 8.50 — Gán phạm vi dữ liệu theo siêu thị cho từng người dùng

**Bối cảnh**: bước 2 trong lộ trình phân quyền dữ liệu theo đúng siêu thị
(xem bản 8.49). Trang "Người dùng" có thêm nút **"Phạm vi dữ liệu"** —
chọn (các) siêu thị 1 người CHỈ ĐƯỢC THẤY, hoặc để trống = "Toàn bộ" (mặc
định AN TOÀN — không ai bị thu hẹp quyền xem cho tới khi Admin CHỦ ĐỘNG
gán). Có gợi ý tự động (dựa theo `Department` + `WorkLocation="Siêu Thị"`,
qua `resolveMaDiemForDepartment()` của bản 8.49) — Admin bấm "Dùng gợi ý
này" hoặc tự chọn tay. Cột mới "Phạm vi dữ liệu" trong bảng Người dùng
hiện "Toàn bộ" hoặc danh sách tên siêu thị đã giới hạn.

**QUAN TRỌNG — bản này CHƯA lọc dữ liệu báo cáo thật.** Chỉ lưu lựa chọn
vào `app.UserStoreAccess`, CHƯA có route/tầng chạy báo cáo nào đọc bảng
này để giới hạn số liệu hiển thị — việc đó để bản sau (8.51+, áp dụng vào
báo cáo composite trước, Top5/Realtime "Thành viên").

**Các bước triển khai:**
1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (bảng mới `app.UserStoreAccess`).
3. `cd rp-user && npm run build`, copy `dist/` mới.
4. `pm2 restart hcrc-rp-server` (route API mới).
5. Kiểm tra: trang "Người dùng" → "Phạm vi dữ liệu" cho 1 người
   `WorkLocation="Siêu Thị"` → thấy gợi ý (nếu `Department` khớp được) →
   "Dùng gợi ý này" hoặc tự tick → Lưu → cột "Phạm vi dữ liệu" cập nhật
   đúng.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.50 — Gán phạm vi dữ liệu theo siêu
thị.md`.

## 8.49 — Ánh xạ Phòng ban (vpdt) → Siêu thị

**Bối cảnh**: bước 1 trong lộ trình "phân quyền DỮ LIỆU theo đúng siêu thị"
(ST chỉ thấy số liệu ST đó, HO thấy toàn bộ — phân tích đầy đủ đã trình bày
trực tiếp với người dùng, xem bản 8.47/8.48 cho 2 bước trước đó về phân
quyền XEM báo cáo nói chung). Cần 1 khoá chuẩn duy nhất để biết "người này
thuộc đúng siêu thị nào" khớp được với dữ liệu thật trong Data Warehouse —
tái dùng NGUYÊN `MaDiem` đã có sẵn ở "Ánh xạ Điểm - STK_ID" (etl-admin),
không tạo khái niệm "mã siêu thị" mới song song.

**Thay đổi**: trang mới **"Ánh xạ Phòng ban → Siêu thị"** (Hệ thống) — ánh
xạ cột "Phòng ban" (Department, đồng bộ từ vpdt/HCRC Workspace, xem trang
Người dùng) sang `MaDiem` chuẩn, CHỈ cần khai khi tên không khớp thẳng
(lệch chính tả/viết tắt). Thứ tự tự động: (1) khớp theo bảng ánh xạ ở đây
nếu có, (2) khớp thẳng theo tên với `TenSieuThi` đã khai ở "Ánh xạ Điểm -
STK_ID", (3) không khớp gì → chưa gợi ý được, cần Admin bổ sung 1 dòng ở
đây hoặc gán tay (bản sau). Mirror ĐÚNG khuôn upload Excel + sửa tay của
"Ánh xạ Điểm - STK_ID" theo đúng ý người dùng muốn ("linh hoạt hơn là
fix"), đơn giản hoá vì đây chỉ map 1-1.

**Lưu ý**: bản này CHƯA áp dụng bất kỳ giới hạn xem dữ liệu nào — chỉ là hạ
tầng ánh xạ, chưa gắn vào Người dùng/báo cáo. 2 bản tiếp theo sẽ: (8.50)
gán phạm vi dữ liệu cho từng người ở trang Người dùng (tự gợi ý theo
ánh xạ này + WorkLocation, Admin xác nhận/sửa), (8.51+) mới thật sự áp lọc
vào báo cáo.

**Các bước triển khai:**
1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (bảng mới `app.DepartmentStoreMapping`, menu
   mới "Ánh xạ Phòng ban → Siêu thị").
3. `cd rp-user && npm run build`, copy `dist/` mới.
4. `pm2 restart hcrc-rp-server`.
5. Vào "Hệ thống → Phân quyền" cấp quyền menu "Ánh xạ Phòng ban → Siêu thị"
   cho vai trò cần dùng (Admin hệ thống tự thấy sẵn).
6. Kiểm tra: tải file mẫu → điền 1 dòng Department/MaDiem thật → nhập lại
   → hiện đúng trong danh sách; sửa/xoá 1 dòng bằng form bên dưới.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.49 — Ánh xạ Phòng ban sang Siêu
thị.md`.

## 8.48 — Phân quyền báo cáo/Dashboard riêng theo từng người dùng

**Bối cảnh**: tiếp nối yêu cầu "phân quyền theo siêu thị/phòng ban, đến
từng người dùng hoặc nhóm người dùng" — phần phân tích đã chỉ ra hệ thống
đã có sẵn cơ chế "nhóm người dùng" (1 Vai trò gán cho nhiều người qua
`app.UserRoles`, vốn đã hỗ trợ nhiều vai trò/người), chỉ thiếu lớp cấp lẻ
CHO TỪNG CÁ NHÂN mà không cần tạo hẳn 1 vai trò riêng. Phần giới hạn DỮ
LIỆU theo đúng siêu thị (row-level) phức tạp hơn nhiều, để làm riêng 1 đợt
sau.

**Thay đổi**: trang "Người dùng" có thêm nút **"Gán quyền riêng"** — cấp
thêm báo cáo/nhóm Dashboard cho ĐÚNG 1 người, **CỘNG DỒN** vào quyền theo
vai trò đang giữ (không thay thế — đủ 1 trong 2 nguồn là xem được). Bảng
mới `app.UserReportAccess`/`app.UserDashboardGroupAccess`, cùng khuôn
`RoleReportAccess`/`RoleDashboardGroupAccess` đã có.

**Khi nào dùng "Gán quyền riêng" thay vì tạo Vai trò mới**: chỉ nên dùng
cho đúng 1-2 người cần quyền đặc biệt không ai khác có — cần cấp cho CẢ
MỘT NHÓM người (vd "nhân viên siêu thị Phố Nối"), vẫn nên tạo 1 Vai trò
(không cần đúng nghĩa chức danh, chỉ cần là 1 nhãn nhóm) rồi gán nhiều
người vào, như cách làm từ trước tới giờ.

**Các bước triển khai:**
1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (thêm bảng `app.UserReportAccess`/
   `app.UserDashboardGroupAccess`).
3. `cd rp-user && npm run build`, copy `dist/` mới.
4. `pm2 restart hcrc-rp-server`.
5. Kiểm tra: trang "Người dùng" → "Gán quyền riêng" → tick thêm 1 báo cáo
   cho 1 người KHÔNG có qua vai trò nào → Lưu → người đó thấy thêm đúng
   báo cáo vừa cấp (gần như ngay lập tức, cache quyền tối đa 60 giây).

Không đổi `app.RoleReportAccess`/`app.RoleDashboardGroupAccess` hiện có.
Chi tiết đầy đủ: `deploy/Cập nhật bản 8.48 — Phân quyền theo từng người
dùng.md`.

## 8.47 — Mật khẩu dự phòng cục bộ khi HCRC Workspace lỗi

**Bối cảnh**: tài khoản xác thực qua "HCRC Workspace" (gọi `POST
/verify-credentials` MỖI LẦN đăng nhập, không lưu gì local) không đăng nhập
được gì nếu dịch vụ đó sập/mất mạng — người dùng đã yêu cầu phân tích
phương án dự phòng.

**Thay đổi**: mỗi lần xác thực ONLINE thành công, hệ thống tự băm (bcrypt)
lại đúng mật khẩu vừa gõ đúng, lưu vào `CachedPasswordHash`/
`CachedPasswordHashAt` — CHỈ dùng tới khi HCRC Workspace báo lỗi dịch vụ
(mạng/timeout/5xx, không phải sai mật khẩu) VÀ còn trong hạn
`FallbackMaxAgeDays` (mặc định 14 ngày, chỉnh được ở trang "Xác thực HCRC
Workspace") kể từ lần cache gần nhất. KHÔNG đồng bộ mật khẩu từ API HCRC
Workspace (API không cung cấp, và chủ động giữ mật khẩu ngoài tầm kiểm
soát của hệ thống nguồn là rủi ro không cần thiết).

An toàn bổ sung: mỗi lần đăng nhập bằng dự phòng được ghi riêng vào Audit
Log; trang "Người dùng" hiện cột "Mật khẩu dự phòng" (có/không, ngày cập
nhật gần nhất) + nút "Xoá mật khẩu dự phòng" để Admin thu hồi NGAY (vd
nhân viên nghỉ việc đột xuất đúng lúc HCRC Workspace đang sập, không đợi
hết hạn 14 ngày).

**Các bước triển khai:**
1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (thêm cột `CachedPasswordHash`/
   `CachedPasswordHashAt` ở `app.Users`, cột `FallbackMaxAgeDays` ở
   `app.HcrcWorkspaceSettings`).
3. `cd rp-user && npm run build`, copy `dist/` mới.
4. `pm2 restart hcrc-rp-server`.
5. Kiểm tra: đăng nhập bình thường 1 tài khoản HCRC Workspace (để tạo cache
   dự phòng) → trang "Người dùng" hiện cột "Mật khẩu dự phòng" đã có giá
   trị; tạm tắt "Bật xác thực HCRC Workspace" ở trang cấu hình (mô phỏng
   dịch vụ sập) → đăng nhập lại ĐÚNG mật khẩu cũ vẫn vào được (dùng dự
   phòng), Audit Log ghi rõ "dùng mật khẩu dự phòng"; bật lại cấu hình xong
   kiểm tra tiếp.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.47 — Mật khẩu dự phòng HCRC
Workspace.md`.

## 8.46 — Sửa nút "Lên"/"Xuống" trắng trơn trong khung Tuỳ chỉnh Dashboard

**Lỗi phát hiện lúc demo bản 8.45** (chụp ảnh thật bằng trình duyệt trước
khi gửi demo cho người dùng — không chỉ build/grep chuỗi như trước): 2 nút
đổi thứ tự Ô (trước đây ký hiệu ▲▼) hiện ra TRẮNG TRƠN không thấy chữ —
nguyên nhân là `.dashboard-customize-tile-move button` chỉ đổi `background`
sang màu trắng nhưng QUÊN đổi `color` (chữ vẫn kế thừa `color: #fff` từ
luật `button` dùng chung toàn hệ thống) → chữ trắng trên nền trắng, bấm
được nhưng không ai nhìn thấy để bấm. Nhân tiện đổi luôn ký hiệu ▲▼ thành
chữ "Lên"/"Xuống" cho rõ nghĩa hơn.

Chỉ sửa CSS (`rp-user/src/styles.css`) + nhãn nút
(`DashboardPage.jsx`) — không đổi logic, không đổi API, không đổi CSDL.

**Các bước triển khai:**
1. `git pull origin main`
2. `cd rp-user && npm run build`, copy `dist/` mới.
3. Kiểm tra: Dashboard → "⚙️ Tuỳ chỉnh" → mỗi Ô hiện rõ 2 nút chữ "Lên"/
   "Xuống" (trước đây trắng trơn không thấy chữ).

## 8.45 — Cá nhân hoá báo cáo Dashboard

Trang Dashboard (rp-user) có thêm nút "⚙️ Tuỳ chỉnh" mở khung cho PHÉP MỖI
NGƯỜI tự tuỳ chỉnh CÁCH XEM dashboard của chính mình, lưu trên server theo
tài khoản (bảng mới `app.UserDashboardPreferences`, không dùng localStorage
— đăng nhập máy/điện thoại nào cũng thấy đúng tuỳ chỉnh của mình):

1. **Ẩn/hiện Ô** — bỏ tick 1 Ô là Ô đó biến mất khỏi Dashboard CỦA MÌNH
   (không ảnh hưởng người khác, không cần Admin cấp lại quyền — khác hẳn
   `app.RoleDashboardGroupAccess` bản 8.43 vốn là quyền XEM chung theo vai
   trò, đây chỉ là tuỳ chọn hiển thị của riêng người đó trên các Ô họ ĐÃ có
   quyền xem).
2. **Sắp xếp lại thứ tự Ô** — nút ▲▼ trong khung Tuỳ chỉnh, đổi vị trí ngay,
   áp dụng ở mọi nhóm/tab.
3. **Nhớ nhóm/tab đã chọn lần trước** — lần sau mở Dashboard tự quay lại
   đúng nhóm (Top 5/Realtime), tab (Doanh thu/Giao dịch, Bảng/Biểu đồ) đã
   xem gần nhất, không phải chọn lại từ đầu.
4. **Số ngày mặc định khi mở lại Dashboard** — chọn "Hôm nay"/"7 ngày gần
   nhất"/"30 ngày gần nhất", áp dụng cho bộ lọc "Từ ngày — đến ngày" ngay
   lúc mở trang (không ảnh hưởng gì nếu tự đổi lại ngày khi đang xem).

Có nút "Khôi phục mặc định" trong khung Tuỳ chỉnh để xoá hết tuỳ chỉnh đã
lưu, về lại đúng hành vi gốc (giống trước khi có bản 8.45).

**Các bước triển khai:**
1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (thêm bảng `app.UserDashboardPreferences`,
   an toàn chạy lại nhiều lần).
3. `cd rp-user && npm run build`, copy `dist/` mới.
4. `pm2 restart hcrc-rp-server` (có route API mới `GET`/`PUT
   /dashboards/:id/preferences`).
5. Kiểm tra: trang Dashboard hiện nút "⚙️ Tuỳ chỉnh"; ẩn 1 Ô, đổi thứ tự,
   đổi số ngày mặc định → đăng xuất/đăng nhập lại (hoặc mở máy khác) vẫn
   giữ đúng tuỳ chỉnh; bấm "Khôi phục mặc định" → về lại như trước bản
   8.45.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.45 — Cá nhân hoá Dashboard.md`.

## 8.44 — Bộ lọc/nhóm theo siêu thị trong danh sách Đồng bộ

Trang "Đồng bộ" (ETL) có thêm 1 ô tìm kiếm (theo tên job HOẶC tên siêu
thị/nguồn dữ liệu) và 1 tuỳ chọn "Nhóm theo siêu thị" — khi bật, danh
sách job được gộp thành từng khối thu/mở theo đúng siêu thị (DataSourceId),
mỗi khối hiện số job bên trong, bấm vào tiêu đề để mở/đóng; gõ vào ô tìm
kiếm thì các khối khớp tự mở luôn. Đây là trả lời cho câu hỏi của người
dùng về việc tương lai đồng bộ thêm dữ liệu khác từ siêu thị có phải tạo
thêm VIEW + job mới không (CÓ — vẫn giữ 1 job/1 loại dữ liệu như từ
trước), và việc gộp hết các VIEW vào 1 job/siêu thị có vấn đề gì không
(CÓ 3 vấn đề cụ thể: mất lịch chạy (CronExpression) riêng từng loại dữ
liệu, mất watermark (LastSyncedAt) riêng từng loại do `etl.SyncState` chỉ
có PK theo SyncJobId, mất log lỗi riêng từng loại do `etl.SyncLog` ghi 1
dòng/1 lần CHẠY JOB không phải 1 dòng/1 loại dữ liệu — gộp cũng KHÔNG giảm
số kết nối CSDL vì đã dùng pool theo từng DataSourceId từ trước). Người
dùng đã chọn hướng an toàn hơn: GIỮ NGUYÊN kiến trúc 1 job/1 loại dữ liệu,
chỉ gọn cách XEM trong danh sách — không đổi `etl.SyncJobs`/`etl.SyncState`/
`etl.SyncLog`/`etl/jobs/scheduler.js`.

Chỉ sửa UI (`etl-admin/src/pages/SyncJobsPage.jsx`, `styles.css`). Không
đổi CSDL, không đổi backend. Chi tiết đầy đủ: `deploy/Cập nhật bản 8.44 —
Bộ lọc nhóm theo siêu thị Sync Jobs.md`.

## 8.43 — Phân quyền Dashboard theo nhóm (Xem dashboard / Xem chi tiết)

Theo yêu cầu người dùng: tách riêng 2 quyền cho MỖI nhóm Dashboard (xem bản
8.42) — **"Xem dashboard"** (thấy nhóm đó trên trang Dashboard) và **"Xem
chi tiết"** (được bấm Xuất Excel/PDF cho nhóm đó) — trước đây chỉ có 1 cấp
chung (menu "dashboard" bật/tắt CẢ TRANG + quyền xem từng Ô suy từ
`app.RoleReportAccess`, không tách được theo nhóm/không có khái niệm
"xem nhưng không xuất"). 2 lớp CỘNG DỒN, không thay nhau: thiếu
`RoleReportAccess` của report vẫn bị chặn như cũ; đủ `RoleReportAccess`
NHƯNG thiếu quyền nhóm mới (CanView) vẫn không thấy tile đó.

- `rp-db/schema.sql` — bảng mới `app.RoleDashboardGroupAccess`
  (RoleId, DashboardId, GroupKey, CanView, CanExport) — CHỈ áp dụng tile có
  khai `group` (bản 8.42); tile không khai `group` (dashboard khác) không
  bị ảnh hưởng, không cần seed gì cho chúng.
- `rp-server/lib/permissions.js` — `getUserContext()` thêm
  `dashboardGroupAccess` (Map, hợp NHIỀU vai trò kiểu "chỉ cần 1 vai trò
  cho phép", `null` cho IsSystemRole = bỏ qua hẳn lớp này).
- `rp-server/routes/dashboards.js` — `filterTilesForUser()` dùng chung cho
  `GET /:dashboardId` (lọc theo CanView) và `POST /:dashboardId/export`
  (lọc theo CanExport — CHẶT HƠN, vai trò chỉ có CanView thấy Ô trên web
  nhưng không xuất được).
- `rp-server/routes/roles.js` — `GET /dashboard-groups-catalog` (quét
  `DefinitionJson` của MỌI dashboard, liệt kê nhóm cho UI tick chọn),
  `GET /:id/access` trả thêm `dashboardGroupAccess`, `PUT
  /:id/dashboard-group-access` (chỉ Admin hệ thống thật, giống 3 route
  quyền khác).
- `rp-user/src/modules/system/permissions/RolesPage.jsx` — mục "Dashboard
  được xem (theo nhóm)" trong màn "Gán quyền", giữa "Menu được thấy" và
  "Báo cáo được chạy" — mỗi nhóm 2 checkbox (Xem dashboard/Xem chi tiết,
  tự bỏ tick "Xem chi tiết" nếu bỏ "Xem dashboard").
- Đã `npm run build` xác nhận không lỗi; đã viết test tay mô phỏng 5 tình
  huống (admin thấy hết, vai trò thường chỉ thấy đúng nhóm được cấp, xuất
  file đòi quyền chặt hơn xem, cấp thêm quyền xuất thì xuất được, report
  không đủ quyền luôn bị chặn bất kể quyền nhóm) — tất cả đúng như thiết
  kế.

## 8.42 — Nhóm Dashboard (chọn nhóm trước khi xem Ô)

Theo yêu cầu người dùng: trang Dashboard có thêm bộ chọn "nhóm" ở đầu
trang (thẻ bấm được, kiểu tương tự tab Top 5/Realtime đã có) — chọn 1
nhóm mới hiện các Ô thuộc nhóm đó bên dưới, giống hệt cách báo cáo Top 5
hiện đang tách Mart/Minimart. Dashboard "Top 5 chi nhánh" hiện có 2 nhóm:
🏆 "Top 5 chi nhánh" (16 Ô) và ⚡ "Realtime" (4 Ô). **Báo cáo/Ô thêm SAU
NÀY chỉ cần gắn đúng 3 field mới lúc seed là tự vào đúng nhóm, không phải
sửa gì ở `DashboardPage.jsx`.**

- `rp-server/scripts/seedTop5ChiNhanhReports.js` — thêm 3 field TUỲ CHỌN
  trên mỗi tile: `group`/`groupLabel`/`groupIcon` (hằng số `TOP5_GROUP`/
  `REALTIME_GROUP`) — KHÔNG đổi schema/route, chỉ thêm field trong
  `DefinitionJson.tiles` (đúng tinh thần "mọi field tuỳ chọn đọc trực
  tiếp từ tile" đã ghi ở đầu `DashboardPage.jsx`).
- `rp-user/src/modules/dashboard/DashboardPage.jsx` — tính `groups` từ
  tile đang có (chỉ hiện bộ chọn khi ≥2 nhóm, giống đúng quy ước
  `metricTabs.length > 1`), lọc `groupFilteredTiles` theo nhóm đang chọn
  TRƯỚC khi đưa vào mọi logic cũ (tab Doanh thu/Giao dịch, tab Realtime,
  nhóm Mart/Minimart, xuất Excel/PDF...) — dashboard KHÔNG khai `tile.group`
  nào chạy Y HỆT trước, không bị ảnh hưởng.
- `styles.css` — thêm `.dashboard-group-grid`/`.dashboard-group-card`.
- **PHẢI chạy lại script seed sau khi deploy** (ghi đè `DefinitionJson` đã
  lưu trong CSDL — code mới không tự áp dụng nếu không chạy lại):
  `node scripts/seedTop5ChiNhanhReports.js`.
- Đã `npm run build` xác nhận không lỗi; đã viết test tay mô phỏng đúng 20
  tile thật (16 Top5 + 4 Realtime) xác nhận gom nhóm/lọc đúng số lượng.

## 8.41 — Đăng nhập vân tay/Face ID (WebAuthn) — rp-user, thay bước 2FA

Theo yêu cầu người dùng: admin (vai trò hệ thống) đăng ký vân tay/Face ID
ở "Tài khoản của tôi" — lúc đăng nhập, bước xác thực hai yếu tố có thêm
nút "Dùng vân tay/Face ID", xác thực xong đăng nhập LUÔN, **KHÔNG cần gõ
thêm mã 6 số nữa** (WebAuthn tự nó đã đủ thay cho bước yếu tố thứ 2, không
chồng thêm 1 lớp). KHÔNG thay thế mật khẩu — vẫn phải gõ mật khẩu trước
như cũ. Đăng ký được NHIỀU thiết bị/tài khoản; gỡ thiết bị bất kỳ lúc nào.

**Công nghệ**: chuẩn WebAuthn/FIDO2 qua `@simplewebauthn/server` (backend)
+ `@simplewebauthn/browser` (frontend) — trình duyệt tự gọi cảm biến sinh
trắc học của máy (Touch ID/Face ID/vân tay Windows Hello...), server chỉ
lưu khoá công khai + xác minh chữ ký, KHÔNG BAO GIỜ thấy dữ liệu sinh trắc
học thật. **Giới hạn cố hữu của WebAuthn (không phải lỗi)**: khoá gắn chặt
1 thiết bị/trình duyệt cụ thể — đăng nhập máy khác vẫn phải dùng mã 2FA
như cũ.

**QUAN TRỌNG — cần cấu hình domain thật trước khi dùng được**: WebAuthn
gắn chặt vào origin (domain) trình duyệt thấy — thêm 2 biến môi trường BẮT
BUỘC `WEBAUTHN_RP_ID`/`WEBAUTHN_RP_ORIGIN` (xem `.env.example`), để trống
= tính năng tắt hẳn (API trả lỗi rõ ràng, không crash server, không ảnh
hưởng đăng nhập bằng mật khẩu/mã 2FA thường).

- `rp-db/schema.sql` — bảng mới `app.UserWebAuthnCredentials` (CredentialId,
  PublicKeyBase64, Counter, DeviceLabel...).
- `rp-server/routes/webauthn.js` (mới) — 6 route: `GET/DELETE /devices`
  (quản lý, cần phiên đầy đủ), `POST /register/options`+`/register/verify`
  (đăng ký, cần phiên đầy đủ), `POST /login/options`+`/login/verify` (đăng
  nhập — nhận token "pending" y hệt `/2fa/verify`, KHÔNG cần phiên trước).
  Challenge tạm lưu trong bộ nhớ (giống `lib/captcha.js`), hết hạn 5 phút.
- `rp-server/.env.example` — thêm `WEBAUTHN_RP_NAME`/`WEBAUTHN_RP_ID`/
  `WEBAUTHN_RP_ORIGIN`.
- `rp-user/src/modules/system/account/AccountPage.jsx` — mục "Bảo mật —
  Vân tay/Face ID": danh sách thiết bị + đăng ký thiết bị mới (ẩn hẳn nếu
  trình duyệt/máy không hỗ trợ WebAuthn).
- `rp-user/src/pages/LoginPage.jsx` (`TwoFactorVerifyStep`) — thêm nút
  "Dùng vân tay/Face ID" bên cạnh ô nhập mã 6 số.
- Thêm `@simplewebauthn/server` (rp-server), `@simplewebauthn/browser`
  (rp-user) vào `package.json` — **PHẢI `npm install` lại trên server**.
- **Chỉ áp dụng `rp-user` đợt này** — CHƯA làm cho `etl-admin`/`api-admin`
  (để đợt sau, theo đúng thứ tự người dùng đã chốt).
- Đã `npm run build` xác nhận không lỗi; đã kiểm chứng
  `generateRegistrationOptions()`/`generateAuthenticationOptions()` chạy
  đúng với tham số thật. **Chưa (và không thể) mô phỏng được toàn bộ nghi
  thức mật mã WebAuthn thật trong môi trường này (cần trình duyệt +
  cảm biến sinh trắc học thật)** — BẮT BUỘC kiểm tra tay bằng thiết bị
  thật trước khi coi là xong, xem checklist trong file hướng dẫn deploy.

## 8.40 — Tự đặt lại mã 2FA (đổi thiết bị) ở "Tài khoản của tôi" — rp-user

Theo yêu cầu người dùng: admin (vai trò hệ thống) tự đặt lại mã 2FA của
CHÍNH MÌNH để quét QR mới trên thiết bị/app Authenticator KHÁC (vd đổi
điện thoại), không cần nhờ admin khác vào trang "Phân quyền" bấm "Đặt lại
2FA" giúp (mục đó CHỈ còn cần khi MẤT HẲN thiết bị, không tự xác thực lại
được). Phát hiện khi rà code: **backend ĐÃ CÓ SẴN 100% luồng này** từ
trước (nhánh "Đổi thiết bị" trong `POST /api/2fa/setup` — không kèm
`token`, chỉ kèm `currentCode`, xem `routes/twoFactor.js`) — chỉ THIẾU
giao diện gọi tới, bản này CHỈ thêm đúng phần đó, không đổi gì ở backend.

- `modules/system/account/AccountPage.jsx` — thêm `TwoFactorResetFlow`
  (3 bước: nhập mã 6 số hiện tại → quét QR mới + nhập mã mới xác nhận →
  lưu lại 10 mã khôi phục mới) + mục "Bảo mật — Xác thực hai yếu tố", CHỈ
  hiện cho tài khoản `isSystemRole` (2FA không áp dụng cho vai trò khác).
- `styles.css` — thêm `.security-card` (tái dùng `.twofa-qr`/`.twofa-secret`/
  `.recovery-codes` đã có sẵn từ màn hình đăng nhập).
- Đã `npm run build` xác nhận không lỗi. Chỉ sửa `rp-user` — CHƯA áp dụng
  cho `etl-admin`/`api-admin` (để đợt sau, theo đúng thứ tự người dùng đã
  chốt).

## 8.39 — Mã xác nhận (captcha 4 chữ số) khi đăng nhập, cả 3 app

Theo yêu cầu người dùng: thêm bước "Mã xác nhận" (captcha dạng ảnh, đúng 4
chữ số) vào form đăng nhập ETL/API/Report — **tự sinh ảnh trên server**
bằng thư viện `svg-captcha` (vẽ SVG bằng mã, font nhúng sẵn trong gói,
KHÔNG gọi dịch vụ/API ngoài nào, KHÔNG cần Internet lúc chạy — chỉ cần
Internet 1 lần lúc `npm install` như mọi gói khác). Captcha dùng ĐÚNG 1
LẦN (xoá khỏi bộ nhớ ngay khi server kiểm tra, dù đúng hay sai) và hết hạn
sau 5 phút — kiểm tra captcha TRƯỚC khi tra mật khẩu, chặn sớm script dò
mật khẩu tự động không giải được captcha.

- `lib/captcha.js` (mới, cả 3 service: `rp-server`, `etl`, `api-server`)
  — `createCaptcha()` sinh `{ token, svg }`, lưu đáp án trong `Map` ở bộ
  nhớ (giống `lib/loginRateLimit.js`, đủ cho quy mô thật) kèm hết hạn 5
  phút; `verifyCaptcha(token, answer)` xoá NGAY khỏi `Map` trước khi so
  sánh (dùng 1 lần, kể cả khi sai).
- `GET /api/auth/captcha` (rp-server), `GET /admin/auth/captcha` (etl,
  api-server) — trả `{ token, svg }`, không cần đăng nhập.
- `POST .../auth/login` (cả 3 service) — nhận thêm `captchaToken`/
  `captchaAnswer`, kiểm tra TRƯỚC TIÊN (rẻ, không đụng CSDL) — sai thì trả
  400 "Mã xác nhận không đúng hoặc đã hết hạn" NGAY, chưa tốn 1 lượt tra
  vai trò/rate-limit.
- `components/CaptchaField.jsx` (mới, cả 3 app) — tự tải ảnh lúc mount,
  nút ⟲ lấy ảnh khác, lộ `refresh()` qua ref để `LoginPage.jsx` gọi lại
  SAU MỖI lần submit (đúng hay sai đều phải lấy ảnh mới — token cũ đã
  chết). `AuthContext.jsx:login()` (cả 3 app) nhận thêm 2 tham số
  `captchaToken`/`captchaAnswer`, truyền thẳng vào body `POST .../login`.
- Thêm `svg-captcha` vào `package.json` của `rp-server`/`etl`/`api-server`
  — **PHẢI `npm install` lại trên server lúc deploy** (gói mới, chưa có
  trong `node_modules` hiện tại).
- Đã `npm run build` cả 3 giao diện xác nhận không lỗi; đã viết test tay
  kiểm tra `lib/captcha.js` (đúng/sai/dùng lại token cũ/thiếu tham số/có
  khoảng trắng thừa) — tất cả đúng như thiết kế.

## 8.38 — Giao diện đăng nhập mới: bớt chữ, thêm hình đại diện (3 app)

Theo yêu cầu người dùng: khung "hero" bên trái màn hình Đăng nhập (cả 3
app ETL/API/Report) trước đây có tiêu đề + đoạn văn dài + ghi chú — đổi
sang bớt chữ, thêm 1 hình minh hoạ SVG đại diện riêng cho từng ứng dụng
("hiện đại" hơn, theo đúng demo ảnh đã gửi người dùng xác nhận): ETL = 2
kho dữ liệu trao đổi 2 chiều (đại diện "đồng bộ"), API = 1 node trung tâm
nối 4 node vệ tinh (đại diện "kết nối hệ thống"), Report = khung trình
duyệt với biểu đồ cột tăng dần (đại diện "xem báo cáo"). Chỉ đổi phần
"hero" bên trái — giao diện SAU KHI đăng nhập (sidebar, nội dung từng
trang) KHÔNG đổi gì.

- Thêm `components/LoginHeroIllustration.jsx` (SVG nội tuyến, không tải
  ảnh ngoài) ở cả 3 app — mỗi app 1 bản riêng, màu khớp đúng `--accent`
  sẵn có của app đó (ETL tím, API xanh lá, Report cam).
- `LoginPage.jsx` (cả 3 app) — bỏ `.login-hero-eyebrow`/`<h1>`/`<p>`/
  `.login-hero-note`, thay bằng `<LoginHeroIllustration />` trong khung mờ
  `.login-hero-illust-card` + 1 dòng nhãn nhỏ `.login-hero-bottom-label`
  ở góc dưới.
- `styles.css` (cả 3 app) — thêm `.login-hero-illust-wrap`/`.login-hero-illust-card`/
  `.login-hero-bottom-label`, KHÔNG xoá CSS cũ (`.login-hero h1`/`p`/
  `-note`, phòng khi còn chỗ khác tham chiếu).
- Đã `npm run build` cả 3 app xác nhận không lỗi.

## 8.37 — Báo cáo tràn hết màn hình, bỏ khung hẹp 1040px

Theo yêu cầu người dùng: trang "Báo cáo"/"Báo cáo tự do" (rp-user) dùng
chung class `.page` (max-width 1040px, áp dụng cho MỌI trang) khiến bảng
báo cáo nhiều cột (15-20 cột) luôn phải cuộn ngang dù màn hình desktop còn
thừa rất nhiều khoảng trống bên phải.

- `rp-user/src/styles.css` — thêm `.page--wide { max-width: none; }`,
  KHÔNG đổi `.page` gốc (các trang khác vẫn giữ 1040px, dễ đọc hơn khi để
  hẹp).
- `ReportsPage.jsx`, `AdhocReportPage.jsx` — thêm class `page--wide` cạnh
  `page`. Chỉ 2 trang này đổi, không ảnh hưởng Dashboard/Hệ thống/...

## 8.36 — Thêm nhật ký triển khai gộp (từ bản 8.34)

Theo yêu cầu người dùng: tạo `deploy/Nhật ký triển khai (từ bản 8.34).md`
— gộp CÁC BƯỚC triển khai thật trên server (không phải mô tả tính năng)
của mọi bản từ 8.34 trở đi vào MỘT file duy nhất (mới nhất lên đầu, đã
điền sẵn 8.34/8.35), dễ xem lại liên tục thay vì mở nhiều file riêng từng
bản. Thêm quy tắc TỰ ĐỘNG tương ứng ở đầu file này — áp dụng cho tới khi
người dùng yêu cầu dừng. KHÔNG thay thế file riêng từng bản (`deploy/Cập
nhật bản X.Y — ....md`), vẫn tạo song song như trước giờ. **KHÔNG có thay
đổi code nào.**

## 8.35 — Sửa nguyên nhân THẬT của "Failed to fetch"/"Không kết nối được backend"

Sau khi áp dụng bản 8.33 (tăng timeout Nginx), người dùng vẫn gặp lỗi
tương tự khi Nhập hàng loạt Sync Job 68 dòng — lần này báo "Không kết nối
được backend" (deploy/serve-static.js, dùng khi triển khai KHÔNG qua Nginx
mà qua PM2-only). Tìm ra nguyên nhân THẬT SỰ nằm sâu hơn cả Nginx: chính
`etl/server.js` tự đặt **`server.timeout = 120 * 1000`** (giới hạn không
hoạt động của socket, chống "chờ mãi") ở tầng HTTP server Node — áp dụng
cho MỌI route, kể cả Nhập hàng loạt Sync Job (chạy tuần tự, đối chiếu
schema thật từng dòng qua mạng, dễ vượt 120 giây với vài chục site). Node
tự đóng socket ở ĐÚNG 120 giây bất kể Nginx/serve-static.js có cho phép
chờ lâu hơn hay không — bản 8.33 (tăng timeout Nginx) vì vậy KHÔNG đủ,
phải sửa tận gốc ở đây.

- `etl/routes/admin/syncJobs.js` (`POST /import`), `etl/routes/admin/data-sources.js`
  (`POST /import`) — gọi `req.socket.setTimeout(0)` ngay đầu handler, tắt
  hẳn giới hạn này CHỈ cho 2 route Nhập hàng loạt (route khác vẫn giữ
  120s như cũ, không đổi hành vi chống "chờ mãi" ở nơi khác).
- Bản 8.33 (timeout Nginx) VẪN CẦN GIỮ — đây là lớp chặn thứ 2 (phòng khi
  deploy qua Nginx), 2 lớp cùng phải đủ dài thì Nhập hàng loạt nhiều dòng
  mới chạy hết được.

## 8.34 — Dashboard Top 5 đọc Doanh thu/Giao dịch từ domain "Thành viên"

Theo yêu cầu người dùng: 8 báo cáo "Top 5 chi nhánh" (MART/MINIMART x
Doanh thu/Giao dịch x Cao nhất/Thấp nhất) đổi từ đọc domain gốc
(`doanhthu_chinhanh`/`giaodich_chinhanh`, đồng bộ tập trung mỗi 15 phút,
phủ TOÀN BỘ hệ thống) sang domain "Thành viên"
(`doanhthu_chinhanh_thanhvien`/`giaodich_chinhanh_thanhvien`, Live mỗi 2
phút từng siêu thị — cùng domain Ô "Realtime" đã dùng từ bản 8.28).

**ĐÁNH ĐỔI đã xác nhận với người dùng**: domain "Thành viên" hiện CHỈ có
34 siêu thị (xem "báo cáo doanh thu thành viên.md") — Top 5 giờ CHỈ xếp
hạng trong 34 site đó, các chi nhánh khác tạm thời KHÔNG xuất hiện trong
Top 5 cho tới khi khai báo Live xong toàn bộ. Người dùng đã chọn đổi ngay,
chấp nhận đánh đổi này.

- `rp-server/scripts/seedTop5ChiNhanhReports.js` — thêm hằng số
  `DOMAIN_GOC`/`DOMAIN_THANH_VIEN`/`ACTIVE_DOMAIN` (đổi `ACTIVE_DOMAIN`
  về `DOMAIN_GOC` nếu cần quay lại phủ toàn hệ thống trước khi tất cả siêu
  thị lên Live) — `buildDefinition()` và `upsertReport()` dùng
  `ACTIVE_DOMAIN`/`definition.domain` thay vì hardcode domain gốc.
- **PHẢI chạy lại script sau khi deploy** (script `seed`, không tự áp dụng
  qua merge code — xem `deploy/Cập nhật bản 8.34 — Top 5 đọc domain Thành
  viên.md`): `node scripts/seedTop5ChiNhanhReports.js` để ghi đè 8
  `app.ReportCatalog` hiện có sang domain mới (idempotent, không tạo
  trùng).

## 8.33 — Sửa "Failed to fetch" khi Nhập hàng loạt Sync Job nhiều dòng

Triển khai thật 34 siêu thị Thành viên (68 dòng Sync Job): bấm "Nhập hàng
loạt" báo lỗi trình duyệt **"Failed to fetch"** (không phải lỗi dữ liệu/
JSON nào) — tìm ra nguyên nhân thật là **Nginx**, không phải code Node:
`deploy/nginx.conf` giới hạn chung `proxy_read_timeout 65s` cho toàn bộ
`/admin/`, trong khi Nhập hàng loạt Sync Job đối chiếu schema THẬT của
TỪNG DÒNG qua mạng, CHẠY TUẦN TỰ (không song song, xem
`etl/lib/syncJobsImport.js`) — 68 dòng × 2 lượt gọi mạng/dòng tới từng SQL
Server siêu thị dễ dàng vượt 65 giây. Nginx tự ngắt kết nối giữa chừng dù
backend vẫn đang xử lý bình thường, trình duyệt thấy mất kết nối đột ngột
("Failed to fetch") thay vì 1 lỗi rõ ràng.

- `deploy/nginx.conf` — thêm 1 `location` RIÊNG khớp đúng 2 route Nhập
  hàng loạt (`/admin/sync-jobs/import`, `/admin/data-sources/import`),
  nâng `proxy_read_timeout`/`proxy_send_timeout` lên 600s (10 phút, dư
  nhiều so với quy mô thật) — các route `/admin/` khác vẫn giữ 65s như cũ.
- **Cần áp dụng thủ công trên server đang chạy** (không tự động qua `git
  pull`/`pm2 restart`) — xem `deploy/Cập nhật bản 8.33 — Sửa Failed to
  fetch Nhập hàng loạt.md`.

## 8.32 — Sửa lỗi tương tự ở "File mẫu" Sync Job

Rà lại toàn bộ sau bug 8.31, phát hiện `buildSyncJobsTemplate()`
(`etl/lib/syncJobsImport.js`) bị ĐÚNG lỗi tương tự (đã bỏ sót khi sửa
8.31 — lần đó chỉ soát `dataSourcesImport.js`): cũng thêm 1 dòng hướng
dẫn ("XOÁ/sửa lại 2 dòng ví dụ...") TRƯỚC header, trong khi
`parseSyncJobsFile()` đọc header cứng ở dòng 1. Tải file mẫu Sync Job rồi
xoá chữ dòng 1 (không xoá nguyên dòng) sẽ gặp lỗi "File thiếu cột bắt
buộc" y như bug 8.31.

- Bỏ dòng hướng dẫn, header về đúng dòng 1 (2 dòng ví dụ "ST VIDU" liền
  sau, không đổi nội dung mẫu).
- Đã kiểm tra lại bằng đúng `parseSyncJobsFile()` thật + đối chiếu tên:
  file "Nguồn dữ liệu" (34 dòng) và file "Sync Job" (68 dòng) của 34 siêu
  thị Thành viên (bản 8.30/8.31, gửi riêng người dùng, không lưu Git) đều
  đọc đúng, và toàn bộ `DataSourceName` ở file Sync Job khớp CHÍNH XÁC
  với `Name` ở file Nguồn dữ liệu (không thiếu/thừa tên nào).

## 8.31 — Sửa lỗi "File mẫu" Nguồn dữ liệu (header lệch dòng 2)

Phát hiện khi triển khai thật 34 siêu thị Thành viên (bản 8.30): file do
người dùng gửi (đã điền từ nút "Tải file mẫu" ở trang Nguồn dữ liệu) bị
etl-admin báo "File thiếu cột bắt buộc 'Name'" khi Nhập hàng loạt dù đủ
cột. Nguyên nhân là BUG THẬT trong code, không phải do người dùng điền
sai: `buildDataSourcesTemplate()` (`etl/lib/dataSourcesImport.js`) tạo
file mẫu với **dòng 1 là câu hướng dẫn** ("XOÁ dòng ví dụ (mã VIDU) trước
khi nhập...") rồi mới đến dòng 2 là header thật — nhưng `parseDataSourcesFile()`
đọc header CỨNG ở `sheet.getRow(1)`, không dò dòng nào có "Name". Ai tải
file mẫu, xoá CHỮ ở dòng 1 (chứ không xoá nguyên dòng, dễ hiểu nhầm là chỉ
cần xoá nội dung) rồi điền dữ liệu từ dòng 3, nộp lên luôn lỗi — đúng y
hệt file người dùng gửi ở bản 8.30.

- `buildDataSourcesTemplate()` — bỏ hẳn dòng câu hướng dẫn, header giờ
  nằm đúng dòng 1 (ví dụ nằm dòng 2) — cùng khuôn với
  `buildSyncJobsTemplate()` (`etl/lib/syncJobsImport.js`, không có bug
  này) từ đầu. Nội dung hướng dẫn đã có sẵn đủ ở phần chữ trên trang "Nhập
  hàng loạt" (`DataSourcesPage.jsx`), không mất thông tin gì.
- Đã kiểm tra lại bằng đúng `parseDataSourcesFile()` thật: file mẫu mới +
  file 34 siêu thị Thành viên (bản 8.30, đã gửi riêng người dùng qua kênh
  an toàn, không lưu Git) đều đọc đúng, không còn lỗi.

## 8.30 — Cập nhật tài liệu: danh sách thật 34 siêu thị Thành viên

Người dùng gửi file Excel "Nguồn dữ liệu" đã điền sẵn thông tin kết nối
thật cho 34 siêu thị "Thành viên" (đúng khuôn Nhập hàng loạt có sẵn từ bản
8.13, xem `etl/lib/dataSourcesImport.js`) — dựng sẵn file Excel "Sync Job"
tương ứng (68 dòng, đúng khuôn `etl/lib/syncJobsImport.js`) từ đúng 34 tên
siêu thị đó để nhập theo cặp. **KHÔNG có thay đổi code nào** — chỉ chuẩn bị
dữ liệu triển khai thật + cập nhật "báo cáo doanh thu thành viên.md" (mục
"Trạng thái triển khai thực tế", thêm ngay sau bảng quyết định kiến trúc)
ghi rõ thứ tự 4 bước còn lại (chạy VIEW+etl_reader tại 34 nơi → Nhập Excel
Nguồn dữ liệu → Nhập Excel Sync Job → kiểm tra) để người dùng/IT tự hoàn
tất — 2 file Excel (có mật khẩu thật) KHÔNG lưu vào Git.

## 8.29 — Realtime xuất được Excel/PDF + biểu đồ hiện số theo đơn vị triệu

Theo yêu cầu người dùng: 4 Ô "Realtime" (bảng + biểu đồ, theo ngày/tháng)
giờ xuất được Excel/PDF giống hệt mẫu "Báo cáo doanh thu cuối ngày" (đúng
tiêu đề "Hệ thống siêu thị BRGMART...", đủ cột/nhóm màu, không có Cùng kỳ/
LFL — khớp đúng những gì đang hiện trên tab Realtime). Biểu đồ Realtime
cũng hiện số ngay trên đầu mỗi cột theo đơn vị 1 triệu kèm ghi chú "ĐVT:
1.000.000". **Quy ước mới (người dùng yêu cầu)**: mọi loại Ô/tab dashboard
thêm SAU NÀY mặc định phải xuất được Excel/PDF.

- `rp-server/routes/dashboards.js` — route export: nhận diện
  `tile.kind==='realtime'`, ép `cheDoSoSanh:'past'` khi chạy báo cáo (khớp
  đúng `RealtimeReportTile.jsx`), dùng `resolveTitleWithDate(definition.exportTitle
  || definition.title, ...)` làm tiêu đề tài liệu (thay vì ghép "tên Ô
  (ngày)" kiểu Top 5) để ra đúng tiêu đề BRGMART gốc. `buildSheetName()`
  thêm nhánh riêng cho tile Realtime ("Realtime Ngày"/"Realtime Tháng").
- `rp-user/src/modules/dashboard/DashboardPage.jsx` — nút "Xuất Excel"/
  "Xuất PDF" giờ cũng hiện ở tab Realtime (kể cả đang xem biểu đồ) — LUÔN
  xuất đúng Ô "bảng" của CÙNG giai đoạn (ngày/tháng) đang xem, không xuất
  ảnh biểu đồ (đúng quy ước xuất file hiện có).
- `rp-user/src/components/ReportChart.jsx` — thêm 3 field TUỲ CHỌN vào
  `visualization`: `unitDivisor` (quy đổi trục Y/Tooltip/nhãn cột),
  `showValueLabels` (hiện số trên đầu mỗi cột, dùng `<LabelList>`),
  `unitNote` (ghi chú đơn vị phía trên biểu đồ) — KHÔNG đổi hành vi báo cáo
  nào khác đang dùng `ReportChart` (3 field đều `undefined` mặc định).
- `rp-user/src/modules/dashboard/RealtimeReportTile.jsx` — bật cả 3 field
  trên cho biểu đồ Doanh thu (`unitDivisor: 1_000_000`, `unitNote: 'ĐVT:
  1.000.000'`).
- Đã kiểm tra end-to-end qua mock harness: tiêu đề/cột/nhóm màu file xuất
  khớp đúng mẫu HCRC, biểu đồ hiện đúng số quy đổi + ghi chú đơn vị, nút
  Xuất hoạt động đúng ở cả 2 tab con (bảng/biểu đồ).

## 8.28 — Dashboard "Realtime" chuyển sang đọc Live trực tiếp từng siêu thị (Thành viên)

Theo yêu cầu người dùng: 4 Ô "Realtime" ở Dashboard "Top 5 chi nhánh" (bản
8.24) trước đây tái dùng báo cáo gốc (đồng bộ tập trung mỗi 15 phút) — đổi
sang tái dùng báo cáo "(Thành viên)" (đọc Doanh thu/Giao dịch LIVE TRỰC
TIẾP từng siêu thị mỗi 2 phút, xem "báo cáo doanh thu thành viên.md") — sát
nghĩa "Realtime" hơn hẳn.

- `rp-server/scripts/seedTop5ChiNhanhReports.js` — `REALTIME_REPORT_ID`
  đổi từ `'bc-doanh-thu-hcrc'` sang `'bc-doanh-thu-hcrc-thanh-vien'`. CHỈ
  đổi đúng 1 dòng này, không đụng gì khác ở `RealtimeReportTile.jsx`/
  `DashboardPage.jsx` (đọc `reportId` từ tile một cách chung chung).
- **Phụ thuộc BẮT BUỘC**: 4 Ô Realtime chỉ có số liệu thật khi 70 Sync Job
  "Live (Thành viên)" (35 siêu thị × Doanh thu + Giao dịch, xem
  `etl/scripts/seedThanhVienLiveSync.js`) đã thiết lập + chạy thành công —
  xem mục "Thứ tự triển khai" trong `deploy/Cập nhật bản 8.28 — ...md`.

## 8.27 — Bỏ đồng bộ lặp lại "Cùng kỳ năm trước" cho 2 báo cáo "(Thành viên)"

Người dùng góp ý: 2 báo cáo "(Thành viên)" (HCRC/LDTD) đang đồng bộ RIÊNG
"Cùng kỳ năm trước" (lastYear/lastYearGD) qua 2 Sync Job domain
`_thanhvien` — trong khi dữ liệu THÁNG ĐÃ ĐÓNG SỔ này giống hệt bản gốc (cả
2 domain Lịch sử đều đồng bộ CHUNG 1 VIEW trên `DSMART16_EOM`) — đồng bộ 2
lần là lãng phí, nên cho đọc thẳng domain gốc thay vì tạo thêm job riêng.

- `rp-server/scripts/seedLdtdHcrcReports.js` — `buildDefinition()`: 2 khối
  `lastYear`/`lastYearGD` giờ LUÔN đọc domain GỐC (`DOMAIN_GOC`), bất kể
  đang dựng báo cáo gốc hay "(Thành viên)" — 2 khối `current`/`currentGD`
  (Live) không đổi, vẫn đọc đúng domain của từng bản. **Cần chạy lại
  `node scripts/seedLdtdHcrcReports.js`** để cập nhật DefinitionJson của 2
  báo cáo "(Thành viên)" đã có trong CSDL.
- `etl/scripts/disableThanhVienHistorySync.js` (mới) — tắt (không xoá)
  2 Sync Job "Doanh thu/Giao dịch chi nhánh (Thành viên) - Lịch sử
  (DSMART16_EOM)" nay không còn ai đọc tới (dry-run mặc định, `--confirm`
  mới thực sự tắt) — **chạy SAU KHI** đã chạy lại seed script ở trên.
  `etl/scripts/seedThanhVienHistorySync.js` đánh dấu KHÔNG CÒN CẦN THIẾT,
  giữ lại chỉ để tham khảo lịch sử.
- KHÔNG đụng tới 70 Sync Job "Live" của Thành viên (`seedThanhVienLiveSync.js`,
  đọc trực tiếp từng cửa hàng) — đây mới là phần "Thành viên" thật của kiến
  trúc, vẫn hoạt động như cũ.

## 8.26 — Sửa lỗi "hôm nay" tính theo giờ UTC thay vì giờ Việt Nam

Người dùng test Dashboard trên điện thoại lúc 06:11 sáng, hỏi hệ thống đang
tính "bắt đầu ngày mới" lúc mấy giờ — phát hiện ra: nhiều chỗ tính "hôm nay"
bằng `new Date().toISOString().slice(0,10)` (hoặc `toLocaleDateString()`
không truyền `timeZone`) — các hàm này LUÔN quy đổi theo giờ UTC (hoặc giờ
hệ điều hành máy chủ, đang đặt UTC), không phải giờ Việt Nam (UTC+7). Vì
Việt Nam đi TRƯỚC UTC 7 tiếng, suốt khoảng **00:00-06:59 giờ Việt Nam mỗi
ngày**, UTC vẫn còn ở NGÀY HÔM TRƯỚC — "hôm nay"/nút "Hôm nay"/ngày mặc định
trong khoảng giờ đó bị lùi mất đúng 1 ngày so với lịch thật ở Việt Nam.

- `rp-user/src/lib/dateRange.js` — thêm `todayISO()`, dùng
  `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })` — ĐÚNG
  bất kể múi giờ máy/trình duyệt người xem đang đặt (vd quản lý xem báo cáo
  khi đang ở nước ngoài vẫn thấy đúng "hôm nay" theo giờ Việt Nam, vì toàn bộ
  nghiệp vụ tính theo ngày làm việc Việt Nam).
- `rp-user/src/modules/dashboard/DashboardPage.jsx` — bỏ hàm `todayStr()` cũ
  (dùng `toISOString()`), thay bằng `todayISO()` dùng chung — sửa mặc định
  "Từ ngày/đến ngày", nút "Hôm nay", và `max` của 2 ô chọn ngày.
- `rp-user/src/modules/reports/AdhocReportPage.jsx` — `defaultDateRange()`
  sửa tương tự (tính `dateFrom` trực tiếp trên chuỗi ngày thay vì dựng lại
  Date rồi format lại).
- `rp-server/lib/compositeReportRunner.js` — thêm `vietnamTodayISO()`
  (MIRROR lại `todayISO()` phía client), dùng cho "hôm nay" mặc định của MỌI
  báo cáo composite khi không truyền `filters.eventDate` (gọi thẳng API,
  hoặc trang chưa kịp chọn ngày).
- `rp-server/routes/dashboards.js` — sửa tương tự cho "hôm nay" mặc định lúc
  xuất Excel/PDF không truyền `fromDate`/`toDate`.
- `rp-server/jobs/reportEmailScheduler.js` — thêm `timeZone: 'Asia/Ho_Chi_Minh'`
  cho `toLocaleDateString()` dùng trong token `{ngay}` của tiêu đề email tự
  động gửi theo lịch.

## 8.25 — Sửa lỗi ETL: job đồng bộ đứng yên trong ngày khi UpdatedAtColumn là cột ngày không giờ

Người dùng phát hiện (qua Nhật ký hệ thống thật) job "Doanh thu/Giao dịch
chi nhánh - Live" báo SUCCESS liên tục mỗi 5 phút nhưng "Không có dòng nào
thay đổi kể từ <đúng 00:00:00 hôm đó>" suốt NGUYÊN NGÀY, dù giao dịch vẫn
phát sinh liên tục (đối chiếu với báo cáo nguồn khác do DBA cung cấp, số
liệu đã thay đổi nhiều). Cùng lúc, điều tra sâu 1 vụ việc khác (Giao dịch
chi nhánh thiếu hẳn "Cùng kỳ năm 2025" dù VIEW nguồn và dữ liệu `BU_ID` đều
đầy đủ) hé lộ CÙNG 1 NGUYÊN NHÂN GỐC.

- **Nguyên nhân**: nhiều VIEW/bảng nguồn (vd `V_HCRC_GIAODICH_CHINHANH`,
  `V_HCRC_DOANHTHU_CHINHANH` trên `DSMART16`/`DSMART16_EOM`) không có cột
  "cập nhật lúc" thật — lúc khai Sync Job, `UpdatedAtColumn` đành trỏ TRÙNG
  `DateColumn` (vd `TRAN_DATE`, kiểu `DATE` KHÔNG CÓ GIỜ). Lượt đồng bộ đầu
  tiên bắt được 1 dòng bất kỳ của 1 ngày sẽ chốt mốc (watermark) = đúng
  00:00:00 ngày đó — `WHERE UpdatedAtColumn > mốc` từ đó về sau trong
  NGUYÊN NGÀY đó sẽ loại HẾT các dòng MỚI phát sinh thêm (cũng mang giá trị
  ngày y hệt, KHÔNG lớn hơn mốc) — job vẫn chạy "thành công" nhưng số liệu
  đứng yên tới tận ngày hôm sau.
- `etl/lib/tableSyncEngine.js` — thêm `floorToDay()` (đưa mốc về đúng
  00:00:00 UTC của ngày đó) + đổi điều kiện lọc từ `>` thành `>=` khi build
  câu truy vấn — buộc MỌI lượt chạy quét lại TRỌN NGÀY của mốc hiện tại
  thay vì chỉ phần "sau mốc". An toàn tuyệt đối vì cơ chế ghi
  (`upsertReportFacts`) là MERGE idempotent — quét lại dòng đã có không tạo
  trùng/sai, chỉ tốn thêm tối đa 1 ngày dữ liệu mỗi lượt chạy. Áp dụng
  chung cho MỌI Sync Job kiểu "table" (không riêng Doanh thu/Giao dịch chi
  nhánh), vá triệt để cả lớp lỗi này về sau.
- Đã xác nhận qua log thực tế: Doanh thu/Giao dịch chi nhánh Live đứng yên
  nguyên ngày 01/10/2026; Giao dịch chi nhánh Lịch sử thiếu hẳn dữ liệu năm
  2025 dù job từng chạy SUCCESS với số dòng lớn (135k-145k) — cùng 1 cơ chế
  lỗi. **Cần chạy lại `etl/scripts/resyncGiaodichChinhanh.js --confirm`**
  (SAU khi deploy bản vá này) để backfill lại đầy đủ lịch sử Giao dịch chi
  nhánh — xem `deploy/Cập nhật bản 8.25 — ...md`.

## 8.24 — Dashboard tự động làm mới 30s + báo cáo "Doanh thu Realtime HCRC"

Người dùng yêu cầu 2 việc độc lập trên Dashboard: (1) tự động làm mới số
liệu mỗi 30 giây (không cần bấm lại/F5), (2) thêm báo cáo "doanh thu
realtime" lấy TOÀN BỘ chi nhánh (không chỉ Top 5), đúng khuôn báo cáo
"Báo cáo doanh thu cuối ngày HCRC" đã có sẵn nhưng bỏ cột Cùng kỳ/LFL, có
cả bảng lẫn biểu đồ (chỉ Doanh thu). Đã gửi demo (ảnh chụp + đếm số lượt
gọi `/run` qua Playwright) và được xác nhận trước khi merge.

- `rp-user/src/modules/dashboard/DashboardPage.jsx` — `refreshTick` tăng
  mỗi 30 giây qua `setInterval`, truyền xuống `DashboardTile`/
  `Top5ChartTile`/`RealtimeReportTile` làm dependency fetch lại dữ liệu;
  `lastRefreshedAt` hiện giờ "cập nhật lúc" + nút "Làm mới ngay" bấm tay.
  **Không xoá state cũ trước khi fetch lại** (xem `Top5ChartTile.jsx`) nên
  không nhấp nháy "Đang tải..." mỗi 30 giây.
- `rp-user/src/modules/dashboard/RealtimeReportTile.jsx` (mới) — tái dùng
  NGUYÊN báo cáo "bc-doanh-thu-hcrc" đã có (xem
  `scripts/seedLdtdHcrcReports.js`) qua `ReportBody` đã có sẵn, KHÔNG viết
  lại logic báo cáo: luôn ép `filters.cheDoSoSanh = 'past'` (ẩn cột Cùng
  kỳ/LFL), `mode='table'` hiện bảng đầy đủ, `mode='chart'` hiện biểu đồ chỉ
  1 cột "Doanh thu - Thực đạt" (`visualization` dựng tạm ở client, không
  đụng `definition.visualization` của báo cáo gốc trên CSDL — báo cáo gốc
  vẫn xem/xuất bình thường như cũ). 4 tab mới trong Dashboard: Realtime
  Theo ngày/Theo tháng (cộng dồn) x Bảng/Biểu đồ — xem
  `DashboardPage.jsx:buildRealtimeTabs()`. Xuất Excel/PDF CHƯA hỗ trợ cho
  4 tab này (nút Xuất tự ẩn khi đang xem tab Realtime).
- `scripts/seedTop5ChiNhanhReports.js` — thêm `REALTIME_TILES` (4 ô, tham
  chiếu thẳng `reportId: 'bc-doanh-thu-hcrc'`, không tạo report mới) vào
  Dashboard "Top 5 chi nhánh" đã có — **cần chạy lại script này** (SAU
  `scripts/seedLdtdHcrcReports.js` ít nhất 1 lần) để 4 ô Realtime xuất hiện.
- Lưu ý nghiệp vụ: báo cáo "bc-doanh-thu-hcrc" có `requireTargetMatch`
  (chi nhánh chưa nhập Chỉ tiêu bị ẩn khỏi báo cáo) — người dùng xác nhận
  Chỉ tiêu luôn được nhập đầu tháng nên không cần xử lý gì thêm.

## 8.23 — Dashboard "Top 5 chi nhánh": "Trong tháng" tính đủ cả tháng + bộ lọc Từ ngày-đến ngày

Người dùng phát hiện "Trong tháng" (bản 8.20) thực ra là "từ đầu tháng tới
đúng ngày đã chọn" (month-to-date) — không phải "CẢ tháng" như yêu cầu, dễ
nhầm khi 2 cột ra cùng 1 số (đúng vào ngày 1 đầu tháng). Cũng yêu cầu thêm
bộ lọc "Từ ngày — đến ngày" (đúng tinh thần yêu cầu gốc) thay vì 1 ô ngày
duy nhất, và tiêu đề mỗi ô phải hiện rõ ngày/tháng đang xem thay vì nhãn
tĩnh "(Trong ngày)"/"(Trong tháng)".

- `rp-user/src/lib/dateRange.js` (mới) — `computeEventDateRange(dateMode,
  fromDate, toDate)`: `'month'` giờ LUÔN lấy trọn tháng chứa `toDate` (ngày 1
  tới ngày cuối cùng, không dừng ở `toDate` nữa); `periodLabelFor()` sinh
  nhãn động ("15/09/2026", "05/09/2026 - 15/09/2026", "Tháng 9/2026") thay
  nhãn tĩnh. MIRROR lại ở `routes/dashboards.js` (dùng khi xuất Excel/PDF).
- `DashboardPage.jsx` — bộ lọc 1 ô "Ngày báo cáo" đổi thành 2 ô "Từ ngày —
  đến ngày" (mặc định cả 2 = hôm nay, tự đẩy ngày kia nếu chọn ngược).
  `DashboardTile.jsx`/`Top5ChartTile.jsx` nhận `fromDate`/`toDate` thay
  `reportDate`, tự ghép nhãn động vào cuối `tile.title`.
- `scripts/seedTop5ChiNhanhReports.js` — bỏ hậu tố tĩnh
  "(Trong ngày)"/"(Trong tháng)" khỏi `tile.title` (giờ tính động ở trên) —
  **cần chạy lại script này** để cập nhật tiêu đề 16 Ô trong CSDL.

## 8.22 — Tài liệu "Hướng dẫn cấp quyền SQL Server cho 4 CSDL"

Người dùng yêu cầu 1 hướng dẫn gộp các câu lệnh SQL cấp quyền cho tài khoản
CSDL đang dùng ở cả 4 CSDL nội bộ (dwh/etl/api/rp) — liên quan trực tiếp tới
lỗi *"The UPDATE permission was denied on the object 'SalesTargets'..."*
gặp phải sau khi đổi/khôi phục máy chủ SQL Server mới.

- File mới `deploy/Hướng dẫn cấp quyền SQL Server cho 4 CSDL (dwh, etl,
  api, rp).md` — TỔNG HỢP lại 4 file `grants.sql` ĐÃ CÓ SẴN trong mã nguồn
  (`dwh/grants.sql`, `etl-db/grants.sql`, `api-db/grants.sql`,
  `rp-db/grants.sql` — không phải SQL mới viết), gồm: bảng tổng quan 7 tài
  khoản CSDL (`etl_writer`/`rpt_reader`/`dwh_target_importer`/`etl_admin`/
  `etl_diem_stk_reader`/`api_admin`/`rp_app`) × CSDL × phạm vi quyền, thứ tự
  chạy khi dựng CSDL mới, SQL đầy đủ từng CSDL, bảng đối chiếu biến `.env`
  cần khớp, câu SQL chẩn đoán quyền thật sự đang có (`fn_my_permissions`), và
  lưu ý riêng cho tình huống đổi/khôi phục server mới (login KHÔNG đi theo
  backup CSDL, luôn phải chạy lại `grants.sql`). Làm rõ `etl_reader` (tài
  khoản đọc 35 CSDL DSMART16 "Thành viên") KHÔNG liên quan tới 7 tài khoản
  nội bộ này.

## 8.21 — Dashboard "Top 5 chi nhánh": đóng khung màu + biểu đồ + xuất Excel/PDF

Người dùng xác nhận demo bản 8.20, yêu cầu thêm: (1) đóng khung/tô màu bảng
cho chuyên nghiệp hơn + làm tròn/ngăn cách hàng nghìn khớp đúng file xuất,
(2) 2 tab biểu đồ mới "Biểu đồ doanh thu"/"Biểu đồ giao dịch", (3) xuất được
Excel/PDF ngay ở Dashboard với màu sắc giống web.

- `rp-user/src/lib/formatCell.js` (mới) + `components/ReportBody.jsx` — làm
  tròn (nửa lên) + dấu phẩy ngăn cách hàng nghìn khi hiện bảng web, MIRROR
  đúng `lib/reportCellFormat.js:formatCellText()` đã dùng lúc xuất Excel/PDF
  — ÁP DỤNG CHO MỌI bảng báo cáo trên web (không riêng Dashboard), sửa luôn
  chỗ lệch giữa xem web (trước đây hiện số thập phân thô) và xuất file.
- `DashboardTile.jsx`/`styles.css` — `tile.tone` ('high'/'low', suy từ
  reportId "-cao"/"-thap") tô viền trên xanh lá/cam cho từng thẻ, nhãn nhóm
  MART/MINIMART thành khung bo tròn, vân sọc xen kẽ dễ đọc hàng.
- `Top5ChartTile.jsx` (mới, lazy-load theo đúng cách ReportChart.jsx đã làm
  để KHÔNG kéo recharts vào chunk chính) — biểu đồ cột ngang gộp Top 5 MART
  + MINIMART của 1 giai đoạn, tô màu theo chuỗi + nhãn số trên cột.
  `DashboardPage.jsx` thêm 2 tab "Biểu đồ doanh thu"/"Biểu đồ giao dịch"
  (tổng 4 tab = 2 chỉ tiêu x 2 cách xem).
- `routes/dashboards.js` — `POST /:dashboardId/export` (mới): xuất Excel/PDF
  cho ĐÚNG các Ô đang hiện trên web (body.tileKeys, lọc lại theo quyền báo
  cáo — không tin thẳng key client gửi), tô màu xanh/cam theo tone bằng
  CHÍNH cơ chế `columnGroups` đã có sẵn. `lib/exportExcel.js` thêm
  `exportMultiSheetExcel()` (1 sheet/báo cáo, tên sheet rút ngắn giữ đầu+đuôi
  khi >31 ký tự). `lib/exportPdf.js` thêm `mergePdfBuffers()` (ghép nhiều PDF
  đã xuất riêng qua `exportPdf()` — KHÔNG đụng vào logic vẽ bảng phức tạp đã
  có, tránh rủi ro lặp lại 2 lỗi tinh vi đã gặp ở bản 8.18).

## 8.20 — Dashboard "Top 5 chi nhánh"

Người dùng yêu cầu 1 Dashboard mới: 8 ô "Top 5" = {MART, MINIMART} x {Cao
nhất, Thấp nhất doanh thu} x {Trong ngày, Trong tháng}, mỗi ô xếp hạng theo
Doanh thu kèm cột Giao dịch tham khảo — đã demo ảnh phác thảo trước, người
dùng phát hiện ca lệch pha (chi nhánh nhiều giao dịch giá trị nhỏ có thể
KHÔNG lọt top Doanh thu dù đứng đầu Giao dịch) nên chốt phương án cuối:
tách 2 tab độc lập "Xếp theo Doanh thu"/"Xếp theo Giao dịch" (16 ô, chỉ
hiện 8 ô đúng tab đang chọn).

- `lib/compositeReportRunner.js` — thêm `DefinitionJson.topN` (field, direction,
  limit, filterField/filterValue tuỳ chọn) — xếp hạng TOÀN BỘ thực thể đã
  ghép theo 1 field, cắt lấy N dòng đầu, tự đánh số "stt" 1..N ngay lúc chạy
  (khác cột "stt" thường — chỉ đánh số lúc xuất Excel/PDF) — KHÔNG có dòng
  "Tổng cộng" như `groupBy`, kiểm tra TRƯỚC `groupBy` nếu lỡ khai cả 2.
- `scripts/seedTop5ChiNhanhReports.js` (mới) — tạo/cập nhật 8 báo cáo
  `top5-{mart,minimart}-{doanhthu,giaodich}-{cao,thap}` (đọc domain
  `doanhthu_chinhanh`/`giaodich_chinhanh` đã có sẵn, dùng lại
  `useDiemStkMapping`/`mapBuIdToMaDiem`/`requireDiemStkMapping` y hệt 4 báo
  cáo doanh thu cuối ngày) + 1 Dashboard `top5-chi-nhanh` ghép 16 Ô (8 báo
  cáo x 2 "Trong ngày"/"Trong tháng" — CHỈ khác khoảng `eventDate` truyền
  lúc chạy, không phải 2 định nghĩa báo cáo riêng).
- `DashboardTile.jsx` — thêm `tile.dateMode` ('day'/'month', TUỲ CHỌN) — tự
  tính `eventDate` từ 1 "ngày báo cáo" dùng chung (prop `reportDate`) thay
  vì nhận filters cố định, cho phép 2 Ô CÙNG 1 báo cáo hiện song song
  "Trong ngày"/"Trong tháng".
- `DashboardPage.jsx` — thêm (đều TUỲ CHỌN, CHỈ hiện khi tile khai field
  tương ứng — dashboard khác không đổi giao diện): bộ lọc "Ngày báo cáo" (1
  ngày, mặc định hôm nay — "Trong ngày"/"Trong tháng" tự suy ra từ đây,
  đúng yêu cầu "mặc định ngày hiện tại và tháng hiện tại"), tab theo
  `tile.metricTab` (Doanh thu/Giao dịch), nhóm Ô theo `tile.chain`
  (MART/MINIMART).

Admin cần: chạy `node scripts/seedTop5ChiNhanhReports.js` + gán quyền xem 8
báo cáo "Top 5 ..." (Hệ thống → Phân quyền) — xem
`deploy/Cập nhật bản 8.19-8.20 — ...md`.

## 8.19 — Tài liệu "phân quyền.md" — tạo tài khoản + gán quyền cả 3 hệ thống

Người dùng yêu cầu 1 file hướng dẫn đầy đủ cho tạo tài khoản + phân quyền
ở cả 3 hệ thống quản trị (ETL, API, Report) — khảo sát lại CODE THẬT (không
dựa vào tài liệu cũ) trước khi viết, vì phát hiện mục "4. Phân quyền" ở
`deploy/Hướng dẫn nghiệp vụ.md` mô tả mô hình CŨ (3 vai trò cố định
`admin`/`viewer`/`target_importer`) đã bị thay thế hoàn toàn từ bản 6.28
bằng mô hình Vai trò tuỳ ý + gán quyền theo trang.

- File mới `phân quyền.md` (gốc repo) — gồm: cách tạo tài khoản + tạo vai
  trò + gán quyền ở từng hệ thống (etl-admin/api-admin dùng chung 1 mô
  hình 2 chiều Xem/Sửa theo trang; rp-user dùng mô hình RIÊNG, phong phú
  hơn — 3 LỚP quyền độc lập: Menu được thấy / Báo cáo được chạy / Domain
  được tự khám phá), bảng tra cứu đầy đủ MenuCode ↔ tên trang sidebar của
  cả 3 hệ thống, cách nâng 1 tài khoản lên "vai trò hệ thống" (toàn quyền —
  KHÔNG tạo mới được qua UI, chỉ gán vào đúng 1 vai trò đã seed sẵn), và
  mục bảo mật dùng chung (băm mật khẩu bcrypt, 2FA bắt buộc cho vai trò hệ
  thống, cách xử lý khi mất mã khôi phục 2FA).
- `deploy/Hướng dẫn nghiệp vụ.md` mục "4. Phân quyền" (và các bảng liên
  quan ở mục 5-6) ĐÃ LỖI THỜI — `phân quyền.md` thay thế hoàn toàn mục đó,
  CHƯA sửa trực tiếp file cũ (nằm ngoài phạm vi yêu cầu lần này, cần dọn
  lại sau để tránh 2 nguồn thông tin lệch nhau).

## 8.18 — Xuất PDF 4 báo cáo doanh thu ép vừa đúng 1 trang khổ dọc

Người dùng gửi file PDF mẫu tham khảo (đối chiếu MediaBox xác nhận đúng A4
DỌC 596×842, không phải khổ ngang) — yêu cầu 4 báo cáo doanh thu (LDTD/HCRC
gốc + Thành viên) khi xuất PDF phải "xoay dọc và chữ nhỏ để đúng 1 trang"
giống file mẫu, thay vì khổ ngang nhiều trang như trước.

- `rp-server/lib/exportPdf.js` — thêm cờ `definition.compactSinglePage`
  (CHỈ 4 báo cáo doanh thu khai cờ này qua `seedLdtdHcrcReports.js`, KHÔNG
  đổi cách xuất PDF của báo cáo khác trong hệ thống): khổ A4 DỌC CỐ ĐỊNH
  (không mở rộng theo nội dung như nhánh mặc định), TỰ ĐỘNG dò cỡ chữ giảm
  dần (8pt xuống sàn 4pt, bước 0.25) cho tới khi TOÀN BỘ bảng (mọi cột +
  mọi dòng, kể cả 3 dòng "Tổng cộng") vừa đúng 1 trang — số chi nhánh có
  thể tăng theo thời gian (Thành viên) nên KHÔNG dùng cỡ chữ cố định, dò
  động mỗi lần xuất. Nếu tới sàn 4pt vẫn không đủ (quá nhiều dòng), chấp
  nhận tràn trang 2 thay vì chữ nhỏ tới mức không đọc được.
- Phát hiện + sửa 1 lỗi thật lúc kiểm tra bằng render thử: đệm (padding) đo
  bề rộng cột lúc TÍNH và lúc VẼ THẬT dùng 2 công thức khác nhau, khiến ô
  vừa đủ theo tính toán vẫn bị vẽ cắt "…" — thống nhất lại 1 công thức đệm
  duy nhất dùng chung cho cả đo lẫn vẽ. Cũng sửa chiều cao hàng tiêu đề từ
  công thức đoán cố định sang MÔ PHỎNG wrap chữ thật (đếm đúng số dòng cần
  cho nhãn dài như "Cùng kỳ năm 2025" ở cỡ chữ/bề rộng cột rất nhỏ) — công
  thức cũ đoán thiếu, chữ tiêu đề chồng lên dòng dữ liệu đầu tiên.
- Đã kiểm chứng bằng render thử thật (không chỉ đọc code): 36 dòng/17 cột
  (khớp đúng file mẫu) ra đúng 1 trang, cỡ chữ 6.5pt, không ô nào bị cắt;
  trường hợp ít dòng (1 dòng) giữ cỡ chữ lớn 8pt (không co nhỏ không cần
  thiết); trường hợp 0 dòng không lỗi; nhánh KHÔNG khai cờ (báo cáo khác)
  render y hệt như trước bản này (khổ ngang, cỡ chữ 8pt cố định).
- Xuất Excel KHÔNG đổi — người dùng chỉ gửi file mẫu PDF, chưa yêu cầu gì
  cho Excel (Excel không có khái niệm "1 trang" khi xem trên máy, chỉ liên
  quan lúc in — để nguyên, làm riêng nếu sau này có yêu cầu).

## 8.17 — Thêm "Tải file mẫu" cho Nhập hàng loạt Nguồn dữ liệu/Sync Job

Người dùng nhận ra 2 trang Nhập hàng loạt mới ở bản 8.13 (Nguồn dữ liệu,
Sync Job) thiếu nút "Tải file mẫu" — trong khi các trang Nhập hàng loạt
khác đã có sẵn từ trước (Chỉ tiêu, Ánh xạ Điểm - STK_ID, Danh sách hàng
Core). Bổ sung cho nhất quán, theo đúng khuôn `lib/xlsxResponse.js`/route
`GET .../template` đã dùng ở các trang kia:

- `buildDataSourcesTemplate()` (`etl/lib/dataSourcesImport.js`) — 1 dòng
  ví dụ ("VIDU"), route `GET /admin/data-sources/template`.
- `buildSyncJobsTemplate()` (`etl/lib/syncJobsImport.js`) — 2 dòng ví dụ
  đã điền SẴN đúng khuôn báo cáo doanh thu Thành viên (Doanh thu + Giao
  dịch), chỉ cần đổi `Name`/`DataSourceName` theo từng cửa hàng — route
  `GET /admin/sync-jobs/template`.
- Nút "Tải file mẫu" thêm vào `DataSourcesPage.jsx`/`SyncJobsPage.jsx`,
  ngay cạnh ô chọn file, cùng vị trí/kiểu với các trang Nhập hàng loạt khác.

## 8.16 — Hướng dẫn triển khai bản 8.10 → 8.15 cho IT (deploy/)

Người dùng đang chạy bản 8.10 trên máy chủ thật, cần hướng dẫn deploy
"chuẩn xác" gộp mọi thay đổi tới bản 8.15 để đưa cho IT team — thêm
`deploy/Cập nhật bản 8.10-8.15 — Lãi gộp lịch sử + Báo cáo Thành viên.md`
(theo đúng khuôn các file `deploy/Cập nhật bản ...` đã có). Đã đối chiếu
`git diff 72d13c9 HEAD` (72d13c9 = đúng commit bản 8.10) để liệt kê CHÍNH
XÁC file nào đổi — xác nhận KHÔNG có `schema.sql` nào thay đổi (bỏ qua bước
chạy lại schema so với các đợt trước), CHỈ `etl` có đổi code chạy nền (cần
`pm2 restart etl`), CHỈ `etl-admin`/`rp-user` cần build lại (`api-admin`/
`rp-server`/`api-server` không đổi code chạy nền hoặc giao diện đợt này).
**Quy ước MỚI** (người dùng yêu cầu): từ nay, mỗi khi xuất bản hướng dẫn
triển khai dạng file (`.docx` gửi người dùng), CẬP NHẬT LUÔN 1 bản tương
ứng vào thư mục `deploy/` trong mã nguồn — không chỉ gửi rời trong hội
thoại.

## 8.15 — Tự động hoá tạo Nguồn dữ liệu/Sync Job/Phân quyền cho 35 cửa hàng Thành viên

Người dùng yêu cầu viết sẵn thành CODE thay vì chỉ hướng dẫn bấm tay/Excel
70+ dòng — 2 script mới:

- `etl/scripts/seedThanhVienLiveSync.js` — mảng cấu hình `STORES` (35 dòng,
  `name`/`server`/`password`, `Username` cố định `etl_reader` theo đúng yêu
  cầu) ở đầu file, người dùng tự sửa IP/mật khẩu thật rồi chạy 1 lệnh — tự
  tạo/cập nhật ĐỦ 35 Nguồn dữ liệu + tối đa 70 Sync Job (idempotent). Cửa
  hàng chưa kết nối được (còn giá trị mẫu `CHANGE_ME`/VIEW Bước 1 chưa tạo)
  vẫn có Nguồn dữ liệu nhưng BỊ BỎ QUA tạo Sync Job, in rõ lý do — chạy lại
  an toàn sau khi sửa, không ảnh hưởng cửa hàng đã thành công.
- `rp-server/scripts/seedThanhVienReportPermissions.js` — copy NGUYÊN VẸN
  `app.RoleReportAccess` từ 2 báo cáo gốc sang 2 báo cáo "Thành viên" tương
  ứng (đúng yêu cầu "gán quyền giống 2 báo cáo kia"), không cần đụng
  `app.RoleMenuAccess` (cả 4 báo cáo dùng chung 1 MenuItemId).
- "báo cáo doanh thu thành viên.md" — gộp Bước 2+3 thành 1 bước, thêm script
  ở cách 1 (khuyên dùng), giữ nguyên 3 cách cũ (tay/Excel/file mã hoá) làm
  phương án thay thế; Bước 6 thêm script ở cách 1, giữ nguyên tay ở cách 2.

## 8.14 — Chép nguyên văn 2 VIEW (Script A) vào "báo cáo doanh thu thành viên.md"

Bước 1 của tài liệu bản 8.13 chỉ THAM CHIẾU "Script A" ở "báo cáo doanh thu
cuối ngày.md" — theo yêu cầu người dùng, chép NGUYÊN VĂN 2 câu `CREATE OR
ALTER VIEW` (`V_HCRC_DOANHTHU_CHINHANH`/`V_HCRC_GIAODICH_CHINHANH`, công
thức `SURPLUS`/`TRANS_CODE` bản 8.10) thẳng vào tài liệu này — IT triển
khai tại từng cửa hàng không cần mở thêm file khác, chỉ đọc 1 tài liệu duy
nhất từ đầu đến cuối. File "báo cáo doanh thu cuối ngày.md" vẫn giữ nguyên
làm nguồn tham khảo đầy đủ lịch sử/lý do chọn công thức, không bắt buộc đọc
để triển khai.

## 8.13 — Báo cáo doanh thu "Thành viên" — Live đọc trực tiếp từng cửa hàng (35 CSDL)

Yêu cầu mới: 35 siêu thị/cửa hàng "Thành viên" mỗi nơi chạy CSDL DSMART16
RIÊNG — cần 2 báo cáo mới đọc Doanh thu/Giao dịch Live TRỰC TIẾP từng cửa
hàng (không qua bước tổng hợp về CSDL trung tâm như 2 báo cáo gốc), trong
khi phần Lịch sử ("Cùng kỳ năm trước") vẫn giữ tập trung tại trung tâm.
Kiến trúc đã cân nhắc và LOẠI phương án "đọc thẳng VIEW mỗi lần xem báo
cáo" (rp-server phải mở kết nối trực tiếp 35 CSDL bán hàng thật mỗi request
— rủi ro tải/tốc độ/bảo mật) — giữ nguyên mô hình qua `dwh.ReportFacts`
như mọi domain khác, chỉ rút ngắn chu kỳ đồng bộ Live xuống `*/2 * * * *`
cho riêng domain này. Xem đầy đủ ở "báo cáo doanh thu thành viên.md" (mới).

- 2 domain mới `doanhthu_chinhanh_thanhvien`/`giaodich_chinhanh_thanhvien`
  — cơ chế ETL sẵn có (N Nguồn dữ liệu → 1 Domain, gộp qua
  `(SourceSystem, Domain, EntityCode, EventDate)`) áp dụng thẳng, không cần
  sửa lõi `tableSyncEngine.js`/`compositeReportRunner.js`.
- **Sync Job giờ có Nhập hàng loạt** (`etl/lib/syncJobsImport.js`, route
  `POST /admin/sync-jobs/import`, UI ở `SyncJobsPage.jsx`) — trước bản này
  chỉ `etl.DataSources` có tính năng này. Tạo/sửa hàng loạt job Type='table'
  qua Excel, mỗi dòng vẫn được đối chiếu schema THẬT của nguồn (như tạo qua
  form) trước khi ghi — job đã có nhưng khác Nguồn dữ liệu/bảng nguồn với
  dòng Excel bị BÁO LỖI thay vì tự đổi (đúng quy tắc Sửa job đã có).
  `assertTableConfigMatchesSchema`/`validateTableJobSchema` tách ra
  `etl/lib/syncJobSchemaValidation.js` dùng chung giữa form và Nhập hàng
  loạt (trước đó chỉ định nghĩa trong `routes/admin/syncJobs.js`).
- **Xuất/Nhập file MÃ HOÁ cho Nguồn dữ liệu** (`etl/lib/dataSourcesEncryptedExport.js`,
  route `GET /admin/data-sources/export` + `POST /admin/data-sources/import-encrypted`,
  tách riêng khỏi `POST /import` Excel-plaintext đã có) — file `.hcrcenc`
  KHÔNG mở được bằng công cụ nào ngoài chính hệ thống (mã hoá cả khối bằng
  `ETL_ENCRYPTION_KEY`, tái dùng `lib/crypto.js` nên tự động thừa hưởng cơ
  chế xoay khoá đã có). Mật khẩu giữ NGUYÊN dạng ciphertext đã có trong
  CSDL khi xuất/nhập — không giải mã rồi mã hoá lại, không có thời điểm nào
  mật khẩu tồn tại dạng chữ thường ngoài CSDL gốc.
- `etl/scripts/seedThanhVienHistorySync.js` (mới) — tạo 2 Sync Job "Lịch sử
  (Thành viên)" tái dùng NGUYÊN VẸN Nguồn dữ liệu "DSMART16 - Lịch sử" +
  VIEW Script B đã có (không sửa gì ở CSDL trung tâm).
- `rp-server/scripts/seedLdtdHcrcReports.js` — `buildDefinition()` viết lại
  để nhận domain Doanh thu/Giao dịch làm THAM SỐ (trước đóng cứng hằng số),
  thêm 2 báo cáo `bc-doanh-thu-ldtd-thanh-vien`/`bc-doanh-thu-hcrc-thanh-vien`
  — NỘI DUNG giống hệt 2 báo cáo gốc (dùng chung domain chỉ tiêu
  `sales-targets-*` và bảng "Ánh xạ Điểm - STK_ID" hiện có, KHÔNG tạo thêm
  luồng upload nào — theo đúng yêu cầu người dùng), chỉ khác domain Doanh
  thu/Giao dịch. Script giờ tạo/cập nhật CẢ 4 báo cáo trong 1 lượt chạy.
- CÒN MỞ (ghi rõ trong "báo cáo doanh thu thành viên.md"): giả định
  `STK_ID`/`BU_ID` tại VIEW mỗi cửa hàng trùng mã đã khai trong "Ánh xạ
  Điểm - STK_ID" — cần DBA/IT xác nhận; watermark `UpdatedAtColumn =
  DateColumn` cho job Live "Thành viên" (giống 2 báo cáo gốc) nghĩa là sửa
  công thức VIEW sau này sẽ cần script resync riêng (như đợt bản 8.5), chưa
  viết trước vì chưa cần.

## 8.12 — Script B (Lịch sử): đổi hẳn sang `SURPLUS`/`TRANS_CODE`, giải quyết "Lãi gộp lịch sử sai" từ bản 8.1

Bản 8.10 mới sửa Script A (Live, CSDL `DSMART16`) sang công thức
`SURPLUS`/`TRANS_CODE`; Script B (Lịch sử, CSDL `DSMART16_EOM`, phục vụ
"Cùng kỳ năm trước") vẫn còn dùng `COSTPRICE` (đã biết sai từ bản 8.1).
Kiểm tra bằng dữ liệu thật: cả `STRANS_EOM` (vùng đệm) lẫn `STRANS_202608`
(bảng lưu trữ tháng gần nhất) đều có đủ `SURPLUS`/`TRANS_CODE` — DBA gửi
thẳng câu lệnh mẫu dùng đúng công thức này trên `STRANS_202510`. Viết lại
CẢ 2 VIEW ở Script B (Doanh thu VÀ Giao dịch) theo ĐÚNG công thức Script A
bản 8.10 (nguồn UNION ALL toàn bộ bảng `STRANS_YYYYMM`/`STRANS_EOM` thay vì
1 bảng `STRANS`) — Giao dịch cũng chuyển từ `TRANSHDR_ARC` sang cùng nguồn
`STRANS_YYYYMM`/`STRANS_EOM`, giống thay đổi đã làm ở Script A.

- CỐ Ý KHÁC 2 điểm so với câu lệnh mẫu DBA gửi (đã hỏi lại, người dùng xác
  nhận giữ nguyên logic đã chốt ở Script A): KHÔNG `LEFT(BU_ID,3)` (giữ
  `BU_ID` đầy đủ, quyết định từ bản 7.3) và KHÔNG thêm `BU_ID<>'10000'` —
  áp dụng NHẤT QUÁN cùng phạm vi giữa Script A và Script B.
- Thêm `WITH (NOLOCK)` vào từng bảng con trong UNION ALL (theo đúng mẫu
  DBA gửi) và lọc `TRANS_CODE`/`STATUS` ngay trong từng bảng con (tối ưu
  riêng cho Script B — giảm khối lượng quét trước khi UNION ALL ~93 bảng).
- Stored procedure `sp_HCRC_RebuildDoanhThuView` (giữ nguyên tên dù giờ
  dựng lại cả 2 VIEW, tránh phải sửa lại SQL Server Agent Job đã tạo sẵn)
  cập nhật theo công thức mới.
- `etl/scripts/resyncDoanhThuChinhanhHistory.js` +
  `resyncGiaodichChinhanhHistory.js` (mới) — mirror 2 script `...Live.js`
  đã có, nhưng nhắm vào job "Lịch sử" (2 đợt sửa trước, 8.5/8.10, CỐ Ý
  KHÔNG đụng job này vì Script B lúc đó chưa đổi công thức). Resync job
  Lịch sử có thể mất VÀI GIỜ (giữ ~93 tháng dữ liệu, khác job Live chỉ vài
  phút) — nên chạy giờ thấp điểm.
- `báo cáo doanh thu cuối ngày.md`/`giá vốn dsmart.md` — cập nhật Script B
  và đánh dấu câu hỏi còn mở #2 (mục 8) đã giải quyết.
- HỆ QUẢ TÍCH CỰC: "Cùng kỳ năm trước"/"Tỷ lệ % LFL" giờ nhất quán phạm vi
  `TRANS_CODE` với "Thực đạt" kỳ hiện tại (trước bản này, kỳ hiện tại đã
  loại mã `333` từ bản 8.10 nhưng kỳ trước đó chưa loại — so sánh lệch
  chuẩn).

## 8.11 — Bảng báo cáo web: cố định tiêu đề + 2 cột đầu khi cuộn

Bảng báo cáo dạng lưới (HCRC, LDTD...) nhiều cột phải cuộn ngang/dọc toàn
trang, mất luôn thanh Lọc/Xuất Excel/Xuất PDF khỏi tầm nhìn — người dùng
gửi ảnh chụp minh họa. Sửa CHỈ ở khung xem bảng báo cáo (không đổi
`DataTable` dùng chung ở các trang khác — Người dùng, Phân quyền, Log...):

- `DataTable.jsx` — thêm prop `scrollClassName` (mặc định rỗng, không phá
  vỡ các nơi gọi khác).
- `ReportBody.jsx` — khung bảng báo cáo giờ giới hạn chiều cao
  (`max-height: calc(100vh - 340px)`, cuộn riêng bên trong), tiêu đề cột
  cố định (`sticky` theo trục dọc) khi cuộn xuống, cột 1 cố định theo
  trục ngang (width tự nhiên, an toàn cho mọi báo cáo). Báo cáo nào có cột
  1 đúng quy ước "TT" (`key: 'stt'`, xem `compositeReportRunner.js`) thì
  cố định LUÔN cả cột 2 (tên chi nhánh/thực thể) theo offset cố định
  44px — quy ước dùng ở hầu hết báo cáo HCRC/LDTD hiện có.
- Đã kiểm chứng bằng Playwright (bảng mẫu 17 cột/18 dòng): cuộn dọc giữ
  tiêu đề, cuộn ngang giữ cột TT + tên chi nhánh, thanh Lọc/Xuất vẫn cố
  định phía trên — không cần cuộn cả trang nữa.

## 8.10 — Đổi hẳn sang `STRANS.SURPLUS`/`TRANS_CODE` — lời giải thật cho Lãi gộp

Sau khi deploy bản 8.9 (`AVERIMPPR`), người dùng gửi lại PDF ngày
09/09/2026 — Giá trị Lãi gộp tăng lên (đúng như kỳ vọng khi đổi nguồn) nhưng
Tỷ lệ vẫn quanh 0-1%, không hợp lý cho một chuỗi siêu thị vận hành. DBA
DSMART16 gửi thẳng câu lệnh báo cáo doanh thu/lãi nội bộ họ đang dùng —
phát hiện bảng `STRANS` có sẵn cột **`SURPLUS`**: lãi gộp POS đã tự tính
SẴN cho từng dòng giao dịch, không cần tính/tra giá vốn từ đâu khác nữa.
Đối chiếu diện rộng (~35 chi nhánh × 17 ngày) — tỷ lệ `Lãi/DoanhThu` theo
`SURPLUS` ra **15-25%** ở gần như mọi dòng, lần đầu tiên hợp lý sau 5 bản
(7.6 COSTPRICE → 8.1 công thức tự tính → 8.8 AVERIMPPR → 8.10 SURPLUS).

Phát hiện đi kèm: `AMOUNT` (cột trước giờ coi là doanh thu đầy đủ) thực ra
KHÔNG bao gồm `SURPLUS` — doanh thu đúng = `AMOUNT + SURPLUS`. `TRANS_CODE`
phân loại giao dịch: `211/221/232` = bán, `212/222` = trả hàng (ghi `AMOUNT`
DƯƠNG, phải trừ riêng — đã xác nhận bằng dữ liệu thật). Các mã khác (vd
`333`, chiếm 55,6% doanh thu 1 ngày mẫu, `SURPLUS` luôn 0) bị LOẠI HẲN khỏi
phạm vi VIEW mới — nghĩa chính xác CHƯA XÁC ĐỊNH (nghi bán sỉ/chuyển kho nội
bộ) — **HỆ QUẢ: "Doanh thu" báo cáo GIẢM đáng kể (~55% ở ngày mẫu)** so với
công thức cũ. Đã cảnh báo rõ với người dùng trước khi deploy; người dùng xác
nhận dùng đúng theo công thức DBA.

- Viết lại HOÀN TOÀN cả 2 VIEW (`V_HCRC_DOANHTHU_CHINHANH` VÀ
  `V_HCRC_GIAODICH_CHINHANH`) — chuyển từ `TRANSHDR`+giá vốn ngoài sang
  đọc thẳng `STRANS` (có sẵn `STATUS`/`BU_ID`, không cần JOIN `TRANSHDR`
  nữa), lọc/trừ theo `TRANS_CODE`, `SoGiaoDich` đổi từ đếm dòng header
  sang `COUNT(DISTINCT TRANS_NUM)`. GIỮ NGUYÊN `BU_ID` đầy đủ (không rút
  gọn theo mẫu DBA gửi — dự án đã bỏ hẳn kiểu tự cắt BU_ID từ bản 7.3).
- `etl/scripts/resyncGiaodichChinhanhLive.js` (mới) — mirror
  `resyncDoanhThuChinhanhLive.js` cho domain `giaodich_chinhanh`, vì VIEW
  Giao dịch cũng đổi, cần resync watermark job Live của CẢ 2 domain lần
  này (trước chỉ cần 1 domain ở bản 8.5-8.9).
- `báo cáo doanh thu cuối ngày.md`/`giá vốn dsmart.md` — viết lại Script A
  hoàn toàn, thêm mục 8 (lời giải `SURPLUS`) vào "giá vốn dsmart.md", đánh
  dấu mục 1-6 cũ là "đã supersede" (giữ lại lưu vết quá trình điều tra).
- CÒN MỞ: nghĩa chính xác `TRANS_CODE 333`; Script B (Lịch sử) có
  `SURPLUS`/`TRANS_CODE` để áp dụng cùng công thức không (nếu có, giải
  quyết luôn "Lãi gộp lịch sử sai" tồn đọng từ bản 8.1); vài ngày Lãi ÂM
  bất thường phát hiện khi đối chiếu diện rộng.

## 8.9 — DBA chốt dứt khoát dùng `AVERIMPPR` + tìm ra đường nối tên mặt hàng

Trước khi deploy bản 8.8, đã soi thêm 2 cột còn lại (`PREFPR` — dò ra nằm ở
bảng `SKU_DEF`, không phải `STK_INFO`; và bảng `HISIMPPR` nghi là lịch sử
giá nhập thật gắn nhà cung cấp) cho đúng nhóm mã hàng đã phát hiện lỗi:
`PREFPR` cũng khớp tuyệt đối giá bán ở mọi mã đã kiểm; `HISIMPPR` RỖNG
HOÀN TOÀN — không chỉ cho nhóm mã nghi vấn mà cho CẢ CHI NHÁNH đã kiểm
(STK_ID 10011) — loại hẳn khỏi danh sách nguồn khả dụng. Đã báo lại DBA —
**DBA xác nhận LẦN 2, dứt khoát: dùng `AVERIMPPR`**, chấp nhận nhóm mã
hàng đặc biệt (chưa từng có lịch sử nhập kho thật) tiếp tục ra biên lợi
nhuận ≈0 như một đặc điểm của nhóm hàng đó, không cần xử lý riêng. Công
thức VIEW ở bản 8.8 (`AVERIMPPR`) giữ nguyên, không cần sửa thêm — dừng
điều tra thêm nguồn giá vốn khác.

Tác dụng phụ có ích: bảng `SKU_DEF` (dò ra khi tìm `PREFPR`) có `SKU_ID`
làm khoá chính + cột `FULL_NAME_U` (tên đầy đủ, ĐÃ ĐÚNG FONT tiếng Việt) —
giải quyết xong mục còn treo lâu nay "`SKU_ID` → tên mặt hàng" (cần cho
"Báo cáo giá vốn" sắp tới) — `GOODS.GOODS_NAME`/`GOODS_ID` trước đó xác
nhận không khớp trực tiếp `SKU_ID`, không dùng được. Cập nhật đầy đủ vào
`giá vốn dsmart.md` mục 5, 6.

## 8.8 — Đổi nguồn giá vốn sang `STK_INFO.AVERIMPPR` (công thức tự tính vẫn bị nhiễm giá bán)

Sau bản 8.7, người dùng gửi lại PDF ngày 09/09/2026 — "Lãi gộp" đã tăng so
với trước (chứng tỏ bản 8.5/8.6 sửa watermark có tác dụng) nhưng vẫn cực
thấp (~0.3-0.6% toàn chuỗi, vài siêu thị ÂM) — không hợp lý cho một chuỗi
siêu thị đang vận hành. Soi chi tiết TỪNG MÃ HÀNG bán tại 1 chi nhánh/1
ngày (ST HÀNG TRỐNG, STK_ID 10011, 09/09/2026) phát hiện: rất nhiều mã
hàng có giá vốn tự tính (`SUM(M_BEGAMT+M_IMPAMT)/SUM(M_BEGIN+M_IMP)`, công
thức đã chốt ở bản 8.1) ra ĐÚNG BẰNG giá bán tới từng đồng — cùng triệu
chứng với bảng `COSTPRICE` đã loại ở bản 8.1, chỉ khác là lộ ra khi soi
rộng (toàn bộ mã hàng) thay vì chỉ 10 mã mẫu ban đầu dùng để kiểm chứng.
Nghi ngờ cột `M_IMPAMT` (giá trị nhập trong kỳ) của `STK_INFO` cũng ghi
nhận theo giá bán lẻ, không phải giá nhập thật — kết luận "tỷ lệ lãi gộp
thấp là đúng dữ liệu" ở bản 8.2 vì vậy bị **đảo ngược** (phạm vi kiểm
chứng 10 mã ban đầu quá hẹp).

Người dùng hỏi lại DBA DSMART16 — xác nhận dùng THẲNG cột có sẵn
`STK_INFO.AVERIMPPR` ("GV bình quân", hệ thống tự duy trì) thay vì tự
tính lại từ 4 cột `M_BEGIN/M_IMP/M_BEGAMT/M_IMPAMT`:

- Script A (`V_HCRC_DOANHTHU_CHINHANH`, Live) — subquery giá vốn đổi
  thành `SUM(AVERIMPPR * (M_BEGIN + M_IMP)) / NULLIF(SUM(M_BEGIN + M_IMP), 0)
  AS GiaVonBinhQuan` — vẫn giữ nguyên tắc CHUNG toàn hệ thống theo
  `SKU_ID`, bình quân gia quyền theo số lượng luân chuyển của từng chi
  nhánh (chỉ đổi NGUỒN giá trị đơn giá, không đổi cách gộp).
- `giá vốn dsmart.md` — cập nhật mục 2/3 (công thức mới), mục 6 (đánh dấu
  đảo ngược kết luận bản 8.2, giữ lại bản cũ trong khối gấp để tham khảo),
  mục 7 (trạng thái, thêm việc CẦN LÀM: xác nhận số liệu thật sau deploy).
- `báo cáo doanh thu cuối ngày.md` — đồng bộ chú thích Script A theo đúng
  công thức mới.
- **CHƯA XÁC NHẬN** đổi cột này có thực sự cho tỷ lệ lãi gộp hợp lý hơn ở
  đúng những mã hàng đã phát hiện lỗi hay không — cần deploy + kiểm tra
  lại số liệu thật (xem mục 7 "giá vốn dsmart.md").

## 8.7 — Đính chính mã file HCRC + rà soát lại code tính Lãi gộp

Đính chính (mã đã cấp ở bản 8.3 sai theo phản hồi người dùng): file xuất
báo cáo HCRC đổi từ `BCDTRC-ddmmyyyy` thành đúng `BCDTHCRC-ddmmyyyy` —
`rp-server/scripts/seedLdtdHcrcReports.js` (`exportFileCode`), chỉ đổi 1
hằng số, chạy lại `node scripts/seedLdtdHcrcReports.js` là áp dụng.

Rà soát lại toàn bộ đường tính "Lãi gộp" (Tỷ lệ + Giá trị) theo yêu cầu
người dùng sau khi thấy báo cáo ngày 09/09/2026 vẫn ra số y hệt bản TRƯỚC
bản 8.1 dù đã tự xoá cache job Live: `Tỷ lệ = ROUND(laiGop/doanhThu*100,1)`,
`Giá trị = laiGop` (`seedLdtdHcrcReports.js`) — 2 công thức đọc thẳng
`current.measures.laiGop`/`doanhThu`, được gộp (SUM) hoàn toàn CHUNG một
đường với mọi measure khác (`compositeReportRunner.js`, `diemStkMapping.js`
dòng gộp nhiều STK_ID/Điểm) và đọc ngược lại từ `dwh.ReportFacts.Measures`
qua `JSON.parse()` không có xử lý riêng cho `laiGop` (`reportEngine.js`) —
KHÔNG tìm thấy khác biệt/lỗi nào giữa đường tính `laiGop` và `doanhThu`
(vốn đang đúng). Dấu hiệu số liệu trong PDF người dùng gửi (giá trị Lãi gộp
cực nhỏ so với doanh thu, vài dòng ÂM) khớp CHÍNH XÁC đặc điểm bug
COSTPRICE cũ (COSTPRICE ≈ giá bán → lãi gộp ≈ 0) đã sửa ở bản 8.1 — kết
luận: đây là vấn đề Ở TẦNG DỮ LIỆU (VIEW/cache), không phải lỗi code
rp-server. Đã gửi người dùng bộ câu SQL cụ thể (không placeholder) để tự
kiểm tra: (1) definition thật của VIEW trên DSMART16 Live có đúng đã đổi
sang STK_INFO chưa, (2) trạng thái/log lần chạy gần nhất của job "Doanh thu
chi nhánh - Live", (3) dòng `dwh.ReportFacts` đang cache cho ngày 09/09/2026
— SourceSystem nào, Measures thật sự là gì — để xác định chính xác việc xoá
cache của người dùng đã có tác dụng hay chưa, hay ngày đó đã không còn nằm
trong CSDL Live nữa nên rơi về đúng Script B (Lịch sử) vẫn cố ý chưa sửa.

## 8.6 — Thống nhất trang "Log" + "Nhật ký thao tác" ở cả 3 giao diện quản trị

Trước bản này, chỉ etl-admin có ĐỦ 2 trang tách biệt: "Log" (etl.SystemLog —
nhật ký vận hành: kết nối CSDL, lỗi request, bắt đầu/kết quả từng lượt đồng
bộ) và "Nhật ký thao tác" (admin.AuditLog — ai làm gì). rp-user chỉ có 1
trang, ĐẶT SAI TÊN "Log" nhưng thực chất là app.AuditLog (khiến người dùng
tưởng đây là nhật ký vận hành, không tìm thấy lỗi kết nối/lỗi request ở
đâu); api-admin có đúng "Nhật ký thao tác" (admin.AuditLog) nhưng THIẾU hẳn
lớp nhật ký vận hành. etl-admin cũng thiếu bộ lọc theo khoảng ngày ở trang
"Log" (chỉ rp-user/api-admin có, ở trang audit log).

- Thêm bảng `app.SystemLog` (rp-db) và `admin.SystemLog` (api-db) — cùng
  cấu trúc `etl.SystemLog` (Level/Message/CreatedAt).
- Thêm `rp-server/lib/systemLog.js` + `api-server/lib/systemLog.js` (cùng
  khuôn `etl/lib/systemLog.js`) — gắn vào `db.js` (log kết nối CSDL thành
  công/thất bại) và global error handler của cả 3 server.js (log lỗi route
  không bắt riêng) — trước đây các sự kiện này CHỈ có trong pm2 log, phải
  SSH mới xem được.
- Route mới: `rp-server/routes/systemLog.js` (`GET /api/system/log`),
  `api-server/routes/admin/systemLog.js` (`GET /admin/log`) — lọc theo mức
  độ + khoảng ngày (from/to) NGAY TỪ ĐẦU.
- `etl/routes/admin/log.js` — bổ sung bộ lọc from/to còn thiếu, cho khớp 2
  trang kia.
- Trang mới "Log" ở rp-user (`/system/log`) và api-admin (`/log`) — cùng
  giao diện tabs Tất cả/Thông tin/Cảnh báo/Lỗi + lọc ngày như etl-admin.
- Đổi tên trang rp-user từ "Log" (sai) thành đúng **"Nhật ký thao tác"**
  (menu `system-audit-log`, `rp-db/schema.sql` UPDATE tên hiển thị cho CSDL
  đã có sẵn) — không đổi route/API, chỉ đổi tên hiển thị + tiêu đề trang.
- Thêm job dọn định kỳ `cleanupSystemLog` (mặc định 90 ngày, biến môi
  trường `SYSTEM_LOG_RETENTION_DAYS`) cho cả rp-server và api-server, chạy
  cùng lịch với `cleanupAuditLog`/`cleanupRequestLog` hiện có.
- Rà soát riêng: phạm vi "Nhật ký thao tác" (ai làm gì) ở cả 3 hệ thống đã
  BAO PHỦ ĐỦ mọi route có thao tác ghi (thêm/sửa/xoá) qua giao diện quản
  trị — không phát sinh thêm lỗ hổng nào cần vá; các route 0 lượt gọi
  `logAction()` tìm thấy khi rà soát đều là trang chỉ đọc hoặc endpoint API
  ngoài (`/api/v1/*`, đã có `api.RequestLog` riêng).
- Cập nhật mục "Log"/"Nhật ký thao tác" trong "Hướng dẫn" của rp-user và
  api-admin cho khớp thay đổi.

## 8.5 — Tìm ra nguyên nhân thật "Lãi gộp" vẫn sai sau bản 8.1 + script đồng bộ lại riêng job Live

Người dùng phản ánh: sau khi đã sửa VIEW ở DSMART16 theo bản 8.1 và kiểm
chứng lại bằng SQL trực tiếp cho ra số đúng, báo cáo xuất ra (PDF) vẫn hiện
"Lãi gộp" (Tỷ lệ + Giá trị) y hệt số CŨ/sai. Điều tra `etl/jobs/runSync.js`
+ `etl/lib/tableSyncEngine.js` + `etl/scripts/seedLdtdHcrcSync.js`, tìm ra
nguyên nhân: job "Doanh thu chi nhánh - Live" dùng chính cột `WORK_DATE`
làm "Cột thời gian cập nhật" (watermark) — câu truy vấn đồng bộ tăng dần
thực chất là `WHERE WORK_DATE > mốc_đã_đồng_bộ`. Vì `WORK_DATE` của 1 dòng
không đổi theo thời gian, một khi mốc đã vượt qua `WORK_DATE` của 1 ngày,
job sẽ **không bao giờ** tự kéo lại đúng ngày đó nữa dù đổi công thức tính
trong VIEW (như bản 8.1) — đợi job chạy lại nhiều lần (như đã khuyên ở bản
8.1) KHÔNG có tác dụng, khác hẳn tình huống bản 7.6 (ngày chưa từng đồng bộ
vẫn tự kéo đúng khi tới lượt).

- `etl/scripts/resyncDoanhThuChinhanhLive.js` (mới) — script đồng bộ lại
  riêng job "Live" (xoá đúng các dòng `dwh.ReportFacts` có `SourceSystem`
  của job Live, reset watermark chỉ của job đó về epoch), KHÔNG đụng tới
  job "Lịch sử" hay tiến độ đang chạy dở của job đó — khác
  `resyncDoanhThuChinhanh.js` (bản 7.8, xoá + reset CẢ 2 job, không phù hợp
  cho đợt sửa công thức chỉ ảnh hưởng job Live). Mặc định dry-run, cần
  `--confirm` mới thực sự chạy.
- `báo cáo doanh thu cuối ngày.md` — thêm khối "ĐÍNH CHÍNH (bản 8.5)" giải
  thích nguyên nhân + hướng dẫn chạy script mới, ngay sau khối ĐÍNH CHÍNH
  bản 7.8.

## 8.4 — Sắp xếp siêu thị trong từng nhóm MART/MINIMART theo Diện tích giảm dần

Theo yêu cầu người dùng (khớp đúng file mẫu tham chiếu ban đầu — cột
`current.dimensions.dienTich` lớn lên trước). Thêm tuỳ chọn `sortBy`
(`{field, direction}`) vào `definition.groupBy` — sắp xếp CÁC DÒNG DỮ
LIỆU bên trong từng nhóm TRƯỚC khi chèn dòng "Tổng cộng" (dòng tổng luôn
đứng cuối nhóm, không bị sắp xếp lẫn vào), áp dụng ở
`rp-server/lib/compositeReportRunner.js` — cơ chế CHUNG, dùng lại được
cho báo cáo khác có `groupBy` sau này, không riêng gì báo cáo LDTD/HCRC.
Bật `sortBy: { field: 'current.dimensions.dienTich', direction: 'desc' }`
cho cả 2 báo cáo LDTD/HCRC (`scripts/seedLdtdHcrcReports.js`) — áp dụng
cho cả bảng xem trên web LẪN xuất Excel/PDF (cùng 1 chỗ sinh dữ liệu).
Đã kiểm thử tách biệt bằng script riêng (không cần DB) + demo file
Excel/PDF mẫu trước khi đẩy code.

**Cần chạy lại `node scripts/seedLdtdHcrcReports.js`** để áp dụng.

## 8.3 — Tách riêng tên danh mục / tiêu đề file xuất / tên file tải xuống

Theo yêu cầu người dùng, 3 khái niệm trước đây gộp chung vào
`definition.title` giờ tách hẳn thành 3 field độc lập (không suy ra lẫn
nhau nữa):
- `title` — tên báo cáo trong DANH MỤC (chọn báo cáo trên rp-user), TĨNH,
  không kèm ngày: `"Báo cáo doanh thu cuối ngày HCRC"`/`"...LDTD"`.
- `exportTitle` (mới) — tiêu đề HIỂN THỊ TRONG TÀI LIỆU lúc xuất
  Excel/PDF, có token `{ngayBaoCao}` — GIỐNG HỆT NHAU cho cả 2 báo cáo:
  `"Hệ thống siêu thị BRGMART - Báo cáo nhanh doanh thu ngày dd/mm/yyyy"`.
- `exportFileCode` (mới) — mã cố định ghép TÊN FILE tải xuống theo đúng
  quy tắc nội bộ: HCRC = `BCDTRC-ddmmyyyy`, LDTD = `BCDDTLDTD-ddmmyyyy`
  (`rp-server/lib/reportTitleDate.js:resolveExportFileBaseName()`, dùng
  `ddmmyyyy` không dấu phân cách, khác định dạng `dd/mm/yyyy` dùng để
  hiển thị).

Áp dụng ở `routes/reports.js` (nút "Xuất") và `jobs/reportEmailScheduler.js`
(lịch gửi email tự động) — báo cáo KHÔNG khai `exportTitle`/`exportFileCode`
(mọi báo cáo khác ngoài HCRC/LDTD) vẫn giữ nguyên hành vi cũ (dùng
`title` cho cả tiêu đề lẫn tên file). Đã demo bằng file Excel/PDF mẫu
trước khi đẩy code, người dùng xác nhận đúng ý.

**Cần chạy lại `node scripts/seedLdtdHcrcReports.js`** để áp dụng tên
danh mục/tiêu đề/mã file mới cho 2 báo cáo đã tạo trước đó (script
idempotent, chỉ UPDATE, không tạo trùng).

## 8.2 — Xác nhận công thức giá vốn bằng nguồn thứ 3 (DBA cung cấp `AVERIMPPR`)

Người dùng báo "Lãi gộp" sau bản 8.1 vẫn thấp — đối chiếu thêm 1 nguồn
ĐỘC LẬP thứ 3 do DBA DSMART16 cung cấp: `STK_INFO.AVERIMPPR` chính là
"GV bình quân" (giá vốn bình quân) DSMART tự duy trì. Kiểm bằng dữ liệu
thật (10 mã hàng đã dùng xuyên suốt) cho kết quả GẦN TRÙNG KHỚP với công
thức tự tính đang dùng trong VIEW (chênh lệch < 5%) — xác nhận công thức
ĐANG DÙNG là ĐÚNG, không cần sửa lại VIEW. Tỷ lệ lãi gộp thấp ở các mã
hàng bán chạy nhất phản ánh đúng dữ liệu thật (khả năng là biên lợi
nhuận mỏng thật của hàng thiết yếu) — chuyển thành câu hỏi NGHIỆP VỤ cho
người phụ trách kinh doanh, không còn là nghi vấn kỹ thuật. Cập nhật
"giá vốn dsmart.md" mục 6. (`STK_INFO.COSTPRICE` — khác bảng `COSTPRICE`
riêng — cũng xác nhận thêm KHÔNG dùng được, toàn số 0.)

## 8.1 — Sửa "Lãi gộp" dùng giá vốn bình quân từ STK_INFO (chỉ VIEW Live)

Người dùng xác nhận: chỉ áp dụng cách tính giá vốn mới (bản 8.0) cho kỳ
Live, KHÔNG cần cho Lịch sử (không có nguồn giá vốn đáng tin cho tháng/
năm cũ). Sửa Script A (`V_HCRC_DOANHTHU_CHINHANH` trên `DSMART16`, xem
"báo cáo doanh thu cuối ngày.md"): bỏ hẳn JOIN `COSTPRICE` (đã xác nhận
không dùng được — gần trùng khớp giá bán), thay bằng subquery tính giá
vốn bình quân gia quyền từ `STK_INFO` theo đúng công thức đã chốt (tồn
đầu kỳ + nhập trong kỳ, chung toàn hệ thống theo SKU_ID). Script B (Lịch
sử, `DSMART16_EOM`) CỐ Ý giữ nguyên JOIN `COSTPRICE` cũ — "Lãi gộp" của
dữ liệu quá khứ vẫn sai, chấp nhận tạm thời, ghi rõ trong cả 2 file tài
liệu ("báo cáo doanh thu cuối ngày.md" + "giá vốn dsmart.md").

**Cần DBA chạy lại NGUYÊN VĂN đoạn `CREATE OR ALTER VIEW` Script A đã sửa
trên `DSMART16` (Live)** — an toàn chạy lại nhiều lần. Job "Doanh thu chi
nhánh - Live" (chạy mỗi ~15 phút, đọc lại dữ liệu HÔM NAY) sẽ tự lấy đúng
"Lãi gộp" mới cho các ngày trong tháng này KHÔNG cần đồng bộ lại từ đầu —
KHÔNG khuyến khích chạy `resyncDoanhThuChinhanh.js` lần nữa lúc này (sẽ
làm lại từ đầu tiến trình đồng bộ "Lịch sử" đang chạy dở của bản 7.6/7.8).

## 8.0 — Tài liệu tham chiếu "giá vốn dsmart.md" — điều tra giá vốn bình quân gia quyền

**Đính chính đánh số**: mục ngay dưới đây từng đánh nhầm "7.10" — theo
đúng quy tắc, sau `7.9` phải là `8.0` (Y chạm 9 thì tràn X, không có
`7.10`). Sửa lại từ đây, không đổi lại lịch sử các bản đã đẩy.

Người dùng chọn dùng giá vốn bình quân gia quyền (thay `COSTPRICE` đã xác
nhận không dùng được, xem VERSION.md bản trước) cho "Lãi gộp" và 1 báo
cáo "Báo cáo giá vốn" mới. Thêm file tham chiếu chính thức **"giá vốn
dsmart.md"** (cùng quy ước với "quy tắc mã BU_ID và STK_ID.md"/"báo cáo
doanh thu cuối ngày.md" — đọc trước khi sửa, cập nhật lại khi đổi) ghi
lại: vì sao bỏ `COSTPRICE` (đối chiếu bằng dữ liệu thật — trùng gần như
tuyệt đối với giá bán, các cột giá khác đều rỗng); công thức đã chốt với
người dùng dùng `STK_INFO.M_BEGIN/M_BEGAMT/M_IMP/M_IMPAMT` (giá vốn đầu
kỳ + giá vốn bình quân gia quyền cuối kỳ, theo tháng, chung toàn hệ
thống theo mã hàng — CHỈ hỗ trợ tháng hiện tại vì `STK_INFO` là snapshot
không lưu lịch sử); đã đối chiếu chéo bằng dữ liệu thật cho kết quả gần
khớp `COSTPRICE` (2 nguồn độc lập). Còn dở: chưa xác định được đường nối
`SKU_ID` → tên mặt hàng thật (`GOODS.GOODS_ID` không khớp trực tiếp,
đang dò qua `SKU_DEF`) — VIEW/báo cáo thật CHƯA viết, theo dõi tiến độ ở
mục "Trạng thái triển khai" trong file tài liệu.

## 7.10 — Thêm cột `LoaiChuoi` (MART/MINIMART) khai tay ở "Ánh xạ Điểm - STK_ID"

Người dùng đề xuất: thay vì chỉ trông cậy vào `STOCK.TYPE` tự động đồng bộ
qua dimension "chain" (domain `doanhthu_chinhanh`) để nhóm MART/MINIMART ở
"Báo cáo nhanh doanh thu" — thêm hẳn 1 cột do admin tự khai trong bảng
"Ánh xạ Điểm - STK_ID" để tham chiếu nhanh, đáng tin hơn tự động (không
phụ thuộc job etl-admin có tick đúng Dimension "chain" hay không, tránh
vài ngoại lệ dữ liệu DSMART đã ghi nhận — `TYPE='02'` có dòng là "Kho
hàng..." không phải MiniMart bán lẻ thật).

Thêm cột **LoaiChuoi** (`MART`/`MINIMART`, TUỲ CHỌN — để trống vẫn dùng
nguyên giá trị tự động như trước, không đổi hành vi cũ) xuyên suốt cùng
1 luồng với cột `BuId` đã có: `etl-db/schema.sql` (ALTER TABLE ADD),
`etl/lib/diemStkMappingImport.js` (cột file Excel + validate chỉ nhận
MART/MINIMART), `etl/routes/admin/diemStkMapping.js` (API), UI
`etl-admin/src/pages/DiemStkMappingPage.jsx` (cột bảng + dropdown ở form
sửa/thêm 1 dòng). `rp-server/lib/diemStkMapping.js:remapRowsToDiem()` ưu
tiên GHI ĐÈ dimension "chain" tự động bằng giá trị đã khai khi có — đã
kiểm tra bằng script test riêng (mã Điểm có khai LoaiChuoi override đúng,
mã Điểm để trống vẫn giữ nguyên giá trị tự động).

Nhân tiện đính chính 2 đoạn ghi chú SAI còn sót trong "báo cáo doanh thu
cuối ngày.md" (Bước 2.3) — vẫn ghi "BU_ID chính là mã Điểm, GIỮ NGUYÊN
không dịch mã" (giả định CŨ đã bị bác bỏ từ bản 6.99) và bảng mẫu file
"Ánh xạ Điểm - STK_ID" thiếu hẳn 2 cột `BuId`/`LoaiChuoi` đã có từ lâu.

## 7.9 — Auto-fit thật cho PDF + tiêu đề kèm ngày báo cáo (Excel/PDF)

Theo yêu cầu định dạng báo cáo "Báo cáo nhanh doanh thu" (2/4 việc — việc
nhóm MART/MINIMART đang chờ người dùng xác nhận dữ liệu STOCK.TYPE, việc
demo/hướng dẫn sẽ gửi sau khi đủ cả 4):
- **Auto-fit PDF** (`rp-server/lib/exportPdf.js`) — TRƯỚC ĐÂY bề rộng cột
  chia theo trọng số CỐ ĐỊNH (`definition.columns[].width`) trên khổ trang
  A4 ngang CỐ ĐỊNH, số/chữ dài hơn phần chia bị CẮT kèm "…" (phát hiện qua
  báo cáo thật có "Thực đạt" bị cắt "11,647,64…"). Giờ đo ĐÚNG bề rộng cần
  thiết của từng cột bằng chính font sẽ vẽ (cùng cách tiếp cận với auto-fit
  Excel đã có từ bản 6.97) — nội dung vừa khổ trang mặc định thì giãn đều
  lấp đầy trang như cũ; nội dung rộng hơn thì GIỮ NGUYÊN bề rộng cần thiết
  và tự MỞ RỘNG khổ trang, không còn cắt dữ liệu. Đã kiểm tra bằng script
  test riêng (khổ trang tự giãn từ 841.89pt lên 1321pt khi ép nhiều cột số
  dài, không còn ký tự "…" trong trường hợp cần đo).
- **Tiêu đề kèm ngày** — `definition.title` giờ hỗ trợ token `{ngayBaoCao}`
  (mới: `rp-server/lib/reportTitleDate.js`, dùng chung `resolveRequestedRange()`
  đã có ở `compositeReportRunner.js` — export luôn hàm này). Áp dụng cho cả
  lúc bấm "Xuất" (`routes/reports.js`), lịch gửi email tự động
  (`jobs/reportEmailScheduler.js`), danh sách báo cáo và trang xem trước
  (chưa chọn ngày thì mặc định "hôm nay", khớp hành vi `resolveRequestedRange()`).
  Đổi tiêu đề 2 báo cáo LDTD/HCRC (`scripts/seedLdtdHcrcReports.js`) thành
  `"Hệ thống siêu thị BRGMART - Báo cáo nhanh doanh thu [Lãnh đạo Tập đoàn ]ngày {ngayBaoCao}"`
  khớp đúng mẫu báo cáo cũ — **cần chạy lại
  `node scripts/seedLdtdHcrcReports.js` để áp dụng tiêu đề mới cho 2 báo cáo
  đã tạo trước đó** (script idempotent, không tạo trùng).

## 7.8 — Script đồng bộ lại `dwh.ReportFacts` sau bản vá 7.6 (COSTPRICE.NODE_ID)

Người dùng báo số liệu trên báo cáo VẪN sai dù đã chạy lại VIEW đã sửa ở
bản 7.6 và tự kiểm tra bằng SQL trực tiếp trên VIEW thấy đúng. Nguyên
nhân: `dwh.ReportFacts` là bảng CACHE, job đồng bộ chỉ kéo phần "MỚI từ
watermark" (`etl/lib/tableSyncEngine.js`) — sửa VIEW nguồn KHÔNG tự làm
lại dữ liệu NGÀY CŨ đã đồng bộ trước đó, số "Thực đạt" sai (nhân dòng)
vẫn còn nguyên trong cache tới khi xoá + đồng bộ lại từ đầu (đúng tình
huống "sửa số liệu hồi tố" đã ghi trong "báo cáo doanh thu cuối ngày.md").
Thêm **etl/scripts/resyncDoanhThuChinhanh.js** (rập khuôn
`resyncGiaodichChinhanh.js` đã có sẵn cho domain `giaodich_chinhanh`):
mặc định chỉ xem trước (đếm dòng, không xoá gì), truyền `--confirm` mới
thực sự xoá dòng domain `doanhthu_chinhanh` trong `dwh.ReportFacts` +
reset mốc đồng bộ (`etl.SyncState.LastSyncedAt` về epoch) của mọi job
liên quan, để lượt chạy kế tiếp tự kéo lại toàn bộ dữ liệu từ VIEW đã
sửa. Đính chính lại đoạn ghi chú SAI ở bản 7.6 trong "báo cáo doanh thu
cuối ngày.md" (từng ghi nhầm "không cần đồng bộ lại ETL").

## 7.7 — Đồng bộ sửa lỗi COSTPRICE.NODE_ID sang `hướng_dẫn_báo_cáo.md`

Người dùng xác nhận đã chạy xong bản vá 7.6 trên cả `DSMART16` (Live) và
`DSMART16_EOM` (Lịch sử), đồng thời yêu cầu (quy ước cố định của dự án):
mọi lần sửa VIEW/SQL xác nhận trong "báo cáo doanh thu cuối ngày.md" PHẢI
đồng bộ sang **hướng_dẫn_báo_cáo.md`** (file hiển thị trong trang "Hướng
dẫn" của `rp-user`/`etl-admin`) để tránh 2 tài liệu lệch nhau. Mục 11.b
("Doanh thu theo chi nhánh") ở file này vẫn là bản DỰNG BAN ĐẦU, chưa xác
nhận (nguồn `DSTK_INFO` sai, cột `TOCUST_*`/`WORK_DATE` sai, `STYPE_ID`
placeholder chưa điền) — thay bằng ghi chú trỏ thẳng về bản đã xác nhận
trong "báo cáo doanh thu cuối ngày.md", tránh duy trì 2 bản SQL dễ lệch
nhau. Cập nhật thêm mục hướng dẫn xử lý sự cố (mục 15) với dấu hiệu nhận
biết lỗi thiếu `NODE_ID` (Thực đạt lệch hàng chục lần, tỷ lệ không đều).

## 7.6 — Sửa lỗi VIEW `V_HCRC_DOANHTHU_CHINHANH` nhân dòng giá vốn theo mã Điểm

Người dùng báo "Thực đạt" doanh thu trong "Báo cáo nhanh doanh thu" lệch
bất thường so với "Cùng kỳ năm 2025" (28–115 lần, tuỳ mã Điểm). Đối chiếu
dữ liệu thật xác định nguyên nhân: `COSTPRICE.NODE_ID` lưu giá vốn RIÊNG
theo từng mã Điểm (KHÔNG "dùng chung toàn hệ thống" như hướng dẫn cũ ghi
nhầm — 1 SKU/1 tháng có tới ~38 dòng, mỗi dòng 1 `NODE_ID` khác nhau).
VIEW `V_HCRC_DOANHTHU_CHINHANH` JOIN `COSTPRICE` chỉ theo `SKU_ID +
MEC_YM` (thiếu `NODE_ID`) khiến 1 dòng giao dịch (`STRANS`) bị khớp với
TẤT CẢ ~38 dòng giá vốn của mọi mã Điểm — nhân dòng, `SUM(AMOUNT)` ở
"doanhThu"/"laiGop" cộng dồn sai lệch. Sửa cả 3 nơi định nghĩa VIEW trong
**báo cáo doanh thu cuối ngày.md** (Script A - Live, Script B ad hoc và
stored procedure - Lịch sử): thêm điều kiện `AND c.NODE_ID = s.NODE_ID`
(nối qua `STOCK.NODE_ID`, đã JOIN sẵn theo `STK_ID`). Đính chính luôn 2
đoạn ghi chú sai trong tài liệu (giả định COSTPRICE dùng chung toàn hệ
thống; giả định cũ `BU_ID chính là mã Điểm` ở VIEW "Giao dịch" — đã đổi
thiết kế BU_ID/STK_ID từ bản 6.99). **Cần DBA chạy lại NGUYÊN VĂN đoạn
`CREATE OR ALTER VIEW`/stored procedure đã sửa trên cả 2 CSDL `DSMART16`
(Live) và `DSMART16_EOM` (Lịch sử)** — an toàn chạy lại nhiều lần, không
cần đồng bộ lại ETL.

## 7.5 — Mẫu script GRANT tài khoản SQL least-privilege cho DSMART16 (voucher)

Người dùng nhờ tạo luôn tài khoản kết nối DSMART16 cho voucher và gửi
script phân quyền, kèm điền sẵn thông tin tài khoản. Thêm
**api-db/grants-dsmart16-voucher.sql** (mẫu, commit vào repo, mật khẩu
placeholder — cùng quy ước `etl-db/grants.sql`/`dwh/grants.sql` đã có):
tạo 1 login DUY NHẤT `hcrc_voucher_svc`, CHỈ 2 quyền SELECT + UPDATE,
CHỈ ĐÚNG 1 BẢNG `dbo.PMCRDINF` trên chính CSDL DSMART16 (KHÔNG phải
HCRC_API) — không GRANT theo schema, không có quyền gì khác trên
DSMART16 (không đọc được doanh thu/tồn kho/bảng khác).

Bản ĐÃ ĐIỀN SẴN mật khẩu thật (random, sinh riêng cho lần này) được gửi
TRỰC TIẾP cho người dùng qua file tải xuống, **KHÔNG commit vào git** —
mật khẩu thật không bao giờ được nằm trong lịch sử git dù chỉ 1 lần
(người dùng được dặn xoá file khỏi máy sau khi DBA chạy xong, cùng quy
ước đã có ở `DataSourcesPage.jsx` phần "Nhập hàng loạt"). Cập nhật
`api-voucher-check-redeem.md` — thêm Bước 2b (chạy grant script trên
DSMART16 TRƯỚC Bước 4 seed Nguồn dữ liệu).

## 7.4 — Script tự cấu hình kết nối DSMART16 cho API Voucher (thay thao tác tay qua api-admin)

Rà soát API check/redeem voucher theo yêu cầu người dùng: code đã hoàn
thiện đầy đủ từ trước (đọc/ghi thật bảng `PMCRDINF` qua đúng cơ chế "Nguồn
dữ liệu" `api.DataSources` dùng chung với các endpoint realtime khác,
auth/scope/rate-limit/xử lý lỗi đều đã có) — chỉ THIẾU thao tác vận hành:
chọn "Nguồn dữ liệu" trỏ DSMART16 trong "Cấu hình Voucher". Vì api-admin
và app voucher của người dùng CHỈ chạy trong mạng nội bộ (không public),
phiên làm việc không có đường kết nối để tự thao tác qua giao diện web
giúp — thay vào đó, viết **script tự động hoá** để IT/DBA chạy 1 lệnh trên
chính máy chủ, không cần mở trình duyệt, không cần gõ mật khẩu qua chat.

**api-server/scripts/seedVoucherDataSource.js** (mới) — đọc thông tin kết
nối DSMART16 từ biến `.env` (`VOUCHER_DSMART16_*`, xem `.env.example`),
**kiểm tra kết nối THẬT trước** (dừng ngay, KHÔNG ghi gì nếu sai thông tin
— tránh lưu cấu hình hỏng), rồi TẠO MỚI hoặc CẬP NHẬT TẠI CHỖ (idempotent,
khớp theo tên, không tạo trùng khi chạy lại) đúng 1 dòng `api.DataSources`
và tự trỏ `api.VoucherSettings.DataSourceId` vào dòng đó — dùng lại đúng
`encrypt()`/`testConnection()`/`invalidate()` đã có (không tự chế thêm cơ
chế mã hoá/kết nối mới). Thêm alias `npm run seed:voucher-datasource`
(package.json). Cập nhật `api-server/.env.example` (mục "Voucher — kết
nối DSMART16") và `api-voucher-check-redeem.md` Bước 4 (mô tả cả 2 cách:
script mới — khuyến nghị, và thao tác tay qua UI — cách cũ vẫn còn dùng
được).

**Test (fakeModule)**: 3 kịch bản — (1) kết nối thất bại → KHÔNG ghi gì
vào CSDL; (2) chưa có Nguồn dữ liệu → tạo mới + trỏ đúng VoucherSettings;
(3) đã có → cập nhật tại chỗ, không tạo trùng, gọi `invalidate()` đúng Id
cũ để pool cache nạp lại cấu hình mới ngay — cả 3 PASS.

## 7.3 — BỎ HẲN quy tắc tự suy "+00" cho BU_ID — bắt buộc khai tường minh

Người dùng chỉ rõ: "Coi như bạn không lấy file ánh xạ STK của tôi để xử lý
mà vẫn quy tắc 00 à? Đây không phải quy tắc mà do người tạo kho tạo mà" —
hậu tố "00" quan sát được qua 6 mẫu SQL đã kiểm tra KHÔNG PHẢI quy tắc
DSMART áp dụng chung cho MỌI mã Điểm, chỉ là cách người tạo kho ở NHỮNG
điểm đó đặt ra — tự động áp dụng làm mặc định cho MỌI mã Điểm có rủi ro
**sai âm thầm** (gộp nhầm doanh thu/giao dịch vào sai mã Điểm mà không ai
biết để kiểm tra lại), nguy hiểm hơn hẳn hiện trống. Được hỏi lại, người
dùng CHỌN phương án an toàn: KHÔNG suy đoán — chỉ hiện dữ liệu Giao dịch
khi có BU_ID thật tường minh trong bảng "Ánh xạ Điểm - STK_ID".

**rp-server/lib/diemStkMapping.js** — `buildBuIdLookup()` bỏ hẳn
`DEFAULT_BU_ID_SUFFIX = '00'` và logic tự suy — CHỈ đưa vào lookup những
mã Điểm đã khai `BuId` tường minh; mã Điểm chưa khai thì domain
`giaodich_chinhanh` của mã đó KHÔNG khớp gì cả, rơi về "không có dữ liệu"
(đúng hành vi mặc định của compositeReportRunner, không đoán bừa).
**etl-admin/src/pages/DiemStkMappingPage.jsx** — cập nhật văn bản: cột
`BuId` từ "tuỳ chọn, để trống thì tự suy" thành "BẮT BUỘC điền để có dữ
liệu Giao dịch". Cập nhật comment tham chiếu ở
rp-server/lib/compositeReportRunner.js, rp-server/scripts/seedLdtdHcrcReports.js,
etl/lib/diemStkMappingImport.js (template mẫu), etl-db/schema.sql, và
"quy tắc mã BU_ID và STK_ID.md" khớp thiết kế mới.

**Lưu ý triển khai**: sau khi deploy bản này, cột "Giao dịch" sẽ TRỐNG cho
MỌI mã Điểm cho tới khi admin điền đủ `BuId` thật (nhờ DBA xác nhận qua
SQL, có thể chạy 1 lượt với TOÀN BỘ STK_ID trong `MaStkMoi` của mọi mã
Điểm để lấy đủ BU_ID 1 lần, không cần kiểm tra từng mã) — đây là đánh đổi
người dùng đã chọn (an toàn hơn đoán sai).

## 7.2 — Làm rõ vì sao có STK Cũ/STK Mới (hậu tố do người dùng tự định nghĩa)

Người dùng làm rõ thêm: "Hậu tố là tôi định nghĩa... khi tôi đóng cửa điểm
cũ tôi phải tạo ra mã STK mới để phân biệt với điểm cũ, doanh thu/giao
dịch sẽ tính theo STK mới". Xác nhận STK_ID và hậu tố dùng để tạo mã STK
đều do CHÍNH NGƯỜI DÙNG tự định nghĩa/tạo ra khi 1 mã Điểm (BU_ID) đóng
cửa rồi mở lại — khớp đúng thiết kế hiện tại (`MaStkMoi` = hiện tại,
`MaStkCu` = quá khứ, chỉ dùng "cùng kỳ" khi 2 mã bằng nhau). Cập nhật
"quy tắc mã BU_ID và STK_ID.md" với đoạn giải thích lý do — không đổi
code, chỉ củng cố tài liệu tham chiếu bắt buộc theo quy tắc 5.

## 7.1 — Làm rõ chuỗi nguồn gốc BU_ID/STK_ID (DSMART cấp BU_ID → mã Điểm cố định → người dùng tự tạo STK_ID)

Người dùng làm rõ thêm: "Mã BU_ID vì tôi lấy từ DSMART... Mã điểm cố định
và tôi là người tạo ra mã STK_ID từ mã điểm (BU_ID)" — chỉnh lại cách diễn
đạt ở mục 7.0 (dễ hiểu nhầm "BU_ID vật lý do phần mềm POS tự sinh" thành
rp-server tự suy đoán/tính toán ra hậu tố "00"). Đúng bản chất: BU_ID là
mã GỐC đọc thẳng từ DSMART (nguồn phát sinh đầu tiên), mã Điểm = BU_ID đó
(cố định), còn STK_ID là mã PHÁI SINH do chính người dùng tự tạo ra gắn
theo từng mã Điểm để quản lý theo kho/ngành hàng — không phải DSMART cấp.
Cập nhật "quy tắc mã BU_ID và STK_ID.md" với mục "Chuỗi nguồn gốc dữ liệu"
làm rõ chiều quan hệ này — không đổi code/logic, chỉ sửa tài liệu tham
chiếu bắt buộc theo quy tắc 5.

## 7.0 — Làm rõ file quy tắc mã BU_ID và STK_ID.md (2 lớp BU_ID, tránh nhầm lẫn)

Người dùng hỏi lại: "Mã điểm chính là mã BU_ID đó bạn" — đúng, về Ý NGHĨA
NGHIỆP VỤ, mã Điểm và BU_ID LÀ MỘT (khớp quy tắc 1 đã ghi ở bản 6.99).
Không có gì sai ở code/thiết kế hiện tại, chỉ cần làm rõ tài liệu để tránh
hiểu nhầm: có 2 LỚP "BU_ID" khác NGỮ CẢNH nhưng không khác NỘI DUNG — (1)
"BU_ID nghiệp vụ" = mã Điểm, dùng trong file chỉ tiêu và cột `MaDiem` của
bảng "Ánh xạ Điểm - STK_ID", KHÔNG đổi theo thời gian; (2) cột `BU_ID` VẬT
LÝ trong bảng `TRANSHDR` (CSDL DSMART16, hệ POS) — do chính phần mềm POS
tự sinh, LƯU THÊM hậu tố `"00"` so với mã Điểm, quy ước KỸ THUẬT riêng của
DSMART16 (đã xác nhận bằng SQL thật ở bản 6.98). Cập nhật "quy tắc mã
BU_ID và STK_ID.md" với đoạn làm rõ 2 lớp này — không đổi code, chỉ đổi
tài liệu tham chiếu bắt buộc theo quy tắc 5 (đối chiếu/cập nhật file này
trước mọi thay đổi).

## 6.99 — Thêm cột BuId (tuỳ chọn) vào bảng Ánh xạ Điểm - STK_ID + file quy tắc tham chiếu

Bản 6.98 dịch BU_ID -> mã Điểm bằng quy tắc CỐ ĐỊNH gán cứng trong code
("+00"), KHÔNG đọc từ file "Ánh xạ Điểm - STK_ID" người dùng tự upload
hàng tháng (khác hẳn domain Doanh thu, vốn đã đọc đúng từ bảng này qua
`useDiemStkMapping`) — người dùng phát hiện và hỏi thẳng, đúng: quy tắc
"+00" chỉ nên là SUY LUẬN MẶC ĐỊNH, nguồn sự thật chính phải luôn là bảng
ánh xạ admin tự quản lý, để khi có ngoại lệ (BU_ID thật KHÔNG theo đúng
"+00") admin sửa được mà không cần sửa code.

**etl-db/schema.sql** — thêm cột `BuId NVARCHAR(20) NULL` (tuỳ chọn) vào
`etl.DiemStkMapping` (migrate idempotent, không phá dữ liệu cũ). **etl**
(`lib/diemStkMappingImport.js`, `routes/admin/diemStkMapping.js`) — đọc/
ghi/import/export/template đều thêm cột này. **etl-admin**
(`DiemStkMappingPage.jsx`) — thêm cột "BU_ID" (hiện "(tự suy)" nếu bỏ
trống) + ô nhập trong form sửa 1 dòng. **rp-server**
(`lib/diemStkMapping.js:buildBuIdLookup()`) — ưu tiên giá trị `BuId` admin
khai tường minh, không có thì tự suy "+00" như trước — `compositeReportRunner.js`
đổi từ `stripEntityCodeSuffix` (bản 6.98, cắt hậu tố mù quáng) sang
`mapBuIdToMaDiem` (tra đúng bảng ánh xạ).

Trong lúc làm, người dùng gửi thêm 1 yêu cầu khác đã được hiểu nhầm giữa
chừng thành thiết kế tách `BuIdCu`/`BuIdMoi` theo kỳ (giống MaStkCu/
MaStkMoi) — người dùng sửa lại ngay bằng 5 quy tắc rõ ràng: BU_ID là mã
Điểm, KHÔNG THAY ĐỔI theo thời gian (khác STK — kho CÓ thể đổi). Đã sửa
lại đúng: CHỈ 1 CỘT `BuId` DUY NHẤT, không tách kỳ (khớp thực tế: bảng
TRANSHDR nguồn của domain Giao dịch không có cột STK_ID nên không có căn
cứ nào để tách BU_ID theo kỳ cũ/mới). 5 quy tắc này đã lưu thành file
tham chiếu bắt buộc **"quy tắc mã BU_ID và STK_ID.md"** ở gốc repo — đối
chiếu file này TRƯỚC mọi thay đổi sau này liên quan BU_ID/STK_ID.

## 6.98 — Sửa cột "Giao dịch" luôn trống ở báo cáo nhanh doanh thu LDTD/HCRC

Đối chiếu trực tiếp với dữ liệu thật trên máy chủ (SELECT DISTINCT BU_ID/
STK_ID qua STRANS JOIN TRANSHDR, do người dùng chạy giúp) phát hiện: tài
liệu cũ giả định "BU_ID (bảng TRANSHDR) giữ nguyên = mã Điểm" là **SAI**.
Thực tế `BU_ID = mã Điểm + hậu tố "00"` cố định (vd mã Điểm "217" ->
BU_ID "21700", mã Điểm "002" -> BU_ID "00200" — đã xác nhận đúng cho MỌI
mẫu kiểm, kể cả mã Điểm gộp nhiều mã kho STK). Domain `giaodich_chinhanh`
(nguồn cột "Giao dịch") trước đây KHÔNG cắt hậu tố này, nên entityCode của
khối Giao dịch (vd "21700") không bao giờ khớp entityCode mã Điểm (vd
"217") của khối Doanh thu/Chỉ tiêu — cột "Giao dịch" LUÔN TRỐNG ở mọi báo
cáo LDTD/HCRC, dù job đồng bộ chạy đúng, không lỗi gì (khớp đúng hiện
tượng người dùng báo).

**rp-server/lib/compositeReportRunner.js** — thêm tuỳ chọn khối
`stripEntityCodeSuffix` (áp dụng SAU khi gộp theo ngày, TRƯỚC
useDiemStkMapping/requireStkStability): cắt đúng hậu tố nếu entityCode
thật sự kết thúc bằng chuỗi đó, không đoán bừa nếu không khớp khuôn dạng.
**rp-server/scripts/seedLdtdHcrcReports.js** — bật `stripEntityCodeSuffix:
'00'` cho cả 2 khối `currentGD`/`lastYearGD` (domain `giaodich_chinhanh`).

## 6.97 — Sửa 3 lỗi báo cáo "Báo cáo nhanh doanh thu" LDTD/HCRC (xuất báo cáo + doanh thu sai)

Người dùng báo lỗi sau khi dùng thật báo cáo "Báo cáo nhanh doanh thu -
Lãnh đạo Tập đoàn/HCRC": xuất PDF báo lỗi máy chủ (500), Doanh thu "Thực
đạt" cao bất thường so với Chỉ tiêu, và cột Excel không "auto fit" như
file mẫu. Rà lại, tìm ra 3 lỗi độc lập:

1. **rp-server/routes/reports.js + etl/lib/xlsxResponse.js** — header
   `Content-Disposition` gán thẳng `definition.title` (có dấu tiếng Việt,
   vd "Lãnh đạo Tập đoàn" chứa "đ"/"ậ" NGOÀI bảng Latin-1) vào chuỗi header
   thô — Node ném `TypeError [ERR_INVALID_CHAR]`, 500 lỗi máy chủ mỗi lần
   xuất Excel/PDF có tên chứa ký tự này (báo cáo "...- HCRC" không có ký tự
   nào vượt Latin-1 nên trước đây xuất được, che khuất lỗi ở báo cáo
   "...- Lãnh đạo Tập đoàn"). Đổi sang `res.attachment()` (Express, tự mã
   hoá đúng chuẩn RFC 5987 kèm bản dự phòng ASCII).
2. **rp-server/lib/compositeReportRunner.js** — domain `doanhthu_chinhanh`/
   `giaodich_chinhanh` được đồng bộ bởi 2 job khác nhau ("Live" DSMART16 +
   "Lịch sử" DSMART16_EOM, xem `etl/scripts/seedLdtdHcrcSync.js`) mà
   khoảng ngày CHỒNG LẤN NHAU (CSDL Lịch sử có vùng đệm ~1-2 tháng gần
   nhất, xem "báo cáo doanh thu cuối ngày.md" Bước 1) — 2 dòng
   `dwh.ReportFacts` (khác `SourceSystem`, cùng `EntityCode`+`EventDate`)
   hợp lệ theo khoá UNIQUE nhưng `aggregateDailyRowsByEntity()` trước đây
   coi MỌI dòng trả về là "1 ngày riêng" rồi cộng dồn thẳng — 1 ngày bị 2
   job chồng lấn đồng bộ thì bị TÍNH GẤP ĐÔI. Giờ khử trùng theo
   (entityCode, ngày) TRƯỚC khi cộng dồn — ưu tiên bản ghi `SyncedAt` mới
   nhất khi trùng.
3. **rp-server/lib/exportExcel.js** — bề rộng cột Excel lấy THẲNG
   `definition.columns[].width` (đơn vị TRỌNG SỐ tương đối dùng để chia tỉ
   lệ trang PDF, vd `0.4`/`2.4` — xem `lib/exportPdf.js`) làm bề rộng cột
   Excel THẬT (đơn vị số ký tự) — 2 đơn vị khác hẳn nhau bị gán nhầm khiến
   mọi cột Excel cực hẹp, không "auto fit" như file mẫu. Giờ tự tính bề
   rộng theo ĐỘ DÀI HIỂN THỊ THẬT (tiêu đề + toàn bộ dữ liệu từng cột, có
   tính cả dấu phẩy/% khi định dạng số) sau khi đã ghi hết dữ liệu.

Nhóm cột "Tổng cộng MART"/"Tổng cộng MINIMART" (`DefinitionJson.groupBy`)
và tô màu tiêu đề nhóm cột (`columnGroups`) đã có sẵn đúng trong định
nghĩa 2 báo cáo (`rp-server/scripts/seedLdtdHcrcReports.js`) và được cả
`lib/exportPdf.js`/`lib/exportExcel.js` xử lý đúng — không có lỗi mới phát
sinh ở phần này. Cột "Giao dịch" trống hoàn toàn trên web/export (không
phải trống 1-2 ô) là dấu hiệu domain `giaodich_chinhanh` CHƯA có dữ liệu
đồng bộ (job "Giao dịch chi nhánh - Live/Lịch sử" chưa chạy/lỗi phía
etl-admin) — không phải lỗi code, cần kiểm tra Nhật ký đồng bộ (etl-admin
→ Đồng bộ dữ liệu) trên máy chủ thật.

## 6.96 — Sửa khẩn: màn hình trắng khi đăng nhập api-admin (lỗi phát sinh từ bản 6.95)

Sau khi release bản 6.95 lên máy chủ, đăng nhập `api-admin` bị màn hình
trắng (console báo `ReferenceError: useAuth is not defined`). Nguyên nhân:
khi sửa Audit-Fix4 (bản 6.95, tách scope voucher) ở
`api-admin/src/pages/ConsumersPage.jsx`, thao tác sửa file đã vô tình xoá
mất 4 dòng import đầu file (`useEffect`/`useState`, `api`, `useAuth`,
`DataTable`) — Vite build KHÔNG báo lỗi vì tham chiếu biến tự do chỉ vỡ lúc
CHẠY THẬT trên trình duyệt, không phải lúc build. Đã thêm lại đúng 4 dòng
import bị mất, kiểm tra lại `npm run build` sạch. Đã rà lại các trang khác
từng sửa trong đợt Audit-Fix (vd `etl-admin/src/pages/CoreItemListPage.jsx`)
— không phát hiện thêm trường hợp tương tự.

## 6.95 — Rà soát chuyên sâu nghiệp vụ/báo cáo/ETL/API sau bản voucher — sửa 12 lỗi logic/rủi ro

Người dùng yêu cầu rà soát chuyên sâu toàn hệ thống sau khi hoàn tất tính
năng Voucher (bản 6.91-6.94), xử lý theo thứ tự rủi ro cao xuống thấp. 12
lỗi/rủi ro được phát hiện và sửa, mỗi lỗi kèm test riêng (fakeModule):

1. **etl/routes/admin/coreItemList.js** — chặn (400, cần xác nhận
   `confirmEmpty`) khi upload sheet TRỐNG cho loại điểm ĐANG có dữ liệu, sẽ
   XOÁ SẠCH danh sách Core im lặng (mất cảnh báo "hết hàng" của báo cáo
   Core stock=0). Không chặn nếu loại điểm đó đang rỗng sẵn.
2. **api-server/lib/voucherRedeemService.js** — `redeemVoucher()` đổi
   STATUS (DSMART16) và ghi `api.VoucherRedemptions` (CSDL admin) là 2 kết
   nối khác nhau, không giao dịch chung. Thêm thử lại 3 lần cho bước ghi
   audit; thất bại thật thì trả `500` rõ ràng "đã thu hồi thành công nhưng
   ghi nhận cục bộ lỗi, KHÔNG quét lại" (`RedeemAuditFailedError`) — khớp
   đúng tài liệu app voucher gốc, tránh mất mốc "ngày đã dùng" trong im lặng.
3. **etl/lib/tableSyncEngine.js + jobs/runSync.js** — job "Lịch sử" chạy
   lần đầu (VIEW gộp UNION ALL hàng chục triệu dòng) trước đây tải TOÀN BỘ
   kết quả + biến đổi vào 2 mảng JS đầy đủ trước khi ghi dòng đầu tiên, rủi
   ro Node OOM. Đọc-biến đổi-ghi theo LÔ 5000 dòng (OFFSET...FETCH NEXT/
   LIMIT...OFFSET, thêm `paginate()` vào 2 adapter mssql/mysql), watermark
   vẫn chỉ ghi 1 lần cuối lượt chạy (an toàn khi crash giữa chừng).
4. **Scope API riêng cho voucher** (`voucherCheck`/`voucherRedeem`, thay
   dùng chung `realtime`/`realtimeWrite` với Endpoint động) — cấp
   `realtime` cho 1 đối tác vì lý do khác trước đây vô tình mở luôn
   `/vouchers/check`. Đối tác voucher hiện có cần được cấp lại 2 scope mới.
5. **etl/routes/admin/syncJobs.js** — chặn lúc lưu (tạo VÀ sửa job) nếu
   `dimensionColumns` (bảng chính) và `lookupDimensionColumns` (bảng liên
   kết) trùng tên — `tableSyncEngine.js:transformRow()` gộp cả 2 vào CÙNG 1
   object theo tên cột, trùng tên bị đè lẫn nhau im lặng.
6. **rp-server/lib/compositeReportRunner.js + routes/reportCatalog.js** —
   `dateOffsetYears` CHỈ áp dụng được cho khối `directDb`; khối
   `apiReport`/`apiRealtime` (gọi API ngoài, không hiểu khoảng ngày) trước
   đây BỎ QUA ÂM THẦM, báo cáo hiện SAI dữ liệu "cùng kỳ năm trước" (vẫn là
   hiện tại). Chặn cả lúc lưu (400) và lúc chạy (throw, phòng script seed).
7. **rp-server/lib/formulaEngine.js** (`extractFieldPaths()` mới) +
   `compositeReportRunner.js`/`reportCatalog.js` — công thức/cột tham chiếu
   tên khối gõ sai hoặc khối đã đổi tên luôn ra `undefined` không cảnh báo.
   Chặn lúc lưu báo cáo composite (400), cảnh báo (console.warn, không chặn
   cứng) lúc chạy.
8. **api-server/lib/realtimeEngine.js** — `runList()` khi JOIN không unique
   (LookupJoinColumn nhân dòng) trước đây chỉ `console.warn` rồi vẫn trả
   TOÀN BỘ dòng nhân cho đối tác. Giờ LOẠI dòng nhân, chỉ giữ 1 dòng/bản ghi
   bảng chính, vẫn cảnh báo log server.
9. **api-server/lib/voucherGuessGuard.js** (mới) — đếm số lần
   `/check`/`/redeem` trả `INVALID`/`notFound` LIÊN TIẾP theo `consumer.id`,
   riêng với giới hạn tần suất chung (`RateLimitPerMinute`, không phân
   biệt đúng/sai) — chặn `429` sau 20 lần dò sai liên tiếp/10 phút, chống
   dò mã voucher tự động. Mã đúng (kể cả đã dùng) xoá ngay bộ đếm.
10. **rp-server/lib/compositeReportRunner.js** (`shiftYears()`) — 29/2 dịch
    tới 1 năm KHÔNG NHUẬN bị JS `Date.setUTCFullYear()` tự "chồm" sang 1/3,
    lệch nguyên 1 ngày cho báo cáo "cùng kỳ năm trước" chạy đúng 29/2. Chốt
    cứng về 28/2 khi năm đích không nhuận.
11. **rp-server/routes/reports.js** (`GET /:reportId/filter-options/:field`)
    — danh sách rỗng có 2 nguyên nhân khác nhau (domain gõ sai/chưa đồng bộ
    vs domain có dữ liệu nhưng valueField sai tên) cùng ra `200 []` không
    phân biệt được. Thêm 1 truy vấn kiểm tra CHỈ ở nhánh rỗng, console.warn
    phân biệt rõ 2 trường hợp — client vẫn nhận `200 []` như cũ.
12. **etl/scripts/seedLdtdHcrcSync.js** — xoá hướng dẫn lỗi thời nhắc khai
    "Ánh xạ mã chi nhánh" (tính năng đã bỏ hẳn từ trước, BU_ID dùng thẳng
    làm entityCode).

## 6.94 — Tài liệu API voucher riêng để GỬI CHO ĐỐI TÁC (api-voucher-check-redeem-gui-doi-tac.md)

Người dùng làm rõ: `api-voucher-check-redeem.md` (bản 6.92/6.93) là tài
liệu TRIỂN KHAI nội bộ cho IT/DBA (có nhắc etl-admin/api-admin/DSMART16,
mục 13 hướng_dẫn_báo_cáo.md...) — KHÔNG phù hợp gửi thẳng cho đối tác
ngoài (team app voucher). Viết file MỚI riêng
`api-voucher-check-redeem-gui-doi-tac.md` — chỉ có hợp đồng API thuần tuý
(base URL, xác thực bằng `X-API-Key`, request/response, mã lỗi, ghi chú
tích hợp/idempotent) — bỏ hết chi tiết nội bộ (DSMART16, trang cấu hình
admin, mục 13...). Từ nay: tài liệu triển khai nội bộ và tài liệu gửi đối
tác của CÙNG 1 API là 2 FILE RIÊNG, không gộp chung.

## 6.93 — Bổ sung ví dụ xác thực cụ thể vào api-voucher-check-redeem.md

Người dùng yêu cầu gửi tài liệu API voucher cho team app đối chiếu — bổ
sung thêm mục "Cách xác thực" với ví dụ `curl` cụ thể (API key tĩnh VÀ
HMAC ký từng request) ngay trong `api-voucher-check-redeem.md`, để tài
liệu tự đủ khi gửi cho đối tác ngoài, không cần đọc thêm
`api-server/README.md` mới hiểu cách gọi. Không đổi code, chỉ đổi tài liệu.

## 6.92 — API check/redeem voucher cho app "HCRC Voucher Redemption" (api-server = "Core API")

Người dùng cung cấp tài liệu API của app quét mã voucher ngoài (app này
trước đây gọi 1 "Core API" riêng để kiểm tra/thu hồi voucher) — yêu cầu
api-server đóng vai trò đúng "Core API" đó, đọc/ghi TRỰC TIẾP DSMART16
(Live), không qua Data Warehouse. Đã phân tích + chốt phương án tối giản
với người dùng trước khi code: tái dùng model "Đối tác" (Consumer API
key/HMAC) sẵn có thay vì xây hệ đăng nhập nhân viên riêng như tài liệu app
gốc mô tả; redeem chỉ đổi `STATUS` (giữ nguyên quyết định cũ mục 13), không
ghi `PMCRDRCV`, không xây hàng đợi đồng bộ lại khi mất kết nối.

- `api-db/schema.sql` — `api.VoucherRedemptions` (ghi mốc thời gian mỗi
  lượt redeem — `PMCRDINF` không có cột "ngày đã dùng") + `api.VoucherSettings`
  (1 dòng, chọn "Nguồn dữ liệu" trỏ DSMART16).
- `api-server/lib/voucherRedeemService.js` (mới) — `checkVoucher`/
  `redeemVoucher`, dùng lại kỹ thuật `UPDATE...OUTPUT...WHERE` atomic đã
  kiểm chứng ở `realtimeWriteEngine.js` (chống race 2 request cùng mã).
- `api-server/routes/v1/vouchers.js` (mới) — `POST /api/v1/vouchers/check`,
  `POST /api/v1/vouchers/redeem`, gate bằng scope Consumer có sẵn
  (`realtime`/`realtimeWrite`), khớp đúng hợp đồng JSON tài liệu app (trừ
  auth và bỏ `pendingSync`).
- `api-server/routes/admin/voucherSettings.js` (mới) + MenuCode
  `voucher-settings` (`routes/admin/roles.js`) — trang "Cấu hình Voucher".
- `api-admin/src/pages/VoucherSettingsPage.jsx` (mới) + nav/route/landing +
  module "Hướng dẫn" cập nhật mục "Endpoint".
- Test (fakeModule) `voucherRedeemService.js` — đủ nhánh UNUSED/USED/
  INVALID, redeemed/alreadyUsed (gọi trùng lẫn đã dùng từ trước)/notFound,
  ConfigError khi chưa cấu hình Nguồn dữ liệu.
- Tài liệu triển khai riêng `api-voucher-check-redeem.md` (theo đúng quy
  ước "mỗi tính năng 1 file riêng" đã chốt).

Còn lại: "Kiểm tra voucher" nội bộ (nhân viên tra thủ công) đã có sẵn cơ
chế (mục 3/13.1 `hướng_dẫn_báo_cáo.md`), không cần code — chỉ cần cấu
hình. "Báo cáo voucher" tổng hợp theo ngày/chi nhánh (tháng hiện tại qua
API trực tiếp, quá khứ qua DWH) làm ở bản SAU (`bc-voucher.md`) — đang chờ
DBA xác nhận cấu trúc bảng voucher bên `DSMART16_EOM`.

## 6.91 — Module "Hướng dẫn" (cấu hình báo cáo theo nghiệp vụ) cho cả 3 trang quản trị

Thêm module "Hướng dẫn" cho `etl-admin`, `api-admin`, `rp-user` — tham khảo
giao diện "HCRC Workspace" (VPĐT): 2 cột, danh mục nhóm bên trái (icon +
nhãn, chia theo nhóm) và nội dung bên phải. Nội dung viết CỨNG trong code
(không CMS/CRUD), mỗi trang CHỈ chứa hướng dẫn đúng nghiệp vụ của trang đó
(không lặp lại nội dung của 2 trang kia):

- `etl-admin` — hướng dẫn CHUẨN BỊ DỮ LIỆU NGUỒN: khai nguồn dữ liệu, tạo
  job "Theo bảng", theo dõi đồng bộ, nhập chỉ tiêu, ánh xạ Điểm - STK_ID,
  danh sách hàng Core, nhật ký thao tác, phân quyền & vai trò.
- `api-admin` — hướng dẫn PHỤC VỤ DỮ LIỆU REALTIME: kết nối dữ liệu,
  endpoint đọc/ghi, quản lý đối tác & bảo mật (HMAC/rate-limit), giám sát
  (Live/Lịch sử/Thống kê), nhật ký & phân quyền.
- `rp-user` — hướng dẫn TẠO/XEM BÁO CÁO: các loại nguồn báo cáo (directDb/
  composite/apiReport/apiRealtime/tồn kho=0), báo cáo tự do, biểu đồ/
  dashboard/cảnh báo bất thường, lịch gửi email, xuất Excel/PDF, phân
  quyền & vai trò.

**Phân quyền xem**: mục mới gắn `MenuCode` `huong-dan`, đi qua đúng cơ chế
phân quyền menu đã có sẵn của từng trang (`admin.RoleMenuAccess` ở etl/api,
`app.RoleMenuAccess` ở rp-user) — mặc định KHÔNG tự cấp cho vai trò nào
(trừ vai trò hệ thống `admin`/`IsSystemRole`, luôn thấy mọi menu); DBA tự
cấp quyền Xem cho vai trò cần thiết ở trang "Vai trò"/"Phân quyền".

- `etl/routes/admin/roles.js`, `api-server/routes/admin/roles.js` — thêm
  `huong-dan` vào `MENU_CATALOG`.
- `rp-db/schema.sql` — thêm dòng `app.MenuItems` mới cho `huong-dan`.
- `etl-admin/src/pages/HuongDanPage.jsx`, `api-admin/src/pages/HuongDanPage.jsx`,
  `rp-user/src/modules/huong-dan/HuongDanPage.jsx` (mới) + CSS
  `.huong-dan-*` dùng chung kiểu dáng ở cả 3 trang + wiring nav/route/
  landing-order.

Đã build sạch cả 3 frontend (vite) và render thử `HuongDanPage.jsx` (SSR +
Chromium) để xác nhận layout đúng ý (danh mục nhóm bên trái có icon, nội
dung bên phải, trạng thái đang chọn tô sáng).

## 6.90 — Khớp đầy đủ cột "Core stock = 0" với file mẫu Excel + tách tài liệu triển khai riêng từng báo cáo

Người dùng đối chiếu báo cáo bản 6.89 với file mẫu `Stock_Core_....xlsx` thật
đang dùng — bổ sung đủ các cột còn thiếu để khớp hoàn toàn, và tách 2 tài
liệu hướng dẫn triển khai riêng cho IT/DBA thay vì gộp chung
`hướng_dẫn_báo_cáo.md`.

- `etl-db/schema.sql` — thêm cột `Dvt` (NVARCHAR, tuỳ chọn) vào
  `etl.CoreItemList` (migration `IF COL_LENGTH ... IS NULL`).
- `etl/lib/coreItemListImport.js` + `etl/routes/admin/coreItemList.js` +
  `etl-admin/src/pages/CoreItemListPage.jsx` — thêm cột `Dvt` xuyên suốt:
  parse/replace/template/export/API/UI.
- `rp-server/lib/coreItemList.js` — thêm `Dvt` vào bản ghi tham khảo; thêm
  `loadCoreItemListMap(loaiDiem)` (bản đầy đủ kèm mh/tenHang/dvt/maNganh/
  tenNganh) để `coreZeroStockRunner.js` làm giàu từng dòng kết quả.
- `rp-server/lib/coreZeroStockRunner.js` — bổ sung đủ cột khớp file mẫu:
  **Mã điểm** (tra ngược qua "Ánh xạ Điểm - STK_ID" có sẵn, dùng lại
  `lib/diemStkMapping.js`, để trống nếu kho chưa khai ánh xạ — không lỗi),
  **Mã kho** (STK_ID thô, tách riêng khỏi Tên kho), **Đvt**/**Mã ngành**/
  **Tên ngành** (từ danh sách Core), **Ngày bán cuối** (ngày gần nhất CÓ
  bán, không giới hạn hôm nay — LUÔN hiển thị, không tuỳ chọn), **Ngày nhập
  cuối** (domain tuỳ chọn mới `lastReceivedDomain`), **Mã đang đặt** (0/1,
  tự suy ra từ "SL đang đặt" > 0, không cần domain riêng). Cột "Khóa All"/
  "Khóa theo kho" CHỦ ĐÍCH không hiển thị lại (mặt hàng đang khoá đã bị loại
  hẳn khỏi kết quả, đúng hành vi "Bỏ khóa" của file mẫu).
- `rp-server/scripts/seedCoreZeroStockReports.js` — thêm cấu hình mặc định
  `lastReceivedDomain: 'core_ngay_nhap_cuoi'`.
- `rp-server/lib/exportPdf.js` — sửa lỗi CÓ THẬT phát hiện lúc demo báo cáo
  13-14 cột: dữ liệu ô (khác tiêu đề cột, đã tự xuống dòng từ bản 6.88)
  chưa từng bị giới hạn theo bề rộng cột thật — chữ dài (tên kho/tên hàng)
  tràn đè lên cột kế bên. Thêm `fitText()` cắt bớt kèm "…" khi chữ rộng hơn
  cột; đồng thời báo cáo phẳng (không `columnGroups`) có > 6 cột giờ tự
  chuyển sang trang NGANG thay vì luôn trang dọc — cải thiện luôn cả báo
  cáo "Top bán chạy tồn kho=0" (bản 6.87/6.88, tới 9 cột) dù không đổi gì ở
  báo cáo đó.
- **Tách tài liệu triển khai riêng từng báo cáo** (yêu cầu người dùng, quy
  tắc áp dụng từ nay): mỗi báo cáo độc lập có 1 file `bc-<mã báo cáo>.md`
  riêng, viết rõ ràng từng bước cho team IT/DBA thực hiện (mục "Việc cần
  làm" theo thứ tự + ai làm, mẫu VIEW/job, tạo báo cáo, hỏi & đáp) — không
  gộp chung `hướng_dẫn_báo_cáo.md` nữa:
  - `bc-ton-kho-0.md` (mới) — tách từ mục 12 cũ.
  - `bc-core-ton-kho-0.md` (mới) — viết lại từ mục 16 cũ, kèm bảng so khớp
    cột đầy đủ với file mẫu Excel khách hàng (mục "So khớp với file mẫu
    Excel").
  - `hướng_dẫn_báo_cáo.md` mục 12/16 — thay bằng pointer ngắn sang 2 file
    trên + ghi rõ quy tắc mới ngay tại mục 12.
  - Sửa các tham chiếu "mục 12" còn sót trong code
    (`seedTopZeroStockReport.js`, `topSellingZeroStockRunner.js`) trỏ sang
    `bc-ton-kho-0.md`.
- Test (fakeModule, xem scratchpad): cập nhật
  `test-core-zerostock-integration.js` (thêm Mã điểm qua ánh xạ giả lập,
  Đvt/Mã ngành/Tên ngành, Ngày bán cuối/Ngày nhập cuối, Mã đang đặt) và
  `test-coreItemListImport.js` (Dvt round-trip) — tất cả pass, không
  regression `test-topzerostock-integration.js`.

## 6.89 — Báo cáo "Core stock = 0" — danh sách hàng Core cố định, tách riêng Mart/Minimart

Tính năng MỚI theo yêu cầu người dùng (kèm file mẫu `Stock_Core_...xlsx`):
báo cáo tồn kho = 0 THỨ 2, khác hẳn "Top bán chạy đang tồn kho = 0" (bản
6.87) ở bước CHỌN thực thể — không tự xếp hạng theo doanh số, mà dùng ĐÚNG 1
danh sách mặt hàng "Core" (mặt hàng BẮT BUỘC luôn phải có hàng) do admin tự
khai/upload, áp dụng CHUNG cho MỌI kho cùng loại hình (Mart/Minimart), KHÔNG
khai riêng theo từng kho — vì vậy tách thành **2 báo cáo riêng**
(`bc-core-ton-kho-0-mart`/`bc-core-ton-kho-0-minimart`) thay vì 1 báo cáo +
bộ lọc. Công thức tính tồn=0 DÙNG LẠI NGUYÊN VẸN công thức đã chốt ở bản
6.87 (tồn "hôm qua" − bán "hôm nay", KHÔNG cộng lại hàng nhập trong ngày).

- `etl-db/schema.sql` — bảng mới `etl.CoreItemList` (LoaiDiem/MaHang bắt
  buộc, MH/TenHang/MaNganh/TenNganh tham khảo, UNIQUE theo LoaiDiem+MaHang).
- `etl-db/grants.sql` — mở rộng login `etl_diem_stk_reader` (đã dùng cho
  `etl.DiemStkMapping`) thêm SELECT bảng mới — TÁI SỬ DỤNG pool
  `ETL_DIEM_STK` có sẵn, không cần cấu hình `.env` mới.
- `etl/lib/coreItemListImport.js` (mới) — parse file `.xlsx` ĐÚNG 2 sheet
  cố định "Core Mart"/"Core Minimart", **REPLACE** (xoá hết + ghi lại) theo
  ĐÚNG LoaiDiem có sheet trong lượt nhập — KHÁC hẳn "Ánh xạ Điểm - STK_ID"
  (upsert cộng dồn) vì danh sách Core là danh sách CỐ ĐỊNH, mã bị xoá khỏi
  file nghĩa là KHÔNG CÒN thuộc diện Core. Kèm tải file mẫu/xuất Excel.
- `etl/routes/admin/coreItemList.js` (mới) + `etl/server.js` — CRUD/import/
  template/export, yêu cầu quyền Sửa cho MỌI thao tác kể cả xem (cùng
  nguyên tắc "Ánh xạ Điểm - STK_ID").
- `etl/routes/admin/roles.js` — thêm MenuCode `core-item-list` vào
  `MENU_CATALOG`.
- `etl-admin` — trang mới `CoreItemListPage.jsx` (upload/tải mẫu/xuất/xoá
  dòng, tách tab Mart/Minimart) + nav/routes/RolesPage.jsx wiring.
- `rp-server/lib/reportFactsHelpers.js` (mới) — tách các hàm đọc
  `dwh.ReportFacts` dùng chung (trước đây định nghĩa riêng trong
  `topSellingZeroStockRunner.js`) để `coreZeroStockRunner.js` dùng lại
  NGUYÊN VẸN, không sao chép logic — thêm 2 hàm mới:
  `loadLatestMeasureWithDate` ("SL đang đặt" kèm "Ngày đặt") và
  `loadLatestDimensionsForDomain` (quét nguyên domain, dùng để tra dimension
  "chain" và liệt kê (kho, mã hàng) đối chiếu với danh sách Core).
  `topSellingZeroStockRunner.js` đã refactor để import từ file này — hành vi
  KHÔNG đổi (test tích hợp cũ vẫn pass y hệt).
- `rp-server/lib/coreItemList.js` (mới) — đọc `etl.CoreItemList` qua pool
  `ETL_DIEM_STK` có sẵn (cache 60s, lỗi kết nối trả Map rỗng — cùng nguyên
  tắc `lib/diemStkMapping.js`, không để 1 nguồn phụ chặn đứng báo cáo).
- `rp-server/lib/coreZeroStockRunner.js` (mới) — `SourceType='coreZeroStock'`:
  (1) nạp danh sách Core theo `loaiDiem`; (2) xác định STK_ID nào thuộc
  đúng loại hình — TÁI SỬ DỤNG dimension "chain" đã có sẵn ở domain doanh
  thu chi nhánh, KHÔNG cần job/VIEW mới; (3) quét (kho, mã hàng) đang có tồn
  kho, giữ lại đúng cặp khớp Core + đúng loại hình; (4) áp công thức tồn=0;
  (5) TUỲ CHỌN: loại mã đang bị "Khóa All"/"Khóa theo kho", hiển thị thêm
  "SL đang đặt"/"Ngày đặt" tham khảo — cấu hình qua `DefinitionJson`, không
  hardcode tên bảng/điều kiện (cùng nguyên tắc "Chờ nhập"/"Đã nhập" bản 6.87).
- `rp-server/lib/reportRunner.js` — thêm dispatch `coreZeroStock`.
- `rp-server/scripts/seedCoreZeroStockReports.js` (mới) — tạo/cập nhật
  idempotent 2 báo cáo Mart/Minimart, mirror `seedTopZeroStockReport.js`.
- `rp-db/schema.sql` — thêm `'coreZeroStock'` vào
  `CK_ReportCatalog_SourceType`.
- `hướng_dẫn_báo_cáo.md` mục 16 (mới) — hướng dẫn đầy đủ: khai danh sách
  Core, tái sử dụng dimension "chain", 3 VIEW mẫu tuỳ chọn (Khóa All/Khóa
  theo kho/SL đang đặt), tạo báo cáo qua script, `DefinitionJson` mẫu.
- Test (fakeModule, xem scratchpad): `test-coreItemListImport.js` (8 test —
  parse 2 sheet, upload 1 sheet giữ nguyên sheet kia, trùng MaHang trong
  sheet, thiếu MaHang, sheet lạ bị bỏ qua, không sheet nào khớp → throw,
  REPLACE chỉ đúng LoaiDiem có trong lượt nhập); `test-core-zerostock-integration.js`
  (lấy ĐÚNG DefinitionJson từ seed script, chạy `runCoreZeroStockReport()`
  thật, xác nhận đúng 1/6 tình huống lọt: Core + đúng chain + tồn=0 + không
  khoá — 5 tình huống còn lại đều bị loại đúng lý do).

## 6.88 — Sửa lỗi xuất PDF đè chữ cho báo cáo nhiều cột không có columnGroups

Phát hiện lúc demo báo cáo "Top bán chạy đang tồn kho = 0" (bản 6.87, đủ 9
cột khi khai đủ 4 domain Chờ/Đã nhập tuỳ chọn): `lib/exportPdf.js` chỉ bọc
dòng (word-wrap) cho tiêu đề cột ở nhánh có `columnGroups` — báo cáo KHÔNG
khai `columnGroups` (đa số báo cáo, gồm cả `topZeroStock`) vẽ tiêu đề 1 dòng
cố định, nhãn dài (vd "Đã nhập hôm nay (Điều chuyển)") tràn đè lên cột kế
bên khi cột hẹp. Đồng thời `topSellingZeroStockRunner.js` chưa khai `width`
cho cột nào, khiến 9 cột chia đều bằng nhau — cả tiêu đề LẪN dữ liệu
("BRGMart Cầu Giấy" đè vào "SP002") đều bị tràn.

- `rp-server/lib/exportPdf.js` — nhánh header KHÔNG có `columnGroups` giờ
  dùng `drawWrappedCenteredText()` (bọc dòng, giống nhánh có `columnGroups`
  đã làm) thay vì `drawCellText()` (1 dòng cố định), header cao thêm bằng
  `HEADER_ROW_HEIGHT` (24pt) thay vì `ROW_HEIGHT` (16pt) để có chỗ xuống
  dòng — không ảnh hưởng báo cáo có nhãn cột ngắn (vẫn vừa 1 dòng như cũ).
- `rp-server/lib/topSellingZeroStockRunner.js` — `describeColumns()` thêm
  `width` cho từng cột (Chi nhánh/Tên hàng rộng hơn cột số) — khớp đúng quy
  ước `definition.columns[].width` đã dùng ở mọi báo cáo khác.

Đã kiểm thử: chạy THẬT `runTopZeroStockReport()` + `exportPdf()`/`exportExcel()`
với dữ liệu giả lập 9 cột, render PDF ra ảnh xác nhận không còn đè chữ ở cả
tiêu đề lẫn dữ liệu. Chạy lại demo báo cáo LDTD/HCRC (có `columnGroups`) xác
nhận không đổi hành vi, không có regression.

**Cần làm trên server sau bản này**: chỉ cần `git pull` + khởi động lại
`rp-server` — không cần chạy lại script seed nào (sửa code xử lý xuất PDF,
không đổi `DefinitionJson`).

## 6.87 — Tạo báo cáo thật "Top bán chạy đang tồn kho = 0" (bc-ton-kho-0)

Từ bản 6.11/6.13, hạ tầng backend (`rp-server/lib/topSellingZeroStockRunner.js`,
dispatch trong `reportRunner.js`, CHECK constraint `SourceType='topZeroStock'`)
và tài liệu (`hướng_dẫn_báo_cáo.md` mục 12) đã có đủ, nhưng CHƯA từng có báo
cáo THẬT nào được tạo trong `app.ReportCatalog` — chỉ là "khung" chưa ai
dùng được. Người dùng yêu cầu bắt tay tạo báo cáo thật.

- **MỚI** `rp-server/scripts/seedTopZeroStockReport.js` — script idempotent
  (mirror `seedLdtdHcrcReports.js`) tạo/cập nhật báo cáo `bc-ton-kho-0`
  ("Top bán chạy đang tồn kho = 0") trong `app.ReportCatalog`, gán vào menu
  "Báo cáo vận hành" (`reports-van-hanh`, khác nhóm "kinh doanh" của LDTD/
  HCRC). `DefinitionJson` khớp đúng mẫu đã chốt ở mục 12 Bước 3: `salesDomain:
  'banhang_sku'`, `stockDomain: 'tonkho_sku'`, 4 domain "Chờ nhập"/"Đã nhập"
  tuỳ chọn, `topN: 50`, `threshold: 0`, bộ lọc `rankWindow` (4 lựa chọn cố
  định) + `branches` (multiSelect, tự lấy danh sách chi nhánh thật qua
  `optionsSource`).
- KHÔNG sửa gì ở `topSellingZeroStockRunner.js`/`reportRunner.js` — logic
  tính "tồn ước tính = tồn cuối kỳ hôm qua − bán hôm nay, KHÔNG cộng lại
  hàng nhập trong ngày" đã đúng từ bản 6.13, xác nhận lại qua test tích hợp
  bên dưới.

Đã kiểm thử (fakeModule): (1) script chạy lần đầu INSERT đúng 1 dòng với
DefinitionJson đủ mọi field, chạy lại lần 2 UPDATE (không tạo trùng); (2)
test tích hợp lấy ĐÚNG DefinitionJson do script sinh ra, đưa qua
`runTopZeroStockReport()` THẬT với dữ liệu giả lập 3 tình huống — mặt hàng
đã bán hết tồn hôm qua (tồn ước tính = 0) lọt đúng, có cột "Đã nhập hôm nay"
tham khảo (50) nhưng KHÔNG bị cộng ngược vào tồn ước tính; mặt hàng còn tồn
bị loại; mặt hàng chưa từng có dữ liệu tồn kho bị loại (không suy diễn = 0).

**Cần làm trên server sau bản này** (báo cáo CHƯA có số liệu cho tới khi
xong đủ 3 bước, xem `hướng_dẫn_báo_cáo.md` mục 12 Bước 1+2):
1. `git pull` + khởi động lại `rp-server`.
2. Chạy `node rp-server/scripts/seedTopZeroStockReport.js` — tạo báo cáo
   (mặc định gán vào menu "Báo cáo vận hành", truyền tham số để đổi menu
   khác nếu cần: `node scripts/seedTopZeroStockReport.js <menuCode>`).
3. DBA tạo 2 VIEW bắt buộc trên DSMART16 (`dbo.vw_BanHangTheoSKU`,
   `dbo.vw_TonKhoTheoSKU`) + admin etl-admin tạo 2 job "Theo bảng" domain
   `banhang_sku`/`tonkho_sku` (BẮT BUỘC bật "Giữ lịch sử theo ngày").
4. (Tuỳ chọn) lặp lại cho 4 VIEW/job "Chờ nhập"/"Đã nhập" nếu muốn có 4
   cột tham khảo đó.
5. Vào Hệ thống → Phân quyền, gán quyền xem `bc-ton-kho-0` cho đúng vai trò.

## 6.86 — Ẩn CẢ "Cùng kỳ Doanh thu" khi đổi kho, dù dwh vẫn có dữ liệu thật dưới kho cũ

Người dùng phát hiện lỗ hổng: bản 6.85 mới chỉ chặn tường minh cho Giao dịch
(`requireStkStability`). Doanh thu vẫn dùng cơ chế "tình cờ" — khối
`lastYear` tra `MaStkCu` trong `dwh.ReportFacts`, NẾU old-STK vẫn còn dữ
liệu thật ở đó (hoàn toàn có thể xảy ra) thì báo cáo VẪN hiện số Doanh thu
"Cùng kỳ" cho mã Điểm đã đổi kho — sai theo đúng quy tắc nghiệp vụ đã chốt ở
6.85 (kho CŨ và kho MỚI là 2 điểm bán khác nhau, không so sánh cùng kỳ được,
BẤT KỂ dữ liệu 2 bên có tồn tại hay không).

- `rp-server/lib/diemStkMapping.js` — `remapRowsToDiem(rows, diemMapping,
  useCu)`: thêm điều kiện `useCu && !stkListsMatch(info.maStkCu,
  info.maStkMoi) -> continue` (loại hẳn mã Điểm đó khỏi kết quả kỳ trước)
  TRƯỚC bước tra cứu dữ liệu — không còn suy luận từ "tìm không thấy dòng
  khớp" nữa, mà chặn tường minh ngay từ đầu, đối xứng với cơ chế
  `requireStkStability` đã thêm cho Giao dịch ở bản 6.85. Kỳ hiện tại
  (`useCu=false`, dùng `MaStkMoi`) không đổi gì.

Đã kiểm thử (fakeModule, chạy THẬT `runCompositeReport()` với dữ liệu doanh
thu năm trước dưới mã kho CŨ có thật trong nguồn giả lập): mã Điểm đã đổi
kho giờ ẩn ĐÚNG CẢ 2 cột "Cùng kỳ năm 2025" (Doanh thu lẫn Giao dịch) và
"Tỷ lệ % LFL" tương ứng, mã Điểm chưa đổi kho không bị ảnh hưởng gì.

**Cần làm trên server sau bản này**: chạy lại
`node rp-server/scripts/seedLdtdHcrcReports.js` — thực ra bản này KHÔNG đổi
`DefinitionJson` (chỉ sửa logic trong `diemStkMapping.js`), nên chỉ cần
`git pull` + khởi động lại `rp-server`, không bắt buộc chạy lại script (chạy
lại cũng vô hại, không sinh trùng).

## 6.85 — Ẩn "Cùng kỳ Giao dịch" cho mã Điểm đã đổi mã kho (STK cũ ≠ STK mới)

Người dùng làm rõ thêm nghiệp vụ: mã kho (STK) mới thể hiện đúng nhất giao
dịch/doanh thu của 1 điểm bán — khi 1 điểm đóng cửa/mở lại dưới mã kho MỚI
khác mã kho CŨ, giao dịch của kỳ trước (thuộc kho CŨ) và kỳ này (thuộc kho
MỚI) là 2 điểm bán KHÁC NHAU dù chung mã Điểm (BU_ID), không được so sánh
"cùng kỳ năm trước" chung với nhau.

Trước bản này: domain `giaodich_chinhanh` (Giao dịch) giữ nguyên BU_ID làm
EntityCode (đúng, xem bản 6.83 — nguồn `TRANSHDR` không có cột mã kho để
remap) NHƯNG khối "Cùng kỳ năm trước" của Giao dịch vẫn hiện số bình thường
cho MỌI mã Điểm, kể cả mã đã đổi kho — vì `TRANSHDR` vẫn ghi liên tục theo
BU_ID không đổi, dù về nghiệp vụ đây là 2 điểm bán khác nhau.

- `rp-server/lib/diemStkMapping.js` — thêm hàm `stkListsMatch(a, b)` — so
  sánh 2 danh sách mã kho có phải CÙNG 1 TẬP HỢP hay không (không quan tâm
  thứ tự).
- `rp-server/lib/compositeReportRunner.js` — thêm cờ block tuỳ chọn (mặc
  định tắt) `requireStkStability` — dùng cho domain KHÔNG bật
  `useDiemStkMapping` (entityCode đã đúng = mã Điểm ngay từ nguồn): loại
  HẲN dữ liệu của khối này cho mã Điểm nào có "Ánh xạ Điểm - STK_ID" khai
  `MaStkCu` KHÁC `MaStkMoi` (đã đổi kho), hoặc KHÔNG có dòng khai — dù
  nguồn thô vẫn có số liên tục theo BU_ID.
- `rp-server/scripts/seedLdtdHcrcReports.js` — bật `requireStkStability:
  true` cho khối `lastYearGD` (Cùng kỳ Giao dịch) của cả 2 báo cáo LDTD/
  HCRC; khối `currentGD` (Giao dịch hiện tại) giữ nguyên không đổi.

Đã kiểm thử (fakeModule, chạy THẬT `runCompositeReport()`): mã Điểm có
`MaStkCu` khác `MaStkMoi` bị loại đúng cột "Cùng kỳ năm 2025"/"Tỷ lệ % LFL"
của Giao dịch (trống, không phải 0), mã Điểm không đổi kho vẫn hiện số như
trước — không ảnh hưởng cột Giao dịch hiện tại hay Doanh thu.

**Cần làm trên server sau bản này**: chạy lại
`node rp-server/scripts/seedLdtdHcrcReports.js` để áp cờ mới vào 2 báo cáo
hiện có.

## 6.84 — Loại hẳn mã Điểm chưa khai "Ánh xạ Điểm - STK_ID" khỏi báo cáo LDTD/HCRC

Theo yêu cầu người dùng: mã Điểm CÓ trong file chỉ tiêu (và CÓ dữ liệu Giao
dịch — domain này không cần ánh xạ, xem bản 6.83) nhưng CHƯA khai "Ánh xạ
Điểm - STK_ID" trước đây vẫn lọt vào báo cáo với cột Doanh thu luôn trống —
hiện dòng nửa vời, dễ gây hiểu nhầm là lỗi dữ liệu.

- `rp-server/lib/compositeReportRunner.js` — thêm cờ tuỳ chọn (mặc định
  tắt, không đổi hành vi báo cáo khác) `DefinitionJson.requireDiemStkMapping:
  true` — loại HẲN mọi mã Điểm KHÔNG có dòng trong `etl.DiemStkMapping`, DÙ
  mã đó vẫn "có dữ liệu" ở khối target/giaodich_chinhanh (2 khối không cần
  tra bảng ánh xạ).
- `rp-server/scripts/seedLdtdHcrcReports.js` — bật cờ này cho cả 2 báo cáo
  (LDTD + HCRC).

Đã kiểm thử (fakeModule, chạy THẬT `runCompositeReport()`): mã Điểm có chỉ
tiêu + có giao dịch nhưng chưa khai ánh xạ bị loại đúng khi bật cờ, giữ
nguyên (hành vi cũ) khi tắt cờ. Demo Excel/PDF thật (qua `seedLdtdHcrcReports.js`
+ `exportExcel`/`exportPdf`) xác nhận báo cáo CHỈ còn hiện mã Điểm đã khai
đủ ánh xạ.

**Cần làm trên server sau bản này**: chạy lại
`node rp-server/scripts/seedLdtdHcrcReports.js` để áp cờ mới vào 2 báo cáo
hiện có.

## 6.83 — Bỏ hẳn "Ánh xạ mã chi nhánh" (etl.BranchCodeMap) — chỉ dùng "Ánh xạ Điểm - STK_ID"

Người dùng phát hiện + phân tích đúng nguyên nhân: `etl.BranchCodeMap` chỉ
giữ được ĐÚNG 1 mã chuẩn/mã gốc và KHÔNG phân biệt theo thời điểm — domain
`giaodich_chinhanh` (khoá gốc `BU_ID`, dịch qua bảng này thành 1 mã `STK_ID`
cố định lúc đồng bộ) ghi SAI EntityCode cho dữ liệu quá khứ mỗi khi 1 chi
nhánh đổi mã kho theo thời gian (dữ liệu cũ vẫn mang mã STK MỚI, không phải
mã cũ thật) — "Giao dịch - Thực đạt" của kỳ hiện tại "may" đúng (vì
`MaChuan` được tự đồng bộ đúng bằng STK mới, bản 6.80) nhưng "Cùng kỳ năm
trước" domain này sẽ rớt dữ liệu ở mọi mã Điểm đã đổi kho. Việc dịch qua
BranchCodeMap cũng thừa vì `BU_ID` KHÔNG đổi qua thời gian và CHÍNH LÀ mã
"Điểm" dùng trong file chỉ tiêu — không cần dịch mã trung gian nào cả.

- `etl/lib/tableSyncEngine.js`/`etl/jobs/runSync.js` — bỏ hẳn bước dịch
  entityCode qua `etl.BranchCodeMap` (`transformRow()` không còn nhận
  `branchCodeMap`/`unmappedCodes`, `loadBranchCodeMap()` xoá khỏi
  `runSync.js`) — mọi domain (kể cả `giaodich_chinhanh`) giữ NGUYÊN mã gốc
  từ nguồn làm EntityCode.
- `rp-server/scripts/seedLdtdHcrcReports.js` — tắt `useDiemStkMapping` ở 2
  khối `currentGD`/`lastYearGD` (domain giao dịch) — EntityCode (`BU_ID`)
  đã đúng = mã Điểm, không cần remap qua danh sách STK nữa. 2 khối
  `current`/`lastYear` (domain doanh thu, khoá thật là `STK_ID`) GIỮ
  NGUYÊN `useDiemStkMapping: true` — không đổi.
- `etl/scripts/seedLdtdHcrcSync.js` — bỏ `branchCodeMapType: 'BU_ID'` khỏi
  2 job "Giao dịch chi nhánh" (Live/Lịch sử); UPDATE nhánh idempotent giờ
  ghi `BranchCodeMapType = NULL` để tự dọn dữ liệu cũ khi chạy lại script
  trên cài đặt đã từng bật tính năng này.
- Xoá hẳn tính năng "Ánh xạ mã chi nhánh": `etl/routes/admin/branchCodeMap.js`,
  `etl/lib/branchCodeMapImport.js`, `etl-admin/src/pages/BranchCodeMapPage.jsx`,
  nav entry (`Layout.jsx`/`App.jsx`), MenuCode `branch-code-map` (`routes/admin/roles.js`
  MENU_CATALOG, `RolesPage.jsx`), route mount (`server.js`) — **giữ nguyên**
  bảng `etl.BranchCodeMap`/cột `etl.SyncJobs.BranchCodeMapType` trong CSDL
  (không ALTER DROP, chỉ đổi comment đánh dấu "đã ngừng dùng") để không đụng
  dữ liệu lịch sử trên các bản cài cũ.
- Xoá cơ chế auto-sync DiemStkMapping→BranchCodeMap (bản 6.80, chính là
  nguồn gây lỗi "lấy 1 trong nhiều mã kho"): `buildBranchCodeMapSyncRows()`
  (`diemStkMappingImport.js`), `syncToBranchCodeMap()` (`routes/admin/diemStkMapping.js`),
  UI hiển thị kết quả đồng bộ (`DiemStkMappingPage.jsx`) — xoá luôn script
  backfill 1 lần `generateBranchCodeMapFromDiemStk.js` (không còn tác dụng).
- `etl/scripts/exportEntityCodesReport.js` — sheet đối chiếu đổi từ
  `etl.BranchCodeMap` sang `etl.DiemStkMapping` (bảng ánh xạ duy nhất còn
  dùng), cập nhật chú thích/gợi ý điền mẫu.
- **MỚI** `etl/scripts/resyncGiaodichChinhanh.js` — script migrate 1 lần
  (mặc định dry-run, cần `--confirm` mới thực sự chạy) cho các cài đặt ĐÃ
  từng bật "Ánh xạ mã chi nhánh": xoá toàn bộ dữ liệu cũ (sai) của domain
  `giaodich_chinhanh` trong `dwh.ReportFacts` + reset mốc đồng bộ
  (`etl.SyncState.LastSyncedAt`) của các job liên quan về epoch để job tự
  kéo lại toàn bộ dữ liệu với EntityCode đúng (`BU_ID` gốc).
- Docs: `hướng_dẫn_báo_cáo.md` mục 11 (sổ tay domain), `báo cáo doanh thu
  cuối ngày.md` (Bước 2.2/2.3, Bước 4, Bước 7 kiểm tra), `etl/README.md`,
  `deploy/Hướng dẫn nghiệp vụ.md` — cập nhật hết mọi chỗ hướng dẫn dùng
  "Ánh xạ mã chi nhánh", trỏ sang kiến trúc mới.

Đã kiểm thử (fakeModule): `transformRow()` không dịch mã (chỉ trim), chạy
THẬT `seedLdtdHcrcReports.js` xác nhận đúng 2/4 khối còn `useDiemStkMapping`,
chạy THẬT `runCompositeReport()` xác nhận domain giao dịch (identity, mã
Điểm trực tiếp) và doanh thu (remap qua DiemStkMapping) vẫn ghép đúng cùng
1 dòng theo mã Điểm.

**Cần làm trên server sau bản này**:
1. `git pull`, rebuild `etl-admin` (`npm run build`), khởi động lại `etl`
   và `rp-server`.
2. Chạy lại `node etl/scripts/seedLdtdHcrcSync.js` (dọn cột `BranchCodeMapType`
   cũ trên 2 job giao dịch) rồi `node rp-server/scripts/seedLdtdHcrcReports.js`
   (ghi đè `DefinitionJson` sang cấu hình mới).
3. **CHỈ nếu trước đây đã bật "Ánh xạ mã chi nhánh"** cho job giao dịch:
   `node etl/scripts/resyncGiaodichChinhanh.js --confirm` — xem chi tiết
   "báo cáo doanh thu cuối ngày.md" mục 2.2.

## 6.82 — Áp dụng columnGroups/STT/format thật vào báo cáo LDTD/HCRC

Người dùng xác nhận demo bản 6.81 (màu Doanh thu/xanh lá, Lãi gộp/vàng, Giao
dịch/cam) — nối dây năng lực đó vào ĐÚNG 2 báo cáo thật đang dùng:
`rp-server/scripts/seedLdtdHcrcReports.js` thêm cột `stt` (đầu bảng),
`columnGroups` (3 nhóm khớp đúng demo), `format: "percent"` cho mọi cột tỷ
lệ, và `width` (trọng số bề rộng cột lúc xuất PDF) cho toàn bộ 17 cột — áp
dụng CHO CẢ 2 báo cáo `bc-doanh-thu-ldtd`/`bc-doanh-thu-hcrc` (dùng chung 1
`buildDefinition()`). Không đổi tên field/formula nào (chỉ đổi `label` của 5
cột Doanh thu/Giao dịch từ "Doanh thu - Chỉ tiêu" thành "Chỉ tiêu" — nhãn
đầy đủ đã chuyển thành tên NHÓM cột phía trên theo đúng khuôn báo cáo cũ,
không lặp lại 2 lần).

Đã kiểm thử (fakeModule): chạy THẬT `seedLdtdHcrcReports.js` (không sao
chép lại definition) qua pool giả, bắt đúng `DefinitionJson` sẽ ghi vào
`app.ReportCatalog`, xác nhận có cột `stt` đầu tiên + đúng 3 `columnGroups`,
rồi đưa THẲNG qua `exportExcel()`/`exportPdf()` thật với dữ liệu minh hoạ —
render thử PDF ra ảnh, khớp đúng khuôn đã demo với bạn.

**Cần làm trên server sau bản này**: chạy lại
`node rp-server/scripts/seedLdtdHcrcReports.js` (đã deploy code mới) để ghi
đè `DefinitionJson` 2 báo cáo hiện có sang cấu hình mới — báo cáo tồn tại
sẵn trong CSDL không tự cập nhật nếu không chạy lại script này.

## 6.81 — Xuất Excel/PDF theo khuôn cũ: tiêu đề gộp nhóm cột màu, STT theo nhóm

Người dùng gửi file mẫu báo cáo thật đang dùng ở hệ thống cũ, yêu cầu xuất
Excel/PDF (và file đính kèm gửi email tự động) đúng khuôn: tiêu đề gộp 2
dòng theo 3 nhóm cột màu (Doanh thu/xanh lá, Lãi gộp/vàng, Giao dịch/cam),
cột "TT" đếm riêng theo từng nhóm siêu thị (MART/MINIMART), số có dấu phẩy
phân cách nghìn.

Thêm `DefinitionJson.columnGroups` (TUỲ CHỌN, mặc định không có = xuất Excel/
PDF phẳng như trước, không đổi báo cáo cũ) — khai `[{label, color, keys}]`,
`lib/exportExcel.js`/`lib/exportPdf.js` tự gộp ô header 2 dòng + tô màu theo
đúng nhóm, dùng CHUNG 1 nguồn (`lib/reportCellFormat.js` — mới) nên Excel và
PDF luôn khớp nhau tuyệt đối. Cột đặc biệt `key: "stt"` tự đánh số lại từ 1
ngay sau mỗi dòng "Tổng cộng" (groupBy), để trống ở chính dòng đó.
`definition.columns[].format: "percent"` hiển thị thêm dấu "%" mà KHÔNG nhân
lại 100 (công thức đã tự nhân sẵn). Số định dạng CỐ ĐỊNH dấu phẩy phân cách
nghìn (không phụ thuộc locale máy chủ/máy mở file) — khớp đúng file mẫu.

`lib/exportPdf.js` viết lại đáng kể: trang NGANG khi có columnGroups (nhiều
cột), vẽ lưới đầy đủ (kẻ khung, tô nền), tự XUỐNG DÒNG nhãn tiêu đề dài
(tránh tràn sang ô kế bên — lỗi phát hiện được ở vòng kiểm thử đầu, đã sửa),
tự sang trang mới kèm lặp lại header khi dữ liệu dài nhiều trang.
`jobs/reportEmailScheduler.js` KHÔNG cần sửa gì — đã dùng chung 2 hàm xuất
trên từ trước, nên báo cáo bật `columnGroups` tự động có file đính kèm email
đẹp theo, không cần nối dây thêm.

Nhân dịp rà lại tính năng "Tải mẫu .xlsx/.pptx lên" (trang "Biểu mẫu",
rp-user) theo câu hỏi người dùng: xác nhận đây là code CŨ CHƯA từng có nơi
nào đọc lại để điền dữ liệu (không liên quan gì tới báo cáo thật) — bỏ
`.pptx` (không có ý nghĩa xuất PowerPoint nào trong hệ thống), giữ `.xlsx`,
và ghi rõ trong giao diện rằng định dạng Excel/PDF thật từ nay khai qua
`columnGroups`, không qua file tải lên đó.

Đã kiểm thử (fakeModule, KHÔNG phải demo tay): sinh Excel/PDF thật qua đúng
`exportExcel()`/`exportPdf()` với definition mô phỏng đúng cấu trúc
bc-doanh-thu-hcrc (nhóm MART/MINIMART + dòng tổng) — đọc lại file Excel xác
nhận đúng ô gộp/màu/tô nền dòng tổng, render thử PDF ra ảnh xác nhận khớp
khuôn mẫu gốc, và xác nhận báo cáo KHÔNG khai columnGroups vẫn xuất bình
thường như trước (không phá vỡ báo cáo cũ). Build lại rp-user sạch. CHƯA áp
dụng vào 2 báo cáo thật LDTD/HCRC (seedLdtdHcrcReports.js) — chờ người dùng
xác nhận màu sắc/cấu hình cụ thể qua demo trước khi nối dây.

## 6.80 — Tự động đồng bộ "Ánh xạ Điểm - STK_ID" sang "Ánh xạ mã chi nhánh"

Theo yêu cầu người dùng: bản 6.79 vẫn cần 1 bước thủ công (chạy script xuất
file rồi tự nhập lại qua trang "Ánh xạ mã chi nhánh") — người dùng muốn
KHÔNG còn bước export/import tay này, tránh nhầm lẫn.

`etl/lib/diemStkMappingImport.js` thêm `buildBranchCodeMapSyncRows()` (logic
chọn `MaChuan` giống hệt bản 6.79 — lấy 1 mã kho trong "Điểm mới", hoặc
"Điểm cũ" nếu mã Điểm đã đóng, bỏ qua mã Điểm chưa khai kho nào).
`etl/routes/admin/diemStkMapping.js` gọi hàm này NGAY sau khi ghi thành
công `etl.DiemStkMapping` (cả `PUT /one` lẫn `POST /import`), rồi
`upsertBranchCodeMap()` (hàm ĐÃ CÓ, dùng chung với route
"Ánh xạ mã chi nhánh" — cùng 1 đường MERGE, không viết logic mới) — ghi
thẳng `LoaiMaKhac='BU_ID'` vào `etl.BranchCodeMap` trong CÙNG 1 request,
không qua bước xuất/nhập file nào nữa. Lỗi ở bước đồng bộ phụ này KHÔNG làm
hỏng/rollback việc ghi "Ánh xạ Điểm - STK_ID" đã thành công (bọc try/catch
riêng + ghi `etl.SystemLog`, cùng tinh thần "1 tính năng phụ lỗi không chặn
tính năng chính" đã áp dụng nhiều lần trong repo) — frontend hiển thị rõ số
dòng đã đồng bộ/bỏ qua/lỗi ngay dưới thông báo lưu chính.

`etl/scripts/generateBranchCodeMapFromDiemStk.js` (bản 6.79) đổi vai trò
thành **script backfill 1 LẦN** cho dữ liệu đã nhập TRƯỚC bản này — ghi
THẲNG vào CSDL (dùng chung `upsertBranchCodeMap()`), không còn xuất ra
Excel trung gian.

Nhân dịp này cũng sửa "Xuất Excel" ở CẢ 2 trang "Ánh xạ Điểm - STK_ID" và
"Ánh xạ mã chi nhánh" theo phản hồi người dùng — trang "Ánh xạ mã chi
nhánh" TRƯỚC ĐÂY xuất file theo đúng ô lọc "Loại mã" đang gõ trên màn hình
(lỡ gõ gì mà quên xoá trước khi bấm xuất thì chỉ ra đúng phần đã lọc, dễ
tưởng nhầm mất dữ liệu) — nay đổi thành LUÔN xuất TOÀN BỘ dữ liệu, đổi tên
nút thành "Xuất tất cả (Excel)" ở cả 2 trang cho rõ ràng (trang "Ánh xạ
Điểm - STK_ID" vốn đã xuất toàn bộ từ trước, chỉ đổi tên nút cho nhất
quán).

Đã kiểm thử (fakeModule): `buildBranchCodeMapSyncRows()` chọn đúng mã kho/
bỏ qua đúng mã Điểm chưa khai kho, và gọi THẲNG route `PUT /one` thật —
xác nhận ghi `etl.DiemStkMapping` xong TỰ ĐỘNG gọi đúng 1 lần MERGE
`etl.BranchCodeMap` với đúng `LoaiMaKhac`/`MaKhac`/`MaChuan` trong CÙNG 1
request. Build lại `etl-admin` sạch, không lỗi.

## 6.79 — Script tự sinh file "Ánh xạ mã chi nhánh" từ "Ánh xạ Điểm - STK_ID"

Người dùng hỏi vì sao vẫn phải khai riêng "Ánh xạ mã chi nhánh" (bản 6.72)
sau khi đã có "Ánh xạ Điểm - STK_ID" (bản 6.77), và đề xuất dùng chung 1
bảng cho đỡ nhầm. Giải thích: 2 bảng phục vụ 2 việc KHÁC NHAU, không gộp
được — `etl.BranchCodeMap` quy đổi 1-1 (`BU_ID` <-> ĐÚNG 1 `STK_ID`) LÚC
ĐỒNG BỘ, để domain `giaodich_chinhanh` (khoá gốc `BU_ID` từ `TRANSHDR`) ghép
được với `doanhthu_chinhanh` (khoá gốc đã là `STK_ID`) trong
`dwh.ReportFacts`; `etl.DiemStkMapping` là 1-nhiều, tách kỳ cũ/mới, áp dụng
LÚC CHẠY BÁO CÁO. Bỏ `BranchCodeMap` sẽ làm TRỐNG cột Giao dịch ở MỌI báo
cáo (2 domain không ghép được nữa), không thể thay bằng bảng kia.

Tuy vậy, `TRANSHDR` (giao dịch) vốn không tách được theo từng kho STK_ID
con — quy đổi về kho NÀO trong số các kho hiện có của 1 mã Điểm cũng cho ra
cùng kết quả đúng sau khi qua bước `useDiemStkMapping` (cộng dồn lại theo
mã Điểm). Vì vậy thêm `etl/scripts/generateBranchCodeMapFromDiemStk.js` —
đọc dữ liệu ĐÃ khai ở "Ánh xạ Điểm - STK_ID", tự sinh sẵn file Excel đúng
khuôn cột "Ánh xạ mã chi nhánh" (lấy 1 mã kho bất kỳ trong "Điểm mới", hoặc
"Điểm cũ" nếu mã Điểm đã đóng, làm `MaChuan`) — người dùng không cần gõ tay
2 lần cùng 1 dữ liệu, chỉ cần chạy script rồi nhập file sinh ra qua nút
"Nhập file ánh xạ" như bình thường (script KHÔNG tự ghi CSDL). Đã kiểm thử
(fakeModule): sinh đúng dòng, bỏ qua đúng mã Điểm chưa khai kho nào, tự lấy
kho cũ làm dự phòng cho mã Điểm đã đóng.

## 6.78 — Sửa lỗi chạy lại rp-db/schema.sql báo trùng CK_ReportEmailSchedules_DeliveryMode

Người dùng phát hiện thật: chạy lại `rp-db/schema.sql` (CSDL `HCRC_RP`) báo
lỗi `Msg 2714 ... There is already an object named
'CK_ReportEmailSchedules_DeliveryMode'`. Nguyên nhân: khối kiểm tra tồn tại
ràng buộc này dùng `OBJECT_ID('CK_ReportEmailSchedules_DeliveryMode', 'C')`
— tra theo SCHEMA MẶC ĐỊNH của tài khoản đang chạy script (thường `dbo`),
trong khi ràng buộc thật nằm ở schema `app` — luôn KHÔNG TÌM THẤY nên không
`DROP` được ràng buộc cũ trước khi `ADD` lại, dẫn tới báo trùng tên ở lần
chạy thứ 2 trở đi. Mọi ràng buộc CHECK khác trong CÙNG file (vd
`CK_ExternalApiConnections_AuthType`, `CK_ReportCatalog_SourceType`) đều
dùng đúng `IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = ...)`
(không phân biệt schema) — chỉ sót đúng 1 chỗ dùng sai cách.

Sửa: đổi khối kiểm tra của `CK_ReportEmailSchedules_DeliveryMode` sang cùng
cách `sys.check_constraints` như mọi ràng buộc khác — an toàn chạy lại
nhiều lần từ nay.

## 6.77 — Ánh xạ mã Điểm (BU_ID) sang nhiều mã kho STK_ID cho báo cáo LDTD/HCRC

Yêu cầu người dùng: file chỉ tiêu LDTD/HCRC dùng "mã Điểm" (đúng bằng
`BU_ID`, KHÔNG đổi theo thời gian), nhưng doanh thu thực đạt trong
`dwh.ReportFacts` lại khoá theo `STK_ID` (mã kho) — 1 mã Điểm có thể ứng
với NHIỀU mã kho, và bộ mã kho đó có thể ĐỔI giữa kỳ trước/kỳ này (kho là
khái niệm ẢO trong phần mềm, không phải khái niệm vật lý — người dùng xác
nhận 1 siêu thị vẫn chỉ có 1 mặt bằng thật). Không quy đổi thì báo cáo
composite không ghép được thực đạt (theo `STK_ID`) với chỉ tiêu (theo mã
Điểm) — đây là vấn đề KHÁC với `etl.BranchCodeMap` đã có (bảng đó quy đổi
khoá NGUỒN → khoá LƯU lúc đồng bộ, không tách kỳ cũ/mới, không xử lý N-1).

**Bảng mới `etl.DiemStkMapping`** (CSDL `HCRC_ETL`) — mỗi dòng: 1 mã Điểm +
danh sách mã kho CŨ (`MaStkCu`, dùng tính cùng kỳ năm trước) + danh sách mã
kho MỚI (`MaStkMoi`, dùng tính thực đạt hiện tại), cả 2 có thể nhiều mã
cách nhau bằng dấu phẩy + tên siêu thị chuẩn. Ràng buộc CỐ Ý khác mọi bảng
nhập liệu khác trong hệ thống: 1 mã kho `STK_ID` chỉ được thuộc ĐÚNG 1 mã
Điểm trong TOÀN BỘ bảng — vi phạm thì **TỪ CHỐI TOÀN BỘ FILE NHẬP** (không
chỉ bỏ qua dòng lỗi như các importer khác), vì `BU_ID` sinh ra `STK_ID` nên
trùng lặp luôn là lỗi cấu hình thật, không phải tình huống hợp lệ cần bỏ
qua âm thầm.

- `etl-admin` — menu mới **"Ánh xạ Điểm - STK_ID"**: CRUD + import Excel
  (5 cột: STT, Mã Điểm, Mã STK_ID Điểm cũ, Mã STK_ID Điểm mới, Tên siêu
  thị) + tải file mẫu/xuất Excel, giống khuôn các trang ánh xạ khác.
- `rp-server/lib/diemStkMapping.js` (MỚI) — đọc bảng trên qua pool CSDL
  RIÊNG, TUỲ CHỌN `ETL_DIEM_STK_*` (rút kinh nghiệm trực tiếp từ lỗi đăng
  nhập phụ thuộc DWH ở bản 6.75: pool này KHÔNG bắt buộc lúc khởi động, mọi
  lỗi kết nối CHỈ làm rỗng đúng phần dữ liệu của tính năng này, không ảnh
  hưởng đăng nhập/báo cáo khác) + hàm gộp nhiều dòng STK_ID (đã tổng theo
  ngày) về đúng 1 dòng/mã Điểm — cộng dồn measures, lấy dimensions không
  rỗng đầu tiên (diện tích KHÔNG cộng dồn dù gộp nhiều kho ảo), ưu tiên tên
  siêu thị từ chính bảng ánh xạ này. Mã Điểm không khai kho cho đúng kỳ
  (hoặc khai nhưng kho đó không có dữ liệu) → "không có dữ liệu", KHÔNG
  phải số 0 — đúng yêu cầu nghiệp vụ đã chốt.
- `rp-server/lib/compositeReportRunner.js` — cờ mới `block.useDiemStkMapping`
  (tuỳ chọn, mặc định tắt) trên khối `directDb`: bật thì áp bước gộp trên
  SAU bước tổng hợp theo ngày, dùng danh sách kho MỚI khi
  `dateOffsetYears >= 0`, danh sách CŨ khi `< 0`.
- `rp-server/scripts/seedLdtdHcrcReports.js` — bật `useDiemStkMapping: true`
  trên cả 4 khối `directDb` (`current`/`currentGD`/`lastYear`/`lastYearGD`)
  của cả 2 báo cáo LDTD/HCRC — trường hợp áp dụng thật đầu tiên.
- `etl-db/grants.sql` — tài khoản mới `etl_diem_stk_reader`, CHỈ SELECT
  đúng bảng `etl.DiemStkMapping` (không cấp `SCHEMA::etl` — tránh lộ
  `etl.DataSources` chứa mật khẩu mã hoá), dùng cho pool
  `ETL_DIEM_STK_*` của rp-server.

Đã kiểm thử (fakeModule) toàn bộ chuỗi thật: import + phát hiện trùng
`STK_ID` (cả trong file lẫn với dữ liệu đã lưu) + gộp qua đúng
`compositeReportRunner.js`/`runCompositeReport()` thật (không phải bản
demo riêng) — xác nhận gộp đúng nhiều kho, tách đúng kỳ cũ/mới, hiện đúng
"không có dữ liệu" khi thiếu ánh xạ, và lỗi kết nối CSDL ánh xạ rơi về Map
rỗng thay vì làm sập báo cáo.

## 6.76 — Thêm sheet "mẫu điền ánh xạ còn thiếu" vào script đối chiếu mã

Theo câu hỏi người dùng khi mở file đối chiếu mã (bản 6.74): làm rõ ý nghĩa
2 cột `MaKhac`/`MaChuan` trong `etl.BranchCodeMap` — `MaChuan` CHÍNH LÀ "mã
thực đạt" dùng làm EntityCode thật trong `dwh.ReportFacts`, và CŨNG LÀ mã
dùng để so sánh cùng kỳ năm trước (khối `lastYear` chỉ lọc lại đúng
EntityCode này theo ngày lệch 1 năm — không có mã "so sánh quá khứ" riêng).
Bảng này hiện CHỈ áp dụng lúc đồng bộ thực đạt, CHƯA áp dụng lúc nhập chỉ
tiêu.

`etl/scripts/exportEntityCodesReport.js` (bản 6.74) nay thêm sheet thứ 4
**"Mau dien anh xa con thieu"** — liệt kê sẵn mọi mã đang có trong chỉ tiêu
nhưng CHƯA có trong thực đạt (đúng nhóm mã lệch phát hiện được), điền sẵn
`LoaiMaKhac` gợi ý theo domain + `MaKhac` = mã trong file chỉ tiêu, để
trống `MaChuan`/`TenSieuThi` cho người dùng tự điền mã STK_ID thật rồi nộp
thẳng qua nút "Nhập file ánh xạ" (đúng khuôn cột, nạp lại được luôn).

## 6.75 — Sửa lỗi đăng nhập rp-user phụ thuộc DWH (chỉ nên phụ thuộc CSDL RP)

Người dùng phát hiện thật: đổi thử `DWH_SERVER` sang 1 IP sai để kiểm tra
khiến MỌI tài khoản admin không đăng nhập được vào rp-user ("Lỗi máy chủ"),
dù CSDL xác thực (RP, `app.Users`) hoàn toàn không đổi và vẫn kết nối bình
thường — đổi `DWH_SERVER` về đúng lại thì đăng nhập được ngay.

Nguyên nhân: `rp-server/lib/permissions.js:loadContext()` — hàm này chạy
NGAY trong `POST /api/auth/login` (server.js, TRƯỚC khi đặt cookie phiên) để
dựng "user context" — với tài khoản `IsSystemRole=1` (Admin), hàm còn tiện
thể truy vấn `dwh.ReportFacts` để liệt kê MỌI Domain đang có dữ liệu (phục
vụ tính năng "Báo cáo tự do" chọn Domain, xem `routes/adhocReports.js`).
DWH không kết nối được (đổi cấu hình sai/mất mạng) khiến truy vấn này NÉM
LỖI, lan thẳng lên route đăng nhập → trả 500 "Lỗi máy chủ" — CHẶN ĐỨNG cả
việc đăng nhập chỉ vì 1 tính năng phụ không đọc được dữ liệu, dù bản thân
việc xác thực (CSDL RP) không hề gặp vấn đề gì.

Sửa: bọc riêng đoạn truy vấn Domain trong `try/catch` — DWH lỗi thì
`domains` rơi về Set rỗng (best-effort, không cache lỗi — TTL context 60s
tự thử lại ở lượt sau) thay vì ném lỗi ra ngoài. Đăng nhập từ nay CHỈ còn
phụ thuộc đúng CSDL RP như đúng thiết kế ban đầu; "Báo cáo tự do" tạm ẩn
danh sách Domain (không crash gì) cho tới khi DWH kết nối lại được.

## 6.74 — Script đối chiếu mã siêu thị giữa 3 nguồn (thực đạt/chỉ tiêu/ánh xạ)

Theo yêu cầu người dùng, phục vụ điều tra báo cáo LDTD trống cột "Thực đạt"
(mã "Điểm" trong file chỉ tiêu — vd "001" — không khớp mã STK_ID thật đang
dùng ở dwh.ReportFacts — vd "13061"): thêm
`etl/scripts/exportEntityCodesReport.js` — script CHỈ ĐỌC (không sửa CSDL),
xuất 1 file Excel 3 sheet để nghiệp vụ tự đối chiếu:

- **"Ma thuc dat (ReportFacts)"** — mọi EntityCode đang có dữ liệu thực đạt
  (mặc định domain doanhthu_chinhanh/giaodich_chinhanh, đổi được qua tham số
  dòng lệnh) kèm TenSieuThi/Diện tích (nếu ETL đã ghi), ngày sớm/gần nhất.
- **"Ma chi tieu (SalesTargets)"** — mọi EntityCode đang có chỉ tiêu (domain
  sales-targets-ldtd/hcrc) kèm 1 mẫu giá trị Doanh thu/Giao dịch.
- **"Anh xa ma chi nhanh"** — nguyên bảng etl.BranchCodeMap hiện có.

Cách dùng: `node scripts/exportEntityCodesReport.js` (chạy trong thư mục
`etl/`) — file xuất vào `etl/exports/` (đã thêm vào `.gitignore`), tải về
máy cá nhân bằng scp/WinSCP để mở.

## 6.73 — Tải file mẫu + Xuất Excel cho "Chỉ tiêu LDTD/HCRC" và "Ánh xạ mã chi nhánh"

Theo yêu cầu người dùng: 3 trang nhập liệu bằng Excel ("Chỉ tiêu Lãnh đạo Tập
đoàn", "Chỉ tiêu HCRC", "Ánh xạ mã chi nhánh") nay có thêm 2 nút:

- **"Tải file mẫu"** — file .xlsx trống đúng khuôn cột của đúng trang đó
  (kèm 1-2 dòng ví dụ rõ ràng mã "VIDU"/"VIDU-00100" cần xoá trước khi
  nhập), tải về điền số liệu rồi nhập lại được luôn qua chính nút "Nhập"
  hiện có, không cần tự dò tên cột.
- **"Xuất Excel"** — tải về ĐÚNG dữ liệu đang lưu (theo bộ lọc hiện tại),
  dựng lại đúng khuôn cột file gốc (mẫu HCRC dạng bảng "dài" — 1 dòng chỉ
  tiêu tách thành 2 dòng loại "01"/"03" — được dựng NGƯỢC đúng như file
  thật) để mở sửa tiếp rồi nhập lại, khỏi tự tay dựng lại từ đầu.

Cài đặt: `etl/lib/salesTargetsImport.js`/`etl/lib/branchCodeMapImport.js`
thêm hàm dựng workbook (ExcelJS) cho từng khuôn cột đã có sẵn (mirror đúng
`parseLdtdDailyShape`/`parseHcrcDailyShape`/parser ánh xạ), route mới
`GET .../template` và `GET .../export` (quyền như GET hiện có — xem/sửa
tuỳ trang), header response dùng chung `etl/lib/xlsxResponse.js`. Frontend
thêm `api.downloadFile()` (etl-admin/src/lib/api.js) — fetch + tạo link tải
tạm, đọc tên file từ `Content-Disposition` server trả về.

Nhân dịp trả lời câu hỏi người dùng về cơ chế "Ánh xạ mã chi nhánh": trang
đó CHỈ (1) quy đổi mã nguồn (vd `BU_ID` DSMART16) về mã chuẩn để báo cáo
ghép đúng dữ liệu thực đạt giữa các bảng nguồn khác hệ mã, và (2) TUỲ CHỌN
gắn `TenSieuThi` để báo cáo hiện tên thật (xem 6.72) — KHÔNG tự "chọn đúng
doanh thu", số liệu thực đạt vẫn đọc nguyên từ DSMART16 qua job Đồng bộ như
cũ. Việc lọc "mã rác" vẫn hoàn toàn do đối chiếu với Chỉ tiêu
(`requireTargetMatch`, xem 6.72) đảm nhiệm — 2 cơ chế độc lập nhau, đã ghi
rõ thêm trong etl-admin (BranchCodeMapPage.jsx) và tài liệu.

## 6.72 — Báo cáo doanh thu LDTD/HCRC: lọc theo chỉ tiêu (bỏ mã rác) + hiện tên siêu thị thay vì mã

Theo yêu cầu người dùng: báo cáo "Báo cáo nhanh doanh thu - LDTD/HCRC" đang
hiện CẢ những entityCode có dữ liệu thực đạt nhưng CHƯA từng được nhập chỉ
tiêu ("mã rác"/mã test), và cột "Siêu thị/Cửa hàng" chỉ hiện mã thay vì tên
thật.

- `rp-server/lib/compositeReportRunner.js` — thêm cờ tuỳ chọn (mặc định tắt,
  không đổi hành vi báo cáo khác) `DefinitionJson.requireTargetMatch: true`
  — khi bật, chỉ giữ lại các dòng CÓ mặt trong khối `isTarget` (chỉ tiêu),
  loại các entityCode không có chỉ tiêu nào ra khỏi kết quả.
- `etl/jobs/runSync.js` (`loadBranchCodeMap`) + `etl/lib/tableSyncEngine.js`
  (`transformRow`) — cột `TenSieuThi` trong "Ánh xạ mã chi nhánh"
  (etl.BranchCodeMap, trước đây chỉ để hiển thị trong etl-admin) nay được
  ghi thêm vào `dimensions.tenSieuThi` của mỗi dòng dwh.ReportFacts khi job
  đồng bộ có bật BranchCodeMapType — tận dụng luôn cơ chế cộng dồn
  dimensions theo entityCode đã có sẵn (lấy giá trị không rỗng đầu tiên),
  không cần sửa gì thêm ở tầng gộp báo cáo.
- `rp-server/scripts/seedLdtdHcrcReports.js` — bật `requireTargetMatch:
  true` cho cả 2 báo cáo (LDTD + HCRC), đổi công thức cột "Siêu thị/Cửa
  hàng" thành `current.dimensions.tenSieuThi || entityCode` (rơi về mã cũ
  nếu chưa có tên).
- `báo cáo doanh thu cuối ngày.md` — cập nhật giải thích + cả 2
  DefinitionJson mẫu (LDTD/HCRC) khớp thay đổi trên.

**Cần làm thêm ở môi trường vận hành để tính năng có hiệu lực** (không tự
động, xem chi tiết trong tài liệu trên): (1) chạy lại
`node rp-server/scripts/seedLdtdHcrcReports.js` hoặc sửa tay DefinitionJson
qua rp-user để áp thay đổi vào 2 báo cáo ĐANG LƯU trong app.ReportCatalog —
sửa code không tự cập nhật ngược; (2) khởi động lại rp-server và etl với code
mới; (3) để cột tên hiện tên thật thay vì mã: bật `BranchCodeMapType` cho
sync job "Doanh thu chi nhánh" (domain doanhthu_chinhanh) trong etl-admin,
nhập cột `TenSieuThi` ở "Ánh xạ mã chi nhánh", rồi chạy lại job đồng bộ đó
(dữ liệu đã đồng bộ TRƯỚC khi bật sẽ chưa có tên cho tới khi đồng bộ lại).

## 6.71 — Rà soát và sửa CHỦ ĐỘNG mọi chỗ khác còn dùng request.bulk()/sql.Table trong repo

Sau khi xác nhận nguyên nhân gốc (request.bulk() trên Request gắn Transaction
gây "Invalid object name" — bản 6.68-6.70), rà soát toàn repo tìm mọi chỗ
KHÁC còn dùng cùng pattern nguy hiểm này trước khi người dùng tự phát hiện
qua lỗi thật — tìm thấy 3 chỗ nữa, đều sửa theo đúng cách đã chứng minh ổn
định (gộp CREATE TABLE + INSERT literal + MERGE vào 1 batch/1 lượt `.query()`,
chia theo `ROWS_PER_TRANSACTION`):

- `etl/lib/branchCodeMapImport.js` (nhập "Ánh xạ mã chi nhánh") — thêm bỏ
  luôn `.input()` trên câu MERGE (importedBy/preserveTrangThai chuyển vào
  cột bulk-insert, cùng lý do đã né ở #StagingTargets).
- `etl/lib/dataSourcesImport.js` và `api-server/lib/dataSourcesImport.js`
  (nhập hàng loạt "Nguồn dữ liệu") — `PasswordEncrypted` (chuỗi base64 từ
  `encrypt()`) escape an toàn bằng cùng hàm literal-string, không có ký tự
  đặc biệt cần lo (bảng chữ base64 không chứa dấu nháy đơn).
- Test bằng driver SQL giả lập cho cả 3 file: insert/update cơ bản, escape
  dấu nháy đơn, và chia lô đúng số transaction khi >2000 dòng.

## 6.70 — Áp cùng bản sửa "Invalid object name" cho nhập chỉ tiêu LĐTĐ/HCRC (etl/lib/salesTargetsImport.js)

Người dùng vẫn không nhập được file chỉ tiêu, chỉ thấy "Lỗi máy chủ" chung
chung trên giao diện (route nhập chỉ tiêu không ghi qua Nhật ký hệ thống,
chỉ `console.error` ra pm2 log) — lấy đúng log pm2 lộ ra:
```
RequestError: Invalid object name '#StagingTargets'.
    at BulkLoad.done [as callback] (mssql/lib/tedious/request.js:307:19)
```
`at BulkLoad.done` xác nhận `etl/lib/salesTargetsImport.js` **vẫn đang dùng
`request.bulk()`/`sql.Table`** để nạp `#StagingTargets` — bản sửa 6.63
trước đây chỉ bỏ `.input()` ở câu MERGE, CHƯA bỏ `bulk()` ở bước nạp, nên
vẫn dính đúng lỗi gốc đã tìm ra và sửa cho `dwh.ReportFacts` (6.68/6.69).

- `etl/lib/salesTargetsImport.js` — áp dụng ĐÚNG cách đã chứng minh ổn định
  ở `lib/upsert.js`: bỏ hẳn `request.bulk()`/`sql.Table`, gộp CREATE TABLE +
  INSERT (literal, escape thủ công, không `.input()`) + MERGE vào CÙNG 1
  chuỗi SQL/1 lượt `.query()`; chia theo `TARGETS_ROWS_PER_TRANSACTION =
  2000` (mỗi lô chạy trọn 1 transaction độc lập, giống `ROWS_PER_TRANSACTION`
  của `upsert.js`) dù file chỉ tiêu hiếm khi vượt `MAX_IMPORT_ROWS = 5000`.
- Test bằng driver SQL giả lập: insert cơ bản, re-upload giữ nguyên
  `TrangThai` khi `preserveTrangThaiIfUnspecified` (logic nghiệp vụ quan
  trọng nhất của hàm này), 4500 dòng → đúng 3 transaction, escape dấu nháy
  đơn trong mã siêu thị/JSON chỉ tiêu.

## 6.69 — Chia lô theo transaction cho job "Lịch sử" (backfill nhiều dữ liệu) — bản 6.68 chỉ đủ cho job Live

Sau bản 6.68 (gộp batch), job **Live** (~600 dòng/lượt) chạy hoàn toàn ổn —
xác nhận qua log pm2 thật ("Xong — 627 dòng mới"/"575 dòng mới"). Nhưng job
**"Lịch sử (DSMART16_EOM)"** (backfill nhiều tháng/năm dữ liệu, có thể hàng
chục nghìn dòng) vẫn gặp LẠI đúng lỗi `Invalid object name '#Staging'.` —
nhiều khả năng batch gộp toàn bộ (CREATE TABLE + hàng chục nghìn dòng
INSERT) trong 1 câu `.query()` duy nhất đã chạm một giới hạn nào đó
(kích thước/số câu lệnh) mà batch nhỏ (Live) không chạm tới.

- `etl/lib/upsert.js` — thêm `ROWS_PER_TRANSACTION = 2000`: `rows` được
  chia thành nhiều LÔ, mỗi lô chạy TRỌN VẸN 1 chu trình transaction độc
  lập (đúng pattern gộp-batch của 6.68 đã CHỨNG MINH ổn định ở quy mô
  nhỏ), kết quả `inserted`/`updated` cộng dồn qua các lô. Đổi tên hàm cũ
  thành `upsertReportFactsChunk` (xử lý đúng 1 lô), `upsertReportFacts`
  giờ là vòng lặp gọi hàm đó.
  - Đánh đổi: bước "dọn dòng cũ" (stale wipe, khi `KeepHistory=false`) chỉ
    thấy được dữ liệu của ĐÚNG lô đang xử lý — 1 thực thể có dữ liệu trải
    trên nhiều lô có thể bị dọn "nhầm" ở lô này rồi được lô sau ghi lại
    đúng ngay sau đó (tự sửa trong cùng 1 lượt chạy job, không lộ ra
    ngoài vì mọi lô chạy xong mới coi job kết thúc); lưới an toàn
    `shouldBlockHistoryWipe()` cũng chỉ đánh giá theo từng lô. Chấp nhận
    được vì chia lô chỉ kích hoạt với dữ liệu backfill bất thường lớn,
    không ảnh hưởng job hàng ngày thông thường (≤2000 dòng vẫn 1 lô như
    trước).
- Test bằng driver SQL giả lập: 4500 dòng → đúng 3 transaction, 4000 dòng →
  đúng 2 transaction (chia hết), 600 dòng (mô phỏng job Live thật) → vẫn
  đúng 1 transaction như bản 6.68 (không có hồi quy).

## 6.68 — Gộp batch để né dứt điểm "Invalid object name '#Staging'" vẫn còn tái diễn sau bản 6.67

Bản 6.67 (bỏ `request.bulk()`) chưa dứt điểm — người dùng xác nhận qua log
pm2 thật (đã kiểm chứng code/deploy/restart đều đúng bản mới) rằng lỗi
`Invalid object name '#Staging'.` vẫn xảy ra dù chỉ còn dùng `.query()`
thuần trên nhiều `Request` rời rạc tạo trên CÙNG 1 `Transaction`.

- `etl/lib/upsert.js` — gộp mọi câu lệnh liên quan `#Staging` (CREATE TABLE
  + tất cả INSERT + SELECT dò lịch sử/MERGE) vào **CÙNG một chuỗi SQL, gửi
  qua ĐÚNG MỘT lượt `.query()`** thay vì tạo `new sql.Request(tx)` riêng
  cho từng bước — giảm từ 5+ round-trip xuống còn tối đa 2 (`keepHistory`
  bật: 1 round-trip duy nhất tạo bảng+nạp dữ liệu+MERGE; tắt: round-trip 1
  tạo bảng+nạp dữ liệu+đo lịch sử, round-trip 2 dọn dòng cũ+MERGE). Dù
  chưa xác định được 100% cơ chế nội tại của thư viện `mssql` gây ra hiện
  tượng này, gộp batch loại bỏ hoàn toàn "khoảng hở" giữa các `Request` rời
  rạc — cách né triệt để nhất, không phụ thuộc giả thuyết đúng/sai.
- Test lại toàn bộ bằng driver SQL giả lập (kết nối đơn), xác nhận đúng số
  round-trip theo từng nhánh `keepHistory` và luồng insert/update qua MERGE
  vẫn chính xác.

## 6.67 — Sửa lỗi gốc khiến dwh.ReportFacts CHƯA TỪNG ghi được dòng nào (Invalid object name '#Staging')

Người dùng phát hiện qua `SELECT TOP 1000 * FROM dwh.ReportFacts` cho 0 dòng
dù đã đồng bộ nhiều lần và nguồn kết nối thành công — chẩn đoán từng bước
(test quyền `etl_writer` qua SSMS chạy ổn, sau đó lấy được log pm2 thật)
lộ ra lỗi SQL Server thật: `Invalid object name '#Staging'.` xảy ra ngay
tại bước bulk insert vào bảng tạm.

- **Nguyên nhân gốc**: `etl/lib/upsert.js` dùng `request.bulk(table)`
  (`sql.Table`) để nạp dữ liệu vào `#Staging` trong 1 `Transaction` — thư
  viện `mssql` có lỗi khiến `.bulk()` dùng một KẾT NỐI VẬT LÝ KHÁC với kết
  nối đang giữ transaction, nên bảng tạm `#Staging` (tạo trên kết nối của
  transaction) "không tồn tại" đối với thao tác bulk. Kết quả: MỌI lượt
  đồng bộ đều rollback ngay ở bước này — `dwh.ReportFacts` chưa từng nhận
  được dòng nào kể từ khi triển khai, lỗi bị ẩn sau thông điệp chung chung
  trước khi `describeSyncError()` (bản 6.63/6.66) lộ được text thật.
- **Cách sửa**: bỏ hẳn `request.bulk()`/`sql.Table`, thay bằng câu
  `INSERT INTO #Staging (...) VALUES (...), (...)` viết trực tiếp (literal,
  escape thủ công dấu nháy đơn — KHÔNG dùng `.input()`, cùng lý do đã né ở
  bản 6.63 cho `#StagingTargets`), chia lô ≤500 dòng/câu (giới hạn 1000
  dòng/câu `VALUES` của SQL Server), chạy qua `.query()` thuần trên CÙNG
  `Request`/`Transaction` pattern với CREATE TABLE/DELETE/MERGE — các bước
  này vốn đã chạy ổn định, xác nhận qua test SSMS trực tiếp bằng tài khoản
  `etl_writer`.
- Test bằng driver SQL giả lập kết nối đơn (`Module._load` stub) xác nhận:
  build đúng nhiều lô INSERT khi >500 dòng, escape đúng dấu nháy đơn trong
  JSON Dimensions/Measures, và toàn bộ luồng insert/update qua MERGE chạy
  đúng khi mọi `Request` đều bám cùng 1 "kết nối" — đúng cơ chế đã gây lỗi
  thật.

## 6.66 — Gộp trang "Log" về 1 bảng duy nhất, ghi đầy đủ thông tin lượt chạy job vào Nhật ký hệ thống

Người dùng phản hồi trang "Log" có 2 bảng (Log job cũ + "Nhật ký hệ thống"
mới thêm ở bản 6.61) xếp chồng nhau, bấm tab dễ nhầm đang lọc bảng nào —
yêu cầu chỉ giữ lại "Nhật ký hệ thống", đồng thời đảm bảo thông tin bảng
kia (bắt đầu/kết quả/lỗi từng lượt đồng bộ) vẫn được ghi đầy đủ vào đó,
giống hệt nội dung xem qua pm2 log.

- `etl/jobs/runSync.js` — mọi `console.log`/`console.warn`/`console.error`
  trong vòng đời 1 lượt đồng bộ (bắt đầu, không có dòng mới, thành công,
  cảnh báo mã chi nhánh chưa ánh xạ, bỏ qua do khoá chồng lấn, lỗi) đổi
  sang `logInfo`/`logWarn`/`logError` (`lib/systemLog.js`) — vẫn in
  console y hệt cũ, CHỈ THÊM ghi `etl.SystemLog`.
- `describeSyncError()` — bổ sung đọc `.precedingErrors[]` (nhiều lỗi con
  cùng 1 batch SQL Server) và `.originalError.message` (lỗi gốc bên dưới,
  vd lỗi socket hệ điều hành) — trước đây lỗi driver mssql nhiều khi chỉ
  hiện gọn "RequestError (EREQUEST)", không đủ chẩn đoán mà không SSH xem
  pm2 log riêng; giờ tự đủ chi tiết ngay trên web.
- `etl-admin/src/pages/LogPage.jsx` — bỏ hẳn khối bảng `etl.SyncLog` + bộ
  tab Tất cả/Thành công/Lỗi riêng, chỉ còn 1 bảng "Nhật ký hệ thống" (đổi
  tiêu đề trang lại thành "Log").
- `etl/routes/admin/log.js` — bỏ route `GET /admin/log` (không còn frontend
  nào gọi), chỉ giữ `GET /admin/log/system`. `etl.SyncLog`/bảng của nó vẫn
  giữ nguyên (Dashboard "Đồng bộ gần đây" đọc trực tiếp, không qua route
  này) — chỉ bỏ giao diện xem RIÊNG trên trang Log.

Đã test `describeSyncError()` với 4 dạng lỗi thật (precedingErrors rỗng
message, originalError kèm chi tiết socket, AggregateError, lỗi đơn giản)
+ build sạch etl-admin.

## 6.65 — Nhận nhập chỉ tiêu LĐTĐ khi mẫu file đổi cấu trúc (nhiều sheet, tiêu đề trải 2 dòng)

Người dùng gửi file mẫu mới ("Mẫu Target TĐ T9.xlsx"), báo vẫn không nhập
được chỉ tiêu. Đọc trực tiếp file thật, phát hiện 3 thay đổi cấu trúc so
với mẫu cũ mà `etl/lib/salesTargetsImport.js` chưa nhận diện được:

1. **File có 3 sheet** ("CT ngay", "BRG" — 2 bảng tổng hợp/pivot tham
   khảo — rồi mới tới "File update Report_center" chứa dữ liệu thật cần
   nhập) — code cũ LUÔN đọc CỨNG sheet ĐẦU TIÊN
   (`workbook.worksheets[0]`), rơi đúng vào sheet pivot không khớp mẫu cột
   nào, báo "Không nhận diện được định dạng file" dù sheet đúng vẫn ở phía
   sau. Sửa: `parseSalesTargetsFile()` giờ dò tiêu đề TRÊN TỪNG SHEET theo
   thứ tự, dùng sheet ĐẦU TIÊN khớp được 1 trong 3 mẫu.
2. **Tiêu đề cột trải trên 2 DÒNG LIỀN KỀ** thay vì gọn 1 dòng (dòng trên
   ghi "Ngày"/"Doanh thu"/"Bill", dòng dưới ghi "Điểm"/"Nhóm điểm", xen vài
   ô "rác" như "TONG"/"vV") — `detectHeaderRow()` dò riêng từng dòng như cũ
   không bao giờ thấy ĐỦ bộ cột trong CÙNG 1 dòng. Sửa: thử đúng dòng hiện
   tại trước (không đổi hành vi mẫu tiêu đề gọn 1 dòng cũ); chỉ khi không
   đủ mới GHÉP với dòng NGAY TRÊN (dòng trên ưu tiên, dòng dưới chỉ bù ô
   còn trống — thứ tự này để tránh 1 ô "rác" ở dòng dưới đè mất tên cột
   đúng đã có ở dòng trên).
3. **Cột ngày đổi tên** từ "Ngày/tháng" thành "Ngày" — `parseLdtdDailyShape()`
   giờ chấp nhận cả 2 tên.

**Tiện thể phát hiện thêm** qua chính file mẫu này: 36 dòng cuối bảng có
ngày "31" của các tháng chỉ có 30 ngày (vd `20260931`) — công thức Excel tự
sinh đủ 31 dòng/tháng không phân biệt tháng ngắn/dài. Trước đây các dòng
này lọt qua như hợp lệ, chỉ vỡ tận lúc ghi CSDL (`Invalid Date`). Thêm
`isValidCalendarDate()` — từ chối rõ ràng ngay từ bước đọc file, không âm
thầm lưu sai hoặc lỗi mù mờ ở tầng khác.

Đã test bằng CHÍNH file thật người dùng gửi (1080/1116 dòng hợp lệ, 36 dòng
ngày ảo bị từ chối đúng, 31 dòng lịch thừa cuối bảng không có "Điểm" cũng bị
từ chối đúng) + test hồi quy xác nhận 2 mẫu cũ (generic, HCRC) và kiểu tiêu
đề gọn 1 dòng cũ của LĐTĐ đều không bị ảnh hưởng.

## 6.64 — Báo "có bản cập nhật mới" trên cả 3 giao diện tĩnh (rp-user/api-admin/etl-admin)

Gặp thật trong lúc triển khai bản 6.63: đã `git pull` xong nhưng quên
`npm run build` lại frontend — sidebar vẫn hiện số phiên bản CŨ, không có
cách nào biết ngoài tự nhớ hoặc hỏi lại. Thêm cơ chế tự phát hiện + mời tải
lại trang, giống tinh thần các hệ thống SPA khác (banner "có bản mới").

- `vite.config.js` (cả 3 giao diện) — thêm plugin `closeBundle` ghi
  `dist/version.json` (`{ "version": "<X.Y>" }`) ngay sau khi build xong,
  cùng nguồn `VERSION.md` với `__APP_VERSION__` đã nhúng vào bundle từ
  trước — 2 giá trị LUÔN khớp, chỉ khác thời điểm đọc (lúc build vs lúc
  chạy). rp-user có thêm service worker PWA (`vite-plugin-pwa`) — đặt plugin
  ghi file này SAU `VitePWA(...)` trong mảng `plugins` để `version.json`
  không lọt vào danh sách precache của service worker (luôn phải là request
  mạng thật, không phải bản cache cũ).
- `src/components/UpdateBanner.jsx` (mới, 3 bản trùng nhau theo đúng quy
  ước "mỗi giao diện tự chứa đủ code") — poll `/version.json` mỗi 5 phút +
  ngay khi quay lại tab (`visibilitychange`), so với `__APP_VERSION__`;
  khác nhau thì hiện toast góc dưới-phải mời "Tải lại trang"
  (`window.location.reload()`). Gắn vào `components/Layout.jsx` — điểm
  chung duy nhất mọi trang đã đăng nhập đều đi qua.
- `deploy/serve-static.js` — thêm `version.json` vào `NO_CACHE_FILES` (chế
  độ PM2-only, không Nginx) — thiếu bước này thì file có thể bị cache tới 1
  giờ, banner báo trễ. Bản Nginx không cần sửa gì — `deploy/nginx.conf` đã
  có `location /` catch-all `Cache-Control: no-cache` cho mọi file không
  nằm trong `/assets/`, tự động phủ luôn `version.json`.
- Đã build cả 3 giao diện + kiểm tra `dist/version.json` sinh đúng nội
  dung, `curl` trực tiếp `deploy/serve-static.js` xác nhận header
  `Cache-Control: no-cache`, và xác nhận `version.json` KHÔNG xuất hiện
  trong `dist/sw.js` (precache manifest) của rp-user.

## 6.63 — Sửa lỗi "Invalid object name '#StagingTargets'" khi nhập chỉ tiêu LDTD/HCRC + hiện rõ lỗi đồng bộ rỗng

Người dùng báo "Chưa upload được chỉ tiêu LDTD và chỉ tiêu HCRC" kèm log lỗi
đầy đủ: `RequestError: Invalid object name '#StagingTargets'.` — nhập chỉ
tiêu (POST/PUT `/admin/sales-targets-*`) luôn lỗi 500, không lưu được dòng
nào.

**Nguyên nhân**: `etl/lib/salesTargetsImport.js:upsertSalesTargets()` tạo
bảng tạm `#StagingTargets` rồi MERGE vào `dwh.SalesTargets` trong CÙNG 1
transaction — đúng khuôn với `lib/upsert.js` (đồng bộ chính, không lỗi) —
NHƯNG câu MERGE ở đây còn `.input('importedBy', ...)`/`.input(
'preserveTrangThai', ...)`, khiến driver `mssql` chuyển sang chạy qua
`sp_executesql` thay vì gửi thẳng dạng batch — SQL Server không còn thấy
bảng tạm vừa tạo ở request TRƯỚC trong cùng transaction, báo "Invalid
object name". `lib/upsert.js` không dính lỗi này vì câu MERGE ở đó
KHÔNG dùng `.input()`.

**Sửa**: chuyển `ImportedBy`/`PreserveTrangThai` thành 2 CỘT nạp cùng lượt
bulk insert vào `#StagingTargets` (mỗi dòng lặp lại giá trị giống nhau —
vẫn tham số hoá an toàn qua kiểu cột `sql.Table`, không nối chuỗi), câu
MERGE đọc `src.ImportedBy`/`src.PreserveTrangThai` thay vì `@importedBy`/
`@preserveTrangThai` — bỏ hẳn `.input()` khỏi câu truy vấn có nhắc tới
bảng tạm, khớp đúng mẫu đang chạy ổn ở `lib/upsert.js`.

**Tiện thể sửa luôn 1 lỗi liên quan phát hiện qua cùng log đó**:
`jobs/runSync.js` in lỗi đồng bộ qua `console.error(..., err.message)` —
một số lỗi driver (vd `AggregateError` khi TCP chập chờn) có `.message`
RỖNG theo mặc định của Node, khiến dòng log/`etl.SyncLog.ErrorMessage` chỉ
còn "Lỗi đồng bộ:" trống trơn, không đọc lại được lý do thật. Thêm
`describeSyncError(err)` — ưu tiên `.message`, rồi tới `.errors[]` (mảng
lỗi con của AggregateError), rồi `.code`, cuối cùng mới `String(err)` —
dùng thống nhất cho console/SyncLog/email cảnh báo.

**Triển khai**: `git pull` + `pm2 restart hcrc-etl` — KHÔNG cần chạy lại
schema.sql (không đổi cấu trúc bảng thật, `#StagingTargets` chỉ là bảng
tạm tự tạo/tự xoá mỗi lượt nhập).

## 6.62 — Đồng bộ lại ví dụ DefinitionJson trong "báo cáo doanh thu cuối ngày.md" với bản seed script thật

Rà lại tài liệu khi trả lời câu hỏi "release lần này cần làm gì" — phát hiện
khối JSON mẫu dán tay (Bước 4) còn CŨ, thiếu bộ lọc `cheDoSoSanh` +
`skipWhen`/`hideWhen` đã thêm ở bản 6.56 (`rp-server/scripts/
seedLdtdHcrcReports.js` đã có đủ, chỉ tài liệu bị bỏ sót). Không ảnh hưởng
ai dùng "cách làm nhanh" (chạy thẳng script), chỉ sai với ai dán tay JSON
theo tài liệu. Đã đồng bộ lại cả 2 khối JSON (LDTD + HCRC) khớp đúng script.

## 6.61 — Nhật ký hệ thống (etl.SystemLog) — gộp log kết nối/cảnh báo vào trang "Log"

Người dùng chạy thật gặp nhiều lỗi kết nối (nguồn dữ liệu, DWH...) nhưng
trước đây các dòng "kết nối thành công"/"lỗi kết nối"/cảnh báo cấu hình (vd
chưa khai SMTP) chỉ in ra console/pm2 log — phải SSH vào server mới xem
được, gây khó khi debug từ xa. Yêu cầu: gộp hết các thông tin này vào trang
"Log" (etl-admin) để xem trực tiếp trên web.

- `etl-db/schema.sql` — bảng mới `etl.SystemLog` (Id/Level/Message/
  CreatedAt), tách biệt hoàn toàn với `etl.SyncLog` (log CHẠY JOB có
  SyncJobId/Status/RowsProcessed riêng) — bảng này chỉ 3 cột phẳng, ghi tự
  do từ bất kỳ đâu trong code.
- `etl/lib/systemLog.js` (mới) — `logInfo`/`logWarn`/`logError`: vẫn in ra
  console như cũ, THÊM bước ghi `etl.SystemLog` (fire-and-forget, không
  `await`, bọc try/catch nuốt lỗi — không được làm hỏng luồng gọi nó dù
  chính CSDL etl đang là nguồn gây lỗi).
- Gắn vào 3 điểm sinh log vận hành quan trọng nhất: `db.js` (kết nối/lỗi
  kết nối của mọi pool cố định RP/DWH/ADMIN/DWH_TARGET_IMPORTER — require
  `systemLog.js` TRỄ trong hàm để tránh vòng lặp require với `db.js`),
  `lib/dataSourcePool.js` (kết nối/lỗi kết nối từng "Nguồn dữ liệu" admin tự
  khai — trước đây lỗi kết nối HOÀN TOÀN không được log ở đâu cả), và
  `lib/mailer.js` (cảnh báo chưa cấu hình SMTP_HOST/ALERT_EMAIL_TO).
- `routes/admin/log.js` — thêm `GET /admin/log/system` (lọc theo mức độ,
  phân trang riêng, cùng quyền menu `log` như route cũ).
- `etl-admin/src/pages/LogPage.jsx` — thêm khối "Nhật ký hệ thống" bên dưới
  bảng log job hiện có, tab lọc Tất cả/Thông tin/Cảnh báo/Lỗi, badge màu
  theo mức độ.
- `jobs/cleanupLogs.js` + `server.js` — dọn định kỳ `etl.SystemLog` (dùng
  chung ngưỡng `SYNC_LOG_RETENTION_DAYS`, mặc định 90 ngày) — ghi ở mọi lần
  kết nối nên phình nhanh hơn cả `SyncLog` nếu không dọn.

## 6.60 — Sửa lỗi cú pháp "RowCount" khiến trang Log/Dashboard etl-admin báo "Lỗi máy chủ"

Người dùng chạy thật, trang "Log" báo "Lỗi máy chủ" — log server thật cho
thấy `Msg 156: Incorrect syntax near the keyword 'RowCount'`. Nguyên nhân:
`etl-db/schema.sql` từng ghi chú rõ "`RowCount` là từ khoá dành riêng của
T-SQL, không đặt tên CỘT trùng" nên cột thật đặt tên `RowsProcessed` — NHƯNG
`etl/routes/admin/log.js` và `etl/routes/admin/dashboard.js` lại đặt lại
đúng tên đó khi làm BÍ DANH trong câu SELECT (`RowsProcessed AS RowCount`,
không có ngoặc vuông) — lặp lại đúng vấn đề đã né ở tên cột, khiến SQL
Server từ chối cú pháp ngay khi có ≥1 dòng trong `etl.SyncLog` (bảng rỗng
thì câu SELECT không lỗi, nên bug này ẩn cho tới khi có job chạy thật).

- Sửa cả 2 chỗ thành `RowsProcessed AS [RowCount]` (thêm ngoặc vuông) —
  JSON trả về giữ nguyên key `RowCount`, KHÔNG cần sửa gì ở frontend
  (`LogPage.jsx`/`DashboardPage.jsx` đã đọc đúng key này từ trước).
- Ảnh hưởng CẢ 2 trang: "Log" (etl-admin) và trang chủ Dashboard (mục
  "Đồng bộ gần đây") — cả 2 cùng lỗi, cùng nguyên nhân, sửa 1 lượt.

## 6.59 — Sửa timeout 30 giây cố định khi đồng bộ Nguồn dữ liệu SQL Server

Người dùng chạy thật job "Doanh thu/Giao dịch chi nhánh - Lịch sử
(DSMART16_EOM)" lần đầu, log ETL báo lỗi thật `Timeout: Request failed to
complete in 30000ms` — phát hiện `etl/lib/dbAdapters/mssql.js` CỐ ĐỊNH
CỨNG `requestTimeout: 30000` (30 giây) cho MỌI truy vấn tới Nguồn dữ liệu
SQL Server tự khai qua etl-admin, không cấu hình được — không đủ cho job
"Lịch sử" chạy LẦN ĐẦU (chưa có mốc đồng bộ, đọc VIEW gộp UNION ALL ~93
bảng/bảng lưu trữ hàng chục triệu dòng không lọc ngày, xem 6.53/6.57).

- Nâng mặc định lên 600000ms (10 phút), thêm biến môi trường
  `DATASOURCE_REQUEST_TIMEOUT_MS` (etl/.env.example) để chỉnh thêm nếu
  vẫn chưa đủ, không cần sửa code.
- CHỈ áp dụng cho pool Nguồn dữ liệu tự khai (etl.DataSources) — không
  đụng tới `*_REQUEST_TIMEOUT_MS` riêng của pool `DWH`/`ADMIN` cố định
  (đã có sẵn từ trước, xem `etl/db.js`).

## 6.58 — Sửa lỗi thiếu @freq_recurrence_factor khi tạo lịch Agent Job hàng tháng

Người dùng chạy thật khối tạo SQL Server Agent Job (`báo cáo doanh thu
cuối ngày.md` Bước 1, phần "Tự động chạy lại hàng tháng"), báo lỗi
`Msg 14278: The schedule for this job is invalid (reason:
@freq_recurrence_factor must be at least 1.)` — `sp_add_schedule` với
`@freq_type = 16` (hàng tháng) BẮT BUỘC phải kèm `@freq_recurrence_factor`
(số tháng giữa 2 lần chạy), script cũ thiếu tham số này (mặc định 0, không
hợp lệ). Sửa: thêm `@freq_recurrence_factor = 1` (chạy mỗi tháng).

(Lỗi này khiến `sp_add_schedule` thất bại → `sp_attach_schedule` ngay sau
đó lỗi theo do lịch chưa từng được tạo — 2 dòng lỗi liên tiếp cùng 1
nguyên nhân gốc, không phải 2 lỗi riêng.)

## 6.57 — Sửa lỗi STRING_AGG vượt 8000 byte khi tạo VIEW Doanh thu trên DSMART16_EOM

Người dùng chạy thật Script B (`báo cáo doanh thu cuối ngày.md` Bước 1) trên
`DSMART16_EOM`, báo lỗi `Msg 9829: STRING_AGG aggregation result exceeded
the limit of 8000 bytes` — do ghép UNION ALL ~93 bảng `STRANS_YYYYMM`
thành 1 chuỗi SQL động, SQL Server suy luận kiểu trả về của `STRING_AGG`
theo kiểu NGẮN NHẤT trong biểu thức cộng chuỗi (ở đây là chuỗi literal,
không phải `NVARCHAR(MAX)`), vượt 8000 byte thì báo lỗi thay vì tự động mở
rộng. Sửa: ép kiểu `CAST(... AS NVARCHAR(MAX))` ngay chuỗi đầu tiên trong
`STRING_AGG` — áp dụng cho cả Script B và bản sao trong stored procedure
`sp_HCRC_RebuildDoanhThuView`.

(Trước đó cùng buổi debug, người dùng gặp lỗi `Invalid object name
'TRANSHDR_ARC'` khi chạy VIEW 2 (Giao dịch) — xác nhận đây KHÔNG phải lỗi
tên bảng sai, mà do cửa sổ Query còn đang chọn nhầm CSDL `DSMART16` [Live]
thay vì `DSMART16_EOM` — không cần sửa gì trong code/tài liệu cho trường
hợp này, chỉ là thao tác chọn sai CSDL của người chạy.)

## 6.56 — Báo cáo nhanh doanh thu: thêm "Chế độ so sánh" — ẩn cùng kỳ năm trước khi xem quá khứ

Người dùng yêu cầu (SAU KHI đã có 6.55 nhưng CHƯA merge vào `main` — làm
tiếp trên nhánh feature theo đúng yêu cầu "đừng merge vội"): thêm tuỳ chọn
"so sánh quá khứ" cho báo cáo LDTD/HCRC — khi bật, CHỈ còn Doanh thu/Giao
dịch thực đạt so với Chỉ tiêu, ẩn bớt phần so sánh cùng kỳ năm trước (dùng
khi xem lại 1 khoảng ngày ĐÃ QUA, không cần đối chiếu thêm cùng kỳ).

- Thêm cơ chế TỔNG QUÁT (dùng được cho MỌI báo cáo composite khác sau
  này, không riêng LDTD/HCRC) vào `compositeReportRunner.js`:
  - `block.skipWhen: {field, equals}` — BỎ QUA HẲN 1 khối (không gọi truy
    vấn) khi `filterValues[field] === equals`.
  - `column.hideWhen: {field, equals}` — LOẠI HẲN 1 cột khỏi
    `describeColumns()`/dòng kết quả (không chỉ để trống giá trị) khi
    điều kiện khớp.
- Báo cáo LDTD/HCRC thêm filter `cheDoSoSanh` (select: "Đầy đủ"/"So sánh
  quá khứ") — khối `lastYear`/`lastYearGD` gắn `skipWhen`, 4 cột Cùng kỳ/
  LFL (Doanh thu + Giao dịch) gắn `hideWhen`, cùng điều kiện
  `cheDoSoSanh === 'past'`. KHÔNG truyền filter này (báo cáo/lịch cũ chưa
  biết field mới) -> hành vi CŨ, đầy đủ như trước, không đổi gì.
- Bật "So sánh quá khứ" tiết kiệm ĐÚNG 2 lượt truy vấn CSDL (Doanh thu +
  Giao dịch cùng kỳ năm trước) mỗi lần chạy báo cáo — không chỉ ẩn cột
  trên giao diện.
- Không cần sửa gì ở frontend (`FilterForm.jsx` đã có sẵn `type: 'select'`
  từ trước) — chỉ đổi `DefinitionJson` phía `rp-server`.
- Test bằng fake DB pool: chế độ mới ẩn đúng 4 cột + xác nhận KHÔNG gọi
  truy vấn cho khối cùng kỳ năm trước (đếm số lượt query), chế độ mặc định
  (không truyền filter) giữ nguyên đầy đủ cột như cũ — cả 2 case pass.

## 6.55 — Báo cáo nhanh doanh thu: chọn 1 ngày HOẶC 1 khoảng ngày (cộng dồn)

Người dùng hỏi báo cáo doanh thu LDTD/HCRC đã có bộ lọc "từ ngày - đến
ngày" chưa — kiểm tra thấy CHƯA, bộ lọc `eventDate` trước đó CHỈ chọn được
đúng 1 ngày (`type: "date"`), dù hệ thống đã có sẵn cơ chế `dateRange` cho
báo cáo thường (`directDb`, dùng ở "Lịch gửi email báo cáo"/"Cảnh báo bất
thường"). Đây là SỬA LÕI kiến trúc `compositeReportRunner.js` (báo cáo
composite trước giờ chỉ tính theo ĐÚNG 1 ngày cho mọi khối), không phải
thêm 1 ô input đơn giản.

- Đổi filter `eventDate` của báo cáo LDTD/HCRC sang `type: "dateRange"` —
  chọn 1 ngày (từ=đến) hoặc nhiều ngày liên tiếp.
- `compositeReportRunner.js`: `resolveRequestedRange()` chuẩn hoá MỌI dạng
  input (chuỗi 1 ngày cũ, hoặc `{from,to}` mới) về CÙNG 1 khoảng — 1 ngày
  chỉ là khoảng có from=to, nên mọi phép cộng dồn bên dưới tự động cho ra
  đúng kết quả cũ khi chọn 1 ngày (không có 2 đường code riêng, giảm rủi ro
  lệch hành vi).
- Khối `directDb` (`current`/`lastYear`): CỘNG DỒN (SUM) các `measures`
  (doanh thu, số giao dịch...) của mọi ngày trong khoảng theo từng
  entityCode (`aggregateDailyRowsByEntity()`) — CỐ Ý KHÔNG cộng dồn
  `dimensions` (diện tích, nhóm MART/MINIMART — thuộc tính tĩnh của chi
  nhánh, cộng theo ngày sẽ ra số vô nghĩa), lấy giá trị không rỗng đầu
  tiên. Khối `dateOffsetYears: -1` dịch CẢ 2 đầu mút của khoảng theo đúng
  số năm, cho ra khoảng "cùng kỳ năm trước" tương ứng.
- Khối `isTarget`: `salesTargetsReader.js` đổi hẳn từ `runSalesTargetsBlock`
  (1 kỳ) sang `runSalesTargetsBlockRange` (khoảng kỳ, `PeriodMonth BETWEEN`)
  — cộng dồn chỉ tiêu TỪNG NGÀY/THÁNG có thật trong khoảng theo từng
  entityCode. `TrangThai='DaDong'` xử lý ĐÚNG THEO TỪNG KỲ trong khoảng:
  chỉ tiêu của kỳ đã đóng KHÔNG được cộng vào tổng (không loại cả thực thể
  chỉ vì đóng 1 vài ngày), thực thể chỉ bị LOẠI HẲN khỏi báo cáo khi TẤT CẢ
  kỳ trong khoảng đã chọn đều đóng — khớp đúng hành vi cũ khi khoảng chỉ có
  1 kỳ duy nhất.
- Khối `apiReport`/`apiRealtime` CHƯA hỗ trợ khoảng ngày (API ngoài chỉ
  nhận 1 ngày) — nhận best-effort đúng ngày CUỐI khoảng, không cộng dồn,
  ghi rõ giới hạn này trong code + `hướng_dẫn_báo_cáo.md`.
- **Lợi ích phụ không ngờ tới**: cơ chế preset khoảng ngày tương đối (hôm
  nay/hôm qua/7 ngày qua/tháng này...) đã có sẵn cho "Lịch gửi email báo
  cáo"/"Cảnh báo bất thường" (`lib/reportEmailFilters.js`) giờ DÙNG ĐƯỢC
  NGAY cho báo cáo LDTD/HCRC mà không cần sửa gì thêm, vì cùng dùng chung 1
  filter `dateRange`.
- Test bằng fake DB pool (không cần SQL Server thật): 1 ngày ra đúng số cũ,
  khoảng 3 ngày cộng dồn đúng, siêu thị đóng cửa 1 ngày giữa khoảng vẫn
  hiện ra (chỉ mất chỉ tiêu ngày đó), siêu thị đóng cửa cả khoảng bị loại
  hẳn — cả 3 trường hợp đều pass.

## 6.54 — Sửa nốt 2 chỗ đoán sai còn lại trong VIEW Doanh thu (STOCK.TYPE, COSTPRICE)

Tiếp nối 6.53 — sau khi có nguồn `STRANS` đúng, còn 2 chỗ trong Script A/B
`báo cáo doanh thu cuối ngày.md` vẫn để placeholder/giả định chưa kiểm
chứng, nay đã xác nhận bằng dữ liệu thật và sửa cả 3 nơi (Script A, Script
B, stored procedure `sp_HCRC_RebuildDoanhThuView`):

- **Cột phân loại MART/MINIMART**: `STOCK.STYPE_ID` (giả định ban đầu)
  LUÔN TRỐNG (xác nhận `SELECT DISTINCT STYPE_ID` chỉ ra 1 giá trị trống ở
  toàn bộ 286 dòng) — cột đúng là `STOCK.TYPE`: `'01'`=MART (118 chi
  nhánh), `'02'`=MINIMART (168 chi nhánh), xác nhận qua tên chi nhánh thật
  và người quản trị DSMART16.
- **Phát hiện thêm, chưa từng có trong hướng dẫn gốc**: `COSTPRICE.STK_ID`
  LUÔN TRỐNG ở 100% dòng (2,358,829/2,358,829) — COSTPRICE là bảng giá vốn
  DÙNG CHUNG toàn hệ thống (1 giá/SKU/tháng), KHÔNG theo từng chi nhánh.
  JOIN cũ `c.STK_ID = d.STK_ID AND c.SKU_ID = d.SKU_ID AND c.MEC_YM = ...`
  KHÔNG BAO GIỜ khớp — khiến giá vốn luôn tính = 0 và "Lãi gộp" luôn bằng
  đúng doanh thu (sai âm thầm, không báo lỗi gì). Đã bỏ điều kiện `STK_ID`
  khỏi JOIN, chỉ còn `SKU_ID + MEC_YM`.
- `COSTPRICE.MEC_YM` (định dạng `YYYYMM`) đã xác nhận đúng như dự đoán ban
  đầu — không cần sửa.
- Cập nhật mục "Còn thiếu xác nhận cuối cùng" trong sổ tay thành mục "Đã
  xác nhận đầy đủ bằng dữ liệu thật" — không còn placeholder nào trong 2
  script, dán chạy thẳng được.

## 6.53 — Sửa lại đúng nguồn dữ liệu thật cho VIEW Doanh thu (Bước 1)

Người dùng chạy thử Script A/B ở `báo cáo doanh thu cuối ngày.md` trên
DSMART16 thật, phát hiện `DSTK_INFO` (bảng VIEW "Doanh thu" dựa vào) HOÀN
TOÀN TRỐNG trên cả 2 CSDL — bản hướng dẫn trước đó ĐOÁN SAI tên bảng chỉ
theo quy ước đặt tên cột, chưa từng kiểm chứng bằng dữ liệu thật. Đã cùng
người dùng tra ngược qua nhiều vòng (danh sách bảng thật, đối chiếu cột,
đối chiếu số liệu Live/EOM cùng ngày) để tìm đúng nguồn — quá trình này
cũng phát hiện thêm 2 điều bất ngờ khác so với giả định ban đầu.

- **`STRANS`** (Live) mới là bảng chi tiết giao dịch thật (không phải
  `DSTK_INFO`) — VIEW "Doanh thu" giờ JOIN `STRANS` sang `TRANSHDR` qua
  `TRANS_NUM` để lấy `STATUS` đáng tin, loại đúng giao dịch huỷ.
- Mã `STATUS` thật đã xác nhận với người quản trị DSMART16: `N`=Mới,
  `M`=Sửa (vẫn tính vào doanh thu), `D`=Huỷ (loại) — bản cũ dùng nhầm
  `STATUS <> 'X'` (mã `'X'` không tồn tại, không lọc được gì).
- `DSMART16_EOM` KHÔNG có 1 bảng lịch sử duy nhất — dữ liệu chia thành
  **93 bảng theo tháng** (`STRANS_YYYYMM`) + `STRANS_EOM` (vùng đệm gần
  nhất, cùng cấu trúc, đã đối chiếu từng cột bằng file schema thật) — VIEW
  "Doanh thu" ở EOM giờ `UNION ALL` toàn bộ (sinh SQL tự động từ
  `sys.tables`, không gõ tay 93 tên bảng).
- **Phát hiện quan trọng**: `TRANS_NUM` giữa `STRANS_EOM` và `TRANSHDR_ARC`
  sinh theo 2 quy tắc khác nhau (1 bên xen chữ cái, 1 bên thuần số) — JOIN
  qua `TRANS_NUM` như bên Live KHÔNG khớp được ở EOM (kiểm chứng: JOIN ra
  0 dòng dù cả 2 bảng đều có dữ liệu). VIEW "Doanh thu" ở EOM vì vậy dùng
  THẲNG cột `STATUS` có sẵn trong `STRANS_EOM`/`STRANS_YYYYMM`, không JOIN
  sang `TRANSHDR_ARC` — đã đối chiếu số liệu 1 ngày/1 chi nhánh trùng giữa
  Live và EOM, chênh lệch < 0.5%, đủ tin cậy. VIEW "Giao dịch" ở EOM vẫn
  dùng `TRANSHDR_ARC` (1 bảng lưu trữ đủ 2018-2026, không cần UNION ALL).
- Thêm hướng dẫn tự động hoá bảo trì: gói script sinh VIEW EOM thành
  stored procedure `sp_HCRC_RebuildDoanhThuView` + SQL Server Agent Job
  chạy lại hàng tháng (ngày 2) — cần thiết vì `CREATE VIEW` không tự nhận
  bảng `STRANS_YYYYMM` mới phát sinh theo thời gian.
- `STOCK`/`COSTPRICE` vẫn đúng như dự đoán ban đầu — chỉ có ở `DSMART16`,
  không đổi cách tham chiếu chéo.
- Cập nhật toàn bộ Bước 1 trong `báo cáo doanh thu cuối ngày.md` (Script
  A/B viết lại hoàn toàn, không chỉ sửa 2 dòng như bản cũ).

## 6.52 — Cảnh báo mã siêu thị sai khi nhập chỉ tiêu LDTD/HCRC

Người dùng hỏi có nên đối chiếu chỉ tiêu với file mẫu báo cáo trước khi
nhập để chặn lỗi — ĐỒNG Ý làm ở mức CẢNH BÁO (không chặn), vì trước đây gõ
sai/nhầm mã siêu thị trong file chỉ tiêu vẫn nhập THÀNH CÔNG bình thường,
nhưng dòng đó ÂM THẦM không bao giờ ghép được vào báo cáo composite (ghép
đúng theo entityCode, không báo lỗi gì khi 1 dòng "mồ côi").

- `etl/lib/salesTargetsImport.js` — thêm `findUnknownEntityCodes()`: đối
  chiếu EntityCode trong file vừa nhập với danh sách EntityCode ĐANG CÓ
  THẬT trong `dwh.ReportFacts` của domain thực đạt tương ứng, trả về mã nào
  không khớp. Bỏ qua hoàn toàn (không cảnh báo sai) khi domain thực đạt
  chưa có dữ liệu nào (ETL chưa đồng bộ lần nào — không có gì để đối
  chiếu).
- `dwh/grants.sql` — bổ sung `GRANT SELECT ON dwh.ReportFacts TO
  dwh_target_importer` (nới lỏng có chủ đích so với thiết kế gốc "không
  đụng ReportFacts dù chỉ để đọc" — chỉ mở quyền ĐỌC, KHÔNG mở quyền GHI,
  không ảnh hưởng mục tiêu cô lập ghi ban đầu).
- `etl/routes/admin/salesTargets.js` + `etl/server.js` — route nhập chỉ
  tiêu nhận thêm tham số `actualDataDomain` (`doanhthu_chinhanh` cho cả 2
  trang LDTD/HCRC), trả thêm `unknownEntityCodes` trong kết quả `POST
  /import` (không chặn — lỗi đối chiếu chỉ log cảnh báo, không làm hỏng lượt
  nhập).
- `etl-admin/src/pages/SalesTargetsPage.jsx` — hiện danh sách mã cảnh báo
  ngay dưới kết quả nhập, tách riêng khỏi `rowErrors` (đây là cảnh báo, các
  dòng đó vẫn đã nhập thành công).
- Đã test `findUnknownEntityCodes()` bằng pool giả (4 tình huống: không
  truyền domain, danh sách mã rỗng, chưa có dữ liệu thực đạt, và trường hợp
  bình thường có mã sai) + `npm run build` etl-admin.

## 6.51 — Chỉ tiêu LDTD/HCRC chuyển sang THEO NGÀY, khớp đúng 2 file mẫu thật

Người dùng gửi 2 file mẫu chỉ tiêu THẬT đội Lãnh đạo Tập đoàn/HCRC đang
dùng — phát hiện thiết kế cũ (chỉ tiêu THEO THÁNG, 1 số cố định chia đều cả
tháng, file `MaSieuThi`+`Thang`) SAI với thực tế: cả 2 đội đều tính chỉ
tiêu THEO NGÀY (khác nhau mỗi ngày theo tỷ lệ N-1/LFL), và 2 file mẫu có
2 hình dạng cột HOÀN TOÀN KHÁC NHAU (LDTD: bảng "rộng" `Điểm`+`Doanh thu`+
`Bill`; HCRC: bảng "dài" `Kỳ`+`Mã đối tượng chứa`+`Mã loại chỉ tiêu`+
`Giá trị chỉ tiêu`, mỗi dòng 1 loại chỉ tiêu). Sửa để khớp ĐÚNG 2 file thật
thay vì bắt IT đổi tên cột trước khi tải lên — không cần đổi schema CSDL
(`dwh.SalesTargets.PeriodMonth` vẫn là kiểu DATE thường, giờ lưu ĐÚNG 1
ngày cụ thể thay vì luôn ngày 1 đầu tháng).

- `etl/lib/salesTargetsImport.js` — viết lại `parseSalesTargetsFile()` tự
  nhận diện 1 trong 3 định dạng cột (dò tối đa 3 dòng đầu): (1) mẫu tổng
  quát cũ `MaSieuThi`+`Thang` (chỉ tiêu tháng, giữ nguyên hành vi); (2) mẫu
  thật LDTD `Ngày/tháng`+`Điểm`+`Nhóm điểm`+`Doanh thu`+`Bill` (chỉ tiêu
  ngày, cắt phần thập phân bằng `Math.trunc()` đúng như ghi chú trong file
  mẫu); (3) mẫu thật HCRC `Kỳ`+`Mã đối tượng chứa`+`Mã loại chỉ tiêu`+
  `Giá trị chỉ tiêu` (chỉ tiêu ngày dạng "dài", ghép nhiều dòng cùng
  (Kỳ, Mã đối tượng chứa) thành 1 dòng chỉ tiêu qua `HCRC_TARGET_TYPE_MAP`
  — mã "01"/"03" SUY LUẬN từ độ lớn số liệu mẫu, cần đội HCRC xác nhận lại).
  Cả 2 mẫu ngày đều ghi ra đúng tên field `ChiTieuDoanhThu`/`ChiTieuGiaoDich`
  — không cần sửa gì công thức báo cáo.
- `etl/routes/admin/salesTargets.js` — `PUT /one` chấp nhận cả `YYYY-MM`
  (chỉ tiêu tháng) và `YYYY-MM-DD` (chỉ tiêu ngày).
- `rp-server/lib/compositeReportRunner.js` — khối `isTarget` thêm tuỳ chọn
  `targetGranularity: 'day'` để tra ĐÚNG ngày báo cáo thay vì luôn quy về
  ngày 1 đầu tháng (mặc định giữ nguyên hành vi cũ nếu bỏ trống).
- `rp-server/scripts/seedLdtdHcrcReports.js` + `báo cáo doanh thu cuối
  ngày.md` (Bước 3 viết lại theo 2 mẫu thật, Bước 4 thêm
  `"targetGranularity": "day"`, Bước 7 thêm mục kiểm tra) — cả 2 báo cáo
  LDTD/HCRC chuyển hẳn sang tra chỉ tiêu theo ngày.
- Đã kiểm thử bằng cách chạy thật `parseSalesTargetsFile()` trên 2 file
  mẫu người dùng gửi (script tạm, không commit) — ra đúng 990 dòng (LDTD,
  33 kho × 30 ngày) và 30 dòng (HCRC, 1 kho mẫu × 30 ngày), số liệu khớp
  đúng file gốc.
- Giới hạn đã biết: 2 mẫu thật KHÔNG có cột đánh dấu "đã đóng cửa"
  (`TrangThai`) như mẫu tổng quát cũ — siêu thị đóng cửa giữa tháng xử lý
  bằng cách ngừng gửi dòng của những ngày sau đó, không có cờ tường minh.

## 6.50 — Tài liệu hoá rủi ro trùng ngày giao tháng Live/Lịch sử — chấp nhận hiện trạng

Đã xác nhận với người dùng: `DSMART16_EOM` NHẬN THÊM dữ liệu mỗi khi hết
tháng (không phải đổ 1 lần) — nghĩa là đúng ngày/vài ngày quanh lúc đóng
sổ, có khả năng 1 chi nhánh/1 ngày tồn tại dữ liệu ở CẢ 2 nguồn (Live +
Lịch sử) cùng lúc, cùng `EntityCode`+`EventDate` nhưng khác `SourceSystem`
(không ghi đè nhau, nhưng gây "trùng" cho báo cáo composite). Cơ chế an
toàn có sẵn (Q8, đợt rà soát trước) đã xử lý ĐÚNG hướng: phát hiện >1 dòng
cho 1 entityCode trong 1 khối → loại hẳn khỏi báo cáo ngày đó (không hiện
số sai/gấp đôi). Đã hỏi người dùng có muốn sửa code để ưu tiên nguồn Lịch
sử khi trùng thay vì loại bỏ — **quyết định: CHẤP NHẬN hiện trạng**, không
sửa code (rủi ro thấp, chỉ ảnh hưởng 1-2 ngày/tháng).

Cập nhật `báo cáo doanh thu cuối ngày.md`:
- Bước 2.2 — sửa lại đoạn giải thích khoá ghi (trước đây khẳng định NHẦM
  Live/Lịch sử "khác nhau ở EventDate" nên không bao giờ trùng — SAI, đúng
  ra là khác `SourceSystem`, và CÓ THỂ trùng `EventDate` đúng lúc giao
  tháng) + thêm đoạn giải thích đầy đủ rủi ro/cách xử lý/quyết định.
- Bước 7 — thêm mục kiểm tra mới: theo dõi Log quanh ngày giao tháng, tìm
  dòng cảnh báo "trả về NHIỀU HƠN 1 dòng cho entityCode" để xác nhận đây
  là hành vi đã biết, không phải lỗi cấu hình.

## 6.49 — "báo cáo doanh thu cuối ngày.md": 2 script VIEW riêng (A/B) cho Live/Lịch sử

Bước 1 trước đây đưa 1 câu `CREATE VIEW` chung + hướng dẫn "tự sửa 2 dòng
nếu cần" cho `DSMART16_EOM` — nay tách hẳn thành **Script A** (chạy trên
`DSMART16`, không đổi) và **Script B** (chạy trên `DSMART16_EOM`, đã join
chéo sẵn `DSMART16.dbo.STOCK`/`DSMART16.dbo.COSTPRICE`) — dán thẳng đúng
script theo CSDL đang chọn, không cần tự sửa tay nữa. Xác nhận thêm: tên
"Nguồn dữ liệu" `DSMART16 - Lịch sử` người dùng đã tạo qua giao diện khớp
CHÍNH XÁC với tên `etl/scripts/seedLdtdHcrcSync.js` tìm/cập nhật theo —
không cần sửa code.

## 6.48 — Xác nhận DSMART16/DSMART16_EOM cùng 1 máy chủ — cập nhật hướng dẫn

`báo cáo doanh thu cuối ngày.md` (Bước 1) trước đây để ngỏ 2 khả năng
("nếu cùng máy chủ" / "nếu khác máy chủ") cho trường hợp `DSMART16_EOM`
thiếu bảng `STOCK`/`COSTPRICE` — nay đã XÁC NHẬN thật (172.16.70.20, cùng
1 máy chủ cho cả 2 CSDL), rút gọn hướng dẫn: chỉ còn 1 cách xử lý duy nhất
— tham chiếu chéo 3 phần tên (`DSMART16.dbo.STOCK`/`DSMART16.dbo.COSTPRICE`)
ngay trong VIEW ở `DSMART16_EOM`, bỏ nhánh "khác máy chủ" không còn áp dụng.

## 6.47 — Giao diện di động: sidebar dạng drawer cho cả 3 app quản trị

Trước đây `.sidebar` rộng cố định 240px nằm CẠNH `.content` trong
`.app-shell` (`display:flex`) ở MỌI kích thước màn hình — trên điện thoại
(~360-420px), 240px chiếm hơn nửa màn hình, phần nội dung còn lại quá hẹp
và một số khối con (`.modal-body` rộng cố định 420px, `.dashboard-grid`
`minmax(380px,...)`) không co lại được, đẩy cả trang tràn ngang phải cuộn
mới xem hết — đúng lỗi người dùng chụp màn hình thấy trên `report.hcrc.vn`.
Sửa cho cả `rp-user`, `etl-admin`, `api-admin` (code trùng lặp có chủ đích,
đúng quy ước hiện có — mỗi app tự chứa đủ CSS/component):

- Dưới breakpoint 880px: `.sidebar` chuyển từ dải cố định sang **drawer ẩn/
  hiện** (`position:fixed`, trượt vào/ra bằng `transform: translateX`), mở
  bằng nút ☰ trên thanh `.mobile-topbar` mới (sticky trên cùng, có logo +
  tên hệ thống), đóng bằng bấm `.sidebar-backdrop` (lớp phủ tối mờ) hoặc
  bấm 1 mục điều hướng thật (không đóng khi chỉ mở/đóng nhóm "Hệ thống" ở
  rp-user). `.content` không còn bị ép chung hàng với sidebar → hết tràn
  ngang.
- `.modal-body` đổi `width: 420px` cố định → `width: min(420px, 92vw)` (cả
  3 app) — hộp thoại Sửa không còn tràn khỏi màn hình hẹp.
- `rp-user`: `.dashboard-grid` (`minmax(380px,...)`) thêm breakpoint riêng
  460px → 1 cột, vì `minmax` không tự co dưới mức sàn 380px.
- Tiện thể sửa 1 lỗi CSS thật phát hiện khi rà lại: modal "Sửa" ở
  `etl-admin` (`SyncJobsPage.jsx`/`DataSourcesPage.jsx`, thêm ở đợt trước)
  dùng nhầm tên class (`modal-overlay` chưa từng định nghĩa, `modal` bị
  gán sai lớp) — đổi đúng về `modal`/`modal-body` như quy ước sẵn có.

Test bằng Playwright thật (viewport di động 390×844, `isMobile`/`hasTouch`),
chụp cả 3 trạng thái (đóng/mở drawer/đóng lại sau khi bấm ra ngoài) cho cả
3 app — xác nhận không còn tràn ngang, nút ☰ mở đúng menu thật, bấm ra
ngoài đóng lại đúng. Kèm vite build sạch cả 3 frontend.

## 6.46 — rp-user: nút "Xem khoá API hiện tại" cho HCRC Workspace

Trang "Xác thực HCRC Workspace" trước đây (đúng như "Đối tác API" ở
api-admin) không cho xem lại khoá đã lưu — ô Khoá API luôn để trống, chỉ
nhập được khoá MỚI đè lên. Khác api-admin (khoá đối tác NGOÀI lưu dạng BĂM
1 chiều, không tài nào giải mã lại được dù muốn), khoá HCRC Workspace là bí
mật CỦA CHÍNH hệ thống (rp-server tự dùng để gọi ra API của HCRC, không
phát cho bên thứ 3) và được lưu MÃ HOÁ 2 CHIỀU (`lib/crypto.js`) — về mặt
kỹ thuật giải mã lại được, nên hợp lý để Admin hệ thống xem lại khi cần.

- `rp-server/routes/hcrcWorkspaceSettings.js` — route mới `GET /api-key`
  (cùng mức bảo vệ `requireSystemRoleActor` như route sửa cấu hình), giải
  mã và trả khoá thật, GHI AUDIT LOG mỗi lần xem (`XEM_KHOA_API`) — khác
  `GET /` vẫn chỉ trả `hasApiKey` như cũ, không tự động lộ khoá.
- `HcrcWorkspaceSettingsPage.jsx` — nút "Xem khoá API hiện tại" (chỉ hiện
  khi đã có khoá), gọi route trên khi bấm (không tự tải cùng lúc vào trang,
  tránh ghi audit log thừa mỗi lần mở trang), kèm nút "Sao chép" và "Ẩn".

Test bằng script mock route (giả `../db`/`../lib/crypto`/`../lib/auditLog`,
gọi thẳng route handler) xác nhận giải mã đúng + có ghi audit log + trả 404
khi chưa cấu hình khoá — không commit file test vào repo (đúng quy ước dự
án, test kiểu này chỉ chạy 1 lần ở scratchpad). Kèm vite build sạch rp-user.

## 6.45 — etl-admin: nút "Sửa" cho Nguồn dữ liệu (Server/Database/Username/Password)

`etl-admin/src/pages/DataSourcesPage.jsx` trước đây chỉ có Tắt/Bật/Xoá —
đổi Server/Username/Password của 1 nguồn đã tạo (vd tài khoản đọc DSMART16
do DBA cấp) phải xoá job/report liên quan rồi tạo lại nguồn mới. Route
backend `PUT /admin/data-sources/:id` đã hỗ trợ sẵn đầy đủ các trường này
(kể cả mật khẩu để trống = giữ nguyên mật khẩu đã lưu) — chỉ thiếu UI. Thêm
nút "Sửa" mở modal sửa Tên/Server/Port/Database/Username/Mật khẩu mới (tuỳ
chọn)/Mã hoá kết nối/Tin chứng chỉ tự ký/Hoạt động — lưu xong tự kiểm tra
kết nối lại ngay (giữ đúng hành vi `renderConnectionTest` đã có). Người
dùng tự điền tài khoản DSMART16 thật (do họ tạo/quản lý) qua form này thay
vì phải nhờ chỉnh code.

Test bằng vite build sạch (`etl-admin`).

## 6.44 — api-admin: nút Sửa/Tắt-Bật/Sao chép bí mật cho Đối tác API

`api-admin/src/pages/ConsumersPage.jsx` (trang "Đối tác API") đã có sẵn nút
"Sửa" (đổi Tên/Phạm vi/Giới hạn/IP cho phép/Hoạt động qua modal) nhưng chưa
có nút Tắt/Bật nhanh và chưa có nút sao chép bí mật — bổ sung:

- Nút "Tắt"/"Bật" riêng ở mỗi dòng (1 cú bấm, không cần mở modal Sửa chỉ để
  đổi mỗi cờ `IsActive`) — cùng route `PUT /consumers/:id` đã có.
- Nút "Sao chép" cạnh mỗi bí mật vừa hiện ra (banner sau khi Tạo/Luân chuyển) —
  dùng `navigator.clipboard`, báo lỗi rõ ràng nếu trình duyệt chặn (context
  không an toàn) thay vì im lặng không làm gì.

**Giới hạn có chủ đích, không đổi được**: `ApiKeyHash`/`ClientSecretHash` lưu
dạng BĂM SHA-256 một chiều (`api-db/schema.sql`), `HmacSecretEncrypted` mã
hoá AES-256-GCM nhưng key mã hoá không lộ ra API — hệ thống KHÔNG thể (và cố
tình không) đọc lại bí mật CŨ sau khi đóng banner, giống cơ chế mật khẩu đăng
nhập. Vì vậy không có nút "xem lại API key hiện tại" — chỉ có "Luân chuyển bí
mật" để cấp bí mật MỚI (bí mật cũ ngừng hoạt động ngay lúc đó). Banner đã ghi
rõ điều này để tránh hiểu nhầm là bug.

Test bằng vite build sạch (`api-admin`).

## 6.43 — Nút "Sửa" cho Báo cáo (rp-user) và Job đồng bộ (etl-admin)

Trước đây sửa 1 báo cáo/job đã tạo phải xoá rồi tạo lại — 2 route backend
`PUT /system/report-catalog/:reportId` và `PUT /admin/sync-jobs/:id` đã có
sẵn từ trước nhưng chưa có nút bấm nào gọi tới. Thêm giao diện:

- `rp-user/.../report-catalog/ReportCatalogPanel.jsx` — nút "Sửa" ở mỗi
  dòng nạp lại TOÀN BỘ dữ liệu report đó vào ĐÚNG form "Tạo báo cáo" phía
  trên (dùng chung 1 form, không tạo form riêng) — ô "Mã báo cáo" bị khoá
  (không đổi được khoá chính qua PUT), nút "Lưu" đổi tên thành "Cập nhật
  báo cáo" và gọi PUT thay vì POST, có nút "Huỷ" quay lại chế độ tạo mới.
- `etl-admin/src/pages/SyncJobsPage.jsx` — nút "Sửa" mở 1 modal RIÊNG
  (không dùng chung form Tạo mới, vì PUT không nhận Nguồn dữ liệu/bảng
  nguồn/cấu hình join — đổi các trường đó vẫn phải xoá job cũ tạo job mới,
  đúng giới hạn có chủ đích của route) — sửa được Tên/Domain/Lịch chạy
  (cron)/Giữ lịch sử/Ánh xạ mã chi nhánh, và với job Type="table" còn sửa
  được Dimensions/Measures (tự tải lại danh sách cột THẬT từ bảng nguồn
  hiện có của job qua endpoint duyệt schema có sẵn, không gõ tay).

Không đổi backend (2 route PUT đã đủ, chỉ thiếu UI). Test bằng vite build
sạch cả 2 frontend.

## 6.42 — Script tạo tự động 2 Nguồn dữ liệu + 4 job đồng bộ + 2 báo cáo LDTD/HCRC

Thay bấm tay qua giao diện (Bước 2 + Bước 4 của "báo cáo doanh thu cuối
ngày.md") bằng 2 script idempotent (chạy lại nhiều lần an toàn — khớp theo
Name/ReportId để UPDATE thay vì tạo trùng):

- `etl/scripts/seedLdtdHcrcSync.js` — đọc `DSMART16_SERVER`/`DSMART16_USER`/
  `DSMART16_PASSWORD` (+ các biến `DSMART16_EOM_*`/`DSMART16_LIVE_DB`/
  `DSMART16_EOM_DB` tuỳ chọn) từ `.env`, tạo/cập nhật 2 `etl.DataSources`
  ("DSMART16 - Live"/"DSMART16 - Lịch sử", mật khẩu mã hoá qua
  `lib/crypto.js` — cùng hàm route POST /admin/data-sources dùng) và 4
  `etl.SyncJobs` (Doanh thu/Giao dịch × Live/Lịch sử, đúng domain/cron/ánh
  xạ mã chi nhánh đã tài liệu hoá). TỰ KIỂM TRA VIEW `V_HCRC_DOANHTHU_CHINHANH`/
  `V_HCRC_GIAODICH_CHINHANH` đã tồn tại + đủ cột qua `lib/schemaBrowser.js`
  (cùng cơ chế route POST /admin/sync-jobs dùng) TRƯỚC khi ghi bất kỳ job
  nào — dừng rõ ràng, không tạo nửa vời nếu thiếu VIEW. `jobs/scheduler.js`
  tự nạp lại job mới trong tối đa 60 giây, không cần khởi động lại ETL.
- `rp-server/scripts/seedLdtdHcrcReports.js` — tạo/cập nhật 2
  `app.ReportCatalog` (`bc-doanh-thu-ldtd`/`bc-doanh-thu-hcrc`, nguyên khối
  `DefinitionJson` đã viết ở mục 15/file hướng dẫn), gán vào menu
  `reports-kinh-doanh` (đổi được qua tham số dòng lệnh). KHÔNG tự gán quyền
  xem — vẫn cần làm ở giao diện Phân quyền.

Test bằng fakeModule (mock `../db`/`../lib/crypto`/`../lib/schemaBrowser`,
không cần SQL Server thật): xác nhận chạy 2 lần liên tiếp là idempotent
(giữ nguyên Id, chỉ UPDATE), và script ETL dừng đúng (không tạo job nào)
khi VIEW chưa tồn tại — phát hiện + sửa 1 lỗi thật lúc viết test: vòng lặp
tạo job cũ dựa vào `process.exit(1)` dừng tiến trình ngay để bỏ qua các
job còn lại, nay tách thành 2 vòng lặp (kiểm tra đủ cả 4 job trước, chỉ ghi
job sau khi kiểm tra xong tất cả) để không phụ thuộc side-effect đó. Thêm
ghi chú trỏ sang 2 script này ở Bước 2/4 của `báo cáo doanh thu cuối
ngày.md` (giữ nguyên hướng dẫn bấm tay cho ai muốn tự làm/hiểu rõ từng ô).

## 6.41 — Sửa lại kiến trúc ETL cho đúng: DSMART16 là 2 CSDL (Live + DSMART16_EOM) (docs)

Người dùng cho biết DSMART16 thật ra gồm 2 CSDL — `DSMART16` (dữ liệu
trong tháng, Live) và `DSMART16_EOM` (dữ liệu quá khứ) — nên "Cùng kỳ năm
trước"/"Tỷ lệ % LFL" của báo cáo LDTD/HCRC phải đọc từ CẢ 2 nguồn, không
phải 1 như bản trước. Viết lại `báo cáo doanh thu cuối ngày.md`:
- Bối cảnh đầu file + "Tổng quan các bước" giải thích rõ mô hình 2 CSDL,
  khớp đúng cơ chế "2 nguồn Live + Lịch sử" đã có sẵn ở
  `hướng_dẫn_báo_cáo.md` mục 11 (domain trùng nhau giữa 2 job tự ghép theo
  SourceSystem/EventDate, không ghi đè nhau).
- Bước 1: chạy VIEW trên CẢ 2 CSDL (không phải 1), thêm cảnh báo cụ thể
  `DSMART16_EOM` có thể THIẾU bảng `STOCK`/`COSTPRICE` (bảng danh mục ít
  khi lưu theo tháng quá khứ) kèm cách sửa VIEW tham chiếu chéo CSDL nếu
  cùng máy chủ.
- Bước 2 viết lại hoàn toàn: thêm bước khai 2 "Nguồn dữ liệu" (Live trỏ
  `DSMART16`, Lịch sử trỏ `DSMART16_EOM`), đổi từ 2 job thành **4 job**
  (Doanh thu × 2 nguồn, Giao dịch × 2 nguồn — mỗi cặp CÙNG domain, lịch
  chạy job Lịch sử thưa hơn vì dữ liệu đã đóng sổ), kèm 2 ảnh mới
  (`11-nguon-du-lieu-danh-sach.png`, `12-dong-bo-4-job.png`) thay ảnh danh
  sách 2-job cũ (đã xoá).
- Bước 7 (Kiểm tra) thêm bước đối chiếu số liệu "Cùng kỳ năm trước" khớp
  đúng ngày cùng kỳ khi tự chạy lại, xác nhận cả 4 job (không phải 2) đã
  chạy được. Không có thay đổi code — chỉ tài liệu.

## 6.40 — Thêm Bước 6 "Lịch gửi email" (kèm ảnh) + trả lời VIEW có tồn tại mãi mãi không (docs)

`báo cáo doanh thu cuối ngày.md`: (1) bổ sung vào cuối Bước 1 phần giải
thích VIEW là object lưu cố định trong CSDL, không tự hết hạn, luôn đọc dữ
liệu SỐNG mỗi lần job chạy (không phải bản chụp cũ) — chỉ mất nếu ai đó
chủ động `DROP VIEW`; (2) thêm Bước 6 mới "rp-user: đặt lịch gửi email tự
động" với 2 ảnh chụp giao diện thật (`09-lich-gui-email-form.png`,
`10-lich-gui-email-da-gui.png`) — form tạo lịch (tên, báo cáo, nhiều giờ
gửi/ngày, người nhận, subject, cách gửi) và danh sách sau khi bấm "Gửi
ngay" thành công; đổi "Kiểm tra" thành Bước 7. Không có thay đổi code —
chỉ tài liệu.

## 6.39 — Làm rõ "làm ngoài web" nghĩa là gì ở Bước 1 (docs)

Người dùng hỏi "làm ngoài web là làm ở đâu và như thế nào" cho bước tạo 2
VIEW SQL trên DSMART16. Bổ sung vào Bước 1 của `báo cáo doanh thu cuối
ngày.md`: giải thích rõ dùng SQL Server Management Studio/Azure Data
Studio (không phải etl-admin/rp-user), các bước cụ thể (Connect to Server,
New Query, Execute, kiểm tra ở mục Views), và lưu ý ai nên làm (DBA/IT quản
trị DSMART16 — tài khoản etl-admin dùng để đọc chỉ cần quyền SELECT trên
VIEW, không cần quyền tạo VIEW). Không có thay đổi code — chỉ tài liệu.

## 6.38 — Tách "báo cáo doanh thu cuối ngày.md" thành file độc lập, tự đủ (docs)

Theo yêu cầu người dùng ("tôi muốn riêng ra") — file không còn phải mở
`hướng_dẫn_báo_cáo.md` để lấy `DefinitionJson`: chèn nguyên khối JSON đầy
đủ (cả LDTD lẫn HCRC) trực tiếp vào Bước 4, và giải thích ngắn gọn ngay tại
chỗ lý do bắt buộc 2 domain riêng cho doanh thu/giao dịch (thay vì trỏ sang
mục 15). File giờ làm được từ đầu đến cuối độc lập; `hướng_dẫn_báo_cáo.md`
mục 11/15 chỉ còn cần thiết cho ai muốn đọc sâu kiến trúc/lý do kỹ thuật.
Không có thay đổi code — chỉ tài liệu.

## 6.37 — Liên kết mục 15 sổ tay tới file có ảnh minh hoạ (docs)

`hướng_dẫn_báo_cáo.md` mục 15 thêm callout đầu mục trỏ sang
`báo cáo doanh thu cuối ngày.md` (bản 6.36) — mục 15 giữ vai trò tài liệu
kỹ thuật đầy đủ (VIEW SQL, lý do kiến trúc, `DefinitionJson`), file kia là
bản thao tác cụ thể kèm ảnh, không lặp lại nội dung. Không có thay đổi code
— chỉ tài liệu.

## 6.36 — Sổ tay từng bước có ảnh minh hoạ: tạo báo cáo LDTD/HCRC (docs)

Thêm file mới `báo cáo doanh thu cuối ngày.md` — gộp toàn bộ quy trình từ
`hướng_dẫn_báo_cáo.md` mục 11/15 thành 1 chuỗi bước bấm cụ thể kèm 8 ảnh
chụp giao diện thật (etl-admin: Đồng bộ, Chỉ tiêu Lãnh đạo Tập đoàn/HCRC;
rp-user: Biểu mẫu, Phân quyền — thư mục `hinh-huong-dan-ldtd-hcrc/`). Ảnh
chụp từ giao diện thật (dựng tạm 2 backend giả lập trả dữ liệu mẫu để
chạy được 2 frontend mà không cần CSDL DSMART16 thật) — bố cục nút/ô nhập
đúng 100% với bản thật, chỉ số liệu hiển thị là dữ liệu mẫu minh hoạ (đã
ghi rõ trong file). Không có thay đổi code — chỉ tài liệu.

## 6.35 — Thêm hướng dẫn ETL cụ thể (VIEW/Sync Job DSMART16) cho domain báo cáo LDTD/HCRC (docs)

Bổ sung mục 15 (`hướng_dẫn_báo_cáo.md`): "Bước 1 — etl-admin" chỉ rõ 2 Sync
Job cần tạo từ DSMART16 (domain `doanhthu_chinhanh` + `giaodich_chinhanh`),
kèm phát hiện và giải thích 1 rủi ro kỹ thuật thật: `dwh.ReportFacts` MERGE
GHI ĐÈ NGUYÊN CỘT Measures khi trùng khoá (`etl/lib/upsert.js`) — nếu gộp
doanh thu (`DSTK_INFO`, khoá `STK_ID`) và giao dịch (`TRANSHDR`, khoá
`BU_ID`) vào CHUNG 1 domain bằng 2 job riêng, job chạy sau sẽ xoá mất
Measures của job chạy trước (lỗi âm thầm, không cảnh báo). Sửa lại
`DefinitionJson` LDTD/HCRC ở mục 15: tách khối `current`/`lastYear` (doanh
thu) khỏi khối MỚI `currentGD`/`lastYearGD` (giao dịch, domain riêng), thay
mọi công thức `current.measures.giaoDich` bằng `currentGD.measures.SoGiaoDich`.
Mở rộng VIEW doanh thu ở mục 11 b) — JOIN thêm `COSTPRICE` (Lãi gộp) và
`STOCK` (Diện tích/Chain) vào cùng 1 VIEW, cờ rõ 2 điểm CHƯA XÁC NHẬN cần
DBA DSMART16 đối chiếu trước khi tin số liệu thật (định dạng `COSTPRICE.MEC_YM`,
giá trị `STOCK.STYPE_ID` ứng với MART/MINIMART). Không có thay đổi code —
chỉ tài liệu.

## 6.34 — Thêm hướng dẫn cấu hình báo cáo LDTD/HCRC vào sổ tay (docs)

Bổ sung mục 15 vào `hướng_dẫn_báo_cáo.md`: 2 `DefinitionJson` mẫu đầy đủ cho
"Báo cáo nhanh doanh thu - Lãnh đạo Tập đoàn" và "- HCRC", khớp đúng bố cục
cột trong PDF mẫu người dùng gửi (Diện tích; Doanh thu Chỉ tiêu/Thực đạt/Tỉ
lệ đạt/Cùng kỳ 2025/Tỷ lệ % LFL; Lãi gộp Tỷ lệ/Giá trị; Giao dịch Chỉ tiêu/
Thực đạt/Tỷ lệ đạt/Cùng kỳ 2025/Tỷ lệ % LFL; Trung bình GD; Doanh thu/m2;
groupBy MART/MINIMART) — cả 2 dùng `sourceType: "directDb"` (lấy trực tiếp
từ Data Warehouse, không qua API Server realtime), chung 1 domain thực đạt
nhưng khác `targetDomain` (`sales-targets-ldtd`/`sales-targets-hcrc`, đã
khoá cứng từ bản 6.33). Không có thay đổi code — chỉ tài liệu.

## 6.33 — Khoá cứng Domain theo trang cho 2 trang Nhập chỉ tiêu LDTD/HCRC (etl)

Người dùng gửi PDF "Báo cáo nhanh doanh thu" (mẫu có sẵn ở `hướng_dẫn_báo_cáo.md` mục 1) và hỏi liệu code hiện tại có đúng mô hình "1 format báo cáo chung, chỉ khác import target" giữa LDTD và HCRC không. Xác nhận kiến trúc report composite (`isTarget`/`targetDomain` độc lập với domain của khối `current`) đã hỗ trợ đúng mô hình này từ trước — nhưng phát hiện lỗ hổng thực sự ở 2 trang ETL vừa tách (6.30): cả 2 đều dùng chung 1 ô "Domain" gõ tự do giống hệt nhau, dễ khiến 2 nhóm LDTD/HCRC vô tình gõ trùng domain rồi ghi đè chỉ tiêu của nhau (`dwh.SalesTargets` khoá duy nhất theo `Domain+EntityCode+PeriodMonth`).

- `etl/routes/admin/salesTargets.js`: `createSalesTargetsRouter(menuCode)` → `createSalesTargetsRouter(menuCode, domain)` — Domain nay là THAM SỐ khoá cứng, không đọc từ `req.query`/`req.body` nữa; mọi GET/PUT/POST đều ép dùng đúng domain đã khoá.
- `etl/server.js`: mount 2 route với 2 domain cố định — `sales-targets-corp` → `sales-targets-ldtd`, `sales-targets-hcrc` → `sales-targets-hcrc`.
- `etl-admin/src/pages/SalesTargetsPage.jsx`: bỏ hẳn ô nhập "Domain" (cả form nhập file, form sửa 1 dòng, và ô lọc) — không còn gì để gõ nhầm.
- `etl/README.md` + `hướng_dẫn_báo_cáo.md` mục 1: cập nhật — khi cấu hình báo cáo composite cho LDTD/HCRC, `targetDomain` phải trỏ đúng 1 trong 2 domain khoá cứng trên (không cần trùng domain của khối `current`/`lastYear` — 2 báo cáo vẫn dùng chung số liệu thực đạt thật).

## 6.32 — Đổi tên vai trò target_importer_corp -> target_importer_LDTD (etl)

Theo yêu cầu người dùng, đổi Code vai trò `target_importer_corp` (seed ở 6.31) thành `target_importer_LDTD` (viết tắt "Lãnh Đạo Tập Đoàn") cho dễ phân biệt với `target_importer_hcrc`. `etl-db/schema.sql` UPDATE Code (không xoá+tạo lại) để giữ nguyên mọi `AdminUserRoles`/`RoleMenuAccess` đã gán nếu DB đã chạy qua bản 6.31 — an toàn chạy lại nhiều lần.

## 6.31 — Sửa 6.30: 2 vai trò MỚI riêng biệt thay vì gộp chung target_importer (etl)

Người dùng làm rõ ngay sau 6.30: 2 báo cáo "Lãnh đạo Tập đoàn"/"HCRC" **không được cùng IT quản lý** — tức không tự động gộp quyền vào vai trò `target_importer` cũ (hay bất kỳ vai trò IT nào đang có), phải là 2 vai trò MỚI HOÀN TOÀN, mỗi vai trò CHỈ gắn đúng 1 trong 2 trang.

- `etl-db/schema.sql`: bỏ hẳn cách làm cũ ở 6.30 (tự động copy quyền `sales-targets` sang CẢ 2 MenuCode mới cho MỌI vai trò đang có) — thay bằng: xoá sạch `RoleMenuAccess` còn giữ MenuCode `sales-targets` đã hết hiệu lực, seed 2 vai trò MỚI `target_importer_corp` (CHỈ `sales-targets-corp`) và `target_importer_hcrc` (CHỈ `sales-targets-hcrc`).
- Vai trò `target_importer` cũ GIỮ NGUYÊN trong `admin.Roles` (không xoá, tránh vỡ tài khoản đang gán) nhưng từ nay KHÔNG còn menu nào — nếu có tài khoản thật đang gán vai trò này, admin cần chủ động vào "Vai trò" gán lại thủ công sang đúng 1 trong 2 vai trò mới theo đúng người phụ trách từng báo cáo (không có cơ sở để hệ thống tự đoán).
- `etl/README.md` cập nhật mô tả 2 vai trò mới.

## 6.30 — Tách "Nhập chỉ tiêu" thành 2 trang độc lập: Lãnh đạo Tập đoàn / HCRC (etl)

Theo yêu cầu: đọc code 2 hệ thống báo cáo ngoài (`ttbc-api.hcrc.vn`, `ttbc.hcrc.vn` — cổng báo cáo nội bộ tên "HCRC Reports", CSDL riêng `BRG_TrungTamBaoCao`, không liên quan kỹ thuật tới `HCRC_DWH` của hệ này) để tìm cấu trúc 2 báo cáo "Lãnh đạo Tập đoàn" và "HCRC cuối ngày". Xác nhận đây là hệ thống báo cáo ĐỘNG (report/cột chỉ tiêu cấu hình bằng dữ liệu trong CSDL, không hardcode trong code đã build) nên không lấy được cấu trúc cột cụ thể từ code — theo xác nhận của người dùng, tách trang hiện có mà KHÔNG đổi cấu trúc nhập liệu (vẫn nhập chỉ tiêu tự do qua cột Exci trong file, domain gõ tay như cũ):

- Trang "Nhập chỉ tiêu" cũ (1 trang, MenuCode `sales-targets`) tách thành **2 trang độc lập**: "Chỉ tiêu Lãnh đạo Tập đoàn" (`sales-targets-corp`) và "Chỉ tiêu HCRC" (`sales-targets-hcrc`) — 2 MenuCode riêng để giao quyền tách bạch cho 2 nhóm khác nhau quản lý/nhập liệu (theo xác nhận của người dùng).
- Backend: `etl/routes/admin/salesTargets.js` đổi thành factory `createSalesTargetsRouter(menuCode)` — logic HỆT NHAU (cùng bảng `dwh.SalesTargets`, cùng cách parse Excel), mount 2 lần ở `etl/server.js` dưới `/admin/sales-targets-corp` và `/admin/sales-targets-hcrc`.
- Frontend: `etl-admin/src/pages/SalesTargetsPage.jsx` đổi thành component dùng chung, nhận props `menuCode`/`apiBase`/`title` — `App.jsx` render 2 route riêng, `Layout.jsx` thêm 2 mục nav riêng thay 1 mục cũ.
- `etl-db/schema.sql`: migrate MỌI vai trò đang có MenuCode `sales-targets` (kể cả vai trò tuỳ chỉnh do admin tự tạo, không chỉ `target_importer`) sang CẢ 2 MenuCode mới với đúng `CanEdit` cũ (an toàn nhất — admin tự vào "Vai trò" bớt lại 1 trong 2 nếu muốn tách hẳn quyền theo đúng người phụ trách từng báo cáo).
- `etl/routes/admin/roles.js` MENU_CATALOG cập nhật theo 2 MenuCode mới; `etl/README.md` cập nhật tài liệu.

## 6.29 — Ẩn mật khẩu khi đổi + tách "Tự đổi mật khẩu" ra khỏi "Admin đặt lại" (etl-admin, api-admin, rp-user)

Rà soát theo yêu cầu: (1) khi đổi mật khẩu, ô nhập lại hiện chữ thô, rủi ro lộ mật khẩu cho người đứng cạnh/camera màn hình; (2) kiểm tra cả 3 hệ đã tách rõ "tự đổi mật khẩu của chính mình" (màn hình cá nhân) khỏi "Admin đặt lại mật khẩu cho người khác" (phần quản trị) chưa.

- **(Cao)** `etl-admin` + `api-admin`: trang "Phân quyền"/"Tài khoản quản trị" TRƯỚC ĐÂY dùng `window.prompt()` để "Đặt lại mật khẩu" cho người khác — hộp thoại trình duyệt LUÔN hiện chữ thô, không cách nào ẩn, cũng không có bước xác nhận. Thay bằng modal đúng chuẩn: ô nhập ẩn mặc định (`PasswordInput` — component mới, có nút 👁 hiện/ẩn tạm thời) + ô "Xác nhận mật khẩu mới" (chặn gõ nhầm) + thông báo lỗi hiển thị tại chỗ thay vì `alert()`.
- **(Cao)** Cả 3 hệ (etl-admin/api-admin/rp-user): TRƯỚC ĐÂY không có nơi nào cho một tài khoản tự đổi mật khẩu của CHÍNH MÌNH — chỉ có "Admin đặt lại cho người khác" (không cần biết mật khẩu cũ, chỉ Admin hệ thống mới bấm được). Thêm trang mới **"Tài khoản của tôi"** (link ở chân sidebar, mọi tài khoản đã đăng nhập đều thấy, không cần quyền menu nào) với form "Đổi mật khẩu" — bắt buộc nhập đúng mật khẩu hiện tại, có ô xác nhận, đổi xong tự đăng xuất để đăng nhập lại bằng mật khẩu mới (nhất quán với hành vi "đổi mật khẩu → thu hồi phiên" đã có).
  - Backend: `POST /admin/auth/me/change-password` (etl, api-server), `POST /api/me/change-password` (rp-server, chỉ áp dụng tài khoản `AuthSource='local'` — tài khoản HCRC Workspace không có mật khẩu local để đổi ở đây).
- **(Trung bình)** `rp-user`: modal "Đặt lại mật khẩu" (trang Người dùng, Admin đặt cho người khác) đã ẩn mật khẩu từ trước nhưng thiếu ô xác nhận — bổ sung ô "Xác nhận mật khẩu mới" cùng mẫu 2 hệ kia.
- Nâng cấp UI/UX đi kèm: mọi ô nhập mật khẩu còn lại (tạo tài khoản mới, đổi "Nguồn xác thực" sang Local) đổi từ `<input type="password">` trần sang `PasswordInput` (có nút hiện/ẩn) cho nhất quán toàn hệ thống; `RequireMenuAccess` (rp-user) hỗ trợ route không gắn menuCode nào (chỉ đòi đăng nhập) để phục vụ trang "Tài khoản của tôi".

## 6.28 — Hoàn thiện tạo tài khoản + phân quyền theo nhóm (etl-admin, api-admin, rp-user)

Rà soát riêng tính đầy đủ của "tạo tài khoản" + "phân quyền theo nhóm" (3 agent, mỗi hệ thống 1 agent, đối chiếu từng trang ↔ MenuCode ↔ enforce backend ↔ UI). Kết luận chung: nền tảng RBAC ở cả 3 hệ thống đã đầy đủ và đúng (không trang nào thiếu MenuCode, không "quyền ảo"), nhưng phát hiện + xử lý các khoảng trống cụ thể sau:

- **(Cao)** `rp-user`: thêm nút "Đặt lại mật khẩu" cho tài khoản `local` trong trang Người dùng — backend `POST /system/users/:id/reset-password` đã sẵn sàng từ trước nhưng chưa có UI nào gọi tới, trước đây admin phải đi vòng qua "Nguồn xác thực" mới đặt lại được.
- **(Trung bình)** `rp-server`: thêm route `GET /system/roles/report-catalog` (chỉ cần menu `system-permissions`, mirror `domains-catalog`) — trước đây trang "Vai trò" phần gán quyền báo cáo gọi `GET /system/report-catalog` (đòi thêm menu `system-report-catalog` khác), khiến 1 vai trò chỉ được giao đúng menu `system-permissions` (đúng kịch bản "trưởng nhóm không phải Admin hệ thống" mà hệ thống đã thiết kế) không tải được danh sách báo cáo để tick chọn.
- **(Thấp)** Thêm UI "Sửa tên vai trò" ở cả 3 hệ thống (etl-admin/api-admin/rp-user) — route `PUT /roles/:id` đã có sẵn nhưng chưa có nút nào gọi tới; thiếu nút này khiến muốn đổi tên phải Xoá+Tạo lại (mất quyền đã gán do cascade).
- **(Thấp)** `etl-admin` + `api-admin`: sửa điều kiện hiện nút "Đặt lại mật khẩu" từ `canManage` (=`canEdit('users')`) sang `isSystemRole` cho khớp đúng yêu cầu backend `requireSystemRoleActor` — trước đây nút vẫn hiện cho nhóm quyền "chỉ quản lý tài khoản thường" dù bấm chắc chắn bị từ chối.
- **(Thấp)** `etl-admin`: làm rõ trực quan trong màn "Gán quyền" rằng dòng "Ánh xạ mã chi nhánh" không có mức "chỉ xem" (thay ô checkbox Xem bằng dấu "—" + chú thích) — trang này bắt buộc quyền Sửa cho mọi thao tác kể cả xem, trước đây vẽ y hệt 8 dòng khác nên admin dễ tưởng đã cấp quyền xem thành công.

## 6.27 — Xử lý các mục còn lại từ đợt rà soát lại (Thấp)

Tiếp tục xử lý 4 mục "để bạn quyết định" chưa làm ở 6.26:

- `api-server/routes/admin/{realtimeEndpoints,realtimeWriteEndpoints}.js`:
  đặt tường minh `requireMenuAccess(...)` cho `POST /:endpoint/check-schema`
  (đọc-only, khớp quy ước `etl/routes/admin/syncJobs.js:check-schema`) —
  không đổi hành vi thực tế (router-level đã áp cùng quyền), chỉ rõ ràng
  hoá chủ đích trong code.
- `etl/routes/admin/auditLog.js`, `api-server/routes/admin/{auditLog,history}.js`,
  `rp-server/routes/auditLog.js`: validate `from`/`to` là ngày hợp lệ trước
  khi đưa vào SQL Server — trả 400 rõ ràng thay vì 500 thô khi nhập sai
  định dạng.
- `rp-user` `UsersPage.jsx`: ẩn nút "Đồng bộ tài khoản" khi không phải
  Admin hệ thống (route `POST /sync` đã yêu cầu `requireSystemRoleActor`
  từ trước, giờ giao diện khớp).
- `rp-user` `HcrcWorkspaceSettingsPage.jsx`: ẩn form "Lưu cấu hình" + nút
  "Kiểm tra kết nối" khi không phải Admin hệ thống (route `PUT /`/
  `POST /test-connection` đã yêu cầu `requireSystemRoleActor` từ trước),
  chỉ hiện thông tin đọc-only (Base URL, bật/tắt) cho người chỉ được cấp
  quyền xem.

**Không xử lý** (khác 4 mục trên — cân nhắc kỹ, quyết định KHÔNG vá): kênh
side-channel thời gian phản hồi giữa so khớp mật khẩu cục bộ (bcrypt, có
thời lượng khá ổn định) và gọi mạng sang HCRC Workspace (thời lượng biến
thiên nhiều hơn, thường CHẬM HƠN) khi đăng nhập — về lý thuyết có thể giúp
kẻ tấn công đoán được 1 username đang dùng `AuthSource` nào (KHÔNG lộ mật
khẩu). Đây là hệ quả kiến trúc cố hữu (một nhánh phải gọi API ngoài, nhánh
kia không) — vá triệt để đòi hỏi làm chậm giả tạo TOÀN BỘ lượt đăng nhập
local để khớp độ trễ mạng biến thiên của HCRC Workspace, đánh đổi UX thật
cho mọi người dùng chỉ để giảm 1 rủi ro Thấp/Info trên hệ thống nội bộ
(không lộ mật khẩu, không có tấn công từ Internet công khai). Chấp nhận rủi
ro còn lại thay vì vá vội dễ gây lỗi mới.

## 6.26 — Sửa 2 hồi quy giao diện phát hiện qua rà soát lại sau 6.25

Sau khi merge 6.25, chạy lại đợt rà soát 6 agent (xác minh từng fix + quét
lại toàn diện) — 2 lỗ hổng phân quyền/mạng đã xác nhận đúng 100%, phát hiện
thêm 2 hồi quy giao diện trực tiếp do chính các fix ở 6.25 gây ra (đã sửa
ngay vì rõ ràng, không cần thảo luận thêm — cùng mẫu với các nút khác đã có
sẵn trong chính file đó):

- `rp-user/src/modules/system/permissions/UsersPage.jsx`: nút "Khoá/Cho
  phép kết nối" không ẩn khi tài khoản không phải Admin hệ thống — sau khi
  6.25 thêm `requireSystemRoleActor` cho `PUT /:id`, một tài khoản chỉ được
  giao quyền "quản lý người dùng" bấm nút này sẽ gặp lỗi 403 thay vì nút bị
  ẩn đi (giống 2 nút "Nguồn xác thực"/"Đặt lại 2FA" cạnh bên đã ẩn đúng).
- `etl-admin/src/pages/LoginPage.jsx` + `api-admin/src/pages/LoginPage.jsx`:
  fallback sau đăng nhập hard-code về `/dashboard`/`/consumers` thay vì `/`
  (nơi `IndexRedirect` tự chọn đúng trang theo `LANDING_ORDER`) — tài khoản
  chỉ có 1 quyền hẹp vẫn bị đưa nhầm trang dù `LANDING_ORDER` đã sửa đủ ở
  6.25. Tiện thể phát hiện `api-admin/src/App.jsx`'s `LANDING_ORDER` cũng
  thiếu `realtime-endpoints`/`realtime-write-endpoints`/`report-catalog`/
  `roles` (cùng lỗi đã sửa cho etl-admin ở 6.25 nhưng bỏ sót api-admin) —
  sửa luôn.

Các phát hiện KHÁC từ đợt rà soát lại (không phải hồi quy, giữ nguyên chờ
thảo luận, chưa sửa): `api-server` `POST /:endpoint/check-schema`
(realtime-endpoints/realtime-write-endpoints) chỉ yêu cầu quyền xem, không
yêu cầu quyền sửa (Thấp, không có tác động CRUD thật — chỉ đọc + ghi audit
log); `etl/routes/admin/auditLog.js` tham số `from`/`to` chưa validate định
dạng ngày (Thấp, lỗi 500 thô thay vì 400 sạch khi nhập sai); nút "Đồng bộ
tài khoản"/trang "Xác thực HCRC Workspace" (rp-user) có cùng kiểu chưa ẩn
nút theo quyền nhưng đã tồn tại từ trước, không phải hồi quy của 6.25; 1
khác biệt độ trễ nhỏ giữa so khớp bcrypt cục bộ và gọi mạng HCRC Workspace
có thể tiết lộ `AuthSource` của 1 username (không tiết lộ mật khẩu).

Không phát hiện thêm SQL injection/XSS, và toàn bộ 18/18 hạng mục còn lại
của 6.25 (2 High + 6 Medium khác + 10 Low khác) đều xác nhận ĐÚNG như mô
tả qua 6 agent độc lập, không có hồi quy nào khác.

## 6.25 — Vá lỗ hổng phân quyền + cứng hoá bảo mật (theo báo cáo rà soát 6 agent)

Sau đợt rà soát chuyên sâu nghiệp vụ + an ninh (6 agent: 3 chức năng theo
hệ thống + 3 an ninh SQLi/XSS/authN-brute-force/mạng-TLS), người dùng đồng
ý triển khai toàn bộ đề xuất. Không tìm thấy SQL injection/XSS khai thác
được ở bất kỳ đâu — các thay đổi dưới đây chủ yếu vá lỗ hổng phân quyền
(authorization) và cứng hoá cấu hình mạng/transport.

**Cao (High) — vá ngay:**
- `POST /:id/reset-password` (etl/api-server/rp-server) thiếu
  `requireSystemRoleActor` — một tài khoản chỉ được giao "quản lý tài
  khoản" (không phải vai trò hệ thống) có thể đặt lại mật khẩu của CHÍNH
  tài khoản Admin hệ thống rồi tự đăng ký 2FA (nếu nạn nhân chưa bật) để
  chiếm quyền. Thêm `requireSystemRoleActor` vào cả 3 service (mirror
  `/:id/reset-2fa`), kèm giới hạn mật khẩu tối thiểu 8 ký tự.
- `ExternalApiConnections` (rp-server) không ép `https://` — API key/mật
  khẩu Basic-Auth/OAuth2 client secret của đối tác bên ngoài có thể truyền
  cleartext nếu cấu hình nhầm `http://`. Ép `https://` cho các `authType`
  mang bí mật trên dây, kiểm tra lại ở cả lúc lưu VÀ mỗi lần nạp kết nối.

**Trung bình (Medium):**
- `roles.js` (etl/api-server): CRUD vai trò (tạo/sửa/xoá) chỉ yêu cầu
  quyền XEM (`requireMenuAccess`), không yêu cầu quyền SỬA — một admin cấp
  "chỉ xem trang Vai trò" vô tình cấp luôn CRUD đầy đủ. Thêm
  `requireMenuEdit('roles')` cho 3 route ghi, ẩn nút Thêm/Xoá trên giao
  diện theo `canEdit('roles')`.
- Gán vai trò hệ thống giữa phiên cho tài khoản chưa bật 2FA (etl/
  api-server): `PUT /:id/roles` giờ LUÔN thu hồi phiên hiện có (mirror
  rp-server) — buộc đăng nhập lại, gặp màn hình bắt buộc đăng ký 2FA nếu
  vai trò mới có `IsSystemRole=1`.
- Ngưỡng dò mật khẩu cho tài khoản vai trò hệ thống (`ADMIN_PROFILE`) giảm
  từ 50 lần/2 phút (~25/phút) xuống 8 lần/2 phút (~4/phút) — vẫn đủ rộng
  cho người gõ nhầm thật, giảm ~6 lần tốc độ dò tối đa cho tài khoản giá
  trị cao nhất.
- Pool CSDL cố định (`etl/db.js`, `rp-server/db.js`, `api-server/db.js`)
  đổi mặc định `encrypt=true`, `trustServerCertificate=false` (trước đây
  ngược lại) — **operator cần kiểm tra `.env` thật đã set đúng biến `
  *_ENCRYPT`/`*_TRUST_CERT` trước khi nâng cấp**, xem mục 15 sổ tay triển
  khai.
- `deploy/serve-static.js` (topology PM2-only) trước đây không gửi bất kỳ
  header bảo mật nào — thêm CSP/X-Frame-Options/X-Content-Type-Options/
  Referrer-Policy, mirror bộ đã có ở `nginx.conf`.
- Xung đột `NODE_ENV=production` (luôn bật cookie Secure) với topology
  PM2-only (không TLS) — thêm escape hatch
  `ADMIN_COOKIE_FORCE_INSECURE`/`COOKIE_FORCE_INSECURE`, CHỈ dùng khi chắc
  chắn không có Nginx/TLS phía trước.
- `branchCodeMap.js` (etl): sửa lỗi không thể kích hoạt lại 1 dòng ánh xạ
  đã đóng qua form sửa đơn (thêm cờ `preserveTrangThaiIfUnspecified`,
  mirror `salesTargetsImport.js`).

**Thấp (Low) — dọn dần, cứng hoá phòng thủ chiều sâu:** `rp-server`
`PUT /:id` (khoá/mở khoá người dùng) thêm `requireSystemRoleActor`; JWT
secret bắt buộc tối thiểu 32 ký tự (cả 3 service); `topSellingZeroStockRunner.js`
thêm whitelist ký tự cho `measureKey`; `nginx.conf` thêm `server_tokens off`
+ HSTS tường minh ở 3 domain giao diện tĩnh; `SalesTargetsPage.jsx`
(etl-admin) ẩn form nhập/sửa khi chỉ có quyền xem; `dataSources.js`/
`syncJobs.js` (etl+api-server) thêm validate trường bắt buộc ở PUT (khớp
POST); `log.js`/`auditLog.js`/`history.js` (cả 3 service) chặn
`page`/`pageSize` âm/NaN; `LANDING_ORDER` (etl-admin) bổ sung đủ
roles/log/audit-log/branch-code-map; `adhocReports.js` (rp-server)
`PUT /saved/:id` kiểm tra lại quyền domain giống `POST /saved`.

## 6.24 — Hiện số phiên bản đang chạy cho cả 3 giao diện tĩnh (etl-admin, api-admin, rp-user)

Người dùng báo: chạy PM2 không thấy version ở đâu cả — IT không biết máy
chủ đang chạy đúng bản mới nhất hay chưa sau khi cập nhật. Khác 3 service
backend (đã có `GET /health`/`/api/v1/health` trả `version`, dù đọc từ
`package.json` riêng, lệch với `VERSION.md`), 3 giao diện tĩnh trước đây
KHÔNG hiện version ở BẤT KỲ đâu — không sidebar, không log PM2, không route
nào kiểm tra được.

- **`etl-admin/vite.config.js`, `api-admin/vite.config.js`,
  `rp-user/vite.config.js`** — đọc số phiên bản MỚI NHẤT thẳng từ
  `VERSION.md` gốc repo (dòng `## X.Y` đầu tiên) ngay lúc `npm run build`,
  nhúng vào bundle qua `define: { __APP_VERSION__ }` — không cần đồng bộ
  tay `package.json` (vẫn giữ nguyên `0.1.0` cũ, không dùng làm nguồn version
  nữa), không lệch với changelog vì cùng đọc 1 file.
- **`components/Layout.jsx`** (cả 3 giao diện) — thêm dòng `v{__APP_VERSION__}`
  ở sidebar-footer (cạnh username/nút đăng xuất) — mở web lên là thấy ngay,
  không cần hỏi ai.
- **`deploy/serve-static.js`** — đọc lại `VERSION.md` (tương tự, cùng regex)
  lúc khởi động: in kèm vào log (`serve-static: ... (bản 6.24)` — thấy ngay
  qua `pm2 logs`/`pm2 list`, không cần mở web) + route MỚI `GET /__version`
  trả JSON `{version, distDir}` (không đi qua SPA fallback hay proxy
  backend) — kiểm tra được bằng `curl`, kể cả sau Nginx (path không đổi tuỳ
  mô hình triển khai).
- **`deploy/Hướng dẫn triển khai PM2.md`, `deploy/Hướng dẫn triển khai sử
  dụng PM2 + Nginx.md`** — thêm hướng dẫn 3 cách kiểm tra version (sidebar/
  `pm2 logs`/`curl .../__version`) vào mục "Kiểm tra sau triển khai" và mục
  "Cập nhật lên phiên bản mới" (xác nhận version đã đổi sau khi
  `npm run build` + `pm2 reload` — chưa đổi thường là dấu hiệu thiếu 1 bước
  build hoặc `git pull` chưa lấy commit mới).
- **Test**: build sạch cả 3 giao diện, xác nhận số `6.24` (đọc tại thời
  điểm build) THẬT SỰ nằm trong file JS đã build (`grep` trên `dist/`,
  không chỉ tin code không lỗi); chạy `serve-static.js` cục bộ xác nhận
  `GET /__version` trả đúng JSON và `GET /` vẫn phục vụ `index.html` bình
  thường (route mới không ảnh hưởng SPA fallback/proxy có sẵn).

## 6.23 — Nhóm quyền (RBAC) đầy đủ + CRUD tài khoản cho etl-admin và api-admin

Yêu cầu: `etl-admin`, `api-admin` chưa có phân quyền theo nhóm quyền (chỉ 2-3
`Role` cố định trong code) và thiếu thao tác sửa/khoá/mở khoá tài khoản
(`api-admin` còn phải tạo/sửa tài khoản bằng cách chạy `scripts/seedAdmin.js`
tay). `rp-server` đã có sẵn mô hình này đầy đủ — port nguyên kiến trúc đó
sang 2 hệ còn lại, GIỮ NGUYÊN 100% hành vi của mọi tài khoản hiện có (migrate
tự động, không cần thao tác tay) và thêm 1 khả năng mới mà `rp-server` không
có: phân biệt "chỉ xem" và "xem + sửa" theo TỪNG trang (`CanEdit`), để giữ
đúng vai trò `viewer` cũ (etl/api-server có `viewer`, `rp-server` không cần
vì quyền menu ở đó vốn nhị phân thấy/không thấy). Quyết định đã chốt: KHÔNG
xoá cứng tài khoản ở đâu cả (chỉ khoá `IsActive=0`, giữ tham chiếu
`AuditLog`), xây nhóm quyền ĐỘNG giống hệt `rp-server` (admin tự tạo vai trò
tuỳ ý, gán quyền theo trang) cho cả `etl` và `api-server`.

- **`etl-db/schema.sql`, `api-db/schema.sql`** — `admin.Roles`
  (`Code`/`Name`/`IsSystemRole`), `admin.AdminUserRoles` (nhiều-nhiều),
  `admin.RoleMenuAccess` (`RoleId`/`MenuCode`/`CanEdit`). Seed + migrate
  idempotent: tạo lại đúng vai trò cũ (`admin` IsSystemRole=1, `viewer`,
  riêng `etl` thêm `target_importer`) với ĐÚNG quyền hiện có hôm nay (viewer
  etl bị chặn `branch-code-map`+`sales-targets` như cũ; viewer api-server
  xem được cả 10 trang như cũ; `target_importer` chỉ `sales-targets`, có
  sửa), gán lại mọi tài khoản hiện có vào đúng vai trò theo cột `Role` cũ.
  Cột `AdminUsers.Role` GIỮ NGUYÊN (không xoá) — chỉ còn nhãn hiển thị/lịch
  sử, không còn quyết định quyền.
- **`etl/lib/adminPermissions.js`, `api-server/lib/adminPermissions.js`**
  (mới, mirror `rp-server/lib/permissions.js`) — `getAdminContext()` tra
  `isSystemRole` + `menuAccess` (Map menuCode -> `{canEdit}`, MAX(CanEdit)
  khi 1 tài khoản giữ nhiều vai trò cấp khác nhau cho cùng trang), cache bộ
  nhớ TTL 60 giây + `invalidateUser`/`invalidateAll`. `requireMenuAccess`/
  `requireMenuEdit(menuCode)` thay toàn bộ `requireAdminRole`/
  `blockTargetImporter`/`requireTargetImporterRole` cũ. `requireSystemRoleActor`
  (mirror `rp-server/lib/auth.js`) chặn đường leo thang: gán vai trò/đặt lại
  2FA hộ người khác cần vai trò hệ thống THẬT, chặt hơn quyền sửa `users`
  thông thường (menu `users` giờ CÓ THỂ giao cho 1 tài khoản không phải vai
  trò hệ thống — lần đầu tiên có thể "giao quản lý tài khoản" mà không cấp
  toàn quyền).
- **`etl/lib/adminAuth.js`, `api-server/lib/adminAuth.js`** — bỏ nhúng
  `role` vào JWT (quyền tra tươi mỗi request thay vì đóng băng lúc đăng
  nhập, giống `rp-server` đã làm) — ép 2FA lúc đăng nhập và chọn ngưỡng
  rate-limit nay theo `isSystemRole` thay `role === 'admin'`.
- **Route guard** — đổi TOÀN BỘ route ghi (POST/PUT/DELETE) và route đọc có
  gate riêng sang `requireMenuAccess`/`requireMenuEdit(menuCode)` đúng theo
  từng trang (`data-sources`, `sync-jobs`, `branch-code-map` — edit-only kể
  cả xem, giữ đúng hành vi cũ —, `sales-targets`, `log`, `audit-log`,
  `dashboard` bên `etl`; `consumers`, `data-sources`, `realtime-endpoints`,
  `realtime-write-endpoints`, `report-catalog`, `live`, `history`, `stats`,
  `audit-log` bên `api-server` — MỚI, trước đây các trang đọc này không có
  gate riêng, ai đăng nhập cũng thấy hết).
- **`etl/routes/admin/roles.js`, `api-server/routes/admin/roles.js`** (mới,
  mirror `rp-server/routes/roles.js`) — CRUD `admin.Roles` (chặn sửa/xoá vai
  trò hệ thống), `GET /menu-catalog` (danh sách trang hợp lệ để giao diện tự
  vẽ checkbox), `GET /:id/access`, `PUT /:id/menu-access` (transaction xoá-
  ghi-lại, chỉ vai trò hệ thống thật).
- **`etl/routes/admin/users.js`** — thêm `PUT /:id/roles` (gán vai trò, bỏ
  dropdown Role cố định khỏi form tạo). **`api-server/routes/admin/users.js`**
  — viết gần như mới: `POST /` (tạo), `PUT /:id` (sửa tên + khoá/mở khoá,
  TRƯỚC ĐÂY KHÔNG CÓ), `PUT /:id/roles`, `POST /:id/reset-password` (TRƯỚC
  ĐÂY KHÔNG CÓ), giữ `POST /:id/reset-2fa` nhưng đổi điều kiện sang
  `isSystemRole` của tài khoản đích thay vì `Role !== 'admin'`.
- **`etl/scripts/seedAdmin.js`, `api-server/scripts/seedAdmin.js`** — ngoài
  ghi cột `Role` (giữ tương thích ngược), nay tra `admin.Roles` theo `Code`
  và ghi thêm `admin.AdminUserRoles` — tài khoản tạo qua script vẫn có đúng
  quyền ngay từ đầu.
- **Frontend** (`etl-admin`, `api-admin`) — `AuthContext.jsx` đổi
  `isAdmin`/`isTargetImporter` cố định thành `isSystemRole` + `can(menuCode)`/
  `canEdit(menuCode)` tra theo `menuAccess` server trả về; `Layout.jsx` lọc
  nav theo quyền thật thay danh sách cố định; trang "Vai trò" MỚI
  (`RolesPage.jsx`, mirror `rp-user`, đơn giản hơn — chỉ 1 lớp quyền menu
  kèm `CanEdit`, không có report/domain access); `UsersPage.jsx` (etl)/
  `AdminUsersPage.jsx` (api-admin, viết gần như mới) — thêm form sửa tên/
  khoá-mở khoá, modal "Gán vai trò" (chỉ vai trò hệ thống thấy nút), giữ
  "Đặt lại mật khẩu"/"Đặt lại 2FA" (điều kiện theo `isSystemRole` của tài
  khoản đích).
- **Test**: 24 assertion (`fakeModule`) xác nhận `adminPermissions.js` (cache
  TTL, `invalidateUser`/`invalidateAll`, MAX(CanEdit) khi nhiều vai trò, cả 4
  middleware, `isSystemRoleForRateLimit`) đúng hệt nhau ở `etl` VÀ
  `api-server`; 28 assertion riêng cho `routes/admin/roles.js` (chặn sửa/xoá
  vai trò hệ thống, transaction gán quyền) và `PUT /users/:id/roles` ở cả 2
  service; `npm run build` sạch `etl-admin` + `api-admin`.
- Tài khoản hiện có KHÔNG bị ảnh hưởng khi deploy: chạy lại `schema.sql` là
  đủ, mọi tài khoản tự động có đúng vai trò/quyền như trước — không cần đăng
  xuất/đăng nhập lại, không cần thao tác tay nào.

## 6.22 — "Báo cáo tự do" (self-service, hướng Power BI) — người dùng cuối tự dựng bảng/biểu đồ, không cần admin tạo sẵn

Yêu cầu mới: bên cạnh Danh mục báo cáo hiện có (admin định nghĩa sẵn cột/
lọc/nguồn trong `app.ReportCatalog`), thêm MỘT LỚP song song để người dùng
cuối tự chọn Domain (dữ liệu đã đồng bộ vào Data Warehouse) + tự chọn
trường nhóm (dimensions) + số liệu tổng hợp (measures, kèm hàm tổng hợp) +
tự chọn kiểu hiển thị (bảng/bảng chéo/biểu đồ) — tái dùng nguyên
`ReportBody`/`ReportChart`/`PivotTable` đã có (mục 8-9 `hướng_dẫn_báo_cáo.md`),
không viết lại UI hiển thị.

Khác MỌI tính năng `DefinitionJson`/composite trước đây (chỉ admin cấu
hình được — nguồn tin cậy kiểm soát): input domain/field/hàm tổng hợp ở
đây tới THẲNG từ request của người dùng cuối bất kỳ — mọi field/domain
được re-validate lại đúng ngay trong `lib/adhocReportEngine.js` (không chỉ
ở route), không ghép chuỗi người dùng gửi lên vào SQL dưới bất kỳ hình
thức nào.

- **`rp-db/schema.sql`** — `app.RoleDomainAccess` (vai trò nào được tự
  khám phá Domain nào, admin cấp ở trang Phân quyền) + `app.UserSavedReports`
  (mỗi người dùng tự lưu cấu hình CỦA RIÊNG MÌNH, có `UserId` — bảng ĐẦU
  TIÊN trong hệ thống người dùng thường tự sở hữu dòng dữ liệu của mình) +
  seed menu `reports-adhoc`.
- **`rp-server/lib/permissions.js`** — nạp thêm `domains` (Set) vào user
  context: `isSystemRole` thấy toàn bộ Domain có dữ liệu thật trong DWH,
  vai trò khác chỉ thấy Domain đã cấp qua `RoleDomainAccess`.
- **`rp-server/lib/adhocReportEngine.js`** (mới) — `discoverDomainFields()`
  dò field THẬT bằng `OPENJSON` trên 500 dòng mới nhất của Domain (không
  quét toàn bộ, tránh chậm); `runAdhocQuery()` RE-VALIDATE field/hàm tổng
  hợp trước khi dựng SQL động (whitelist field theo đúng lần dò lại +
  `FIELD_NAME_RE`, hàm tổng hợp map cứng sang SQL, mọi filter tham số hoá),
  giới hạn `TOP 5000` dòng kết quả sau GROUP BY.
- **`rp-server/routes/adhocReports.js`** (mới) — `GET /domains`,
  `GET /domains/:domain/fields`, `POST /run` (đều kiểm tra Domain nằm
  trong quyền của người dùng), CRUD `/saved` lọc theo `UserId`, 404 (không
  phải 403) khi không đúng chủ sở hữu để không lộ báo cáo người khác.
- **`rp-server/routes/roles.js`** — thêm `GET /domains-catalog` +
  `PUT /:id/domain-access` (mirror `report-access` đã có, cũng chỉ Admin
  hệ thống thật cấp được — `requireSystemRoleActor`).
- **`rp-user`** — trang mới "Báo cáo tự do" (`/reports/adhoc`,
  `AdhocReportPage.jsx`), thêm section "Domain được tự khám phá" vào
  `RolesPage.jsx` (trang Phân quyền).
- **Test**: smoke test `discoverDomainFields`/`runAdhocQuery` chặn đúng
  field lạ/agg lạ/domain lạ/field dạng SQL-injection-shaped, smoke test
  `permissions.js` cho cả 3 trường hợp (isSystemRole, vai trò thường có
  cấp Domain, không vai trò nào), `npm run build` `rp-user` sạch.
- **`hướng_dẫn_báo_cáo.md`** mục 14 (mới) — hướng dẫn admin cấp
  `RoleDomainAccess` + người dùng tự dựng báo cáo, ghi rõ giới hạn (mẫu
  500 dòng dò field, tối đa 5000 dòng kết quả, chỉ 1 Domain/lần — ghép
  nhiều nguồn vẫn cần admin tạo `composite`).

## 6.21 — Lỗi "Kiểm tra kết nối" HCRC Workspace chỉ báo "fetch failed" — bổ sung nguyên nhân thật (DNS/TLS/timeout)

Người dùng cấu hình "Xác thực HCRC Workspace" (`https://vpdt.hcrc.vn`),
bấm "Kiểm tra kết nối" thì báo lỗi cụt lủn `fetch failed`, không biết bắt
đầu tìm ở đâu. Nguyên nhân: `fetch()` gốc của Node (undici) LUÔN ném đúng
message `"fetch failed"` cho MỌI lỗi tầng mạng (DNS không phân giải được,
bị từ chối kết nối, TLS lỗi, hết thời gian chờ...) — lý do thật nằm ở
`err.cause` (vd `{code: 'ENOTFOUND', ...}`), nhưng `lib/hcrcWorkspaceClient.js`
chỉ ghép `err.message` vào thông báo lỗi trả về, bỏ qua `err.cause` — thông
tin chẩn đoán bị mất ngay từ lúc bắt lỗi, không phải do người dùng thiếu
cấu hình gì.

- **`rp-server/lib/hcrcWorkspaceClient.js`** — `callJson()` ghép thêm
  `err.cause.code`/`err.cause.message` vào thông báo lỗi (vd
  `fetch failed (ENOTFOUND)`) — route "Kiểm tra kết nối" chỉ Admin hệ
  thống tự cấu hình mới gọi được, lộ chi tiết mạng của chính endpoint họ
  vừa khai không phải rò rỉ nội bộ server.

## 6.20 — Sửa lỗi thật: đăng nhập bấm không phản ứng gì ở bản PM2-only (thiếu proxy /api, /admin sang backend)

Người dùng đã seed tài khoản admin đúng cả 3 service, bấm "Đăng nhập" ở
`rp-user`/`api-admin`/`etl-admin` (triển khai theo `Hướng dẫn triển khai
PM2.md`, không Nginx) nhưng KHÔNG có phản ứng gì (không báo lỗi), và
`pm2 logs` của `hcrc-rp-server`/`hcrc-api-server`/`hcrc-etl` không hề có
dòng nào ghi lại lần thử đó. Nguyên nhân: cả 3 frontend gọi API bằng
đường dẫn TƯƠNG ĐỐI (`fetch('/api/...')` ở rp-user, `fetch('/admin/...')`
ở api-admin/etl-admin — xem `src/lib/api.js`), đúng domain/PORT với
chính trang đang mở. Ở bản có Nginx việc này ổn vì Nginx đứng CHUNG 1
cổng, tự định tuyến `/api`/`/admin` sang đúng backend; nhưng ở bản
PM2-only, 3 giao diện (cổng `5173-5175`) và 3 backend (cổng `4001-4003`)
là 2 tiến trình HOÀN TOÀN riêng trên 2 dải cổng khác nhau — request
`/api/auth/login` từ trang `rp-user` (`:5173`) rơi thẳng vào chính
`deploy/serve-static.js` (không phải `rp-server`), tiến trình này không
biết `/api` là gì nên áp dụng nhánh "SPA fallback" — trả về `index.html`
(200 OK, không phải JSON) một cách ÂM THẦM. Vì phản hồi có `res.ok` nhưng
không phải JSON, code login ở frontend không ném lỗi (`result?.ok` là
`undefined`), nút "Đăng nhập" chỉ lặng lẽ quay lại — và vì request
CHƯA TỪNG chạm tới backend, `pm2 logs` phía backend trống trơn.

- **`deploy/serve-static.js`** — thêm khả năng proxy TCP thô (không dùng
  thư viện ngoài): đọc `PROXY_PREFIX`/`PROXY_TARGET_PORT` từ biến môi
  trường, request có đường dẫn khớp tiền tố được forward nguyên method/
  headers/body sang `http://127.0.0.1:<PROXY_TARGET_PORT>` (kèm
  `X-Forwarded-For`/`X-Forwarded-Proto`/`X-Forwarded-Host` để
  `TRUST_PROXY_HOPS=1` đã đặt sẵn ở cả 3 service nhận đúng IP người dùng
  thật thay vì luôn thấy `127.0.0.1`), response pipe thẳng về nguyên vẹn.
- **`deploy/ecosystem.config.js`** — set `PROXY_PREFIX`/`PROXY_TARGET_PORT`
  cho cả 3 tiến trình tĩnh: `hcrc-rp-user` → `/api`+`4001`, `hcrc-api-admin`
  → `/admin`+`4002`, `hcrc-etl-admin` → `/admin`+`4003`. Không ảnh hưởng
  bản có Nginx (Nginx đã chặn `/api`/`/admin` trước khi tới tiến trình
  tĩnh này — xem `deploy/nginx.conf`).
- **`Hướng dẫn triển khai PM2.md`** mục 14 — bổ sung tình huống này, kèm
  lệnh áp dụng bản vá cho deployment cũ (`pm2 restart ... --update-env`,
  không phải `reload`, vì lần này thêm biến môi trường mới).

## 6.19 — Sửa lỗi thật: 3 trang tĩnh không truy cập được từ máy khác (serve-static.js chỉ bind 127.0.0.1)

Người dùng build + chạy PM2 xong nhưng không vào được trang từ trình
duyệt. Nguyên nhân: `deploy/serve-static.js` đang cố tình
`.listen(PORT, '127.0.0.1', ...)` — chỉ chấp nhận kết nối TỪ CHÍNH máy
chủ, không khác gì so với việc CHƯA mở tường lửa — trong khi
`Hướng dẫn triển khai PM2.md` (bản không dùng Nginx) lại hứa truy cập
được bằng `http://<ip-máy-chủ>:<port>/` từ máy khác. Không nhất quán với
3 service backend (`rp-server`/`api-server`/`etl` đều `app.listen(PORT)`
không chỉ định host, tức lắng nghe MỌI interface) — ranh giới an toàn
thật sự nằm ở TƯỜNG LỬA (đã hướng dẫn đóng port khi thêm Nginx), không
phải địa chỉ bind.

- **`deploy/serve-static.js`** — bỏ tham số host `'127.0.0.1'`, đổi thành
  `.listen(PORT, ...)` (lắng nghe mọi interface, giống 3 service
  backend). An toàn cho cả 2 cách triển khai: PM2-only cần truy cập
  ngoài nên bắt buộc phải sửa; PM2+Nginx không đổi gì (Nginx vẫn gọi qua
  `127.0.0.1` như cũ, tường lửa mục 5 của "Hướng dẫn triển khai sử dụng
  PM2 + Nginx.md" đã đóng sẵn 3 port này với Internet từ trước, không
  cần sửa thêm).
- **`Hướng dẫn triển khai PM2.md`** mục 14 — bổ sung tình huống "tường
  lửa đã mở đúng mà vẫn không vào được 3 trang tĩnh" — chỉ thẳng nguyên
  nhân (bản `serve-static.js` cũ) và cách áp dụng bản vá.

## 6.18 — rp-user thành PWA thật (manifest + service worker), cài được lên màn hình chính

Bước nền cho yêu cầu đóng gói lên App Store/Play Store sau này (chưa làm
— cần PWA thật trước) và để tận dụng `registerType:'autoUpdate'` giúp
người dùng đã cài app luôn thấy bản mới nhất, cộng thêm bản sửa
Cache-Control ở 6.17. Phạm vi CHỈ `rp-user` (theo yêu cầu — `api-admin`/
`etl-admin` để sau).

- **`rp-user/vite.config.js`** — thêm plugin `vite-plugin-pwa`
  (`registerType: 'autoUpdate'`, tự inject `<link rel="manifest">` +
  script đăng ký service worker vào `index.html` lúc build, tự sinh
  `sw.js`/`workbox-*.js`/`manifest.webmanifest`).
- **`rp-user/public/icons/`** (mới) — 4 icon PNG (192/512/512-maskable/
  apple-touch-icon 180) sinh bằng script pure-Node (không cần thư viện
  ảnh, môi trường build không có sẵn) — nền màu `--accent` (#b5551f) +
  glyph biểu đồ cột trắng đơn giản, PLACEHOLDER tạm cho tới khi có logo
  thật của công ty.
- **`rp-user/index.html`** — thêm `theme-color`, `apple-touch-icon`,
  các meta `apple-mobile-web-app-*` (Safari/iOS đọc thẳng thẻ này, không
  đọc web manifest như Android Chrome).
- **`deploy/serve-static.js`** — thêm mime type `.webmanifest` (tránh rơi
  về `application/octet-stream`); mở rộng danh sách file luôn `no-cache`
  gồm cả `sw.js`/`registerSW.js`/`manifest.webmanifest` (không chỉ
  `index.html`) — thiếu bước này thì chính service worker lại tự tạo ra
  một tầng cache MỚI giữ bản cũ, lặp lại đúng lỗi vừa sửa ở 6.17.
- **`deploy/nginx.conf`** — thêm `location = /manifest.webmanifest` khai
  đúng `default_type application/manifest+json` cho domain `report.*`
  (mime.types mặc định của nhiều bản Nginx đóng gói sẵn không có đuôi
  `.webmanifest`); `location /` đã sẵn `no-cache` từ 6.17 nên tự phủ luôn
  `sw.js`/`registerSW.js`.
- **`deploy/Hướng dẫn nghiệp vụ.md`** mục 2 — thêm hướng dẫn "Cài đặt ứng
  dụng"/"Thêm vào Màn hình chính" cho người dùng cuối (Android Chrome +
  iOS Safari, khác nhau ở thao tác).
- Đã kiểm thử bằng Playwright: manifest tải đúng content-type, service
  worker đăng ký + active, trang render đúng, không lỗi console.

## 6.17 — Sửa lỗi người dùng không thấy tính năng mới sau khi cập nhật (thiếu Cache-Control)

Người dùng phản ánh dùng PWA/web hay bị "chưa thấy tính năng đã cập nhật"
sau khi deploy bản mới. Nguyên nhân: `deploy/serve-static.js` và
`deploy/nginx.conf` KHÔNG hề gửi header `Cache-Control` cho bất kỳ file
nào — trình duyệt (nặng nhất trên mobile, và nặng hơn ở chế độ "Thêm vào
màn hình chính") tự suy đoán thời hạn cache theo giờ sửa file, có thể giữ
`index.html` CŨ rất lâu mà không hỏi lại server — người dùng không bao
giờ tải được `index.html` mới để biết tên file JS/CSS mới (Vite đổi tên
theo hash nội dung mỗi lần build, nhưng phải có `index.html` mới mới biết
tên mới là gì).

- **`deploy/serve-static.js`** — thêm `cacheControlFor()`: `index.html`
  (kể cả khi trả về do SPA fallback) → `no-cache` (luôn revalidate);
  file trong `assets/` (Vite tự hash tên) → `public, max-age=31536000,
  immutable`; file tĩnh khác → `public, max-age=3600`.
- **`deploy/nginx.conf`** — thêm khối `location /assets/` (cache dài +
  immutable) và `add_header Cache-Control "no-cache"` cho `location /`
  ở cả 3 domain (`report`/`api-admin`/`etl-admin`), áp dụng cho nhánh
  Nginx đọc thẳng file (`root`/`try_files`) — nhánh `proxy_pass` sang
  `serve-static.js` tự nhận header từ đó, không cần sửa thêm.
- **`Hướng dẫn triển khai PM2.md`** — thêm lưu ý: cache cũ (từ TRƯỚC khi
  máy chủ có bản sửa này) cần xoá/mở lại 1 lần duy nhất, về sau tự động
  không cần lặp lại; đồng thời bổ sung nhánh "cập nhật code khi KHÔNG dùng
  git" (tải file/copy tay lên server) — đúng thực tế một triển khai thật
  đang dùng cách này, kèm 2 lưu ý (chạy đủ `npm install` cho cả 3 service
  mỗi lần vì không có `git diff` để biết chỗ đổi; không copy đè `.env`
  thật bằng file mẫu).

## 6.16 — Voucher: xác nhận giá trị thật STATUS trên PMCRDINF

Người dùng xác nhận `PMCRDINF.STATUS`: `1` = CHƯA thu hồi (voucher còn
dùng được), `0` = ĐÃ thu hồi (đã dùng) — thay cho placeholder "CẦN DBA xác
nhận" ở mục 13. Không cần đổi code (giá trị "đã dùng" vốn đã cấu hình được
qua trang "Endpoint ghi", xem phiên bản 6.12) — chỉ cập nhật
`hướng_dẫn_báo_cáo.md` mục 13 với giá trị thật, để lúc tạo endpoint ghi
`vouchers-redeem` điền đúng `0` vào ô "Giá trị đánh dấu đã dùng" ngay từ
đầu, không cần đoán/sửa lại sau.

## 6.15 — Xoá deploy/README.md — 2 file "Hướng dẫn triển khai..." + "Hướng dẫn nghiệp vụ.md" là tài liệu chính thức duy nhất

Người dùng yêu cầu xoá hẳn `deploy/README.md` (bản gốc trước khi tách
thành 2 file PM2/PM2+Nginx ở phiên bản 6.10 — vẫn còn tồn tại song song từ
đó tới giờ, gây nhầm lẫn không biết theo file nào) để từ nay MỌI cập nhật
tài liệu triển khai chỉ vào đúng 3 file:
`deploy/Hướng dẫn triển khai PM2.md`,
`deploy/Hướng dẫn triển khai sử dụng PM2 + Nginx.md`, và
`deploy/Hướng dẫn nghiệp vụ.md`.

Trước khi xoá, đã rà soát và port nốt nội dung còn THIẾU ở 2 file mới
(README.md có nhưng 2 file mới chưa có đủ chi tiết):
- **`Hướng dẫn triển khai PM2.md`** — bổ sung đầy đủ phần 2FA (điện thoại
  dùng chung, mã khôi phục, đặt lại giúp admin khác, cách xử lý khi mất cả
  điện thoại lẫn mã khôi phục) thay cho câu trỏ sang `deploy/README.md`;
  bỏ mục FAQ "muốn dùng systemd" (không còn tài liệu nào cho systemd sau
  khi xoá — `deploy/systemd/` vẫn còn trong repo nhưng không có hướng dẫn
  đi kèm).
- **`Hướng dẫn triển khai sử dụng PM2 + Nginx.md`** — thêm mục fail2ban
  (trỏ thẳng `deploy/fail2ban/README.md`, vẫn giữ nguyên file đó) và bước
  kiểm tra nén gzip cho file tĩnh qua `proxy_pass` (dễ bị bỏ sót vì
  `serve-static.js` tự nó không nén).
- Sửa mọi tham chiếu `deploy/README.md` còn sót lại sang đúng 1 trong 2
  file mới: `README.md` gốc, `rp-server/README.md`, `etl/README.md`,
  `api-server/README.md`, `hướng_dẫn_báo_cáo.md`, `deploy/serve-static.js`
  (KHÔNG sửa các mục lịch sử trong chính `VERSION.md` — quy tắc không sửa
  lại lịch sử).
- **`Hướng dẫn nghiệp vụ.md`** — inline luôn bước DBA xử lý khi mất cả
  điện thoại lẫn mã khôi phục 2FA (trước đó trỏ sang `deploy/README.md`
  mục 5).

## 6.14 — Ghi rõ quy tắc: tự động đánh version ở mọi lần merge, không cần nhắc

Người dùng yêu cầu việc cập nhật `VERSION.md` diễn ra tự động sau mỗi lần
merge vào `main`, không cần nhắc riêng — ghi thẳng thành quy tắc trong
chính file này (đoạn "TỰ ĐỘNG, không cần nhắc" ở đầu file) để chắc chắn áp
dụng nhất quán, kể cả ở phiên làm việc sau này.

## 6.13 — Báo cáo tồn=0: sửa công thức tồn kho + thêm cột Chờ nhập/Đã nhập

Người dùng phát hiện công thức tồn kho cũ (đọc thẳng snapshot "ngày gần
nhất có dữ liệu") có thể bị "che" bởi lô hàng vừa nhập trong ngày — sửa lại
đúng ý: tồn ước tính hôm nay = tồn cuối kỳ HÔM QUA trừ số lượng bán HÔM NAY
(luôn đúng ngày, không theo `rankWindow`), KHÔNG cộng lại bất kỳ hàng nào
đã nhập trong ngày. Đồng thời thêm 4 cột thông tin tham khảo "Chờ nhập"/
"Đã nhập hôm nay" (mỗi loại tách NCC/Điều chuyển) — theo yêu cầu, KHÔNG
hardcode bảng/điều kiện trạng thái trong code, mà cấu hình qua tên domain
khai trong `DefinitionJson` lúc tạo báo cáo (giống cách `salesDomain`/
`stockDomain` đã làm) — điều kiện lọc "chờ"/"đã" nằm trong VIEW nguồn (DBA
sửa bằng `ALTER VIEW`, không đụng code).

- **`rp-server/lib/topSellingZeroStockRunner.js`** — viết lại bước tính tồn
  kho: thêm `loadLatestMeasureBefore()` (tồn "hôm qua" — dòng gần nhất
  TRƯỚC hôm nay, khác `loadLatestMeasure()` cũ là "gần nhất bất kỳ ngày
  nào") và `loadSumOnDate()` (bán "hôm nay"/"đã nhập hôm nay" — ĐÚNG 1
  ngày, không lùi). Thêm 4 field tuỳ chọn trong `DefinitionJson`:
  `pendingSupplierDomain`/`pendingTransferDomain` (đọc dòng mới nhất, TUỲ
  CHỌN) và `receivedSupplierDomain`/`receivedTransferDomain` (đọc đúng
  ngày hôm nay, TUỲ CHỌN) — `describeColumns()` giờ nhận `definition`, chỉ
  thêm cột nào có domain tương ứng được khai.
- **`hướng_dẫn_báo_cáo.md`** mục 12 — thêm Bước 2b: mẫu 4 VIEW nguồn
  (`RV_ORDER` cho NCC — `DELIVER_DT`/`FINISH_DT` NULL = chờ; `DLVTRANS`
  cho điều chuyển, nhóm theo `OSTK_ID` — `RCV_DATE` NULL = chờ), cấu hình
  4 job "Theo bảng" tương ứng (tuỳ chọn, không bắt buộc tạo đủ cả 4); viết
  lại Bước 4 mô tả công thức mới; cập nhật mẫu `DefinitionJson`.
- Test lại bằng fakeModule (tồn ước tính đúng công thức mới, cột Chờ
  nhập/Đã nhập chỉ hiện khi domain được cấu hình).

## 6.12 — Voucher: "Endpoint ghi" mới — đối tác ngoài báo đã dùng, ghi thẳng vào bảng nguồn

Hoàn thiện yêu cầu voucher (kiểm tra trạng thái đã làm được từ trước qua
"Endpoint realtime" có sẵn) — phần còn thiếu là cho đối tác ngoài BÁO đã
dùng 1 voucher. Người dùng chốt: ghi thẳng vào bảng nguồn đang có (không
tạo bảng riêng của HCRC), và voucher dùng 1 lần là thu luôn (không theo số
dư). Đây là lần đầu hệ thống có đường GHI ngược lại nguồn dữ liệu vận hành
— mọi engine khác từ trước tới giờ (ETL, Endpoint realtime, mọi báo cáo)
đều chỉ đọc, nên tách hẳn bảng/route/scope/quyền riêng thay vì mở rộng cái
đã có, và cố tình giới hạn chỉ 1 thao tác đơn giản (đổi 1 cột trạng thái)
để dễ kiểm soát rủi ro.

- **`api-db/schema.sql`** — 2 bảng mới: `api.RealtimeWriteEndpointDefs`
  (Endpoint, DataSourceId, SchemaName, TableName, KeyColumn, StatusColumn,
  UsedValue...) và `api.ConsumerRealtimeWriteAccess` (cấp quyền theo từng
  đối tác, mặc định rỗng — cùng khuôn `ConsumerRealtimeAccess` nhưng bảng
  riêng, đọc được không có nghĩa ghi được).
- **`api-server/lib/realtimeWriteEngine.js`** (mới) — `runRedeem()`: 1
  UPDATE nguyên tử `WHERE KeyColumn=@key AND (StatusColumn<>UsedValue OR
  StatusColumn IS NULL)`, dùng `OUTPUT` để biết có đổi dòng không; không
  đổi dòng nào thì SELECT lại phân biệt "không tồn tại" (404) với "đã dùng
  từ trước" (idempotent — đối tác gọi trùng do timeout/lỗi mạng không bị
  ghi đè/kích hoạt side-effect lần 2, không báo lỗi).
- **`api-server/routes/admin/realtimeWriteEndpoints.js`** (mới) — CRUD,
  đối chiếu schema thật lúc lưu (mirror `realtimeEndpoints.js` nhưng cấu
  hình đơn giản hơn nhiều — không JOIN, không nhiều cột).
- **`api-server/routes/v1/realtimeWrite.js`** (mới) —
  `POST /api/v1/realtime-write/:endpoint/:key`, scope `realtimeWrite`
  riêng (khác `realtime` đọc).
- **`api-server/routes/admin/consumers.js`** — thêm GET/PUT
  `/:id/write-access` (cùng khuôn report-access/realtime-access).
- **`api-admin`** — trang mới "Endpoint ghi"
  (`RealtimeWriteEndpointsPage.jsx`) + nav; `ConsumersPage.jsx` thêm scope
  `realtimeWrite` và nút "Ghi được gọi".
- **`hướng_dẫn_báo_cáo.md`** — mục 13: cấu hình đầy đủ cho voucher
  (`PMCRDINF`, cột `STATUS`, giá trị "đã dùng" cần DBA xác nhận), giải
  thích vì sao chỉ hỗ trợ đúng 1 thao tác đơn giản.

## 6.11 — Báo cáo "Top bán chạy đang tồn kho = 0" (tự xếp hạng) + dropdown searchable cho mọi bộ lọc

Yêu cầu ban đầu (upload thủ công top-50 mặt hàng) được thảo luận lại và
đổi hướng: báo cáo TỰ TÍNH danh sách bán chạy nhất mỗi chi nhánh từ dữ
liệu bán hàng thật (theo SỐ LƯỢNG), không upload/chọn từ danh sách có
sẵn — chỉ những mặt hàng ĐANG hết hàng trong top đó mới hiện ra.

- **`rp-db/schema.sql`** — thêm `'topZeroStock'` vào
  `CK_ReportCatalog_SourceType` (cả CREATE TABLE lẫn khối migration
  drop+recreate).
- **`rp-server/lib/topSellingZeroStockRunner.js`** (mới) — bộ máy báo cáo
  riêng cho `SourceType='topZeroStock'`: cộng dồn số lượng bán mỗi thực
  thể (`<MãChiNhánh>_<MãHàng>`) trong khoảng ngày người dùng chọn
  (`rankWindow`: `1` ngày hôm trước / `7` / `30` ngày gần nhất / `daily`
  trong ngày), xếp hạng TOP N (mặc định 50) riêng từng chi nhánh, tra tồn
  kho ở NGÀY GẦN NHẤT CÓ DỮ LIỆU (tự lùi ngày nếu hôm nay chưa đồng bộ,
  không cố định "hôm nay"), giữ lại thực thể tồn kho <= ngưỡng
  (`threshold`, mặc định 0, sửa được trong `DefinitionJson` không cần đổi
  code — giống `dwh.AnomalyAlerts`). Chỉ tính mặt hàng có bán > 0 trong kỳ
  (hàng không bán không bị coi là "hết hàng").
- **`rp-server/lib/reportRunner.js`** — thêm nhánh dispatch
  `sourceType==='topZeroStock'`, xuất thêm `resolveFactsPool` để dùng
  chung cho route lấy danh sách lựa chọn động bên dưới.
- **`rp-server/routes/reports.js`** — route mới
  `GET /:reportId/filter-options/:field`: đọc DISTINCT giá trị 1 field
  trong `Dimensions` của domain đã đồng bộ (khai qua
  `definition.filters[].optionsSource`), dùng để lấp danh sách chi nhánh
  thật cho bộ lọc `branches` — KHÔNG lộ `optionsSource` (tên domain/field
  nội bộ) ra `GET /:reportId` cho client, chỉ báo cờ `hasDynamicOptions`.
- **Áp dụng CHUNG cho mọi báo cáo** (không riêng báo cáo này) — yêu cầu
  "tất cả kiểu chọn và lọc trong report" phải là dropdown searchable +
  multi-select + "chọn tất cả":
  - **`rp-user/src/components/SearchableSelect.jsx`** (mới) — dropdown
    dùng chung, có ô tìm kiếm, chế độ multi có "Chọn tất cả"/"Bỏ chọn tất
    cả", đóng khi bấm ra ngoài/Esc.
  - **`rp-user/src/components/FilterForm.jsx`** — viết lại, dùng
    `SearchableSelect` cho `select`/`multiSelect` (trước đây là ô nhập
    tay/gõ mã cách nhau dấu phẩy); tự gọi
    `GET /reports/:reportId/filter-options/:field` khi filter có
    `hasDynamicOptions`.
  - **`rp-user/src/styles.css`** — thêm CSS cho `.searchable-select*`.
- **`hướng_dẫn_báo_cáo.md`** — thêm mục 12: 2 mẫu VIEW nguồn
  (`vw_BanHangTheoSKU` lọc `TRANS_CODE` đúng giao dịch bán — DBA chỉnh lại
  bằng `ALTER VIEW` khi cần, không cần sửa etl-admin/code;
  `vw_TonKhoTheoSKU`), cấu hình 2 job "Theo bảng" (BẬT "Giữ lịch sử theo
  ngày" — bắt buộc), mẫu `DefinitionJson` đầy đủ, tóm tắt công thức tính,
  và ghi chú áp dụng dropdown searchable cho mọi báo cáo.

## 6.10 — Tách "Hướng dẫn triển khai.md" thành 2 file PM2/PM2+Nginx riêng

Người dùng phản hồi file `Hướng dẫn triển khai.md` (gộp Cách A/Cách B,
rồi lại Cách 1/Cách 2 bên trong Cách A) vẫn khó đọc — quá nhiều nhánh rẽ
trong CÙNG 1 file gây phân tâm. Yêu cầu cụ thể: xoá file đó, tách thành
đúng 2 file riêng — 1 file chỉ PM2, 1 file PM2 + Nginx — để đọc 1 mạch
không rẽ nhánh.

- **Xoá** `deploy/Hướng dẫn triển khai.md`.
- **`deploy/Hướng dẫn triển khai PM2.md`** (mới) — hướng dẫn ĐỘC LẬP, 1
  đường thẳng từ đầu tới cuối: DB → tài khoản OS → `.env` → seed:admin →
  build → chạy TOÀN BỘ 6 tiến trình bằng PM2 (kể cả 3 giao diện tĩnh qua
  `serve-static.js`, KHÔNG còn tuỳ chọn — vì không có Nginx nào khác đọc
  file thay) → truy cập trực tiếp bằng IP:cổng (không domain/HTTPS). Bỏ
  hẳn nhánh systemd (Cách B cũ) khỏi tài liệu này — ai cần systemd vẫn
  tra được ở `deploy/README.md` (không xoá, giữ làm tài liệu kỹ thuật
  đầy đủ).
- **`deploy/Hướng dẫn triển khai sử dụng PM2 + Nginx.md`** (mới) — tài
  liệu TIẾP NỐI (không lặp lại DB/`.env`/seed:admin/PM2 đã có ở file
  trên), chỉ nói phần THÊM VÀO: vì sao cần Nginx, DNS/TLS, sửa 3 khối
  `location /` trong `deploy/nginx.conf` sang `proxy_pass` (khớp đúng
  cách File 1 đã chạy tĩnh qua PM2), đăng nhập lại qua domain, tường lửa
  đóng 6 cổng nội bộ, gia hạn chứng chỉ, xử lý sự cố riêng cho tầng
  Nginx (404 do quên sửa location, 502 do PM2 chưa chạy đủ...).
- Cập nhật tham chiếu chéo: `deploy/Hướng dẫn nghiệp vụ.md` (2 chỗ),
  chú thích trong `deploy/ecosystem.config.js`, `deploy/nginx.conf` (2
  chỗ), `deploy/serve-static.js` — toàn bộ trỏ đúng sang 1 trong 2 file
  mới thay vì file đã xoá. KHÔNG sửa các mục lịch sử cũ trong chính
  VERSION.md (quy ước không sửa lại changelog cũ).
- Docs-only, không đổi hành vi code (`ecosystem.config.js`/`nginx.conf`/
  `serve-static.js` giữ nguyên logic, chỉ đổi text chú thích trỏ đúng
  tên file mới).

## 6.9 — Thêm phương án phục vụ 3 trang tĩnh bằng PM2 (tuỳ chọn)

Người dùng có 1 hệ thống khác (VPDT) đang chạy toàn bộ bằng PM2, muốn 3
trang tĩnh của HCRC (`rp-user`/`api-admin`/`etl-admin`) cũng chạy theo
kiểu đó — thao tác vận hành đồng nhất (`pm2 status`/`pm2 logs` thấy đủ
mọi tiến trình), thay vì tách riêng Nginx đọc thẳng file. Cũng hỏi mức
ảnh hưởng hiệu năng.

- `deploy/serve-static.js` (mới) — server tĩnh tối giản, không phụ thuộc
  gói ngoài, tự làm SPA fallback (trả `index.html` cho path không khớp
  file thật, giống hệt `try_files` của Nginx) + chặn path traversal, chỉ
  lắng nghe `127.0.0.1` (không lộ ra ngoài dù máy chủ có IP công khai).
  Đã tự test: root 200, SPA fallback 200, path traversal 400.
- `deploy/ecosystem.config.js` — thêm 3 app tĩnh (`hcrc-rp-user`/
  `hcrc-api-admin`/`hcrc-etl-admin`), CHỈ được đưa vào danh sách khi bật
  biến môi trường `HCRC_STATIC_VIA_PM2=1` lúc `pm2 start` (mặc định TẮT —
  không ảnh hưởng ai đang dùng file mẫu cũ, không tốn thêm RAM nếu không
  cần). Đã tự test cả 2 trạng thái bật/tắt bằng `require()` trực tiếp.
- `deploy/nginx.conf` — thêm 3 khối `upstream *_static` (cổng
  5173/5174/5175, trùng cổng dev cho dễ nhớ). 3 domain `report.*`/
  `api-admin.*`/`etl-admin.*` GIỮ NGUYÊN mặc định `root`/`try_files`
  (Nginx đọc thẳng file — KHÔNG đổi hành vi mặc định cho ai khác), thêm
  khối `proxy_pass` tương ứng dưới dạng chú thích rõ ràng để bật thủ công
  khi cần (đã tự đếm dấu ngoặc `{`/`}` xác nhận cân bằng sau khi sửa).
- `deploy/Hướng dẫn triển khai.md` — Bước 5 tách "Cách 1" (Nginx đọc file,
  mặc định)/"Cách 2" (phục vụ qua PM2, tuỳ chọn) + giải thích hiệu năng
  (không đáng kể ở quy mô nội bộ: ~1-3ms/lần tải trang, ~100-150MB RAM
  tổng cho 3 tiến trình); Bước 6/7/9/14 cập nhật tương ứng theo Cách đã
  chọn, kèm cảnh báo cụ thể 2 lỗi dễ gặp nếu bật 1 nửa (404 nếu bật cờ PM2
  nhưng quên sửa Nginx; 502 nếu sửa Nginx nhưng quên bật cờ PM2).
- Không đổi hành vi mặc định của bất kỳ ai đang triển khai theo tài liệu
  cũ — toàn bộ thay đổi là CỘNG THÊM, tắt theo mặc định.

## 6.8 — Làm rõ cluster + Nginx upstream trong Hướng dẫn triển khai (docs-only)

Người dùng hỏi có cần cluster không, Nginx có cần `upstream` không, để
đưa cho team IT 1 đường đi chắc chắn chạy được ngay lần đầu — không phải
tự suy đoán/quyết định thêm gì. Trả lời + chốt vào tài liệu:

- Cách A (PM2): cluster **đã bật sẵn mặc định** (`deploy/ecosystem.config.js`
  `instances: 2` + `.env.example` đã tính pool CSDL sẵn cho đúng số đó) —
  không cần làm gì thêm để có cluster.
- Cách B (systemd): mặc định hướng dẫn chỉ chạy 1 worker (`@0`) — đủ
  chạy được, cluster ở đây là tuỳ chọn mở rộng sau.
- Nginx `upstream`: bắt buộc phải có nhưng đã có sẵn nguyên trong
  `deploy/nginx.conf` — chỉ đổi domain/chứng chỉ, không cần tự thêm/sửa
  khối `upstream` cho lần triển khai đầu (kể cả PM2 cluster 2 worker, vì
  PM2 tự cân bằng tải ở tầng Node, Nginx luôn chỉ thấy 1 cổng).

Cập nhật `deploy/Hướng dẫn triển khai.md`: thêm khung "Đường đi nhanh
nhất" ngay đầu file (mở đầu tóm tắt 2 điểm trên), làm rõ thêm tại Bước 6
(PM2 status hiện `instances: 2`) và Bước 7 (giải thích khối `upstream`
có sẵn, khi nào mới cần sửa). Docs-only, không đổi code/cấu hình mẫu.

## 6.7 — Sửa lại toàn bộ 2 file hướng dẫn (6.6 mô tả nhầm hệ thống khác)

Người dùng báo team IT làm theo hướng dẫn KHÔNG chạy được. Kiểm tra lại
phát hiện lỗi NGHIÊM TRỌNG ở mục 6.6: 2 file `Hướng dẫn nghiệp vụ.md`/
`Hướng dẫn triển khai.md` mô tả 1 ứng dụng "HCRC Voucher Redemption App"
KHÔNG hề tồn tại trong repo này (`src/server.js`, `sql/001-013`, 1 tài
khoản `hcrcapp` duy nhất...) — nhầm lẫn với nội dung 1 file tham khảo
khác được đưa vào cùng lúc. Repo THẬT có `etl/`+`rp-server/`+`api-server/`
+ `etl-admin/`+`rp-user/`+`api-admin/`, hoàn toàn khác cấu trúc đã viết.

Viết lại HOÀN TOÀN cả 2 file, lần này đối chiếu trực tiếp với code/README
thật của từng service (không suy diễn từ tài liệu tham khảo ngoài):

- `deploy/Hướng dẫn triển khai.md` — viết lại dựa trên `deploy/README.md`
  (đã kiểm thử thật trong phiên trước) + `.env.example` từng service,
  tổ chức lại thành các bước tuần tự rõ ràng, bổ sung mục MỚI "Đăng nhập
  lần đầu vào từng trang" (URL + tài khoản cho cả 3 hệ thống, bắt buộc
  2FA) — đây là phần bị thiếu khiến IT không biết cách vào được trang sau
  khi triển khai.
- `deploy/Hướng dẫn nghiệp vụ.md` — viết lại thành bản đồ định hướng thật
  (kiến trúc etl → Data Warehouse → rp-user/api-server, 3 giao diện dùng
  để làm gì, đăng nhập/2FA, phân quyền, bảng đầy đủ TỪNG TRANG thật của
  cả 3 giao diện — đối chiếu trực tiếp `ls src/pages`/`src/modules` của
  etl-admin/api-admin/rp-user, không đoán), trỏ sang `hướng_dẫn_báo_cáo.md`
  (đã có sẵn, rất đầy đủ) cho công thức cấu hình chi tiết từng kịch bản,
  tránh trùng lặp/lệch nội dung giữa 2 file.
- Dựng thử NGAY trong sandbox để kiểm chứng tài liệu mới đúng: build lại
  cả 3 frontend (`npm run build`), phục vụ tĩnh + 1 API giả trả về đúng
  hình dạng `GET /api/me` thật, dùng Playwright chụp màn hình đăng nhập
  thật của cả 3 hệ thống + màn Trang chủ/Biểu mẫu/Phân quyền của rp-user
  sau khi "đăng nhập" — xác nhận cấu trúc menu/trang mô tả trong tài liệu
  khớp ĐÚNG với giao diện thật đang chạy, gửi ảnh chụp cho người dùng.
- Docs-only, không đổi code sản phẩm. Rút kinh nghiệm: khi viết tài liệu
  dựa theo file tham khảo do người dùng cung cấp, PHẢI xác minh lại với
  code thật của repo trước khi coi nội dung tham khảo là sự thật, đặc
  biệt khi tham khảo mô tả 1 hệ thống có thể không phải hệ thống đang có.

## 6.6 — Thêm 2 file hướng dẫn riêng cho ứng dụng HCRC Voucher Redemption App

Người dùng cung cấp 2 file tham khảo (README.md mô tả nghiệp vụ + triển
khai của "HCRC Voucher Redemption App" — ứng dụng thu hồi voucher tại
quầy, tách biệt hoàn toàn với hệ thống ETL/Report/API Server đang có
trong repo; và DEPLOYMENT.md của 1 dự án khác không liên quan, chỉ dùng
làm MẪU CẤU TRÚC trình bày). Yêu cầu: tách nội dung thành 2 file riêng
trong `deploy/`, và từ nay các cập nhật nghiệp vụ đi vào file "Hướng dẫn
nghiệp vụ", cập nhật triển khai đi vào file "Hướng dẫn triển khai".

- `deploy/Hướng dẫn nghiệp vụ.md` (mới) — mô tả nghiệp vụ thu hồi voucher
  (quét → kiểm tra → thu hồi, có sơ đồ mermaid), mô hình dữ liệu (bảng có
  sẵn dùng chung với hệ thống Core vs bảng bổ sung riêng của app), cấu
  hình kết nối Core Voucher API qua giao diện Admin (kèm hợp đồng JSON
  fallback qua `.env`), chức năng từng màn hình, mô hình Công ty → Điểm
  tiêu + báo cáo tổng hợp + phân quyền xem báo cáo theo công ty, tài
  khoản (2FA bắt buộc cho admin, đăng nhập vân tay/Face ID qua WebAuthn,
  thời hạn tài khoản, bắt buộc đổi mật khẩu lần đầu, chống dò mật khẩu),
  hàng đợi đồng bộ khi Core API mất kết nối, và bảng tham chiếu API đầy
  đủ.
- `deploy/Hướng dẫn triển khai.md` (mới) — hướng dẫn triển khai production
  đầy đủ cho app này (dựa theo nội dung mục 3 "Triển khai ứng dụng" của
  README.md nguồn, KHÔNG liên quan gì tới `deploy/README.md` hiện có của
  hệ thống ETL/Report/API Server), trình bày lại theo cấu trúc/phong cách
  của DEPLOYMENT.md tham khảo (mục lục có neo, bảng vận hành hàng ngày,
  mục xử lý sự cố, bảng biến môi trường) nhưng KHÔNG lấy bất kỳ nội dung
  nghiệp vụ nào của DEPLOYMENT.md (MariaDB/DMS/PDF — dự án khác hẳn) —
  gồm: yêu cầu hệ thống, kết nối vào DB MSSQL hiện có + migrate + tạo tài
  khoản admin, cấu hình domain thật cho PWA/WebAuthn, tài khoản hệ thống
  riêng (bảo mật), chạy production bằng PM2 hoặc systemd, cluster nhiều
  worker, Nginx + HTTPS, tường lửa, checklist, vận hành hàng ngày, sao
  lưu, cập nhật code, xử lý sự cố, bảng biến môi trường.
- Đây là 2 file tài liệu HOÀN TOÀN MỚI, độc lập với `deploy/README.md` và
  các file `deploy/` khác đã có — không sửa/xoá gì ở các file cũ. Docs-
  only, không đổi code.

## 6.5 — Thêm mục 9 "Cập nhật code (redeploy)" — vá lỗ hổng quy trình phát hiện qua thử thật

Người dùng hỏi: sau khi phân quyền xong (mục 6.4), up code mới thì làm
sao? Phát hiện chính ghi chú CŨ trong Bước 5/FAQ Cách B (mục 6.4) SAI —
viết "cập nhật code dùng `sudo -u hcrc-etl -H git pull`" nhưng KHÔNG THẬT
SỰ chạy thử trước khi viết. Lần này tự dựng 1 repo Git + 2 tài khoản
Linux thật (`useradd`/`chown`/`git`) để kiểm chứng trước khi viết bất kỳ
dòng hướng dẫn nào — phát hiện CẢ HAI cách làm tắt đều thất bại thật sự:
tài khoản sở hữu `.git` (thư mục gốc) `git pull` được nhưng bị "Permission
denied" khi ghi file bên trong 3 thư mục service đã khoá; tài khoản dịch
vụ sở hữu thư mục service lại không đọc/ghi được `.git` ở thư mục gốc
("cannot open .git/FETCH_HEAD"). Cách ĐÚNG (đã kiểm chứng chạy thật,
không chỉ suy luận): tạm `chown` trả quyền sở hữu 3 thư mục service về
tài khoản vận hành, `git pull`, cài lại/build lại, RỒI `chown` khoá lại
đúng như Bước 5. Docs-only, không đổi code sản phẩm.

- `deploy/README.md` mục 9 (mới) — quy trình cập nhật code đầy đủ cho cả
  2 Cách: Cách A (PM2) đơn giản — mọi việc làm dưới quyền `hcrc` (tài
  khoản sở hữu toàn bộ cây thư mục) như lúc cài đặt ban đầu, không có gì
  đặc biệt. Cách B (systemd) — quy trình 2 pha "mở khoá tạm → cập nhật →
  khoá lại" đã kiểm chứng thật, cộng ghi chú giải thích RÕ VÌ SAO cần 2
  pha (không có tài khoản nào vừa đọc `.git` vừa ghi được cả 3 thư mục
  service cùng lúc — đây là hệ quả trực tiếp, cố ý của mô hình phân quyền
  theo từng service).
- Sửa 2 chỗ ghi chú CŨ (Bước 5 + FAQ, mục 6.4) đang hướng dẫn SAI (`sudo -u
  hcrc-etl -H git pull` — không hoạt động, đã kiểm chứng) — nay trỏ sang
  mục 9 thay vì lặp lại hướng dẫn ngắn gọn nhưng thiếu.

## 6.4 — Cách B (systemd) chuyển sang 3 tài khoản riêng theo service + hỗ trợ cluster

Người dùng muốn Cách B (systemd, mục 6.2/6.3) đi xa hơn: mỗi service có
TÀI KHOẢN HỆ ĐIỀU HÀNH RIÊNG (không dùng chung 1 tài khoản như PM2) để có
thể phân quyền độc lập trên từng thư mục ứng dụng + `.env`, và hỗ trợ
chạy nhiều worker (cluster) như PM2 đã có. Viết lại toàn bộ hướng dẫn
triển khai cho dễ hiểu hơn theo yêu cầu — cấu trúc "chọn cách TRƯỚC, rồi
rẽ nhánh làm theo" xuyên suốt cả 5 bước (không chỉ riêng bước bật tiến
trình như trước). Đã tự kiểm bằng `systemd-analyze verify` cho cả 2 kịch
bản (1 worker, nhiều worker) trước khi đưa vào tài liệu — sạch, không
lỗi/cảnh báo. Docs + file mẫu, không đổi code sản phẩm.

- `deploy/systemd/hcrc-etl.service`, `hcrc-rp-server.service`,
  `hcrc-api-server.service` (từ 6.2/6.3) — XOÁ, thay bằng 3 file TEMPLATE
  `hcrc-etl@.service`, `hcrc-rp-server@.service`, `hcrc-api-server@.service`
  (tên có `@`, hỗ trợ N worker qua `systemctl enable --now <tên>@<số>`).
  Mỗi service `User=`/`Group=` là tài khoản RIÊNG (`hcrc-etl`,
  `hcrc-rp-server`, `hcrc-api-server` — tạo bằng `useradd --no-create-home`,
  không cần `~/.pm2` như PM2 vì log qua `journald`). Thêm
  `EnvironmentFile=/etc/hcrc/<service>-worker-%i.conf` (1 dòng `PORT=...`
  riêng cho từng worker) và `Environment=NODE_APP_INSTANCE=%i` (chỉ worker
  "0" chạy cron nội bộ, xác nhận qua `lib/clusterLeader.js`, không đổi code).
- `deploy/README.md` mục 1 — viết lại: Bước 1 (chọn cách + tạo tài khoản)
  giờ là bước rẽ nhánh ĐẦU TIÊN thay vì chỉ ở Bước 4 (chạy tiến trình) —
  vì tài khoản dùng chung (PM2) hay 3 tài khoản riêng (systemd) quyết định
  luôn nơi clone/build (Bước 2: PM2 build trong shell `hcrc`; systemd build
  bằng tài khoản người vận hành vào `/opt/hcrc` vì chưa có tài khoản nào sở
  hữu toàn bộ cây thư mục). Bước 4 (systemd) thêm bảng cổng dựng sẵn cho
  tới 4 worker/service (`BASE + 10×worker`, vd rp-server 4001/4011/4021/4031)
  + hướng dẫn thêm dòng `upstream` vào `deploy/nginx.conf`. Bước 5 (systemd)
  là bước "phân quyền" người dùng yêu cầu — `chown` riêng từng thư mục
  service cho đúng tài khoản, `chmod 750` + `.env` riêng `600`.
- `deploy/nginx.conf` — thêm chú thích "Nhiều worker (cluster)" ngay trên 3
  khối `upstream`, hướng dẫn thêm dòng `server 127.0.0.1:<cổng>` khi bật
  thêm worker (PM2 tự lo ở tầng Node, không cần sửa file này; systemd cần
  tự thêm dòng khớp cổng worker mới).
- FAQ mới: so sánh cụ thể mức độ an toàn Cách A (1 tài khoản, service này
  bị RCE thì đọc được `.env` của cả 3) so với Cách B (tài khoản riêng,
  service bị RCE KHÔNG đọc được `.env` của 2 service kia) — kèm đánh đổi
  (nhiều bước hơn, cập nhật code sau này phải làm riêng từng thư mục qua
  `sudo -u <tài khoản> -H`).

## 6.3 — Viết lại mục 1 (deploy/README.md) dễ hiểu hơn cho người quản trị

Người dùng phản hồi hướng dẫn "cách chạy services" (mục 6.2, PM2 vs
systemd) khó đọc — nhiều cross-reference qua lại giữa các mục con
(1.0/1.1/1.2), lệnh dịch nghĩa PM2→systemd rải rác nhiều chỗ. Viết lại
toàn bộ mục 1 thành 5 "Bước" tuyến tính, mỗi bước tự đủ (không cần nhảy
qua lại), gộp phần dịch lệnh PM2→systemd thành 1 bảng tra duy nhất. Trong
lúc viết lại, TỰ KIỂM bằng cách chạy thật đoạn script mẫu (không chỉ đọc
lại) và phát hiện 1 lỗi thật trong chính các file `deploy/systemd/*.service`
từ đợt 6.2: `ExecStart=<DUONG-DAN-NODE-THAT>/node server.js` cộng thêm
"/node" vào SAU kết quả `which node` (vốn đã là đường dẫn ĐẦY ĐỦ tới file
thực thi, vd `/usr/bin/node`) — ra đường dẫn sai `/usr/bin/node/node`,
`systemd-analyze verify` báo "not a directory". Docs + sửa file mẫu,
không đổi code sản phẩm.

- `deploy/README.md` mục 1 — viết lại thành "Bước 1" (tạo tài khoản
  `hcrc`) → "Bước 5" (siết quyền), mỗi bước có khối lệnh chạy được ngay,
  không phải tra cứu chỗ khác. Bước 4 (chạy 3 tiến trình) có thêm gợi ý
  chọn nhanh ("chưa chắc thì chọn PM2") và 1 "Bảng tra lệnh nhanh" PM2↔
  systemd dùng chung cho mục 4/7/FAQ (thay cho các ghi chú rời rạc trước
  đó). Cách B (systemd) đổi từ "tự sửa 2 chỗ `<...>` bằng tay" sang 1 khối
  lệnh `sed` chạy 1 lần cho cả 3 file.
- `deploy/systemd/hcrc-{etl,rp-server,api-server}.service` — SỬA LỖI:
  `ExecStart` đổi thành `<DUONG-DAN-NODE-THAT> server.js` (bỏ "/node" thừa)
  — placeholder giờ là đường dẫn ĐẦY ĐỦ tới file thực thi `node` (đúng
  khớp kết quả `which node`), không phải thư mục chứa nó. Đã kiểm lại
  bằng `systemd-analyze verify` sau khi sed thay placeholder bằng giá trị
  thật — sạch, không lỗi/cảnh báo.
- Mọi cross-reference nội bộ ("mục 1.0"/"1.1"/"1.2") đổi thành "Bước
  X, mục 1" khớp cấu trúc mới — bao gồm cả comment trong 3 file
  `deploy/systemd/*.service`.

## 6.2 — Thêm cách chạy bằng systemd (thay cho PM2) trong hướng dẫn triển khai

Người dùng muốn tài liệu triển khai có SẴN 2 cách chạy 3 tiến trình nền để
chọn: PM2 (Cách A, đã có từ trước) và systemd thuần (Cách B, mới) — không
phải cài PM2 toàn máy cho ai muốn dùng đúng hạ tầng hệ điều hành sẵn có.
Docs + 3 file mẫu, không đổi code sản phẩm.

- `deploy/systemd/hcrc-etl.service`, `hcrc-rp-server.service`,
  `hcrc-api-server.service` (mới) — mỗi service Node 1 unit systemd riêng,
  `User=hcrc`/`Group=hcrc` sẵn trong file (không cần `sudo -u hcrc`, chính
  systemd hạ quyền trước khi khởi động tiến trình), `Restart=on-failure` +
  `StartLimitIntervalSec=200`/`StartLimitBurst=10` ở `[Unit]` (tương đương
  `min_uptime`/`max_restarts` của PM2 — LƯU Ý 2 khoá này BẮT BUỘC ở
  `[Unit]`, không phải `[Service]`, systemd âm thầm bỏ qua + ghi "Unknown
  key" nếu đặt nhầm chỗ, đã tự kiểm bằng `systemd-analyze verify` cho cả 3
  file trước khi thêm vào repo). Log ra `journald`
  (`StandardOutput=journal`) — tự xoay vòng theo dung lượng, không cần cài
  thêm `pm2-logrotate`. 2 chỗ `<DUONG-DAN-...>` (thư mục clone + đường dẫn
  `node` thật) cần tự điền trước khi dùng — đường dẫn `node` KHÔNG giả định
  `/usr/bin/node` vì tuỳ cách cài (apt/nodesource/nvm/tự biên dịch).
- `deploy/README.md` mục 1.1 (đổi số từ 1.0/1.1 cũ — mục siết quyền file
  dời thành 1.2) — bảng so sánh PM2 và systemd (nhiều worker/CPU, xem log,
  xoay vòng log, reload, cài thêm gì), hướng dẫn từng bước Cách B, ghi chú
  "nâng cao" cho ai muốn nhiều worker dưới systemd (unit template + nhiều
  cổng + nhiều dòng `upstream` trong Nginx — không triển khai chi tiết,
  chỉ nêu hướng). Cập nhật mọi chỗ dùng lệnh `pm2 ...` ở mục 4/7/FAQ thêm
  ghi chú "đang dùng Cách B thì đổi sang lệnh nào".
- Xác nhận qua `lib/clusterLeader.js` (không đổi code): chạy ngoài PM2
  (`NODE_APP_INSTANCE` không được đặt) tự coi là "leader duy nhất" — cron
  nội bộ (gửi email báo cáo/cảnh báo/dọn log định kỳ) vẫn chạy đúng 1 lần
  dưới Cách B, không cần cấu hình gì thêm.

## 6.1 — Tài khoản dịch vụ (service account) chạy ứng dụng + siết quyền file (docs-only)

Người dùng muốn cấp quyền hệ điều hành hạn chế cho tiến trình chạy app
(thay vì mặc định chạy dưới tài khoản SSH/root như trước đây) để giảm
thiệt hại nếu 1 lỗ hổng Node bị khai thác — thảo luận trước khi làm, chọn
phương án 1 tài khoản dịch vụ dùng chung cho cả 3 tiến trình (đơn giản,
khớp cách vận hành PM2 hiện có) + chỉ siết quyền file/thư mục cơ bản
(không đụng tới systemd hardening, không tách 3 tài khoản riêng — cân
nhắc lại sau nếu cần cô lập sâu hơn giữa 3 service). Không có thay đổi
code (docs-only) — trừ 1 phát hiện liên quan (cổng Node đang mở
`0.0.0.0`) được GHI NHẬN nhưng CHƯA vá theo yêu cầu người dùng, để đợt sau.

- `deploy/README.md` mục 1.0 (mới) — tạo tài khoản `hcrc` (`useradd
  --system --create-home --shell nologin`, khoá mật khẩu) chạy CẢ 3 tiến
  trình PM2, không login được, không sudo; toàn bộ cài đặt/build chạy
  trong 1 shell mở bằng `sudo -u hcrc -H -s /bin/bash`; `pm2 startup` dưới
  tài khoản không phải root chỉ in ra 1 lệnh cần dán chạy riêng bằng
  root — ghi rõ bước này.
- Mục 1.1 (mới) — siết quyền sau khi cài đặt xong: thư mục ứng dụng
  `chown hcrc:hcrc` + `chmod 750` (chỉ cấp thư mục, KHÔNG chỉnh từng file
  để không mất bit thực thi `node_modules/.bin/*` cần cho lần
  `npm install`/`build` sau), riêng `.env` siết thêm `600`; thư mục tĩnh
  `/var/www/hcrc` đổi `chown hcrc:www-data` + `750`/`640` (Nginx đọc được,
  không bao giờ ghi được).
- Cập nhật mọi chỗ dùng lệnh `pm2 ...` trực tiếp trong tài liệu (mục
  "Kiểm tra sau triển khai", "Xoay vòng log", FAQ) — nay PHẢI qua `sudo -u
  hcrc -H pm2 ...` vì tiến trình chạy dưới tài khoản khác, không phải
  tài khoản người vận hành.
- FAQ mới: phân biệt rõ tài khoản HỆ ĐIỀU HÀNH (`hcrc`, mục này) với tài
  khoản CSDL (`DWH_USER`/`RP_USER`/..., `*/grants.sql`, đã có từ trước) —
  2 lớp độc lập, tránh nhầm lẫn "làm 1 cái là đủ".
- **Ghi nhận, chưa vá (người dùng chọn để đợt sau)**: 3 `server.js` hiện
  `app.listen(PORT, ...)` không chỉ định địa chỉ — mặc định lắng nghe
  `0.0.0.0` dù Nginx chỉ gọi `127.0.0.1:400x`, nếu thiếu firewall chặn
  riêng 3 cổng `4001-4003` thì có thể gọi thẳng vào, bỏ qua giới hạn IP
  nội bộ của Nginx cho `api-admin`/`etl-admin`. Đã ghi chú hướng vá (firewall
  hoặc `app.listen(PORT, '127.0.0.1', ...)`) ngay trong `deploy/README.md`
  mục 1.1.

## 6.0 — Nới lỏng khoá đăng nhập cho tài khoản admin + vá lỗ hổng thiếu giới hạn ở 2FA setup/confirm

Người dùng kiểm tra thấy `/2fa/setup` (đổi thiết bị) và `/2fa/confirm`
(đăng ký lần đầu) KHÔNG có giới hạn số lần nhập sai riêng (chỉ có giới hạn
chung 300 request/phút cho toàn hệ thống) — trong khi `/2fa/verify` (bước
đăng nhập) đã có. Đồng thời người dùng đề nghị tài khoản admin không bao
giờ bị khoá vì sợ rủi ro khoá nhầm — sau khi trao đổi (khoá hiện tại đã
tự hết hạn sau 15 phút, không phải vĩnh viễn, và chỉ khoá theo từng cặp
IP+username nên không ảnh hưởng các admin khác/admin đó từ mạng khác),
người dùng chọn phương án NỚI LỎNG ngưỡng cho vai trò admin/IsSystemRole=1
thay vì bỏ hẳn giới hạn.

- `lib/loginRateLimit.js` (etl, api-server, rp-server) — thêm 2 "profile"
  ngưỡng: `DEFAULT_PROFILE` (10 lần/15 phút, giữ nguyên cho tài khoản
  thường) và `ADMIN_PROFILE` (50 lần/2 phút, áp dụng cho Role='admin'
  hoặc IsSystemRole=1). `isBlocked`/`recordFailure` nhận thêm tham số
  `profile` tuỳ chọn (mặc định `DEFAULT_PROFILE`, không đổi hành vi cũ
  nếu không truyền).
- `lib/adminAuth.js` (etl, api-server): thêm `getRoleForRateLimit(username)`
  — tra CHỈ cột Role (không so mật khẩu) TRƯỚC bước `isBlocked`, để chọn
  đúng profile mà không tốn bcrypt cho tài khoản đã bị khoá. Tương tự
  `lib/auth.js` (rp-server): `isSystemRoleForRateLimit(username)`.
- `routes/admin/auth.js` (etl, api-server) và `server.js` (rp-server):
  bước đăng nhập mật khẩu giờ tra Role/IsSystemRole trước, chọn
  `ADMIN_PROFILE` hoặc `DEFAULT_PROFILE` tương ứng rồi mới gọi
  `isBlocked`/`recordFailure` — username không tồn tại luôn rơi vào
  `DEFAULT_PROFILE` (ngưỡng chặt, đúng ý vì không có admin thật để bảo vệ).
- `routes/admin/twoFactor.js` (etl, api-server) và `routes/twoFactor.js`
  (rp-server):
  - `/setup` (nhánh đổi thiết bị, xác minh `currentCode`) — THÊM giới hạn
    mới, namespace `2fa-setup:<username>`, dùng `ADMIN_PROFILE` (route chỉ
    tới được với phiên admin/IsSystemRole đã đăng nhập).
  - `/confirm` (xác nhận mã đầu tiên khi đăng ký) — THÊM giới hạn mới,
    namespace `2fa-confirm:<username>`, dùng `ADMIN_PROFILE`.
  - `/verify` (bước 2FA khi đăng nhập) — SỬA lỗi đang dùng nhầm
    `DEFAULT_PROFILE` ngầm định (10 lần/15 phút) dù route này chỉ dành
    cho admin/IsSystemRole — nay dùng `ADMIN_PROFILE` tường minh.
- Test: file test mới xác minh cả 3 profile/route trên (fakeModule) +
  chạy lại 4 bộ test hồi quy có sẵn từ trước (`test-etl-2fa-flow.js`,
  `test-api-2fa-flow.js`, `test-rp-2fa-flow.js`, `test-login-hardening.js`)
  — phát hiện và sửa các mock CSDL giả lập trong chính các file test đó đã
  lỗi thời (thiếu cột `AuthSource`/`SessionsInvalidatedAt`/truy vấn
  `SELECT Role`/`IsSystemRole` mới, và 1 assertion còn thiếu trường
  `twoFactorEnabled`) — không phải lỗi ở code sản phẩm, chỉ là mock test
  chưa cập nhật theo các tính năng đã thêm ở các phiên bản trước.



Sổ tay DSMART16 (mục 11) trước đây chỉ dựng đầy đủ chiều "xuất" của
`DLVTRANS` (điều chuyển nội bộ), chiều "nhập" chỉ có 1 câu gợi ý chưa kèm
VIEW cụ thể, và chưa có domain nào cho "nhập hàng từ nhà cung cấp" (dù đã
nằm trong yêu cầu gốc "báo cáo hàng xuất & nhập") — hoàn thiện nốt phần còn
lại, không có thay đổi code (docs-only).

- `hướng_dẫn_báo_cáo.md` mục 11 — tách domain f) "Xuất hàng giữa các chi
  nhánh" (`xuatkho_chinhanh`) và g) "Nhập hàng giữa các chi nhánh"
  (`nhapkho_noibo_chinhanh`, cùng bảng `DLVTRANS` nhưng đổi chiều gộp theo
  `OSTK_ID`, tách Domain riêng — tránh cộng nhầm 2 chiều khi 1 chi nhánh
  vừa xuất vừa nhận trong ngày); thêm domain h) "Nhập hàng từ nhà cung cấp"
  (`nhaphang_nhacc`, nguồn `RV_ORDER` — có `SUPP_ID`, có cột `UPDATED` dùng
  làm watermark chính xác hơn `TRAN_DATE`); ghi chú domain nâng cao
  `STARGETS`/`STARGETS_ARC` (khả năng thay quy trình nhập chỉ tiêu tay,
  chưa dựng — cần đối chiếu DBA trước).

## 5.8 — Ánh xạ mã chi nhánh: quy đổi EntityCode khi 1 chi nhánh có nhiều mã khác nhau

Người dùng đề xuất: 1 chi nhánh vật lý có thể có NHIỀU mã khác nhau tuỳ
bảng nguồn (vd DSMART16: bảng doanh thu/tồn kho dùng `STK_ID`, bảng giao
dịch dùng `BU_ID` — chưa chắc trùng số), và muốn upload bảng tương ứng qua
ETL (giống cách nhập chỉ tiêu/KPI) để dùng làm tham chiếu lâu dài, tự sửa
được khi mã đổi mà không cần đụng code. Trước đây (mục 11
`hướng_dẫn_báo_cáo.md`) chỉ có thể xử lý việc này bằng cách viết cứng
JOIN/CASE vào VIEW phía DSMART16 — không tự sửa được qua giao diện.

- `etl-db/schema.sql` — bảng mới `etl.BranchCodeMap` (LoaiMaKhac, MaKhac ->
  MaChuan, TenSieuThi, TrangThai — khoá UNIQUE theo LoaiMaKhac+MaKhac); cột
  mới `etl.SyncJobs.BranchCodeMapType` (tuỳ chọn — job "Theo bảng" chọn
  đúng Loại mã cần áp dụng).
- `etl/lib/branchCodeMapImport.js` (mới) — parse Excel + upsert (staging +
  MERGE, cùng mẫu `salesTargetsImport.js`), giữ nguyên `TrangThai` cũ khi
  re-upload không đề cập (COALESCE, tránh âm thầm "mở lại" 1 dòng đã ngừng
  áp dụng).
- `etl/routes/admin/branchCodeMap.js` (mới) — GET danh sách (lọc theo
  LoaiMaKhac), PUT sửa/thêm 1 dòng, DELETE, POST nhập Excel — vai trò
  'admin' (không dùng vai trò hẹp 'target_importer', vì ảnh hưởng cách
  MỌI job "Theo bảng" ghi EntityCode).
- `etl/lib/tableSyncEngine.js` — `transformRow()` nhận thêm tham số
  `branchCodeMap` (Map, tuỳ chọn) + `unmappedCodes` (Set, tuỳ chọn): mã
  khớp thì quy đổi entityCode sang `MaChuan`, mã CHƯA khai vẫn giữ nguyên
  (không rớt dòng) và được gom vào `unmappedCodes`.
- `etl/jobs/runSync.js` — `runTableJob()` nạp TOÀN BỘ `etl.BranchCodeMap`
  cho đúng 1 `LoaiMaKhac` vào bộ nhớ MỘT LẦN trước vòng lặp dòng (không
  truy vấn lặp lại theo từng dòng nguồn), cảnh báo 1 lần/lượt chạy liệt kê
  các mã chưa ánh xạ.
- `etl/routes/admin/syncJobs.js` — POST/PUT nhận thêm `branchCodeMapType`.
- `etl-admin/` — trang mới "Ánh xạ mã chi nhánh" (upload Excel + sửa từng
  dòng, cùng mẫu trang "Nhập chỉ tiêu"); trang "Đồng bộ" thêm ô chọn "Ánh xạ
  mã chi nhánh" khi tạo job.
- `hướng_dẫn_báo_cáo.md` mục 11 — thêm mục "Ánh xạ mã chi nhánh khi 1 chi
  nhánh có nhiều mã khác nhau", cập nhật domain "Số lượng giao dịch"/"Tích
  điểm" (dùng `BU_ID`) trỏ đúng cơ chế mới thay vì chỉ nêu cảnh báo cần DBA
  xác nhận thủ công.

## 5.7 — Sửa lỗi CREATE TABLE etl.SyncLog: cột "RowCount" trùng từ khoá dành riêng T-SQL

Người dùng chạy `etl-db/schema.sql` qua SSMS, báo lỗi `Msg 156 ... Incorrect
syntax near the keyword 'RowCount'` đúng tại dòng khai báo cột `RowCount` —
`ROWCOUNT` là từ khoá dành riêng của T-SQL (liên quan câu lệnh `SET
ROWCOUNT`), không dùng được làm tên cột KHÔNG có ngoặc vuông bao quanh.
`CREATE TABLE etl.SyncLog` chưa từng chạy thành công ở bất kỳ đâu (lỗi xảy
ra ngay từ lần chạy `schema.sql` đầu tiên) nên không có dữ liệu cũ cần
chuyển đổi — đổi thẳng tên cột, không cần script migrate.

- `etl-db/schema.sql` — đổi cột `RowCount` → `RowsProcessed` trong
  `CREATE TABLE etl.SyncLog`.
- `etl/jobs/runSync.js` — câu `INSERT INTO etl.SyncLog` dùng đúng tên cột
  mới.
- `etl/routes/admin/log.js`, `etl/routes/admin/dashboard.js` — câu `SELECT`
  đổi thành `RowsProcessed AS RowCount` — JSON trả về API vẫn giữ nguyên
  field `RowCount` như cũ, KHÔNG cần sửa gì ở `etl-admin` (2 trang
  `LogPage.jsx`/`DashboardPage.jsx` vẫn đọc đúng key `RowCount` sẵn có).
- Rà soát lại cả 4 file `*/schema.sql` — không còn tên cột nào khác trùng
  từ khoá dành riêng T-SQL.

## 5.6 — Sổ tay kết nối DSMART16 (2 nguồn Live + Lịch sử) + file mẫu Nguồn dữ liệu

Yêu cầu: chuẩn bị phần kết nối ETL để lấy TOÀN BỘ dữ liệu từ hệ thống
trung tâm DSMART16 (schema 435 bảng người dùng đã gửi) qua 2 nguồn (CSDL
Live + CSDL Lịch sử) cho dữ liệu OLAP, chỉ cần điền tài khoản SQL thật.
Không có code mới — job "Theo bảng" hiện có (bảng/view + Dimensions/
Measures do admin tự chọn qua UI duyệt schema thật) đã đủ dùng, và không
thể tạo job thay người dùng từ phiên làm việc này (cần kết nối THẬT tới
CSDL DSMART16 để duyệt bảng/cột qua etl-admin, phiên này không có mạng tới
hạ tầng người dùng) — thay vào đó cung cấp: (1) đối chiếu tên cột CHÍNH
XÁC từ file schema đã gửi cho từng nhóm báo cáo (doanh thu/giao dịch/tích
điểm/tồn kho/xuất-nhập/thông tin siêu thị), giải quyết câu hỏi còn treo
"bảng nào là thông tin siêu thị" → xác nhận là `STOCK` (có `STK_NAME`/
`STK_ADDR`/`DIMENSION`/`ISCLOSED`, khác `NODE_DEF`/`BU_INFO` là bảng cấu
hình hạ tầng hệ thống, có `SRV_IP`/`PWD`); (2) xác nhận thiết kế 2-nguồn:
`SourceSystem` tự sinh theo `DataSourceId`, báo cáo `directDb` chỉ lọc
theo `Domain` → 2 nguồn cùng `Domain` tự ghép liền mạch, không cần cấu
hình gì thêm; (3) cảnh báo + mẫu VIEW gộp cho các bảng chi tiết theo SKU
(vd `DSTK_INFO`) — đồng bộ THẲNG bảng gốc với EntityCode=mã chi nhánh sẽ
bị ghi đè sai (khoá `ReportFacts` không có SKU) do engine "Theo bảng"
không tự GROUP BY.

- `hướng_dẫn_báo_cáo.md` — thêm mục 11: cách job "Theo bảng" hoạt động
  (1 dòng nguồn = 1 dòng ReportFacts, vì sao "đồng bộ hết 435 bảng" không
  khớp thiết kế), điều kiện 2 nguồn ghép chung Domain, sổ tay 6 nhóm domain
  (bảng/view nguồn, EntityCode/EventDate/watermark, Dimensions/Measures cụ
  thể — tick dư hơn nhu cầu 1 báo cáo để dùng lại cho báo cáo khác sau
  này), nêu rõ điểm CHƯA xác nhận được (mối liên hệ `BU_ID`↔`STK_ID`, mã
  `TYPE`/`STATUS` nghiệp vụ trong `TRANSHDR`/`CRDTRANS`) cần đối chiếu với
  DBA DSMART16 trước khi dùng thật.
- File mẫu `mau-nguon-du-lieu-dsmart16.xlsx` (gửi kèm, không lưu trong
  repo) — khớp đúng định dạng `etl/lib/dataSourcesImport.js`, đã dựng sẵn
  2 dòng `DSMART16 - Live`/`DSMART16 - Lich su`, chỉ cần điền Server/
  DatabaseName/Username/Password thật rồi tải lên etl-admin → Nguồn dữ
  liệu → "Nhập từ Excel" (tính năng đã có sẵn từ trước, không phải mới).

## 5.5 — Bổ sung bước tạo database trước khi chạy schema.sql

Người dùng báo chạy `dwh/schema.sql` qua SSMS "thành công" nhưng không
thấy database — đúng như thiết kế: cả 4 file `*/schema.sql` (`dwh/`,
`etl-db/`, `api-db/`, `rp-db/`) CHỈ tạo schema + bảng BÊN TRONG 1 database
đã có sẵn, KHÔNG tự `CREATE DATABASE` (đã ghi rõ trong chú thích đầu mỗi
file) — nhưng `deploy/README.md` trước đây CHƯA có bước tạo 4 database
trước khi chạy schema, khiến chạy nhầm vào database mặc định (vd `master`)
mà không có lỗi rõ ràng để biết — đặc biệt dễ gặp khi dùng SSMS (ô chọn
database ở toolbar không tự cảnh báo nếu quên đổi) hơn `sqlcmd -d <tên>`
(báo lỗi ngay nếu database chưa tồn tại).

- `deploy/README.md` mục 2 — thêm 4 câu `CREATE DATABASE` trước bước chạy
  schema, thêm lưu ý dùng SSMS phải tự kiểm tra ô chọn database, thêm cách
  kiểm tra/dọn lại nếu lỡ chạy nhầm database (`SELECT DB_NAME()`, `DROP
  TABLE`/`DROP SCHEMA`).

## 5.4 — Bật gzip cho file tĩnh 3 giao diện (Nginx)

Phát hiện khi rà soát câu hỏi "đã dùng compression chưa": `compression()`
(express) đã bật sẵn từ lâu cho cả 3 backend (`etl`/`rp-server`/`api-server`
— chỉ áp dụng cho response `/api/*`/`/admin/*`), NHƯNG file TĨNH của 3 giao
diện (`rp-user`/`api-admin`/`etl-admin` — JS/CSS bundle, vd ~250KB JS chính
+ ~420KB chunk Recharts, xem Giai đoạn A) do Nginx phục vụ TRỰC TIẾP
(không qua Node) thì KHÔNG được nén — `deploy/nginx.conf` trước đây không
có khối `gzip` nào, phụ thuộc hoàn toàn vào `nginx.conf` GỐC của hệ điều
hành có bật gzip mặc định hay không (không kiểm soát được từ repo này).

- `deploy/nginx.conf` — thêm `gzip on` + `gzip_types`/`gzip_min_length`/
  `gzip_comp_level`/`gzip_vary` vào cả 3 server block phục vụ file tĩnh
  (`report`/`api-admin`/`etl-admin`.hcrc.vidu.vn) — khai TƯỜNG MINH, không
  phụ thuộc giá trị mặc định. KHÔNG đụng domain `api.hcrc.vidu.vn` (không
  phục vụ file tĩnh nào, response `/api/v1/*` đã tự nén từ api-server).
- `deploy/README.md` mục 4 — thêm bước kiểm tra `curl -H "Accept-Encoding:
  gzip"` xác nhận header `Content-Encoding: gzip` trên file JS thật sau khi
  triển khai.

## 5.3 — Sửa công thức "Tỷ lệ % LFL" trong ví dụ hướng_dẫn_báo_cáo.md mục 1

Phát hiện khi demo báo cáo "BRGMART - Báo cáo nhanh doanh thu" theo đúng
mẫu thật người dùng gửi (số liệu thật, không phải dữ liệu bịa) — đối chiếu
công thức ví dụ trong mục 1 với số liệu mẫu thật thì SAI: ví dụ cũ tính
`(current - lastYear) / lastYear * 100` (tăng trưởng, vd "+10%"), nhưng
kiểm chứng qua nhiều dòng số liệu mẫu thật (cả cột doanh thu lẫn giao dịch)
thì "Tỷ lệ % LFL" thực tế là TỶ SỐ `current / lastYear * 100` (vd "110%" —
cùng cách tính với "Tỷ lệ đạt" so chỉ tiêu, KHÔNG PHẢI phần trăm tăng
trưởng) — sửa lại công thức ví dụ cho khớp đúng quy ước thật.

Demo đầy đủ báo cáo này (composite 3 khối current/lastYear/target, 33 chi
nhánh MART+MINIMART, đủ cột doanh thu/lãi gộp/giao dịch/trung bình GD/
doanh thu-m2, dòng "Tổng cộng" theo nhóm) chạy qua ĐÚNG
`compositeReportRunner.js`/`formulaEngine.js` thật (không giả lập kết quả
tính sẵn) — số liệu tính ra khớp gần như tuyệt đối với mẫu PDF (chênh lệch
1 đơn vị ở vài chỗ do làm tròn tầng cuối, không đáng kể) — xác nhận cả
kiến trúc composite (Giai đoạn cũ) lẫn biểu đồ (Giai đoạn A) hoạt động
đúng trên 1 báo cáo thật, đủ phức tạp.

## 5.2 — Rà soát hướng dẫn triển khai production (`deploy/README.md`)

Theo yêu cầu kiểm tra tài liệu deploy đã có khớp code hiện tại chưa (sau
nhiều đợt thay đổi) — rà soát toàn bộ `deploy/README.md`/`deploy/nginx.conf`/
`deploy/ecosystem.config.js` đối chiếu với code thật (biến môi trường bắt
buộc, route health, tên tiến trình PM2/cổng, script `seed:admin`, file
schema/grants, domain + CSP trong nginx.conf, cột `TwoFactorEnabled`, cấu
hình chống restart-loop, `lib/processGuards.js`, lệnh build/`dist/`). Kết
quả: tài liệu đã khớp code — không có sai lệch, chỉ bổ sung 2 chỗ còn
thiếu (không phải sửa lỗi):

- Thêm ghi chú về chế độ cluster PM2 (mặc định 2 worker/app, 6 tiến trình
  Node tổng cộng) vào mục 1 — trước đây chỉ giải thích trong chú thích code
  (`deploy/ecosystem.config.js`), chưa có trong README: mỗi worker tự mở
  pool CSDL RIÊNG, tổng kết nối thật = `instances × *_POOL_MAX`, cần tính
  lại cả 2 số cùng lúc khi đổi 1 trong 2 (tránh vượt giới hạn kết nối SQL
  Server khi tăng `instances` theo số lõi CPU mà quên chỉnh `*_POOL_MAX`).
- Làm rõ mục 4 (checklist sau triển khai): `GET /health` của etl trả dạng
  response HƠI KHÁC 2 route health kia (`db` là chuỗi `"ok"|"error"`,
  không phải object `{rp,dwh}`/`{admin,dwh}`, không có `version`) — etl chỉ
  có 1 pool CSDL quản trị cần ping, không có DWH riêng để phân biệt.

## 5.1 — Hướng Power BI, Giai đoạn D: Drill-through

Tiếp lộ trình 4 giai đoạn (A: biểu đồ, B: pivot, C: dashboard lọc chéo) —
bấm 1 điểm trên biểu đồ nhảy sang MỘT báo cáo KHÁC đã lọc sẵn:

- Thêm khoá tuỳ chọn `visualization.drillThrough: {field, targetReportId}`
  — `field` là field LỌC ở báo cáo ĐÍCH (có thể khác `xField` của biểu đồ
  nguồn), `targetReportId` là báo cáo đích (phải có quyền xem — đi qua
  ĐÚNG `/api/reports/:reportId(/run)` đã có sẵn, không có đường tắt bỏ qua
  `RoleReportAccess`). Backend KHÔNG cần đổi gì — `visualization` đã được
  forward nguyên vẹn từ trước (Giai đoạn A).
- `rp-user/src/modules/reports/ReportsPage.jsx` — đọc/ghi
  `?reportId=&filters=` qua `useSearchParams` để chuyển báo cáo + tự điền
  bộ lọc + TỰ CHẠY ngay (không cần bấm "Lọc" lại) khi đến từ 1 lượt bấm
  drill-through — vẫn CÙNG trang `/reports`, không dựng route/khung riêng.
  Dropdown "Chọn báo cáo" tự thêm 1 lựa chọn tạm khi báo cáo đích thuộc
  nhóm nghiệp vụ khác tab đang mở.
- CHỈ áp dụng cho bar/line/pie — KHÔNG áp dụng cho `"kpi"` (không có 1 giá
  trị đơn lẻ để lọc theo), `"pivot"` (bấm ô đã dành cho drill-down), và
  tile trong Dashboard (bấm biểu đồ trong dashboard đã dành cho lọc chéo —
  `drillThrough` bị bỏ qua nếu khai ở báo cáo dùng làm tile, không xung đột).
- Sửa 1 lỗi phát hiện qua test: `rp-user/src/components/ReportChart.jsx` —
  `onPointClick` trước đó chỉ truyền `(field, value)` của ĐÚNG `xField` vừa
  bấm, không đủ cho drill-through khi `drillThrough.field` KHÁC `xField`
  (test thực tế bắt được: bấm cột "CN Quận 1" ra đúng tên chi nhánh thay vì
  mã cửa hàng cần lọc) — đổi chữ ký thành `onPointClick(row, xField)` (dòng
  dữ liệu gốc lấy từ `data.payload` của Recharts, không dùng thẳng `data`
  vì có nguy cơ field nội bộ Recharts đè lên field thật cùng tên) — cross-
  filter Dashboard (`DashboardTile.jsx`, Giai đoạn C) cập nhật theo, test
  lại xác nhận không hỏng.
- Test: Playwright demo drill-through 2 báo cáo thật (bar chart lọc theo
  field khác `xField` → báo cáo đích tự điền đúng giá trị + tự chạy đúng
  số dòng) + chạy lại toàn bộ test Giai đoạn C (cross-filter, nút "Xem
  bảng") xác nhận không hồi quy sau khi đổi chữ ký `onPointClick`.
- Tài liệu: `hướng_dẫn_báo_cáo.md` mục 10 (mới) — cấu trúc, phân biệt với
  drill-down (pivot, mục 8), phạm vi áp dụng.

## 5.0 — Dashboard: thêm nút "Xem bảng" cho từng tile (không bớt bảng số)

Theo phản hồi "bảng số vẫn cần cho các trường hợp báo cáo, không bỏ" — ở
bản 4.9, mỗi tile Dashboard bị đặt cứng luôn hiện biểu đồ/pivot, KHÔNG có
lựa chọn xem lại bảng số như trang Báo cáo (`ReportsPage.jsx` đã có nút
này từ Giai đoạn A). Sửa cho nhất quán:

- `rp-user/src/modules/dashboard/DashboardTile.jsx` — thêm state
  `showTable` cục bộ mỗi tile + nút "📋 Xem bảng"/"📊 Xem biểu đồ" (chỉ hiện
  khi tile có khai `visualization` — tile không khai thì vốn đã luôn là
  bảng, không có gì để bấm). `showTable=true` LUÔN thắng, đúng luật đã
  dùng ở `ReportBody.jsx`.
- `rp-user/src/styles.css` — `.dashboard-tile-header`/`.dashboard-tile-toggle`.
- Test: Playwright xác nhận nút chỉ hiện đúng ở tile có biểu đồ, bấm "Xem
  bảng" ra đúng số dòng, và lọc chéo (4.9) vẫn hoạt động bình thường sau
  khi bật/tắt bảng.

## 4.9 — Hướng Power BI, Giai đoạn C: Dashboard nhiều biểu đồ + lọc chéo

Tiếp lộ trình 4 giai đoạn (sau A: biểu đồ, B: pivot) — dashboard gồm nhiều
"tile", mỗi tile TRỎ TỚI 1 báo cáo đã có (không định nghĩa lại nguồn dữ
liệu/công thức riêng), bấm vào 1 biểu đồ ở tile này lọc lại các tile khác:

- `rp-db/schema.sql` — bảng `app.Dashboards` mới (`DashboardId`, `Title`,
  `DefinitionJson` chứa `{ tiles: [{key, reportId, title?}] }`, `IsActive`)
  — KHÔNG thêm bảng ACL riêng, tận dụng lại đúng menu `dashboard` (đã có
  sẵn từ trước) + `app.RoleReportAccess` của từng báo cáo mà tile trỏ tới.
- `rp-server/routes/dashboardCatalog.js` (mới) — CRUD admin, validate cấu
  trúc `tiles` (khoá `key` không trùng, có `reportId`) + đối chiếu
  `reportId` với `app.ReportCatalog` THẬT trước khi lưu (báo lỗi ngay lúc
  admin lưu, không đợi người dùng mở dashboard mới phát hiện trỏ sai).
- `rp-server/routes/dashboards.js` (mới, mount `/api/dashboards`) — xem
  cho người dùng cuối: `GET /` danh sách dashboard đang hoạt động, `GET
  /:id` trả `{title, tiles}` đã LỌC BỚT tile nào role không có quyền xem
  báo cáo tương ứng (dùng `req.userContext.reportIds` có sẵn từ
  `requireMenuAccess`) — ẩn hẳn, không hiện "ô lỗi 403" gây khó hiểu.
- `rp-user/src/components/ReportBody.jsx` (mới) — tách phần chọn DataTable/
  PivotTable/ReportChart ra khỏi `ReportsPage.jsx` (trước là hàm nội bộ
  `renderReportBody()`) để dùng chung với tile dashboard, không viết lại
  logic 2 nơi.
- `rp-user/src/modules/dashboard/DashboardTile.jsx` (mới) + viết lại
  `DashboardPage.jsx` (trước là khung trống chờ yêu cầu) — trang liệt kê
  dashboard (nếu >1), vẽ lưới tile, giữ 1 state `crossFilters` DÙNG CHUNG:
  mỗi tile LUÔN gửi toàn bộ `crossFilters` làm bộ lọc khi chạy báo cáo của
  mình — field nào báo cáo đó không khai thì rp-server tự bỏ qua (hành vi
  đã có sẵn ở `reportEngine.js`), nên KHÔNG cần khai "tile nào lọc theo
  tile nào" trong `DefinitionJson`. Thanh "Đang lọc chéo" hiện các field
  đang áp dụng + nút xoá từng cái/xoá hết.
- `rp-user/src/components/ReportChart.jsx` — sửa `onClick` từ đặt ở cấp
  `<BarChart>`/`<LineChart>` (đọc `activePayload` nội bộ Recharts, chỉ cập
  nhật qua `mousemove` trước đó — phát hiện qua test Playwright: click lập
  trình không kích hoạt được) sang đặt TRỰC TIẾP trên từng `<Bar>`/`<Line>`
  (nhận thẳng payload điểm đã bấm) — đúng cả với chuột thật lẫn test tự
  động, không phụ thuộc trạng thái hover trước đó.
- `rp-user/src/modules/system/report-catalog/DashboardsPanel.jsx` (mới) +
  thêm tab "Dashboard" vào `ReportCatalogPage.jsx` — CRUD cùng khuôn các
  tab khác (`DefinitionJson` sửa dạng textarea JSON thô).
- Test: script Node (mock `db.js`/`lib/auth.js`/`lib/auditLog.js`, gọi qua
  HTTP thật vào router thật) cho `dashboardCatalog.js`/`dashboards.js` —
  validate tiles, đối chiếu `reportId`, và ĐẶC BIỆT xác nhận tile bị LỌC
  ĐÚNG theo quyền báo cáo của từng vai trò (15/15 assertion PASS) + Playwright
  chụp demo dashboard 2 tile, bấm cột biểu đồ ở tile 1 → tile 2 lọc lại
  đúng (6 dòng còn 2 dòng), không lỗi console, không vi phạm CSP (không
  còn `style=""` inline nào trong bundle build).
- Tài liệu: `hướng_dẫn_báo_cáo.md` thêm mục 9 — cấu trúc `DefinitionJson`,
  mô hình quyền, cơ chế lọc chéo.

## 4.8 — Hướng Power BI, Giai đoạn B: bảng Pivot/cross-tab + drill-down

Tiếp lộ trình 4 giai đoạn (sau A: biểu đồ) — thêm `visualization.type =
"pivot"` cho báo cáo, KHÔNG cần gọi lại API để đổi chiều/tổng hợp hay
drill-down (mọi việc chạy trên `rows` đã tải sẵn từ lượt `/run` đầu tiên):

- `rp-user/src/lib/pivot.js` (mới) — hàm thuần `buildPivot(rows, {rowField,
  colField, valueField, agg})` nhóm theo 2 chiều + cộng dồn
  (`sum`/`avg`/`count`), giữ nguyên mảng dòng gốc theo TỪNG Ô (phục vụ
  drill-down) — tách riêng khỏi component để test bằng script Node thường,
  không cần dựng React/JSDOM.
- `rp-user/src/components/PivotTable.jsx` (mới) — vẽ lưới hàng×cột + dòng/
  cột "Tổng" (tính từ TOÀN BỘ dòng gốc khớp điều kiện, không cộng lại các ô
  đã tổng hợp — đúng cho cả `avg`). Bấm 1 ô số → xổ bảng chi tiết đúng các
  dòng gốc tạo nên ô đó (`DataTable` dùng lại, không gọi API mới) — bấm lại
  hoặc "Đóng" để thu gọn.
- `ReportsPage.jsx`: `renderReportBody()` (tách khỏi JSX chính cho dễ đọc)
  chọn DataTable/PivotTable/ReportChart tuỳ `visualization.type` + trạng
  thái nút chuyển đổi — nút đổi nhãn theo ngữ cảnh ("🔀 Xem Pivot" khi đang ở
  bảng chi tiết của 1 báo cáo pivot, khác nhãn "📊 Xem biểu đồ" của báo cáo
  chart).
- Không kéo thêm thư viện nào (thuần React + JS) — bundle chính chỉ tăng
  ~3KB gzip, không cần tách chunk riêng như Recharts ở Giai đoạn A.
- Test: script Node độc lập cho `pivot.js` (cộng dồn nhiều dòng cùng ô,
  null cho ô trống/thiếu số — không phải 0, cả 3 kiểu agg, `cellRawRows()`
  đúng cho drill-down) + Playwright chụp demo bảng pivot + drill-down, xác
  nhận không vi phạm CSP.
- Tài liệu: `hướng_dẫn_báo_cáo.md` mục 8 bổ sung cấu trúc `"pivot"`.

## 4.7 — Hướng Power BI, Giai đoạn A: biểu đồ (bar/line/pie/KPI) thay bảng số

Theo yêu cầu "xây dựng theo hướng báo cáo Power BI" — bắt đầu lộ trình 4
giai đoạn (A: biểu đồ, B: pivot, C: dashboard lọc chéo, D: drill-through)
bằng giai đoạn nhẹ nhất, không đổi CSDL/backend đáng kể:

- Thêm khoá tuỳ chọn `"visualization": { type, xField, valueFields }` vào
  `DefinitionJson` — rp-server đã tự forward nguyên key này (không lọc bớt
  như các trường nội bộ khác), chỉ cần thêm đúng 1 dòng ở
  `routes/reports.js` (`GET /:reportId`) để lộ ra cho rp-user. Xem
  `hướng_dẫn_báo_cáo.md` mục 8 cho cấu trúc đầy đủ + ví dụ.
- `rp-user/src/components/ReportChart.jsx` (mới) — vẽ bar/line/pie (thư
  viện **Recharts v3**, `npm install recharts@3`) hoặc thẻ KPI (cộng dồn
  toàn báo cáo, ưu tiên dùng dòng "Tổng cộng" có sẵn nếu composite report
  đã tính). `ReportsPage.jsx` tự chọn Chart hay DataTable tuỳ báo cáo có/
  không khai `visualization`, kèm nút "📋 Xem bảng"/"📊 Xem biểu đồ" cho
  người xem tự chuyển đổi (giống Power BI: 1 visual luôn xem lại được
  dạng bảng).
- **Tối ưu cỡ file**: Recharts kéo theo ~190KB gzip (d3-shape/d3-scale) —
  tách thành 1 chunk RIÊNG qua `React.lazy()`, chỉ tải khi người dùng thật
  sự mở 1 báo cáo có `visualization` (đa số báo cáo hiện tại chưa có) —
  bundle chính giữ nguyên ~73KB gzip như trước, không bắt mọi người dùng
  tải thêm dù không xem báo cáo nào có biểu đồ.
- **Xác nhận không phá CSP vừa siết ở 4.6**: Recharts là SVG, có set
  `style=""` nội tuyến qua React trên vài phần tử — đã kiểm tra bằng
  Playwright với `style-src 'self'` (không unsafe-inline) giống hệt
  `deploy/nginx.conf` thật, KHÔNG có vi phạm CSP nào (biểu đồ SVG không đụng
  `style-src`, chỉ CSS class + thuộc tính SVG thường).
- `isAnimationActive={false}` ở mọi biểu đồ — Recharts mặc định vẽ dần lúc
  mount (Pie đặc biệt rõ: sector quét dần từ góc 0), gây hiện tượng biểu đồ
  "trống trơn" nếu chụp/đọc đúng lúc animation chưa xong — tắt hẳn để LUÔN
  hiện đúng trạng thái cuối ngay khi vẽ.
- Trục Y hiện số rút gọn kiểu Việt ("120 Tr" thay vì "120000000",
  `Intl.NumberFormat('vi-VN', {notation:'compact'})`) — số nguyên đầy đủ
  vẫn hiện khi rê chuột (tooltip).
- Test: script Node độc lập (route `GET /:reportId` trả đúng
  `visualization`/`null`) + Playwright chụp demo bar/pie/KPI + xác nhận
  chuyển đổi bảng↔biểu đồ + không vi phạm CSP.

## 4.6 — Loại bỏ toàn bộ style nội tuyến + thêm Content-Security-Policy cho 3 giao diện tĩnh

Theo yêu cầu: kiểm tra "unsafe inline" ở index.html của 3 giao diện
(`etl-admin/`, `api-admin/`, `rp-user/`) và loại bỏ theo hướng khác.

- **Rà soát**: `index.html` (cả bản nguồn lẫn bản build `dist/`) của cả 3
  app KHÔNG có `<script>`/`<style>` nội tuyến nào — Vite build luôn tách JS/CSS
  ra file riêng (`/assets/index-*.js`/`.css`), không nhúng thẳng vào HTML.
  KHÔNG có `dangerouslySetInnerHTML`/`eval()`/`new Function()` ở đâu trong
  cả 3 mã nguồn React. Điểm "unsafe-inline" thật sự nằm ở việc **KHÔNG có
  Content-Security-Policy header nào cả** — cả 3 service Node đều tắt hẳn
  CSP của helmet (`contentSecurityPolicy: false`, ĐÚNG vì các service đó chỉ
  trả JSON qua `/api/*`/`/admin/*`, không phục vụ HTML — xem comment gốc),
  và `deploy/nginx.conf` (nơi THẬT SỰ phục vụ HTML/JS/CSS cho 3 giao diện)
  chưa từng khai CSP — thiếu CSP tương đương cho phép mọi nguồn/mọi inline,
  cùng mức rủi ro với 'unsafe-inline' tường minh nếu sau này có lỗ XSS.
- **Loại bỏ điểm chặn duy nhất để dùng CSP chặt** (`script-src`/`style-src`
  CHỈ `'self'`, không cần 'unsafe-inline'): 9 chỗ dùng `style={{...}}` nội
  tuyến trong React (`LoginPage.jsx` x3 app — card 2FA rộng hơn card đăng
  nhập thường + cỡ chữ tên thương hiệu ở khối hero; `ReportCatalogPanel.jsx`
  rp-user — ô nhập bộ lọc giãn hết dòng + khối kết quả "Chạy thử" cuộn dọc)
  — chuyển hết sang class CSS mới trong `src/styles.css` từng app
  (`.login-card--narrow`, `.sidebar-brand-name--hero`, `.flex-1`,
  `.table-scroll--result`).
- **Thêm CSP** vào 3 domain THẬT SỰ phục vụ HTML tĩnh trong
  `deploy/nginx.conf` (report/api-admin/etl-admin — KHÔNG thêm cho
  api.hcrc.vidu.vn, domain đó chỉ trả JSON cho đối tác, không có HTML nào):
  `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'
  data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri
  'self'; frame-ancestors 'none'; form-action 'self'`. `img-src` PHẢI giữ
  `data:` — màn hình đăng ký 2FA hiện mã QR qua `<img src="data:image/...">`
  (thư viện `qrcode` sinh thẳng data URI, không phải file ảnh), thiếu dòng
  này sẽ chặn luôn được bước bắt buộc đăng ký 2FA. Kèm thêm
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin` — cùng lỗ hổng "helmet
  chỉ phủ JSON API, không phủ HTML tĩnh Nginx phục vụ riêng".
- Build sạch cả 3 app (không lỗi/warning). Chụp màn hình xác nhận (Playwright,
  giả lập API) trang đăng nhập (chữ "HCRC" cỡ hero) và màn "Bắt buộc đăng
  ký 2FA" (card rộng 420px, mã QR data URI hiện đúng) — giống hệt trước khi
  đổi từ inline style sang class.

## 4.5 — Composite report: loại riêng thực thể lỗi thay vì im lặng sai/chặn cả báo cáo

Theo yêu cầu (sau khi so sánh 2 lựa chọn "giữ cảnh báo" và "chặn cứng" ở
bản 4.4): làm phương án giữa cho `rp-server/lib/compositeReportRunner.js`
khi 1 khối nguồn trả về NHIỀU HƠN 1 dòng cho cùng entityCode (dấu hiệu lỗi
cấu hình filter, xem Q8 bản trước) —
- **Trước đây**: chỉ `console.warn()`, vẫn giữ dòng cuối cùng gặp được →
  hiện số liệu CÓ THỂ SAI mà không ai biết trên giao diện.
- **Giờ**: LOẠI HẲN đúng thực thể đó khỏi kết quả (không đụng tới các thực
  thể khác — báo cáo vẫn chạy bình thường cho phần còn lại), và trả thêm
  `warnings: string[]` trong response `/reports/:id/run` — rp-user hiện
  banner cảnh báo màu cam phía trên bảng dữ liệu ("Đã loại N thực thể khỏi
  báo cáo do dữ liệu nguồn không nhất quán..."), không lộ entityCode cụ thể
  ra giao diện người dùng cuối (chi tiết vẫn ở log server qua `console.warn`
  cho admin).
- Áp dụng cho cả 2 nhánh trả về (có/không `groupBy`) — dòng "Tổng cộng" tự
  động không cộng cả thực thể bị loại (tính từ `mergedRows` đã lọc).
- Test bằng script Node độc lập: entity bình thường vẫn xuất hiện, entity
  có khối trả 2 dòng bị loại đúng + có warning; không có entity lỗi thì
  warnings rỗng, không đổi hành vi cũ. Build sạch rp-user.

## 4.4 — Rà soát báo cáo bảo mật/kiến trúc lần 2 (Copilot Chat) — 1 lỗi thật, còn lại đã vá/không đúng

Team security gửi tiếp 1 báo cáo dài (2 phần: bảo mật chung + kiến trúc/logic
nghiệp vụ) từ Copilot Chat — rà lại từng mục với code thật trước khi sửa,
vì nhiều mục đã lỗi thời (không cập nhật các đợt vá 4.1-4.3 trong phiên làm
việc này) hoặc suy đoán sai. Kết quả:

- **Lỗi thật, đã vá**: `etl/routes/admin/syncJobs.js` — tạo/sửa job KHÔNG
  kiểm tra `cronExpression` hợp lệ lúc lưu (POST/PUT). `jobs/scheduler.js`
  có `cron.validate()` nhưng chỉ `console.error()` rồi bỏ qua (job coi như
  tắt, không cron nào chạy) — KHÔNG báo gì lên giao diện. Admin gõ sai cú
  pháp cron vẫn thấy lưu "thành công", job không bao giờ tự chạy, chỉ phát
  hiện được nếu soi log console server. Giờ chặn ngay lúc lưu bằng
  `cron.validate()`, trả 400 rõ ràng.
- **Repo đang PUBLIC thật** — xác nhận đúng qua GitHub, nhưng đây là quyết
  định của người dùng (đổi private ảnh hưởng ai truy cập được), không tự ý
  đổi — đã báo lại rõ, chờ người dùng quyết.
- **Đã vá TỪ TRƯỚC (báo cáo không cập nhật)**: zip-bomb guard cho
  `api-server/lib/dataSourcesImport.js` (bản 4.3), khả năng xoay khoá mã
  hoá (`lib/crypto.js` x3, bản 4.3), rate limit đăng nhập, 2FA, custom
  connector dùng whitelist tĩnh (không `require()` động).
- **Sai/không phải lỗi (đã xác minh lại với code thật)**:
  - `api-server/routes/admin/consumers.js` rotate API key — ĐÃ gọi
    `invalidate()` ngay sau khi đổi CSDL, không có khoảng hở cache 30s.
  - `rp-server/routes/roles.js` — ĐÃ gọi `invalidateAll()` sau mọi lượt sửa
    quyền vai trò (PUT tên, xoá, gán menu, gán báo cáo) — cache KHÔNG bị hở
    khi đổi quyền vai trò.
  - `compositeReportRunner.js: deepSumBlock()` — báo cáo cho rằng nhóm toàn
    giá trị `null` sẽ cộng ra `0`; dò lại code: nhánh `values.some(v =>
    typeof v === 'number')` false khi TOÀN BỘ giá trị null → rơi xuống
    `values.find(v => v !== null)` → `undefined`, không phải `0`. Không có
    lỗi này.
  - `api-server/routes/v1/reports.js` — thứ tự kiểm tra "quyền trước, tồn
    tại sau" là CHỦ Ý (chống dò danh mục ReportId qua phân biệt 403/404),
    đúng như comment trong code — không phải lỗi.
  - `formulaEngine.js` không dùng `eval()` (tokenizer/parser riêng) — an
    toàn như báo cáo tự xác nhận ở phần sau.
- **Chưa sửa, mức thấp, cần thêm thời gian đánh giá cùng người dùng**: cảnh
  báo (không chặn) khi 1 khối composite trả nhiều dòng cho cùng entityCode
  — đã có từ bản trước (Q8), giữ nguyên chủ ý "không chặn cả báo cáo vì 1
  khối lỗi"; kiểm tra chéo domain giữa khối `isTarget` và khối `directDb`
  trong composite report — chưa thêm, vì đây là tính năng CHO PHÉP kết hợp
  domain tuỳ ý (không phải luôn phải trùng), cần người dùng xác nhận có
  muốn thêm cảnh báo hay không trước khi đổi.
- Test bằng script Node độc lập: POST/PUT `/admin/sync-jobs` với cron sai
  cú pháp → 400 kèm thông báo rõ; cron đúng vẫn tạo/sửa job bình thường.

## 4.3 — Xử lý các phát hiện của team security (rà soát + vá)

Team security đưa checklist 15 mục kèm mức độ nghiêm trọng — rà soát lại
TỪNG mục với code thật (không nhận nguyên bảng) trước khi xử lý, vì vài mục
đã được vá ở các vòng trước đó trong phiên làm việc này (magic byte, rate
limit đăng nhập, 2FA, JWT iss/aud, CORS) nên có thể team đã đánh giá dựa
trên thông tin cũ. Kết quả rà soát + vá:

- **Formula injection khi xuất Excel** (`rp-server/lib/exportExcel.js`) —
  giá trị ô bắt đầu bằng `=`/`+`/`-`/`@` (đến từ dữ liệu nguồn, không phải
  do server tự sinh) bị Excel hiểu thành công thức sống khi mở file — thêm
  dấu nháy đơn ở đầu (chuẩn khắc phục OWASP) trước khi ghi ra file xuất.
- **"Zip bomb" khi nhập Excel** — `etl/lib/dataSourcesImport.js`,
  `etl/lib/salesTargetsImport.js`, `api-server/lib/dataSourcesImport.js` gọi
  thẳng `workbook.xlsx.load(buffer)` (giải nén toàn bộ vào RAM) mà không có
  giới hạn dung lượng SAU giải nén — thêm `guardZipBombSize()`
  (`lib/fileSignature.js` x2: etl, api-server) tự đọc End Of Central
  Directory + Central Directory của định dạng ZIP (không cần thư viện
  ngoài) để ước lượng dung lượng thật TRƯỚC khi giải nén, chặn ở 200MB.
- **Thiếu nhật ký thao tác (Audit Log)** ở 2 route: `api-server/routes/v1/oauth.js`
  (`POST /token` — phát hành/từ chối access token cho đối tác OAuth2) và
  `rp-server/routes/reports.js` (`POST /:reportId/export` — xuất báo cáo) —
  cả 2 giờ đã ghi log đúng mẫu các route khác.
- **Thời gian phiên đăng nhập admin** — rút `TOKEN_TTL` từ 8h xuống **2h**
  ở cả 3 service (`etl/lib/adminAuth.js`, `api-server/lib/adminAuth.js`,
  `rp-server/lib/auth.js`), kèm cơ chế **"trượt phiên"**: còn dưới 30 phút
  là hết hạn thì `requireAuth()`/`requireAdminAuth()` tự phát hành token mới
  (TTL lại đủ 2h) ngay trong request đang xử lý — admin còn thao tác không
  bao giờ bị văng ra giữa chừng, nhưng ngừng thao tác quá 2h liên tục thì
  vẫn phải đăng nhập lại như cũ. Không cần endpoint refresh riêng, không đổi
  gì ở frontend.
- **Khả năng xoay khoá mã hoá** — `lib/crypto.js` (x3: etl, api-server,
  rp-server) chuyển từ 1 khoá tĩnh duy nhất sang hỗ trợ **thêm 1 khoá CŨ
  tuỳ chọn** (`*_ENCRYPTION_KEY_PREVIOUS` trong `.env`, để trống = hành vi
  cũ 100%): mã hoá LUÔN dùng khoá hiện hành, giải mã thử khoá hiện hành
  trước — chỉ thử khoá cũ khi khoá hiện hành lỗi (AES-256-GCM tự phát hiện
  sai khoá qua authTag, không có rủi ro giải mã nhầm). Đây là NĂNG LỰC
  trong code để vận hành viên tự xoay khoá thật sau này khi cần (theo yêu
  cầu), KHÔNG phải một lượt xoay khoá thật đã thực hiện.
- **CSRF trên route admin** — team đánh giá ❌ mức CAO; rà soát lại thấy rủi
  ro thật đã được giảm đáng kể từ trước: cookie phiên `httpOnly` +
  `SameSite=Lax`, KHÔNG có route đổi trạng thái nào chấp nhận GET, và
  không có luồng nào dựa vào cookie tự động gửi kèm từ site khác theo cách
  CSRF cổ điển khai thác được. Không thêm lớp CSRF token riêng ở vòng này —
  ghi nhận là rủi ro thấp hơn đánh giá gốc, không phải bỏ qua.
- **Đã xác nhận LẠI đúng** (không cần vá thêm) qua rà soát: rate limit đăng
  nhập (`isBlocked`/`recordFailure`/`recordSuccess`), error handler chung
  không lộ chi tiết lỗi, HTTPS redirect ở tầng Nginx.
- Test bằng script Node độc lập (không cần CSDL): xoay khoá mã hoá (mã hoá/
  giải mã qua cả 2 khoá), `guardZipBombSize` (file hợp lệ/vượt giới hạn/
  ZIP64/không phải ZIP), sanitize formula injection (đọc lại buffer Excel
  bằng ExcelJS xác nhận đúng ký tự `'` được thêm), TTL token = 2h, và luồng
  `requireAuth()` đầy đủ cho 3 trường hợp trượt phiên (còn hạn xa/gần hết
  hạn/đã bị thu hồi).

## 4.2 — Thiết kế lại giao diện đăng nhập + trang chủ cho cả 3 giao diện quản trị/người dùng

Theo yêu cầu: giao diện đăng nhập + trang chủ (sau đăng nhập) của
`etl-admin/`, `api-admin/`, `rp-user/` chuyển sang phong cách chuyên
nghiệp — sidebar tối màu (navy), logo tròn chữ **H**, trang đăng nhập dạng
"hero" gradient + card trắng, theo đúng tinh thần ảnh tham khảo (ứng dụng
"HCRC Workspace"). KHÔNG đổi logic nghiệp vụ/route/API nào — chỉ giao diện
(CSS + cấu trúc JSX hiển thị).

- **Đăng nhập** (`pages/LoginPage.jsx` x3): chuyển từ card đơn giản giữa
  màn hình sang bố cục chia đôi — bên trái "hero" gradient tối (logo H,
  tiêu đề/mô tả riêng theo đúng chức năng từng hệ thống, ghi chú "hệ thống
  nội bộ"), bên phải card trắng bo góc với ô nhập có icon 👤/🔒. Bước 2FA
  (xác thực/bắt buộc đăng ký) dùng chung style card, không có hero riêng.
- **Sidebar** (`components/Layout.jsx` x3): nền navy đậm (`#0a1628`), logo
  H tròn nền trắng (màu chữ = màu chủ đạo riêng từng app — tím etl-admin/
  teal api-admin/cam rp-user, giữ được bản sắc riêng), mục menu có emoji
  + trạng thái active làm nổi bật viền trái, chân trang có tên/vai trò +
  nút "↩ Đăng xuất" màu đỏ. `rp-user` (menu động theo `me.menu` từ CSDL)
  thêm nút thu/mở (chevron ▾/▸) cho nhóm "Hệ thống", trước đây luôn mở cố định.
- **Trang chủ/Dashboard** (`etl-admin/pages/DashboardPage.jsx`,
  `api-admin/pages/ConsumersPage.jsx`, `rp-user/modules/home/HomePage.jsx`):
  thêm `.page-header` (tiêu đề + mô tả ngắn), thẻ KPI (`.pool-card`) có
  viền màu + icon. `rp-user/HomePage.jsx` viết lại hoàn toàn — từ dòng chào
  trống trải thành lưới "lối tắt" (card bo góc, icon lớn) dẫn tới đúng các
  mục người dùng ĐANG có quyền (lấy từ `me.menu`, không hard-code).
- Không thêm số điện thoại/email vào chân trang sidebar dù ảnh tham khảo
  có — `me` (payload đăng nhập) của cả 3 app hiện KHÔNG có 2 trường này,
  không tự bịa dữ liệu giả; cần thật thì phải mở rộng backend riêng (`/auth/me`),
  ngoài phạm vi việc đổi giao diện lần này.
- Build sạch cả 3 app (`npm run build`, không lỗi/warning); demo 6 ảnh
  (login + trang chủ mỗi app, dựng qua Playwright + giả lập API) đã gửi
  trực tiếp cho người dùng.

## 4.1 — Chuyển sang kiến trúc PM2 cluster mode (nhiều lõi CPU) cho cả 3 service

Theo yêu cầu "kiến trúc sẽ chạy cluster" — chuyển `etl`/`api-server`/
`rp-server` từ 1 tiến trình đơn (chỉ dùng 1 lõi CPU) sang PM2 cluster mode
(nhiều worker Node CÙNG service, chia sẻ 1 cổng, PM2/OS tự cân bằng
round-robin). Trước khi bật, rà soát TOÀN BỘ trạng thái trong bộ nhớ tiến
trình có thể sai lệch khi có N worker độc lập (mỗi worker bộ nhớ RIÊNG) —
xử lý dứt điểm phần ảnh hưởng ĐÚNG-SAI, ghi chú rõ phần chấp nhận đánh đổi:

- **`deploy/ecosystem.config.js`**: `exec_mode: 'cluster'`, mặc định
  `instances: 2`/service (chỉnh qua `PM2_INSTANCES_{ETL,RP,API}`), điểm
  khởi đầu hợp lý — chỉnh theo số lõi CPU thật khi triển khai.
- **`{etl,api-server,rp-server}/lib/clusterLeader.js`** (mới): `isSchedulerLeader()`
  — PM2 tự gán `NODE_APP_INSTANCE="0".."N-1"`, chỉ instance "0" là leader.
- **`rp-server/jobs/reportEmailScheduler.js`** + **`anomalyAlertScheduler.js`**
  + **`etl/jobs/scheduler.js`**: 🔴 (2 scheduler đầu) `start()`/`rescheduleJob()`/
  `rescheduleAlert()` GATE theo leader — trước đây MỌI worker tự đăng ký
  cron cho CÙNG danh sách lịch, tới giờ N worker cùng gửi → **N EMAIL TRÙNG
  LẶP** cho 1 lần gửi (không có khoá cấp CSDL tương đương chặn được, khác
  ETL). `etl/jobs/scheduler.js` gate cùng khuôn nhưng vì HIỆU QUẢ (không
  phải đúng-sai) — ghi dwh.ReportFacts đã luôn đúng dưới nhiều tiến trình
  nhờ `sp_getapplock` cấp CSDL sẵn có (`etl/jobs/runSync.js`), gate chỉ
  tránh N-1 worker lãng phí tranh khoá + đăng ký cron trùng mỗi lượt.
- **`{etl,api-server,rp-server}/server.js`**: `CLEANUP_CRON` (dọn log định
  kỳ) gate theo leader — N worker cùng DELETE vô hại (idempotent) nhưng lãng phí.
- **`api-server/lib/hmacAuth.js`** + **`apiAuth.js`**: 🔴 chống phát lại
  (replay) chữ ký HMAC trước đây dùng Map trong bộ nhớ tiến trình — dưới
  cluster, request gốc và request phát lại có thể rơi vào 2 WORKER KHÁC
  NHAU (nginx round-robin), Map riêng từng worker KHÔNG phát hiện được, để
  lọt phát lại thật — BYPASS bảo mật, khác các mục dưới chỉ "lỏng hơn".
  Chuyển sang CẤP CSDL (`admin.HmacUsedSignatures` — mới, `api-db/schema.sql`
  + `jobs/cleanupHmacSignatures.js` dọn mỗi 5 phút, chỉ leader): PRIMARY
  KEY tự là ràng buộc UNIQUE dùng chung mọi worker, chèn trùng (#2627) =
  phát lại thật. Lỗi CSDL khác (mất kết nối tạm thời) → fail-open (cùng
  triết lý `sessionRevocation.js` — đây là phòng thủ chiều sâu trên chữ ký
  đã xác thực đúng, không phải ranh giới chính). `verify()` giờ ASYNC.
- **`{etl,api-server,rp-server}/.env.example`**: chia đôi `*_POOL_MAX`
  (mỗi worker tự mở pool RIÊNG — tổng kết nối thật = `instances × pool.max`)
  để GIỮ NGUYÊN đúng ngân sách kết nối SQL Server đã duyệt trước cluster.
- **QUYẾT ĐỊNH CÓ CHỦ ĐÍCH — chấp nhận "lỏng hơn", KHÔNG đổi sang CSDL**
  (khác HMAC ở trên — đây không phải ranh giới bảo mật cứng, chỉ ngưỡng
  mềm): `loginRateLimit.js` (x3, chống dò mật khẩu — có `deploy/fail2ban/`
  đọc access log TỔNG HỢP của Nginx làm lớp chặn thật ở tầng firewall,
  không phân mảnh theo worker), `consumerRateLimit.js` (ngưỡng SLA/gói
  cước theo hợp đồng, không phải xác thực), `express-rate-limit` toàn cục
  theo IP (chống spam nặc danh trước xác thực, cũng có fail2ban backstop).
  Ghi chú rõ trong code để lần sau không nhầm là bug.

## 0.40.0 — Rà soát khả năng chịu tải nhiều kết nối liên tục (keepAliveTimeout, trần pool nguồn phụ, tuning Nginx)

Rà soát riêng theo yêu cầu: "performance đã đảm bảo cho nhiều kết nối liên
tục chưa?". Xác nhận nền tảng đã có sẵn (pool DB nâng ở Phase 2.2, cache
báo cáo TTL ngắn ở Phase 2.3, cột index cho filter nóng, timeout HTTP
server, overlap guard ETL) vẫn đúng và đủ — nhưng phát hiện 1 lỗ hổng
🔴 THẬT SỰ chưa từng được xử lý, cùng 2 điểm 🟡 đáng cải thiện:

- **`{rp-server,api-server,etl}/server.js`**: 🔴 `server.keepAliveTimeout`
  CHƯA từng được đặt — Node mặc định chỉ 5 giây, trong khi
  `deploy/nginx.conf` khai `upstream ... { keepalive 32; }` (nginx giữ sẵn
  tối đa 32 kết nối nginx↔Node để TÁI SỬ DỤNG, không tự đặt idle timeout
  riêng). Khi có NHIỀU KẾT NỐI LIÊN TỤC xen kẽ khoảng nghỉ ngắn hơn vài
  giây, Node đóng socket "keepalive" TRƯỚC khi nginx kịp biết, nginx gửi
  request tiếp theo trên socket đã chết → lỗi "502 upstream prematurely
  closed connection" NGẪU NHIÊN, càng dễ gặp khi tải càng cao — đúng kịch
  bản câu hỏi đặt ra. Đặt `keepAliveTimeout=75s` (lớn hơn
  `proxy_read_timeout`/`proxy_send_timeout=65s` của nginx) và nâng
  `headersTimeout` lên 76s (ràng buộc bắt buộc của Node: phải lớn hơn
  `keepAliveTimeout`) ở cả 3 service.
- **`{rp-server,api-server}/lib/dataSourcePool.js`**: 🟡 mỗi "nguồn dữ liệu
  bổ sung" (`app.ReportDataSources`/`api.DataSources`, dùng cho báo cáo/
  endpoint realtime trỏ CSDL khác DWH mặc định) tự mở 1 pool riêng (tối đa
  5 kết nối), KHÔNG có trần cho tổng SỐ NGUỒN được cấu hình — nếu nhiều
  nguồn cùng được truy vấn đồng thời, tổng kết nối có thể vượt trần DBA
  cấp cho SQL Server. Thêm cảnh báo CHẨN ĐOÁN (log, không tự đóng bớt pool
  đang dùng — tránh làm gãy báo cáo đang chạy) khi vượt 20 pool đồng thời.
- **`deploy/nginx.conf`**: 🟡 ghi chú rõ `worker_processes`/`worker_connections`
  (khối `events{}`) nằm ở `nginx.conf` GỐC của hệ điều hành, KHÔNG đặt được
  trong file vhost này — mặc định Debian/Ubuntu (`worker_connections 768`)
  có thể trở thành nút thắt cổ chai TRƯỚC CẢ Node khi tải cao, cần DBA/ops
  tự kiểm tra/tăng, không phải việc code app tự cấu hình được. Cũng ghi chú
  rõ ràng buộc `keepAliveTimeout` phải khớp `keepalive 32` ngay cạnh khối
  upstream, để lần triển khai sau không lặp lại lỗ hổng trên.

**Không đổi**: rate limit per-IP (300/phút `rp-server`, 120/phút
`api-server` trước xác thực) — đã cấu hình được qua biến môi trường
`RATE_LIMIT_PER_MINUTE` sẵn từ trước, đủ để ops tự tinh chỉnh theo lưu
lượng thật (vd nhiều người dùng chung 1 IP văn phòng/VPN) mà không cần sửa
code; không tự ý nâng mặc định vì đây là lớp chống DoS cố ý, không có đủ
dữ liệu lưu lượng thực tế để chọn số mới an toàn hơn số cũ.

## 0.39.0 — Kiểm tra chữ ký file (magic byte) cho mọi endpoint tải file lên

Rà soát riêng theo yêu cầu: "đã check file kiểu magic byte cho hệ thống
chưa?" — soát lại toàn bộ 4 endpoint `multer` trong hệ thống (2 nhập
Nguồn dữ liệu ở etl+api-server, 1 nhập Chỉ tiêu ở etl, 1 tải file mẫu báo
cáo ở rp-server), xác nhận CẢ 4 trước đây chỉ kiểm tra ĐUÔI FILE
(`fileFilter` soi `originalname`) hoặc hoàn toàn KHÔNG soi `mimetype` —
chưa endpoint nào kiểm tra NỘI DUNG THẬT của file. File đổi đuôi giả mạo
(vd 1 file `.html`/`.exe` đổi tên thành `.xlsx`) trước đây lọt qua
`fileFilter`, được đưa thẳng vào ExcelJS (zip/XML parser, có bề mặt tấn
công riêng) hoặc — nghiêm trọng nhất — ghi hẳn lên đĩa ở `rp-server`
(`templates/`, tái sử dụng cho MỌI admin, xem `GET /templates`).

- **`{etl,api-server,rp-server}/lib/fileSignature.js`** (mới, 3 bản): hàm
  `hasZipSignature(bytes)` — `.xlsx`/`.pptx` (Office Open XML) đều là
  container ZIP, luôn bắt đầu bằng 1 trong 3 chữ ký ZIP chuẩn
  (`PK\x03\x04`/`PK\x05\x06`/`PK\x07\x08`). File đổi đuôi giả mạo không
  khớp chữ ký này, bị chặn TRƯỚC khi đưa vào ExcelJS/lưu đĩa.
- **`etl/routes/admin/dataSources.js`** + **`api-server/routes/admin/dataSources.js`**
  (`POST /import`, memoryStorage): kiểm tra `hasZipSignature(req.file.buffer)`
  ngay sau khi multer đọc xong, trước khi gọi `parseDataSourcesFile()`.
- **`etl/routes/admin/salesTargets.js`** (`POST /import`, memoryStorage):
  kiểm tra tương tự trước `parseSalesTargetsFile()`.
- **`rp-server/routes/reportCatalog.js`** (`POST /templates`, diskStorage —
  khác 3 route kia, multer đã GHI FILE LÊN ĐĨA trước khi route handler
  chạy, không còn buffer trong bộ nhớ): đọc lại 4 byte đầu từ file vừa ghi
  (`fs.readSync`), phát hiện sai chữ ký thì **xoá ngay khỏi đĩa**
  (`fs.unlinkSync`) và trả 400 — không để lại rác/nguy cơ trong `templates/`.
  Đây là endpoint rủi ro cao nhất (file tồn tại lâu dài trên đĩa, dùng
  chung cho mọi admin) nên được ưu tiên xử lý kỹ nhất trong 4 endpoint.

## 0.38.0 — Rà soát chuyên sâu vòng 5: lệch ngày EventDate nguồn MySQL, đồng bộ formulaEngine, sẵn sàng chịu lỗi CSDL

Rà soát chuyên sâu tiếp theo, 4 agent phụ trách hạ tầng/triển khai/phụ
thuộc, tự soi lại các fix của 3 vòng trước, tính toàn vẹn dòng chảy dữ liệu
đầu-cuối (ETL→dwh→report), và vệ sinh observability/secrets. Xử lý toàn bộ
phát hiện 🔴 và các 🟡 giá trị cao:

- **`etl/lib/tableSyncEngine.js`**: 🔴 `EventDate` đọc từ nguồn **MySQL**
  (không phải mssql) bị **LỆCH 1 NGÀY** khi ghi vào dwh qua driver `tedious`
  (mặc định `useUTC:true`, dùng `getUTC*()` làm giá trị lịch) trong khi
  `mysql2` (mặc định `timezone:'local'`) dựng đối tượng `Date` theo getter
  ĐỊA PHƯƠNG khớp chuỗi CSDL gốc — 2 quy ước lệch nhau khiến ngày ghi vào dwh
  sai lệch 1 ngày với timezone tiến trình khác UTC (vd chạy ở giờ VN).
  Nguồn `mssql` không bị ảnh hưởng (tự nhất quán 2 đầu). Thêm
  `normalizeEventDate(rawValue, engine)` chỉ tác động nguồn `mysql`, neo lại
  đúng lịch UTC-midnight; hoàn toàn không đụng `UpdatedAt`/watermark
  incremental sync (tránh phá vỡ cơ chế đã thêm ở 0.36.0).
  Cũng thêm `.trim()` cho `entityCode` đọc từ nguồn (khoảng trắng thừa vô
  tình phá match JOIN đa khối) và cảnh báo (không tự sửa, theo đúng quy ước
  "entityCode phải khớp CHÍNH XÁC" đã ghi trong `hướng_dẫn_báo_cáo.md`) khi
  2 entityCode chỉ lệch hoa/thường trong `compositeReportRunner.js`.
- **`etl/lib/dbAdapters/mysql.js`**: 🟡 thiếu `decimalNumbers: true` — cột
  DECIMAL từ nguồn MySQL trả về CHUỖI (`"1500000.00"`) trong khi `tedious`
  (mssql) trả về SỐ — `Measures` JSON lệch kiểu dữ liệu giữa 2 nguồn, các bộ
  lọc báo cáo dùng `JSON_VALUE()` (so sánh NVARCHAR) so "1500000" ≠
  "1500000.00" âm thầm sai kết quả lọc.
- **`api-server/lib/formulaEngine.js`**: 🟡 lệch so với bản đã sửa null-
  propagation ở `rp-server/lib/formulaEngine.js` (0.36.0) — bản api-server bị
  bỏ sót, đồng bộ lại cho khớp 2 bản.
- **`rp-server/lib/exportPdf.js`**: 🟡 nạp font Noto Sans Vietnamese
  (`fs.readFileSync`, thêm ở 0.37.0) ở SCOPE MODULE — thiếu gói
  `@openfonts/noto-sans_vietnamese` (vd `npm install` chạy thiếu) khiến CẢ
  SERVER sập ngay lúc khởi động thay vì chỉ route xuất PDF lỗi. Chuyển sang
  nạp trễ (lazy, cache lại), báo lỗi tiếng Việt rõ ràng đúng lúc gọi.
- **`rp-server/lib/reportEmailFilters.js`**: 🟡 `resolvePreset()` dùng
  `new Date()` trần — "hôm nay"/"tuần này"... tính theo timezone TIẾN TRÌNH
  (server production thường UTC), lệch với "hôm nay theo giờ Việt Nam" khi
  đã qua nửa đêm VN nhưng UTC còn ngày cũ. Thêm `nowInVietnamTimezone()`
  (dùng `Intl.DateTimeFormat` cố định `Asia/Ho_Chi_Minh`, không phụ thuộc
  timezone tiến trình).
- **`rp-server/lib/sessionRevocation.js`** + **`api-server/lib/sessionRevocation.js`**
  + **`etl/lib/sessionRevocation.js`**: 🟡 tự soi lại cơ chế thu hồi phiên
  thêm ở 0.37.0 — `requireAuth`/`requireAdminAuth` trước đó KHÔNG hề phụ
  thuộc CSDL, thêm cơ chế này khiến CSDL chập chờn vài giây làm TOÀN BỘ app
  (mọi route) trả lỗi. Đổi sang FAIL OPEN khi tra `SessionsInvalidatedAt` lỗi
  (coi như "chưa thu hồi", ghi log cảnh báo, KHÔNG cache kết quả lỗi để tự
  phục hồi ngay khi CSDL sống lại) — đây là lớp phòng thủ chiều sâu, không
  phải ranh giới xác thực chính (chữ ký JWT vẫn luôn được verify trước, độc
  lập với CSDL).

## 0.37.0 — Rà soát chuyên sâu vòng 4: thu hồi phiên đăng nhập, PDF vỡ tiếng Việt, mất dữ liệu chỉ tiêu

Rà soát chuyên sâu tiếp theo, 4 agent phụ trách 4 mảng chưa soi kỹ ở các
vòng trước (frontend, pipeline xuất file/email/nhập liệu, vòng đời xác
thực, nghiệp vụ còn lại), xử lý toàn bộ phát hiện 🔴 và các 🟡 giá trị cao:

- **`rp-server/lib/sessionRevocation.js`** (mới) + **`api-server/lib/sessionRevocation.js`**
  (mới) + **`etl/lib/sessionRevocation.js`** (mới) + `lib/auth.js`/`lib/adminAuth.js`
  x3 + `routes/*/users.js` x3: 🔴 JWT phiên đăng nhập admin/user tự chứa
  (self-contained) — verify chữ ký xong là qua, KHÔNG tự phát hiện được đổi
  mật khẩu/gỡ 2FA/đổi vai trò/khoá tài khoản cho tới khi token tự hết hạn
  (TTL 8h). Đặc biệt nghiêm trọng ở api-server/etl vì **role nhúng thẳng vào
  token** — hạ quyền 1 admin không có tác dụng gì tới phiên đang có. Thêm
  cột `SessionsInvalidatedAt` (rp-db/api-db/etl-db) so với claim `iat` của
  token — token phát hành TRƯỚC lần thu hồi gần nhất bị từ chối dù chữ ký
  còn đúng. `revokeSessions()` gọi ở mọi route đổi mật khẩu/gỡ 2FA/đổi vai
  trò/khoá tài khoản; cache TTL 30s cùng mẫu `apiConsumers.js:isActiveConsumer`.
- **`rp-server/lib/exportPdf.js`**: 🔴 dùng `StandardFonts.Helvetica` (chỉ mã
  hoá được WinAnsi, KHÔNG có dấu tiếng Việt) — xuất PDF với dữ liệu thật
  (tiêu đề báo cáo, tên siêu thị...) gần như LUÔN ném lỗi "WinAnsi cannot
  encode", lịch gửi email `ExportFormat='pdf'` thất bại vĩnh viễn mỗi lần
  chạy. Nhúng font Noto Sans Vietnamese qua `@pdf-lib/fontkit` (Unicode đầy đủ).
- **`etl/lib/salesTargetsImport.js`** + **`routes/admin/salesTargets.js`**: 🔴
  đọc ô CÔNG THỨC trong file Excel nhập chỉ tiêu (`cell.value` trả về
  `{formula, result}`) ghi NGUYÊN OBJECT đó vào `TargetsJson` thay vì lấy
  `.result` đã tính — hỏng âm thầm dữ liệu chỉ tiêu. Cũng thêm parse số kiểu
  Việt Nam ("15,5" -> 15.5) cho ô Text. 🔴 MERGE khi re-upload file (chỉ sửa
  số liệu) GHI ĐÈ NGUYÊN `TargetsJson`, âm thầm XOÁ mất `TrangThai='DaDong'`
  đã đánh dấu trước đó — 1 siêu thị đã đóng cửa bị "mở lại" ngoài ý muốn.
  Thêm cờ `preserveTrangThaiIfUnspecified` (chỉ bật ở `POST /import`, KHÔNG
  bật ở `PUT /one` — route đó cố ý "ghi đè nguyên" vì giao diện đã tải dữ
  liệu hiện có lên form).
- **`rp-server/routes/reportCatalog.js`**: 🔴 `DELETE /:reportId` xoá thẳng
  báo cáo đang được `ReportEmailSchedules`/`AnomalyAlerts` tham chiếu (FK
  không có `ON DELETE CASCADE`) ném lỗi CSDL #547, rơi xuống thành "500 Lỗi
  máy chủ" chung chung. Thêm kiểm tra tham chiếu trước, trả 409 rõ ràng.
- **`api-server/lib/dataSourcesImport.js`**: 🟡 thiếu giới hạn số dòng
  (`MAX_IMPORT_ROWS`) khi nhập hàng loạt nguồn dữ liệu — bản etl có, bản này
  thiếu (rủi ro DoS bộ nhớ với file .xlsx nén tốt nhưng mở ra rất nhiều dòng).
- **`etl/jobs/scheduler.js`** + **`rp-server/jobs/reportEmailScheduler.js`**
  + **`rp-server/jobs/anomalyAlertScheduler.js`**: 🟡 `cron.schedule()` không
  cố định `timezone`, giờ chạy thật phụ thuộc timezone tiến trình (server
  production thường UTC) — "Giờ gửi"/lịch admin chọn luôn hiểu là giờ Việt
  Nam, lệch 7 tiếng nếu server chạy UTC. Cố định `Asia/Ho_Chi_Minh`.

## 0.36.0 — Rà soát chuyên sâu vòng 3: MERGE NULL EntityCode, watermark mất dòng, tổng cộng hụt số, thu hồi OAuth2

Tiếp tục "rà soát chuyên sâu thêm nữa" theo yêu cầu, sau khi vòng 0.35.0 đã
xong — 4 agent đọc song song ETL/API Server/Report Server/kiến trúc dwh,
đào sâu hơn (race condition, ranh giới transaction, độ chính xác số liệu),
xử lý toàn bộ phát hiện 🔴 và các 🟡 giá trị cao trong 1 lượt:

- **`etl/lib/upsert.js`**: 🔴 mệnh đề MERGE ON so sánh `EntityCode` kiểu ANSI
  (`target.EntityCode = src.EntityCode`, NULL=NULL luôn UNKNOWN) LỆCH với
  ngữ nghĩa UNIQUE constraint của SQL Server (coi 2 NULL là trùng nhau) —
  dòng `EntityCode` NULL đồng bộ LẦN 2 trong cùng ngày (dữ liệu nguồn đổi)
  luôn rơi vào nhánh INSERT thay vì UPDATE, vi phạm UNIQUE KEY, rollback
  NGUYÊN CẢ LÔ, job lỗi lặp lại vô thời hạn. Viết tường minh
  `OR (... IS NULL AND ... IS NULL)` ở cả MERGE ON và 2 cặp EXISTS/NOT
  EXISTS dọn lịch sử.
- **`etl/jobs/runSync.js`**: 🔴 watermark incremental sync dùng `>` có thể
  MẤT VĨNH VIỄN 1 dòng nếu 2 giao dịch nguồn commit gần như đồng thời cùng 1
  mốc `UpdatedAt` (dòng sau commit SAU khi SELECT của lượt hiện tại đã đọc
  xong). Thêm "safety lag" 5 giây — không đẩy watermark vượt quá "hiện tại
  trừ 1 khoảng an toàn", lần chạy sau tự quét lại đúng khoảng đệm (vô hại,
  MERGE là upsert idempotent). Đồng thời đổi khoá `sp_getapplock` (thêm ở
  0.35.0) từ theo `job.Id` sang theo khoá nghiệp vụ (nguồn+`TargetDomain`) —
  2 job KHÁC NHAU trỏ cùng nguồn+domain giờ cũng bị chặn chạy chồng, không
  chỉ trùng đúng 1 job.
- **`dwh/schema.sql`**: 🔴 ghi chú khuyến nghị bật `READ_COMMITTED_SNAPSHOT`
  (RCSI, DBA tự chạy 1 lần vào cửa sổ bảo trì) — batch ETL lớn có thể leo
  thang khoá dòng lên khoá bảng trên `dwh.ReportFacts`, chặn SELECT của
  rp-server/api-server ở MỌI Domain khác trong lúc ETL đêm chạy.
- **`rp-server/lib/compositeReportRunner.js`**: 🔴 `deepSumBlock()` tính SAI
  (hụt số) dòng "Tổng cộng"/"Tổng nhóm" khi 1 dòng trong nhóm có measure
  NULL (hợp lệ — vd chưa kịp đồng bộ) — điều kiện cũ đòi TOÀN BỘ giá trị là
  số mới cộng dồn, có 1 null là rơi xuống nhánh "lấy 1 giá trị đầu tiên"
  thay vì cộng. Giờ cộng dồn mọi giá trị số, null không đóng góp (như 0).
- **`rp-server/lib/formulaEngine.js`**: 🟡 phép `+`/`-`/`*`/hàm
  ROUND/ABS/MIN/MAX với 1 toán hạng null (thường từ chia-cho-0 lồng bên
  trong) bị JS ép `null`→`0`, biến "không xác định" thành 1 số cụ thể sai
  (vd hiện "0%" thay vì rõ ràng không có dữ liệu) — giờ lan truyền `null`
  nguyên vẹn qua mọi phép toán/hàm (trừ `IF`, giữ nguyên hành vi cond).
- **`api-server/lib/apiConsumers.js`** + **`lib/apiAuth.js`**: 🔴 access
  token OAuth2 Client Credentials tự chứa (JWT), không tra CSDL mỗi request
  — vô hiệu hoá/xoá hẳn 1 đối tác KHÔNG có tác dụng gì với token đã phát,
  dùng được tới tận khi hết hạn (mặc định 1 giờ). Thêm `isActiveConsumer()`
  dùng chung chu kỳ cache 30s đã có, rút cửa sổ thu hồi thật xuống còn tối
  đa ~30 giây, không thêm truy vấn CSDL/request nào.
- **`api-server/routes/v1/reports.js`**: 🟡 `GET /:reportId/run` kiểm tra
  report TỒN TẠI (404) trước quyền (403) — đối tác có scope `reports` dù
  chưa được cấp báo cáo nào vẫn dò được toàn bộ danh mục `ReportId` nội bộ
  qua phân biệt 404/403. Đổi thứ tự: kiểm tra quyền trước (luôn 403 nếu
  chưa được cấp, bất kể tồn tại hay không), khớp `routes/v1/realtime.js`.
- **`api-server/lib/realtimeEngine.js`**: 🟡 bảo vệ cardinality JOIN (thêm ở
  0.35.0) chỉ áp dụng `runLookup`, không áp dụng `runList` — dữ liệu nguồn
  đổi sau khi lưu endpoint (cột từng unique nay không còn) khiến `runList`
  trả về nhiều dòng hơn số bản ghi thật, phá vỡ phân trang, không cảnh báo
  gì. Thêm dò trùng khoá bảng chính trong trang kết quả + cảnh báo log.
- **`rp-server/routes/reports.js`**: 🟡 `GET /:reportId` trả NGUYÊN định
  nghĩa báo cáo (gồm `dataSourceId`/`apiConnectionId`/`externalConnectionId`/
  `blocks` composite kèm domain/filters SQL nội bộ) cho MỌI người dùng có
  quyền xem báo cáo đó — chỉ cần `title`+`filters` để vẽ form lọc. Giờ chỉ
  trả đúng 2 trường đó.
- **`rp-server/lib/externalApiConnectionPool.js`**: 🟡 `getOAuth2Token()`
  không khoá đồng thời như `getConnection()` — nhiều khối composite chạy
  song song (`Promise.all`) đúng lúc token hết hạn trước đây mỗi khối tự
  bắn 1 request đổi token riêng tới đối tác. Giờ cache Promise TRƯỚC khi
  await, các lời gọi đồng thời chờ chung đúng 1 kết quả.

## 0.35.0 — Rà soát nghiệp vụ/bảo mật/kiến trúc lần 2: leo thang đặc quyền, SSRF-qua-redirect, khoá chồng lấn chéo tiến trình

Rà soát chuyên sâu ETL/API Server/Report Server/kiến trúc bảng dwh (không
lặp lại các phát hiện đã sửa ở các bản trước), xử lý toàn bộ trong 1 lượt:

- **`rp-server/lib/auth.js`** (mới) + **`routes/roles.js`**/**`routes/users.js`**/**`routes/hcrcWorkspaceSettings.js`**:
  🔴 lỗ hổng leo thang đặc quyền — menu "Phân quyền" (`system-permissions`)
  được thiết kế CÓ THỂ giao cho vai trò không phải Admin hệ thống (qua
  `RoleMenuAccess`), nhưng `PUT /system/roles/:id/menu-access`,
  `PUT /:id/report-access` và `PUT /system/users/:id/roles` trước đây chỉ
  kiểm tra menu đó (`requireMenuAccess`) chứ không kiểm tra vai trò hệ thống
  thật (`requireSystemRoleActor`, mới gộp về `lib/auth.js` — trước bị lặp
  code y hệt ở 3 route file) — 1 tài khoản chỉ được giao menu này (và KHÔNG
  bị bắt buộc 2FA, vì quy tắc 2FA bắt buộc chỉ áp cho `isSystemRole` thật)
  có thể tự tạo vai trò → tự cấp mọi quyền hệ thống → tự gán vai trò đó cho
  chính mình, vượt qua hoàn toàn yêu cầu 2FA của Admin thật. Đã chặn ở cả 3
  route; `rp-user/.../RolesPage.jsx` + `UsersPage.jsx` ẩn nút "Lưu" cho
  người xem không phải Admin hệ thống thật (vẫn xem được, chỉ không sửa).
- **`dwh/schema.sql`**: 🟡 thêm CHECK constraint chặn `SourceSystem`/`Domain`
  (ReportFacts) và `Domain`/`EntityCode` (SalesTargets) rỗng/toàn khoảng
  trắng lọt vào khoá nghiệp vụ; ghi chú tường minh lý do `EntityCode` nullable
  ở ReportFacts an toàn với UNIQUE (SQL Server coi NULL bằng nhau khi kiểm
  tra uniqueness) và lý do chưa có FK từ EntityCode tới bảng dimension (chưa
  có bảng đó trong thiết kế hiện tại — rủi ro đã biết, chưa đổi kiến trúc).
- **`rp-server/lib/urlSafety.js`** (`fetchSafe` mới) + **`externalApiConnectionPool.js`**/**`externalReportClient.js`**:
  🔴 SSRF-qua-redirect — `assertPublicUrl()` chỉ kiểm tra URL TRƯỚC khi gọi,
  nhưng `fetch()` mặc định tự follow header `Location` của máy chủ đối tác
  MÀ KHÔNG kiểm tra lại IP đích, cho phép 1 kết nối API đối tác (baseUrl hợp
  lệ) trả về 302 trỏ tới địa chỉ nội bộ/metadata cloud để vượt qua kiểm tra.
  `fetchSafe()` dùng `redirect:'manual'` + `assertPublicUrl()` lại cho từng
  URL redirect (tối đa 5 lần).
- **`etl/routes/admin/log.js`** + **`dashboard.js`**: 🟡 thêm
  `blockTargetImporter` (2 route còn thiếu) — tránh vai trò hẹp
  `target_importer` đọc được tên/lỗi job đồng bộ hạ tầng qua gọi thẳng API.
- **`etl/routes/admin/syncJobs.js`**: 🟡 `POST /:id/run-now` ("Chạy thử")
  giờ ghi Audit Log — trước đây thao tác chạy tay 1 job không để lại dấu vết.
- **`etl/jobs/runSync.js`**: 🟡 `runJobObject()` thêm khoá chồng lấn CẤP CSDL
  (`sp_getapplock`, `LockTimeout=0`) — `runningJobs` Set cũ (`jobs/scheduler.js`)
  chỉ chặn được chồng lấn TRONG CÙNG 1 tiến trình node, không chặn được
  `etl/index.js` (entrypoint chạy tay, tiến trình RIÊNG) chạy trùng 1 job
  đang được `server.js` tự động chạy theo lịch.
- **`api-server/lib/schemaBrowser.js`** (`isUniqueSingleColumn` mới) +
  **`routes/admin/realtimeEndpoints.js`** + **`lib/realtimeEngine.js`**: 🟡
  JOIN động của endpoint realtime (`LookupJoinColumn`) không được xác nhận là
  cột unique/khoá chính trên bảng liên kết — `runLookup()` có thể âm thầm
  trả nhầm 1 trong nhiều dòng khớp. Lưu endpoint giờ cảnh báo (không chặn)
  nếu cột nối không unique; `runLookup()` dùng `TOP 2` + cảnh báo log khi
  thực tế khớp >1 dòng (phòng khi dữ liệu nguồn đổi sau lúc lưu).
- **`rp-server/lib/compositeReportRunner.js`**: 🟢 cảnh báo log khi 1 khối
  trả về nhiều hơn 1 dòng cho cùng `entityCode` trong 1 lượt chạy — trước đây
  âm thầm ghi đè (`merged.get(entityCode)[block.key] = row`), không có cách
  phát hiện cấu hình `filters` của khối bị lỏng hơn dự kiến.

## 0.34.7 — Xoá hẳn mã nguồn portal/

Xoá thư mục `portal/` khỏi repo (đã bỏ khỏi triển khai từ 0.34.6, giờ xoá
luôn mã nguồn) — không còn dùng nữa, người dùng sẽ tạo lại theo ý tưởng
khác sau nếu cần.

## 0.34.6 — Bỏ portal khỏi triển khai — mỗi ứng dụng truy cập thẳng

Người dùng tự tạo kết nối/quyền truy cập riêng cho từng ứng dụng (bảo mật
hơn 1 điểm liệt kê chung) — bỏ domain `portal.*` khỏi cấu hình Nginx thật.
Mã nguồn `portal/` VẪN CÒN trong repo (không xoá) — chỉ không còn build/
deploy/route tới nữa, phòng khi cần dùng lại sau.

- **`deploy/nginx.conf`** — bỏ hẳn khối `server{}` của `portal.hcrc.vidu.vn`,
  bỏ khỏi danh sách redirect HTTP→HTTPS, sơ đồ còn lại **4 domain**
  (`report`/`api`/`api-admin`/`etl-admin`).
- **`deploy/README.md`** — bỏ bước build/copy `portal/`, bỏ đoạn cấu hình
  `portal/.env`, sửa sơ đồ tổng quan + số domain DNS/certbot (5→4).
- **`deploy/fail2ban/README.md`** — bỏ mục giải thích riêng cho portal (không
  còn domain đó nữa).
- **`README.md`** (gốc) — sửa số giao diện tĩnh (4→3).

## 0.34.5 — Rà bảo mật tiếp: validate baseUrl/path, sửa fallback path sai

Tiếp tục rà tích hợp HCRC Workspace sau bản vá HTTPS, phát hiện thêm 2
điểm cần sửa:

- **`routes/hcrcWorkspaceSettings.js`**: `verifyPath`/`directoryPath` ghép
  chuỗi thẳng với `baseUrl` (`lib/hcrcWorkspaceClient.js`, không dùng
  `new URL(base, path)`) — path bắt đầu bằng `@` (vd `@evil.com/x`) khiến
  trình phân tích URL coi phần domain SAU `@` là host thật, biến `baseUrl`
  hợp lệ trước đó thành vô nghĩa. Thêm kiểm tra: path phải bắt đầu `/`,
  không chứa khoảng trắng/`@`; `baseUrl` phải là URL hợp lệ (`new URL()`
  không lỗi), không chỉ đúng tiền tố `https://`.
- Cùng file: fallback mặc định của `verifyPath`/`directoryPath` khi bỏ
  trống vẫn là giá trị **cũ sai** (`/auth/verify`, `/directory`) từ trước
  khi có tài liệu API thật (0.34.2) — sửa về đúng
  `/api/external/verify-credentials`/`/api/external/users`.
- 2 test mới (`test-hcrc-workspace-path-validation.js`) khoá lại cả 2.

## 0.34.4 — Bắt buộc HTTPS cho Base URL HCRC Workspace

`POST /verify-credentials` gửi mật khẩu thật của người dùng trong body —
trước đây chưa có gì chặn admin lỡ nhập `baseUrl` dạng `http://`, khiến
mật khẩu truyền plaintext qua mạng. Chặn ở 2 lớp:

- **`routes/hcrcWorkspaceSettings.js`** `PUT /`: từ chối 400 ngay lúc lưu
  nếu `baseUrl` không bắt đầu bằng `https://`.
- **`lib/hcrcWorkspaceClient.js`** `loadSettings()`: kiểm tra lại lần nữa
  ngay trước khi gọi thật — phòng dữ liệu đã tồn tại từ trước khi có ràng
  buộc này, hoặc bị sửa thẳng trong CSDL.
- Test mới (`test-hcrc-workspace-https-only.js`) khoá lại cả 2 lớp chặn.

## 0.34.3 — HCRC Workspace cập nhật tài liệu API — bỏ email/active, thêm field "position"

Tài liệu API HCRC Workspace cập nhật lần 2: `GET /api/external/users` bỏ
hẳn 2 field `email`/`active`, thêm field mới `position` (**"Văn phòng"**
hoặc **"Siêu Thị"** — nơi làm việc, KHÁC `jobTitle`/chức danh). Sửa lại:

- **`lib/hcrcWorkspaceClient.js`**: `fetchDirectory()` bỏ ánh xạ
  `email`/`isActive`, thêm `workLocation` (map từ field `position` của
  vendor — đặt tên khác để khỏi lẫn với cột `Position`/`jobTitle` nội bộ).
- **Schema**: thêm `app.Users.WorkLocation`. Cột `Email` vẫn giữ (đổi tay
  được), nhưng "Đồng bộ tài khoản" **không còn ghi vào Email nữa** — API
  không cung cấp field này, tránh xoá mất giá trị admin đã tự nhập.
- **`routes/users.js` `POST /sync`**: bỏ ghi Email, thêm ghi WorkLocation;
  bỏ luôn điều kiện lọc theo `isActive` (field không còn tồn tại) — chỉ
  còn dựa vào "còn xuất hiện trong danh bạ hay không" để quyết định tự
  khoá, hành vi thực tế không đổi.
- `UsersPage.jsx` thêm cột "Nơi làm việc"; đổi nhãn cột `Position` từ "Vị
  trí" thành "Chức danh" cho khỏi lẫn với "Nơi làm việc".
- `hướng_dẫn_báo_cáo.md` mục 7.3 viết lại đúng response mới (bảng 6 field).
- Sửa 2 bộ test hiện có khớp field mới + thêm assertion "Email tự nhập
  không bị sync ghi đè" (khoá lại đúng hành vi vừa sửa). `vite build`
  sạch `rp-user`.

## 0.34.2 — Sửa tích hợp HCRC Workspace khớp đúng tài liệu API thật

Bên HCRC Workspace đã công bố tài liệu API thật (v1.97) — khác hợp đồng tự
đặt ở 0.34.0 ở vài điểm quan trọng, sửa lại toàn bộ cho khớp:

- **Header xác thực**: `Authorization: Bearer <khoá>` (không phải
  `X-Api-Key`).
- **Body xác thực**: field `account` (không phải `username`).
- **Sai mật khẩu vẫn trả `200 OK` kèm `success:false`** — KHÔNG phải
  `401`. `lib/hcrcWorkspaceClient.js` sửa lại: chỉ HTTP 200 mới đọc
  `success`, MỌI mã khác (400/401/403/429/500 — khoá API sai/IP không
  cho phép/quá tần suất/lỗi máy chủ họ) đều là lỗi dịch vụ/cấu hình,
  không bao giờ bị hiểu nhầm thành "người dùng gõ sai mật khẩu".
- **Danh bạ không có mã nhân viên riêng** — API thật (`GET
  /api/external/users`) chỉ có `username` + `name/dept/jobTitle/phone/
  email/active`, không có `externalId`. Bỏ cột `app.Users.ExternalId`,
  "Đồng bộ tài khoản" (`routes/users.js` `POST /sync`) khớp trực tiếp
  theo Username. Thêm cột `Phone`, đồng bộ luôn Email/Điện thoại.
- `UsersPage.jsx` thêm cột Điện thoại/Email; `HcrcWorkspaceSettingsPage.jsx`
  sửa path mặc định (`/api/external/verify-credentials`,
  `/api/external/users`).
- `hướng_dẫn_báo_cáo.md` mục 7 viết lại đúng 100% theo tài liệu API thật.
- 3 bộ test (`lib/hcrcWorkspaceClient.js`: đúng header/body/mã lỗi/ánh xạ
  field; `routes/users.js` sync theo Username; `verifyCredentials` rẽ
  nhánh AuthSource) + `vite build` sạch `rp-user`.

## 0.34.1 — Ẩn nút "Nguồn xác thực" ở tài khoản Admin

Tài khoản giữ vai trò Admin (hệ thống) đã bị chặn chuyển AuthSource sang
'hcrcWorkspace' từ 0.34.0 (BE) — nay ẩn luôn nút "Nguồn xác thực" ở những
dòng đó trong `UsersPage.jsx` cho khớp: Admin mặc định + cố định Local,
chỉ tài khoản người dùng thường mới có nút tự chọn Local nếu không muốn
xác thực qua HCRC Workspace.

## 0.34.0 — Xác thực HCRC Workspace + Đồng bộ tài khoản người dùng

Người dùng thường (không phải Admin hệ thống) đăng nhập rp-user bằng
đúng tài khoản/mật khẩu bên hệ thống nội bộ "HCRC Workspace" — không cần
tạo/nhớ thêm mật khẩu riêng. Vai trò Admin (hệ thống) LUÔN xác thực local,
không phụ thuộc uptime hệ thống ngoài. Xem `hướng_dẫn_báo_cáo.md` mục 7
(hợp đồng 2 API cho bên viết HCRC Workspace: xác thực đăng nhập + danh bạ
nhân sự).

- **`rp-db/schema.sql`** — `app.Users` thêm `AuthSource` (`'local'` mặc
  định | `'hcrcWorkspace'`), `Department`, `Position`, `ExternalId`
  (khoá đồng bộ ổn định), `LastSyncedAt`; `PasswordHash` cho phép NULL
  (account `hcrcWorkspace` không có mật khẩu local). Bảng mới
  `app.HcrcWorkspaceSettings` (cấu hình 1 dòng, mã hoá khoá API).
- **`rp-server/lib/hcrcWorkspaceClient.js`** (mới) — `verifyPassword()` +
  `fetchDirectory()`, KHÔNG áp SSRF-guard (hệ thống nội bộ, khác API đối
  tác ngoài).
- **`lib/auth.js`** — `verifyCredentials()` rẽ nhánh theo `AuthSource`;
  lỗi dịch vụ ngoài (`isServiceUnavailable`) phân biệt rõ với "sai mật
  khẩu" — server.js trả 503 riêng, không tính vào brute-force.
- **`routes/users.js`** — `PUT /:id/auth-source` (đổi nguồn xác thực,
  chặn chuyển sang hcrcWorkspace nếu đang giữ vai trò Admin), `PUT
  /:id/roles` chặn gán vai trò Admin cho account không phải local,
  `POST /sync` (đồng bộ danh bạ — tài khoản mới mặc định **CHƯA cho
  phép kết nối**, tự khoá tài khoản không còn trong danh bạ).
  `routes/hcrcWorkspaceSettings.js` (mới) — cấu hình + "Kiểm tra kết nối".
- **`UsersPage.jsx`** — cột Phòng ban/Vị trí/Nguồn xác thực, nút "Đồng bộ
  tài khoản", đổi nút "Mở khoá" thành "Cho phép kết nối". Trang mới
  "Xác thực HCRC Workspace" (`/system/hcrc-workspace`).
- 2 bộ test độc lập (`verifyCredentials` rẽ nhánh AuthSource + lỗi dịch
  vụ ngoài; `routes/users.js` sync/auth-source/roles-guard bằng router
  giả lập) + `vite build` sạch `rp-user`.

## 0.33.1 — Trang "Biểu mẫu" hiện luôn báo cáo nào thiếu lịch gửi email/cảnh báo bất thường

Trang cấu hình báo cáo (`system-report-catalog`) thêm 2 cột "Lịch gửi
email"/"Cảnh báo bất thường" — mỗi báo cáo hiện "✅ Đã có" hoặc link thẳng
sang trang tạo lịch/cảnh báo tương ứng, để biết ngay 1 chỗ báo cáo nào còn
thiếu cấu hình mà không phải mở dò từng trang.

- **`rp-server/routes/reportCatalog.js`** — `GET /` LEFT JOIN đếm gộp
  `app.ReportEmailSchedules`/`app.AnomalyAlerts` theo `ReportId`, trả thêm
  `HasEmailSchedule`/`HasAnomalyAlert` (bit).
- **`ReportCatalogPanel.jsx`** — 2 cột mới trong bảng, dùng `<Link>` sang
  `/system/email-schedules`/`/system/anomaly-alerts` khi chưa có.
- `vite build` sạch `rp-user`.

## 0.33.0 — "Cảnh báo bất thường" thêm chế độ Ngưỡng tuyệt đối (vd tồn kho) + xác nhận chọn nguồn DWH/API đã có sẵn

Xác nhận: trang "Biểu mẫu → tab Báo cáo" (rp-user) đã có sẵn ô chọn "Nguồn"
đầy đủ (Trực tiếp CSDL/API Server báo cáo hoặc realtime/API đối tác/ghép
nhiều nguồn), không cần làm thêm. Việc NẠP dữ liệu tồn kho/khách hàng cũng
không cần code mới (cơ chế "Theo bảng" ở etl-admin/api-admin đã đủ tổng
quát) — phần thật sự còn thiếu là kiểu cảnh báo phù hợp tồn kho, đã làm:

- **`app.AnomalyAlerts`** — thêm `AlertMode` (`'periodComparison'` mặc định
  — hành vi 0.32.0 không đổi | `'absoluteThreshold'` — mới), `ThresholdDirection`
  (`'below'`/`'above'`), `ThresholdValue`.
- **`rp-server/lib/anomalyAlertRunner.js`** — tách 2 hàm riêng:
  `runPeriodComparisonCheck` (logic cũ, nguyên vẹn) và
  `runAbsoluteThresholdCheck` (mới) — chạy báo cáo ĐÚNG 1 LẦN (dùng thẳng
  `resolveFilterValues()` — KHÔNG bắt buộc có field lọc khoảng ngày nào,
  khác chế độ so kỳ %), so trực tiếp `MetricColumnKey` với `ThresholdValue`
  theo `ThresholdDirection` — `'below'` (thấp hơn ngưỡng, vd sắp hết hàng)
  hoặc `'above'` (cao hơn ngưỡng, vd tồn kho ứ đọng).
- **`jobs/anomalyAlertScheduler.js`** — cột email khác theo chế độ (chế độ
  ngưỡng chỉ có Thực thể + Giá trị hiện tại, không có "kỳ so sánh").
- **`routes/anomalyAlerts.js`** — validate riêng theo `alertMode`.
- **`AnomalyAlertsPage.jsx`** — tab chọn chế độ, field đổi theo chế độ
  (ẩn/hiện "So với kỳ nào"+"Ngưỡng %" hoặc "Chiều ngưỡng"+"Giá trị ngưỡng").
- `hướng_dẫn_báo_cáo.md` mục 5 — thêm ví dụ đầy đủ "cảnh báo sắp hết hàng".
- 2 bộ test độc lập (`anomalyAlertRunner.js`: hồi quy chế độ so kỳ % không
  đổi hành vi + chế độ ngưỡng tuyệt đối cả 2 chiều, loại dòng "Tổng cộng",
  chỉ chạy báo cáo đúng 1 lần) + `vite build` sạch `rp-user`.

## 0.32.1 — Chỉ tiêu theo ngành hàng/SKU (mở rộng "Nhập chỉ tiêu" — không đổi schema)

Coi "1 siêu thị × 1 ngành hàng" là 1 thực thể riêng (`EntityCode` ghép
`<MaSieuThi>_<MaNganhHang>`) — đúng nguyên tắc thực thể sẵn có, KHÔNG cần
đổi `dwh.SalesTargets`/`compositeReportRunner.js` (đã ghép theo `EntityCode`
phẳng, không quan tâm thực thể là gì). Chỉ 1 chỗ thật sự hardcode "chỉ theo
siêu thị": bulk import Excel.

- **`etl/lib/salesTargetsImport.js`** — cột `MaNganhHang` MỚI, TUỲ CHỌN
  trong file Excel "Nhập chỉ tiêu": dòng có giá trị cột này ->
  `EntityCode = "<MaSieuThi>_<MaNganhHang>"` (không phải chỉ `MaSieuThi`),
  đồng thời ghi thêm `MaSieuThi`/`MaNganhHang` GỐC vào `TargetsJson` (công
  thức báo cáo đọc thẳng `target.MaSieuThi`/`target.MaNganhHang`, không cần
  tự tách chuỗi `EntityCode`). Dòng KHÔNG có cột này (hoặc để trống) giữ
  NGUYÊN hành vi cũ 100% — dùng lẫn cả 2 kiểu (theo siêu thị/theo ngành
  hàng) trong CÙNG 1 file được. Route `PUT /admin/sales-targets/one` (sửa 1
  dòng) và trang etl-admin "Sửa / thêm 1 siêu thị" ĐÃ nhận `entityCode`
  dạng chuỗi tự do từ trước — dùng được luôn, không cần sửa gì thêm.
- **`etl-admin/.../SalesTargetsPage.jsx`** — ghi chú cột `MaNganhHang` mới
  + gợi ý cách gõ mã thực thể ghép ở form 1 dòng.
- **`hướng_dẫn_báo_cáo.md`** mục 6 (mới) — ví dụ đầy đủ: tạo VIEW nguồn
  ghép cột khoá, cấu hình ETL job Dimensions `MaSieuThi`/`MaNganhHang`,
  file Excel mẫu, `DefinitionJson` composite tham chiếu
  `current.dimensions.MaNganhHang`/`target.MaNganhHang`, `groupBy` theo
  siêu thị HOẶC theo ngành hàng tuỳ nhu cầu xem báo cáo.
- 4 test độc lập (`salesTargetsImport.js`: file cũ không đổi hành vi, cột
  có nhưng để trống không đổi hành vi, ghép đúng khi điền, trộn cả 2 kiểu
  trong 1 file) + `vite build` sạch `etl-admin`.

## 0.32.0 — Gộp trang báo cáo (rp-user) + "Cảnh báo bất thường" (so kỳ hiện tại/kỳ so sánh, tự gửi email)

Tư vấn kiến trúc + đề xuất nghiệp vụ bán lẻ (không code) — 2 việc đầu tiên
không cần nguồn dữ liệu mới, làm ngay theo lựa chọn của người dùng.

- **rp-user — gộp 3 trang báo cáo thành 1**: `/reports/kinh-doanh`,
  `/reports/van-hanh`, `/reports/mua-hang` (3 route riêng) → 1 route
  `/reports` duy nhất, tab chọn nhóm nghiệp vụ vẽ BÊN TRONG trang
  (`modules/reports/ReportsPage.jsx` thay `ReportsModulePage.jsx`). Sidebar
  gộp còn 1 mục "Báo cáo". KHÔNG đổi phân quyền — `app.RoleMenuAccess` (nhóm
  nào hiện tab) và `app.RoleReportAccess` (báo cáo nào trong nhóm được chạy)
  giữ nguyên 100%, chỉ đổi điều hướng. `components/RequireMenuAccess.jsx`
  nhận thêm prop `codes` (mảng, vào được nếu có ÍT NHẤT 1 mã) cho route gộp.
  `rp-db/schema.sql`: cập nhật `Path` 3 dòng `MenuItems` cũ (không còn được
  đọc, chỉ còn Code/Label dùng làm tab) cho khớp thực tế.
- **"Cảnh báo bất thường"** (mới, `app.AnomalyAlerts`) — tự động chạy LẠI
  một báo cáo đã có (không cần tạo báo cáo riêng, không hardcode domain/chỉ
  số nào) 2 lần: kỳ hiện tại (preset tương đối, cùng cơ chế lịch gửi email)
  và kỳ so sánh (kỳ liền trước cùng độ dài, hoặc cùng kỳ năm trước) — so
  từng "thực thể" (vd chi nhánh, cột do admin chỉ định) trên 1 cột số, lệch
  quá ngưỡng % thì gửi email CHỈ liệt kê thực thể bất thường; không gửi nếu
  không có gì lạ (tránh lờn cảnh báo). Thực thể chỉ có ở 1 trong 2 kỳ (mới
  phát sinh/về 0) được tính ±100%, luôn vượt ngưỡng, có ghi chú riêng.
  - `rp-server/lib/anomalyAlertRunner.js` — toán kỳ so sánh + gộp/so sánh
    theo thực thể, tái dùng `lib/reportRunner.js` (chạy báo cáo) và
    `lib/reportEmailFilters.js` (`resolvePreset`) — không viết lại logic
    chạy báo cáo. Loại dòng "Tổng cộng" (`__isSubtotal`, composite report)
    khỏi so sánh.
  - `rp-server/jobs/anomalyAlertScheduler.js` — đăng ký cron (cùng khuôn
    `jobs/reportEmailScheduler.js`, đơn giản hơn — 1 cảnh báo = 1 lịch,
    không có bảng "giờ chạy" con), gửi qua `lib/mailer.js` +
    `lib/emailBodyRenderer.js` (tái dùng nguyên bảng HTML đã có).
  - `rp-server/routes/anomalyAlerts.js` — CRUD + "Kiểm tra ngay".
  - `rp-user/.../AnomalyAlertsPage.jsx` (mới, trang "Hệ thống" > "Cảnh báo
    bất thường") — chọn báo cáo, đúng 1 bộ lọc khoảng ngày dùng preset làm
    "kỳ hiện tại", cột thực thể/cột số (gõ tay, giống `HighlightColumnKey`
    ở lịch gửi email), kỳ so sánh, ngưỡng %, lịch cron, người nhận.
- Test độc lập (`anomalyAlertRunner.js`: toán kỳ so sánh 2 chế độ, gộp thực
  thể, loại "Tổng cộng", lọc ngưỡng, ghi chú mới-phát-sinh/về-0) + `vite
  build` sạch `rp-user`.

## 0.31.0 — Xác thực hai yếu tố (2FA/TOTP) BẮT BUỘC cho tài khoản admin (cả 3 hệ thống)

Chỉ áp dụng cho vai trò **admin** (ETL: `Role='admin'`; API Server:
`Role='admin'`; Report Server: vai trò `IsSystemRole=1`) — vai trò khác
(`viewer`/`target_importer`/user thường) không đổi gì, đăng nhập như cũ.
Tài khoản admin CHƯA bật 2FA bị chặn ngay ở màn "bắt buộc đăng ký" trước khi
vào được bất kỳ trang nào khác — không có đường tắt.

- **`lib/twoFactor.js`** (mới, 1 bản/service, `otplib` + `qrcode`) — sinh/xác
  thực mã TOTP (RFC 6238, dung sai ±30s bù lệch đồng hồ), sinh QR
  (`otpauth://`, nhãn RIÊNG theo từng hệ thống — "HCRC ETL"/"HCRC
  API"/"HCRC Report" — 1 điện thoại/1 app dùng chung được cho cả 3 hệ
  thống, NHƯNG mỗi hệ thống có secret RIÊNG, không dùng chung 1 secret),
  10 mã khôi phục dùng 1 lần (hash bcrypt, hiện nguyên văn đúng 1 lần lúc
  bật 2FA). Secret mã hoá bằng `crypto.js`/`*_ENCRYPTION_KEY` sẵn có của
  từng service — không lưu plaintext. Chống dùng lại đúng 1 mã TOTP vừa
  xác thực thành công (chống replay, trong bộ nhớ tiến trình theo userId).
- **Schema** (`etl-db`, `api-db`, `rp-db`) — thêm `TwoFactorSecretEncrypted`/
  `TwoFactorEnabled`/`TwoFactorEnrolledAt` vào `admin.AdminUsers`/`app.Users`
  + bảng mới `AdminTwoFactorRecoveryCodes`/`UserTwoFactorRecoveryCodes`.
- **Luồng đăng nhập chèn thêm bước** (`lib/adminAuth.js`/`lib/auth.js`) —
  token TRUNG GIAN mới (`pending`/`setupRequired`/`enroll`, TTL 10 phút,
  trả trong JSON KHÔNG đặt cookie) tách biệt hoàn toàn khỏi token phiên
  ĐẦY ĐỦ (KHÔNG bao giờ mang claim `twofa`) — `requireAdminAuth`/`requireAuth`
  từ chối thẳng bất kỳ token nào mang claim này, phòng thủ chiều sâu chống
  lỗi logic lỡ gán nhầm cookie phiên từ token chưa đủ 2 yếu tố.
- **`routes/admin/twoFactor.js`/`routes/twoFactor.js`** (mới) — `POST
  /setup` (đăng ký lần đầu HOẶC đổi thiết bị — đổi thiết bị đòi phiên đầy
  đủ + mã hiện tại, chứng minh còn kiểm soát thiết bị cũ), `POST /confirm`
  (xác nhận mã đầu tiên -> lưu secret + bật 2FA + sinh 10 mã khôi phục +
  vào phiên luôn), `POST /verify` (đăng nhập lần sau -> mã 6 số hoặc mã
  khôi phục). KHÔNG có route tự tắt 2FA (mâu thuẫn với "bắt buộc") — chỉ
  peer-reset (dưới) mới gỡ được, và gỡ xong vẫn bắt đăng ký lại ngay.
- **"Đặt lại 2FA" giúp admin khác** — `POST /:id/reset-2fa` (users.js cả 3
  service) — 1 admin gỡ 2FA giúp admin KHÁC bị mất thiết bị, LUÔN ghi audit
  log rõ ai gỡ cho ai. `api-server` trước đây KHÔNG có route quản lý
  `admin.AdminUsers` nào (tài khoản chỉ tạo qua `scripts/seedAdmin.js`) —
  thêm `routes/admin/users.js` tối giản (chỉ xem danh sách + đặt lại 2FA,
  CHƯA thêm CRUD đầy đủ, giữ nguyên quy ước cũ).
- **Khôi phục 2 lớp**: 10 mã khôi phục tự dùng khi không có admin khác để
  nhờ, CỘNG peer-reset khi có — không phụ thuộc hẳn vào 1 cơ chế.
- **Frontend** (`etl-admin`/`api-admin`/`rp-user`) — `LoginPage.jsx` xử lý
  3 nhánh phản hồi đăng nhập (`ok`/`pending`/`setupRequired`): màn nhập mã
  (kèm lối "dùng mã khôi phục"), màn bắt buộc đăng ký (QR + xác nhận + hiện
  10 mã khôi phục ĐÚNG 1 LẦN trước khi vào hệ thống). Trang "Phân quyền"/
  "Tài khoản quản trị" thêm cột 2FA + nút "Đặt lại 2FA" (chỉ hiện cho hàng
  admin, `rp-user` còn ẩn nút với người xem không phải Admin hệ thống).
- Test tích hợp ĐẦY ĐỦ (dựng Express app thật + fake CSDL trong bộ nhớ, gọi
  HTTP thật qua `fetch`) cho ETL và Report Server: đăng nhập không cần 2FA
  (vai trò khác admin), setupRequired → setup → confirm → phiên, pending →
  verify (mã đúng/sai, chống replay chờ qua cửa sổ TOTP thật), mã khôi phục
  dùng đúng 1 lần, phòng thủ chặn token `twofa` lọt vào cookie phiên,
  peer-reset + audit log, bắt đăng ký lại sau khi bị reset. Smoke test riêng
  cho API Server (route `users.js` mới). `vite build` sạch cả 3 giao diện.

## 0.30.0 — Sẵn sàng vận hành production: crash resilience, health check thật, đóng dần sạch, chặn cấu hình sai NGAY lúc khởi động

Rà soát lần 2 (sau đợt bảo mật 0.28.0): lần này về VẬN HÀNH (khác lỗ hổng
bảo mật) — 1 Blocker thật sự (không có gì chặn restart-loop vô hạn khi
tiến trình lỗi ngay lúc khởi động, không bắt lỗi không mong muốn) + vài
việc nên làm trước khi có traffic thật. Áp dụng ĐỒNG NHẤT cho cả 3 service.

- **`lib/processGuards.js`** (mới, 1 bản/service) — `uncaughtException`/
  `unhandledRejection` giờ CHỦ ĐỘNG thoát (`process.exit(1)`) thay vì để
  tiến trình "sống dở chết dở" ở trạng thái không còn đáng tin (Node mặc
  định không tự thoát, chỉ log ra rồi tiếp tục chạy) — PM2 khởi động lại
  SẠCH. `SIGTERM`/`SIGINT` (PM2 `reload`/`stop`) giờ ĐÓNG DẦN: ngừng nhận
  request mới, đợi request đang xử lý xong, đóng hết pool CSDL rồi mới
  thoát — có hạn mức 10s chống treo vô thời hạn.
- **`db.js`** (cả 3 bản) — thêm `assertConfigured(prefix)` (tách khỏi
  `getPool()`) + `closeAll()` (api-server/rp-server trước đây CHƯA có,
  chỉ etl có) — dùng cho cả kiểm tra lúc khởi động lẫn đóng dần lúc tắt.
- **`server.js`** (cả 3) — kiểm tra cấu hình BẮT BUỘC (biến kết nối CSDL,
  JWT secret, khoá mã hoá) NGAY trước `app.listen` — trước đây các hàm này
  (`getSecret()`, `getKey()`) chỉ được gọi LƯỜI lúc dùng thật (lượt đăng
  nhập/mã hoá đầu tiên), README từng ghi "lỗi ngay lúc khởi động" nhưng
  thực tế CHƯA đúng — giờ đúng thật. KHÔNG mở kết nối CSDL thật lúc khởi
  động (chỉ kiểm tra biến môi trường), tránh làm chậm/rung lắc nếu CSDL
  tạm thời chưa sẵn sàng.
- **`deploy/ecosystem.config.js`** — `min_uptime`/`max_restarts` — PM2
  trước đây restart VÔ HẠN nếu tiến trình thoát ngay lúc khởi động (cấu
  hình sai) — giờ dừng sau 10 lần, chuyển trạng thái `errored` rõ ràng
  thay vì cắm restart-loop tốn CPU.
- **`routes/health.js`/`routes/v1/health.js`/etl `GET /health`** — PING
  THẬT các pool CSDL (`SELECT 1`) thay vì chỉ trả "tiến trình đang chạy" —
  503 nếu 1 pool không kết nối được, nêu rõ pool nào.
- **`deploy/README.md`** — thêm mục xoay vòng log (`pm2-logrotate` +
  xác nhận logrotate Nginx khớp 4 file `hcrc-*.access.log` mới), gia hạn
  chứng chỉ TLS (certbot renewal-hook tự reload Nginx — trước đây thiếu,
  chứng chỉ gia hạn xong Nginx vẫn phục vụ bản CŨ tới khi reload thủ công),
  và ghi rõ sao lưu CSDL là trách nhiệm DBA/hạ tầng (trước đây không nhắc
  tới ở đâu, dễ hiểu lầm "không cần lo").
- 4 bộ test độc lập (`processGuards.js`, `assertConfigured` × 3 service,
  health check ping) + **smoke test THẬT**: spawn từng `server.js` làm
  tiến trình con — xác nhận thiếu cấu hình thoát ngay (không `app.listen`),
  đủ cấu hình khởi động thành công (không cần CSDL thật), rồi SIGTERM thoát
  sạch trong vài giây.

## 0.29.0 — "Kiểm tra schema" — đối chiếu lại job/endpoint ĐÃ LƯU với schema thật hiện tại (ETL, API Server)

Trước đây ETL/API Server chỉ đối chiếu cấu hình với schema thật của nguồn
ĐÚNG LÚC LƯU (POST/PUT) — nếu sau đó ai đó đổi tên/xoá cột hay bảng trên
CSDL nguồn mà không ai vào sửa lại job/endpoint đó, hệ thống không biết gì
cả, chỉ lộ ra khi job CHẠY THẬT (hoặc đối tác ngoài GỌI THẬT endpoint) và
báo lỗi SQL. Report Server không cần tính năng này — không cấu hình theo
kiểu "1 bảng + danh sách cột" như ETL/API Server (đọc từ Data Warehouse
hoặc gọi API Server, không tự duyệt schema CSDL nguồn nào).

- **`etl/routes/admin/syncJobs.js`** — `POST /:id/check-schema` (mới): nạp
  lại job đã lưu, chạy `validateTableJobSchema()` (hàm ĐÃ CÓ, dùng chung
  với lúc Lưu) đối chiếu với schema THẬT hiện tại — trả `{ok, error?}`.
  Job Type='custom' trả `{ok:true, skipped:true}` (không có bảng/cột để
  kiểm tra). Đọc-only, ghi audit log kết quả (khớp/lệch).
- **`api-server/routes/admin/realtimeEndpoints.js`** — `POST
  /:endpoint/check-schema` (mới), cùng khuôn — dùng lại
  `assertFullSchemaMatches()` đã có.
- **`etl-admin/.../SyncJobsPage.jsx`** + **`api-admin/.../RealtimeEndpointsPage.jsx`**
  — nút "Kiểm tra schema" trên mỗi dòng, hiện cho cả `viewer` (đọc-only,
  không giới hạn admin).
- Phạm vi: chỉ kiểm tra bảng/cột CÒN TỒN TẠI hay không (khớp đúng logic
  validate sẵn có) — CHƯA kiểm tra đổi kiểu dữ liệu cột.
- 2 bộ test độc lập (etl + api-server) + `vite build` cả 2 giao diện.

## 0.28.1 — Cấu hình fail2ban cho máy chủ triển khai (bổ sung, khuyến nghị)

Lớp phòng thủ THÊM ở tầng firewall — chặn hẳn IP sau nhiều lần thất bại,
KHÔNG thay thế rate-limit/chặn brute-force đã có sẵn trong code (lớp ứng
dụng, request vẫn phải vào tới Node mới bị từ chối) mà bổ sung: sau đủ
ngưỡng, IP bị chặn thẳng ở firewall, không còn chạm được tới Nginx/Node.

- **`deploy/nginx.conf`** — mỗi domain ghi `access_log` RIÊNG
  (`hcrc-report`/`hcrc-api`/`hcrc-api-admin`/`hcrc-etl-admin.access.log`) —
  trước đây dùng chung log mặc định, không tách được theo domain để
  fail2ban theo dõi đúng chỗ.
- **`deploy/fail2ban/`** (mới) — `jail.local` + 3 filter riêng:
  `hcrc-admin-login` (đăng nhập sai `/admin/auth/login`, dùng chung cho
  api-admin + etl-admin), `hcrc-report-login` (đăng nhập sai
  `/api/auth/login` của rp-server), `hcrc-api-abuse` (401/429 dồn dập trên
  `/api/v1/*` — ngưỡng cao hơn 2 jail đăng nhập vì đây là traffic đối tác
  máy-tới-máy, không phải người gõ tay). `bantime.increment` tăng dần thời
  gian cấm với IP tái phạm. `[sshd]` bật sẵn (dùng filter có sẵn của
  fail2ban) cho máy chủ có SSH — mục tiêu kinh điển nhất của fail2ban.
  `deploy/fail2ban/README.md` — hướng dẫn cài đặt + kiểm tra.
- 1 test độc lập xác nhận cả 3 failregex khớp đúng dòng log lỗi thật (401
  trên đúng path đăng nhập/429 trên `/api/v1/*`), KHÔNG khớp nhầm request
  thành công hay path khác domain.

## 0.28.0 — Rà soát bảo mật toàn diện (ETL/API Server/Report Server): sửa các lỗ hổng phát hiện

Rà soát chuyên sâu lần 2 (sau Phase 0-3) trên toàn bộ code đã thêm qua các
đợt tính năng B-J — 3 audit độc lập, mỗi hệ thống 1 audit. Không phát hiện
lỗi Critical/High mới ở API Server/Report Server; 1 lỗi HIGH ở ETL (phân
quyền), còn lại Medium/Low — đã sửa hết:

**ETL (HIGH — phân quyền `target_importer`/`viewer`)**: các route GET hạ
tầng thật (`etl.DataSources` — host/port/username, duyệt schema thật;
`etl.SyncJobs`; `admin.AuditLog`; `admin.AdminUsers`) trước đây chỉ có
`requireAdminAuth` — bất kỳ vai trò nào đăng nhập được, kể cả
`target_importer` (vai trò hẹp, giao diện đã ẩn hẳn các trang này khỏi
menu — `etl-admin/src/components/Layout.jsx`), đều gọi thẳng API đọc được
dữ liệu hạ tầng nhạy cảm dù chưa từng thấy trang đó qua giao diện.
- **`etl/lib/adminAuth.js`** — thêm `blockTargetImporter()`: chặn đúng
  `target_importer`, KHÔNG đổi hành vi `viewer` (vẫn xem được như thiết kế
  hiện có trên giao diện — không phải mọi route đều siết về admin-only).
- Gắn vào 8 route GET: `dataSources.js` (danh sách + 3 route duyệt schema),
  `syncJobs.js` (danh sách + custom-connectors), `auditLog.js`, `users.js`.

**ETL (LOW)**: `PUT /admin/users/:id` không kiểm tra whitelist `role` (POST
có, PUT thì không) — thêm kiểm tra `['admin','viewer','target_importer']`.

**ETL (MEDIUM — DoS)**: `.xlsx` nhập hàng loạt (`dataSourcesImport.js`,
`salesTargetsImport.js`) giới hạn 5MB nén nhưng không giới hạn số dòng sau
khi giải nén (dữ liệu lặp lại nén rất tốt) — thêm `MAX_IMPORT_ROWS=5000`,
chặn NGAY sau khi đọc sheet, trước khi lặp/mã hoá mật khẩu từng dòng.

**API Server (MEDIUM)**: `POST /api/v1/oauth/token` không đọc
`RateLimitPerMinute` từ `api.ApiConsumers` — token phát ra thiếu trường
này, `verifyToken()` rơi về "0 = không giới hạn", đối tác `AuthMethod='oauth2'`
thoát hẳn giới hạn riêng admin đã đặt. Đã thêm cột vào câu SELECT + payload
token (`routes/v1/oauth.js`).

**API Server (LOW)**: so sánh `client_secret` dùng `!==` chuỗi thường (rò
rỉ thời gian xử lý) thay vì `crypto.timingSafeEqual` như `lib/hmacAuth.js`
đã dùng — đồng bộ lại cách so sánh.

**Report Server (MEDIUM — DoS)**: báo cáo `SourceType='composite'` không
giới hạn số "khối" (`blocks`) — mỗi khối `apiReport`/`apiRealtime` chạy
song song (`Promise.all`) giữ 1 lượt gọi HTTP tới 30s, khối `directDb`
không tự chọn nguồn dùng chung pool DWH — 1 báo cáo nhiều khối, gọi lặp
lại, có thể chiếm hết pool/mở nhiều kết nối HTTP đồng thời, ảnh hưởng báo
cáo của người dùng khác. Thêm `MAX_COMPOSITE_BLOCKS=15` trong
`validateCompositeDefinition()` (`routes/reportCatalog.js`).

**Cluster mode**: xác nhận CHƯA cấu hình (PM2 chạy mỗi service ở chế độ
`fork`, 1 tiến trình — `deploy/ecosystem.config.js`) — thiết kế có chủ đích
hiện tại (tự restart khi crash, không multi-core/không zero-downtime
deploy), không phải thiếu sót cần sửa ngay.

5 bộ test độc lập cho toàn bộ fix trên (fakeModule pattern) + xác nhận cả
3 service (`etl`, `api-server`, `rp-server`) load sạch sau khi sửa.

## 0.27.1 — Dashboard ETL: bộ lọc "Đang lỗi/Quá hạn" + tìm kiếm theo tên job

Tiếp nối 0.27.0 — với vài chục kết nối/job, bảng "Từng job" trên Dashboard
dài dần, khó rà soát. Cân nhắc phương án cho phép admin CHỌN kết nối nào
hiện trên Dashboard (ẩn bớt) nhưng đánh giá đây là phản tác dụng cho mục
đích giám sát (dễ vô tình ẩn đúng kết nối đang lỗi) — thay bằng bộ lọc XEM
tạm thời, không đổi cấu hình/dữ liệu gì:

- **`etl/routes/admin/dashboard.js`** — `jobs` kèm thêm `LastRunStatus`/
  `LastRunError`/`LastRunAt` (lượt chạy GẦN NHẤT, không chỉ mốc thành công
  cuối) và `IsOverdue` (dùng lại `isJobOverdue()` từ `lib/syncStatus.js` —
  không viết lại logic ước lượng chu kỳ cron).
- **`etl-admin/.../DashboardPage.jsx`** — ô tìm kiếm theo tên job (áp dụng
  cả 3 bảng) + tab "Tất cả/Đang lỗi/Quá hạn" lọc riêng bảng "Từng job".
  Bảng "Từng job" hiện thêm cột lượt chạy gần nhất (icon ✅/⛔) và cờ "⚠️ Quá
  hạn".
- 1 test độc lập (route trả đúng `LastRunStatus`/`IsOverdue`) + `vite
  build` etl-admin.

## 0.27.0 — ETL: chặn cứng khi lượt đồng bộ sắp xoá lịch sử nhiều ngày + theo dõi trạng thái đồng bộ theo từng nguồn dữ liệu

Chuẩn bị cho việc backfill dữ liệu lịch sử (vd đồng bộ từ 2025 đến hiện tại
qua 33+ kết nối chi nhánh) — 2 rủi ro cần xử lý: (1) quên tích "Giữ lịch sử"
khiến lượt đồng bộ hàng ngày sau đó âm thầm xoá sạch dữ liệu cũ; (2) không
có chỗ rà soát nhanh 33+ kết nối đang lỗi/quá hạn.

- **`etl/lib/upsert.js`** — thêm `shouldBlockHistoryWipe()` (hàm thuần, test
  độc lập không cần CSDL): trước khi thực hiện bước dọn dữ liệu cũ (chỉ chạy
  khi `KeepHistory=false`), đo khoảng cách ngày (span) của các dòng SẮP bị
  xoá. Span vượt 3 ngày (`STALE_HISTORY_SPAN_DAYS`) — dấu hiệu domain lịch
  sử nhiều ngày bị lỡ tắt "Giữ lịch sử" — thì **CHẶN CỨNG**: không xoá,
  không MERGE, ném lỗi để lượt chạy đó hiện LỖI rõ ràng trên Dashboard/Log
  (rollback toàn bộ transaction, dữ liệu cũ không đụng gì). Dọn "chốt số
  mới nhất" bình thường (span 1-2 ngày, đúng thiết kế cũ) vẫn chạy như cũ,
  không bị chặn nhầm.
- **`etl/lib/syncStatus.js`** (mới) — tổng hợp trạng thái đồng bộ THEO TỪNG
  NGUỒN dữ liệu (gộp mọi `etl.SyncJobs` trỏ vào nguồn đó): lần chạy gần
  nhất, trạng thái, và đếm job "quá hạn" (đang bật nhưng lâu hơn 3× chu kỳ
  cron của chính nó mà chưa chạy lại — ước lượng chu kỳ từ 2 dạng cron thực
  tế đang dùng, `*/N phút` hoặc giờ cố định hàng ngày).
- **`etl/routes/admin/dataSources.js`** — `GET /` trả kèm `SyncStatus` theo
  từng nguồn (null = nguồn chưa gắn job nào).
- **`etl-admin/.../DataSourcesPage.jsx`** — cột "Đồng bộ" mới trên trang
  "Nguồn dữ liệu": lần chạy gần nhất + cảnh báo đỏ "N job quá hạn" — rà soát
  nhanh nhiều kết nối cùng lúc mà không cần đối chiếu qua Dashboard.
- 3 bộ test độc lập (`shouldBlockHistoryWipe`, `syncStatus.js`, route
  `dataSources.js`) + `vite build` etl-admin.

## 0.26.0 — Lịch gửi email: Subject riêng + gửi qua nội dung email (HTML body) có tô màu cảnh báo

Case thật: báo cáo đối chiếu doanh thu siêu thị ↔ trung tâm, gửi định kỳ
NGAY TRONG NỘI DUNG EMAIL (không phải file đính kèm), tô đỏ ô "Chênh lệch"
khi vượt ngưỡng. Trước đây `app.ReportEmailSchedules` chỉ gửi được file
đính kèm (Excel/PDF) với Subject cố định 1 mẫu duy nhất.

- **`rp-db/schema.sql`** — thêm 4 cột vào `app.ReportEmailSchedules`:
  `Subject` (rỗng = dùng mẫu mặc định, hỗ trợ placeholder `{ngay}` -> ngày
  gửi thật), `DeliveryMode` (`'attachment'` mặc định | `'body'`),
  `HighlightColumnKey`/`HighlightThreshold` (chỉ áp dụng khi
  `DeliveryMode='body'` — tô đỏ ô nào có |giá trị| vượt ngưỡng).
- **`rp-server/lib/emailBodyRenderer.js`** (mới) — dựng bảng HTML (style
  inline, đúng ràng buộc email client) từ `{columns, rows}`, tô đỏ đúng 1
  cột theo ngưỡng của lịch, escape HTML chống XSS/lỗi hiển thị.
- **`rp-server/lib/mailer.js`** — `sendMail()` nhận thêm tham số `html`.
- **`rp-server/jobs/reportEmailScheduler.js`** — `runSchedule()` rẽ nhánh
  theo `DeliveryMode`: `'body'` gửi HTML không đính kèm; `'attachment'`
  giữ nguyên hành vi cũ. Subject tự điền được thay `{ngay}` bằng ngày gửi
  thật; để trống vẫn ra đúng mẫu cũ (tương thích ngược).
- **`rp-server/routes/reportEmailSchedules.js`** — POST/PUT nhận/lưu 4
  trường mới, `GET /reports` trả kèm danh sách cột để chọn "cột tô màu".
- **`rp-user/.../EmailSchedulesPage.jsx`** — ô Subject, chọn "Cách gửi"
  (đính kèm/nội dung email), khi chọn nội dung email hiện thêm ô chọn cột
  + ngưỡng cảnh báo.
- Ngưỡng/cột tô màu lưu THEO TỪNG LỊCH GỬI (không cố định trong định
  nghĩa báo cáo) — cùng 1 báo cáo, nhiều lịch gửi có thể đặt ngưỡng khác
  nhau. Tô màu hiện CHỈ áp dụng email HTML body (rp-user/Excel/PDF vẫn ra
  đúng số, không tô màu — phạm vi hẹp có chủ đích, mở rộng sau nếu cần).
- 3 bộ test độc lập (`emailBodyRenderer`, `reportEmailScheduler` rẽ nhánh
  DeliveryMode + placeholder Subject, route CRUD) + `hướng_dẫn_báo_cáo.md`
  mục 4 — hướng dẫn đầy đủ case đối chiếu siêu thị/trung tâm (kiến trúc 2
  đường ETL độc lập gặp nhau ở DWH dưới 2 Domain khác nhau, KHÔNG vi phạm
  nguyên tắc "không lấy từ data warehouse" vì DWH chỉ là nơi chứa tạm để
  ghép, không phải nguồn sự thật DÙNG CHUNG cho 2 số liệu).

## 0.25.1 — Báo cáo composite chạy các khối SONG SONG thay vì tuần tự

Báo cáo `SourceType='composite'` (ghép nhiều nguồn — nhiều Domain DWH, nhiều
endpoint API Server, chỉ tiêu) trước đây chạy từng khối TUẦN TỰ (`for...await`)
— độ trễ báo cáo bằng TỔNG thời gian mọi khối cộng lại. Càng dùng nhiều khối
`apiReport`/`apiRealtime` (mỗi khối 1 lượt gọi HTTP riêng tới API Server) thì
càng chậm thêm.

- **`rp-server/lib/compositeReportRunner.js`** — `runCompositeReport()` đổi
  sang `Promise.all(definition.blocks.map(...))`: mọi khối bắt đầu chạy
  CÙNG LÚC, độ trễ tổng bằng khối CHẬM NHẤT thay vì tổng mọi khối. Vòng ghép
  (merge theo `entityCode`) vẫn duyệt kết quả theo ĐÚNG thứ tự
  `definition.blocks` như cũ (`Promise.all` giữ nguyên thứ tự mảng kết quả
  khớp thứ tự mảng đầu vào, bất kể khối nào resolve trước) — thứ tự dòng trả
  về, logic `groupBy`/dòng tổng không đổi, chỉ nhanh hơn.
- 4 test độc lập: đo thời gian chạy thật (3 khối 60ms/40ms/10ms xong trong
  ~60ms chứ không phải 110ms), xác nhận mọi khối bắt đầu gần như đồng thời,
  xác nhận kết quả ghép đúng dữ liệu + đúng thứ tự dù khối resolve sau lại
  có độ trễ ngắn hơn khối resolve trước, và hồi quy `groupBy`/dòng tổng vẫn
  tính đúng.

## 0.25.0 — Endpoint realtime hỗ trợ JOIN 1 bảng liên kết (api-server tự ghép, client chỉ nhận kết quả)

Trước đây `api.RealtimeEndpointDefs` chỉ SELECT được đúng 1 bảng — dữ liệu
cần ghép từ 2 bảng (vd `Vouchers.UsedByCustomerId` → tên khách hàng thật ở
bảng `Customers` riêng) không có cách nào xử lý ngoài bắt báo cáo/đối tác
tự tra thêm 1 lượt gọi khác. Theo đúng yêu cầu "API Server xử lý, client
chỉ nhận kết quả" — thêm JOIN TUỲ CHỌN, TỐI ĐA 1 bảng (đúng scope
`etl.SyncJobs` đã dùng cho ETL — không hỗ trợ N-way join, cần ghép 3+ bảng
thì tạo VIEW phía nguồn thay vì mở rộng thêm).

- **`api-db/schema.sql`** — thêm 6 cột vào `api.RealtimeEndpointDefs`:
  `JoinSchema, JoinTable, JoinType, MainJoinColumn, LookupJoinColumn,
  JoinColumnsJson` (tất cả NULL = không có bảng liên kết, hành vi cũ giữ
  nguyên 100%). Migration `IF COL_LENGTH(...) IS NULL` cho DB đã có sẵn.
- **`api-server/lib/realtimeEngine.js`** — `runLookup`/`runList` SELECT
  kèm `LEFT`/`INNER JOIN` nếu endpoint có cấu hình bảng liên kết. Cột bảng
  chính/liên kết qua alias `m.`/`j.` (tránh lỗi "ambiguous column name"
  nếu 2 bảng tình cờ trùng tên cột — vẫn KHÔNG hỗ trợ alias đổi tên cột,
  trùng tên là lỗi cấu hình báo rõ lúc chạy, giống hệt quy ước không alias
  đã có). Kết quả trả về là 1 dòng/danh sách PHẲNG, đúng tên cột gốc — client
  không biết (và không cần biết) dữ liệu đến từ mấy bảng.
- **`api-server/routes/admin/realtimeEndpoints.js`** — `validatePayload` +
  `assertSchemaMatches` mở rộng: có `joinTable` thì bắt buộc kèm
  `joinSchema/mainJoinColumn/lookupJoinColumn`, đối chiếu CẢ bảng liên kết
  với schema thật lúc lưu (giống bảng chính, cùng cơ chế 0.21.6).
- **`api-admin` `RealtimeEndpointsPage.jsx`** — thêm khối "Thêm bảng/view
  liên kết" (tick bật/tắt, chọn bảng qua dropdown duyệt schema thật, chọn
  cột nối 2 chiều, chọn cột lấy thêm) — cùng mẫu UI đã dùng cho etl-admin
  "Đồng bộ".
- **`hướng_dẫn_báo_cáo.md`** mục 3 (Kiểm tra voucher) — cập nhật ví dụ dùng
  thẳng JOIN thật (`UsedByCustomerId` → `Customers.CustomerName`) thay vì
  giả định 1 bảng phẳng sẵn có.
- 7 nhóm test độc lập: câu SQL sinh đúng JOIN/alias/ORDER BY, endpoint
  không cấu hình JOIN thì hành vi cũ y hệt, validate thiếu field bắt buộc,
  đối chiếu sai cột bảng liên kết báo đúng lỗi, không JOIN thì `JoinTable`
  ghi `null`. `vite build` sạch cho `api-admin`.

## 0.24.1 — Báo cáo tra cứu 1 mã qua API Server (`lookupField`) — vd Kiểm tra voucher

Trước đây `SourceType='apiRealtime'` chỉ gọi được `GET /v1/realtime/.../list`
(danh sách phân trang) — báo cáo có ô lọc nhưng gõ gì cũng bị bỏ qua, không
dùng được cho case "nhập 1 mã, ra đúng 1 dòng kết quả" (vd tra cứu voucher:
chưa dùng → trạng thái + ngày hết hạn; đã dùng → trạng thái + ngày/người/
nơi sử dụng). Endpoint tra-1-khoá (`GET /v1/realtime/.../{key}`) đã có sẵn ở
api-server từ trước, chỉ chưa có phía báo cáo nào gọi tới.

- **`rp-server/lib/apiReportClient.js`** — thêm `DefinitionJson.lookupField`
  (tuỳ chọn, tên 1 field trong `filters`): có field này thì `apiRealtime`
  chuyển từ `/list` sang `GET /v1/realtime/{ApiTarget}/{giá trị lọc}`. Chưa
  nhập giá trị lọc → trả 0 dòng, KHÔNG gọi API Server. Mã không tồn tại
  (API trả 404) → trả 0 dòng, không phải lỗi. Lỗi thật (401/403/500...) vẫn
  ném ra như cũ — `callApiServerLookup()` chỉ coi RIÊNG 404 là "không có",
  không nuốt lỗi khác. Không đặt `lookupField` thì hành vi `/list` cũ giữ
  nguyên 100%, không ảnh hưởng báo cáo đang chạy.
- Không cần đổi schema DB (DefinitionJson vốn là JSON tự do) và không cần
  sửa UI rp-user (ô lọc kiểu `text` đã vẽ sẵn qua `FilterForm.jsx`, cấu hình
  `lookupField` gõ thẳng trong ô DefinitionJson như mọi SourceType khác).
- **`hướng_dẫn_báo_cáo.md`** — thêm mục 3 "Báo cáo tra cứu 1 mã qua API
  Server (lookupField)" — đầy đủ các bước api-admin (Nguồn dữ liệu, Endpoint
  realtime, Đối tác) + rp-user (Kết nối API Server, tạo báo cáo với ví dụ
  DefinitionJson đầy đủ, case Kiểm tra voucher).
- **`rp-server/README.md`** — cập nhật mục "Báo cáo lấy dữ liệu qua API
  Server (realtime)" cho đúng khả năng mới (trước đó ghi "chưa hỗ trợ lọc
  động" — nay đúng 1 phần, vẫn đúng cho chế độ list).
- 7 nhóm test độc lập (`fakeModule` + `fetch` giả lập): voucher chưa dùng
  (UsedAt/UsedBy/UsedLocation null), voucher đã dùng (đủ ngày/người/nơi sử
  dụng), chưa nhập mã (0 dòng, 0 lượt gọi mạng), mã không tồn tại (0 dòng,
  không lỗi), lỗi thật vẫn throw, mã có ký tự đặc biệt được `encodeURIComponent`
  đúng, và hồi quy xác nhận chế độ `/list` cũ (không đặt `lookupField`)
  không đổi hành vi.

## 0.24.0 — Module "Nhật ký thao tác" (etl + api-server) + log đăng nhập cả 3 hệ thống

Trước đây chỉ rp-server có nhật ký "ai làm gì" (`app.AuditLog` + trang
"Log"); etl và api-server chỉ có log HỆ THỐNG (`etl.SyncLog`, `api.RequestLog`)
chứ không có log THAO TÁC admin. Cũng chưa hệ thống nào lưu lịch sử đăng
nhập (chỉ đếm tạm trong RAM để chặn brute-force + đè `LastLoginAt`). Tính
năng này nhân bản đúng mẫu `app.AuditLog`/`logAction()` của rp-server sang
etl và api-server — **cố ý KHÔNG dựng 1 service log tập trung đọc chung 3
CSDL** (phá vỡ mô hình cô lập bảo mật đang dùng, tạo thêm 1 điểm lỗi chung
không cần thiết — cùng lý do `portal/` chỉ là danh mục tĩnh, không gọi API
tổng hợp).

- **`etl-db/schema.sql`, `api-db/schema.sql`** — thêm `admin.AuditLog`
  (Id, UserId, Username, Module, ActionType, TargetObject, Description,
  IpAddress, Status, CreatedAt), cùng khuôn `app.AuditLog` bên rp-server.
- **`etl/lib/auditLog.js`, `api-server/lib/auditLog.js`** (mới) —
  `logAction()`, đọc `req.admin` (JWT payload admin-only, khác `req.user`
  bên rp-server) thay vì `req.user`. Lỗi ghi log bị nuốt, không làm hỏng
  request gốc.
- **Gắn vào mọi route sửa dữ liệu**: etl (`dataSources.js`, `syncJobs.js`,
  `salesTargets.js`, `users.js`), api-server (`dataSources.js`,
  `consumers.js`, `reportCatalog.js`, `realtimeEndpoints.js`). Riêng
  `consumers.js` (đối tác API) — **tuyệt đối không ghi bí mật thật**
  (apiKey/clientSecret/hmacSecret) vào log, chỉ ghi tên + phương thức xác
  thực; có test riêng xác nhận không có chuỗi giống bí mật nào lọt vào mô
  tả log.
- **Log đăng nhập** (thành công LẪN thất bại) — thêm cho CẢ 3 hệ thống
  (kể cả rp-server, trước đây cũng chưa có) — `etl/routes/admin/auth.js`,
  `api-server/routes/admin/auth.js`, `rp-server/server.js`. Thất bại vẫn
  ghi được username đã gõ (kể cả sai/không tồn tại) vì logAction chỉ cần
  `req.ip` + tên, không cần đã xác thực.
- **`etl/routes/admin/auditLog.js`, `api-server/routes/admin/auditLog.js`**
  (mới) — `GET /admin/audit-log`, lọc username/module/khoảng ngày, phân
  trang, cùng khuôn `rp-server/routes/auditLog.js`.
- **`etl-admin`, `api-admin` `AuditLogPage.jsx`** (mới) — trang "Nhật ký
  thao tác", tách riêng khỏi trang "Log"/"Lịch sử" hệ thống đang có (khác
  loại dữ liệu — user action vs. system run/request).
- **Dọn dẹp tự động** — `etl.SyncLog` và `app.AuditLog` (rp-server) trước
  đây KHÔNG có retention, phình vô hạn. Thêm `etl/jobs/cleanupLogs.js`
  (`cleanupSyncLog` + `cleanupAuditLog`), `api-server/jobs/cleanupAuditLog.js`,
  `rp-server/jobs/cleanupAuditLog.js` — cùng mẫu `api-server/jobs/cleanupRequestLog.js`
  đã có sẵn. Mặc định giữ 90 ngày, cấu hình qua `SYNC_LOG_RETENTION_DAYS`/
  `AUDIT_LOG_RETENTION_DAYS`/`CLEANUP_CRON`. rp-server trước đây chưa có
  hạ tầng `node-cron` cấp server.js nào — thêm mới cho việc này.
- **Phạm vi cố ý bỏ qua** (theo yêu cầu): KHÔNG log việc người dùng thường
  xem/xuất báo cáo ở rp-server (chỉ log thao tác CẤU HÌNH của admin) — xem
  báo cáo diễn ra thường xuyên hơn nhiều so với sửa cấu hình, log mọi lượt
  xem sẽ phình bảng rất nhanh mà giá trị thấp.
- 24 test độc lập (`fakeModule`): `logAction()` ghi đúng dữ liệu + nuốt lỗi
  DB, log đăng nhập đúng thành công/thất bại (giữ đúng username đã gõ khi
  sai), `cleanup*` tính đúng ngưỡng ngày theo env var, route
  `GET /admin/audit-log` lọc đúng, mọi route sửa dữ liệu đều gọi
  `logAction` đúng `actionType`, và xác nhận riêng `consumers.js` không
  lộ bí mật vào log. `vite build` sạch cho `etl-admin` + `api-admin`.

## 0.23.0 — Tự động test kết nối lúc lưu + nhiều giờ gửi email/lịch

Hai tính năng độc lập, gộp chung 1 bản merge.

### Tự động test kết nối (etl-admin + api-admin)

Lưu nguồn dữ liệu (tạo/sửa 1 nguồn, hoặc nhập hàng loạt) giờ TỰ ĐỘNG gọi
`testConnection()` ngay sau khi ghi — không cần bấm riêng nút "Kiểm tra kết
nối" trước nữa. **KHÔNG chặn lưu** nếu kết nối lỗi (quyết định có chủ đích —
đôi khi cấu hình được khai báo trước khi DB/firewall đích thật sự mở), chỉ
trả kèm kết quả để admin biết ngay và tự quyết định sửa hay để đó.

- **`etl/lib/dataSourcePool.js`, `api-server/lib/dataSourcePool.js`** — thêm
  `testConnectionsBatch(items, concurrency=5)`: test NHIỀU cấu hình song
  song có giới hạn (không thử tuần tự — quá chậm cho hàng chục chi nhánh;
  không thử toàn bộ cùng lúc — dễ quá tải), lỗi 1 item không ảnh hưởng các
  item khác, kết quả LUÔN đúng thứ tự items dù thứ tự hoàn thành khác nhau.
- **`etl/routes/admin/dataSources.js`, `api-server/routes/admin/dataSources.js`**
  — POST/PUT trả kèm `connectionTest: {ok, error?}`; POST /import trả kèm
  `connectionResults: [{name, ok, error?}]` theo tên từng dòng vừa ghi
  (test dùng đúng mật khẩu PLAINTEXT của dòng đó trước khi mã hoá, không
  cần đọc lại DB). PUT khi không gửi password mới thì giải mã mật khẩu cũ
  để test (etl còn phải đọc lại Engine hiện có — PUT không cho đổi Engine).
- **`etl-admin/api-admin` `DataSourcesPage.jsx`** — hiển thị kết quả ngay
  sau khi lưu/nhập, không cần thao tác thêm.
- 20 test độc lập (`fakeModule`): giới hạn song song đúng, thứ tự kết quả
  đúng, lỗi cô lập, không chặn lưu khi kết nối lỗi, PUT dùng đúng mật khẩu
  giải mã + Engine hiện có, import trả `connectionResults` đúng tên dòng.

### Nhiều giờ gửi email/lịch (rp-server + rp-user)

Một lịch gửi email báo cáo giờ có thể gửi **nhiều lần/ngày** (vd 07:00 VÀ
17:00), mỗi giờ gửi theo dõi thành công/lỗi RIÊNG (không gộp chung 1 lần
gửi gần nhất như trước).

- **`rp-db/schema.sql`** — bảng con `app.ReportEmailScheduleTimes`
  (`ScheduleId` FK `ON DELETE CASCADE`, `CronExpression`, `LastRunAt`,
  `LastStatus`, `LastError` RIÊNG cho từng giờ gửi). Di dời dữ liệu
  `CronExpression` cũ của `app.ReportEmailSchedules` sang bảng con
  (idempotent — chỉ chèn cho lịch chưa có dòng nào). **Không xoá** cột cũ
  trên bảng cha (tránh ALTER phá vỡ dữ liệu/parse-order khi DROP COLUMN
  trong script idempotent) — giờ chỉ còn là cột hiển thị/tương thích ngược,
  `LastRunAt/LastStatus/LastError` ở đó được CẢ MỌI giờ gửi cùng cập nhật,
  coi là "lần gửi gần nhất bất kỳ giờ nào" cho tiện xem nhanh.
- **`rp-server/jobs/reportEmailScheduler.js`** — viết lại: `scheduledTasks`
  giờ khoá theo `TimeId` (1 lịch N giờ gửi = N cron task độc lập, trước đây
  1 lịch = 1 task). `runningSchedules` (chặn chồng lượt) vẫn khoá theo
  `ScheduleId` — 2 giờ gửi CÙNG lịch chặn lẫn nhau (tránh gửi trùng email
  cho cùng người nhận nếu report chạy lâu hơn khoảng cách 2 giờ gửi).
  `rescheduleJob(scheduleId)` bỏ đăng ký MỌI giờ gửi thuộc lịch đó rồi nạp
  lại đúng danh sách hiện có. `runNow()` ("Gửi ngay") KHÔNG gắn với giờ gửi
  cụ thể nào — chỉ cập nhật lịch cha.
- **`rp-server/routes/reportEmailSchedules.js`** — body POST/PUT đổi từ
  `cronExpression` (1 chuỗi) sang `cronExpressions` (mảng). PUT cập nhật
  danh sách giờ gửi kiểu DIFF (giữ nguyên + lịch sử của giờ không đổi, chỉ
  xoá giờ bị bỏ/thêm giờ mới) thay vì xoá hết ghi lại. GET trả kèm `Times`
  (mảng giờ gửi + trạng thái riêng từng giờ).
- **`rp-user/.../EmailSchedulesPage.jsx`** — "Giờ gửi" từ 1 ô thành danh
  sách Thêm/Xoá tự do (chế độ Đơn giản: cùng tần suất/thứ trong tuần, chỉ
  giờ khác nhau — đúng nhu cầu thường gặp; chế độ Nâng cao: danh sách biểu
  thức cron thô, mỗi giờ gửi có thể khác hẳn kiểu ngày nếu cần). "Số lần
  gửi" = độ dài danh sách, không có ô đếm riêng. Bảng danh sách lịch hiện
  từng giờ gửi kèm trạng thái thành công/lỗi riêng.
- 11 test độc lập (`fakeModule`, node-cron giả lập để không hẹn giờ thật):
  validate `cronExpressions` (rỗng/sai định dạng/trùng lặp), PUT diff đúng
  (giữ/xoá/thêm), đăng ký đúng N cron task theo TimeId, 2 giờ gửi cùng lịch
  chặn lẫn nhau, chạy tự động cập nhật CẢ giờ gửi lẫn lịch cha, `runNow`
  chỉ đụng lịch cha.

## 0.22.0 — Nhập hàng loạt kết nối DB (etl-admin + api-admin)

Tính năng mới: tải file Excel (.xlsx) để tạo/sửa NHIỀU `DataSources` (kết
nối CSDL nguồn) cùng lúc, thay vì bấm form từng cái — dùng khi cần khai báo
kết nối cho hàng chục chi nhánh cùng cấu trúc, hoặc muốn script hoá việc cấp
phát/đổi cấu hình kết nối (đúng lúc save-time schema validation ở 0.21.6 phát
huy tác dụng nhất — báo lỗi ngay nếu 1 dòng gõ sai).

- **`etl/lib/dataSourcesImport.js`** (mới) — parse `.xlsx` (cột bắt buộc:
  `Name, Server, DatabaseName, Username, Password`; tuỳ chọn: `Engine`
  (`mssql`/`mysql`, mặc định `mssql`), `Port`, `Encrypt`, `TrustServerCert`)
  + `upsertDataSources` (staging + `MERGE etl.DataSources`, khoá theo
  `Name`). Mật khẩu được **mã hoá TỪNG DÒNG trước khi vào staging table**
  (IV ngẫu nhiên mỗi dòng) — plaintext không chạm câu SQL.
- **`api-server/lib/dataSourcesImport.js`** (mới) — tương tự, không có cột
  `Engine` (đúng phạm vi `api.DataSources`, chỉ SQL Server). Thêm dependency
  `exceljs` + `multer` vào `api-server/package.json` (etl đã có sẵn từ tính
  năng "Nhập chỉ tiêu").
- **`etl/routes/admin/dataSources.js`** và
  **`api-server/routes/admin/dataSources.js`** — thêm `POST /import`
  (multer memoryStorage, không lưu file gốc ra đĩa), gọi `invalidate(id)`
  cho mọi nguồn vừa ghi để job/endpoint đang chạy nạp lại kết nối mới ngay,
  không cần khởi động lại service.
- **`etl-admin/src/pages/DataSourcesPage.jsx`**,
  **`api-admin/src/pages/DataSourcesPage.jsx`** — thêm khối "Nhập hàng
  loạt" (upload file + hiển thị kết quả thêm mới/cập nhật/dòng bị bỏ qua),
  cùng khuôn UI với trang "Nhập chỉ tiêu". `api-admin/src/lib/api.js` được
  bổ sung tham số `isFormData` (etl-admin đã có từ trước).
- Khoá cập nhật là `Name` (không phải khoá DB, `DataSources` không có
  UNIQUE trên cột này) — chạy lại file với 1 dòng sửa (đổi mật khẩu, đổi
  server...) chỉ dòng đó đổi, không tạo trùng.
- 20 test độc lập (`fakeModule` + file `.xlsx` dựng bằng ExcelJS thật): cả 2
  bên — file hợp lệ, thiếu cột bắt buộc, thiếu trường, sai Engine/Port, mật
  khẩu luôn được mã hoá trước khi staging (không bao giờ plaintext trong
  SQL), đếm inserted/updated/ids đúng theo MERGE, rollback khi lỗi giữa
  transaction, route trả 400/200 đúng tình huống, `invalidate()` gọi đúng
  id. `npx vite build` sạch cho cả `etl-admin` và `api-admin`.

## 0.21.6 — Đối chiếu bảng/cột với schema thật ngay lúc lưu cấu hình (etl + api-server)

Không phải fix bảo mật (đã xác nhận ở 0.21.5 — `assertSafeIdentifier` chặn
chèn SQL dù tên bảng/cột đúng hay sai). Mục tiêu: báo lỗi NGAY lúc LƯU cấu
hình job đồng bộ / endpoint realtime, thay vì đợi tới lúc job chạy (hoặc tới
lúc đối tác gọi endpoint) mới lộ ra — quan trọng nhất khi cấu hình được tạo
qua script/gọi API thẳng (bỏ qua dropdown duyệt schema trên etl-admin/
api-admin), ví dụ cấu hình hàng loạt nhiều chi nhánh cùng cấu trúc bảng.

- **`etl/routes/admin/syncJobs.js`** — thêm `assertTableConfigMatchesSchema`/
  `validateTableJobSchema` (dùng `lib/schemaBrowser.js`, cùng nguồn dropdown
  trên etl-admin/): POST job Type='table' đối chiếu bảng chính + bảng liên
  kết (nếu có) với schema thật của DataSource đã chọn; PUT đối chiếu lại
  `dimensionColumns`/`measureColumns` mới (2 trường duy nhất PUT cho sửa) với
  bảng chính của job hiện có. Sai tên bảng/cột -> 400 kèm tên bảng/cột cụ thể,
  không lưu. Job Type='custom' không bị áp (không có bảng nguồn để đối chiếu).
- **`api-server/routes/admin/realtimeEndpoints.js`** — thêm
  `assertSchemaMatches` tương tự, áp cho cả POST và PUT (endpoint realtime
  cho sửa cả bảng/cột qua PUT, khác etl).
- Cập nhật lại comment đầu file ở `etl/lib/tableSyncEngine.js` và
  `api-server/lib/realtimeEngine.js` (viết sai từ 0.21.5, nay đã đúng thực
  tế) — `assertSafeIdentifier` vẫn là lớp chống chèn SQL DUY NHẤT ở tầng
  chạy, vì schema nguồn có thể đổi sau khi lưu (đổi tên/xoá cột) mà job/
  endpoint không hay biết.
- 13 test độc lập (`fakeModule` + gọi thẳng route handler): bảng/cột đúng ->
  201/200; sai tên bảng, sai tên cột đơn, sai tên cột bảng liên kết, sai cột
  PUT -> 400 kèm đúng tên bảng/cột; Type='custom' không bị áp.

## 0.21.5 — Soát SQL injection (etl/rp-server/api-server) — không có lỗ hổng

Rà soát toàn bộ 3 hệ thống — KHÔNG phát hiện lỗ hổng SQL injection nào.
Mọi giá trị đều qua `.input()`/`@param` (mssql) hoặc named placeholder
(mysql2); 2 nơi DUY NHẤT phải ghép tên bảng/cột thẳng vào câu SQL (không
tham số hoá được định danh) — `etl/lib/tableSyncEngine.js` và
`api-server/lib/realtimeEngine.js` — đều bắt buộc qua `assertSafeIdentifier`
(regex `^[A-Za-z0-9_]+$`) trên MỌI định danh trước khi ghép, không có
đường nào bỏ qua.

- **Sửa comment sai lệch** (không phải lỗi bảo mật, chỉ sai mô tả) — cả 2
  file trên từng ghi "tên bảng/cột đã xác nhận tồn tại thật lúc lưu (qua
  schemaBrowser.js)", nhưng route lưu cấu hình thực tế KHÔNG tự đối chiếu
  lại với schema thật (chỉ kiểm tra định dạng, hoặc không kiểm tra gì ở
  `etl/routes/admin/syncJobs.js`) — sửa lại đúng thực tế: tên sai/không
  tồn tại chỉ lộ ra lúc CHẠY (lỗi SQL "invalid object name" bình thường,
  không phải injection).

## 0.21.4 — portal/: danh mục ứng dụng dạng dữ liệu, dễ thêm ứng dụng mới

- **`portal/src/apps.js`** (mới) — danh mục ứng dụng portal hiển thị, mỗi
  ứng dụng 1 phần tử `{key, title, desc, envVar, fallback, audience}`.
  Thêm ứng dụng mới CHỈ cần thêm 1 phần tử vào đây + 1 biến `VITE_*_URL`
  trong `.env` — KHÔNG cần sửa `index.html` nữa (`src/main.js` tự vẽ thẻ
  theo danh sách, lưới thẻ tự giãn theo số lượng qua `auto-fit`). Vẫn giữ
  nguyên tắc cũ: thuần tĩnh, KHÔNG gọi API, không đăng nhập, không cá nhân
  hoá — hiện toàn bộ danh mục cho mọi người, đúng vai trò "danh bạ nội bộ"
  chứ không phải lớp kiểm soát truy cập.
- Mỗi thẻ giờ có thêm nhãn **"Công khai"/"Nội bộ · VPN"** — chỉ để nhân
  viên biết trước cần VPN hay không, không kiểm soát gì (portal không biết
  ai đang xem).

## 0.21.3 — Hướng dẫn cấu hình báo cáo (hướng_dẫn_báo_cáo.md) + hiện cột Id

- **`hướng_dẫn_báo_cáo.md`** (mới, thư mục gốc repo) — hướng dẫn CẤU HÌNH
  từng báo cáo cụ thể (khác README kỹ thuật của từng service), bắt đầu với
  2 cách dựng báo cáo doanh thu chi nhánh: hoàn toàn qua Data Warehouse
  (mục 1), và "hôm nay" qua API Server + Chỉ tiêu/Cùng kỳ vẫn qua Data
  Warehouse (mục 2) — từng bước cụ thể qua etl-admin/api-admin/rp-user,
  kèm `DefinitionJson` mẫu đầy đủ. Báo cáo mới dựng sau này sẽ thêm mục
  vào cùng file này.
- **`rp-user`** — `ApiConnectionsPanel.jsx`/`DataSourcesPanel.jsx` (tab
  "Kết nối API Server"/"Nguồn dữ liệu bổ sung" trong "Biểu mẫu") giờ hiện
  cột `Id` — báo cáo `SourceType='composite'` cần số Id này để khai
  `blocks[].apiConnectionId`/`dataSourceId` trong `DefinitionJson` (không
  có UI có cấu trúc riêng cho composite), trước đây không có cách nào xem
  số Id qua giao diện.

## 0.21.2 — Sửa/thêm 1 siêu thị vào chỉ tiêu tháng — không cần re-upload file

10 test mới.

- **`PUT /admin/sales-targets/one`** (mới, `etl/routes/admin/salesTargets.js`)
  — upsert ĐÚNG 1 dòng (`domain`, `entityCode`, `periodMonth`, `trangThai`,
  `targets`), tái dùng `upsertSalesTargets()` sẵn có (staging + MERGE),
  cùng quyền hẹp `DWH_TARGET_IMPORTER`/vai trò `target_importer` như route
  upload file.
- **Trang "Nhập chỉ tiêu"** (`etl-admin/`) — mục "Sửa / thêm 1 siêu thị":
  nút "Sửa" mỗi dòng tự điền sẵn dữ liệu hiện có (không mất chỉ tiêu khác
  chỉ vì tick 1 ô "Đã đóng cửa" — route ghi đè nguyên `TargetsJson`, giao
  diện tự tải dữ liệu cũ lên form trước khi cho sửa), nút "Thêm siêu thị
  mới" cho dòng trống — dùng khi giữa tháng phát sinh mở/đóng 1-2 siêu thị.

## 0.21.1 — Đánh dấu đóng cửa siêu thị (TrangThai) trong chỉ tiêu tháng

12 test mới.

- **Cột `TrangThai` (tuỳ chọn)** trong file Excel "Nhập chỉ tiêu"
  (`etl-admin/`) — `DaDong` LOẠI HẲN siêu thị đó khỏi báo cáo `composite`
  tháng này (cả dòng dữ liệu lẫn mọi dòng "Tổng cộng"), để trống/`HoatDong`
  = hiện bình thường.
- **CỐ Ý chỉ loại khi đánh dấu TƯỜNG MINH** — thiếu cả dòng chỉ tiêu (chưa
  kịp nhập, hoặc quên) KHÔNG bị coi là đóng cửa, siêu thị đó vẫn hiện ra
  bình thường (chỉ trống cột Chỉ tiêu) — tránh mất siêu thị khỏi báo cáo
  chỉ vì lỗi/sai sót nhập liệu tháng đó.
- File chỉ tiêu có thể CHỈ chứa cột `TrangThai` (không kèm số liệu) nếu mục
  đích chỉ là đánh dấu đóng cửa hàng loạt.
- Mở siêu thị mới KHÔNG cần cấu hình gì ở đây — báo cáo composite không có
  danh sách cố định, tự động xuất hiện ngay khi có dữ liệu.

## 0.21.0 — SourceType='composite': ghép nhiều nguồn + dòng "Tổng cộng"

Bước 3 (cuối) cho báo cáo doanh thu chi nhánh — ghép "Thực đạt" (DWH hoặc
realtime qua API Server) + "Chỉ tiêu" (`dwh.SalesTargets`) + "Cùng kỳ năm
trước" (DWH, lệch 1 năm) vào cùng 1 dòng, cộng dồn dòng "Tổng cộng" theo
nhóm — 25 test mới (9+8+4 backend, 4 regression xác nhận không ảnh hưởng
`directDb`/`apiReport`/`externalApi`).

- **`SourceType='composite'`** (mới, `rp-db/schema.sql` — migration idempotent
  thêm vào CHECK constraint) — `DefinitionJson.blocks`: mỗi khối tự chọn
  `directDb`/`apiReport`/`apiRealtime`, hoặc `isTarget:true` (đọc
  `dwh.SalesTargets`). Ghép theo `entityCode`, công thức
  (`lib/formulaEngine.js`, KHÔNG đổi) tham chiếu field dạng
  `"tenKhoi.field..."` — xem `rp-server/README.md` mục "Báo cáo ghép nhiều
  nguồn (composite)" cho ví dụ đầy đủ.
- **`lib/compositeReportRunner.js`** (mới) + **`lib/salesTargetsReader.js`**
  (mới, CHỈ ĐỌC `dwh.SalesTargets`) — tái dùng nguyên `runReport()`/
  `runApiReport()` đã có cho từng khối, không viết lại logic fetch.
  `dateOffsetYears` dịch đúng ngày dương lịch (vd `-1` = cùng ngày năm
  trước); khối target tính `PeriodMonth` = ngày 1 tháng chứa ngày yêu cầu.
- **`groupBy`** (tuỳ chọn trong `DefinitionJson`) — dòng "Tổng cộng" theo
  nhóm + tổng toàn báo cáo, tính bằng CỘNG DỒN DỮ LIỆU THÔ rồi chạy lại
  đúng công thức (SUM/SUM, không phải trung bình cộng % từng dòng). Giá trị
  không khớp nhóm nào đã khai vẫn xuất hiện, không âm thầm mất.
- **`rp-server/routes/reportCatalog.js`** — `validateCompositeDefinition()`
  (mới) kiểm tra `blocks` ngay lúc lưu (key trùng, thiếu domain/apiTarget/
  targetDomain tuỳ loại khối) — lỗi lộ ra ngay, không đợi tới lúc chạy thật.
- **`rp-user`** — `ReportCatalogPanel.jsx` thêm `composite` vào danh sách
  SourceType chọn được (theo đúng quy ước JSON thô sẵn có, không thêm UI
  cấu trúc riêng); `FilterForm.jsx` thêm kiểu lọc `"date"` (ô chọn ngày —
  dùng cho bộ lọc `eventDate` của composite, cũng dùng được cho báo cáo
  khác cần lọc 1 ngày đơn thay vì khoảng ngày).
- **Xuất file** (`lib/exportExcel.js`/`lib/exportPdf.js`) — dòng "Tổng cộng"
  (đánh dấu `__isSubtotal`) in đậm, khớp file mẫu.

## 0.20.0 — Giữ lịch sử theo ngày cho dwh.ReportFacts (opt-in mỗi job)

Bước 2 cho báo cáo cần so cùng kỳ năm trước (đúng ngày dương lịch) — 13
test mới.

- **`dwh.ReportFacts`** — khoá UNIQUE đổi từ `(SourceSystem, Domain,
  EntityCode)` thành thêm `EventDate`. Migration idempotent (drop constraint
  cũ nếu có, tạo constraint mới) — an toàn chạy lại nhiều lần trên CSDL đã
  triển khai.
- **`etl.SyncJobs.KeepHistory`** (mới, `BIT DEFAULT 0`) — TẮT mặc định,
  không đổi hành vi job đang có. BẬT qua checkbox "Giữ lịch sử theo ngày"
  khi tạo/sửa job (`etl-admin/`).
- **`etl/lib/upsert.js`** — `upsertReportFacts(pool, rows, {keepHistory})`:
  `keepHistory=false` (mặc định) tự dọn dòng khác `EventDate` của cùng thực
  thể TRƯỚC khi MERGE (giữ đúng "1 dòng/thực thể" như thiết kế cũ, chuyển
  từ tầng CSDL sang tầng ứng dụng); `keepHistory=true` bỏ qua bước dọn — mỗi
  ngày 1 dòng riêng.

## 0.19.0 — Nhập chỉ tiêu (target/KPI) qua etl-admin

Bước đầu cho báo cáo doanh thu chi nhánh cần so "Thực đạt" với "Chỉ tiêu"
(vd báo cáo nhanh doanh thu BRGMart) — 20 test mới.

- **`dwh.SalesTargets`** (mới, `dwh/schema.sql`) — bảng RIÊNG khỏi
  `dwh.ReportFacts`, lưu chỉ tiêu theo `Domain + EntityCode + PeriodMonth`,
  `TargetsJson` linh hoạt (tên chỉ tiêu không cố định trước trong code).
- **Trang "Nhập chỉ tiêu"** (`etl-admin/`, mới) — upload file Excel (.xlsx),
  dòng 1 header, 2 cột cố định `MaSieuThi`/`Thang`, các cột sau tự do trở
  thành tên chỉ tiêu. Nhập lại đúng domain+tháng GHI ĐÈ (upsert), không cộng
  dồn.
- **Tài khoản CSDL RIÊNG, hẹp hơn `etl_writer`** — `dwh_target_importer`
  (`dwh/grants.sql`), CHỈ có quyền trên đúng bảng `dwh.SalesTargets`, không
  đụng được `dwh.ReportFacts` dù chạy trong cùng tiến trình `etl` — route
  "Nhập chỉ tiêu" dùng pool RIÊNG (`DWH_TARGET_IMPORTER_*` trong `.env`),
  không dùng chung pool `DWH` thường.
- **Vai trò `target_importer`** (mới, `admin.AdminUsers.Role`) — CHỈ thấy
  trang "Nhập chỉ tiêu" trong `etl-admin/`, không thấy Nguồn dữ liệu/Đồng bộ
  — cấp cho nhân sự chỉ cần nhập chỉ tiêu hàng tháng, không phải quản trị
  ETL đầy đủ. `admin` vẫn vào được mọi trang như cũ.

## 0.18.0 — Cấu hình Nginx triển khai 1 máy chủ ứng dụng + 1 máy chủ CSDL riêng

- **`deploy/nginx.conf`** — mẫu cấu hình Nginx đầy đủ cho mô hình cả 3 hệ
  thống (`etl/`, `rp-server/`, `api-server/`, chạy bằng PM2 qua
  `deploy/ecosystem.config.js` đã có sẵn) + 4 giao diện tĩnh (`portal/`,
  `rp-user/`, `api-admin/`, `etl-admin/`) trên CÙNG 1 máy chủ, CSDL trên
  máy chủ khác. 5 domain: `report.*`/`api.*`/`portal.*` công khai (`api.*`
  CHỈ lộ `/api/v1/*`, không gì khác), `api-admin.*`/`etl-admin.*` nội bộ/VPN
  (chặn bằng `allow`/`deny` ngay tầng Nginx, độc lập với
  `*_ADMIN_ALLOWED_IPS` ở tầng ứng dụng — 2 lớp phòng thủ riêng). File này
  đã được 2 README (`rp-server/`, `api-server/`) tham chiếu tới từ giai đoạn
  0/1 trước đây ("Xem mẫu cấu hình Nginx thật ở `deploy/nginx.conf`") — giờ
  mới thực sự tồn tại.
- **`deploy/README.md`** (mới) — hướng dẫn triển khai đầy đủ: cài đặt/build/
  chạy PM2 trên máy chủ ứng dụng, chạy schema + `grants.sql` trên máy chủ
  CSDL riêng, DNS/TLS cho 5 domain, danh sách kiểm tra sau triển khai (đúng
  domain nào 404 `/admin`, đúng `TRUST_PROXY_HOPS` qua log IP thật).
- `etl/README.md` — cập nhật mục "Triển khai": làm rõ `/admin/*` của `etl`
  VẪN có thể đứng sau Nginx CHUNG với 2 hệ kia (khác hướng dẫn cũ ngụ ý nên
  tách hẳn), miễn là domain riêng + `allow`/`deny` nội bộ, không chung
  route với `/api/v1/*`/`/api/*` công khai.

## 0.17.0 — Rà soát bảo mật/hiệu năng (Giai đoạn 3)

Nốt các mục còn lại của đợt rà soát bảo mật + hiệu năng trước khi public
`api-server`/`rp-server` ra Internet — 24 test mới.

- **Pin thuật toán JWT tường minh** (`algorithms: ['HS256']`) ở MỌI lệnh gọi
  `jwt.verify` (phiên admin cả 3 service, OAuth2 access token api-server,
  phiên rp-user) — phòng thủ chiều sâu chống tấn công đổi thuật toán ký
  (algorithm confusion), dù thư viện `jsonwebtoken` hiện đại đã mặc định an
  toàn hơn các bản cũ.
- **Chặn NaN/âm cho `page`/`pageSize`** ở MỌI route còn thiếu (đã sửa ở giai
  đoạn 0 cho `rp-server` `/reports/:id/run`, giờ thêm `api-server`
  `/api/v1/reports/:id/run` và `/api/v1/realtime/:endpoint/list`) — trước
  đây `parseInt(x || '1', 10)` với `x` là chuỗi không phải số (vd
  `?pageSize=abc`) vẫn ra `NaN` (chỉ `''`/`undefined` mới rơi về `'1'` đúng
  cách), truyền `NaN` xuống `OFFSET`/`FETCH NEXT` của SQL Server.
- **CORS tuỳ chọn cho `/api/v1/*`** (`api-server/lib/corsAllowlist.js`, biến
  `CORS_ALLOWED_ORIGINS`) — TẮT MẶC ĐỊNH (không đổi hành vi hiện tại), chỉ
  bật khi operator khai rõ từng origin cần cho phép gọi thẳng từ trình duyệt
  (không có tuỳ chọn "*"). Không áp cho `/admin/*`.
- **Chặn kích thước cache AST công thức** (`lib/formulaEngine.js`, cả
  rp-server và api-server) — `astCache` trước đây là `Map` không giới hạn,
  giờ chặn tối đa 500 mục theo kiểu LRU (Map giữ thứ tự chèn, không cần thư
  viện ngoài).
- **Thêm mẫu GRANT quyền tối thiểu** — `dwh/grants.sql`, `etl-db/grants.sql`,
  `api-db/grants.sql`, `rp-db/grants.sql` (KHÔNG tự chạy, DBA xem lại + đổi
  mật khẩu mẫu trước khi dùng) — khớp đúng tên tài khoản đã khai trong
  `.env.example` từng service, chỉ cấp quyền lên đúng schema mỗi tài khoản
  thật sự cần, không dùng `sa`/`db_owner`.

## 0.16.0 — Hiệu năng cho traffic công khai (Giai đoạn 2)

Theo kết quả rà soát hiệu năng — chuẩn bị cho `api-server`/`rp-server` nhận
traffic thật từ Internet, 17 test mới.

- **`PERSISTED_DIMENSION_COLUMNS`** (`lib/reportEngine.js`, cả rp-server và
  api-server) — cơ chế cho phép chuyển 1 field Dimensions cụ thể từ lọc qua
  `JSON_VALUE(Dimensions, '$.field')` (luôn quét + parse JSON từng dòng,
  không index được) sang CỘT THẬT có index, khi đã xác định rõ 1 báo cáo
  chậm vì field đó. `dwh/schema.sql` thêm hướng dẫn đầy đủ (mục "Tối ưu lọc
  theo Dimensions") kèm mẫu SQL `ALTER TABLE ... PERSISTED` + `CREATE INDEX`
  — chỉ cần thêm đúng 1 dòng vào map này ở CẢ 2 bản `reportEngine.js`, không
  sửa gì khác. Map RỖNG mặc định — không đoán field nào "chắc sẽ cần", chỉ
  thêm khi đã xác định thật.
- **Tăng pool CSDL mặc định** — `DWH_POOL_MAX`/`RP_POOL_MAX`/`ADMIN_POOL_MAX`
  từ 10 lên 20 trong `.env.example` (etl giữ nguyên — không lộ ra Internet,
  job chạy tuần tự theo thiết kế) — điểm khởi đầu hợp lý hơn cho traffic
  công khai, không phải con số cuối cùng.
- **Cache TTL ngắn cho `/reports/:id/run`** (`lib/reportResultCache.js`,
  biến `REPORT_CACHE_TTL_MS`, mặc định 30 giây, `=0` để tắt) — cả rp-server
  (`POST /api/reports/:id/run`) lẫn api-server (`GET /api/v1/reports/:id/run`).
  Khoá cache gồm đủ mọi tham số ảnh hưởng kết quả (reportId, filters, page,
  pageSize, và `fields` với api-server) — sai 1 chi tiết là cache miss, chạy
  lại thật. Quyền gọi (`ConsumerReportAccess`/kiểm tra vai trò) LUÔN chạy
  thật mỗi request, KHÔNG bị cache bỏ qua — đã kiểm tra bằng test riêng.
  KHÔNG áp cho `/export` hay `jobs/reportEmailScheduler.js` (lịch gửi email
  luôn cần dữ liệu mới nhất tại thời điểm gửi, không lấy từ cache).

## 0.15.0 — Bảo mật chiều sâu trước khi public (Giai đoạn 1)

Tiếp theo 0.14.0 (nhóm CRITICAL/HIGH) — nhóm MEDIUM, phòng thủ nhiều lớp
(defense-in-depth), 44 test.

- **`helmet()`** cho cả 3 server (etl/api-server/rp-server) — header bảo
  mật cơ bản (`X-Content-Type-Options`, `X-Frame-Options`, HSTS...), tắt CSP
  mặc định (không cần cho JSON API thuần, giao diện tĩnh Nginx phục vụ riêng).
- **Chống phát lại (replay) cho HMAC** (api-server, `AuthMethod='hmac'`) —
  trước đây chỉ kiểm tra `X-Timestamp` trong cửa sổ ±5 phút, 1 request bị
  chặn bắt vẫn gửi lại y nguyên được nhiều lần trong cửa sổ đó với chữ ký
  vẫn hợp lệ. `lib/hmacAuth.js` giờ nhớ chữ ký ĐÃ DÙNG, từ chối nếu thấy lại.
- **Cookie phiên `secure` tự động bật khi `NODE_ENV=production`** (cả 3
  server) — trước đây chỉ dựa vào biến `*_COOKIE_SECURE` trong `.env`, quên
  đặt là cookie phiên gửi qua HTTP thường một khi public.
- **Tên biến bí mật ký JWT RIÊNG cho từng service** — đổi `ADMIN_JWT_SECRET`
  (trùng tên giữa etl và api-server) thành `ETL_ADMIN_JWT_SECRET`/
  `API_ADMIN_JWT_SECRET`; đổi `JWT_SECRET` (rp-server) thành `RP_JWT_SECRET`
  — tránh operator lỡ copy `.env` giữa 2 service làm phiên dùng chéo được.
  **Thêm `issuer`/`audience` cho MỌI JWT** (phiên admin cả 3 service, token
  OAuth2 đối tác) — dù 2 service lỡ dùng CHUNG giá trị secret, token phát
  hành bởi bên này vẫn bị bên kia từ chối (đã kiểm tra bằng test mô phỏng
  đúng kịch bản "operator copy nhầm .env"). Khởi động LỖI NGAY nếu secret
  còn là giá trị mẫu trong `.env.example`, không chạy "được" với secret ai
  cũng đọc được từ repo. **Yêu cầu operator đổi tên biến trong `.env` thật
  khi nâng cấp** — không tự tương thích ngược, cố ý (buộc xác nhận lại).
- **`ETL_ADMIN_ALLOWED_IPS`** (`etl/lib/adminIpAllowlist.js`, mới) — ETL là
  dịch vụ duy nhất trong 3 trước đây KHÔNG có lớp phòng thủ IP bổ sung cho
  `/admin/*`, dù nắm giữ mật khẩu của toàn bộ nguồn dữ liệu đã cấu hình —
  giờ có cùng cơ chế `api-server` đã có từ trước.
- **Chống chạy chồng lấn cho cron job** (ETL `jobs/scheduler.js` VÀ Report
  Server `jobs/reportEmailScheduler.js`) — 1 job/lịch chạy lâu hơn chu kỳ
  cron của chính nó (nguồn chậm, báo cáo lớn) trước đây có thể tự "đụng"
  chính nó ở lượt tiếp theo (ETL: tranh chấp khoá MERGE; lịch email: gửi
  trùng email + nhân đôi bộ nhớ export). Nút "Chạy thử"/"Gửi ngay" trên giao
  diện cũng đi qua cùng cơ chế chặn thay vì gọi tắt.
- **Giới hạn thời gian tầng HTTP server** (`requestTimeout`/`headersTimeout`/
  `timeout`, cả 3 server) — chống client cố tình gửi request/body nhỏ giọt
  giữ kết nối (và connection CSDL đã mượn) mở gần như vô hạn.
- Rà soát riêng các route "test kết nối"/"gửi thử" còn trả nguyên
  `err.message` (dataSources/apiConnections/emailSettings/reportCatalog/
  reportEmailSchedules) — xác nhận đây là tính năng debug CÓ CHỦ ĐÍCH cho
  admin cấu hình hạ tầng nội bộ do chính họ kiểm soát, không phải lỗ hổng
  (khác điểm đã sửa ở 0.14.0: `externalConnections.js`, nơi mục tiêu là bên
  ngoài KHÔNG đáng tin) — không sửa, tránh làm mất công cụ hữu ích.

## 0.14.0 — Vá lỗ hổng bảo mật chặn trước khi public API Server & Report Server (Giai đoạn 0)

Theo kết quả rà soát chuyên sâu bảo mật + hiệu năng của cả 3 hệ thống (ETL,
API Server, Report Server) trước khi đưa `api-server`/`rp-server` ra
Internet. Đây là nhóm lỗ hổng **CRITICAL/HIGH** — bắt buộc trước khi public,
mỗi mục kèm test riêng, tổng cộng 63 test.

- **Rate limiter api-server không còn bị vượt qua bằng cách đổi header** —
  `keyGenerator` cũ khoá "bucket" theo `X-API-Key`/`X-Key-Id`/`Authorization`
  do người gọi TỰ khai, CHƯA xác thực — đổi giá trị mỗi request là có bucket
  riêng, vô hiệu hoá giới hạn, dồn được vào `POST /api/v1/oauth/token` (luôn
  đụng CSDL trước khi biết `client_id` hợp lệ hay không) làm cạn pool CSDL
  admin. Giờ khoá theo `req.ip` thật (yêu cầu `trust proxy` đúng, xem dưới).
- **`trust proxy`** (`TRUST_PROXY_HOPS`, mặc định 1) — thêm cho cả 3 server
  (etl/api-server/rp-server). Thiếu dòng này khi có Nginx đứng trước, `req.ip`
  luôn là IP của Nginx cho MỌI request — làm hỏng ngầm giới hạn IP riêng
  từng đối tác, `adminIpAllowlist`, giới hạn tần suất, và cột `IpAddress`
  trong log kiểm toán.
- **Chống dò mật khẩu đăng nhập** — `lib/loginRateLimit.js` (bản sao 3 nơi:
  etl/api-server/rp-server), tối đa 10 lần sai liên tiếp theo (IP+username)
  /15 phút, đăng nhập đúng xoá ngay bộ đếm. Kèm vá dò username qua chênh
  lệch thời gian phản hồi (`verifyCredentials` giờ chạy `bcrypt.compare`
  với hash giả ngay cả khi username không tồn tại).
- **Chặn SSRF cho "Kết nối API đối tác"** (rp-server) — `lib/urlSafety.js`
  mới: `BaseUrl`/`TokenUrl` không được trỏ tới địa chỉ nội bộ/riêng tư (RFC
  1918, loopback, link-local — gồm `169.254.169.254`, metadata cloud), kiểm
  tra cả lúc lưu lẫn ngay trước mỗi lần gọi thật. Trước đây admin (hoặc ai
  chiếm được phiên admin) có thể trỏ kết nối vào mạng nội bộ, biến rp-server
  công khai thành bàn đạp dò mạng.
- **Sửa path traversal khi tải file mẫu báo cáo** (rp-server) — tên file lưu
  giờ qua `path.basename()` + lọc `\`, không dùng thẳng `file.originalname`
  — trước đây tải file tên `../../../etc/cron.d/evil.xlsx` có thể ghi ra
  ngoài thư mục `templates/`.
- **Chặn `pageSize` không giới hạn ở `rp-server` `/api/reports/:id/run`** —
  khớp đúng `api-server` (`Math.min(...,1000)`), có thêm chặn NaN/âm. Trước
  đây gọi với `pageSize` rất lớn ép trả cả triệu dòng trong 1 response, bỏ
  qua luôn giới hạn 5000 dòng của `/export`.
- **`api.ConsumerRealtimeAccess`** (bảng mới, api-db) — CÙNG khuôn
  `ConsumerReportAccess` nhưng cho endpoint realtime: trước đây bất kỳ đối
  tác nào có scope `realtime` gọi được MỌI endpoint đã tạo, bất kể nguồn dữ
  liệu (`api.DataSources`) đứng sau — nguy hiểm khi nhiều chi nhánh/siêu thị
  dùng chung API Server (1 đối tác đọc được realtime của MỌI chi nhánh).
  Trang "Đối tác" (`api-admin/`) thêm nút "Realtime được gọi".
- **Giới hạn tần suất riêng theo từng đối tác giờ THỰC SỰ có hiệu lực** —
  `api.ApiConsumers.RateLimitPerMinute` trước đây chỉ lưu trong CSDL, không
  middleware nào đọc (đã tự ghi nhận trong README cũ là việc "làm sau").
  `lib/consumerRateLimit.js` mới: cửa sổ cố định 60 giây theo `consumer.id`,
  áp SAU xác thực — độc lập với bộ giới hạn theo IP nặc danh TRƯỚC xác thực.
  Với `authMethod='oauth2'`, giá trị nhúng thẳng vào access token JWT lúc
  cấp (giống `scopes`/`allowedIps` đã làm).
- Nhân tiện khoá cứng `algorithms: ['HS256']` cho mọi `jwt.verify()`/`jwt.sign()`
  trong cả 3 server — phòng thủ chiều sâu chống alg-confusion, dù thư viện
  `jsonwebtoken` hiện tại đã mặc định an toàn.

## 0.13.0 — ETL chọn được VIEW làm nguồn đồng bộ (không chỉ bảng thật)

- `etl-admin/` — bước "chọn bảng" (bảng chính lẫn bảng liên kết) khi tạo Sync
  Job giờ liệt kê CẢ **VIEW**, không chỉ `BASE TABLE` như trước — đúng khớp
  với API Server đã hỗ trợ từ trước (`api-server/lib/schemaBrowser.js`).
  `etl/lib/dbAdapters/mssql.js`/`mysql.js`:`listTables()` mở `WHERE
  TABLE_TYPE IN ('BASE TABLE', 'VIEW')`, thêm cột `tableType` để giao diện
  hiện nhãn "(bảng)"/"(view)" trong dropdown.
- **Không chỉ để xem trước** — VIEW chọn được dùng THẲNG làm nguồn đồng bộ
  THẬT (`tableSyncEngine.js` dùng nguyên tên đã chọn làm `FROM`, không có
  nhánh riêng cho VIEW, xử lý y hệt bảng thật). Hữu ích khi: (1) cần gộp
  nhiều hơn 1 bảng liên kết mà `etl.SyncJobs` chỉ hỗ trợ tối đa 1 JOIN — phía
  nguồn (vd từng CSDL cửa hàng BRG Mart) tự tạo VIEW gộp sẵn; (2) chỉ muốn lộ
  đúng cột cần cho tài khoản chỉ đọc của ETL, không cấp quyền thẳng trên bảng
  gốc (nguyên tắc least-privilege).
- `listForeignKeys()` (gợi ý tự động chọn cột nối) thường trả rỗng cho VIEW
  (không có ràng buộc khoá ngoại thật) — hành vi đúng, không phải lỗi, chỉ
  mất phần gợi ý tự động.
- Test: `test-etl-schema-browser-views.js` (3/3 — xác nhận câu SQL của cả 2
  adapter MSSQL/MySQL đã gồm VIEW và trả `tableType`).

## 0.12.1 — Soát lại cấu hình nguồn dữ liệu ETL & API Server

- Rà soát theo yêu cầu: (1) ETL cấu hình được đích Data Warehouse VÀ nhiều
  CSDL nguồn (mỗi chi nhánh/siêu thị trong chuỗi một dòng, vd BRG Mart); (2)
  API Server cấu hình được kết nối Data Warehouse VÀ nhiều CSDL khác cần lấy
  dữ liệu realtime. Xác nhận CẢ HAI đã đúng: DWH là kết nối tĩnh qua `.env`
  (đích chung, không cần nhiều); nguồn nhiều CSDL là bảng động không giới hạn
  số dòng — `etl.DataSources` (trang "Nguồn dữ liệu", `etl-admin/`, hỗ trợ cả
  MSSQL/MySQL) và `api.DataSources` (trang "Nguồn dữ liệu", `api-admin/`, chỉ
  MSSQL) — mỗi `SyncJob`/`RealtimeEndpointDef` có khoá ngoại chọn ĐÚNG 1
  nguồn cụ thể. Không phát hiện thiếu chức năng.
- Sửa 1 chỗ comment đầu `api-server/db.js` còn mô tả pool `getPool('OLTP')`
  đã bỏ từ trước (không còn nơi nào gọi tới) — cập nhật đúng thực tế 2 pool
  hiện có (`DWH`, `ADMIN`) và trỏ rõ sang `lib/dataSourcePool.js` cho nguồn
  động, tránh gây hiểu nhầm khi đọc code.

## 0.12.0 — Lịch gửi email báo cáo tự động (rp-server)

- Bảng mới **`app.ReportEmailSchedules`** (rp-db) — mỗi dòng là 1 lịch: báo
  cáo (`ReportId`), lịch chạy (`CronExpression`), người nhận, bộ lọc cố định
  (`FilterValuesJson`), định dạng xuất (`excel`/`pdf`), bật/tắt, lần gửi gần
  nhất + trạng thái/lỗi. Trang mới "Lịch gửi email báo cáo" trong menu Hệ
  thống.
- **Lịch chạy dựng qua giao diện** (Tần suất Hàng ngày/Hàng tuần + chọn thứ +
  Giờ gửi), không bắt gõ cron tay — tab "Nâng cao" vẫn nhận cron thô cho lịch
  phức tạp hơn. `rp-server/jobs/reportEmailScheduler.js` — job `node-cron`
  ĐẦU TIÊN của rp-server (thêm dependency `node-cron`, chưa từng có job nền
  nào trước đây), nạp lại từ CSDL mỗi 60 giây, cùng khuôn hoàn toàn với
  `etl/jobs/scheduler.js` (`registerJob`/`unregisterJob`/`refresh`/
  `rescheduleJob`) — CRUD gọi `rescheduleJob(id)` ngay sau ghi, không đợi chu
  kỳ 60 giây.
- **Bộ lọc theo ngày dùng PRESET tương đối, không phải giá trị cố định** —
  `lib/reportEmailFilters.js`: lọc kiểu `dateRange` chỉ nhận Hôm nay/Hôm
  qua/7 ngày qua/30 ngày qua/Tuần này/Tháng này/Tháng trước, tính lại thành
  `{from,to}` THẬT NGAY LÚC GỬI — khác một ngày cố định lưu sẵn (vô nghĩa với
  báo cáo lặp lại hàng ngày, vì hôm nay và hôm sau cần ra kết quả khác nhau).
  Lọc loại khác (multiSelect/select) dùng giá trị cố định thật.
- **"Gửi ngay"** — nút trên mỗi dòng, chạy thật NGAY LẬP TỨC (không đợi giờ
  đã đặt, hoạt động cả khi lịch đang tắt) để kiểm tra cấu hình trước khi tin
  tưởng giao cho lịch tự động — lỗi thật (SMTP sai, báo cáo lỗi, người nhận
  sai định dạng...) trả `400` kèm thông điệp rõ ràng lên giao diện ngay, khác
  lúc job tự chạy theo giờ (chỉ ghi `LastStatus='FAILED'`/`LastError` + log,
  không có ai đợi xem ngay lúc đó).
- **Tách dùng chung**: `lib/mailer.js` (gửi email qua cấu hình SMTP chung —
  trước đây "Gửi thử" tự dựng transport tại chỗ, giờ dùng chung với lịch gửi
  tự động); `lib/reportRunner.js` (tách `loadDefinition`/`runDefinition` ra
  khỏi `routes/reports.js`, dùng chung với job lịch gửi — chạy báo cáo đúng
  1 chỗ logic dù gọi từ HTTP hay từ cron).
- Test: `test-report-email-filters.js` (16/16 — presets ngày + resolveFilterValues),
  `test-report-email-scheduler.js` (7/7 — vòng đời cron + luồng gửi thật/lỗi),
  `test-report-email-schedules-route.js` (11/11 — CRUD qua HTTP thật, validate
  cron/email/báo cáo), `test-reports-route-regression.js` (4/4 — xác nhận tách
  `reportRunner.js` không đổi hành vi `/run`/`/export`), `test-cron-helpers.js`
  (6/6 — round-trip form đơn giản ↔ chuỗi cron).

## 0.11.0 — OAuth2 Client Credentials & HMAC ký request (2 chiều)

- **API Server (chiều vào — đối tác gọi mình)** — `api.ApiConsumers` thêm
  `AuthMethod` (`apiKey`/`oauth2`/`hmac`, mặc định `apiKey` — không đổi được
  sau khi tạo, cần tạo đối tác mới nếu đổi cách xác thực). `ApiKeyHash` giờ
  nullable; thêm `ClientId`/`ClientSecretHash` (oauth2) và
  `HmacKeyId`/`HmacSecretEncrypted` (hmac, mã hoá qua `lib/crypto.js` như
  mật khẩu `DataSources`). **Lưu ý SQL Server**: đổi `UNIQUE` constraint cũ
  trên `ApiKeyHash` thành 3 unique index CÓ LỌC (`WHERE col IS NOT NULL`) cho
  `ApiKeyHash`/`ClientId`/`HmacKeyId` — SQL Server (khác Postgres) coi nhiều
  `NULL` là trùng nhau dưới `UNIQUE` thường, sẽ vỡ ngay từ đối tác oauth2/hmac
  thứ 2 nếu không lọc.
  - `POST /api/v1/oauth/token` (mới, `api-server/lib/oauthTokens.js` +
    `routes/v1/oauth.js`) — đổi `client_id`/`client_secret` (form body hoặc
    Basic header) lấy access token: JWT tự chứa `{sub,name,scopes,allowedIps}`
    (ký bằng `OAUTH_JWT_SECRET`, TTL `OAUTH_TOKEN_TTL_SECONDS`, mặc định
    3600s) — xác minh không cần tra CSDL/cache, cùng kiểu với
    `lib/adminAuth.js`. Đánh đổi: đổi quyền/IP chỉ có hiệu lực với token cấp
    SAU đó, token đã phát vẫn giữ quyền cũ tới khi hết hạn.
  - HMAC ký request (`lib/hmacAuth.js`) — đối tác gửi kèm header
    `X-Key-Id`/`X-Timestamp`/`X-Signature`, server tính lại chữ ký từ
    `METHOD\npath\ntimestamp\nrawBody` (cần `req.rawBody` — thêm `verify` vào
    `express.json()`), so sánh bằng `crypto.timingSafeEqual`, chấp nhận lệch
    giờ trong 5 phút (chặn replay).
  - `lib/apiAuth.js`: `authenticate()` thử theo thứ tự Bearer → HMAC header →
    `X-API-Key`, trả về CÙNG hình dạng consumer bất kể phương thức nào thành
    công — logic kiểm scope/IP allowlist đã có (0.10.0) không đổi.
  - Trang "Đối tác" (`api-admin/`): chọn `AuthMethod` lúc tạo; banner bí mật
    hiện đúng hình dạng theo phương thức (apiKey / clientId+clientSecret /
    hmacKeyId+hmacSecret); "Luân chuyển bí mật" giữ nguyên định danh công
    khai (ClientId/HmacKeyId), chỉ đổi phần bí mật.
- **Report Server (chiều ra — mình gọi đối tác)** — `app.ExternalApiConnections`
  (0.10.0) thêm 2 `AuthType`: `oauth2ClientCredentials` (thêm cột `TokenUrl`
  — `lib/externalApiConnectionPool.js` tự `POST grant_type=client_credentials`,
  cache token theo `expires_in` với 10 giây an toàn trước hạn, tự xin lại khi
  hết hạn) và `hmacSignature` (`lib/hmacSign.js`, ký theo ĐÚNG quy ước
  api-server dùng để xác minh — đã kiểm tra chữ ký 2 chiều khớp nhau). Đây là
  quy ước RIÊNG ghép cặp giữa 2 hệ thống HCRC, không phải chuẩn chung — đối
  tác thật hầu như dùng quy ước ký khác, cần code riêng nếu vậy (đã ghi rõ
  trong README + UI).
- Test: `test-hmac-auth.js`, `test-oauth-tokens.js`, `test-apiauth-dispatch.js`,
  `test-oauth-route.js`, `test-external-oauth-hmac.js` (script Node độc lập,
  fake module qua `require.cache`) — bao gồm xác minh THỰC rằng chữ ký
  `rp-server/lib/hmacSign.js` tạo ra được `api-server/lib/hmacAuth.js` chấp
  nhận, không chỉ đọc code suy luận khớp.

## 0.10.0 — Report Server gọi thẳng API đối tác & giới hạn IP theo đối tác

- **`SourceType='externalApi'`** (rp-db) — báo cáo giờ gọi được THẲNG một API
  do đối tác bên ngoài xây dựng, không qua API Server. Bảng mới
  `app.ExternalApiConnections`: Base URL + `AuthType` (`none`/`headerKey`/
  `queryParam`/`basicAuth` — bao được cả API key riêng lẫn Bearer token tĩnh
  qua `headerKey`). `DefinitionJson` thêm `externalPath` (URL, chèn được
  `{field}` từ bộ lọc), `externalShape` (`lookup`/`list`), `externalListPath`
  (JSON path tới dữ liệu trong response). `columns` dùng đường dẫn JSON phẳng
  hoặc cột công thức {key,label,formula} — TÁI DÙNG nguyên `lib/formulaEngine.js`
  đã có, không viết lại. **Chưa hỗ trợ** OAuth2 Client Credentials hay HMAC
  ký request — phức tạp hơn hẳn, làm khi có đối tác cụ thể cần.
- rp-server: `lib/externalApiConnectionPool.js`, `lib/externalReportClient.js`
  (dựng request/áp xác thực/trích JSON theo path/chiếu cột — đã test cả 3
  kiểu xác thực + JSON path lồng nhau + công thức), `routes/externalConnections.js`
  (CRUD). Tab mới "Kết nối API đối tác" + nút **"Chạy thử"** ngay trên form
  báo cáo (gọi thật với cấu hình đang soạn, chưa cần lưu) — API đối tác
  không kiểm soát được, rủi ro sai cấu hình (path/JSON path) cao hơn hẳn nội
  bộ, nên test được trước khi kích hoạt cho người dùng quan trọng hơn các
  `SourceType` khác.
- **Giới hạn IP theo từng đối tác API** — `api.ApiConsumers` thêm `AllowedIps`
  (api-db), phân tách dấu phẩy, chấp nhận IP đơn lẫn CIDR (IPv4). Kiểm tra
  SAU KHI key đã hợp lệ (`lib/apiAuth.js` + `lib/ipMatch.js`, đã test cả CIDR
  lẫn IPv4-mapped IPv6 qua proxy) — để trống = không giới hạn, hành vi cũ.
  Khác `lib/adminIpAllowlist.js` (danh sách CHUNG cho `/admin/*`) — đây RIÊNG
  từng đối tác, cho `/api/v1/*`. Cấu hình qua ô "IP cho phép" trên trang "Đối
  tác" (`api-admin/`).

## 0.9.0 — Tuỳ biến dữ liệu ra ngoài & công thức tính toán

- **Cột tính toán (công thức)** — một phần tử `DefinitionJson.columns` giờ có
  thể là `{ key, label, formula }` thay vì tên field thô, vd
  `{"key":"tyLeLoiNhuan","formula":"ROUND(measures.loiNhuan / measures.doanhThu * 100, 1)"}`.
  Bộ đánh giá mới `lib/formulaEngine.js` (tokenizer + parser + evaluator TỰ
  VIẾT, KHÔNG `eval()`/`Function()` — đã kiểm bằng thử nghiệm sandbox-escape)
  hỗ trợ `+ - * /`, so sánh, `&& ||`, và `ROUND/ABS/MIN/MAX/IF`. Cú pháp kiểm
  tra ngay lúc lưu báo cáo. Có ở CẢ 2 bản `reportEngine.js` (rp-server và
  api-server) — công thức chạy ở bên nào thực sự truy vấn Data Warehouse cho
  báo cáo đó (`SourceType`), đúng nguyên tắc đã thống nhất.
- `reportEngine.js` thêm `describeColumns()` — mọi response trả `columns`
  dạng `[{key,label}]` THỐNG NHẤT (dù cột là field thô hay công thức, dù báo
  cáo `directDb` hay đi qua API Server) — rp-user không còn tự suy `label`
  từ tên field ở phía frontend nữa. `exportExcel.js`/`exportPdf.js` cũng đổi
  theo hình dạng này (header đẹp hơn cho cột công thức, dùng `label`).
- **Tuỳ biến dữ liệu cho đối tác API** — bảng mới `api.ConsumerReportAccess`:
  MẶC ĐỊNH một đối tác không gọi được báo cáo nào dù `apiKey` có scope
  `reports` hợp lệ, phải được admin gán rõ ràng (trang "Đối tác" trên
  `api-admin/`, nút "Báo cáo được gọi") — cùng khuôn với
  `app.RoleReportAccess` đã có bên rp-server. Cộng với `?fields=a,b,c` trên
  `GET /v1/reports/:reportId/run` — trong báo cáo được gọi, đối tác chỉ lấy
  đúng cột cần, sai tên cột báo lỗi 400 rõ ràng. 2 lớp độc lập: một kiểm soát
  *gọi được gì*, một kiểm soát *thấy gì trong đó*.
- Chưa làm: đổi tên trường theo hợp đồng riêng từng đối tác (field alias) và
  so sánh theo kỳ (tăng trưởng %, cần 2 lượt query) — để sau, khi có nhu cầu
  thật (xem tài liệu "Dữ Liệu Tuỳ Biến & Công Thức HCRC").

## 0.8.0 — Endpoint realtime tự định nghĩa qua giao diện (không cần code)

- Thay hẳn mô hình "mỗi endpoint realtime = 1 route viết cứng" (3 route
  `inventory`/`loyalty`/`vouchers` cố định trong code) bằng **admin tự tạo
  endpoint qua `api-admin/`**: chọn 1 nguồn đã có (`api.DataSources`, có thể
  là nhiều máy chủ OLTP khác nhau — đã hỗ trợ sẵn từ trước), DUYỆT bảng/view
  + cột THẬT của nguồn đó (không gõ tay), chọn cột khoá + cột sắp xếp + cột
  hiển thị — trang mới "Endpoint realtime". Thêm loại dữ liệu realtime mới
  (đơn hàng, giao hàng...) không cần lập trình viên viết route, cùng tinh
  thần "Theo bảng" đã làm cho ETL.
- Bảng mới `api.RealtimeEndpointDefs` (api-db) thay hẳn `api.RealtimeEndpoints`
  cũ (đã `DROP TABLE`, chỉ lưu ánh xạ Endpoint->DataSourceId, không có dữ
  liệu nghiệp vụ nên xoá an toàn). `api-server`: `lib/schemaBrowser.js`
  (duyệt bảng/cột thật, MSSQL-only — tương đương `etl/lib/schemaBrowser.js`
  bên ETL), `lib/realtimeEngine.js` (chạy SELECT động có tham số hoá +
  allowlist định danh, cùng nguyên tắc `etl/lib/tableSyncEngine.js`),
  `routes/admin/realtimeEndpoints.js` (CRUD định nghĩa). 2 route DÙNG CHUNG
  cho MỌI endpoint thay 6 route cũ: `GET /v1/realtime/{endpoint}/{key}` (tra
  1 khoá) và `GET /v1/realtime/{endpoint}/list` (danh sách phân trang).
- **Sửa một lỗi tồn tại từ bản 0.7.0**: `rp-server/lib/apiReportClient.js`
  (luồng `SourceType='apiRealtime'`) đã gọi
  `{baseUrl}/api/v1/realtime/{apiTarget}/list` từ trước, nhưng
  `api-server/server.js` khi đó mount router realtime thẳng ở `/api/v1`
  (không có tiền tố `/realtime`) — nghĩa là đường gọi này CHƯA BAO GIỜ khớp,
  sẽ luôn lỗi 404 nếu có ai dùng thật. Phát hiện khi tổng quát hoá routing
  cho endpoint tự định nghĩa; nhân tiện sửa luôn bằng cách mount đúng tiền
  tố `/api/v1/realtime` — cũng giải quyết gọn việc tên endpoint (giờ tự do,
  admin đặt) có thể trùng với `/api/v1/reports` nếu vẫn mount chung gốc
  `/api/v1` như cũ.

## 0.7.0 — Report Server lấy dữ liệu qua API Server (realtime)

- `app.ReportCatalog` (rp-db) thêm `SourceType` (`'directDb'` mặc định,
  `'apiReport'`, `'apiRealtime'`) + `ApiConnectionId`/`ApiTarget` — một báo
  cáo giờ có thể lấy dữ liệu QUA API Server thay vì đọc thẳng CSDL, dùng khi
  API Server đã có sẵn kết nối realtime tới hệ nguồn (tồn kho/điểm thẻ/
  voucher...) mà Report Server không cần tự mở thêm một đường kết nối trực
  tiếp riêng tới cùng hệ đó. Bảng mới `app.ApiConnections` lưu BaseUrl + API
  key (mã hoá bằng `APP_ENCRYPTION_KEY` sẵn có) — quản lý qua tab "Kết nối
  API Server" mới trên trang "Biểu mẫu" (`rp-user/`).
- rp-server: `lib/apiConnectionPool.js` (cache kết nối HTTP theo Id, giống
  tinh thần `lib/dataSourcePool.js`), `lib/apiReportClient.js` (gọi API
  Server, forward nguyên `{columns, rows}` — không chiếu cột lại lần 2),
  `routes/apiConnections.js` (CRUD). `routes/reports.js` giờ rẽ nhánh theo
  `SourceType` khi chạy/xuất báo cáo.
- **Sửa một lỗi tồn tại từ trước**: `api-server/routes/v1/reports.js` vẫn
  đang query `dwh.ReportCatalog` — bảng đã bị XOÁ khỏi `dwh/schema.sql` từ
  lượt chuyển `ReportCatalog` sang `app` schema (rp-db) ở bản 0.3.0, khiến
  endpoint `/v1/reports/:reportId/run` lỗi 100% nếu có ai gọi. Phát hiện khi
  định tái dùng endpoint này cho luồng `apiReport` — không thể tái dùng
  `app.ReportCatalog` bên HCRC_RP (API Server không đọc được CSDL của Report
  Server, đúng nguyên tắc cô lập DB), nên thêm bảng RIÊNG `api.ReportCatalog`
  (CSDL HCRC_API, api-db) — danh mục báo cáo tổng hợp API Server tự quản lý,
  độc lập với danh mục của Report Server — và sửa route đọc đúng bảng này.
  Quản lý qua trang "Báo cáo" mới trên `api-admin/`
  (`routes/admin/reportCatalog.js`).
- `api-server/routes/v1/realtime.js` thêm 3 route `GET /{endpoint}/list`
  (`inventory`/`loyalty`/`vouchers`) — danh sách phân trang, khác 3 route cũ
  chỉ tra được đúng 1 khoá (SKU/mã thẻ/mã voucher) — cần cho báo cáo dạng
  bảng (`SourceType='apiRealtime'`). Cùng TODO tên view/cột thật như 3 route
  cũ (chưa có schema OLTP thật).

## 0.6.1 — Đổi tên report-server/frontend cho khớp quy ước rp-*

- `report-server/` → `rp-server/`, `frontend/` → `rp-user/` — khớp hoàn toàn
  prefix `rp-` đã dùng cho CSDL (`rp-db/`), tránh nhầm giữa 2 tên gọi khác
  nhau cho cùng một hệ thống. `rp-user` (không phải `rp-admin`) vì app này
  phục vụ CẢ người dùng thường lẫn admin trong 1 SPA — phân biệt bằng phân
  quyền theo menu, không tách app như `api-admin`/`etl-admin`.
- Đã cập nhật mọi tham chiếu: `package.json`/`package-lock.json` (tên gói
  `hcrc-rp-server`, `hcrc-rp-user`), `deploy/ecosystem.config.js`, toàn bộ
  comment trong `rp-db/schema.sql`, `rp-server/`, `rp-user/`, `api-server/`,
  `etl/`, `api-admin/`, `etl-admin/`, `portal/` trỏ tới 2 thư mục này. Chỉ đổi
  tên thư mục/gói — không đổi API, route, biến môi trường, hay schema CSDL
  (`app.*` trong `rp-db/schema.sql` giữ nguyên).

## 0.6.0 — Cổng đăng nhập chung & đa kết nối cho API Server

- `portal/` — trang tĩnh mới, điểm vào duy nhất: 3 lựa chọn (Report/ETL/API),
  bấm vào đâu điều hướng CẢ TRANG sang đúng ứng dụng đã có sẵn
  (`frontend/`/`etl-admin/`/`api-admin/`) — không gộp 3 ứng dụng thành một,
  giữ nguyên cô lập tài khoản/CSDL/JWT đã thống nhất ở 3 lượt trước (xem tài
  liệu kiến trúc "Cổng Đăng Nhập HCRC", Phương án A).
- API Server nay cũng dùng được nhiều kết nối cấu hình qua giao diện, khớp
  đúng mô hình Report/ETL đã có: `api.DataSources` (CSDL `HCRC_API`, mật
  khẩu mã hoá bằng `API_ENCRYPTION_KEY` riêng) + `api.RealtimeEndpoints` gán
  từng endpoint (`inventory`/`loyalty`/`vouchers`) cho đúng một nguồn — thay
  hẳn `OLTP_*` tĩnh trong `.env`. Trang "Nguồn dữ liệu" mới trên
  `api-admin/`; `/admin/live/pools` báo cáo cả pool DWH lẫn từng nguồn
  realtime đang mở.

## 0.5.1 — Đổi tên thư mục cho nhất quán

- `app/` → `rp-db/` — schema CSDL `HCRC_RP` của Report Server. Tên cũ (`app/`)
  đặt từ trước khi có quy ước `<viết-tắt>-db/` (`api-db/`, `etl-db/`), dễ
  khiến người đọc lướt qua tưởng Report Server chưa có CSDL riêng. Chỉ đổi
  tên thư mục — schema SQL bên trong vẫn tên `app` (`app.Users`,
  `app.ReportCatalog`...), không đổi.

## 0.5.0 — Quản trị ETL

- CSDL riêng `HCRC_ETL` (`etl-db/schema.sql`) — tách khỏi `HCRC_RP` và
  `HCRC_API`: nguồn dữ liệu (`etl.DataSources`), cấu hình đồng bộ
  (`etl.SyncJobs`), trạng thái/log (`etl.SyncState`/`etl.SyncLog`, chuyển từ
  `dwh/schema.sql` — `dwh` giờ chỉ còn `dwh.ReportFacts`), tài khoản quản trị
  (`admin.AdminUsers`).
- ETL đổi từ script chạy nền thành một server thật (`etl/server.js`) — vừa
  chạy lịch đồng bộ, vừa phục vụ `/admin/*`.
- Hai kiểu đồng bộ: **theo bảng** (chọn nguồn → duyệt bảng/cột thật → gán
  cột, không cần code — hỗ trợ thêm một bảng liên kết cùng nguồn) và **tuỳ
  biến** (connector viết tay trong `etl/sources/`, dùng khi cần join nhiều
  bảng/tính toán).
- Hỗ trợ nhiều loại CSDL nguồn qua lớp adapter (`etl/lib/dbAdapters/`) — SQL
  Server và MySQL/MariaDB (dùng chung driver `mysql2`).
- Lịch chạy đổi trên giao diện có hiệu lực trong tối đa 1 phút, không cần
  khởi động lại tiến trình.
- `etl-admin/` — giao diện quản trị riêng: Dashboard, Nguồn dữ liệu, Đồng
  bộ, Log, Phân quyền.

## 0.4.0 — Quản trị API

- CSDL riêng `HCRC_API` — tách khỏi `HCRC_RP`: đối tác gọi API
  (`api.ApiConsumers`, API key rời khỏi `.env`), tài khoản quản trị
  (`admin.AdminUsers`), nhật ký request (`api.RequestLog`).
- API key băm SHA-256 (không phải bcrypt — bị so khớp mỗi lượt gọi ngoài).
- Ghi nhật ký request không chặn phản hồi (fire-and-forget); "kết nối hiện
  tại" đẩy qua Server-Sent Events; số kết nối CSDL đang dùng đọc trực tiếp
  từ pool.
- `api-admin/` — giao diện quản trị riêng: Đối tác, Kết nối hiện tại, Lịch
  sử, Top truy vấn.

## 0.3.0 — CSDL ứng dụng & phân quyền

- CSDL riêng `HCRC_RP` — Users/Roles, phân quyền 2 lớp (theo menu + theo
  từng báo cáo), danh mục báo cáo (`ReportCatalog`, chuyển từ `dwh`), danh
  mục dùng chung, cấu hình email, nhật ký hệ thống.
- Report Server nâng cấp: đăng nhập thật (thay tài khoản admin tạm qua
  `.env`), nguồn dữ liệu bổ sung cho từng báo cáo (`ReportDataSources`).
- `frontend/` — giao diện người dùng: Trang chủ, Dashboard, 3 nhóm báo cáo,
  Hệ thống (Phân quyền/Biểu mẫu/Log/Danh mục/Thiết lập email).

## 0.2.0 — Report Server & API Server

- `report-server/` — báo cáo động theo định nghĩa lưu trong CSDL, xuất
  Excel/PDF.
- `api-server/` — cổng dữ liệu cho hệ thống ngoài: báo cáo tổng hợp (đọc
  Data Warehouse) và tra cứu realtime (tồn kho/điểm thẻ/voucher, đọc thẳng
  CSDL OLTP qua pool tách biệt).

## 0.1.0 — ETL & Data Warehouse

- `dwh/schema.sql` — Data Warehouse trung tâm, bảng sự kiện hợp nhất
  `ReportFacts`.
- `etl/` — đồng bộ tăng dần từ nhiều máy chủ MSSQL nguồn, mỗi nguồn một
  connector độc lập.
