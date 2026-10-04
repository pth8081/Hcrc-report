# Hướng dẫn triển khai gộp — bản 8.29 đến 8.71 (làm 1 lần)

**Mục đích**: theo yêu cầu người dùng — thay vì đọc/làm tuần tự từng mục
trong "Nhật ký triển khai (từ bản 8.31)" (nhiều mục riêng, mỗi mục 1 bản),
file NÀY gộp lại thành **1 lượt làm duy nhất** để đưa server từ trước bản
8.29 lên thẳng bản 8.71. Các bước **idempotent** (an toàn chạy lại nhiều
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
   bản 8.63-8.67 (sửa gửi email tương thích Postfix/Exchange/Gmail, thêm
   EWS, hỗ trợ chứng chỉ tự ký) KHÔNG cần gói npm nào mới, tự dựng bằng
   module gốc của Node):
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
     ai cho tới khi admin chủ động "Gán siêu thị" — xem mục D.5).
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
- [ ] (CHỈ nếu đã làm mục H — không dùng Nginx) etl-admin/api-admin/rp-user
  → "Chứng chỉ TLS" (chỉ tài khoản vai trò hệ thống thấy mục này): upload
  private key + public cert → trang báo đúng "cần restart" (lần đầu) hay
  "đã áp dụng ngay" (gia hạn); `curl -k https://<ip>:<cổng>/` trả về đúng
  dữ liệu sau khi restart (8.71).

---

## H. Upload chứng chỉ TLS cho PM2 (bản 8.71 — TUỲ CHỌN, CHỈ cần nếu KHÔNG dùng Nginx)

**Bỏ qua TOÀN BỘ mục này nếu hệ thống đang dùng Nginx để lo HTTPS** (mục
E/phần lớn triển khai thật) — tính năng này dành riêng cho topology
"PM2-only" (`deploy/Hướng dẫn triển khai PM2.md`) muốn có HTTPS mà không
cần dựng Nginx.

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
4. (Chỉ nếu 2 service NỘI BỘ gọi lẫn nhau qua HTTPS bằng CA tự tạo — vd
   rp-server gọi api-server, bản 8.70) Copy CA.pem sang máy chủ bên GỌI,
   đặt `NODE_EXTRA_CA_CERTS=/đường-dẫn/ca.pem` trong `.env` của service
   đó, restart — xem chi tiết ở `deploy/Cập nhật bản 8.71 — Upload chứng
   chỉ TLS qua giao diện web.md` (lý do: service nội bộ KHÔNG tự tin
   tưởng CA tự tạo/nội bộ của service khác, khác hẳn CA công khai như
   Let's Encrypt — KHÔNG dùng `rejectUnauthorized:false`/
   `NODE_TLS_REJECT_UNAUTHORIZED=0`, cả 2 đều nguy hiểm).

Không có bước nào ở trên làm mất dữ liệu đã có hoặc ảnh hưởng job/báo cáo
đang chạy ổn định — mọi thay đổi CSDL đều là CREATE/ALTER thêm mới.
