// routes/v1/reports.js — Báo cáo tổng hợp, đọc từ Data Warehouse (KHÔNG
// realtime — độ trễ bằng độ trễ ETL, xem tài liệu kiến trúc). Trả JSON,
// không xuất file — bên gọi tự xử lý theo nhu cầu.
//
// ĐỊNH NGHĨA báo cáo (bộ lọc/cột) đọc từ api.ReportCatalog (CSDL HCRC_API,
// pool ADMIN) — CSDL RIÊNG của API Server, KHÔNG phải app.ReportCatalog bên
// HCRC_RP: API Server không đọc được CSDL của Report Server (cô lập DB), và
// 2 hệ này tự quyết định độc lập báo cáo nào của mình cần lộ ra. Dữ liệu
// THẬT (dwh.ReportFacts) vẫn đọc qua pool DWH.
//
// Endpoint này phục vụ CẢ hệ thống ngoài lẫn rp-server (Report Server) khi
// một báo cáo của rp-server cấu hình SourceType='apiReport' — cùng 1 đường,
// phân biệt bằng scope của API key (xem lib/apiAuth.js).
const express = require('express');
const { sql, getPool } = require('../../db');
const { requireApiKey } = require('../../lib/apiAuth');
const { runReport, projectColumns } = require('../../lib/reportEngine');

const router = express.Router();
router.use(requireApiKey('reports'));

router.get('/:reportId/run', async (req, res, next) => {
  try {
    const adminPool = await getPool('ADMIN');
    const catalog = await adminPool.request()
      .input('reportId', sql.VarChar(80), req.params.reportId)
      .query('SELECT DefinitionJson, IsActive FROM api.ReportCatalog WHERE ReportId = @reportId');
    if (!catalog.recordset.length || !catalog.recordset[0].IsActive) {
      return res.status(404).json({ error: 'Không tìm thấy báo cáo' });
    }
    const definition = JSON.parse(catalog.recordset[0].DefinitionJson);

    const page = parseInt(req.query.page || '1', 10);
    const pageSize = Math.min(parseInt(req.query.pageSize || '200', 10), 1000);

    const filters = {};
    for (const f of definition.filters || []) {
      if (req.query[f.field] !== undefined) filters[f.field] = req.query[f.field];
    }

    const dwhPool = await getPool('DWH');
    const rows = await runReport(dwhPool, definition, filters, { page, pageSize });
    res.json({
      reportId: req.params.reportId,
      page,
      pageSize,
      columns: definition.columns,
      rows: rows.map(r => projectColumns(r, definition.columns))
    });
  } catch (err) { next(err); }
});

module.exports = router;
