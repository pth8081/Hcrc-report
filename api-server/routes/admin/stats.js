// routes/admin/stats.js — "Top truy vấn": tổng hợp trên api.RequestLog theo
// endpoint và theo đối tác, trong khoảng thời gian chọn được (?since=1h|24h|7d).
const express = require('express');
const { sql, getPool } = require('../../db');
const { requireAdminAuth } = require('../../lib/adminAuth');

const router = express.Router();
router.use(requireAdminAuth);

const WINDOW_HOURS = { '1h': 1, '24h': 24, '7d': 24 * 7 };

router.get('/top', async (req, res, next) => {
  try {
    const hours = WINDOW_HOURS[req.query.since] || WINDOW_HOURS['24h'];
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const pool = await getPool('ADMIN');

    const byEndpoint = await pool.request().input('since', sql.DateTime2, since).query(`
      SELECT Endpoint, COUNT(*) AS CallCount, AVG(DurationMs) AS AvgDurationMs
      FROM api.RequestLog WHERE RequestedAt >= @since
      GROUP BY Endpoint ORDER BY CallCount DESC
    `);
    const byConsumer = await pool.request().input('since', sql.DateTime2, since).query(`
      SELECT ISNULL(c.Name, N'(không rõ)') AS ConsumerName, COUNT(*) AS CallCount
      FROM api.RequestLog l LEFT JOIN api.ApiConsumers c ON l.ConsumerId = c.Id
      WHERE l.RequestedAt >= @since
      GROUP BY c.Name ORDER BY CallCount DESC
    `);

    res.json({ since: since.toISOString(), byEndpoint: byEndpoint.recordset, byConsumer: byConsumer.recordset });
  } catch (err) { next(err); }
});

module.exports = router;
