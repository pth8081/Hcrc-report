# Cập nhật bản 8.80 — Bật/Tắt hàng loạt + sửa xoá hàng loạt dừng cả loạt (ETL)

## Yêu cầu của người dùng

> "Bạn cho phép chọn nhiều ở nguồn dữ liệu và đồng bộ để tắt, bật nhiều
> cùng một lúc, xoá đang ko thể xoá được nhiều đâu có thể phải tắt hết
> mới xoá được phải ko? Bạn kiểm tra luôn nhé"

Kèm ảnh chụp trang "Nguồn dữ liệu" (etl-admin) — bảng danh sách nguồn,
mỗi dòng đang có checkbox chọn.

## Trả lời câu hỏi "phải tắt hết mới xoá được?"

**KHÔNG đúng.** Kiểm tra lại toàn bộ code liên quan xác nhận: trạng thái
Bật/Tắt (`IsActive`) và việc xoá được hay không là **2 việc HOÀN TOÀN
KHÔNG LIÊN QUAN** nhau:

- `IsActive` CHỈ quyết định: nguồn có được mở kết nối không
  (`etl/lib/dataSourcePool.js`), job có được đăng ký vào lịch chạy
  (`node-cron`) không (`etl/jobs/scheduler.js`). Tắt (`IsActive=0`) chỉ
  là **tạm dừng**, không xoá/gỡ gì cả.
- `DELETE /admin/data-sources/:id` (bản 8.76) từ chối xoá nếu còn **bất
  kỳ Sync Job nào** có `DataSourceId` trỏ vào nguồn đó — **không quan
  tâm job đó đang Bật hay Tắt**, cả 2 trạng thái đều bị chặn như nhau.

Vậy nguyên nhân thật của "chọn nhiều, ấn xoá không ăn thua" không phải
do thiếu bước Tắt trước, mà là **lỗi khác** — xem bên dưới.

## Nguyên nhân thật tìm được

`deleteSelected()` (cả `DataSourcesPage.jsx` lẫn `SyncJobsPage.jsx`)
chạy TUẦN TỰ qua từng mục đã chọn:

```js
for (const id of selection.selectedIds) {
  await api.del(`/data-sources/${id}`); // KHÔNG có try/catch RIÊNG cho từng mục
}
```

Khi mục nào đó bị route từ chối (vd còn job tham chiếu, trả lỗi 400),
`await` ném lỗi, thoát NGAY khỏi vòng `for` — **mọi mục ĐỨNG SAU mục bị
lỗi trong danh sách đã chọn KHÔNG BAO GIỜ được thử xoá**, dù bản thân
chúng hoàn toàn xoá được bình thường. Người dùng chỉ thấy 1 thông báo
lỗi chung chung, không biết mục nào đã xoá/mục nào bị chặn/vì sao — đúng
cảm giác "xoá nhiều không được".

## Đã sửa

### 1. Xoá hàng loạt — chịu lỗi từng mục độc lập (cả 2 trang)

Mỗi mục trong vòng lặp giờ có `try/catch` RIÊNG — lỗi 1 mục không còn
làm dừng cả vòng lặp. Sau khi chạy hết toàn bộ danh sách đã chọn, gộp
báo lỗi rõ ràng (tên từng mục thất bại + lý do thật lấy từ response của
chính route đó):

```js
const failed = [];
for (const id of selection.selectedIds) {
  try {
    await api.del(`/data-sources/${id}`);
  } catch (err) {
    const src = sources.find((s) => s.Id === id);
    failed.push(`${src?.Name || id}: ${err.message}`);
  }
}
setError(failed.length ? `Không xoá được ${failed.length} nguồn — ${failed.join('; ')}` : '');
```

### 2. Bật/Tắt hàng loạt — tính năng MỚI (đúng yêu cầu)

Thêm 2 nút **"Bật N đã chọn"** / **"Tắt N đã chọn"** cạnh nút "Xoá N đã
chọn" sẵn có, cho CẢ trang "Nguồn dữ liệu" lẫn "Đồng bộ". Gọi LẶP LẠI
đúng `PUT /:id` đã có (y hệt nút "Bật"/"Tắt" ở từng dòng — KHÔNG viết API
mới), nhưng **ép TOÀN BỘ mục đã chọn về CÙNG 1 trạng thái mong muốn**
(không đảo ngược riêng từng dòng — chọn 5 dòng trạng thái khác nhau, bấm
"Bật" phải làm CẢ 5 cùng Bật, không phải dòng đang Bật thì tắt đi). Cùng
cơ chế chịu lỗi từng mục độc lập như mục xoá ở trên.

Theo đúng quy tắc khoá nút của dự án: 2 biến trạng thái riêng
(`bulkEnabling`/`bulkDisabling`, khác hẳn `bulkDeleting` đã có) — bấm
"Bật" không khoá nhầm nút "Tắt"/"Xoá" và ngược lại; cả 3 nút khoá lẫn
nhau khi 1 trong 3 đang chạy (tránh bấm chồng 2 thao tác cùng lúc trên
cùng tập đã chọn).

### 3. Dọn thông báo lỗi thời

Hộp thoại xác nhận xoá (cả xoá 1 dòng lẫn xoá hàng loạt) trước đây ghi
"Các job đồng bộ dùng nguồn này sẽ lỗi" — câu này đúng ở bản TRƯỚC 8.76
(lúc đó xoá vẫn chạy, job liên quan mới lỗi SAU). Từ bản 8.76, route đã
**từ chối hẳn việc xoá** khi còn job tham chiếu — không xoá, không có
job nào lỗi cả. Bỏ câu lỗi thời này, tránh gây hiểu lầm ngược với hành
vi thật.

## Đã kiểm chứng bằng Playwright + mock backend THẬT

- **Bật hàng loạt**: 3 nguồn trạng thái Bật/Tắt khác nhau → tick "chọn
  tất cả" → bấm "Bật 3 nguồn đã chọn" → xác nhận backend (mock) nhận
  đúng 3 request `PUT` với `isActive: true` → cả 3 chuyển đúng "Hoạt
  động".
- **Xoá hàng loạt khi 1 mục bị chặn** (dựng lại ĐÚNG tình huống báo lỗi
  của người dùng): 3 nguồn, mock route trả 400 "còn job tham chiếu" cho
  ĐÚNG 1 nguồn giữa danh sách — xác nhận 2 nguồn còn lại **XOÁ ĐÚNG**
  (biến mất khỏi backend), nguồn bị chặn **VẪN CÒN NGUYÊN**, trang hiện
  đúng dòng lỗi nêu tên nguồn thất bại + lý do thật ("còn 1 job đồng bộ
  đang dùng nguồn này..."). Đây chính là hành vi TRƯỚC ĐÂY bị thiếu —
  trước bản này, toàn bộ vòng lặp sẽ dừng ngay khi gặp nguồn bị chặn.
- Build `etl-admin && npx vite build` sạch.

## Các bước triển khai

1. `git pull origin main`.
2. `cd etl-admin && npm run build`, copy `dist/` mới.
   (Sửa thuần frontend — KHÔNG cần `pm2 restart` backend, không đổi
   CSDL.)
3. Kiểm tra: "Nguồn dữ liệu" và "Đồng bộ" → tick nhiều dòng → thấy đủ 3
   nút "Bật N đã chọn"/"Tắt N đã chọn"/"Xoá N đã chọn" → bấm "Bật"/"Tắt"
   → TOÀN BỘ dòng đã chọn đổi đúng trạng thái; thử xoá hàng loạt với ít
   nhất 1 nguồn còn job đồng bộ tham chiếu → các nguồn KHÁC vẫn xoá
   được bình thường, trang báo rõ tên nguồn bị chặn + lý do.

## File thay đổi

- `etl-admin/src/pages/DataSourcesPage.jsx` — thêm `bulkEnabling`/
  `bulkDisabling`, hàm `setActiveForSelected()`, sửa `deleteSelected()`/
  `deleteSource()` chịu lỗi từng mục + bỏ câu xác nhận lỗi thời, thêm 2
  nút Bật/Tắt hàng loạt.
- `etl-admin/src/pages/SyncJobsPage.jsx` — tương tự (cùng cơ chế, dùng
  đúng payload `PUT /sync-jobs/:id` đã có ở nút Bật/Tắt từng dòng).
