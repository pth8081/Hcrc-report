# Báo cáo `bc-doanhthu-mtd-all` — "Theo dõi doanh thu MTD theo kế hoạch" (nhóm Báo cáo vận hành)

Tài liệu triển khai riêng cho báo cáo (bản 11.33, tạo lần đầu — **GỘP LẠI
THÀNH 1 ReportId duy nhất ở bản 11.52**, theo yêu cầu người dùng — đối
chiếu file mẫu thật đơn vị gửi "0_Thực đạt MTD..."). Đọc file này TRƯỚC
khi sửa `rp-server/lib/doanhThuMtdKeHoachRunner.js`,
`rp-server/scripts/seedDoanhThuMtdKeHoachReports.js`, hoặc router Chỉ tiêu
`etl/server.js` (`/admin/sales-targets-doanhthu-mtd`).

## 1. Báo cáo này làm gì

So doanh thu **MTD** (tích lũy từ đầu tháng tới ngày đang xem) với **Chỉ
tiêu tháng** của từng siêu thị, **1 báo cáo DUY NHẤT** (`bc-doanhthu-mtd-all`)
hiện LUÔN CẢ 3 góc nhìn cùng lúc — KHÔNG còn cần đổi báo cáo để xem riêng
từng góc (bản 11.52 gộp lại từ 3 ReportId cũ `bc-doanhthu-mtd-all`/`-lfl`/
`-nso`, 2 ReportId sau đã chuyển `IsActive=0`, ẩn khỏi menu):

- **3 dòng tổng hợp Ở ĐẦU BẢNG**: "Tổng toàn chuỗi" (mọi siêu thị) / "NSO"
  ("New Store Opening" — CHỈ siêu thị trong danh sách "Siêu thị NSO") /
  "LFL" ("Like For Like" — phần CÒN LẠI, = Tổng toàn chuỗi trừ NSO).
- **Chi tiết từng siêu thị (mã Điểm)** bên dưới 3 dòng tổng hợp.

Mỗi dòng gồm các nhóm cột sau (xem đầy đủ ở
`doanhThuMtdKeHoachRunner.js:describeColumns()`):

| Nhóm | Cột | Nguồn |
|---|---|---|
| Chỉ tiêu | Tổng / Bán lẻ / B2B | Tổng: nhập tay (bắt buộc). Bán lẻ/B2B: nhập tay (TUỲ CHỌN, mới bản 11.52) |
| Thực đạt (MTD) | Tổng | Tự động — domain `doanhthu_chinhanh` |
| Thực đạt (MTD) | Bán lẻ / B2B | Tự động — domain `doanhthu_nganhhang` (mới bản 11.52) |
| Thực đạt (MTD) | CTTV / Horeca / Khách buôn | Nhập tay (TUỲ CHỌN, mới bản 11.52 — KHÔNG có nguồn DSMART16) |
| Thực đạt (MTD) | Bill | Tự động — domain `giaodich_chinhanh` (mới bản 11.52) |
| — | % hoàn thành (= Thực đạt/Chỉ tiêu) | Tính tự động |
| — | GAP 80% (= Thực đạt − Chỉ tiêu×80%) | Tính tự động (mới bản 11.52) |
| Ước thực hiện cuối tháng | Bán lẻ / Bán buôn / Tổng | Bán lẻ, Bán buôn: nhập tay (TUỲ CHỌN, mới bản 11.52 — số NHẬN ĐỊNH kinh doanh của QLKV, không tính tự động được). Tổng = Bán lẻ + Bán buôn |
| — | GAP vs Ước thực hiện (= Thực đạt − Ước thực hiện Tổng) | Tính tự động (mới bản 11.52) |
| (M-1) | Thực hiện / % +/- | Tự động — domain `doanhthu_chinhanh`, lùi 1 tháng (mới bản 11.52) |
| (N-1) | Thực hiện cùng kỳ / % +/- | Tự động — domain `doanhthu_chinhanh`, lùi 1 năm |

**Khoảng ngày MTD (bản 11.35)** — cả khi xem trên web VÀ xuất Excel/PDF,
báo cáo hiện thêm 1 dòng `periodLabel` ngay dưới tiêu đề, ghi rõ khoảng
MTD đang xem + khoảng (M-1)/(N-1) tương ứng.

**⚠️ PHẠM VI v1 (bản 11.52) — CHƯA làm, có cân nhắc rõ lý do** (xem
VERSION.md bản 11.52 cho đầy đủ):
- **"Ước thực hiện theo trend"** (KHÁC "Ước thực hiện cuối tháng" ở trên —
  trend = trung bình Bán lẻ/ngày thực hiện × 30 ngày, cần thêm "Buôn trong
  lẻ" + số ngày thực hiện thực tế trong kỳ) — CHƯA làm, vì giá trị thông
  tin tăng thêm không nhiều so với "Ước thực hiện cuối tháng" (đã có) +
  "GAP 80%" (đã có), trong khi độ phức tạp thêm đáng kể.
- **"Buôn trong lẻ"** — điều chỉnh kỹ thuật riêng của file mẫu (tách phần
  bán buôn núp trong giao dịch bán lẻ) — CHƯA làm, báo lại nếu cần.
- **"Sữa 3A đợt 1"/"Sữa đã thực hiện đợt 1"** — theo dõi RIÊNG 1 đợt
  khuyến mãi sữa cụ thể trong file mẫu gốc, KHÔNG phải khái niệm chung của
  báo cáo MTD — KHÔNG đưa vào báo cáo này (nếu cần theo dõi lại, nên làm
  như 1 "Chiến dịch khuyến mãi" riêng, xem `bc-brg-weekly-post.md`, không
  trộn vào đây).

## 2. Nguồn dữ liệu

### 2a. "Thực đạt" Tổng + so (M-1)/(N-1) — domain ĐÃ CÓ `doanhthu_chinhanh`

Dùng CHUNG domain gốc đang phục vụ 4 báo cáo "Doanh thu cuối ngày"
LDTD/HCRC (xem "báo cáo doanh thu cuối ngày.md") — KHÔNG cần VIEW/job mới.
Cộng dồn đúng khoảng ngày yêu cầu (MTD/lùi 1 tháng/lùi 1 năm), remap theo
mã Điểm qua `lib/diemStkMapping.js:remapRowsToDiem()` (tái dùng nguyên
vẹn).

### 2b. "Thực đạt" tách Bán lẻ/B2B — domain ĐÃ CÓ `doanhthu_nganhhang` (bản 11.52)

1 dòng/siêu thị/NGÀNH HÀNG/ngày, có sẵn 2 measure `DoanhThuBanLe`/
`DoanhThuBanBuon` (dùng CHUNG domain đang phục vụ "Doanh thu tổng hợp theo
siêu thị HCRC", xem `lib/doanhThuTongHopHcrcRunner.js`) — cộng dồn theo
STK_ID (bỏ DEPT_ID) rồi remap về mã Điểm.

⚠️ "Thực đạt — Tổng" LUÔN lấy từ `doanhthu_chinhanh` (mục 2a, nguồn đã qua
kiểm chứng) làm số GỐC — "Bán lẻ"/"B2B" ở đây CHỈ để hiển thị chi tiết,
có thể lệch vài đồng so với Tổng do 2 VIEW nguồn khác nhau (làm tròn/thời
điểm đồng bộ) — KHÔNG coi Bán lẻ + B2B phải khớp tuyệt đối Tổng.

### 2c. "Bill" — domain ĐÃ CÓ `giaodich_chinhanh` (bản 11.52)

Khoá BU_ID (= mã Điểm gốc) — dịch tay qua
`lib/diemStkMapping.js:buildBuIdLookup()`, measure `SoGiaoDich`.

### 2d. "Chỉ tiêu" + các cột nhập tay mới — domain ĐÃ CÓ `sales-targets-doanhthu-mtd`

1 dòng/siêu thị/tháng, nhập qua etl-admin trang **"Chỉ tiêu Doanh thu MTD
theo kế hoạch"** (`/sales-targets-doanhthu-mtd`, mount ở `etl/server.js`,
dùng lại NGUYÊN component `SalesTargetsPage.jsx` + cơ chế "generic shape"
đã có ở `etl/lib/salesTargetsImport.js:parseGenericShape()`).

**Cách thêm cột mới (bản 11.52) — KHÔNG cần sửa code import**: định dạng
"generic" chỉ bắt buộc 2 cột `MaSieuThi`/`Thang` (dạng `YYYY-MM`), MỌI cột
khác trong file Excel tự động trở thành 1 "chỉ tiêu"/giá trị riêng, lưu
NGUYÊN tên cột vào `TargetsJson` (xem `parseGenericShape()`). Các cột MỚI
TUỲ CHỌN mà `doanhThuMtdKeHoachRunner.js` tự đọc nếu có — thêm ĐÚNG tên cột
sau vào file Excel nhập (không bắt buộc, để trống cột/dòng nào thì báo
cáo hiện "—" đúng dòng đó, không lỗi):

| Tên cột trong Excel | Field đọc trong code | Ý nghĩa |
|---|---|---|
| `ChiTieuDoanhThu` | `target.ChiTieuDoanhThu` | Chỉ tiêu TỔNG (đã có từ bản 11.33, BẮT BUỘC nếu muốn có cột "Chỉ tiêu"/% hoàn thành) |
| `ChiTieuBanLe` | `target.ChiTieuBanLe` | Chỉ tiêu Bán lẻ (TUỲ CHỌN) |
| `ChiTieuB2B` | `target.ChiTieuB2B` | Chỉ tiêu B2B (TUỲ CHỌN) |
| `CTTV` | `target.CTTV` | Thực đạt B2B — thành phần "CTTV" (TUỲ CHỌN, người dùng tự ước/tổng hợp mỗi kỳ — KHÔNG có nguồn DSMART16) |
| `Horeca` | `target.Horeca` | Thực đạt B2B — thành phần "Horeca" (TUỲ CHỌN, cùng lý do trên) |
| `KhachBuon` | `target.KhachBuon` | Thực đạt B2B — thành phần "Khách buôn" (TUỲ CHỌN, cùng lý do trên) |
| `UocThucHienBanLe` | `target.UocThucHienBanLe` | "Ước thực hiện cuối tháng" — Bán lẻ (TUỲ CHỌN, QLKV tự ước) |
| `UocThucHienBanBuon` | `target.UocThucHienBanBuon` | "Ước thực hiện cuối tháng" — Bán buôn (TUỲ CHỌN, QLKV tự ước) |

Giá trị KHÔNG phải số (ô trống, chữ) bị bỏ qua (coi như chưa nhập, hiện
"—"), không làm lỗi cả dòng.

### 2e. LFL/NSO — `etl.NsoStores` (ĐÃ CÓ SẴN)

Dùng CHUNG danh sách "Siêu thị NSO" đang phục vụ 2 báo cáo "Doanh thu theo
ngành hàng" (`lib/nsoStores.js:loadNsoMaDiemSet()`) — KHÔNG tạo bảng/trang
quản lý mới. Mã Điểm KHÔNG có trong danh sách (hoặc đã "Khoá") → mặc định
LFL.

## 3. Các bước triển khai (theo đúng thứ tự)

| # | Việc | Ai làm |
|---|---|---|
| 1 | Xác nhận domain `doanhthu_chinhanh`/`doanhthu_nganhhang`/`giaodich_chinhanh` đã chạy ổn (dùng chung báo cáo khác) — KHÔNG cần làm gì thêm nếu đã có | — |
| 2 | `git pull origin main` | IT/Dev |
| 3 | `cd rp-server && pm2 restart hcrc-rp-server` (sửa `lib/doanhThuMtdKeHoachRunner.js`) | IT/Dev |
| 4 | `cd rp-server && node scripts/seedDoanhThuMtdKeHoachReports.js` — gộp về 1 ReportId, ẩn 2 ReportId cũ | IT/Dev |
| 5 | Kiểm tra quyền xem ReportId `bc-doanhthu-mtd-all` (Hệ thống → Phân quyền) — GIỮ NGUYÊN nếu đã gán trước đó, không cần gán lại | Admin rp-user |
| 6 | (TUỲ CHỌN) Vào etl-admin → "Chỉ tiêu Doanh thu MTD theo kế hoạch", tải lại file Excel THÊM các cột mới ở mục 2d nếu muốn có đủ CTTV/Horeca/Khách buôn/Ước thực hiện/Chỉ tiêu Bán lẻ-B2B | Người lập kế hoạch |
| 7 | Vào etl-admin → "Siêu thị NSO", xác nhận đã khai đủ mã Điểm mới mở | Admin etl-admin |

## 4. Kiểm tra sau khi triển khai

1. Mở báo cáo "Theo dõi doanh thu MTD theo kế hoạch" — không chọn bộ lọc,
   phải thấy 3 dòng tổng hợp "Tổng toàn chuỗi"/"NSO"/"LFL" Ở ĐẦU bảng,
   dưới là chi tiết từng siêu thị — số MTD (đầu tháng hiện tại → hôm nay).
2. Xác nhận "Tổng toàn chuỗi" = "NSO" + "LFL" ở MỌI cột số (cộng dồn đúng).
3. Cột "Bán lẻ"/"B2B" (Thực đạt) + "Bill" phải tự có số NGAY (không cần
   nhập gì thêm) — nếu ra "—"/0 toàn bộ, kiểm tra lại domain
   `doanhthu_nganhhang`/`giaodich_chinhanh` đã đồng bộ đủ chưa.
4. Sau khi nhập Chỉ tiêu cho 1 vài siêu thị — mở lại báo cáo, xác nhận
   cột "Chỉ tiêu"/"% hoàn thành"/"GAP 80%" của ĐÚNG các siêu thị đó có số
   (siêu thị chưa nhập hiện "—", không phải 0/lỗi).
5. Sau khi nhập thêm CTTV/Horeca/Khách buôn/Ước thực hiện cho 1 vài siêu
   thị — xác nhận ĐÚNG các cột đó + "GAP vs Ước thực hiện" có số ở ĐÚNG
   siêu thị vừa nhập, các siêu thị khác vẫn "—".
6. Xác nhận cột "(M-1) Thực hiện"/"% +/-" có số (so với cùng khoảng ngày
   tháng trước) và "(N-1)" vẫn đúng như trước (không bị đổi do refactor).
7. Vào "Siêu thị NSO", thêm 1 mã Điểm mới — mở lại báo cáo, xác nhận mã đó
   chuyển từ dòng "LFL" sang được TÍNH vào dòng "NSO" (và dòng "LFL" giảm
   tương ứng).
8. Đối chiếu vài dòng với file Excel mẫu người dùng gửi ("0_Thực đạt
   MTD...") cho các cột ĐÃ LÀM — báo lại nếu số lệch nhiều (ngoài phần
   CHƯA LÀM đã nêu ở mục 1).
