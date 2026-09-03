// routes/dashboards.js — Xem Dashboard (hướng Power BI, Giai đoạn C — xem
// VERSION.md): danh sách + tiles của 1 dashboard. KHÔNG tự chạy báo cáo ở
// đây — mỗi tile phía rp-user gọi THẲNG GET/POST /api/reports/:reportId(/run)
// đã có sẵn (requireReportAccess riêng, xem routes/reports.js), route này
// chỉ trả "danh sách ô nào, trỏ reportId nào" đã lọc theo đúng quyền báo cáo
// của người gọi — không có đường tắt nào bỏ qua kiểm tra quyền báo cáo chỉ
// vì đi qua dashboard.
const express = require('express');
const { sql, getPool } = require('../db');
const { requireAuth, requireMenuAccess } = require('../lib/auth');

const router = express.Router();
// requireMenuAccess('dashboard') — PHÒNG THỦ CHIỀU SÂU: sidebar (me.menu) đã
// ẩn mục "Dashboard" khỏi vai trò không có quyền, nhưng route API vẫn phải
// tự kiểm tra lại (gọi thẳng API bỏ qua giao diện) — cùng khuôn mọi route
// /system/* khác.
router.use(requireAuth, requireMenuAccess('dashboard'));

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const result = await pool.request().query('SELECT DashboardId, Title FROM app.Dashboards WHERE IsActive = 1 ORDER BY Title');
    res.json(result.recordset);
  } catch (err) { next(err); }
});

router.get('/:dashboardId', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const result = await pool.request().input('dashboardId', sql.VarChar(80), req.params.dashboardId)
      .query('SELECT Title, DefinitionJson FROM app.Dashboards WHERE DashboardId = @dashboardId AND IsActive = 1');
    if (!result.recordset.length) return res.status(404).json({ error: 'Không tìm thấy dashboard' });

    const { Title, DefinitionJson } = result.recordset[0];
    const definition = JSON.parse(DefinitionJson);
    // req.userContext do requireMenuAccess() gán sẵn (xem lib/auth.js) —
    // LOẠI HẲN ô nào role không có quyền xem báo cáo tương ứng (thay vì để
    // rp-user tự gọi /run rồi nhận 403 mới biết) — người dùng chỉ thấy đúng
    // các ô mình được xem, không có "ô lỗi" gây khó hiểu trên giao diện.
    const { isSystemRole, reportIds } = req.userContext;
    const visibleTiles = (definition.tiles || []).filter(t => isSystemRole || reportIds.has(t.reportId));
    res.json({ title: Title, tiles: visibleTiles });
  } catch (err) { next(err); }
});

module.exports = router;
