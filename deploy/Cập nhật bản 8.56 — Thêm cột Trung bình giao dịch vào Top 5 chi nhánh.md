# Cập nhật bản 8.56 — Thêm cột "Trung bình giao dịch" vào 8 báo cáo Top 5 chi nhánh

## Vấn đề

8 báo cáo "Top 5 chi nhánh" (MART/MINIMART × Doanh thu/Giao dịch × Cao
nhất/Thấp nhất — `rp-server/scripts/seedTop5ChiNhanhReports.js`) chỉ có
cột "Doanh thu" và "Giao dịch", chưa có cột "Trung bình giao dịch" (giá
trị trung bình mỗi bill = Doanh thu ÷ Số giao dịch) như người dùng yêu
cầu.

## Thay đổi

`rp-server/scripts/seedTop5ChiNhanhReports.js` — hàm `buildDefinition()`
thêm 1 cột mới vào `columns`:

```js
{ key: 'trungBinhGD', label: 'Trung bình giao dịch', formula: 'ROUND(current.measures.doanhThu / currentGD.measures.SoGiaoDich, 0)', width: 1.2 }
```

Dùng ĐÚNG công thức "Trung bình GD" đã có sẵn ở báo cáo "Doanh thu cuối
ngày LDTD/HCRC" (`scripts/seedLdtdHcrcReports.js`) — không phát minh công
thức mới. Chi nhánh chưa có giao dịch nào trong kỳ đang xem (mẫu số = 0)
tự động hiện ô trống, không lỗi — `lib/formulaEngine.js` đã có sẵn cơ chế
này (phép chia cho 0 trả về `null`), đã kiểm tra lại bằng engine thật
trước khi gộp:

```
bình thường (doanh thu 61.268.083, 1200 giao dịch): 51057
chia 0 (0 giao dịch): null
```

Áp dụng cho CẢ 8 báo cáo (dùng chung 1 hàm `buildDefinition()`, không
phải sửa từng báo cáo riêng). Hiện tự động ở MỌI nơi hiển thị báo cáo đó
— trang Báo cáo, Dashboard "Top 5 chi nhánh" (bảng), xuất Excel/PDF —
không cần sửa gì thêm vì mọi nơi đọc `result.columns` động. Biểu đồ Top 5
(`Top5ChartTile.jsx`) đọc thẳng field `doanhThu`/`soGiaoDich`/`tenCuaHang`
theo tên, không phụ thuộc số lượng cột trong `columns`, nên không bị ảnh
hưởng bởi cột mới.

## Các bước triển khai

1. `git pull origin main`
2. `cd rp-server && node scripts/seedTop5ChiNhanhReports.js` — **BẮT
   BUỘC**, đây là bước ghi đè `DefinitionJson` đã lưu trong
   `app.ReportCatalog`/`app.Dashboards`; code mới trong Git KHÔNG tự áp
   dụng vào báo cáo đang chạy nếu không chạy lại script này. Dùng đúng
   `menuCode` đã seed lần đầu nếu khác mặc định `reports-kinh-doanh`:
   `node scripts/seedTop5ChiNhanhReports.js <menuCode>`.
3. `pm2 restart hcrc-rp-server`.
4. Kiểm tra: mở 1 trong 8 báo cáo "Top 5 ..." (trang Báo cáo) hoặc
   Dashboard "Top 5 chi nhánh" (bảng, không phải biểu đồ) → thấy thêm
   cột "Trung bình giao dịch"; thử xuất Excel/PDF → cột này cũng có mặt.

Không đổi CSDL, không đổi biểu đồ/logic xếp hạng Top 5, không ảnh hưởng
báo cáo khác.
