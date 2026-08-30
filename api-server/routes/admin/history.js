// routes/admin/history.js — "Lịch sử": api.RequestLog, chỉ đọc, lọc theo
// đối tác/endpoint/khoảng thời gian, có phân trang.
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

    if (req.query.consumerId) {
      request.input('consumerId', sql.Int, req.query.consumerId);
      conditions.push('l.ConsumerId = @consumerId');
    }
    if (req.query.endpoint) {
      request.input('endpoint', sql.VarChar(200), `%${req.query.endpoint}%`);
      conditions.push('l.Endpoint LIKE @endpoint');
    }
    if (req.query.from) {
      request.input('from', sql.DateTime2, new Date(req.query.from));
      conditions.push('l.RequestedAt >= @from');
    }
    if (req.query.to) {
      request.input('to', sql.DateTime2, new Date(req.query.to));
      conditions.push('l.RequestedAt <= @to');
    }

    const page = parseInt(req.query.page || '1', 10);
    const pageSize = Math.min(parseInt(req.query.pageSize || '50', 10), 500);
    request.input('offset', sql.Int, (page - 1) * pageSize);
    request.input('pageSize', sql.Int, pageSize);

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await request.query(`
      SELECT l.Id, l.Endpoint, l.Method, l.StatusCode, l.DurationMs, l.IpAddress, l.RequestedAt,
             c.Name AS ConsumerName
      FROM api.RequestLog l LEFT JOIN api.ApiConsumers c ON l.ConsumerId = c.Id
      ${where}
      ORDER BY l.RequestedAt DESC, l.Id DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);
    res.json({ page, pageSize, rows: result.recordset });
  } catch (err) { next(err); }
});

module.exports = router;
