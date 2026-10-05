# Cập nhật bản 8.75 — Báo cáo Đơn đặt hàng / Đơn nhập hàng / So sánh đặt–nhận

## Tóm tắt yêu cầu người dùng

> "Tôi muốn bạn lấy cho tôi báo cáo đơn đặt hàng, đơn nhập hàng và báo
> cáo so sánh giá trị giữa nhập hàng thực và đặt hàng thực tế của toàn bộ
> siêu thị."

Sau khi xác nhận hệ thống CHƯA có nguồn dữ liệu này, người dùng hỏi DBA
DSmart16 và cung cấp: tên 4 bảng (`ON_ORDER`, `FN_ORDER`, `ST_ORDER`,
`ST_ORDER_ARC`), 6 mã trạng thái (`C`/`P`/`F`/`M`/`D`/`E`), 1 file PDF mẫu
"Phiếu đặt hàng" thật, và xác nhận CSDL DSmart16 là **trung tâm** (chứa
đơn hàng mọi siêu thị, dùng bảng "Ánh xạ Điểm - STK_ID" đã có để xác định
đúng siêu thị).

## Phân tích nguồn dữ liệu

- `ON_ORDER`/`FN_ORDER` — bảng trạng thái SỐNG dùng nội bộ nghiệp vụ POS,
  **không dùng** cho báo cáo (không đảm bảo giữ lịch sử đầy đủ theo ngày).
- `ST_ORDER` (tháng hiện tại) + `ST_ORDER_ARC` (tháng quá khứ) — bảng LỊCH
  SỬ, đúng nguồn cần cho yêu cầu "lấy theo ngày cả quá khứ".
- **Phát hiện quan trọng** từ mẫu "Phiếu đặt hàng" thật: cột "Số lượng"
  có 2 cột con "Theo đơn" và "Thực nhận" **TRÊN CÙNG 1 DÒNG** chứng từ —
  xác nhận `ST_ORDER`/`ST_ORDER_ARC` là **1 NGUỒN DUY NHẤT** cho cả đặt
  lẫn nhận, không phải 2 nguồn tách biệt phải JOIN/ghép composite.

## Thiết kế — tái dùng tối đa hạ tầng đã có

Thay vì xây dựng tính năng mới từ đầu, bản 8.75 ghép vào ĐÚNG các mảnh đã
có sẵn trong hệ thống:

- **1 domain ETL duy nhất** (`don_dat_hang`) lưu vào `dwh.ReportFacts`
  (hạ tầng EAV sẵn có, `Dimensions`/`Measures` dạng JSON) — không cần
  bảng CSDL mới.
- **Cả 3 báo cáo dùng CHUNG 1 `SourceType` mới** (`purchaseOrder`,
  `rp-server/lib/purchaseOrderRunner.js`), chỉ khác nhau ở
  `DefinitionJson.columns` (cột nào hiển thị) — không phải 3 runner riêng.
- **Cột "So sánh đặt–nhận"** (Chênh lệch SL, Tỷ lệ hoàn thành %, Chênh
  lệch giá trị) dùng `lib/formulaEngine.js` đã có sẵn (bộ đánh giá công
  thức an toàn, không `eval()`), tính trực tiếp trên measures của CÙNG 1
  dòng — không cần ghép composite nhiều khối.

## Vấn đề kỹ thuật duy nhất cần giải quyết riêng — ánh xạ mã siêu thị

DSmart16 là CSDL trung tâm — cột "Nơi nhận" trong dữ liệu đồng bộ sang là
mã **STK_ID thô** theo cách đặt tên của DSmart16, KHÔNG PHẢI mã "Điểm"
chuẩn mà HCRC dùng xuyên suốt hệ thống báo cáo (xem "quy tắc mã BU_ID và
STK_ID.md"). Người dùng yêu cầu rõ: "vẫn dựa vào bảng ánh xạ mã STK để
thực hiện".

`lib/reportEngine.js` (chạy mọi báo cáo `SourceType='directDb'`) không có
khả năng tra cứu bên ngoài — nên bản 8.75 viết 1 runner MỎNG
(`purchaseOrderRunner.js`): gọi lại ĐÚNG `runReport()`/`projectColumns()`/
`describeColumns()` của `reportEngine.js` (không viết lại logic lọc/công
thức), chỉ thêm ĐÚNG 1 bước — sau khi lấy dữ liệu thô, tra bảng "Ánh xạ
Điểm - STK_ID" (`lib/diemStkMapping.js`, hàm mới `buildStkIdLookup()`) để
**ghi đè** `MaDiem`/`TenDiem` bằng mã Điểm + tên siêu thị CHUẨN trước khi
trả về. STK_ID nào CHƯA được khai trong bảng ánh xạ bị **loại khỏi báo
cáo** (không hiện mã thô lẫn mã chuẩn — tránh hiểu nhầm).

`__storeScope` (bản 8.51, phạm vi dữ liệu theo người dùng đăng nhập) được
áp dụng đúng NGAY TRONG runner này (lọc theo STK thô TRƯỚC khi ghi đè mã
Điểm, dùng `resolveStoreScopeStkIds()` đã có sẵn) — người dùng bị giới
hạn phạm vi chỉ thấy đúng đơn hàng của siêu thị mình, giống mọi báo cáo
khác trong hệ thống.

## 3 báo cáo tạo ra

| Báo cáo | ReportId | Cột chính |
|---|---|---|
| Đơn đặt hàng | `bc-don-dat-hang` | Ngày đặt, Số đơn, Siêu thị, NCC, Mã/Tên hàng, SL theo đơn, Đơn giá, Thành tiền, Ngày giao, Trạng thái |
| Đơn nhập hàng | `bc-don-nhap-hang` | Ngày đặt, Số đơn, Siêu thị, NCC, Mã/Tên hàng, SL thực nhận, Đơn giá, Thành tiền thực nhận, Trạng thái |
| So sánh đặt–nhận | `bc-so-sanh-dat-nhan` | Ngày đặt, Siêu thị, NCC, Mã/Tên hàng, SL theo đơn, SL thực nhận, Chênh lệch SL, Tỷ lệ hoàn thành (%), Chênh lệch giá trị, Trạng thái |

Cả 3 có bộ lọc: khoảng ngày (bắt buộc hiểu, lọc theo ngày ĐẶT — chưa có
cột ngày nhận thực tế riêng, xem mục "Giới hạn" bên dưới) và trạng thái
(6 mã C/P/F/M/D/E, chọn nhiều).

## Đã kiểm chứng bằng mock (chưa có CSDL DSmart16 thật để nối)

Dựng dữ liệu giả lập `dwh.ReportFacts` (3 đơn hàng, 3 siêu thị khác nhau,
1 siêu thị CHƯA khai ánh xạ) + `etl.DiemStkMapping` giả lập, chạy thẳng
`purchaseOrderRunner.js` thật (không fake logic nghiệp vụ, chỉ fake tầng
CSDL) — xác nhận ĐÚNG cả 6 kiểm tra:
- STK_ID chưa khai ánh xạ bị loại khỏi kết quả.
- `TenDiem`/`MaDiem` được ghi đè đúng bằng tên/mã chuẩn HCRC.
- Công thức "Chênh lệch SL" và "Tỷ lệ hoàn thành (%)" tính đúng.
- `__storeScope` cô lập ĐÚNG dữ liệu giữa các siêu thị khác nhau (test với
  2 phạm vi khác nhau, mỗi phạm vi chỉ thấy đúng dữ liệu của mình — không
  rò rỉ đơn hàng siêu thị khác).

## Sửa kèm 1 lỗi thật phát hiện được (không liên quan trực tiếp tới bản này)

Trong lúc đọc `rp-db/schema.sql` để thêm `SourceType='purchaseOrder'`,
phát hiện ràng buộc `CK_ReportCatalog_SourceType` (CHECK constraint)
**THIẾU HẲN** 2 giá trị `'stockThreshold'`/`'stockAlert'` (đã thêm từ bản
8.68, dùng bởi `seedStockThresholdReport.js`/`seedStockAlertReport.js`) —
nghĩa là mọi lần chạy lại 2 script đó trên 1 CSDL ĐÃ áp constraint này sẽ
bị SQL Server từ chối với lỗi vi phạm CHECK constraint (thông báo lỗi
không rõ ràng, dễ nhầm là lỗi khác). Đã bổ sung đủ cả 2 giá trị cùng lúc
với `'purchaseOrder'` trong cùng 1 lần sửa `rp-db/schema.sql`.

## Giới hạn đã biết (v1)

- Lọc/sắp xếp theo **ngày ĐẶT** — CHƯA có cột "ngày nhận thực tế" riêng
  (mẫu phiếu chỉ có "ngày giao DỰ KIẾN"). Bổ sung sau nếu DBA xác nhận có
  cột này.
- KHÔNG có bộ lọc "Siêu thị" trên giao diện (yêu cầu ban đầu là xem TOÀN
  BỘ siêu thị cùng lúc) — `__storeScope` vẫn áp dụng đúng cho người dùng
  bị giới hạn phạm vi.
- `D` (đã xoá)/`E` (đã huỷ) vẫn hiện trong mọi báo cáo — CHƯA tự động
  loại, admin tự lọc qua cột "Trạng thái" nếu cần.

## QUAN TRỌNG — chưa có số liệu thật cho tới khi DBA xác nhận cấu trúc

VIEW mẫu ở `bc-don-dat-hang.md` mục 2 dùng tên cột **PHỎNG ĐOÁN** (dựa
trên mẫu phiếu in, không phải tên cột SQL thật của `ST_ORDER`/
`ST_ORDER_ARC`) — **DBA PHẢI đối chiếu và sửa lại đúng tên cột thật**
trước khi tạo VIEW. Xem mục 2 của tài liệu đó để biết chính xác những gì
cần xác nhận thêm (tên cột ngày đặt, watermark cập nhật, mã siêu thị, xử
lý `SoLuongThucNhan` khi chưa nhập, và cấu trúc dòng chi tiết so với
dòng/đơn).

## Các bước triển khai

**[DBA] Bước bắt buộc trước tiên**: đối chiếu + sửa đúng tên cột thật rồi
tạo `CREATE VIEW dbo.vw_DonDatHangChiNhanh` trên DSMART16 (xem
`bc-don-dat-hang.md` mục 2).

1. `git pull origin main`.
2. Chạy `rp-db/schema.sql` (BẮT BUỘC — sửa CHECK constraint
   `CK_ReportCatalog_SourceType`).
3. `cd etl && node scripts/seedDonDatHangSync.js` (cần
   `DSMART16_SERVER`/`DSMART16_USER`/`DSMART16_PASSWORD` trong `.env`).
4. `cd rp-server && node scripts/seedPurchaseOrderReports.js`.
5. rp-user → Hệ thống → Phân quyền — gán quyền xem 3 `ReportId` cho đúng
   vai trò (script KHÔNG tự gán quyền).
6. `pm2 restart hcrc-etl hcrc-rp-server`.
7. Đợi tối đa 15 phút (chu kỳ đồng bộ `*/15 * * * *`) rồi kiểm tra báo
   cáo có dữ liệu — siêu thị CHƯA khai "Ánh xạ Điểm - STK_ID" sẽ KHÔNG
   xuất hiện (không phải lỗi).

## File thay đổi

- `bc-don-dat-hang.md` (mới) — tài liệu đầy đủ nguồn dữ liệu + VIEW mẫu.
- `etl/scripts/seedDonDatHangSync.js` (mới).
- `rp-server/lib/purchaseOrderRunner.js` (mới).
- `rp-server/lib/diemStkMapping.js` — thêm `buildStkIdLookup()`.
- `rp-server/lib/reportRunner.js` — đăng ký `SourceType='purchaseOrder'`.
- `rp-server/scripts/seedPurchaseOrderReports.js` (mới) — tạo 3 báo cáo.
- `rp-db/schema.sql` — sửa `CK_ReportCatalog_SourceType` (thêm
  `purchaseOrder` + 2 giá trị thiếu từ bản 8.68).
