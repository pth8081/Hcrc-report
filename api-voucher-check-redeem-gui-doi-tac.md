# Tài liệu API — Kiểm tra & Thu hồi (cập nhật) Voucher

**Hệ thống cung cấp:** HCRC API Server
**Base URL:** `/api/v1/vouchers`
**Xác thực:** bắt buộc header `X-API-Key: <api-key-được-HCRC-cấp>` (API key riêng cho hệ thống của quý đối tác, cấp lúc kết nối — mất key cần báo HCRC luân chuyển key mới, không lấy lại được key cũ)

Ghi chú: API key được cấp đúng phạm vi (scope) cho từng thao tác — key có
thể được cấp quyền gọi `/check`, `/redeem`, hoặc cả hai tuỳ theo yêu cầu
tích hợp đã thống nhất với HCRC.

---

## 1. `POST /api/v1/vouchers/check` — Kiểm tra thông tin voucher

Endpoint chỉ đọc, **không** làm thay đổi trạng thái voucher. Dùng ngay sau khi quét mã, trước khi cho phép người dùng bấm "Xác nhận thu hồi".

### Request

```json
{
  "voucherCode": "ABC123456789",
  "scanMethod": "HID_SCANNER"
}
```

| Trường | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `voucherCode` | string | Có | Tự động `trim()`. **Tối đa 24 ký tự** — mã quá dài bị từ chối ngay ở tầng validate |
| `scanMethod` | string | Không | Chỉ nhận và ghi log phía HCRC, không ảnh hưởng kết quả trả về |

### Response

**200 — còn dùng được:**
```json
{
  "success": true,
  "data": {
    "canRedeem": true,
    "status": "UNUSED",
    "voucherSerial": "SR-000123",
    "valueAmt": 200000,
    "issueDate": "2026-01-01T00:00:00Z",
    "expiryDate": "2026-12-31T23:59:59Z"
  }
}
```

**200 — đã sử dụng:**
```json
{
  "success": true,
  "data": {
    "canRedeem": false,
    "status": "USED",
    "message": "Voucher nay da duoc su dung. Vui long quet ma voucher khac."
  }
}
```

**200 — không hợp lệ/không tồn tại:**
```json
{
  "success": true,
  "data": {
    "canRedeem": false,
    "status": "INVALID",
    "message": "Voucher khong hop le hoac khong ton tai."
  }
}
```

**400 — lỗi input:**
```json
{ "success": false, "message": "Thieu voucherCode" }
```
```json
{ "success": false, "message": "Ma voucher qua dai (toi da 24 ky tu)" }
```

**401/403 — lỗi xác thực:** thiếu/sai `X-API-Key`, hoặc key chưa được cấp quyền gọi `/check`.

**429 — vượt giới hạn tần suất gọi** (kèm header `Retry-After`).

---

## 2. `POST /api/v1/vouchers/redeem` — Xác nhận thu hồi (cập nhật trạng thái voucher)

Gọi sau khi người dùng bấm "Xác nhận thu hồi" trên giao diện. Đây là bước **duy nhất** làm thay đổi trạng thái voucher thật sự.

### Request

Giống hệt `/check` — chỉ cần `voucherCode` (bắt buộc, ≤24 ký tự) và `scanMethod` (tùy chọn).

```json
{ "voucherCode": "ABC123456789", "scanMethod": "HID_SCANNER" }
```

### Response

**200 — thu hồi thành công:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "status": "REDEEMED",
    "pendingSync": false,
    "transNum": "260927153000A1B2C3",
    "valueAmt": 200000,
    "redeemedAt": "2026-09-27T15:30:00Z"
  }
}
```
`pendingSync` LUÔN là `false` — mọi lượt thu hồi được xử lý và xác nhận NGAY LẬP TỨC, không có cơ chế hàng đợi/đồng bộ trễ phía HCRC.

**200 — voucher đã ở trạng thái "đã dùng" từ trước** (gọi trùng do thử lại
sau timeout/lỗi mạng, hoặc voucher đã được thu hồi qua kênh khác gần như
đồng thời — 2 tình huống này trả về CÙNG 1 response, không phân biệt):
```json
{
  "success": false,
  "data": {
    "success": false,
    "status": "USED",
    "message": "Voucher nay da duoc su dung. Vui long quet ma khac."
  }
}
```
Gọi lại nhiều lần với CÙNG 1 mã đã redeem thành công là AN TOÀN (idempotent)
— không có rủi ro thu hồi 2 lần hay trả lỗi bất thường.

**404 — không tìm thấy mã:**
```json
{ "error": "Khong tim thay ma" }
```

**400 — lỗi input:** giống hệt `/check` (thiếu mã hoặc mã quá 24 ký tự).

**401/403 — lỗi xác thực:** thiếu/sai `X-API-Key`, hoặc key chưa được cấp quyền gọi `/redeem`.

**429 — vượt giới hạn tần suất gọi** (kèm header `Retry-After`).

**5xx — lỗi hệ thống tạm thời:** hệ thống HCRC tạm thời không xử lý được —
**AN TOÀN để gọi lại** (chưa có thay đổi nào được ghi nhận nếu nhận lỗi
này; nếu redeem đã thành công thì các lần gọi lại sau đó sẽ nhận response
"đã dùng" ở trên thay vì lỗi).

---

## 3. Ghi chú tích hợp

- **Luôn gọi `/check` trước `/redeem`** để hiển thị đúng trạng thái cho người dùng trước khi xác nhận — `/redeem` tự kiểm tra lại trạng thái mới nhất ngay lúc xử lý (không dựa vào kết quả `/check` trước đó), nên vẫn an toàn nếu có độ trễ giữa 2 lần gọi.
- **`transNum`** là mã tham chiếu HCRC tự sinh cho mỗi lượt thu hồi thành công — dùng để đối chiếu khi cần tra soát với HCRC.
- **Không cần retry logic phức tạp phía đối tác** cho lỗi 5xx/timeout — gọi lại `/redeem` với CÙNG `voucherCode` là an toàn (xem mục 2).
- Liên hệ HCRC để được cấp `X-API-Key` và xác nhận phạm vi quyền (check/redeem) trước khi tích hợp.
