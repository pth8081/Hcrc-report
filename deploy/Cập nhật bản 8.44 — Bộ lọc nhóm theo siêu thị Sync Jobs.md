# Cập nhật bản 8.44 — Bộ lọc/nhóm theo siêu thị trong danh sách Đồng bộ

## Bối cảnh

Người dùng hỏi: sau này đồng bộ thêm dữ liệu mới từ siêu thị lên thì có
phải tạo thêm VIEW + job đồng bộ mới không, và có cách nào gộp lại chỉ
dùng 1 job đồng bộ không (để sau này quản trị gọn hơn)?

**Trả lời đã trao đổi với người dùng**: hiện tại kiến trúc là 1 job = 1
nguồn (DataSourceId) + 1 bảng/VIEW + 1 domain đích — đúng là mỗi loại dữ
liệu mới sẽ cần 1 job mới. Gộp nhiều loại dữ liệu vào 1 job/siêu thị có
3 vấn đề cụ thể (đã kiểm tra trực tiếp trong code, không suy đoán):

1. **Lịch chạy (`CronExpression`)** nằm trên job — gộp lại thì mọi loại
   dữ liệu trong job đó phải chạy CÙNG 1 lịch, mất khả năng cho ví dụ
   "Doanh thu" chạy mỗi 2 phút còn "Danh mục hàng" chạy mỗi ngày.
2. **Mốc đồng bộ (`etl.SyncState.LastSyncedAt`)** có khoá chính DUY NHẤT
   là `SyncJobId` — 1 job chỉ giữ được 1 mốc thời gian, không tách được
   mốc riêng cho từng loại dữ liệu trong cùng job (phải đổi schema mới
   làm được, không đơn giản).
3. **Log lỗi (`etl.SyncLog`)** ghi 1 dòng cho MỖI LẦN CHẠY JOB, không
   phải 1 dòng/1 loại dữ liệu — job gộp chạy lỗi sẽ không biết lỗi do
   loại dữ liệu nào trong nhiều loại gộp chung.

Gộp cũng KHÔNG giảm được số kết nối CSDL thật — hệ thống đã dùng kết nối
dùng chung (pool) theo từng `DataSourceId` từ trước, không phải theo
từng job.

→ Người dùng đã chọn giữ nguyên kiến trúc 1 job/1 loại dữ liệu (an toàn
hơn), chỉ cần làm gọn CÁCH XEM danh sách — đây là nội dung bản 8.44.

## Thay đổi

Trang "Đồng bộ" (`etl-admin`) có thêm:

1. Ô tìm kiếm "Tìm theo tên siêu thị hoặc tên job…" — lọc theo tên job
   HOẶC tên nguồn dữ liệu (siêu thị), không phân biệt hoa/thường.
2. Tuỳ chọn "Nhóm theo siêu thị" (bật sẵn) — gộp các job cùng 1 nguồn dữ
   liệu vào 1 khối, bấm vào tiêu đề khối để mở/đóng, hiện số job trong
   mỗi khối. Khi có từ khoá tìm kiếm, khối khớp tự mở sẵn.
3. Tắt "Nhóm theo siêu thị" → về lại bảng danh sách phẳng như cũ, có
   thêm cột "Nguồn dữ liệu" (trước đây không hiện cột này, phải mở từng
   job mới biết thuộc siêu thị nào).

**Không đổi**: `etl.SyncJobs`/`etl.SyncState`/`etl.SyncLog` (schema),
`etl/jobs/scheduler.js` (lịch chạy/cơ chế job), API `/sync-jobs` (vẫn
trả nguyên `DataSourceId` trên mỗi job, dùng để nhóm phía giao diện).

## Các bước triển khai

1. `git pull origin main`
2. `cd etl-admin && npm run build`, copy `dist/` mới vào đúng chỗ Nginx/
   `serve-static.js` đang trỏ tới.
3. Không cần restart backend (`etl`), không cần chạy lại CSDL.
4. Kiểm tra: trang "Đồng bộ" hiện ô tìm kiếm + tuỳ chọn "Nhóm theo siêu
   thị"; gõ tên 1 siêu thị → chỉ còn đúng khối siêu thị đó, tự mở; tắt
   "Nhóm theo siêu thị" → về bảng phẳng, có thêm cột "Nguồn dữ liệu".

Không đổi CSDL, không đổi backend ETL.
