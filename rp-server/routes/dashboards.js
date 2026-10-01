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
const { loadDefinition, runDefinition } = require('../lib/reportRunner');
const { exportMultiSheetExcel } = require('../lib/exportExcel');
const { exportPdf, mergePdfBuffers } = require('../lib/exportPdf');
const { logAction } = require('../lib/auditLog');

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

// tile.dateMode — MIRROR đúng rp-user/src/modules/dashboard/DashboardTile.jsx:
// computeEventDateRange() (dashboard "Top 5 chi nhánh", bản 8.20/8.21) —
// 'day' -> đúng reportDate, 'month' -> từ đầu tháng chứa reportDate tới
// reportDate. Tile không khai dateMode -> không tự thêm eventDate (báo cáo
// tự dùng mặc định "hôm nay" của compositeReportRunner.js, giống hành vi
// POST /reports/:reportId/run không truyền filters.eventDate).
function computeEventDateRange(dateMode, reportDate) {
  if (dateMode === 'month') return { from: `${reportDate.slice(0, 7)}-01`, to: reportDate };
  return { from: reportDate, to: reportDate };
}

// tile.reportId chứa "-cao"/"-thap" (quy ước đặt tên của
// scripts/seedTop5ChiNhanhReports.js) — suy ra màu khung (xanh/cam) GIỐNG
// HỆT viền trên của .dashboard-tile--high/--low trên web (xem styles.css) —
// tô màu bằng CHÍNH cơ chế columnGroups đã có sẵn (xem chú thích
// DefinitionJson.columnGroups ở đầu lib/compositeReportRunner.js), không
// thêm cơ chế tô màu mới nào cho PDF/Excel.
function resolveToneColor(reportId) {
  if (reportId.includes('-cao')) return 'green';
  if (reportId.includes('-thap')) return 'orange';
  return null;
}

// Tên sheet Excel NGẮN, PHÂN BIỆT RÕ cho đúng 16 Ô "Top 5 chi nhánh" (vd
// "MART Cao Ngày") — lib/exportExcel.js:shortenSheetName() (cắt giữ đầu+đuôi
// khi > 31 ký tự) VẪN LÀ LƯỚI AN TOÀN CHUNG cho mọi dashboard khác, nhưng
// với ĐÚNG 4 Ô "Top 5" cùng chuỗi (vd "MART — ... Cao nhất (Trong ngày)" và
// "...Cao nhất (Trong tháng)") phần ĐẦU giống hệt nhau quá dài (>18 ký tự)
// khiến bản cắt ngắn chung mất luôn phần "Ngày"/"Tháng" phân biệt — tạo tên
// sẵn NGẮN GỌN ở đây cho riêng dashboard này thay vì để cơ chế cắt chung xử
// lý nhầm. Tile không khớp quy ước (dashboard khác) -> rơi về tile.title
// như cũ, cơ chế cắt chung ở exportExcel.js tự lo phần còn lại.
function buildSheetName(tile) {
  const direction = tile.reportId?.includes('-cao') ? 'Cao' : tile.reportId?.includes('-thap') ? 'Thấp' : '';
  const period = tile.dateMode === 'month' ? 'Tháng' : tile.dateMode === 'day' ? 'Ngày' : '';
  const chain = (tile.chain || '').toUpperCase();
  const parts = [chain, direction, period].filter(Boolean);
  return parts.length ? parts.join(' ') : (tile.title || tile.reportId);
}

// POST /:dashboardId/export — xuất Excel/PDF cho ĐÚNG các Ô đang hiện trên
// web (body.tileKeys — rp-user tự gửi danh sách key của các Ô đang hiện theo
// đúng tab/bộ lọc đang chọn, xem DashboardPage.jsx) — mỗi Ô 1
// sheet(Excel)/trang(PDF) riêng, GHÉP lại thành 1 file duy nhất (xem
// lib/exportExcel.js:exportMultiSheetExcel()/lib/exportPdf.js:mergePdfBuffers()).
// LỌC LẠI tileKeys theo ĐÚNG quyền báo cáo (như GET /:dashboardId ở trên) —
// KHÔNG tin thẳng danh sách key client gửi lên, phòng gọi thẳng API bỏ qua
// giao diện.
router.post('/:dashboardId/export', async (req, res, next) => {
  try {
    const { tileKeys, format = 'excel' } = req.body || {};
    // reportDate (TUỲ CHỌN) — CHỈ áp dụng cho tile có khai dateMode (xem
    // computeEventDateRange() bên dưới); dashboard không dùng dateMode (mọi
    // dashboard khác ngoài "Top 5 chi nhánh") không cần truyền gì, mặc định
    // "hôm nay" vô hại vì không tile nào đọc tới giá trị này.
    const reportDate = req.body?.reportDate || new Date().toISOString().slice(0, 10);
    if (!Array.isArray(tileKeys) || !tileKeys.length) return res.status(400).json({ error: 'Thiếu tileKeys' });
    if (!['excel', 'pdf'].includes(format)) return res.status(400).json({ error: `Định dạng xuất "${format}" chưa được hỗ trợ` });

    const pool = await getPool('RP');
    const result = await pool.request().input('dashboardId', sql.VarChar(80), req.params.dashboardId)
      .query('SELECT Title, DefinitionJson FROM app.Dashboards WHERE DashboardId = @dashboardId AND IsActive = 1');
    if (!result.recordset.length) return res.status(404).json({ error: 'Không tìm thấy dashboard' });
    const { Title: dashboardTitle, DefinitionJson } = result.recordset[0];
    const definition = JSON.parse(DefinitionJson);

    const { isSystemRole, reportIds } = req.userContext;
    const visibleTiles = (definition.tiles || []).filter(t => isSystemRole || reportIds.has(t.reportId));
    const tiles = tileKeys.map(k => visibleTiles.find(t => t.key === k)).filter(Boolean);
    if (!tiles.length) return res.status(403).json({ error: 'Không có ô nào hợp lệ/được phép xuất' });

    const sections = [];
    for (const tile of tiles) {
      const reportDefinition = await loadDefinition(tile.reportId);
      if (!reportDefinition || !reportDefinition.isActive) continue;
      const filters = tile.dateMode ? { eventDate: computeEventDateRange(tile.dateMode, reportDate) } : {};
      const { columns, rows } = await runDefinition(reportDefinition, filters, { page: 1, pageSize: 5000 });
      const title = tile.title || reportDefinition.title;
      const toneColor = resolveToneColor(tile.reportId);
      const exportDefinition = {
        ...reportDefinition,
        title,
        columns,
        columnGroups: toneColor
          ? [{ label: title, color: toneColor, keys: columns.filter(c => c.key !== 'stt').map(c => c.key) }]
          : reportDefinition.columnGroups
      };
      sections.push({ tile, title, exportDefinition, rows });
    }
    if (!sections.length) return res.status(404).json({ error: 'Không lấy được dữ liệu báo cáo nào để xuất' });

    // Tên file giữ NGUYÊN tiếng Việt có dấu — res.attachment() (gói
    // content-disposition bên trong) tự mã hoá đúng chuẩn RFC 5987 (xem
    // routes/reports.js:/:reportId/export, cùng cơ chế), không cần tự lược
    // bỏ dấu/ký tự đặc biệt ở đây.
    const fileBase = `${dashboardTitle} - ${reportDate.split('-').reverse().join('')}`;

    if (format === 'excel') {
      const buffer = await exportMultiSheetExcel(sections.map(s => ({ definition: s.exportDefinition, rows: s.rows, sheetName: buildSheetName(s.tile) })));
      await logAction(req, { module: 'Dashboard', actionType: 'XUAT_DASHBOARD', targetObject: req.params.dashboardId, description: `Xuất Excel dashboard "${dashboardTitle}" (${sections.length} ô)` });
      res.attachment(`${fileBase}.xlsx`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buffer);
    }

    const pdfBuffers = [];
    for (const s of sections) pdfBuffers.push(await exportPdf(s.exportDefinition, s.rows));
    const merged = await mergePdfBuffers(pdfBuffers);
    await logAction(req, { module: 'Dashboard', actionType: 'XUAT_DASHBOARD', targetObject: req.params.dashboardId, description: `Xuất PDF dashboard "${dashboardTitle}" (${sections.length} ô)` });
    res.attachment(`${fileBase}.pdf`);
    res.setHeader('Content-Type', 'application/pdf');
    return res.send(merged);
  } catch (err) { next(err); }
});

module.exports = router;
