// jobs/reportEmailScheduler.js — Đăng ký lịch chạy (node-cron) TỪ
// app.ReportEmailSchedules, nạp lại mỗi 60 giây để phát hiện lịch mới/đổi
// giờ/bật-tắt — cùng khuôn với etl/jobs/scheduler.js (etl.SyncJobs). Mỗi lần
// chạy: tải định nghĩa báo cáo (lib/reportRunner.js), áp bộ lọc của lịch đó
// (lib/reportEmailFilters.js — preset ngày tính lại mỗi lần, không cố định),
// xuất Excel/PDF, gửi email đính kèm (lib/mailer.js).
// rescheduleJob(id) cho routes/reportEmailSchedules.js gọi ngay sau khi tạo/
// sửa/xoá/bật-tắt MỘT lịch — ép cập nhật đúng lịch đó, không chờ chu kỳ 60
// giây. runNow(id) cho nút "Gửi ngay" trên giao diện — chạy thật NGAY LẬP
// TỨC (kể cả khi lịch đang tắt), lỗi được NÉM RA cho route trả về người
// dùng thay vì chỉ ghi log, để nút bấm cho phản hồi đúng/sai rõ ràng.
const cron = require('node-cron');
const { sql, getPool } = require('../db');
const { loadDefinition, runDefinition } = require('../lib/reportRunner');
const { exportExcel } = require('../lib/exportExcel');
const { exportPdf } = require('../lib/exportPdf');
const { sendMail } = require('../lib/mailer');
const { resolveFilterValues } = require('../lib/reportEmailFilters');
const { logAction } = require('../lib/auditLog');

const REFRESH_INTERVAL_MS = 60 * 1000;
const scheduledTasks = new Map(); // scheduleId -> { task, cronExpression }
// Lịch đang gửi dở — chặn lượt cron kế tiếp CÙNG lịch chồng lên khi lượt
// trước chưa xong (báo cáo lớn + export + gửi mail có thể lâu hơn chu kỳ
// cron), tránh gửi trùng email cho cùng người nhận VÀ tránh 2 export cùng
// lúc nhân đôi bộ nhớ dùng. Cũng chặn nút "Gửi ngay" đụng lượt cron đang
// chạy — khác ETL (chỉ bỏ qua lặng lẽ), ở đây runNow() NÉM LỖI rõ ràng cho
// người bấm biết, đúng tinh thần "Gửi ngay" luôn phản hồi rõ đúng/sai.
const runningSchedules = new Set(); // scheduleId

async function loadActiveSchedules() {
  const pool = await getPool('RP');
  const result = await pool.request().query('SELECT * FROM app.ReportEmailSchedules WHERE IsActive = 1');
  return result.recordset;
}

async function loadSchedule(id) {
  const pool = await getPool('RP');
  const result = await pool.request().input('id', sql.Int, id).query('SELECT * FROM app.ReportEmailSchedules WHERE Id = @id');
  return result.recordset[0] || null;
}

async function updateRunResult(id, status, errorMessage) {
  const pool = await getPool('RP');
  await pool.request()
    .input('id', sql.Int, id)
    .input('status', sql.VarChar(20), status)
    .input('error', sql.NVarChar(1000), errorMessage || null)
    .query(`
      UPDATE app.ReportEmailSchedules
      SET LastRunAt = SYSUTCDATETIME(), LastStatus = @status, LastError = @error
      WHERE Id = @id
    `);
}

// req giả — logAction chỉ cần req.user.username/req.ip, không có request
// HTTP thật khi job tự chạy theo giờ (khác lúc bấm "Gửi ngay" từ route, nơi
// có req thật của người bấm — route đó tự gọi logAction riêng, KHÔNG qua đây).
const SYSTEM_REQ = { user: { username: 'scheduler' }, ip: null };

async function runSchedule(schedule) {
  try {
    const definition = await loadDefinition(schedule.ReportId);
    if (!definition || !definition.isActive) {
      throw new Error(`Báo cáo "${schedule.ReportId}" không còn tồn tại hoặc đã tắt`);
    }

    const filterValues = resolveFilterValues(schedule.FilterValuesJson, definition.filters);
    const { columns, rows } = await runDefinition(definition, filterValues, { page: 1, pageSize: 5000 });
    const exportDefinition = { ...definition, columns };

    const format = schedule.ExportFormat === 'pdf' ? 'pdf' : 'excel';
    const buffer = format === 'pdf' ? await exportPdf(exportDefinition, rows) : await exportExcel(exportDefinition, rows);
    const filename = `${definition.title}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
    const recipients = schedule.Recipients.split(',').map(s => s.trim()).filter(Boolean);

    await sendMail({
      to: recipients.join(','),
      subject: `[HCRC] ${definition.title} — ${new Date().toLocaleDateString('vi-VN')}`,
      text: `Báo cáo "${definition.title}" gửi tự động theo lịch "${schedule.Name}" (${rows.length} dòng).`,
      attachments: [{ filename, content: buffer }]
    });

    await updateRunResult(schedule.Id, 'SUCCESS', null);
    await logAction(SYSTEM_REQ, {
      module: 'Lịch gửi email báo cáo',
      actionType: 'GUI_TU_DONG',
      targetObject: String(schedule.Id),
      description: `Gửi "${definition.title}" (lịch "${schedule.Name}") tới ${recipients.join(', ')} — ${rows.length} dòng`
    });
  } catch (err) {
    await updateRunResult(schedule.Id, 'FAILED', err.message);
    await logAction(SYSTEM_REQ, {
      module: 'Lịch gửi email báo cáo',
      actionType: 'GUI_TU_DONG',
      targetObject: String(schedule.Id),
      description: `Lỗi gửi lịch "${schedule.Name}" (#${schedule.Id}): ${err.message}`,
      status: 'FAILED'
    });
    throw err;
  }
}

async function runScheduleGuarded(schedule) {
  if (runningSchedules.has(schedule.Id)) {
    throw Object.assign(
      new Error(`Lịch "${schedule.Name}" đang gửi dở từ lượt trước — đợi xong rồi thử lại`),
      { isAlreadyRunning: true }
    );
  }
  runningSchedules.add(schedule.Id);
  try {
    await runSchedule(schedule);
  } finally {
    runningSchedules.delete(schedule.Id);
  }
}

function registerJob(schedule) {
  if (!cron.validate(schedule.CronExpression)) {
    console.error(`⛔ Lịch chạy không hợp lệ cho [${schedule.Name}]: "${schedule.CronExpression}"`);
    return;
  }
  const task = cron.schedule(schedule.CronExpression, () => {
    runScheduleGuarded(schedule).catch(err => {
      if (err.isAlreadyRunning) console.warn(`⏭  ${err.message}`);
      else console.error(`⛔ Lỗi gửi lịch email báo cáo #${schedule.Id}:`, err.message);
    });
  });
  scheduledTasks.set(schedule.Id, { task, cronExpression: schedule.CronExpression });
  console.log(`⏱  [Lịch email #${schedule.Id} — ${schedule.Name}] lịch chạy: ${schedule.CronExpression}`);
}

function unregisterJob(scheduleId) {
  const entry = scheduledTasks.get(scheduleId);
  if (!entry) return;
  entry.task.stop();
  scheduledTasks.delete(scheduleId);
}

async function refresh() {
  const activeSchedules = await loadActiveSchedules();
  const activeIds = new Set(activeSchedules.map(s => s.Id));

  for (const id of scheduledTasks.keys()) {
    if (!activeIds.has(id)) unregisterJob(id);
  }

  for (const schedule of activeSchedules) {
    const existing = scheduledTasks.get(schedule.Id);
    if (!existing || existing.cronExpression !== schedule.CronExpression) {
      unregisterJob(schedule.Id);
      registerJob(schedule);
    }
  }
}

async function rescheduleJob(scheduleId) {
  const schedule = await loadSchedule(scheduleId);
  unregisterJob(scheduleId);
  if (schedule && schedule.IsActive) registerJob(schedule);
}

async function runNow(scheduleId) {
  const schedule = await loadSchedule(scheduleId);
  if (!schedule) throw new Error('Không tìm thấy lịch gửi');
  await runScheduleGuarded(schedule);
}

function start() {
  refresh().catch(err => console.error('⛔ Lỗi nạp lịch gửi email báo cáo:', err.message));
  setInterval(
    () => refresh().catch(err => console.error('⛔ Lỗi nạp lại lịch gửi email báo cáo:', err.message)),
    REFRESH_INTERVAL_MS
  );
}

module.exports = { start, rescheduleJob, runNow };
