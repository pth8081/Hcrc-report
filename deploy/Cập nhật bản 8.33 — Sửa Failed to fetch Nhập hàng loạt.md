# Hướng dẫn cập nhật hệ thống lên bản 8.33

Gửi IT/DBA thực hiện đúng theo thứ tự bên dưới. File này CHỈ nói về việc
**đưa code đã có sẵn trong Git lên máy chủ đang chạy thật** — không giải
thích tính năng (xem `VERSION.md` mục 8.33 trong mã nguồn nếu cần biết chi
tiết).

**QUAN TRỌNG — bản này sửa `deploy/nginx.conf`, KHÔNG phải code Node** —
`git pull` + `pm2 restart` KHÔNG đủ, phải tự tay áp dụng cấu hình Nginx
mới vào file Nginx thật đang chạy trên server (đường dẫn thường là
`/etc/nginx/sites-available/...` hoặc tương tự, KHÔNG phải chạy thẳng
file trong thư mục Git).

---

## Bước 1 — Lấy code mới nhất

```bash
git pull origin main
```

---

## Bước 2 — Áp dụng đoạn cấu hình Nginx mới

Mở file Nginx thật đang dùng cho domain etl-admin (site có
`proxy_pass http://hcrc_etl_server;`), tìm khối:

```nginx
location /admin/ {
    proxy_pass http://hcrc_etl_server;
    ...
    proxy_read_timeout 65s;
    proxy_send_timeout 65s;
}
```

Thêm 1 khối MỚI ngay TRƯỚC khối đó (xem nguyên văn trong
`deploy/nginx.conf` bản mới nhất, mục có chú thích "Nhập hàng loạt Sync
Job/Nguồn dữ liệu..."):

```nginx
location ~ ^/admin/(sync-jobs|data-sources)/import$ {
    proxy_pass http://hcrc_etl_server;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;
}
```

Khối `location /admin/` cũ giữ nguyên (65s), không sửa gì thêm.

---

## Bước 3 — Kiểm tra cú pháp + reload Nginx

```bash
nginx -t
systemctl reload nginx
```

`nginx -t` PHẢI in "syntax is ok"/"test is successful" trước khi reload —
nếu báo lỗi, kiểm tra lại đúng chỗ dán đoạn trên (trong đúng `server {}`
block của domain etl-admin).

---

## Bước 4 — Kiểm tra sau khi cập nhật

- [ ] etl-admin → Đồng bộ → "Nhập hàng loạt" với file nhiều dòng (vd 68
      dòng 34 siêu thị Thành viên) — PHẢI chạy xong (dù mất vài phút, có
      thể thấy trình duyệt "treo" chờ — đó là BÌNH THƯỜNG, không phải lỗi
      nữa), không còn báo "Failed to fetch" giữa chừng.
- [ ] Các thao tác khác ở `/admin/` (CRUD nguồn, sync job, đăng nhập...)
      vẫn hoạt động bình thường (không bị ảnh hưởng, timeout 65s giữ
      nguyên cho mọi route khác).

Có mục nào không đúng như trên, báo lại người phụ trách để kiểm tra tiếp.
