# Cập nhật bản 8.74 — Sửa lỗi captcha đăng nhập hiện rỗng không log (KHẨN)

## Tóm tắt báo lỗi của người dùng

Trang đăng nhập report.hcrc.vn: ô "Mã xác nhận" hiện ô nhập + nút refresh
(⟲) bình thường, nhưng **ảnh captcha (4 chữ số) không hiện ra** — ô ảnh
trống hoàn toàn. Kèm theo đó là ảnh chụp log PM2 (`pm2 logs hcrc-rp` /
`hcrc-rp-server`) có nhiều dòng lỗi khác nhau.

## Đã loại trừ: các lỗi trong log PM2 KHÔNG liên quan tới captcha

Đối chiếu code xác nhận route `GET /api/auth/captcha`
(`rp-server/server.js`) **không đụng tới bất kỳ CSDL nào** — chỉ sinh 1
ảnh SVG ngẫu nhiên hoàn toàn trong bộ nhớ (xem `rp-server/lib/captcha.js`,
dùng thư viện `svg-captcha`). Các lỗi sau trong log là của những TÍNH NĂNG
KHÁC, không liên quan:

- `The SELECT permission was denied on the object 'ReportFacts'...` — lỗi
  khi chạy báo cáo `bc-doanh-thu-hcrc`, do thiếu quyền SQL trên
  `dwh.ReportFacts`.
- `[filter-options] báo cáo "bc-ton-kho-0"... domain "banhang_sku" KHÔNG
  có dòng nào...` — cảnh báo bộ lọc của báo cáo tồn kho, domain chưa có
  dữ liệu hoặc gõ sai tên domain.
- `[coreItemList] Không đọc được etl.CoreItemList...` — thiếu quyền SQL
  trên `etl.CoreItemList`.
- `Invalid object name 'app.SystemLog'` — job dọn log hệ thống không tìm
  thấy bảng (có thể do chưa chạy `schema.sql` mới nhất trên CSDL đó).
- Lỗi SSL khi gửi email báo cáo theo lịch.

**Những lỗi này cần xử lý RIÊNG** (phần lớn là thiếu quyền SQL hoặc thiếu
bảng — không phải lỗi code mới) — nằm ngoài phạm vi bản 8.74 này.

## Lỗi thật của captcha — lỗi code, đã sửa

`src/lib/api.js` (dùng chung cho mọi lời gọi API ở cả 3 giao diện
rp-user/etl-admin/api-admin) có kiểm tra `Content-Type` của response,
nhưng xử lý SAI khi response **không phải JSON dù HTTP status vẫn 200
OK**:

- **rp-user**: âm thầm gọi `res.blob()` rồi coi là dữ liệu thành công.
- **etl-admin/api-admin**: âm thầm trả về `null` rồi coi là dữ liệu
  thành công.

Tình huống "200 OK nhưng không phải JSON" xảy ra thật khi:
- Triển khai theo mô hình "PM2-only" (không Nginx, dùng
  `deploy/serve-static.js`) nhưng THIẾU biến môi trường `PROXY_PREFIX`/
  `PROXY_TARGET_PORT` — mọi request `/api/...`/`/admin/...` bị rơi vào
  nhánh "SPA fallback", trả về `index.html` (200, `text/html`) thay vì
  gọi tới backend thật. Đây là lỗi **chính file `serve-static.js` đã tự
  ghi chú rất rõ** là "ÂM THẦM, pm2 logs không có dòng nào".
- Hoặc Nginx/proxy trả về 1 trang lỗi HTML (vd lỗi 502/504 được Nginx tự
  render thành trang HTML đẹp thay vì JSON).

**Hậu quả**: `CaptchaField.jsx` nhận `result.svg`/`result.token` là
`undefined` (từ Blob) hoặc lỗi khi đọc field của `null` — captcha hiện
trống. Vì `request()` KHÔNG ném lỗi (coi response này là "thành công"),
khối `catch` trong `CaptchaField.jsx` KHÔNG BAO GIỜ chạy → không
`console.error`, không gì cả — **im lặng tuyệt đối ở cả 2 phía server và
trình duyệt**, đúng y hệt triệu chứng người dùng báo cáo.

## Đã sửa (đồng nhất cả 3 app)

1. **`src/lib/api.js`** (rp-user, etl-admin, api-admin) — khi
   `Content-Type` không phải `application/json`, **ném `Error` rõ ràng**
   (kèm Content-Type thật nhận được trong thông báo lỗi) thay vì âm thầm
   trả về Blob/null.
2. **`CaptchaField.jsx`** (cả 3 app) — thêm `console.error('Không tải
   được captcha:', err)` trong khối `catch` — trước đây là `catch {}`
   trống hoàn toàn, nuốt lỗi không dấu vết.

## Đã kiểm chứng bằng cách dựng lại ĐÚNG lỗi

Dựng 1 mock server trả về `index.html` (200, `text/html`) cho mọi request
`/auth/*` — mô phỏng CHÍNH XÁC tình huống thiếu `PROXY_PREFIX`/
`PROXY_TARGET_PORT`. Kết quả:
- **Trước khi sửa** (hành vi cũ): captcha trống, không console error nào
  — tái hiện đúng ảnh chụp màn hình người dùng gửi.
- **Sau khi sửa**: captcha vẫn trống (vì nguyên nhân gốc — thiếu cấu hình
  — chưa được khắc phục ở bước này), NHƯNG console trình duyệt giờ hiện
  rõ: `"Không tải được captcha: Error: Phản hồi không phải JSON
  (Content-Type: text/html; charset=utf-8) — kiểm tra cấu hình proxy
  /api"` — đủ thông tin để xác định và sửa đúng nguyên nhân gốc ngay lập
  tức, thay vì phải đoán.

## QUAN TRỌNG — bản sửa này làm lộ lỗi ra, không chắc tự hết captcha trống

Bản 8.74 sửa đúng lỗi "im lặng không log" — giúp xác định NGAY nguyên
nhân gốc thật qua console trình duyệt. Nếu nguyên nhân gốc là do thiếu
cấu hình proxy (mô hình PM2-only), captcha **vẫn sẽ trống** cho tới khi
sửa đúng cấu hình đó — xem mục "Các bước triển khai" bên dưới, bước 3.

## Các bước triển khai

1. `git pull origin main`.
2. Build lại cả 3 giao diện, copy `dist/` mới:
   ```
   cd rp-user && npm run build
   cd ../etl-admin && npm run build
   cd ../api-admin && npm run build
   ```
   (Sửa thuần frontend — KHÔNG cần `pm2 restart` bất kỳ tiến trình backend
   nào.)
3. Mở lại trang đăng nhập (report/etl-admin/api-admin) — kiểm tra captcha
   đã hiện ảnh chưa:
   - **Nếu ĐÃ hiện** → xong, không cần làm gì thêm.
   - **Nếu VẪN trống** → mở DevTools (F12) → tab Console lúc tải lại
     trang → đọc dòng lỗi "Không tải được captcha: ...":
     - Nếu là `"Phản hồi không phải JSON (Content-Type: ...)"` → chạy
       `curl -i https://<domain>/api/auth/captcha` (đổi `/api` thành
       `/admin` cho etl-admin/api-admin). Nếu trả về HTML thay vì JSON:
       server đang chạy mô hình "PM2-only" (không Nginx) và **THIẾU 2
       biến môi trường** `PROXY_PREFIX` + `PROXY_TARGET_PORT` ở đúng
       tiến trình giao diện đó trong `deploy/ecosystem.config.js` (xem
       chú thích đầu `deploy/serve-static.js` để biết giá trị đúng —
       `PROXY_PREFIX=/api`, `PROXY_TARGET_PORT=4001` cho `hcrc-rp-user`;
       `PROXY_PREFIX=/admin`, `PROXY_TARGET_PORT=4003`/`4002` cho
       `hcrc-etl-admin`/`hcrc-api-admin`) — thêm đúng 2 biến rồi
       `pm2 restart` đúng tiến trình đó.
     - Nếu là lỗi khác (vd timeout, 502) → đối chiếu với lỗi mạng/Nginx
       thật giữa giao diện tĩnh và backend tương ứng.

## File thay đổi

- `rp-user/src/lib/api.js`, `etl-admin/src/lib/api.js`,
  `api-admin/src/lib/api.js` — không còn âm thầm coi response không phải
  JSON (status 200) là thành công.
- `rp-user/src/components/CaptchaField.jsx`,
  `etl-admin/src/components/CaptchaField.jsx`,
  `api-admin/src/components/CaptchaField.jsx` — thêm `console.error` khi
  tải captcha lỗi.
