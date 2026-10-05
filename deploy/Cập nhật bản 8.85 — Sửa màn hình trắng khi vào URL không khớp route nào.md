# Cập nhật bản 8.85 — Sửa màn hình trắng khi vào URL không khớp route nào (rp-user)

## Báo cáo của người dùng

Ảnh chụp trình duyệt, thanh địa chỉ `report.hcrc.vn/system` — toàn bộ
trang trắng, không cả sidebar/topbar. Kèm lời nhắn: "Vấn vào system
trên dashboard đang bị lỗi."

## Nguyên nhân

Lỗi có từ trước, **không liên quan** tới bản 8.84 (dropdown "Chọn nhóm")
vừa chốt ngay trước đó.

- `App.jsx` chưa từng có route riêng cho `/system` — đây chỉ là mục CHA
  mở/đóng submenu ở sidebar (`Layout.jsx`): bấm "Hệ thống" chỉ gọi
  `setSystemOpen(!systemOpen)`, KHÔNG điều hướng tới đâu cả (`hasChildren`
  → render `<button>`, không phải `<NavLink to={item.path}>`). Các trang
  thật đều nằm ở `/system/<mục con>` (vd `/system/permissions`,
  `/system/report-catalog`...).
- App cũng KHÔNG có route "bắt đáy" (`path="*"`) cho mọi URL còn lại.
  Khi React Router không khớp được route con nào bên trong `<Routes>`,
  nó không vẽ ra BẤT KỲ phần tử nào trong cây route đó — kể cả
  `<Layout>` (component bọc ngoài, chứa sidebar/topbar) cũng không được
  render, vì chính nó cũng là 1 phần tử route cần khớp trước. Kết quả:
  gõ tay `/system`, bookmark cũ trỏ đường dẫn đã đổi, hay gõ sai chính
  tả bất kỳ URL nào → mất LUÔN cả khung giao diện, không chỉ mất nội
  dung trang.

## Đã làm

`rp-user/src/App.jsx` — thêm route bắt đáy ở cuối, bên TRONG `<Layout>`:

```jsx
<Route path="*" element={<Navigate to="/" replace />} />
```

Đặt trong `<Layout>` (không phải ngoài `<Routes>`) để khi redirect về
`/`, sidebar/topbar vẫn vẽ ra bình thường — không chỉ "ít trắng hơn" mà
đưa thẳng người dùng về trang chủ, nơi có đủ menu để tự điều hướng tiếp.

Chỉ `rp-user` bị — etl-admin/api-admin dùng menu phẳng (không có cấu
trúc cha/con 2 cấp như "Hệ thống" ở rp-user), mỗi mục menu đều có route
riêng khớp đúng, không có mục cha "không có trang" nào.

## Đã kiểm chứng

- Build `rp-user && npx vite build` sạch.
- Demo Playwright (mock `/api/me`, chạy bản build thật qua
  `vite preview`): vào thẳng URL `/system` → tự động chuyển về `/` →
  trang chủ hiện đủ sidebar/topbar/nội dung, không còn trang trắng.

## Các bước triển khai

1. `git pull origin main`.
2. `cd rp-user && npm run build`, copy `dist/` mới (chỉ frontend, KHÔNG
   cần restart `hcrc-rp-server`).
3. Kiểm tra: gõ thẳng URL `report.hcrc.vn/system` (hoặc URL bất kỳ
   không có trang thật) → tự chuyển về trang chủ, sidebar/topbar hiện
   bình thường.

## File thay đổi

- `rp-user/src/App.jsx` — thêm route `path="*"` → `<Navigate to="/" />`.
