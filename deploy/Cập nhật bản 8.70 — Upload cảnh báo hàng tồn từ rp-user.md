# Cập nhật bản 8.70 — Upload cảnh báo hàng tồn từ rp-user

## Tóm tắt yêu cầu người dùng

Sau bản 8.69 (chặn đúng theo siêu thị cho etl-admin), người dùng làm rõ
mô hình thật đang dùng: **siêu thị KHÔNG có tài khoản etl-admin, chỉ người
quản trị (HO) mới vào etl-admin được** — siêu thị chỉ dùng rp-user (báo
cáo). Từ đó, người dùng muốn thêm 1 đường upload MỚI, thay vì chỉ có
admin HO upload hộ:

> "Tôi có thể cho upload qua API server được không? ETL tôi không muốn
> làm API." → "Chỉ cần là một cái API cho phép gọi từ report server sang
> thôi. Report server sẽ chặn quyền luôn upload. Upload ở report server
> sẽ chặn luôn là siêu thị nào chỉ để up siêu thị ấy thôi." → "Bạn cho
> cấu hình trên giao diện này là web nhé. Bạn code luôn phần API bên API
> server và API code bên report server đồng nhất luôn đi. Và API server
> kết nối với cơ sở dữ liệu ETL với cái account đã có sẵn từ bên ETL luôn
> đi."

Tóm lại 3 quyết định kiến trúc của người dùng:
1. Có giao diện web thật trên rp-user để siêu thị tự upload (không chỉ là
   kế hoạch "để sau").
2. **api-server** (không phải etl) là nơi nhận file ghi vào CSDL ETL — vì
   "ETL không muốn làm API".
3. api-server kết nối sang CSDL ETL bằng **tài khoản SQL đã có sẵn** (của
   etl) — không tạo tài khoản SQL Server mới, đơn giản hoá triển khai.

## Kiến trúc

```
Siêu thị đăng nhập rp-user
        │  chọn file .xlsx, bấm "Nhập file ngưỡng cảnh báo"
        ▼
rp-user  →  POST /api/stock-alert-upload/import  →  rp-server
                                                        │
                        (1) parse file Excel (giống định dạng etl-admin)
                        (2) tra "Phạm vi dữ liệu" (storeScope) của người
                            đang đăng nhập — bản 8.50/8.51, CÓ SẴN
                        (3) file có dòng NGOÀI phạm vi → TỪ CHỐI (400),
                            KHÔNG gọi sang api-server
                        (4) hợp lệ → gọi tiếp
                                                        │
                        POST /internal/stock-alert-thresholds
                        (secret cố định INTERNAL_API_SECRET, KHÔNG phải
                         HMAC/API key đối tác — 2 service nội bộ tin cậy
                         lẫn nhau)
                                                        ▼
                                                   api-server
                        (5) xác thực secret + IP allowlist (tuỳ chọn)
                        (6) ghi THẲNG vào etl.StockAlertThresholds
                            (CSDL HCRC_ETL) qua pool MỚI "ETL_DB" —
                            DÙNG LẠI tài khoản SQL `etl_admin` (ADMIN_*
                            trong etl/.env) — KHÔNG tạo tài khoản mới
                        (7) REPLACE theo từng MaDiem có trong file (mirror
                            đúng etl bản 8.69 — không xoá sạch siêu thị
                            khác)
```

**2 đường upload giờ chạy song song, cùng ghi 1 bảng** `etl.
StockAlertThresholds`:
- **Đường cũ** (bản 8.68/8.69): admin HO upload qua etl-admin — vẫn giữ
  nguyên, không đổi gì, có phân quyền theo siêu thị riêng của etl-admin
  (`admin.AdminUserStoreAccess`, bản 8.69) cho trường hợp admin phụ chỉ
  quản lý vài siêu thị.
- **Đường mới** (bản 8.70): siêu thị tự upload qua rp-user — dùng CHÍNH
  "Phạm vi dữ liệu" (`app.UserStoreAccess`, bản 8.50) đã có sẵn, không
  cần hệ thống phân quyền riêng nào khác.

etl-admin → "Cảnh báo hàng tồn" vẫn là nơi admin xem/sửa/xoá TỔNG HỢP dữ
liệu từ CẢ 2 đường — không cần phân biệt dòng nào đến từ đâu (cột
`ImportedBy` ghi rõ username đã upload, dù qua đường nào).

## Vì sao chọn api-server (không phải etl)

- Người dùng yêu cầu rõ "ETL không muốn làm API" — tránh thêm route/người
  bảo trì vào codebase etl.
- Kiến trúc hệ thống ĐÃ có pattern y hệt: `rp-server` hiện đọc thẳng bảng
  `etl.StockAlertThresholds`/`etl.DiemStkMapping` từ CSDL `HCRC_ETL` qua 1
  pool riêng (`ETL_DIEM_STK`, tài khoản CHỈ ĐỌC `etl_diem_stk_reader`) —
  "nối thẳng CSDL dịch vụ khác bằng tài khoản SQL riêng" vốn đã là cách
  làm chuẩn giữa các service trong hệ thống này, không phải ý tưởng mới.
  Bản 8.70 chỉ làm NGƯỢC CHIỀU (ghi thay vì đọc), đặt ở api-server thay vì
  rp-server theo đúng lựa chọn của người dùng.

## Vì sao rp-server chặn quyền, không phải api-server

rp-server đã có TOÀN BỘ thông tin "ai đang đăng nhập, thuộc siêu thị nào"
(storeScope, bản 8.50/8.51) — để đúng nơi đã có thông tin tự kiểm tra, api-
server chỉ cần tin tưởng dữ liệu rp-server gửi sang (đã được xác thực bằng
secret nội bộ) mà không cần hiểu lại toàn bộ hệ thống tài khoản/phân quyền
của rp-user. Đơn giản hơn hẳn so với việc để api-server tự xác thực người
dùng rp-user.

## Thay đổi

### rp-user (giao diện mới)
- Trang **"Upload cảnh báo hàng tồn"** (`modules/stock-alert-upload/
  StockAlertUploadPage.jsx`) — hiện rõ "Phạm vi của bạn: [tên siêu thị]"
  (hoặc "Toàn bộ" nếu không giới hạn) trước khi cho chọn file, nút
  "Tải file mẫu" + form upload theo đúng quy ước khoá nút (CLAUDE.md).
- Menu mới `stock-alert-upload` — đặt ở ROOT (KHÔNG nằm trong "Hệ thống")
  để gán quyền riêng được cho vai trò "Siêu thị" mà không cần cấp cả nhóm
  "Hệ thống" (dành cho cấu hình/quản trị, không phù hợp với nhân viên
  siêu thị).

### rp-server
- `lib/stockAlertThresholdsUpload.js` (mới) — parse file Excel, ĐÚNG cùng
  định dạng cột (`MaHang`/`MaDiem`/`NguongCanhBao`/`TenHang`/`NhaCungCap`)
  với etl-admin.
- `lib/fileSignature.js` — thêm lại `guardZipBombSize()` (mirror etl) —
  trang này mở cho MỌI người dùng báo cáo upload, không chỉ admin, nên lớp
  chặn "zip bomb" càng cần thiết.
- `lib/internalApiClient.js` (mới) — gọi `POST /internal/stock-alert-
  thresholds` sang api-server kèm header `X-Internal-Secret`.
- `routes/stockAlertThresholdsUpload.js` (mới) — `GET /` (thông tin phạm
  vi), `POST /template`, `POST /import` (parse + kiểm tra storeScope +
  gọi sang api-server).
- `routes/me.js` — `GET /api/me` trả thêm `storeScope` của CHÍNH người
  đăng nhập (an toàn để lộ).

### api-server
- `lib/internalAuth.js` (mới) — `requireInternalSecret` (secret cố định)
  + `internalAllowedIps` (IP allowlist tuỳ chọn, mirror
  `lib/adminIpAllowlist.js`).
- `lib/stockAlertThresholdsEtlWrite.js` (mới) — ghi vào
  `etl.StockAlertThresholds` qua pool `ETL_DB`, REPLACE theo từng MaDiem
  có trong dữ liệu (mirror đúng etl bản 8.69), tự validate lại hình dạng
  dữ liệu trước khi ghi (không tin mù quáng dữ liệu qua dây nối service-
  to-service).
- `routes/internal/stockAlertThresholds.js` (mới) — `POST /internal/
  stock-alert-thresholds`.

### rp-db
- `app.MenuItems` — thêm mục `stock-alert-upload`.

## Biến môi trường MỚI (bắt buộc để bật tính năng)

**`rp-server/.env`:**
```
INTERNAL_API_SERVER_URL=http://localhost:4002   # URL gốc api-server, KHÔNG có / cuối
INTERNAL_API_SECRET=<chuỗi bí mật tự chọn>
```

**`api-server/.env`:**
```
# COPY Y NGUYÊN giá trị ADMIN_* đang có trong etl/.env (tài khoản etl_admin)
ETL_DB_SERVER=<giống etl/.env ADMIN_SERVER>
ETL_DB_PORT=<giống etl/.env ADMIN_PORT>
ETL_DB_DATABASE=<giống etl/.env ADMIN_DATABASE>     # thường là HCRC_ETL
ETL_DB_USER=<giống etl/.env ADMIN_USER>             # thường là etl_admin
ETL_DB_PASSWORD=<giống etl/.env ADMIN_PASSWORD>
ETL_DB_ENCRYPT=<giống etl/.env ADMIN_ENCRYPT>
ETL_DB_TRUST_CERT=<giống etl/.env ADMIN_TRUST_CERT>

# PHẢI khớp y hệt giá trị rp-server/.env ở trên
INTERNAL_API_SECRET=<cùng chuỗi bí mật>

# Tuỳ chọn — IP máy chủ rp-server, lớp chặn bổ sung
INTERNAL_ALLOWED_IPS=
```

Thiếu 1 trong các biến trên: tính năng tự trả lỗi rõ ràng khi bị gọi (503
ở rp-server, 500/401 ở api-server), **KHÔNG làm sập cả service** — giống
quy ước `WEBAUTHN_RP_*` đã dùng từ bản 8.41.

## Các bước triển khai

1. `git pull origin main`.
2. Chạy lại `rp-db/schema.sql` (BẮT BUỘC — menu mới `stock-alert-upload`).
3. Khai 2 khối biến môi trường ở mục trên (CẢ 2 file `.env`).
4. `pm2 restart hcrc-rp-server` và `pm2 restart hcrc-api-server` (BẮT
   BUỘC). KHÔNG cần restart `hcrc-etl`.
5. `cd rp-user && npm run build`, copy `dist/` mới.
6. rp-user → "Vai trò" → cấp quyền menu "Upload cảnh báo hàng tồn" cho
   vai trò cần dùng (mặc định CHƯA ai có quyền — phải cấp tay).
7. Kiểm tra lại:
   - Đăng nhập tài khoản đã gán "Phạm vi dữ liệu" 1 siêu thị (bản 8.50) →
     "Upload cảnh báo hàng tồn" → thấy đúng tên siêu thị mình.
   - Upload file đúng phạm vi → thành công, đếm đúng số dòng.
   - Upload file có dòng thuộc siêu thị KHÁC → bị từ chối (400), rõ ràng
     tên siêu thị nào ngoài phạm vi, KHÔNG ghi gì.
   - Vào etl-admin → "Cảnh báo hàng tồn" → thấy đúng dữ liệu vừa upload
     từ rp-user (cột "Người nhập" đúng username đã upload).
   - Upload 1 file cho siêu thị A, sau đó 1 file khác cho siêu thị B →
     kiểm tra ngưỡng của A KHÔNG bị mất sau khi upload cho B.

## Những gì KHÔNG đổi

- etl/etl-admin KHÔNG có thay đổi code nào trong bản này.
- Đường upload qua etl-admin (bản 8.68/8.69) vẫn hoạt động y nguyên, song
  song với đường mới.
- Báo cáo "Cảnh báo hàng tồn" (rp-user, bản 8.68) không cần sửa gì — vẫn
  đọc đúng 1 bảng `etl.StockAlertThresholds` như cũ, không quan tâm dữ
  liệu đến từ đường upload nào.
