# Hướng dẫn triển khai bằng PM2 — Hệ thống Báo cáo HCRC

Hướng dẫn này đưa hệ thống từ ZERO lên chạy được, dùng **DUY NHẤT PM2**
(không Nginx, không systemd, không domain/HTTPS) — truy cập trực tiếp
bằng địa chỉ IP máy chủ + số cổng. Phù hợp mạng nội bộ công ty, hoặc làm
bước đầu trước khi thêm Nginx (xem file `Hướng dẫn triển khai sử dụng
PM2 + Nginx.md`, cùng thư mục, để có HTTPS/domain riêng cho từng trang).

Đọc từ trên xuống dưới, làm đúng thứ tự, không bỏ bước. Nếu cần cấu hình
nghiệp vụ/báo cáo (không phải cài đặt hạ tầng), xem file
`Hướng dẫn nghiệp vụ.md` (cùng thư mục).

**Ghi chú cập nhật**: hướng dẫn triển khai mới liên quan tới PM2 (không
Nginx) bổ sung vào CHÍNH file này; liên quan tới Nginx bổ sung vào file
`Hướng dẫn triển khai sử dụng PM2 + Nginx.md`.

## Mục lục

1. [Mô hình hệ thống](#1-mô-hình-hệ-thống)
2. [Yêu cầu hạ tầng](#2-yêu-cầu-hạ-tầng)
3. [Bước 1 — Máy chủ CSDL: tạo 4 database](#3-bước-1--máy-chủ-csdl-tạo-4-database)
4. [Bước 2 — Tạo tài khoản hệ điều hành riêng cho ứng dụng](#4-bước-2--tạo-tài-khoản-hệ-điều-hành-riêng-cho-ứng-dụng)
5. [Bước 3 — Lấy mã nguồn + cấu hình `.env`](#5-bước-3--lấy-mã-nguồn--cấu-hình-env)
6. [Bước 4 — Tạo tài khoản quản trị đầu tiên](#6-bước-4--tạo-tài-khoản-quản-trị-đầu-tiên)
7. [Bước 5 — Build 3 giao diện](#7-bước-5--build-3-giao-diện)
8. [Bước 6 — Chạy toàn bộ bằng PM2](#8-bước-6--chạy-toàn-bộ-bằng-pm2)
9. [Bước 7 — Đăng nhập lần đầu vào từng trang](#9-bước-7--đăng-nhập-lần-đầu-vào-từng-trang)
10. [Bước 8 — Siết quyền file/thư mục lần cuối](#10-bước-8--siết-quyền-filethư-mục-lần-cuối)
11. [Kiểm tra sau triển khai](#11-kiểm-tra-sau-triển-khai)
12. [Vận hành hàng ngày](#12-vận-hành-hàng-ngày)
13. [Cập nhật lên phiên bản mới](#13-cập-nhật-lên-phiên-bản-mới)
14. [Xử lý sự cố thường gặp](#14-xử-lý-sự-cố-thường-gặp)
15. [Bảng biến môi trường (`.env`)](#15-bảng-biến-môi-trường-env)

---

## 1. Mô hình hệ thống

```
                     MÁY CHỦ ỨNG DỤNG (1 máy, chạy PM2)
   ┌─────────────────────────────────────────────────────────────┐
   │  hcrc-etl          :4003   (đồng bộ dữ liệu + /admin/*)      │
   │  hcrc-rp-server    :4001   (API cho rp-user)                 │
   │  hcrc-api-server   :4002   (API công khai + /admin/*)        │
   │  hcrc-rp-user      :5173   (giao diện xem báo cáo)           │
   │  hcrc-api-admin    :5174   (giao diện quản trị API)          │
   │  hcrc-etl-admin    :5175   (giao diện quản trị ETL)          │
   └─────────────────────────────────────────────────────────────┘
                              │  kết nối DB (SQL Server, TCP 1433,
                              ▼  qua mạng riêng/VPN)
                     ┌─────────────────────────┐
                     │   MÁY CHỦ CSDL (1 máy)   │
                     │  HCRC_DWH / HCRC_RP /    │
                     │  HCRC_API / HCRC_ETL     │
                     └─────────────────────────┘
```

**6 tiến trình, TẤT CẢ chạy bằng PM2** — 3 service backend
(`etl`/`rp-server`/`api-server`, xử lý nghiệp vụ + kết nối CSDL) và 3
giao diện web (`rp-user`/`api-admin`/`etl-admin`, phục vụ tĩnh qua
`deploy/serve-static.js`). Không có Nginx đứng trước — truy cập thẳng
vào từng cổng bằng IP máy chủ, ví dụ `http://<ip-may-chu>:5173/`.

| Tiến trình | Cổng | Vai trò | Ai dùng |
|---|---|---|---|
| `hcrc-etl` | 4003 | Đồng bộ dữ liệu vào Data Warehouse | Chỉ nội bộ |
| `hcrc-rp-server` | 4001 | Backend cho `rp-user` | Nhân viên/quản trị báo cáo |
| `hcrc-api-server` | 4002 | API công khai + quản trị API | Đối tác ngoài + quản trị API |
| `hcrc-rp-user` | 5173 | Giao diện xem báo cáo | Nhân viên + quản trị báo cáo |
| `hcrc-api-admin` | 5174 | Giao diện quản trị API/đối tác | Quản trị API |
| `hcrc-etl-admin` | 5175 | Giao diện quản trị đồng bộ dữ liệu | Quản trị ETL |

**4 database** trên 1 máy chủ SQL Server RIÊNG (khác máy chủ ứng dụng):
`HCRC_DWH`, `HCRC_ETL`, `HCRC_API`, `HCRC_RP`.

## 2. Yêu cầu hạ tầng

| Thành phần | Yêu cầu |
|---|---|
| Máy chủ ứng dụng | Linux, Node.js >= 18, PM2 |
| Máy chủ CSDL | SQL Server (máy RIÊNG), port 1433 chỉ mở cho máy chủ ứng dụng |
| Nginx | KHÔNG cần cho hướng dẫn này (xem file PM2 + Nginx nếu sau này cần HTTPS/domain) |

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
service tương ứng ở Bước 3.

## 4. Bước 2 — Tạo tài khoản hệ điều hành riêng cho ứng dụng

**Vì sao?** Nếu chạy PM2 bằng tài khoản cá nhân bạn đang SSH vào (thường
là `root`), 1 lỗ hổng bất kỳ trong code sẽ cho kẻ tấn công LUÔN quyền
của tài khoản đó. Tài khoản này KHÁC HOÀN TOÀN tài khoản CSDL
(`DWH_USER`/`RP_USER`/..., Bước 1) — 2 việc riêng, không thay thế nhau
được (xem mục 16).

```bash
sudo useradd --system --create-home --home-dir /home/hcrc \
  --shell /usr/sbin/nologin hcrc
sudo passwd -l hcrc   # khoá mật khẩu — không ai đăng nhập được bằng mật khẩu
```

(`--create-home` cần thiết dù tài khoản không login được — PM2 lưu
trạng thái/log tại `~/.pm2` của tài khoản đang chạy nó.)

## 5. Bước 3 — Lấy mã nguồn + cấu hình `.env`

Cài Node.js >= 18 và PM2 trước (bằng tài khoản của bạn, sudo):

```bash
sudo npm install -g pm2
```

Mọi lệnh còn lại trong bước này chạy BÊN TRONG 1 shell mang quyền
`hcrc` — mở shell đó, giữ mở tới hết bước:

```bash
sudo -u hcrc -H -s /bin/bash
git clone <repo> hcrc && cd hcrc

for svc in etl rp-server api-server; do
  (cd $svc && npm install --omit=dev && cp .env.example .env)
done
```

Mở từng file (`nano etl/.env`, `nano rp-server/.env`, `nano api-server/.env`)
và điền đúng — xem bảng đầy đủ ở mục 15, nhưng **3 việc bắt buộc nhất**:

- **Trỏ CSDL sang máy chủ CSDL thật** (Bước 1), KHÔNG phải `localhost`:
  `etl/.env` dùng `DWH_SERVER` + `ADMIN_SERVER` (trỏ `HCRC_ETL`);
  `rp-server/.env` dùng `RP_SERVER` (trỏ `HCRC_RP`) + `DWH_SERVER`;
  `api-server/.env` dùng `ADMIN_SERVER` (trỏ `HCRC_API`) + `DWH_SERVER`.
- **Đổi MỌI secret còn là giá trị mẫu** (`ETL_ADMIN_JWT_SECRET`,
  `RP_JWT_SECRET`, `API_ADMIN_JWT_SECRET`, `OAUTH_JWT_SECRET`,
  `ETL_ENCRYPTION_KEY`, `APP_ENCRYPTION_KEY`, `API_ENCRYPTION_KEY`) —
  để nguyên giá trị mẫu thì tiến trình DỪNG NGAY lúc khởi động với lỗi
  rõ ràng (xem log ở Bước 6), không lặng lẽ chạy hỏng. Sinh khoá mã hoá
  bằng:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```
- Giữ nguyên `TRUST_PROXY_HOPS=1` trong cả 3 `.env` — dù KHÔNG dùng
  Nginx ở hướng dẫn này, biến này KHÔNG ảnh hưởng gì khi truy cập thẳng
  (chỉ có tác dụng khi có 1 lớp proxy đứng trước) — cứ để mặc định,
  không cần đổi.

## 6. Bước 4 — Tạo tài khoản quản trị đầu tiên

**Đây là bước hay bị bỏ sót nhất** — không có màn hình đăng nhập nào tự
tạo được tài khoản đầu tiên (trang "Phân quyền" cũng cần đăng nhập
trước). Chạy đúng 1 lệnh cho MỖI trong 3 service (vẫn đang ở trong
shell `hcrc`), SAU khi đã chạy xong schema (Bước 1) và điền xong `.env`
(Bước 3):

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

## 7. Bước 5 — Build 3 giao diện

Vẫn đang ở trong shell `hcrc`:

```bash
for app in rp-user api-admin etl-admin; do
  (cd $app && npm install && npm run build)
done

exit   # thoát khỏi shell hcrc, quay lại tài khoản của bạn
```

Không cần copy `dist/` đi đâu cả — Bước 6 sẽ dùng
`deploy/serve-static.js` đọc thẳng `dist/` tại chỗ (vẫn nằm trong thư
mục `hcrc` vừa build, đã đúng quyền sở hữu sẵn).

## 8. Bước 6 — Chạy toàn bộ bằng PM2

```bash
sudo -u hcrc -H env HCRC_STATIC_VIA_PM2=1 pm2 start /home/hcrc/hcrc/deploy/ecosystem.config.js
sudo -u hcrc -H pm2 save
sudo -u hcrc -H pm2 startup
```

> **Vì sao có `HCRC_STATIC_VIA_PM2=1`?** `deploy/ecosystem.config.js`
> mặc định CHỈ chạy 3 service backend — biến này bật thêm 3 tiến trình
> phục vụ giao diện tĩnh (`hcrc-rp-user`/`hcrc-api-admin`/
> `hcrc-etl-admin`, dùng `deploy/serve-static.js`). Ở hướng dẫn này BẮT
> BUỘC phải bật (không có Nginx đọc file thay thế) — chỉ cần đặt biến
> đúng 1 LẦN lúc `pm2 start` này, `pm2 save` ở dòng tiếp theo lưu lại
> toàn bộ danh sách 6 tiến trình, các lần `pm2 restart`/`pm2 reload`/
> reboot máy chủ sau đó tự dùng lại đúng danh sách đã lưu.

Lệnh cuối (`pm2 startup`) in ra 1 dòng lệnh khác (dạng `sudo env
PATH=... pm2 startup systemd -u hcrc --hp /home/hcrc`) — copy đúng dòng
đó và chạy tiếp, để PM2 tự bật lại cùng máy chủ mỗi khi reboot.

Kiểm tra: `sudo -u hcrc -H pm2 status` — phải thấy ĐỦ 6 dòng, tất cả
`online`:

```
hcrc-etl          online   (instances: 2)
hcrc-rp-server     online   (instances: 2)
hcrc-api-server    online   (instances: 2)
hcrc-rp-user       online   (instances: 1)
hcrc-api-admin     online   (instances: 1)
hcrc-etl-admin     online   (instances: 1)
```

**Cluster đã bật sẵn cho 3 service backend, không cần làm gì thêm** —
`deploy/ecosystem.config.js` đặt sẵn `instances: 2` cho cả 3 (tận dụng
nhiều lõi CPU). 3 tiến trình giao diện tĩnh luôn `instances: 1` (không
cần cluster, chỉ đọc file tĩnh). Muốn đổi số worker của 3 service
backend, đặt biến `PM2_INSTANCES_ETL`/`PM2_INSTANCES_RP`/
`PM2_INSTANCES_API` trước khi `pm2 start` (nhớ chỉnh lại `*_POOL_MAX`
trong `.env` tương ứng — xem chú thích trong file).

## 9. Bước 7 — Đăng nhập lần đầu vào từng trang

| Trang | Địa chỉ truy cập | Đăng nhập bằng |
|---|---|---|
| **rp-user** (xem báo cáo + admin báo cáo) | `http://<ip-may-chu>:5173/` | Tài khoản tạo ở Bước 4, dòng lệnh `rp-server` |
| **api-admin** (quản trị API/đối tác) | `http://<ip-may-chu>:5174/` | Tài khoản tạo ở Bước 4, dòng lệnh `api-server` |
| **etl-admin** (quản trị đồng bộ dữ liệu) | `http://<ip-may-chu>:5175/` | Tài khoản tạo ở Bước 4, dòng lệnh `etl` |

> Chưa có HTTPS/domain ở hướng dẫn này — `http://` (không phải
> `https://`), truy cập bằng IP máy chủ. Nếu máy chủ có tường lửa, mở 6
> cổng `4001-4003` + `5173-5175` cho đúng dải IP/mạng nội bộ được phép
> dùng (KHÔNG public 6 cổng này ra Internet).

**Lần đăng nhập ĐẦU TIÊN của tài khoản `admin`** (cả 3 trang) sẽ bị chặn
ngay ở màn "Bắt buộc đăng ký 2FA" — quét mã QR bằng app Authenticator
(Google Authenticator, Authy, Microsoft Authenticator...), nhập mã 6 số
để xác nhận, KHÔNG vào được trang nào khác cho tới khi hoàn tất. Sau khi
bật 2FA, hệ thống hiện ĐÚNG 1 LẦN 10 mã khôi phục — chép lại/in ra, cất
nơi an toàn (dùng khi mất điện thoại).

**Xác thực hai yếu tố (2FA) — chi tiết đầy đủ**: bắt buộc cho vai trò
**admin** ở cả 3 hệ thống, vai trò khác không cần.

- **1 điện thoại dùng chung được cho cả 3 hệ thống** — mỗi hệ thống đăng
  ký RIÊNG (3 mã QR khác nhau, 3 secret khác nhau), app Authenticator
  hiện 3 dòng phân biệt ("HCRC ETL", "HCRC API", "HCRC Report").
- **Mã khôi phục**: 10 mã dùng 1 lần (dạng `AAAAA-BBBBB`) hiện đúng 1 lần
  lúc bật 2FA — dùng khi mất điện thoại và không có admin nào khác trong
  CÙNG hệ thống để nhờ.
- **Đặt lại 2FA giúp admin khác**: trang "Phân quyền"/"Tài khoản quản
  trị" có nút "Đặt lại 2FA" trên hàng của admin khác — dùng khi họ mất
  thiết bị và không còn mã khôi phục. Sau khi đặt lại, lần đăng nhập kế
  tiếp của admin đó bị bắt đăng ký 2FA lại từ đầu (2FA vẫn bắt buộc,
  không tắt hẳn). Thao tác này được ghi vào Nhật ký thao tác (ai gỡ cho
  ai, lúc nào).
- **MẤT ĐIỆN THOẠI + KHÔNG CÒN mã khôi phục + KHÔNG có admin nào khác**
  trong hệ thống đó — không có đường tự khôi phục qua giao diện, cần DBA
  can thiệp trực tiếp CSDL (đặt `TwoFactorEnabled = 0` trên đúng dòng
  `admin.AdminUsers`/`app.Users` của tài khoản đó) rồi đăng nhập lại.

## 10. Bước 8 — Siết quyền file/thư mục lần cuối

```bash
HCRC_DIR=/home/hcrc/hcrc

sudo chown -R hcrc:hcrc "$HCRC_DIR"
sudo find "$HCRC_DIR" -type d -exec chmod 750 {} \;
sudo find "$HCRC_DIR" -name ".env" -exec chmod 600 {} \;
```

Ghi chú: KHÔNG chỉnh quyền từng file bên trong (chỉ chỉnh cấp thư mục ở
trên) — `node_modules/.bin/*` cần giữ nguyên bit thực thi để lần
`npm install`/build SAU không lỗi "Permission denied". Siết `750` ở thư
mục đã đủ chặn "người khác" trên máy — Linux đòi quyền "đi qua" ở MỌI
thư mục cha mới đọc được file bên trong.

## 11. Kiểm tra sau triển khai

```bash
curl -I http://<ip-may-chu>:5173/                    # ra trang rp-user
curl http://<ip-may-chu>:4001/api/health              # {"status":"ok","db":{"rp":"ok","dwh":"ok"},...}
curl http://<ip-may-chu>:4002/api/v1/health           # tương tự, ping pool admin/dwh
curl http://<ip-may-chu>:4003/health                  # ping pool admin (etl không có route công khai khác)
curl -I http://<ip-may-chu>:5174/                     # ra trang đăng nhập api-admin
curl -I http://<ip-may-chu>:5175/                     # ra trang đăng nhập etl-admin
```

**Kiểm tra đang chạy đúng bản nào** — cả 3 giao diện tĩnh nhúng sẵn số
phiên bản (đọc từ `VERSION.md` gốc repo lúc `npm run build`, xem
`vite.config.js`), IT không cần đối chiếu tay:

- Mở web, nhìn góc dưới sidebar (vd "v6.23").
- Hoặc `pm2 logs <tên>` — dòng `serve-static: ... (bản 6.23)` in ra mỗi khi
  tiến trình khởi động/reload.
- Hoặc gọi thẳng, không cần mở web:
  ```bash
  curl http://<ip-may-chu>:5173/__version   # rp-user
  curl http://<ip-may-chu>:5174/__version   # api-admin
  curl http://<ip-may-chu>:5175/__version   # etl-admin
  ```

- `.env` đã được `chown` cho `hcrc` và `chmod 600` (Bước 8) — **không**
  chạy bất kỳ tiến trình nào bằng tài khoản SSH cá nhân của admin.
- `JWT_SECRET`/`ENCRYPTION_KEY` các loại (mục 15) đã đổi khỏi giá trị
  mẫu và lưu bản sao an toàn ở nơi khác (mất là không giải mã lại được
  dữ liệu đã mã hoá trong CSDL).
- Đăng nhập thử cả 3 trang, xác nhận đi qua đúng luồng bắt buộc 2FA lần
  đầu (Bước 7).

## 12. Vận hành hàng ngày

| Việc cần làm | Lệnh |
|---|---|
| Xem trạng thái | `sudo -u hcrc -H pm2 status` |
| Xem log 1 tiến trình | `sudo -u hcrc -H pm2 logs <tên>` |
| Khởi động lại, không rớt request | `sudo -u hcrc -H pm2 reload <tên>` |
| Dừng hẳn | `sudo -u hcrc -H pm2 stop <tên>` |

`<tên>` là 1 trong 6: `hcrc-etl`, `hcrc-rp-server`, `hcrc-api-server`,
`hcrc-rp-user`, `hcrc-api-admin`, `hcrc-etl-admin`.

**Xoay vòng log** — PM2 KHÔNG tự xoay vòng file log
(`~/.pm2/logs/*.log` của tài khoản `hcrc`), cài thêm:

```bash
sudo -u hcrc -H pm2 install pm2-logrotate
sudo -u hcrc -H pm2 set pm2-logrotate:max_size 50M
sudo -u hcrc -H pm2 set pm2-logrotate:retain 14
```

**Backup CSDL**: NGOÀI phạm vi repo này — trách nhiệm của DBA quản lý
máy chủ CSDL riêng (backup định kỳ cả 4 database, kiểm thử khôi phục
thử định kỳ, lưu bản sao ở nơi khác máy chủ CSDL chính).

## 13. Cập nhật lên phiên bản mới

```bash
sudo -u hcrc -H -s /bin/bash
cd /home/hcrc/hcrc
git pull

for svc in etl rp-server api-server; do (cd $svc && npm install --omit=dev); done
for app in rp-user api-admin etl-admin; do (cd $app && npm install && npm run build); done
exit

sudo -u hcrc -H pm2 reload hcrc-etl
sudo -u hcrc -H pm2 reload hcrc-rp-server
sudo -u hcrc -H pm2 reload hcrc-api-server
sudo -u hcrc -H pm2 reload hcrc-rp-user
sudo -u hcrc -H pm2 reload hcrc-api-admin
sudo -u hcrc -H pm2 reload hcrc-etl-admin
```

Vì `hcrc` sở hữu TOÀN BỘ cây thư mục, không cần "tạm mở khoá/khoá lại"
gì cả — làm mọi việc dưới quyền `hcrc` như lúc cài đặt ban đầu là đủ.

**Cập nhật lên bản 6.25 trở đi (đổi mặc định mã hoá kết nối CSDL)** —
`etl/db.js`/`rp-server/db.js`/`api-server/db.js` đổi mặc định
`encrypt=true`, `trustServerCertificate=false` cho 2 pool cố định của mỗi
service (trước đây ngược lại). Nếu `.env` của bạn ĐÃ set tường minh
`*_ENCRYPT`/`*_TRUST_CERT` (đúng như `.env.example` khuyến nghị từ đầu)
thì không ảnh hưởng gì. Nếu chưa từng set các biến này (dùng mặc định cũ),
kiểm tra SQL Server đã bật mã hoá kết nối trước khi `pm2 reload` — nếu
chưa, service sẽ báo lỗi kết nối thay vì kết nối cleartext như trước; đặt
tạm `*_TRUST_CERT=true` (hoặc `*_ENCRYPT=false` nếu SQL Server thật sự
chưa hỗ trợ TLS) trong lúc chờ bật TLS đúng cách ở SQL Server.

**Xác nhận cập nhật đúng bản** — sau khi `npm run build`/`pm2 reload`, kiểm
tra bằng 1 trong 3 cách ở mục 11 (sidebar, `pm2 logs`, hoặc
`curl .../__version`) — số phải khớp mục mới nhất trong `VERSION.md`. Số
KHÔNG đổi sau khi `pm2 reload` thường có nghĩa `npm run build` chưa chạy
lại (thiếu 1 giao diện trong dòng `for` ở trên) hoặc `git pull` chưa lấy
được commit mới.

**Không lấy code qua `git clone`, mà tải file (zip/tải thủ công) rồi copy
lên server?** — Thay `git pull` bằng: tải bản mới, copy đè lên
`/home/hcrc/hcrc` (giữ nguyên cấu trúc thư mục). 2 điều PHẢI cẩn thận,
đúng nguyên nhân một lỗi thật đã gặp (thiếu `npm install` cho 1 service):

- **KHÔNG có "git diff" để biết chỗ nào đổi** — nên LUÔN chạy đủ cả 2 dòng
  `for` ở trên cho CẢ 3 service + CẢ 3 giao diện mỗi lần cập nhật, không
  đoán/bỏ bớt service nào — thiếu đúng 1 `npm install` là service đó lỗi
  `Cannot find module '...'` ngay khi PM2 khởi động.
- **KHÔNG copy đè file `.env`** — bản tải về thường có `.env.example`, nếu
  lỡ ghi đè `.env` thật đang chạy bằng bản mẫu, service dừng ngay với lỗi
  "còn giá trị mẫu" (mục 14). Backup `.env` của cả 3 service ra ngoài
  TRƯỚC khi copy đè code, xong copy lại vào.

**Người dùng vẫn thấy giao diện cũ, chưa có tính năng mới sau khi cập
nhật?** — Từ phiên bản có Cache-Control đúng (xem `deploy/serve-static.js`),
`index.html` luôn bắt trình duyệt hỏi lại server (`no-cache`) nên lần mở
trang KẾ TIẾP sau khi `pm2 reload`/Nginx đã có bản mới sẽ tự thấy ngay,
không cần xoá cache tay. Chỉ CẦN xoá cache/mở lại 1 LẦN DUY NHẤT nếu trình
duyệt của người dùng đã lỡ cache `index.html` từ TRƯỚC KHI máy chủ có bản
sửa Cache-Control này (cache cũ không tự biết quy tắc mới) — sau lần đó về
sau luôn tự động, không cần lặp lại.

## 14. Xử lý sự cố thường gặp

**Không đăng nhập được vào bất kỳ trang nào (báo sai tài khoản/mật
khẩu)** — chưa chạy `npm run seed:admin` cho đúng service đó (Bước 4), 3
lệnh độc lập nhau, phải chạy đủ cả 3.

**`pm2 status` chỉ thấy 3 dòng thay vì 6** — quên đặt
`HCRC_STATIC_VIA_PM2=1` lúc `pm2 start` (Bước 6) — chạy
`sudo -u hcrc -H pm2 delete all` rồi `pm2 start` lại đúng với biến môi
trường đó.

**Tiến trình khởi động rồi tắt ngay (PM2 báo `errored`)** — gần như luôn
là do 1 secret trong `.env` còn để giá trị mẫu (Bước 5) — xem log
(`pm2 logs <tên>`) để biết chính xác biến nào. Sửa `.env` xong, chạy
`pm2 restart <tên>` để PM2 thử lại từ đầu.

**`curl .../api/health` trả 503** — 1 trong các pool CSDL không kết nối
được — response nêu rõ pool nào (`rp`/`dwh`/`admin`) — kiểm tra lại
`*_SERVER`/`*_PORT`/`*_USER`/`*_PASSWORD` tương ứng trong `.env` và
tường lửa port 1433 giữa 2 máy chủ.

**Không mở được trang từ máy khác (chỉ mở được từ chính máy chủ)** —
kiểm tra tường lửa máy chủ ứng dụng có mở 6 cổng `4001-4003`/`5173-5175`
cho đúng dải IP/mạng đang gọi tới hay chưa (mục 9). Tường lửa đã mở đúng
mà vẫn không vào được 3 trang tĩnh (`5173`/`5174`/`5175`) — có thể máy
chủ đang chạy bản `deploy/serve-static.js` CŨ (trước bản vá lỗi thật:
file này từng cố tình chỉ lắng nghe `127.0.0.1`, khiến máy khác KHÔNG BAO
GIỜ gọi vào được dù tường lửa đúng) — cập nhật code (mục 13) rồi
`pm2 restart hcrc-rp-user hcrc-api-admin hcrc-etl-admin` để áp dụng bản
vá.

**Bấm "Đăng nhập" không có phản ứng gì (không báo lỗi, không vào được),
và `pm2 logs hcrc-rp-server`/`hcrc-api-server`/`hcrc-etl` không hề có
dòng nào ghi lại lần thử đó** — dấu hiệu chắc chắn của lỗi thật đã gặp:
3 giao diện gọi API bằng đường dẫn TƯƠNG ĐỐI (`/api/...` hoặc
`/admin/...`, cùng domain/port với chính trang đang mở), nhưng bản
`deploy/serve-static.js`/`deploy/ecosystem.config.js` CŨ (trước khi có
`PROXY_PREFIX`/`PROXY_TARGET_PORT`) không biết chuyển tiếp các đường dẫn
đó sang backend (`4001`/`4002`/`4003`) — request rơi vào nhánh "SPA
fallback", âm thầm nhận lại `index.html` thay vì gọi được `rp-server`/
`api-server`/`etl`, nên phía sau (backend) không hề thấy request nào tới
mà LỖI đó vẫn không hiện ra ở màn hình (mã lỗi trả về là `200 OK`, không
phải lỗi thật). Khắc phục — cập nhật code (mục 13, đủ cả 3 file
`serve-static.js`/`ecosystem.config.js` mới), sau đó BẮT BUỘC dùng
`restart` kèm `--update-env` (không phải `reload`, vì lần này đổi biến
môi trường mới thêm vào `ecosystem.config.js`, `reload` không đọc lại
được):

```bash
sudo -u hcrc -H env HCRC_STATIC_VIA_PM2=1 \
  pm2 restart /home/hcrc/hcrc/deploy/ecosystem.config.js --update-env
sudo -u hcrc -H pm2 save
```

Kiểm tra lại bằng `sudo -u hcrc -H pm2 show hcrc-rp-user` (hoặc
`hcrc-api-admin`/`hcrc-etl-admin`), xem mục biến môi trường — phải thấy
có `PROXY_PREFIX` và `PROXY_TARGET_PORT` đúng giá trị (`/api`+`4001` cho
`rp-user`, `/admin`+`4002` cho `api-admin`, `/admin`+`4003` cho
`etl-admin`).

**Đăng nhập thành công nhưng thoát ra ngay lập tức, hoặc không giữ được
phiên (F5 lại là văng ra trang đăng nhập)** — `deploy/ecosystem.config.js`
đặt `NODE_ENV=production` cho MỌI app kể cả ở hướng dẫn này (không có
Nginx/TLS), khiến cookie phiên bị đánh dấu `Secure` — trình duyệt TỪ CHỐI
lưu cookie đó trên kết nối `http://` thường. Đặt thêm 1 trong 3 biến sau
vào đúng `.env` của từng service (CHỈ khi chắc chắn không có Nginx/TLS nào
phía trước — mạng nội bộ/VPN đã kiểm soát truy cập, xem mục 15):
`ADMIN_COOKIE_FORCE_INSECURE=true` (etl/api-server) hoặc
`COOKIE_FORCE_INSECURE=true` (rp-server), rồi `pm2 restart <tên> --update-env`.

## 15. Bảng biến môi trường (`.env`)

Tham khảo đầy đủ trong `.env.example` của từng service (có chú thích chi
tiết kèm theo từng biến). Các biến quan trọng nhất:

**`etl/.env`**

| Biến | Ghi chú |
|---|---|
| `DWH_SERVER/PORT/DATABASE/USER/PASSWORD` | Kết nối `HCRC_DWH` (chỉ ghi `dwh.ReportFacts`) |
| `ADMIN_SERVER/PORT/DATABASE/USER/PASSWORD` | Kết nối `HCRC_ETL` (nguồn dữ liệu, job đồng bộ, tài khoản quản trị) |
| `ETL_ADMIN_JWT_SECRET` | Ký phiên đăng nhập `etl-admin/` — bắt buộc đổi khỏi giá trị mẫu |
| `ETL_ENCRYPTION_KEY` | Mã hoá mật khẩu các nguồn dữ liệu lưu trong `etl.DataSources` |
| `ADMIN_COOKIE_FORCE_INSECURE` | CHỈ đặt `true` nếu KHÔNG có Nginx/TLS nào phía trước (mục 14) |

**`rp-server/.env`**

| Biến | Ghi chú |
|---|---|
| `RP_SERVER/PORT/DATABASE/USER/PASSWORD` | Kết nối `HCRC_RP` (người dùng/quyền/cấu hình) |
| `DWH_SERVER/PORT/DATABASE/USER/PASSWORD` | Kết nối `HCRC_DWH` (chỉ đọc, nguồn báo cáo mặc định) |
| `RP_JWT_SECRET` | Ký phiên đăng nhập `rp-user/` |
| `APP_ENCRYPTION_KEY` | Mã hoá mật khẩu nguồn dữ liệu bổ sung + cấu hình email |
| `COOKIE_FORCE_INSECURE` | CHỈ đặt `true` nếu KHÔNG có Nginx/TLS nào phía trước (mục 14) |

**`api-server/.env`**

| Biến | Ghi chú |
|---|---|
| `DWH_SERVER/PORT/DATABASE/USER/PASSWORD` | Kết nối `HCRC_DWH` (chỉ đọc, cho `/api/v1/reports`) |
| `ADMIN_SERVER/PORT/DATABASE/USER/PASSWORD` | Kết nối `HCRC_API` (đối tác, tài khoản quản trị, log request) |
| `API_ADMIN_JWT_SECRET` | Ký phiên đăng nhập `api-admin/` |
| `OAUTH_JWT_SECRET` | Ký access token OAuth2 cho đối tác dùng `AuthMethod='oauth2'` |
| `API_ENCRYPTION_KEY` | Mã hoá mật khẩu nguồn dữ liệu + `HmacSecret` đối tác |
| `ADMIN_COOKIE_FORCE_INSECURE` | CHỈ đặt `true` nếu KHÔNG có Nginx/TLS nào phía trước (mục 14) |

## 16. Câu hỏi thường gặp

**Tài khoản hệ điều hành (`hcrc`) và tài khoản đăng nhập web (tạo bằng
`seed:admin`) có phải 1 không?** — KHÔNG liên quan gì tới nhau. Tài
khoản hệ điều hành (Bước 2) sở hữu tiến trình Node + file trên máy chủ,
không đăng nhập được, không có mật khẩu web. Tài khoản đăng nhập web
(Bước 4) là 1 dòng trong CSDL (`admin.AdminUsers`/`app.Users`), dùng để
đăng nhập vào `rp-user`/`api-admin`/`etl-admin` qua trình duyệt.

**Muốn có HTTPS/domain riêng cho từng trang thì sao?** — Xem file
`Hướng dẫn triển khai sử dụng PM2 + Nginx.md` (cùng thư mục) — chỉ cần
làm thêm phần Nginx, KHÔNG cần làm lại từ đầu, mọi thứ ở hướng dẫn này
vẫn giữ nguyên.
