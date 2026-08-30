# ETL — Đồng bộ dữ liệu MSSQL vào Data Warehouse

Đồng bộ tăng dần (theo cột `UpdatedAt`) từ nhiều máy chủ SQL Server nguồn vào
bảng `dwh.ReportFacts` trên Data Warehouse trung tâm. Mỗi nguồn một tài khoản
SQL chỉ đọc, mỗi nguồn một file connector độc lập trong `sources/`.

## Cài đặt

```bash
cd etl
npm install
cp .env.example .env   # điền thông tin kết nối DWH_* trước khi chạy
```

Chạy `dwh/schema.sql` trên Data Warehouse (một lần — an toàn chạy lại nhiều lần,
mọi CREATE đều kiểm tra tồn tại trước).

## Chạy thử một lần (không cần đợi lịch)

```bash
npm run sync:once
```

## Chạy nền theo lịch (production, dùng PM2)

```bash
pm2 start index.js --name hcrc-etl
```

## Thêm một nguồn mới

1. Copy `sources/_template.js` thành `sources/<ten-nguon>.js`.
2. Sửa `key`, `label`, `envPrefix`, `domain` cho đúng nguồn thật.
3. Sửa `extract()` — câu SQL đúng bảng/cột thật. **Bắt buộc** `WHERE UpdatedAt >
   @lastSyncedAt` và `SELECT` kèm cột `UpdatedAt` (dùng để cập nhật mốc đồng bộ
   sau khi chạy xong, xem `jobs/runSync.js`).
4. Sửa `transform()` — map 1 dòng nguồn thành
   `{ sourceSystem, domain, entityCode, eventDate, dimensions, measures }`.
5. Thêm `require('./<ten-nguon>')` vào mảng trong `sources/index.js`.
6. Thêm khối `SRC_<TEN>_...` vào `.env` (xem mẫu cuối `.env.example`) — cấp một
   tài khoản SQL **chỉ đọc** trên máy chủ nguồn đó, tách biệt với tài khoản của
   chính phần mềm nghiệp vụ.

Không cần sửa gì ở `jobs/`, `lib/`, `db.js` — toàn bộ phần đó dùng chung cho
mọi nguồn, không phụ thuộc nguồn cụ thể nào.

## Nguồn chưa có cột `UpdatedAt` đáng tin cậy?

`extract()` vẫn viết được — so khớp theo khoá chính thay vì lọc theo thời gian
— nhưng nên bàn trước cách làm cụ thể vì ảnh hưởng trực tiếp tới tải lên máy
chủ nguồn mỗi lượt chạy.

## Giới hạn đã biết

Đồng bộ theo watermark (`UpdatedAt`) **không phát hiện được dòng bị xoá ở
nguồn** — dòng đã xoá thì không còn `UpdatedAt` để so sánh. Nếu nghiệp vụ có
xoá dòng thật (không phải đánh dấu trạng thái), cần thêm một trong hai hướng
xử lý (bàn trước khi cần):

- Bật Change Data Capture (CDC) của SQL Server trên bảng nguồn — bắt được cả
  thao tác xoá.
- Chạy thêm một job đối chiếu định kỳ, so khoá chính giữa nguồn và kho để dọn
  dòng đã xoá.
