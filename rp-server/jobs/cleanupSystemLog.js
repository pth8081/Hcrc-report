// jobs/cleanupSystemLog.js — Xoá dòng app.SystemLog cũ hơn
// SYSTEM_LOG_RETENTION_DAYS (mặc định 90) — bảng này ghi ở MỌI lần kết nối
// CSDL thành công (lib/systemLog.js), phình nhanh hơn cả AuditLog. Cùng
// khuôn cleanupAuditLog.js/etl/jobs/cleanupLogs.js. Chạy theo lịch trong
// server.js.
const { sql, getPool } = require('../db');

async function cleanupSystemLog() {
  const days = parseInt(process.env.SYSTEM_LOG_RETENTION_DAYS || '90', 10);
  const pool = await getPool('RP');
  const result = await pool.request()
    .input('cutoff', sql.DateTime2, new Date(Date.now() - days * 24 * 60 * 60 * 1000))
    .query('DELETE FROM app.SystemLog WHERE CreatedAt < @cutoff');
  console.log(`🧹 Đã dọn ${result.rowsAffected[0]} dòng SystemLog cũ hơn ${days} ngày.`);
}

module.exports = { cleanupSystemLog };
