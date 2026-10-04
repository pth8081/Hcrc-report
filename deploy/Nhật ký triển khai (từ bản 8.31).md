# Nhật ký triển khai — từ bản 8.31 trở đi

**TỰ ĐỘNG, không cần nhắc**: kể từ khi người dùng yêu cầu (03/10/2026),
MỌI lần merge vào `main` từ bản 8.31 trở đi PHẢI kèm thêm 1 mục MỚI ở
đầu file này (mới nhất lên trên, giống quy ước `VERSION.md`), tóm tắt
đúng CÁC BƯỚC triển khai thật trên server (lệnh chạy, file cần sửa tay,
thứ tự làm) — không chỉ mô tả tính năng. Việc này KHÔNG thay thế từng file
riêng `deploy/Cập nhật bản X.Y — ....md` (vẫn tạo như cũ, tiện khi chỉ cần
đưa đúng 1 bản cho IT) — file NÀY là bản gộp MỘT NƠI DUY NHẤT để xem lại
toàn bộ lịch sử triển khai liên tục, không phải mở nhiều file. TIẾP TỤC
cập nhật file này ở mọi bản sau, cho tới khi người dùng bảo dừng. (File
tạo lần đầu ở bản 8.36 — ghi sẵn 8.34/8.35; sau đó lùi mốc bắt đầu về đúng
bản 8.31 theo yêu cầu người dùng, bổ sung đủ 3 mục 8.31/8.32/8.33.)

---

## 8.65 — Gửi email qua Exchange bằng EWS (API riêng, không qua SMTP)

**Thay đổi**: thêm `rp-server/lib/ewsMailer.js` — gửi email qua Exchange
Web Services (EWS, HTTPS riêng của Exchange, Basic Auth username/password)
cho Exchange CÀI TẠI CHỖ (KHÔNG dùng được cho Exchange Online/Office 365).
`app.EmailSettings` thêm cột `Protocol`/`EwsUrl`/`EwsInsecureTls`;
`lib/mailer.js` rẽ nhánh theo `Protocol`, mọi nơi gọi `sendMail()` tự hoạt
động với cả 2 giao thức. "Thiết lập email" có thêm lựa chọn "Exchange tại
chỗ — API EWS" trong dropdown gateway.

**Các bước triển khai:**
1. `git pull origin main`.
2. Chạy lại `rp-db/schema.sql` (BẮT BUỘC — thêm cột `Protocol`/`EwsUrl`/
   `EwsInsecureTls` vào `app.EmailSettings`, an toàn chạy lại nhiều lần,
   cấu hình SMTP đang có tự chuyển `Protocol='smtp'`, không đổi gì).
3. `pm2 restart hcrc-rp-server` (BẮT BUỘC — đổi `lib/mailer.js`, file mới
   `lib/ewsMailer.js`, route `routes/emailSettings.js`).
4. `cd rp-user && npm run build`, copy `dist/` mới (dropdown "Thiết lập
   email" có thêm lựa chọn EWS).
5. Nếu dùng Exchange qua EWS: rp-user → "Thiết lập email" → chọn "Exchange
   tại chỗ — API EWS" → điền EWS URL đầy đủ (hỏi IT quản trị Exchange nếu
   không rõ, thường dạng `https://<máy chủ>/EWS/Exchange.asmx`) + Username/
   Password đăng nhập mailbox + "Địa chỉ gửi (From)" → tick "Bỏ qua kiểm
   tra chứng chỉ TLS" NẾU máy chủ dùng chứng chỉ tự ký → Lưu → "Gửi thử"
   xác nhận gửi được.

Không đổi CSDL/cấu hình khác đang chạy ổn (mặc định vẫn `Protocol='smtp'`
cho tới khi admin tự đổi).

---

## 8.64 — Gợi ý cấu hình theo loại email gateway (Postfix/Exchange) + tương thích Exchange

**Thay đổi**: thêm dropdown "Loại email gateway" ở "Thiết lập email"
(rp-user) — chọn Postfix/Exchange Online/Exchange tại chỗ tự điền sẵn
host/port/Secure, vẫn sửa tay được. `rp-server/lib/mailer.js` và
`etl/lib/mailer.js` thêm `requireTLS` khi dùng cổng không mã hoá ngay từ
đầu (587/25) + có xác thực username/mật khẩu — bắt buộc STARTTLS trước
khi gửi thông tin đăng nhập.

**Các bước triển khai:**
1. `git pull origin main`.
2. `pm2 restart hcrc-etl` và `pm2 restart hcrc-rp-server` (BẮT BUỘC — đổi
   `lib/mailer.js` của cả 2).
3. `cd rp-user && npm run build`, copy `dist/` mới (dropdown mới ở "Thiết
   lập email").
4. Kiểm tra: rp-user → "Thiết lập email" → chọn "Exchange Online / Office
   365" → tự điền `smtp.office365.com`/587/bỏ Secure → điền Username =
   email đăng nhập đầy đủ + mật khẩu (mật khẩu ứng dụng nếu tài khoản bật
   MFA) → "Gửi thử" nhận được email.

Không đổi CSDL, không ảnh hưởng cấu hình Postfix/SMTP khác đang chạy ổn.

---

## 8.63 — Sửa gửi email tương thích cổng 465 (Postfix)

**Thay đổi**: cổng 465 (SMTPS, vd Postfix của người dùng) bắt buộc TLS
ngay từ đầu kết nối — thiếu `secure:true` đúng cho cổng này là lý do email
gửi thất bại dù host/port/mật khẩu đúng. `etl/lib/mailer.js` tự nhận
`secure=true` theo cổng 465 khi `.env` chưa khai `SMTP_SECURE` rõ ràng;
`rp-server/lib/mailer.js` ép `secure=true` khi `SmtpPort=465` bất kể
checkbox đã lưu. `api-server` không có tính năng gửi email nên không áp
dụng (theo đúng yêu cầu người dùng).

**Các bước triển khai:**
1. `git pull origin main`.
2. `pm2 restart hcrc-etl` và `pm2 restart hcrc-rp-server` (BẮT BUỘC — đổi
   `lib/mailer.js` của cả 2).
3. `cd rp-user && npm run build`, copy `dist/` mới (đổi
   `EmailSettingsPage.jsx` — chỉ thêm gợi ý tick "Secure", không bắt buộc
   phải build ngay để backend hoạt động đúng).
4. Nếu dùng cổng 465: etl → sửa `.env` thành `SMTP_PORT=465` (xoá hoặc để
   nguyên `SMTP_SECURE`, không bắt buộc đổi — hệ thống tự nhận đúng theo
   cổng); rp-user → "Thiết lập email" → đổi "SMTP port" thành `465` → Lưu
   → "Gửi thử" để xác nhận gửi được qua Postfix.
5. Kiểm tra: etl — tạm làm 1 job lỗi kết nối để xem email cảnh báo có tới
   không (hoặc đợi lần lỗi thật); rp-user — "Thiết lập email" → "Gửi thử"
   nhận được email tại hộp thư đã nhập.

Không đổi CSDL, không ảnh hưởng cấu hình SMTP cổng 587/25 đang chạy ổn.

---

## 8.62 — Chọn nhiều dòng + xoá hàng loạt (toàn hệ thống)

**Thay đổi**: thêm checkbox chọn nhiều dòng + nút "Xoá N mục đã chọn" cho
21 trang danh sách dạng bảng ở cả 3 giao diện (etl-admin, api-admin,
rp-user) — chỉ sửa frontend (React), KHÔNG đổi API/CSDL, KHÔNG có migration
hay script cần chạy tay. Quy tắc mới đã ghi vào `CLAUDE.md` cho mọi bảng
làm thêm sau này.

**Các bước triển khai:**
1. `git pull origin main`.
2. Build lại và deploy cả 3 giao diện như quy trình thường dùng (`npm run
   build` ở từng app, copy `dist/` lên server tĩnh) — không có bước gì
   khác ngoài build/deploy thông thường.
3. Kiểm tra nhanh: mở 1 trang bất kỳ trong 21 trang (vd etl-admin → Đồng
   bộ), tick vài checkbox ở cột đầu bảng, thấy nút "Xoá N mục đã chọn"
   hiện ra dưới bảng, bấm thử xoá 1 dòng rác để xác nhận hoạt động đúng.

## 8.61 — Điền đủ 34 siêu thị thật vào script tạo Nguồn dữ liệu + Sync Job (Thành viên)

**Thay đổi**: theo yêu cầu người dùng — điền đủ 34 siêu thị thật (tên +
Server/IP, từ file Excel người dùng gửi) vào `etl/scripts/seedThanhVienLiveSync.js`,
dùng chung 1 port cố định 1433 cho mọi siêu thị (theo yêu cầu riêng, khác
port từng dòng trong file Excel gốc). **File này CHỨA MẬT KHẨU CSDL THẬT
— người dùng đã được cảnh báo và xác nhận rõ ràng muốn commit nguyên văn
vào Git** (khác quy ước thông thường không lưu file có mật khẩu thật).
Khuyến nghị đổi lại mật khẩu thật sau khi triển khai xong.

**Các bước triển khai:**
1. `git pull origin main`.
2. **Bắt buộc làm trước** (nếu chưa làm): chạy file
   `deploy/Thiết lập VIEW + tài khoản etl_reader tại mỗi siêu thị Thành
   viên.sql` tại CẢ 34 máy chủ SQL Server của từng siêu thị.
3. `cd etl && node scripts/seedThanhVienLiveSync.js` — tạo/cập nhật 34
   Nguồn dữ liệu + 68 Sync Job Live (an toàn chạy lại nhiều lần).
4. Nếu chưa chạy lần nào: `cd rp-server && node scripts/seedLdtdHcrcReports.js`
   và `node scripts/seedThanhVienReportPermissions.js`.
5. Kiểm tra: etl-admin → Nguồn dữ liệu (đủ 34 dòng) → Đồng bộ (đủ 68 job
   Live, "Bật") → Log (job đã chạy thành công sau vài phút).
6. **Đổi lại mật khẩu CSDL thật ở cả 34 máy chủ** sau khi hoàn tất (mật
   khẩu hiện đã nằm trong lịch sử Git).

---

## 8.60 — Khoá nút + đổi màu lúc đang gửi dữ liệu lên server (toàn hệ thống)

**Thay đổi**: theo yêu cầu người dùng — mọi nút bấm gửi dữ liệu lên server
ở cả 3 giao diện (rp-user/etl-admin/api-admin) giờ tự khoá + đổi màu xám
rõ rệt trong lúc đang xử lý, tránh bấm lại nhiều lần gây gửi trùng yêu
cầu. Thuần sửa frontend, không đổi backend. Quy tắc này ghi vào
`CLAUDE.md` — bắt buộc áp dụng cho mọi nút làm thêm sau này.

**Các bước triển khai:**
1. `git pull origin main`.
2. `cd etl-admin && npm run build`, copy `dist/` mới.
3. `cd api-admin && npm run build`, copy `dist/` mới.
4. `cd rp-user && npm run build`, copy `dist/` mới.
5. Không cần restart backend nào (`hcrc-etl`/`hcrc-api-server`/`hcrc-rp-server`
   không đổi).
6. Kiểm tra: vào etl-admin → Đồng bộ, bấm "Chạy thử" 1 job → nút chuyển
   xám + hiện "Đang chạy..." ngay, không bấm lại được tới khi xong.

---

## 8.59 — Tự thử lại khi mất kết nối nguồn lúc đồng bộ

**Thay đổi**: theo yêu cầu người dùng sau sự cố thật (vài chi nhánh mất
mạng, job Live báo lỗi liên tục) — job đồng bộ chạy nền giờ tự thử lại
(backoff 15s→30s→60s→120s, tối đa 10 phút) khi lỗi KẾT NỐI tới nguồn,
trước khi thật sự ghi nhận thất bại. Nút "Chạy thử" tương tác không đổi
(vẫn báo lỗi ngay).

**Các bước triển khai:**
1. `git pull origin main`.
2. `pm2 restart hcrc-etl` (BẮT BUỘC — đổi `jobs/runSync.js`, `jobs/scheduler.js`,
   `routes/admin/syncJobs.js`).
3. Không cần build lại giao diện nào (không đổi etl-admin).
4. Kiểm tra: theo dõi etl-admin → Log — khi 1 job đang lỗi kết nối, thấy
   dòng "Lỗi kết nối nguồn (lần N): ... — thử lại sau Xs..." thay vì chỉ 1
   dòng lỗi rồi im lặng tới chu kỳ sau; nếu nguồn phục hồi trong 10 phút sẽ
   thấy job chạy thành công mà không cần đợi hết chu kỳ cron.

Không đổi cấu trúc CSDL, không ảnh hưởng job đang chạy ổn định.

---

## 8.58 — Đổi màu 4 báo cáo doanh thu cuối ngày LDTD/HCRC theo mẫu BRGMART

**Thay đổi**: theo yêu cầu người dùng (demo ảnh đã gửi, đã xác nhận "màu
đẹp rồi") — đổi màu nhóm cột (web+Excel+PDF) của 4 báo cáo "Doanh thu cuối
ngày LDTD/HCRC" (gốc + Thành viên) đúng theo file mẫu BRGMART người dùng
gửi, thêm xen kẽ màu dòng + viền nhạt hơn cho "mỏng, chuyên nghiệp hơn".

**Các bước triển khai:**
1. `git pull origin main`.
2. `cd rp-server && node scripts/seedLdtdHcrcReports.js` (BẮT BUỘC — ghi
   đè `DefinitionJson` đã lưu trong CSDL, code mới không tự áp dụng nếu
   không chạy lại; dùng đúng `menuCode` đã seed lần đầu nếu khác mặc định
   `reports-kinh-doanh`: `node scripts/seedLdtdHcrcReports.js <menuCode>`).
3. `pm2 restart hcrc-rp-server` (BẮT BUỘC — đổi `lib/exportExcel.js`/
   `lib/exportPdf.js`/`lib/reportCellFormat.js`/`lib/reportRunner.js`/
   `lib/compositeReportRunner.js`).
4. `cd rp-user && npm run build`, copy `dist/` mới (đổi
   `components/DataTable.jsx`/`lib/reportGroupColors.js`).
5. Kiểm tra: mở 1 trong 4 báo cáo "Doanh thu cuối ngày ..." → màu nhóm cột
   mới (xanh lá/cam/vàng/tím), dòng "Tổng cộng" tô theo từng nhóm, xen kẽ
   màu dòng nhẹ; xuất Excel/PDF cũng đúng màu mới.

Không đổi CSDL, không ảnh hưởng báo cáo khác (chỉ 4 báo cáo khai
`columnGroups` mới bị ảnh hưởng).

---

## 8.57 — Trạng thái kết nối + Giám sát cấu trúc CSDL

**Thay đổi**: theo yêu cầu người dùng (demo đã gửi, đã xác nhận) — thêm
trang "Trạng thái kết nối" (`etl-admin` + `api-admin`, job nền kiểm tra
mỗi 15 phút) và trang "Giám sát cấu trúc CSDL" (chỉ `etl-admin`, job nền
chạy 6h sáng, phát hiện cả đổi kiểu dữ liệu cột, gửi email cảnh báo).

**Các bước triển khai:**
1. `git pull origin main`.
2. Chạy lại `etl-db/schema.sql` (bảng mới `etl.DataSourceConnectionStatus`,
   `etl.SchemaSnapshots`, `etl.SchemaChangeLog`) VÀ `api-db/schema.sql`
   (bảng mới `api.DataSourceConnectionStatus`).
3. `pm2 restart hcrc-etl` và `pm2 restart hcrc-api-server` (BẮT BUỘC —
   route API mới + 2 job `cron.schedule` mới trong `server.js`).
4. Build lại 2 giao diện: `cd etl-admin && npm run build`, copy `dist/`
   mới; `cd api-admin && npm run build`, copy `dist/` mới.
5. Vào trang "Vai trò" (mỗi giao diện) → cấp quyền xem menu mới
   ("Trạng thái kết nối" ở cả 2; "Giám sát cấu trúc CSDL" chỉ ở
   `etl-admin`) cho vai trò cần dùng — **KHÔNG tự động cấp**, phải cấp
   tay sau khi triển khai.
6. Kiểm tra `.env` (etl, api-server) có đủ `SMTP_HOST`/`ALERT_EMAIL_TO`
   (dùng chung cấu hình mailer đã có) để job "Giám sát cấu trúc CSDL" gửi
   được email cảnh báo — nếu chưa cấu hình, job vẫn chạy/ghi lịch sử bình
   thường, chỉ không gửi được email (giống job đồng bộ ETL hiện tại).
7. Kiểm tra: mở trang "Trạng thái kết nối" → thấy danh sách nguồn dữ liệu
   + trạng thái (bấm "Kiểm tra lại ngay" để test ngay không cần đợi job
   nền); mở trang "Giám sát cấu trúc CSDL" (`etl-admin`) → thấy "Chưa
   kiểm tra lần nào" cho tới 6h sáng hôm sau (hoặc đổi tạm
   `SCHEMA_MONITOR_CRON` trong `.env` để test sớm hơn).

Không đổi cấu trúc bảng/CSDL nguồn dữ liệu hiện có, không ảnh hưởng job
đồng bộ đang chạy.

---

## 8.56 — Thêm cột "Trung bình giao dịch" vào 8 báo cáo Top 5 chi nhánh

**Thay đổi**: theo yêu cầu người dùng, thêm cột "Trung bình giao dịch"
(Doanh thu / Số giao dịch) vào cả 8 báo cáo "Top 5 chi nhánh" — cùng
công thức đã dùng ở báo cáo LDTD/HCRC, tự hiện rỗng khi chia cho 0 (đã
test bằng `formulaEngine.js` thật).

**Các bước triển khai:**
1. `git pull origin main`
2. `cd rp-server && node scripts/seedTop5ChiNhanhReports.js` (BẮT BUỘC —
   ghi đè DefinitionJson trong CSDL).
3. `pm2 restart hcrc-rp-server`.
4. Kiểm tra: báo cáo/Dashboard "Top 5 chi nhánh" hiện thêm cột "Trung
   bình giao dịch".

Không đổi CSDL/biểu đồ.

---

## 8.55 — Script tạo tự động 2 job đồng bộ cho 3 báo cáo "hết hàng"

**Thay đổi**: theo yêu cầu người dùng — DBA đã tạo xong 2 VIEW
`vw_BanHangTheoSKU`/`vw_TonKhoTheoSKU` (đúng `bc-ton-kho-0.md`), nay thêm
`etl/scripts/seedZeroStockSkuSync.js` để tạo 2 job đồng bộ bắt buộc bằng
1 lệnh thay vì bấm tay qua etl-admin — dùng chung cho cả 3 báo cáo "hết
hàng" (Top bán chạy tồn kho=0, Core=0 Mart/Minimart). Phần còn lại (đăng
ký báo cáo, upload danh sách Core, gán quyền) vẫn làm theo đúng 2 file
hướng dẫn đã có từ trước, không đổi.

**Các bước triển khai:**
1. `git pull origin main`
2. Khai `DSMART16_SERVER`/`DSMART16_USER`/`DSMART16_PASSWORD` vào `.env`
   của `etl`.
3. `cd etl && node scripts/seedZeroStockSkuSync.js`.
4. Theo dõi etl-admin → Log tới khi 2 job chạy thành công.
5. `cd rp-server && node scripts/seedTopZeroStockReport.js && node scripts/seedCoreZeroStockReports.js`.
6. Upload danh sách hàng Core, gán quyền xem 3 báo cáo — xem chi tiết ở
   `bc-ton-kho-0.md`/`bc-core-ton-kho-0.md`.

Không đổi CSDL `rp`/`rp-server`/`rp-user`.

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

---

## 8.33 — Sửa "Failed to fetch" khi Nhập hàng loạt Sync Job nhiều dòng

**Thay đổi**: Nhập hàng loạt 68 dòng Sync Job (34 siêu thị Thành viên) báo
lỗi trình duyệt "Failed to fetch" — nguyên nhân là Nginx, không phải code
Node: `proxy_read_timeout 65s` chung cho `/admin/` quá ngắn so với thời
gian đối chiếu schema THẬT từng dòng qua mạng (chạy tuần tự).

**QUAN TRỌNG — sửa `deploy/nginx.conf`, KHÔNG phải code Node** — `git
pull` + `pm2 restart` KHÔNG đủ, phải tự tay áp dụng cấu hình Nginx mới.

**Các bước triển khai:**
1. `git pull origin main`
2. Mở file Nginx thật đang dùng cho domain etl-admin, thêm 1 `location`
   RIÊNG khớp đúng 2 route Nhập hàng loạt (`/admin/sync-jobs/import`,
   `/admin/data-sources/import`), nâng `proxy_read_timeout`/
   `proxy_send_timeout` lên 600s — xem nguyên văn khối cấu hình ở
   `deploy/nginx.conf` bản mới nhất. Khối `/admin/` cũ giữ nguyên 65s.
3. `nginx -t` (phải báo "syntax is ok") rồi `systemctl reload nginx`.
4. Kiểm tra: Nhập hàng loạt file nhiều dòng (vd 68 dòng) chạy xong, không
   còn "Failed to fetch"; các route `/admin/` khác không bị ảnh hưởng.

Không đổi CSDL, không đổi code Node. Chi tiết đầy đủ: `deploy/Cập nhật bản
8.33 — Sửa Failed to fetch Nhập hàng loạt.md`.

---

## 8.32 — Sửa lỗi tương tự ở "File mẫu" Sync Job

**Thay đổi**: rà lại toàn bộ sau bug 8.31, phát hiện `buildSyncJobsTemplate()`
(`etl/lib/syncJobsImport.js`) bị ĐÚNG lỗi tương tự (bỏ sót khi sửa 8.31 —
lần đó chỉ soát `dataSourcesImport.js`) — file mẫu Sync Job cũng có 1 dòng
câu hướng dẫn trước header, trong khi `parseSyncJobsFile()` đọc header
cứng ở dòng 1.

**Các bước triển khai:**
1. `git pull origin main`
2. `pm2 restart hcrc-etl`
3. Kiểm tra: etl-admin → Đồng bộ → "Tải file mẫu" → dòng 1 phải là header,
   dòng 2-3 là 2 dòng ví dụ, không còn câu hướng dẫn phía trên header;
   nhập thử lại file Sync Job 68 dòng (34 siêu thị Thành viên) phải nhập
   đủ, không báo "không tìm thấy Nguồn dữ liệu".

Không đổi CSDL. Chi tiết đầy đủ: `deploy/Cập nhật bản 8.31-8.32 — Sửa lỗi
file mẫu Nguồn dữ liệu + Sync Job.md`.

---

## 8.31 — Sửa lỗi "File mẫu" Nguồn dữ liệu (header lệch dòng 2)

**Thay đổi**: phát hiện khi triển khai thật 34 siêu thị Thành viên (bản
8.30) — file mẫu "Nguồn dữ liệu" (`buildDataSourcesTemplate()`,
`etl/lib/dataSourcesImport.js`) tạo ra với dòng 1 là câu hướng dẫn, dòng 2
mới là header thật, nhưng `parseDataSourcesFile()` đọc header CỨNG ở dòng
1 — ai tải file mẫu, xoá CHỮ ở dòng 1 (không xoá nguyên dòng) rồi điền dữ
liệu sẽ bị báo "File thiếu cột bắt buộc 'Name'" dù đã điền đủ cột.

**Đã XÁC NHẬN không đổi cấu trúc CSDL** — chỉ sửa 2 file backend
(`etl/lib/dataSourcesImport.js`, `etl/lib/syncJobsImport.js` — xem bản
8.32 ngay trên), KHÔNG cần build lại giao diện nào.

**Các bước triển khai:**
1. `git pull origin main`
2. `pm2 restart hcrc-etl`
3. Kiểm tra: etl-admin → Nguồn dữ liệu → "Tải file mẫu" → dòng 1 phải là
   header (`Name, Server, DatabaseName, Username, Password, Engine, Port,
   Encrypt, TrustServerCert`), dòng 2 là dòng ví dụ; nhập thử lại file
   "Nguồn dữ liệu" 34 siêu thị Thành viên phải nhập được, không còn báo
   "File thiếu cột bắt buộc 'Name'".

Chi tiết đầy đủ (gộp chung 8.31+8.32): `deploy/Cập nhật bản 8.31-8.32 —
Sửa lỗi file mẫu Nguồn dữ liệu + Sync Job.md`.
