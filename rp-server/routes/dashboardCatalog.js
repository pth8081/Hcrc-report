// routes/dashboardCatalog.js — Trang "Biểu mẫu → Dashboard": CRUD
// app.Dashboards (hướng Power BI, Giai đoạn C — xem VERSION.md). Dùng CHUNG
// quyền với routes/reportCatalog.js ('system-report-catalog') — Dashboard
// chỉ là 1 cách trình bày KHÁC của các báo cáo đã có, không phải khái niệm
// quản trị tách biệt, không cần mục menu/quyền riêng cho trang cấu hình.
const express = require('express');
const { sql, getPool } = require('../db');
const { requireAuth, requireMenuAccess } = require('../lib/auth');
const { logAction } = require('../lib/auditLog');

const router = express.Router();
router.use(requireAuth, requireMenuAccess('system-report-catalog'));

// { key, reportId, title? } x N — validate CẤU TRÚC tối thiểu lúc lưu, y
// hệt tinh thần validateCompositeDefinition (routes/reportCatalog.js): lỗi
// cấu hình lộ ra NGAY lúc admin lưu, không đợi tới lúc người dùng mở
// Dashboard thật mới phát hiện thiếu/sai.
function validateTiles(tiles) {
  if (!Array.isArray(tiles) || !tiles.length) {
    return 'DefinitionJson cần mảng "tiles" (ít nhất 1 ô)';
  }
  const seenKeys = new Set();
  for (const tile of tiles) {
    if (!tile || !tile.key) return 'Mỗi ô trong "tiles" phải có "key"';
    if (seenKeys.has(tile.key)) return `Trùng "key" ô: "${tile.key}"`;
    seenKeys.add(tile.key);
    if (!tile.reportId) return `Ô "${tile.key}" thiếu "reportId"`;
  }
  return null;
}

// Đối chiếu reportId trong tiles với app.ReportCatalog THẬT — tránh Dashboard
// trỏ tới ReportId đã gõ sai/đã xoá mà không ai biết cho tới khi mở trang.
async function assertReportIdsExist(pool, tiles) {
  const reportIds = [...new Set(tiles.map(t => t.reportId))];
  const request = pool.request();
  const placeholders = reportIds.map((id, i) => {
    request.input(`r${i}`, sql.VarChar(80), id);
    return `@r${i}`;
  }).join(', ');
  const result = await request.query(`SELECT ReportId FROM app.ReportCatalog WHERE ReportId IN (${placeholders})`);
  const found = new Set(result.recordset.map(r => r.ReportId));
  const missing = reportIds.filter(id => !found.has(id));
  if (missing.length) return `Không tìm thấy báo cáo: ${missing.join(', ')} — kiểm tra lại "reportId" trong tiles`;
  return null;
}

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const result = await pool.request().query('SELECT DashboardId, Title, DefinitionJson, IsActive FROM app.Dashboards ORDER BY Title');
    res.json(result.recordset);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { dashboardId, title, definitionJson } = req.body || {};
    if (!dashboardId || !title || !definitionJson) {
      return res.status(400).json({ error: 'Thiếu dashboardId/title/definitionJson' });
    }
    const definition = JSON.parse(definitionJson); // validate JSON hợp lệ trước khi lưu
    const tilesError = validateTiles(definition.tiles);
    if (tilesError) return res.status(400).json({ error: tilesError });

    const pool = await getPool('RP');
    const reportIdError = await assertReportIdsExist(pool, definition.tiles);
    if (reportIdError) return res.status(400).json({ error: reportIdError });

    await pool.request()
      .input('dashboardId', sql.VarChar(80), dashboardId)
      .input('title', sql.NVarChar(200), title)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .query(`
        INSERT INTO app.Dashboards (DashboardId, Title, DefinitionJson)
        VALUES (@dashboardId, @title, @definitionJson)
      `);
    await logAction(req, { module: 'Biểu mẫu', actionType: 'TAO_DASHBOARD', targetObject: dashboardId, description: `Tạo dashboard "${title}"` });
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err instanceof SyntaxError) return res.status(400).json({ error: 'definitionJson không phải JSON hợp lệ' });
    if (err.number === 2627 || err.number === 2601) return res.status(409).json({ error: 'DashboardId đã tồn tại' });
    next(err);
  }
});

router.put('/:dashboardId', async (req, res, next) => {
  try {
    const { title, definitionJson, isActive } = req.body || {};
    const definition = JSON.parse(definitionJson);
    const tilesError = validateTiles(definition.tiles);
    if (tilesError) return res.status(400).json({ error: tilesError });

    const pool = await getPool('RP');
    const reportIdError = await assertReportIdsExist(pool, definition.tiles);
    if (reportIdError) return res.status(400).json({ error: reportIdError });

    await pool.request()
      .input('dashboardId', sql.VarChar(80), req.params.dashboardId)
      .input('title', sql.NVarChar(200), title)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .input('isActive', sql.Bit, isActive ? 1 : 0)
      .query(`
        UPDATE app.Dashboards
        SET Title = @title, DefinitionJson = @definitionJson, IsActive = @isActive
        WHERE DashboardId = @dashboardId
      `);
    await logAction(req, { module: 'Biểu mẫu', actionType: 'SUA_DASHBOARD', targetObject: req.params.dashboardId, description: `Cập nhật dashboard "${req.params.dashboardId}"` });
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof SyntaxError) return res.status(400).json({ error: 'definitionJson không phải JSON hợp lệ' });
    next(err);
  }
});

router.delete('/:dashboardId', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    await pool.request().input('dashboardId', sql.VarChar(80), req.params.dashboardId)
      .query('DELETE FROM app.Dashboards WHERE DashboardId = @dashboardId');
    await logAction(req, { module: 'Biểu mẫu', actionType: 'XOA_DASHBOARD', targetObject: req.params.dashboardId, description: `Xoá dashboard "${req.params.dashboardId}"` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
