# Cập nhật bản 8.50 — Gán phạm vi dữ liệu theo siêu thị cho từng người dùng

## Bối cảnh

Bước 2 trong lộ trình "phân quyền DỮ LIỆU theo đúng siêu thị" (xem bản
8.49 cho bước 1 — ánh xạ Department sang MaDiem chuẩn). Bản này cho Admin
GÁN phạm vi dữ liệu cho từng người, dựa trên ánh xạ đã có ở bản 8.49.

## Thay đổi

Trang "Người dùng" có thêm:
1. **Cột "Phạm vi dữ liệu"** — "Toàn bộ" (mặc định, không giới hạn gì) hoặc
   "Giới hạn: <tên siêu thị 1>, <tên siêu thị 2>...".
2. **Nút "Phạm vi dữ liệu"** — mở khung tick chọn (các) siêu thị người này
   CHỈ ĐƯỢC THẤY. Không tick gì = "Toàn bộ".
3. **Gợi ý tự động** — khi người này có `WorkLocation = "Siêu Thị"` VÀ
   CHƯA được gán siêu thị nào, hệ thống tự thử suy ra đúng 1 siêu thị theo
   `Department` (qua `resolveMaDiemForDepartment()` — ưu tiên ánh xạ tường
   minh ở "Ánh xạ Phòng ban → Siêu thị", sau đó khớp thẳng tên với "Ánh xạ
   Điểm - STK_ID") — hiện nút "Dùng gợi ý này" để Admin xác nhận bằng 1
   cú bấm, hoặc tự chọn tay/chọn thêm.

**Mặc định AN TOÀN cho rollout**: KHÔNG có dòng nào trong
`app.UserStoreAccess` = "Toàn bộ" — nghĩa là bản này triển khai xong KHÔNG
ai bị thu hẹp quyền xem ngay lập tức. Admin đi gán tay/dùng gợi ý cho từng
người theo thời gian.

## QUAN TRỌNG — chưa lọc dữ liệu thật

Bản này **CHỈ LƯU lựa chọn** vào `app.UserStoreAccess` (UserId + MaDiem).
**CHƯA có bất kỳ route hay tầng chạy báo cáo nào đọc bảng này để giới hạn
số liệu hiển thị** — `lib/permissions.js` chưa đọc bảng này,
`compositeReportRunner.js`/`reportRunner.js`/`adhocReportEngine.js` chưa
biết gì về nó. Việc áp dụng lọc THẬT (ép `topN.filterField`/`filterValue`
ở báo cáo composite, tham số `branches` ở topZeroStock/coreZeroStock, tham
số `entityCodes` ở Báo cáo tự do) sẽ làm ở (các) bản tiếp theo.

## File đã sửa

- `rp-db/schema.sql` — bảng mới `app.UserStoreAccess` (UserId, MaDiem).
- `rp-server/routes/users.js`:
  - `GET /` trả thêm `storeAccess` (mảng MaDiem) cho mỗi người.
  - `GET /store-catalog` — danh mục MaDiem + tên siêu thị (từ "Ánh xạ Điểm
    - STK_ID") để tick chọn.
  - `GET /:id/store-access` — phạm vi hiện có + gợi ý tự động.
  - `PUT /:id/store-access` — lưu lựa chọn (`requireSystemRoleActor`).
- `rp-user/.../UsersPage.jsx` — cột + nút + khung "Phạm vi dữ liệu".

## Các bước triển khai

1. `git pull origin main`
2. Chạy lại `rp-db/schema.sql` (an toàn chạy lại nhiều lần).
3. `cd rp-user && npm run build`, copy `dist/` mới vào đúng chỗ Nginx/
   `serve-static.js` đang trỏ tới.
4. `pm2 restart hcrc-rp-server` (BẮT BUỘC — route API mới).
5. Kiểm tra:
   - Trang "Người dùng" → cột "Phạm vi dữ liệu" hiện "Toàn bộ" cho mọi
     người (đúng, chưa ai bị gán gì).
   - Bấm "Phạm vi dữ liệu" cho 1 người `WorkLocation="Siêu Thị"` có
     `Department` khớp được 1 siêu thị → thấy dòng gợi ý → "Dùng gợi ý
     này" → Lưu → cột cập nhật thành "Giới hạn: <tên siêu thị>".
   - Bấm lại, bỏ hết tick → Lưu → về lại "Toàn bộ".
   - Xác nhận chưa có thay đổi gì ở các trang Báo cáo/Dashboard (đúng ý —
     bản này chưa lọc dữ liệu thật).
