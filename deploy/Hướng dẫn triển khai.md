# Hướng dẫn triển khai — HCRC Voucher Redemption App

Tài liệu này hướng dẫn triển khai đầy đủ **HCRC Voucher Redemption App**
lên máy chủ Linux production (Ubuntu/Debian — lệnh cài gói có thể khác
đôi chút trên CentOS/RHEL), từ lấy mã nguồn tới bật HTTPS và checklist
bàn giao. Đọc theo đúng thứ tự nếu là lần triển khai đầu tiên; nếu chỉ
cần cập nhật code mới lên bản đã chạy sẵn, xem thẳng mục **"14. Cập nhật
lên phiên bản mới"**.

Nếu bạn cần hiểu **nghiệp vụ, cấu hình API, cấu hình báo cáo**, xem file
riêng `Hướng dẫn nghiệp vụ.md` (cùng thư mục) — file này chỉ nói về hạ
tầng/cài đặt máy chủ.

**Ghi chú cập nhật**: mọi thay đổi/hướng dẫn mới liên quan hạ tầng, cài
đặt, vận hành máy chủ nên bổ sung vào CHÍNH file này; thay đổi nghiệp vụ
bổ sung vào `Hướng dẫn nghiệp vụ.md`.

> **Đọc trước khi làm**: app này **KHÔNG đi kèm DB riêng** — nó **kết nối
> vào DB MSSQL hiện có** của hệ thống Core Voucher và **kế thừa nguyên
> vẹn** dữ liệu/tài khoản đang có (`Users`, `Locations_Group`,
> `Locations_Detail`, `VOUCHER_SYNC`, `Voucher_Exelogs`). Bước migrate
> chỉ **thêm bảng mới** cho nghiệp vụ riêng của app, không bao giờ
> `ALTER`/`DROP` hay sửa dữ liệu trên các bảng cũ — an toàn chạy trên DB
> đang production, không cần tạo DB/schema mới.

## Mục lục

1. [Yêu cầu hệ thống](#1-yêu-cầu-hệ-thống)
2. [Lấy mã nguồn + cài dependencies](#2-lấy-mã-nguồn--cài-dependencies)
3. [Kết nối vào DB hiện có + tạo tài khoản admin đầu tiên](#3-kết-nối-vào-db-hiện-có--tạo-tài-khoản-admin-đầu-tiên)
4. [Chạy thử trên máy local (tuỳ chọn)](#4-chạy-thử-trên-máy-local-tuỳ-chọn)
5. [Cấu hình domain thật cho PWA + đăng nhập vân tay/Face ID](#5-cấu-hình-domain-thật-cho-pwa--đăng-nhập-vân-tayface-id)
6. [Tạo tài khoản hệ thống riêng (bảo mật)](#6-tạo-tài-khoản-hệ-thống-riêng-bảo-mật)
7. [Chạy thật ở production: PM2 hoặc systemd](#7-chạy-thật-ở-production-pm2-hoặc-systemd)
8. [Cluster nhiều worker](#8-cluster-nhiều-worker)
9. [Nginx reverse proxy + HTTPS](#9-nginx-reverse-proxy--https)
10. [Tường lửa](#10-tường-lửa)
11. [Checklist xác nhận sau khi triển khai](#11-checklist-xác-nhận-sau-khi-triển-khai)
12. [Vận hành hàng ngày](#12-vận-hành-hàng-ngày)
13. [Sao lưu (backup)](#13-sao-lưu-backup)
14. [Cập nhật lên phiên bản mới](#14-cập-nhật-lên-phiên-bản-mới)
15. [Xử lý sự cố thường gặp](#15-xử-lý-sự-cố-thường-gặp)
16. [Bảng biến môi trường (`.env`)](#16-bảng-biến-môi-trường-env)

---

## 1. Yêu cầu hệ thống

| Thành phần | Yêu cầu |
|---|---|
| Hệ điều hành | Linux (Ubuntu/Debian khuyến nghị; CentOS/RHEL dùng được, đổi lệnh cài gói tương ứng) |
| Node.js | Bản LTS hiện hành (cài qua NodeSource hoặc `nvm`) |
| Cơ sở dữ liệu | **KHÔNG tự cài** — app kết nối vào **DB MSSQL hiện có** của hệ thống Core Voucher (xem mục 3) |
| Reverse proxy | Nginx (khuyến nghị) — bắt buộc nếu dùng trên điện thoại/tablet (cần HTTPS cho camera + WebAuthn, xem mục 5, 9) |
| Process manager | PM2 **hoặc** systemd — chọn 1 trong 2 (mục 7) |

## 2. Lấy mã nguồn + cài dependencies

```bash
git clone <địa-chỉ-repo> /duong-dan/toi/hcrc-voucher
cd /duong-dan/toi/hcrc-voucher
npm install
cp .env.example .env
```

Toàn bộ cấu hình của app nằm trong file `.env` này — xem bảng đầy đủ ở
mục 16. Các bước 3, 5 dưới đây sẽ điền dần các biến quan trọng nhất.

## 3. Kết nối vào DB hiện có + tạo tài khoản admin đầu tiên

App **dùng chung** 100% dữ liệu nghiệp vụ cốt lõi với hệ thống Core hiện
có — không tách ra 1 DB mới, không di chuyển/sao chép dữ liệu cũ sang nơi
khác.

Mở `.env`, sửa **đúng** thông tin kết nối của DB thật:

```ini
DB_SERVER=<ip-hoac-hostname-cua-may-chu-sql-that>
DB_PORT=1433
DB_NAME=<ten-database-hien-co-cua-Core>
DB_USER=<user-co-quyen-doc/ghi-db-nay>
DB_PASSWORD=<mat-khau>
DB_ENCRYPT=true                 # giữ true nếu SQL Server có cấu hình SSL (khuyến nghị)
DB_TRUST_SERVER_CERT=true       # true nếu dùng chung cert nội bộ/tự ký; đổi false nếu đã có CA hợp lệ
```

> **Quyền của `DB_USER`**: tối thiểu cần `SELECT` trên
> `Users`/`Locations_Group`/`Locations_Detail`, và `SELECT/INSERT/UPDATE`
> trên `VOUCHER_SYNC`/`Voucher_Exelogs`, cộng thêm quyền `CREATE TABLE`
> (một lần duy nhất, lúc chạy migrate) để tạo các bảng bổ sung. Nếu chính
> sách bảo mật nội bộ không cho phép 1 user có quyền `CREATE TABLE` trực
> tiếp trên DB production, nhờ DBA chạy `npm run migrate` (hoặc copy nội
> dung từng file trong `sql/` chạy thủ công theo đúng thứ tự tên file
> 001 → 013) bằng 1 tài khoản có quyền cao hơn **1 lần duy nhất**, sau đó
> trả lại quyền hạn chế cho `DB_USER` dùng hàng ngày.

```bash
# BẮT BUỘC: backup DB trước khi migrate lần đầu trên production, không được bỏ qua
# (thao tác thêm bảng IF NOT EXISTS nên rủi ro rất thấp, nhưng backup trước vẫn là
#  nguyên tắc an toàn bắt buộc với mọi thay đổi trên DB đang phục vụ thật — DB này
#  không do app quản lý, phối hợp với DBA/đội quản trị Core để lấy 1 bản backup)

npm run migrate
```

`npm run migrate` đọc và chạy tuần tự toàn bộ file `.sql` trong `sql/`
theo thứ tự tên file (hiện tại 001 → 013), mỗi file bọc trong
`IF NOT EXISTS (...)` nên **chạy lại bao nhiêu lần cũng an toàn** (không
tạo trùng, không mất dữ liệu) — dùng đúng 1 lệnh này cho cả lần đầu tiên
và cho mỗi lần sau này code có thêm migration mới.

Tài khoản cũ (có sẵn trong `Users`) đăng nhập được ngay, không cần thao
tác gì thêm — miễn là cột `Password` của họ đang là mật khẩu plaintext cũ
hoặc đã hash bằng bcrypt (app hỗ trợ đọc cả 2 dạng). Lưu ý 2 ràng buộc
riêng của app áp dụng ngay từ lần đăng nhập đầu (không đổi/xoá dữ liệu
cũ, chỉ là bước bổ sung khi đăng nhập): tài khoản `status = 1` (quản trị)
bắt buộc thiết lập 2FA, và **mọi tài khoản** bắt buộc đổi mật khẩu nếu
chưa từng đổi qua app này (chi tiết 2 luồng này xem `Hướng dẫn nghiệp
vụ.md` mục 9).

Nếu DB thật **chưa có sẵn** tài khoản `status = 1` nào để đăng nhập lần
đầu (ví dụ DB chỉ có sẵn tài khoản nhân viên thường), tạo 1 tài khoản
quản trị mới bằng script có sẵn — không cần vào thẳng SQL Server
Management Studio tự tay chỉnh:

```bash
npm run create-admin -- --username=admin_moi --password="MatKhauManhToiThieu8KyTu" --fullName="Ten quan tri"
```

Script sẽ **băm mật khẩu bằng bcrypt** (không bao giờ lưu plaintext) rồi
tạo/cập nhật 1 dòng trong `dbo.Users` với `status = 1`. Nếu `--username`
đã tồn tại (ví dụ 1 tài khoản nhân viên cũ), script sẽ **cập nhật lại mật
khẩu + nâng cấp tài khoản đó thành quản trị** thay vì tạo trùng dòng mới.

## 4. Chạy thử trên máy local (tuỳ chọn)

```bash
npm run dev             # server dev, tự động reload khi sửa code
```

Mở trình duyệt: `http://localhost:3000` (máy quét mã vạch cắm vào
PC/tablet qua cổng USB, còn điện thoại dùng camera có sẵn — camera **chỉ
hoạt động trên `localhost` hoặc HTTPS**, xem mục 5).

## 5. Cấu hình domain thật cho PWA + đăng nhập vân tay/Face ID

App có thể được **cài đặt như 1 ứng dụng (PWA)** và hỗ trợ **đăng nhập
bằng vân tay/Face ID** (WebAuthn). Cả 2 tính năng này **ràng buộc chặt
với domain thật**, nên phải khai báo đúng **trước khi đưa cho người dùng
thật sử dụng**:

```ini
WEBAUTHN_RP_NAME=HCRC Voucher Redemption
WEBAUTHN_RP_ID=voucher.hcrc.vn            # dùng domain thật sẽ dùng lâu dài, không đặt tạm
WEBAUTHN_ORIGIN=https://voucher.hcrc.vn   # URL đầy đủ, bắt buộc https:// (trừ localhost khi dev)
```

> **Cảnh báo**: đổi domain **sau khi** đã có người đăng ký vân tay/Face
> ID sẽ làm **mất hết** dữ liệu passkey đã đăng ký, mọi người phải đăng
> ký lại từ đầu — vì WebAuthn ràng buộc chặt với domain
> (`WEBAUTHN_RP_ID`). Khai báo đúng domain thật ngay từ đầu.
>
> `WEBAUTHN_RP_ID` phải là **domain thuần tuý** (không có `https://`,
> không có dấu `/` hay cổng ở cuối), còn `WEBAUTHN_ORIGIN` phải là **URL
> đầy đủ** khớp **chính xác** (cả scheme lẫn domain) với địa chỉ người
> dùng gõ trên trình duyệt — sai 1 trong 2 sẽ làm trình duyệt **từ chối
> thầm lặng** hộp thoại vân tay/Face ID (không báo lỗi rõ ràng), rất khó
> debug nếu không biết trước điều này.

## 6. Tạo tài khoản hệ thống riêng (bảo mật)

`.env` chứa **plaintext** `DB_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_KEY`...
— đây là cách làm **bình thường và đủ dùng** cho quy mô 1 server như app
này (không cần mã hoá nội dung file này: nếu mã hoá mà khoá giải mã vẫn
nằm trên cùng server, kẻ tấn công chiếm được server sẽ lấy được cả 2 cùng
lúc, không tăng thêm bảo vệ thực sự). Lớp phòng thủ dùng thực sự là
**giới hạn ai/tiến trình nào đọc được file này** — bằng cách cho app chạy
dưới 1 tài khoản hệ thống RIÊNG, KHÔNG dùng chung với tài khoản cá nhân
hàng ngày của admin:

```bash
# 1) Tạo 1 user hệ thống RIÊNG cho app - KHÔNG thể đăng nhập/SSH trực tiếp bằng user này
sudo useradd --system --no-create-home --shell /usr/sbin/nologin hcrcapp

# 2) Chuyển quyền sở hữu toàn bộ thư mục app (đặc biệt là .env) cho đúng user này
sudo chown -R hcrcapp:hcrcapp /duong-dan/toi/hcrc-voucher

# 3) Khoá .env chỉ mình chủ sở hữu (hcrcapp) mới đọc/ghi được
sudo chmod 600 /duong-dan/toi/hcrc-voucher/.env
```

> **Vì sao làm vậy**: nếu app chạy bằng chính tài khoản SSH cá nhân hàng
> ngày của admin, ai đó sau này chiếm được quyền đăng nhập tài khoản đó
> (dò mật khẩu SSH, lộ SSH key...) sẽ **tự động** đọc được `.env` luôn.
> Tách ra 1 service account riêng, **không có mật khẩu/không đăng nhập
> được**, thu hẹp con đường đọc file này lại chỉ còn: (1) chiếm được
> chính tiến trình app đang chạy (lỗ hổng trong code), hoặc (2) có sẵn
> quyền `root`/`sudo` — cả 2 đều nghiêm trọng hơn nhiều so với "dò được 1
> mật khẩu SSH thường". Lưu ý `root` luôn đọc được mọi file bất kể
> `chmod` gì — 600 không chống được kẻ đã có quyền root, nó chống các
> user **khác** không có quyền root trên cùng máy chủ.

Mục 7 bên dưới sẽ cho app **chạy bằng đúng user `hcrcapp` này**, dùng cả
cho PM2 lẫn systemd.

**Sau này mỗi lần cần sửa `.env`** (ví dụ đổi mật khẩu DB, xoay
`JWT_SECRET`...): **không đăng nhập bằng `root` hay bằng `hcrcapp`** (cả
2 vốn không cho đăng nhập trực tiếp) — admin vẫn dùng tài khoản cá nhân
của mình SSH vào server (cần nằm trong nhóm `sudo`), rồi chọn 1 trong 2
cách:

```bash
# Cách 1 - sửa bằng quyền root (root luôn đọc/ghi được mọi file, bất kể chmod gì):
sudo nano /duong-dan/toi/hcrc-voucher/.env
# Sau khi lưu, KIỂM TRA/ĐẶT LẠI quyền sở hữu (một số trình soạn thảo xoá-tạo lại file khi lưu,
# có thể vô tình đổi chủ sở hữu về root khiến app không còn đọc được .env nữa):
sudo chown hcrcapp:hcrcapp /duong-dan/toi/hcrc-voucher/.env
sudo chmod 600 /duong-dan/toi/hcrc-voucher/.env

# Cách 2 (khuyến nghị, sạch hơn) - chạy thẳng trình soạn thảo DƯỚI danh tính hcrcapp, không cần
# nhớ bước chown lại vì file vẫn do đúng chủ sở hữu tạo ra:
sudo -u hcrcapp nano /duong-dan/toi/hcrc-voucher/.env
```

> `sudo -u hcrcapp <lệnh>` chỉ là "mượn quyền tạm thời để chạy 1 lệnh",
> không phải đăng nhập mở phiên làm việc của `hcrcapp` — nên vẫn chạy
> được bình thường dù user này khai báo `--shell /usr/sbin/nologin` (chỉ
> chặn mở shell tương tác/SSH, không chặn `sudo -u` gọi thẳng 1 chương
> trình cụ thể).

## 7. Chạy thật ở production: PM2 hoặc systemd

`npm run dev`/`npm start` chỉ phù hợp dev/demo — khi chạy thật cần 1
**process manager** để: (1) tự động khởi động lại app nếu crash, (2) tự
động chạy lại app khi server reboot, (3) quản lý log gọn gàng. Chọn **1
trong 2 cách** dưới đây (không cần làm cả 2) — cả 2 đều chạy app bằng
user `hcrcapp` đã tạo ở mục 6, và cả 2 đều hỗ trợ **chạy nhiều worker
song song** theo cách giống hệt nhau (mục 8).

### Cách 1: Chạy bằng PM2 (đơn giản, quen thuộc với người hay dùng Node.js)

```bash
# 1) Cài PM2 (chỉ 1 lần, cài global cho toàn hệ thống)
sudo npm install -g pm2

# 2) Khởi động app BẰNG ĐÚNG USER hcrcapp (không dùng tài khoản cá nhân của admin) - lưu ý PM2
#    quản lý danh sách tiến trình RIÊNG cho từng user, nên từ đây về sau mọi lệnh pm2 liên quan
#    tới app này đều phải chạy kèm "sudo -u hcrcapp" như dưới đây.
sudo -u hcrcapp pm2 start src/server.js --name hcrc-voucher --cwd /duong-dan/toi/hcrc-voucher

# 3) Lưu lại danh sách tiến trình hiện tại của user hcrcapp
sudo -u hcrcapp pm2 save

# 4) Đăng ký PM2 tự khởi động lại cùng hệ điều hành sau khi reboot server - lệnh này sẽ IN RA
#    1 dòng lệnh "sudo env PATH=... pm2 startup systemd -u hcrcapp --hp ..." - COPY và chạy
#    đúng dòng đó (không tự đoán, mỗi máy in ra đường dẫn khác nhau)
sudo -u hcrcapp pm2 startup
```

**Các lệnh thường dùng sau khi đã chạy** (luôn nhớ kèm `sudo -u hcrcapp`
vì app chạy dưới user đó):

```bash
sudo -u hcrcapp pm2 list                    # xem trạng thái (online/stopped), uptime, số lần restart
sudo -u hcrcapp pm2 logs hcrc-voucher       # xem log trực tiếp (Ctrl+C để thoát, không dừng app)
sudo -u hcrcapp pm2 restart hcrc-voucher    # khởi động lại (vd sau khi sửa .env hoặc cập nhật code)
sudo -u hcrcapp pm2 stop hcrc-voucher       # dừng hẳn (không tự bật lại cho tới khi restart)
```

> **Quan trọng — KHÔNG dùng cả `pm2 -i` lẫn `CLUSTER_WORKERS` cùng lúc**:
> PM2 có sẵn 1 cơ chế cluster riêng qua cờ `-i <so-tien-trinh>`, nhưng
> app này đã tự làm cluster BÊN TRONG `src/server.js` (mục 8) để dùng
> được với cả systemd chứ không chỉ PM2. Nếu bật cả 2 cùng lúc
> (`pm2 start ... -i 4` VÀ `CLUSTER_WORKERS=4` trong `.env`), bạn sẽ vô
> tình chạy **4 tiến trình PM2, mỗi tiến trình lại tự fork thêm 4 worker
> con = 16 tiến trình** thay vì 4 như mong muốn. Với PM2, luôn để **mặc
> định (không dùng `-i`)**, chỉ điều chỉnh số worker qua `CLUSTER_WORKERS`
> trong `.env`.

### Cách 2: Chạy bằng systemd service (không cần cài thêm gói nào, có sẵn trên mọi distro Linux hiện đại)

```bash
sudo nano /etc/systemd/system/hcrc-voucher.service
```

Dán nội dung sau (sửa đường dẫn cho đúng với nơi bạn đã clone code):

```ini
[Unit]
Description=HCRC Voucher Redemption App
After=network.target

[Service]
Type=simple
User=hcrcapp
Group=hcrcapp
WorkingDirectory=/duong-dan/toi/hcrc-voucher
ExecStart=/usr/bin/node src/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

(App tự đọc `.env` bằng thư viện `dotenv` ngay khi khởi động — chỉ cần
`WorkingDirectory` đúng chính xác thư mục chứa `.env` là đủ, không cần
khai báo thêm `EnvironmentFile=` trong file này.)

```bash
sudo systemctl daemon-reload    # bắt buộc mỗi lần tạo/sửa file .service
sudo systemctl enable hcrc-voucher    # tự khởi động cùng hệ điều hành sau khi reboot
sudo systemctl start hcrc-voucher     # khởi động ngay bây giờ
```

**Các lệnh thường dùng sau khi đã chạy:**

```bash
sudo systemctl status hcrc-voucher     # xem app đang chạy hay lỗi, PID, thời gian uptime
sudo journalctl -u hcrc-voucher -f     # xem log trực tiếp (tương đương pm2 logs, Ctrl+C để thoát)
sudo systemctl restart hcrc-voucher    # khởi động lại (vd sau khi sửa .env hoặc cập nhật code)
sudo systemctl stop hcrc-voucher       # dừng hẳn
```

### Nên chọn PM2 hay systemd?

Cả 2 đều đảm bảo app tự khởi động lại khi crash/reboot server và đều hỗ
trợ cluster như nhau (vì cluster nằm trong chính code của app, không phụ
thuộc process manager nào) — khác biệt chỉ ở trải nghiệm quản trị:

| Tiêu chí | PM2 | systemd |
|---|---|---|
| Cần cài thêm gói ngoài | Có (`npm install -g pm2`) | Không (có sẵn trên Linux) |
| Xem log | `pm2 logs` | `journalctl -u ...` |
| Quen thuộc với | Người quen hệ sinh thái Node.js | Người quen quản trị Linux server nói chung |
| Theo dõi CPU/RAM tiến trình | Có sẵn lệnh `pm2 monit` | Cần thêm công cụ ngoài (`systemctl status`, `htop`...) |

Nếu không chắc chọn gì, **PM2** thường dễ bắt đầu hơn với người quen viết
code Node.js; **systemd** phù hợp hơn nếu server đã có sẵn quy trình quản
trị dịch vụ bằng systemd cho các app khác.

## 8. Cluster nhiều worker

App dùng sẵn module `cluster` của Node.js (`src/server.js`) để chạy
**nhiều tiến trình worker song song**, tất cả cùng lắng nghe chung 1
cổng — Node tự động chia đều request cho các worker, không cần cấu hình
gì thêm ở Nginx hay process manager. Bật qua **1 biến duy nhất** trong
`.env`:

```ini
CLUSTER_WORKERS=1      # mặc định - 1 tiến trình duy nhất, giống hệt trước khi có tính năng này
CLUSTER_WORKERS=4      # chạy đúng 4 worker xử lý HTTP song song
CLUSTER_WORKERS=max    # chạy bằng đúng số nhân CPU của máy chủ
```

Sau khi đổi `CLUSTER_WORKERS`, khởi động lại app (`pm2 restart
hcrc-voucher` hoặc `systemctl restart hcrc-voucher`) để áp dụng.

**Cơ chế hoạt động** (không cần hiểu để dùng, chỉ để biết vì sao an
toàn): khi `CLUSTER_WORKERS > 1`, tiến trình đầu tiên tự fork ra N tiến
trình con để xử lý HTTP, bản thân nó **không nhận request nào cả** — chỉ
giữ 1 kết nối DB riêng để chạy **DUY NHẤT 1 lần** job nền đồng bộ voucher
lỗi. Nếu để mỗi worker tự chạy job này sẽ bị lặp lại N lần song song, gây
gọi trùng Core API — app đã tự xử lý để tránh điều này, không cần cấu
hình gì thêm.

> **Lưu ý quan trọng về bảo mật khi dùng nhiều worker**: cơ chế khoá tạm
> đăng nhập sai nhiều lần đang đếm số lần sai **trong bộ nhớ của từng
> tiến trình**. Với N worker, 1 người đang gõ sai liên tục có thể rơi
> vào worker khác nhau mỗi lần — ngưỡng khoá trên thực tế có thể lỏng hơn
> tối đa khoảng N lần so với con số công bố. Với vài worker (2-4) mức
> lỏng hơn này vẫn chấp nhận được. Riêng challenge đăng nhập vân
> tay/Face ID (WebAuthn) đã lưu sẵn trong DB nên KHÔNG bị ảnh hưởng bởi
> số worker.

## 9. Nginx reverse proxy + HTTPS

Đặt Nginx phía trước app để xử lý HTTPS bằng chứng chỉ thật (vd Let's
Encrypt) — bản thân app chỉ lắng nghe HTTP thuần ở cổng nội bộ, dù đang
chạy 1 tiến trình hay nhiều worker (Nginx luôn chỉ trỏ vào **1 cổng duy
nhất**, không đổi gì khi bạn tăng/giảm `CLUSTER_WORKERS`):

```nginx
server {
    listen 443 ssl http2;
    server_name voucher.hcrc.vn;               # PHẢI trùng với WEBAUTHN_RP_ID ở mục 5

    ssl_certificate     /etc/letsencrypt/live/voucher.hcrc.vn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/voucher.hcrc.vn/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;      # cổng nội bộ app đang lắng nghe
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;   # QUAN TRỌNG: giúp app biết request gốc là https
    }
}

server {
    listen 80;
    server_name voucher.hcrc.vn;
    return 301 https://$host$request_uri;      # ép toàn bộ HTTP chuyển sang HTTPS
}
```

> **Vì sao bắt buộc HTTPS**: trình duyệt **chỉ cho phép** truy cập
> camera (quét QR trên điện thoại) và API WebAuthn (vân tay/Face ID) trên
> nguồn **an toàn** (`https://` hoặc riêng `localhost` khi dev). Thiếu
> HTTPS ở production, 2 tính năng này sẽ **âm thầm không hoạt động** trên
> điện thoại/tablet của nhân viên (máy quét HID qua USB thì không bị ảnh
> hưởng, vì không cần quyền camera).

## 10. Tường lửa

App chỉ lắng nghe ở cổng nội bộ (vd `127.0.0.1:3000`) và luôn được truy
cập gián tiếp qua Nginx (mục 9) — vì vậy chỉ cần mở ra ngoài Internet
đúng 2 cổng Nginx đang dùng, chặn hẳn truy cập trực tiếp vào cổng nội bộ
của app:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Nếu máy chủ có nhiều dịch vụ khác đang chạy, chỉ cần đảm bảo cổng nội bộ
của app (mặc định 3000) **không** nằm trong danh sách `ufw allow` — request
tới cổng đó từ bên ngoài container/máy chủ sẽ bị chặn, bắt buộc phải đi
qua Nginx.

## 11. Checklist xác nhận sau khi triển khai

- [ ] `npm run migrate` chạy xong không lỗi (xem log có dòng "Migration complete").
- [ ] Đăng nhập thử **1 tài khoản nhân viên cũ** có sẵn trong `Users` —
      vào được, hiện đúng họ tên/địa điểm của họ.
- [ ] Đăng nhập thử **tài khoản admin** (cũ hoặc vừa tạo qua
      `create-admin` ở mục 3) — đi qua đúng thứ tự đổi mật khẩu (nếu lần
      đầu) → thiết lập 2FA → vào được trang chính.
- [ ] Quét thử **1 mã voucher thật** (hoặc mã test đã biết trước trạng
      thái ở Core) — kiểm tra đúng kết quả UNUSED/USED, xác nhận thu hồi
      thành công, kiểm tra có bản ghi mới trong `VOUCHER_SYNC`.
- [ ] Vào **"Kết nối API"** xác nhận đang trỏ đúng Core API production
      (không còn trỏ sang môi trường test), bấm **"Test kiểm tra"** với 1
      mã thật để chắc chắn mapping đúng.
- [ ] Mở bằng HTTPS từ **điện thoại thật** (không phải localhost) — thử
      quét camera và đăng ký vân tay/Face ID để xác nhận
      `WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN` (mục 5) đã cấu hình đúng.
- [ ] Kiểm tra job đồng bộ nền đang chạy (log định kỳ theo
      `SYNC_RETRY_INTERVAL_MINUTES`).
- [ ] `JWT_SECRET` và `ENCRYPTION_KEY` trong `.env` là **chuỗi ngẫu nhiên
      đủ dài, riêng cho môi trường production** (không dùng lại giá trị
      mẫu/dev) — và đã **lưu trữ an toàn ở nơi khác** (vd trình quản lý
      secret của công ty), vì mất `ENCRYPTION_KEY` sau khi đã có dữ liệu
      thật sẽ **không thể giải mã lại** secret của kết nối Core
      API/2FA đã lưu.
- [ ] `.env` đã được `chown` cho 1 service account riêng (không đăng
      nhập được) và `chmod 600`, process manager (PM2/systemd) chạy bằng
      đúng user đó — **không** chạy app bằng tài khoản SSH cá nhân của
      admin (mục 6).
- [ ] Nếu bật `CLUSTER_WORKERS > 1`: đăng nhập/đăng xuất thử vài lần,
      quét-thu-hồi thử vài voucher, đăng ký + đăng nhập thử vân tay/Face
      ID — xác nhận mọi thứ hoạt động bình thường dù request có thể rơi
      vào worker khác nhau (mục 8).
- [ ] Tường lửa (mục 10) chỉ mở cổng 80/443 ra ngoài, cổng nội bộ của app
      không truy cập trực tiếp được từ Internet.

## 12. Vận hành hàng ngày

| Việc cần làm | PM2 | systemd |
|---|---|---|
| Xem log trực tiếp | `sudo -u hcrcapp pm2 logs hcrc-voucher` | `sudo journalctl -u hcrc-voucher -f` |
| Xem trạng thái | `sudo -u hcrcapp pm2 list` | `sudo systemctl status hcrc-voucher` |
| Khởi động lại (vd sau khi đổi `.env`) | `sudo -u hcrcapp pm2 restart hcrc-voucher` | `sudo systemctl restart hcrc-voucher` |
| Dừng | `sudo -u hcrcapp pm2 stop hcrc-voucher` | `sudo systemctl stop hcrc-voucher` |
| Bật/tắt tự khởi động cùng máy chủ | `sudo -u hcrcapp pm2 startup` / `pm2 unstartup` | `sudo systemctl enable\|disable hcrc-voucher` |

Đổi `.env` (vd đổi mật khẩu DB, bật cluster...) luôn cần restart lại app
(cột tương ứng ở trên) để có hiệu lực.

## 13. Sao lưu (backup)

Cần lưu ý **2 thứ khác nhau**, đừng nhầm lẫn phạm vi trách nhiệm:

1. **DB MSSQL** (`Users`, `VOUCHER_SYNC`, các bảng bổ sung của app...) —
   đây là **DB hiện có, dùng chung** với hệ thống Core Voucher (mục 3),
   **không do app này quản lý vòng đời backup**. Việc backup định kỳ
   DB này là trách nhiệm của DBA/đội quản trị Core hiện có — app chỉ yêu
   cầu **bắt buộc có 1 bản backup ngay trước lần chạy `npm run migrate`
   đầu tiên** (mục 3), sau đó các lần migrate tiếp theo chỉ thêm bảng
   mới (`IF NOT EXISTS`) nên rủi ro rất thấp.
2. **File `.env`** — chứa `JWT_SECRET`, `ENCRYPTION_KEY`, mật khẩu DB...
   Mất `ENCRYPTION_KEY` sau khi đã có dữ liệu thật sẽ **không thể giải mã
   lại** secret của kết nối Core API/2FA đã lưu trong DB (mục 11) — lưu 1
   bản sao các giá trị này ở nơi an toàn riêng (vd trình quản lý secret
   của công ty), tách khỏi chính server đang chạy app.

## 14. Cập nhật lên phiên bản mới

```bash
git pull                  # lấy code mới
npm install                # cập nhật dependency nếu package.json có thay đổi
npm run migrate            # AN TOÀN chạy lại - chỉ áp dụng migration MỚI (file .sql chưa tồn tại)
pm2 restart hcrc-voucher   # (hoặc lệnh restart tương ứng với process manager đang dùng)
```

Vì mỗi migration đều là **cộng bảng mới, không sửa bảng cũ**, quy trình
cập nhật không cần downtime bao lâu và không có bước "rollback schema"
phức tạp — trường hợp cần lùi code về phiên bản trước, chỉ cần
`git checkout` lại commit cũ và khởi động lại process (các bảng mới dù
còn tồn tại trong DB cũng không ảnh hưởng gì đến code cũ, vì code cũ đơn
giản là không biết đến chúng).

> **Dùng `root` (hoặc tài khoản admin có `sudo`) để `git pull`/copy code
> có được không?** — **Được**, không liên quan gì đến việc hạn chế
> `hcrcapp` ở mục 6/7 (tách `hcrcapp` chỉ để giới hạn **ai chạy app và
> đọc được `.env` lúc app đang chạy**, không giới hạn ai được quyền quản
> trị/cập nhật file). Chỉ cần lưu ý: nếu `git pull` bằng `root` ngay
> trong thư mục app đã `chown` cho `hcrcapp`, các file mới sẽ tạm thời
> thuộc sở hữu `root` — nên trả lại quyền sở hữu trước khi khởi động lại,
> để giữ đúng nguyên tắc "cả thư mục thuộc về 1 chủ duy nhất" (mục 6) và
> tránh lỗi kỳ lạ về sau (vd `.git` bị lẫn quyền sở hữu giữa 2 tài
> khoản):
>
> ```bash
> # Cách 1: pull/copy code bằng root/sudo như bình thường, rồi trả lại quyền sở hữu:
> git pull
> sudo chown -R hcrcapp:hcrcapp /duong-dan/toi/hcrc-voucher
>
> # Cách 2 (sạch hơn, khỏi phải nhớ bước trên): pull ngay dưới danh tính hcrcapp từ đầu:
> sudo -u hcrcapp git pull
> ```
>
> Riêng file `.env` không bị ảnh hưởng (file này không nằm trong git,
> `git pull` không đụng tới).

## 15. Xử lý sự cố thường gặp

**Service không khởi động được (`systemctl status` báo `failed`, hoặc
PM2 báo `errored`):**
```bash
sudo journalctl -u hcrc-voucher -n 50 --no-pager
# hoặc: sudo -u hcrcapp pm2 logs hcrc-voucher --lines 50
```
Các lỗi hay gặp:
- `Cannot find module` → chưa chạy `npm install` bằng đúng user `hcrcapp`
  (hoặc chạy `npm install` bằng `root`/user khác làm lệch quyền sở hữu
  `node_modules`, xem mục 14).
- Lỗi kết nối DB → kiểm tra lại `DB_SERVER/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD`
  trong `.env` (mục 3), và `DB_ENCRYPT`/`DB_TRUST_SERVER_CERT` nếu SQL
  Server có bật SSL.
- `EACCES: permission denied` khi đọc `.env` → file chưa được `chown`
  đúng cho `hcrcapp` (mục 6), hoặc process manager đang chạy bằng user
  khác `hcrcapp`.

**Đăng nhập xong bị văng ra liên tục / phiên đăng nhập không giữ được:**
`JWT_SECRET` trong `.env` đang để trống hoặc bị đổi giữa các lần restart
— đặt cố định 1 chuỗi ngẫu nhiên dài (mục 11) và không đổi nữa trừ khi cố
ý muốn buộc mọi người đăng nhập lại.

**Đăng nhập/đăng ký vân tay/Face ID bị từ chối thầm lặng, không báo lỗi
rõ ràng:** gần như luôn là do `WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN` (mục 5)
không khớp chính xác với domain/URL thật đang truy cập, hoặc đang truy
cập bằng HTTP thay vì HTTPS (mục 9).

**Nghi ngờ đã bật `CLUSTER_WORKERS > 1` nhưng job đồng bộ voucher lỗi
chạy trùng nhiều lần (gọi trùng Core API):** kiểm tra lại đúng đang chạy
1 bản code mới nhất (app tự đảm bảo chỉ 1 worker chạy job này, mục 8) —
không tự thêm cấu hình chạy job này ở nơi khác (cron ngoài, PM2
`-i`...).

**Nghi ngờ 1 worker bị "treo" (không phản hồi) nhưng service vẫn báo
đang chạy:**
```bash
sudo systemctl restart hcrc-voucher    # hoặc: sudo -u hcrcapp pm2 restart hcrc-voucher
```
An toàn — chỉ gây gián đoạn vài giây (xem lưu ý ở mục 8).

## 16. Bảng biến môi trường (`.env`)

Tham khảo đầy đủ trong `.env.example` (có chú thích kèm theo từng biến).
Các biến quan trọng nhất cho production:

| Biến | Bắt buộc? | Ghi chú |
|---|---|---|
| `DB_SERVER`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | ✅ | Thông tin kết nối DB MSSQL hiện có (mục 3) |
| `DB_ENCRYPT`, `DB_TRUST_SERVER_CERT` | ✅ | Khớp với cấu hình SSL của SQL Server đang dùng |
| `JWT_SECRET` | ✅ | Chuỗi ngẫu nhiên cố định, riêng cho production — để trống/dùng giá trị mẫu sẽ mất phiên đăng nhập mỗi lần restart |
| `ENCRYPTION_KEY` | ✅ | Mã hoá token/API key/mật khẩu của kết nối Core API và secret 2FA lưu trong DB — **mất là không giải mã lại được** |
| `WEBAUTHN_RP_NAME`, `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN` | ✅ nếu dùng trên điện thoại/tablet | Bắt buộc khớp domain thật — xem mục 5 |
| `CLUSTER_WORKERS` | Tuỳ chọn | Số worker cluster xử lý HTTP song song — mặc định `1`, xem mục 8 |
| `SYNC_RETRY_ENABLED` | Tuỳ chọn | Bật/tắt job đồng bộ lại voucher lỗi kết nối Core |
| `SYNC_RETRY_INTERVAL_MINUTES` | Tuỳ chọn | Chu kỳ chạy job đồng bộ lại (phút) |
| `SYNC_RETRY_BATCH_SIZE` | Tuỳ chọn | Số bản ghi tối đa xử lý mỗi lượt chạy job |
| `SYNC_RETRY_MAX_ATTEMPTS` | Tuỳ chọn | Số lần thử lại tối đa/1 bản ghi trước khi tạm bỏ qua (vẫn giữ lại để rà soát thủ công) |

> Cấu hình kết nối Core Voucher API (`CORE_API_BASE_URL` và các biến
> liên quan) chỉ là **fallback** dùng khi chưa cấu hình qua giao diện
> Admin — xem chi tiết + cách cấu hình khuyến nghị qua UI trong `Hướng
> dẫn nghiệp vụ.md` mục 5.
