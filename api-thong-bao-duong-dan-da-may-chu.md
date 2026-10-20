# Thông báo đường dẫn API — đa máy chủ DSMART (HCRC + Fuji)

**Mục đích**: tài liệu NGẮN, gửi thẳng cho đối tác đang tích hợp API Voucher
— liệt kê ĐÚNG các đường dẫn (URL) hiện có, dùng cho đúng chi nhánh nào.
Chi tiết đầy đủ format request/response xem `api-voucher-check-redeem-gui-doi-tac.md`
(tài liệu gốc, không đổi — file này chỉ bổ sung phần "chọn đúng máy chủ").

---

## 1. Cơ chế — vì sao cần chọn đúng đường dẫn

Mỗi "Cấu hình Voucher" (xem api-admin → "Cấu hình Voucher") trỏ tới ĐÚNG 1
máy chủ DSMART thật. Đường dẫn API đối tác gọi quyết định dữ liệu đọc từ
máy chủ nào — **không có cơ chế nào khác tự động chọn giúp**, hệ thống HCRC
không "biết" đối tác nào thuộc chi nhánh nào, đối tác (hoặc app của đối
tác) phải tự gọi ĐÚNG đường dẫn tương ứng.

## 2. Danh sách đường dẫn hiện có

| Chi nhánh / Máy chủ | Mã cấu hình | Kiểm tra voucher | Thu hồi voucher |
|---|---|---|---|
| **HCRC** (mặc định — đối tác hiện tại không cần đổi gì) | `default` | `POST /api/v1/vouchers/check` | `POST /api/v1/vouchers/redeem` |
| **Fuji** | `fuji` | `POST /api/v1/vouchers/fuji/check` | `POST /api/v1/vouchers/fuji/redeem` |

(Bảng này CẬP NHẬT khi HCRC mở thêm máy chủ mới — xem lại api-admin →
"Cấu hình Voucher" để biết danh sách mã hiện có mới nhất.)

Request/response của **CẢ 2 dòng trên giống hệt nhau** (cùng JSON body
`{ "voucherCode": "...", "scanMethod": "..." }`, cùng cấu trúc response) —
chỉ khác đường dẫn.

## 3. Quyền gọi — mỗi API key cần được cấp đúng mã

API key của đối tác PHẢI được HCRC cấp quyền đúng mã cấu hình muốn gọi
(api-admin → "Đối tác" → "Cấu hình Voucher được gọi"):

- Gọi `/vouchers/check`, `/vouchers/redeem` (không kèm mã, = `default`) —
  **luôn được phép** nếu key đã có scope `voucherCheck`/`voucherRedeem`,
  không cần cấp thêm gì.
- Gọi `/vouchers/fuji/check`, `/vouchers/fuji/redeem` — **PHẢI được HCRC
  cấp thêm quyền mã `fuji`** trước, nếu chưa cấp sẽ nhận lỗi `403`.

**Lưu ý quan trọng**: 1 API key CÓ THỂ được cấp quyền gọi NHIỀU mã cùng
lúc (vd cả `default` lẫn `fuji`) nếu hệ thống phía đối tác dùng CHUNG 1
app cho nhiều chi nhánh và tự chọn đường dẫn theo chi nhánh người dùng
chọn. Việc chọn ĐÚNG đường dẫn ở TỪNG LƯỢT GỌI vẫn là trách nhiệm của hệ
thống phía đối tác — cấp quyền chỉ là "được phép", không phải "tự động
route".

## 4. Các loại API khác (Báo cáo, Realtime)

Khác với Voucher (2 đường dẫn CỐ ĐỊNH ở trên), API "Báo cáo"/"Realtime"
là **endpoint ĐỘNG do HCRC tự tạo riêng theo từng nhu cầu tích hợp** (qua
api-admin → "Endpoint realtime") — KHÔNG có 1 danh sách cố định để gửi
chung. Khi có tích hợp mới loại này, HCRC sẽ gửi riêng đúng đường dẫn +
tài liệu tương ứng cho đối tác đó, không nằm trong thông báo này.
