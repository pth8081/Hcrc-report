// routes/admin/reportCatalog.js — Trang "Báo cáo" (api-admin/): CRUD
// api.ReportCatalog — danh mục báo cáo tổng hợp lộ ra qua GET
// /api/v1/reports/{ReportId}/run (đọc dwh.ReportFacts). Định nghĩa
// (filters/columns) là JSON thô, cùng khuôn dạng với app.ReportCatalog bên
// rp-server (xem rp-server/README.md mục "Thêm một báo cáo mới") — nhưng
// đây là danh mục ĐỘC LẬP, API Server tự quản lý báo cáo nào của mình lộ ra,
// không đồng bộ tự động với rp-server.
const express = require('express');
const { sql, getPool } = require('../../db');
const { requireAdminAuth, requireAdminRole } = require('../../lib/adminAuth');

const router = express.Router();
router.use(requireAdminAuth);

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().query(`
      SELECT ReportId, Title, Domain, DefinitionJson, IsActive, CreatedAt
      FROM api.ReportCatalog ORDER BY Title
    `);
    res.json(result.recordset);
  } catch (err) { next(err); }
});

router.post('/', requireAdminRole, async (req, res, next) => {
  try {
    const { reportId, title, domain, definitionJson } = req.body || {};
    if (!reportId || !title || !domain || !definitionJson) {
      return res.status(400).json({ error: 'Thiếu reportId/title/domain/definitionJson' });
    }
    JSON.parse(definitionJson); // ném lỗi rõ ràng nếu JSON không hợp lệ, trước khi ghi CSDL

    const pool = await getPool('ADMIN');
    await pool.request()
      .input('reportId', sql.VarChar(80), reportId)
      .input('title', sql.NVarChar(200), title)
      .input('domain', sql.VarChar(50), domain)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .query(`
        INSERT INTO api.ReportCatalog (ReportId, Title, Domain, DefinitionJson)
        VALUES (@reportId, @title, @domain, @definitionJson)
      `);
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err instanceof SyntaxError) return res.status(400).json({ error: 'definitionJson không phải JSON hợp lệ' });
    if (err.number === 2627) return res.status(409).json({ error: `ReportId "${req.body.reportId}" đã tồn tại` });
    next(err);
  }
});

router.put('/:reportId', requireAdminRole, async (req, res, next) => {
  try {
    const { title, domain, definitionJson, isActive } = req.body || {};
    if (definitionJson) JSON.parse(definitionJson);

    const pool = await getPool('ADMIN');
    await pool.request()
      .input('reportId', sql.VarChar(80), req.params.reportId)
      .input('title', sql.NVarChar(200), title)
      .input('domain', sql.VarChar(50), domain)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .input('isActive', sql.Bit, isActive ? 1 : 0)
      .query(`
        UPDATE api.ReportCatalog
        SET Title = @title, Domain = @domain, DefinitionJson = @definitionJson, IsActive = @isActive
        WHERE ReportId = @reportId
      `);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof SyntaxError) return res.status(400).json({ error: 'definitionJson không phải JSON hợp lệ' });
    next(err);
  }
});

router.delete('/:reportId', requireAdminRole, async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    await pool.request().input('reportId', sql.VarChar(80), req.params.reportId)
      .query('DELETE FROM api.ReportCatalog WHERE ReportId = @reportId');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
