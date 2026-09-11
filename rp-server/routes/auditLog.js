// routes/auditLog.js — Trang "Log": xem app.AuditLog, chỉ đọc, lọc theo
// username/module/khoảng thời gian, có phân trang.
const express = require('express');
const { sql, getPool } = require('../db');
const { requireAuth, requireMenuAccess } = require('../lib/auth');

const router = express.Router();
router.use(requireAuth, requireMenuAccess('system-audit-log'));

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const request = pool.request();
    const conditions = [];

    if (req.query.username) {
      request.input('username', sql.NVarChar(50), req.query.username);
      conditions.push('Username = @username');
    }
    if (req.query.module) {
      request.input('module', sql.VarChar(50), req.query.module);
      conditions.push('Module = @module');
    }
    if (req.query.from) {
      request.input('from', sql.DateTime2, new Date(req.query.from));
      conditions.push('CreatedAt >= @from');
    }
    if (req.query.to) {
      request.input('to', sql.DateTime2, new Date(req.query.to));
      conditions.push('CreatedAt <= @to');
    }

    // Math.max(1, ...) chặn page/pageSize âm/0/NaN (query param không hợp
    // lệ) tạo ra OFFSET âm hoặc NaN — trước đây rơi thẳng vào SQL, trả 500
    // thô thay vì tự về giá trị mặc định hợp lệ.
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(Math.max(1, parseInt(req.query.pageSize, 10) || 50), 500);
    request.input('offset', sql.Int, (page - 1) * pageSize);
    request.input('pageSize', sql.Int, pageSize);

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await request.query(`
      SELECT Id, Username, Module, ActionType, TargetObject, Description, IpAddress, Status, CreatedAt
      FROM app.AuditLog
      ${where}
      ORDER BY CreatedAt DESC, Id DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);
    res.json({ page, pageSize, rows: result.recordset });
  } catch (err) { next(err); }
});

module.exports = router;
