# Hướng dẫn cập nhật hệ thống lên bản 8.35

Gửi IT/DBA thực hiện đúng theo thứ tự bên dưới. File này CHỈ nói về việc
**đưa code đã có sẵn trong Git lên máy chủ đang chạy thật** — không giải
thích tính năng (xem `VERSION.md` mục 8.35 trong mã nguồn nếu cần biết chi
tiết).

**Bản này sửa đúng nguyên nhân gốc** của lỗi "Failed to fetch" (bản 8.33)/
"Không kết nối được backend" khi Nhập hàng loạt Sync Job nhiều dòng — bản
8.33 (tăng timeout Nginx) vẫn CẦN GIỮ, bản này là lớp sửa thứ 2 (ở chính
backend Node), cả 2 PHẢI có đủ thì Nhập hàng loạt mới chạy hết được với
file nhiều dòng (vd 68 dòng/34 siêu thị).

**Không đổi cấu trúc CSDL, không đổi Nginx lần này** — CHỈ sửa code
backend `etl`.

---

## Bước 1 — Lấy code mới nhất

```bash
git pull origin main
```

---

## Bước 2 — Restart `hcrc-etl`

```bash
pm2 restart hcrc-etl
```

---

## Bước 3 — Kiểm tra sau khi cập nhật

- [ ] etl-admin → Đồng bộ → "Nhập hàng loạt" với file 68 dòng (34 siêu thị
      Thành viên) — PHẢI chạy xong hết (có thể mất vài phút, trình duyệt
      "treo" chờ là BÌNH THƯỜNG), không còn báo "Failed to fetch" hay
      "Không kết nối được backend" giữa chừng.
- [ ] Nếu triển khai qua Nginx: xác nhận ĐÃ áp dụng luôn bản 8.33 (khối
      `location ~ ^/admin/(sync-jobs|data-sources)/import$` trong
      `deploy/nginx.conf`) — thiếu bản đó, Nginx vẫn có thể cắt kết nối ở
      65s dù backend giờ không tự cắt nữa.
- [ ] Các thao tác khác ở trang Đồng bộ/Nguồn dữ liệu (CRUD, kiểm tra kết
      nối...) vẫn hoạt động bình thường.

Có mục nào không đúng như trên, báo lại người phụ trách để kiểm tra tiếp.
