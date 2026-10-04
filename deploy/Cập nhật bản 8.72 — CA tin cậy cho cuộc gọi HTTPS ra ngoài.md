# Cập nhật bản 8.72 — CA tin cậy cho cuộc gọi HTTPS ra ngoài

## Tóm tắt yêu cầu người dùng

Sau bản 8.71 (PM2 tự chạy HTTPS khi NGƯỜI KHÁC gọi VÀO), người dùng hỏi
tiếp:

> "Khi hệ thống PM2 call API sang hệ thống khác có sử dụng HTTPS thì hệ
> thống PM2 của chúng ta cần phải làm gì để nhận diện được? Nếu cần thì
> bạn cho một cái giao diện để có thể xử lý những vấn đề này được không?"

Đây là **CHIỀU NGƯỢC LẠI** của bản 8.71: không phải "etl/api-server/
rp-server tự trình diện HTTPS cho ai đó gọi vào", mà là "etl/api-server/
rp-server tự GỌI RA sang hệ thống khác — làm sao biết tin ai". 2 ví dụ
thật trong hệ thống hiện tại:

- `rp-server` gọi `api-server` qua `lib/internalApiClient.js` (bản 8.70 —
  "Upload cảnh báo hàng tồn").
- `rp-server` gọi ra "HCRC Workspace" (hệ thống nội bộ công ty, dùng cho
  đăng nhập/đồng bộ danh bạ — `lib/hcrcWorkspaceClient.js`).

Nếu BÊN KIA (api-server sau khi bật bản 8.71, hoặc HCRC Workspace) dùng
HTTPS ký bởi **CA nội bộ/tự tạo** (không phải CA công khai như Let's
Encrypt), bên GỌI sẽ từ chối với lỗi `self signed certificate`/
`unable to verify the first certificate` — **cùng loại lỗi đã gặp với
Postfix tự ký ở bản 8.67**, khác ở chỗ đây là HTTPS giữa 2 service thay
vì SMTP.

## Cơ chế: `tls.setDefaultCACertificates()`

Node (từ khoảng bản 20) có API `tls.setDefaultCACertificates(certs)` —
**thay đổi SỐNG** danh sách CA mặc định tiến trình tin tưởng, áp dụng
NGAY cho mọi kết nối `fetch()`/`https`/`tls` MỚI, **không cần restart**,
và **không cần sửa code ở nơi gọi** (`internalApiClient.js`,
`hcrcWorkspaceClient.js`... tự động hưởng lợi vì đều dùng `fetch()` chuẩn
của Node, vốn đọc đúng danh sách CA mặc định này).

**KHÔNG dùng** các cách sau (dù nhanh hơn):
- `rejectUnauthorized: false` (per-request) hoặc
  `NODE_TLS_REJECT_UNAUTHORIZED=0` (toàn tiến trình) — tắt HẲN việc kiểm
  tra chứng chỉ, mù quáng tin MỌI chứng chỉ kể cả giả mạo. Biến môi
  trường còn nguy hiểm hơn vì ảnh hưởng TOÀN BỘ kết nối HTTPS của tiến
  trình, kể cả gọi ra các API công khai khác.
- `NODE_EXTRA_CA_CERTS` (giải pháp tạm đã nêu khi trả lời câu hỏi tương
  tự ở bản 8.71) — ĐÚNG về nguyên lý nhưng chỉ đọc được lúc khởi động
  tiến trình, đổi phải restart, và phải sửa `.env` tay (không có giao
  diện) — bản 8.72 thay bằng cách LÀM ĐƯỢC QUA UI + ÁP DỤNG SỐNG.

## Kiểm chứng thực tế (trước khi giao) — phát hiện VÀ SỬA 1 lỗi thiết kế

Trong lúc viết test thật (không chỉ đọc code), phát hiện:
`tls.getCACertificates('default')` gọi LẦN ĐẦU trả về danh sách gốc đầy
đủ của Node (vd 299 chứng chỉ), nhưng gọi LẠI SAU KHI đã từng
`setDefaultCACertificates()` thì trả về MỘT DANH SÁCH KHÁC HẲN (vd 166) —
có vẻ Node trả lại danh sách đã bị ghi đè gần nhất, không phải bản gốc
"sạch". Nếu `lib/trustedCa.js` cứ gọi lại `getCACertificates('default')`
mỗi lần admin thêm/xoá 1 CA, các lần sau sẽ xây sai danh sách tin cậy
(có thể THIẾU một phần CA gốc thật) mà không có dấu hiệu lỗi rõ ràng nào
— lỗi âm thầm, nguy hiểm.

**Đã sửa**: chụp lại danh sách gốc CHỈ 1 LẦN, ngay lúc `lib/trustedCa.js`
được nạp lần đầu (trước khi gọi `setDefaultCACertificates()` bất kỳ lần
nào), giữ CỐ ĐỊNH trong biến `BUILT_IN_CAS`, dùng lại đúng biến này cho
MỌI lần áp dụng sau (không đọc lại `'default'`).

Sau khi sửa, kiểm chứng đầy đủ bằng 2 máy chủ HTTPS giả (chứng chỉ tự ký
RIÊNG cho từng máy):
- Cả 2 bị từ chối ("self signed certificate") TRƯỚC khi thêm CA nào.
- Thêm CA của máy 1 → CHỈ máy 1 gọi được; máy 2 ĐÚNG vẫn bị từ chối
  (không "tin bừa tất cả CA lạ", chỉ tin ĐÚNG CA đã thêm).
- Thêm thêm CA của máy 2 → CẢ 2 gọi được; máy 1 KHÔNG bị ảnh hưởng
  (không mất tin cậy đã có khi thêm CA mới).
- Xoá CA của máy 1 → máy 1 bị từ chối LẠI; máy 2 vẫn còn tin cậy.
- Gọi ra 1 HTTPS công khai thật (`https://example.com`) vẫn hoạt động
  bình thường SUỐT quá trình trên — chứng minh KHÔNG làm hỏng/thu hẹp
  danh sách CA công khai gốc của Node.
- Đưa 1 chuỗi không phải PEM chứng chỉ hợp lệ → bị từ chối NGAY (400) với
  thông báo rõ ràng, không ghi file rác.

## Thay đổi

- **`lib/trustedCa.js`** (etl/api-server/rp-server, giống hệt nhau) —
  `listTrustedCas()`, `addTrustedCa(label, pem)`, `removeTrustedCa(id)`.
  Lưu mỗi CA là 1 file `.pem` riêng trong `certs/trusted-ca/` (tên file =
  nhãn admin đặt, đã chuẩn hoá bỏ dấu/ký tự đặc biệt), **KHÔNG lưu CSDL**
  — cùng tinh thần `lib/tlsServer.js` (bản 8.71). Validate chứng chỉ bằng
  `crypto.X509Certificate` trước khi ghi file.
- **`routes/admin/trustedCa.js`** (etl, api-server) /
  **`routes/trustedCa.js`** (rp-server) — `GET /` (danh sách), `POST /`
  (thêm, `{label, pem}`), `DELETE /:id` (xoá). Gate
  `requireSystemRoleActor` — cùng mức chặt với trang "Chứng chỉ TLS"
  (quyết định tiến trình tin tưởng ai khi gọi ra ngoài vẫn là quyết định
  NHẠY CẢM).
- **Mở rộng trang "Chứng chỉ TLS"** (etl-admin/api-admin/rp-user) — thêm
  phần "CA tin cậy (cho các cuộc gọi ra ngoài)" ngay dưới phần upload cert
  cũ, KHÔNG tạo trang/menu mới (giữ 2 chiều TLS liên quan ở cùng 1 chỗ).

## Những gì KHÔNG đổi

- Hệ thống chưa gặp lỗi "self signed certificate" khi gọi ra ngoài: không
  cần làm gì, tính năng không ảnh hưởng gì tới hành vi hiện tại (danh
  sách CA tin cậy mặc định KHÔNG đổi cho tới khi admin chủ động thêm).
- Không đụng CSDL nào (không bảng mới, không cần chạy lại `schema.sql`).
- Không liên quan tới trang "Chứng chỉ TLS" (upload cert cho CHÍNH tiến
  trình — bản 8.71) — đó là chiều server TRÌNH DIỆN, đây là chiều server
  TỰ TIN AI.

## Các bước triển khai

**Bỏ qua nếu hệ thống chưa gặp lỗi "self signed certificate"/"unable to
verify the first certificate" khi 1 service gọi ra ngoài.**

1. `git pull origin main`.
2. `pm2 restart hcrc-etl hcrc-api-server hcrc-rp-server` (BẮT BUỘC — thêm
   route/lib mới; an toàn restart bất kỳ lúc nào, không đổi hành vi nếu
   chưa thêm CA nào).
3. Build + copy `dist/` mới cho cả 3 giao diện.
4. Vào trang "Chứng chỉ TLS" của ĐÚNG hệ thống đang GỌI RA bị lỗi (vd
   rp-server gọi api-server lỗi → vào rp-user, không phải api-admin) →
   phần "CA tin cậy" → nhập nhãn gợi nhớ (vd "api-server nội bộ") + chọn
   file CA của hệ thống BÊN KIA (CHÍNH xác file CA/chứng chỉ máy chủ mà
   bên kia dùng, lấy từ IT quản lý bên đó) → "Thêm CA tin cậy".
5. Kiểm tra lại NGAY (không cần restart): cuộc gọi trước đó bị lỗi
   "self signed certificate" nay phải thành công.
6. (Nếu CA của hệ thống bên kia đổi/hết hạn sau này) Xoá CA cũ, thêm CA
   mới — cũng áp dụng ngay không cần restart.

## File thay đổi

- `etl/lib/trustedCa.js`, `api-server/lib/trustedCa.js`,
  `rp-server/lib/trustedCa.js` (mới, giống hệt nhau).
- `etl/routes/admin/trustedCa.js`, `api-server/routes/admin/trustedCa.js`,
  `rp-server/routes/trustedCa.js` (mới).
- `etl/server.js`, `api-server/server.js`, `rp-server/server.js` — đăng
  ký route mới.
- `etl-admin/src/pages/TlsCertificatePage.jsx`,
  `api-admin/src/pages/TlsCertificatePage.jsx`,
  `rp-user/src/modules/system/tls-certificate/TlsCertificatePage.jsx` —
  thêm phần "CA tin cậy" vào CÙNG trang đã có (bản 8.71).
