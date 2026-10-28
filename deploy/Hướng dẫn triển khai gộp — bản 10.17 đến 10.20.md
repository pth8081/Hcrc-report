# Hướng dẫn triển khai gộp — bản 10.17 đến 10.20 (làm 1 lần)

**Mục đích**: gộp các bước triển khai từ bản 10.17 tới bản 10.20 hiện tại
thành **1 lượt làm duy nhất**, cho server đang chạy bản 10.16 hoặc cũ hơn
và cần bắt kịp bản mới nhất.

Cả 4 bản đều KHÔNG đổi schema CSDL, KHÔNG đổi file `.env`/biến môi
trường, KHÔNG cần gán lại quyền xem/sửa nào, KHÔNG cần cài gói npm mới
(không cần mở internet tạm thời trên máy chủ).

---

## Tóm tắt những gì thay đổi (10.17 → 10.20)

| Bản | Nội dung |
|---|---|
| 10.17 | Báo cáo "Doanh thu theo ngành hàng" — dòng "Tổng cộng" lấy Chỉ tiêu theo siêu thị khi người dùng chọn 1/nhiều siêu thị ở bộ lọc (thay vì cộng các dòng ngành hàng). **Bản này có lỗi** (xem 10.18) — không cần làm riêng, 10.18 đã ghi đè đúng. |
| 10.18 | **SỬA lỗi bản 10.17**: bản 10.17 lỡ dùng CHUNG 1 nguồn "Chỉ tiêu HCRC" cho cả 2 báo cáo "Doanh thu theo ngành hàng" (HCRC) và "(LDTD)". Sửa lại: báo cáo HCRC đọc đúng "Chỉ tiêu HCRC", báo cáo LDTD đọc đúng "Chỉ tiêu Lãnh đạo Tập đoàn" — 2 nguồn độc lập. |
| 10.19 | **SỬA LỖI THẬT**: modal (hộp thoại nổi, vd "Gán quyền") bị bảng dữ liệu phía sau xuyên thủng lên trên, trên điện thoại — `.modal` thiếu `z-index`, trong khi cột ghim cố định của bảng dữ liệu có `z-index` riêng nên vẽ đè lên modal. Áp dụng cả 3 app (etl-admin/api-admin/rp-user). |
| 10.20 | Nâng cấp UI/UX chuyên nghiệp hơn + rà soát responsive trên 4 kích thước màn hình di động (5.0"/6.3"/6.7"/6.8") — form/bảng có khung thẻ bo tròn rõ ràng, nút bấm to hơn dễ chạm, sửa 1 lỗi phát sinh (nút bị ngắt chữ/tràn khung do thiếu `flex-wrap`). Áp dụng cả 3 app. |

Xem đầy đủ lý do/chi tiết kỹ thuật ở `VERSION.md` (mục "10.17"-"10.20") và
`deploy/Nhật ký triển khai (từ bản 8.31).md`.

---

## A. Code — lấy về 1 lần

```bash
git pull origin main
```

---

## B. Các bước triển khai (gộp cả 4 bản, theo đúng thứ tự)

1. `git pull origin main` (đã làm ở mục A).
2. Khởi động lại `rp-server` (pm2 restart đúng tiến trình) — áp dụng CẢ
   bản 10.17 lẫn 10.18 (đã ghi đè đúng, chỉ cần restart 1 lần là có bản
   10.18 — không cần làm gì riêng cho 10.17).
3. Build lại 3 frontend (áp dụng CẢ bản 10.19 lẫn 10.20, cùng là sửa CSS
   dùng chung — chỉ cần build 1 lần):
   ```bash
   cd etl-admin && npm run build
   cd ../api-admin && npm run build
   cd ../rp-user && npm run build
   ```
4. Deploy `dist/` của cả 3 app lên đúng nơi phục vụ tĩnh (copy file, hoặc
   đúng quy trình CI/CD hiện có của server) — KHÔNG cần restart backend
   nào thêm cho bước này (server tĩnh đọc file `dist/` trực tiếp mỗi
   request, tự nhận bản mới ngay khi file được ghi đè).

Không cần động tới `etl`, `api-server` ở cả 4 bản này.

---

## C. Kiểm tra sau khi triển khai

- [ ] **(10.17/10.18)** Mở báo cáo "Doanh thu theo ngành hàng (LDTD)" →
  chọn ĐÚNG 1 siêu thị ở bộ lọc "Siêu thị" của 1 khối (BRG/LFL/NSO) →
  dòng "Tổng cộng" cột "Chỉ tiêu" PHẢI ra đúng số ở trang etl-admin "Chỉ
  tiêu Lãnh đạo Tập đoàn" cho siêu thị đó.
- [ ] **(10.17/10.18)** Mở lại báo cáo "Doanh thu theo ngành hàng" gốc
  (HCRC), chọn ĐÚNG siêu thị đó → PHẢI ra đúng số ở trang "Chỉ tiêu
  HCRC" — **KHÁC** số LDTD vừa kiểm tra ở trên (2 nguồn độc lập).
- [ ] **(10.17/10.18)** Bỏ chọn siêu thị (để trống bộ lọc) ở cả 2 báo
  cáo → Chỉ tiêu Tổng cộng PHẢI trở lại như TRƯỚC các bản này (hành vi
  mặc định không đổi).
- [ ] **(10.19)** Mở etl-admin trên ĐIỆN THOẠI (hoặc trình duyệt thu nhỏ
  bề rộng ~390px) → trang "Vai trò" → bấm "Gán quyền" ở 1 vai trò bất kỳ
  → bảng "Trang/Xem/Sửa-Xoá" PHẢI hiện SẠCH, không còn chữ/nút của bảng
  "Vai trò" phía sau xuyên qua. Kiểm tra tương tự ở 1-2 modal khác mỗi
  app (api-admin/rp-user).
- [ ] **(10.20)** Mở 1 trang quen thuộc mỗi app (vd "Nguồn dữ liệu" ở
  etl-admin/api-admin, "Hướng dẫn" ở rp-user) trên điện thoại — form/bảng
  PHẢI hiện trong khung thẻ bo tròn rõ ràng (không còn nổi trần trên nền
  xám), nút bấm không còn bị ngắt chữ giữa dòng hay tràn ra mép màn hình.

Không có bước nào ở 4 bản này làm mất dữ liệu đã có — thuần sửa logic
tính toán báo cáo (10.17/10.18) và CSS giao diện (10.19/10.20), không
đụng tới dữ liệu đã lưu trong CSDL.
