# Cập nhật bản 8.69 — Chặn đúng theo siêu thị cho "Cảnh báo hàng tồn"

## Tóm tắt yêu cầu người dùng

Sau khi xác nhận bản 8.68 ("Tồn kho theo ngưỡng" + "Cảnh báo hàng tồn"),
người dùng hỏi lại: *"với việc upload file thì siêu thị nào tự upload file
của siêu thị đấy đúng không? Và họ sẽ ra báo cáo riêng siêu thị của họ
đúng không? Còn HO thì có thể là ra báo cáo chung của tất cả các siêu thị
được."*

Rà soát lại xác nhận: **phía BÁO CÁO** (rp-user, bản 8.68) đã đúng —
"Phạm vi dữ liệu" (bản 8.50/8.51) tự áp dụng cho 2 báo cáo mới, nhân sự 1
siêu thị chỉ thấy đúng siêu thị đó, HO thấy hết. **Phía UPLOAD** (etl-admin)
thì **CHƯA ĐÚNG** — có 2 lỗi độc lập:

1. **Lỗi nguy hiểm**: mỗi lần 1 siêu thị upload file ngưỡng cảnh báo của
   MÌNH, hệ thống XOÁ SẠCH TOÀN BỘ bảng `etl.StockAlertThresholds` rồi mới
   ghi lại — nghĩa là 1 siêu thị upload sẽ XOÁ MẤT ngưỡng của MỌI siêu thị
   khác đã khai trước đó, không chỉ ghi đè đúng phần của mình.
2. **Thiếu phân quyền theo siêu thị**: etl-admin từ trước tới giờ CHỈ có
   phân quyền theo MENU (trang nào thấy được, trang nào sửa được) —
   KHÔNG có khái niệm "tài khoản A chỉ được thấy siêu thị X" như rp-user
   đã có (`app.UserStoreAccess`, bản 8.50). Bất kỳ ai có quyền sửa trang
   "Cảnh báo hàng tồn" đều thấy/sửa/xoá được ngưỡng của MỌI siêu thị.

Người dùng xác nhận chọn **sửa cả 2** (không chỉ sửa lỗi 1, còn làm hẳn
phân quyền theo siêu thị cho etl-admin).

## Thay đổi

### 1. Sửa lỗi import "xoá sạch toàn bảng"

`etl/lib/stockAlertThresholdsImport.js:replaceStockAlertThresholds()` —
trước đây `DELETE FROM etl.StockAlertThresholds` (không lọc gì) rồi ghi
lại toàn bộ `rows` của file đang upload. Nay **REPLACE THEO TỪNG MaDiem
CÓ xuất hiện trong file**: nhóm `rows` theo `MaDiem`, với MỖI nhóm chỉ
`DELETE ... WHERE MaDiem = @maDiem` rồi ghi lại ĐÚNG nhóm đó — ngưỡng của
các siêu thị KHÁC (không có dòng nào trong file đang upload) giữ nguyên,
không bị đụng tới. Mirror đúng cách `etl/lib/coreItemListImport.js:
replaceCoreItemList()` đã làm từ trước (scoped theo `LoaiDiem`).

File 0 dòng dữ liệu giờ **KHÔNG LÀM GÌ** (trước đây xoá sạch toàn bộ danh
sách, phải xác nhận riêng qua cơ chế "confirmEmpty") — cơ chế
`confirmEmpty` cũ đã **bỏ hẳn** vì không còn khái niệm "xoá sạch qua
upload" nữa. Muốn xoá hẳn ngưỡng của 1 siêu thị, dùng nút "Xoá N mục đã
chọn" đã có sẵn trên trang (bản 8.62 — chọn các dòng của đúng siêu thị đó
rồi xoá hàng loạt).

### 2. Phân quyền theo siêu thị cho etl-admin (tính năng MỚI)

Mirror đúng tinh thần `app.UserStoreAccess`/"Phạm vi dữ liệu" đã có ở
rp-user (bản 8.50/8.51), áp cho etl-admin:

- **Bảng mới** `admin.AdminUserStoreAccess(AdminUserId, MaDiem)`
  (`etl-db/schema.sql`) — không có dòng nào = "Toàn bộ" (mặc định AN
  TOÀN, giữ nguyên hành vi hiện tại cho mọi tài khoản chưa được gán gì),
  có dòng = CHỈ được xem/sửa/xoá/upload đúng (các) siêu thị đó. KHÔNG áp
  dụng cho tài khoản vai trò hệ thống (luôn thấy hết).
- `etl/lib/adminPermissions.js:loadContext()` — nạp thêm `storeScope` vào
  context (null hoặc mảng MaDiem), tự động có sẵn ở `req.adminContext`
  trên MỌI route đã qua `requireMenuAccess`/`requireMenuEdit` (không cần
  sửa middleware nào khác).
- **Gán phạm vi** — trang "Phân quyền" (`etl-admin/src/pages/
  UsersPage.jsx`): thêm cột "Phạm vi siêu thị" + nút "Gán siêu thị" (chỉ
  tài khoản vai trò hệ thống thấy nút, giống "Gán vai trò") → modal chọn
  nhiều mã Điểm → `PUT /admin/users/:id/stores`
  (`etl/routes/admin/users.js`, thao tác NHẠY CẢM qua
  `requireSystemRoleActor` — tránh 1 tài khoản thường tự mở rộng phạm vi
  của chính mình). Danh sách mã Điểm để chọn lấy qua `GET /admin/users/
  store-options` (đọc `etl.DiemStkMapping`).
- **Áp dụng** — `etl/routes/admin/stockAlertThresholds.js`:
  - `GET /` và `GET /export`: chỉ trả về dòng thuộc phạm vi của người gọi
    (không giới hạn = trả hết, như cũ).
  - `DELETE /:id`: trả 404 "Không tìm thấy" nếu dòng đó thuộc siêu thị
    NGOÀI phạm vi (không lộ việc dòng đó có tồn tại ở siêu thị khác).
  - `POST /import`: nếu file có dòng thuộc siêu thị NGOÀI phạm vi của
    người upload → TỪ CHỐI HẲN (400, không ghi gì vào CSDL), báo rõ (các)
    mã Điểm nào ngoài phạm vi — không âm thầm bỏ qua dòng đó, cũng không
    âm thầm cho ghi.

### Những gì KHÔNG đổi

- Báo cáo (rp-user, bản 8.68) không cần sửa gì — đã đúng từ đầu.
- Tài khoản etl-admin CHƯA được gán siêu thị nào (mặc định) vẫn thấy/sửa
  được TOÀN BỘ như trước — bản này không tự ý giới hạn tài khoản nào,
  admin phải CHỦ ĐỘNG vào "Gán siêu thị" cho từng tài khoản cần giới hạn.
- Trang "Danh sách hàng Core" và "Ánh xạ Điểm - STK_ID" KHÔNG nằm trong
  phạm vi sửa lần này (chưa được yêu cầu) — vẫn như cũ.

## Các bước triển khai

1. `git pull origin main`.
2. Chạy lại `etl-db/schema.sql` (BẮT BUỘC — bảng mới
   `admin.AdminUserStoreAccess`, an toàn chạy lại nhiều lần).
3. `pm2 restart hcrc-etl` (BẮT BUỘC — sửa `lib/adminPermissions.js`,
   `lib/stockAlertThresholdsImport.js`, `routes/admin/users.js`,
   `routes/admin/stockAlertThresholds.js`).
4. `cd etl-admin && npm run build`, copy `dist/` mới lên server (trang
   "Phân quyền" có cột + nút mới).
5. Vào etl-admin → "Phân quyền" → với mỗi tài khoản CHỈ quản lý 1 (vài)
   siêu thị cụ thể (vd nhân sự 1 siêu thị tự upload file của siêu thị
   mình), bấm "Gán siêu thị" → chọn đúng (các) mã Điểm của siêu thị đó →
   Lưu. Tài khoản của HO/người cần xem hết thì KHÔNG gán gì (để trống).
6. Kiểm tra lại:
   - Đăng nhập bằng tài khoản vừa gán 1 siêu thị → vào "Cảnh báo hàng
     tồn" → chỉ thấy đúng các dòng của siêu thị đó.
   - Thử upload 1 file có dòng `MaDiem` thuộc siêu thị KHÁC phạm vi được
     gán → phải bị từ chối rõ ràng (400), KHÔNG ghi gì vào CSDL.
   - Thử upload file đúng phạm vi của mình → chỉ ngưỡng của (các) siêu
     thị trong file bị thay, ngưỡng của siêu thị khác (do người khác khai
     trước đó) phải CÒN NGUYÊN.

## File thay đổi

- `etl-db/schema.sql` — bảng `admin.AdminUserStoreAccess`.
- `etl/lib/adminPermissions.js` — `loadContext()` nạp `storeScope`.
- `etl/routes/admin/users.js` — `GET /store-options`,
  `PUT /:id/stores`, `GET /` trả kèm `stores`.
- `etl/lib/stockAlertThresholdsImport.js` — `replaceStockAlertThresholds()`
  scoped theo MaDiem, thêm `distinctMaDiems()`, bỏ cơ chế "confirmEmpty".
- `etl/routes/admin/stockAlertThresholds.js` — áp `storeScope` cho
  GET/DELETE/export/import.
- `etl-admin/src/pages/UsersPage.jsx` — cột + modal "Gán siêu thị".
- `etl-admin/src/pages/StockAlertThresholdsPage.jsx` — cập nhật nội dung
  hướng dẫn, bỏ luồng xác nhận "confirmEmpty" ở giao diện.
