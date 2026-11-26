# Báo cáo `bc-phu-hang-core-chi-tiet`/`-recap` — "Phủ hàng Core" (nhóm Báo cáo vận hành)

Tài liệu triển khai riêng cho báo cáo mới (bản 11.34, theo yêu cầu người
dùng — báo cáo 4/4 trong 4 báo cáo "Báo cáo vận hành" mới, xem phương án
đã gửi "phuong-an-4-bao-cao-van-hanh.md" mục 1). **Người dùng xác nhận
(26/11/2026, kèm ảnh 2 tab Excel gốc): CHỈ làm đúng 2 sheet "Chi
tiết"/"Recap ST"** — KHÔNG làm sheet "So sánh" (biểu đồ xu hướng 7 tuần),
"Sheet1" (danh mục lý do lỗi đặt hàng), "Nguyên tắc tính tỷ lệ phủ" (text)
— và CHƯA làm quy trình xét duyệt ngoại lệ tuần (ST đề xuất lý do thiếu
hàng → MH duyệt "mã không tính phủ"). Đọc file này TRƯỚC khi sửa
`rp-server/lib/phuHangCoreRunner.js`,
`rp-server/scripts/seedPhuHangCoreReports.js`.

## 1. Báo cáo này làm gì

Kiểm tra mỗi siêu thị MART có đủ hàng ("phủ") cho danh mục SKU "Core" bắt
buộc phải có không. 2 sheet:

- **"Chi tiết"** (`bc-phu-hang-core-chi-tiet`) — 1 dòng/mã hàng Core ×
  siêu thị: SL bán/Doanh số kỳ W và W-1, SL tồn ước tính hiện tại, cờ "Có
  hàng" (tồn ≥ 5).
- **"Recap ST"** (`bc-phu-hang-core-recap`) — 1 dòng/siêu thị: % phủ (=
  số mã Core có hàng ÷ số mã Core quy hoạch), Doanh số Core/toàn ST (kỳ
  W-1), tỷ trọng, tăng trưởng Doanh số Core W/W-1.

**⚠️ PHẠM VI "KHUNG" (bổ sung sau nếu cần)**: % phủ tính THẲNG trên số
liệu thật, KHÔNG trừ các mã có lý do chính đáng (hết hàng từ NCC, đang
chờ giao...) — quy trình xét duyệt ngoại lệ tuần của file gốc (sheet
"Chi tiết" cột 38-49 + "Sheet1") CHƯA làm.

## 2. Nguồn dữ liệu (TÁI DÙNG HOÀN TOÀN, không VIEW/ETL mới)

- **Danh mục Core theo TỪNG SIÊU THỊ** — `etl.CoreItemList`
  (`lib/coreItemList.js:loadCoreItemListByKho('MART')`). Phát hiện khi
  điều tra lỗi "SELECT permission denied" (26/11/2026): bảng này **ĐÃ hỗ
  trợ sẵn Core theo từng mã kho cụ thể** từ bản 9.46 — KHÔNG cần sửa
  schema (khác giả định ban đầu ở phương án gốc).
- **SL bán/Doanh số theo (kho, mã hàng), kỳ W/W-1** — domain ĐÃ CÓ
  `doanhthu_sku_nganhhang` (bản 10.41), qua hàm MỚI
  `reportFactsHelpers.js:loadSumOverRange()` (bản 11.34, generalize
  `loadSumOnDate()` cho 1 khoảng ngày + nhiều measure cùng lúc).
- **SL tồn hiện tại** — domain ĐÃ CÓ `tonkho_sku`/`banhang_sku` (dùng
  chung 3 báo cáo "hết hàng"/"Core stock=0") — công thức tồn ƯỚC TÍNH
  dùng lại NGUYÊN VẸN công thức đã chốt ở
  `lib/topSellingZeroStockRunner.js` (Tồn hôm qua − Bán hôm nay). KHÁC
  rule gốc "đo tồn 14h thứ 6" — không có cách lấy ĐÚNG mốc giờ đó từ dữ
  liệu đã đồng bộ, dùng tồn ước tính TẠI THỜI ĐIỂM chạy báo cáo thay thế.
- **"Doanh số toàn ST"** (mẫu số tỷ trọng, LOẠI ngành Ultra Fresh —
  `DEPT_ID='1001'`, đúng "Nguyên tắc tính tỷ lệ phủ" trong file mẫu) —
  domain ĐÃ CÓ `doanhthu_nganhhang` (nhỏ hơn nhiều `doanhthu_sku_nganhhang`
  — tránh quét domain SKU rất lớn cho số này).

**"W"/"W-1"** — ĐÚNG định nghĩa đã dùng ở `lib/kinhDoanhTuanRunner.js`: W
= 7 ngày liên tiếp kết thúc đúng ngày neo (bộ lọc "Ngày neo", mặc định hôm
nay) — `[neo-6, neo]`; W-1 = `[neo-13, neo-7]` — KHÔNG phải tuần dương
lịch Thứ Hai → Chủ Nhật.

**Ngưỡng "có hàng"** — HARDCODE = 5 (đúng text "Nguyên tắc tính tỷ lệ
phủ" cho MART) — chưa làm UI khai báo được, sửa `STOCK_THRESHOLD_MART` ở
`lib/phuHangCoreRunner.js` nếu cần đổi.

**Khoảng ngày W/W-1 (bản 11.35, theo yêu cầu người dùng)** — cả khi xem
trên web VÀ xuất Excel/PDF (2 sheet), báo cáo hiện thêm 1 dòng
`periodLabel` ngay dưới tiêu đề, ghi rõ khoảng ngày W/W-1 ở trên.

## 3. Các bước triển khai (theo đúng thứ tự)

| # | Việc | Ai làm |
|---|---|---|
| 1 | Xác nhận đã upload "Danh sách hàng Core" (etl-admin) cho LoaiDiem=MART | Người phụ trách Core |
| 2 | Xác nhận 2 job `banhang_sku`/`tonkho_sku` đã chạy ổn (xem bc-ton-kho-0.md Bước 1+2) | — |
| 3 | Xác nhận domain `doanhthu_sku_nganhhang`/`doanhthu_nganhhang` đã chạy ổn — KHÔNG cần làm gì thêm nếu đã có | — |
| 4 | `cd rp-server && node scripts/seedPhuHangCoreReports.js` | IT/Dev |
| 5 | `pm2 restart rp-server` (SourceType mới) | IT/Dev |
| 6 | Gán quyền xem cả 2 ReportId (Hệ thống → Phân quyền) | Admin rp-user |

**Không có bước DBA, không cần VIEW mới.**

## 4. Kiểm tra sau khi triển khai

1. Mở "Phủ hàng Core - Chi tiết" — mỗi dòng có đủ Mã điểm/Tên kho/Mã
   hàng/Tên hàng/SL bán W-W-1/Doanh số W-W-1/SL tồn/Có hàng.
2. Mở "Phủ hàng Core - Recap ST" — % phủ hợp lý (0-100%), đối chiếu vài
   siêu thị với file Excel mẫu người dùng gửi.
3. Báo lại nếu số lệch nhiều so với file mẫu — các điểm GIẢ ĐỊNH (ngưỡng
   5, tồn ước tính thay vì đúng 14h thứ 6, doanh số kỳ W-1) có thể cần
   điều chỉnh.
