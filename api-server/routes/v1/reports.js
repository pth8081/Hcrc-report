// routes/v1/reports.js — Báo cáo tổng hợp cho hệ thống ngoài, đọc từ Data
// Warehouse (KHÔNG realtime — độ trễ bằng độ trễ ETL, xem tài liệu kiến trúc).
// Trả JSON, không xuất file — hệ thống gọi tự xử lý theo nhu cầu của họ.
const express = require('express');
const { sql, getPool } = require('../../db');
const { requireApiKey } = require('../../lib/apiAuth');
const { runReport, projectColumns } = require('../../lib/reportEngine');

const router = express.Router();
router.use(requireApiKey('reports'));

router.get('/:reportId/run', async (req, res, next) => {
  try {
    const pool = await getPool('DWH');
    const catalog = await pool.request()
      .input('reportId', sql.VarChar(80), req.params.reportId)
      .query('SELECT DefinitionJson FROM dwh.ReportCatalog WHERE ReportId = @reportId');
    if (!catalog.recordset.length) return res.status(404).json({ error: 'Không tìm thấy báo cáo' });
    const definition = JSON.parse(catalog.recordset[0].DefinitionJson);

    const page = parseInt(req.query.page || '1', 10);
    const pageSize = Math.min(parseInt(req.query.pageSize || '200', 10), 1000);

    const filters = {};
    for (const f of definition.filters || []) {
      if (req.query[f.field] !== undefined) filters[f.field] = req.query[f.field];
    }

    const rows = await runReport(pool, definition, filters, { page, pageSize });
    res.json({
      reportId: req.params.reportId,
      page,
      pageSize,
      rows: rows.map(r => projectColumns(r, definition.columns))
    });
  } catch (err) { next(err); }
});

module.exports = router;
