# Hướng dẫn triển khai bằng PM2 + Nginx — Hệ thống Báo cáo HCRC

> **Điều kiện tiên quyết**: đã triển khai xong và chạy được theo file
> `Hướng dẫn triển khai PM2.md` (cùng thư mục) — cả 6 tiến trình PM2
> đang `online`, truy cập thử bằng IP:cổng đã vào được cả 3 trang. File
> này KHÔNG lặp lại các bước đó (CSDL, `.env`, tài khoản quản trị,
> build, PM2) — chỉ nói phần THÊM VÀO: đặt Nginx phía trước để có domain
> riêng cho từng trang, HTTPS, và giấu các cổng nội bộ khỏi Internet.

**Vì sao cần thêm Nginx?**

- **HTTPS** — trình duyệt/máy quét mã vạch không đòi hỏi, nhưng nhiều
  tính năng trình duyệt (nếu dùng trên điện thoại/tablet sau này) chỉ
  hoạt động trên nguồn an toàn (`https://`).
- **Domain riêng, dễ nhớ** — thay vì bắt nhân viên nhớ IP:cổng
  (`http://10.0.0.5:5173`), dùng domain (`https://report.hcrc.vidu.vn`).
- **Giấu cổng nội bộ** — 6 cổng `4001-4003`/`5173-5175` không cần mở ra
  Internet nữa, chỉ Nginx (cổng 443/80) mới cần public.
- **Chặn IP cho 2 trang quản trị** — `api-admin`/`etl-admin` có thể giới
  hạn chỉ mạng nội bộ/VPN mới truy cập được, thêm 1 lớp phòng thủ trước
  cả màn hình đăng nhập.

**Ghi chú cập nhật**: hướng dẫn liên quan tới Nginx (domain, TLS,
`nginx.conf`, tường lửa...) bổ sung vào CHÍNH file này; liên quan tới
PM2/CSDL/`.env`/tài khoản (không đụng gì tới Nginx) bổ sung vào file
`Hướng dẫn triển khai PM2.md`.

## Mục lục

1. [Mô hình sau khi thêm Nginx](#1-mô-hình-sau-khi-thêm-nginx)
2. [Bước 1 — DNS + chứng chỉ TLS](#2-bước-1--dns--chứng-chỉ-tls)
3. [Bước 2 — Cài đặt `deploy/nginx.conf`](#3-bước-2--cài-đặt-deploynginxconf)
4. [Bước 3 — Đăng nhập lại qua domain](#4-bước-3--đăng-nhập-lại-qua-domain)
5. [Bước 4 — Tường lửa: đóng 6 cổng nội bộ với Internet](#5-bước-4--tường-lửa-đóng-6-cổng-nội-bộ-với-internet)
6. [Kiểm tra sau khi thêm Nginx](#6-kiểm-tra-sau-khi-thêm-nginx)
7. [Gia hạn chứng chỉ tự động](#7-gia-hạn-chứng-chỉ-tự-động)
8. [Xoay vòng log Nginx](#8-xoay-vòng-log-nginx)
9. [fail2ban (bổ sung, khuyến nghị)](#9-fail2ban-bổ-sung-khuyến-nghị)
10. [Cập nhật code (khác gì so với file PM2)](#10-cập-nhật-code-khác-gì-so-với-file-pm2)
11. [Xử lý sự cố thường gặp](#11-xử-lý-sự-cố-thường-gặp)
12. [Câu hỏi thường gặp](#12-câu-hỏi-thường-gặp)

---

## 1. Mô hình sau khi thêm Nginx

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
   │              MÁY CHỦ ỨNG DỤNG (1 máy, 6 tiến trình PM2)          │
   │  hcrc-rp-server:4001  hcrc-api-server:4002  hcrc-etl:4003         │
   │  hcrc-rp-user:5173  hcrc-api-admin:5174  hcrc-etl-admin:5175      │
   │  (Y HỆT file "Hướng dẫn triển khai PM2.md" — KHÔNG đổi gì)        │
   └──────────────────────────────────────────────────────────────────┘
```

Không có gì trong Nginx cần biết máy chủ CSDL ở đâu — mỗi tiến trình
PM2 tự kết nối DB qua `.env` của chính nó, y hệt file PM2 gốc.

**Không có domain "cổng vào chung"** — mỗi trang (`rp-user`, `api-admin`,
`etl-admin`) có domain riêng, truy cập thẳng vào đúng trang cần dùng.

## 2. Bước 1 — DNS + chứng chỉ TLS

Trỏ 4 bản ghi A/AAAA (`report`, `api`, `api-admin`, `etl-admin` — tiền
tố của domain bạn dùng) về CÙNG 1 IP máy chủ ứng dụng. Lấy chứng chỉ
(Let's Encrypt, dùng `certbot`):

```bash
sudo apt install nginx certbot python3-certbot-nginx   # Debian/Ubuntu
certbot certonly --nginx -d report.hcrc.vidu.vn -d api.hcrc.vidu.vn \
  -d api-admin.hcrc.vidu.vn -d etl-admin.hcrc.vidu.vn
```

(hoặc 1 chứng chỉ wildcard `*.hcrc.vidu.vn` qua DNS challenge nếu muốn
quản lý 1 chứng chỉ duy nhất.)

## 3. Bước 2 — Cài đặt `deploy/nginx.conf`

```bash
sudo cp /home/hcrc/hcrc/deploy/nginx.conf /etc/nginx/conf.d/hcrc.conf
sudo nano /etc/nginx/conf.d/hcrc.conf
```

Trong file vừa copy, sửa 3 việc:

1. **Đổi domain mẫu** `hcrc.vidu.vn` thành domain thật của bạn (toàn bộ
   file, nhiều chỗ).
2. **Đổi dải IP `allow`** (2 domain nội bộ `api-admin.*`/`etl-admin.*`)
   thành IP văn phòng/VPN thật — mặc định đang để dải IP riêng mẫu
   (`10.0.0.0/8` v.v.), phải đổi mới có tác dụng chặn đúng.
3. **Đổi 3 khối `location /` sang phục vụ qua PM2** — vì file
   `Hướng dẫn triển khai PM2.md` đã chạy 3 giao diện bằng
   `deploy/serve-static.js` (không copy `dist/` sang `/var/www`), Nginx
   PHẢI chuyển tiếp sang các cổng đó thay vì đọc file. Với CẢ 3 domain
   `report.*`/`api-admin.*`/`etl-admin.*`: xoá 3 dòng
   `root .../try_files ...` đang có sẵn, thay bằng khối `proxy_pass` đã
   viết sẵn NGAY DƯỚI dạng chú thích trong file (tìm dòng "PHƯƠNG ÁN
   THAY THẾ" — chỉ cần bỏ dấu `#` đầu mỗi dòng của khối đó, xoá 3 dòng
   `root`/`index`/`location{try_files}` phía trên nó).

Ví dụ đúng sau khi sửa (domain `report.hcrc.vidu.vn`):

```nginx
    location / {
        proxy_pass http://hcrc_rp_user_static;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
    }
```

Làm y hệt cho `api-admin.*` (proxy sang `hcrc_api_admin_static`) và
`etl-admin.*` (proxy sang `hcrc_etl_admin_static`) — cả 3 khối `upstream`
này ĐÃ CÓ SẴN đầu file (`upstream hcrc_rp_user_static { server
127.0.0.1:5173; ... }` và 2 khối tương tự), không cần tự thêm.

Kiểm tra cú pháp rồi nạp lại:

```bash
nginx -t && systemctl reload nginx
```

> `nginx -t` kiểm tra TOÀN BỘ cấu hình trước khi áp dụng — nếu gõ sai gì
> đó, Nginx báo lỗi ngay và GIỮ NGUYÊN cấu hình cũ đang chạy (không tự
> reload cấu hình sai).

## 4. Bước 3 — Đăng nhập lại qua domain

| Trang | Địa chỉ MỚI (qua Nginx) | Địa chỉ CŨ (IP:cổng, vẫn còn hoạt động nội bộ) |
|---|---|---|
| **rp-user** | `https://report.hcrc.<domain-cua-ban>/` | `http://<ip-may-chu>:5173/` |
| **api-admin** | `https://api-admin.hcrc.<domain-cua-ban>/` (chỉ vào được từ mạng nội bộ/VPN) | `http://<ip-may-chu>:5174/` |
| **etl-admin** | `https://etl-admin.hcrc.<domain-cua-ban>/` (chỉ vào được từ mạng nội bộ/VPN) | `http://<ip-may-chu>:5175/` |

Tài khoản đăng nhập KHÔNG đổi gì — vẫn đúng tài khoản đã tạo ở
`Hướng dẫn triển khai PM2.md` mục 6.

**Không vào được `api-admin`/`etl-admin` dù đúng URL?** — 2 domain này
CHỈ cho phép truy cập từ dải IP nội bộ/VPN đã khai ở Nginx (Bước 2, khối
`allow`/`deny`) — kiểm tra máy bạn đang gọi có nằm trong dải IP đó/đã
kết nối VPN chưa. `rp-user` (`report.*`) không bị giới hạn này.

## 5. Bước 4 — Tường lửa: đóng 6 cổng nội bộ với Internet

Sau khi Nginx hoạt động ổn, đóng 6 cổng nội bộ lại — chỉ Nginx (localhost)
mới cần gọi tới chúng:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Không thêm `ufw allow` cho `4001-4003`/`5173-5175` — mặc định `ufw` chặn
mọi cổng không được liệt kê, nên request từ Internet vào thẳng các cổng
đó sẽ bị chặn, bắt buộc phải đi qua Nginx.

## 6. Kiểm tra sau khi thêm Nginx

```bash
curl -I https://report.hcrc.<domain>/                     # ra trang rp-user
curl https://report.hcrc.<domain>/api/health               # {"status":"ok",...}
curl https://api.hcrc.<domain>/api/v1/health                # tương tự
curl -I https://api.hcrc.<domain>/admin/auth/login           # PHẢI 404 (domain công khai không lộ /admin)
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

Từ máy NGOÀI mạng nội bộ, gọi thẳng vào 1 trong 6 cổng cũ:

```bash
curl -I http://<ip-may-chu>:5173/    # PHẢI bị từ chối/timeout (tường lửa Bước 4 đã chặn)
```

**Nén gzip cho file tĩnh** — `serve-static.js` (Nginx `proxy_pass` sang đó,
xem Bước 2) tự nó KHÔNG nén, chỉ đọc file thô — phải trông cậy vào `gzip
on;` đã khai sẵn trong `deploy/nginx.conf` (áp dụng cả cho response từ
`proxy_pass`, không chỉ file Nginx tự đọc bằng `root`). Xác nhận:

```bash
curl -H "Accept-Encoding: gzip" -sI https://report.hcrc.<domain>/assets/<tên-file>.js
# (lấy đúng tên file JS thật trong rp-user/dist/assets/ sau khi build)
```

Header trả về PHẢI có `Content-Encoding: gzip` — lặp lại tương tự cho
`api-admin.hcrc.<domain>`/`etl-admin.hcrc.<domain>`. Thiếu header này
thường do `nginx.conf` GỐC của hệ điều hành đã có sẵn 1 khối `gzip`
khác đè lên (kiểm tra `/etc/nginx/nginx.conf`), không phải do
`deploy/nginx.conf` sai.

**Kiểm tra đang chạy đúng bản nào** — sidebar mỗi giao diện hiện sẵn số
phiên bản (vd "v6.23"), hoặc gọi qua Nginx (không cần biết cổng nội bộ):

```bash
curl https://report.hcrc.<domain>/__version
curl https://api-admin.hcrc.<domain>/__version
curl https://etl-admin.hcrc.<domain>/__version
```

## 7. Gia hạn chứng chỉ tự động

`certbot certonly` (không phải `--nginx`/`--apache`) KHÔNG tự sửa Nginx,
nên certbot tự cài sẵn 1 timer/cron chạy `certbot renew` định kỳ (kiểm
tra `systemctl list-timers | grep certbot`) — NHƯNG chứng chỉ gia hạn
xong Nginx KHÔNG tự nạp lại, vẫn phục vụ chứng chỉ CŨ tới khi được
`reload` thủ công. Thêm hook để renew xong tự reload Nginx:

```bash
sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
echo -e '#!/bin/sh\nnginx -t && systemctl reload nginx' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sudo certbot renew --dry-run   # kiểm tra hook chạy đúng, không đợi tới hạn thật
```

## 8. Xoay vòng log Nginx

Bản Nginx cài qua package của Debian/Ubuntu thường có sẵn
`/etc/logrotate.d/nginx` khớp mẫu `/var/log/nginx/*.log` (tự bắt được cả
4 file mới này), nhưng XÁC NHẬN LẠI thay vì giả định:

```bash
cat /etc/logrotate.d/nginx
sudo logrotate -d /etc/logrotate.d/nginx   # chạy thử (dry-run)
```

## 9. fail2ban (bổ sung, khuyến nghị)

Lớp phòng thủ THÊM ở tầng firewall (chặn hẳn IP sau nhiều lần đăng nhập
sai liên tiếp, KHÔNG thay thế rate-limit đã có sẵn trong code) — cần
Nginx đã hoạt động (Bước 2) vì fail2ban đọc log truy cập theo domain của
Nginx (`hcrc-report`/`hcrc-api`/`hcrc-api-admin`/`hcrc-etl-admin.access.log`
trong `/var/log/nginx/`). Không bắt buộc để chạy được hệ thống, nhưng nên
bật trước khi mở ra Internet thật — xem `deploy/fail2ban/README.md` cho
hướng dẫn cài đặt đầy đủ (copy filter + jail, đổi `ignoreip` thành IP/VPN
tin cậy của bạn TRƯỚC khi khởi động — quên bước này rất dễ tự khoá chính
mình).

## 10. Cập nhật code (khác gì so với file PM2)

Quy trình cập nhật code **giống hệt** mục "Cập nhật lên phiên bản mới"
trong `Hướng dẫn triển khai PM2.md` — reload 6 tiến trình PM2 là đủ.
Chỉ cần thêm bước Nginx nếu bạn có SỬA `deploy/nginx.conf` (đổi domain,
thêm worker...):

```bash
nginx -t && sudo systemctl reload nginx
```

Không sửa `nginx.conf` thì không cần đụng gì tới Nginx khi cập nhật
code — Nginx chỉ chuyển tiếp request, không quan tâm code phía sau đã
đổi hay chưa.

## 11. Xử lý sự cố thường gặp

**Trang trắng/404 khi mở qua domain nhưng IP:cổng vẫn vào được** — Bước
2 chưa sửa đúng cả 3 khối `location /` sang `proxy_pass`, Nginx vẫn đọc
`root /var/www/hcrc/...` (thư mục không hề tồn tại vì bạn dùng
`serve-static.js`, không copy `dist/` sang đó).

**502 Bad Gateway** — Nginx gọi đúng `proxy_pass` nhưng không có tiến
trình PM2 nào lắng nghe ở cổng đó — kiểm tra `sudo -u hcrc -H pm2 status`
đủ 6 dòng `online` chưa (xem `Hướng dẫn triển khai PM2.md` mục 14 nếu
thiếu).

**`nginx -t` báo lỗi cú pháp** — thường do copy-paste thiếu dấu `;` hoặc
còn sót dấu `#` ở đầu 1 dòng lẽ ra phải bỏ (Bước 2, mục 3) — đọc kỹ dòng
số nginx báo, so lại với khối mẫu trong file.

**Domain nội bộ (`api-admin`/`etl-admin`) vào được từ ngoài Internet** —
dải IP `allow` ở Bước 2 chưa đổi đúng IP văn phòng/VPN thật (vẫn để dải
mẫu quá rộng, hoặc quên đổi hẳn).

## 12. Câu hỏi thường gặp

**Có bắt buộc đúng 4 domain/subdomain không?** — Không, xem ghi chú
"PHƯƠNG ÁN 1 DOMAIN" ở cuối `deploy/nginx.conf` nếu chỉ có 1 domain
thật.

**Vì sao 2 trang quản trị (`api-admin`/`etl-admin`) không dùng domain
công khai luôn cho tiện?** — Mật khẩu là lớp phòng thủ DUY NHẤT nếu
domain lộ công khai. Domain riêng + `allow`/`deny` theo IP ở Nginx là
lớp phòng thủ THÊM, độc lập với mật khẩu — kẻ tấn công phải VỪA ở trong
mạng nội bộ/VPN VỪA có mật khẩu đúng mới vào được.

**Sau này muốn tăng số worker (cluster) thì Nginx có cần sửa không?** —
KHÔNG cần sửa `nginx.conf` cho 3 service backend (PM2 tự cân bằng tải
giữa các worker ở tầng Node, Nginx luôn chỉ thấy 1 cổng). 3 trang tĩnh
cũng không cần cluster (chỉ đọc file, không nặng CPU).
