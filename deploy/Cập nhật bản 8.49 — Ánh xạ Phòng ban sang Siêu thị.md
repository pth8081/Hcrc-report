# Cập nhật bản 8.49 — Ánh xạ Phòng ban (vpdt) → Siêu thị

## Bối cảnh

Bước 1 trong lộ trình lớn hơn: "phân quyền DỮ LIỆU theo đúng siêu thị" —
nhân viên 1 siêu thị chỉ thấy số liệu của siêu thị đó trong báo cáo, HO
(Văn phòng) thấy toàn bộ. Đã phân tích kỹ với người dùng trước khi làm
(xem lịch sử trao đổi) — kết luận:

- Hệ thống đã đồng bộ sẵn `Department` (tên phòng ban/siêu thị) và
  `WorkLocation` ("Văn phòng"/"Siêu Thị") từ vpdt (HCRC Workspace) vào
  `app.Users`.
- Cần 1 khoá CHUẨN để khớp "người này thuộc siêu thị nào" với dữ liệu thật
  trong Data Warehouse — **tái dùng `MaDiem`** đã có sẵn ở "Ánh xạ Điểm -
  STK_ID" (etl-admin), vì mọi thứ (báo cáo composite, topZeroStock,
  coreZeroStock, Báo cáo tự do) đều quy về đúng khoá này.
- Tên trong `Department` (vpdt) có thể KHÔNG khớp chính xác tên siêu thị
  đã khai ở "Ánh xạ Điểm - STK_ID" (lệch chính tả/viết tắt) — người dùng
  chọn phương án "cho upload mapping linh hoạt hơn là fix cứng", mirror
  đúng cơ chế đã có.

## Thay đổi

Trang mới **"Ánh xạ Phòng ban → Siêu thị"** (menu Hệ thống) — bảng
`app.DepartmentStoreMapping` (DepartmentRaw ↔ MaDiem), có:
- Upload Excel (cột `DepartmentRaw`, `MaDiem`) + tải file mẫu.
- Sửa/xoá/thêm từng dòng.
- Xuất toàn bộ ra Excel.

**Thứ tự tự động suy ra MaDiem cho 1 Department** (hàm
`resolveMaDiemForDepartment()`, `rp-server/lib/departmentStoreMapping.js`):
1. Có dòng ánh xạ tường minh ở bảng này → dùng `MaDiem` đó.
2. Không có → tìm `MaDiem` có `TenSieuThi` (Ánh xạ Điểm - STK_ID) khớp
   ĐÚNG CHUỖI với Department.
3. Không khớp gì → trả `null` — cần Admin bổ sung 1 dòng ở trang này.

**CHƯA áp dụng bất kỳ giới hạn xem dữ liệu nào** — bản này chỉ là hạ tầng
ánh xạ, chưa gắn vào trang Người dùng hay bất kỳ báo cáo nào. Lộ trình
tiếp theo:
- **8.50**: trang "Người dùng" tự gợi ý phạm vi dữ liệu cho từng người
  (dùng `resolveMaDiemForDepartment()` + `WorkLocation`), Admin xác
  nhận/sửa tay.
- **8.51 trở đi**: áp lọc THẬT vào báo cáo (composite trước, sau đó
  topZeroStock/coreZeroStock/Báo cáo tự do).

## File đã sửa

- `rp-db/schema.sql` — bảng mới `app.DepartmentStoreMapping`, menu mới
  `system-department-mapping`.
- `rp-server/lib/departmentStoreMappingImport.js` — parse Excel/upsert/
  template/export (mirror đơn giản hoá `lib/diemStkMappingImport.js` bên
  etl).
- `rp-server/lib/departmentStoreMapping.js` — `resolveMaDiemForDepartment()`
  (đọc cả bảng ánh xạ RIÊNG này lẫn Ánh xạ Điểm - STK_ID có sẵn, cache
  60s, fail-soft).
- `rp-server/routes/departmentStoreMapping.js` — CRUD + import/export,
  `requireMenuAccess('system-department-mapping')` cho xem,
  `requireSystemRoleActor` cho mọi thao tác ghi.
- `rp-server/server.js` — gắn route `/api/system/department-mapping`.
- `rp-user/.../DepartmentStoreMappingPage.jsx` + `App.jsx` — trang quản
  trị mới.

## Các bước triển khai

1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (an toàn chạy lại nhiều lần).
3. `cd rp-user && npm run build`, copy `dist/` mới vào đúng chỗ Nginx/
   `serve-static.js` đang trỏ tới.
4. `pm2 restart hcrc-rp-server` (BẮT BUỘC — route API mới).
5. Vào "Hệ thống → Phân quyền" → cấp quyền menu "Ánh xạ Phòng ban → Siêu
   thị" cho vai trò nào cần tự quản lý ánh xạ này (Admin hệ thống tự thấy
   sẵn, không cần cấp).
6. Kiểm tra:
   - Vào trang mới → "Tải file mẫu" → điền 1 dòng Department thật (lấy từ
     cột "Phòng ban" ở trang Người dùng) + MaDiem thật (từ "Ánh xạ Điểm -
     STK_ID", etl-admin) → "Nhập file ánh xạ" → hiện đúng trong danh sách.
   - "Sửa"/"Xoá" 1 dòng bằng form bên dưới bảng.
   - "Xuất tất cả (Excel)" tải về đúng file vừa nhập.

Không đổi báo cáo/quyền xem hiện có — trang này đứng độc lập, chưa ảnh
hưởng gì tới người dùng cuối cho tới khi bản 8.50/8.51 gắn vào.
