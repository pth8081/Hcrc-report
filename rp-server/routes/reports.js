// routes/reports.js — Danh mục báo cáo (app.ReportCatalog), lọc theo quyền
// của người dùng (app.RoleReportAccess — xem lib/permissions.js), chạy báo
// cáo và xuất file. Dữ liệu THẬT đọc từ Data Warehouse mặc định hoặc một
// nguồn bổ sung (ReportCatalog.DataSourceId — xem lib/dataSourcePool.js);
// ĐỊNH NGHĨA báo cáo (bộ lọc/cột) luôn đọc từ app.ReportCatalog (CSDL RP).
const express = require('express');
const { sql, getPool } = require('../db');
const { getPoolForDataSource } = require('../lib/dataSourcePool');
const { requireAuth } = require('../lib/auth');
const { runReport, projectColumns } = require('../lib/reportEngine');
const { exportExcel } = require('../lib/exportExcel');
const { exportPdf } = require('../lib/exportPdf');
const { getUserContext } = require('../lib/permissions');

const router = express.Router();
router.use(requireAuth);

async function loadDefinition(reportId) {
  const rpPool = await getPool('RP');
  const result = await rpPool.request()
    .input('reportId', sql.VarChar(80), reportId)
    .query('SELECT Title, Domain, DataSourceId, DefinitionJson, IsActive FROM app.ReportCatalog WHERE ReportId = @reportId');
  if (!result.recordset.length) return null;
  const row = result.recordset[0];
  return { ...JSON.parse(row.DefinitionJson), dataSourceId: row.DataSourceId, isActive: row.IsActive };
}

async function resolveFactsPool(definition) {
  if (definition.dataSourceId) return getPoolForDataSource(definition.dataSourceId);
  return getPool('DWH');
}

async function requireReportAccess(req, res, reportId) {
  const context = await getUserContext(req.user.sub);
  if (!context) {
    res.status(401).json({ error: 'Tài khoản không còn hoạt động' });
    return null;
  }
  if (!context.reportIds.has(reportId)) {
    res.status(403).json({ error: 'Bạn không có quyền xem báo cáo này' });
    return null;
  }
  return context;
}

// Danh mục báo cáo THEO ĐÚNG QUYỀN của người dùng, lọc theo TRANG (menuCode —
// vd GET /api/reports?menuCode=reports-mua-hang cho đúng 1 trong 3 trang báo
// cáo) hoặc theo domain nội bộ (Data Warehouse) nếu cần trực tiếp.
router.get('/', async (req, res, next) => {
  try {
    const context = await getUserContext(req.user.sub);
    if (!context) return res.status(401).json({ error: 'Tài khoản không còn hoạt động' });

    const rpPool = await getPool('RP');
    const request = rpPool.request();
    let query = `
      SELECT c.ReportId, c.Title, c.Domain
      FROM app.ReportCatalog c JOIN app.MenuItems m ON c.MenuItemId = m.Id
      WHERE c.IsActive = 1
    `;
    if (req.query.menuCode) {
      request.input('menuCode', sql.VarChar(50), req.query.menuCode);
      query += ' AND m.Code = @menuCode';
    }
    if (req.query.domain) {
      request.input('domain', sql.VarChar(50), req.query.domain);
      query += ' AND c.Domain = @domain';
    }
    query += ' ORDER BY c.Title';

    const result = await request.query(query);
    const allowed = context.isSystemRole
      ? result.recordset
      : result.recordset.filter(r => context.reportIds.has(r.ReportId));
    res.json(allowed);
  } catch (err) { next(err); }
});

router.get('/:reportId', async (req, res, next) => {
  try {
    if (!(await requireReportAccess(req, res, req.params.reportId))) return;
    const definition = await loadDefinition(req.params.reportId);
    if (!definition || !definition.isActive) return res.status(404).json({ error: 'Không tìm thấy báo cáo' });
    res.json(definition);
  } catch (err) { next(err); }
});

router.post('/:reportId/run', async (req, res, next) => {
  try {
    if (!(await requireReportAccess(req, res, req.params.reportId))) return;
    const definition = await loadDefinition(req.params.reportId);
    if (!definition || !definition.isActive) return res.status(404).json({ error: 'Không tìm thấy báo cáo' });

    const { filters = {}, page = 1, pageSize = 200 } = req.body || {};
    const pool = await resolveFactsPool(definition);
    const rows = await runReport(pool, definition, filters, { page, pageSize });
    res.json({
      columns: definition.columns,
      rows: rows.map(r => projectColumns(r, definition.columns))
    });
  } catch (err) { next(err); }
});

router.post('/:reportId/export', async (req, res, next) => {
  try {
    if (!(await requireReportAccess(req, res, req.params.reportId))) return;
    const definition = await loadDefinition(req.params.reportId);
    if (!definition || !definition.isActive) return res.status(404).json({ error: 'Không tìm thấy báo cáo' });

    const { filters = {}, format = 'excel' } = req.body || {};
    const pool = await resolveFactsPool(definition);
    const rows = await runReport(pool, definition, filters, { page: 1, pageSize: 5000 });
    const projected = rows.map(r => projectColumns(r, definition.columns));

    if (format === 'excel') {
      const buffer = await exportExcel(definition, projected);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${definition.title}.xlsx"`);
      return res.send(buffer);
    }
    if (format === 'pdf') {
      const buffer = await exportPdf(definition, projected);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${definition.title}.pdf"`);
      return res.send(buffer);
    }
    return res.status(400).json({ error: `Định dạng xuất "${format}" chưa được hỗ trợ` });
  } catch (err) { next(err); }
});

module.exports = router;
