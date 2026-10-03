# Cập nhật bản 8.48 — Phân quyền báo cáo/Dashboard riêng theo từng người dùng

## Bối cảnh

Tiếp nối câu hỏi lớn hơn của người dùng: "cho phép tôi chọn quyền truy cập
và xem báo cáo đến từng người dùng hoặc nhóm người dùng" (cùng đợt với yêu
cầu phân quyền theo siêu thị/phòng ban — xem bản 8.47 cho phần mật khẩu dự
phòng, và phần phân tích đầy đủ đã trình bày trực tiếp với người dùng
trước khi làm).

**Phân tích đã chỉ ra**: hệ thống ĐÃ CÓ sẵn khái niệm "nhóm người dùng" mà
chưa khai thác hết — 1 Vai trò (`app.Roles`) có thể gán cho NHIỀU người
(`app.UserRoles`, vốn đã hỗ trợ 1 người giữ nhiều vai trò cùng lúc), cấp
quyền 1 lần cho cả nhóm qua `RoleReportAccess`/`RoleDashboardGroupAccess`
đã có sẵn. Cái CÒN THIẾU chỉ là 1 lớp cấp lẻ CHO TỪNG CÁ NHÂN — trường hợp
1 người cần thêm 1-2 báo cáo đặc biệt mà không ai khác cần, không đáng tạo
hẳn 1 Vai trò riêng chỉ để gán đúng 1 người đó.

**Phần giới hạn DỮ LIỆU theo đúng siêu thị** (vd quản lý siêu thị A chỉ
thấy đúng số liệu siêu thị A trong 1 báo cáo phủ toàn hệ thống) phức tạp
hơn NHIỀU — cần bảng ánh xạ người dùng↔siêu thị mới (CSDL hiện chưa có
khái niệm "siêu thị" nào) và sửa mọi tầng chạy báo cáo để tự lọc theo đó.
Người dùng đã đồng ý làm RIÊNG 1 đợt sau, không gộp vào bản này.

## Thay đổi

Trang "Người dùng" có thêm nút **"Gán quyền riêng"** (cạnh "Gán vai trò")
— mở khung tick chọn:
- Báo cáo được chạy thêm (dùng chung danh mục với trang "Vai trò").
- Dashboard được xem thêm (theo nhóm) — tách riêng "Xem dashboard"/"Xem
  chi tiết (xuất Excel/PDF)", giống hệt khung ở trang "Vai trò".

Quyền cấp ở đây **CỘNG DỒN** vào quyền theo vai trò đang giữ — đủ 1 trong
2 nguồn (vai trò HOẶC gán riêng) là xem được, không nguồn nào ghi đè nguồn
nào.

## File đã sửa

- `rp-db/schema.sql` — 2 bảng mới `app.UserReportAccess` (UserId+ReportId)
  và `app.UserDashboardGroupAccess` (UserId+DashboardId+GroupKey+CanView+
  CanExport), cùng khuôn 2 bảng Role tương ứng.
- `rp-server/lib/permissions.js` — `loadContext()`: UNION thêm quyền cá
  nhân vào `reportIds`/`dashboardGroupAccess` đã tính theo vai trò (bỏ qua
  với `isSystemRole`, đã thấy hết mọi thứ).
- `rp-server/routes/users.js` — route mới `GET /:id/access`, `PUT
  /:id/report-access`, `PUT /:id/dashboard-group-access` (đều
  `requireSystemRoleActor`, cùng mức nhạy cảm với gán vai trò).
- `rp-user/.../UsersPage.jsx` — nút "Gán quyền riêng" + khung tick chọn,
  tái dùng 2 route danh mục đã có ở trang "Vai trò"
  (`/system/roles/report-catalog`, `/system/roles/dashboard-groups-catalog`).

## Các bước triển khai

1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (an toàn chạy lại nhiều lần).
3. `cd rp-user && npm run build`, copy `dist/` mới vào đúng chỗ Nginx/
   `serve-static.js` đang trỏ tới.
4. `pm2 restart hcrc-rp-server` (BẮT BUỘC — route API mới + đổi
   `lib/permissions.js`).
5. Kiểm tra:
   - Trang "Người dùng" → bấm "Gán quyền riêng" cho 1 người KHÔNG có quyền
     xem 1 báo cáo X qua bất kỳ vai trò nào → tick thêm báo cáo X → Lưu.
   - Người đó đăng nhập (hoặc đợi tối đa 60 giây nếu đang có phiên sẵn,
     xem cache quyền `lib/permissions.js`) → thấy/chạy được báo cáo X ở
     trang Báo cáo.
   - Bỏ tick báo cáo X → Lưu lại → người đó không còn thấy báo cáo X nữa
     (trừ khi 1 vai trò đang giữ cũng cấp đúng báo cáo đó).
   - Thử tương tự với 1 nhóm Dashboard — tick "Xem dashboard" không tick
     "Xem chi tiết" → người đó thấy Ô trên Dashboard nhưng bấm "Xuất Excel/
     PDF" bị từ chối.

Không đổi `app.RoleReportAccess`/`app.RoleDashboardGroupAccess`/
`app.UserRoles` hiện có — cách phân quyền theo Vai trò (dùng làm "nhóm
người dùng") vẫn hoạt động y hệt trước bản này.
