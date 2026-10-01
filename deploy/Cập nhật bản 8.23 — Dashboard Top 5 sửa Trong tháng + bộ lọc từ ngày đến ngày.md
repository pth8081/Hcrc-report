# Hướng dẫn cập nhật hệ thống lên bản 8.23

Gửi IT/DBA thực hiện đúng theo thứ tự bên dưới. File này CHỈ nói về việc
**đưa code đã có sẵn trong Git lên máy chủ đang chạy thật** — không giải
thích tính năng (xem `VERSION.md` mục 8.23 trong mã nguồn nếu cần biết chi
tiết).

Đợt này sửa 1 lỗi nghiệp vụ quan trọng ở Dashboard "Top 5 chi nhánh": cột
**"Trong tháng"** trước đây (bản 8.20) tính SAI — chỉ cộng dồn từ đầu tháng
tới ĐÚNG ngày đã chọn (vd chọn 15/09 chỉ ra tổng 15 ngày), thay vì CẢ tháng
như đúng yêu cầu — SỬA LẠI đúng "Trong tháng" = trọn tháng (vd chọn 15/09 ra
tổng ĐỦ 30 ngày tháng 9). Cũng đổi bộ lọc 1 ô "Ngày báo cáo" thành 2 ô "Từ
ngày — đến ngày", và tiêu đề mỗi ô hiện rõ ngày/tháng đang xem.

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

Có đổi code chạy nền (`routes/dashboards.js` — sửa công thức "Trong tháng" +
nhãn tiêu đề dùng khi xuất Excel/PDF):

```bash
pm2 restart rp-server
```

---

## Bước 4 — (BẮT BUỘC) Cập nhật lại tiêu đề 16 Ô Dashboard

Tiêu đề các Ô đã bỏ hậu tố tĩnh "(Trong ngày)"/"(Trong tháng)" (giờ tự hiện
ngày/tháng cụ thể) — chạy lại script seed để cập nhật tiêu đề đã lưu trong
CSDL (an toàn chạy lại nhiều lần, chỉ UPDATE theo đúng ReportId/DashboardId,
không tạo trùng):

```bash
cd rp-server
node scripts/seedTop5ChiNhanhReports.js
```

---

## Bước 5 — Kiểm tra sau khi cập nhật

- [ ] `rp-user → Dashboard → "Top 5 chi nhánh"`: thấy bộ lọc **"Từ ngày —
      đến ngày"** (2 ô, thay cho 1 ô "Ngày báo cáo" trước đây), mặc định cả
      2 = hôm nay.
- [ ] Tiêu đề mỗi ô hiện đúng ngày/tháng đang chọn trong ngoặc, vd
      "Top 5 MART — Doanh thu cao nhất (01/10/2026)" / "...(Tháng 10/2026)"
      — KHÔNG còn nhãn tĩnh "(Trong ngày)"/"(Trong tháng)".
- [ ] Đổi "Từ ngày"/"đến ngày" sang 1 ngày GIỮA THÁNG ĐÃ QUA (vd 15 của
      tháng trước) — số ở các ô "...(Tháng .../...)" phải LỚN HƠN HẲN số ở
      ô cùng hàng "...(ngày cụ thể)" (vì giờ cộng dồn ĐỦ cả tháng, không
      dừng ở ngày đã chọn như trước) — đây CHÍNH LÀ chỗ sửa của đợt này,
      kiểm tra kỹ mục này.
- [ ] Mở rộng khoảng "Từ ngày — đến ngày" ra nhiều ngày (vd cách nhau 10
      ngày) — các ô "Trong ngày" (nay hiện khoảng ngày trong ngoặc) đổi số
      theo đúng khoảng đó, còn các ô "Trong tháng" KHÔNG đổi (vẫn giữ nguyên
      cả tháng chứa ngày "đến").
- [ ] Bấm "Xuất Excel"/"Xuất PDF" — tiêu đề trong file cũng hiện đúng ngày/
      tháng động như trên web.

Có mục nào không đúng như trên, báo lại người phụ trách để kiểm tra tiếp.
