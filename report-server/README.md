# Report Server

Báo cáo nội bộ HCRC — lọc động theo định nghĩa lưu trong `dwh.ReportCatalog`,
xem trước trên màn hình, xuất Excel/PDF. Chỉ đọc Data Warehouse, không ghi.

## Cài đặt

```bash
cd report-server
npm install
cp .env.example .env   # điền DWH_*, JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD_HASH
```

Tạo mật khẩu quản trị tạm thời (thay bằng bảng người dùng riêng/AD-SSO sau,
xem `lib/auth.js`):

```bash
node -e "console.log(require('bcryptjs').hashSync('mat-khau-that', 10))"
```

Dán kết quả vào `ADMIN_PASSWORD_HASH` trong `.env`.

## Chạy

```bash
npm start          # production
npm run dev         # tự khởi động lại khi sửa code
```

## Thêm một báo cáo mới

Chưa có giao diện quản trị — thêm trực tiếp một dòng vào `dwh.ReportCatalog`:

```sql
INSERT INTO dwh.ReportCatalog (ReportId, Title, Domain, DefinitionJson)
VALUES (
  'hop-dong-sap-het-han',
  N'Hợp đồng sắp hết hạn',
  'HopDong',
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
);
```

`filters[].field` không khớp `entityCode`/`eventDate`/`sourceSystem` sẽ tự
được coi là một khoá trong cột `Dimensions` (JSON) của `dwh.ReportFacts` — xem
`lib/reportEngine.js`.

## API

| Endpoint | Mô tả |
|---|---|
| `POST /api/auth/login` | Đăng nhập, trả cookie JWT |
| `POST /api/auth/logout` | Đăng xuất |
| `GET /api/reports` | Danh mục báo cáo |
| `GET /api/reports/:id` | Định nghĩa một báo cáo (để tự vẽ form lọc) |
| `POST /api/reports/:id/run` | Chạy báo cáo, trả JSON xem trước |
| `POST /api/reports/:id/export` | Xuất file — `{ "format": "excel" \| "pdf" }` |

## Chưa làm ở bước khung này

- Giao diện người dùng (`public/`) — chưa dựng, quyết định sau khi có yêu cầu cụ thể.
- Xuất theo đúng mẫu biểu công ty (`.xlsx`/`.pptx` thật) — xem `templates/README.md`.
- Hệ thống người dùng thật (đang dùng 1 tài khoản quản trị tạm qua `.env`).
