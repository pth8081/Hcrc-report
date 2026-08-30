// routes/admin/auditLog.js — Trang "Nhật ký thao tác": xem admin.AuditLog
// (ai làm gì — khác routes/admin/history.js là api.RequestLog, log GỌI API
// của đối tác ngoài), chỉ đọc, lọc theo username/module/khoảng thời gian, có
// phân trang.
const express = require('express');
const { sql, getPool } = require('../../db');
const { requireAdminAuth } = require('../../lib/adminAuth');

const router = express.Router();
router.use(requireAdminAuth);

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
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

    const page = parseInt(req.query.page || '1', 10);
    const pageSize = Math.min(parseInt(req.query.pageSize || '50', 10), 500);
    request.input('offset', sql.Int, (page - 1) * pageSize);
    request.input('pageSize', sql.Int, pageSize);

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await request.query(`
      SELECT Id, Username, Module, ActionType, TargetObject, Description, IpAddress, Status, CreatedAt
      FROM admin.AuditLog
      ${where}
      ORDER BY CreatedAt DESC, Id DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);
    res.json({ page, pageSize, rows: result.recordset });
  } catch (err) { next(err); }
});

module.exports = router;
