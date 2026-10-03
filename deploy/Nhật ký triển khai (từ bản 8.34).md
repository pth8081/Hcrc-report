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

## 8.54 — Rà soát bản 8.31→8.53 + vá 1 lỗ hổng lý thuyết

**Thay đổi**: theo yêu cầu rà soát lại của người dùng sau bản 8.53 — phát
hiện `entityIsMaDiem` (kiểm tra "báo cáo composite có an toàn để lọc theo
siêu thị không", bản 8.51) dùng `.every()` trên mảng có thể RỖNG (báo cáo
composite không có khối dữ liệu nào, chỉ toàn `isTarget`), vacuous truth
khiến BẬT lọc nhầm. Chưa có báo cáo thật nào rơi vào trường hợp này — vá
phòng ngừa, giữ đúng nguyên tắc "không chắc chắn thì KHÔNG lọc".

**Các bước triển khai:**
1. `git pull origin main`
2. `pm2 restart hcrc-rp-server` (BẮT BUỘC).

Không đổi CSDL/giao diện/hành vi báo cáo đang chạy.

---

## 8.53 — Tiêu đề nhóm cột có màu + tô đậm dòng Tổng cộng trên bảng web báo cáo

**Thay đổi**: bảng báo cáo xem trên web trước đây chỉ vẽ phẳng, không
màu — khác hẳn file Excel/PDF xuất ra (đã có tiêu đề gộp 2 dòng tô màu
theo nhóm cột + tô đậm dòng Tổng cộng từ lâu). Giờ web dùng ĐÚNG dữ liệu
`columnGroups` sẵn có (API `/run` trả thêm, trước đây chưa gửi) để vẽ
khớp hệt Excel/PDF, áp dụng tự động cho mọi báo cáo đã khai nhóm cột, ở
cả trang Báo cáo lẫn Dashboard. Đã demo (mock server + Playwright) trước
khi gộp vào `main`.

**Các bước triển khai:**
1. `git pull origin main`
2. `cd rp-user && npm run build`, copy `dist/` mới.
3. `pm2 restart hcrc-rp-server` (đổi cấu trúc JSON trả về của `/run`).
4. Kiểm tra: báo cáo có `columnGroups` → tiêu đề 2 dòng tô màu, dòng Tổng
   cộng tô tím đậm; trang không liên quan → không đổi gì.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.53 — Tiêu đề nhóm cột có màu trên
bảng web báo cáo.md`.

---

## 8.52 — Rà soát bản 8.31→8.51 + vá 3 lỗi phát hiện được

**Thay đổi**: theo yêu cầu rà soát của người dùng — phát hiện và vá 3 lỗi.
QUAN TRỌNG NHẤT: "Lịch gửi email báo cáo" và "Cảnh báo bất thường" KHÔNG
áp dụng giới hạn "Phạm vi dữ liệu" (bản 8.51) — người bị giới hạn 1 siêu
thị nhưng có menu 2 trang đó vẫn nhận được email ĐỦ mọi siêu thị. Đã vá cả
2 + 1 lỗi "Sửa" tạo dòng rác ở Ánh xạ Phòng ban (bản 8.49) + 1 ghi chú lỗi
thời ở trang Người dùng.

**Các bước triển khai (ƯU TIÊN CAO — vá lỗ rò rỉ dữ liệu):**
1. `git pull origin main`
2. `cd rp-user && npm run build`, copy `dist/` mới.
3. `pm2 restart hcrc-rp-server` (BẮT BUỘC).
4. Kiểm tra: tài khoản bị giới hạn 1 siêu thị + có menu "Lịch gửi email
   báo cáo" → tạo lịch trên báo cáo Top 5/Realtime Thành viên → "Gửi ngay"
   → email CHỈ có đúng siêu thị đã giới hạn.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.52 — Rà soát và vá lỗi
8.31-8.51.md`.

---

## 8.51 — Áp lọc dữ liệu THẬT theo siêu thị (báo cáo composite)

**Thay đổi**: LẦN ĐẦU áp dụng lọc thật — người được gán "Phạm vi dữ liệu"
ở bản 8.50 giờ CHỈ thấy đúng dữ liệu siêu thị đã gán, trong báo cáo Top 5
chi nhánh + Realtime "Thành viên" (báo cáo khác chưa áp dụng được, KHÔNG
phải lỗ hổng — chưa quy entityCode về Mã Điểm chuẩn). Server tự gắn phạm
vi, không tin client. Đã viết test riêng xác nhận đúng trước khi gộp.

**Các bước triển khai (KHÁC các bản trước — chỉ đổi backend, không đổi
CSDL/giao diện):**
1. `git pull origin main`
2. `pm2 restart hcrc-rp-server` (BẮT BUỘC).
3. Kiểm tra: tài khoản đã gán 1 siêu thị (bản 8.50) → Dashboard Top 5/
   Realtime → chỉ thấy đúng siêu thị đó, kể cả lúc xuất Excel/PDF; tài
   khoản "Toàn bộ" không bị ảnh hưởng.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.51 — Áp lọc dữ liệu theo siêu
thị.md`.

---

## 8.50 — Gán phạm vi dữ liệu theo siêu thị cho từng người dùng

**Thay đổi**: trang "Người dùng" có nút "Phạm vi dữ liệu" — gán (các) siêu
thị 1 người CHỈ ĐƯỢC THẤY (trống = "Toàn bộ", mặc định an toàn), có gợi ý
tự động theo Department+WorkLocation. **CHƯA lọc dữ liệu báo cáo thật** —
chỉ lưu lựa chọn, chờ bản sau áp dụng vào tầng chạy báo cáo.

**Các bước triển khai:**
1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (bảng mới `app.UserStoreAccess`).
3. `cd rp-user && npm run build`, copy `dist/` mới.
4. `pm2 restart hcrc-rp-server` (BẮT BUỘC — route API mới).
5. Kiểm tra: "Người dùng" → "Phạm vi dữ liệu" → gợi ý/tick chọn → Lưu →
   cột cập nhật đúng; chưa ảnh hưởng gì tới trang Báo cáo/Dashboard.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.50 — Gán phạm vi dữ liệu theo siêu
thị.md`.

---

## 8.49 — Ánh xạ Phòng ban (vpdt) → Siêu thị

**Thay đổi**: trang mới "Ánh xạ Phòng ban → Siêu thị" — ánh xạ Department
(vpdt) sang MaDiem chuẩn (tái dùng khoá của "Ánh xạ Điểm - STK_ID"), CHỈ
cần khai khi tên không khớp thẳng. Bước 1/nhiều bước hướng tới phân quyền
dữ liệu theo đúng siêu thị — CHƯA áp dụng giới hạn xem dữ liệu nào ở bản
này.

**Các bước triển khai:**
1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (bảng mới `app.DepartmentStoreMapping` +
   menu mới).
3. `cd rp-user && npm run build`, copy `dist/` mới.
4. `pm2 restart hcrc-rp-server` (BẮT BUỘC — route API mới).
5. Cấp quyền menu "Ánh xạ Phòng ban → Siêu thị" cho vai trò cần dùng.
6. Kiểm tra: tải file mẫu → nhập 1 dòng thật → hiện đúng danh sách.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.49 — Ánh xạ Phòng ban sang Siêu
thị.md`.

---

## 8.48 — Phân quyền báo cáo/Dashboard riêng theo từng người dùng

**Thay đổi**: trang "Người dùng" có thêm nút "Gán quyền riêng" — cấp thêm
báo cáo/nhóm Dashboard cho ĐÚNG 1 người, CỘNG DỒN vào quyền theo vai trò
(không thay thế). Dùng cho trường hợp cấp lẻ, không đáng tạo hẳn 1 vai trò
riêng; cấp cho cả 1 nhóm người vẫn nên tạo Vai trò như trước giờ.

**Các bước triển khai:**
1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (bảng mới `app.UserReportAccess`/
   `app.UserDashboardGroupAccess`).
3. `cd rp-user && npm run build`, copy `dist/` mới.
4. `pm2 restart hcrc-rp-server` (BẮT BUỘC — route API mới).
5. Kiểm tra: "Người dùng" → "Gán quyền riêng" → tick thêm 1 báo cáo cho 1
   người không có qua vai trò nào → người đó thấy thêm đúng báo cáo đó.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.48 — Phân quyền theo từng người
dùng.md`.

---

## 8.47 — Mật khẩu dự phòng cục bộ khi HCRC Workspace lỗi

**Thay đổi**: tài khoản xác thực qua HCRC Workspace giờ tự cache mật khẩu
(băm bcrypt) mỗi lần đăng nhập ONLINE thành công — dùng làm dự phòng khi
dịch vụ đó báo lỗi (mạng/timeout/5xx), trong hạn `FallbackMaxAgeDays`
(mặc định 14 ngày). Trang "Người dùng" có cột "Mật khẩu dự phòng" + nút
xoá tay.

**Các bước triển khai (KHÁC các bản trước — đổi logic đăng nhập):**
1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (cột mới `CachedPasswordHash`/
   `CachedPasswordHashAt` ở `app.Users`, `FallbackMaxAgeDays` ở
   `app.HcrcWorkspaceSettings`).
3. `cd rp-user && npm run build`, copy `dist/` mới.
4. `pm2 restart hcrc-rp-server` (BẮT BUỘC — đổi `lib/auth.js`).
5. Kiểm tra: đăng nhập 1 tài khoản HCRC Workspace bình thường → tắt thử
   "Bật xác thực HCRC Workspace" → đăng nhập lại ĐÚNG mật khẩu cũ vẫn vào
   được (Audit Log ghi "dùng mật khẩu dự phòng"); bật lại cấu hình sau khi
   kiểm tra.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.47 — Mật khẩu dự phòng HCRC
Workspace.md`.

---

## 8.46 — Sửa nút "Lên"/"Xuống" trắng trơn trong khung Tuỳ chỉnh Dashboard

**Thay đổi**: phát hiện lúc demo bản 8.45 bằng ảnh chụp trình duyệt thật —
2 nút đổi thứ tự Ô trong khung "Tuỳ chỉnh" hiện trắng trơn không thấy chữ
(chữ trắng trên nền trắng, do CSS quên đổi màu chữ). Đã sửa + đổi ký hiệu
▲▼ thành chữ "Lên"/"Xuống" rõ nghĩa hơn.

**Các bước triển khai:**
1. `git pull origin main`
2. `cd rp-user && npm run build`, copy `dist/` mới.
3. Kiểm tra: Dashboard → "⚙️ Tuỳ chỉnh" → thấy rõ chữ "Lên"/"Xuống" ở mỗi Ô.

Không đổi CSDL, không đổi backend. Chi tiết đầy đủ: `deploy/Cập nhật bản
8.46 — Sửa nút Lên Xuống trắng trong khung Tuỳ chỉnh.md`.

---

## 8.45 — Cá nhân hoá báo cáo Dashboard

**Thay đổi**: trang Dashboard có nút "⚙️ Tuỳ chỉnh" — mỗi người tự ẩn/hiện
Ô, sắp xếp lại thứ tự Ô, nhớ nhóm/tab đã xem lần trước, đặt số ngày mặc
định khi mở lại (Hôm nay/7 ngày/30 ngày gần nhất). Lưu trên server theo
tài khoản (bảng mới `app.UserDashboardPreferences`), không ảnh hưởng
người khác, không đổi quyền xem (`app.RoleDashboardGroupAccess`).

**Các bước triển khai (KHÁC các bản trước — có bảng CSDL mới + route API
mới):**
1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (thêm bảng `app.UserDashboardPreferences`,
   an toàn chạy lại nhiều lần).
3. `cd rp-user && npm run build`, copy `dist/` mới.
4. `pm2 restart hcrc-rp-server` (BẮT BUỘC — có route API mới `GET`/`PUT
   /dashboards/:id/preferences`).
5. Kiểm tra: bấm "⚙️ Tuỳ chỉnh" → ẩn 1 Ô, đổi thứ tự, đổi số ngày mặc
   định → tải lại trang (hoặc đăng nhập máy khác) vẫn giữ đúng; "Khôi
   phục mặc định" → về lại như trước bản 8.45.

Chi tiết đầy đủ: `deploy/Cập nhật bản 8.45 — Cá nhân hoá Dashboard.md`.

---

## 8.44 — Bộ lọc/nhóm theo siêu thị trong danh sách Đồng bộ

**Thay đổi**: trang "Đồng bộ" (ETL) thêm ô tìm kiếm (theo tên job/tên
siêu thị) + tuỳ chọn "Nhóm theo siêu thị" (gộp job cùng nguồn dữ liệu
vào 1 khối thu/mở được). Trả lời câu hỏi "gộp hết VIEW vào 1 job có được
không" — **KHÔNG làm theo hướng gộp** (mất lịch chạy/mốc đồng bộ/log lỗi
riêng từng loại dữ liệu), giữ nguyên 1 job/1 loại dữ liệu, chỉ gọn cách
XEM.

**Các bước triển khai:**
1. `git pull origin main`
2. `cd etl-admin && npm run build`, copy `dist/` mới.
3. Không cần restart backend, không cần chạy lại CSDL.
4. Kiểm tra: trang Đồng bộ hiện ô tìm kiếm + nhóm theo siêu thị; gõ tên
   siêu thị → đúng khối đó tự mở; tắt "Nhóm theo siêu thị" → bảng phẳng
   có thêm cột "Nguồn dữ liệu".

Không đổi CSDL, không đổi backend. Chi tiết đầy đủ: `deploy/Cập nhật bản
8.44 — Bộ lọc nhóm theo siêu thị Sync Jobs.md`.

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
