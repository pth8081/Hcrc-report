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
   │  hcrc-rp-server (:4001)  hcrc-api-server (:4002)  hcrc-etl (:4003) │
   │  (chạy bằng PM2 hoặc systemd — chọn 1 trong 2, xem mục 1)          │
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

Mục 1 gồm 5 bước làm THEO THỨ TỰ:

1. **Chọn cách chạy + tạo tài khoản tương ứng** — quyết định QUAN TRỌNG
   NHẤT, vì nó quyết định luôn cách làm ở 4 bước còn lại.
2. Cài đặt code + build.
3. Copy giao diện sang Nginx.
4. Bật tiến trình nền (theo cách đã chọn ở Bước 1).
5. Siết quyền file/thư mục lần cuối.

### Bước 1 — Chọn cách chạy + tạo tài khoản

**Vì sao phải tạo tài khoản riêng?** Nếu không, tiến trình Node sẽ chạy
dưới tài khoản bạn đang SSH vào (thường là `root`) — 1 lỗ hổng bất kỳ
trong code sẽ cho kẻ tấn công LUÔN quyền của tài khoản đó, tức là toàn
quyền máy chủ. Tài khoản này là tài khoản HỆ ĐIỀU HÀNH, không đăng nhập
được, không sudo — **khác hoàn toàn** tài khoản CSDL (`DWH_USER`/
`RP_USER`/..., xem mục 2), 2 việc riêng, không thay thế nhau được (xem
FAQ cuối bài).

**Chọn 1 trong 2 cách** (không đổi ý giữa chừng — cách chọn ở đây quyết
định toàn bộ các bước sau):

| So sánh nhanh | Cách A — PM2 | Cách B — systemd |
|---|---|---|
| Tài khoản chạy ứng dụng | **1 tài khoản dùng chung** cho cả 3 service | **3 tài khoản riêng**, mỗi service 1 tài khoản — service này bị hack không lộ file của 2 service kia |
| Cần cài thêm gì | Có — `npm install -g pm2` | Không — `systemd` có sẵn trên hầu hết Linux server |
| Nhiều worker/CPU (cluster) | Có sẵn, cấu hình 1 dòng | Có, cần thêm vài bước (cổng riêng + sửa Nginx) — hướng dẫn đủ ở Bước 4 |
| Xem log | `pm2 logs <tên>` | `journalctl -u <tên> -f` |
| Xoay vòng log | Phải cài thêm `pm2-logrotate` | Có sẵn qua `journald`, không cần cài gì |
| Phù hợp khi nào | Muốn đơn giản, thao tác quen thuộc (`pm2 status`, `pm2 logs`...) | Muốn cô lập mạnh hơn giữa 3 service, không muốn cài thêm phần mềm ngoài |

**Chưa chắc chọn cách nào? Chọn Cách A (PM2)** — đơn giản hơn, đủ an toàn
cho hầu hết trường hợp. Chọn Cách B nếu bạn CHỦ ĐỘNG muốn tài khoản riêng
biệt cho từng service (an toàn hơn 1 bậc, đổi lại nhiều bước hơn).

#### Nếu chọn Cách A (PM2) — tạo 1 tài khoản `hcrc`

```bash
sudo useradd --system --create-home --home-dir /home/hcrc \
  --shell /usr/sbin/nologin hcrc   # 1 số bản Linux dùng /sbin/nologin
sudo passwd -l hcrc   # khoá mật khẩu — không ai đăng nhập được bằng mật khẩu
```

(`--create-home` cần thiết dù tài khoản không login được — PM2 lưu trạng
thái/log tại `~/.pm2` của tài khoản đang chạy nó.)

#### Nếu chọn Cách B (systemd) — tạo 3 tài khoản riêng

```bash
for svc in etl rp-server api-server; do
  sudo useradd --system --no-create-home --shell /usr/sbin/nologin hcrc-$svc
  sudo passwd -l hcrc-$svc
done
```

(`--no-create-home` — KHÔNG cần thư mục home như PM2, vì systemd tự quản
lý log qua `journald`, không cần nơi lưu trạng thái riêng như `~/.pm2`.)
Kết quả: 3 tài khoản `hcrc-etl`, `hcrc-rp-server`, `hcrc-api-server` — mỗi
tài khoản sẽ CHỈ sở hữu đúng 1 thư mục service tương ứng (làm ở Bước 5),
không đọc được `.env` của 2 service còn lại dù bị chiếm quyền.

### Bước 2 — Cài đặt code + build

**Cài Node.js >= 18 trước, nếu chưa có** (bằng tài khoản của bạn, sudo).
Cách A còn cần cài PM2 toàn máy — Cách B thì không:

```bash
sudo npm install -g pm2   # CHỈ cần nếu chọn Cách A ở Bước 1 — bỏ qua nếu chọn Cách B
```

#### Nếu chọn Cách A (PM2)

MỌI lệnh còn lại trong Bước 2 chạy **bên trong 1 shell mang quyền `hcrc`**
— mở shell đó, giữ mở tới hết Bước 2:

```bash
sudo -u hcrc -H -s /bin/bash
git clone <repo> hcrc && cd hcrc

for svc in etl rp-server api-server; do
  (cd $svc && npm install --omit=dev && cp .env.example .env)
done
```

#### Nếu chọn Cách B (systemd)

Chưa có tài khoản nào sở hữu TOÀN BỘ cây thư mục (3 tài khoản ở Bước 1
mỗi tài khoản chỉ sở hữu ĐÚNG 1 thư mục service, gán ở Bước 5) — nên cài
đặt/build làm BẰNG TÀI KHOẢN CỦA BẠN, vào 1 thư mục dùng chung:

```bash
sudo mkdir -p /opt/hcrc
sudo chown "$(whoami)" /opt/hcrc   # tạm thời, để bạn tự cài/build không cần sudo từng lệnh
git clone <repo> /opt/hcrc && cd /opt/hcrc

for svc in etl rp-server api-server; do
  (cd $svc && npm install --omit=dev && cp .env.example .env)
done
```

#### Cả 2 cách — điền `.env` + build giao diện

Điền `.env` từng service (mở bằng `nano etl/.env` chẳng hạn) — 3 việc
QUAN TRỌNG nhất, đủ để chạy đúng mô hình "CSDL máy khác":

- `etl/.env`: `DWH_SERVER`, `ADMIN_SERVER` — trỏ sang **IP/hostname máy chủ
  CSDL**, KHÔNG phải `localhost`. `rp-server/.env` dùng `RP_SERVER` +
  `DWH_SERVER`, `api-server/.env` dùng `ADMIN_SERVER` + `DWH_SERVER` —
  cùng nguyên tắc.
- Đổi MỌI secret còn là giá trị mẫu (`*_JWT_SECRET`, `*_ENCRYPTION_KEY`) —
  để nguyên giá trị mẫu thì tiến trình DỪNG NGAY lúc khởi động với lỗi rõ
  ràng (xem log ở Bước 4), không lặng lẽ chạy hỏng.
- Giữ nguyên `TRUST_PROXY_HOPS=1` (đúng mô hình 1 Nginx duy nhất). Cách A
  đã có sẵn `NODE_ENV=production` trong `deploy/ecosystem.config.js`; Cách
  B đặt trong file service ở Bước 4 — không cần tự thêm vào `.env`.

Sau khi điền `.env`, chạy schema + tạo tài khoản CSDL quyền tối thiểu
(TRÊN MÁY CHỦ CSDL, xem mục 2 bên dưới — không làm trên máy này), rồi tạo
tài khoản quản trị đầu tiên (`npm run seed:admin`, xem README từng
service). Xong 2 việc đó mới build giao diện:

```bash
for app in rp-user api-admin etl-admin; do
  (cd $app && npm install && npm run build)
done
```

Cách A: thoát khỏi shell `hcrc` (`exit`) trước khi qua Bước 3. Cách B:
không cần thoát gì (đang ở tài khoản của bạn từ đầu).

### Bước 3 — Copy giao diện sang Nginx

Chạy BẰNG TÀI KHOẢN CỦA BẠN (sudo) — `/var/www` bình thường chỉ `root` ghi
được:

```bash
SRC_DIR=/home/hcrc/hcrc   # Cách A — đổi thành /opt/hcrc nếu bạn chọn Cách B

sudo mkdir -p /var/www/hcrc
for app in rp-user api-admin etl-admin; do
  sudo rm -rf /var/www/hcrc/$app
  sudo cp -r "$SRC_DIR/$app/dist" /var/www/hcrc/$app
done
```

### Bước 4 — Bật tiến trình nền

#### Nếu chọn Cách A (PM2)

3 lệnh, chạy bằng tài khoản của bạn (sudo):

```bash
sudo -u hcrc -H pm2 start /home/hcrc/hcrc/deploy/ecosystem.config.js
sudo -u hcrc -H pm2 save
sudo -u hcrc -H pm2 startup
```

Lệnh cuối (`pm2 startup`) sẽ IN RA MÀN HÌNH 1 dòng lệnh khác (dạng `sudo
env PATH=... pm2 startup systemd -u hcrc --hp /home/hcrc`) — **copy đúng
dòng đó và chạy tiếp** (đang ở tài khoản của bạn, có sudo sẵn, không cần
làm gì thêm). Đây là cách để PM2 tự bật lại cùng máy chủ mỗi khi khởi động
lại — PM2 không tự làm được việc này vì cần quyền root để đăng ký với
systemd.

Kiểm tra: `sudo -u hcrc -H pm2 status` — cả 3 tiến trình (`hcrc-etl`,
`hcrc-rp-server`, `hcrc-api-server`) phải ở trạng thái `online`.

**Cluster/nhiều worker đã có sẵn, không cần làm gì thêm**:
`deploy/ecosystem.config.js` chạy MỖI service ở `exec_mode: 'cluster'`,
mặc định `instances: 2` — tổng cộng **6 tiến trình Node** trên cùng 1 máy
(chỉnh số này qua biến môi trường `PM2_INSTANCES_ETL`/`PM2_INSTANCES_RP`/
`PM2_INSTANCES_API` trước khi `pm2 start`, xem chú thích đầu
`deploy/ecosystem.config.js`). Mỗi worker tự mở 1 pool kết nối CSDL riêng
— tổng số kết nối thật sự mở tới SQL Server = `instances × *_POOL_MAX`
(biến trong `.env` từng service). Tăng `instances` theo số lõi CPU máy chủ
mà KHÔNG chỉnh lại `*_POOL_MAX` tương ứng dễ vượt giới hạn kết nối cho
phép của SQL Server.

#### Nếu chọn Cách B (systemd)

3 file mẫu (dạng TEMPLATE — tên có `@`) có sẵn trong `deploy/systemd/`:
`hcrc-etl@.service`, `hcrc-rp-server@.service`, `hcrc-api-server@.service`
— mỗi service chạy dưới TÀI KHOẢN RIÊNG đã tạo ở Bước 1 (khai sẵn trong
file, không cần `sudo -u` khi chạy lệnh — chính systemd tự hạ quyền).
"Template" nghĩa là 1 file dùng chung cho N worker — bật `hcrc-etl@0` là 1
worker, bật thêm `hcrc-etl@1` là worker thứ 2, v.v.

**Sửa đường dẫn trong file mẫu** (2 chỗ `<...>` — đường dẫn thư mục clone,
đường dẫn `node` thật lấy từ `which node`, KHÔNG giả định `/usr/bin/node`):

```bash
NODE_PATH=$(which node)
HCRC_DIR=/opt/hcrc               # đổi nếu bạn clone vào chỗ khác

sudo mkdir -p /etc/systemd/system /etc/hcrc
for f in $HCRC_DIR/deploy/systemd/hcrc-*@.service; do
  sed -e "s|<DUONG-DAN-TOI-THU-MUC-CLONE>|$HCRC_DIR|" \
      -e "s|<DUONG-DAN-NODE-THAT>|$NODE_PATH|" \
      "$f" | sudo tee "/etc/systemd/system/$(basename "$f")" > /dev/null
done
```

**Tạo file cổng cho worker 0** (đủ dùng nếu chỉ chạy 1 worker/service —
xem bảng bên dưới nếu muốn nhiều worker):

```bash
echo "PORT=4003" | sudo tee /etc/hcrc/etl-worker-0.conf > /dev/null
echo "PORT=4001" | sudo tee /etc/hcrc/rp-server-worker-0.conf > /dev/null
echo "PORT=4002" | sudo tee /etc/hcrc/api-server-worker-0.conf > /dev/null
```

Đăng ký với systemd rồi bật worker 0 của cả 3 service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now hcrc-etl@0 hcrc-rp-server@0 hcrc-api-server@0
```

Kiểm tra: `sudo systemctl status hcrc-etl@0 hcrc-rp-server@0
hcrc-api-server@0` — cả 3 phải hiện `active (running)`.

**Muốn nhiều worker/CPU (cluster)?** Lặp lại: tạo thêm 1 file cổng, rồi
`enable --now` thêm 1 worker, cho MỖI worker thêm — cổng đã tính sẵn ở
bảng dưới (không trùng nhau, không trùng cổng nào khác trên máy):

| Service | worker 0 (mặc định) | worker 1 | worker 2 | worker 3 |
|---|---|---|---|---|
| etl | 4003 | 4013 | 4023 | 4033 |
| rp-server | 4001 | 4011 | 4021 | 4031 |
| api-server | 4002 | 4012 | 4022 | 4032 |

Ví dụ bật thêm worker 1 cho `rp-server`:

```bash
echo "PORT=4011" | sudo tee /etc/hcrc/rp-server-worker-1.conf > /dev/null
sudo systemctl enable --now hcrc-rp-server@1
```

Rồi **thêm 1 dòng vào `deploy/nginx.conf`** (khối `upstream hcrc_rp_server`
— xem ghi chú "Nhiều worker" ngay phía trên khối đó) để Nginx biết chia
tải sang worker mới, sau đó `nginx -t && sudo systemctl reload nginx`.
KHÔNG cần sửa gì cho `etl` (không có route Nginx công khai, VPN gọi trực
tiếp `/health` không cần chia tải nhiều worker).

Mỗi worker tự mở 1 pool kết nối CSDL riêng (không dùng chung) — tổng số
kết nối thật sự mở tới SQL Server = (số worker) × `*_POOL_MAX` (biến trong
`.env`). Tăng số worker theo số lõi CPU máy chủ mà KHÔNG chỉnh lại
`*_POOL_MAX` tương ứng dễ vượt giới hạn kết nối cho phép của SQL Server.

Không cần chỉnh gì thêm cho việc gửi email báo cáo/cảnh báo/dọn log định
kỳ — CHỈ worker `@0` chạy các job đó (xem `Environment=NODE_APP_INSTANCE`
trong file service + chú thích `lib/clusterLeader.js`), các worker khác
không chạy lại, không lo gửi trùng lặp.

#### Bảng tra lệnh nhanh (dùng khi đọc tiếp mục 4, 7 — viết mặc định theo Cách A)

Từ mục 4 trở đi, tài liệu viết lệnh theo Cách A (PM2). Nếu bạn chọn Cách B
(systemd), tra bảng này để đổi lệnh — `<tên>` là 1 trong 3
(`hcrc-etl`/`hcrc-rp-server`/`hcrc-api-server`), `<worker>` là số worker
(`0` nếu chỉ chạy 1 worker):

| Việc cần làm | PM2 (mặc định tài liệu) | systemd (nếu bạn chọn Cách B) |
|---|---|---|
| Xem trạng thái | `sudo -u hcrc -H pm2 status` | `sudo systemctl status <tên>@<worker>` |
| Xem log | `sudo -u hcrc -H pm2 logs <tên>` | `journalctl -u <tên>@<worker> -f` |
| Khởi động lại, không rớt request | `sudo -u hcrc -H pm2 reload <tên>` | `sudo systemctl restart <tên>@<worker>` (dừng hẳn rồi bật lại — có ngắt ngắn, chỉ worker đó bị ảnh hưởng, worker khác vẫn phục vụ) |
| Dừng hẳn | `sudo -u hcrc -H pm2 stop <tên>` | `sudo systemctl stop <tên>@<worker>` |
| Xoay vòng log | Cài `pm2-logrotate` (mục 7) | Tự động, không cần làm gì |

### Bước 5 — Siết quyền file/thư mục lần cuối

Chạy bằng tài khoản của bạn (sudo), sau khi đã xong Bước 2-4.

#### Nếu chọn Cách A (PM2)

Đảm bảo dù `git clone`/`npm install` để lại quyền mặc định lỏng lẻo, thư
mục ứng dụng vẫn CHỈ `hcrc` và `root` truy cập được:

```bash
HCRC_DIR=/home/hcrc/hcrc   # đổi lại nếu bạn clone vào đường dẫn khác

sudo chown -R hcrc:hcrc "$HCRC_DIR"
sudo find "$HCRC_DIR" -type d -exec chmod 750 {} \;   # thư mục: chỉ hcrc + root vào được
sudo find "$HCRC_DIR" -name ".env" -exec chmod 600 {} \;   # .env: CHỈ hcrc đọc/ghi được
```

#### Nếu chọn Cách B (systemd)

**Đây chính là bước "phân quyền" bạn muốn** — mỗi tài khoản CHỈ sở hữu
ĐÚNG 1 thư mục service, không đọc được `.env` của 2 service còn lại:

```bash
HCRC_DIR=/opt/hcrc   # đổi lại nếu bạn clone vào đường dẫn khác

sudo chown -R hcrc-etl:hcrc-etl "$HCRC_DIR/etl"
sudo chown -R hcrc-rp-server:hcrc-rp-server "$HCRC_DIR/rp-server"
sudo chown -R hcrc-api-server:hcrc-api-server "$HCRC_DIR/api-server"

for svc_dir in etl rp-server api-server; do
  sudo find "$HCRC_DIR/$svc_dir" -type d -exec chmod 750 {} \;
  sudo find "$HCRC_DIR/$svc_dir" -name ".env" -exec chmod 600 {} \;
done
```

Sau lệnh này, TÀI KHOẢN CỦA BẠN không còn tự `cd`/sửa được 3 thư mục đó
nữa (đúng ý — chỉ tài khoản dịch vụ tương ứng + root vào được) — cập nhật
code sau này (git pull/build lại) dùng `sudo -u hcrc-etl -H <lệnh>` (tương
tự cách dùng `sudo -u hcrc` ở Cách A).

#### Cả 2 cách

Ghi chú chung: KHÔNG chỉnh quyền từng file bên trong (chỉ chỉnh cấp thư
mục ở trên) — `node_modules/.bin/*` cần giữ nguyên bit thực thi để lần
`npm install`/`build` SAU không lỗi "Permission denied". Siết `750` ở
thư mục đã đủ chặn "người khác" trên máy — Linux đòi quyền "đi qua" ở MỌI
thư mục cha mới đọc được file bên trong. `.env` vẫn siết riêng để phòng
khi sau này ai đó lỡ nới thư mục cha.

Thư mục tĩnh cho Nginx (`/var/www/hcrc`) cần quy tắc riêng, GIỐNG NHAU cho
cả 2 cách — Nginx (tài khoản `www-data` trên Debian/Ubuntu, `nginx` trên
RHEL/CentOS) cần ĐỌC được nhưng không bao giờ cần GHI:

```bash
sudo chown -R root:www-data /var/www/hcrc   # đổi www-data -> nginx nếu dùng RHEL/CentOS
sudo find /var/www/hcrc -type d -exec chmod 750 {} \;
sudo find /var/www/hcrc -type f -exec chmod 640 {} \;
```

**Còn thiếu, khuyến nghị làm ở đợt sau**: 3 tiến trình Node hiện lắng nghe
trên MỌI địa chỉ mạng (`0.0.0.0`), dù Nginx chỉ gọi vào `127.0.0.1:<cổng>`
— nếu máy chủ có IP công khai và thiếu firewall chặn riêng các cổng đang
dùng (4001-4003, hoặc thêm các cổng worker phụ nếu chạy cluster), có thể
bị gọi thẳng vào, bỏ qua giới hạn IP nội bộ Nginx đang áp cho
`api-admin`/`etl-admin`. 2 cách vá (chọn 1, làm sau): (a) firewall chặn
các cổng đó từ mọi nguồn trừ chính máy chủ, hoặc (b) sửa
`app.listen(PORT, ...)` thành `app.listen(PORT, '127.0.0.1', ...)` ở cả 3
`server.js`.

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

**Mọi lệnh `pm2 ...` từ mục này trở đi** (kể cả các mục sau) giả định bạn
chạy theo **Cách A — PM2** (Bước 4, mục 1) — chạy dưới tài khoản dịch vụ
`hcrc` (Bước 1, mục 1), gõ `sudo -u hcrc -H pm2 ...` thay vì `pm2 ...`
trực tiếp nếu bạn không đang ở trong shell đã mở bằng `sudo -u hcrc -H -s
/bin/bash`, nếu không PM2 sẽ tìm nhầm sang "bản PM2 của riêng tài khoản
bạn" (rỗng, chưa từng `pm2 start` gì) và báo không thấy tiến trình nào dù
`hcrc` vẫn đang chạy bình thường. **Đang dùng Cách B — systemd?** — tra
"Bảng tra lệnh nhanh" cuối Bước 4 (mục 1) để đổi lệnh tương ứng.

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

- **PM2 (Cách A, Bước 4 mục 1)** (`console.log`/`console.error` của cả 3 tiến
  trình — lịch sử đồng bộ, lỗi request...) ghi vào `~/.pm2/logs/*.log`
  **của tài khoản `hcrc`** (tức `/home/hcrc/.pm2/logs/*.log`), PM2 KHÔNG tự
  xoay vòng các file này. Cài `pm2-logrotate` (nhớ `sudo -u hcrc -H`, xem
  lưu ý đầu mục 4):
  ```bash
  sudo -u hcrc -H pm2 install pm2-logrotate
  sudo -u hcrc -H pm2 set pm2-logrotate:max_size 50M
  sudo -u hcrc -H pm2 set pm2-logrotate:retain 14
  ```
  **Dùng Cách B (systemd) thay vì PM2?** — KHÔNG cần bước này: log đã ghi
  thẳng vào `journald` (`StandardOutput=journal` trong `deploy/systemd/*.service`),
  `systemd-journald` tự xoay vòng theo dung lượng — chỉnh mức trần ở
  `/etc/systemd/journald.conf` (`SystemMaxUse=500M` chẳng hạn) rồi
  `sudo systemctl restart systemd-journald` nếu muốn đổi mặc định.
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

**PM2/systemd tự khởi động lại khi 1 tiến trình lỗi/crash?** — Có, cả 2
Cách (Bước 4, mục 1). 3 tiến trình độc lập nhau — `etl` lỗi không kéo sập
`rp-server`/`api-server` và ngược lại. Cách A (PM2, `deploy/ecosystem.config.js`)
có giới hạn `min_uptime`/`max_restarts` chống restart-loop vô hạn nếu
tiến trình thoát NGAY lúc khởi động (vd cấu hình sai — xem mục "Kiểm tra
cấu hình" ở trên): sau 10 lần thoát sớm liên tiếp, PM2 NGỪNG tự thử,
chuyển trạng thái `errored` (`pm2 status` thấy rõ) thay vì cắm restart
mãi. Sửa xong `.env` rồi chạy `pm2 restart <tên>` (nhớ `sudo -u hcrc -H`,
xem lưu ý đầu mục 4) để PM2 thử lại từ đầu. Cách B (systemd) tương đương
bằng `StartLimitIntervalSec`/`StartLimitBurst` (đã đặt sẵn trong
`deploy/systemd/*@.service`) — thoát quá 10 lần trong 200 giây thì chuyển
`failed` (`systemctl status <tên>@<worker>` thấy rõ), sửa xong `.env` rồi
`sudo systemctl restart <tên>@<worker>` để thử lại.

**Nginx có cần cấu hình gì cho CSDL không?** — Không. CSDL chỉ được các
tiến trình Node kết nối trực tiếp qua `.env` (`*_SERVER`/`*_PORT`), không
đi qua Nginx, không có route/domain nào của Nginx trỏ tới CSDL.

**Tài khoản `hcrc`/`hcrc-etl`/... (Bước 1, mục 1) và tài khoản CSDL
(`DWH_USER`/`RP_USER`/..., mục 2) có phải 1 không, có cần trùng tên/mật
khẩu không?** — KHÔNG liên quan gì tới nhau, dù có thể trùng tên "hcrc"
nghe giống. Tài khoản ở Bước 1 là tài khoản HỆ ĐIỀU HÀNH sở hữu tiến trình
Node + file trên máy chủ ứng dụng — tự tạo bằng `useradd`, không cần mật
khẩu, không đăng nhập được (Cách A: 1 tài khoản chung `hcrc`; Cách B: 3
tài khoản riêng `hcrc-etl`/`hcrc-rp-server`/`hcrc-api-server`). Tài khoản
CSDL là bên trong SQL Server (`sqlcmd`/SSMS tạo bằng `*/grants.sql`) —
dùng để tiến trình Node XÁC THỰC VỚI CSDL qua `.env`, hoàn toàn không
liên quan tới hệ điều hành. Cần làm ĐỦ CẢ 2, thiếu 1 trong 2 vẫn hở: chỉ
tạo tài khoản hệ điều hành riêng mà vẫn dùng tài khoản CSDL `sa`/quyền cao
cho `.env` thì 1 lỗi SQL injection lọt qua vẫn đọc/sửa được TOÀN BỘ CSDL;
chỉ tạo tài khoản CSDL quyền hẹp mà vẫn chạy Node bằng `root` thì 1 lỗi
RCE vẫn cho kẻ tấn công toàn quyền máy chủ.

**Cách B (systemd, 3 tài khoản riêng) có thật sự an toàn hơn Cách A
không, hay chỉ phức tạp hơn cho có?** — An toàn hơn THẬT, không chỉ hình
thức: ở Cách A, nếu `etl` bị khai thác 1 lỗ hổng RCE, tiến trình độc hại
chạy dưới tài khoản `hcrc` — CÙNG tài khoản đang sở hữu luôn `.env` của
`rp-server` và `api-server` (cùng 1 người dùng hệ điều hành thì đọc được
hết file của chính mình, bất kể nằm ở thư mục con nào) — bí mật JWT/mật
khẩu CSDL của CẢ 3 hệ thống coi như lộ. Ở Cách B, `etl` chạy dưới
`hcrc-etl`, thư mục `rp-server/api-server` thuộc sở hữu tài khoản KHÁC
(`hcrc-rp-server`/`hcrc-api-server`) với quyền `750` — `hcrc-etl` bị chiếm
quyền cũng KHÔNG tự đọc được 2 thư mục đó. Đánh đổi: nhiều bước cài đặt
hơn, và việc cập nhật code sau này cũng phải làm riêng cho từng thư mục
(`sudo -u hcrc-etl -H git pull` thay vì 1 lệnh chung).
