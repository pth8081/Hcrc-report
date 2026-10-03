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
const { resolveTitleWithDate } = require('../lib/reportTitleDate');

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

// Lọc tile theo 2 lớp quyền CỘNG DỒN (bản 8.43, xem rp-db/schema.sql:
// app.RoleDashboardGroupAccess): (1) app.RoleReportAccess — như trước bản
// 8.43, ÁP DỤNG MỌI tile; (2) app.RoleDashboardGroupAccess.CanView — CHỈ
// áp dụng tile có khai "group" (tile không khai group giữ nguyên hành vi
// cũ, không bị lọc thêm). `requireExport=true` dùng CanExport thay CanView
// (xuất file đòi quyền CHẶT HƠN xem).
function filterTilesForUser(tiles, dashboardId, userContext, requireExport = false) {
  const { isSystemRole, reportIds, dashboardGroupAccess } = userContext;
  return tiles.filter((t) => {
    if (!isSystemRole && !reportIds.has(t.reportId)) return false;
    if (isSystemRole || !t.group) return true;
    const access = dashboardGroupAccess.get(`${dashboardId}::${t.group}`);
    return !!(requireExport ? access?.canExport : access?.canView);
  });
}

router.get('/:dashboardId', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const result = await pool.request().input('dashboardId', sql.VarChar(80), req.params.dashboardId)
      .query('SELECT Title, DefinitionJson FROM app.Dashboards WHERE DashboardId = @dashboardId AND IsActive = 1');
    if (!result.recordset.length) return res.status(404).json({ error: 'Không tìm thấy dashboard' });

    const { Title, DefinitionJson } = result.recordset[0];
    const definition = JSON.parse(DefinitionJson);
    // req.userContext do requireMenuAccess() gán sẵn (xem lib/auth.js) —
    // LOẠI HẲN ô nào role không có quyền xem (thay vì để rp-user tự gọi
    // /run rồi nhận 403 mới biết) — người dùng chỉ thấy đúng các ô mình
    // được xem, không có "ô lỗi" gây khó hiểu trên giao diện.
    const visibleTiles = filterTilesForUser(definition.tiles || [], req.params.dashboardId, req.userContext);
    res.json({ title: Title, tiles: visibleTiles });
  } catch (err) { next(err); }
});

// tile.dateMode — MIRROR đúng rp-user/src/lib/dateRange.js (dashboard "Top 5
// chi nhánh", bản 8.20-8.22) — 'day' -> đúng {fromDate,toDate} đã chọn,
// 'month' -> NGUYÊN THÁNG chứa toDate (từ ngày 1 tới ngày CUỐI CÙNG của
// tháng, KHÔNG dừng ở toDate). Tile không khai dateMode -> không tự thêm
// eventDate (báo cáo tự dùng mặc định "hôm nay" của
// compositeReportRunner.js, giống hành vi POST /reports/:reportId/run
// không truyền filters.eventDate).
function lastOfMonth(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
function computeEventDateRange(dateMode, fromDate, toDate) {
  if (dateMode === 'month') return { from: `${toDate.slice(0, 7)}-01`, to: lastOfMonth(toDate) };
  return { from: fromDate, to: toDate };
}
// LỖI THẬT đã gặp (bản 8.26) — xem chú thích đầy đủ ở
// lib/compositeReportRunner.js:vietnamTodayISO() (cùng lỗi/cách sửa, MIRROR
// lại ở đây vì route này có "hôm nay" mặc định RIÊNG khi body không truyền
// fromDate/toDate).
function vietnamTodayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}
function formatDateVN(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
// Nhãn động "(15/09/2026)"/"(Tháng 9/2026)" ghép vào tiêu đề báo cáo lúc
// xuất — MIRROR đúng rp-user/src/lib/dateRange.js:periodLabelFor().
function periodLabelFor(dateMode, fromDate, toDate) {
  if (dateMode === 'month') {
    const [y, m] = toDate.split('-');
    return `Tháng ${Number(m)}/${y}`;
  }
  if (dateMode === 'day') {
    return fromDate === toDate ? formatDateVN(fromDate) : `${formatDateVN(fromDate)} - ${formatDateVN(toDate)}`;
  }
  return null;
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
  const period = tile.dateMode === 'month' ? 'Tháng' : tile.dateMode === 'day' ? 'Ngày' : '';
  // tile.kind==='realtime' (bản 8.29) — tách riêng KHỎI quy ước "-cao"/"-thap"
  // bên dưới (reportId của báo cáo Realtime, vd 'bc-doanh-thu-hcrc-thanh-vien',
  // không khớp quy ước đó) — tên ngắn "Realtime Ngày"/"Realtime Tháng" đủ
  // phân biệt 2 Ô bảng Realtime hiện có.
  if (tile.kind === 'realtime') return ['Realtime', period].filter(Boolean).join(' ');
  const direction = tile.reportId?.includes('-cao') ? 'Cao' : tile.reportId?.includes('-thap') ? 'Thấp' : '';
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
    // fromDate/toDate (TUỲ CHỌN) — CHỈ áp dụng cho tile có khai dateMode (xem
    // computeEventDateRange() bên dưới); dashboard không dùng dateMode (mọi
    // dashboard khác ngoài "Top 5 chi nhánh") không cần truyền gì, mặc định
    // "hôm nay" vô hại vì không tile nào đọc tới giá trị này.
    const today = vietnamTodayISO();
    const fromDate = req.body?.fromDate || today;
    const toDate = req.body?.toDate || today;
    if (!Array.isArray(tileKeys) || !tileKeys.length) return res.status(400).json({ error: 'Thiếu tileKeys' });
    if (!['excel', 'pdf'].includes(format)) return res.status(400).json({ error: `Định dạng xuất "${format}" chưa được hỗ trợ` });

    const pool = await getPool('RP');
    const result = await pool.request().input('dashboardId', sql.VarChar(80), req.params.dashboardId)
      .query('SELECT Title, DefinitionJson FROM app.Dashboards WHERE DashboardId = @dashboardId AND IsActive = 1');
    if (!result.recordset.length) return res.status(404).json({ error: 'Không tìm thấy dashboard' });
    const { Title: dashboardTitle, DefinitionJson } = result.recordset[0];
    const definition = JSON.parse(DefinitionJson);

    // requireExport=true (bản 8.43) — xuất file đòi CanExport, CHẶT HƠN
    // CanView dùng ở GET /:dashboardId (xem filterTilesForUser ở trên) —
    // vai trò chỉ có "Xem dashboard" (không có "Xem chi tiết") THẤY được ô
    // trên web nhưng bấm Xuất Excel/PDF cho đúng ô đó sẽ bị loại ở đây.
    const exportableTiles = filterTilesForUser(definition.tiles || [], req.params.dashboardId, req.userContext, true);
    const tiles = tileKeys.map(k => exportableTiles.find(t => t.key === k)).filter(Boolean);
    if (!tiles.length) return res.status(403).json({ error: 'Không có ô nào hợp lệ/được phép xuất' });

    const sections = [];
    for (const tile of tiles) {
      const reportDefinition = await loadDefinition(tile.reportId);
      if (!reportDefinition || !reportDefinition.isActive) continue;
      // tile.kind==='realtime' (bản 8.29) — ÉP cheDoSoSanh='past', GIỐNG HỆT
      // RealtimeReportTile.jsx (ẩn cột Cùng kỳ/LFL) để file xuất ra KHỚP ĐÚNG
      // những gì đang hiện trên tab Realtime, không lặng lẽ xuất thêm cột
      // không ai thấy trên web.
      const isRealtime = tile.kind === 'realtime';
      const filters = tile.dateMode
        ? { eventDate: computeEventDateRange(tile.dateMode, fromDate, toDate), ...(isRealtime ? { cheDoSoSanh: 'past' } : {}) }
        : {};
      const { columns, rows } = await runDefinition(reportDefinition, filters, { page: 1, pageSize: 5000 });
      const baseTitle = tile.title || reportDefinition.title;
      const periodLabel = tile.dateMode ? periodLabelFor(tile.dateMode, fromDate, toDate) : null;
      // Realtime TÁI DÙNG nguyên báo cáo gốc (vd "Báo cáo doanh thu cuối
      // ngày HCRC (Thành viên)") — dùng ĐÚNG exportTitle đã khai sẵn trên
      // report đó (token "{ngayBaoCao}" tự thay ngày thật, xem
      // lib/reportTitleDate.js) thay vì ghép "tên Ô (ngày)" kiểu Top 5, để
      // tài liệu xuất ra giống hệt báo cáo cuối ngày thật (có tiêu đề
      // "Hệ thống siêu thị BRGMART - Báo cáo nhanh doanh thu ngày ...").
      const title = isRealtime
        ? resolveTitleWithDate(reportDefinition.exportTitle || reportDefinition.title, filters, '/')
        : (periodLabel ? `${baseTitle} (${periodLabel})` : baseTitle);
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
    const fileBase = `${dashboardTitle} - ${toDate.split('-').reverse().join('')}`;

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
