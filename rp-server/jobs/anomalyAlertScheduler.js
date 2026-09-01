// jobs/anomalyAlertScheduler.js — Đăng ký lịch chạy (node-cron) cho
// app.AnomalyAlerts, nạp lại mỗi 60 giây (cùng khuôn jobs/reportEmailScheduler.js,
// đơn giản hơn — MỖI cảnh báo đúng 1 CronExpression, không có bảng "giờ chạy"
// con). Mỗi lần chạy: so sánh kỳ hiện tại/kỳ so sánh (lib/anomalyAlertRunner.js)
// — CHỈ gửi email khi có ít nhất 1 dòng vượt ngưỡng (không gửi báo "không có
// gì bất thường" mỗi ngày, tránh người nhận lờn cảnh báo thật).
const cron = require('node-cron');
const { sql, getPool } = require('../db');
const { runAnomalyCheck } = require('../lib/anomalyAlertRunner');
const { renderEmailBodyHtml } = require('../lib/emailBodyRenderer');
const { sendMail } = require('../lib/mailer');
const { logAction } = require('../lib/auditLog');

const REFRESH_INTERVAL_MS = 60 * 1000;
const scheduledTasks = new Map(); // alertId -> { task, cronExpression }
const runningAlerts = new Set(); // alertId

// req giả — logAction chỉ cần req.user.username/req.ip, không có request HTTP
// thật khi job tự chạy theo giờ (khác lúc bấm "Kiểm tra ngay" từ route, nơi
// có req thật của người bấm — route đó tự gọi logAction riêng, KHÔNG qua đây).
const SYSTEM_REQ = { user: { username: 'scheduler' }, ip: null };

const ANOMALY_COLUMNS = [
  { key: 'Entity', label: 'Thực thể' },
  { key: 'GiaTriKyNay', label: 'Kỳ này' },
  { key: 'GiaTriKySoSanh', label: 'Kỳ so sánh' },
  { key: 'ChenhLechPhanTram', label: 'Chênh lệch (%)' },
  { key: 'GhiChu', label: 'Ghi chú' }
];

async function loadActiveAlerts() {
  const pool = await getPool('RP');
  const result = await pool.request().query('SELECT * FROM app.AnomalyAlerts WHERE IsActive = 1');
  return result.recordset;
}

async function loadAlert(id) {
  const pool = await getPool('RP');
  const result = await pool.request().input('id', sql.Int, id).query('SELECT * FROM app.AnomalyAlerts WHERE Id = @id');
  return result.recordset[0] || null;
}

async function updateRunResult(id, status, errorMessage, anomalyCount) {
  const pool = await getPool('RP');
  await pool.request()
    .input('id', sql.Int, id)
    .input('status', sql.VarChar(20), status)
    .input('error', sql.NVarChar(1000), errorMessage || null)
    .input('count', sql.Int, anomalyCount === undefined ? null : anomalyCount)
    .query(`
      UPDATE app.AnomalyAlerts
      SET LastRunAt = SYSUTCDATETIME(), LastStatus = @status, LastError = @error, LastAnomalyCount = @count
      WHERE Id = @id
    `);
}

// Phần LÕI: kiểm tra + gửi mail nếu có bất thường, KHÔNG tự ghi kết quả vào
// DB/log — việc đó do người gọi quyết định (chạy tự động ghi log CHỈ khi có
// bất thường, "Kiểm tra ngay" luôn trả kết quả cho route).
async function runAlert(alert) {
  const { definitionTitle, anomalies } = await runAnomalyCheck(alert);
  if (!anomalies.length) return { anomalyCount: 0 };

  const recipients = alert.Recipients.split(',').map(s => s.trim()).filter(Boolean);
  const html = renderEmailBodyHtml({ title: `⚠️ Cảnh báo bất thường — ${definitionTitle}`, columns: ANOMALY_COLUMNS }, anomalies);
  await sendMail({
    to: recipients.join(','),
    subject: `[HCRC] Cảnh báo bất thường — ${definitionTitle} (${anomalies.length} thực thể)`,
    text: `Phát hiện ${anomalies.length} thực thể lệch quá ${alert.ThresholdPercent}% so với kỳ so sánh. Xem chi tiết trong nội dung email.`,
    html
  });
  return { anomalyCount: anomalies.length, recipients };
}

async function runAlertGuarded(alert) {
  if (runningAlerts.has(alert.Id)) return;
  runningAlerts.add(alert.Id);
  try {
    const { anomalyCount, recipients } = await runAlert(alert);
    await updateRunResult(alert.Id, 'SUCCESS', null, anomalyCount);
    if (anomalyCount) {
      await logAction(SYSTEM_REQ, {
        module: 'Cảnh báo bất thường', actionType: 'PHAT_HIEN_BAT_THUONG', targetObject: String(alert.Id),
        description: `Cảnh báo "${alert.Name}" phát hiện ${anomalyCount} thực thể bất thường, đã gửi tới ${recipients.join(', ')}`
      });
    }
  } catch (err) {
    await updateRunResult(alert.Id, 'FAILED', err.message, null);
    await logAction(SYSTEM_REQ, {
      module: 'Cảnh báo bất thường', actionType: 'PHAT_HIEN_BAT_THUONG', targetObject: String(alert.Id),
      description: `Lỗi kiểm tra cảnh báo "${alert.Name}" (#${alert.Id}): ${err.message}`, status: 'FAILED'
    });
  } finally {
    runningAlerts.delete(alert.Id);
  }
}

function registerAlert(alert) {
  if (!cron.validate(alert.CronExpression)) {
    console.error(`⛔ Lịch không hợp lệ cho cảnh báo [${alert.Name}]: "${alert.CronExpression}"`);
    return;
  }
  const task = cron.schedule(alert.CronExpression, () => {
    runAlertGuarded(alert).catch(err => console.error(`⛔ Lỗi cảnh báo bất thường #${alert.Id}:`, err.message));
  });
  scheduledTasks.set(alert.Id, { task, cronExpression: alert.CronExpression });
  console.log(`⏱  [Cảnh báo bất thường #${alert.Id} — ${alert.Name}] lịch chạy: ${alert.CronExpression}`);
}

function unregisterAlert(id) {
  const entry = scheduledTasks.get(id);
  if (!entry) return;
  entry.task.stop();
  scheduledTasks.delete(id);
}

async function refresh() {
  const alerts = await loadActiveAlerts();
  const activeIds = new Set(alerts.map(a => a.Id));

  for (const id of scheduledTasks.keys()) {
    if (!activeIds.has(id)) unregisterAlert(id);
  }
  for (const alert of alerts) {
    const existing = scheduledTasks.get(alert.Id);
    if (!existing || existing.cronExpression !== alert.CronExpression) {
      unregisterAlert(alert.Id);
      registerAlert(alert);
    }
  }
}

async function rescheduleAlert(id) {
  unregisterAlert(id);
  const alert = await loadAlert(id);
  if (!alert || !alert.IsActive) return;
  registerAlert(alert);
}

// "Kiểm tra ngay" — chạy thật NGAY để thử cấu hình, hoạt động cả khi đang
// tắt. Lỗi được NÉM RA cho route trả về người dùng (khác chạy tự động, chỉ
// ghi log) — bấm nút cần biết ngay đúng/sai.
async function runNow(id) {
  const alert = await loadAlert(id);
  if (!alert) throw new Error('Không tìm thấy cảnh báo');
  if (runningAlerts.has(id)) throw new Error(`Cảnh báo "${alert.Name}" đang kiểm tra dở từ lượt trước — đợi xong rồi thử lại`);
  runningAlerts.add(id);
  try {
    const { anomalyCount } = await runAlert(alert);
    await updateRunResult(id, 'SUCCESS', null, anomalyCount);
    return anomalyCount;
  } catch (err) {
    await updateRunResult(id, 'FAILED', err.message, null);
    throw err;
  } finally {
    runningAlerts.delete(id);
  }
}

function start() {
  refresh().catch(err => console.error('⛔ Lỗi nạp cảnh báo bất thường:', err.message));
  setInterval(
    () => refresh().catch(err => console.error('⛔ Lỗi nạp lại cảnh báo bất thường:', err.message)),
    REFRESH_INTERVAL_MS
  );
}

module.exports = { start, rescheduleAlert, runNow };
