# Mục lục tài liệu API (`deploy/api/`)

Theo yêu cầu người dùng (bản 11.14) — mọi tài liệu liên quan tới API cho
đối tác ngoài (api-server) tập trung về đúng thư mục này, kèm ghi rõ
từng tài liệu dùng cho phần nào/gửi cho ai, tránh nhầm lẫn/gửi sai tài
liệu cho đối tác.

| File | Dùng cho | Gửi cho ai |
|---|---|---|
| `api-gia-ban-cho-doi-tac.md` | API tra giá bán theo mã hàng, tra ĐÚNG 1 mã/1 siêu thị mỗi lần quét (`GET /api/v1/reports/gia-ban/run`) | Đối tác ngoài (vd BRG Scan and Checkout) |
| `api-ton-kho-cho-doi-tac.md` | API tồn kho LIVE toàn hệ thống, mọi siêu thị (`GET /api/v1/reports/ton-kho/run`) | Đối tác ngoài |
| `api-voucher-check-redeem.md` | Tài liệu triển khai ĐẦY ĐỦ (bước setup CSDL/grant quyền/cấu hình) cho API check/redeem voucher `POST /api/v1/vouchers/check`\|`redeem` — có chi tiết nội bộ | **Nội bộ** team IT/DBA HCRC — KHÔNG gửi đối tác |
| `api-voucher-check-redeem-gui-doi-tac.md` | Bản RÚT GỌN của tài liệu trên — chỉ hợp đồng API thuần tuý (request/response/mã lỗi), không có chi tiết triển khai nội bộ | Đối tác ngoài (app quét/thu hồi voucher) |
| `api-voucher-redeemed-gui-doi-tac.md` | API tra cứu voucher ĐÃ THU HỒI (feed cho đối tác, dùng con trỏ `sinceId`) | Đối tác ngoài |
| `api-thong-bao-duong-dan-da-may-chu.md` | Tài liệu NGẮN thông báo URL khi hệ thống có NHIỀU máy chủ DSMART (vd HCRC + Fuji) — đối tác dùng đúng URL cho đúng chi nhánh | Đối tác ngoài (gửi KÈM 1 trong các tài liệu voucher ở trên, không dùng riêng lẻ) |
| `Tài liệu API Giá Bán Buôn DSmart.md` / `.docx` | API ghi/xoá giá bán buôn CSPRICE — 3 endpoint `apply`/`delete`/`ping` (xem `routes/v1/wholesalePrice.js`) | Đối tác "Hệ thống Văn phòng số HCRC (HCC)" |

**Quy ước từ bản 11.14 trở đi**: mọi tài liệu API (cho đối tác ngoài hay
tài liệu triển khai nội bộ liên quan API) lưu vào đúng thư mục này —
KHÔNG tạo mới ở gốc repo nữa. Thêm 1 dòng vào bảng trên khi tạo tài liệu
API mới.
