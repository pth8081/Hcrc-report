# Cập nhật bản 8.47 — Mật khẩu dự phòng cục bộ khi HCRC Workspace lỗi

## Bối cảnh

Người dùng đặt câu hỏi: hệ thống đang gọi API xác thực người dùng sang
"HCRC Workspace" (vpdt) — nếu API đó lỗi thì có cách nào tự động dùng
username/mật khẩu local làm dự phòng không?

Hiện trạng (đã kiểm tra trực tiếp code trước khi đề xuất): tài khoản
`AuthSource='hcrcWorkspace'` gọi `POST /verify-credentials` **MỖI LẦN**
đăng nhập, không lưu gì ở local — dịch vụ đó sập/mất mạng thì tài khoản
loại này không đăng nhập được gì cho tới khi dịch vụ sống lại (trả lỗi 503
riêng, không tính vào brute-force). "Đồng bộ tài khoản" đã có sẵn chỉ kéo
về họ tên/phòng ban/chức danh — API HCRC Workspace **không cung cấp mật
khẩu**, nên không có cách nào đồng bộ "bảng user kèm mật khẩu" như ý tưởng
ban đầu.

## Phương án đã chọn (sau khi phân tích, người dùng xác nhận)

**Cache mật khẩu ngay lúc xác thực online thành công** — KHÔNG đồng bộ
mật khẩu chủ động từ API (API không cho, và việc hệ thống báo cáo tự giữ
mật khẩu thật ngoài tầm kiểm soát của hệ thống nguồn là rủi ro không cần
thiết):

1. Mỗi lần `verifyPassword()` gọi HCRC Workspace **thành công**, băm
   (bcrypt) lại đúng mật khẩu vừa gõ đúng, ghi vào `app.Users.
   CachedPasswordHash` + `CachedPasswordHashAt`.
2. HCRC Workspace báo lỗi dịch vụ (`isServiceUnavailable` — mạng/timeout/
   5xx, KHÁC "sai mật khẩu": trường hợp đó HCRC Workspace vẫn trả 200 kèm
   `success:false`) → thử so với `CachedPasswordHash` tại chỗ.
3. Chỉ dùng được dự phòng nếu còn trong hạn `FallbackMaxAgeDays` (mặc định
   14 ngày, admin chỉnh được) kể từ `CachedPasswordHashAt` — quá hạn hoặc
   chưa từng có lần đăng nhập online thành công nào thì vẫn báo lỗi 503
   như cũ, KHÔNG có fallback.

## Rủi ro đã nhận diện + cách giảm thiểu

- **Đổi mật khẩu bên HCRC Workspace không cập nhật ngay vào cache** — chỉ
  cập nhật ở lần đăng nhập ONLINE kế tiếp. Nếu dịch vụ sập đúng lúc vừa đổi
  mật khẩu, phải dùng tạm mật khẩu CŨ cho tới khi dịch vụ sống lại.
- **Nhân viên nghỉ việc đúng lúc dịch vụ đang sập** — cơ chế tự khoá tài
  khoản (Đồng bộ tài khoản) cũng không chạy được (chính nó cũng gọi HCRC
  Workspace) → 2 lưới an toàn: (1) giới hạn `FallbackMaxAgeDays` (buộc phải
  có 1 lần đăng nhập online gần đây mới giữ được dự phòng); (2) nút "Xoá
  mật khẩu dự phòng" tay ở trang "Người dùng" — Admin xoá ngay lập tức,
  không đợi hết hạn.
- **Minh bạch**: mỗi lần đăng nhập bằng dự phòng được ghi riêng vào Audit
  Log (`"... (dùng mật khẩu dự phòng — HCRC Workspace tạm không gọi
  được)"`) — Admin biết ngay có sự cố đang xảy ra, không lẫn với đăng nhập
  bình thường.

## File đã sửa

- `rp-db/schema.sql` — cột mới `CachedPasswordHash`/`CachedPasswordHashAt`
  (`app.Users`), `FallbackMaxAgeDays` (`app.HcrcWorkspaceSettings`, mặc
  định 14).
- `rp-server/lib/hcrcWorkspaceClient.js` — hàm mới `getFallbackMaxAgeDays()`.
- `rp-server/lib/auth.js` — `verifyCredentials()`: cache mật khẩu lúc xác
  thực online thành công, dùng dự phòng khi dịch vụ lỗi (trong hạn).
- `rp-server/server.js` — ghi rõ "(dùng mật khẩu dự phòng...)" vào Audit
  Log khi đăng nhập qua fallback.
- `rp-server/routes/hcrcWorkspaceSettings.js` — GET/PUT thêm
  `fallbackMaxAgeDays`.
- `rp-server/routes/users.js` — `GET /` trả thêm `CachedPasswordHashAt`;
  route mới `POST /:id/clear-fallback-password` (xoá dự phòng tay).
- `rp-user/.../HcrcWorkspaceSettingsPage.jsx` — ô nhập "Số ngày tối đa
  dùng mật khẩu dự phòng".
- `rp-user/.../UsersPage.jsx` — cột "Mật khẩu dự phòng" + nút "Xoá mật
  khẩu dự phòng".

## Các bước triển khai

1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (an toàn chạy lại nhiều lần).
3. `cd rp-user && npm run build`, copy `dist/` mới vào đúng chỗ Nginx/
   `serve-static.js` đang trỏ tới.
4. `pm2 restart hcrc-rp-server` (BẮT BUỘC — đổi logic đăng nhập + route
   mới).
5. Kiểm tra:
   - Đăng nhập bình thường 1 tài khoản `AuthSource='hcrcWorkspace'` →
     trang "Người dùng" hiện cột "Mật khẩu dự phòng" đã có giá trị (ngày
     hôm nay).
   - Trang "Xác thực HCRC Workspace" → tạm bỏ tick "Bật xác thực HCRC
     Workspace" (mô phỏng dịch vụ sập) → Lưu.
   - Đăng nhập LẠI đúng tài khoản/mật khẩu cũ ở bước 1 → vẫn vào được
     (dùng dự phòng) — kiểm tra Audit Log thấy dòng "... (dùng mật khẩu dự
     phòng ...)".
   - Đăng nhập với mật khẩu SAI → vẫn báo "Sai tên đăng nhập hoặc mật
     khẩu" như bình thường (dự phòng không làm mất kiểm tra mật khẩu).
   - Bấm "Xoá mật khẩu dự phòng" ở trang "Người dùng" → đăng nhập lại
     (dịch vụ vẫn đang "sập") → báo lỗi dịch vụ không khả dụng như trước
     bản 8.47 (không còn dự phòng để dùng).
   - Bật lại "Bật xác thực HCRC Workspace" sau khi kiểm tra xong.

Không ảnh hưởng tài khoản `AuthSource='local'` (kể cả Admin hệ thống, luôn
bị ép local) — cơ chế dự phòng chỉ áp dụng cho `AuthSource='hcrcWorkspace'`.
