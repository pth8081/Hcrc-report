# Triển khai: 1 máy chủ ứng dụng + 1 máy chủ CSDL riêng

Hướng dẫn triển khai thật: **cả 3 hệ thống** (`etl/`, `rp-server/`,
`api-server/`) + **3 giao diện tĩnh** (`rp-user/`, `api-admin/`,
`etl-admin/`) chạy trên **CÙNG MỘT máy chủ ứng dụng**, đứng sau **một Nginx
duy nhất**; **CSDL SQL Server chạy trên MÁY CHỦ KHÁC**. Xem `deploy/nginx.conf`
cho cấu hình Nginx đầy đủ (4 domain, TLS, allow/deny nội bộ cho 2 trang quản
trị) — file này chỉ nói phần còn lại: cài đặt, build, chạy tiến trình, và
cách 2 máy chủ (ứng dụng / CSDL) nói chuyện với nhau.

**Không có domain "cổng vào chung" (portal)** — mỗi ứng dụng (rp-user,
api-admin, etl-admin) có domain/kết nối riêng, truy cập thẳng vào đúng
ứng dụng cần dùng, không qua 1 điểm liệt kê chung.

## Sơ đồ tổng quan

```
                                Internet
                                   |
                     ┌─────────────────────────┐
                     │   Nginx (443, 1 máy)     │
                     └─────────────────────────┘
                     report.*  api.*   |  api-admin.*  etl-admin.*
                      (công khai)      |     (nội bộ/VPN — allow/deny)
                          |            |          |
   ┌──────────────────────────────────────────────────────────────────┐
   │                     MÁY CHỦ ỨNG DỤNG (1 máy)                     │
   │  PM2: hcrc-rp-server (:4001)  hcrc-api-server (:4002)  hcrc-etl (:4003) │
   │  Tĩnh: rp-user/dist  api-admin/dist  etl-admin/dist               │
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
  cả 3 service kiểm tra NGAY lúc khởi động (trước `app.listen`, không đợi
  tới lượt đăng nhập/mã hoá đầu tiên): secret còn là giá trị mẫu, thiếu
  biến kết nối CSDL bắt buộc (`*_SERVER`/`*_DATABASE`), hay khoá mã hoá sai
  độ dài đều làm tiến trình DỪNG NGAY với lỗi rõ ràng trên `pm2 logs`,
  không im lặng chạy hỏng. Đây chỉ kiểm tra biến môi trường có điền ĐÚNG
  ĐỊNH DẠNG — KHÔNG mở kết nối CSDL thật lúc khởi động (tránh làm chậm/rung
  lắc nếu CSDL tạm thời chưa sẵn sàng) — CSDL thật sự kết nối được hay
  không vẫn phải xác nhận riêng (mục 4, endpoint `/health` PING THẬT CSDL).

Chạy schema + tài khoản CSDL quyền tối thiểu (trên MÁY CHỦ CSDL, không phải
máy ứng dụng — xem mục 2 bên dưới), rồi tạo tài khoản quản trị đầu tiên cho
từng trang quản trị (`npm run seed:admin`, xem README từng service).

Build 3 giao diện tĩnh:

```bash
for app in rp-user api-admin etl-admin; do
  (cd $app && npm install && npm run build)
done
```

Copy `dist/` của mỗi app sang đúng thư mục Nginx phục vụ (khớp `root`/`alias`
trong `deploy/nginx.conf`):

```bash
mkdir -p /var/www/hcrc
for app in rp-user api-admin etl-admin; do
  rm -rf /var/www/hcrc/$app
  cp -r $app/dist /var/www/hcrc/$app
done
```

Chạy 3 tiến trình nền bằng PM2:

```bash
pm2 start deploy/ecosystem.config.js
pm2 save          # tự khởi động lại cùng hệ điều hành
pm2 startup       # in lệnh cần chạy 1 lần để đăng ký PM2 với systemd
```

**Chế độ cluster (mặc định 2 worker/app)**: `deploy/ecosystem.config.js`
chạy MỖI app (`etl`/`rp-server`/`api-server`) ở `exec_mode: 'cluster'`,
mặc định `instances: 2` — tổng cộng **6 tiến trình Node** trên cùng 1 máy
(chỉnh qua `PM2_INSTANCES_ETL`/`PM2_INSTANCES_RP`/`PM2_INSTANCES_API`, xem
chú thích đầu file). Điểm cần nhớ: **mỗi worker tự mở 1 pool kết nối CSDL
riêng** (không dùng chung giữa các worker) — tổng số kết nối thật sự mở
tới SQL Server = `instances × *_POOL_MAX` (biến trong `.env` từng service).
Tăng `instances` theo số lõi CPU máy chủ mà KHÔNG chỉnh lại `*_POOL_MAX`
tương ứng dễ vượt giới hạn kết nối cho phép của SQL Server (đặc biệt nếu
CSDL dùng chung cho DBA khác/công cụ giám sát) — luôn tính lại tổng trước
khi đổi 1 trong 2 số.

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

Trỏ 4 bản ghi A/AAAA (`report`, `api`, `api-admin`, `etl-admin`
— tiền tố của domain bạn dùng, khớp `deploy/nginx.conf`) về CÙNG 1 IP máy
chủ ứng dụng. Lấy chứng chỉ (Let's Encrypt, dùng `certbot`):

```bash
certbot certonly --nginx -d report.hcrc.vidu.vn -d api.hcrc.vidu.vn \
  -d api-admin.hcrc.vidu.vn -d etl-admin.hcrc.vidu.vn
```

(hoặc 1 chứng chỉ wildcard `*.hcrc.vidu.vn` qua DNS challenge nếu muốn quản
lý 1 chứng chỉ duy nhất). Copy `deploy/nginx.conf` vào
`/etc/nginx/conf.d/hcrc.conf`, đổi domain mẫu `hcrc.vidu.vn` thành domain
thật, đổi dải IP `allow` (2 domain nội bộ) thành IP văn phòng/VPN thật, rồi:

```bash
nginx -t && systemctl reload nginx
```

**Gia hạn chứng chỉ (renewal)**: `certbot certonly` (không phải
`--nginx`/`--apache`) KHÔNG tự sửa Nginx, nên certbot tự cài sẵn 1
timer/cron chạy `certbot renew` định kỳ (kiểm tra `systemctl list-timers |
grep certbot` hoặc `/etc/cron.d/certbot`) — NHƯNG chứng chỉ gia hạn xong
Nginx KHÔNG tự nạp lại, vẫn phục vụ chứng chỉ CŨ tới khi được `reload` thủ
công. Thêm hook để renew xong tự reload Nginx:

```bash
sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
echo -e '#!/bin/sh\nnginx -t && systemctl reload nginx' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sudo certbot renew --dry-run   # kiểm tra hook chạy đúng, không đợi tới hạn thật
```

## 4. Kiểm tra sau triển khai

- `curl -I https://report.hcrc.vidu.vn/` — ra trang `rp-user/`.
- `curl https://report.hcrc.vidu.vn/api/health` — JSON `{"status":"ok",
  "db":{"rp":"ok","dwh":"ok"},...}` (xem `rp-server/routes/health.js`) —
  PING THẬT cả 2 pool CSDL, không chỉ "tiến trình đang chạy" — 503 nếu 1
  trong 2 không kết nối được (nêu rõ pool nào).
- `curl https://api.hcrc.vidu.vn/api/v1/health` — cùng dạng, ping pool
  `admin`/`dwh`.
- `curl https://<domain-etl-noi-bo>/health` (từ máy trong VPN — etl không
  có route công khai) — ping pool `admin`, PHẢI trả 200 (503 nếu CSDL
  không kết nối được). Dạng response HƠI KHÁC 2 route trên (`{"status",
  "db", "time"}` — `db` là chuỗi `"ok"|"error"`, KHÔNG phải object lồng
  `{rp, dwh}`/`{admin, dwh}`, và không có `version`) vì etl chỉ có 1 pool
  CSDL quản trị cần ping, không có DWH riêng để phân biệt. **Trước đây bị
  bỏ sót khỏi checklist này** — etl không phục vụ request công khai nên
  "tiến trình PM2 đang chạy" không nói lên được gì về việc ĐỒNG BỘ có đang
  hoạt động thật hay không; xem thêm trang "Dashboard" (etl-admin/) để biết
  job nào đang lỗi/quá hạn.
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
- `pm2 reload hcrc-rp-server` (rồi `hcrc-api-server`, `hcrc-etl`) — PHẢI
  thấy log "SIGTERM — đóng dần..." trong `pm2 logs`, tiến trình thoát SẠCH
  (không có request nào đang chạy bị cắt ngang) trước khi PM2 khởi động lại
  — xác nhận `lib/processGuards.js` hoạt động đúng (đóng dần thay vì bị
  giết ngay).

## 5. Xác thực hai yếu tố (2FA) cho tài khoản admin

Bắt buộc cho vai trò **admin** ở cả 3 hệ thống (ETL, API Server, Report
Server) — vai trò khác không cần. Tài khoản admin tạo mới (qua UI hoặc
`scripts/seedAdmin.js`) mặc định CHƯA bật 2FA — lần đăng nhập ĐẦU TIÊN sẽ bị
chặn ngay ở màn "Bắt buộc đăng ký 2FA" (quét mã QR bằng app Authenticator —
Google Authenticator, Authy, Microsoft Authenticator...), không vào được
trang nào khác cho tới khi hoàn tất.

- **1 điện thoại dùng chung được cho cả 3 hệ thống** — mỗi hệ thống đăng ký
  RIÊNG (3 mã QR khác nhau, 3 secret khác nhau), app Authenticator hiện 3
  dòng phân biệt ("HCRC ETL", "HCRC API", "HCRC Report").
- **Mã khôi phục**: sau khi bật 2FA, hệ thống hiện ĐÚNG 1 LẦN 10 mã dùng 1
  lần (dạng `AAAAA-BBBBB`) — admin tự chép lại/in ra, cất nơi an toàn. Dùng
  khi mất điện thoại và không có admin nào khác trong CÙNG hệ thống để nhờ.
- **Đặt lại 2FA giúp admin khác**: trang "Phân quyền"/"Tài khoản quản trị"
  có nút "Đặt lại 2FA" trên hàng của admin khác — dùng khi họ mất thiết bị
  và không còn mã khôi phục. Sau khi đặt lại, lần đăng nhập kế tiếp của
  admin đó bị bắt đăng ký 2FA lại từ đầu (2FA vẫn bắt buộc, không tắt hẳn).
  Thao tác này được ghi vào Nhật ký thao tác (ai gỡ cho ai, lúc nào).
- **Nếu MẤT ĐIỆN THOẠI + KHÔNG CÒN mã khôi phục + KHÔNG có admin nào khác**
  trong hệ thống đó — không có đường tự khôi phục qua giao diện, cần DBA
  can thiệp trực tiếp CSDL (đặt `TwoFactorEnabled = 0` trên đúng dòng
  `admin.AdminUsers`/`app.Users` của tài khoản đó) rồi đăng nhập lại.

## 6. fail2ban (bổ sung, khuyến nghị)

Lớp phòng thủ THÊM ở tầng firewall (chặn hẳn IP sau nhiều lần thất bại,
KHÔNG thay thế rate-limit đã có trong code) — xem `deploy/fail2ban/README.md`
cho hướng dẫn cài đặt đầy đủ. Không bắt buộc để chạy được hệ thống, nhưng
nên bật trước khi mở ra Internet thật.

## 7. Xoay vòng log (log rotation)

Chạy dài ngày không xoay vòng log sẽ dần chiếm hết dung lượng đĩa — 2 nguồn
log cần quan tâm:

- **PM2** (`console.log`/`console.error` của cả 3 tiến trình — lịch sử
  đồng bộ, lỗi request...) ghi vào `~/.pm2/logs/*.log`, PM2 KHÔNG tự xoay
  vòng các file này. Cài `pm2-logrotate`:
  ```bash
  pm2 install pm2-logrotate
  pm2 set pm2-logrotate:max_size 50M
  pm2 set pm2-logrotate:retain 14
  ```
- **Nginx** (`hcrc-report`/`hcrc-api`/`hcrc-api-admin`/`hcrc-etl-admin.access.log`
  — xem `deploy/nginx.conf`) — bản Nginx cài qua package của Debian/Ubuntu
  thường có sẵn `/etc/logrotate.d/nginx` khớp mẫu `/var/log/nginx/*.log`
  (tự bắt được cả 4 file mới này), nhưng **XÁC NHẬN LẠI** thay vì giả định:
  ```bash
  cat /etc/logrotate.d/nginx   # kiểm tra có khớp *.log không
  sudo logrotate -d /etc/logrotate.d/nginx   # chạy thử (dry-run), xem có liệt kê đủ 4 file hcrc-*.access.log
  ```
  Nếu KHÔNG khớp (bản Nginx tự biên dịch, hoặc cấu hình logrotate khác mặc
  định), tự thêm 1 khối logrotate riêng cho `/var/log/nginx/hcrc-*.access.log`.

## 8. Sao lưu CSDL (trách nhiệm của DBA/hạ tầng, NGOÀI phạm vi repo này)

Repo này KHÔNG bao gồm chiến lược sao lưu/khôi phục CSDL (backup/restore) —
đó là việc của DBA quản lý MÁY CHỦ CSDL riêng (mục 2), tương tự bất kỳ SQL
Server production nào khác (backup định kỳ `HCRC_DWH`/`HCRC_ETL`/
`HCRC_API`/`HCRC_RP`, kiểm thử khôi phục thử định kỳ, lưu bản sao ở vị trí
khác máy chủ CSDL chính). Ghi rõ ở đây để KHÔNG ai lầm tưởng việc này đã có
sẵn/tự động chỉ vì không thấy nhắc tới ở đâu khác trong tài liệu triển khai.

## Câu hỏi thường gặp

**Vì sao 2 trang quản trị (`api-admin`/`etl-admin`) không dùng domain
công khai luôn cho tiện, chỉ khoá bằng mật khẩu đăng nhập?** — Mật khẩu là
lớp phòng thủ DUY NHẤT nếu domain lộ công khai; brute-force/rò rỉ mật khẩu
là có thật. Domain riêng + `allow`/`deny` theo IP ở Nginx là lớp phòng thủ
THÊM, hoàn toàn độc lập với mật khẩu — kẻ tấn công phải VỪA ở trong mạng
nội bộ/VPN VỪA có mật khẩu đúng mới vào được, thay vì chỉ cần 1 trong 2.

**Có bắt buộc đúng 4 domain/subdomain không?** — Không, đó là cách đơn
giản nhất tránh phải đổi cấu hình build (`base` path) của các giao diện
tĩnh. Xem ghi chú "PHƯƠNG ÁN 1 DOMAIN" ở cuối `deploy/nginx.conf` nếu chỉ
có 1 domain thật.

**PM2 tự khởi động lại khi 1 tiến trình lỗi/crash?** — Có. 3 tiến trình độc
lập nhau (`deploy/ecosystem.config.js`) — `etl` lỗi không kéo sập
`rp-server`/`api-server` và ngược lại. Có giới hạn (`min_uptime`/
`max_restarts`) chống restart-loop vô hạn nếu tiến trình thoát NGAY lúc
khởi động (vd cấu hình sai — xem mục "Kiểm tra cấu hình" ở trên): sau 10
lần thoát sớm liên tiếp, PM2 NGỪNG tự thử, chuyển trạng thái `errored`
(`pm2 status` thấy rõ) thay vì cắm restart mãi. Sửa xong `.env` rồi chạy
`pm2 restart <tên>` để PM2 thử lại từ đầu.

**Nginx có cần cấu hình gì cho CSDL không?** — Không. CSDL chỉ được các
tiến trình Node kết nối trực tiếp qua `.env` (`*_SERVER`/`*_PORT`), không
đi qua Nginx, không có route/domain nào của Nginx trỏ tới CSDL.
