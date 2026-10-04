# Cập nhật bản 8.58 — Đổi màu báo cáo doanh thu cuối ngày theo mẫu BRGMART

## Vấn đề

Người dùng gửi 1 file PDF mẫu ("Hệ thống siêu thị BRGMART - Báo cáo nhanh
doanh thu ngày...") và yêu cầu: làm màu 4 báo cáo "Doanh thu cuối ngày
LDTD/HCRC" (gốc + "(Thành viên)") giống y hệt kiểu màu sắc trong file mẫu,
nhưng báo cáo nhìn sắc nét, mỏng, chuyên nghiệp hơn — áp dụng cho CẢ 3 nơi
hiển thị (bảng xem trên web, xuất Excel, xuất PDF). Yêu cầu gửi demo ảnh
trước khi xác nhận triển khai thật — đã gửi demo (số liệu minh hoạ) và
người dùng xác nhận "Ok, màu đẹp rồi".

Không có báo cáo nào tên "HO" trong hệ thống (đã xác nhận lại với người
dùng) — chỉ 4 báo cáo LDTD/HCRC (gốc + Thành viên) được áp màu mới.

## Phân tích màu trong file mẫu

Lấy mẫu pixel trực tiếp từ file PDF mẫu để xác định đúng mã màu:

| Phần | Mã màu gốc (mẫu) |
|---|---|
| Header nhóm "Doanh thu" | `#9BCC1E` (xanh lá) |
| Header nhóm "Lãi gộp" | `#FACD9C` (cam đất/peach) |
| Header nhóm "Giao dịch" | `#F9CE27` (vàng gold) |
| Header "Trung bình GD"/"Doanh thu/m2" + nền dòng Tổng cộng (cột không thuộc nhóm) | `#9D98FD` (tím) |
| Dòng "Tổng cộng" toàn báo cáo (cuối bảng) | `#BDD7EE` (xanh dương) |
| Xen kẽ dòng dữ liệu thường | `#D1FEFF` (cyan) |

Quan trọng: dòng "Tổng cộng MART"/"Tổng cộng MINIMART" trong file mẫu
**giữ nguyên màu của từng nhóm cột** cho các ô dữ liệu (không phải 1 màu
tím phẳng cho cả dòng) — chỉ các cột KHÔNG thuộc nhóm nào (TT/Siêu thị/
Diện tích) mới tô tím.

## Thay đổi

### Bảng màu dùng chung (`rp-server/lib/reportCellFormat.js` +
`rp-user/src/lib/reportGroupColors.js`, mirror)

Đổi mã màu `GROUP_COLORS` theo đúng file mẫu, giảm độ bão hoà ~15-20% cho
"chuyên nghiệp hơn, đỡ chói":

```js
const GROUP_COLORS = {
  green: 'ADCF59', yellow: 'EAD78A', orange: 'EDC8A1',
  blue: 'BDD7EE', red: 'F2A9A9', gray: 'D9D9D9', purple: 'BCB9E9'
};
```

`'yellow'` giờ mang mã màu **gold** (dùng cho "Giao dịch"), `'orange'`
mang mã màu **cam đất/peach** (dùng cho "Lãi gộp") — ĐỔI CHỖ so với trước
(trước đây "Lãi gộp" dùng `'yellow'`, "Giao dịch" dùng `'orange'`) vì mã
hex đứng sau 2 tên này đã đổi cho khớp đúng file mẫu.

3 hàm/hằng số mới, dùng chung cho cả 3 nơi xuất:

- `GRAND_TOTAL_COLOR` — màu dòng Tổng cộng TOÀN báo cáo (`row.__isGrandTotal`),
  đồng nhất 1 màu xanh dương cho MỌI cột.
- `ZEBRA_COLOR` — màu xen kẽ dòng dữ liệu thường (mới, nhẹ hơn nhiều so
  với file mẫu: `#F5F8FA` thay vì cyan chói `#D1FEFF`).
- `resolveRowFillColor(row, col, groups)` — màu nền 1 Ô trong dòng Tổng
  cộng: cột thuộc 1 `columnGroups` nào đó GIỮ NGUYÊN màu nhóm đó; cột
  không thuộc nhóm nào dùng `SUBTOTAL_COLOR` (= `GROUP_COLORS.purple`);
  dòng Tổng cộng toàn báo cáo luôn trả về `GRAND_TOTAL_COLOR`.
- `resolveStandaloneColumnColor(col, standaloneColumnColors)` — màu
  HEADER 1 cột đơn lẻ không thuộc nhóm nào (cơ chế mới, xem bên dưới).
- `computeZebraFlags(rows)` — tính cờ xen kẽ DÙNG CHUNG cho cả 3 nơi xuất
  (đếm bỏ qua dòng Tổng cộng, tránh lệch pha xen kẽ trước/sau 1 dòng Tổng
  cộng nếu mỗi nơi tự đếm riêng).

### Cơ chế mới: `definition.standaloneColumnColors`

2 cột "Trung bình GD"/"Doanh thu/m2" trong file mẫu có màu tím nhưng
KHÔNG có dòng tiêu đề nhóm riêng phía trên (khác hẳn "Doanh thu"/"Lãi
gộp"/"Giao dịch" — các nhóm này có 2 dòng tiêu đề: nhãn nhóm + tên cột
con). Thêm field mới `definition.standaloneColumnColors = {colKey: 'tên
màu'}` (TUỲ CHỌN) để tô riêng HEADER 1 cột đơn lẻ (rowSpan 2, như TT/Siêu
thị/Diện tích) mà không vẽ thêm dòng tiêu đề nhóm.

`rp-server/scripts/seedLdtdHcrcReports.js` khai:
```js
standaloneColumnColors: { trungBinhGD: 'purple', doanhThuTrenM2: 'purple' }
```

### Web (`rp-user/src/components/DataTable.jsx`)

- Dòng Tổng cộng giờ tô màu THEO TỪNG Ô (`<td>`, dùng `resolveRowFillColor()`)
  thay vì tô nguyên `<tr>` 1 màu phẳng như trước.
- Thêm xen kẽ màu (`computeZebraFlags()`) cho dòng dữ liệu thường — CHỈ
  khi báo cáo có `columnGroups` (không đổi giao diện DataTable ở nơi gọi
  khác — UsersPage, RolesPage...).
- Header cột đơn lẻ đọc `standaloneColumnColors` (prop mới, server trả
  qua `result.standaloneColumnColors`) để tô màu.
- `rp-server/lib/reportRunner.js` + `lib/compositeReportRunner.js` (3
  chỗ) trả thêm field `standaloneColumnColors` trong kết quả JSON, song
  song với `columnGroups` đã có từ bản 8.53 — `components/ReportBody.jsx`
  truyền tiếp xuống `DataTable`.

### Excel (`rp-server/lib/exportExcel.js`)

- Viền đổi từ xám đậm `FF999999` sang xám nhạt `FFD9DEE2` (khớp đúng màu
  viền nhẹ `--line` đang dùng ở web).
- Dòng Tổng cộng tô màu theo từng cột (`resolveRowFillColor()`), dòng
  thường xen kẽ `ZEBRA_COLOR` (`computeZebraFlags()`).
- Header cột đơn lẻ tô theo `standaloneColumnColors` nếu có khai.

### PDF (`rp-server/lib/exportPdf.js`)

- Viền đổi từ xám đậm `rgb(0.6,0.6,0.6)` sang xám nhạt (cùng mã màu với
  Excel/web).
- Dòng Tổng cộng + xen kẽ dòng thường — logic giống hệt Excel, dùng chung
  `resolveRowFillColor()`/`computeZebraFlags()`.
- Header cột đơn lẻ tô theo `standaloneColumnColors`.

### Định nghĩa báo cáo (`rp-server/scripts/seedLdtdHcrcReports.js`)

`buildDefinition()` (dùng chung cho cả 4 báo cáo) đổi `columnGroups`:

```js
columnGroups: [
  { label: 'Doanh thu', color: 'green', keys: [...] },
  { label: 'Lãi gộp', color: 'orange', keys: [...] },   // ĐỔI từ 'yellow'
  { label: 'Giao dịch', color: 'yellow', keys: [...] }  // ĐỔI từ 'orange'
],
standaloneColumnColors: { trungBinhGD: 'purple', doanhThuTrenM2: 'purple' }  // MỚI
```

## Các bước triển khai

1. `git pull origin main`.
2. `cd rp-server && node scripts/seedLdtdHcrcReports.js` — **BẮT BUỘC**,
   ghi đè `DefinitionJson` đã lưu trong `app.ReportCatalog`; code mới
   KHÔNG tự áp dụng nếu không chạy lại script này. Dùng đúng `menuCode`
   đã seed lần đầu nếu khác mặc định `reports-kinh-doanh`:
   `node scripts/seedLdtdHcrcReports.js <menuCode>`.
3. `pm2 restart hcrc-rp-server` (BẮT BUỘC — đổi nhiều file `lib/*.js`).
4. `cd rp-user && npm run build`, copy `dist/` mới (đổi
   `components/DataTable.jsx`/`components/ReportBody.jsx`/
   `lib/reportGroupColors.js`).
5. Kiểm tra: mở 1 trong 4 báo cáo "Doanh thu cuối ngày LDTD/HCRC" (trang
   Báo cáo) → màu nhóm cột mới (xanh lá "Doanh thu", cam đất "Lãi gộp",
   vàng gold "Giao dịch", tím "Trung bình GD"/"Doanh thu/m2"), dòng "Tổng
   cộng"/"Tổng cộng MART"/"Tổng cộng MINIMART" tô theo từng nhóm cột,
   dòng dữ liệu xen kẽ màu nhẹ. Thử xuất Excel/PDF → cùng màu, viền nhạt
   hơn trước.

Không đổi cấu trúc CSDL, không ảnh hưởng báo cáo khác (chỉ 4 báo cáo khai
`columnGroups` — "Doanh thu cuối ngày LDTD/HCRC" gốc + Thành viên — bị
ảnh hưởng).
