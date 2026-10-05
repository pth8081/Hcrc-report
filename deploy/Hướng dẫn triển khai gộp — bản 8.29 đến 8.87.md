# Hướng dẫn triển khai gộp — bản 8.29 đến 8.87 (làm 1 lần)

**Mục đích**: theo yêu cầu người dùng — thay vì đọc/làm tuần tự từng mục
trong "Nhật ký triển khai (từ bản 8.31)" (nhiều mục riêng, mỗi mục 1 bản),
file NÀY gộp lại thành **1 lượt làm duy nhất** để đưa server từ trước bản
8.29 lên thẳng bản 8.87 (KHÔNG gồm bản 8.82 — script ad-hoc
`deleteThanhVienLiveSync.js`, chạy khi cần, không phải bước triển khai
thường trực). Các bước **idempotent** (an toàn chạy lại nhiều
lần) được gộp chỉ chạy **1 LẦN** ở bản mới nhất thay vì lặp lại theo từng
bản cũ. Nếu server đã ở 1 bản nào đó rồi (vd đã tới 8.62), chỉ cần làm
PHẦN CÒN THIẾU — hầu hết các bước dưới đây không hại gì nếu lỡ làm lại.

File gộp "Nhật ký triển khai (từ bản 8.31)" và từng file riêng
`deploy/Cập nhật bản X.Y — ....md` VẪN giữ nguyên, dùng để tra lại lý do/
chi tiết kỹ thuật của từng bản khi cần — file này chỉ gộp phần "làm gì".

---

## A. Code + cấu hình (theo đúng thứ tự)

1. `git pull origin main`.

2. Cài gói npm mới cho backend (gộp từ 8.39 captcha + 8.41 WebAuthn
   (rp-server) + 8.78 WebAuthn (etl, api-server) — bản 8.63-8.67 (sửa gửi
   email tương thích Postfix/Exchange/Gmail, thêm EWS, hỗ trợ chứng chỉ tự
   ký) KHÔNG cần gói npm nào mới, tự dựng bằng module gốc của Node):
   ```
   cd rp-server && npm install
   cd ../etl && npm install
   cd ../api-server && npm install
   ```

3. Build + cài gói npm mới cho cả 3 frontend (gộp từ 8.39 + 8.41 + 8.83
   "PWA thật cho etl-admin/api-admin" — làm ở bước C bên dưới cùng lúc
   build lần cuối, không cần làm riêng ở đây).

4. Bổ sung biến môi trường MỚI nếu chưa có (không phải mọi tính năng đều
   bắt buộc — xem ghi chú từng dòng):
   - `rp-server/.env`: `WEBAUTHN_RP_ID=<domain thật, không có https://>` và
     `WEBAUTHN_RP_ORIGIN=https://<domain thật>` (bản 8.41 — vân tay/Face
     ID). **Thiếu 2 biến này tính năng tự tắt, KHÔNG crash** — chỉ bắt
     buộc nếu muốn dùng đăng nhập vân tay/Face ID.
   - `etl/.env`: `WEBAUTHN_RP_ID=<domain thật etl-admin>` và
     `WEBAUTHN_RP_ORIGIN=https://<domain thật etl-admin>`; `api-server/
     .env`: cùng 2 biến nhưng trỏ đúng domain thật **api-admin** (bản 8.78
     — vân tay/Face ID cho ETL, API). Cùng quy ước: thiếu thì tính năng tự
     tắt ở ĐÚNG app đó, KHÔNG crash, "Đặt lại mã 2FA" vẫn dùng bình
     thường.
   - `etl/.env` và `api-server/.env`: `SMTP_HOST`/`ALERT_EMAIL_TO` (bản
     8.57 — email cảnh báo "Giám sát cấu trúc CSDL"/"Trạng thái kết nối")
     — có thể ĐÃ cấu hình sẵn (dùng chung mailer với cảnh báo lỗi đồng bộ
     ETL cũ); thiếu thì 2 job vẫn chạy/ghi lịch sử bình thường, chỉ không
     gửi được email. Nếu gateway là Postfix cổng 465: chỉ cần đổi
     `SMTP_PORT=465`, KHÔNG cần khai thêm `SMTP_SECURE` (bản 8.63 — tự
     nhận đúng theo cổng). Nếu Postfix đó dùng chứng chỉ TLS TỰ KÝ: thêm
     `SMTP_INSECURE_TLS=true` (bản 8.67) — thiếu dòng này ETL sẽ KHÔNG
     gửi được email cảnh báo, báo lỗi "self signed certificate".
   - `etl/.env`: `DSMART16_SERVER`/`DSMART16_USER`/`DSMART16_PASSWORD`
     (bản 8.55) — **CHỈ cần nếu triển khai tính năng "Top bán chạy tồn
     kho=0"** (xem mục B.6 bên dưới), bỏ qua nếu không dùng.
   - `rp-server/.env`: `INTERNAL_API_SERVER_URL`/`INTERNAL_API_SECRET`
     (bản 8.70 — "Upload cảnh báo hàng tồn" từ rp-user) VÀ `api-server/
     .env`: `ETL_DB_SERVER`/`ETL_DB_DATABASE`/`ETL_DB_USER`/
     `ETL_DB_PASSWORD` (**COPY Y NGUYÊN** giá trị `ADMIN_*` đang có trong
     `etl/.env` — dùng lại đúng tài khoản `etl_admin`, KHÔNG tạo tài khoản
     SQL mới) + `INTERNAL_API_SECRET` (PHẢI khớp y hệt giá trị bên
     rp-server). **Thiếu các biến này tính năng tự trả lỗi rõ ràng khi bị
     gọi, KHÔNG crash server** — chỉ bắt buộc nếu muốn siêu thị tự upload
     ngay trên rp-user (không dùng thì vẫn upload qua etl-admin như cũ).

5. Chạy lại schema CSDL (an toàn chạy lại nhiều lần — chỉ CREATE/ALTER
   thêm bảng/cột mới, không xoá dữ liệu cũ):
   - `rp-db/schema.sql` — gộp đủ các bảng/cột mới từ bản 8.41 đến 8.65:
     `app.UserWebAuthnCredentials`, `app.RoleDashboardGroupAccess`,
     `app.UserDashboardPreferences`, cột `CachedPasswordHash`/
     `CachedPasswordHashAt`/`FallbackMaxAgeDays`, `app.UserReportAccess`/
     `app.UserDashboardGroupAccess`, `app.DepartmentStoreMapping` (+ menu
     mới), `app.UserStoreAccess`, cột `Protocol`/`EwsUrl`/`EwsInsecureTls`
     trên `app.EmailSettings` (bản 8.65 — gửi email qua Exchange bằng
     EWS, mặc định `Protocol='smtp'`, KHÔNG đổi cấu hình SMTP đang chạy),
     cột `SmtpInsecureTls` trên `app.EmailSettings` (bản 8.67 — bỏ qua
     kiểm tra chứng chỉ TLS tự ký cho nhánh SMTP, mặc định `0`), menu mới
     `stock-alert-upload` (bản 8.70 — "Upload cảnh báo hàng tồn", CHƯA ai
     có quyền cho tới khi cấp tay ở mục D).
   - `etl-db/schema.sql` — bảng mới `etl.DataSourceConnectionStatus`/
     `etl.SchemaSnapshots`/`etl.SchemaChangeLog` (bản 8.57),
     `etl.StockAlertThresholds` (bản 8.68 — ngưỡng cảnh báo hàng tồn theo
     từng cặp Mã hàng/Siêu thị), `admin.AdminUserStoreAccess` (bản 8.69 —
     phạm vi siêu thị của 1 tài khoản etl-admin, mặc định KHÔNG giới hạn
     ai cho tới khi admin chủ động "Gán siêu thị" — xem mục D.5),
     `admin.AdminWebAuthnCredentials` (bản 8.78 — vân tay/Face ID).
   - `api-db/schema.sql` — bảng mới `api.DataSourceConnectionStatus`
     (bản 8.57), `admin.AdminWebAuthnCredentials` (bản 8.78 — vân tay/
     Face ID, cùng cấu trúc bảng bên etl-db nhưng CSDL riêng `HCRC_API`).

6. Nginx (bản 8.33 — **sửa TAY, `git pull`/`pm2 restart` KHÔNG đủ**): mở
   file cấu hình Nginx thật đang dùng cho domain etl-admin, thêm 1
   `location` RIÊNG khớp đúng 2 route Nhập hàng loạt
   (`/admin/sync-jobs/import`, `/admin/data-sources/import`), nâng
   `proxy_read_timeout`/`proxy_send_timeout` lên 600s — xem khối cấu hình
   mẫu ở `deploy/nginx.conf` (khối `/admin/` còn lại giữ nguyên 65s). Sau
   đó: `nginx -t` (phải báo "syntax is ok") rồi `systemctl reload nginx`.

7. Nginx (bản 8.83 — **sửa TAY, chỉ cần nếu dùng Nginx đọc thẳng file,
   KHÔNG cần nếu PM2-only**): thêm khối `location = /manifest.webmanifest
   {...}` vào server block `api-admin.hcrc.vidu.vn` VÀ
   `etl-admin.hcrc.vidu.vn` (copy nguyên văn từ `deploy/nginx.conf`,
   domain `report.hcrc.vidu.vn` đã có sẵn khối tương tự) — PWA mới của 2
   app này cần đúng `Content-Type: application/manifest+json`. `nginx -t`
   rồi `systemctl reload nginx`.

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

7. **(CHỈ nếu triển khai "Tồn kho theo ngưỡng"/"Cảnh báo hàng tồn" — bản
   8.68; bỏ qua cả mục này nếu không dùng)**:
   1. Dùng LẠI đúng 2 domain `banhang_sku`/`tonkho_sku` đã có cho "Top bán
      chạy tồn kho=0" — đã làm mục B.6 rồi thì **bỏ qua bước này**, có số
      liệu ngay. Chưa từng làm thì làm theo đúng `bc-ton-kho-0.md` Bước 1+2
      trước (DBA tạo 2 VIEW + `node scripts/seedZeroStockSkuSync.js`).
   2. `cd rp-server && node scripts/seedStockThresholdReport.js && node scripts/seedStockAlertReport.js`.
   3. etl-admin → "Cảnh báo hàng tồn" → upload file ngưỡng (nếu dùng báo
      cáo cảnh báo riêng từng mặt hàng/siêu thị) — **từ bản 8.69**, nếu
      tài khoản upload chỉ được giao quản lý 1 (vài) siêu thị cụ thể, file
      đó CHỈ được chứa đúng (các) siêu thị trong phạm vi được gán (xem
      mục D.5), ngoài phạm vi sẽ bị từ chối.
   4. Gán quyền xem 2 báo cáo mới cho vai trò cần dùng (rp-user → Phân
      quyền) + quyền menu "Cảnh báo hàng tồn" (etl-admin → Vai trò, xem
      mục D.4).

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
5. **(bản 8.68, chỉ nếu đã làm mục B.7)** etl-admin → "Vai trò" → cấp
   quyền menu "Cảnh báo hàng tồn" cho vai trò cần dùng; rp-user → Phân
   quyền → gán quyền xem 2 báo cáo "Tồn kho theo ngưỡng"/"Cảnh báo hàng
   tồn" mới.
6. **(bản 8.69)** etl-admin → "Phân quyền" → với MỖI tài khoản chỉ quản
   lý 1 (vài) siêu thị cụ thể (vd nhân sự 1 siêu thị tự upload file ngưỡng
   cảnh báo của mình), bấm "Gán siêu thị" → chọn đúng (các) mã Điểm của
   siêu thị đó → Lưu. Tài khoản KHÔNG gán gì (mặc định) vẫn xem/sửa được
   TOÀN BỘ như trước — không tự ý giới hạn tài khoản nào chưa gán rõ.
7. **(bản 8.70, chỉ nếu đã khai đủ biến môi trường `INTERNAL_API_*`/
   `ETL_DB_*` ở mục A.4)** rp-user → "Vai trò" → cấp quyền menu "Upload
   cảnh báo hàng tồn" cho vai trò "Siêu thị"/vai trò cần dùng (mặc định
   CHƯA ai có quyền này).

---

## E. Khuyến nghị bảo mật (bản 8.61)

Nếu đã chạy script `seedThanhVienLiveSync.js` ở mục B.2: **đổi lại mật
khẩu CSDL thật (`etl_reader`) ở cả 34 máy chủ** sau khi triển khai xong —
mật khẩu hiện nằm vĩnh viễn trong lịch sử Git của repo (người dùng đã
được cảnh báo và xác nhận chấp nhận rủi ro này ở bản 8.61).

---

## F. Cấu hình gửi email (bản 8.63-8.67 — làm SAU khi đã deploy xong A/B/C)

Trang "Thiết lập email" (rp-user → menu "Thiết lập email") giờ hỗ trợ
**5 loại gateway**, chọn đúng 1 dropdown là tự điền sẵn host/port/giao
thức — vẫn sửa tay được mọi ô:

1. **Postfix** (relay nội bộ) — mặc định **KHÔNG cần đăng nhập** (để
   trống Username/Password), cổng 465 (SMTPS, tự bật TLS đúng theo cổng).
   **Nếu Postfix dùng chứng chỉ TLS TỰ KÝ** (không do CA công khai cấp —
   RẤT phổ biến ở Postfix nội bộ công ty, xem bản 8.67): **BẮT BUỘC** tick
   thêm "Bỏ qua kiểm tra chứng chỉ TLS" trong form — thiếu bước này gửi sẽ
   LUÔN thất bại với lỗi "self-signed certificate" dù host/port đều đúng.
2. **Exchange qua SMTP** (cổng 587) — dùng được cho cả Exchange Online
   lẫn Exchange tại chỗ có bật SMTP AUTH — **BẮT BUỘC** Username/Password
   (dùng "Mật khẩu ứng dụng" nếu tài khoản bật MFA). Cũng có ô "Bỏ qua
   kiểm tra chứng chỉ TLS" nếu máy chủ Exchange tại chỗ dùng chứng chỉ tự
   ký (Exchange Online dùng chứng chỉ CA công khai, không cần tick).
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
   lại đúng chỗ đó. Báo lỗi đúng chữ **"self signed certificate"** nghĩa
   là máy chủ gateway dùng chứng chỉ TLS tự ký — quay lại tick "Bỏ qua
   kiểm tra chứng chỉ TLS" rồi gửi thử lại.

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
- [ ] rp-user → Dashboard: dropdown "Chọn nhóm" đổi được giữa 🏆 Top 5 /
  ⚡ Realtime (8.42, đổi UI thẻ lưới → dropdown ở 8.84); "⚙️ Tuỳ chỉnh"
  hoạt động, 2 nút đổi thứ tự hiện rõ chữ "Lên"/"Xuống" (8.45/8.46); các
  bảng quản trị có checkbox + "Xoá N mục đã chọn" (8.62).
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
  email thật — nếu gateway dùng chứng chỉ TLS tự ký (vd Postfix nội bộ),
  đã tick "Bỏ qua kiểm tra chứng chỉ TLS" (8.67), không còn báo lỗi "self
  signed certificate".
- [ ] (nếu đã làm mục B.7) rp-user → báo cáo "Tồn kho theo ngưỡng": chọn
  được "Tồn dưới"/"Tồn trên" + tự nhập mức ngay trên bộ lọc (8.68).
  etl-admin → "Cảnh báo hàng tồn": upload file mẫu thành công, báo cáo
  "Cảnh báo hàng tồn" (rp-user) lên đúng số liệu đối chiếu ngưỡng đã khai
  (8.68).
- [ ] etl-admin → "Phân quyền": cột "Phạm vi siêu thị" + nút "Gán siêu
  thị" hiện ra (chỉ tài khoản vai trò hệ thống thấy nút, 8.69); gán thử 1
  tài khoản 1 siêu thị → đăng nhập tài khoản đó → "Cảnh báo hàng tồn" chỉ
  thấy đúng dòng của siêu thị đó; thử upload file có dòng thuộc siêu thị
  khác → bị từ chối (400), không ghi gì; upload đúng phạm vi → ngưỡng của
  siêu thị khác (do người khác khai trước đó) vẫn còn nguyên, không bị
  xoá mất (8.69).
- [ ] (nếu đã khai đủ biến môi trường `INTERNAL_API_*`/`ETL_DB_*` và cấp
  quyền menu ở mục D.7) rp-user → "Upload cảnh báo hàng tồn": trang hiện
  đúng "Phạm vi của bạn: [tên siêu thị]"; upload file đúng phạm vi thành
  công; upload file có dòng thuộc siêu thị khác bị từ chối (400); vào
  etl-admin → "Cảnh báo hàng tồn" thấy đúng dữ liệu vừa upload từ rp-user
  (8.70).
- [ ] (CHỈ nếu đã làm mục H.1 — không dùng Nginx) etl-admin/api-admin/rp-user
  → "Chứng chỉ TLS" (chỉ tài khoản vai trò hệ thống thấy mục này): upload
  private key + public cert → trang báo đúng "cần restart" (lần đầu) hay
  "đã áp dụng ngay" (gia hạn); `curl -k https://<ip>:<cổng>/` trả về đúng
  dữ liệu sau khi restart (8.71).
- [ ] (CHỈ nếu đã làm mục H.2 — CHỈ còn ở rp-user từ bản 8.73) rp-user →
  trang "Chứng chỉ TLS" → phần "CA tin cậy": thêm 1 CA → cuộc gọi trước
  đó bị lỗi "self signed certificate" nay thành công NGAY, không cần
  restart; xoá CA đó → cuộc gọi bị từ chối lại, các CA khác đã thêm
  không bị ảnh hưởng (8.72). etl-admin/api-admin KHÔNG còn phần này
  (8.73).
- [ ] etl-admin VÀ api-admin → "Xuất Excel (danh sách hiện có, chưa mã
  hoá)" ở trang Nguồn dữ liệu → mở file, cột Password trống, các cột khác
  đúng dữ liệu thật (8.77).
- [ ] etl-admin VÀ api-admin → "Tài khoản của tôi" (tài khoản Admin hệ
  thống): có mục "Bảo mật — Xác thực hai yếu tố" (8.78, "Đặt lại mã 2FA")
  + "Bảo mật — Vân tay/Face ID" (8.78, đăng ký được bằng thiết bị thật
  nếu đã khai `WEBAUTHN_RP_*`); đăng nhập lại, bấm "Dùng vân tay/Face ID"
  ở bước xác thực hai yếu tố → vào thẳng hệ thống, không cần gõ mã 6 số.

---

## H. Chứng chỉ TLS cho PM2 (bản 8.71-8.73)

### H.1 — PM2 tự chạy HTTPS khi NGƯỜI KHÁC gọi VÀO (bản 8.71 — TUỲ CHỌN, CHỈ cần nếu KHÔNG dùng Nginx)

**Bỏ qua mục H.1 nếu hệ thống đang dùng Nginx để lo HTTPS** (mục E/phần
lớn triển khai thật) — tính năng này dành riêng cho topology "PM2-only"
(`deploy/Hướng dẫn triển khai PM2.md`) muốn có HTTPS mà không cần dựng
Nginx.

1. Vào etl-admin/api-admin/rp-user (chỉ tài khoản vai trò hệ thống thấy
   mục "Chứng chỉ TLS") → upload private key + public cert (+ CA/chain
   nếu CA cấp kèm file chuỗi riêng) cho ĐÚNG hệ thống đó.
2. Lần upload ĐẦU TIÊN (đang HTTP) → trang báo rõ lệnh `pm2 restart` cần
   chạy — chạy đúng lệnh đó. Lần SAU (gia hạn) → áp dụng ngay, không cần
   làm gì thêm.
3. (Tuỳ chọn) Muốn giao diện TĨNH (rp-user/api-admin/etl-admin) CŨNG chạy
   HTTPS: thêm `TLS_CERT_DIR` (trỏ tới thư mục `certs/` của backend song
   sinh, vd `../etl/certs`) vào mục `env` của ĐÚNG tiến trình giao diện đó
   trong `deploy/ecosystem.config.js`, `pm2 restart` tiến trình đó.

### H.2 — PM2 tự BIẾT TIN AI khi CHÍNH MÌNH gọi RA (bản 8.72, thu hẹp ở bản 8.73 — TUỲ CHỌN, áp dụng DÙ CÓ hay KHÔNG dùng Nginx)

Khác H.1 — mục này CHO DÙ hệ thống có dùng Nginx hay không, chỉ cần CÓ
XẢY RA việc 1 service nội bộ GỌI RA sang hệ thống khác qua HTTPS (vd
rp-server gọi api-server, bản 8.70; hoặc gọi ra HCRC Workspace) VÀ bên
kia dùng CA nội bộ/tự tạo (không phải CA công khai) thì mới cần.

**CHỈ áp dụng ở report server (rp-server + rp-user) — từ bản 8.73, theo
yêu cầu người dùng, etl và api-server KHÔNG còn tính năng này nữa** (đã
gỡ khỏi etl-admin/api-admin, chỉ còn đúng phần upload chứng chỉ TLS ở
mục H.1). Nếu hệ thống khác (etl/api-server) tự gọi ra ngoài và cần cơ
chế này trong tương lai, phải làm lại từ đầu, không còn sẵn trên 2 hệ
thống đó.

1. Nhận diện đúng lỗi: cuộc gọi báo `self signed certificate`/
   `unable to verify the first certificate`.
2. Vào rp-user → trang "Chứng chỉ TLS" → phần "CA tin cậy (cho các cuộc
   gọi ra ngoài)" → nhập nhãn gợi nhớ + chọn file CA của hệ thống BÊN KIA
   → "Thêm CA tin cậy".
3. Áp dụng NGAY, không cần restart — kiểm tra lại cuộc gọi trước đó đã
   thành công.

**KHÔNG dùng** `rejectUnauthorized:false`/`NODE_TLS_REJECT_UNAUTHORIZED=0`
(tắt HẲN kiểm tra chứng chỉ, nguy hiểm) hay sửa tay `NODE_EXTRA_CA_CERTS`
trong `.env` (cách cũ, phải restart) — trang "CA tin cậy" làm đúng việc
này qua UI, áp dụng sống.

---

## I. Sửa lỗi captcha đăng nhập hiện rỗng không log (bản 8.74, KHẨN)

`src/lib/api.js` (cả 3 app) trước đây âm thầm coi response KHÔNG phải
JSON (dù HTTP status vẫn 200 OK — vd rơi vào "SPA fallback" của
`serve-static.js` khi thiếu `PROXY_PREFIX`/`PROXY_TARGET_PORT`) là THÀNH
CÔNG, khiến captcha hiện trống mà KHÔNG log lỗi ở đâu cả (server lẫn
console trình duyệt). Đã sửa: ném lỗi rõ ràng khi gặp response không phải
JSON + thêm `console.error` khi `CaptchaField.jsx` tải captcha lỗi.

1. `git pull origin main`.
2. Build lại cả 3 giao diện, copy `dist/` mới (sửa thuần frontend, KHÔNG
   cần restart backend):
   ```
   cd rp-user && npm run build
   cd ../etl-admin && npm run build
   cd ../api-admin && npm run build
   ```
3. Kiểm tra captcha đã hiện ảnh ở cả 3 trang đăng nhập. **Nếu vẫn trống**:
   mở DevTools (F12) → Console → đọc lỗi mới hiện ra. Nếu là "Phản hồi
   không phải JSON" → chạy `curl -i https://<domain>/api/auth/captcha`
   (`/admin/auth/captcha` cho etl-admin/api-admin) — nếu trả HTML thay vì
   JSON, triển khai đang thiếu `PROXY_PREFIX`/`PROXY_TARGET_PORT` ở tiến
   trình giao diện đó (`deploy/ecosystem.config.js`, xem chú thích đầu
   `deploy/serve-static.js`) — thêm đúng 2 biến rồi `pm2 restart` tiến
   trình đó (SỬA CẤU HÌNH, không phải lỗi code).

**LƯU Ý**: các lỗi khác trong log PM2 lúc báo cáo lỗi này (SELECT
permission denied trên `dwh.ReportFacts`/`etl.CoreItemList`, "Invalid
object name 'app.SystemLog'", lỗi SSL gửi email lịch báo cáo) **KHÔNG
liên quan tới captcha** — route captcha không đụng CSDL nào — các lỗi đó
cần xử lý riêng (thiếu quyền SQL/thiếu bảng ở từng báo cáo liên quan).

---

## J. Báo cáo Đơn đặt hàng / Đơn nhập hàng / So sánh đặt–nhận (bản 8.75 — CẦN DBA XÁC NHẬN TRƯỚC, KHÁC các mục trên)

Khác mọi mục trên (chỉ cần `pm2 restart`/build lại) — mục này **CHƯA chạy
được ngay** vì còn thiếu 1 bước bắt buộc phía DBA. Xem đầy đủ:
`bc-don-dat-hang.md`.

1. **[DBA — BẮT BUỘC TRƯỚC TIÊN]** Đối chiếu VIEW mẫu ở `bc-don-dat-hang.md`
   mục 2 với tên cột THẬT của `ST_ORDER`/`ST_ORDER_ARC` (VIEW hiện tại chỉ
   là VÍ DỤ, dùng tên cột phỏng đoán từ mẫu phiếu in — CHƯA xác nhận với
   DBA) — tạo `CREATE VIEW dbo.vw_DonDatHangChiNhanh` trên DSMART16 với
   tên cột ĐÃ SỬA ĐÚNG.
2. Chạy `rp-db/schema.sql` (BẮT BUỘC — sửa CHECK constraint
   `CK_ReportCatalog_SourceType`, kèm sửa luôn 2 giá trị thiếu từ bản
   8.68).
3. `cd etl && node scripts/seedDonDatHangSync.js` (cần
   `DSMART16_SERVER`/`DSMART16_USER`/`DSMART16_PASSWORD` trong `.env`).
4. `cd rp-server && node scripts/seedPurchaseOrderReports.js`.
5. rp-user → Hệ thống → Phân quyền — gán quyền xem 3 `ReportId`
   (`bc-don-dat-hang`/`bc-don-nhap-hang`/`bc-so-sanh-dat-nhan`).
6. `pm2 restart hcrc-etl hcrc-rp-server`.
7. Đợi tối đa 15 phút (chu kỳ đồng bộ) rồi kiểm tra báo cáo có dữ liệu —
   siêu thị CHƯA khai "Ánh xạ Điểm - STK_ID" sẽ KHÔNG xuất hiện (không
   phải lỗi, bổ sung ánh xạ để hiện ra).

---

## K. Sửa treo khi xoá hàng loạt Nguồn dữ liệu (bản 8.76)

Xoá hàng loạt "Nguồn dữ liệu"/"Đồng bộ" (etl-admin) bị TREO VÔ THỜI HẠN
nếu 1 trong các nguồn đã chọn đang mất kết nối mạng kiểu "zombie" (không
từ chối rõ ràng, chỉ lặng im) — `etl/lib/dataSourcePool.js` đóng kết nối
cũ không có timeout, chặn đứng toàn bộ vòng xoá tuần tự. Sửa thuần
backend, không đổi CSDL.

1. `git pull origin main`.
2. `pm2 restart hcrc-etl` (BẮT BUỘC).
3. Kiểm tra: xoá hàng loạt "Nguồn dữ liệu"/"Đồng bộ" — không còn treo
   (kể cả khi 1 nguồn trong đó đang mất kết nối mạng thật, chỉ mất thêm
   tối đa 5 giây thay vì vô thời hạn).

---

## L. Xuất Excel chưa mã hoá cho Nguồn dữ liệu (bản 8.77)

Nút mới "Xuất Excel (danh sách hiện có, chưa mã hoá)" ở trang Nguồn dữ
liệu — cột Password LUÔN để trống (an toàn), nộp lại qua Nhập hàng loạt
với Password để trống = giữ nguyên mật khẩu cũ (chỉ hợp lệ khi "Name" đã
tồn tại).

1. `git pull origin main`.
2. `pm2 restart hcrc-etl` (BẮT BUỘC — route mới + sửa logic nhập hàng
   loạt).
3. `cd etl-admin && npm run build`, copy `dist/` mới.
4. Kiểm tra: "Xuất Excel (danh sách hiện có, chưa mã hoá)" → mở file, cột
   Password trống → sửa 1 dòng, để nguyên Password trống → nộp lại qua
   "Nhập hàng loạt" → dòng đó cập nhật đúng, mật khẩu KHÔNG đổi (vẫn kết
   nối được như trước).

---

## M. Đồng bộ 2FA đổi thiết bị + Vân tay/Face ID (WebAuthn) cho ETL, API (bản 8.78)

Đồng bộ đầy đủ ngang rp-user (bản 8.40/8.41) cho CẢ etl-admin lẫn
api-admin — "Đặt lại mã 2FA" (backend có sẵn, chỉ thêm giao diện) + đăng
ký vân tay/Face ID (tính năng MỚI, bảng CSDL mới + route mới + gói npm
mới). Xác thực vân tay thành công THAY HẲN bước nhập mã 2FA, giữ đúng quy
tắc đã áp dụng ở rp-user.

1. `git pull origin main` (đã làm ở mục A.1).
2. Chạy lại `etl-db/schema.sql` + `api-db/schema.sql` (đã gộp vào mục
   A.5 — bảng `admin.AdminWebAuthnCredentials`).
3. Khai `WEBAUTHN_RP_ID`/`WEBAUTHN_RP_ORIGIN` ở `etl/.env` VÀ
   `api-server/.env` (đã gộp vào mục A.4) — **bắt buộc nếu muốn dùng vân
   tay/Face ID ở app đó**, bỏ qua thì "Đặt lại mã 2FA" vẫn dùng được bình
   thường.
4. `cd etl && npm install` và `cd api-server && npm install` (gói mới
   `@simplewebauthn/server`, đã gộp vào mục A.2).
5. Build lại `etl-admin` và `api-admin` (gói mới
   `@simplewebauthn/browser`, đã gộp vào mục C.1).
6. `pm2 restart hcrc-etl` và `pm2 restart hcrc-api-server` (đã gộp vào
   mục C.2 — BẮT BUỘC, route mới `/admin/webauthn/*`).
7. Kiểm tra bằng THIẾT BỊ THẬT (điện thoại/laptop có vân tay/Face ID),
   làm ở CẢ 2 app: "Tài khoản của tôi" (tài khoản Admin hệ thống) có mục
   "Bảo mật — Xác thực hai yếu tố" (thử "Đặt lại mã 2FA") và "Bảo mật —
   Vân tay / Face ID" (đăng ký 1 thiết bị); đăng xuất/đăng nhập lại, bấm
   "Dùng vân tay/Face ID" ở bước xác thực hai yếu tố → vào thẳng hệ
   thống, KHÔNG phải gõ thêm mã 6 số.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.78 — 2FA đổi thiết bị + WebAuthn
cho ETL, API.md`.

---

## N. KHẨN: Sửa crash rp-server trên Node < 22.4 (bản 8.79)

**Làm NGAY nếu `pm2 status` thấy `hcrc-rp-server` ở trạng thái
`errored`/`pm2 logs hcrc-rp-server` có dòng `TypeError:
tls.getCACertificates is not a function`** — `lib/trustedCa.js` (bản
8.72) gọi API chỉ có từ Node >= 22.4 ngay lúc nạp module, crash toàn bộ
`hcrc-rp-server` trên server chạy Node cũ hơn (mọi API kể cả captcha/
`/api/me` đều 502, KHÔNG phải lỗi riêng captcha).

1. `git pull origin main` (đã làm ở mục A.1 nếu làm gộp từ đầu).
2. `pm2 restart hcrc-rp-server` (BẮT BUỘC — sửa thuần code, không đổi
   CSDL, không cần `npm install`/build frontend).
3. Kiểm tra: `pm2 status hcrc-rp-server` → cả 2 worker `online`; `pm2 logs
   hcrc-rp-server` → hết dòng `TypeError: tls.getCACertificates...`; trang
   đăng nhập report.hcrc.vn → captcha hiện ảnh, đăng nhập được.
4. (Tuỳ chọn) Muốn dùng lại tính năng "CA tin cậy": nâng Node.js trên
   server lên >= 22.4 rồi `pm2 restart hcrc-rp-server` lại — không nâng
   vẫn chạy bình thường, chỉ riêng tính năng này tắt.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.79 — Sửa crash rp-server trên
Node dưới 22.4 (KHẨN).md`.

---

## O. Bật/Tắt hàng loạt + sửa xoá hàng loạt dừng cả loạt (bản 8.80)

Thêm nút "Bật N đã chọn"/"Tắt N đã chọn" cho trang "Nguồn dữ liệu" và
"Đồng bộ" (etl-admin). Sửa xoá hàng loạt (2 trang này) để lỗi 1 mục
(vd nguồn còn job tham chiếu, bị `DELETE` từ chối theo bản 8.76) KHÔNG
còn chặn các mục khác — trước đây dừng im lặng ngay mục đầu tiên bị lỗi,
đúng cảm giác "xoá nhiều không được" người dùng báo cáo. Lưu ý: Bật/Tắt
(`IsActive`) và xoá được hay không là 2 việc KHÔNG liên quan — Tắt trước
KHÔNG giúp xoá được, phải xoá/đổi nguồn của các Sync Job đang tham chiếu.

1. `git pull origin main` (đã làm ở mục A.1 nếu làm gộp từ đầu).
2. `cd etl-admin && npm run build`, copy `dist/` mới (sửa thuần frontend
   — KHÔNG cần `pm2 restart` backend).
3. Kiểm tra: Nguồn dữ liệu/Đồng bộ → tick nhiều dòng → thấy đủ 3 nút
   "Bật N"/"Tắt N"/"Xoá N đã chọn" → bấm "Bật"/"Tắt" đổi đúng trạng thái
   TOÀN BỘ dòng đã chọn; thử xoá hàng loạt khi 1 nguồn còn job tham
   chiếu → các nguồn KHÁC vẫn xoá được, trang báo rõ tên nguồn bị chặn.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.80 — Bật-Tắt hàng loạt + sửa xoá
hàng loạt dừng cả loạt.md`.

---

## P. Xoá kèm job đồng bộ khi Nguồn dữ liệu còn job tham chiếu (bản 8.81)

Bấm "Xoá" 1 Nguồn dữ liệu bị chặn (còn Sync Job tham chiếu, chặn có chủ
đích từ bản 8.76) giờ hỏi thêm RIÊNG "Xoá CẢ N job này CÙNG LÚC với
nguồn?", nêu đúng tên từng job — đồng ý thì xoá job trước rồi xoá nguồn,
trong 1 thao tác, không cần tự qua trang "Đồng bộ" xoá job trước rồi
quay lại. KHÔNG tự động xoá job nào mà không hỏi.

1. `git pull origin main` (đã làm ở mục A.1 nếu làm gộp từ đầu).
2. `pm2 restart hcrc-etl` (BẮT BUỘC — route `DELETE` đổi logic).
3. `cd etl-admin && npm run build`, copy `dist/` mới.
4. Kiểm tra: xoá 1 nguồn còn job tham chiếu → hộp thoại thứ 2 nêu đúng
   tên job đang chặn → đồng ý → cả nguồn lẫn các job đó đều mất; bấm
   "Huỷ" ở bước 2 → không mất gì, giữ nguyên lỗi chặn.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.81 — Xoá kèm job đồng bộ khi
Nguồn dữ liệu còn job tham chiếu.md`.

---

## Q. PWA thật cho etl-admin + api-admin (bản 8.83)

rp-user đã là PWA thật từ bản 6.18 (cài "Thêm vào màn hình chính" trên
điện thoại) — bản 8.83 làm nốt etl-admin + api-admin, đồng bộ đầy đủ.
Có gói npm MỚI + sửa Nginx (nếu không dùng PM2-only).

1. `git pull origin main` (đã làm ở mục A.1 nếu làm gộp từ đầu).
2. `cd etl-admin && npm install && cd ../api-admin && npm install` (gói
   mới `vite-plugin-pwa`, đã gộp vào mục A.3 ở trên).
3. Build lại `etl-admin`/`api-admin` (đã gộp vào mục C.1 — giờ có thêm
   `manifest.webmanifest`/`sw.js`/`registerSW.js`/`workbox-*.js`, copy
   TOÀN BỘ `dist/`).
4. (Chỉ nếu dùng Nginx đọc thẳng file, không phải PM2-only) Thêm khối
   `location = /manifest.webmanifest {...}` vào server block
   `api-admin.hcrc.vidu.vn` VÀ `etl-admin.hcrc.vidu.vn` (đã gộp vào mục
   A.7 ở trên) → `nginx -t` → `systemctl reload nginx`.
5. Kiểm tra bằng điện thoại thật: mở etl-admin/api-admin → Android Chrome
   (menu ⋮ → "Cài đặt ứng dụng") hoặc iOS Safari (Chia sẻ → "Thêm vào màn
   hình chính") → icon riêng từng app hiện ra, mở toàn màn hình.

Chi tiết đầy đủ (kèm kết quả kiểm tra responsive cả 3 app):
`deploy/Cập nhật bản 8.83 — PWA thật cho etl-admin + api-admin.md`.

---

## R. Dropdown "Chọn nhóm" thay thẻ lưới ở trang Dashboard (bản 8.84)

Chỉ `rp-user`, chỉ frontend — KHÔNG gói npm mới, KHÔNG đổi API/CSDL,
KHÔNG cần restart backend nào.

1. `git pull origin main` (đã làm ở mục A.1 nếu làm gộp từ đầu).
2. Build lại `rp-user` (đã gộp vào mục C — `cd rp-user && npm run build`).
3. Kiểm tra: rp-user → Dashboard (dashboard có ≥ 2 nhóm) → thấy dropdown
   "Chọn nhóm" thay thẻ lưới cũ 🏆/⚡ → chọn nhóm khác → danh sách ô đổi
   đúng theo nhóm vừa chọn.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.84 — Dropdown Chọn nhóm thay thẻ
lưới ở trang Dashboard.md`.

---

## S. Sửa màn hình trắng khi vào URL không khớp route nào (bản 8.85)

Chỉ `rp-user`, chỉ frontend — KHÔNG gói npm mới, KHÔNG đổi API/CSDL,
KHÔNG cần restart backend nào.

1. `git pull origin main` (đã làm ở mục A.1 nếu làm gộp từ đầu).
2. Build lại `rp-user` (đã gộp vào mục C — `cd rp-user && npm run build`).
3. Kiểm tra: gõ thẳng URL `report.hcrc.vidu.vn/system` (hoặc URL bất kỳ
   không có trang thật) → tự chuyển về trang chủ, sidebar/topbar hiện
   bình thường (không còn trang trắng).

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.85 — Sửa màn hình trắng khi vào
URL không khớp route nào.md`.

---

## T. Thử lại + rút ngắn thời gian chờ khi VPN chi nhánh chập chờn giữa chừng đồng bộ (bản 8.86)

Chỉ `etl` (backend) — KHÔNG đổi API/CSDL, KHÔNG có gói npm mới.

1. `git pull origin main` (đã làm ở mục A.1 nếu làm gộp từ đầu).
2. (Tuỳ chọn) Thêm `DATASOURCE_INCREMENTAL_REQUEST_TIMEOUT_MS=90000` vào
   `etl/.env` nếu muốn đổi khác mặc định — bỏ qua vẫn dùng được.
3. `pm2 restart hcrc-etl` (đã gộp vào mục D ở trên).
4. Kiểm tra: etl-admin → "Đồng bộ" → theo dõi "Job lỗi trong 24h qua" sau
   vài giờ — số lượt lỗi "operation timed out..." giảm rõ rệt; `pm2 logs
   hcrc-etl` thấy dòng "⏳ [...] Lỗi mạng khi trích xuất lô dữ liệu..."
   khi VPN chập chờn (bình thường), phần lớn tự phục hồi (SUCCESS).

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.86 — Thử lại + rút ngắn thời gian
chờ khi VPN chi nhánh chập chờn giữa chừng đồng bộ.md`.

---

## U. Chặn bớt số job chạy đồng thời + không bỏ sót lỗi xin khoá (bản 8.87)

Chỉ `etl` (backend) — KHÔNG đổi API/CSDL, KHÔNG có gói npm mới.

1. `git pull origin main` (đã làm ở mục A.1 nếu làm gộp từ đầu).
2. (Tuỳ chọn) Thêm `ETL_MAX_CONCURRENT_JOBS=4` vào `etl/.env` nếu muốn
   đổi khác mặc định — bỏ qua vẫn dùng được.
3. `pm2 restart hcrc-etl` (đã gộp vào mục D ở trên).
4. Kiểm tra: `pm2 logs hcrc-etl` sau vài chu kỳ cron (10-15 phút) —
   không còn hàng loạt lỗi "operation timed out" đồng thời (nhiều job
   khác chi nhánh cùng lúc); nếu thỉnh thoảng vẫn còn lỗi xin khoá, giờ
   thấy đúng dòng đó xuất hiện trên etl-admin → "Đồng bộ" → "Job lỗi
   trong 24h qua" (trước đây hoàn toàn không hiện ở đó).

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.87 — Chặn bớt số job chạy đồng
thời + không bỏ sót lỗi xin khoá.md`.

---

Không có bước nào ở trên làm mất dữ liệu đã có hoặc ảnh hưởng job/báo cáo
đang chạy ổn định — mọi thay đổi CSDL đều là CREATE/ALTER thêm mới.
