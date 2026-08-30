# Frontend HCRC

Vite + React (JS thuần, không TypeScript — khớp phần còn lại của repo). 6
module: Trang chủ, Dashboard, 3 nhóm báo cáo (dùng chung 1 component
`ReportsModulePage`), Hệ thống (Phân quyền/Biểu mẫu/Log/Danh mục/Thiết lập
email). Không lặp lại mô hình "1 file HTML gộp hết" của `vpdt-pms` — xem lý do
trong tài liệu kiến trúc, mục 06.

## Cài đặt

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173, proxy /api sang report-server (cổng 4001)
```

Cần `report-server` đang chạy (xem `report-server/README.md`) để đăng nhập
và tải dữ liệu — frontend không tự chạy được độc lập.

## Build production

```bash
npm run build   # ra thư mục dist/, phục vụ tĩnh qua Nginx cùng domain với report-server
```

## Nguồn sự thật duy nhất về quyền

`GET /api/me` (report-server) trả `menu` đã lọc theo quyền — `src/lib/AuthContext.jsx`
lưu kết quả này, `Layout` dùng để vẽ sidebar, `RequireMenuAccess` dùng để chặn
route. Thêm 1 trang mới cần: 1 dòng trong `app.MenuItems` (`app/schema.sql`),
1 route mới trong `src/App.jsx` bọc bởi `<RequireMenuAccess code="...">` đúng
`Code` vừa thêm.

## Còn thiếu ở bước khung này

- `FilterForm` type `select`/`multiSelect` chưa nối với `app.Categories` — đang là ô nhập tay.
- `DashboardPage` chưa có nội dung — chờ yêu cầu cụ thể về KPI/biểu đồ.
- `ReportCatalogPanel` sửa `DefinitionJson` bằng textarea JSON thô, chưa có form có cấu trúc theo từng loại filter.
