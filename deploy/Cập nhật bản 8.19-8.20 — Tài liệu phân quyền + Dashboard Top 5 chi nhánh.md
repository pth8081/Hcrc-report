# Hướng dẫn cập nhật hệ thống từ bản 8.19 lên bản 8.20

Gửi IT/DBA thực hiện đúng theo thứ tự bên dưới. File này CHỈ nói về việc
**đưa code đã có sẵn trong Git lên máy chủ đang chạy thật** — không giải
thích tính năng (xem `VERSION.md` mục 8.19-8.20 trong mã nguồn nếu cần biết
chi tiết từng thay đổi).

Đợt cập nhật này gồm: tài liệu `phân quyền.md` (8.19 — KHÔNG có thay đổi
code, không cần bước triển khai nào, chỉ cần đọc file nếu cần hướng dẫn tạo
tài khoản/phân quyền), và Dashboard mới **"Top 5 chi nhánh"** (8.20 — 8 ô
Top 5 Mart/Minimart theo Doanh thu/Giao dịch, cao nhất/thấp nhất, trong
ngày/trong tháng, có bộ lọc ngày báo cáo).

**Đã XÁC NHẬN không đổi cấu trúc CSDL nào ở đợt này** (`etl-db/schema.sql`,
`rp-db/schema.sql`, `dwh/schema.sql`, `api-db/schema.sql` — không file nào
thay đổi) — KHÔNG cần chạy lại file `schema.sql` nào.

---

## Bước 1 — Lấy code mới nhất

Trên máy chủ đang chạy thật (KHÔNG phải máy dev), vào đúng thư mục gốc mã
nguồn rồi chạy:

```bash
git pull origin main
```

---

## Bước 2 — Build lại giao diện

Chỉ **`rp-user` có đổi** (`DashboardPage.jsx`/`DashboardTile.jsx`/
`styles.css` — thêm bộ lọc ngày báo cáo + tab + nhóm chuỗi cho Dashboard).
`etl-admin`/`api-admin` KHÔNG đổi ở đợt này:

```bash
cd rp-user && npm run build && cd ..
```

Sau khi build xong, copy thư mục `dist/` mới vào đúng chỗ Nginx (hoặc
`serve-static.js`) đang trỏ tới, theo cấu hình đã dùng lúc triển khai ban
đầu (xem `deploy/Hướng dẫn triển khai PM2.md` mục 7).

---

## Bước 3 — Restart `rp-server`

Có đổi code chạy nền (`lib/compositeReportRunner.js` — thêm khả năng
"Top N" dùng cho Dashboard mới). `etl`/`api-server` KHÔNG đổi:

```bash
pm2 restart rp-server
```

---

## Bước 4 — (BẮT BUỘC) Tạo Dashboard + 8 báo cáo "Top 5 chi nhánh"

An toàn chạy lại nhiều lần (khớp theo ReportId/DashboardId để cập nhật thay
vì tạo trùng):

```bash
cd rp-server
node scripts/seedTop5ChiNhanhReports.js
```

Script tạo 8 báo cáo (`top5-mart-doanhthu-cao`, `top5-mart-doanhthu-thap`,
`top5-mart-giaodich-cao`, `top5-mart-giaodich-thap`, và 4 báo cáo tương ứng
cho `minimart`) + 1 Dashboard `top5-chi-nhanh` ("Top 5 chi nhánh") gồm 16 ô
(mỗi báo cáo hiện 2 lần — "Trong ngày"/"Trong tháng").

---

## Bước 5 — (BẮT BUỘC) Gán quyền xem 8 báo cáo mới

Dashboard CHỈ hiện đúng Ô nào vai trò đang đăng nhập có quyền xem báo cáo
tương ứng (giống mọi Dashboard khác, xem `routes/dashboards.js`) — script ở
Bước 4 **KHÔNG tự gán quyền**. Vào **rp-user → Hệ thống → Phân quyền**, với
MỖI vai trò cần xem Dashboard "Top 5 chi nhánh":

1. Mở vai trò đó → tab "Báo cáo" → tìm 8 báo cáo tên bắt đầu `Top 5 MART`/
   `Top 5 MINIMART` → tick chọn → Lưu.
2. Đảm bảo vai trò đó cũng có quyền xem trang menu "Dashboard" (tab
   "Trang") — nếu trước đó vai trò chưa từng dùng Dashboard nào.

---

## Bước 6 — Kiểm tra dữ liệu nguồn ĐÃ SẴN SÀNG

Dashboard này dùng LẠI domain `doanhthu_chinhanh`/`giaodich_chinhanh` đã có
sẵn (giống 4 báo cáo "Báo cáo doanh thu cuối ngày") — KHÔNG cần job/VIEW
mới, nhưng vẫn cần:

- [ ] Job `doanhthu_chinhanh` đã bật Dimension `"chain"` (MART/MINIMART)
      cho mọi điểm bán — thiếu thì điểm đó không vào được nhóm nào ở Top 5.
- [ ] "Ánh xạ Điểm - STK_ID" (etl-admin) đã khai đủ cho các mã Điểm cần lên
      Top 5 — mã Điểm CHƯA khai sẽ bị loại khỏi báo cáo (xem
      `requireDiemStkMapping` ở `lib/compositeReportRunner.js`), KHÔNG phải
      lỗi mới — đúng quy tắc đã áp dụng cho 4 báo cáo doanh thu cuối ngày.

Đã triển khai 4 báo cáo "Báo cáo doanh thu cuối ngày" ổn định rồi thì 2 mục
trên coi như đã sẵn sàng, không cần làm lại.

---

## Bước 7 — Kiểm tra sau khi cập nhật

- [ ] `rp-user → Dashboard`: thấy mục "Top 5 chi nhánh" trong danh sách
      chọn dashboard (nếu tài khoản có nhiều hơn 1 dashboard).
- [ ] Mở "Top 5 chi nhánh": thấy bộ lọc **"Ngày báo cáo"** (mặc định = hôm
      nay) + 2 nút "Xếp theo Doanh thu"/"Xếp theo Giao dịch" + 2 nhóm
      **MART**/**MINIMART**, mỗi nhóm 4 ô (Cao nhất/Thấp nhất x Trong
      ngày/Trong tháng).
- [ ] Đổi "Ngày báo cáo" sang 1 ngày giữa tháng (vd ngày 15) — các ô
      "Trong tháng" đổi số (cộng dồn từ đầu tháng tới ngày đó), các ô
      "Trong ngày" đổi số khác (chỉ đúng ngày đó) — 2 nhóm số liệu PHẢI
      khác nhau (trừ khi chọn đúng ngày 1 đầu tháng).
- [ ] Bấm tab "Xếp theo Giao dịch" — 8 ô đổi sang xếp hạng theo Giao dịch
      (thứ tự chi nhánh trong bảng có thể khác tab "Doanh thu" — đây là chủ
      đích, không phải lỗi).
- [ ] `rp-user → Báo cáo`: 8 báo cáo "Top 5 ..." cũng xem/xuất được riêng lẻ
      như báo cáo thường (không bắt buộc chỉ xem qua Dashboard).

Có mục nào không đúng như trên, báo lại người phụ trách để kiểm tra tiếp.
