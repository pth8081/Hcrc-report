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
