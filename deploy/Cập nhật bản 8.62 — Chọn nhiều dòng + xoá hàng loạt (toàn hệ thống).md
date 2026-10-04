# Cập nhật bản 8.62 — Chọn nhiều dòng + xoá hàng loạt (toàn hệ thống)

## Vấn đề

Ở các trang danh sách dạng bảng (Nguồn dữ liệu, Đồng bộ, Vai trò, Ánh xạ
Điểm↔STK_ID...), muốn xoá nhiều dòng phải bấm "Xoá" + xác nhận từng dòng
một — chậm và dễ bỏ sót khi cần dọn nhiều (vd nhiều siêu thị/job đồng bộ
cùng lúc). Người dùng yêu cầu thêm checkbox chọn nhiều dòng + 1 nút xoá
hàng loạt, áp dụng cho TOÀN BỘ bảng có nút "Xoá" từng dòng ở cả 3 giao
diện (rp-user, etl-admin, api-admin), và yêu cầu việc này trở thành quy
tắc bắt buộc cho mọi bảng làm thêm sau này (giống quy tắc khoá nút bản
8.60) — đã ghi vào `CLAUDE.md` ở gốc repo.

## Thay đổi

**Hạ tầng dùng chung** (viết 1 lần, dùng lại ở mọi trang) — thêm ở cả 3 app:
- `src/lib/useRowSelection.js` — hook quản lý tập ID dòng đang chọn:
  `{ selectedIds, toggle, toggleAll, isSelected, clear }`.
- `src/components/DataTable.jsx` — nhận thêm prop tuỳ chọn `selection`
  (= kết quả của `useRowSelection()`); khi truyền, tự vẽ thêm 1 cột
  checkbox đầu bảng (gồm checkbox "chọn tất cả" ở header); không truyền
  thì bảng vẽ y hệt như trước, không ảnh hưởng các nơi gọi khác.

Nút "Xoá N mục đã chọn" gọi LẶP LẠI đúng API xoá 1 dòng đã có sẵn của
từng trang (loop tuần tự qua các ID đã chọn) — không viết thêm API "xoá
theo danh sách ID" riêng, theo đúng lựa chọn của người dùng (ưu tiên
triển khai nhanh, ít đổi backend, chấp nhận đánh đổi chậm hơn khi xoá rất
nhiều dòng cùng lúc). Nút này tuân thủ ĐÚNG quy tắc khoá nút bản 8.60: tự
khoá (`disabled`) + đổi chữ thành "Đang xoá..." trong lúc xử lý, mở khoá
lại khi xong (kể cả khi lỗi).

**21 trang đã áp dụng:**

| App | Trang |
|---|---|
| etl-admin | Đồng bộ (Sync Jobs), Nguồn dữ liệu, Vai trò, Danh sách hàng Core, Ánh xạ Điểm↔STK_ID |
| api-admin | Nguồn dữ liệu, Endpoint realtime (đọc), Endpoint realtime (ghi), Báo cáo, Đối tác, Vai trò |
| rp-user | Vai trò, Danh mục, Lịch gửi email báo cáo, Cảnh báo bất thường, Ánh xạ phòng/cửa hàng, và trong "Danh mục báo cáo": Nguồn dữ liệu, Kết nối ngoài, Kết nối API, Dashboard, Báo cáo |

**1 trang không áp dụng**: rp-user → "Báo cáo đã lưu" (Adhoc) — danh sách
này không vẽ bằng `DataTable` dạng bảng nhiều dòng (giao diện khác), nên
giữ nguyên như cũ, không gượng ép thêm checkbox.

## Lưu ý đã biết (không chặn dùng)

Vai trò hệ thống (3 trang "Vai trò" ở cả 3 app) không xoá được — nút "Xoá"
từng dòng của nó đã ẩn sẵn từ trước — nhưng checkbox ở đầu dòng đó vẫn
hiện ra bình thường (`DataTable` hiện chưa có cơ chế ẩn checkbox riêng lẻ
1 dòng). Nếu lỡ tick chọn kèm 1 vai trò hệ thống rồi bấm xoá hàng loạt,
server vẫn chặn đúng như khi xoá từng dòng (trả lỗi rõ ràng), không xoá
nhầm — chỉ là trải nghiệm chưa thật mượt (phải bỏ chọn tay nếu lỡ tick).
Có thể cải thiện sau bằng cách thêm cơ chế ẩn checkbox cho dòng không xoá
được nếu người dùng thấy cần.

## Các bước triển khai

1. `git pull origin main`.
2. Build lại và deploy cả 3 giao diện như quy trình thường dùng
   (`npm run build` ở từng app, copy `dist/` lên server tĩnh) — thuần
   frontend, không đổi API/CSDL, không có migration hay script cần chạy
   tay.
3. Kiểm tra nhanh: mở 1 trong 21 trang ở trên (vd etl-admin → Đồng bộ),
   tick vài checkbox ở cột đầu bảng → thấy nút "Xoá N mục đã chọn" hiện ra
   dưới bảng → bấm thử xoá 1-2 dòng rác để xác nhận hoạt động đúng (nút tự
   khoá trong lúc xử lý, danh sách tự tải lại sau khi xoá xong).

Không đổi cấu trúc CSDL, không ảnh hưởng job/báo cáo khác đang chạy.
