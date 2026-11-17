# Báo cáo `bc-doanh-thu-tong-hop-hcrc` — "Báo cáo tổng hợp doanh thu siêu thị hàng ngày"

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
nhân sự** (đếm số tài khoản được gán quyền xem đúng siêu thị đó — theo
yêu cầu người dùng "lấy từ phân quyền đã có... chuẩn nhất", KHÔNG phải dữ
liệu DSMART16).

⚠️ **Phạm vi bản 10.82 — CHỈ phần XEM TRÊN WEB** (bảng số liệu, không
phân trang, có nhóm cột màu Ngày/Tháng/Năm/KH luỹ kế giống Excel/PDF).
**CHƯA làm** tính năng xuất file Excel **1 sheet/ngày cho cả tháng** đúng
layout mẫu gốc (kể cả dòng tiêu đề nhóm "I. CHUỖI MART"...) — sẽ làm ở
bản sau, sau khi người dùng xác nhận SỐ LIỆU hiển thị trên web đã đúng.

## 2. Nguồn dữ liệu

- **Doanh thu/Lãi gộp/Bán buôn-lẻ**: VIEW MỚI `dbo.vw_DoanhThuTongHopHCRC`
  trên CSDL `DSMART16` — xem "deploy/VIEW DSMART16 (trung tâm)/Thiết lập
  VIEW Doanh thu tổng hợp theo siêu thị HCRC (DSMART16 trung tâm).sql".
  Domain MỚI `doanhthu_tonghop_hcrc` — GỘP theo (STK_ID, ngày) giống hệt
  `doanhthu_chinhanh` đã có (KHÔNG sửa/đụng VIEW đó), chỉ thêm tách Bán
  buôn/Bán lẻ (công thức đã chốt ở domain `doanhthu_nganhhang`) + cột
  `DiaDiem` (STOCK.PLACE, mới lấy ra lần đầu).
- **Số Bill**: dùng lại NGUYÊN domain `giaodich_chinhanh` đã có (KHÔNG
  tạo gì mới).
- **Chỉ tiêu (Kế hoạch DT/Bill)**: dùng lại NGUYÊN domain `sales-targets-hcrc`
  đã có cho báo cáo "Doanh thu cuối ngày" (theo yêu cầu người dùng — dùng
  chung, không nhập Chỉ tiêu riêng).
- **Số lượng nhân sự**: đếm trực tiếp từ `app.UserStoreAccess` (CSDL RP,
  KHÔNG qua ETL/DSMART16) — số tài khoản được gán quyền xem mỗi mã Điểm.
- **Mã QLKV**: cột MỚI admin tự khai ở etl-admin → "Ánh xạ Điểm - STK_ID"
  (`etl.DiemStkMapping.MaQLKV`, giống cách `TenSieuThi`/`LoaiChuoi` đã
  được khai tay ở đó — KHÔNG đọc từ DSMART16).
- **Diện tích/Nhóm chuỗi**: lấy từ VIEW mới (STOCK.DIMENSION/TYPE) nếu
  siêu thị có dữ liệu doanh thu trong khoảng đã chọn; `LoaiChuoi` đã khai
  tay ở "Ánh xạ Điểm - STK_ID" LUÔN ưu tiên ghi đè (theo đúng quy ước có
  sẵn của `lib/diemStkMapping.js`).

**Bộ máy chạy báo cáo**: `rp-server/lib/doanhThuTongHopHcrcRunner.js`
(SourceType MỚI `'doanhThuTongHopHcrc'`, đăng ký ở `lib/reportRunner.js`)
— KHÔNG dùng `lib/compositeReportRunner.js` (báo cáo đó chỉ hiểu "1 khối
= 1 khoảng ngày người dùng chọn", trong khi báo cáo này cần 3 khối Ngày/
Tháng/Năm tính SONG SONG từ 1 ngày neo) — nhưng TÁI DÙNG tối đa các hàm
phụ trợ đã có của file đó (`fetchAllReportRows`/`aggregateDailyRowsByEntity`)
và của `lib/diemStkMapping.js` (`remapRowsToDiem`/`buildBuIdLookup`).

## 3. Các bước triển khai (theo đúng thứ tự)

| # | Việc | Ai làm |
|---|---|---|
| 1 | Chạy `etl-db/schema.sql` trên CSDL ETL (an toàn chạy lại nhiều lần) — thêm cột `MaQLKV` vào `etl.DiemStkMapping` | DBA/IT |
| 2 | Chạy "deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Doanh thu tổng hợp theo siêu thị HCRC (DSMART16 trung tâm).sql" trên CSDL `DSMART16` | DBA |
| 3 | Chạy `node etl/scripts/seedDoanhThuTongHopHcrcSync.js` (thư mục `etl/`) — tạo job đồng bộ | Admin etl-admin / IT-Dev |
| 4 | Chờ job đồng bộ chạy xong ít nhất 1 lượt | IT/Dev |
| 5 | Chạy `node rp-server/scripts/seedDoanhThuTongHopHcrcReport.js [menuCode]` (thư mục `rp-server/`) — mặc định đặt ở menu `reports-kinh-doanh` | Admin rp-user / IT-Dev |
| 6 | Vào Hệ thống → Phân quyền, gán quyền xem `bc-doanh-thu-tong-hop-hcrc` cho đúng vai trò cần dùng | Admin rp-user |
| 7 | (TUỲ CHỌN, khuyến nghị) Vào etl-admin → "Ánh xạ Điểm - STK_ID" → điền cột "Mã QLKV" cho các mã Điểm cần nhóm theo khu vực quản lý | Admin etl-admin |

## 4. Cách kiểm tra sau khi triển khai xong

Mở báo cáo, để nguyên ngày mặc định (hôm nay) hoặc chọn 1 ngày bất kỳ đã
có doanh thu — mỗi siêu thị phải ra đủ 3 khối Ngày/Tháng/Năm, số liệu
Tháng/Năm PHẢI LỚN HƠN HOẶC BẰNG số liệu Ngày (luỹ kế từ đầu kỳ). Nếu đã
khai Chỉ tiêu cho mã Điểm/tháng đó, cột "Kế hoạch DT" phải ra đúng số đã
nhập (KHÔNG rỗng) và "% Hoàn thành DT luỹ kế" phải tính được.

Nếu CHƯA khai `MaQLKV`/`LoaiChuoi` cho 1 mã Điểm, 2 cột đó hiện rỗng —
bình thường, không phải lỗi.
