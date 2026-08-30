// jobs/cleanupRequestLog.js — Xoá dòng api.RequestLog cũ hơn
// REQUEST_LOG_RETENTION_DAYS (mặc định 90) — bảng này ghi mỗi lượt gọi API,
// phình to nhanh nếu không dọn định kỳ. Chạy theo lịch trong server.js.
const { sql, getPool } = require('../db');

async function cleanupRequestLog() {
  const days = parseInt(process.env.REQUEST_LOG_RETENTION_DAYS || '90', 10);
  const pool = await getPool('ADMIN');
  const result = await pool.request()
    .input('cutoff', sql.DateTime2, new Date(Date.now() - days * 24 * 60 * 60 * 1000))
    .query('DELETE FROM api.RequestLog WHERE RequestedAt < @cutoff');
  console.log(`🧹 Đã dọn ${result.rowsAffected[0]} dòng RequestLog cũ hơn ${days} ngày.`);
}

module.exports = { cleanupRequestLog };
