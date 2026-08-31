# Triển khai: 1 máy chủ ứng dụng + 1 máy chủ CSDL riêng

Hướng dẫn triển khai thật: **cả 3 hệ thống** (`etl/`, `rp-server/`,
`api-server/`) + **4 giao diện tĩnh** (`portal/`, `rp-user/`, `api-admin/`,
`etl-admin/`) chạy trên **CÙNG MỘT máy chủ ứng dụng**, đứng sau **một Nginx
duy nhất**; **CSDL SQL Server chạy trên MÁY CHỦ KHÁC**. Xem `deploy/nginx.conf`
cho cấu hình Nginx đầy đủ (5 domain, TLS, allow/deny nội bộ cho 2 trang quản
trị) — file này chỉ nói phần còn lại: cài đặt, build, chạy tiến trình, và
cách 2 máy chủ (ứng dụng / CSDL) nói chuyện với nhau.

## Sơ đồ tổng quan

```
                                Internet
                                   |
                     ┌─────────────────────────┐
                     │   Nginx (443, 1 máy)     │
                     └─────────────────────────┘
                     report.*  api.*  portal.*   |  api-admin.*  etl-admin.*
                      (công khai)                |     (nội bộ/VPN — allow/deny)
                          |                       |          |
   ┌──────────────────────────────────────────────────────────────────┐
   │                     MÁY CHỦ ỨNG DỤNG (1 máy)                     │
   │  PM2: hcrc-rp-server (:4001)  hcrc-api-server (:4002)  hcrc-etl (:4003) │
   │  Tĩnh: rp-user/dist  api-admin/dist  etl-admin/dist  portal/dist  │
   └──────────────────────────────────────────────────────────────────┘
                          |            |            |
                          └──────┬─────┴──────┬─────┘
                                 │  kết nối DB │  (SQL Server, TCP 1433,
                                 ▼             ▼   qua mạng riêng/VPN — KHÔNG
                     ┌─────────────────────────┐   qua Nginx, không public)
                     │   MÁY CHỦ CSDL (1 máy)   │
                     │  HCRC_DWH / HCRC_RP /    │
                     │  HCRC_API / HCRC_ETL     │
                     └─────────────────────────┘
```

Không có gì trong Nginx cần biết máy chủ CSDL ở đâu — đó là việc của
`.env` từng service (xem mục "Máy chủ CSDL riêng" bên dưới).

## 1. Chuẩn bị máy chủ ứng dụng

```bash
# Node.js >= 18, PM2 chạy nền
npm install -g pm2

git clone <repo> hcrc && cd hcrc
```

Cài đặt + cấu hình `.env` cho từng service (xem README riêng từng thư mục
cho chi tiết đầy đủ — mục này chỉ tóm tắt thứ tự):

```bash
for svc in etl rp-server api-server; do
  (cd $svc && npm install --omit=dev && cp .env.example .env)
done
```

Điền `.env` từng service — QUAN TRỌNG nhất cho mô hình "CSDL máy khác":

- `etl/.env`: `DWH_SERVER`, `ADMIN_SERVER` — trỏ sang **IP/hostname máy chủ
  CSDL**, KHÔNG phải `localhost`.
- `rp-server/.env`: `RP_SERVER` (CSDL `HCRC_RP`), `DWH_SERVER` — cùng vậy.
- `api-server/.env`: `ADMIN_SERVER` (CSDL `HCRC_API`), `DWH_SERVER` — cùng vậy.
- Cả 3: giữ nguyên `TRUST_PROXY_HOPS=1` (đúng mô hình 1 Nginx duy nhất ở
  trên), đặt `NODE_ENV=production` trong `deploy/ecosystem.config.js` (đã
  có sẵn) để cookie phiên tự bật `secure`.
- Đổi MỌI secret còn là giá trị mẫu (`*_JWT_SECRET`, `*_ENCRYPTION_KEY`) —
  cả 3 service LỖI NGAY lúc khởi động nếu còn để mẫu, không im lặng chạy
  với secret ai cũng đọc được từ repo.

Chạy schema + tài khoản CSDL quyền tối thiểu (trên MÁY CHỦ CSDL, không phải
máy ứng dụng — xem mục 2 bên dưới), rồi tạo tài khoản quản trị đầu tiên cho
từng trang quản trị (`npm run seed:admin`, xem README từng service).

Build 4 giao diện tĩnh:

```bash
for app in portal rp-user api-admin etl-admin; do
  (cd $app && npm install && npm run build)
done
```

Copy `dist/` của mỗi app sang đúng thư mục Nginx phục vụ (khớp `root`/`alias`
trong `deploy/nginx.conf`):

```bash
mkdir -p /var/www/hcrc
for app in portal rp-user api-admin etl-admin; do
  rm -rf /var/www/hcrc/$app
  cp -r $app/dist /var/www/hcrc/$app
done
```

`portal/.env` — điền đúng URL công khai thật của 3 đích đến (không phải
`localhost` nữa):

```
VITE_REPORT_URL=https://report.hcrc.vidu.vn
VITE_API_ADMIN_URL=https://api-admin.hcrc.vidu.vn
VITE_ETL_ADMIN_URL=https://etl-admin.hcrc.vidu.vn
```

Chạy 3 tiến trình nền bằng PM2:

```bash
pm2 start deploy/ecosystem.config.js
pm2 save          # tự khởi động lại cùng hệ điều hành
pm2 startup       # in lệnh cần chạy 1 lần để đăng ký PM2 với systemd
```

## 2. Máy chủ CSDL riêng

Cài SQL Server trên máy chủ CSDL, mở port 1433 **CHỈ cho máy chủ ứng dụng**
(firewall/security group — KHÔNG public port 1433 ra Internet). Chạy lần
lượt 4 file schema (an toàn chạy lại nhiều lần):

```bash
# Trên máy chủ CSDL, hoặc từ máy bất kỳ có sqlcmd trỏ tới máy chủ CSDL:
sqlcmd -S <ip-may-chu-csdl> -d HCRC_DWH -i dwh/schema.sql
sqlcmd -S <ip-may-chu-csdl> -d HCRC_ETL -i etl-db/schema.sql
sqlcmd -S <ip-may-chu-csdl> -d HCRC_API -i api-db/schema.sql
sqlcmd -S <ip-may-chu-csdl> -d HCRC_RP  -i rp-db/schema.sql
```

Tạo tài khoản quyền tối thiểu (xem `dwh/grants.sql`, `etl-db/grants.sql`,
`api-db/grants.sql`, `rp-db/grants.sql` — KHÔNG tự chạy, DBA xem lại + đổi
mật khẩu mẫu thành giá trị thật trước khi chạy). Mật khẩu tạo ở đây phải
khớp đúng biến `*_PASSWORD` trong `.env` của service tương ứng ở máy chủ
ứng dụng.

## 3. DNS + TLS

Trỏ 5 bản ghi A/AAAA (`report`, `api`, `portal`, `api-admin`, `etl-admin`
— tiền tố của domain bạn dùng, khớp `deploy/nginx.conf`) về CÙNG 1 IP máy
chủ ứng dụng. Lấy chứng chỉ (Let's Encrypt, dùng `certbot`):

```bash
certbot certonly --nginx -d report.hcrc.vidu.vn -d api.hcrc.vidu.vn \
  -d portal.hcrc.vidu.vn -d api-admin.hcrc.vidu.vn -d etl-admin.hcrc.vidu.vn
```

(hoặc 1 chứng chỉ wildcard `*.hcrc.vidu.vn` qua DNS challenge nếu muốn quản
lý 1 chứng chỉ duy nhất). Copy `deploy/nginx.conf` vào
`/etc/nginx/conf.d/hcrc.conf`, đổi domain mẫu `hcrc.vidu.vn` thành domain
thật, đổi dải IP `allow` (2 domain nội bộ) thành IP văn phòng/VPN thật, rồi:

```bash
nginx -t && systemctl reload nginx
```

## 4. Kiểm tra sau triển khai

- `curl -I https://report.hcrc.vidu.vn/` — ra trang `rp-user/`.
- `curl https://report.hcrc.vidu.vn/api/health` — JSON OK (xem
  `rp-server/routes/health.js`).
- `curl https://api.hcrc.vidu.vn/api/v1/health` — JSON OK.
- `curl -I https://api.hcrc.vidu.vn/admin/auth/login` — PHẢI 404 (domain
  công khai không được lộ `/admin`).
- Từ máy TRONG mạng nội bộ/VPN: `curl -I https://api-admin.hcrc.vidu.vn/` và
  `https://etl-admin.hcrc.vidu.vn/` — ra trang đăng nhập quản trị.
- Từ máy NGOÀI mạng nội bộ (vd điện thoại dùng 4G, tắt VPN):
  `curl -I https://api-admin.hcrc.vidu.vn/` — PHẢI bị Nginx từ chối (403,
  hoặc kết nối bị chặn tuỳ cấu hình firewall thêm ở tầng mạng).
- Trong log `pm2 logs hcrc-api-server` (hoặc `api.RequestLog`/audit log),
  IP ghi lại phải là IP THẬT của client gọi, không phải IP của Nginx (xác
  nhận `TRUST_PROXY_HOPS` đúng) — gọi thử từ 1 IP biết trước rồi so log.

## 5. fail2ban (bổ sung, khuyến nghị)

Lớp phòng thủ THÊM ở tầng firewall (chặn hẳn IP sau nhiều lần thất bại,
KHÔNG thay thế rate-limit đã có trong code) — xem `deploy/fail2ban/README.md`
cho hướng dẫn cài đặt đầy đủ. Không bắt buộc để chạy được hệ thống, nhưng
nên bật trước khi mở ra Internet thật.

## Câu hỏi thường gặp

**Vì sao 2 trang quản trị (`api-admin`/`etl-admin`) không dùng domain
công khai luôn cho tiện, chỉ khoá bằng mật khẩu đăng nhập?** — Mật khẩu là
lớp phòng thủ DUY NHẤT nếu domain lộ công khai; brute-force/rò rỉ mật khẩu
là có thật. Domain riêng + `allow`/`deny` theo IP ở Nginx là lớp phòng thủ
THÊM, hoàn toàn độc lập với mật khẩu — kẻ tấn công phải VỪA ở trong mạng
nội bộ/VPN VỪA có mật khẩu đúng mới vào được, thay vì chỉ cần 1 trong 2.

**Có bắt buộc đúng 5 domain/subdomain không?** — Không, đó là cách đơn
giản nhất tránh phải đổi cấu hình build (`base` path) của các giao diện
tĩnh. Xem ghi chú "PHƯƠNG ÁN 1 DOMAIN" ở cuối `deploy/nginx.conf` nếu chỉ
có 1 domain thật.

**PM2 tự khởi động lại khi 1 tiến trình lỗi/crash?** — Có, mặc định. 3 tiến
trình độc lập nhau (`deploy/ecosystem.config.js`) — `etl` lỗi không kéo sập
`rp-server`/`api-server` và ngược lại.

**Nginx có cần cấu hình gì cho CSDL không?** — Không. CSDL chỉ được các
tiến trình Node kết nối trực tiếp qua `.env` (`*_SERVER`/`*_PORT`), không
đi qua Nginx, không có route/domain nào của Nginx trỏ tới CSDL.
