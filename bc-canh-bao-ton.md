# Báo cáo `bc-canh-bao-ton` — "Cảnh báo hàng tồn"

Tài liệu triển khai riêng cho ĐÚNG 1 báo cáo này — dành cho team IT/DBA thực
hiện từng bước. File NGẮN vì báo cáo này DÙNG LẠI NGUYÊN VẸN nguồn dữ liệu
tồn kho/bán hàng đã có cho báo cáo "Top bán chạy đang tồn kho = 0" — xem
`bc-ton-kho-0.md` TRƯỚC (Bước 1+2, tạo 2 VIEW + 2 job `banhang_sku`/
`tonkho_sku`) nếu chưa từng làm báo cáo đó.

## 1. Báo cáo này làm gì

Đối chiếu tồn kho THẬT (đọc từ domain `tonkho_sku`) với 1 NGƯỠNG RIÊNG cho
từng cặp (Mã hàng, Siêu thị) do admin tự khai — khác hẳn "Top bán chạy đang
tồn kho = 0" (ngưỡng CỐ ĐỊNH = 0, tự xếp hạng theo doanh số bán, không cần
khai gì) và "Tồn kho theo ngưỡng" (`bc-ton-kho-nguong.md`, 1 ngưỡng DUY
NHẤT áp cho MỌI mặt hàng, người xem tự chọn ngay trên bộ lọc, không cần
khai từng cặp). Mỗi dòng kết quả: mã kho, tên kho, mã hàng, tên hàng, nhà
cung cấp, tồn kho hiện tại, ngưỡng cảnh báo đã khai — CHỈ hiện dòng nào
có ngưỡng được khai (không khai = không xuất hiện trong báo cáo).

## 2. Việc cần làm (theo đúng thứ tự)

| # | Việc | Ai làm |
|---|---|---|
| 1 | Đã có 2 job `banhang_sku`/`tonkho_sku` chạy ổn (xem `bc-ton-kho-0.md` Bước 1+2) | — (dùng lại, không làm thêm nếu đã có) |
| 2 | Chạy script tạo báo cáo | IT/Dev |
| 3 | Admin khai/upload danh sách ngưỡng cảnh báo | Admin etl-admin |
| 4 | Gán quyền xem báo cáo | Admin rp-user |
| 5 | Kiểm tra báo cáo có số liệu | IT/Dev |

Thiếu bước 1 hoặc bước 3 thì báo cáo **luôn hiện ra TRỐNG** — không phải
lỗi, chỉ là chưa có dữ liệu nguồn/chưa khai ngưỡng.

## Bước 2 — Tạo báo cáo

```bash
cd rp-server
node scripts/seedStockAlertReport.js [menuCode]   # mặc định reports-mua-hang
```

Tạo `ReportId = bc-canh-bao-ton`, `SourceType = 'stockAlert'`,
`salesDomain = 'banhang_sku'`, `stockDomain = 'tonkho_sku'`. Chạy lại an
toàn (idempotent, khớp theo `ReportId`).

## Bước 3 — etl-admin: khai ngưỡng cảnh báo

Vào **"Cảnh báo hàng tồn"** (menu `stock-alert-thresholds`, yêu cầu quyền
SỬA ngay cả để xem — `editOnly`) — 2 cách:

1. **Upload Excel** — tải file mẫu (nút "Tải file mẫu"), điền cột `MaHang`,
   `MaDiem` (mã siêu thị), `NguongCanhBao` (số), tuỳ chọn `TenHang`/
   `NhaCungCap` (chỉ để tham khảo/hiển thị, không ảnh hưởng đối chiếu) →
   Nhập — upsert theo khoá `(MaHang, MaDiem)`.
2. **Sửa/thêm 1 dòng** — form ngay dưới bảng, dùng khi chỉ cần thêm/sửa
   1-2 mặt hàng, không cần chuẩn bị lại cả file.

Người dùng bị giới hạn phạm vi siêu thị (`storeScope`, xem bản 8.69) chỉ
khai/thấy được ngưỡng của ĐÚNG các siêu thị trong phạm vi được gán — import
file có dòng NGOÀI phạm vi bị API từ chối cả file (400, không ghi gì).

## Bước 4 — Gán quyền xem

Vào **Hệ thống → Phân quyền**, tick `bc-canh-bao-ton` cho đúng vai trò cần
xem (script Bước 2 KHÔNG tự gán quyền).

## Bước 5 — Kiểm tra

Mở báo cáo trên rp-user → đủ các mặt hàng ĐÃ khai ngưỡng (bước 3) VÀ có
tồn kho thật (từ domain `tonkho_sku`) → cột "Tồn kho" khớp đúng số liệu
tồn kho mới nhất, cột "Ngưỡng cảnh báo" khớp đúng số đã khai. Mặt hàng đã
khai ngưỡng nhưng KHÔNG có dữ liệu tồn kho đồng bộ (sai `MaHang`/`MaDiem`,
hoặc kho đó chưa có job đồng bộ) → không xuất hiện trong báo cáo (không
báo lỗi) — đối chiếu lại đúng mã đã khai.
