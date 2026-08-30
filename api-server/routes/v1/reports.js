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
//
// 2 lớp tuỳ biến CHO TỪNG ĐỐI TÁC (không đổi được nhau, bổ sung nhau):
//   - api.ConsumerReportAccess — ai được gọi report nào (mặc định KHÔNG được
//     gọi report nào cho tới khi admin gán rõ ràng qua api-admin/, xem
//     routes/admin/consumers.js).
//   - ?fields=a,b,c — trong report họ ĐƯỢC gọi, chỉ lấy đúng cột cần, không
//     bắt phải nhận hết cột đã định nghĩa. Xin cột không có trong định nghĩa
//     -> 400 rõ ràng, không âm thầm bỏ qua.
const express = require('express');
const { sql, getPool } = require('../../db');
const { requireApiKey } = require('../../lib/apiAuth');
const { runReport, projectColumns, describeColumns } = require('../../lib/reportEngine');

const router = express.Router();
router.use(requireApiKey('reports'));

async function assertConsumerCanAccessReport(consumerId, reportId) {
  const adminPool = await getPool('ADMIN');
  const result = await adminPool.request()
    .input('consumerId', sql.Int, consumerId)
    .input('reportId', sql.VarChar(80), reportId)
    .query('SELECT 1 FROM api.ConsumerReportAccess WHERE ConsumerId = @consumerId AND ReportId = @reportId');
  return result.recordset.length > 0;
}

// Rút gọn definition.columns theo ?fields= — validate TRƯỚC khi chạy query,
// để 1 field sai tên báo lỗi rõ ràng thay vì âm thầm trả thiếu cột.
function filterColumnsByFields(columns, fieldsParam) {
  if (!fieldsParam) return { columns, error: null };
  const requested = fieldsParam.split(',').map(f => f.trim()).filter(Boolean);
  const byKey = new Map(columns.map(col => [col && typeof col === 'object' ? col.key : col, col]));
  const missing = requested.filter(f => !byKey.has(f));
  if (missing.length) {
    return { columns: null, error: `Không có cột: ${missing.join(', ')} — xem GET /api/v1/reports/:reportId trước khi gọi run` };
  }
  return { columns: requested.map(f => byKey.get(f)), error: null };
}

router.get('/:reportId/run', async (req, res, next) => {
  try {
    const adminPool = await getPool('ADMIN');
    const catalog = await adminPool.request()
      .input('reportId', sql.VarChar(80), req.params.reportId)
      .query('SELECT DefinitionJson, IsActive FROM api.ReportCatalog WHERE ReportId = @reportId');
    if (!catalog.recordset.length || !catalog.recordset[0].IsActive) {
      return res.status(404).json({ error: 'Không tìm thấy báo cáo' });
    }

    if (!(await assertConsumerCanAccessReport(req.consumer.id, req.params.reportId))) {
      return res.status(403).json({ error: 'Đối tác chưa được cấp quyền gọi báo cáo này' });
    }

    const definition = JSON.parse(catalog.recordset[0].DefinitionJson);

    const { columns, error } = filterColumnsByFields(definition.columns, req.query.fields);
    if (error) return res.status(400).json({ error });

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
      columns: describeColumns(columns),
      rows: rows.map(r => projectColumns(r, columns))
    });
  } catch (err) { next(err); }
});

module.exports = router;
