# Hướng dẫn triển khai — Hệ thống Báo cáo HCRC

> **Phiên bản trước của file này bị SAI** — mô tả một ứng dụng "HCRC
> Voucher Redemption App" không hề tồn tại trong repo này (nhầm với nội
> dung 1 file tham khảo khác được đưa vào lúc soạn tài liệu). File này đã
> được viết lại HOÀN TOÀN, khớp đúng với hệ thống thật đang có trong repo
> `hcrc-report`: **3 service backend** (`etl/`, `rp-server/`,
> `api-server/`) + **3 giao diện web** (`etl-admin/`, `rp-user/`,
> `api-admin/`). Nội dung dưới đây lấy trực tiếp từ `deploy/README.md`
> (tài liệu kỹ thuật gốc, đã được kiểm thử thật trong quá trình xây dựng
> hệ thống) và các file `README.md`/`.env.example` của từng service —
> không có phần nào bịa thêm.

Đọc theo đúng thứ tự nếu là lần triển khai đầu tiên. Nếu chỉ cần cập nhật
code mới lên hệ thống đã chạy sẵn, xem thẳng mục **14. Cập nhật lên
phiên bản mới**. Nếu cần cấu hình nghiệp vụ/báo cáo (không phải cài đặt
hạ tầng), xem file `Hướng dẫn nghiệp vụ.md` (cùng thư mục).

**Ghi chú cập nhật**: mọi hướng dẫn triển khai/hạ tầng mới nên bổ sung vào
CHÍNH file này (và đối chiếu với `deploy/README.md` nếu cần chi tiết kỹ
thuật sâu hơn — 2 file cùng mô tả 1 hệ thống thật, không mâu thuẫn nhau).

## Mục lục

1. [Mô hình hệ thống thật](#1-mô-hình-hệ-thống-thật)
2. [Yêu cầu hạ tầng](#2-yêu-cầu-hạ-tầng)
3. [Bước 1 — Máy chủ CSDL: tạo 4 database](#3-bước-1--máy-chủ-csdl-tạo-4-database)
4. [Bước 2 — Máy chủ ứng dụng: chọn cách chạy + tạo tài khoản](#4-bước-2--máy-chủ-ứng-dụng-chọn-cách-chạy--tạo-tài-khoản)
5. [Bước 3 — Lấy mã nguồn + cấu hình `.env`](#5-bước-3--lấy-mã-nguồn--cấu-hình-env)
6. [Bước 4 — Tạo tài khoản quản trị đầu tiên (bắt buộc để đăng nhập được)](#6-bước-4--tạo-tài-khoản-quản-trị-đầu-tiên-bắt-buộc-để-đăng-nhập-được)
7. [Bước 5 — Build 3 giao diện + copy sang Nginx](#7-bước-5--build-3-giao-diện--copy-sang-nginx)
8. [Bước 6 — Bật tiến trình nền (PM2 hoặc systemd)](#8-bước-6--bật-tiến-trình-nền-pm2-hoặc-systemd)
9. [Bước 7 — Nginx + DNS + TLS (4 domain)](#9-bước-7--nginx--dns--tls-4-domain)
10. [Bước 8 — Đăng nhập lần đầu vào từng trang](#10-bước-8--đăng-nhập-lần-đầu-vào-từng-trang)
11. [Bước 9 — Siết quyền file/thư mục lần cuối](#11-bước-9--siết-quyền-filethư-mục-lần-cuối)
12. [Kiểm tra sau triển khai](#12-kiểm-tra-sau-triển-khai)
13. [Vận hành: log, fail2ban, backup](#13-vận-hành-log-fail2ban-backup)
14. [Cập nhật lên phiên bản mới](#14-cập-nhật-lên-phiên-bản-mới)
15. [Xử lý sự cố thường gặp](#15-xử-lý-sự-cố-thường-gặp)
16. [Bảng biến môi trường (`.env`)](#16-bảng-biến-môi-trường-env)
17. [Câu hỏi thường gặp](#17-câu-hỏi-thường-gặp)

---

## 1. Mô hình hệ thống thật

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
   │  hcrc-rp-server (:4001)  hcrc-api-server (:4002)  hcrc-etl (:4003) │
   │  (chạy bằng PM2 hoặc systemd — chọn 1 trong 2, xem mục 4)          │
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

**3 service backend** (Node.js/Express, mỗi service tự nối DB qua
`.env`, không đi qua Nginx):

| Service | Cổng nội bộ | Vai trò | Có route công khai? |
|---|---|---|---|
| `etl/` | 4003 | Đồng bộ dữ liệu từ nguồn vào Data Warehouse (`HCRC_DWH`), quản lý bằng `etl-admin/` | Không — chỉ `/admin/*` nội bộ |
| `rp-server/` | 4001 | Phục vụ báo cáo cho `rp-user/` (người dùng thường + admin) | Có — `/api/*` công khai qua domain `report.*` |
| `api-server/` | 4002 | Cấp API cho đối tác ngoài (`/api/v1/*`) + quản trị bằng `api-admin/` | Có (`/api/v1/*` công khai qua `api.*`), riêng `/admin/*` chỉ nội bộ qua `api-admin.*` |

**3 giao diện web** (React/Vite, build tĩnh, Nginx phục vụ trực tiếp —
KHÔNG có domain "cổng vào chung", mỗi giao diện có domain riêng):

| Giao diện | Domain | Ai dùng | Backend đứng sau |
|---|---|---|---|
| `rp-user/` | `report.*` (công khai) | Nhân viên xem báo cáo + admin cấu hình báo cáo (chung 1 app, phân biệt bằng quyền theo menu) | `rp-server` |
| `api-admin/` | `api-admin.*` (nội bộ/VPN) | Admin quản trị API/đối tác | `api-server` |
| `etl-admin/` | `etl-admin.*` (nội bộ/VPN) | Admin quản trị đồng bộ dữ liệu | `etl` |

**4 database** trên 1 máy chủ SQL Server RIÊNG (không cùng máy chủ ứng
dụng): `HCRC_DWH` (Data Warehouse — dữ liệu báo cáo), `HCRC_ETL` (quản
trị ETL), `HCRC_API` (quản trị API Server), `HCRC_RP` (quản trị Report
Server).

## 2. Yêu cầu hạ tầng

| Thành phần | Yêu cầu |
|---|---|
| Máy chủ ứng dụng | Linux, Node.js >= 18, Nginx |
| Máy chủ CSDL | SQL Server (máy RIÊNG, khác máy chủ ứng dụng), port 1433 chỉ mở cho máy chủ ứng dụng |
| Process manager | PM2 **hoặc** systemd — chọn 1 trong 2 (mục 4) |
| DNS | 4 bản ghi A/AAAA: `report.*`, `api.*`, `api-admin.*`, `etl-admin.*` (có thể gộp 1 domain nếu không xin được subdomain — xem cuối `deploy/nginx.conf`) |
| TLS | Let's Encrypt (`certbot`) hoặc chứng chỉ khác — bắt buộc HTTPS cho cả 4 domain |

## 3. Bước 1 — Máy chủ CSDL: tạo 4 database

Trên máy chủ CSDL, tạo 4 database RỖNG trước — mọi file `*/schema.sql`
trong repo CHỈ tạo bảng BÊN TRONG 1 database đã có sẵn, KHÔNG tự
`CREATE DATABASE`:

```sql
CREATE DATABASE HCRC_DWH;
CREATE DATABASE HCRC_ETL;
CREATE DATABASE HCRC_API;
CREATE DATABASE HCRC_RP;
```

> Dùng SSMS thay vì `sqlcmd`? LUÔN kiểm tra ô chọn database ở toolbar
> đang trỏ ĐÚNG tên database trước khi bấm Execute — SSMS không tự cảnh
> báo nếu bạn quên đổi, chỉ âm thầm chạy vào database đang chọn sẵn (vd
> `master`). Kiểm tra bằng `SELECT DB_NAME();` ngay sau khi chạy.

Chạy lần lượt 4 file schema (an toàn chạy lại nhiều lần):

```bash
sqlcmd -S <ip-may-chu-csdl> -d HCRC_DWH -i dwh/schema.sql
sqlcmd -S <ip-may-chu-csdl> -d HCRC_ETL -i etl-db/schema.sql
sqlcmd -S <ip-may-chu-csdl> -d HCRC_API -i api-db/schema.sql
sqlcmd -S <ip-may-chu-csdl> -d HCRC_RP  -i rp-db/schema.sql
```

Tạo tài khoản CSDL quyền tối thiểu cho từng service — xem `dwh/grants.sql`,
`etl-db/grants.sql`, `api-db/grants.sql`, `rp-db/grants.sql` (KHÔNG tự
chạy, DBA xem lại + đổi mật khẩu mẫu thành giá trị thật trước khi chạy).
Mật khẩu tạo ở đây phải khớp đúng biến `*_PASSWORD` trong `.env` của
service tương ứng ở bước 5.

## 4. Bước 2 — Máy chủ ứng dụng: chọn cách chạy + tạo tài khoản

**Vì sao phải tạo tài khoản hệ điều hành riêng?** Nếu không, tiến trình
Node sẽ chạy dưới tài khoản bạn đang SSH vào (thường là `root`) — 1 lỗ
hổng bất kỳ trong code sẽ cho kẻ tấn công LUÔN quyền của tài khoản đó.
Tài khoản này KHÁC HOÀN TOÀN tài khoản CSDL (`DWH_USER`/`RP_USER`/...,
mục 3) — 2 việc riêng, không thay thế nhau được (xem mục 17).

**Chọn 1 trong 2 cách** (không đổi ý giữa chừng):

| So sánh nhanh | Cách A — PM2 | Cách B — systemd |
|---|---|---|
| Tài khoản chạy ứng dụng | 1 tài khoản dùng chung cho cả 3 service | 3 tài khoản riêng — service này bị hack không lộ file của 2 service kia |
| Cần cài thêm gì | Có (`npm install -g pm2`) | Không (có sẵn trên hầu hết Linux server) |
| Nhiều worker/CPU (cluster) | Có sẵn, cấu hình 1 dòng | Có, cần thêm vài bước |
| Xem log | `pm2 logs <tên>` | `journalctl -u <tên> -f` |

**Chưa chắc chọn cách nào? Chọn Cách A (PM2)** — đơn giản hơn, đủ an
toàn cho hầu hết trường hợp.

#### Nếu chọn Cách A (PM2) — tạo 1 tài khoản `hcrc`

```bash
sudo useradd --system --create-home --home-dir /home/hcrc \
  --shell /usr/sbin/nologin hcrc
sudo passwd -l hcrc
```

#### Nếu chọn Cách B (systemd) — tạo 3 tài khoản riêng

```bash
for svc in etl rp-server api-server; do
  sudo useradd --system --no-create-home --shell /usr/sbin/nologin hcrc-$svc
  sudo passwd -l hcrc-$svc
done
```

## 5. Bước 3 — Lấy mã nguồn + cấu hình `.env`

Cài Node.js >= 18 trước (bằng tài khoản của bạn, sudo). Cách A còn cần
cài PM2 toàn máy:

```bash
sudo npm install -g pm2   # CHỈ cần nếu chọn Cách A ở Bước 2 — bỏ qua nếu chọn Cách B
```

#### Nếu chọn Cách A (PM2)

```bash
sudo -u hcrc -H -s /bin/bash
git clone <repo> hcrc && cd hcrc

for svc in etl rp-server api-server; do
  (cd $svc && npm install --omit=dev && cp .env.example .env)
done
```

#### Nếu chọn Cách B (systemd)

Chưa có tài khoản nào sở hữu TOÀN BỘ cây thư mục — cài đặt BẰNG TÀI
KHOẢN CỦA BẠN, vào 1 thư mục dùng chung:

```bash
sudo mkdir -p /opt/hcrc
sudo chown "$(whoami)" /opt/hcrc
git clone <repo> /opt/hcrc && cd /opt/hcrc

for svc in etl rp-server api-server; do
  (cd $svc && npm install --omit=dev && cp .env.example .env)
done
```

#### Cả 2 cách — điền `.env` của cả 3 service

Mở từng file (`nano etl/.env`, `nano rp-server/.env`, `nano api-server/.env`)
và điền đúng — xem bảng đầy đủ ở mục 16, nhưng **3 việc bắt buộc nhất**:

- **Trỏ CSDL sang máy chủ CSDL thật** (mục 3), KHÔNG phải `localhost`:
  `etl/.env` dùng `DWH_SERVER` + `ADMIN_SERVER` (trỏ `HCRC_ETL`);
  `rp-server/.env` dùng `RP_SERVER` (trỏ `HCRC_RP`) + `DWH_SERVER`;
  `api-server/.env` dùng `ADMIN_SERVER` (trỏ `HCRC_API`) + `DWH_SERVER`.
- **Đổi MỌI secret còn là giá trị mẫu** (`ETL_ADMIN_JWT_SECRET`,
  `RP_JWT_SECRET`, `API_ADMIN_JWT_SECRET`, `OAUTH_JWT_SECRET`,
  `ETL_ENCRYPTION_KEY`, `APP_ENCRYPTION_KEY`, `API_ENCRYPTION_KEY`) —
  để nguyên giá trị mẫu thì tiến trình DỪNG NGAY lúc khởi động với lỗi rõ
  ràng (xem log ở bước 8), không lặng lẽ chạy hỏng. Sinh khoá mã hoá bằng:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```
- Giữ nguyên `TRUST_PROXY_HOPS=1` (đúng mô hình 1 Nginx duy nhất).

## 6. Bước 4 — Tạo tài khoản quản trị đầu tiên (bắt buộc để đăng nhập được)

**Đây là bước hay bị bỏ sót nhất** — không có màn hình đăng nhập nào tự
tạo được tài khoản đầu tiên (trang "Phân quyền" cũng cần đăng nhập
trước). Chạy đúng 1 lệnh cho MỖI trong 3 service, SAU khi đã chạy xong
schema (mục 3) và điền xong `.env` (mục 5):

```bash
cd etl        && npm run seed:admin -- ten-dang-nhap mat-khau "Ho Ten" admin && cd ..
cd rp-server  && npm run seed:admin -- ten-dang-nhap mat-khau "Ho Ten"        && cd ..
cd api-server && npm run seed:admin -- ten-dang-nhap mat-khau "Ho Ten" admin  && cd ..
```

> 3 lệnh trên **độc lập với nhau** — mỗi service có bảng tài khoản quản
> trị riêng trong CSDL của chính nó (`etl.` → `HCRC_ETL`, `rp-server` →
> `HCRC_RP`, `api-server` → `HCRC_API`). Tạo xong tài khoản cho `etl`
> KHÔNG có nghĩa là đăng nhập được vào `rp-user`/`api-admin` — phải chạy
> đủ cả 3 lệnh, có thể đặt tên đăng nhập/mật khẩu khác nhau cho từng hệ
> thống. Có thể dùng chung 1 tên đăng nhập cho cả 3 nếu muốn, nhưng đây
> là 3 tài khoản HOÀN TOÀN riêng biệt (không đồng bộ, không dùng chung
> mật khẩu tự động).

Vai trò mặc định là `admin` (đủ quyền thấy mọi trang) — có thể tạo thêm
tài khoản `viewer` (etl-admin/api-admin) sau khi đã đăng nhập được bằng
tài khoản `admin` đầu tiên, qua trang "Phân quyền".

## 7. Bước 5 — Build 3 giao diện + copy sang Nginx

```bash
for app in rp-user api-admin etl-admin; do
  (cd $app && npm install && npm run build)
done
```

Copy sang thư mục Nginx phục vụ tĩnh (chạy BẰNG TÀI KHOẢN CỦA BẠN, sudo
— `/var/www` bình thường chỉ `root` ghi được):

```bash
SRC_DIR=/home/hcrc/hcrc   # Cách A — đổi thành /opt/hcrc nếu bạn chọn Cách B

sudo mkdir -p /var/www/hcrc
for app in rp-user api-admin etl-admin; do
  sudo rm -rf /var/www/hcrc/$app
  sudo cp -r "$SRC_DIR/$app/dist" /var/www/hcrc/$app
done
```

Cách A: thoát khỏi shell `hcrc` (`exit`) sau khi build xong, trước khi
làm bước copy này bằng tài khoản của bạn.

## 8. Bước 6 — Bật tiến trình nền (PM2 hoặc systemd)

#### Nếu chọn Cách A (PM2)

```bash
sudo -u hcrc -H pm2 start /home/hcrc/hcrc/deploy/ecosystem.config.js
sudo -u hcrc -H pm2 save
sudo -u hcrc -H pm2 startup
```

Lệnh cuối in ra 1 dòng lệnh khác (dạng `sudo env PATH=... pm2 startup
systemd -u hcrc --hp /home/hcrc`) — copy đúng dòng đó và chạy tiếp, để
PM2 tự bật lại cùng máy chủ mỗi khi reboot.

Kiểm tra: `sudo -u hcrc -H pm2 status` — cả 3 tiến trình (`hcrc-etl`,
`hcrc-rp-server`, `hcrc-api-server`) phải ở trạng thái `online`.

Cluster nhiều worker đã có sẵn (`deploy/ecosystem.config.js`, mặc định
`instances: 2`) — không cần làm gì thêm, chỉnh qua biến
`PM2_INSTANCES_ETL`/`PM2_INSTANCES_RP`/`PM2_INSTANCES_API` nếu muốn đổi
số worker.

#### Nếu chọn Cách B (systemd)

```bash
NODE_PATH=$(which node)
HCRC_DIR=/opt/hcrc

sudo mkdir -p /etc/systemd/system /etc/hcrc
for f in $HCRC_DIR/deploy/systemd/hcrc-*@.service; do
  sed -e "s|<DUONG-DAN-TOI-THU-MUC-CLONE>|$HCRC_DIR|" \
      -e "s|<DUONG-DAN-NODE-THAT>|$NODE_PATH|" \
      "$f" | sudo tee "/etc/systemd/system/$(basename "$f")" > /dev/null
done

echo "PORT=4003" | sudo tee /etc/hcrc/etl-worker-0.conf > /dev/null
echo "PORT=4001" | sudo tee /etc/hcrc/rp-server-worker-0.conf > /dev/null
echo "PORT=4002" | sudo tee /etc/hcrc/api-server-worker-0.conf > /dev/null

sudo systemctl daemon-reload
sudo systemctl enable --now hcrc-etl@0 hcrc-rp-server@0 hcrc-api-server@0
```

Kiểm tra: `sudo systemctl status hcrc-etl@0 hcrc-rp-server@0
hcrc-api-server@0` — cả 3 phải hiện `active (running)`.

Muốn nhiều worker/CPU? Xem bảng cổng đầy đủ + cách bật thêm worker trong
`deploy/README.md` mục 1, Bước 4.

## 9. Bước 7 — Nginx + DNS + TLS (4 domain)

Trỏ 4 bản ghi A/AAAA (`report`, `api`, `api-admin`, `etl-admin`) về
CÙNG 1 IP máy chủ ứng dụng. Lấy chứng chỉ:

```bash
certbot certonly --nginx -d report.hcrc.vidu.vn -d api.hcrc.vidu.vn \
  -d api-admin.hcrc.vidu.vn -d etl-admin.hcrc.vidu.vn
```

Copy `deploy/nginx.conf` vào `/etc/nginx/conf.d/hcrc.conf`, đổi domain
mẫu `hcrc.vidu.vn` thành domain thật, đổi dải IP `allow` (2 domain nội
bộ `api-admin.*`/`etl-admin.*`) thành IP văn phòng/VPN thật, rồi:

```bash
nginx -t && systemctl reload nginx
```

> **Không có domain "cổng vào chung"** — mỗi giao diện có domain riêng,
> đúng theo bảng ở mục 1. Không xin được 4 subdomain? Xem ghi chú
> "PHƯƠNG ÁN 1 DOMAIN" ở cuối `deploy/nginx.conf`.

**Gia hạn chứng chỉ tự động reload Nginx**:

```bash
sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
echo -e '#!/bin/sh\nnginx -t && systemctl reload nginx' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

## 10. Bước 8 — Đăng nhập lần đầu vào từng trang

Sau bước 6-9, cả 3 trang đã có thể truy cập được. Không có 1 trang "cổng
vào chung" — vào thẳng đúng domain của từng trang:

| Trang | Địa chỉ truy cập | Đăng nhập bằng |
|---|---|---|
| **rp-user** (xem báo cáo + admin báo cáo) | `https://report.hcrc.<domain-cua-ban>/` | Tài khoản tạo ở mục 6, dòng lệnh `rp-server` |
| **api-admin** (quản trị API/đối tác) | `https://api-admin.hcrc.<domain-cua-ban>/` (chỉ vào được từ mạng nội bộ/VPN — xem `allow`/`deny` mục 9) | Tài khoản tạo ở mục 6, dòng lệnh `api-server` |
| **etl-admin** (quản trị đồng bộ dữ liệu) | `https://etl-admin.hcrc.<domain-cua-ban>/` (chỉ vào được từ mạng nội bộ/VPN) | Tài khoản tạo ở mục 6, dòng lệnh `etl` |

**Lần đăng nhập ĐẦU TIÊN của tài khoản `admin`** (cả 3 trang) sẽ bị chặn
ngay ở màn "Bắt buộc đăng ký 2FA" — quét mã QR bằng app Authenticator
(Google Authenticator, Authy, Microsoft Authenticator...), nhập mã 6 số
để xác nhận, KHÔNG vào được trang nào khác cho tới khi hoàn tất. Sau khi
bật 2FA, hệ thống hiện ĐÚNG 1 LẦN 10 mã khôi phục — chép lại/in ra, cất
nơi an toàn (dùng khi mất điện thoại). Chi tiết đầy đủ về 2FA (đặt lại
giúp admin khác, xử lý khi mất cả điện thoại lẫn mã khôi phục) xem
`deploy/README.md` mục 5.

**Không vào được `api-admin`/`etl-admin` dù đúng URL?** — 2 domain này
CHỈ cho phép truy cập từ dải IP nội bộ/VPN đã khai ở Nginx (mục 9, khối
`allow`/`deny`) — kiểm tra máy bạn đang gọi có nằm trong dải IP đó/đã
kết nối VPN chưa. `rp-user` (`report.*`) không bị giới hạn này.

## 11. Bước 9 — Siết quyền file/thư mục lần cuối

#### Nếu chọn Cách A (PM2)

```bash
HCRC_DIR=/home/hcrc/hcrc

sudo chown -R hcrc:hcrc "$HCRC_DIR"
sudo find "$HCRC_DIR" -type d -exec chmod 750 {} \;
sudo find "$HCRC_DIR" -name ".env" -exec chmod 600 {} \;
```

#### Nếu chọn Cách B (systemd)

```bash
HCRC_DIR=/opt/hcrc

sudo chown -R hcrc-etl:hcrc-etl "$HCRC_DIR/etl"
sudo chown -R hcrc-rp-server:hcrc-rp-server "$HCRC_DIR/rp-server"
sudo chown -R hcrc-api-server:hcrc-api-server "$HCRC_DIR/api-server"

for svc_dir in etl rp-server api-server; do
  sudo find "$HCRC_DIR/$svc_dir" -type d -exec chmod 750 {} \;
  sudo find "$HCRC_DIR/$svc_dir" -name ".env" -exec chmod 600 {} \;
done
```

#### Cả 2 cách — thư mục tĩnh Nginx

```bash
sudo chown -R root:www-data /var/www/hcrc   # đổi www-data -> nginx nếu dùng RHEL/CentOS
sudo find /var/www/hcrc -type d -exec chmod 750 {} \;
sudo find /var/www/hcrc -type f -exec chmod 640 {} \;
```

Chi tiết đầy đủ (vì sao, lưu ý `node_modules/.bin/*`...) xem
`deploy/README.md` mục 1, Bước 5.

## 12. Kiểm tra sau triển khai

```bash
curl -I https://report.hcrc.<domain>/                    # ra trang rp-user
curl https://report.hcrc.<domain>/api/health              # {"status":"ok","db":{"rp":"ok","dwh":"ok"},...}
curl https://api.hcrc.<domain>/api/v1/health               # tương tự, ping pool admin/dwh
curl -I https://api.hcrc.<domain>/admin/auth/login          # PHẢI 404 (domain công khai không lộ /admin)
```

Từ máy TRONG mạng nội bộ/VPN:

```bash
curl -I https://api-admin.hcrc.<domain>/    # ra trang đăng nhập
curl -I https://etl-admin.hcrc.<domain>/    # ra trang đăng nhập
```

Từ máy NGOÀI mạng nội bộ (vd điện thoại dùng 4G, tắt VPN):

```bash
curl -I https://api-admin.hcrc.<domain>/    # PHẢI bị từ chối (403/kết nối bị chặn)
```

Danh sách kiểm tra đầy đủ hơn (nén gzip, header IP thật, reload không
rớt request...) xem `deploy/README.md` mục 4.

## 13. Vận hành: log, fail2ban, backup

- **Xem log**: PM2 → `pm2 logs <tên>`; systemd → `journalctl -u <tên>@<worker> -f`.
- **Xoay vòng log**: PM2 cần cài thêm `pm2-logrotate`; systemd tự xoay
  qua `journald`. Chi tiết: `deploy/README.md` mục 7.
- **fail2ban** (khuyến nghị trước khi mở ra Internet thật): xem
  `deploy/fail2ban/README.md`.
- **Backup CSDL**: NGOÀI phạm vi repo này — trách nhiệm của DBA quản lý
  máy chủ CSDL riêng (backup định kỳ cả 4 database, kiểm thử khôi phục
  thử định kỳ, lưu bản sao ở nơi khác máy chủ CSDL chính).

## 14. Cập nhật lên phiên bản mới

#### Nếu chọn Cách A (PM2)

```bash
sudo -u hcrc -H -s /bin/bash
cd /home/hcrc/hcrc
git pull

for svc in etl rp-server api-server; do (cd $svc && npm install --omit=dev); done
for app in rp-user api-admin etl-admin; do (cd $app && npm install && npm run build); done
exit

for app in rp-user api-admin etl-admin; do
  sudo rm -rf /var/www/hcrc/$app
  sudo cp -r /home/hcrc/hcrc/$app/dist /var/www/hcrc/$app
done

sudo -u hcrc -H pm2 reload hcrc-etl
sudo -u hcrc -H pm2 reload hcrc-rp-server
sudo -u hcrc -H pm2 reload hcrc-api-server
```

#### Nếu chọn Cách B (systemd)

Không có tài khoản nào vừa đọc được `.git` (thư mục gốc) vừa ghi được cả
3 thư mục service (mỗi thư mục thuộc 1 tài khoản khác nhau) — cần tạm mở
khoá rồi khoá lại:

```bash
HCRC_DIR=/opt/hcrc

sudo chown -R "$(whoami)" "$HCRC_DIR/etl" "$HCRC_DIR/rp-server" "$HCRC_DIR/api-server"
cd "$HCRC_DIR" && git pull
for svc in etl rp-server api-server; do (cd $svc && npm install --omit=dev); done
for app in rp-user api-admin etl-admin; do (cd $app && npm install && npm run build); done

sudo chown -R hcrc-etl:hcrc-etl "$HCRC_DIR/etl"
sudo chown -R hcrc-rp-server:hcrc-rp-server "$HCRC_DIR/rp-server"
sudo chown -R hcrc-api-server:hcrc-api-server "$HCRC_DIR/api-server"
for svc_dir in etl rp-server api-server; do
  sudo find "$HCRC_DIR/$svc_dir" -type d -exec chmod 750 {} \;
  sudo find "$HCRC_DIR/$svc_dir" -name ".env" -exec chmod 600 {} \;
done

for app in rp-user api-admin etl-admin; do
  sudo rm -rf /var/www/hcrc/$app
  sudo cp -r "$HCRC_DIR/$app/dist" /var/www/hcrc/$app
done

sudo systemctl restart hcrc-etl@0 hcrc-rp-server@0 hcrc-api-server@0
```

Giải thích đầy đủ vì sao cần 2 bước (đã kiểm chứng thật, không chỉ suy
luận) — xem `deploy/README.md` mục 9.

## 15. Xử lý sự cố thường gặp

**Không đăng nhập được vào bất kỳ trang nào (báo sai tài khoản/mật
khẩu)** — chưa chạy `npm run seed:admin` cho đúng service đó (mục 6), 3
lệnh độc lập nhau, phải chạy đủ cả 3.

**Vào đúng URL `api-admin.*`/`etl-admin.*` nhưng bị từ chối/không kết
nối được** — máy đang gọi không nằm trong dải IP `allow` khai ở
`deploy/nginx.conf` (mục 9) — kiểm tra IP thật/kết nối VPN.

**Tiến trình khởi động rồi tắt ngay (PM2 `errored`/systemd `failed`)** —
gần như luôn là do 1 secret trong `.env` còn để giá trị mẫu (mục 5) —
xem log (`pm2 logs <tên>` hoặc `journalctl -u <tên>@<worker> -n 50`) để
biết chính xác biến nào.

**`curl .../api/health` trả 503** — 1 trong các pool CSDL không kết nối
được — response nêu rõ pool nào (`rp`/`dwh`/`admin`) — kiểm tra lại
`*_SERVER`/`*_PORT`/`*_USER`/`*_PASSWORD` tương ứng trong `.env` và
tường lửa port 1433 giữa 2 máy chủ.

**Đã đăng nhập được nhưng vào 1 trang cụ thể thấy trống/lỗi 403** — kiểm
tra vai trò tài khoản (`admin`/`viewer`/`target_importer`) — 1 số trang
chỉ `admin` thấy được (vd "Phân quyền", "Đối tác").

Xử lý sự cố kỹ thuật sâu hơn (restart-loop, reload không rớt request...)
xem `deploy/README.md`, mục "Câu hỏi thường gặp".

## 16. Bảng biến môi trường (`.env`)

Tham khảo đầy đủ trong `.env.example` của từng service (có chú thích chi
tiết kèm theo từng biến). Các biến quan trọng nhất:

**`etl/.env`**

| Biến | Ghi chú |
|---|---|
| `DWH_SERVER/PORT/DATABASE/USER/PASSWORD` | Kết nối `HCRC_DWH` (chỉ ghi `dwh.ReportFacts`) |
| `ADMIN_SERVER/PORT/DATABASE/USER/PASSWORD` | Kết nối `HCRC_ETL` (nguồn dữ liệu, job đồng bộ, tài khoản quản trị) |
| `ETL_ADMIN_JWT_SECRET` | Ký phiên đăng nhập `etl-admin/` — bắt buộc đổi khỏi giá trị mẫu |
| `ETL_ENCRYPTION_KEY` | Mã hoá mật khẩu các nguồn dữ liệu lưu trong `etl.DataSources` |
| `ETL_ADMIN_ALLOWED_IPS` | Danh sách IP thêm được phép gọi `/admin/*` (lớp phòng thủ bổ sung, ngoài Nginx) |

**`rp-server/.env`**

| Biến | Ghi chú |
|---|---|
| `RP_SERVER/PORT/DATABASE/USER/PASSWORD` | Kết nối `HCRC_RP` (người dùng/quyền/cấu hình) |
| `DWH_SERVER/PORT/DATABASE/USER/PASSWORD` | Kết nối `HCRC_DWH` (chỉ đọc, nguồn báo cáo mặc định) |
| `RP_JWT_SECRET` | Ký phiên đăng nhập `rp-user/` |
| `APP_ENCRYPTION_KEY` | Mã hoá mật khẩu nguồn dữ liệu bổ sung + cấu hình email |

**`api-server/.env`**

| Biến | Ghi chú |
|---|---|
| `DWH_SERVER/PORT/DATABASE/USER/PASSWORD` | Kết nối `HCRC_DWH` (chỉ đọc, cho `/api/v1/reports`) |
| `ADMIN_SERVER/PORT/DATABASE/USER/PASSWORD` | Kết nối `HCRC_API` (đối tác, tài khoản quản trị, log request) |
| `API_ADMIN_JWT_SECRET` | Ký phiên đăng nhập `api-admin/` |
| `OAUTH_JWT_SECRET` | Ký access token OAuth2 cho đối tác dùng `AuthMethod='oauth2'` |
| `API_ENCRYPTION_KEY` | Mã hoá mật khẩu nguồn dữ liệu + `HmacSecret` đối tác |
| `ADMIN_ALLOWED_IPS` | Danh sách IP thêm được phép gọi `/admin/*` |
| `CORS_ALLOWED_ORIGINS` | Chỉ cần nếu đối tác gọi `/api/v1/*` trực tiếp từ trình duyệt (hiếm) |

Cả 3 service dùng chung nguyên tắc: `TRUST_PROXY_HOPS=1` (mô hình 1
Nginx duy nhất), `*_POOL_MAX`/`*_POOL_MIN` (kết nối CSDL/worker — nhân
với số worker cluster để ra tổng kết nối thật), `AUDIT_LOG_RETENTION_DAYS`
+ `CLEANUP_CRON` (dọn log định kỳ).

## 17. Câu hỏi thường gặp

**Tài khoản hệ điều hành (`hcrc`/`hcrc-etl`/...) và tài khoản đăng nhập
web (tạo bằng `seed:admin`) có phải 1 không?** — KHÔNG liên quan gì tới
nhau. Tài khoản hệ điều hành (mục 4) sở hữu tiến trình Node + file trên
máy chủ, không đăng nhập được, không có mật khẩu web. Tài khoản đăng
nhập web (mục 6) là 1 dòng trong CSDL (`admin.AdminUsers`/`app.Users`),
dùng để đăng nhập vào `rp-user`/`api-admin`/`etl-admin` qua trình duyệt.

**3 tài khoản admin (etl/rp-server/api-server) có tự động giống nhau
không?** — Không, hoàn toàn độc lập (mục 6) — phải tạo riêng cho từng
service bằng đúng 3 lệnh `seed:admin` khác nhau.

**Vì sao 2 trang quản trị (`api-admin`/`etl-admin`) không dùng domain
công khai cho tiện?** — Mật khẩu là lớp phòng thủ DUY NHẤT nếu domain lộ
công khai. Domain riêng + `allow`/`deny` theo IP ở Nginx là lớp phòng
thủ THÊM, độc lập với mật khẩu.

**Có bắt buộc đúng 4 domain/subdomain không?** — Không, xem ghi chú
"PHƯƠNG ÁN 1 DOMAIN" ở cuối `deploy/nginx.conf`.

Các câu hỏi kỹ thuật sâu hơn (an toàn của Cách A vs Cách B, PM2/systemd
tự khởi động lại khi crash...) đã có đầy đủ trong `deploy/README.md`,
mục "Câu hỏi thường gặp".
