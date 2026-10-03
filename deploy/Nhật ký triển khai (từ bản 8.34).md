# Nhật ký triển khai — từ bản 8.34 trở đi

**TỰ ĐỘNG, không cần nhắc**: kể từ khi người dùng yêu cầu (03/10/2026),
MỌI lần merge vào `main` từ bản 8.34 trở đi PHẢI kèm thêm 1 mục MỚI ở
đầu file này (mới nhất lên trên, giống quy ước `VERSION.md`), tóm tắt
đúng CÁC BƯỚC triển khai thật trên server (lệnh chạy, file cần sửa tay,
thứ tự làm) — không chỉ mô tả tính năng. Việc này KHÔNG thay thế từng file
riêng `deploy/Cập nhật bản X.Y — ....md` (vẫn tạo như cũ, tiện khi chỉ cần
đưa đúng 1 bản cho IT) — file NÀY là bản gộp MỘT NƠI DUY NHẤT để xem lại
toàn bộ lịch sử triển khai liên tục, không phải mở nhiều file. TIẾP TỤC
cập nhật file này ở mọi bản sau, cho tới khi người dùng bảo dừng.

---

## 8.43 — Phân quyền Dashboard theo nhóm

**Thay đổi**: tách 2 quyền riêng cho mỗi nhóm Dashboard — "Xem dashboard"
và "Xem chi tiết" (xuất Excel/PDF). **CẢNH BÁO**: sau khi deploy, MỌI vai
trò (trừ Admin hệ thống) mất quyền xem 2 nhóm hiện có cho tới khi được cấp
lại thủ công (mặc định từ chối, giống RoleReportAccess).

**Các bước triển khai:**
1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (thêm bảng `app.RoleDashboardGroupAccess`).
3. `cd rp-user && npm run build`, copy `dist/` mới.
4. `pm2 restart hcrc-rp-server`.
5. **BẮT BUỘC**: "Hệ thống → Phân quyền" → cấp lại quyền nhóm Dashboard
   cho TỪNG vai trò đang dùng Dashboard (trước đây không cần làm gì, giờ
   phải tick lại).
6. Kiểm tra: vai trò chưa cấp quyền → không thấy nhóm; cấp "Xem dashboard"
   không cấp "Xem chi tiết" → thấy nhưng không xuất được; cấp đủ 2 → xuất
   được.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.43 — Phân quyền Dashboard theo
nhóm.md`.

---

## 8.42 — Nhóm Dashboard

**Thay đổi**: trang Dashboard có thêm bộ chọn nhóm (🏆 Top 5 chi nhánh /
⚡ Realtime) ở đầu trang — chọn nhóm mới hiện Ô bên dưới.

**Các bước triển khai:**
1. `git pull origin main`
2. `cd rp-server && node scripts/seedTop5ChiNhanhReports.js` (BẮT BUỘC —
   ghi đè DefinitionJson, giống bản 8.34).
3. `cd rp-user && npm run build`, copy `dist/` mới.
4. `pm2 restart hcrc-rp-server`.
5. Kiểm tra: Dashboard hiện 2 thẻ nhóm, chọn đúng nhóm hiện đúng Ô/tab
   tương ứng, xuất Excel/PDF vẫn hoạt động.

Không đổi CSDL. Chi tiết đầy đủ: `deploy/Cập nhật bản 8.42 — Nhóm
Dashboard.md`.

---

## 8.41 — WebAuthn vân tay/Face ID — rp-user, thay bước 2FA

**Thay đổi**: đăng ký vân tay/Face ID ở "Tài khoản của tôi" (Admin hệ
thống) → lúc đăng nhập có thêm nút "Dùng vân tay/Face ID" thay HẲN bước
nhập mã 2FA. Chỉ áp dụng `rp-user` đợt này.

**Các bước triển khai (KHÁC các bản trước — có bảng CSDL mới + BẮT BUỘC
khai domain thật):**
1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (thêm bảng `app.UserWebAuthnCredentials`,
   an toàn chạy lại nhiều lần).
3. **Thêm vào `rp-server/.env`**: `WEBAUTHN_RP_ID=<domain thật, không có
   https://>` và `WEBAUTHN_RP_ORIGIN=https://<domain thật>` — THIẾU bước
   này tính năng tự tắt (không crash, nhưng không dùng được).
4. `cd rp-server && npm install` (gói mới `@simplewebauthn/server`).
5. `cd rp-user && npm run build`, copy `dist/` mới (gói mới
   `@simplewebauthn/browser`).
6. `pm2 restart hcrc-rp-server`.
7. Kiểm tra bằng THIẾT BỊ THẬT (điện thoại/laptop có vân tay/Face ID,
   không mô phỏng được) — đăng ký 1 thiết bị, đăng xuất/đăng nhập lại,
   xác nhận bấm "Dùng vân tay/Face ID" vào thẳng hệ thống không cần gõ mã.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.41 — WebAuthn vân tay Face ID.md`.

---

## 8.40 — Tự đặt lại mã 2FA (đổi thiết bị) — rp-user

**Thay đổi**: trang "Tài khoản của tôi" (rp-user) có thêm nút "Đặt lại mã
2FA" cho tài khoản Admin hệ thống — tự quét QR mới trên thiết bị khác,
không cần nhờ admin khác. Backend đã có sẵn từ trước, chỉ thêm giao diện.

**Các bước triển khai:**
1. `git pull origin main`
2. `cd rp-user && npm run build`, copy `dist/` mới.
3. Kiểm tra: "Tài khoản của tôi" (tài khoản Admin hệ thống) có mục "Bảo
   mật — Xác thực hai yếu tố"; đặt lại thử 1 lần, 2FA cũ ngừng dùng được.

Không đổi CSDL, không đổi backend. Chi tiết đầy đủ: `deploy/Cập nhật bản
8.40 — Tự đặt lại 2FA Report.md`.

---

## 8.39 — Captcha đăng nhập (4 chữ số, cả 3 app)

**Thay đổi**: thêm ô "Mã xác nhận" (captcha 4 chữ số, tự sinh trên server
bằng `svg-captcha`, không cần Internet lúc chạy) vào form đăng nhập
ETL/API/Report, kiểm tra TRƯỚC khi tra mật khẩu.

**Các bước triển khai (KHÁC các bản trước — có gói npm MỚI):**
1. `git pull origin main`
2. Cài gói mới cho CẢ 3 backend: `cd rp-server && npm install`, tương tự
   `etl`, `api-server`.
3. Build lại CẢ 3 giao diện (`npm run build` ở `rp-user`/`etl-admin`/
   `api-admin`), copy `dist/` mới.
4. Restart CẢ 3 backend: `pm2 restart hcrc-rp-server`, `hcrc-etl`,
   `hcrc-api-server`.
5. Kiểm tra: ô "Mã xác nhận" hiện ở cả 3 màn hình đăng nhập; nhập sai →
   báo lỗi + tự đổi ảnh mới; nhập đúng → đăng nhập bình thường.

Không đổi CSDL. Chi tiết đầy đủ: `deploy/Cập nhật bản 8.39 — Captcha đăng
nhập.md`.

---

## 8.37-8.38 — Báo cáo tràn màn hình + giao diện đăng nhập mới

**Thay đổi**: bảng báo cáo (rp-user) dùng hết chiều rộng màn hình desktop
(bỏ khung hẹp 1040px cho riêng 2 trang Báo cáo); màn hình Đăng nhập cả 3
app (ETL/API/Report) bớt chữ, thêm hình minh hoạ riêng từng app.

**Các bước triển khai:**
1. `git pull origin main`
2. Build lại CẢ 3 giao diện: `cd rp-user && npm run build`, tương tự
   `etl-admin`, `api-admin`.
3. Copy `dist/` mới của từng app vào đúng chỗ Nginx/`serve-static.js`
   đang trỏ tới.
4. Kiểm tra: trang Báo cáo hiện đủ cột không cần kéo ngang; màn hình Đăng
   nhập 3 app hiện hình minh hoạ thay vì đoạn văn dài.

Không đổi CSDL, không đổi backend. Chi tiết đầy đủ: `deploy/Cập nhật bản
8.37-8.38 — Báo cáo tràn màn hình + giao diện đăng nhập mới.md`.

---

## 8.35 — Sửa nguyên nhân THẬT của "Failed to fetch"/"Không kết nối được backend"

**Vấn đề**: Nhập hàng loạt Sync Job (68 dòng/34 siêu thị Thành viên) báo
lỗi mạng giữa chừng — bản 8.33 (tăng timeout Nginx) chưa đủ vì
`etl/server.js` tự đặt `server.timeout = 120s` cho MỌI route ở tầng Node,
đóng socket trước khi tới được Nginx/serve-static.js.

**Các bước triển khai:**
1. `git pull origin main`
2. `pm2 restart hcrc-etl`
3. Kiểm tra: Nhập hàng loạt file nhiều dòng phải chạy hết (có thể mất vài
   phút), không còn "Failed to fetch"/"Không kết nối được backend".

Không đổi CSDL, không đổi Nginx lần này. Chi tiết đầy đủ: `deploy/Cập nhật
bản 8.35 — Sửa gốc Failed to fetch backend timeout.md`.

---

## 8.34 — Dashboard Top 5 đọc Doanh thu/Giao dịch từ domain "Thành viên"

**Thay đổi**: 8 báo cáo "Top 5 chi nhánh" (MART/MINIMART x Doanh thu/Giao
dịch x Cao/Thấp) đổi từ domain gốc (phủ toàn hệ thống, đồng bộ 15 phút)
sang domain "Thành viên" (Live 2 phút, hiện có 34 site) — **đánh đổi đã
xác nhận với người dùng**: Top 5 tạm thời CHỈ còn 34 site đó cho tới khi
khai Live hết toàn bộ siêu thị còn lại.

**Các bước triển khai:**
1. `git pull origin main`
2. `cd rp-server && node scripts/seedTop5ChiNhanhReports.js` (BẮT BUỘC —
   không tự áp dụng qua merge code, dùng đúng `menuCode` đã seed lần đầu
   nếu khác mặc định `reports-kinh-doanh`)
3. `pm2 restart rp-server`
4. Kiểm tra: Dashboard "Top 5 chi nhánh" (cả 16 Ô) chỉ còn hiện 34 siêu
   thị Thành viên; số liệu khớp với Ô "Realtime" cùng ngày/siêu thị.

Không đổi cấu trúc CSDL. Chi tiết đầy đủ: `deploy/Cập nhật bản 8.34 — Top
5 đọc domain Thành viên.md`.
