// routes/admin/auditLog.js — Trang "Nhật ký thao tác": xem admin.AuditLog
// (ai làm gì — khác routes/admin/log.js là etl.SyncLog, log CHẠY JOB tự
// động), chỉ đọc, lọc theo username/module/khoảng thời gian, có phân trang.
const express = require('express');
const { sql, getPool } = require('../../db');
const { requireAdminAuth } = require('../../lib/adminAuth');
const { requireMenuAccess } = require('../../lib/adminPermissions');

const router = express.Router();
router.use(requireAdminAuth);

// requireMenuAccess('audit-log') — vai trò không được cấp trang này (vd
// 'target_importer' cũ) không đọc được nhật ký thao tác của người khác dù
// gọi thẳng API — xem lib/adminPermissions.js.
router.get('/', requireMenuAccess('audit-log'), async (req, res, next) => {
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
    // isNaN(getTime()) chặn ngày không hợp lệ (vd chuỗi gõ tay sai định
    // dạng) tạo ra Invalid Date rơi thẳng vào SQL Server — trước đây trả
    // 500 thô thay vì 400 sạch.
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
      FROM admin.AuditLog
      ${where}
      ORDER BY CreatedAt DESC, Id DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);
    res.json({ page, pageSize, rows: result.recordset });
  } catch (err) { next(err); }
});

module.exports = router;
