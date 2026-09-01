// routes/admin/dashboard.js — Tổng hợp tình trạng đồng bộ: số job, job lỗi
// trong 24h qua, các lượt chạy gần nhất, mốc đồng bộ hiện tại của từng job.
// "Từng job" kèm LastRunStatus/IsOverdue (isJobOverdue — cùng hàm dùng ở
// lib/syncStatus.js cho cột "Đồng bộ" trên trang Nguồn dữ liệu, tránh viết
// lại logic ước lượng chu kỳ cron) để etl-admin lọc "Đang lỗi"/"Quá hạn"
// ngay trên Dashboard khi danh sách job dài (nhiều chục kết nối).
const express = require('express');
const { getPool } = require('../../db');
const { requireAdminAuth, blockTargetImporter } = require('../../lib/adminAuth');
const { isJobOverdue } = require('../../lib/syncStatus');

const router = express.Router();
router.use(requireAdminAuth);

// blockTargetImporter — trả về tên/lỗi/CronExpression của mọi job đồng bộ
// hạ tầng, vai trò 'target_importer' không được xem dù gọi thẳng API — xem
// chú thích ở lib/adminAuth.js.
router.get('/', blockTargetImporter, async (req, res, next) => {
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

    const jobsResult = await pool.request().query(`
      SELECT j.Id, j.Name, j.Type, j.CronExpression, j.IsActive, s.LastSyncedAt,
             l.Status AS LastRunStatus, l.ErrorMessage AS LastRunError, l.StartedAt AS LastRunAt
      FROM etl.SyncJobs j
      LEFT JOIN etl.SyncState s ON s.SyncJobId = j.Id
      OUTER APPLY (
        SELECT TOP 1 Status, ErrorMessage, StartedAt
        FROM etl.SyncLog WHERE SyncJobId = j.Id ORDER BY StartedAt DESC
      ) l
      ORDER BY j.Name
    `);
    const now = Date.now();
    const jobs = jobsResult.recordset.map(j => ({
      ...j,
      IsOverdue: !!j.IsActive && isJobOverdue({ LastRunAt: j.LastRunAt, CronExpression: j.CronExpression }, now)
    }));

    res.json({
      totals: totals.recordset[0],
      failingLast24h: failingLast24h.recordset,
      recentRuns: recentRuns.recordset,
      jobs
    });
  } catch (err) { next(err); }
});

module.exports = router;
