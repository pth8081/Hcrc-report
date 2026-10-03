# Cập nhật bản 8.55 — Script tạo tự động 2 job đồng bộ cho 3 báo cáo "hết hàng"

## Vấn đề

3 báo cáo "hết hàng" — "Top bán chạy đang tồn kho = 0" (`bc-ton-kho-0`) và
"Core stock = 0" Mart/Minimart (`bc-core-ton-kho-0-mart`/`-minimart`) —
đã có đủ code (runner, script đăng ký báo cáo) và tài liệu triển khai
đầy đủ (`bc-ton-kho-0.md`, `bc-core-ton-kho-0.md`) từ trước. Tuy nhiên 2
job đồng bộ **bắt buộc** (domain `banhang_sku`/`tonkho_sku`, dùng chung
cho cả 3 báo cáo) chỉ có hướng dẫn tạo **thủ công** qua etl-admin (tick
từng ô Dimensions/Measures, gõ tên domain, bật "Giữ lịch sử theo ngày").

Người dùng xác nhận DBA đã tạo xong 2 VIEW bắt buộc (`dbo.vw_BanHangTheoSKU`,
`dbo.vw_TonKhoTheoSKU`) đúng cấu trúc tài liệu, và yêu cầu dựng sẵn luôn
phần "nguồn dữ liệu đồng bộ + lịch đồng bộ" bằng code thay vì thao tác tay.

## Thay đổi

Thêm **`etl/scripts/seedZeroStockSkuSync.js`** (theo đúng mẫu
`etl/scripts/seedLdtdHcrcSync.js` đã có) — chạy 1 lệnh:

```bash
cd etl
node scripts/seedZeroStockSkuSync.js
```

tự tạo/cập nhật (idempotent, chạy lại an toàn):
- **Nguồn dữ liệu** "DSMART16 - Live" — DÙNG LẠI đúng nguồn đã có nếu báo
  cáo LDTD/HCRC đã chạy `seedLdtdHcrcSync.js` trước đó (khớp theo tên),
  không tạo kết nối trùng tới cùng 1 CSDL; tự tạo mới nếu chưa có.
- **2 job "Theo bảng"**:
  - `Bán hàng theo SKU (DSMART16)` → `dbo.vw_BanHangTheoSKU`, domain
    `banhang_sku`, Dimensions `MaChiNhanh/TenChiNhanh/MaHangHienThi/TenHang`,
    Measures `SoLuongBan`.
  - `Tồn kho theo SKU (DSMART16)` → `dbo.vw_TonKhoTheoSKU`, domain
    `tonkho_sku`, cùng Dimensions, Measures `SoLuongTon`.
  - Cả 2 đều `KeepHistory = 1` (BẮT BUỘC — đúng yêu cầu tài liệu: báo cáo
    cần cộng dồn "7/30 ngày" và cần lùi lại đúng dòng tồn kho "hôm qua").

Script **TỰ ĐỐI CHIẾU schema thật** của nguồn (duyệt bảng/cột qua
`lib/schemaBrowser.js`, giống hệt kiểm tra khi tạo job qua giao diện
etl-admin) TRƯỚC khi ghi bất kỳ job nào — dừng lại, báo lỗi rõ ràng (thiếu
VIEW hoặc thiếu đúng cột nào) nếu DBA chưa tạo VIEW hoặc đặt sai tên cột,
không tạo job cấu hình sai âm thầm.

Đã cập nhật `bc-ton-kho-0.md` + `bc-core-ton-kho-0.md`: ghi rõ cách dùng
script là **phương án khuyến nghị**, giữ nguyên hướng dẫn thao tác tay qua
etl-admin làm phương án dự phòng (ai không muốn dùng script vẫn làm được
như trước).

**KHÔNG tự động hoá** (ngoài phạm vi yêu cầu, vẫn cần làm tay theo đúng
2 tài liệu hướng dẫn):
- 4 VIEW/job "Chờ nhập"/"Đã nhập" (tuỳ chọn) + 4 domain Core "Khoá All"/
  "Khoá theo kho"/"SL đang đặt"/"Ngày nhập cuối" (tuỳ chọn) — VIEW mẫu
  trong tài liệu còn ghi rõ "CHỈ VÍ DỤ", cần DBA đối chiếu lại tên bảng/cột
  thật trước khi tạo, không an toàn để tự seed bằng code.
- Script đăng ký báo cáo vào danh mục (`rp-server/scripts/seedTopZeroStockReport.js`,
  `seedCoreZeroStockReports.js`) — ĐÃ CÓ SẴN từ trước, không đổi gì, vẫn
  cần IT/Dev chạy tay.
- Upload danh sách hàng Core (Mart/Minimart) — thao tác nghiệp vụ, không
  seed được bằng code.
- Gán quyền xem 3 báo cáo — quyết định "ai được xem", admin tự làm.

## Các bước triển khai

1. `git pull origin main`
2. Khai `DSMART16_SERVER`/`DSMART16_USER`/`DSMART16_PASSWORD` vào `.env`
   của thư mục `etl` (dùng chung với `seedLdtdHcrcSync.js` nếu đã khai sẵn
   — không cần khai lại).
3. `cd etl && node scripts/seedZeroStockSkuSync.js` — tạo 2 job đồng bộ.
4. Theo dõi etl-admin → Log cho tới khi cả 2 job chạy THÀNH CÔNG.
5. `cd rp-server && node scripts/seedTopZeroStockReport.js && node scripts/seedCoreZeroStockReports.js` — đăng ký 3 báo cáo vào danh mục.
6. Vào etl-admin → "Danh sách hàng Core" — upload danh sách cho đúng
   Mart/Minimart.
7. Vào rp-user → Hệ thống → Phân quyền — gán quyền xem 3 báo cáo.
8. Kiểm tra đầy đủ theo đúng Bước 5 (`bc-ton-kho-0.md`)/Bước 7
   (`bc-core-ton-kho-0.md`).

Không đổi CSDL `rp`/CSDL `rp-server`/giao diện `rp-user` — chỉ thêm 1
script phía `etl`.
