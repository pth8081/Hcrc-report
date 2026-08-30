# Report Server

Ứng dụng nội bộ HCRC — 6 module: Trang chủ, Dashboard, 3 nhóm báo cáo (lọc
động theo định nghĩa lưu trong `app.ReportCatalog`, xem trước, xuất
Excel/PDF), và Hệ thống (Phân quyền, Biểu mẫu, Log, Danh mục, Thiết lập
email). Hai CSDL: `HCRC_RP` (người dùng/quyền/cấu hình, có ghi) và
`HCRC_DWH` (dữ liệu báo cáo, chỉ đọc) — xem `rp-db/schema.sql` và
`dwh/schema.sql` ở thư mục gốc repo.

## Cài đặt

```bash
cd report-server
npm install
cp .env.example .env   # điền RP_*, DWH_*, JWT_SECRET, APP_ENCRYPTION_KEY
```

Tạo khoá mã hoá (dùng để mã hoá mật khẩu lưu trong CSDL — nguồn dữ liệu bổ
sung, cấu hình email):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Chạy `rp-db/schema.sql` trên CSDL `HCRC_RP` (một lần — an toàn chạy lại nhiều
lần, tự seed sẵn cây menu + vai trò `admin`).

Tạo tài khoản quản trị đầu tiên — không có giao diện nào tạo được tài khoản
đầu tiên, vì trang "Phân quyền" cũng cần đăng nhập trước:

```bash
npm run seed:admin -- ten-dang-nhap mat-khau "Họ Tên"
```

## Chạy

```bash
npm start          # production
npm run dev         # tự khởi động lại khi sửa code
```

## Thêm một báo cáo mới

Qua trang "Biểu mẫu" (`/system/report-catalog`), hoặc thêm trực tiếp một
dòng vào `app.ReportCatalog`:

```sql
INSERT INTO app.ReportCatalog (ReportId, Title, Domain, MenuItemId, DataSourceId, DefinitionJson)
SELECT
  'hop-dong-sap-het-han', N'Hợp đồng sắp hết hạn', 'HopDong', Id, NULL,
  N'{
    "id": "hop-dong-sap-het-han",
    "title": "Hợp đồng sắp hết hạn",
    "domain": "HopDong",
    "filters": [
      { "field": "deptCode", "label": "Phòng ban", "type": "select" },
      { "field": "eventDate", "label": "Khoảng thời gian", "type": "dateRange" }
    ],
    "columns": ["entityCode", "deptName", "eventDate", "measures.giaTri"],
    "export": ["excel", "pdf"]
  }'
FROM app.MenuItems WHERE Code = 'reports-kinh-doanh';
```

`DataSourceId = NULL` dùng Data Warehouse mặc định; khác NULL thì trỏ tới một
dòng trong `app.ReportDataSources` (nguồn bổ sung, xem mục "Kết nối DB cho
báo cáo" trong tài liệu kiến trúc). Sau khi tạo báo cáo, phải gán quyền xem
cho ít nhất một vai trò ở `PUT /api/system/roles/:id/report-access` (hoặc
trang Phân quyền) — mặc định không vai trò nào (trừ Admin) thấy được báo cáo
mới tạo.

`filters[].field` không khớp `entityCode`/`eventDate`/`sourceSystem` sẽ tự
được coi là một khoá trong cột `Dimensions` (JSON) của `dwh.ReportFacts` —
xem `lib/reportEngine.js`.

## API

| Endpoint | Mô tả |
|---|---|
| `POST /api/auth/login` / `logout` | Đăng nhập/đăng xuất |
| `GET /api/me` | Người dùng hiện tại + menu đã lọc theo quyền |
| `GET /api/reports?domain=` | Danh mục báo cáo được xem, theo domain |
| `GET/POST /api/reports/:id`, `.../run`, `.../export` | Định nghĩa, chạy, xuất báo cáo |
| `/api/system/users` | CRUD người dùng, gán vai trò |
| `/api/system/roles` | CRUD vai trò, gán quyền menu + báo cáo |
| `/api/system/menu-items` | Cây menu đầy đủ (dựng UI gán quyền) |
| `/api/system/categories` | CRUD danh mục dùng chung |
| `/api/system/email-settings` | Cấu hình SMTP + gửi thử |
| `/api/system/audit-log` | Xem log, chỉ đọc |
| `/api/system/report-catalog` | CRUD định nghĩa báo cáo, tải mẫu `.xlsx/.pptx` |
| `/api/system/data-sources` | CRUD nguồn dữ liệu bổ sung, kiểm tra kết nối |

Toàn bộ route (trừ `/api/health`, `/api/auth/login`) yêu cầu đăng nhập; các
route trong `/api/system/*` yêu cầu thêm đúng quyền menu tương ứng (vd
`/api/system/users` cần quyền `system-permissions`) — xem
`lib/auth.js:requireMenuAccess`.

## Chưa làm ở bước khung này

- Xuất theo đúng mẫu biểu công ty (`.xlsx`/`.pptx` thật) — xem `templates/README.md`.
- Đặt lại mật khẩu tự phục vụ (hiện chỉ Admin đặt lại được qua `/api/system/users/:id/reset-password`).
