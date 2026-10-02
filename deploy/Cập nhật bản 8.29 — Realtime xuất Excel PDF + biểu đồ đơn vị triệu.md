# Hướng dẫn cập nhật hệ thống lên bản 8.29

Gửi IT/DBA thực hiện đúng theo thứ tự bên dưới. File này CHỈ nói về việc
**đưa code đã có sẵn trong Git lên máy chủ đang chạy thật** — không giải
thích tính năng (xem `VERSION.md` mục 8.29 trong mã nguồn nếu cần biết chi
tiết).

**Đã XÁC NHẬN không đổi cấu trúc CSDL nào ở đợt này** — KHÔNG cần chạy lại
file `schema.sql` hay script seed nào.

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
Copy `dist/` mới vào đúng chỗ Nginx/`serve-static.js` đang trỏ tới.

---

## Bước 3 — Restart `rp-server`

```bash
pm2 restart rp-server
```

---

## Bước 4 — Kiểm tra sau khi cập nhật

- [ ] Dashboard → 1 trong 4 tab "Realtime"/"Biểu đồ Realtime" (ngày hoặc
      tháng): thấy đủ 2 nút "Xuất Excel"/"Xuất PDF" ở góc phải tiêu đề
      (trước đây 2 nút này ẩn hẳn ở tab Realtime).
- [ ] Bấm "Xuất Excel" — file tải về có tiêu đề đúng "Hệ thống siêu thị
      BRGMART - Báo cáo nhanh doanh thu ngày ..." (không phải tên Ô
      Dashboard), đủ cột Diện tích/Chỉ tiêu/Lãi gộp/Giao dịch/Trung bình
      GD/Doanh thu per m2, nhóm màu Doanh thu (xanh)/Lãi gộp (vàng)/Giao
      dịch (cam), **KHÔNG có cột Cùng kỳ/LFL**.
- [ ] Bấm "Xuất PDF" — cùng nội dung như Excel, xuất đúng giống như xuất từ
      trang Báo cáo "Báo cáo doanh thu cuối ngày HCRC (Thành viên)" bình
      thường.
- [ ] Mở tab "Biểu đồ Realtime Theo ngày"/"Theo tháng": góc trên bên phải
      biểu đồ có ghi chú "ĐVT: 1.000.000", mỗi cột hiện đúng 1 số ở đỉnh cột
      (vd cột ra 60.937.844 thì nhãn hiện "60,9").
- [ ] Đang đứng ở tab BIỂU ĐỒ Realtime, bấm Xuất Excel/PDF — file tải về
      vẫn là BẢNG số liệu đầy đủ (không phải ảnh chụp biểu đồ) — đúng hành
      vi đã có từ trước cho các Ô khác, không đổi gì riêng cho Realtime.

Có mục nào không đúng như trên, báo lại người phụ trách để kiểm tra tiếp.
