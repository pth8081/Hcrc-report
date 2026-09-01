// jobs/cleanupHmacSignatures.js — Xoá dòng admin.HmacUsedSignatures đã hết
// hạn (ExpiresAt < hiện tại) — chống phát lại (replay) chữ ký HMAC, xem
// lib/hmacAuth.js. Chạy theo chu kỳ RIÊNG (5 phút, khớp TOLERANCE_SECONDS)
// trong server.js, KHÔNG gộp vào lịch dọn hằng ngày (jobs/cleanupAuditLog.js)
// vì vòng đời các dòng này ngắn hơn nhiều.
const { sql, getPool } = require('../db');

async function cleanupHmacSignatures() {
  const pool = await getPool('ADMIN');
  const result = await pool.request()
    .input('now', sql.DateTime2, new Date())
    .query('DELETE FROM admin.HmacUsedSignatures WHERE ExpiresAt < @now');
  if (result.rowsAffected[0] > 0) {
    console.log(`🧹 Đã dọn ${result.rowsAffected[0]} chữ ký HMAC hết hạn (chống phát lại).`);
  }
}

module.exports = { cleanupHmacSignatures };
