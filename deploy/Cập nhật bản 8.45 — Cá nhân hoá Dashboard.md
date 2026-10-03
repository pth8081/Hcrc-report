# Cập nhật bản 8.45 — Cá nhân hoá báo cáo Dashboard

## Thay đổi

Trang Dashboard (rp-user) có thêm nút **"⚙️ Tuỳ chỉnh"** ở góc thanh tiêu
đề — mở ra 1 khung cho phép MỖI NGƯỜI tự tuỳ chỉnh cách xem Dashboard của
chính mình:

1. **Ẩn/hiện Ô** — bỏ tick ở 1 Ô trong danh sách là Ô đó không còn hiện
   trên Dashboard của riêng người đó nữa.
2. **Sắp xếp lại thứ tự Ô** — nút ▲/▼ cạnh mỗi Ô trong khung Tuỳ chỉnh.
3. **Nhớ nhóm/tab đã chọn lần trước** — mở lại Dashboard tự về đúng nhóm
   (vd "Top 5 chi nhánh"/"Realtime") và tab (Doanh thu/Giao dịch, Bảng/
   Biểu đồ) đã xem gần nhất.
4. **Số ngày mặc định khi mở lại** — chọn "Hôm nay" (mặc định cũ)/"7 ngày
   gần nhất"/"30 ngày gần nhất", áp dụng sẵn cho bộ lọc "Từ ngày — đến
   ngày" lúc vừa mở trang.

Có nút "Khôi phục mặc định" để xoá hết tuỳ chỉnh, quay lại đúng hành vi
trước bản 8.45 (không ẩn Ô nào, giữ thứ tự gốc, luôn mở "Hôm nay").

**Phạm vi — chỉ ảnh hưởng CÁCH XEM, không phải quyền xem:**
- Khác hẳn `app.RoleDashboardGroupAccess` (bản 8.43) — đó là quyền XEM
  chung theo VAI TRÒ (Admin cấp), còn tuỳ chỉnh ở đây là lựa chọn hiển thị
  riêng của TỪNG NGƯỜI, chỉ áp dụng trên các Ô người đó ĐÃ có quyền xem.
- Lưu trên **server theo tài khoản** (bảng mới `app.UserDashboardPreferences`,
  khoá theo UserId + DashboardId) — KHÔNG dùng `localStorage` — đăng nhập ở
  máy tính, điện thoại khác vẫn thấy đúng tuỳ chỉnh đã lưu.
- Lưu ngay mỗi lần bấm (ẩn/hiện, đổi thứ tự, đổi số ngày, chọn nhóm/tab) —
  không có nút "Lưu" riêng, giống cách bật/tắt khác đã có trong hệ thống.

## File đã sửa

- `rp-db/schema.sql` — bảng mới `app.UserDashboardPreferences` (UserId +
  DashboardId + PreferencesJson, UNIQUE theo UserId+DashboardId).
- `rp-server/routes/dashboards.js` — 2 route mới: `GET`/`PUT
  /dashboards/:dashboardId/preferences` (riêng tư theo UserId, không có
  route admin xem của người khác, giống `app.UserSavedReports`).
- `rp-user/src/lib/dateRange.js` — thêm `addDaysISO()` (tính "N ngày gần
  nhất" cho mục số 4).
- `rp-user/src/modules/dashboard/DashboardPage.jsx` — nạp/lưu
  `preferences`, áp dụng vào Ô hiện/ẩn + thứ tự + nhóm/tab/ngày mặc định,
  khung "Tuỳ chỉnh" mới.
- `rp-user/src/styles.css` — các lớp `.dashboard-customize-*`.

## Các bước triển khai

1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (thêm bảng `app.UserDashboardPreferences`,
   an toàn chạy lại nhiều lần, không ảnh hưởng dữ liệu cũ).
3. `cd rp-user && npm run build`, copy `dist/` mới vào đúng chỗ Nginx/
   `serve-static.js` đang trỏ tới.
4. `pm2 restart hcrc-rp-server` (BẮT BUỘC — có route API mới).
5. Kiểm tra:
   - Vào Dashboard, bấm "⚙️ Tuỳ chỉnh" → hiện danh sách Ô + bộ chọn số
     ngày mặc định.
   - Bỏ tick 1 Ô → Ô đó biến mất ngay trên Dashboard.
   - Bấm ▲/▼ đổi thứ tự 1 Ô → thứ tự đổi ngay.
   - Đổi "Số ngày mặc định" sang "7 ngày gần nhất" → đóng khung, tải lại
     trang (F5) → bộ lọc "Từ ngày — đến ngày" tự đặt đúng 7 ngày gần nhất.
   - Chuyển sang nhóm/tab khác, tải lại trang → tự mở lại đúng nhóm/tab đó.
   - Đăng nhập CÙNG tài khoản ở máy/trình duyệt khác → thấy đúng các tuỳ
     chỉnh trên.
   - Bấm "Khôi phục mặc định" → mọi Ô hiện lại đủ, về thứ tự gốc, mở lại
     "Hôm nay".

Không đổi quyền xem/xuất hiện có (`app.RoleDashboardGroupAccess`), không
đổi API `/dashboards/:id` (vẫn trả đủ tile theo quyền — lọc ẩn/sắp xếp xảy
ra ở phía giao diện, theo tuỳ chỉnh riêng từng người).
