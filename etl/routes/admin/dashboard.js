// routes/admin/dashboard.js — Tổng hợp tình trạng đồng bộ: số job, job lỗi
// trong 24h qua, các lượt chạy gần nhất, mốc đồng bộ hiện tại của từng job.
const express = require('express');
const { getPool } = require('../../db');
const { requireAdminAuth } = require('../../lib/adminAuth');

const router = express.Router();
router.use(requireAdminAuth);

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');

    const totals = await pool.request().query(`
      SELECT
        (SELECT COUNT(*) FROM etl.SyncJobs) AS TotalJobs,
        (SELECT COUNT(*) FROM etl.SyncJobs WHERE IsActive = 1) AS ActiveJobs,
        (SELECT COUNT(*) FROM etl.DataSources WHERE IsActive = 1) AS ActiveSources
    `);

    const failingLast24h = await pool.request().query(`
      SELECT j.Id, j.Name, l.ErrorMessage, l.StartedAt
      FROM etl.SyncLog l JOIN etl.SyncJobs j ON l.SyncJobId = j.Id
      WHERE l.Status = 'FAILED' AND l.StartedAt > DATEADD(HOUR, -24, SYSUTCDATETIME())
      ORDER BY l.StartedAt DESC
    `);

    const recentRuns = await pool.request().query(`
      SELECT TOP 20 j.Name AS JobName, l.Status, l.RowCount, l.StartedAt, l.FinishedAt
      FROM etl.SyncLog l JOIN etl.SyncJobs j ON l.SyncJobId = j.Id
      ORDER BY l.StartedAt DESC
    `);

    const jobs = await pool.request().query(`
      SELECT j.Id, j.Name, j.Type, j.CronExpression, j.IsActive, s.LastSyncedAt
      FROM etl.SyncJobs j LEFT JOIN etl.SyncState s ON s.SyncJobId = j.Id
      ORDER BY j.Name
    `);

    res.json({
      totals: totals.recordset[0],
      failingLast24h: failingLast24h.recordset,
      recentRuns: recentRuns.recordset,
      jobs: jobs.recordset
    });
  } catch (err) { next(err); }
});

module.exports = router;
