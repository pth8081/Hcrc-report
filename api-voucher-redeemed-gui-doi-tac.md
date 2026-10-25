# API tra cứu Voucher đã dùng — dành cho đối tác

**Hệ thống cung cấp:** HCRC API Server
**Base URL:** `/api/v1/realtime/voucher-redeemed`
**Xác thực:** bắt buộc header `X-API-Key: <api-key-được-HCRC-cấp>` — key
riêng cho hệ thống của quý đối tác, cấp lúc kết nối (mất key cần báo HCRC
luân chuyển key mới, không lấy lại được key cũ).

**Mục đích**: cho phép quý đối tác tự lấy thông tin voucher ĐÃ ĐƯỢC SỬ
DỤNG qua hệ thống HCRC, để cập nhật vào hệ thống nội bộ của quý đối tác.
API này **CHỈ ĐỌC**, không làm thay đổi gì tới voucher.

**Voucher CHƯA sử dụng KHÔNG xem được qua API này** — tra đúng mã một
voucher chưa dùng sẽ nhận phản hồi "không tìm thấy", giống như mã không
tồn tại.

---

## 1. `GET /api/v1/realtime/voucher-redeemed/{maVoucher}` — Tra 1 mã

Gửi đúng mã quét ra từ máy quét/camera, **không cần tự chỉnh sửa định
dạng** (có hay không có ký tự `C` ở đầu mã đều được, hệ thống HCRC tự
chuẩn hoá trước khi tra).

### Response

**200 — mã ĐÃ sử dụng (tìm thấy):**
```json
{
  "CARD_ID": "E34000089252",
  "STATUS": 0,
  "VALUE_AMT": 200000,
  "BAL_AMT": 0,
  "ISS_DATE": "2026-01-01T00:00:00.000Z",
  "DUE_DATE": "2026-12-31T00:00:00.000Z"
}
```

| Trường | Ý nghĩa |
|---|---|
| `CARD_ID` | Mã voucher CHUẨN lưu trong hệ thống HCRC — LUÔN KHÔNG có ký tự `C` đầu, bất kể mã quý đối tác gửi lên có hay không |
| `STATUS` | LUÔN bằng `0` ở API này (nghĩa là "đã sử dụng") — chỉ trả ra để tham khảo, không cần kiểm tra lại |
| `VALUE_AMT` | Giá trị voucher |
| `BAL_AMT` | Số dư còn lại (voucher dùng 1 lần là thu luôn, thường bằng 0 sau khi đã dùng) |
| `ISS_DATE` | Ngày phát hành |
| `DUE_DATE` | Ngày hết hạn |

**404 — mã CHƯA sử dụng, HOẶC không tồn tại** (2 trường hợp trả về CÙNG 1
lỗi, không phân biệt — tránh để lộ voucher thật chưa dùng của người khác):
```json
{ "error": "Không tìm thấy khoá tra cứu" }
```

**401/403 — lỗi xác thực:** thiếu/sai `X-API-Key`, hoặc key chưa được cấp
quyền gọi endpoint `voucher-redeemed` này.

**429 — vượt giới hạn tần suất gọi** (kèm header `Retry-After`).

---

## 2. `GET /api/v1/realtime/voucher-redeemed/list` — Lấy danh sách

Dùng để kéo TOÀN BỘ voucher đã dùng (phân trang) — đồng bộ 1 lần hoặc
định kỳ vào hệ thống của quý đối tác, không cần tra từng mã một.

### Request (query string)

| Tham số | Bắt buộc | Mặc định | Ghi chú |
|---|---|---|---|
| `page` | Không | `1` | Trang thứ mấy |
| `pageSize` | Không | `200` | Tối đa `1000` dòng/trang |

Ví dụ: `GET /api/v1/realtime/voucher-redeemed/list?page=1&pageSize=200`

### Response

```json
{
  "page": 1,
  "pageSize": 200,
  "columns": [
    { "key": "CARD_ID", "label": "CARD_ID" },
    { "key": "STATUS", "label": "STATUS" },
    { "key": "VALUE_AMT", "label": "VALUE_AMT" },
    { "key": "BAL_AMT", "label": "BAL_AMT" },
    { "key": "ISS_DATE", "label": "ISS_DATE" },
    { "key": "DUE_DATE", "label": "DUE_DATE" }
  ],
  "rows": [
    { "CARD_ID": "E34000089252", "STATUS": 0, "VALUE_AMT": 200000, "BAL_AMT": 0, "ISS_DATE": "2026-01-01T00:00:00.000Z", "DUE_DATE": "2026-12-31T00:00:00.000Z" }
  ]
}
```

Danh sách này **không có cột "ngày đã sử dụng"** riêng (hệ thống nguồn
không lưu mốc thời gian này trên bảng voucher gốc) — quý đối tác nên tự
đối soát theo `CARD_ID` đã lấy ở lần gọi trước, để biết dòng nào MỚI xuất
hiện so với lần đồng bộ trước đó.

**401/403/429** — giống mục 1.

---

## 3. `GET /api/v1/vouchers/[:configKey/]redeemed/since` — Lấy danh sách MỚI từ lần gọi trước (khuyến nghị cho job định kỳ)

**Khác mục 2** — endpoint này dành riêng cho hệ thống của quý đối tác CHẠY
MỘT JOB ĐỊNH KỲ (vd mỗi 15-30 phút) để lấy ĐÚNG những voucher MỚI thu hồi
kể từ lần gọi gần nhất, **KHÔNG CẦN tự đối soát/so sánh danh sách đầy đủ**
như mục 2 — hệ thống HCRC tự nhớ vị trí qua tham số `sinceId` quý đối tác
gửi lên.

**Base URL**: `/api/v1/vouchers/redeemed/since` (cấu hình mặc định) hoặc
`/api/v1/vouchers/{configKey}/redeemed/since` (nếu HCRC đã cấp thêm cấu
hình riêng, vd nhiều chi nhánh/máy chủ khác nhau — liên hệ HCRC nếu chưa
rõ `configKey` của mình).

**Yêu cầu quyền RIÊNG** — khác hẳn mục 1/2 (scope `voucherCheck`/
`realtime`): cần được HCRC cấp thêm scope **`voucherRedeemedFeed`** cho
API key của quý đối tác. Liên hệ HCRC nếu gọi bị lỗi 403.

### Request (query string)

| Tham số | Bắt buộc | Mặc định | Ghi chú |
|---|---|---|---|
| `sinceId` | Không | `0` | Giá trị `nextSinceId` nhận được ở LẦN GỌI TRƯỚC — gọi lần ĐẦU TIÊN để trống (hoặc `0`) để lấy TOÀN BỘ lịch sử từ đầu |
| `pageSize` | Không | `200` | Tối đa `1000` dòng/trang |

Ví dụ: `GET /api/v1/vouchers/redeemed/since?sinceId=1050&pageSize=200`

### Response

```json
{
  "sinceId": 1050,
  "nextSinceId": 1200,
  "pageSize": 200,
  "hasMore": false,
  "columns": [
    { "key": "Barcode", "label": "Barcode" },
    { "key": "ValueAmt", "label": "ValueAmt" },
    { "key": "StkId", "label": "StkId" },
    { "key": "TransNum", "label": "TransNum" },
    { "key": "RedeemedAt", "label": "RedeemedAt" }
  ],
  "rows": [
    { "Barcode": "E34000089260", "ValueAmt": 200000, "StkId": "10061", "TransNum": "260101103045AB12CD", "RedeemedAt": "2026-01-01T10:30:45.000Z" }
  ]
}
```

| Trường | Ý nghĩa |
|---|---|
| `Barcode` | Mã voucher CHUẨN (CARD_ID) |
| `ValueAmt` | Giá trị voucher |
| `StkId` | Mã chi nhánh/kho nơi voucher được thu hồi |
| `TransNum` | Mã giao dịch thu hồi HCRC tự sinh — giá trị `RECONCILED` nghĩa là voucher được HỆ THỐNG HCRC tự phát hiện đã dùng (không qua đúng API thu hồi chuẩn, vd dữ liệu lịch sử cũ), không phải lỗi |
| `RedeemedAt` | Thời điểm thu hồi (hoặc thời điểm HCRC PHÁT HIỆN ra, với dòng `TransNum="RECONCILED"`) |

**⚠️ `columns`/`rows` chỉ gồm những trường HCRC đã CẤU HÌNH cho ĐÚNG API
key của quý đối tác** — có thể KHÁC bảng trên nếu HCRC đã tuỳ chỉnh (ít
trường hơn). Liên hệ HCRC nếu cần thêm trường.

### Cách tích hợp (quan trọng)

1. Lần gọi ĐẦU TIÊN: gọi KHÔNG kèm `sinceId` (hoặc `sinceId=0`) để lấy
   TOÀN BỘ lịch sử từ đầu — có thể cần gọi NHIỀU LẦN nếu dữ liệu lớn (xem
   bước 3).
2. **LƯU LẠI** giá trị `nextSinceId` nhận được — đây là "vị trí" cần nhớ
   cho lần gọi SAU.
3. Nếu `hasMore: true` — CÒN DỮ LIỆU trong lần đồng bộ này, gọi NGAY lại
   với `sinceId = nextSinceId` vừa nhận, LẶP LẠI tới khi `hasMore: false`.
4. Khi `hasMore: false` — đã lấy hết dữ liệu MỚI tính tới thời điểm gọi.
   Lưu `nextSinceId` cuối cùng này lại, dùng làm `sinceId` cho LẦN CHẠY
   JOB KẾ TIẾP (vd 15-30 phút sau).
5. Mỗi dòng trong `rows` là 1 voucher đã được thu hồi — cập nhật trạng
   thái tương ứng vào hệ thống nội bộ của quý đối tác.

**401/403/429** — giống mục 1 (403 kèm thêm trường hợp CHƯA được cấp
scope `voucherRedeemedFeed`).

---

## 4. Ghi chú tích hợp

- Mã voucher gửi lên (mục 1) giữ NGUYÊN định dạng máy quét/camera trả về
  — không cần tự cắt/chỉnh sửa.
- Cả 2 API đều **CHỈ ĐỌC**, an toàn gọi lại nhiều lần, không có rủi ro làm
  thay đổi trạng thái voucher.
- Liên hệ HCRC để được cấp `X-API-Key` và xác nhận đã được cấp quyền gọi
  endpoint `voucher-redeemed` trước khi tích hợp.
