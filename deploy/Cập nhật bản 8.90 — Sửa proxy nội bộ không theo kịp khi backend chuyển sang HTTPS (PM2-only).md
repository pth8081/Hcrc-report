# Cập nhật bản 8.90 — Sửa proxy nội bộ không theo kịp khi backend chuyển sang HTTPS (PM2-only, cả 3 app)

## Báo cáo của người dùng

> Nay tôi add CA vào ETL và lỗi mã captcha luôn, bạn có biết vì sao ko?
> Và hệ thống ngoài cũng ko trust được ssl vừa add

Hỏi lại và xác nhận: deployment này **KHÔNG dùng Nginx** (PM2-only, dùng
`deploy/serve-static.js` để phục vụ 3 giao diện tĩnh).

## Nguyên nhân — đã thử sai 1 giả thuyết trước khi tìm ra đúng

**Giả thuyết ban đầu (SAI, đã kiểm chứng lại và loại bỏ)**: nghi `ca.pem`
được gán nhầm vào field `ca` thay vì nối vào `cert` khi tạo HTTPS server
(`lib/tlsServer.js`), khiến chuỗi chứng chỉ gửi cho client không đầy đủ.
Viết test TLS thật (3 cấp: root CA → intermediate CA → leaf cert, y hệt
cách 1 CA thương mại cấp) để kiểm chứng — kết quả: **cả 2 cách đều gửi đủ
2 chứng chỉ trong bắt tay TLS** (Node/OpenSSL bản đang dùng tự động nối
chuỗi từ field `ca` nếu có, dùng `SSL_CTX` cert store sẵn có). Giả thuyết
này KHÔNG giải thích được lỗi captcha — phải tìm tiếp.

**Nguyên nhân THẬT SỰ**: `deploy/serve-static.js` (tiến trình phục vụ
giao diện tĩnh bằng PM2 — `hcrc-rp-user`/`hcrc-api-admin`/
`hcrc-etl-admin`) có 1 proxy nội bộ (`proxyToBackend()`) — vì không có
Nginx đứng trước định tuyến `/api`/`/admin/...`, chính tiến trình NÀY
phải tự chuyển tiếp các đường dẫn đó sang đúng backend song sinh
(`hcrc-rp-server`/`hcrc-api-server`/`hcrc-etl`) ở cổng 4001-4003.

Proxy này **LUÔN gọi bằng `http.request()`**, bất kể backend đang chạy
HTTP hay đã chuyển sang HTTPS. Sau khi upload "Chứng chỉ TLS" cho ETL +
`pm2 restart hcrc-etl` (bắt buộc ở lần đầu, theo đúng hướng dẫn trang đó),
cổng 4003 giờ CHỈ hiểu TLS — proxy vẫn gửi byte HTTP thường vào → backend
từ chối ngay (`socket hang up`) → **MỌI API qua proxy lỗi, bao gồm cả mã
xác nhận (captcha)**.

Đã viết test TLS thật để chứng minh:
- Backend HTTPS (tự ký) + proxy CŨ (`http.request`) → lỗi
  `socket hang up` ngay lập tức.
- Backend HTTPS + proxy MỚI (tự phát hiện, dùng `https.request`) →
  nhận đúng response JSON 200.
- Backend HTTP thường (không TLS_CERT_DIR) → không đổi hành vi, vẫn hoạt
  động như trước.

Lỗi này xảy ra **ngay cả khi KHÔNG dùng Nginx** — đúng chế độ "PM2-only"
mà chính tính năng "Chứng chỉ TLS" (bản 8.71) nói là được hỗ trợ, nhưng 2
tính năng (TLS cho backend + proxy nội bộ của tiến trình giao diện) chưa
từng được nối với nhau.

## Đã làm

### 1. `deploy/serve-static.js` — proxy tự phát hiện backend đã HTTPS chưa

```js
function backendUsesHttps() {
  if (!TLS_CERT_DIR) return false;
  return fs.existsSync(path.join(TLS_CERT_DIR, 'key.pem')) && fs.existsSync(path.join(TLS_CERT_DIR, 'cert.pem'));
}

function proxyToBackend(req, res) {
  ...
  const useHttps = backendUsesHttps();
  const client = useHttps ? https : http;
  const proxyReq = client.request({
    host: '127.0.0.1', port: PROXY_TARGET_PORT, method: req.method, path: req.url,
    ...(useHttps ? { rejectUnauthorized: false } : {}),
    headers: { ... }
  }, ...);
  ...
}
```

Dùng LẠI đúng biến `TLS_CERT_DIR` đã có sẵn từ bản 8.71 (vốn trỏ tới thư
mục `certs/` của backend song sinh) làm nguồn xác định — không cần thêm
biến môi trường mới. `rejectUnauthorized: false` vì gọi thẳng `127.0.0.1`
trong khi chứng chỉ cấp cho tên miền thật (không khớp CN/SAN) — vẫn CHỈ
qua loopback nội bộ (không ra Internet), không giảm an toàn so với trước
(trước đó proxy còn chưa hề mã hoá đoạn này).

### 2. Cảnh báo rõ hơn ngay trên cả 3 trang "Chứng chỉ TLS"

Lúc upload lần đầu (chuyển HTTP→HTTPS, `restartRequired=true`), ngoài câu
nhắc restart backend sẵn có, thêm 1 câu MỚI: nếu KHÔNG dùng Nginx, phải
thêm `TLS_CERT_DIR` vào tiến trình giao diện tương ứng trong
`deploy/ecosystem.config.js` rồi restart tiến trình đó — nêu đích danh
tên tiến trình + giá trị cần thêm cho từng app.

### 3. `lib/tlsServer.js` (3 backend) — nối CA/chain đúng cách (phòng ngừa, không phải nguyên nhân chính)

Dù đã kiểm chứng KHÔNG phải nguyên nhân gây lỗi captcha, vẫn sửa cho đúng
theo tài liệu Node chính thức — tránh phụ thuộc hành vi "tự động nối
chuỗi" ngầm định của OpenSSL (có thể khác nhau giữa các phiên bản Node):

```js
if (fs.existsSync(CA_PATH)) {
  credentials.cert = Buffer.concat([credentials.cert, Buffer.from('\n'), fs.readFileSync(CA_PATH)]);
}
```

Thay vì gán riêng `credentials.ca = ...` (field này ở phía SERVER chỉ
dùng để xác minh chứng chỉ CLIENT/mTLS, không liên quan tới chuỗi chứng
chỉ gửi cho client).

## Về "hệ thống ngoài không trust SSL vừa add"

Nếu chứng chỉ vừa upload do **CA nội bộ** (tự dựng, không phải CA công
cộng như Let's Encrypt/DigiCert/...) cấp, đây là hành vi **ĐÚNG, không
phải lỗi**: bất kỳ hệ thống nào chưa cài đặt CA gốc nội bộ đó vào kho tin
cậy của riêng nó sẽ luôn báo "không trust", bất kể server cấu hình đúng
hay sai. 2 cách xử lý:

1. Dùng chứng chỉ từ CA công cộng (khuyến nghị nếu hệ thống cần truy cập
   từ bên ngoài — Let's Encrypt miễn phí, dùng được qua Nginx hoặc trực
   tiếp qua chính tính năng "Chứng chỉ TLS" này).
2. Nếu bắt buộc dùng CA nội bộ: cài đặt file CA gốc đó vào kho chứng chỉ
   tin cậy của TỪNG hệ thống/máy bên ngoài cần kết nối tới — không có
   cách nào ở phía server làm việc này thay được.

## Đã kiểm chứng

- Build sạch cả 3 frontend (`npx vite build`).
- Syntax-check sạch `deploy/serve-static.js` + 3 file `lib/tlsServer.js`.
- Test TLS thật (chain 3 cấp root→intermediate→leaf qua `openssl`):
  xác nhận cả 2 cách gán `ca` đều gửi đủ chuỗi chứng chỉ (loại bỏ giả
  thuyết sai) — và xác nhận proxy CŨ lỗi `socket hang up` với backend
  HTTPS, proxy MỚI trả đúng JSON 200, backend HTTP thường không đổi hành
  vi (test regression).

## Các bước triển khai

1. `git pull origin main`.
2. `pm2 restart hcrc-rp-user hcrc-api-admin hcrc-etl-admin hcrc-rp-server hcrc-api-server hcrc-etl`
   (BẮT BUỘC cho cả 6 tiến trình — đổi logic proxy + cách nối CA/chain).
3. **CHỈ áp dụng cho ai ĐÃ upload "Chứng chỉ TLS" cho 1 backend nào đó
   (PM2-only)**: thêm `TLS_CERT_DIR` vào tiến trình giao diện tương ứng
   trong `deploy/ecosystem.config.js` nếu chưa có:
   - Backend ETL (`hcrc-etl`) → thêm vào `hcrc-etl-admin`:
     `TLS_CERT_DIR: '../etl/certs'`
   - Backend Report (`hcrc-rp-server`) → thêm vào `hcrc-rp-user`:
     `TLS_CERT_DIR: '../rp-server/certs'`
   - Backend API (`hcrc-api-server`) → thêm vào `hcrc-api-admin`:
     `TLS_CERT_DIR: '../api-server/certs'`
   
   Rồi `pm2 restart` đúng tiến trình giao diện đó lần nữa.
4. Kiểm tra: mở trang đăng nhập của app đã upload chứng chỉ cho backend
   tương ứng → mã xác nhận hiện ảnh bình thường, đăng nhập được.

## Nếu không thật sự cần backend chạy HTTPS

Đa số trường hợp (có Nginx/reverse proxy khác lo TLS từ ngoài, hoặc chỉ
dùng nội bộ) — đơn giản nhất là **xoá chứng chỉ đã upload nhầm**, quay về
HTTP như cũ, không cần làm bước 3 ở trên:
```bash
rm etl/certs/*.pem        # hoặc rp-server/certs/*.pem, api-server/certs/*.pem
pm2 restart hcrc-etl      # hoặc hcrc-rp-server, hcrc-api-server
```

## File thay đổi

- `deploy/serve-static.js` — `proxyToBackend()` tự chuyển `http`/`https`
  theo đúng trạng thái backend song sinh.
- `etl-admin/src/pages/TlsCertificatePage.jsx`,
  `api-admin/src/pages/TlsCertificatePage.jsx`,
  `rp-user/src/modules/system/tls-certificate/TlsCertificatePage.jsx` —
  thêm cảnh báo cần `TLS_CERT_DIR` + restart tiến trình giao diện khi
  không dùng Nginx.
- `etl/lib/tlsServer.js`, `rp-server/lib/tlsServer.js`,
  `api-server/lib/tlsServer.js` — nối CA/chain vào `cert` thay vì gán
  riêng `ca` (phòng ngừa, không phải nguyên nhân chính của lỗi báo cáo).
