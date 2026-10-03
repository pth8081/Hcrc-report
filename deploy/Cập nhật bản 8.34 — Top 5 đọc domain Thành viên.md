# Hướng dẫn cập nhật hệ thống lên bản 8.34

Gửi IT/DBA thực hiện đúng theo thứ tự bên dưới. File này CHỈ nói về việc
**đưa code đã có sẵn trong Git lên máy chủ đang chạy thật** — không giải
thích tính năng (xem `VERSION.md` mục 8.34 trong mã nguồn nếu cần biết chi
tiết).

**QUAN TRỌNG**: Dashboard "Top 5 chi nhánh" sau bản này CHỈ xếp hạng trong
34 siêu thị đã khai Live "Thành viên" — các chi nhánh khác tạm thời biến
mất khỏi Top 5 cho tới khi khai báo Live xong toàn bộ (người dùng đã xác
nhận chấp nhận đánh đổi này).

**Không đổi cấu trúc CSDL** — KHÔNG cần chạy lại `schema.sql`. **Cần chạy
lại 1 script seed** (khác các bản trước, không chỉ `git pull` + restart).

---

## Bước 1 — Lấy code mới nhất

```bash
git pull origin main
```

---

## Bước 2 — Chạy lại script seed Top 5 (BẮT BUỘC)

```bash
cd rp-server
node scripts/seedTop5ChiNhanhReports.js
```

Script idempotent (khớp theo `ReportId` để UPDATE, không tạo trùng) — in
ra 8 dòng "↻ Đã cập nhật báo cáo ...". Nếu dùng `menuCode` khác mặc định
`reports-kinh-doanh` lúc seed lần đầu, truyền lại đúng tham số đó:

```bash
node scripts/seedTop5ChiNhanhReports.js <menuCode>
```

---

## Bước 3 — Restart `rp-server`

```bash
pm2 restart rp-server
```

---

## Bước 4 — Kiểm tra sau khi cập nhật

- [ ] Dashboard "Top 5 chi nhánh" → cả 16 Ô (MART/MINIMART x Doanh thu/
      Giao dịch x Cao nhất/Thấp nhất x Ngày/Tháng) chỉ hiện tên trong 34
      siêu thị Thành viên — không còn chi nhánh ngoài danh sách đó.
- [ ] Số liệu Doanh thu/Giao dịch khớp đúng domain Live (so với Ô
      "Realtime" cùng ngày, cùng siêu thị — phải khớp nhau vì giờ dùng
      chung domain).
- [ ] Trang Báo cáo (xem riêng lẻ, không qua Dashboard) → 8 báo cáo "Top 5
      ..." vẫn chạy được bình thường, không lỗi domain.

Có mục nào không đúng như trên, báo lại người phụ trách để kiểm tra tiếp.
