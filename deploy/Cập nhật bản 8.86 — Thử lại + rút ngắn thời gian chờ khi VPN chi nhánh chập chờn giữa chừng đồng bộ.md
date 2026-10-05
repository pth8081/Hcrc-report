# Cập nhật bản 8.86 — Thử lại + rút ngắn thời gian chờ khi VPN chi nhánh chập chờn giữa chừng đồng bộ (ETL)

## Báo cáo của người dùng

3 ảnh chụp:
- Trang "Trạng thái kết nối" (etl-admin): 36 nguồn dữ liệu, chỉ 1 nguồn
  "Mất kết nối" (BRGMart L4 Sài Đồng, "Failed to connect... in 10000ms"),
  35 nguồn còn lại "Kết nối được".
- Trang "Đồng bộ": danh sách job, nhiều job gần đây có dấu đỏ "Lỗi".
- "Job lỗi trong 24h qua": rất nhiều dòng, phần lớn lỗi
  "operation timed out for an unknown reason", vài dòng
  "Mất kết nối nguồn liên tục trong 10 phút (đã thử lại 8 lần) — operation
  timed out for an unknown reason".

Kèm lời nhắn: "Kết nối thông suốt nhưng nhiều job đồng bộ không chạy
được, Bạn có thể tìm hiểu nguyên nhân trong code xem lấy dữ liệu đông bộ
ntn được không? hệ thống của tôi dùng vpn và tool của dsmart16 vẫn đồng bộ
từ các siêu thị về trung tâm (đang có bc trung tâm đều có số). Bạn xem có
thay đổi cơ chế động bộ dữ liệu sao cho nhanh hơn và kết nối đảm bảo lấy
dữ liệu liên tục nếu chưa được cho đến khi chuyển sang lịch lấy dữ liệu
định kỳ được không?"

## Nguyên nhân

Đọc kỹ `etl/jobs/runSync.js`, `etl/lib/dataSourcePool.js`,
`etl/lib/dbAdapters/mssql.js` và thư viện `tarn` (pool kết nối dùng bên
trong `mssql`):

1. **Trang "Trạng thái kết nối" mở 1 kết nối NGẮN để kiểm tra rồi đóng
   ngay** (`testConnectionsBatch()`) — khác hẳn job đồng bộ THẬT, vốn giữ
   1 kết nối gộp (pool) LÂU hơn nhiều để chạy cả câu truy vấn. VPN chập
   chờn VÀI GIÂY-VÀI PHÚT (không mất hẳn) thường đủ để kết nối NGẮN qua
   lọt (trang báo "Kết nối được") nhưng đủ làm TREO 1 câu truy vấn đang
   chạy dở giữa chừng trên kết nối DÀI của job thật.
2. **TRƯỚC bản này, MỌI job dùng CHUNG thời gian chờ mỗi truy vấn
   (`requestTimeout`) là 10 PHÚT** — giá trị này được đặt (bản cũ) cho
   đúng 1 trường hợp: job "Lịch sử" chạy LẦN ĐẦU, đọc 1 VIEW gộp hàng chục
   triệu dòng không lọc ngày, THẬT SỰ cần nhiều phút. Áp dụng y hệt cho
   job "(TV)" chỉ đọc vài dòng mới phát sinh mỗi vài phút là QUÁ DÀI — 1
   lượt bị VPN làm treo phải chờ ĐỦ 10 phút mới báo lỗi.
3. **Bản 8.59 (retry kết nối) CỐ Ý không thử lại lỗi xảy ra SAU KHI đã kết
   nối được** — đúng với lỗi dữ liệu/cấu hình (thiếu cột, sai cú pháp SQL,
   KHÔNG tự hết dù thử lại), nhưng SAI với đúng kịch bản VPN chập chờn
   GIỮA CHỪNG câu truy vấn (cũng là lỗi mạng tạm thời, chỉ xảy ra muộn hơn
   1 chút so với lúc mở kết nối). Loại lỗi này trước bản 8.86 KHÔNG được
   thử lại chút nào — thất bại ngay, phải chờ lượt cron kế tiếp.
4. **"operation timed out for an unknown reason"** — thông điệp này đến
   từ `tarn` (thư viện quản lý pool kết nối bên trong `mssql`, file
   `node_modules/tarn/dist/PendingOperation.js`), không phải tedious. Nó
   xuất hiện khi `tarn` không xin được 1 connection rảnh (hoặc không mở
   được connection mới) trong thời gian chờ của chính nó, mà KHÔNG có lỗi
   cụ thể nào từ bên dưới để báo — đúng đặc điểm của "mạng chập chờn, gói
   tin không tới chứ không bị từ chối rõ ràng", khác hẳn thông điệp cụ thể
   "Failed to connect to X:Y in 10000ms" (nguồn từ chối kết nối hẳn, như
   BRGMart L4 Sài Đồng trong ảnh — đó là 1 vấn đề RIÊNG, không phải
   nguyên nhân chính gây ra hàng loạt lỗi "unknown reason" này).

## Đã làm

### 1. `etl/jobs/runSync.js` — rút ngắn thời gian chờ cho lượt ĐỊNH KỲ

```js
function isFirstRun(lastSyncedAt) {
  return lastSyncedAt.getTime() === EPOCH.getTime();
}
const INCREMENTAL_REQUEST_TIMEOUT_MS = parseInt(process.env.DATASOURCE_INCREMENTAL_REQUEST_TIMEOUT_MS || '90000', 10);
function requestTimeoutFor(lastSyncedAt) {
  return isFirstRun(lastSyncedAt) ? undefined : INCREMENTAL_REQUEST_TIMEOUT_MS; // undefined = mặc định dài của adapter
}
```

- Lần chạy ĐẦU TIÊN của MỌI job (kể cả job "(TV)" mới tạo, chưa có mốc
  đồng bộ) — `requestTimeoutFor()` trả về `undefined`, giữ NGUYÊN mặc
  định dài hiện có (`DATASOURCE_REQUEST_TIMEOUT_MS`, 10 phút).
- Lần chạy ĐỊNH KỲ (đã có mốc, chỉ đọc delta nhỏ) — rút còn 90 giây
  (`DATASOURCE_INCREMENTAL_REQUEST_TIMEOUT_MS`, chỉnh được qua `.env`).

### 2. Thử lại NGAY lỗi mạng xảy ra giữa chừng trích xuất (`runTableJob`)

```js
async function extractBatch(currentOffset) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await extractTable(conn, job, lastSyncedAt, { offset: currentOffset, limit: EXTRACT_BATCH_SIZE });
    } catch (err) {
      if (!isTransientNetworkError(err) || attempt >= EXTRACT_RETRY_ATTEMPTS) throw err;
      logWarn(`⏳ [...] Lỗi mạng khi trích xuất lô dữ liệu... — làm mới kết nối, thử lại sau 5s...`);
      await invalidateDataSource(job.DataSourceId);
      await sleep(EXTRACT_RETRY_DELAY_MS);
      conn = await getConnection(job.DataSourceId, { requestTimeout: requestTimeoutFor(lastSyncedAt) });
    }
  }
}
```

- `isTransientNetworkError(err)` phân loại: mã lỗi chuẩn
  (ETIMEOUT/ESOCKET/ECONNRESET/ECONNREFUSED/EHOSTUNREACH/ENETUNREACH/EPIPE),
  `TimeoutError` của `tarn`, hoặc vài chuỗi message quen thuộc khác — lỗi
  dữ liệu/cấu hình thật (thiếu cột, sai cú pháp...) KHÔNG khớp, vẫn ném
  ngay như cũ, không phí thời gian thử lại vô ích.
- Tối đa **3 lần thử, cách nhau 5 giây** — CHỦ Ý ngắn hơn nhiều cửa sổ 10
  phút của bản 8.59 (connect-retry): hàm này chạy BÊN TRONG khoá
  `sp_getapplock`, giữ khoá lâu sẽ chiếm 1 connection của pool 'ADMIN'
  suốt thời gian đó (đúng vấn đề bản 8.59 đã tránh). Hết 3 lần vẫn lỗi →
  ném ra NGOÀI khoá, ghi FAILED + gửi cảnh báo như bình thường — lượt
  cron KẾ TIẾP của chính job đó (2-3 phút sau với job "(TV)") tự thử lại
  từ đầu qua retry 10 phút đã có.
- **`invalidateDataSource()` TRƯỚC mỗi lần thử lại** — không dùng lại
  đúng kết nối đang "kẹt" (lỗi mạng giữa chừng 1 request không có nghĩa
  các request SAU trên CÙNG socket sẽ ổn trở lại ngay).

### 3. `etl/lib/dataSourcePool.js` — 2 "hồ sơ" pool riêng theo requestTimeout

Khoá cache đổi từ `id` trơn sang `"<id>::<requestTimeout>"` — 1 nguồn dữ
liệu giờ có thể có TỐI ĐA 2 pool đang mở song song (lần đầu / định kỳ),
KHÔNG tranh connection lẫn nhau. `invalidate(id)` (gọi khi admin sửa/xoá 1
nguồn, hoặc từ bước 2 ở trên) gỡ ĐỦ CẢ 2 hồ sơ — nơi gọi không cần biết có
bao nhiêu hồ sơ đang mở.

### 4. `etl/lib/dbAdapters/mssql.js` — `createPool()` nhận thêm `requestTimeout`

```js
requestTimeout: config.requestTimeout || DEFAULT_REQUEST_TIMEOUT_MS
```

Không truyền vẫn giữ nguyên mặc định cũ — mọi nơi gọi khác ("Kiểm tra kết
nối", duyệt schema trong `lib/schemaBrowser.js`) không đổi hành vi.

## Đã kiểm chứng

Mock CSDL thật, gọi thẳng `runJob()`/`getConnection()`/`invalidate()` (3
kịch bản, không giả logic đang kiểm thử):

1. Lỗi mạng tạm thời (giả lập `TimeoutError`) xảy ra ở lô dữ liệu đầu tiên
   → thử lại đúng 1 lần, `invalidate()` gọi đúng 1 lần với đúng
   DataSourceId, `getConnection()` lấy lại đúng hồ sơ requestTimeout, lượt
   chạy vẫn ghi **SUCCESS**.
2. Lần chạy ĐẦU TIÊN (chưa có mốc) — `getConnection()` luôn nhận
   `requestTimeout: undefined`, không bị rút ngắn nhầm.
3. Lỗi mạng kéo dài liên tục (quá 3 lần thử nhanh) — dừng ĐÚNG sau lần
   thứ 3, `invalidate()` gọi đúng 2 lần (trước lần 2 và 3), ghi **FAILED**
   + gửi cảnh báo, không treo vô hạn trong lúc giữ khoá.
4. `dataSourcePool.js`: gọi `getConnection()` nhiều lần CÙNG hồ sơ → dùng
   lại ĐÚNG pool cũ (không tạo lại); 2 hồ sơ KHÁC NHAU → 2 pool RIÊNG;
   `invalidate()` đóng đủ cả 2; gọi lại sau `invalidate()` → tạo pool MỚI.

## Các bước triển khai

1. `git pull origin main`.
2. (Tuỳ chọn) Thêm `DATASOURCE_INCREMENTAL_REQUEST_TIMEOUT_MS=90000` vào
   `etl/.env` nếu muốn đổi khác mặc định — bỏ qua vẫn dùng được, đã có
   giá trị mặc định trong code.
3. `pm2 restart hcrc-etl` (BẮT BUỘC — đổi logic lấy kết nối/trích xuất).
4. Kiểm tra: etl-admin → "Đồng bộ" → theo dõi "Job lỗi trong 24h qua" sau
   vài giờ — số lượt lỗi "operation timed out..." giảm rõ rệt; `pm2 logs
   hcrc-etl` thấy dòng "⏳ [...] Lỗi mạng khi trích xuất lô dữ liệu (lần
   N/2): ... — làm mới kết nối, thử lại sau 5s..." xuất hiện khi VPN chập
   chờn (bình thường, không phải lỗi cần xử lý tay) — và phần lớn các
   lượt đó giờ TỰ PHỤC HỒI (ghi SUCCESS) thay vì thất bại hẳn.

## Lưu ý — không giải quyết trường hợp nguồn MẤT KẾT NỐI HẲN

Bản này nhắm đúng vào lỗi "chập chờn giữa chừng" (VPN giật vài giây-vài
phút nhưng vẫn thông). Nguồn **mất kết nối hẳn, kéo dài** (như BRGMart L4
Sài Đồng trong ảnh chụp — "Failed to connect... in 10000ms") vẫn cần kiểm
tra hạ tầng mạng/VPN thật tới đúng chi nhánh đó — không có cơ chế phần
mềm nào "đồng bộ liên tục" được khi đường truyền thật sự không có.

## File thay đổi

- `etl/jobs/runSync.js` — rút ngắn `requestTimeout` cho lượt định kỳ, thử
  lại lỗi mạng tạm thời trong lúc trích xuất.
- `etl/lib/dataSourcePool.js` — cache pool theo cặp (id, requestTimeout),
  `invalidate()` gỡ đủ mọi hồ sơ.
- `etl/lib/dbAdapters/mssql.js` — `createPool()` nhận thêm `requestTimeout`
  tuỳ chọn.
- `etl/.env.example` — thêm `DATASOURCE_INCREMENTAL_REQUEST_TIMEOUT_MS`.
