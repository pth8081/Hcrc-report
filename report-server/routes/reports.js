// routes/reports.js — Danh mục báo cáo (dwh.ReportCatalog), chạy báo cáo theo
// bộ lọc (xem trước trên màn hình), và xuất file. Toàn bộ route đều yêu cầu
// đăng nhập — xem lib/auth.js.
const express = require('express');
const { sql, getPool } = require('../db');
const { requireAuth } = require('../lib/auth');
const { runReport, projectColumns } = require('../lib/reportEngine');
const { exportExcel } = require('../lib/exportExcel');
const { exportPdf } = require('../lib/exportPdf');

const router = express.Router();
router.use(requireAuth);

async function loadDefinition(pool, reportId) {
  const result = await pool.request()
    .input('reportId', sql.VarChar(80), reportId)
    .query('SELECT Title, Domain, DefinitionJson FROM dwh.ReportCatalog WHERE ReportId = @reportId');
  if (!result.recordset.length) return null;
  return JSON.parse(result.recordset[0].DefinitionJson);
}

// Danh sách báo cáo hiện có — dùng để dựng menu/danh mục trên giao diện.
router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query('SELECT ReportId, Title, Domain FROM dwh.ReportCatalog ORDER BY Title');
    res.json(result.recordset);
  } catch (err) { next(err); }
});

// Định nghĩa một báo cáo (bộ lọc, cột hiển thị, định dạng xuất) — dùng để tự
// vẽ form lọc trên giao diện, không cần biết trước từng báo cáo.
router.get('/:reportId', async (req, res, next) => {
  try {
    const pool = await getPool();
    const definition = await loadDefinition(pool, req.params.reportId);
    if (!definition) return res.status(404).json({ error: 'Không tìm thấy báo cáo' });
    res.json(definition);
  } catch (err) { next(err); }
});

// Chạy báo cáo, trả JSON để xem trước trên màn hình (có phân trang).
router.post('/:reportId/run', async (req, res, next) => {
  try {
    const pool = await getPool();
    const definition = await loadDefinition(pool, req.params.reportId);
    if (!definition) return res.status(404).json({ error: 'Không tìm thấy báo cáo' });

    const { filters = {}, page = 1, pageSize = 200 } = req.body || {};
    const rows = await runReport(pool, definition, filters, { page, pageSize });
    res.json({
      columns: definition.columns,
      rows: rows.map(r => projectColumns(r, definition.columns))
    });
  } catch (err) { next(err); }
});

// Xuất file — dùng lại đúng bộ lọc, lấy tối đa 5000 dòng cho một lượt xuất.
router.post('/:reportId/export', async (req, res, next) => {
  try {
    const pool = await getPool();
    const definition = await loadDefinition(pool, req.params.reportId);
    if (!definition) return res.status(404).json({ error: 'Không tìm thấy báo cáo' });

    const { filters = {}, format = 'excel' } = req.body || {};
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
