# Hướng dẫn cập nhật hệ thống lên bản 8.42

Gửi IT/DBA thực hiện đúng theo thứ tự bên dưới. File này CHỈ nói về việc
**đưa code đã có sẵn trong Git lên máy chủ đang chạy thật** — không giải
thích tính năng (xem `VERSION.md` mục 8.42 trong mã nguồn nếu cần biết chi
tiết).

**Không đổi cấu trúc CSDL** — KHÔNG cần chạy lại `schema.sql`. **Cần chạy
lại 1 script seed** (ghi đè `DefinitionJson` đã lưu, giống bản 8.34).

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

(Dùng đúng `menuCode` đã seed lần đầu nếu khác mặc định
`reports-kinh-doanh`, xem `node scripts/seedTop5ChiNhanhReports.js <menuCode>`.)

---

## Bước 3 — Build lại giao diện rp-user

```bash
cd rp-user && npm run build && cd ..
```

Copy `dist/` mới vào đúng chỗ đang phục vụ.

---

## Bước 4 — Restart `rp-server`

```bash
pm2 restart hcrc-rp-server
```

---

## Bước 5 — Kiểm tra sau khi cập nhật

- [ ] Dashboard → thấy 2 thẻ nhóm ở đầu trang: "🏆 Top 5 chi nhánh" (16 ô)
      và "⚡ Realtime" (4 ô).
- [ ] Bấm thẻ "Top 5 chi nhánh" → hiện đúng 4 tab Doanh thu/Giao dịch x
      Bảng/Biểu đồ như trước, không còn lẫn tab Realtime ở hàng tab này.
- [ ] Bấm thẻ "Realtime" → hiện đúng 4 tab Realtime (Ngày/Tháng x Bảng/
      Biểu đồ), không còn lẫn tab Doanh thu/Giao dịch.
- [ ] Xuất Excel/PDF vẫn hoạt động đúng ở cả 2 nhóm.
- [ ] Bộ lọc "Từ ngày — đến ngày" vẫn hoạt động bình thường ở cả 2 nhóm.

Có mục nào không đúng như trên, báo lại người phụ trách để kiểm tra tiếp.
