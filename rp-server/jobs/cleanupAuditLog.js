// jobs/cleanupAuditLog.js — Xoá dòng app.AuditLog cũ hơn
// AUDIT_LOG_RETENTION_DAYS (mặc định 90) — bảng này ghi mọi thao tác cấu
// hình admin CỘNG CẢ lịch sử gửi email tự động (mỗi lần gửi thành công/lỗi,
// xem jobs/reportEmailScheduler.js), phình nhanh hơn nếu không dọn định kỳ.
// Cùng khuôn với api-server/jobs/cleanupAuditLog.js/cleanupRequestLog.js.
// Chạy theo lịch trong server.js.
const { sql, getPool } = require('../db');

async function cleanupAuditLog() {
  const days = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '90', 10);
  const pool = await getPool('RP');
  const result = await pool.request()
    .input('cutoff', sql.DateTime2, new Date(Date.now() - days * 24 * 60 * 60 * 1000))
    .query('DELETE FROM app.AuditLog WHERE CreatedAt < @cutoff');
  console.log(`🧹 Đã dọn ${result.rowsAffected[0]} dòng AuditLog cũ hơn ${days} ngày.`);
}

module.exports = { cleanupAuditLog };
