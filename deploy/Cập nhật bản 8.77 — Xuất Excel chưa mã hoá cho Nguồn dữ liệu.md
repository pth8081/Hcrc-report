# Cập nhật bản 8.77 — Xuất Excel chưa mã hoá cho Nguồn dữ liệu

## Tóm tắt báo lỗi của người dùng

> "Bạn kiểm tra lại giúp tôi phần tạo nguồn dữ liệu không xuất được file
> Excel ở mục chưa mã hoá. Đúng không? Tôi cần xuất Excel ở mục này để
> tôi có thể import được."

## Xác nhận: không phải lỗi, mà là tính năng còn thiếu

Kiểm tra toàn bộ code trang "Nguồn dữ liệu" (etl-admin) xác nhận: trước
bản này chỉ có 2 nút liên quan tới xuất file:

1. **"Xuất file mã hoá"** — xuất TOÀN BỘ danh sách dưới dạng 1 file
   `.hcrcenc`, không mở được bằng Excel hay bất kỳ công cụ nào khác, chỉ
   dùng để sao lưu/di chuyển cấu hình giữa các hệ thống HCRC với nhau.
2. **"Tải file mẫu"** — chỉ là 1 file Excel TRỐNG (1 dòng ví dụ), KHÔNG
   chứa dữ liệu nguồn hiện có — dùng để nhập MỚI, không phải xuất ra để
   xem/sửa lại.

**Không có nút nào xuất đúng danh sách Nguồn dữ liệu hiện có ra Excel
thường để sửa rồi nhập lại** — đây là tính năng chưa từng được xây, không
phải lỗi/regression.

## Quyết định bảo mật (đã hỏi và được người dùng xác nhận)

Nguồn dữ liệu có cột **Mật khẩu kết nối CSDL thật**. Nếu xuất "chưa mã
hoá" đúng nghĩa đen (bao gồm cả mật khẩu thật), file Excel sẽ chứa mật
khẩu ở dạng chữ thường — rủi ro nếu file bị gửi nhầm/lưu sai chỗ.

**Người dùng chọn phương án an toàn**: cột **Password luôn để TRỐNG**
trong file xuất ra. Khi nhập lại: để trống = **GIỮ NGUYÊN** mật khẩu cũ,
chỉ cần điền nếu muốn ĐỔI mật khẩu dòng đó.

## Thay đổi

### 1. Hàm xuất mới — `etl/lib/dataSourcesImport.js:exportDataSourcesPlain()`

Đọc đúng dữ liệu thật trong `etl.DataSources` (Name, Server, DatabaseName,
Username, Engine, Port, Encrypt, TrustServerCert) — **KHÔNG đọc/giải mã
`PasswordEncrypted`** (an toàn có chủ đích: mật khẩu thật không bao giờ
chạm tới hàm này). Cùng khuôn cột với "Tải file mẫu" để sửa xong nộp
thẳng lại qua Nhập hàng loạt.

### 2. Route mới — `GET /data-sources/export-plain`

Gate `requireMenuEdit('data-sources')` (không chỉ `requireMenuAccess` như
`/template`) — vì file này lộ thông tin kết nối thật (Server/Username/
Database) của MỌI nguồn, dù không có mật khẩu.

### 3. Sửa luồng Nhập hàng loạt để chấp nhận "Password" trống

Trước đây `parseDataSourcesFile()` bắt buộc MỌI dòng phải có Password —
giờ cột này **tuỳ chọn**. `upsertDataSources()` tra trước TOÀN BỘ "Name"
trong file 1 lượt:

- **Để trống + "Name" đã tồn tại** → dùng lại `PasswordEncrypted` cũ
  NGUYÊN VẸN (không giải mã rồi mã hoá lại — tránh phụ thuộc đúng khoá mã
  hoá còn hiệu lực).
- **Để trống + "Name" MỚI hoàn toàn** → **CHẶN**, báo lỗi rõ ràng
  ("Thiếu Password — bắt buộc khi tạo nguồn MỚI"), KHÔNG tạo nguồn rỗng
  mật khẩu.

Cùng hành vi đã có sẵn ở form sửa 1 nguồn (`PUT /data-sources/:id` —
"Mật khẩu để trống = giữ nguyên mật khẩu đã lưu") — giờ áp dụng nhất quán
cho cả đường Excel hàng loạt.

Bước kiểm tra kết nối sau khi nhập (`testConnectionsBatch`) cũng được sửa
để dùng ĐÚNG mật khẩu thật (giải mã lại từ bản ghi cũ) cho các dòng để
trống Password, thay vì test nhầm bằng chuỗi rỗng.

### 4. Giao diện — `DataSourcesPage.jsx`

Thêm nút "Xuất Excel (danh sách hiện có, chưa mã hoá)" cạnh "Tải file
mẫu", cập nhật lại phần ghi chú giải thích cột Password nay là tuỳ chọn.

## Đã kiểm chứng bằng mock CSDL + mã hoá/giải mã THẬT

Viết test gọi thẳng `exportDataSourcesPlain()`/`parseDataSourcesFile()`/
`upsertDataSources()` thật (dùng đúng `lib/crypto.js` thật, không giả mã
hoá) với CSDL giả lập:

- Xuất ra: cột Password LUÔN trống, các cột khác đúng dữ liệu thật — xác
  nhận OK.
- Nhập lại file có 1 dòng để trống Password với "Name" ĐÃ tồn tại: dòng
  đó được cập nhật, mật khẩu GIỮ NGUYÊN — giải mã lại khớp 100% với mật
  khẩu gốc đã mã hoá trước đó — xác nhận OK.
- Nhập file có 1 dòng để trống Password với "Name" MỚI: dòng đó bị CHẶN
  đúng (không ghi vào CSDL), báo lỗi rõ ràng — xác nhận OK.

Đã demo UI qua Playwright xác nhận nút mới hiển thị đúng vị trí trên
trang.

## Các bước triển khai

1. `git pull origin main`.
2. `pm2 restart hcrc-etl` (BẮT BUỘC — route mới + sửa logic nhập hàng
   loạt).
3. `cd etl-admin && npm run build`, copy `dist/` mới.
4. Kiểm tra: Nguồn dữ liệu → "Xuất Excel (danh sách hiện có, chưa mã
   hoá)" → mở file, xác nhận cột Password trống, các cột khác đúng dữ
   liệu thật → sửa 1 dòng (vd đổi Server), để nguyên Password trống →
   nộp lại qua "Nhập hàng loạt" → dòng đó cập nhật đúng Server mới, kiểm
   tra kết nối vẫn thành công (mật khẩu không đổi).

## File thay đổi

- `etl/lib/dataSourcesImport.js` — thêm `exportDataSourcesPlain()`, sửa
  `parseDataSourcesFile()`/`upsertDataSources()` chấp nhận Password trống.
- `etl/routes/admin/dataSources.js` — route `GET /export-plain` mới, sửa
  `/import` dùng `blockedRows`/`resolvedPasswords`.
- `etl-admin/src/pages/DataSourcesPage.jsx` — nút "Xuất Excel" mới, cập
  nhật ghi chú.
