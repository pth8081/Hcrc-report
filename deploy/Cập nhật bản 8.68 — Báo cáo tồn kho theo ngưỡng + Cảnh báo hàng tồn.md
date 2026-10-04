# Cập nhật bản 8.68 — Báo cáo tồn kho theo ngưỡng + Cảnh báo hàng tồn

## Tóm tắt yêu cầu người dùng

Thêm 2 báo cáo tồn kho mới, giống báo cáo hàng tuần siêu thị đang làm tay:

1. **"Tồn kho theo ngưỡng"** — kiểm tra hàng tồn TRÊN hoặc DƯỚI 1 mức, người
   xem TỰ CHỌN chiều (trên/dưới) VÀ tự nhập mức đó ngay trên bộ lọc (mặc
   định: tồn dưới 1 — tức "không còn hàng"). Phân biệt siêu thị theo "Ánh
   xạ Điểm - STK_ID" đã có sẵn.
2. **"Cảnh báo hàng tồn"** — admin upload file Excel khai NGƯỠNG RIÊNG cho
   từng cặp (Mã hàng, Siêu thị) — khác báo cáo 1 ở chỗ mỗi mặt hàng/siêu
   thị có 1 ngưỡng khác nhau thay vì 1 mức chung áp cho tất cả. Thông tin
   mỗi dòng: Mã hàng, Tên hàng, Nhà cung cấp, Siêu thị, Ngưỡng cảnh báo.

**Phân quyền theo siêu thị** (cả 2 báo cáo): tái dùng cơ chế "Phạm vi dữ
liệu" đã có (bản 8.50/8.51) — nhân sự được gán 1 siêu thị chỉ thấy đúng
siêu thị đó, HO (không gán gì) xem được hết.

## TIN TỐT — KHÔNG CẦN VIEW MỚI NÀO

Cả 2 báo cáo dùng LẠI NGUYÊN VẸN đúng 2 domain `banhang_sku`/`tonkho_sku`
đã có sẵn cho báo cáo "Top bán chạy đang tồn kho = 0" (`bc-ton-kho-0.md`).
**Nếu báo cáo đó đã chạy ổn (2 job domain này đã có số liệu) thì 2 báo cáo
MỚI này CÓ SỐ LIỆU NGAY sau khi chạy 2 script ở mục "Các bước triển khai"
bên dưới — không cần DBA tạo thêm VIEW nào.**

Nếu CHƯA từng làm báo cáo "bc-ton-kho-0" (2 job `banhang_sku`/`tonkho_sku`
chưa có dữ liệu), DBA cần tạo đúng 2 VIEW sau trên CSDL nguồn (DSMART16) —
**chép lại y nguyên từ `bc-ton-kho-0.md` Bước 1** (không phải VIEW mới
riêng cho bản 8.68, chỉ nhắc lại cho tiện):

```sql
CREATE VIEW dbo.vw_BanHangTheoSKU AS
SELECT
    s.STK_ID + '_' + CAST(s.SKU_ID AS VARCHAR(50)) AS MaThucThe,  -- Cột khoá (EntityCode)
    s.STK_ID     AS MaChiNhanh,
    st.STK_NAME  AS TenChiNhanh,
    k.SKU_CODE   AS MaHangHienThi,
    k.FULL_NAME  AS TenHang,
    CAST(s.TRAN_DATE AS DATE) AS EventDate,     -- Cột ngày
    SUM(s.QTY)   AS SoLuongBan,                 -- Measures
    MAX(s.TRAN_DATE) AS UpdatedAt               -- Cột watermark
FROM dbo.STRANS s
JOIN dbo.SKU_DEF k ON k.SKU_ID = s.SKU_ID
JOIN dbo.STOCK st ON st.STK_ID = s.STK_ID
WHERE s.TRANS_CODE IN ('01', '02')  -- CHỈ VÍ DỤ — thay đúng mã bán lẻ thật
GROUP BY s.STK_ID, st.STK_NAME, s.SKU_ID, k.SKU_CODE, k.FULL_NAME, CAST(s.TRAN_DATE AS DATE);

CREATE VIEW dbo.vw_TonKhoTheoSKU AS
SELECT
    d.STK_ID + '_' + CAST(d.SKU_ID AS VARCHAR(50)) AS MaThucThe,
    d.STK_ID    AS MaChiNhanh,
    st.STK_NAME AS TenChiNhanh,
    k.SKU_CODE  AS MaHangHienThi,
    k.FULL_NAME AS TenHang,
    d.WORK_DATE AS EventDate,
    d.STOCK_QTY AS SoLuongTon,
    d.WORK_DATE AS UpdatedAt
FROM dbo.DSTK_INFO d
JOIN dbo.SKU_DEF k ON k.SKU_ID = d.SKU_ID
JOIN dbo.STOCK st ON st.STK_ID = d.STK_ID;
```

(Đổi tên bảng/cột đúng CSDL thật nếu khác cấu trúc DSMART16 chuẩn — đối
chiếu `TRANS_CODE` nào là bán lẻ thật với đội DSMART16.)

Sau khi có 2 VIEW, tạo 2 job "Theo bảng" trên etl-admin (domain
`banhang_sku`/`tonkho_sku`, BẬT "Giữ lịch sử theo ngày") — cách nhanh nhất
là chạy `cd etl && node scripts/seedZeroStockSkuSync.js` (đã có sẵn, tự
đối chiếu đúng VIEW trước khi tạo job) — xem đầy đủ ở `bc-ton-kho-0.md`
Bước 1-2 nếu cần làm tay.

## "Nhà cung cấp" — THUẦN THÔNG TIN, không phải dữ liệu đồng bộ

Hệ thống hiện **CHƯA đồng bộ dữ liệu nhà cung cấp thật từ nguồn nào** (rà
soát xác nhận không có view/job nào mang dữ liệu này). Cột "Nhà cung cấp"
ở "Cảnh báo hàng tồn" là **do admin tự gõ khi khai ngưỡng** (trong file
Excel upload) — thuần hiển thị/tham khảo trên báo cáo, KHÔNG đối chiếu với
bất kỳ dữ liệu đồng bộ nào khác. Nếu sau này cần dữ liệu nhà cung cấp THẬT
(vd để lọc/tổng hợp theo đúng NCC từ hệ thống nguồn), cần làm thêm 1 VIEW +
1 job mới — chưa nằm trong phạm vi bản này, báo lại khi cần.

## Thay đổi code

- `rp-server/lib/stockThresholdRunner.js` (MỚI) — báo cáo "Tồn kho theo
  ngưỡng", `SourceType='stockThreshold'`.
- `rp-server/lib/stockAlertRunner.js` (MỚI) — báo cáo "Cảnh báo hàng tồn",
  `SourceType='stockAlert'`, đọc `etl.StockAlertThresholds` qua
  `rp-server/lib/stockAlertThresholds.js` (MỚI, cùng kiểu cache/kết nối với
  `lib/coreItemList.js`).
- `rp-server/lib/diemStkMapping.js` — thêm hàm
  `resolveStoreScopeStkIds(storeScope)` dùng chung cho cả 2 báo cáo mới để
  áp "Phạm vi dữ liệu" (bản 8.51) — 2 báo cáo tồn kho=0 cũ KHÔNG áp dụng cơ
  chế này (không trong phạm vi sửa ở bản 8.68).
- `rp-server/lib/reportRunner.js` — đăng ký 2 `SourceType` mới.
- `rp-server/scripts/seedStockThresholdReport.js`/`seedStockAlertReport.js`
  (MỚI) — tạo 2 báo cáo trong `app.ReportCatalog`, idempotent.
- `rp-user/src/components/FilterForm.jsx` — thêm filter kind MỚI
  `'thresholdNumber'` (dropdown "Tồn dưới/Tồn trên" + ô số), dùng chung
  được cho MỌI báo cáo sau này cần kiểu lọc này.
- `etl-db/schema.sql` — bảng mới `etl.StockAlertThresholds`
  (MaHang/MaDiem/NguongCanhBao/TenHang/NhaCungCap/ImportedAt/ImportedBy,
  unique theo (MaHang, MaDiem)).
- `etl/lib/stockAlertThresholdsImport.js`,
  `etl/routes/admin/stockAlertThresholds.js` (MỚI) — upload/xuất/xoá danh
  sách ngưỡng, REPLACE toàn bộ mỗi lần nhập (giống "Danh sách hàng Core").
- `etl-admin/src/pages/StockAlertThresholdsPage.jsx` (MỚI) — trang "Cảnh
  báo hàng tồn", menu code `stock-alert-thresholds`.

## Các bước triển khai

1. `git pull origin main`.
2. **(Nếu CHƯA làm báo cáo "bc-ton-kho-0")** DBA tạo 2 VIEW ở mục trên +
   chạy `cd etl && node scripts/seedZeroStockSkuSync.js` — xem
   `bc-ton-kho-0.md` Bước 1-2 nếu cần chi tiết. **Đã làm rồi thì BỎ QUA
   bước này.**
3. Chạy lại `etl-db/schema.sql` (BẮT BUỘC — bảng mới
   `etl.StockAlertThresholds`, an toàn chạy lại nhiều lần).
4. `pm2 restart hcrc-etl` (BẮT BUỘC — route mới) và `pm2 restart
   hcrc-rp-server` (BẮT BUỘC — 2 runner mới).
5. `cd etl-admin && npm run build`, copy `dist/` mới (trang "Cảnh báo hàng
   tồn" mới). `cd rp-user && npm run build`, copy `dist/` mới (filter mới).
6. Tạo 2 báo cáo:
   ```
   cd rp-server
   node scripts/seedStockThresholdReport.js
   node scripts/seedStockAlertReport.js
   ```
7. Gán quyền xem menu "Cảnh báo hàng tồn" (etl-admin → Vai trò) cho vai
   trò cần dùng, VÀ gán quyền xem 2 báo cáo "Tồn kho theo ngưỡng"/"Cảnh
   báo hàng tồn" (rp-user → Hệ thống → Phân quyền).
8. (Nếu dùng tính năng cảnh báo riêng từng mặt hàng) etl-admin → "Cảnh báo
   hàng tồn" → tải file mẫu → điền → upload.
9. (Nếu chưa làm ở bản 8.50) rp-user → "Người dùng" → "Phạm vi dữ liệu" →
   gán đúng siêu thị cho từng nhân sự cần giới hạn — để trống = xem toàn
   bộ (HO).
10. Kiểm tra: mở báo cáo "Tồn kho theo ngưỡng" → đổi chiều lọc/mức ngưỡng
    → số liệu đổi đúng; mở "Cảnh báo hàng tồn" → đúng mặt hàng đã khai
    ngưỡng và đang dưới ngưỡng hiện ra; đăng nhập 1 tài khoản đã gán 1 siêu
    thị → cả 2 báo cáo chỉ hiện đúng siêu thị đó.

Không đổi CSDL/báo cáo khác đang chạy ổn (2 báo cáo tồn kho=0 cũ không bị
ảnh hưởng).
