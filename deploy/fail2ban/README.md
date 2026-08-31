# fail2ban cho máy chủ ứng dụng HCRC (bổ sung, khuyến nghị)

Lớp phòng thủ BỔ SUNG ở tầng firewall, KHÔNG thay thế rate-limit/chặn
brute-force đã có sẵn trong code (`etl/lib/loginRateLimit.js`,
`api-server/lib/loginRateLimit.js`, `express-rate-limit` toàn cục, HMAC
replay protection...) — xem chú thích đầu `jail.local` cho sự khác biệt.

## Cài đặt

```bash
sudo apt-get install fail2ban   # Debian/Ubuntu — RHEL/CentOS: dnf install fail2ban

# Copy 2 filter riêng của HCRC:
sudo cp deploy/fail2ban/filter.d/hcrc-*.conf /etc/fail2ban/filter.d/

# Copy jail:
sudo cp deploy/fail2ban/jail.local /etc/fail2ban/jail.local
```

**BẮT BUỘC trước khi khởi động lại fail2ban**:

1. Mở `/etc/fail2ban/jail.local`, đổi `ignoreip` thành IP/dải IP đáng tin
   thật của bạn (VPN nội bộ, máy bạn đang SSH vào để triển khai...) — quên
   bước này rất dễ tự khoá chính mình khi gõ sai mật khẩu vài lần lúc test.
2. Xác nhận `deploy/nginx.conf` đã áp dụng đúng (mỗi domain ghi log riêng —
   `hcrc-report`/`hcrc-api`/`hcrc-api-admin`/`hcrc-etl-admin.access.log`
   trong `/var/log/nginx/`) — `nginx -t && systemctl reload nginx` trước.
3. Nếu SSH không chạy cổng mặc định 22, sửa `port = ssh` trong khối
   `[sshd]` thành đúng cổng thật.

Khởi động:

```bash
sudo systemctl enable --now fail2ban
sudo systemctl restart fail2ban
```

## Kiểm tra sau khi bật

```bash
sudo fail2ban-client status                     # liệt kê các jail đang chạy
sudo fail2ban-client status hcrc-report-login    # chi tiết 1 jail (số IP đang bị cấm)
sudo fail2ban-client status hcrc-admin-login
sudo fail2ban-client status hcrc-api-abuse
```

Test thử filter khớp đúng log thật trước khi tin tưởng (không cần chờ bị
tấn công thật mới biết filter có đúng không):

```bash
sudo fail2ban-regex /var/log/nginx/hcrc-report.access.log \
  /etc/fail2ban/filter.d/hcrc-report-login.conf
```

## Gỡ 1 IP bị cấm nhầm

```bash
sudo fail2ban-client set hcrc-report-login unbanip <ip>
```

## Vì sao không có jail riêng cho portal.hcrc.vidu.vn

Domain này thuần tĩnh (`try_files ... /index.html`), không có route đăng
nhập/API nào để dò — không có gì đáng để fail2ban theo dõi riêng.
