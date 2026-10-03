# Hướng dẫn cập nhật hệ thống lên bản 8.37-8.38

Gửi IT/DBA thực hiện đúng theo thứ tự bên dưới. File này CHỈ nói về việc
**đưa code đã có sẵn trong Git lên máy chủ đang chạy thật** — không giải
thích tính năng (xem `VERSION.md` mục 8.37/8.38 trong mã nguồn nếu cần
biết chi tiết).

**Không đổi cấu trúc CSDL, không đổi backend nào** — CHỈ build lại giao
diện (frontend) của cả 3 app: `rp-user`, `etl-admin`, `api-admin`.

---

## Bước 1 — Lấy code mới nhất

```bash
git pull origin main
```

---

## Bước 2 — Build lại cả 3 giao diện

```bash
cd rp-user && npm run build && cd ..
cd etl-admin && npm run build && cd ..
cd api-admin && npm run build && cd ..
```

Copy từng thư mục `dist/` mới vào đúng chỗ Nginx/`serve-static.js` đang
trỏ tới (3 nơi riêng, xem `deploy/nginx.conf`/`deploy/ecosystem.config.js`
nếu không nhớ đường dẫn).

---

## Bước 3 — Kiểm tra sau khi cập nhật

- [ ] Trang **Báo cáo** (rp-user) → chạy 1 báo cáo nhiều cột (vd "Báo cáo
      doanh thu cuối ngày HCRC") → bảng hiện ĐỦ các cột trong 1 màn hình
      desktop bình thường, không còn phải kéo thanh cuộn ngang (trừ báo
      cáo nào thật sự nhiều cột hơn cả màn hình thì vẫn cuộn, đúng ý).
- [ ] Trang **Báo cáo tự do** (rp-user) → tương tự, bảng dùng hết chiều
      rộng màn hình.
- [ ] Màn hình **Đăng nhập** của CẢ 3 app (ETL/API/Report) → khung bên
      trái không còn đoạn văn bản dài, thay bằng 1 hình minh hoạ riêng cho
      từng app (ETL = 2 kho dữ liệu, API = sơ đồ node, Report = biểu đồ
      cột) — màu hình khớp đúng màu thương hiệu từng app.
- [ ] Đăng nhập thử bình thường ở cả 3 app — luồng đăng nhập/2FA (nếu có)
      không đổi gì, vẫn hoạt động như trước.

Có mục nào không đúng như trên, báo lại người phụ trách để kiểm tra tiếp.
