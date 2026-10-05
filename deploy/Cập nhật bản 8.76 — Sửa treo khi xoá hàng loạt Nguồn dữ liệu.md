# Cập nhật bản 8.76 — Sửa treo khi xoá hàng loạt Nguồn dữ liệu (ETL)

## Tóm tắt báo lỗi của người dùng

> "Phần ETL khi tôi chọn nhiều mục ở trong đồng bộ và trong nguồn dữ liệu,
> ấn xoá không thể xoá được. Cảm giác như là kết nối lên server bị treo."

## Nguyên nhân thật

`etl/lib/dataSourcePool.js` cache 1 kết nối SQL Server sống cho mỗi
"Nguồn dữ liệu" (vd khi admin duyệt bảng/cột lúc tạo Sync Job). Hàm
`invalidate(id)` — gọi mỗi khi sửa/xoá 1 nguồn — đóng kết nối cũ (nếu có)
bằng `adapter.close(pool)`, **không có timeout nào bọc quanh**.

Driver `tedious` (thư viện `mssql` dùng) coi việc đóng kết nối là xong khi
nhận được sự kiện `'end'` từ phía server. Nếu nguồn DSmart16 bên kia rớt
mạng kiểu **"zombie"** — không đóng cổng hẳn, không gửi TCP RST, chỉ lặng
im — sự kiện đó **không bao giờ tới**, và `adapter.close(pool)` **treo
vĩnh viễn**.

Hậu quả dây chuyền:
1. `invalidate()` treo → route `DELETE /admin/data-sources/:id`
   (`etl/routes/admin/dataSources.js`) không bao giờ gọi `res.json()`.
2. Request HTTP đó không bao giờ có response — phía trình duyệt chờ mãi.
3. Nút "Xoá N mục đã chọn" (bản 8.62) chạy **tuần tự** (`await` trong vòng
   `for`, đúng chuẩn đã thống nhất trong `CLAUDE.md`) — 1 nguồn "treo"
   trong danh sách đã chọn **chặn đứng TOÀN BỘ** các mục còn lại trong
   cùng 1 lượt xoá, kể cả những mục đứng SAU nó mà bản thân chúng hoàn
   toàn bình thường.

Đây đúng là nguyên nhân gây ra cảm giác "mất kết nối server" — không phải
mất kết nối tới etl-admin/ETL Server, mà là 1 thao tác phía server đang
chờ vô thời hạn 1 kết nối MẠNG KHÁC (tới CSDL DSmart16 của 1 siêu thị) mà
không bao giờ nó trả lời.

## Đã sửa

1. **`etl/lib/dataSourcePool.js`** — thêm hàm `withTimeout()` + hằng số
   `CLOSE_TIMEOUT_MS = 5000`, bọc quanh `adapter.close(pool)` trong
   `invalidate()`. Hết 5 giây mà chưa đóng xong → **bỏ qua, chỉ ghi cảnh
   báo log**, KHÔNG ném lỗi lên trên — việc xoá khỏi cache (`connections.delete(id)`,
   phần đảm bảo lần dùng sau sẽ tạo kết nối MỚI đúng) đã chạy TRƯỚC bước
   đóng pool cũ và LUÔN thành công ngay lập tức, không phụ thuộc gì vào
   việc đóng gọn pool cũ có xong hay không.
2. **`etl/routes/admin/dataSources.js`** — thêm kiểm tra TRƯỚC khi xoá:
   còn Sync Job nào đang dùng đúng nguồn này không (`etl.SyncJobs.DataSourceId`
   KHÔNG có `ON DELETE CASCADE`, cố ý — xoá nguồn không được âm thầm xoá
   luôn job đồng bộ). Trước đây thao tác này ném lỗi FK violation thô của
   SQL Server (khó hiểu); giờ trả về lỗi rõ ràng, nêu đích danh tên các
   Sync Job đang chặn.

## Đã kiểm chứng bằng cách dựng lại ĐÚNG lỗi

Viết test gọi thẳng hàm `invalidate()` thật (không fake logic nghiệp vụ,
chỉ fake tầng kết nối CSDL/driver) với `adapter.close()` cố tình trả về 1
Promise KHÔNG BAO GIỜ resolve/reject — mô phỏng chính xác tình huống
"nguồn treo kiểu zombie". Kết quả: `invalidate()` trả về sau đúng **5007ms**
(khớp `CLOSE_TIMEOUT_MS=5000`), kèm dòng cảnh báo log rõ ràng — xác nhận
sửa đúng chỗ, không còn treo vô thời hạn.

## Những gì KHÔNG đổi

- Không đụng CSDL nào (không cần chạy lại `schema.sql`).
- Hành vi xoá nguồn dữ liệu BÌNH THƯỜNG (kết nối khoẻ mạnh, đóng nhanh)
  không đổi — chỉ khác khi gặp đúng tình huống "treo" mới có khác biệt
  (giờ bỏ qua sau 5s thay vì treo mãi).
- Rủi ro chấp nhận được: nếu thật sự gặp timeout, 1 kết nối cũ phía driver
  có thể bị rò rỉ tới khi hệ điều hành tự dọn (hiếm, và đổi lại được việc
  admin không còn bị treo thao tác xoá).

## Các bước triển khai

1. `git pull origin main`.
2. `pm2 restart hcrc-etl` (BẮT BUỘC — nạp code mới, sửa thuần backend,
   không cần build lại etl-admin).
3. Kiểm tra: chọn nhiều "Nguồn dữ liệu"/"Đồng bộ" (bao gồm cả trường hợp
   1 nguồn đang thật sự mất kết nối mạng) → xoá hàng loạt → không còn bị
   treo, mỗi mục xoá xong trong vài giây, kể cả mục "treo" (giờ chỉ mất
   thêm tối đa 5 giây thay vì vô thời hạn).

## File thay đổi

- `etl/lib/dataSourcePool.js` — timeout 5s khi đóng kết nối cũ.
- `etl/routes/admin/dataSources.js` — báo lỗi rõ ràng khi xoá nguồn còn
  Sync Job tham chiếu.
