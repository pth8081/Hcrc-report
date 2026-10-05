# Nhật ký triển khai — từ bản 8.31 trở đi

**TỰ ĐỘNG, không cần nhắc**: kể từ khi người dùng yêu cầu (03/10/2026),
MỌI lần merge vào `main` từ bản 8.31 trở đi PHẢI kèm thêm 1 mục MỚI ở
đầu file này (mới nhất lên trên, giống quy ước `VERSION.md`), tóm tắt
đúng CÁC BƯỚC triển khai thật trên server (lệnh chạy, file cần sửa tay,
thứ tự làm) — không chỉ mô tả tính năng. Việc này KHÔNG thay thế từng file
riêng `deploy/Cập nhật bản X.Y — ....md` (vẫn tạo như cũ, tiện khi chỉ cần
đưa đúng 1 bản cho IT) — file NÀY là bản gộp MỘT NƠI DUY NHẤT để xem lại
toàn bộ lịch sử triển khai liên tục, không phải mở nhiều file. TIẾP TỤC
cập nhật file này ở mọi bản sau, cho tới khi người dùng bảo dừng. (File
tạo lần đầu ở bản 8.36 — ghi sẵn 8.34/8.35; sau đó lùi mốc bắt đầu về đúng
bản 8.31 theo yêu cầu người dùng, bổ sung đủ 3 mục 8.31/8.32/8.33.)

---

## 8.79 — KHẨN: Sửa crash rp-server trên Node < 22.4

**Thay đổi**: `rp-server/lib/trustedCa.js` (bản 8.72) gọi API chỉ có từ
Node >= 22.4 ngay lúc nạp module — crash TOÀN BỘ `hcrc-rp-server` trên
server chạy Node cũ hơn (mọi API kể cả captcha/`/api/me` đều 502). Sửa
tự nhận diện Node không hỗ trợ → tắt gọn tính năng "CA tin cậy" thay vì
crash cả tiến trình.

**Các bước triển khai (KHẨN — làm ngay):**
1. `git pull origin main`.
2. `pm2 restart hcrc-rp-server` (BẮT BUỘC — sửa thuần code, không đổi
   CSDL, không cần `npm install`/build frontend).
3. Kiểm tra NGAY: `pm2 status hcrc-rp-server` → cả 2 worker `online`
   (không còn `errored`); `pm2 logs hcrc-rp-server` → không còn dòng
   `TypeError: tls.getCACertificates is not a function`; mở lại trang
   đăng nhập report.hcrc.vn → captcha hiện ảnh bình thường, đăng nhập
   được. Nếu server này có dùng tính năng "CA tin cậy" (trang "Chứng chỉ
   TLS" → mục CA tin cậy) và Node hiện tại < 22.4: mục đó trống, thêm CA
   mới báo lỗi rõ "cần Node.js >= 22.4" — cần nâng cấp Node.js trên server
   rồi `pm2 restart hcrc-rp-server` lại để dùng được tính năng này (không
   ảnh hưởng gì khác nếu chưa nâng cấp).

---

## 8.78 — Đồng bộ 2FA đổi/thêm thiết bị + vân tay/Face ID (WebAuthn) — ETL, API

**Thay đổi**: đồng bộ đầy đủ ngang rp-user (bản 8.40/8.41) cho CẢ
etl-admin lẫn api-admin — "Đặt lại mã 2FA" (đổi thiết bị Authenticator) +
đăng ký vân tay/Face ID (WebAuthn), lúc đăng nhập có thêm nút "Dùng vân
tay/Face ID" thay HẲN bước nhập mã 2FA. Có bảng CSDL mới + gói npm mới +
BẮT BUỘC khai domain thật cho CẢ 2 app.

**Các bước triển khai (giống bản 8.41, nhân đôi cho etl-admin VÀ
api-admin):**
1. `git pull origin main`
2. Chạy lại `etl-db/schema.sql` (thêm bảng `admin.AdminWebAuthnCredentials`,
   an toàn chạy lại nhiều lần) VÀ `api-db/schema.sql` (bảng cùng tên, CSDL
   riêng `HCRC_API`).
3. **Thêm vào `etl/.env`**: `WEBAUTHN_RP_ID=<domain thật etl-admin, không
   có https://>` và `WEBAUTHN_RP_ORIGIN=https://<domain thật etl-admin>`.
4. **Thêm vào `api-server/.env`**: `WEBAUTHN_RP_ID=<domain thật api-admin>`
   và `WEBAUTHN_RP_ORIGIN=https://<domain thật api-admin>`. THIẾU 1 trong 2
   biến ở mỗi app thì tính năng vân tay tự tắt ở ĐÚNG app đó (không crash,
   "Đặt lại mã 2FA" vẫn dùng được bình thường).
5. `cd etl && npm install` VÀ `cd api-server && npm install` (gói mới
   `@simplewebauthn/server`).
6. `cd etl-admin && npm run build`, copy `dist/` mới VÀ `cd api-admin &&
   npm run build`, copy `dist/` mới (gói mới `@simplewebauthn/browser`).
7. `pm2 restart hcrc-etl` VÀ `pm2 restart hcrc-api-server` (BẮT BUỘC —
   route mới `/admin/webauthn/*`).
8. Kiểm tra bằng THIẾT BỊ THẬT (điện thoại/laptop có vân tay/Face ID,
   không mô phỏng được), LÀM Ở CẢ 2 APP: "Tài khoản của tôi" (tài khoản
   Admin hệ thống) có thêm mục "Bảo mật — Xác thực hai yếu tố" (thử "Đặt
   lại mã 2FA" 1 lần, mã cũ ngừng dùng được) và "Bảo mật — Vân tay / Face
   ID" (đăng ký 1 thiết bị, đăng xuất/đăng nhập lại, bấm "Dùng vân tay/Face
   ID" vào thẳng hệ thống không cần gõ mã 6 số).

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.78 — 2FA đổi thiết bị + WebAuthn
cho ETL, API.md`.

---

## 8.77 — Xuất Excel chưa mã hoá cho Nguồn dữ liệu

**Thay đổi**: thêm nút "Xuất Excel (danh sách hiện có, chưa mã hoá)" ở
trang Nguồn dữ liệu — cột Password luôn để trống (an toàn), nộp lại qua
Nhập hàng loạt với Password để trống = giữ nguyên mật khẩu cũ. Sửa kèm
backend để chấp nhận Password trống khi "Name" đã tồn tại. Chi tiết:
`deploy/Cập nhật bản 8.77 — Xuất Excel chưa mã hoá cho Nguồn dữ liệu.md`.

**Các bước triển khai:**
1. `git pull origin main`.
2. `pm2 restart hcrc-etl` (BẮT BUỘC — route mới + sửa logic nhập hàng
   loạt).
3. `cd etl-admin && npm run build`, copy `dist/` mới (nút mới ở trang
   Nguồn dữ liệu).
4. Kiểm tra: vào Nguồn dữ liệu → "Xuất Excel (danh sách hiện có, chưa mã
   hoá)" → mở file → cột Password trống, các cột khác đúng dữ liệu thật →
   sửa 1 dòng (vd đổi Server) → nộp lại qua "Nhập hàng loạt" (để nguyên
   Password trống) → dòng đó cập nhật đúng Server mới, mật khẩu KHÔNG đổi
   (vẫn kết nối được như trước).

---

## 8.76 — Sửa treo khi xoá hàng loạt Nguồn dữ liệu (ETL)

**Thay đổi**: sửa `etl/lib/dataSourcePool.js` (timeout 5s khi đóng kết nối
cũ, trước đây có thể treo vĩnh viễn nếu nguồn DSmart16 rớt mạng kiểu
"zombie") + `etl/routes/admin/dataSources.js` (báo lỗi rõ ràng khi xoá
nguồn còn Sync Job tham chiếu, thay vì lỗi SQL thô). Sửa thuần backend,
không đổi CSDL.

**Các bước triển khai:**
1. `git pull origin main`.
2. `pm2 restart hcrc-etl` (BẮT BUỘC — nạp code mới).
3. Kiểm tra: chọn nhiều "Nguồn dữ liệu"/"Đồng bộ" → xoá hàng loạt — không
   còn bị treo (kể cả khi 1 nguồn trong đó đang mất kết nối mạng thật).

---

## 8.75 — Báo cáo Đơn đặt hàng / Đơn nhập hàng / So sánh đặt–nhận

**Thay đổi**: thêm 3 báo cáo mới dựa trên dữ liệu đơn hàng DSmart16
(`ST_ORDER`/`ST_ORDER_ARC`). Chi tiết đầy đủ: `bc-don-dat-hang.md`,
`deploy/Cập nhật bản 8.75 — Báo cáo Đơn đặt hàng-Nhập hàng-So sánh.md`.

**Các bước triển khai (CHƯA xong bước DBA — xem bước 1):**
1. **[DBA]** Đối chiếu VIEW mẫu ở `bc-don-dat-hang.md` mục 2 với tên cột
   THẬT của `ST_ORDER`/`ST_ORDER_ARC` (hiện chỉ là VÍ DỤ, chưa xác nhận) —
   tạo `CREATE VIEW dbo.vw_DonDatHangChiNhanh` trên DSMART16 với tên cột
   ĐÃ SỬA ĐÚNG.
2. `git pull origin main`.
3. Chạy `rp-db/schema.sql` (BẮT BUỘC — sửa `CK_ReportCatalog_SourceType`,
   kèm fix 2 giá trị thiếu từ bản 8.68).
4. `cd etl && node scripts/seedDonDatHangSync.js` (cần
   `DSMART16_SERVER`/`DSMART16_USER`/`DSMART16_PASSWORD` trong `.env`, xem
   đầu file script) — tạo Sync Job domain `don_dat_hang`.
5. `cd rp-server && node scripts/seedPurchaseOrderReports.js` — tạo 3
   `ReportCatalog`.
6. Vào rp-user → Hệ thống → Phân quyền — gán quyền xem 3 `ReportId`
   (`bc-don-dat-hang`/`bc-don-nhap-hang`/`bc-so-sanh-dat-nhan`) cho đúng
   vai trò.
7. `pm2 restart hcrc-etl hcrc-rp-server` (nạp code mới —
   `purchaseOrderRunner.js`/route `SourceType='purchaseOrder'`).
8. Kiểm tra: đợi tối đa 15 phút (chu kỳ đồng bộ) rồi mở 1 trong 3 báo cáo
   — có dữ liệu đúng siêu thị đã khai "Ánh xạ Điểm - STK_ID"; siêu thị
   CHƯA khai ánh xạ sẽ KHÔNG xuất hiện (không phải lỗi — bổ sung ánh xạ để
   hiện ra).

---

## 8.74 — Sửa lỗi captcha đăng nhập hiện rỗng không log (KHẨN)

**Thay đổi**: sửa `src/lib/api.js` (cả 3 app) để KHÔNG còn âm thầm coi
response không phải JSON (dù status 200) là thành công — trước đây khiến
captcha (và bất kỳ API nào khác gặp tình huống tương tự) hiện rỗng mà
không log lỗi ở đâu cả. Chi tiết đầy đủ + cách chẩn đoán nguyên nhân gốc
(có thể là thiếu `PROXY_PREFIX`/`PROXY_TARGET_PORT` ở triển khai PM2-only):
`deploy/Cập nhật bản 8.74 — Sửa lỗi captcha đăng nhập hiện rỗng không
log.md`.

**Các bước triển khai (BẮT BUỘC — ảnh hưởng toàn bộ 3 trang đăng nhập):**
1. `git pull origin main`.
2. `cd rp-user && npm run build`, `cd ../etl-admin && npm run build`,
   `cd ../api-admin && npm run build` — copy `dist/` mới cho cả 3 giao
   diện (sửa thuần frontend, KHÔNG cần restart backend/PM2 nào).
3. **Kiểm tra NGAY xem captcha đã hiện ảnh chưa** ở cả 3 trang đăng nhập
   (report/etl-admin/api-admin). Nếu VẪN trống:
   a. Mở DevTools (F12) → tab Console lúc tải lại trang đăng nhập — giờ
      PHẢI thấy dòng lỗi rõ ràng "Không tải được captcha: ...".
   b. Nếu lỗi là "Phản hồi không phải JSON" → chạy
      `curl -i https://<domain>/api/auth/captcha` (đổi `/api` thành
      `/admin` cho etl-admin/api-admin) — nếu trả về HTML thay vì JSON,
      server đang chạy theo mô hình "PM2-only" (không Nginx) và THIẾU 2
      biến môi trường `PROXY_PREFIX`/`PROXY_TARGET_PORT` ở tiến trình
      giao diện tương ứng trong `deploy/ecosystem.config.js` — thêm đúng
      2 biến này (xem chú thích đầu `deploy/serve-static.js`) rồi
      `pm2 restart hcrc-rp-user`/`hcrc-etl-admin`/`hcrc-api-admin`. Đây là
      SỬA CẤU HÌNH, không phải chạy lại bước nào ở trên.

---

## 8.73 — Thu hẹp "CA tin cậy": chỉ còn report server

**Thay đổi**: gỡ bỏ phần "CA tin cậy" (bản 8.72) khỏi etl và api-server
(backend + UI etl-admin/api-admin) theo yêu cầu người dùng — tính năng
này CHỈ còn ở rp-server/rp-user. Không ảnh hưởng gì nếu chưa từng thêm CA
nào ở etl/api-server (file `.pem` cũ trong `certs/trusted-ca/` của 2 hệ
thống này, nếu có, không còn được đọc nữa — có thể xoá thủ công, không
bắt buộc). Chi tiết đầy đủ: `deploy/Cập nhật bản 8.73 — Thu hẹp CA tin
cậy chỉ còn report server.md`.

**Các bước triển khai:**
1. `git pull origin main`.
2. `pm2 restart hcrc-etl hcrc-api-server` (BẮT BUỘC — bỏ route
   `/admin/trusted-ca`; `hcrc-rp-server` KHÔNG cần restart, không đổi).
3. `cd etl-admin && npm run build`, `cd ../api-admin && npm run build`,
   copy `dist/` mới cho 2 giao diện này (trang "Chứng chỉ TLS" bỏ phần
   "CA tin cậy", trở lại đúng bản 8.71) — rp-user KHÔNG cần build lại.
4. Không có bước kiểm tra riêng — nếu etl-admin/api-admin đã từng thêm CA
   tin cậy, admin sẽ không còn thấy phần đó nữa (bình thường, đúng ý).

---

## 8.72 — "CA tin cậy": nhận diện HTTPS của hệ thống khác khi PM2 tự gọi ra ngoài

**Thay đổi**: thêm phần "CA tin cậy" vào CÙNG trang "Chứng chỉ TLS" (bản
8.71) ở cả 3 giao diện — chiều NGƯỢC LẠI: khi etl/api-server/rp-server tự
GỌI RA sang hệ thống khác dùng HTTPS ký bởi CA nội bộ/tự tạo (vd rp-server
gọi api-server, bản 8.70), admin thêm đúng CA đó để Node tin tưởng, áp
dụng NGAY không cần restart. Tính năng TỰ CHỌN, không ảnh hưởng gì nếu
chưa dùng. Chi tiết đầy đủ: `deploy/Cập nhật bản 8.72 — CA tin cậy cho
cuộc gọi HTTPS ra ngoài.md`.

**Các bước triển khai (CHỈ cần nếu 2 service nội bộ/bên ngoài gọi nhau
qua HTTPS bằng CA không phải CA công khai — bỏ qua nếu không gặp lỗi
"self signed certificate" khi gọi ra):**
1. `git pull origin main`.
2. `pm2 restart hcrc-etl hcrc-api-server hcrc-rp-server` (BẮT BUỘC — thêm
   route/lib mới, KHÔNG đổi hành vi nếu chưa thêm CA nào).
3. Build + copy `dist/` mới cho cả 3 giao diện (trang "Chứng chỉ TLS" có
   thêm phần "CA tin cậy").
4. Vào trang "Chứng chỉ TLS" của ĐÚNG hệ thống đang GỌI RA bị lỗi (vd
   rp-server gọi api-server lỗi thì vào rp-user) → phần "CA tin cậy" →
   thêm nhãn gợi nhớ + file CA của hệ thống BÊN KIA → áp dụng ngay, không
   cần restart.
5. Kiểm tra lại: cuộc gọi trước đó bị lỗi "self signed certificate" nay
   thành công.

---

## 8.71 — Upload chứng chỉ TLS qua giao diện web cho cả 3 hệ thống (PM2 tự chạy HTTPS)

**Thay đổi**: thêm trang "Chứng chỉ TLS" ở cả 3 giao diện quản trị
(etl-admin/api-admin/rp-user) — admin upload CA/private key/public cert,
tiến trình backend tương ứng (etl/api-server/rp-server) VÀ giao diện tĩnh
song sinh tự chạy HTTPS trực tiếp, không cần Nginx. Tính năng TỰ CHỌN
(opt-in), mặc định tắt — không ảnh hưởng gì hệ thống đang dùng Nginx.
Chi tiết đầy đủ + hướng dẫn CA nội bộ giữa các service: `deploy/Cập nhật
bản 8.71 — Upload chứng chỉ TLS qua giao diện web.md`.

**Các bước triển khai (CHỈ cần nếu muốn dùng tính năng này — bỏ qua hoàn
toàn nếu hệ thống đang dùng Nginx để lo TLS):**
1. `git pull origin main`.
2. `pm2 restart hcrc-etl hcrc-api-server hcrc-rp-server` (BẮT BUỘC — thêm
   route/lib mới, KHÔNG đổi hành vi nếu chưa upload chứng chỉ nào).
3. `cd etl-admin && npm run build`, `cd ../api-admin && npm run build`,
   `cd ../rp-user && npm run build`, copy `dist/` mới cả 3 (trang "Chứng
   chỉ TLS" mới).
4. Vào từng trang (etl-admin/api-admin/rp-user, chỉ tài khoản vai trò hệ
   thống thấy mục "Chứng chỉ TLS") → upload private key + public cert
   (+ CA/chain nếu có) → trang báo "Lần upload ĐẦU TIÊN — cần restart" →
   chạy đúng lệnh `pm2 restart` được hiện ra.
5. (Tuỳ chọn, nếu muốn giao diện tĩnh — rp-user/api-admin/etl-admin — CŨNG
   chạy HTTPS, không chỉ backend) Thêm biến `TLS_CERT_DIR` vào
   `deploy/ecosystem.config.js` của ĐÚNG tiến trình giao diện tĩnh, trỏ
   tới thư mục `certs/` của backend song sinh (vd `TLS_CERT_DIR:
   '../etl/certs'` cho `hcrc-etl-admin`) rồi `pm2 restart` tiến trình đó.
6. (Nếu 2 service NỘI BỘ gọi lẫn nhau qua HTTPS bằng CA tự tạo/nội bộ —
   vd rp-server gọi api-server, bản 8.70) Copy file CA.pem sang máy/máy
   chủ bên GỌI, đặt `NODE_EXTRA_CA_CERTS=/đường-dẫn/ca.pem` trong `.env`
   của service đó rồi restart — xem chi tiết lý do + ví dụ ở file deploy
   riêng.
7. Kiểm tra lại: `curl -k https://<ip-máy-chủ>:<cổng>/` (etl 4003/api-server
   4002/rp-server 4001, và 3 giao diện nếu làm bước 5) trả về đúng dữ liệu;
   lần upload SAU (gia hạn) không cần restart, áp dụng ngay.

---

## 8.70 — Upload cảnh báo hàng tồn NGAY trên rp-user (siêu thị tự upload)

**Thay đổi**: thêm đường upload MỚI cho file ngưỡng cảnh báo hàng tồn —
siêu thị tự upload NGAY trên rp-user (trang mới "Upload cảnh báo hàng
tồn"), rp-server tự chặn đúng theo "Phạm vi dữ liệu" của người đăng nhập
rồi gọi API NỘI BỘ sang api-server để ghi thẳng vào CSDL ETL (api-server
dùng lại tài khoản SQL etl_admin đã có sẵn, KHÔNG đụng gì etl/etl-admin).
Đường upload cũ qua etl-admin (admin HO, bản 8.68/8.69) vẫn giữ nguyên,
chạy song song, cùng ghi 1 bảng. Chi tiết đầy đủ: `deploy/Cập nhật bản
8.70 — Upload cảnh báo hàng tồn từ rp-user.md`.

**Các bước triển khai:**
1. `git pull origin main`.
2. Chạy lại `rp-db/schema.sql` (BẮT BUỘC — thêm menu mới
   `stock-alert-upload`).
3. Khai biến môi trường MỚI ở **CẢ 2** `.env`:
   - `rp-server/.env`: `INTERNAL_API_SERVER_URL` (URL gốc api-server, vd
     `http://localhost:4002`) và `INTERNAL_API_SECRET` (chuỗi bí mật tự
     chọn).
   - `api-server/.env`: `ETL_DB_SERVER`/`ETL_DB_DATABASE`/`ETL_DB_USER`/
     `ETL_DB_PASSWORD` (**COPY Y NGUYÊN** giá trị `ADMIN_*` đang có trong
     `etl/.env` — dùng lại đúng tài khoản `etl_admin`, KHÔNG tạo tài khoản
     SQL mới) và `INTERNAL_API_SECRET` (**PHẢI khớp y hệt** giá trị vừa
     đặt ở rp-server/.env). Tuỳ chọn: `INTERNAL_ALLOWED_IPS` (IP máy chủ
     rp-server, nếu muốn thêm lớp chặn IP).
4. `pm2 restart hcrc-rp-server` và `pm2 restart hcrc-api-server` (BẮT
   BUỘC — KHÔNG cần restart `hcrc-etl`, bản này không đụng etl).
5. `cd rp-user && npm run build`, copy `dist/` mới (trang "Upload cảnh báo
   hàng tồn" mới).
6. rp-user → "Vai trò" → cấp quyền menu "Upload cảnh báo hàng tồn" cho vai
   trò "Siêu thị"/vai trò cần dùng (mặc định CHƯA ai có quyền này).
7. Kiểm tra lại: đăng nhập 1 tài khoản đã gán "Phạm vi dữ liệu" 1 siêu thị
   (bản 8.50) → vào "Upload cảnh báo hàng tồn" → thấy đúng tên siêu thị
   mình → upload file đúng phạm vi → thành công; thử file có dòng thuộc
   siêu thị khác → bị từ chối rõ ràng (400), không ghi gì. Vào etl-admin →
   "Cảnh báo hàng tồn" → thấy đúng dữ liệu vừa upload từ rp-user.

---

## 8.69 — Sửa THIẾU SÓT bản 8.68: chặn đúng theo siêu thị + sửa lỗi import xoá nhầm dữ liệu siêu thị khác

**Thay đổi**: 2 lỗi của bản 8.68 ở trang etl-admin "Cảnh báo hàng tồn" —
(1) upload file của 1 siêu thị trước đây XOÁ SẠCH ngưỡng của MỌI siêu thị
khác (nay chỉ thay đúng (các) siêu thị có trong file); (2) etl-admin
TRƯỚC GIỜ không có khái niệm "tài khoản chỉ thấy 1 siêu thị" (nay thêm
bảng `admin.AdminUserStoreAccess` + gán qua trang "Phân quyền" → nút "Gán
siêu thị", áp dụng cho GET/DELETE/import của trang "Cảnh báo hàng tồn").
Chi tiết đầy đủ: `deploy/Cập nhật bản 8.69 — Chặn đúng theo siêu thị cho
Cảnh báo hàng tồn.md`.

**Các bước triển khai:**
1. `git pull origin main`.
2. Chạy lại `etl-db/schema.sql` (BẮT BUỘC — bảng mới
   `admin.AdminUserStoreAccess`).
3. `pm2 restart hcrc-etl` (BẮT BUỘC — sửa cả `lib/adminPermissions.js` và
   các route `/admin/users`, `/admin/stock-alert-thresholds`).
4. `cd etl-admin && npm run build`, copy `dist/` mới (trang "Phân quyền"
   có cột + nút mới).
5. Vào "Phân quyền" → với mỗi tài khoản chỉ quản lý 1 (vài) siêu thị cụ
   thể, bấm "Gán siêu thị" → chọn đúng (các) siêu thị đó → Lưu. Tài khoản
   KHÔNG gán gì (mặc định) = xem/sửa được TOÀN BỘ (giữ nguyên hành vi cũ
   — an toàn ngược, không tự ý giới hạn tài khoản nào chưa được gán rõ).
6. Kiểm tra lại: đăng nhập thử 1 tài khoản đã gán siêu thị → vào "Cảnh
   báo hàng tồn" → chỉ thấy đúng dòng của siêu thị đó; thử upload file có
   dòng thuộc siêu thị khác → phải bị từ chối rõ ràng (400), không ghi gì.

---

## 8.68 — Báo cáo tồn kho theo ngưỡng + Cảnh báo hàng tồn

**Thay đổi**: 2 báo cáo tồn kho mới — "Tồn kho theo ngưỡng" (tự chọn chiều
trên/dưới + mức lọc ngay trên bộ lọc) và "Cảnh báo hàng tồn" (ngưỡng riêng
từng cặp Mã hàng/Siêu thị, upload qua etl-admin). Dùng lại đúng domain
`banhang_sku`/`tonkho_sku` đã có — KHÔNG CẦN VIEW MỚI nếu báo cáo
"bc-ton-kho-0" đã chạy ổn. Áp "Phạm vi dữ liệu" (bản 8.50/8.51) theo siêu
thị cho cả 2. Chi tiết đầy đủ: `deploy/Cập nhật bản 8.68 — Báo cáo tồn
kho theo ngưỡng + Cảnh báo hàng tồn.md`.

**Các bước triển khai:**
1. `git pull origin main`.
2. (Nếu CHƯA làm báo cáo "bc-ton-kho-0") DBA tạo 2 VIEW + chạy
   `node scripts/seedZeroStockSkuSync.js` — xem file chi tiết ở trên.
3. Chạy lại `etl-db/schema.sql` (BẮT BUỘC — bảng mới
   `etl.StockAlertThresholds`).
4. `pm2 restart hcrc-etl` và `pm2 restart hcrc-rp-server` (BẮT BUỘC).
5. `cd etl-admin && npm run build`, `cd rp-user && npm run build`, copy
   `dist/` mới cả 2.
6. `cd rp-server && node scripts/seedStockThresholdReport.js && node
   scripts/seedStockAlertReport.js`.
7. Gán quyền menu "Cảnh báo hàng tồn" (etl-admin) + quyền xem 2 báo cáo
   mới (rp-user → Phân quyền).
8. etl-admin → "Cảnh báo hàng tồn" → upload danh sách ngưỡng (nếu dùng).

## 8.67 — Sửa THIẾU SÓT: SMTP (Postfix/Exchange/Gmail) chưa hỗ trợ chứng chỉ TLS tự ký

**Thay đổi**: nhánh SMTP (Postfix/Exchange qua SMTP/Gmail) thiếu cờ bỏ
qua kiểm tra chứng chỉ TLS tương đương EWS — chứng chỉ TỰ KÝ (phổ biến ở
Postfix nội bộ) bị từ chối thẳng, gửi thất bại dù host/port/mật khẩu
đúng. `app.EmailSettings` thêm cột `SmtpInsecureTls`; `rp-server/lib/
mailer.js` + `etl/lib/mailer.js` (biến `.env` mới `SMTP_INSECURE_TLS`)
truyền `tls.rejectUnauthorized` theo cờ này. Đã kiểm chứng bằng test thật
(máy chủ SMTPS giả, chứng chỉ tự ký) — lỗi "self-signed certificate"
trước khi sửa, gửi được sau khi sửa.

**Các bước triển khai:**
1. `git pull origin main`.
2. Chạy lại `rp-db/schema.sql` (BẮT BUỘC — thêm cột `SmtpInsecureTls` vào
   `app.EmailSettings`, an toàn chạy lại nhiều lần, mặc định `0`, không
   đổi cấu hình đang chạy).
3. `pm2 restart hcrc-rp-server` và `pm2 restart hcrc-etl` (BẮT BUỘC — đổi
   `lib/mailer.js` của cả 2).
4. `cd rp-user && npm run build`, copy `dist/` mới (checkbox mới ở "Thiết
   lập email").
5. Nếu Postfix/SMTP dùng chứng chỉ TỰ KÝ: rp-user → "Thiết lập email" →
   tick "Bỏ qua kiểm tra chứng chỉ TLS" → Lưu → "Gửi thử" xác nhận gửi
   được; ETL (nếu alert email cũng qua Postfix này): thêm
   `SMTP_INSECURE_TLS=true` vào `etl/.env` → `pm2 restart hcrc-etl`.

Không ảnh hưởng gateway dùng chứng chỉ CA công khai hợp lệ (mặc định vẫn
kiểm tra chứng chỉ như trước).

## 8.66 — Thêm preset Gmail, giữ đủ 4 phương thức SMTP/EWS trong "Thiết lập email"

**Thay đổi**: thêm preset "Gmail — đăng nhập qua SMTP (cổng 587)" vào
dropdown "Loại email gateway" (`smtp.gmail.com`, port 587, kèm hướng dẫn
bật "Xác minh 2 bước" + tạo "Mật khẩu ứng dụng"). Thuần frontend, không
đổi backend/CSDL.

**Các bước triển khai:**
1. `git pull origin main`.
2. `cd rp-user && npm run build`, copy `dist/` mới.
3. Không cần restart backend, không cần chạy lại CSDL.
4. Kiểm tra: "Thiết lập email" → dropdown có đủ 5 lựa chọn, chọn "Gmail"
   tự điền `smtp.gmail.com`/587.

## 8.65 — Gửi email qua Exchange bằng EWS (API riêng, không qua SMTP)

**Thay đổi**: thêm `rp-server/lib/ewsMailer.js` — gửi email qua Exchange
Web Services (EWS, HTTPS riêng của Exchange, Basic Auth username/password)
cho Exchange CÀI TẠI CHỖ (KHÔNG dùng được cho Exchange Online/Office 365).
`app.EmailSettings` thêm cột `Protocol`/`EwsUrl`/`EwsInsecureTls`;
`lib/mailer.js` rẽ nhánh theo `Protocol`, mọi nơi gọi `sendMail()` tự hoạt
động với cả 2 giao thức. "Thiết lập email" có thêm lựa chọn "Exchange tại
chỗ — API EWS" trong dropdown gateway.

**Các bước triển khai:**
1. `git pull origin main`.
2. Chạy lại `rp-db/schema.sql` (BẮT BUỘC — thêm cột `Protocol`/`EwsUrl`/
   `EwsInsecureTls` vào `app.EmailSettings`, an toàn chạy lại nhiều lần,
   cấu hình SMTP đang có tự chuyển `Protocol='smtp'`, không đổi gì).
3. `pm2 restart hcrc-rp-server` (BẮT BUỘC — đổi `lib/mailer.js`, file mới
   `lib/ewsMailer.js`, route `routes/emailSettings.js`).
4. `cd rp-user && npm run build`, copy `dist/` mới (dropdown "Thiết lập
   email" có thêm lựa chọn EWS).
5. Nếu dùng Exchange qua EWS: rp-user → "Thiết lập email" → chọn "Exchange
   tại chỗ — API EWS" → điền EWS URL đầy đủ (hỏi IT quản trị Exchange nếu
   không rõ, thường dạng `https://<máy chủ>/EWS/Exchange.asmx`) + Username/
   Password đăng nhập mailbox + "Địa chỉ gửi (From)" → tick "Bỏ qua kiểm
   tra chứng chỉ TLS" NẾU máy chủ dùng chứng chỉ tự ký → Lưu → "Gửi thử"
   xác nhận gửi được.

Không đổi CSDL/cấu hình khác đang chạy ổn (mặc định vẫn `Protocol='smtp'`
cho tới khi admin tự đổi).

---

## 8.64 — Gợi ý cấu hình theo loại email gateway (Postfix/Exchange) + tương thích Exchange

**Thay đổi**: thêm dropdown "Loại email gateway" ở "Thiết lập email"
(rp-user) — chọn Postfix/Exchange Online/Exchange tại chỗ tự điền sẵn
host/port/Secure, vẫn sửa tay được. `rp-server/lib/mailer.js` và
`etl/lib/mailer.js` thêm `requireTLS` khi dùng cổng không mã hoá ngay từ
đầu (587/25) + có xác thực username/mật khẩu — bắt buộc STARTTLS trước
khi gửi thông tin đăng nhập.

**Các bước triển khai:**
1. `git pull origin main`.
2. `pm2 restart hcrc-etl` và `pm2 restart hcrc-rp-server` (BẮT BUỘC — đổi
   `lib/mailer.js` của cả 2).
3. `cd rp-user && npm run build`, copy `dist/` mới (dropdown mới ở "Thiết
   lập email").
4. Kiểm tra: rp-user → "Thiết lập email" → chọn "Exchange Online / Office
   365" → tự điền `smtp.office365.com`/587/bỏ Secure → điền Username =
   email đăng nhập đầy đủ + mật khẩu (mật khẩu ứng dụng nếu tài khoản bật
   MFA) → "Gửi thử" nhận được email.

Không đổi CSDL, không ảnh hưởng cấu hình Postfix/SMTP khác đang chạy ổn.

---

## 8.63 — Sửa gửi email tương thích cổng 465 (Postfix)

**Thay đổi**: cổng 465 (SMTPS, vd Postfix của người dùng) bắt buộc TLS
ngay từ đầu kết nối — thiếu `secure:true` đúng cho cổng này là lý do email
gửi thất bại dù host/port/mật khẩu đúng. `etl/lib/mailer.js` tự nhận
`secure=true` theo cổng 465 khi `.env` chưa khai `SMTP_SECURE` rõ ràng;
`rp-server/lib/mailer.js` ép `secure=true` khi `SmtpPort=465` bất kể
checkbox đã lưu. `api-server` không có tính năng gửi email nên không áp
dụng (theo đúng yêu cầu người dùng).

**Các bước triển khai:**
1. `git pull origin main`.
2. `pm2 restart hcrc-etl` và `pm2 restart hcrc-rp-server` (BẮT BUỘC — đổi
   `lib/mailer.js` của cả 2).
3. `cd rp-user && npm run build`, copy `dist/` mới (đổi
   `EmailSettingsPage.jsx` — chỉ thêm gợi ý tick "Secure", không bắt buộc
   phải build ngay để backend hoạt động đúng).
4. Nếu dùng cổng 465: etl → sửa `.env` thành `SMTP_PORT=465` (xoá hoặc để
   nguyên `SMTP_SECURE`, không bắt buộc đổi — hệ thống tự nhận đúng theo
   cổng); rp-user → "Thiết lập email" → đổi "SMTP port" thành `465` → Lưu
   → "Gửi thử" để xác nhận gửi được qua Postfix.
5. Kiểm tra: etl — tạm làm 1 job lỗi kết nối để xem email cảnh báo có tới
   không (hoặc đợi lần lỗi thật); rp-user — "Thiết lập email" → "Gửi thử"
   nhận được email tại hộp thư đã nhập.

Không đổi CSDL, không ảnh hưởng cấu hình SMTP cổng 587/25 đang chạy ổn.

---

## 8.62 — Chọn nhiều dòng + xoá hàng loạt (toàn hệ thống)

**Thay đổi**: thêm checkbox chọn nhiều dòng + nút "Xoá N mục đã chọn" cho
21 trang danh sách dạng bảng ở cả 3 giao diện (etl-admin, api-admin,
rp-user) — chỉ sửa frontend (React), KHÔNG đổi API/CSDL, KHÔNG có migration
hay script cần chạy tay. Quy tắc mới đã ghi vào `CLAUDE.md` cho mọi bảng
làm thêm sau này.

**Các bước triển khai:**
1. `git pull origin main`.
2. Build lại và deploy cả 3 giao diện như quy trình thường dùng (`npm run
   build` ở từng app, copy `dist/` lên server tĩnh) — không có bước gì
   khác ngoài build/deploy thông thường.
3. Kiểm tra nhanh: mở 1 trang bất kỳ trong 21 trang (vd etl-admin → Đồng
   bộ), tick vài checkbox ở cột đầu bảng, thấy nút "Xoá N mục đã chọn"
   hiện ra dưới bảng, bấm thử xoá 1 dòng rác để xác nhận hoạt động đúng.

## 8.61 — Điền đủ 34 siêu thị thật vào script tạo Nguồn dữ liệu + Sync Job (Thành viên)

**Thay đổi**: theo yêu cầu người dùng — điền đủ 34 siêu thị thật (tên +
Server/IP, từ file Excel người dùng gửi) vào `etl/scripts/seedThanhVienLiveSync.js`,
dùng chung 1 port cố định 1433 cho mọi siêu thị (theo yêu cầu riêng, khác
port từng dòng trong file Excel gốc). **File này CHỨA MẬT KHẨU CSDL THẬT
— người dùng đã được cảnh báo và xác nhận rõ ràng muốn commit nguyên văn
vào Git** (khác quy ước thông thường không lưu file có mật khẩu thật).
Khuyến nghị đổi lại mật khẩu thật sau khi triển khai xong.

**Các bước triển khai:**
1. `git pull origin main`.
2. **Bắt buộc làm trước** (nếu chưa làm): chạy file
   `deploy/Thiết lập VIEW + tài khoản etl_reader tại mỗi siêu thị Thành
   viên.sql` tại CẢ 34 máy chủ SQL Server của từng siêu thị.
3. `cd etl && node scripts/seedThanhVienLiveSync.js` — tạo/cập nhật 34
   Nguồn dữ liệu + 68 Sync Job Live (an toàn chạy lại nhiều lần).
4. Nếu chưa chạy lần nào: `cd rp-server && node scripts/seedLdtdHcrcReports.js`
   và `node scripts/seedThanhVienReportPermissions.js`.
5. Kiểm tra: etl-admin → Nguồn dữ liệu (đủ 34 dòng) → Đồng bộ (đủ 68 job
   Live, "Bật") → Log (job đã chạy thành công sau vài phút).
6. **Đổi lại mật khẩu CSDL thật ở cả 34 máy chủ** sau khi hoàn tất (mật
   khẩu hiện đã nằm trong lịch sử Git).

---

## 8.60 — Khoá nút + đổi màu lúc đang gửi dữ liệu lên server (toàn hệ thống)

**Thay đổi**: theo yêu cầu người dùng — mọi nút bấm gửi dữ liệu lên server
ở cả 3 giao diện (rp-user/etl-admin/api-admin) giờ tự khoá + đổi màu xám
rõ rệt trong lúc đang xử lý, tránh bấm lại nhiều lần gây gửi trùng yêu
cầu. Thuần sửa frontend, không đổi backend. Quy tắc này ghi vào
`CLAUDE.md` — bắt buộc áp dụng cho mọi nút làm thêm sau này.

**Các bước triển khai:**
1. `git pull origin main`.
2. `cd etl-admin && npm run build`, copy `dist/` mới.
3. `cd api-admin && npm run build`, copy `dist/` mới.
4. `cd rp-user && npm run build`, copy `dist/` mới.
5. Không cần restart backend nào (`hcrc-etl`/`hcrc-api-server`/`hcrc-rp-server`
   không đổi).
6. Kiểm tra: vào etl-admin → Đồng bộ, bấm "Chạy thử" 1 job → nút chuyển
   xám + hiện "Đang chạy..." ngay, không bấm lại được tới khi xong.

---

## 8.59 — Tự thử lại khi mất kết nối nguồn lúc đồng bộ

**Thay đổi**: theo yêu cầu người dùng sau sự cố thật (vài chi nhánh mất
mạng, job Live báo lỗi liên tục) — job đồng bộ chạy nền giờ tự thử lại
(backoff 15s→30s→60s→120s, tối đa 10 phút) khi lỗi KẾT NỐI tới nguồn,
trước khi thật sự ghi nhận thất bại. Nút "Chạy thử" tương tác không đổi
(vẫn báo lỗi ngay).

**Các bước triển khai:**
1. `git pull origin main`.
2. `pm2 restart hcrc-etl` (BẮT BUỘC — đổi `jobs/runSync.js`, `jobs/scheduler.js`,
   `routes/admin/syncJobs.js`).
3. Không cần build lại giao diện nào (không đổi etl-admin).
4. Kiểm tra: theo dõi etl-admin → Log — khi 1 job đang lỗi kết nối, thấy
   dòng "Lỗi kết nối nguồn (lần N): ... — thử lại sau Xs..." thay vì chỉ 1
   dòng lỗi rồi im lặng tới chu kỳ sau; nếu nguồn phục hồi trong 10 phút sẽ
   thấy job chạy thành công mà không cần đợi hết chu kỳ cron.

Không đổi cấu trúc CSDL, không ảnh hưởng job đang chạy ổn định.

---

## 8.58 — Đổi màu 4 báo cáo doanh thu cuối ngày LDTD/HCRC theo mẫu BRGMART

**Thay đổi**: theo yêu cầu người dùng (demo ảnh đã gửi, đã xác nhận "màu
đẹp rồi") — đổi màu nhóm cột (web+Excel+PDF) của 4 báo cáo "Doanh thu cuối
ngày LDTD/HCRC" (gốc + Thành viên) đúng theo file mẫu BRGMART người dùng
gửi, thêm xen kẽ màu dòng + viền nhạt hơn cho "mỏng, chuyên nghiệp hơn".

**Các bước triển khai:**
1. `git pull origin main`.
2. `cd rp-server && node scripts/seedLdtdHcrcReports.js` (BẮT BUỘC — ghi
   đè `DefinitionJson` đã lưu trong CSDL, code mới không tự áp dụng nếu
   không chạy lại; dùng đúng `menuCode` đã seed lần đầu nếu khác mặc định
   `reports-kinh-doanh`: `node scripts/seedLdtdHcrcReports.js <menuCode>`).
3. `pm2 restart hcrc-rp-server` (BẮT BUỘC — đổi `lib/exportExcel.js`/
   `lib/exportPdf.js`/`lib/reportCellFormat.js`/`lib/reportRunner.js`/
   `lib/compositeReportRunner.js`).
4. `cd rp-user && npm run build`, copy `dist/` mới (đổi
   `components/DataTable.jsx`/`lib/reportGroupColors.js`).
5. Kiểm tra: mở 1 trong 4 báo cáo "Doanh thu cuối ngày ..." → màu nhóm cột
   mới (xanh lá/cam/vàng/tím), dòng "Tổng cộng" tô theo từng nhóm, xen kẽ
   màu dòng nhẹ; xuất Excel/PDF cũng đúng màu mới.

Không đổi CSDL, không ảnh hưởng báo cáo khác (chỉ 4 báo cáo khai
`columnGroups` mới bị ảnh hưởng).

---

## 8.57 — Trạng thái kết nối + Giám sát cấu trúc CSDL

**Thay đổi**: theo yêu cầu người dùng (demo đã gửi, đã xác nhận) — thêm
trang "Trạng thái kết nối" (`etl-admin` + `api-admin`, job nền kiểm tra
mỗi 15 phút) và trang "Giám sát cấu trúc CSDL" (chỉ `etl-admin`, job nền
chạy 6h sáng, phát hiện cả đổi kiểu dữ liệu cột, gửi email cảnh báo).

**Các bước triển khai:**
1. `git pull origin main`.
2. Chạy lại `etl-db/schema.sql` (bảng mới `etl.DataSourceConnectionStatus`,
   `etl.SchemaSnapshots`, `etl.SchemaChangeLog`) VÀ `api-db/schema.sql`
   (bảng mới `api.DataSourceConnectionStatus`).
3. `pm2 restart hcrc-etl` và `pm2 restart hcrc-api-server` (BẮT BUỘC —
   route API mới + 2 job `cron.schedule` mới trong `server.js`).
4. Build lại 2 giao diện: `cd etl-admin && npm run build`, copy `dist/`
   mới; `cd api-admin && npm run build`, copy `dist/` mới.
5. Vào trang "Vai trò" (mỗi giao diện) → cấp quyền xem menu mới
   ("Trạng thái kết nối" ở cả 2; "Giám sát cấu trúc CSDL" chỉ ở
   `etl-admin`) cho vai trò cần dùng — **KHÔNG tự động cấp**, phải cấp
   tay sau khi triển khai.
6. Kiểm tra `.env` (etl, api-server) có đủ `SMTP_HOST`/`ALERT_EMAIL_TO`
   (dùng chung cấu hình mailer đã có) để job "Giám sát cấu trúc CSDL" gửi
   được email cảnh báo — nếu chưa cấu hình, job vẫn chạy/ghi lịch sử bình
   thường, chỉ không gửi được email (giống job đồng bộ ETL hiện tại).
7. Kiểm tra: mở trang "Trạng thái kết nối" → thấy danh sách nguồn dữ liệu
   + trạng thái (bấm "Kiểm tra lại ngay" để test ngay không cần đợi job
   nền); mở trang "Giám sát cấu trúc CSDL" (`etl-admin`) → thấy "Chưa
   kiểm tra lần nào" cho tới 6h sáng hôm sau (hoặc đổi tạm
   `SCHEMA_MONITOR_CRON` trong `.env` để test sớm hơn).

Không đổi cấu trúc bảng/CSDL nguồn dữ liệu hiện có, không ảnh hưởng job
đồng bộ đang chạy.

---

## 8.56 — Thêm cột "Trung bình giao dịch" vào 8 báo cáo Top 5 chi nhánh

**Thay đổi**: theo yêu cầu người dùng, thêm cột "Trung bình giao dịch"
(Doanh thu / Số giao dịch) vào cả 8 báo cáo "Top 5 chi nhánh" — cùng
công thức đã dùng ở báo cáo LDTD/HCRC, tự hiện rỗng khi chia cho 0 (đã
test bằng `formulaEngine.js` thật).

**Các bước triển khai:**
1. `git pull origin main`
2. `cd rp-server && node scripts/seedTop5ChiNhanhReports.js` (BẮT BUỘC —
   ghi đè DefinitionJson trong CSDL).
3. `pm2 restart hcrc-rp-server`.
4. Kiểm tra: báo cáo/Dashboard "Top 5 chi nhánh" hiện thêm cột "Trung
   bình giao dịch".

Không đổi CSDL/biểu đồ.

---

## 8.55 — Script tạo tự động 2 job đồng bộ cho 3 báo cáo "hết hàng"

**Thay đổi**: theo yêu cầu người dùng — DBA đã tạo xong 2 VIEW
`vw_BanHangTheoSKU`/`vw_TonKhoTheoSKU` (đúng `bc-ton-kho-0.md`), nay thêm
`etl/scripts/seedZeroStockSkuSync.js` để tạo 2 job đồng bộ bắt buộc bằng
1 lệnh thay vì bấm tay qua etl-admin — dùng chung cho cả 3 báo cáo "hết
hàng" (Top bán chạy tồn kho=0, Core=0 Mart/Minimart). Phần còn lại (đăng
ký báo cáo, upload danh sách Core, gán quyền) vẫn làm theo đúng 2 file
hướng dẫn đã có từ trước, không đổi.

**Các bước triển khai:**
1. `git pull origin main`
2. Khai `DSMART16_SERVER`/`DSMART16_USER`/`DSMART16_PASSWORD` vào `.env`
   của `etl`.
3. `cd etl && node scripts/seedZeroStockSkuSync.js`.
4. Theo dõi etl-admin → Log tới khi 2 job chạy thành công.
5. `cd rp-server && node scripts/seedTopZeroStockReport.js && node scripts/seedCoreZeroStockReports.js`.
6. Upload danh sách hàng Core, gán quyền xem 3 báo cáo — xem chi tiết ở
   `bc-ton-kho-0.md`/`bc-core-ton-kho-0.md`.

Không đổi CSDL `rp`/`rp-server`/`rp-user`.

---

## 8.54 — Rà soát bản 8.31→8.53 + vá 1 lỗ hổng lý thuyết

**Thay đổi**: theo yêu cầu rà soát lại của người dùng sau bản 8.53 — phát
hiện `entityIsMaDiem` (kiểm tra "báo cáo composite có an toàn để lọc theo
siêu thị không", bản 8.51) dùng `.every()` trên mảng có thể RỖNG (báo cáo
composite không có khối dữ liệu nào, chỉ toàn `isTarget`), vacuous truth
khiến BẬT lọc nhầm. Chưa có báo cáo thật nào rơi vào trường hợp này — vá
phòng ngừa, giữ đúng nguyên tắc "không chắc chắn thì KHÔNG lọc".

**Các bước triển khai:**
1. `git pull origin main`
2. `pm2 restart hcrc-rp-server` (BẮT BUỘC).

Không đổi CSDL/giao diện/hành vi báo cáo đang chạy.

---

## 8.53 — Tiêu đề nhóm cột có màu + tô đậm dòng Tổng cộng trên bảng web báo cáo

**Thay đổi**: bảng báo cáo xem trên web trước đây chỉ vẽ phẳng, không
màu — khác hẳn file Excel/PDF xuất ra (đã có tiêu đề gộp 2 dòng tô màu
theo nhóm cột + tô đậm dòng Tổng cộng từ lâu). Giờ web dùng ĐÚNG dữ liệu
`columnGroups` sẵn có (API `/run` trả thêm, trước đây chưa gửi) để vẽ
khớp hệt Excel/PDF, áp dụng tự động cho mọi báo cáo đã khai nhóm cột, ở
cả trang Báo cáo lẫn Dashboard. Đã demo (mock server + Playwright) trước
khi gộp vào `main`.

**Các bước triển khai:**
1. `git pull origin main`
2. `cd rp-user && npm run build`, copy `dist/` mới.
3. `pm2 restart hcrc-rp-server` (đổi cấu trúc JSON trả về của `/run`).
4. Kiểm tra: báo cáo có `columnGroups` → tiêu đề 2 dòng tô màu, dòng Tổng
   cộng tô tím đậm; trang không liên quan → không đổi gì.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.53 — Tiêu đề nhóm cột có màu trên
bảng web báo cáo.md`.

---

## 8.52 — Rà soát bản 8.31→8.51 + vá 3 lỗi phát hiện được

**Thay đổi**: theo yêu cầu rà soát của người dùng — phát hiện và vá 3 lỗi.
QUAN TRỌNG NHẤT: "Lịch gửi email báo cáo" và "Cảnh báo bất thường" KHÔNG
áp dụng giới hạn "Phạm vi dữ liệu" (bản 8.51) — người bị giới hạn 1 siêu
thị nhưng có menu 2 trang đó vẫn nhận được email ĐỦ mọi siêu thị. Đã vá cả
2 + 1 lỗi "Sửa" tạo dòng rác ở Ánh xạ Phòng ban (bản 8.49) + 1 ghi chú lỗi
thời ở trang Người dùng.

**Các bước triển khai (ƯU TIÊN CAO — vá lỗ rò rỉ dữ liệu):**
1. `git pull origin main`
2. `cd rp-user && npm run build`, copy `dist/` mới.
3. `pm2 restart hcrc-rp-server` (BẮT BUỘC).
4. Kiểm tra: tài khoản bị giới hạn 1 siêu thị + có menu "Lịch gửi email
   báo cáo" → tạo lịch trên báo cáo Top 5/Realtime Thành viên → "Gửi ngay"
   → email CHỈ có đúng siêu thị đã giới hạn.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.52 — Rà soát và vá lỗi
8.31-8.51.md`.

---

## 8.51 — Áp lọc dữ liệu THẬT theo siêu thị (báo cáo composite)

**Thay đổi**: LẦN ĐẦU áp dụng lọc thật — người được gán "Phạm vi dữ liệu"
ở bản 8.50 giờ CHỈ thấy đúng dữ liệu siêu thị đã gán, trong báo cáo Top 5
chi nhánh + Realtime "Thành viên" (báo cáo khác chưa áp dụng được, KHÔNG
phải lỗ hổng — chưa quy entityCode về Mã Điểm chuẩn). Server tự gắn phạm
vi, không tin client. Đã viết test riêng xác nhận đúng trước khi gộp.

**Các bước triển khai (KHÁC các bản trước — chỉ đổi backend, không đổi
CSDL/giao diện):**
1. `git pull origin main`
2. `pm2 restart hcrc-rp-server` (BẮT BUỘC).
3. Kiểm tra: tài khoản đã gán 1 siêu thị (bản 8.50) → Dashboard Top 5/
   Realtime → chỉ thấy đúng siêu thị đó, kể cả lúc xuất Excel/PDF; tài
   khoản "Toàn bộ" không bị ảnh hưởng.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.51 — Áp lọc dữ liệu theo siêu
thị.md`.

---

## 8.50 — Gán phạm vi dữ liệu theo siêu thị cho từng người dùng

**Thay đổi**: trang "Người dùng" có nút "Phạm vi dữ liệu" — gán (các) siêu
thị 1 người CHỈ ĐƯỢC THẤY (trống = "Toàn bộ", mặc định an toàn), có gợi ý
tự động theo Department+WorkLocation. **CHƯA lọc dữ liệu báo cáo thật** —
chỉ lưu lựa chọn, chờ bản sau áp dụng vào tầng chạy báo cáo.

**Các bước triển khai:**
1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (bảng mới `app.UserStoreAccess`).
3. `cd rp-user && npm run build`, copy `dist/` mới.
4. `pm2 restart hcrc-rp-server` (BẮT BUỘC — route API mới).
5. Kiểm tra: "Người dùng" → "Phạm vi dữ liệu" → gợi ý/tick chọn → Lưu →
   cột cập nhật đúng; chưa ảnh hưởng gì tới trang Báo cáo/Dashboard.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.50 — Gán phạm vi dữ liệu theo siêu
thị.md`.

---

## 8.49 — Ánh xạ Phòng ban (vpdt) → Siêu thị

**Thay đổi**: trang mới "Ánh xạ Phòng ban → Siêu thị" — ánh xạ Department
(vpdt) sang MaDiem chuẩn (tái dùng khoá của "Ánh xạ Điểm - STK_ID"), CHỈ
cần khai khi tên không khớp thẳng. Bước 1/nhiều bước hướng tới phân quyền
dữ liệu theo đúng siêu thị — CHƯA áp dụng giới hạn xem dữ liệu nào ở bản
này.

**Các bước triển khai:**
1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (bảng mới `app.DepartmentStoreMapping` +
   menu mới).
3. `cd rp-user && npm run build`, copy `dist/` mới.
4. `pm2 restart hcrc-rp-server` (BẮT BUỘC — route API mới).
5. Cấp quyền menu "Ánh xạ Phòng ban → Siêu thị" cho vai trò cần dùng.
6. Kiểm tra: tải file mẫu → nhập 1 dòng thật → hiện đúng danh sách.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.49 — Ánh xạ Phòng ban sang Siêu
thị.md`.

---

## 8.48 — Phân quyền báo cáo/Dashboard riêng theo từng người dùng

**Thay đổi**: trang "Người dùng" có thêm nút "Gán quyền riêng" — cấp thêm
báo cáo/nhóm Dashboard cho ĐÚNG 1 người, CỘNG DỒN vào quyền theo vai trò
(không thay thế). Dùng cho trường hợp cấp lẻ, không đáng tạo hẳn 1 vai trò
riêng; cấp cho cả 1 nhóm người vẫn nên tạo Vai trò như trước giờ.

**Các bước triển khai:**
1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (bảng mới `app.UserReportAccess`/
   `app.UserDashboardGroupAccess`).
3. `cd rp-user && npm run build`, copy `dist/` mới.
4. `pm2 restart hcrc-rp-server` (BẮT BUỘC — route API mới).
5. Kiểm tra: "Người dùng" → "Gán quyền riêng" → tick thêm 1 báo cáo cho 1
   người không có qua vai trò nào → người đó thấy thêm đúng báo cáo đó.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.48 — Phân quyền theo từng người
dùng.md`.

---

## 8.47 — Mật khẩu dự phòng cục bộ khi HCRC Workspace lỗi

**Thay đổi**: tài khoản xác thực qua HCRC Workspace giờ tự cache mật khẩu
(băm bcrypt) mỗi lần đăng nhập ONLINE thành công — dùng làm dự phòng khi
dịch vụ đó báo lỗi (mạng/timeout/5xx), trong hạn `FallbackMaxAgeDays`
(mặc định 14 ngày). Trang "Người dùng" có cột "Mật khẩu dự phòng" + nút
xoá tay.

**Các bước triển khai (KHÁC các bản trước — đổi logic đăng nhập):**
1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (cột mới `CachedPasswordHash`/
   `CachedPasswordHashAt` ở `app.Users`, `FallbackMaxAgeDays` ở
   `app.HcrcWorkspaceSettings`).
3. `cd rp-user && npm run build`, copy `dist/` mới.
4. `pm2 restart hcrc-rp-server` (BẮT BUỘC — đổi `lib/auth.js`).
5. Kiểm tra: đăng nhập 1 tài khoản HCRC Workspace bình thường → tắt thử
   "Bật xác thực HCRC Workspace" → đăng nhập lại ĐÚNG mật khẩu cũ vẫn vào
   được (Audit Log ghi "dùng mật khẩu dự phòng"); bật lại cấu hình sau khi
   kiểm tra.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.47 — Mật khẩu dự phòng HCRC
Workspace.md`.

---

## 8.46 — Sửa nút "Lên"/"Xuống" trắng trơn trong khung Tuỳ chỉnh Dashboard

**Thay đổi**: phát hiện lúc demo bản 8.45 bằng ảnh chụp trình duyệt thật —
2 nút đổi thứ tự Ô trong khung "Tuỳ chỉnh" hiện trắng trơn không thấy chữ
(chữ trắng trên nền trắng, do CSS quên đổi màu chữ). Đã sửa + đổi ký hiệu
▲▼ thành chữ "Lên"/"Xuống" rõ nghĩa hơn.

**Các bước triển khai:**
1. `git pull origin main`
2. `cd rp-user && npm run build`, copy `dist/` mới.
3. Kiểm tra: Dashboard → "⚙️ Tuỳ chỉnh" → thấy rõ chữ "Lên"/"Xuống" ở mỗi Ô.

Không đổi CSDL, không đổi backend. Chi tiết đầy đủ: `deploy/Cập nhật bản
8.46 — Sửa nút Lên Xuống trắng trong khung Tuỳ chỉnh.md`.

---

## 8.45 — Cá nhân hoá báo cáo Dashboard

**Thay đổi**: trang Dashboard có nút "⚙️ Tuỳ chỉnh" — mỗi người tự ẩn/hiện
Ô, sắp xếp lại thứ tự Ô, nhớ nhóm/tab đã xem lần trước, đặt số ngày mặc
định khi mở lại (Hôm nay/7 ngày/30 ngày gần nhất). Lưu trên server theo
tài khoản (bảng mới `app.UserDashboardPreferences`), không ảnh hưởng
người khác, không đổi quyền xem (`app.RoleDashboardGroupAccess`).

**Các bước triển khai (KHÁC các bản trước — có bảng CSDL mới + route API
mới):**
1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (thêm bảng `app.UserDashboardPreferences`,
   an toàn chạy lại nhiều lần).
3. `cd rp-user && npm run build`, copy `dist/` mới.
4. `pm2 restart hcrc-rp-server` (BẮT BUỘC — có route API mới `GET`/`PUT
   /dashboards/:id/preferences`).
5. Kiểm tra: bấm "⚙️ Tuỳ chỉnh" → ẩn 1 Ô, đổi thứ tự, đổi số ngày mặc
   định → tải lại trang (hoặc đăng nhập máy khác) vẫn giữ đúng; "Khôi
   phục mặc định" → về lại như trước bản 8.45.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.45 — Cá nhân hoá Dashboard.md`.

---

## 8.44 — Bộ lọc/nhóm theo siêu thị trong danh sách Đồng bộ

**Thay đổi**: trang "Đồng bộ" (ETL) thêm ô tìm kiếm (theo tên job/tên
siêu thị) + tuỳ chọn "Nhóm theo siêu thị" (gộp job cùng nguồn dữ liệu
vào 1 khối thu/mở được). Trả lời câu hỏi "gộp hết VIEW vào 1 job có được
không" — **KHÔNG làm theo hướng gộp** (mất lịch chạy/mốc đồng bộ/log lỗi
riêng từng loại dữ liệu), giữ nguyên 1 job/1 loại dữ liệu, chỉ gọn cách
XEM.

**Các bước triển khai:**
1. `git pull origin main`
2. `cd etl-admin && npm run build`, copy `dist/` mới.
3. Không cần restart backend, không cần chạy lại CSDL.
4. Kiểm tra: trang Đồng bộ hiện ô tìm kiếm + nhóm theo siêu thị; gõ tên
   siêu thị → đúng khối đó tự mở; tắt "Nhóm theo siêu thị" → bảng phẳng
   có thêm cột "Nguồn dữ liệu".

Không đổi CSDL, không đổi backend. Chi tiết đầy đủ: `deploy/Cập nhật bản
8.44 — Bộ lọc nhóm theo siêu thị Sync Jobs.md`.

---

## 8.43 — Phân quyền Dashboard theo nhóm

**Thay đổi**: tách 2 quyền riêng cho mỗi nhóm Dashboard — "Xem dashboard"
và "Xem chi tiết" (xuất Excel/PDF). **CẢNH BÁO**: sau khi deploy, MỌI vai
trò (trừ Admin hệ thống) mất quyền xem 2 nhóm hiện có cho tới khi được cấp
lại thủ công (mặc định từ chối, giống RoleReportAccess).

**Các bước triển khai:**
1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (thêm bảng `app.RoleDashboardGroupAccess`).
3. `cd rp-user && npm run build`, copy `dist/` mới.
4. `pm2 restart hcrc-rp-server`.
5. **BẮT BUỘC**: "Hệ thống → Phân quyền" → cấp lại quyền nhóm Dashboard
   cho TỪNG vai trò đang dùng Dashboard (trước đây không cần làm gì, giờ
   phải tick lại).
6. Kiểm tra: vai trò chưa cấp quyền → không thấy nhóm; cấp "Xem dashboard"
   không cấp "Xem chi tiết" → thấy nhưng không xuất được; cấp đủ 2 → xuất
   được.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.43 — Phân quyền Dashboard theo
nhóm.md`.

---

## 8.42 — Nhóm Dashboard

**Thay đổi**: trang Dashboard có thêm bộ chọn nhóm (🏆 Top 5 chi nhánh /
⚡ Realtime) ở đầu trang — chọn nhóm mới hiện Ô bên dưới.

**Các bước triển khai:**
1. `git pull origin main`
2. `cd rp-server && node scripts/seedTop5ChiNhanhReports.js` (BẮT BUỘC —
   ghi đè DefinitionJson, giống bản 8.34).
3. `cd rp-user && npm run build`, copy `dist/` mới.
4. `pm2 restart hcrc-rp-server`.
5. Kiểm tra: Dashboard hiện 2 thẻ nhóm, chọn đúng nhóm hiện đúng Ô/tab
   tương ứng, xuất Excel/PDF vẫn hoạt động.

Không đổi CSDL. Chi tiết đầy đủ: `deploy/Cập nhật bản 8.42 — Nhóm
Dashboard.md`.

---

## 8.41 — WebAuthn vân tay/Face ID — rp-user, thay bước 2FA

**Thay đổi**: đăng ký vân tay/Face ID ở "Tài khoản của tôi" (Admin hệ
thống) → lúc đăng nhập có thêm nút "Dùng vân tay/Face ID" thay HẲN bước
nhập mã 2FA. Chỉ áp dụng `rp-user` đợt này.

**Các bước triển khai (KHÁC các bản trước — có bảng CSDL mới + BẮT BUỘC
khai domain thật):**
1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (thêm bảng `app.UserWebAuthnCredentials`,
   an toàn chạy lại nhiều lần).
3. **Thêm vào `rp-server/.env`**: `WEBAUTHN_RP_ID=<domain thật, không có
   https://>` và `WEBAUTHN_RP_ORIGIN=https://<domain thật>` — THIẾU bước
   này tính năng tự tắt (không crash, nhưng không dùng được).
4. `cd rp-server && npm install` (gói mới `@simplewebauthn/server`).
5. `cd rp-user && npm run build`, copy `dist/` mới (gói mới
   `@simplewebauthn/browser`).
6. `pm2 restart hcrc-rp-server`.
7. Kiểm tra bằng THIẾT BỊ THẬT (điện thoại/laptop có vân tay/Face ID,
   không mô phỏng được) — đăng ký 1 thiết bị, đăng xuất/đăng nhập lại,
   xác nhận bấm "Dùng vân tay/Face ID" vào thẳng hệ thống không cần gõ mã.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.41 — WebAuthn vân tay Face ID.md`.

---

## 8.40 — Tự đặt lại mã 2FA (đổi thiết bị) — rp-user

**Thay đổi**: trang "Tài khoản của tôi" (rp-user) có thêm nút "Đặt lại mã
2FA" cho tài khoản Admin hệ thống — tự quét QR mới trên thiết bị khác,
không cần nhờ admin khác. Backend đã có sẵn từ trước, chỉ thêm giao diện.

**Các bước triển khai:**
1. `git pull origin main`
2. `cd rp-user && npm run build`, copy `dist/` mới.
3. Kiểm tra: "Tài khoản của tôi" (tài khoản Admin hệ thống) có mục "Bảo
   mật — Xác thực hai yếu tố"; đặt lại thử 1 lần, 2FA cũ ngừng dùng được.

Không đổi CSDL, không đổi backend. Chi tiết đầy đủ: `deploy/Cập nhật bản
8.40 — Tự đặt lại 2FA Report.md`.

---

## 8.39 — Captcha đăng nhập (4 chữ số, cả 3 app)

**Thay đổi**: thêm ô "Mã xác nhận" (captcha 4 chữ số, tự sinh trên server
bằng `svg-captcha`, không cần Internet lúc chạy) vào form đăng nhập
ETL/API/Report, kiểm tra TRƯỚC khi tra mật khẩu.

**Các bước triển khai (KHÁC các bản trước — có gói npm MỚI):**
1. `git pull origin main`
2. Cài gói mới cho CẢ 3 backend: `cd rp-server && npm install`, tương tự
   `etl`, `api-server`.
3. Build lại CẢ 3 giao diện (`npm run build` ở `rp-user`/`etl-admin`/
   `api-admin`), copy `dist/` mới.
4. Restart CẢ 3 backend: `pm2 restart hcrc-rp-server`, `hcrc-etl`,
   `hcrc-api-server`.
5. Kiểm tra: ô "Mã xác nhận" hiện ở cả 3 màn hình đăng nhập; nhập sai →
   báo lỗi + tự đổi ảnh mới; nhập đúng → đăng nhập bình thường.

Không đổi CSDL. Chi tiết đầy đủ: `deploy/Cập nhật bản 8.39 — Captcha đăng
nhập.md`.

---

## 8.37-8.38 — Báo cáo tràn màn hình + giao diện đăng nhập mới

**Thay đổi**: bảng báo cáo (rp-user) dùng hết chiều rộng màn hình desktop
(bỏ khung hẹp 1040px cho riêng 2 trang Báo cáo); màn hình Đăng nhập cả 3
app (ETL/API/Report) bớt chữ, thêm hình minh hoạ riêng từng app.

**Các bước triển khai:**
1. `git pull origin main`
2. Build lại CẢ 3 giao diện: `cd rp-user && npm run build`, tương tự
   `etl-admin`, `api-admin`.
3. Copy `dist/` mới của từng app vào đúng chỗ Nginx/`serve-static.js`
   đang trỏ tới.
4. Kiểm tra: trang Báo cáo hiện đủ cột không cần kéo ngang; màn hình Đăng
   nhập 3 app hiện hình minh hoạ thay vì đoạn văn dài.

Không đổi CSDL, không đổi backend. Chi tiết đầy đủ: `deploy/Cập nhật bản
8.37-8.38 — Báo cáo tràn màn hình + giao diện đăng nhập mới.md`.

---

## 8.35 — Sửa nguyên nhân THẬT của "Failed to fetch"/"Không kết nối được backend"

**Vấn đề**: Nhập hàng loạt Sync Job (68 dòng/34 siêu thị Thành viên) báo
lỗi mạng giữa chừng — bản 8.33 (tăng timeout Nginx) chưa đủ vì
`etl/server.js` tự đặt `server.timeout = 120s` cho MỌI route ở tầng Node,
đóng socket trước khi tới được Nginx/serve-static.js.

**Các bước triển khai:**
1. `git pull origin main`
2. `pm2 restart hcrc-etl`
3. Kiểm tra: Nhập hàng loạt file nhiều dòng phải chạy hết (có thể mất vài
   phút), không còn "Failed to fetch"/"Không kết nối được backend".

Không đổi CSDL, không đổi Nginx lần này. Chi tiết đầy đủ: `deploy/Cập nhật
bản 8.35 — Sửa gốc Failed to fetch backend timeout.md`.

---

## 8.34 — Dashboard Top 5 đọc Doanh thu/Giao dịch từ domain "Thành viên"

**Thay đổi**: 8 báo cáo "Top 5 chi nhánh" (MART/MINIMART x Doanh thu/Giao
dịch x Cao/Thấp) đổi từ domain gốc (phủ toàn hệ thống, đồng bộ 15 phút)
sang domain "Thành viên" (Live 2 phút, hiện có 34 site) — **đánh đổi đã
xác nhận với người dùng**: Top 5 tạm thời CHỈ còn 34 site đó cho tới khi
khai Live hết toàn bộ siêu thị còn lại.

**Các bước triển khai:**
1. `git pull origin main`
2. `cd rp-server && node scripts/seedTop5ChiNhanhReports.js` (BẮT BUỘC —
   không tự áp dụng qua merge code, dùng đúng `menuCode` đã seed lần đầu
   nếu khác mặc định `reports-kinh-doanh`)
3. `pm2 restart rp-server`
4. Kiểm tra: Dashboard "Top 5 chi nhánh" (cả 16 Ô) chỉ còn hiện 34 siêu
   thị Thành viên; số liệu khớp với Ô "Realtime" cùng ngày/siêu thị.

Không đổi cấu trúc CSDL. Chi tiết đầy đủ: `deploy/Cập nhật bản 8.34 — Top
5 đọc domain Thành viên.md`.

---

## 8.33 — Sửa "Failed to fetch" khi Nhập hàng loạt Sync Job nhiều dòng

**Thay đổi**: Nhập hàng loạt 68 dòng Sync Job (34 siêu thị Thành viên) báo
lỗi trình duyệt "Failed to fetch" — nguyên nhân là Nginx, không phải code
Node: `proxy_read_timeout 65s` chung cho `/admin/` quá ngắn so với thời
gian đối chiếu schema THẬT từng dòng qua mạng (chạy tuần tự).

**QUAN TRỌNG — sửa `deploy/nginx.conf`, KHÔNG phải code Node** — `git
pull` + `pm2 restart` KHÔNG đủ, phải tự tay áp dụng cấu hình Nginx mới.

**Các bước triển khai:**
1. `git pull origin main`
2. Mở file Nginx thật đang dùng cho domain etl-admin, thêm 1 `location`
   RIÊNG khớp đúng 2 route Nhập hàng loạt (`/admin/sync-jobs/import`,
   `/admin/data-sources/import`), nâng `proxy_read_timeout`/
   `proxy_send_timeout` lên 600s — xem nguyên văn khối cấu hình ở
   `deploy/nginx.conf` bản mới nhất. Khối `/admin/` cũ giữ nguyên 65s.
3. `nginx -t` (phải báo "syntax is ok") rồi `systemctl reload nginx`.
4. Kiểm tra: Nhập hàng loạt file nhiều dòng (vd 68 dòng) chạy xong, không
   còn "Failed to fetch"; các route `/admin/` khác không bị ảnh hưởng.

Không đổi CSDL, không đổi code Node. Chi tiết đầy đủ: `deploy/Cập nhật bản
8.33 — Sửa Failed to fetch Nhập hàng loạt.md`.

---

## 8.32 — Sửa lỗi tương tự ở "File mẫu" Sync Job

**Thay đổi**: rà lại toàn bộ sau bug 8.31, phát hiện `buildSyncJobsTemplate()`
(`etl/lib/syncJobsImport.js`) bị ĐÚNG lỗi tương tự (bỏ sót khi sửa 8.31 —
lần đó chỉ soát `dataSourcesImport.js`) — file mẫu Sync Job cũng có 1 dòng
câu hướng dẫn trước header, trong khi `parseSyncJobsFile()` đọc header
cứng ở dòng 1.

**Các bước triển khai:**
1. `git pull origin main`
2. `pm2 restart hcrc-etl`
3. Kiểm tra: etl-admin → Đồng bộ → "Tải file mẫu" → dòng 1 phải là header,
   dòng 2-3 là 2 dòng ví dụ, không còn câu hướng dẫn phía trên header;
   nhập thử lại file Sync Job 68 dòng (34 siêu thị Thành viên) phải nhập
   đủ, không báo "không tìm thấy Nguồn dữ liệu".

Không đổi CSDL. Chi tiết đầy đủ: `deploy/Cập nhật bản 8.31-8.32 — Sửa lỗi
file mẫu Nguồn dữ liệu + Sync Job.md`.

---

## 8.31 — Sửa lỗi "File mẫu" Nguồn dữ liệu (header lệch dòng 2)

**Thay đổi**: phát hiện khi triển khai thật 34 siêu thị Thành viên (bản
8.30) — file mẫu "Nguồn dữ liệu" (`buildDataSourcesTemplate()`,
`etl/lib/dataSourcesImport.js`) tạo ra với dòng 1 là câu hướng dẫn, dòng 2
mới là header thật, nhưng `parseDataSourcesFile()` đọc header CỨNG ở dòng
1 — ai tải file mẫu, xoá CHỮ ở dòng 1 (không xoá nguyên dòng) rồi điền dữ
liệu sẽ bị báo "File thiếu cột bắt buộc 'Name'" dù đã điền đủ cột.

**Đã XÁC NHẬN không đổi cấu trúc CSDL** — chỉ sửa 2 file backend
(`etl/lib/dataSourcesImport.js`, `etl/lib/syncJobsImport.js` — xem bản
8.32 ngay trên), KHÔNG cần build lại giao diện nào.

**Các bước triển khai:**
1. `git pull origin main`
2. `pm2 restart hcrc-etl`
3. Kiểm tra: etl-admin → Nguồn dữ liệu → "Tải file mẫu" → dòng 1 phải là
   header (`Name, Server, DatabaseName, Username, Password, Engine, Port,
   Encrypt, TrustServerCert`), dòng 2 là dòng ví dụ; nhập thử lại file
   "Nguồn dữ liệu" 34 siêu thị Thành viên phải nhập được, không còn báo
   "File thiếu cột bắt buộc 'Name'".

Chi tiết đầy đủ (gộp chung 8.31+8.32): `deploy/Cập nhật bản 8.31-8.32 —
Sửa lỗi file mẫu Nguồn dữ liệu + Sync Job.md`.
