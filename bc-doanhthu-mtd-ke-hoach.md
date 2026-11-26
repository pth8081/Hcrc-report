# Báo cáo `bc-doanhthu-mtd-all`/`-lfl`/`-nso` — "Theo dõi doanh thu MTD theo kế hoạch" (nhóm Báo cáo vận hành)

Tài liệu triển khai riêng cho báo cáo mới (bản 11.33, theo yêu cầu người
dùng — báo cáo 2/4 trong 4 báo cáo "Báo cáo vận hành" mới, xem phương án
đã gửi "phuong-an-4-bao-cao-van-hanh.md" mục "2+4", ưu tiên 2). Đọc file
này TRƯỚC khi sửa `rp-server/lib/doanhThuMtdKeHoachRunner.js`,
`rp-server/scripts/seedDoanhThuMtdKeHoachReports.js`, hoặc router Chỉ tiêu
`etl/server.js` (`/admin/sales-targets-doanhthu-mtd`).

## 1. Báo cáo này làm gì

So doanh thu **MTD** (tích lũy từ đầu tháng tới ngày đang xem) với **Chỉ
tiêu tháng** của từng siêu thị, tách riêng 3 góc nhìn (3 ReportId RIÊNG,
cùng 1 bộ cột, cùng menu "Báo cáo vận hành"):

| ReportId | Góc nhìn |
|---|---|
| `bc-doanhthu-mtd-all` | **Toàn chuỗi** — mọi siêu thị |
| `bc-doanhthu-mtd-lfl` | **LFL** ("Like For Like") — CHỈ siêu thị ổn định (không trong danh sách "Siêu thị NSO") |
| `bc-doanhthu-mtd-nso` | **NSO** ("New Store Opening") — CHỈ siêu thị trong danh sách "Siêu thị NSO" |

Mỗi dòng = 1 siêu thị (mã Điểm), cột: Chỉ tiêu (tháng) / Thực đạt (MTD) /
% hoàn thành / % so cùng kỳ năm trước.

**⚠️ PHẠM VI "KHUNG" (bản đầu, bổ sung sau nếu cần, xem phương án gốc mục
"2+4")** — CHƯA làm: so với tháng trước (M-1), ước thực hiện cuối tháng
theo trend, dòng "Tổng cộng" (Grand Total), gộp với file lịch sử "Theo dõi
doanh số thực hiện theo KH Tổng" (câu hỏi còn mở — xem mục 4).

## 2. Nguồn dữ liệu

### 2a. "Thực đạt" — domain ĐÃ CÓ `doanhthu_chinhanh`

Dùng CHUNG domain gốc đang phục vụ 4 báo cáo "Doanh thu cuối ngày"
LDTD/HCRC (xem "báo cáo doanh thu cuối ngày.md") — KHÔNG cần VIEW/job mới.
Cộng dồn đúng khoảng ngày yêu cầu, remap theo mã Điểm qua
`lib/diemStkMapping.js:remapRowsToDiem()` (tái dùng nguyên vẹn).

### 2b. "Chỉ tiêu" — domain MỚI `sales-targets-doanhthu-mtd`

1 số (`ChiTieuDoanhThu`)/siêu thị/tháng, nhập qua etl-admin trang **"Chỉ
tiêu Doanh thu MTD theo kế hoạch"** (`/sales-targets-doanhthu-mtd`, mount ở
`etl/server.js`, dùng lại NGUYÊN component `SalesTargetsPage.jsx` + cơ chế
"generic shape" đã có ở `etl/lib/salesTargetsImport.js` — KHÔNG code mới
cho phần import, chỉ thêm 1 route).

**⚠️ CÂU HỎI CHƯA CHỐT**: domain này là MỘT TẬP SỐ LIỆU KẾ HOẠCH MỚI, TÁCH
RIÊNG khỏi 2 domain Chỉ tiêu đã có của 4 báo cáo "Doanh thu cuối ngày"
(`sales-targets-ldtd`/`sales-targets-hcrc`) — vì KHÔNG có xác nhận đây là
CÙNG 1 con số kế hoạch hay 2 bộ số khác nhau (team khác quản lý). Nếu
người dùng xác nhận là CÙNG 1 số — có thể đổi báo cáo này đọc thẳng
`sales-targets-ldtd`/`sales-targets-hcrc` (bỏ domain/trang nhập riêng vừa
tạo), sửa 1 dòng `TARGET_DOMAIN` ở `doanhThuMtdKeHoachRunner.js`.

### 2c. LFL/NSO — `etl.NsoStores` (ĐÃ CÓ SẴN)

Dùng CHUNG danh sách "Siêu thị NSO" đang phục vụ 2 báo cáo "Doanh thu theo
ngành hàng" (`lib/nsoStores.js:loadNsoMaDiemSet()`) — KHÔNG tạo bảng/trang
quản lý mới. Mã Điểm KHÔNG có trong danh sách (hoặc đã "Khoá") → mặc định
LFL.

## 3. Các bước triển khai (theo đúng thứ tự)

| # | Việc | Ai làm |
|---|---|---|
| 1 | Xác nhận domain `doanhthu_chinhanh` đã chạy ổn (báo cáo "Doanh thu cuối ngày" đang dùng) — KHÔNG cần làm gì thêm nếu đã có | — |
| 2 | `cd etl && pm2 restart hcrc-etl` (hoặc tương ứng) — nạp route `/admin/sales-targets-doanhthu-mtd` mới | IT/Dev |
| 3 | `cd rp-server && node scripts/seedDoanhThuMtdKeHoachReports.js` | IT/Dev |
| 4 | Gán quyền xem cả 3 ReportId (Hệ thống → Phân quyền) | Admin rp-user |
| 5 | Gán quyền "Chỉ tiêu Doanh thu MTD theo kế hoạch" (Vai trò, etl-admin) cho người nhập chỉ tiêu | Admin etl-admin |
| 6 | Vào etl-admin → "Chỉ tiêu Doanh thu MTD theo kế hoạch", tải file mẫu, nhập Chỉ tiêu tháng cho từng siêu thị | Người lập kế hoạch |
| 7 | Vào etl-admin → "Siêu thị NSO", xác nhận đã khai đủ mã Điểm mới mở | Admin etl-admin |

## 4. Kiểm tra sau khi triển khai

1. Mở báo cáo "Theo dõi doanh thu MTD theo kế hoạch (Toàn chuỗi)" — không
   chọn bộ lọc, phải thấy số liệu MTD (đầu tháng hiện tại → hôm nay).
2. Sau khi nhập Chỉ tiêu cho 1 vài siêu thị — mở lại báo cáo, xác nhận
   cột "Chỉ tiêu"/"% hoàn thành" của ĐÚNG các siêu thị đó có số (siêu thị
   chưa nhập hiện "—", không phải 0/lỗi).
3. Vào "Siêu thị NSO", thêm 1 mã Điểm — mở báo cáo "(NSO)", xác nhận mã đó
   xuất hiện; mở báo cáo "(LFL)", xác nhận mã đó KHÔNG còn xuất hiện.
4. Đối chiếu vài dòng với file Excel mẫu người dùng gửi ("Thu các tỉnh
   MTD"/"Theo dõi doanh số theo KH Tổng") — báo lại nếu số lệch nhiều
   (ngoài phần CHƯA LÀM đã nêu ở mục 1).
