// routes/admin/log.js — Trang "Log": etl.SyncLog, lọc theo job/trạng thái,
// phân trang.
const express = require('express');
const { sql, getPool } = require('../../db');
const { requireAdminAuth } = require('../../lib/adminAuth');
const { requireMenuAccess } = require('../../lib/adminPermissions');

const router = express.Router();
router.use(requireAdminAuth);

// requireMenuAccess('log') — trả về JobName (etl.SyncJobs) tiết lộ tên/nguồn
// các job đồng bộ hạ tầng, vai trò không được cấp trang này (vd
// 'target_importer' cũ, chỉ nên thấy trang "Nhập chỉ tiêu") không được xem
// dù gọi thẳng API — xem lib/adminPermissions.js.
router.get('/', requireMenuAccess('log'), async (req, res, next) => {
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

    // Math.max(1, ...) chặn page/pageSize âm/0/NaN (query param không hợp
    // lệ) tạo ra OFFSET âm hoặc NaN — trước đây rơi thẳng vào SQL, trả 500
    // thô thay vì tự về giá trị mặc định hợp lệ.
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(Math.max(1, parseInt(req.query.pageSize, 10) || 50), 500);
    request.input('offset', sql.Int, (page - 1) * pageSize);
    request.input('pageSize', sql.Int, pageSize);

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await request.query(`
      SELECT l.Id, l.SyncJobId, j.Name AS JobName, l.Status, l.RowsProcessed AS RowCount, l.ErrorMessage, l.StartedAt, l.FinishedAt
      FROM etl.SyncLog l JOIN etl.SyncJobs j ON l.SyncJobId = j.Id
      ${where}
      ORDER BY l.StartedAt DESC, l.Id DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);
    res.json({ page, pageSize, rows: result.recordset });
  } catch (err) { next(err); }
});

module.exports = router;
