# Cập nhật bản 8.59 — Tự thử lại khi mất kết nối nguồn lúc đồng bộ

## Vấn đề

Sự cố thật ngày 04/10/2026: vài chi nhánh "Thành viên" mất kết nối mạng
tới máy chủ ETL (xem log: "Lỗi đồng bộ: operation timed out for an unknown
reason", "Lỗi kết nối nguồn #33: Failed to connect to 172.16.74.103:1433
in 10000ms"). Cơ chế cũ: job lỗi → ghi log → **bỏ cuộc ngay**, phải đợi
đúng lịch cron kế tiếp (2-15 phút tuỳ job) mới thử lại — nếu mạng chỉ chập
chờn vài giây-vài phút, dữ liệu "Live" bị trễ oan dù lẽ ra chỉ cần thử lại
ngay là được.

Người dùng đề xuất: thử lại cho tới khi đồng bộ được, thay vì đợi đúng
lịch đã đặt. Đã phân tích và thống nhất với người dùng: **KHÔNG** thử lại
vô hạn (rủi ro nếu 1 chi nhánh mất mạng thật sự kéo dài hàng giờ/ngày —
thử mãi vô ích, tốn tài nguyên, dội log) mà thử lại **nhanh dần, có giới
hạn thời gian** — hết giới hạn thì nhường lại đúng lịch cron gốc như cũ.

## Phân tích & quyết định (đã xác nhận với người dùng)

| Câu hỏi | Quyết định |
|---|---|
| Cửa sổ thời gian cho phép thử lại | 10 phút |
| Có cần thông báo riêng khi phải thử lại nhiều lần (không phải bỏ cuộc) | Không — chỉ ghi log như bình thường |
| Phạm vi áp dụng | Mọi Sync Job loại "table" (bao gồm job Live "Thành viên" đang gặp sự cố) |

**Chỉ thử lại lỗi KẾT NỐI** (mạng/timeout tới nguồn) — **không** thử lại
lỗi do cấu hình sai (vd thiếu cột trong VIEW, sai cú pháp SQL). Lý do: lỗi
cấu hình không tự hết dù thử bao nhiêu lần, thử lại chỉ phí thời gian và
khiến admin tưởng nhầm "hệ thống đang tự xử lý" trong khi thực ra cần sửa
tay ngay.

## Thay đổi

### `etl/jobs/runSync.js`

- `getConnectionWithRetry(job, allowRetry=true)` (mới) — thay cho gọi
  thẳng `getConnection(job.DataSourceId)`. Lỗi kết nối → thử lại theo
  backoff `15s → 30s → 60s → 120s` (giữ 120s/lần sau đó), tối đa
  `CONNECT_RETRY_WINDOW_MS` = 10 phút. Hết cửa sổ vẫn lỗi → ném lỗi kèm số
  lần đã thử, để `runJobObject()` ghi nhận 1 lượt THẤT BẠI bình thường.
- **Quan trọng — vị trí gọi hàm này**: đặt **TRƯỚC** khi vào khoá chống
  chạy chồng `sp_getapplock` (`runWithCrossProcessLock()`), không phải bên
  trong. Lý do: khoá đó giữ nguyên 1 kết nối từ pool `ADMIN` (mặc định tối
  đa 5) suốt thời gian chạy — nếu retry nằm trong lúc giữ khoá, nhiều chi
  nhánh cùng mất kết nối 1 lúc (đúng kịch bản đã xảy ra) sẽ giữ tới 10
  phút/job, dễ chiếm hết pool `ADMIN` khiến các job/trang quản trị khác
  không còn kết nối nào dùng. Đặt trước khoá — mỗi lượt thử chỉ chiếm kết
  nối đúng lúc thử (thất bại ngay, không giữ), lúc "ngủ" chờ thử lại không
  giữ bất kỳ kết nối/khoá CSDL nào.
- `runTableJob()` giờ nhận `connection` đã lấy sẵn (tham số mới) thay vì
  tự gọi `getConnection()`.
- `runJobObject(job, { allowConnectRetry })` — tham số mới, mặc định
  `true`. Khi `false`, `getConnectionWithRetry()` chỉ thử **1 lần**, lỗi
  là báo ngay — dùng cho nút "Chạy thử" (xem bên dưới).

### `etl/jobs/scheduler.js`

- `runJobIfNotAlreadyRunning(job, options)` — nhận thêm `options`, truyền
  thẳng xuống `runJobObject()`. Lịch cron tự động (`registerJob()`) gọi
  KHÔNG truyền `options` → dùng mặc định `allowConnectRetry: true`.

### `etl/routes/admin/syncJobs.js`

- `POST /:id/run-now` (nút "Chạy thử") gọi
  `runJobIfNotAlreadyRunning(job, { allowConnectRetry: false })` — admin
  đang chờ ngay trên trình duyệt, giữ đúng hành vi CŨ (thử 1 lần, báo lỗi
  ngay) thay vì bắt chờ tới 10 phút.

### Không đổi

- `lib/connectionHealthChecker.js` (bản 8.57, trang "Trạng thái kết nối")
  — KHÔNG dùng cơ chế này, vẫn kiểm tra 1 lần/lượt như cũ (trang đó cố ý
  cần biết NGAY nguồn nào mất kết nối tại đúng thời điểm kiểm tra, retry ở
  đó sẽ che mất tình trạng thật trong vài phút đầu).
- Email cảnh báo (`lib/mailer.js:alertSyncFailure`) — vẫn CHỈ gửi khi THẬT
  SỰ bỏ cuộc sau 10 phút, không tăng số lượng email so với trước (không
  gửi email mỗi lần thử lại).

## Đã kiểm tra

Mô phỏng lại đúng thuật toán backoff (dùng số liệu thu nhỏ, không đợi
15s-120s thật) ở 3 kịch bản:
1. Lỗi 2 lần rồi thành công — đúng số lần thử + khoảng nghỉ tăng dần.
2. Lỗi liên tục không bao giờ hết — dừng ĐÚNG lúc hết cửa sổ, không chạy
   mãi.
3. Thành công ngay từ đầu — không có độ trễ nào, không ảnh hưởng đường
   thành công bình thường.

## Các bước triển khai

1. `git pull origin main`.
2. `pm2 restart hcrc-etl` (BẮT BUỘC — đổi `jobs/runSync.js`,
   `jobs/scheduler.js`, `routes/admin/syncJobs.js`).
3. Không cần build lại giao diện nào (không đổi etl-admin/api-admin/rp-user).
4. Kiểm tra: theo dõi etl-admin → "Nhật ký hệ thống" (Log) khi có job đang
   lỗi kết nối — sẽ thấy dòng `⏳ [...] Lỗi kết nối nguồn (lần N): ... —
   thử lại sau Xs...` thay vì chỉ 1 dòng lỗi rồi im lặng tới chu kỳ sau.
   Nếu nguồn phục hồi trong vòng 10 phút, job tự chạy thành công mà không
   cần đợi hết chu kỳ cron (2-15 phút tuỳ job).

Không đổi cấu trúc CSDL, không ảnh hưởng job đang chạy ổn định (chỉ job
đang gặp lỗi kết nối mới thấy khác biệt).
