# Cập nhật bản 8.87 — Chặn bớt số job chạy đồng thời + không bỏ sót lỗi xin khoá (ETL)

## Báo cáo của người dùng

Ảnh chụp `pm2 logs hcrc-etl` sau khi đã lên bản 8.86 (sửa lỗi VPN chi
nhánh chập chờn) — vẫn thấy HÀNG LOẠT dòng đỏ "Lỗi chạy job [...]:
operation timed out for an unknown reason" cho RẤT NHIỀU job khác nhau
(khác chi nhánh, khác domain Doanh thu/Giao dịch), xảy ra gần như ĐỒNG
THỜI, liên tục. Kèm câu hỏi: "Lỗi mà chưa biết nguyên nhân làm sao? Kết
nối vẫn thông" — đúng ý: hiện tượng này rõ ràng không khớp với chẩn đoán
"VPN từng chi nhánh chập chờn" của bản 8.86 (nếu vậy, lỗi phải rải rác
theo từng chi nhánh, không đồng loạt y hệt nhau cùng lúc).

## Nguyên nhân thật — KHÁC bản 8.86

Đọc lại `jobs/scheduler.js` và cách 34 siêu thị "Thành viên" được tạo
(`scripts/seedThanhVienLiveSync.js`):

```js
const LIVE_CRON = '*/2 * * * *'; // áp dụng CHO CẢ 68 job (34 siêu thị × 2 domain)
```

**TẤT CẢ 68 job "(TV)" dùng CHUNG đúng 1 lịch — mỗi 2 phút.** `node-cron`
gọi cả 68 callback GẦN NHƯ ĐỒNG THỜI mỗi lần tới giờ. Mỗi job cần vài lượt
kết nối tới CSDL quản trị ETL (`HCRC_ETL`, pool `'ADMIN'` — **CHUNG cho
TOÀN BỘ hệ thống**, không phải pool riêng của từng chi nhánh) để:

1. Đọc mốc đồng bộ lần trước (`etl.SyncState`).
2. Xin khoá `sp_getapplock` (chống 2 tiến trình ghi chồng cùng lúc).
3. Ghi log kết quả (`etl.SyncLog`).

`db.js` giới hạn pool `'ADMIN'` **mặc định tối đa 5 connection**
(`ADMIN_POOL_MAX=5`) — hợp lý cho tải thông thường của trang quản trị,
nhưng **68 job cùng tranh 5 connection trong vài giây** là quá tải rõ
ràng. Thư viện pool bên trong (`tarn`, cùng loại đã xác định ở bản 8.86)
không xin được connection rảnh kịp thời, báo lỗi **CÙNG thông điệp**
"operation timed out for an unknown reason" — giống hệt lỗi mạng bản
8.86 đã sửa, NHƯNG đây là tranh chấp ở pool `'ADMIN'` dùng chung, **không
liên quan gì tới VPN hay kết nối riêng của bất kỳ chi nhánh nào** — đúng
khớp với quan sát của người dùng ("kết nối vẫn thông").

### Phát hiện thêm — lỗi này trước đây "biến mất", không lên trang quản trị

Rà soát `runWithCrossProcessLock()` (bước xin khoá `sp_getapplock`) phát
hiện: TRƯỚC bản 8.87, bước này (mở pool `'ADMIN'`, mở transaction, chạy
`sp_getapplock`) **không nằm trong bất kỳ `try/catch` nào**. Lỗi xảy ra ở
đây rơi thẳng ra `jobs/scheduler.js`, nơi CHỈ có:

```js
runJobIfNotAlreadyRunning(job).catch(err => console.error(`⛔ Lỗi chạy job [${job.Name}]:`, err.message));
```

— chỉ in `console.error` (pm2 log), **KHÔNG ghi vào `etl.SyncLog`,
KHÔNG gửi mail cảnh báo**, khác hẳn MỌI lỗi khác trong hệ thống (bản
8.59/8.86 đều ghi FAILED + gửi cảnh báo đầy đủ). Đây là lý do những lỗi
này chỉ thấy khi tự soi `pm2 logs` — hoàn toàn không hiện trên trang
"Đồng bộ" của etl-admin, dù lượng lỗi thực tế đang xảy ra rất nhiều.

## Đã làm

### 1. `etl/jobs/scheduler.js` — giới hạn số job chạy đồng thời

```js
const MAX_CONCURRENT_JOBS = parseInt(process.env.ETL_MAX_CONCURRENT_JOBS || '4', 10);
let runningSlotCount = 0;
const slotWaiters = [];

function acquireSlot() {
  if (runningSlotCount < MAX_CONCURRENT_JOBS) { runningSlotCount += 1; return Promise.resolve(); }
  return new Promise(resolve => slotWaiters.push(resolve));
}
function releaseSlot() {
  const next = slotWaiters.shift();
  if (next) next(); else runningSlotCount -= 1;
}

async function runJobIfNotAlreadyRunning(job, options) {
  if (runningJobs.has(job.Id)) { ...bỏ qua như cũ... }
  runningJobs.add(job.Id);
  await acquireSlot();
  try {
    await runJobObject(job, options);
  } finally {
    releaseSlot();
    runningJobs.delete(job.Id);
  }
}
```

- Mặc định **4 job chạy thực sự cùng lúc** — THẤP HƠN `ADMIN_POOL_MAX`
  (5) có chủ đích, chừa dư ít nhất 1 connection cho trang quản trị vẫn
  dùng chung pool `'ADMIN'` trong lúc job đang chạy.
- Job vượt quá **KHÔNG bị bỏ qua** — chỉ xếp hàng (FIFO) chờ tới lượt.
  Mỗi job "(TV)" đọc delta nhỏ thường chỉ mất vài giây, nên hàng đợi tự
  giải quyết nhanh, dư thời gian trước chu kỳ cron 2 phút kế tiếp.
- Áp dụng chung cho cả job chạy theo lịch LẪN nút "Chạy thử".

### 2. `etl/jobs/runSync.js` — không bỏ sót lỗi xin khoá

```js
async function runWithCrossProcessLock(job, fn) {
  const startedAt = new Date();
  let pool, transaction;
  try {
    pool = await getPool('ADMIN');
    transaction = new sql.Transaction(pool);
    await transaction.begin();
  } catch (err) {
    await recordFailure(job, err, startedAt);
    return;
  }
  // ... xin sp_getapplock, cũng bọc try/catch tương tự ...
  try {
    await fn();
  } catch (err) {
    await recordFailure(job, err, startedAt); // fn() tự bắt lỗi của nó rồi — đề phòng lỗi bất thường
  } finally {
    await transaction.commit().catch(err => logError(`... ${err.message}`));
  }
}
```

`recordFailure(job, err, startedAt)` là hàm MỚI, gộp lại logic ghi FAILED
+ gửi cảnh báo trước đây bị LẶP LẠI y hệt ở 3 chỗ khác nhau trong file —
dùng chung đảm bảo MỌI đường lỗi đều xử lý NHẤT QUÁN, không sót chỗ nào.

### 3. `etl/.env.example` — tài liệu biến môi trường mới

```
ETL_MAX_CONCURRENT_JOBS=4
```

Kèm ghi chú: hệ thống có thêm nhiều chi nhánh/job hơn trong tương lai —
nên tăng biến này CÙNG LÚC với `ADMIN_POOL_MAX`, giữ nguyên tỉ lệ chênh
lệch (vài đơn vị) giữa 2 số.

## Đã kiểm chứng

Mock CSDL thật, gọi thẳng `runJob()`/`runJobIfNotAlreadyRunning()`:

1. Giả lập lỗi xin khoá (pool 'ADMIN' quá tải, `transaction.begin()`
   lỗi) → ghi đúng 1 dòng **FAILED** vào `etl.SyncLog` + gửi đúng 1 cảnh
   báo — KHÔNG còn rơi ra ngoài vô hình như trước bản 8.87.
2. Giả lập 20 job KHÁC NHAU kích hoạt đồng thời (mô phỏng đúng kịch bản
   68 job cùng lịch `*/2 * * * *`) — đỉnh điểm CHỈ 4 job chạy cùng lúc
   đúng cấu hình, **CẢ 20 job đều hoàn tất** (xếp hàng đúng, không bỏ sót
   job nào).

## Các bước triển khai

1. `git pull origin main`.
2. (Tuỳ chọn) Thêm `ETL_MAX_CONCURRENT_JOBS=4` vào `etl/.env` nếu muốn
   đổi khác mặc định — bỏ qua vẫn dùng được (có sẵn mặc định trong code).
3. `pm2 restart hcrc-etl` (BẮT BUỘC — đổi logic chạy job/xin khoá).
4. Kiểm tra: `pm2 logs hcrc-etl` sau vài chu kỳ cron (10-15 phút) — không
   còn hàng loạt lỗi "operation timed out" đồng thời như ảnh chụp người
   dùng gửi; nếu THỈNH THOẢNG vẫn còn lỗi xin khoá (hệ thống đang rất
   bận), giờ thấy đúng dòng đó XUẤT HIỆN trên etl-admin → "Đồng bộ" →
   "Job lỗi trong 24h qua" (trước đây hoàn toàn không hiện ở đó).

## Nếu vẫn còn lỗi sau bản này

Hệ thống có thể tiếp tục phát triển thêm nhiều chi nhánh/job hơn 34 siêu
thị hiện tại — khi đó cân nhắc:
- Tăng `ETL_MAX_CONCURRENT_JOBS` + `ADMIN_POOL_MAX` theo cùng tỉ lệ (vd
  8 và 10).
- Giãn lịch `*/2 * * * *` ra nhiều mốc LỆCH nhau giữa các nhóm chi nhánh
  (vd nhóm A chạy phút chẵn, nhóm B chạy phút lẻ) để KHÔNG đồng loạt kích
  hoạt cùng 1 thời điểm — giảm đỉnh điểm tranh chấp ngay từ gốc thay vì
  chỉ xếp hàng chờ.

## File thay đổi

- `etl/jobs/scheduler.js` — thêm giới hạn số job chạy đồng thời
  (`MAX_CONCURRENT_JOBS`/`acquireSlot`/`releaseSlot`).
- `etl/jobs/runSync.js` — bọc `try/catch` đầy đủ quanh bước xin khoá
  `sp_getapplock`, gộp logic ghi FAILED + cảnh báo vào hàm dùng chung
  `recordFailure()`.
- `etl/.env.example` — thêm `ETL_MAX_CONCURRENT_JOBS`.
