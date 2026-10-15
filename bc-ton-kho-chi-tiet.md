# Báo cáo `bc-ton-kho-chi-tiet` — "Tồn kho" (nhóm Mua hàng)

Tài liệu triển khai riêng cho báo cáo mới (bản 9.43, theo yêu cầu người
dùng) — đọc file này TRƯỚC khi sửa `rp-server/scripts/seedTonKhoChiTietReport.js`,
`etl/scripts/seedTonKhoChiTietSync.js`, hoặc VIEW nguồn.

## 1. Yêu cầu

Tồn kho hiện tại, lọc theo: **ngành hàng, siêu thị, nhà cung cấp, kênh mua
(mua riêng/mua chung), điều kiện lớn hơn/nhỏ hơn** (2 ô nhập số tự do,
không phải 1 ô + chọn chiều như "Tồn kho theo ngưỡng" đã có).

**Nhà cung cấp/kênh mua lấy từ ĐƠN ĐẶT/NHẬP HÀNG GẦN NHẤT** của đúng mã
hàng tại đúng chi nhánh — ĐÃ XÁC NHẬN với người dùng, vì DSMART16 KHÔNG có
khái niệm "nhà cung cấp mặc định" gắn cố định vào 1 mã hàng (`SUPP_ID` chỉ
tồn tại trên bảng giao dịch mua hàng `STRANS`, không có trên `SKU_DEF`/
`STK_INFO` — xem bc-don-dat-hang.md).

## 2. Việc cần làm (theo đúng thứ tự)

| # | Việc | Ai làm |
|---|---|---|
| 1 | Chạy `deploy/Thiết lập VIEW Tồn kho Chi tiết theo SKU (DSMART16).sql` | DBA |
| 2 | Chạy `node etl/scripts/seedTonKhoChiTietSync.js` | Admin etl-admin / IT-Dev |
| 3 | Chạy `node rp-server/scripts/seedTonKhoChiTietReport.js` | IT/Dev |
| 4 | Gán quyền xem báo cáo (Hệ thống → Phân quyền) | Admin rp-user |
| 5 | Kiểm tra báo cáo có số liệu + bộ lọc hoạt động | IT/Dev |

## 3. VIEW nguồn — `dbo.vw_TonKhoChiTietTheoSKU` (CSDL `DSMART16`)

Mở rộng `vw_TonKhoTheoSKU` đã có (bc-ton-kho-0.md) — GIỮ NGUYÊN VIEW đó,
không sửa. Thêm:
- Ngành hàng: `SKU_DEF.DEPT_ID` → `DEPTLIST.DEPT_NAME_U` (đã xác nhận hoạt
  động ở "báo cáo doanh thu-nhập hàng theo ngành hàng.md").
- Nhà cung cấp + kênh mua của ĐƠN GẦN NHẤT: `OUTER APPLY` tìm dòng
  `STRANS` mới nhất cùng `STK_ID`+`SKU_ID`, `TRANS_CODE IN
  ('130','133','330','333')` (130/133 = mua riêng, 330/333 = mua chung —
  đã xác nhận ở "VIEW Đơn đặt hàng Lịch sử (DSMART16_EOM).sql").

⚠️ **Hiệu năng**: `OUTER APPLY` chạy 1 lần/dòng tồn kho (mỗi chi nhánh ×
mỗi mã hàng) — chạy thử VIEW trước (`SELECT TOP 20 * FROM
dbo.vw_TonKhoChiTietTheoSKU`), báo lại nếu quá chậm.

Xem SQL đầy đủ trong file deploy. An toàn chạy lại nhiều lần
(`CREATE OR ALTER VIEW`).

## 4. Đồng bộ (ETL)

`etl/scripts/seedTonKhoChiTietSync.js` — domain MỚI `tonkho_chitiet_sku`,
tái dùng Nguồn dữ liệu "DSMART16 - Live" đã có (seedLdtdHcrcSync.js),
KHÔNG đụng domain `tonkho_sku` của 2 báo cáo "tồn=0"/"theo ngưỡng".

## 5. Báo cáo — cơ chế lọc mới trong `lib/reportEngine.js`

2 bổ sung STRICTLY ADDITIVE vào bộ máy `directDb` dùng chung (không đổi
hành vi báo cáo `directDb` nào khác — đã chạy regression test SQL byte-
identical trước khi merge):

- `resolveColumn()` hỗ trợ field dạng `"measures.<tên>"` — đọc từ cột
  `Measures` thay vì `Dimensions` (cùng quy ước prefix đã dùng ở
  `projectColumns()`/`resolveField()` cho CỘT hiển thị, giờ áp dụng thêm
  cho filter).
- 2 filter type mới `numberMin`/`numberMax` (`>`/`<`, `TRY_CAST ... AS
  DECIMAL(18,4)` — dữ liệu không phải số tự thành `NULL`, không lỗi 500).
- `filterDef.column` (TUỲ CHỌN) — cột SQL thật, KHÁC `filterDef.field`
  (khoá đọc `filterValues`) khi 2 filter cần CHUNG 1 cột nhưng giá trị
  RIÊNG (vd "điều kiện lớn hơn"/"nhỏ hơn" cùng đọc `measures.SoLuongTon`
  nhưng `field` là `tonKhoMin`/`tonKhoMax` — 2 giá trị độc lập, không đè
  lên nhau).

`rp-user/src/components/FilterForm.jsx` thêm `<input type="number">` cho
2 type này.

## 6. Lưu ý khi sửa `columns` trong DefinitionJson

`lib/reportEngine.js:projectColumns()` CHỈ đọc đúng field khi cột khai
dạng **công thức** (`{ key, label, formula }`) — cột object KHÔNG có
`formula` sẽ lỗi (hàm coi `col` là chuỗi tên field thô). Mọi cột trong báo
cáo này đều khai `formula` = chính tên field (vd `formula: 'TenChiNhanh'`)
để vừa có nhãn đẹp vừa đọc đúng dữ liệu — xem `seedTonKhoChiTietReport.js`.
