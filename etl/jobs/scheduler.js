// jobs/scheduler.js — Đăng ký lịch chạy (node-cron) TỪ etl.SyncJobs, nạp lại
// mỗi 60 giây để phát hiện job mới/đổi lịch/bật-tắt — đổi cấu hình trên
// etl-admin/ có hiệu lực trong tối đa 1 phút, không cần khởi động lại tiến
// trình (xem tài liệu kiến trúc "Quản Trị ETL HCRC", mục 06).
// rescheduleJob(id) cho routes/admin/syncJobs.js gọi ngay sau khi tạo/sửa/
// xoá MỘT job — ép cập nhật đúng job đó, không chờ chu kỳ 60 giây.
const cron = require('node-cron');
const { sql, getPool } = require('../db');
const { runJobObject } = require('./runSync');
const { isSchedulerLeader } = require('../lib/clusterLeader');

const REFRESH_INTERVAL_MS = 60 * 1000;
const scheduledTasks = new Map(); // jobId -> { task, cronExpression }
// Job đang chạy dở — chặn lượt cron kế tiếp của CÙNG job chồng lên khi lượt
// trước chưa xong (vd job đọc bảng lớn từ nguồn chậm, chạy lâu hơn cả chu kỳ
// cron của chính nó). Không có bảo vệ này, 2 lượt chạy song song cùng job sẽ
// tranh chấp khoá khi MERGE vào cùng nhóm (SourceSystem, Domain, EntityCode)
// trong dwh.ReportFacts, và cùng cạnh tranh chung 1 pool ghi (DWH_POOL_MAX).
const runningJobs = new Set(); // jobId

// Bản 8.87 (theo yêu cầu người dùng, sau sự cố thật): job "(TV)" của 34
// siêu thị (68 job — Doanh thu + Giao dịch mỗi siêu thị, xem
// scripts/seedThanhVienLiveSync.js:LIVE_CRON) đều chạy CHUNG lịch mỗi 2
// phút (`*/2 * * * *`) — node-cron gọi CẢ 68 callback GẦN NHƯ ĐỒNG THỜI
// mỗi lần tới giờ. Mỗi job cần vài round-trip tới CSDL etl CHUNG (pool
// 'ADMIN', mặc định tối đa 5 connection — xem db.js ADMIN_POOL_MAX) để
// xin khoá sp_getapplock/đọc-ghi mốc đồng bộ/ghi log — 68 job tranh 5
// connection khiến nhiều job phải CHỜ QUÁ LÂU trong hàng đợi riêng của
// pool 'ADMIN' và bị CHÍNH thư viện pool báo lỗi "operation timed out for
// an unknown reason" — side thông điệp GIỐNG HỆT lỗi mạng tới nguồn dữ
// liệu (xem jobs/runSync.js:isTransientNetworkError) nhưng đây là tranh
// chấp ở pool 'ADMIN' DÙNG CHUNG, KHÔNG phải lỗi mạng tới riêng 1 chi
// nhánh — bản 8.86 (rút ngắn/thử lại requestTimeout PER NGUỒN) không sửa
// được trường hợp này, cần CHẶN BỚT SỐ JOB CHẠY ĐỒNG THỜI ngay từ gốc.
//
// Giới hạn còn tối đa MAX_CONCURRENT_JOBS job THỰC SỰ đang chạy cùng lúc
// (mặc định 4 — CHỦ Ý thấp hơn ADMIN_POOL_MAX mặc định 5 ở db.js, chừa dư
// ít nhất 1 connection cho trang quản trị etl-admin/API vẫn dùng CHUNG
// pool 'ADMIN' trong lúc job đang chạy; chỉnh qua .env
// `ETL_MAX_CONCURRENT_JOBS`, nên tăng CÙNG LÚC với ADMIN_POOL_MAX nếu đổi)
// — job vượt quá KHÔNG bị bỏ qua (khác hẳn runningJobs Set ở trên, vốn bỏ
// qua HẲN lượt cron nếu CHÍNH job đó còn đang chạy dở) — chỉ XẾP HÀNG
// (FIFO) chờ tới lượt, thường chỉ vài giây vì mỗi job "(TV)" đọc delta
// nhỏ rất nhanh — xong thừa thời gian trước chu kỳ cron 2 phút kế tiếp.
// Dùng CHUNG cho cả job chạy theo lịch LẪN nút "Chạy thử" (route qua
// runJobIfNotAlreadyRunning — xem module.exports cuối file) — admin bấm
// "Chạy thử" lúc hệ thống đang bận chỉ chờ thêm vài giây, không tranh
// thêm connection ngoài dự tính.
const MAX_CONCURRENT_JOBS = parseInt(process.env.ETL_MAX_CONCURRENT_JOBS || '4', 10);
let runningSlotCount = 0;
const slotWaiters = [];

function acquireSlot() {
  if (runningSlotCount < MAX_CONCURRENT_JOBS) {
    runningSlotCount += 1;
    return Promise.resolve();
  }
  return new Promise(resolve => slotWaiters.push(resolve));
}

function releaseSlot() {
  const next = slotWaiters.shift();
  if (next) next();
  else runningSlotCount -= 1;
}

async function loadActiveJobs() {
  const pool = await getPool('ADMIN');
  const result = await pool.request().query('SELECT * FROM etl.SyncJobs WHERE IsActive = 1');
  return result.recordset;
}

async function loadJob(jobId) {
  const pool = await getPool('ADMIN');
  const result = await pool.request().input('id', sql.Int, jobId).query('SELECT * FROM etl.SyncJobs WHERE Id = @id');
  return result.recordset[0] || null;
}

// options.allowConnectRetry (bản 8.59, mặc định true — xem jobs/runSync.js)
// — truyền false từ routes/admin/syncJobs.js (nút "Chạy thử") để giữ đúng
// hành vi thử 1 lần/báo lỗi ngay, không bắt admin chờ tới 10 phút retry khi
// đang đứng chờ kết quả trên trình duyệt.
async function runJobIfNotAlreadyRunning(job, options) {
  if (runningJobs.has(job.Id)) {
    console.warn(`⏭  [${job.Name}] bỏ qua lượt chạy này — lượt trước chưa xong (chạy lâu hơn chu kỳ cron)`);
    return;
  }
  runningJobs.add(job.Id);
  await acquireSlot();
  try {
    await runJobObject(job, options);
  } finally {
    releaseSlot();
    runningJobs.delete(job.Id);
  }
}

function registerJob(job) {
  if (!cron.validate(job.CronExpression)) {
    console.error(`⛔ Lịch chạy không hợp lệ cho [${job.Name}]: "${job.CronExpression}"`);
    return;
  }
  // timezone: 'Asia/Ho_Chi_Minh' BẮT BUỘC — không truyền, node-cron chạy
  // theo timezone của TIẾN TRÌNH (server production thường đặt UTC), lệch
  // giờ so với lịch admin cấu hình (vd "chạy lúc 2h sáng" ngoài giờ cao
  // điểm — chạy sai giờ mất hết ý nghĩa).
  const task = cron.schedule(job.CronExpression, () => {
    runJobIfNotAlreadyRunning(job).catch(err => console.error(`⛔ Lỗi chạy job [${job.Name}]:`, err.message));
  }, { timezone: 'Asia/Ho_Chi_Minh' });
  scheduledTasks.set(job.Id, { task, cronExpression: job.CronExpression });
  console.log(`⏱  [${job.Name}] lịch chạy: ${job.CronExpression}`);
}

function unregisterJob(jobId) {
  const entry = scheduledTasks.get(jobId);
  if (!entry) return;
  entry.task.stop();
  scheduledTasks.delete(jobId);
}

async function refresh() {
  const activeJobs = await loadActiveJobs();
  const activeIds = new Set(activeJobs.map(j => j.Id));

  for (const jobId of scheduledTasks.keys()) {
    if (!activeIds.has(jobId)) unregisterJob(jobId);
  }

  for (const job of activeJobs) {
    const existing = scheduledTasks.get(job.Id);
    if (!existing || existing.cronExpression !== job.CronExpression) {
      unregisterJob(job.Id);
      registerJob(job);
    }
  }
}

// CHỈ instance leader thật sự đăng ký/huỷ cron (xem lib/clusterLeader.js) —
// đúng dữ liệu ghi vào dwh.ReportFacts ĐÃ được bảo vệ ở mọi trường hợp bởi
// sp_getapplock cấp CSDL trong jobs/runSync.js (không phụ thuộc worker nào
// gọi), nên đây KHÔNG phải sửa lỗi đúng-sai mà là tránh LÃNG PHÍ: không có
// gate này, N worker cùng đăng ký cron cho CÙNG job, tới giờ N worker cùng
// tranh sp_getapplock — chỉ 1 thắng, N-1 còn lại tốn round-trip CSDL +
// rollback + log "bỏ qua" mỗi lượt, vô ích. Worker không phải leader bỏ
// qua — refresh() định kỳ của leader tự nạp lại trong tối đa 60s.
async function rescheduleJob(jobId) {
  if (!isSchedulerLeader()) return;
  const job = await loadJob(jobId);
  unregisterJob(jobId);
  if (job && job.IsActive) registerJob(job);
}

// CHỈ instance leader chạy vòng lặp đăng ký/nạp lại cron (xem chú thích
// rescheduleJob() ở trên).
function start() {
  if (!isSchedulerLeader()) {
    console.log('ℹ️  [Lịch ETL] không phải instance leader (NODE_APP_INSTANCE khác "0") — bỏ qua, để leader phụ trách.');
    return;
  }
  refresh().catch(err => console.error('⛔ Lỗi nạp lịch ETL:', err.message));
  setInterval(
    () => refresh().catch(err => console.error('⛔ Lỗi nạp lại lịch ETL:', err.message)),
    REFRESH_INTERVAL_MS
  );
}

// runJobIfNotAlreadyRunning xuất thêm để routes/admin/syncJobs.js (nút "Chạy
// thử") DÙNG CHUNG cơ chế chống chồng lấn thay vì tự gọi thẳng runJobObject —
// bấm "Chạy thử" trong lúc đúng job đó đang tự động chạy theo lịch cũng
// phải bị chặn, không chỉ 2 lượt cron chồng nhau.
module.exports = { start, rescheduleJob, runJobIfNotAlreadyRunning };
