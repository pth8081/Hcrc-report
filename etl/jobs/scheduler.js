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

async function runJobIfNotAlreadyRunning(job) {
  if (runningJobs.has(job.Id)) {
    console.warn(`⏭  [${job.Name}] bỏ qua lượt chạy này — lượt trước chưa xong (chạy lâu hơn chu kỳ cron)`);
    return;
  }
  runningJobs.add(job.Id);
  try {
    await runJobObject(job);
  } finally {
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
