# Cập nhật bản 8.46 — Sửa nút "Lên"/"Xuống" trắng trơn trong khung Tuỳ chỉnh Dashboard

## Bối cảnh

Trước khi gửi demo bản 8.45 (cá nhân hoá Dashboard) cho người dùng, đã
dựng thử MỘT BẢN CHẠY THẬT bằng trình duyệt (Playwright) thay vì chỉ build/
kiểm tra chuỗi trong bundle như một số demo trước — nhờ vậy bắt được lỗi
hiển thị THẬT mà cách kiểm tra cũ không phát hiện ra.

## Lỗi

2 nút đổi thứ tự Ô (▲/▼) trong khung "Tuỳ chỉnh Dashboard" (bản 8.45) hiện
ra là 2 ô TRẮNG TRƠN không thấy chữ — vẫn bấm được (đổi thứ tự vẫn chạy
đúng) nhưng người dùng không biết đó là nút gì, bấm vào đâu.

**Nguyên nhân**: `rp-user/src/styles.css` có luật dùng chung cho MỌI thẻ
`<button>`:
```css
button { ...; background: var(--accent); color: #fff; }
```
Luật riêng cho 2 nút này:
```css
.dashboard-customize-tile-move button { ...; background: var(--surface); }
```
chỉ đổi `background` sang màu trắng (`var(--surface)`) nhưng QUÊN đổi
`color` — chữ vẫn giữ nguyên `color: #fff` kế thừa từ luật chung → chữ
trắng trên nền trắng, vô hình.

## Sửa

1. Thêm `color: var(--ink);` vào luật `.dashboard-customize-tile-move
   button` (`rp-user/src/styles.css`).
2. Nhân tiện đổi ký hiệu ▲/▼ thành chữ "Lên"/"Xuống" trong
   `DashboardPage.jsx` — rõ nghĩa hơn ký hiệu mũi tên.

Chỉ sửa 2 file trên, không đổi logic/API/CSDL.

## Các bước triển khai

1. `git pull origin main`
2. `cd rp-user && npm run build`, copy `dist/` mới vào đúng chỗ Nginx/
   `serve-static.js` đang trỏ tới.
3. Không cần restart backend, không cần chạy lại CSDL.
4. Kiểm tra: Dashboard → "⚙️ Tuỳ chỉnh" → mỗi Ô hiện rõ 2 nút chữ "Lên"/
   "Xuống" (trước đây trắng trơn, giờ hiện chữ rõ ràng, nền trắng viền
   xám).
