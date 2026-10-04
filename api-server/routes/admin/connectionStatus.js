// routes/admin/connectionStatus.js — Trang "Trạng thái kết nối" (bản 8.57) —
// mirror ĐÚNG etl/routes/admin/connectionStatus.js, áp dụng cho
// api.DataSources. Xem chú thích đầy đủ ở bản etl.
const express = require('express');
const { getPool } = require('../../db');
const { requireAdminAuth } = require('../../lib/adminAuth');
const { requireMenuAccess } = require('../../lib/adminPermissions');
const { checkAllConnections } = require('../../lib/connectionHealthChecker');
const { logAction } = require('../../lib/auditLog');

const router = express.Router();
router.use(requireAdminAuth, requireMenuAccess('connection-status'));

async function loadStatusList() {
  const pool = await getPool('ADMIN');
  const result = await pool.request().query(`
    SELECT ds.Id AS id, ds.Name AS name, ds.Server AS server, ds.Port AS port,
           s.IsConnected AS isConnected, s.ErrorMessage AS errorMessage, s.LastCheckedAt AS lastCheckedAt
    FROM api.DataSources ds
    LEFT JOIN api.DataSourceConnectionStatus s ON s.DataSourceId = ds.Id
    WHERE ds.IsActive = 1
    ORDER BY ds.Name
  `);
  return result.recordset.map(r => ({
    ...r,
    isConnected: r.isConnected === null ? null : !!r.isConnected,
    lastCheckedAt: r.lastCheckedAt ? r.lastCheckedAt.toISOString() : null
  }));
}

router.get('/', async (req, res, next) => {
  try {
    res.json(await loadStatusList());
  } catch (err) { next(err); }
});

router.post('/check-now', async (req, res, next) => {
  try {
    await checkAllConnections();
    const rows = await loadStatusList();
    await logAction(req, { module: 'Trạng thái kết nối', actionType: 'KIEM_TRA_LAI', description: `Kiểm tra lại thủ công ${rows.length} nguồn dữ liệu` });
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
