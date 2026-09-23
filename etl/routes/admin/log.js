// routes/admin/log.js — Trang "Log": etl.SystemLog (nhật ký vận hành
// chung — bắt đầu/thành công/thất bại từng lượt đồng bộ ghi qua
// logInfo/logWarn/logError trong jobs/runSync.js, kết nối CSDL/nguồn dữ
// liệu thành công/thất bại, cảnh báo cấu hình — xem lib/systemLog.js), phân
// trang, lọc theo mức độ.
//
// TRƯỚC ĐÂY có thêm route GET '/' đọc riêng etl.SyncLog (lượt chạy job) để
// vẽ 1 bảng RIÊNG trên cùng trang — bỏ hẳn (không phải chỉ ẩn) vì gây rối
// khi dùng (2 bảng + 2 bộ tab lọc chồng nhau, dễ nhầm đang lọc bảng nào —
// phản hồi thực tế từ người dùng). Mọi thông tin quan trọng của etl.SyncLog
// (bắt đầu/kết quả/lỗi từng job) giờ CŨNG được ghi vào etl.SystemLog qua
// logInfo/logWarn/logError, nên gộp về 1 bảng duy nhất không mất thông tin.
// etl.SyncLog + bảng của nó vẫn giữ nguyên (Dashboard "Đồng bộ gần đây" đọc
// trực tiếp, xem routes/admin/dashboard.js) — chỉ bỏ route/giao diện xem nó
// RIÊNG trên trang Log.
const express = require('express');
const { sql, getPool } = require('../../db');
const { requireAdminAuth } = require('../../lib/adminAuth');
const { requireMenuAccess } = require('../../lib/adminPermissions');

const router = express.Router();
router.use(requireAdminAuth);

// GET /admin/log/system — etl.SystemLog, lọc theo mức độ, phân trang.
router.get('/system', requireMenuAccess('log'), async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const request = pool.request();
    const conditions = [];

    if (req.query.level) {
      request.input('level', sql.VarChar(10), req.query.level);
      conditions.push('Level = @level');
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(Math.max(1, parseInt(req.query.pageSize, 10) || 50), 500);
    request.input('offset', sql.Int, (page - 1) * pageSize);
    request.input('pageSize', sql.Int, pageSize);

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await request.query(`
      SELECT Id, Level, Message, CreatedAt
      FROM etl.SystemLog
      ${where}
      ORDER BY CreatedAt DESC, Id DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);
    res.json({ page, pageSize, rows: result.recordset });
  } catch (err) { next(err); }
});

module.exports = router;
