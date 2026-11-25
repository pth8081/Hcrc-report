# BRG Weekly Post (5 báo cáo)

Bản 11.24, theo yêu cầu đội MKT — dựa trên file mẫu thật
"BRG_Weekly_Post_T6K1_BC1.xlsx" (10 sheet). Khác hẳn 2 báo cáo "theo
tuần" (`bc-kinh-doanh-theo-tuan`/`bc-khach-hang-theo-tuan`) — báo cáo
này theo dõi hiệu quả 1 **chiến dịch khuyến mãi cụ thể** (danh sách SKU/
giá/chỉ tiêu riêng cho từng chiến dịch), KHÔNG dùng domain
`doanhthu_the_chinhanh`.

## 1. Báo cáo này làm gì

5 báo cáo (gộp lại từ 10 sheet file mẫu — sheet nào chỉ là 1 cách
lọc/pivot khác của CÙNG 1 bảng thì gộp thành 1 báo cáo, xem mục ghi chú
ở từng mục dưới đây), đều lọc theo **1 bộ lọc duy nhất: "Chiến dịch
khuyến mãi"**:

1. **`bc-brg-post-by-items`** ("BRG Weekly Post - Theo mã hàng", sheet
   "By items") — 1 dòng/SKU: giá/scope/chỉ tiêu (cả chuỗi) + thực tế
   (Số lượng/Doanh thu) + **Dự kiến** (ngoại suy hết kỳ) + Tồn kho/Giá
   trị tồn.
2. **`bc-brg-post-by-store`** ("...Theo siêu thị", sheet "By Store") —
   1 dòng/siêu thị: tổng thực tế của CÁC SKU trong chiến dịch TẠI siêu
   thị đó + chỉ tiêu ĐÃ PHÂN BỔ (xem mục 2), nhóm Mart/Mini Mart + dòng
   Tổng.
3. **`bc-brg-post-rankings`** ("...Xếp hạng sản phẩm", GỘP 4 sheet nhỏ
   "Top SL"/"Top DS"/"Top KH"/"Vượt KH" — cùng 1 bộ cột, khác nhau ở
   sắp xếp/lọc) — Top 20 SL thực tế cao nhất, Top 20 DT thực tế cao
   nhất, Top 20 DT kế hoạch cao nhất, và danh sách SKU có **DT dự kiến**
   (không phải thực tế) vượt kế hoạch.
4. **`bc-brg-post-recap`** ("...Tổng hợp (Recap)", sheet "Recap") — Tổng
   quan Toàn chuỗi/Mart/Mini Mart + theo Ngành hàng: Doanh số Post, Kế
   hoạch, Xu hướng dự kiến đến cuối kỳ, Doanh số thiếu hụt.
5. **`bc-brg-post-detail`** ("...Chi tiết Siêu thị x Sản phẩm", GỘP 2
   sheet "Từng ST.CH"/"Từng sản phẩm" — file mẫu dùng slicer Excel để
   lọc xem theo 1 chiều, ở đây trả thẳng toàn bộ, lọc/sắp xếp trực tiếp
   trên bảng web) — 1 dòng/(siêu thị, SKU), có thể vài nghìn dòng,
   KHÔNG phân trang.

### Công thức cốt lõi (dùng chung mọi báo cáo trên)

- **Dự kiến** = Thực tế × (tổng số ngày kỳ CTKM ÷ số ngày ĐÃ QUA tính
  tới "Cập nhật số liệu tới ngày") — đã dò ngược khớp ĐÚNG số liệu mẫu
  thật (ví dụ hệ số 15 ngày ÷ 2 ngày = 7.5).
- **Giá trị tồn** = Tồn kho × Giá khuyến mại MART ÷ (1 + Thuế) — dò
  ngược khớp ĐÚNG số liệu mẫu thật (vd Bia 333: 207985 × 12000 ÷ 1.1 =
  2,268,927,272.73, khớp tuyệt đối).
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
- **KHÔNG replicate** cột "Tình trạng Tồn kho chưa đảm bảo 50% so với
  kế hoạch" — đối chiếu nhiều dòng mẫu không suy ra được công thức nhất
  quán (có dòng tồn thấp hơn 50% kế hoạch nhưng vẫn không bị đánh dấu).

## 2. Nguồn dữ liệu

**3 bảng MỚI** lưu "dữ liệu gốc" từng chiến dịch (admin tự upload qua
etl-admin → "Chiến dịch khuyến mãi (BRG Weekly Post)", KHÔNG phải file
báo cáo MKT gửi — file đó là ĐẦU RA):

- `dwh.PromoCampaigns` — 1 chiến dịch (tên, ngày bắt đầu/kết thúc, ngày
  "cập nhật số liệu tới").
- `dwh.PromoCampaignSkus` — 1 dòng/SKU: giá/scope/**chỉ tiêu CẢ CHUỖI**
  (SoLuongKeHoachTotal/DoanhThuKeHoachTotal) — admin upload file Excel
  (`MaHang, SkuCode, SkuName, DeptName, GiaBanLe, GiaKmMart, GiaKmMini,
  PromoNote, PercentKm, TaxRate, ApplyScope, SoLuongKeHoachTotal,
  DoanhThuKeHoachTotal`).
- `dwh.PromoCampaignStoreWeights` — 1 dòng/mã Điểm: **trọng số** dùng
  để CHIA chỉ tiêu cả chuỗi của mỗi SKU về từng siêu thị — admin upload
  file Excel RIÊNG (`MaDiem, StoreWeight`).

  ⚠️ **GIẢ ĐỊNH CHƯA XÁC NHẬN BẰNG NGUỒN DỮ LIỆU** (chỉ xác nhận bằng
  cách đối chiếu TỔNG khớp đúng số liệu mẫu) — "trọng số" này KHÔNG suy
  ra từ `dwh.SalesTargets`/domain nào có sẵn trong hệ thống. File mẫu
  thật có cột "Doanh số chỉ tiêu theo kế hoạch công ty" ở mỗi siêu thị
  nhìn giống với vai trò "trọng số", nhưng công thức TÍNH RA cột đó
  (trung bình 2 cột "tháng 2/2026 - VH gửi"/"tháng 6/2026 - VH gửi")
  không suy luận được đầy đủ — xử lý AN TOÀN: coi "trọng số" là 1 số
  **admin/MKT tự khai riêng mỗi chiến dịch**, không tự tính. Nếu sau
  này xác nhận được nguồn tính đúng, có thể đổi `allocateSkuTargetToStores()`
  (lib/brgWeeklyPostCore.js) sang đọc tự động từ domain đó, không đụng
  gì ở các báo cáo tiêu thụ.

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
| 7 | `node rp-server/scripts/seedBrgPostByItemsReport.js`, `seedBrgPostByStoreReport.js`, `seedBrgPostRankingsReport.js`, `seedBrgPostRecapReport.js`, `seedBrgPostDetailReport.js` (mặc định đưa cả 5 vào menu "Báo cáo MKT") | IT/Dev |
| 8 | Gán quyền xem CẢ 5 báo cáo (Hệ thống → Phân quyền) | Admin rp-user |
| 9 | Kiểm tra theo mục 4 dưới đây | IT/Dev |

## 4. Cách kiểm tra sau khi triển khai

1. Mở từng báo cáo (menu "Báo cáo MKT"), chọn đúng chiến dịch vừa tạo —
   phải CÓ dữ liệu (không lỗi "Thiếu bộ lọc Chiến dịch khuyến mãi").
2. "Theo mã hàng": đối chiếu 1-2 SKU — Số lượng/Doanh thu thực tế phải
   khớp số bán hàng thật (so với `bc-doanh-thu-sku-nganhhang`, lọc đúng
   mã hàng + khoảng ngày chiến dịch), Tồn kho khớp `bc-ton-kho-chi-tiet`.
3. "Theo siêu thị": TỔNG "Doanh thu thực tế" của mọi siêu thị PHẢI khớp
   TUYỆT ĐỐI tổng "Doanh thu thực tế" ở báo cáo "Theo mã hàng" (cùng 1
   số liệu, 2 cách cộng dồn khác nhau — lệch số nghĩa là có lỗi).
4. "Xếp hạng sản phẩm": Top SL/DS/KH đúng 20 dòng (hoặc ít hơn nếu
   chiến dịch có dưới 20 SKU), sắp xếp giảm dần đúng cột tương ứng.
5. "Tổng hợp (Recap)": dòng "Toàn chuỗi" = TỔNG dòng "Mart" + "Mini
   Mart" — kiểm tra cộng đúng.
6. "Chi tiết": tổng theo 1 siêu thị bất kỳ (lọc/sắp xếp trên bảng web)
   phải khớp đúng dòng của siêu thị đó ở báo cáo "Theo siêu thị".
