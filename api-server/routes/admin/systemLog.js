// routes/admin/systemLog.js — Trang "Log": xem admin.SystemLog (nhật ký vận
// hành chung — kết nối CSDL thành công/thất bại, lỗi request không bắt được
// ở route cụ thể — xem lib/systemLog.js), phân trang, lọc theo mức độ +
// khoảng thời gian. Khác routes/admin/auditLog.js (admin.AuditLog — AI làm
// gì) và routes/admin/history.js (api.RequestLog — GỌI API của đối tác
// ngoài). Cùng khuôn etl/routes/admin/log.js.
const express = require('express');
const { sql, getPool } = require('../../db');
const { requireAdminAuth } = require('../../lib/adminAuth');
const { requireMenuAccess } = require('../../lib/adminPermissions');

const router = express.Router();
router.use(requireAdminAuth, requireMenuAccess('log'));

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const request = pool.request();
    const conditions = [];

    if (req.query.level) {
      request.input('level', sql.VarChar(10), req.query.level);
      conditions.push('Level = @level');
    }
    if (req.query.from) {
      const from = new Date(req.query.from);
      if (isNaN(from.getTime())) return res.status(400).json({ error: '"from" không phải ngày hợp lệ' });
      request.input('from', sql.DateTime2, from);
      conditions.push('CreatedAt >= @from');
    }
    if (req.query.to) {
      const to = new Date(req.query.to);
      if (isNaN(to.getTime())) return res.status(400).json({ error: '"to" không phải ngày hợp lệ' });
      request.input('to', sql.DateTime2, to);
      conditions.push('CreatedAt <= @to');
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(Math.max(1, parseInt(req.query.pageSize, 10) || 50), 500);
    request.input('offset', sql.Int, (page - 1) * pageSize);
    request.input('pageSize', sql.Int, pageSize);

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await request.query(`
      SELECT Id, Level, Message, CreatedAt
      FROM admin.SystemLog
      ${where}
      ORDER BY CreatedAt DESC, Id DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);
    res.json({ page, pageSize, rows: result.recordset });
  } catch (err) { next(err); }
});

module.exports = router;
