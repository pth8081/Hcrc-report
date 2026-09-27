# API `POST /api/v1/vouchers/check` / `redeem` — Kiểm tra & thu hồi voucher

Tài liệu triển khai riêng cho tính năng này — dành cho team IT/DBA thực
hiện từng bước. Không cần đọc `hướng_dẫn_báo_cáo.md` (tài liệu tổng) để
làm tính năng này.

## 1. Tính năng này làm gì

App "HCRC Voucher Redemption" (thiết bị quét mã ở quầy) cần 1 nơi (1) kiểm
tra trạng thái 1 voucher trước khi thu hồi, (2) xác nhận thu hồi (đổi
trạng thái) — trước đây app này gọi 1 "Core API" riêng. Từ tính năng này,
**api-server đóng vai trò đúng "Core API" đó** — đọc/ghi TRỰC TIẾP bảng
thật của DSMART16 (Live), KHÔNG qua Data Warehouse:

- `POST /api/v1/vouchers/check` — chỉ đọc, không đổi gì. Trả trạng thái
  voucher (còn dùng được/đã dùng/không hợp lệ).
- `POST /api/v1/vouchers/redeem` — đổi trạng thái voucher sang "đã dùng"
  (đúng 1 lần, không lùi lại được).

Bảng nguồn tại DSMART16 (đã xác nhận với người dùng ở
`hướng_dẫn_báo_cáo.md` mục 13): `PMCRDINF` — thẻ/voucher gốc: `CARD_ID`,
`BARCODE`, `VALUE_AMT`, `BAL_AMT`, `STATUS` (`1`=CHƯA thu hồi, `0`=ĐÃ thu
hồi), `DUE_DATE`, `ISS_DATE`, `STK_ID`.

**Khác gì "Endpoint realtime"/"Endpoint ghi" đã có** (mục 3/13
`hướng_dẫn_báo_cáo.md`): 2 route này CỐ ĐỊNH trong code
(`lib/voucherRedeemService.js`), không cấu hình bảng/cột qua UI — vì hợp
đồng JSON đã cố định sẵn theo tài liệu app voucher (không tự do như
Endpoint realtime/ghi tổng quát). Admin CHỈ chọn 1 thứ: "Nguồn dữ liệu"
nào (đã khai ở trang "Nguồn dữ liệu") trỏ DSMART16.

**Không có local cache/hàng đợi retry** như thiết kế app gốc (app đó có DB
riêng + gọi "Core API" riêng, có hàng đợi đồng bộ khi mất kết nối) — đã
xác nhận với người dùng: api-server LÀ nguồn duy nhất, mất kết nối DSMART16
thì báo lỗi ngay, không xây hàng đợi đồng bộ lại.

**Redeem CHỈ đổi `STATUS`** (giữ nguyên quyết định cũ ở mục 13 —
`hướng_dẫn_báo_cáo.md`), KHÔNG ghi `PMCRDRCV` (bảng redeem gốc DSMART16).
Vì `PMCRDINF` không có cột "ngày đã dùng", hệ thống ghi thêm 1 dòng vào
bảng RIÊNG của HCRC (`api.VoucherRedemptions`, không đụng schema DSMART16)
để giữ mốc thời gian — đây cũng là nguồn cho báo cáo "voucher đã dùng"
(xem `bc-voucher.md`, làm sau). Đã xác nhận với người dùng: hiện tại CHỈ
CÓ 1 kênh redeem (app này).

## 2. Hợp đồng API (khớp tài liệu app voucher)

Khác 1 chỗ so với tài liệu app: đường dẫn thật là `/api/v1/vouchers/...`
(đúng quy ước `/api/v1/*` hiện có của api-server), không phải
`/api/vouchers/...` như bản nháp ban đầu — team app đổi base URL 1 chút.

**Xác thực**: dùng lại đúng model "Đối tác" (Consumer) đã có — KHÔNG xây
hệ đăng nhập nhân viên riêng như tài liệu app mô tả (JWT theo từng nhân
viên) — coi app voucher là 1 đối tác DUY NHẤT, dùng 1 API key/HMAC chung
(app tự lo việc phân biệt nhân viên nào thao tác, nếu cần). Scope: `check`
cần `realtime`, `redeem` cần `realtimeWrite` (2 scope có sẵn, không tạo
scope mới).

`POST /api/v1/vouchers/check` — body `{"voucherCode": "...", "scanMethod": "..."}` (`scanMethod` chỉ nhận, không dùng để lọc gì — app tự ghi log riêng nếu cần). `voucherCode` tối đa 24 ký tự.

Response:
- Còn dùng được: `{"success": true, "data": {"canRedeem": true, "status": "UNUSED", "voucherSerial": "...", "valueAmt": ..., "issueDate": "...", "expiryDate": "..."}}`
- Đã dùng: `{"success": true, "data": {"canRedeem": false, "status": "USED", "message": "..."}}`
- Không hợp lệ/không tồn tại: `{"success": true, "data": {"canRedeem": false, "status": "INVALID", "message": "..."}}`

`voucherSerial` map tạm vào `CARD_ID` (PMCRDINF không có cột "serial"
riêng) — đối chiếu lại với team app nếu họ cần đúng 1 mã khác.

`POST /api/v1/vouchers/redeem` — body giống `/check`.

Response:
- Thành công: `{"success": true, "data": {"success": true, "status": "REDEEMED", "pendingSync": false, "transNum": "...", "valueAmt": ..., "redeemedAt": "..."}}` (`pendingSync` LUÔN `false` — không còn hàng đợi, khác thiết kế app gốc)
- Đã dùng từ trước (gọi trùng/race): `{"success": false, "data": {"success": false, "status": "USED", "message": "..."}}`
- Không tìm thấy mã: `404 {"error": "Khong tim thay ma"}`
- Thiếu/sai `voucherCode`: `400 {"success": false, "message": "..."}`

`transNum` do api-server TỰ SINH (`yyMMddHHmmss` giờ UTC + 6 ký tự ngẫu
nhiên) — KHÔNG phải số giao dịch thật của DSMART16 (không ghi `PMCRDRCV`,
xem mục 1).

## 3. Việc cần làm (theo đúng thứ tự)

| # | Việc | Ai làm |
|---|---|---|
| 1 | git pull + khởi động lại api-server VÀ api-admin | IT/Dev |
| 2 | DBA chạy lại `api-db/schema.sql` (an toàn chạy lại nhiều lần) | DBA |
| 3 | Đã có "Nguồn dữ liệu" trỏ DSMART16 (Live) chưa? | Admin api-admin (dùng lại nếu đã có từ mục 13, KHÔNG tạo mới) |
| 4 | Vào api-admin → "Cấu hình Voucher", chọn đúng Nguồn dữ liệu | Admin api-admin |
| 5 | Vào "Đối tác", tạo/sửa 1 đối tác cho app voucher — scope `realtime` + `realtimeWrite` | Admin api-admin |
| 6 | Gán quyền Xem/Sửa trang "Cấu hình Voucher" ở "Vai trò" | Admin api-admin |
| 7 | Đưa API key/HMAC cho team app voucher, xác nhận đổi base URL sang `/api/v1/vouchers/...` | IT/Dev |
| 8 | Kiểm tra: gọi thử `/check` với 1 mã còn dùng được và 1 mã đã dùng | IT/Dev |

Thiếu bước 4 (chưa chọn Nguồn dữ liệu) thì MỌI request trả lỗi `503` rõ
ràng ("Chưa cấu hình Nguồn dữ liệu cho Voucher..."), không phải lỗi khó
hiểu.

## Bước 4 — Cấu hình Voucher (api-admin)

Vào trang **"Cấu hình Voucher"** (menu mới, mặc định KHÔNG vai trò nào
tự có quyền xem — gán ở "Vai trò" như mọi trang khác) — chọn 1 "Nguồn dữ
liệu" đã khai ở trang "Nguồn dữ liệu" (server/database DSMART16 Live).
Chỉ có đúng 1 cấu hình cho toàn hệ thống (không phân biệt theo đối tác).

## Bước 5 — Cấp quyền gọi cho đối tác (app voucher)

Vào "Đối tác" → tạo/sửa đối tác cho app voucher:
1. Tick scope `realtime` (cho `/check`) và `realtimeWrite` (cho `/redeem`)
   — cấp cả 2 nếu app cần cả 2 API, chỉ 1 scope thì chỉ gọi được API
   tương ứng.
2. KHÔNG cần vào "Realtime được gọi"/"Ghi được gọi" tick riêng endpoint gì
   — 2 route voucher này CỐ ĐỊNH, không đi qua danh sách "Endpoint" động
   như Endpoint realtime/ghi thường, chỉ cần đúng scope là gọi được.

## "Kiểm tra voucher" nội bộ (nhân viên tra thủ công) — KHÔNG cần code

Khác với API app voucher ở trên (dành cho THIẾT BỊ quét mã), nếu CÒN cần 1
trang để NHÂN VIÊN tự gõ/tra 1 mã voucher xem trạng thái — dùng NGUYÊN cơ
chế "Endpoint realtime" + báo cáo tra-1-khoá đã có (mục 3/13.1
`hướng_dẫn_báo_cáo.md`), KHÔNG cần code gì thêm:

1. api-admin → "Endpoint realtime" → tạo endpoint mới trỏ `PMCRDINF`, Cột
   khoá = `BARCODE`, cột hiển thị tick `STATUS`, `VALUE_AMT`, `BAL_AMT`,
   `ISS_DATE`, `DUE_DATE`.
2. rp-user → Hệ thống → Biểu mẫu → tạo báo cáo `SourceType: apiReport`,
   `apiTarget` = tên endpoint vừa tạo, `lookupField: barcode` — xem mục 3
   `hướng_dẫn_báo_cáo.md` cho ví dụ cấu hình đầy đủ.
3. Gán quyền xem báo cáo này cho vai trò nhân viên cần tra cứu.

## Hỏi & đáp

**Gọi `/check`/`/redeem` trả lỗi 503 "Chưa cấu hình Nguồn dữ liệu"?**
Chưa làm Bước 4 (Cấu hình Voucher) — vào api-admin chọn Nguồn dữ liệu.

**Gọi `/redeem` trả `403`?**
Đối tác thiếu scope `realtimeWrite` (hoặc `realtime` cho `/check`) — sửa ở
"Đối tác" (Bước 5).

**"Báo cáo voucher" (tổng hợp theo ngày/chi nhánh, tháng hiện tại + quá
khứ) ở đâu?**
Tính năng KHÁC, làm SAU — xem `bc-voucher.md` (chưa có tại thời điểm viết
tài liệu này, cần DBA xác nhận cấu trúc bảng voucher bên `DSMART16_EOM`
trước khi thiết kế phần "quá khứ").

## Tham khảo thêm

Tài liệu này khớp với `API_Voucher_Check_Redeem.md` (tài liệu app voucher
khách hàng cung cấp) TRỪ phần auth (JWT nhân viên → Consumer API
key/HMAC), phần local cache/hàng đợi retry (bỏ hẳn — api-server là nguồn
duy nhất), và phần `PMCRDRCV`/`Voucher_Exelogs`/`VoucherScanLogs` (bỏ —
dùng `api.VoucherRedemptions` + `api.RequestLog` có sẵn thay thế). Khi
`lib/voucherRedeemService.js`/`routes/v1/vouchers.js` thay đổi, cần cập
nhật lại tài liệu tương ứng.
