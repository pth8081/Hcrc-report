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

**Tra theo `CARD_ID`, KHÔNG phải `BARCODE`** (bản 9.19, SỬA LỖI THẬT —
người dùng tự tra trực tiếp DSMART16 bằng SSMS phát hiện): cột `BARCODE`
của `PMCRDINF` **THƯỜNG RỖNG** trên dữ liệu thật — tra theo cột này khiến
MỌI voucher hợp lệ (kể cả đã dùng/còn hạn) đều bị báo nhầm `INVALID`
("không tồn tại"). Mã `voucherCode` app gửi lên cũng **LUÔN thừa đúng 1 ký
tự `C` ở đầu** so với `CARD_ID` lưu trong CSDL (xác nhận thật: mã quét
`CE34000089252` nhưng `CARD_ID` lưu là `E34000089252`) — `lib/
voucherRedeemService.js:normalizeCardId()` LUÔN bỏ ký tự `C`/`c` đầu (nếu
có) trước khi tra/ghi, áp dụng CẢ `/check` lẫn `/redeem`. **Đối tác (app
quét mã) KHÔNG cần đổi gì** — vẫn gửi nguyên `voucherCode` y như máy quét
trả về, việc chuẩn hoá này api-server tự làm.

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

**Nhiều máy chủ DSMART (bản 9.59, theo yêu cầu người dùng — thêm chi nhánh
"Fuji")**: `/api/v1/vouchers/check` và `/api/v1/vouchers/redeem` (KHÔNG
kèm mã cấu hình) GIỮ NGUYÊN như cũ — đối tác hiện tại KHÔNG cần đổi gì,
LUÔN trỏ cấu hình `default`. Có thêm 2 route MỚI
`/api/v1/vouchers/:configKey/check` và `/api/v1/vouchers/:configKey/redeem`
— `:configKey` là mã cấu hình (vd `fuji`) khai ở trang "Cấu hình Voucher"
(xem Bước 4), cho phép CÙNG 1 app/API key gọi tới NHIỀU máy chủ DSMART
khác nhau tuỳ `:configKey` trên URL. Gọi `:configKey` KHÁC `default` đòi
hỏi đối tác đã được cấp quyền rõ ràng ở "Đối tác" → "Cấu hình Voucher được
gọi" (xem Bước 5b) — thiếu quyền trả về `403`.

**Xác thực**: dùng lại đúng model "Đối tác" (Consumer) đã có — KHÔNG xây
hệ đăng nhập nhân viên riêng như tài liệu app mô tả (JWT theo từng nhân
viên) — coi app voucher là 1 đối tác DUY NHẤT, dùng 1 API key/HMAC chung
(app tự lo việc phân biệt nhân viên nào thao tác, nếu cần). Scope: `check`
cần `voucherCheck`, `redeem` cần `voucherRedeem` — **2 scope RIÊNG**, KHÔNG
dùng chung `realtime`/`realtimeWrite` (đổi từ bản đầu — rà soát chuyên sâu
phát hiện: dùng chung scope với endpoint động nghĩa là cấp `realtime` cho
1 đối tác vì lý do KHÁC (vd đọc báo cáo doanh thu qua Endpoint realtime)
vô tình cũng mở luôn `/vouchers/check` cho đối tác đó — 2 tính năng không
liên quan chia sẻ nhầm 1 cổng quyền. Đối tác ĐANG dùng `realtime`+
`realtimeWrite` cho voucher từ trước cần tick thêm 2 scope mới này ở
"Đối tác" TRƯỚC/CÙNG LÚC nâng cấp, không tự chuyển).

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

**Chống mất audit khi lỗi giữa 2 bước ghi** (rà soát chuyên sâu phát
hiện, đã sửa): `redeemVoucher()` đổi `STATUS` (DSMART16) và ghi
`api.VoucherRedemptions` (CSDL admin) là 2 kết nối khác nhau, không có
giao dịch chung bao trùm được. Nếu bước ghi audit lỗi (mất kết nối tạm
thời...), hệ thống THỬ LẠI tối đa 3 lần trước khi coi là thất bại thật —
nếu vẫn thất bại, trả về `500` với message rõ ràng "đã thu hồi thành công
nhưng ghi nhận cục bộ lỗi, KHÔNG quét lại" (khớp đúng tài liệu app voucher
gốc mô tả cho tình huống này) thay vì để rơi vào phản hồi "đã dùng" mập mờ
ở lần gọi lại sau đó.

**Chặn dò mã voucher (guessGuard riêng, rà soát chuyên sâu phát hiện, đã
thêm)**: `lib/voucherGuessGuard.js` — đếm số lần `/check`/`/redeem` trả về
`INVALID`/`notFound` LIÊN TIẾP theo `consumer.id`, RIÊNG với giới hạn tần
suất chung (`RateLimitPerMinute` ở "Đối tác" — không phân biệt đúng/sai).
Vượt 20 lần sai liên tiếp trong 10 phút → `429` (kèm `Retry-After`) cho
CẢ HAI endpoint của đúng đối tác đó, đến khi hết cửa sổ. Gọi mã ĐÚNG (kể
cả đã USED) xoá ngay bộ đếm — không phạt oan đối tác xử lý danh sách mã
thật xen vài mã lỗi bàn phím.

## 3. Cách xác thực (ví dụ cụ thể cho team app)

Chọn 1 trong 2 cách khi tạo đối tác ở api-admin (mục "Đối tác", `authMethod`):

### Cách 1 — API key tĩnh (đơn giản nhất, khuyên dùng cho thiết bị quét mã)

Admin api-admin tạo đối tác, hệ thống trả về `apiKey` **CHỈ HIỆN ĐÚNG 1
LẦN** lúc tạo — đưa cho team app lưu lại an toàn (mất thì phải "luân
chuyển" key mới, không lấy lại được key cũ). App gửi kèm header
`X-API-Key` ở MỌI request:

```bash
curl -X POST https://<host>/api/v1/vouchers/check \
  -H "X-API-Key: <api-key-được-cấp>" \
  -H "Content-Type: application/json" \
  -d '{"voucherCode": "ABC123456789", "scanMethod": "HID_SCANNER"}'

curl -X POST https://<host>/api/v1/vouchers/redeem \
  -H "X-API-Key: <api-key-được-cấp>" \
  -H "Content-Type: application/json" \
  -d '{"voucherCode": "ABC123456789", "scanMethod": "HID_SCANNER"}'
```

### Cách 2 — HMAC ký từng request (an toàn hơn, không gửi bí mật qua dây)

Dùng khi team app muốn không lộ bí mật dùng chung qua network (chuẩn phổ
biến ở cổng thanh toán). Mỗi request kèm 3 header:

```
X-Key-Id:    <định danh công khai, cấp lúc tạo đối tác>
X-Timestamp: <unix giây lúc ký>
X-Signature: hex(HMAC-SHA256(secret, "POST\n/api/v1/vouchers/redeem\n<timestamp>\n<rawBody>"))
```

`rawBody` là chuỗi JSON thô của body (đúng byte đã gửi). `X-Timestamp`
phải nằm trong 5 phút quanh giờ máy chủ (chống phát lại). Chi tiết đầy đủ:
xem `api-server/README.md` mục "Cấp quyền gọi API cho một hệ thống đối
tác" (mục 3, HMAC).

**Không cần** cách 3 (OAuth2 Client Credentials, cùng tài liệu đó) cho
tính năng này — phù hợp hơn cho tích hợp server-to-server dài hạn, không
cần thiết cho 1 thiết bị quét mã đơn giản.

## 4. Việc cần làm (theo đúng thứ tự)

| # | Việc | Ai làm |
|---|---|---|
| 1 | git pull + khởi động lại api-server VÀ api-admin | IT/Dev |
| 2 | DBA chạy lại `api-db/schema.sql` (an toàn chạy lại nhiều lần) | DBA |
| 2b | DBA chạy `api-db/grants-dsmart16-voucher.sql` TRÊN CSDL DSMART16 (Live, không phải HCRC_API) — tạo login CHỈ ĐÚNG SELECT+UPDATE trên `dbo.PMCRDINF`, nhớ ĐỔI MẬT KHẨU mẫu trước khi chạy | DBA phía DSMART16 |
| 3 | Vào api-admin → "Nguồn dữ liệu" → tạo 1 dòng trỏ DSMART16 (Live), dùng đúng tài khoản vừa tạo ở bước 2b (nếu chưa có sẵn từ mục 13) | Admin api-admin |
| 4 | Vào "Cấu hình Voucher" → chọn đúng "Nguồn dữ liệu" vừa tạo cho dòng `default` (xem Bước 4) | Admin api-admin |
| 5 | Vào "Đối tác", tạo/sửa 1 đối tác cho app voucher — scope `voucherCheck` + `voucherRedeem` | Admin api-admin |
| 6 | Gán quyền Xem/Sửa trang "Cấu hình Voucher" ở "Vai trò" | Admin api-admin |
| 7 | Đưa API key/HMAC cho team app voucher, xác nhận đổi base URL sang `/api/v1/vouchers/...` | IT/Dev |
| 8 | Kiểm tra: gọi thử `/check` với 1 mã còn dùng được và 1 mã đã dùng | IT/Dev |

Thiếu bước 4 (chưa chọn Nguồn dữ liệu) thì MỌI request trả lỗi `503` rõ
ràng ("Chưa cấu hình Nguồn dữ liệu cho Voucher..."), không phải lỗi khó
hiểu.

## Bước 4 — Cấu hình Voucher

**Trước tiên (Bước 2b)**: cần 1 tài khoản SQL trên chính DSMART16 (Live)
với quyền CHỈ ĐÚNG SELECT + UPDATE trên `dbo.PMCRDINF` (không được quyền gì
khác) — chạy `api-db/grants-dsmart16-voucher.sql` (mẫu, nhớ đổi mật khẩu
trước khi chạy thật) trên chính CSDL DSMART16 để tạo tài khoản này.

Tất cả cấu hình máy chủ DSMART16 (kể cả `default` lúc setup lần đầu) làm
ĐÚNG 1 CÁCH DUY NHẤT — qua giao diện api-admin, KHÔNG có script/biến
`.env` nào thay thế (tránh 2 nơi lưu cùng 1 thông tin, dễ lệch/nhầm):

1. Vào trang **"Nguồn dữ liệu"** → "+ Tạo mới" → gõ THẲNG
   server/port/database/username/password của máy chủ DSMART16 (dùng
   đúng tài khoản vừa tạo ở Bước 2b cho `default`, hoặc thông tin máy
   chủ mới vd "Fuji"). Mỗi dòng ở đây tự lưu riêng thông tin kết nối của
   chính nó (mã hoá) — đây là trang bạn đã dùng quen để khai mọi nguồn
   dữ liệu khác trong hệ thống, không có gì khác biệt.
2. Vào trang **"Cấu hình Voucher"** (menu mới, mặc định KHÔNG vai trò
   nào tự có quyền xem — gán ở "Vai trò" như mọi trang khác) — là 1 DANH
   SÁCH (bản 9.59, nhiều máy chủ DSMART). Dòng `default` LUÔN có sẵn
   (không xoá được) — ứng với API `/vouchers/check`,`/vouchers/redeem`
   KHÔNG kèm mã, đối tác hiện tại không cần đổi gì — bấm "Sửa" dòng này,
   chọn đúng "Nguồn dữ liệu" vừa tạo ở bước 1. Thêm máy chủ MỚI (vd
   "Fuji"): bấm "+ Tạo cấu hình mới" → đặt mã (ConfigKey, vd `fuji`) +
   tên (vd "Voucher redeem Fuji") → chọn đúng "Nguồn dữ liệu" tương ứng.
   Mã dùng THẲNG trên URL (`/vouchers/fuji/check`), không đổi được sau
   khi tạo.

## Bước 5 — Cấp quyền gọi cho đối tác (app voucher)

**Cách 1 (script, khuyên dùng — bản 9.04, theo yêu cầu người dùng)**:

```
cd api-server
npm run seed:voucher-app-consumer
```

Tự tạo/cập nhật 1 "Đối tác" tên "App Voucher (thiết bị quét mã)" (đổi tên
qua biến `VOUCHER_APP_CONSUMER_NAME` nếu cần), scope `voucherCheck` +
`voucherRedeem`, idempotent (chạy lại an toàn). API key in ra màn hình RÕ
RÀNG trong khung — copy đúng dòng đó gửi cho đội phát triển app voucher
(kèm ví dụ `curl` dùng luôn, khỏi gõ lại). Đối tác đã tồn tại thì KHÔNG tự
đổi key (tránh làm app ngoài đang chạy mất kết nối) — cần cấp lại key mới
(đã làm mất key cũ, hoặc nghi lộ) thì chạy lại với
`VOUCHER_APP_CONSUMER_ROTATE=true` (key CŨ hết tác dụng NGAY, nhớ báo đội
app voucher trước khi làm).

Xem chi tiết đầy đủ (kèm hướng dẫn gửi key an toàn cho đối tác) trong file
docx riêng người dùng đã nhận.

**Cách 2 (thủ công qua giao diện)**:

Vào "Đối tác" → tạo/sửa đối tác cho app voucher:
1. Tick scope `voucherCheck` (cho `/check`) và `voucherRedeem` (cho
   `/redeem`) — cấp cả 2 nếu app cần cả 2 API, chỉ 1 scope thì chỉ gọi
   được API tương ứng. KHÔNG dùng `realtime`/`realtimeWrite` cho voucher
   nữa (2 scope đó vẫn còn, nhưng chỉ còn tác dụng cho Endpoint realtime/
   ghi động — mục 3/13.1).
2. KHÔNG cần vào "Realtime được gọi"/"Ghi được gọi" tick riêng endpoint gì
   — 2 route voucher này CỐ ĐỊNH, không đi qua danh sách "Endpoint" động
   như Endpoint realtime/ghi thường, chỉ cần đúng scope là gọi được.

## Bước 5b — Cấp quyền gọi 1 máy chủ DSMART khác "default" (vd Fuji)

Chỉ cần làm bước này khi đối tác cần gọi `:configKey` KHÁC `default` (vd
`/vouchers/fuji/check`) — gọi `/vouchers/check`,`/vouchers/redeem` (không
kèm mã) hay `/vouchers/default/check` KHÔNG cần bước này (luôn cho qua,
đúng hành vi cũ).

Vào "Đối tác" → chọn đúng đối tác → nút **"Cấu hình Voucher được gọi"** →
tick đúng (các) mã cấu hình (vd `fuji`) đối tác đó được phép gọi → Lưu.
Mặc định KHÔNG tick gì (default-deny) — đối tác A vô tình gọi nhầm sang
server của đối tác B (vd Fuji) sẽ bị `403` cho tới khi được tick rõ ràng.
1 đối tác có thể được cấp nhiều mã cấu hình cùng lúc nếu thật sự cần gọi
tới nhiều máy chủ DSMART khác nhau.

## "Kiểm tra voucher" nội bộ (nhân viên tra thủ công) — KHÔNG cần code

Khác với API app voucher ở trên (dành cho THIẾT BỊ quét mã), nếu CÒN cần 1
trang để NHÂN VIÊN tự gõ/tra 1 mã voucher xem trạng thái — dùng NGUYÊN cơ
chế "Endpoint realtime" + báo cáo tra-1-khoá đã có (mục 3/13.1
`hướng_dẫn_báo_cáo.md`), KHÔNG cần code gì thêm.

**Cách 1 (TOÀN BỘ bằng script, khuyên dùng — bản 9.03, theo yêu cầu người
dùng: không cấu hình gì qua web, chỉ chạy script + điền thông tin kết nối
CSDL)**:

```
# Bước 1 — api-server: tạo Endpoint realtime (YÊU CẦU đã tạo "Nguồn dữ
#          liệu" trỏ DSMART16 Live qua api-admin trước — xem Bước 4 ở trên)
cd api-server
npm run seed:voucher-check-endpoint

# Bước 2+3 — tạo "Đối tác" (API key) rồi NỐI THẲNG key đó sang rp-server để
#            tạo "Kết nối API Server" — KHÔNG đi qua web, KHÔNG lưu key
#            xuống file nào (chỉ truyền tay trong 1 lệnh, đúng nguyên tắc
#            "bí mật chỉ hiện đúng 1 lần"):
APIKEY=$(node scripts/seedVoucherCheckConsumer.js) && \
  (cd ../rp-server && node scripts/seedVoucherApiConnection.js "$APIKEY")
# baseUrl lấy từ API_SERVER_BASE_URL trong rp-server/.env — hoặc truyền tham
# số thứ 3: node scripts/seedVoucherApiConnection.js "$APIKEY" "API Server" "http://..."

# Bước 4 — rp-server: tạo báo cáo "Tra cứu voucher"
cd ../rp-server
node scripts/seedVoucherCheckReport.js
```

Sau Bước 1, đã kiểm tra được TRỰC TIẾP trên api-server (chưa cần đợi hết các
bước sau): `GET /api/v1/realtime/voucher-check/<mã-barcode>` kèm
`X-API-Key` = chính giá trị `$APIKEY` ở Bước 2+3.

Chạy LẠI nhiều lần AN TOÀN (mọi script đều idempotent) — trừ
`seedVoucherCheckConsumer.js`: đối tác đã tồn tại thì KHÔNG tự đổi key (sợ
làm hỏng kết nối đang chạy) — lệnh `APIKEY=$(...)` sẽ RỖNG và `&&` tự dừng
(không chạy bước sau với key rỗng). Mất key cũ/cần tạo lại từ đầu? Thêm
`VOUCHER_CONSUMER_ROTATE=true` trước lệnh ở Bước 2+3.

**Việc DUY NHẤT còn lại không script hoá được (cố ý)**: vào Hệ thống →
Phân quyền gán quyền xem báo cáo `bc-tra-cuu-voucher` cho vai trò cần dùng.
Toàn bộ script seed trong hệ thống này (kể cả 4 báo cáo doanh thu) đều CỐ
Ý để bước "ai được xem" cho admin tự quyết — không có cơ chế tự gán, tránh
1 script vô tình mở quyền xem dữ liệu cho sai người.

**Cách 2 (thủ công qua giao diện)**:

1. api-admin → "Endpoint realtime" → tạo endpoint mới trỏ `PMCRDINF`, Cột
   khoá = `BARCODE`, cột hiển thị tick `STATUS`, `VALUE_AMT`, `BAL_AMT`,
   `ISS_DATE`, `DUE_DATE`.
2. rp-user → Hệ thống → Biểu mẫu → tạo báo cáo `SourceType: apiRealtime`,
   `apiTarget` = tên endpoint vừa tạo, `lookupField: barcode` — xem mục 3
   `hướng_dẫn_báo_cáo.md` cho ví dụ cấu hình đầy đủ.
3. Gán quyền xem báo cáo này cho vai trò nhân viên cần tra cứu.

## Hỏi & đáp

**Gọi `/check`/`/redeem` trả lỗi 503 "Chưa cấu hình Nguồn dữ liệu"?**
Chưa làm Bước 4 (Cấu hình Voucher) — vào api-admin, trang "Cấu hình
Voucher", chọn đúng "Nguồn dữ liệu" cho dòng cần dùng.

**Gọi `/redeem` trả `403`?**
Đối tác thiếu scope `voucherRedeem` (hoặc `voucherCheck` cho `/check`) —
sửa ở "Đối tác" (Bước 5).

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

**Đây là tài liệu TRIỂN KHAI NỘI BỘ** (cho IT/DBA, có nhắc etl-admin/
api-admin/DSMART16) — **KHÔNG gửi file này cho đối tác ngoài**. Tài liệu
GỬI CHO ĐỐI TÁC (chỉ hợp đồng API thuần tuý, không có chi tiết nội bộ):
xem `api-voucher-check-redeem-gui-doi-tac.md`.
