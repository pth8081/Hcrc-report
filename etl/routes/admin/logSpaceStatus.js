// routes/admin/logSpaceStatus.js — Trang "Giám sát Log CSDL" (bản 10.5,
// theo yêu cầu người dùng, sau sự cố thật HCRC_DWH log đầy chiếm hết ổ đĩa):
// xem NGAY kết quả kiểm tra dung lượng transaction log đã lưu — job nền
// (etl/server.js, mỗi 15 phút, xem lib/logSpaceMonitor.js) đã kiểm tra sẵn,
// trang chỉ đọc lại. Nút "Kiểm tra lại ngay" (POST /check-now) ép chạy lại
// NGAY LẬP TỨC — dùng ĐÚNG checkAllLogSpace() y hệt job nền.
const express = require('express');
const { getPool } = require('../../db');
const { requireAdminAuth } = require('../../lib/adminAuth');
const { requireMenuAccess } = require('../../lib/adminPermissions');
const { checkAllLogSpace } = require('../../lib/logSpaceMonitor');
const { logAction } = require('../../lib/auditLog');

const router = express.Router();
router.use(requireAdminAuth, requireMenuAccess('log-space-status'));

async function loadStatusList() {
  const pool = await getPool('ADMIN');
  const result = await pool.request().query(`
    SELECT ConnectionKey AS connectionKey, DisplayName AS displayName, IsOk AS isOk,
           ErrorMessage AS errorMessage, TotalLogSizeMB AS totalLogSizeMb, UsedLogPercent AS usedLogPercent,
           IsOverThreshold AS isOverThreshold, LastCheckedAt AS lastCheckedAt
    FROM etl.LogSpaceStatus
    ORDER BY IsOverThreshold DESC, DisplayName
  `);
  return result.recordset.map(r => ({
    ...r,
    isOk: !!r.isOk,
    isOverThreshold: !!r.isOverThreshold,
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
    await checkAllLogSpace();
    const rows = await loadStatusList();
    await logAction(req, { module: 'Giám sát Log CSDL', actionType: 'KIEM_TRA_LAI', description: `Kiểm tra lại thủ công ${rows.length} kết nối` });
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
