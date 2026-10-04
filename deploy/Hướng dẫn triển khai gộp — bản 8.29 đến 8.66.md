# Hướng dẫn triển khai gộp — bản 8.29 đến 8.66 (làm 1 lần)

**Mục đích**: theo yêu cầu người dùng — thay vì đọc/làm tuần tự từng mục
trong "Nhật ký triển khai (từ bản 8.31)" (nhiều mục riêng, mỗi mục 1 bản),
file NÀY gộp lại thành **1 lượt làm duy nhất** để đưa server từ trước bản
8.29 lên thẳng bản 8.66. Các bước **idempotent** (an toàn chạy lại nhiều
lần) được gộp chỉ chạy **1 LẦN** ở bản mới nhất thay vì lặp lại theo từng
bản cũ. Nếu server đã ở 1 bản nào đó rồi (vd đã tới 8.62), chỉ cần làm
PHẦN CÒN THIẾU — hầu hết các bước dưới đây không hại gì nếu lỡ làm lại.

File gộp "Nhật ký triển khai (từ bản 8.31)" và từng file riêng
`deploy/Cập nhật bản X.Y — ....md` VẪN giữ nguyên, dùng để tra lại lý do/
chi tiết kỹ thuật của từng bản khi cần — file này chỉ gộp phần "làm gì".

---

## A. Code + cấu hình (theo đúng thứ tự)

1. `git pull origin main`.

2. Cài gói npm mới cho backend (gộp từ 8.39 captcha + 8.41 WebAuthn —
   bản 8.63-8.66 (sửa gửi email tương thích Postfix/Exchange/Gmail, thêm
   EWS) KHÔNG cần gói npm nào mới, tự dựng bằng module gốc của Node):
   ```
   cd rp-server && npm install
   cd ../etl && npm install
   cd ../api-server && npm install
   ```

3. Build + cài gói npm mới cho cả 3 frontend (gộp từ 8.39 + 8.41 — làm ở
   bước C bên dưới cùng lúc build lần cuối, không cần làm riêng ở đây).

4. Bổ sung biến môi trường MỚI nếu chưa có (không phải mọi tính năng đều
   bắt buộc — xem ghi chú từng dòng):
   - `rp-server/.env`: `WEBAUTHN_RP_ID=<domain thật, không có https://>` và
     `WEBAUTHN_RP_ORIGIN=https://<domain thật>` (bản 8.41 — vân tay/Face
     ID). **Thiếu 2 biến này tính năng tự tắt, KHÔNG crash** — chỉ bắt
     buộc nếu muốn dùng đăng nhập vân tay/Face ID.
   - `etl/.env` và `api-server/.env`: `SMTP_HOST`/`ALERT_EMAIL_TO` (bản
     8.57 — email cảnh báo "Giám sát cấu trúc CSDL"/"Trạng thái kết nối")
     — có thể ĐÃ cấu hình sẵn (dùng chung mailer với cảnh báo lỗi đồng bộ
     ETL cũ); thiếu thì 2 job vẫn chạy/ghi lịch sử bình thường, chỉ không
     gửi được email. Nếu gateway là Postfix cổng 465: chỉ cần đổi
     `SMTP_PORT=465`, KHÔNG cần khai thêm `SMTP_SECURE` (bản 8.63 — tự
     nhận đúng theo cổng).
   - `etl/.env`: `DSMART16_SERVER`/`DSMART16_USER`/`DSMART16_PASSWORD`
     (bản 8.55) — **CHỈ cần nếu triển khai tính năng "Top bán chạy tồn
     kho=0"** (xem mục B.6 bên dưới), bỏ qua nếu không dùng.

5. Chạy lại schema CSDL (an toàn chạy lại nhiều lần — chỉ CREATE/ALTER
   thêm bảng/cột mới, không xoá dữ liệu cũ):
   - `rp-db/schema.sql` — gộp đủ các bảng/cột mới từ bản 8.41 đến 8.65:
     `app.UserWebAuthnCredentials`, `app.RoleDashboardGroupAccess`,
     `app.UserDashboardPreferences`, cột `CachedPasswordHash`/
     `CachedPasswordHashAt`/`FallbackMaxAgeDays`, `app.UserReportAccess`/
     `app.UserDashboardGroupAccess`, `app.DepartmentStoreMapping` (+ menu
     mới), `app.UserStoreAccess`, cột `Protocol`/`EwsUrl`/`EwsInsecureTls`
     trên `app.EmailSettings` (bản 8.65 — gửi email qua Exchange bằng
     EWS, mặc định `Protocol='smtp'`, KHÔNG đổi cấu hình SMTP đang chạy).
   - `etl-db/schema.sql` — bảng mới `etl.DataSourceConnectionStatus`/
     `etl.SchemaSnapshots`/`etl.SchemaChangeLog` (bản 8.57).
   - `api-db/schema.sql` — bảng mới `api.DataSourceConnectionStatus`
     (bản 8.57).

6. Nginx (bản 8.33 — **sửa TAY, `git pull`/`pm2 restart` KHÔNG đủ**): mở
   file cấu hình Nginx thật đang dùng cho domain etl-admin, thêm 1
   `location` RIÊNG khớp đúng 2 route Nhập hàng loạt
   (`/admin/sync-jobs/import`, `/admin/data-sources/import`), nâng
   `proxy_read_timeout`/`proxy_send_timeout` lên 600s — xem khối cấu hình
   mẫu ở `deploy/nginx.conf` (khối `/admin/` còn lại giữ nguyên 65s). Sau
   đó: `nginx -t` (phải báo "syntax is ok") rồi `systemctl reload nginx`.

---

## B. Script 1 lần (chạy ĐÚNG THỨ TỰ bên dưới — bỏ qua dòng nào đã làm rồi)

1. **(Nếu CHƯA làm)** Chạy file `deploy/Thiết lập VIEW + tài khoản
   etl_reader tại mỗi siêu thị Thành viên.sql` tại CẢ 34 máy chủ SQL
   Server của 34 siêu thị Thành viên — **bắt buộc TRƯỚC bước 2**.

2. **(Nếu CHƯA làm)** `cd etl && node scripts/seedThanhVienLiveSync.js` —
   tạo 34 Nguồn dữ liệu + tới 68 Sync Job Live thật cho 34 siêu thị Thành
   viên (bản 8.61). An toàn chạy lại nhiều lần (khớp theo tên, bỏ qua
   siêu thị chưa có VIEW — có log rõ ràng). **File script này CHỨA MẬT
   KHẨU CSDL THẬT, đã commit nguyên văn vào Git theo yêu cầu riêng của
   người dùng** — xem cảnh báo bảo mật ở mục E bên dưới.

3. `cd rp-server && node scripts/seedLdtdHcrcReports.js [menuCode]` —
   đăng ký/cập nhật 4 báo cáo "Doanh thu cuối ngày LDTD/HCRC" (gốc +
   Thành viên), bản hiện tại đã gồm màu mới nhất (bản 8.58). `menuCode`
   mặc định `reports-kinh-doanh` — chỉ truyền nếu môi trường này seed
   lần đầu vào menu khác.

4. **(Nếu CHƯA làm)** `node scripts/seedThanhVienReportPermissions.js` —
   gán quyền xem 2 báo cáo "(Thành viên)" cho vai trò cần dùng.

5. `node scripts/seedTop5ChiNhanhReports.js [menuCode]` — đăng ký/cập
   nhật 8 báo cáo "Top 5 chi nhánh", bản hiện tại đã gồm domain "Thành
   viên" (bản 8.34) + cột "Trung bình giao dịch" (bản 8.56).

6. **(CHỈ nếu triển khai tính năng "Top bán chạy tồn kho=0" — bản 8.55;
   bỏ qua cả mục này nếu không dùng)**:
   1. `cd etl && node scripts/seedZeroStockSkuSync.js`.
   2. Theo dõi etl-admin → Log tới khi 2 job mới chạy thành công.
   3. `cd rp-server && node scripts/seedTopZeroStockReport.js && node scripts/seedCoreZeroStockReports.js`.
   4. Upload danh sách hàng Core + gán quyền xem 3 báo cáo — chi tiết đầy
      đủ ở `bc-ton-kho-0.md` và `bc-core-ton-kho-0.md`.

---

## C. Build + restart (sau khi xong A + B)

1. Build cả 3 giao diện, copy `dist/` của từng app lên đúng chỗ đang phục
   vụ tĩnh (Nginx/`serve-static.js`):
   ```
   cd rp-user && npm run build
   cd ../etl-admin && npm run build
   cd ../api-admin && npm run build
   ```
2. Restart cả 3 backend:
   ```
   pm2 restart hcrc-rp-server
   pm2 restart hcrc-etl
   pm2 restart hcrc-api-server
   ```

---

## D. Cấp quyền TAY bắt buộc sau khi deploy (không tự động)

1. **(bản 8.43 — ƯU TIÊN CAO)** rp-user → "Hệ thống → Phân quyền" → cấp
   lại quyền 2 nhóm Dashboard hiện có cho TỪNG vai trò đang dùng Dashboard
   — **MỌI vai trò (trừ Admin hệ thống) MẤT quyền xem Dashboard cho tới
   khi cấp lại tay**.
2. **(bản 8.49)** rp-user → "Vai trò" → cấp quyền menu "Ánh xạ Phòng ban
   → Siêu thị" cho vai trò cần dùng.
3. **(bản 8.57)** etl-admin + api-admin → "Vai trò" → cấp quyền menu
   "Trạng thái kết nối" (cả 2 app) và "Giám sát cấu trúc CSDL" (chỉ
   etl-admin) cho vai trò cần dùng.
4. **(bản 8.55, chỉ nếu đã làm mục B.6)** Gán quyền xem 3 báo cáo "hết
   hàng" cho vai trò cần dùng.

---

## E. Khuyến nghị bảo mật (bản 8.61)

Nếu đã chạy script `seedThanhVienLiveSync.js` ở mục B.2: **đổi lại mật
khẩu CSDL thật (`etl_reader`) ở cả 34 máy chủ** sau khi triển khai xong —
mật khẩu hiện nằm vĩnh viễn trong lịch sử Git của repo (người dùng đã
được cảnh báo và xác nhận chấp nhận rủi ro này ở bản 8.61).

---

## F. Cấu hình gửi email (bản 8.63-8.66 — làm SAU khi đã deploy xong A/B/C)

Trang "Thiết lập email" (rp-user → menu "Thiết lập email") giờ hỗ trợ
**5 loại gateway**, chọn đúng 1 dropdown là tự điền sẵn host/port/giao
thức — vẫn sửa tay được mọi ô:

1. **Postfix** (relay nội bộ) — mặc định **KHÔNG cần đăng nhập** (để
   trống Username/Password), cổng 465 (SMTPS, tự bật TLS đúng theo cổng).
2. **Exchange qua SMTP** (cổng 587) — dùng được cho cả Exchange Online
   lẫn Exchange tại chỗ có bật SMTP AUTH — **BẮT BUỘC** Username/Password
   (dùng "Mật khẩu ứng dụng" nếu tài khoản bật MFA).
3. **Gmail qua SMTP** (cổng 587) — Username = Gmail đầy đủ, Password
   PHẢI là "Mật khẩu ứng dụng" (App password, tạo tại
   myaccount.google.com/apppasswords sau khi bật "Xác minh 2 bước") —
   Google đã chặn mật khẩu đăng nhập thường cho SMTP từ ứng dụng ngoài.
4. **Exchange tại chỗ qua EWS** (API riêng, KHÔNG qua SMTP) — đăng nhập
   THẲNG vào mailbox bằng Username/Password, điền thêm "EWS URL" (thường
   dạng `https://<máy chủ Exchange>/EWS/Exchange.asmx`). **CHỈ dùng được
   cho Exchange CÀI TẠI CHỖ** — Exchange Online/Office 365 đã bị Microsoft
   chặn kiểu xác thực này (Basic Auth) từ cuối 2022. Tick thêm "Bỏ qua
   kiểm tra chứng chỉ TLS" nếu máy chủ Exchange nội bộ dùng chứng chỉ tự
   ký (CA riêng công ty).
5. **Tuỳ chỉnh** — không điền sẵn gì, tự gõ toàn bộ (dùng cho gateway
   khác không khớp 4 loại trên).

**Các bước:**
1. rp-user → "Thiết lập email" → chọn ĐÚNG loại gateway thật của công ty
   ở dropdown "Loại email gateway".
2. Điền/sửa lại host-port (hoặc EWS URL)/Username/Password/"Địa chỉ gửi
   (From)" cho khớp thật.
3. Bấm "Lưu cấu hình" → "Gửi thử" (điền 1 email nhận được) → xác nhận có
   email tới hộp thư đó.
4. Nếu "Gửi thử" báo lỗi: đọc đúng nội dung lỗi trả về (sai host/port/
   mật khẩu/URL EWS đều báo rõ, không phải lỗi 500 chung chung) và sửa
   lại đúng chỗ đó.

Không cần làm mục này nếu hệ thống hiện tại ĐÃ gửi email ổn định qua cổng
587/25 trước đây — cấu hình cũ tự chuyển `Protocol='smtp'`, hoạt động y
hệt, không bắt buộc đổi gateway chỉ vì có bản mới.

---

## G. Kiểm tra tổng hợp sau khi xong tất cả

- [ ] etl-admin → Nguồn dữ liệu: đủ danh sách siêu thị Thành viên (nếu đã
  làm mục B.1-B.2), "Kiểm tra kết nối" thành công.
- [ ] etl-admin → Đồng bộ: job chạy ổn ("Bật"); tick checkbox đầu bảng →
  nút "Xoá N mục đã chọn" hiện ra (8.62); bấm "Chạy thử" → nút tự khoá +
  "Đang chạy..." (8.60); Log thấy dòng "... — thử lại sau Xs..." nếu có
  lỗi kết nối tạm thời tới nguồn (8.59).
- [ ] etl-admin → Trạng thái kết nối / Giám sát cấu trúc CSDL: trang hiện
  ra đúng (sau khi cấp quyền ở mục D.3), "Kiểm tra lại ngay" chạy được
  (8.57).
- [ ] Màn hình đăng nhập cả 3 app: hiện ô "Mã xác nhận" (8.39) + hình
  minh hoạ riêng từng app (8.38).
- [ ] rp-user → "Tài khoản của tôi" (Admin hệ thống): có mục "Đặt lại mã
  2FA" (8.40) + đăng ký được vân tay/Face ID bằng thiết bị thật (8.41,
  cần đã khai `WEBAUTHN_RP_*`).
- [ ] rp-user → "Người dùng": có nút "Phạm vi dữ liệu" (8.50), "Gán quyền
  riêng" (8.48), cột "Mật khẩu dự phòng" (8.47).
- [ ] rp-user → Dashboard: chọn được nhóm 🏆 Top 5 / ⚡ Realtime (8.42);
  "⚙️ Tuỳ chỉnh" hoạt động, 2 nút đổi thứ tự hiện rõ chữ "Lên"/"Xuống"
  (8.45/8.46); các bảng quản trị có checkbox + "Xoá N mục đã chọn" (8.62).
- [ ] rp-user → báo cáo "Doanh thu cuối ngày ...": màu nhóm cột mới theo
  mẫu BRGMART (8.58); bảng xem trên web đã lên màu tiêu đề nhóm giống hệt
  Excel/PDF (8.53).
- [ ] rp-user → Dashboard "Top 5 chi nhánh": có thêm cột "Trung bình giao
  dịch" (8.56); tài khoản đã gán "Phạm vi dữ liệu" 1 siêu thị chỉ thấy
  đúng siêu thị đó, kể cả lúc xuất Excel/PDF (8.51/8.52).
- [ ] Trang Báo cáo (rp-user) không còn bị bó hẹp 1040px trên màn hình
  desktop (8.37).
- [ ] etl-admin → Nhập hàng loạt file Excel nhiều dòng (Nguồn dữ liệu/
  Sync Job) chạy xong không còn lỗi "Failed to fetch"/"Không kết nối được
  backend" (8.33/8.35); "Tải file mẫu" tải đúng cấu trúc, dòng 1 là header
  (8.31/8.32).
- [ ] rp-user → "Thiết lập email": dropdown "Loại email gateway" hiện đủ
  5 lựa chọn (8.63-8.66); chọn đúng loại đang dùng, "Gửi thử" nhận được
  email thật.

Không có bước nào ở trên làm mất dữ liệu đã có hoặc ảnh hưởng job/báo cáo
đang chạy ổn định — mọi thay đổi CSDL đều là CREATE/ALTER thêm mới.
