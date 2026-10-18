# Báo cáo `bc-ton-kho-nguong` — "Tồn kho theo ngưỡng"

Tài liệu triển khai riêng cho ĐÚNG 1 báo cáo này — dành cho team IT/DBA thực
hiện từng bước. File NGẮN vì báo cáo này DÙNG LẠI NGUYÊN VẸN nguồn dữ liệu
đã có cho báo cáo "Top bán chạy đang tồn kho = 0" — xem `bc-ton-kho-0.md`
TRƯỚC (Bước 1+2, tạo 2 VIEW + 2 job `banhang_sku`/`tonkho_sku`) nếu chưa
từng làm báo cáo đó.

## 1. Báo cáo này làm gì

Người xem TỰ CHỌN ngay trên bộ lọc: chiều lọc (tồn **dưới** ngưỡng — sắp hết
hàng, hoặc tồn **trên** ngưỡng — tồn đọng) + mức ngưỡng (số bất kỳ) + chi
nhánh. Khác 2 báo cáo tồn kho khác:
- **"Top bán chạy đang tồn kho = 0"** (`bc-ton-kho-0.md`) — ngưỡng CỐ ĐỊNH
  0, có xếp hạng theo doanh số bán, không tự chọn ngưỡng được.
- **"Cảnh báo hàng tồn"** (`bc-canh-bao-ton.md`) — ngưỡng RIÊNG cho từng
  cặp (Mã hàng, Siêu thị), admin phải khai/upload trước; báo cáo này thì
  **1 ngưỡng DUY NHẤT áp dụng cho MỌI mặt hàng** đang xem, không cần khai gì
  trước — chọn xong bộ lọc là ra kết quả ngay.

Mỗi dòng kết quả: mã kho, tên kho, mã hàng, tên hàng, tồn kho hiện tại,
ngày bán cuối (tham khảo, phát hiện hàng tồn lâu không bán được).

## 2. Việc cần làm (theo đúng thứ tự)

| # | Việc | Ai làm |
|---|---|---|
| 1 | Đã có 2 job `banhang_sku`/`tonkho_sku` chạy ổn (xem `bc-ton-kho-0.md` Bước 1+2) | — (dùng lại, không làm thêm nếu đã có) |
| 2 | Chạy script tạo báo cáo | IT/Dev |
| 3 | Gán quyền xem báo cáo | Admin rp-user |
| 4 | Kiểm tra báo cáo có số liệu | IT/Dev |

Thiếu bước 1 thì báo cáo **luôn hiện ra TRỐNG** — không phải lỗi, chỉ là
chưa có dữ liệu nguồn.

## Bước 2 — Tạo báo cáo

```bash
cd rp-server
node scripts/seedStockThresholdReport.js [menuCode]   # mặc định reports-mua-hang
```

Tạo `ReportId = bc-ton-kho-nguong`, `SourceType = 'stockThreshold'`,
`salesDomain = 'banhang_sku'`, `stockDomain = 'tonkho_sku'`, bộ lọc
`threshold` (kiểu `thresholdNumber`, mặc định chiều "dưới ngưỡng", giá trị
1) + `branches` (multiSelect, không chọn = tất cả chi nhánh). Chạy lại an
toàn (idempotent, khớp theo `ReportId`).

## Bước 3 — Gán quyền xem

Vào **Hệ thống → Phân quyền**, tick `bc-ton-kho-nguong` cho đúng vai trò
cần xem (script Bước 2 KHÔNG tự gán quyền).

## Bước 4 — Kiểm tra

Mở báo cáo trên rp-user → đổi "Mức tồn kiểm tra" sang 1 số vd `10`, chiều
"Dưới ngưỡng" → chỉ còn mặt hàng tồn kho **< 10** xuất hiện; đổi sang
"Trên ngưỡng" → chỉ còn mặt hàng tồn kho **> 10**. Chọn 1/vài chi nhánh ở
bộ lọc "Chi nhánh" → bảng chỉ còn đúng (các) chi nhánh đã chọn. Không chọn
chi nhánh nào → ra tất cả chi nhánh có dữ liệu tồn kho.
