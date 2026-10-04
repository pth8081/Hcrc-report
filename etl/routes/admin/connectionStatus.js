// routes/admin/connectionStatus.js — Trang "Trạng thái kết nối" (bản 8.57,
// theo yêu cầu người dùng): xem NGAY kết quả kết nối đã lưu của MỌI
// etl.DataSources — job nền (etl/server.js, mỗi 15 phút, xem
// lib/connectionHealthChecker.js) đã kiểm tra sẵn, trang chỉ đọc lại, không
// phải đợi tạo 30+ kết nối thật mỗi lần vào trang. Nút "Kiểm tra lại ngay"
// (POST /check-now) ép chạy lại NGAY LẬP TỨC — dùng ĐÚNG hàm checkAllConnections()
// y hệt job nền, không viết lại logic lần 2.
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
    FROM etl.DataSources ds
    LEFT JOIN etl.DataSourceConnectionStatus s ON s.DataSourceId = ds.Id
    WHERE ds.IsActive = 1
    ORDER BY ds.Name
  `);
  return result.recordset.map(r => ({
    ...r,
    // null = CHƯA kiểm tra lần nào (job nền chưa kịp chạy lượt đầu, hoặc
    // nguồn vừa tạo) — giữ nguyên null, KHÔNG ép về true/false, để giao
    // diện phân biệt rõ "chưa rõ" với "đã kiểm tra, đang mất kết nối".
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
