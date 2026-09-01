// routes/admin/log.js — Trang "Log": etl.SyncLog, lọc theo job/trạng thái,
// phân trang.
const express = require('express');
const { sql, getPool } = require('../../db');
const { requireAdminAuth, blockTargetImporter } = require('../../lib/adminAuth');

const router = express.Router();
router.use(requireAdminAuth);

// blockTargetImporter — trả về JobName (etl.SyncJobs) tiết lộ tên/nguồn các
// job đồng bộ hạ tầng, vai trò 'target_importer' (chỉ nên thấy trang "Nhập
// chỉ tiêu") không được xem dù gọi thẳng API — xem chú thích ở lib/adminAuth.js.
router.get('/', blockTargetImporter, async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const request = pool.request();
    const conditions = [];

    if (req.query.syncJobId) {
      request.input('syncJobId', sql.Int, req.query.syncJobId);
      conditions.push('l.SyncJobId = @syncJobId');
    }
    if (req.query.status) {
      request.input('status', sql.VarChar(20), req.query.status);
      conditions.push('l.Status = @status');
    }

    const page = parseInt(req.query.page || '1', 10);
    const pageSize = Math.min(parseInt(req.query.pageSize || '50', 10), 500);
    request.input('offset', sql.Int, (page - 1) * pageSize);
    request.input('pageSize', sql.Int, pageSize);

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await request.query(`
      SELECT l.Id, l.SyncJobId, j.Name AS JobName, l.Status, l.RowCount, l.ErrorMessage, l.StartedAt, l.FinishedAt
      FROM etl.SyncLog l JOIN etl.SyncJobs j ON l.SyncJobId = j.Id
      ${where}
      ORDER BY l.StartedAt DESC, l.Id DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);
    res.json({ page, pageSize, rows: result.recordset });
  } catch (err) { next(err); }
});

module.exports = router;
