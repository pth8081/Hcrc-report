// jobs/cleanupAuditLog.js — Xoá dòng admin.AuditLog cũ hơn
// AUDIT_LOG_RETENTION_DAYS (mặc định 90) — log THAO TÁC admin, khác
// api.RequestLog (jobs/cleanupRequestLog.js, log GỌI API của đối tác
// ngoài, đã có dọn riêng). Chạy theo lịch trong server.js.
const { sql, getPool } = require('../db');

async function cleanupAuditLog() {
  const days = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '90', 10);
  const pool = await getPool('ADMIN');
  const result = await pool.request()
    .input('cutoff', sql.DateTime2, new Date(Date.now() - days * 24 * 60 * 60 * 1000))
    .query('DELETE FROM admin.AuditLog WHERE CreatedAt < @cutoff');
  console.log(`🧹 Đã dọn ${result.rowsAffected[0]} dòng AuditLog cũ hơn ${days} ngày.`);
}

module.exports = { cleanupAuditLog };
