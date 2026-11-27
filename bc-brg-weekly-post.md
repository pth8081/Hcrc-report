# BRG Weekly Post (1 báo cáo, 5 sheet nội bộ)

Bản 11.24, theo yêu cầu đội MKT — dựa trên file mẫu thật
"BRG_Weekly_Post_T6K1_BC1.xlsx" (10 sheet). Khác hẳn 2 báo cáo "theo
tuần" (`bc-kinh-doanh-theo-tuan`/`bc-khach-hang-theo-tuan`) — báo cáo
này theo dõi hiệu quả 1 **chiến dịch khuyến mãi cụ thể** (danh sách SKU/
giá/chỉ tiêu riêng cho từng chiến dịch), KHÔNG dùng domain
`doanhthu_the_chinhanh`.

**SỬA bản 11.26 (theo yêu cầu người dùng — "Weekly post vào 1 file chia
nhiều sheet mà bạn", sau khi thấy 5 báo cáo riêng ở bản 11.24 hiện thành
5 dòng trong menu "Báo cáo MKT" gây nhầm lẫn "sao có nhiều báo cáo thế
này?")**: GỘP 5 báo cáo/5 `ReportCatalog` riêng của bản 11.24 thành
**ĐÚNG 1 báo cáo DUY NHẤT** — `bc-brg-weekly-post` (SourceType=
`brgWeeklyPost`) — có thêm bộ lọc **"Chọn sheet"** để chuyển qua lại
giữa 5 phần, mirror đúng tinh thần "nhiều sheet trong 1 file" của file
Excel mẫu gốc. 5 ReportId cũ (`bc-brg-post-by-items`/`-by-store`/
`-rankings`/`-recap`/`-detail`) **ĐÃ BỊ XOÁ** khỏi `app.ReportCatalog`
(xem mục 3) — KHÔNG CÒN dùng được, chỉ còn lại trong lịch sử Git/nhật ký
triển khai. Logic tính của cả 5 phần GIỮ NGUYÊN 100% (vẫn 5 file
`lib/brgPost*Runner.js` riêng như cũ, không viết lại công thức) — chỉ
thêm 1 lớp điều phối mới `lib/brgWeeklyPostRunner.js` chọn đúng hàm nào
chạy theo bộ lọc `sheet`.

## 1. Báo cáo này làm gì

5 "sheet" (chọn qua bộ lọc **"Chọn sheet"**, gộp lại từ 10 sheet file
mẫu gốc — sheet nào chỉ là 1 cách lọc/pivot khác của CÙNG 1 bảng thì gộp
thành 1 phần, xem mục ghi chú ở từng mục dưới đây), đều lọc theo **bộ
lọc "Chiến dịch khuyến mãi"** (dùng CHUNG cho mọi sheet, đổi sheet không
mất lựa chọn chiến dịch đang xem):

1. **"Tổng hợp (Recap)"** (sheet "Recap", mặc định khi mở báo cáo) —
   Tổng quan Toàn chuỗi/Mart/Mini Mart + theo Ngành hàng: Doanh số Post,
   Kế hoạch, Xu hướng dự kiến đến cuối kỳ, Doanh số thiếu hụt.
2. **"Theo mã hàng"** (sheet "By items") — 1 dòng/SKU: giá/scope/chỉ
   tiêu (cả chuỗi) + thực tế (Số lượng/Doanh thu) + **Dự kiến** (ngoại
   suy hết kỳ) + Tồn kho/Giá trị tồn.
3. **"Theo siêu thị"** (sheet "By Store") — 1 dòng/siêu thị: tổng thực
   tế của CÁC SKU trong chiến dịch TẠI siêu thị đó + chỉ tiêu ĐÃ PHÂN BỔ
   (xem mục 2), nhóm Mart/Mini Mart + dòng Tổng. **Từ bản 11.42**: thêm
   "Số lượng Bill bán lẻ"/"Tổng doanh thu bán lẻ thực tế"/"Tỷ trọng DS
   KM/Tổng DS bán lẻ" — số liệu CẢ SIÊU THỊ (mọi mặt hàng, không riêng
   SKU khuyến mãi), xem mục ghi chú bên dưới.
4. **"Xếp hạng sản phẩm"** (GỘP 4 sheet nhỏ "Top SL"/"Top DS"/"Top KH"/
   "Vượt KH" — cùng 1 bộ cột, khác nhau ở sắp xếp/lọc) — Top 20 SL thực
   tế cao nhất, Top 20 DT thực tế cao nhất, Top 20 DT kế hoạch cao
   nhất, và danh sách SKU có **DT dự kiến** (không phải thực tế) vượt
   kế hoạch.
5. **"Chi tiết (Siêu thị x Sản phẩm)"** (GỘP 2 sheet "Từng ST.CH"/"Từng
   sản phẩm" — file mẫu dùng slicer Excel để lọc xem theo 1 chiều, ở
   đây trả thẳng toàn bộ, lọc/sắp xếp trực tiếp trên bảng web) — 1
   dòng/(siêu thị, SKU), có thể vài nghìn dòng, KHÔNG phân trang. **Từ
   bản 11.42**: thêm cột "Tình trạng tồn kho" — xem mục ghi chú bên
   dưới.

**Nút "Xuất Excel đủ 5 sheet" (bản 11.26)** — ngoài nút "Xuất Excel"
thường (chỉ xuất ĐÚNG 1 sheet đang xem), trang báo cáo có thêm nút RIÊNG
chạy lại CẢ 5 sheet (cùng chiến dịch đang chọn) rồi gộp vào 1 file
`.xlsx` có 5 tab, mirror đúng cấu trúc nhiều-sheet-trong-1-file của file
Excel mẫu gốc — xem `routes/reports.js:POST /:reportId/export-sheets`.

**Tiêu đề theo tên chiến dịch + khoảng ngày (bản 11.35, theo yêu cầu
người dùng)** — cả khi xem trên web VÀ xuất Excel/PDF (mỗi sheet), tiêu
đề hiện đúng dạng `BRG Weekly Post — <tên chiến dịch>` kèm 1 dòng khoảng
ngày chiến dịch (`<ngày bắt đầu> – <ngày kết thúc>`, lấy NGUYÊN kỳ chiến
dịch, KHÁC "Cập nhật số liệu tới ngày" — số đó chỉ là mốc dữ liệu đã
đồng bộ tới đâu, không phải kỳ chiến dịch) — xem
`lib/brgWeeklyPostCore.js:buildCampaignHeader()`.

**Sửa lỗi "Toàn chuỗi" (bản 11.35)** — sheet "Tổng hợp (Recap)", dòng
"Toàn chuỗi" trước đây TÍNH SAI (gồm cả siêu thị `LoaiChuoi='KHO'`/chưa
phân loại ngoài Mart/Mini Mart) — đã sửa đúng quy tắc "Toàn chuỗi = TỔNG
Mart + Mini Mart" (xem `lib/brgPostRecapRunner.js`).

### Công thức cốt lõi (dùng chung mọi báo cáo trên)

- **Dự kiến** = Thực tế × (tổng số ngày kỳ CTKM ÷ số ngày ĐÃ QUA tính
  tới "Cập nhật số liệu tới ngày") — đã dò ngược khớp ĐÚNG số liệu mẫu
  thật (ví dụ hệ số 15 ngày ÷ 2 ngày = 7.5).
- **Giá trị tồn** = Tồn kho × Giá khuyến mại MART ÷ (1 + Thuế) — dò
  ngược khớp ĐÚNG số liệu mẫu thật (vd Bia 333: 207985 × 12000 ÷ 1.1 =
  2,268,927,272.73, khớp tuyệt đối). Cột "Thuế" PHẢI nhập dạng PHÂN SỐ
  (0.1 = 10%, KHÔNG nhập "10") lúc upload file chiến dịch — từ bản
  11.35, nhập ≥ 1 sẽ hiện cảnh báo (dòng vẫn được nhập, không chặn) vì
  rất có thể nhầm số nguyên, gây sai lệch ~9 lần công thức này.
- **Chỉ tiêu theo siêu thị** = Chỉ tiêu CẢ CHUỖI của 1 SKU × (Trọng số
  siêu thị đó ÷ tổng trọng số CÁC SIÊU THỊ CÓ ÁP DỤNG SKU đó — SKU chỉ
  áp dụng Mart thì KHÔNG chia cho Mini Mart) — xem mục 2.
- **Số lượng/Doanh thu thực tế** dùng số GỘP CHUNG bán lẻ+bán buôn
  (domain `doanhthu_sku_nganhhang` không tách được SỐ LƯỢNG riêng bán
  lẻ) — ⚠️ KHÁC quy ước "loại trừ bán buôn" đã áp cho 2 báo cáo "theo
  tuần" (`bc-kinh-doanh-theo-tuan`), đây là lựa chọn RIÊNG cho báo cáo
  này vì không có cách tách số lượng.
- **KHÔNG replicate** khối "TRỪ DS BÁN BUÔN BIA 333" (sheet Recap) —
  xác nhận qua đối chiếu số liệu đây là điều chỉnh TAY, MỘT LẦN, CHỈ
  riêng SKU "Bia 333" của ĐÚNG chiến dịch mẫu đó, không có quy tắc chung
  để tự động hoá.
- **"Tình trạng tồn kho"** (sheet "Chi tiết", bản 11.42) — công thức THẬT
  dò được từ sheet "Data chi tiết" của file mẫu gốc (người dùng gửi lại
  đúng file có công thức, trước đây chỉ có số liệu không có công thức):
  ```
  =IF(AND(OR(NH="ultra fresh",NH="NKTT UF"),(Tồn-KH/số ngày)<0),"chưa đảm bảo",
    IF(AND(NH="Fresh",(Tồn-KH*3/số ngày)<0),"chưa đảm bảo",
      IF(AND((thiếu hụt/2+Tồn)<0,OR(NH="Bánh kẹo",NH="Đồ uống",NH="Hóa mỹ phẩm",NH="Thực phẩm")),"chưa đảm bảo",0)))
  ```
  **CHỈ triển khai 2 nhánh đầu** (`computeTinhTrangTon()` ở
  `lib/brgWeeklyPostCore.js`) — Ultra Fresh/NKTT UF: Tồn < Kế hoạch ÷ số
  ngày CTKM (giao hàng 1 ngày/lần); Fresh: Tồn < Kế hoạch × 3 ÷ số ngày
  CTKM (giao hàng 3 ngày/lần) — 2 nhánh này hợp lý về đơn vị (so SỐ
  LƯỢNG với SỐ LƯỢNG). **CỐ Ý KHÔNG làm nhánh thứ 3** (Bánh kẹo/Đồ uống/
  Hóa mỹ phẩm/Thực phẩm) — công thức gốc `(DS thiếu hụt/2 + Tồn) < 0`
  cộng thẳng "DS thiếu hụt" (ĐƠN VỊ TIỀN, thường âm hàng triệu/tỷ đồng
  khi SKU chưa đạt đủ kế hoạch — chuyện bình thường giữa kỳ CTKM) với
  "Tồn" (ĐƠN VỊ SỐ LƯỢNG, chỉ vài/vài chục) — **sai thứ nguyên ngay từ
  chính file mẫu gốc**, khiến nhánh này gần như luôn ra "chưa đảm bảo"
  cho mọi SKU chưa đạt đủ kế hoạch bất kể tồn kho thật còn bao nhiêu —
  không có giá trị tham khảo thật, không replicate 1 công thức đã sai.
  4 ngành hàng này để trống ở cột "Tình trạng tồn kho".
- **3 cột doanh thu/giao dịch CẢ SIÊU THỊ** (sheet "Theo siêu thị", bản
  11.42) — "Số lượng Bill bán lẻ"/"Tổng doanh thu bán lẻ thực tế"/"Tỷ
  trọng DS KM/Tổng DS bán lẻ" — tái dùng NGUYÊN 2 domain đã có sẵn
  (`doanhthu_chinhanh`/`giaodich_chinhanh`, dùng chung với "Báo cáo tổng
  hợp doanh thu HCRC") — xem `lib/brgWeeklyPostCore.js:fetchStoreWideTotals()`.

  ⚠️ **SỬA LỖI THẬT (bản 11.46)** — 2 cột "Tổng doanh thu bán lẻ thực
  tế"/"Tỷ trọng DS KM/Tổng DS bán lẻ" ĐÃ RA 0 TOÀN BỘ từ bản 11.42 tới
  trước bản 11.46 — nguyên nhân: domain `doanhthu_chinhanh` lưu measure
  khoá `"doanhThu"` (chữ "d" THƯỜNG, xem `measureColumns` ở
  `etl/scripts/seedLdtdHcrcSync.js`), nhưng code đọc nhầm thành
  `"DoanhThu"` (chữ "D" HOA — ĐÚNG cho domain KHÁC,
  `doanhthu_sku_nganhhang`, không phải domain này) — 2 domain dùng 2
  quy ước viết hoa/thường khác nhau cho cùng khái niệm "doanh thu". Đã
  sửa đúng khoá `measures.doanhThu`.
  **VẪN KHÔNG LÀM** "Doanh số chỉ tiêu theo kế hoạch công ty tháng..."
  (2 cột + 2 cột phụ thuộc) — số liệu phòng Vận Hành (VH) TỰ NHẬP TAY
  hàng tháng, KHÔNG nằm trong bất kỳ domain nào hệ thống đồng bộ được —
  xác nhận qua chính file mẫu gốc: 1 trong 2 cột tháng LUÔN ĐỂ TRỐNG mọi
  dòng, khiến công thức trung bình tự chia đôi SAI số liệu thật (vd
  3.971.666.223 ÷ 2 = 1.985.833.112, dù cột kia = 0) — xác nhận đây là
  lỗi/giới hạn của chính quy trình Excel gốc (VH chưa nộp đủ 2 tháng),
  không phải thiếu sót ở hệ thống này. Đây CHÍNH LÀ lý do "Trọng số phân
  bổ chỉ tiêu" của báo cáo này để admin TỰ NHẬP (xem mục 2) thay vì tự
  tính — không có nguồn hệ thống nào đáng tin cậy hơn.
- **SỬA LỖI THẬT (bản 11.42)** — 3 dòng "Tổng Mart"/"Tổng Mini Mart"/
  "Tổng cộng" ở sheet "Theo siêu thị" trước đây hiện SAI 100 LẦN ở cột
  "% Thực hiện doanh số" (vd "0.15%" thay vì "15%") — do
  `buildSubtotalRow()` tính riêng, không đi qua bước nhân 100 áp dụng cho
  dòng dữ liệu thường. Đã sửa nhân 100 ngay trong hàm đó.

## 2. Nguồn dữ liệu

**3 bảng MỚI** lưu "dữ liệu gốc" từng chiến dịch (admin tự upload qua
etl-admin → "Chiến dịch khuyến mãi (BRG Weekly Post)", KHÔNG phải file
báo cáo MKT gửi — file đó là ĐẦU RA):

- `dwh.PromoCampaigns` — 1 chiến dịch (tên, ngày bắt đầu/kết thúc, ngày
  "cập nhật số liệu tới").

  **Đóng/Mở lại chiến dịch (bản 11.40, theo câu hỏi người dùng — "đóng
  chiến dịch thì có xem báo cáo được không?")** — nút "Đóng"/"Mở lại" ở
  danh sách chiến dịch (etl-admin, route `PUT /:id/status`), đổi
  `IsActive`. **Đóng KHÔNG ẩn báo cáo** — chiến dịch đã đóng VẪN hiện
  trong dropdown "Chiến dịch khuyến mãi" của báo cáo (thêm nhãn "— Đã
  đóng"), vẫn chọn/xem/xuất bình thường — CHỈ chặn sửa tên/ngày
  (`PUT /:id`) và nhập/xoá thêm SKU/trọng số siêu thị cho tới khi mở lại
  (tránh sửa nhầm số liệu của chiến dịch đã chốt).
- `dwh.PromoCampaignSkus` — 1 dòng/SKU: giá/scope/**chỉ tiêu CẢ CHUỖI**
  (`SoLuongKeHoachTotal`/`DoanhThuKeHoachTotal`) — admin upload file Excel
  (bấm "Tải file mẫu" ở trang "Chiến dịch khuyến mãi" để lấy đúng khuôn).
  **SỬA bản 11.28** (theo yêu cầu người dùng — "file mẫu với các trường
  thông tin giống như trong file excel [báo cáo MKT gốc]... để người
  dùng có thể xử lý được ngay") — tên cột trong file mẫu đổi sang tiếng
  Việt, CỐ Ý đặt GIỐNG HỆT 13 cột ĐẦU VÀO tương ứng của sheet "By items"
  (file báo cáo MKT gốc), cho quen mắt người nhập liệu: `Mã 10 số, Mã
  sản phẩm, Tên sản phẩm, Ngành hàng, Giá bán lẻ, Giá khuyến mại MART,
  Giá khuyến mại Mini, Note, Total KM, Thuế, Áp dụng, Số lượng kế hoạch
  (cả chuỗi), Doanh thu kế hoạch (cả chuỗi)` — field nội bộ (DB/code)
  GIỮ NGUYÊN không đổi (`MaHang`/`SkuCode`/.../`DoanhThuKeHoachTotal`,
  xem `etl/lib/promoCampaignImport.js:SKU_FIELDS`), chỉ đổi NHÃN hiển thị
  trên file Excel. File mẫu có thêm sheet "Hướng dẫn" (sheet 2) nêu rõ
  KHÔNG dán 12 cột ĐẦU RA (Số lượng/Doanh thu thực tế/dự kiến, % Thực
  hiện, Tồn kho, Giá trị tồn) của sheet "By items" gốc vào đây — các cột
  đó báo cáo TỰ TÍNH, không phải thứ admin cung cấp.

  ⚠️ **LƯU Ý NHẬP LIỆU — cột "Mã sản phẩm" KHÔNG dùng công thức Excel**
  (bản 11.38, SỬA LỖI THẬT — người dùng từng upload file dùng
  `=RIGHT(A2,6)` để tự tính từ "Mã 10 số", khiến cột "Mã hiển thị" trên
  etl-admin hiện literal `"[object Object]"` VÀ khiến Tồn kho KM/Giá trị
  tồn KM ở báo cáo Recap luôn ra 0, vì không còn khớp được mã hàng thật
  nào — xem `resolveCellValue()` ở `etl/lib/promoCampaignImport.js`, ĐÃ
  SỬA để tự giải nén đúng giá trị công thức, nhưng AN TOÀN NHẤT vẫn là
  **gõ/dán GIÁ TRỊ THẬT (Paste Special → Values), không để lại công
  thức** trong file upload — tránh phụ thuộc hành vi đọc file của
  ExcelJS cho MỌI cột khác chưa gặp vấn đề tương tự.
- `dwh.PromoCampaignStoreWeights` — 1 dòng/mã Điểm: **trọng số** dùng
  để CHIA chỉ tiêu cả chuỗi của mỗi SKU về từng siêu thị — admin upload
  file Excel RIÊNG, 2 cột `Mã điểm, Trọng số` (bản 11.28, đổi nhãn tiếng
  Việt — field nội bộ vẫn `MaDiem`/`StoreWeight`).

  "Trọng số" KHÔNG suy ra từ `dwh.SalesTargets`/domain chỉ tiêu nào có
  sẵn trong hệ thống (file mẫu thật có cột "Doanh số chỉ tiêu theo kế
  hoạch công ty" nhìn giống vai trò "trọng số", nhưng công thức TÍNH RA
  cột đó — trung bình 2 cột "tháng 2/2026 - VH gửi"/"tháng 6/2026 - VH
  gửi" — không suy luận được đầy đủ, 1 trong 2 cột LUÔN để trống ở chính
  file mẫu gốc, xác nhận đây là số liệu NGOÀI hệ thống, VH tự nhập tay
  hàng tháng, không phải thiếu sót code).

  ⚠️ **"Tính tự động" (bản 11.44, theo yêu cầu người dùng)** — admin
  KHÔNG bắt buộc gõ tay giá trị Trọng số nữa. Nhập file "Mã điểm" như cũ
  (cột "Trọng số" điền tạm số nào cũng được, vd 1), sau đó bấm nút
  **"Tính tự động"** (etl-admin → "Chiến dịch khuyến mãi" → mở chiến
  dịch → "Trọng số siêu thị") — nhập số ngày gần nhất (mặc định 90, 1-3
  tháng là hợp lý, KHÔNG cần khớp đúng số ngày chiến dịch, xem phần
  "Lưu ý vận hành" bên dưới) — hệ thống TỰ TÍNH lại Trọng số = TỔNG
  doanh thu CẢ SIÊU THỊ (domain `doanhthu_chinhanh`, domain NHỎ — KHÔNG
  phải domain SKU lớn) trong đúng khoảng ngày đó, GHI ĐÈ mọi Trọng số
  hiện có cho TẤT CẢ mã Điểm ĐANG CÓ trong bảng. Backend:
  `computeStoreRevenueByMaDiem()` ở `etl/lib/promoCampaignImport.js`,
  route `POST /:id/store-weights/auto-calculate` ở
  `etl/routes/admin/promoCampaigns.js` — đọc `dwh.ReportFacts` qua pool
  `DWH_PROMO_IMPORTER` (SELECT-ONLY, xem `dwh/grants.sql` — cần DBA chạy
  lại script này 1 lần để cấp quyền, mirror đúng cách đã làm cho
  `dwh_target_importer`). Mã Điểm nào không có dòng doanh thu trong
  khoảng ngày đã chọn (siêu thị mới mở/chưa có dữ liệu) → Trọng số = 0
  (không nhận phân bổ chỉ tiêu cho tới lần "Tính tự động" kế tiếp).

  **Lưu ý vận hành** (đã tư vấn người dùng): nên chọn khoảng 60-90 ngày
  gần nhất — đủ dài để phản ánh ĐÚNG quy mô ổn định của từng siêu thị,
  KHÔNG cần khớp đúng số ngày của chiến dịch (Trọng số chỉ là tỉ lệ
  PHÂN BỔ tĩnh, không phụ thuộc ngày bắt đầu/kết thúc CTKM). Nếu sau
  này cần thay đổi tiêu chí (vd theo doanh thu CHỈ đúng ngành hàng đang
  khuyến mãi thay vì CẢ siêu thị), sửa `computeStoreRevenueByMaDiem()`,
  không đụng tới `allocateSkuTargetToStores()` (lib/brgWeeklyPostCore.js,
  bên rp-server — chỉ ĐỌC lại Trọng số đã lưu, không quan tâm Trọng số
  đó tính thủ công hay tự động).

**Số liệu THỰC TẾ — tái dùng NGUYÊN domain đã có sẵn, KHÔNG tạo ETL
mới**:
- Bán hàng: `doanhthu_sku_nganhhang` (xem `bc-doanh-thu-sku-nganhhang.md`)
  — join theo `MaHang` (SKU_ID đầy đủ).
- Tồn kho: `tonkho_chitiet_sku` (xem `bc-ton-kho-chi-tiet.md`) — join
  theo `MaHangHienThi` (mã hiển thị 6 số, domain này KHÔNG có SKU_ID đầy
  đủ) — lấy snapshot ngày đồng bộ **gần nhất** (1 mốc giờ chung, mirror
  "Tồn kho: 17h00 - ngày X" trong file mẫu).

**Mã Điểm/Siêu thị**: dịch STK_ID thô sang mã Điểm chuẩn qua
`etl.DiemStkMapping` (`lib/diemStkMapping.js`), đúng quy ước bắt buộc
CLAUDE.md — admin PHẢI khai `LoaiChuoi` (MART/MINIMART) đúng cho mọi mã
Điểm để báo cáo nhóm được, và `TenSieuThi` để hiện tên thật.

## 3. Các bước triển khai (theo đúng thứ tự)

| # | Việc | Ai làm |
|---|---|---|
| 1 | Đảm bảo domain `doanhthu_sku_nganhhang`/`tonkho_chitiet_sku` ĐÃ chạy (xem `bc-doanh-thu-sku-nganhhang.md`/`bc-ton-kho-chi-tiet.md`) | DBA/IT |
| 2 | `node rp-db/schema.sql` (hoặc chạy lại toàn bộ schema — tạo `dwh.PromoCampaigns`/`PromoCampaignSkus`/`PromoCampaignStoreWeights` + cập nhật `CK_ReportCatalog_SourceType`) | DBA |
| 3 | `node dwh/grants.sql` trên CSDL `HCRC_DWH` (tạo tài khoản `dwh_promo_importer`, ĐỔI mật khẩu thật) | DBA |
| 4 | Thêm `DWH_PROMO_IMPORTER_SERVER/_DATABASE/_USER/_PASSWORD` vào `etl/.env` (trỏ đúng CSDL `HCRC_DWH`, tài khoản `dwh_promo_importer`) | IT/Dev |
| 5 | Vào etl-admin → "Chiến dịch khuyến mãi (BRG Weekly Post)" → Tạo 1 chiến dịch + upload file SKU + file trọng số siêu thị (bấm "Tải file mẫu" ở mỗi phần để lấy đúng khuôn cột) | Admin MKT/etl-admin |
| 6 | Khai `LoaiChuoi`/`TenSieuThi` cho MỌI mã Điểm (etl-admin → "Ánh xạ Điểm - STK_ID") nếu chưa đủ | Admin etl-admin |
| 7 | `node rp-server/scripts/seedBrgWeeklyPostReport.js` (tạo 1 báo cáo gộp `bc-brg-weekly-post` + TỰ ĐỘNG xoá 5 báo cáo cũ `bc-brg-post-*` nếu còn — xem cảnh báo bên dưới) | IT/Dev |
| 8 | Gán quyền xem báo cáo `bc-brg-weekly-post` (Hệ thống → Phân quyền) — quyền của 5 báo cáo cũ ĐÃ MẤT theo cascade xoá ở bước 7, PHẢI gán lại | Admin rp-user |
| 9 | Kiểm tra theo mục 4 dưới đây | IT/Dev |

⚠️ **Nếu đang nâng cấp từ bản 11.24 lên 11.26** (đã từng chạy 5 script
seed cũ `seedBrgPostByItemsReport.js`/...) — bước 7 ở trên sẽ XOÁ hẳn 5
dòng `app.ReportCatalog` cũ đó (cascade xoá luôn mọi quyền đã gán cho
chúng) — không cần chạy gì thêm để dọn, script tự lo, chỉ cần làm lại
bước 8 (gán quyền MỚI cho báo cáo gộp).

## 4. Cách kiểm tra sau khi triển khai

1. Mở menu "Báo cáo MKT" — CHỈ còn ĐÚNG 1 dòng "BRG Weekly Post" (không
   còn 5 dòng riêng như bản 11.24).
2. Chọn đúng chiến dịch vừa tạo ở bộ lọc "Chiến dịch khuyến mãi" — phải
   CÓ dữ liệu (không lỗi "Thiếu bộ lọc Chiến dịch khuyến mãi") ở MỌI
   lựa chọn của bộ lọc "Chọn sheet".
3. "Theo mã hàng": đối chiếu 1-2 SKU — Số lượng/Doanh thu thực tế phải
   khớp số bán hàng thật (so với `bc-doanh-thu-sku-nganhhang`, lọc đúng
   mã hàng + khoảng ngày chiến dịch), Tồn kho khớp `bc-ton-kho-chi-tiet`.
4. "Theo siêu thị": TỔNG "Doanh thu thực tế" của mọi siêu thị PHẢI khớp
   TUYỆT ĐỐI tổng "Doanh thu thực tế" ở sheet "Theo mã hàng" (cùng 1 số
   liệu, 2 cách cộng dồn khác nhau — lệch số nghĩa là có lỗi).
5. "Xếp hạng sản phẩm": Top SL/DS/KH đúng 20 dòng (hoặc ít hơn nếu
   chiến dịch có dưới 20 SKU), sắp xếp giảm dần đúng cột tương ứng.
6. "Tổng hợp (Recap)": dòng "Toàn chuỗi" = TỔNG dòng "Mart" + "Mini
   Mart" — kiểm tra cộng đúng.
7. "Chi tiết": tổng theo 1 siêu thị bất kỳ (lọc/sắp xếp trên bảng web)
   phải khớp đúng dòng của siêu thị đó ở sheet "Theo siêu thị".
8. Bấm "Xuất Excel đủ 5 sheet" — file `.xlsx` tải về phải có ĐỦ 5 tab
   (Tổng hợp/Theo mã hàng/Theo siêu thị/Xếp hạng sản phẩm/Chi tiết),
   mỗi tab đúng số liệu như xem trên web ở sheet tương ứng.
