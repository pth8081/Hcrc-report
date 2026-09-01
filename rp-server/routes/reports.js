// routes/reports.js — Danh mục báo cáo (app.ReportCatalog), lọc theo quyền
// của người dùng (app.RoleReportAccess — xem lib/permissions.js), chạy báo
// cáo và xuất file. ĐỊNH NGHĨA báo cáo (bộ lọc/cột) luôn đọc từ
// app.ReportCatalog (CSDL RP). Dữ liệu THẬT có 5 đường, theo SourceType:
//   'directDb'    — Data Warehouse mặc định hoặc nguồn bổ sung
//                    (DataSourceId — xem lib/dataSourcePool.js), query SQL
//                    tại chỗ (lib/reportEngine.js).
//   'apiReport'/
//   'apiRealtime' — gọi API Server CỦA CHÍNH MÌNH qua HTTP
//                    (lib/apiReportClient.js) — dùng khi cần dữ liệu
//                    realtime mà API Server đã có sẵn kết nối, tránh Report
//                    Server tự mở thêm một đường kết nối trực tiếp riêng.
//   'externalApi' — gọi THẲNG một API do ĐỐI TÁC BÊN NGOÀI xây dựng, không
//                    qua API Server (lib/externalReportClient.js).
//   'composite'   — ghép NHIỀU khối nguồn (blocks) thành 1 dòng/thực thể
//                    theo entityCode rồi mới chạy công thức
//                    (lib/compositeReportRunner.js) — dùng khi 1 báo cáo
//                    cần trộn "hôm nay" (directDb/apiRealtime) với "cùng kỳ
//                    năm trước" + "chỉ tiêu" (dwh.SalesTargets), xem README
//                    mục "Báo cáo ghép nhiều nguồn (composite)".
const express = require('express');
const { sql, getPool } = require('../db');
const { requireAuth } = require('../lib/auth');
const { loadDefinition, runDefinition } = require('../lib/reportRunner');
const { exportExcel } = require('../lib/exportExcel');
const { exportPdf } = require('../lib/exportPdf');
const { getUserContext } = require('../lib/permissions');
const reportResultCache = require('../lib/reportResultCache');

const router = express.Router();
router.use(requireAuth);

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
    // CHỈ trả đúng phần rp-user/.../ReportsPage.jsx thật sự dùng để vẽ form
    // lọc (title, filters) — trước đây trả NGUYÊN definition (gộp cả
    // DataSourceId/ApiConnectionId/ExternalConnectionId/blocks composite kèm
    // domain+filters SQL nội bộ/formula thô) cho MỌI người dùng có quyền
    // xem báo cáo đó, lộ chi tiết kiến trúc nguồn dữ liệu không cần cho
    // hiển thị — hữu ích cho kẻ tấn công nếu tài khoản đó bị chiếm.
    res.json({ title: definition.title, filters: definition.filters || [] });
  } catch (err) { next(err); }
});

router.post('/:reportId/run', async (req, res, next) => {
  try {
    if (!(await requireReportAccess(req, res, req.params.reportId))) return;
    const definition = await loadDefinition(req.params.reportId);
    if (!definition || !definition.isActive) return res.status(404).json({ error: 'Không tìm thấy báo cáo' });

    const { filters = {} } = req.body || {};
    // Chặn trên (khớp đúng api-server/routes/v1/reports.js) — trước đây
    // pageSize lấy nguyên từ req.body không giới hạn, gọi {"pageSize":5000000}
    // là SQL Server cố trả cả triệu dòng vào 1 response JSON, vượt xa mức
    // 5000 dòng cố định của /export (bypass ngầm giới hạn xuất file).
    const page = Math.max(1, parseInt(req.body?.page, 10) || 1);
    const pageSize = Math.min(Math.max(1, parseInt(req.body?.pageSize, 10) || 200), 1000);

    // Cache TTL ngắn (lib/reportResultCache.js) — nhiều người dùng/dashboard
    // hay gọi lại CÙNG báo cáo + CÙNG bộ lọc trong vài giây liên tiếp, không
    // cần chạy lại nguyên truy vấn dwh.ReportFacts mỗi lần. KHÔNG dùng cho
    // /export hay jobs/reportEmailScheduler.js — chỉ đường xem tương tác này.
    const cacheKey = [req.params.reportId, filters, page, pageSize];
    let result = reportResultCache.get(cacheKey);
    if (!result) {
      result = await runDefinition(definition, filters, { page, pageSize });
      reportResultCache.set(cacheKey, result);
    }
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/:reportId/export', async (req, res, next) => {
  try {
    if (!(await requireReportAccess(req, res, req.params.reportId))) return;
    const definition = await loadDefinition(req.params.reportId);
    if (!definition || !definition.isActive) return res.status(404).json({ error: 'Không tìm thấy báo cáo' });

    const { filters = {}, format = 'excel' } = req.body || {};
    const { columns, rows: projected } = await runDefinition(definition, filters, { page: 1, pageSize: 5000 });
    const exportDefinition = { ...definition, columns };

    if (format === 'excel') {
      const buffer = await exportExcel(exportDefinition, projected);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${definition.title}.xlsx"`);
      return res.send(buffer);
    }
    if (format === 'pdf') {
      const buffer = await exportPdf(exportDefinition, projected);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${definition.title}.pdf"`);
      return res.send(buffer);
    }
    return res.status(400).json({ error: `Định dạng xuất "${format}" chưa được hỗ trợ` });
  } catch (err) { next(err); }
});

module.exports = router;
