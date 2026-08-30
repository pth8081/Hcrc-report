// jobs/cleanupLogs.js — Xoá dòng cũ hơn ngưỡng giữ lại (mặc định 90 ngày,
// riêng cho từng bảng) khỏi etl.SyncLog (log CHẠY JOB, ghi mỗi lượt cron —
// phình nhanh nếu chạy mỗi 15 phút) và admin.AuditLog (log THAO TÁC admin —
// ít dòng hơn nhiều, nhưng cũng không có gì tự dọn nếu không có job này).
// Cùng khuôn với api-server/jobs/cleanupRequestLog.js. Chạy theo lịch trong
// server.js.
const { sql, getPool } = require('../db');

async function cleanupSyncLog() {
  const days = parseInt(process.env.SYNC_LOG_RETENTION_DAYS || '90', 10);
  const pool = await getPool('ADMIN');
  const result = await pool.request()
    .input('cutoff', sql.DateTime2, new Date(Date.now() - days * 24 * 60 * 60 * 1000))
    .query('DELETE FROM etl.SyncLog WHERE StartedAt < @cutoff');
  console.log(`🧹 Đã dọn ${result.rowsAffected[0]} dòng SyncLog cũ hơn ${days} ngày.`);
}

async function cleanupAuditLog() {
  const days = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '90', 10);
  const pool = await getPool('ADMIN');
  const result = await pool.request()
    .input('cutoff', sql.DateTime2, new Date(Date.now() - days * 24 * 60 * 60 * 1000))
    .query('DELETE FROM admin.AuditLog WHERE CreatedAt < @cutoff');
  console.log(`🧹 Đã dọn ${result.rowsAffected[0]} dòng AuditLog cũ hơn ${days} ngày.`);
}

module.exports = { cleanupSyncLog, cleanupAuditLog };
