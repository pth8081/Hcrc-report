# Báo cáo `bc-doanh-thu-tong-hop-hcrc`/`bc-doanh-thu-tong-hop-ldtd` — "Báo cáo tổng hợp doanh thu siêu thị (HCRC)/(LĐTĐ)"

Tài liệu triển khai riêng cho báo cáo MỚI (bản 10.82, theo yêu cầu người
dùng, dựa trên file mẫu thật đội vận hành đang tự tổng hợp tay —
`Bao_cao_ban_Doanh_thu_hang_ngay_he_thong_HCRC_T11.2026.xlsx`, mỗi sheet 1
ngày trong tháng, mỗi dòng 1 siêu thị).

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
nhân sự** (xem công thức ĐÃ SỬA ở bản 10.93 ngay dưới đây).

⚠️ **BẢN 10.93 — SỬA LỖI "Số lượng nhân sự" luôn = 0** (ảnh người dùng
gửi). Nguyên nhân: TRƯỚC ĐÂY đếm theo `app.UserStoreAccess` — bảng này
CHỈ có dòng khi Admin CHỦ ĐỘNG giới hạn phạm vi xem dữ liệu của 1 người
(mặc định MỌI tài khoản "xem được toàn bộ", không có dòng nào ở bảng
này) — gần như luôn RỖNG trong thực tế. Đổi sang đếm theo
`app.Users.Department` (đồng bộ TỰ ĐỘNG từ VPDT/HCRC Workspace, LUÔN có
dữ liệu) + suy ra Mã Điểm qua `resolveMaDiemForDepartment()` — ĐÚNG nguồn
người dùng chỉ ra ("lấy trong phần phân quyền đã có người nào thuộc siêu
thị nào"), ĐÃ DÙNG SẴN cho gợi ý phạm vi ở trang "Người dùng"
(`rp-server/routes/users.js`), không cần thêm thông tin/bảng gì mới.

⚠️ **Phạm vi bản 10.82 — CHỈ phần XEM TRÊN WEB** (bảng số liệu, không
phân trang, có nhóm cột màu Ngày/Tháng/Năm/KH luỹ kế giống Excel/PDF).
**Phase 2 — xuất Excel 1 sheet/ngày — đã làm ở BẢN 10.87**, xem mục ghi
chú riêng bên dưới.

⚠️ **BẢN 10.92 — SỬA LỖI "KH luỹ kế năm" sai + THÊM chỗ nhập Chỉ tiêu CẢ
NĂM** (ảnh người dùng gửi: "% hoàn thành" ra số vô lý vd 33828%; người
dùng: *"Kế hoạch doanh thu này chưa có, tôi cần có chỗ để import theo
năm... giống target LĐTĐ và HCRC doanh thu hàng tháng"*).

**Nguyên nhân lỗi**: khối "KH luỹ kế năm" trước đây (bản 10.82-10.90) tra
NHẦM domain THÁNG (`sales-targets-hcrc`/`sales-targets-ldtd`) với kỳ
`firstOfYear(ngày neo)` — domain đó CHỈ có dữ liệu THEO THÁNG (vd tháng
1), không hề có khái niệm "cả năm", nên ra số sai/thiếu, % so sánh DT
LUỸ KẾ CẢ NĂM với 1 THÁNG chỉ tiêu ra tỉ lệ vô lý.

**Giải pháp**: 2 domain Chỉ tiêu CẢ NĂM MỚI, RIÊNG BIỆT hẳn khỏi domain
tháng — `sales-targets-hcrc-year` (báo cáo HCRC) / `sales-targets-ldtd-year`
(báo cáo LĐTĐ) — admin tự nhập ở etl-admin, **2 trang MỚI**:
- "Chỉ tiêu cả năm HCRC" (`/sales-targets-hcrc-year`)
- "Chỉ tiêu cả năm Lãnh đạo Tập đoàn" (`/sales-targets-ldtd-year`)

Giống HỆT 2 trang nhập chỉ tiêu THÁNG đã có (`createSalesTargetsRouter`
factory dùng CHUNG, shape `'generic'`, KHÔNG viết thêm shape/kỳ hạn mới)
— chỉ khác: cột **"Thang" nhập dạng "YYYY-01"** (tháng 01 của năm đó, vd
"2026-01" cho CẢ NĂM 2026) — số ở cột "ChiTieuDoanhThu" dòng đó là CHỈ
TIÊU CỦA CẢ NĂM đó (không phải riêng tháng 1) — khớp đúng cách
`doanhThuTongHopHcrcRunner.js` tra Chỉ tiêu năm (`firstOfYear(ngày neo) =
"YYYY-01-01"`). Trang có ghi chú rõ quy ước này ngay trên giao diện.
Cùng vai trò `target_importer_hcrc`/`target_importer_LDTD` đã có (nhóm
nghiệp vụ phụ trách chỉ tiêu tháng cũng phụ trách luôn chỉ tiêu năm).

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
| 1 | Chạy `etl-db/schema.sql` trên CSDL ETL (an toàn chạy lại nhiều lần) — thêm cột `MaQLKV` vào `etl.DiemStkMapping` + 2 vai trò `target_importer_hcrc`/`target_importer_LDTD` được cấp thêm quyền 2 trang Chỉ tiêu cả năm (bản 10.92) | DBA/IT |
| 2 | `git pull origin main` — lấy code mới nhất | IT/Dev |
| 3 | Khởi động lại `etl` (nạp 2 route MỚI `/admin/sales-targets-hcrc-year`/`-ldtd-year`, bản 10.92) + build lại `etl-admin` | IT/Dev |
| 4 | Chạy `node rp-server/scripts/seedDoanhThuTongHopHcrcReport.js [menuCode]` (thư mục `rp-server/`) — **TẠO CẢ 2 báo cáo** (HCRC + LĐTĐ), mặc định đặt ở menu `reports-kinh-doanh` | Admin rp-user / IT-Dev |
| 5 | Vào Hệ thống → Phân quyền, gán quyền xem RIÊNG cho `bc-doanh-thu-tong-hop-hcrc` VÀ `bc-doanh-thu-tong-hop-ldtd` (có thể cấp khác nhau — vd chỉ lãnh đạo tập đoàn xem được báo cáo LĐTĐ) | Admin rp-user |
| 6 | (TUỲ CHỌN, khuyến nghị) Vào etl-admin → "Ánh xạ Điểm - STK_ID" → điền cột "Mã QLKV" cho các mã Điểm cần nhóm theo khu vực quản lý | Admin etl-admin |
| 7 | Vào etl-admin → **"Chỉ tiêu cả năm HCRC"**/**"Chỉ tiêu cả năm Lãnh đạo Tập đoàn"** (MỚI, bản 10.92) → nhập Chỉ tiêu DT cả năm cho từng siêu thị (cột "Thang" nhập "YYYY-01" đại diện cả năm đó — xem ghi chú trên trang) | Admin etl-admin (đúng nhóm phụ trách Chỉ tiêu) |
| 8 | Báo cáo "(LĐTĐ)" cần domain `sales-targets-ldtd` (chỉ tiêu THÁNG) ĐÃ ĐƯỢC NHẬP — nếu chưa nhập, cột Kế hoạch (tháng)/% hoàn thành luỹ kế tháng hiện rỗng (không phải lỗi) | Admin etl-admin |

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

**Riêng cho bản 10.92**: sau khi nhập Chỉ tiêu cả năm ở etl-admin, mở
báo cáo — khối "KH luỹ kế năm", cột "KH doanh thu" phải ra ĐÚNG số vừa
nhập cho mã Điểm/năm đó, "% hoàn thành" phải là SỐ HỢP LÝ (vài chục %,
KHÔNG còn hàng chục nghìn % như lỗi cũ). Chưa nhập Chỉ tiêu cả năm cho 1
mã Điểm thì 2 cột đó hiện rỗng — bình thường, không phải lỗi.
