# Hướng dẫn cập nhật hệ thống lên bản 8.24

Gửi IT/DBA thực hiện đúng theo thứ tự bên dưới. File này CHỈ nói về việc
**đưa code đã có sẵn trong Git lên máy chủ đang chạy thật** — không giải
thích tính năng (xem `VERSION.md` mục 8.24 trong mã nguồn nếu cần biết chi
tiết).

Đợt này có 2 việc độc lập trên Dashboard: (1) tự động làm mới số liệu mỗi
30 giây, (2) thêm báo cáo "Doanh thu Realtime HCRC" (4 ô mới: Theo ngày/
Theo tháng cộng dồn x Bảng/Biểu đồ), tái dùng NGUYÊN báo cáo "Báo cáo doanh
thu cuối ngày HCRC" đã có sẵn (bỏ cột Cùng kỳ/LFL).

**Đã XÁC NHẬN không đổi cấu trúc CSDL nào ở đợt này** — KHÔNG cần chạy lại
file `schema.sql` nào.

---

## Bước 1 — Lấy code mới nhất

```bash
git pull origin main
```

---

## Bước 2 — Build lại giao diện

Chỉ **`rp-user` có đổi**:

```bash
cd rp-user && npm run build && cd ..
```

Copy thư mục `dist/` mới vào đúng chỗ Nginx (hoặc `serve-static.js`) đang
trỏ tới, như các đợt cập nhật trước.

---

## Bước 3 — Restart `rp-server`

Không đổi code chạy nền ở đợt này (chỉ đổi giao diện + script seed), nhưng
restart cho chắc (áp dụng đúng code mới nếu có cache):

```bash
pm2 restart rp-server
```

---

## Bước 4 — (BẮT BUỘC) Thêm 4 ô "Realtime" vào Dashboard

4 ô Realtime tham chiếu báo cáo **"bc-doanh-thu-hcrc"** — báo cáo này PHẢI
đã tồn tại trước (seed từ lâu, nếu môi trường nào CHƯA từng chạy thì chạy
trước):

```bash
cd rp-server
node scripts/seedLdtdHcrcReports.js   # BỎ QUA nếu báo cáo HCRC đã có sẵn
node scripts/seedTop5ChiNhanhReports.js
```

An toàn chạy lại nhiều lần (khớp theo `ReportId`/`DashboardId` để UPDATE,
không tạo trùng).

---

## Bước 5 — Kiểm tra sau khi cập nhật

- [ ] `rp-user → Dashboard → "Top 5 chi nhánh"`: mở màn hình, chờ ~30 giây
      KHÔNG thao tác gì — số liệu tự cập nhật (xem dòng "cập nhật lúc
      HH:MM:SS" ở góc phải tiêu đề tự nhảy), KHÔNG nhấp nháy "Đang tải...".
- [ ] Bấm nút "Làm mới ngay" — số cập nhật ngay lập tức, không cần chờ 30s.
- [ ] Thấy đủ **4 tab mới**: "Realtime Theo ngày", "Biểu đồ Realtime Theo
      ngày", "Realtime Theo tháng (cộng dồn)", "Biểu đồ Realtime Theo tháng
      (cộng dồn)".
- [ ] Tab "Realtime Theo ngày"/"Theo tháng": bảng đầy đủ đúng khuôn "Báo
      cáo doanh thu cuối ngày HCRC" (Diện tích/Chỉ tiêu/Lãi gộp/Giao dịch/
      Trung bình GD/Doanh thu per m2, nhóm MART/MINIMART có dòng "Tổng
      cộng") — **KHÔNG còn cột Cùng kỳ/LFL**.
- [ ] 2 tab biểu đồ: CHỈ hiện 1 cột "Doanh thu - Thực đạt" theo từng chi
      nhánh, không lẫn cột Giao dịch/Lãi gộp/Chỉ tiêu.
- [ ] Tab "Theo tháng (cộng dồn)" ra số LỚN HƠN HẲN tab "Theo ngày" cùng
      loại (bảng/biểu đồ) — đúng tinh thần cộng dồn cả tháng.
- [ ] Nút "Xuất Excel"/"Xuất PDF" tự ẩn khi đang xem 1 trong 4 tab Realtime
      (chưa hỗ trợ xuất cho các tab này) — vẫn hiện bình thường ở các tab
      Top 5 khác.
- [ ] Chi nhánh nào CHƯA nhập Chỉ tiêu tháng này sẽ KHÔNG hiện trong 4 tab
      Realtime (hành vi có chủ đích, giống báo cáo HCRC gốc) — nếu thấy
      thiếu chi nhánh nào đang hoạt động, kiểm tra lại đã nhập Chỉ tiêu
      tháng cho chi nhánh đó chưa trước khi báo lỗi.

Có mục nào không đúng như trên, báo lại người phụ trách để kiểm tra tiếp.
