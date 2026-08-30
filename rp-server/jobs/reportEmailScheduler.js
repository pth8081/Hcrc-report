// jobs/reportEmailScheduler.js — Đăng ký lịch chạy (node-cron) TỪ
// app.ReportEmailScheduleTimes (1 lịch app.ReportEmailSchedules có THỂ có
// NHIỀU giờ gửi/ngày, mỗi giờ 1 dòng ở bảng con — vd 07:00 VÀ 17:00), nạp lại
// mỗi 60 giây để phát hiện giờ gửi mới/đổi/xoá hoặc lịch bật-tắt — cùng khuôn
// với etl/jobs/scheduler.js (etl.SyncJobs). Mỗi lần chạy MỘT giờ gửi: tải
// định nghĩa báo cáo (lib/reportRunner.js), áp bộ lọc của lịch đó
// (lib/reportEmailFilters.js — preset ngày tính lại mỗi lần, không cố định),
// xuất Excel/PDF, gửi email đính kèm (lib/mailer.js).
//
// scheduledTasks giờ khoá theo TimeId (Id của app.ReportEmailScheduleTimes),
// KHÔNG phải ScheduleId — 1 lịch có N giờ gửi thì có N cron task độc lập.
// runningSchedules (chặn chồng lượt) vẫn khoá theo ScheduleId — cố ý: 2 giờ
// gửi CÙNG lịch (vd 2 giờ đặt sát nhau, hoặc "Gửi ngay" đụng đúng lúc cron tự
// chạy) chặn lẫn nhau để không gửi trùng email cho cùng người nhận, dù xuất
// phát từ giờ gửi khác nhau.
//
// rescheduleJob(scheduleId) cho routes/reportEmailSchedules.js gọi ngay sau
// khi tạo/sửa (thêm/xoá/đổi giờ gửi)/xoá/bật-tắt MỘT lịch — bỏ đăng ký MỌI
// giờ gửi thuộc lịch đó rồi nạp lại đúng danh sách hiện có, không chờ chu kỳ
// 60 giây. runNow(scheduleId) cho nút "Gửi ngay" — chạy MỘT LẦT bằng đúng cấu
// hình chung của lịch (báo cáo/người nhận/bộ lọc/định dạng), KHÔNG gắn với
// giờ gửi cụ thể nào (không cập nhật LastRunAt của app.ReportEmailScheduleTimes
// nào cả, chỉ cập nhật app.ReportEmailSchedules — xem chú thích cột đó trong
// rp-db/schema.sql) — lỗi được NÉM RA cho route trả về người dùng thay vì chỉ
// ghi log, để nút bấm cho phản hồi đúng/sai rõ ràng.
const cron = require('node-cron');
const { sql, getPool } = require('../db');
const { loadDefinition, runDefinition } = require('../lib/reportRunner');
const { exportExcel } = require('../lib/exportExcel');
const { exportPdf } = require('../lib/exportPdf');
const { sendMail } = require('../lib/mailer');
const { resolveFilterValues } = require('../lib/reportEmailFilters');
const { logAction } = require('../lib/auditLog');

const REFRESH_INTERVAL_MS = 60 * 1000;
const scheduledTasks = new Map(); // timeId -> { task, cronExpression, scheduleId }
const runningSchedules = new Set(); // scheduleId

async function loadActiveOccurrences() {
  const pool = await getPool('RP');
  const result = await pool.request().query(`
    SELECT t.Id AS TimeId, t.CronExpression, s.Id AS ScheduleId, s.Name, s.ReportId, s.Recipients,
           s.FilterValuesJson, s.ExportFormat
    FROM app.ReportEmailScheduleTimes t
    JOIN app.ReportEmailSchedules s ON s.Id = t.ScheduleId
    WHERE s.IsActive = 1
  `);
  return result.recordset;
}

async function loadOccurrencesForSchedule(scheduleId) {
  const pool = await getPool('RP');
  const result = await pool.request().input('scheduleId', sql.Int, scheduleId).query(`
    SELECT t.Id AS TimeId, t.CronExpression, s.Id AS ScheduleId, s.Name, s.ReportId, s.Recipients,
           s.FilterValuesJson, s.ExportFormat
    FROM app.ReportEmailScheduleTimes t
    JOIN app.ReportEmailSchedules s ON s.Id = t.ScheduleId
    WHERE s.Id = @scheduleId
  `);
  return result.recordset;
}

async function loadSchedule(id) {
  const pool = await getPool('RP');
  const result = await pool.request().input('id', sql.Int, id).query('SELECT * FROM app.ReportEmailSchedules WHERE Id = @id');
  return result.recordset[0] || null;
}

async function updateScheduleRunResult(scheduleId, status, errorMessage) {
  const pool = await getPool('RP');
  await pool.request()
    .input('id', sql.Int, scheduleId)
    .input('status', sql.VarChar(20), status)
    .input('error', sql.NVarChar(1000), errorMessage || null)
    .query(`
      UPDATE app.ReportEmailSchedules
      SET LastRunAt = SYSUTCDATETIME(), LastStatus = @status, LastError = @error
      WHERE Id = @id
    `);
}

async function updateTimeRunResult(timeId, status, errorMessage) {
  const pool = await getPool('RP');
  await pool.request()
    .input('id', sql.Int, timeId)
    .input('status', sql.VarChar(20), status)
    .input('error', sql.NVarChar(1000), errorMessage || null)
    .query(`
      UPDATE app.ReportEmailScheduleTimes
      SET LastRunAt = SYSUTCDATETIME(), LastStatus = @status, LastError = @error
      WHERE Id = @id
    `);
}

// req giả — logAction chỉ cần req.user.username/req.ip, không có request
// HTTP thật khi job tự chạy theo giờ (khác lúc bấm "Gửi ngay" từ route, nơi
// có req thật của người bấm — route đó tự gọi logAction riêng, KHÔNG qua đây).
const SYSTEM_REQ = { user: { username: 'scheduler' }, ip: null };

// Phần LÕI: chạy báo cáo + xuất + gửi mail, KHÔNG tự ghi kết quả vào DB/log —
// việc đó do người gọi quyết định (chạy tự động ghi cả giờ gửi lẫn lịch,
// "Gửi ngay" chỉ ghi lịch — xem 2 hàm gọi bên dưới).
async function runSchedule(schedule) {
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

  return { title: definition.title, recipients, rowCount: rows.length };
}

function alreadyRunningError(name) {
  return Object.assign(
    new Error(`Lịch "${name}" đang gửi dở từ lượt trước — đợi xong rồi thử lại`),
    { isAlreadyRunning: true }
  );
}

// Chạy TỰ ĐỘNG (cron trúng giờ) cho MỘT giờ gửi cụ thể — cập nhật kết quả cho
// CẢ giờ gửi đó (app.ReportEmailScheduleTimes) LẪN lịch cha (LastRunAt gộp,
// xem chú thích cột trong rp-db/schema.sql).
async function runOccurrenceGuarded(occurrence) {
  if (runningSchedules.has(occurrence.ScheduleId)) throw alreadyRunningError(occurrence.Name);
  runningSchedules.add(occurrence.ScheduleId);
  try {
    const info = await runSchedule(occurrence);
    await updateTimeRunResult(occurrence.TimeId, 'SUCCESS', null);
    await updateScheduleRunResult(occurrence.ScheduleId, 'SUCCESS', null);
    await logAction(SYSTEM_REQ, {
      module: 'Lịch gửi email báo cáo',
      actionType: 'GUI_TU_DONG',
      targetObject: String(occurrence.ScheduleId),
      description: `Gửi "${info.title}" (lịch "${occurrence.Name}", giờ gửi #${occurrence.TimeId}) tới ${info.recipients.join(', ')} — ${info.rowCount} dòng`
    });
  } catch (err) {
    await updateTimeRunResult(occurrence.TimeId, 'FAILED', err.message);
    await updateScheduleRunResult(occurrence.ScheduleId, 'FAILED', err.message);
    await logAction(SYSTEM_REQ, {
      module: 'Lịch gửi email báo cáo',
      actionType: 'GUI_TU_DONG',
      targetObject: String(occurrence.ScheduleId),
      description: `Lỗi gửi lịch "${occurrence.Name}" (#${occurrence.ScheduleId}, giờ gửi #${occurrence.TimeId}): ${err.message}`,
      status: 'FAILED'
    });
    throw err;
  } finally {
    runningSchedules.delete(occurrence.ScheduleId);
  }
}

function registerOccurrence(occurrence) {
  if (!cron.validate(occurrence.CronExpression)) {
    console.error(`⛔ Giờ gửi không hợp lệ cho [${occurrence.Name} — giờ #${occurrence.TimeId}]: "${occurrence.CronExpression}"`);
    return;
  }
  const task = cron.schedule(occurrence.CronExpression, () => {
    runOccurrenceGuarded(occurrence).catch(err => {
      if (err.isAlreadyRunning) console.warn(`⏭  ${err.message}`);
      else console.error(`⛔ Lỗi gửi lịch email báo cáo #${occurrence.ScheduleId} (giờ #${occurrence.TimeId}):`, err.message);
    });
  });
  scheduledTasks.set(occurrence.TimeId, { task, cronExpression: occurrence.CronExpression, scheduleId: occurrence.ScheduleId });
  console.log(`⏱  [Lịch email #${occurrence.ScheduleId} — ${occurrence.Name}, giờ #${occurrence.TimeId}] lịch chạy: ${occurrence.CronExpression}`);
}

function unregisterOccurrence(timeId) {
  const entry = scheduledTasks.get(timeId);
  if (!entry) return;
  entry.task.stop();
  scheduledTasks.delete(timeId);
}

async function refresh() {
  const occurrences = await loadActiveOccurrences();
  const activeTimeIds = new Set(occurrences.map(o => o.TimeId));

  for (const timeId of scheduledTasks.keys()) {
    if (!activeTimeIds.has(timeId)) unregisterOccurrence(timeId);
  }

  for (const occurrence of occurrences) {
    const existing = scheduledTasks.get(occurrence.TimeId);
    if (!existing || existing.cronExpression !== occurrence.CronExpression) {
      unregisterOccurrence(occurrence.TimeId);
      registerOccurrence(occurrence);
    }
  }
}

async function rescheduleJob(scheduleId) {
  for (const [timeId, entry] of scheduledTasks) {
    if (entry.scheduleId === scheduleId) unregisterOccurrence(timeId);
  }
  const schedule = await loadSchedule(scheduleId);
  if (!schedule || !schedule.IsActive) return;
  const occurrences = await loadOccurrencesForSchedule(scheduleId);
  for (const occurrence of occurrences) registerOccurrence(occurrence);
}

// "Gửi ngay" — dùng thẳng cấu hình chung của lịch (không đi qua giờ gửi cụ
// thể nào), nên chỉ cập nhật LastRunAt/LastStatus/LastError của
// app.ReportEmailSchedules, không đụng app.ReportEmailScheduleTimes.
async function runNow(scheduleId) {
  const schedule = await loadSchedule(scheduleId);
  if (!schedule) throw new Error('Không tìm thấy lịch gửi');
  if (runningSchedules.has(scheduleId)) throw alreadyRunningError(schedule.Name);
  runningSchedules.add(scheduleId);
  try {
    await runSchedule(schedule);
    await updateScheduleRunResult(scheduleId, 'SUCCESS', null);
  } catch (err) {
    await updateScheduleRunResult(scheduleId, 'FAILED', err.message);
    throw err;
  } finally {
    runningSchedules.delete(scheduleId);
  }
}

function start() {
  refresh().catch(err => console.error('⛔ Lỗi nạp lịch gửi email báo cáo:', err.message));
  setInterval(
    () => refresh().catch(err => console.error('⛔ Lỗi nạp lại lịch gửi email báo cáo:', err.message)),
    REFRESH_INTERVAL_MS
  );
}

module.exports = { start, rescheduleJob, runNow };
