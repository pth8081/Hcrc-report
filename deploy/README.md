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

### 1.0. Tài khoản dịch vụ (service account) chạy ứng dụng — làm TRƯỚC tiên

Trước đây tài liệu này không nói tiến trình PM2 chạy dưới quyền ai — mặc
định là tài khoản bạn đang SSH vào (rất có thể là `root` hoặc 1 tài khoản
có sudo đầy đủ). Rủi ro: 1 lỗ hổng bất kỳ trong code Node (RCE) sẽ cho kẻ
tấn công LUÔN quyền của tài khoản đó — nếu là root, coi như mất toàn quyền
máy chủ ngay lập tức. **Đây là tài khoản HỆ ĐIỀU HÀNH chạy tiến trình —
KHÁC HOÀN TOÀN với tài khoản CSDL** (`DWH_USER`/`RP_USER`/... trong
`.env`, tạo bằng `*/grants.sql`) — 2 lớp độc lập, làm đủ cả 2 mới kín.

Tạo 1 tài khoản dịch vụ DÙNG CHUNG cho cả 3 tiến trình (`etl`, `rp-server`,
`api-server`) — không có shell đăng nhập, không mật khẩu, không sudo, chỉ
tồn tại để sở hữu tiến trình + file:

```bash
sudo useradd --system --create-home --home-dir /home/hcrc \
  --shell /usr/sbin/nologin hcrc   # 1 số bản Linux dùng /sbin/nologin
sudo passwd -l hcrc   # khoá mật khẩu — không ai đăng nhập được bằng mật khẩu
```

`--create-home` CẦN THIẾT dù tài khoản không login được — PM2 lưu trạng
thái/log tại `~/.pm2` của tài khoản đang chạy nó. `--shell nologin` chặn
đăng nhập SSH/console trực tiếp bằng tài khoản này, nhưng KHÔNG chặn chạy
lệnh THAY MẶT nó qua `sudo -u hcrc` (cách dùng chuẩn cho service account,
xem bên dưới) — không cần sửa `sshd_config`.

**Từ đây tới hết mục 1, mở 1 shell mang quyền `hcrc` để làm toàn bộ các
bước cài đặt/build (y hệt các lệnh vốn có bên dưới, không đổi gì), rồi
thoát ra ở cuối:**

Node.js >= 18 và PM2 (`npm install -g pm2`) cần cài TOÀN MÁY (`-g`) — nếu
CHƯA cài, làm việc này TRƯỚC, bằng tài khoản của bạn (sudo), CHƯA vào
shell `hcrc`. Cài xong rồi mới vào shell `hcrc` để làm phần còn lại:

```bash
sudo -u hcrc -H -s /bin/bash
```

```bash
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

Build 3 giao diện tĩnh (vẫn trong shell `hcrc` — chỉ ghi vào `$app/dist/`
bên trong chính thư mục vừa clone, `hcrc` đã có sẵn quyền ghi ở đó):

```bash
for app in rp-user api-admin etl-admin; do
  (cd $app && npm install && npm run build)
done
```

Xong các bước trên, thoát khỏi shell `hcrc`:

```bash
exit
```

**Từ đây trở xuống, chạy BẰNG TÀI KHOẢN CỦA BẠN (sudo)** — `/var/www` bình
thường chỉ `root` mới ghi được (`755`), `hcrc` KHÔNG có sudo nên không tự
tạo thư mục ở đó được; đây cũng là lúc đăng ký PM2 chạy cùng hệ điều hành
(cần quyền root để tạo file service systemd), nên gộp làm 1 lần cho gọn:

Copy `dist/` của mỗi app sang đúng thư mục Nginx phục vụ (khớp `root`/`alias`
trong `deploy/nginx.conf`):

```bash
sudo mkdir -p /var/www/hcrc
for app in rp-user api-admin etl-admin; do
  sudo rm -rf /var/www/hcrc/$app
  sudo cp -r /home/hcrc/hcrc/$app/dist /var/www/hcrc/$app
done
```

Đăng ký PM2 chạy dưới quyền `hcrc`, tự khởi động lại cùng hệ điều hành:

```bash
sudo -u hcrc -H pm2 start /home/hcrc/hcrc/deploy/ecosystem.config.js
sudo -u hcrc -H pm2 save          # tự khởi động lại cùng hệ điều hành
sudo -u hcrc -H pm2 startup       # in ra 1 LỆNH cần chạy — xem chú thích ngay dưới đây
```

`pm2 startup` khi chạy DƯỚI tài khoản `hcrc` (không phải root) sẽ KHÔNG tự
đăng ký được với systemd — nó chỉ IN RA MÀN HÌNH 1 dòng lệnh dạng `sudo env
PATH=$PATH:/usr/bin pm2 startup systemd -u hcrc --hp /home/hcrc`, **copy
đúng dòng đó rồi chạy tiếp** (đã đang ở tài khoản của bạn, có sudo, không
cần làm gì thêm) — bước này cần quyền root vì phải tạo file service
systemd, PM2 không tự xin quyền thay bạn được.

### 1.1. Siết quyền file/thư mục sau khi cài đặt xong

Chạy các lệnh dưới đây BẰNG TÀI KHOẢN CỦA BẠN (sudo) — không phải trong
shell `hcrc` — để đảm bảo dù `git clone`/`npm install` để lại quyền mặc
định lỏng lẻo (thường `644`/`755`, "người khác" trên máy đọc được), thư
mục ứng dụng vẫn CHỈ `hcrc` và `root` truy cập được:

```bash
HCRC_DIR=/home/hcrc/hcrc   # đổi lại nếu bạn clone vào đường dẫn khác

sudo chown -R hcrc:hcrc "$HCRC_DIR"
sudo find "$HCRC_DIR" -type d -exec chmod 750 {} \;   # thư mục: chỉ hcrc + root vào được
sudo find "$HCRC_DIR" -name ".env" -exec chmod 600 {} \;   # .env: CHỈ hcrc đọc/ghi được, kể cả "group"
```

**Không chỉnh quyền 750/640 cho TỪNG FILE** như thư mục tĩnh bên dưới —
`node_modules/.bin/*` (vd `vite`, các script build) cần giữ nguyên bit
thực thi (`+x`) để `npm install`/`npm run build` những lần SAU (khi cập
nhật code) không bị lỗi "Permission denied"; đã siết `750` ở CẤP THƯ MỤC
là đủ chặn "người khác" trên máy — Linux đòi quyền "đi qua" (execute) ở
MỌI thư mục cha trên đường dẫn mới đọc được file bên trong, "người khác"
không vào nổi `$HCRC_DIR` thì quyền của file bên trong (dù `644`) không
còn ý nghĩa. `.env` vẫn siết `600` riêng — phòng khi sau này có ai lỡ nới
`$HCRC_DIR` lên `755` (vd để chạy 1 công cụ đọc mã nguồn), `.env` vẫn được
bảo vệ độc lập.

Thư mục tĩnh phục vụ qua Nginx (`/var/www/hcrc`) cần MỘT quy tắc KHÁC —
Nginx chạy dưới tài khoản riêng của nó (`www-data` trên Debian/Ubuntu,
`nginx` trên RHEL/CentOS — kiểm tra bằng `ps aux | grep nginx` hoặc dòng
`user` đầu `/etc/nginx/nginx.conf` GỐC nếu không chắc), cần ĐỌC được
nhưng KHÔNG BAO GIỜ cần GHI:

```bash
sudo chown -R hcrc:www-data /var/www/hcrc   # đổi www-data -> nginx nếu dùng RHEL/CentOS
sudo find /var/www/hcrc -type d -exec chmod 750 {} \;
sudo find /var/www/hcrc -type f -exec chmod 640 {} \;
```

**Còn thiếu, khuyến nghị làm ở đợt sau (chưa nằm trong lần này)**: 3 tiến
trình Node hiện lắng nghe trên MỌI địa chỉ mạng (`0.0.0.0`), dù Nginx chỉ
gọi vào `127.0.0.1:400x` — nếu máy chủ ứng dụng có địa chỉ IP công khai
(không chỉ sau NAT/VPN) và không có firewall chặn riêng 3 cổng
`4001-4003`, ai đó có thể gọi thẳng vào cổng đó, BỎ QUA hoàn toàn giới hạn
IP nội bộ Nginx đang áp cho `api-admin`/`etl-admin` và bỏ qua luôn TLS. 2
cách vá (chọn 1, làm sau, không thuộc phạm vi mục 1.1 này): (a) firewall
(`ufw deny 4001:4003/tcp` hoặc tương đương ở security group) chặn 3 cổng
từ mọi nguồn TRỪ chính máy chủ, hoặc (b) sửa `app.listen(PORT, ...)` thành
`app.listen(PORT, '127.0.0.1', ...)` ở cả 3 `server.js` (an toàn triệt để
hơn, không phụ thuộc cấu hình firewall có bật đúng hay không).

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
(firewall/security group — KHÔNG public port 1433 ra Internet).

**Tạo 4 database RỖNG trước** — mọi file `*/schema.sql` trong repo này đều
CHỈ tạo schema + bảng BÊN TRONG 1 database đã có sẵn, KHÔNG tự
`CREATE DATABASE` (xem chú thích đầu mỗi file) — thiếu bước này, script vẫn
chạy "thành công" nhưng tạo nhầm bảng vào database MẶC ĐỊNH đang chọn (vd
`master`), không lỗi rõ ràng để biết mà sửa ngay, đặc biệt dễ gặp khi chạy
bằng SSMS (ô chọn database ở toolbar bị bỏ trống/chưa đổi) hơn là `sqlcmd`
(dùng `-d <tên>` sẽ báo lỗi ngay nếu database chưa tồn tại):

```sql
CREATE DATABASE HCRC_DWH;
CREATE DATABASE HCRC_ETL;
CREATE DATABASE HCRC_API;
CREATE DATABASE HCRC_RP;
```

Rồi chạy lần lượt 4 file schema (an toàn chạy lại nhiều lần):

```bash
# Trên máy chủ CSDL, hoặc từ máy bất kỳ có sqlcmd trỏ tới máy chủ CSDL:
sqlcmd -S <ip-may-chu-csdl> -d HCRC_DWH -i dwh/schema.sql
sqlcmd -S <ip-may-chu-csdl> -d HCRC_ETL -i etl-db/schema.sql
sqlcmd -S <ip-may-chu-csdl> -d HCRC_API -i api-db/schema.sql
sqlcmd -S <ip-may-chu-csdl> -d HCRC_RP  -i rp-db/schema.sql
```

Dùng SSMS thay vì `sqlcmd` — sau khi mở file `.sql`, LUÔN kiểm tra ô chọn
database ở toolbar (phía trên cửa sổ Query) đang trỏ ĐÚNG tên database
tương ứng trước khi bấm Execute, hoặc gõ `USE HCRC_DWH; GO` (đổi tên) làm
dòng đầu file trước khi chạy — SSMS KHÔNG tự cảnh báo nếu bạn quên đổi, chỉ
âm thầm chạy vào database đang chọn sẵn.

**Lỡ chạy nhầm database (schema/bảng nằm sai chỗ)** — kiểm tra bằng
`SELECT DB_NAME();` ngay trong cửa sổ Query vừa chạy; nếu không phải tên
đúng, dọn lại trước khi tạo đúng chỗ:

```sql
USE <tên-database-bị-nhầm>; -- vd master
DROP TABLE IF EXISTS dwh.ReportFacts; -- đổi tên bảng/schema theo đúng file schema.sql vừa chạy nhầm
DROP SCHEMA IF EXISTS dwh;
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

**Mọi lệnh `pm2 ...` từ mục này trở đi** (kể cả các mục sau) chạy dưới
tài khoản dịch vụ `hcrc` (mục 1.0) — gõ `sudo -u hcrc -H pm2 ...` thay vì
`pm2 ...` trực tiếp nếu bạn không đang ở trong shell đã mở bằng `sudo -u
hcrc -H -s /bin/bash`, nếu không PM2 sẽ tìm nhầm sang "bản PM2 của riêng
tài khoản bạn" (rỗng, chưa từng `pm2 start` gì) và báo không thấy tiến
trình nào dù `hcrc` vẫn đang chạy bình thường.

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
- `curl -H "Accept-Encoding: gzip" -sI https://report.hcrc.vidu.vn/assets/<tên-file>.js`
  (lấy đúng tên file JS thật trong `rp-user/dist/assets/` sau khi build) —
  header trả về PHẢI có `Content-Encoding: gzip`. Đây là file TĨNH Nginx tự
  phục vụ (không qua rp-server) nên KHÔNG được hưởng `compression()`
  (express) đã bật sẵn cho `/api/*` — phải tự khai `gzip on;` riêng trong
  `deploy/nginx.conf` (xem chú thích ở đó) mới có, không phụ thuộc cấu hình
  mặc định (có thể có hoặc không) của `nginx.conf` GỐC hệ điều hành. Lặp lại
  tương tự cho `api-admin.hcrc.vidu.vn`/`etl-admin.hcrc.vidu.vn`.

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
  đồng bộ, lỗi request...) ghi vào `~/.pm2/logs/*.log` **của tài khoản
  `hcrc`** (tức `/home/hcrc/.pm2/logs/*.log`), PM2 KHÔNG tự xoay vòng các
  file này. Cài `pm2-logrotate` (nhớ `sudo -u hcrc -H`, xem lưu ý đầu mục 4):
  ```bash
  sudo -u hcrc -H pm2 install pm2-logrotate
  sudo -u hcrc -H pm2 set pm2-logrotate:max_size 50M
  sudo -u hcrc -H pm2 set pm2-logrotate:retain 14
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
`pm2 restart <tên>` (nhớ `sudo -u hcrc -H`, xem lưu ý đầu mục 4) để PM2
thử lại từ đầu.

**Nginx có cần cấu hình gì cho CSDL không?** — Không. CSDL chỉ được các
tiến trình Node kết nối trực tiếp qua `.env` (`*_SERVER`/`*_PORT`), không
đi qua Nginx, không có route/domain nào của Nginx trỏ tới CSDL.

**Tài khoản `hcrc` (mục 1.0) và tài khoản CSDL (`DWH_USER`/`RP_USER`/...,
mục 2) có phải 1 không, có cần trùng tên/mật khẩu không?** — KHÔNG liên
quan gì tới nhau, dù có thể trùng tên "hcrc" nghe giống. `hcrc` là tài
khoản HỆ ĐIỀU HÀNH sở hữu tiến trình Node + file trên máy chủ ứng dụng —
tự tạo bằng `useradd`, không cần mật khẩu, không đăng nhập được. Tài
khoản CSDL là bên trong SQL Server (`sqlcmd`/SSMS tạo bằng `*/grants.sql`)
— dùng để tiến trình Node XÁC THỰC VỚI CSDL qua `.env`, hoàn toàn không
liên quan tới hệ điều hành. Cần làm ĐỦ CẢ 2, thiếu 1 trong 2 vẫn hở: chỉ
tạo `hcrc` mà vẫn dùng tài khoản CSDL `sa`/quyền cao cho `.env` thì 1 lỗi
SQL injection lọt qua vẫn đọc/sửa được TOÀN BỘ CSDL; chỉ tạo tài khoản
CSDL quyền hẹp mà vẫn chạy Node bằng `root` thì 1 lỗi RCE vẫn cho kẻ tấn
công toàn quyền máy chủ.
