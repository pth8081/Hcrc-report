# Hướng dẫn cập nhật hệ thống lên bản 8.26

Gửi IT/DBA thực hiện đúng theo thứ tự bên dưới. File này CHỈ nói về việc
**đưa code đã có sẵn trong Git lên máy chủ đang chạy thật** — không giải
thích tính năng (xem `VERSION.md` mục 8.26 trong mã nguồn nếu cần biết chi
tiết).

Lỗi: "hôm nay" (Dashboard, Báo cáo tự do, xuất Excel/PDF, email tự động)
từng tính theo giờ UTC thay vì giờ Việt Nam — sai lệch 1 ngày trong khoảng
**00:00-06:59 giờ Việt Nam mỗi ngày**. Nên áp dụng sớm.

**Đã XÁC NHẬN không đổi cấu trúc CSDL nào ở đợt này** — KHÔNG cần chạy lại
file `schema.sql` nào.

---

## Bước 1 — Lấy code mới nhất

```bash
git pull origin main
```

---

## Bước 2 — Build lại giao diện

```bash
cd rp-user && npm run build && cd ..
```

Copy thư mục `dist/` mới vào đúng chỗ Nginx (hoặc `serve-static.js`) đang
trỏ tới.

---

## Bước 3 — Restart `rp-server`

```bash
pm2 restart rp-server
```

---

## Bước 4 — Kiểm tra sau khi cập nhật

Khó test đúng NGAY LÚC giữa đêm — có thể giả lập bằng cách đổi tạm múi giờ
hệ điều hành máy TEST (không phải production) sang UTC rồi mở trình duyệt
vào khoảng 17:00-23:59 UTC (= 00:00-06:59 giờ Việt Nam hôm sau) để xem
Dashboard/"Báo cáo tự do" có hiện ĐÚNG ngày Việt Nam hay không. Nếu không
tiện giả lập, chỉ cần xác nhận:

- [ ] Mở Dashboard, nút "Hôm nay" + ô "Từ ngày/đến ngày" mặc định hiện ĐÚNG
      ngày hiện tại theo lịch Việt Nam (so với điện thoại/đồng hồ thật).
- [ ] Mở "Báo cáo tự do", khoảng ngày mặc định (đầu tháng → hôm nay) cũng
      đúng theo lịch Việt Nam.

Có mục nào không đúng như trên, báo lại người phụ trách để kiểm tra tiếp.
