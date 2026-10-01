# Hướng dẫn cập nhật hệ thống lên bản 8.21

Gửi IT/DBA thực hiện đúng theo thứ tự bên dưới. File này CHỈ nói về việc
**đưa code đã có sẵn trong Git lên máy chủ đang chạy thật** — không giải
thích tính năng (xem `VERSION.md` mục 8.21 trong mã nguồn nếu cần biết chi
tiết).

Đợt này CHỈ hoàn thiện thêm Dashboard "Top 5 chi nhánh" đã triển khai ở bản
8.20 — KHÔNG có báo cáo/Dashboard mới nào, KHÔNG đổi cấu trúc CSDL, KHÔNG
cần chạy lại script seed nào.

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

Có đổi code chạy nền (`lib/exportExcel.js`, `lib/exportPdf.js`,
`routes/dashboards.js` — thêm `POST /:dashboardId/export`). `etl`/
`api-server` KHÔNG đổi:

```bash
pm2 restart rp-server
```

---

## Bước 4 — Kiểm tra sau khi cập nhật

- [ ] `rp-user → Dashboard → "Top 5 chi nhánh"`: mỗi thẻ có viền trên màu
      xanh lá (Cao nhất) / cam (Thấp nhất), số có dấu phẩy ngăn cách hàng
      nghìn (không còn số thập phân thô kiểu "61268083.26").
- [ ] Mở tab **"Biểu đồ doanh thu"**/**"Biểu đồ giao dịch"** — hiện 4 biểu
      đồ cột ngang (Cao nhất/Thấp nhất x Trong ngày/Trong tháng), mỗi biểu
      đồ gộp cả MART (xanh) và MINIMART (cam), có số trên từng cột.
- [ ] Bấm **"Xuất Excel"** ở Dashboard — tải về 1 file `.xlsx` gồm nhiều
      sheet (tên ngắn gọn kiểu "MART Cao Ngày"), mỗi sheet tô màu
      xanh/cam header theo đúng Cao nhất/Thấp nhất.
- [ ] Bấm **"Xuất PDF"** ở Dashboard — tải về 1 file `.pdf` nhiều trang,
      mỗi trang 1 bảng, màu header khớp đúng web.
- [ ] Mở lại **"Báo cáo doanh thu cuối ngày HCRC/LDTD"** (báo cáo cũ, không
      liên quan Dashboard) — bảng web giờ cũng hiện số có dấu phẩy, làm
      tròn đúng (hệ quả của sửa `ReportBody.jsx` dùng chung cho mọi báo
      cáo) — kiểm tra số liệu vẫn khớp đúng với trước (chỉ đổi CÁCH HIỂN
      THỊ, không đổi số liệu thật).

Có mục nào không đúng như trên, báo lại người phụ trách để kiểm tra tiếp.
