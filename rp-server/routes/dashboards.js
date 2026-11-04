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
const { exportExcel, exportMultiSheetExcel } = require('../lib/exportExcel');
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

// Cá nhân hoá Dashboard (bản 8.45, theo yêu cầu người dùng) — MỖI NGƯỜI tự
// lưu riêng cho mình (xem rp-db/schema.sql: app.UserDashboardPreferences):
// Ô nào ẩn/hiện, thứ tự Ô, nhóm/tab đã xem lần trước, số ngày mặc định khi
// mở lại Dashboard. KHÁC HẲN app.RoleDashboardGroupAccess (quyền XEM, áp
// dụng CHUNG cho cả vai trò) — đây là tuỳ chọn HIỂN THỊ riêng của từng
// người, không cần quyền Admin, không ảnh hưởng người khác. PreferencesJson
// lưu nguyên object client gửi lên (không khai cột riêng từng trường) —
// giữ route đơn giản, đổi/thêm trường cá nhân hoá mới sau này không cần đổi
// schema.
router.get('/:dashboardId/preferences', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const result = await pool.request()
      .input('userId', sql.Int, req.user.sub)
      .input('dashboardId', sql.VarChar(80), req.params.dashboardId)
      .query('SELECT PreferencesJson FROM app.UserDashboardPreferences WHERE UserId = @userId AND DashboardId = @dashboardId');
    res.json(result.recordset.length ? JSON.parse(result.recordset[0].PreferencesJson) : {});
  } catch (err) { next(err); }
});

router.put('/:dashboardId/preferences', async (req, res, next) => {
  try {
    const preferencesJson = JSON.stringify(req.body || {});
    const pool = await getPool('RP');
    const existing = await pool.request()
      .input('userId', sql.Int, req.user.sub)
      .input('dashboardId', sql.VarChar(80), req.params.dashboardId)
      .query('SELECT Id FROM app.UserDashboardPreferences WHERE UserId = @userId AND DashboardId = @dashboardId');
    if (existing.recordset.length) {
      await pool.request()
        .input('id', sql.Int, existing.recordset[0].Id)
        .input('preferencesJson', sql.NVarChar(sql.MAX), preferencesJson)
        .query('UPDATE app.UserDashboardPreferences SET PreferencesJson = @preferencesJson, UpdatedAt = SYSUTCDATETIME() WHERE Id = @id');
    } else {
      await pool.request()
        .input('userId', sql.Int, req.user.sub)
        .input('dashboardId', sql.VarChar(80), req.params.dashboardId)
        .input('preferencesJson', sql.NVarChar(sql.MAX), preferencesJson)
        .query('INSERT INTO app.UserDashboardPreferences (UserId, DashboardId, PreferencesJson) VALUES (@userId, @dashboardId, @preferencesJson)');
    }
    res.json({ ok: true });
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
function firstOfMonth(dateStr) {
  return `${dateStr.slice(0, 7)}-01`;
}
function addDaysISO(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
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
function formatMonthLabel(dateStr) {
  const [y, m] = dateStr.split('-');
  return `T${Number(m)}/${y}`;
}
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
      // __storeScope (bản 8.51) — xem chú thích ở routes/reports.js:/:reportId/run
      // (SERVER tự gắn, không tin client) — tile này KHÔNG đi qua
      // routes/reports.js (gọi runDefinition() thẳng ở đây) nên phải tự gắn
      // lại, không thì xuất Dashboard sẽ lộ dữ liệu ngoài phạm vi.
      const filters = {
        ...(tile.dateMode
          ? { eventDate: computeEventDateRange(tile.dateMode, fromDate, toDate), ...(isRealtime ? { cheDoSoSanh: 'past' } : {}) }
          : {}),
        __storeScope: req.userContext.storeScope
      };
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

// POST /:dashboardId/realtime-compare (bản 10.62, theo yêu cầu người dùng —
// "so sánh các siêu thị dạng lên xuống theo thời gian") — CHỈ dành cho tile
// kind==='realtime' (vd "Doanh thu Realtime HCRC (Thành viên)") — trả
// doanh thu (dt_thucDat) của MỌI siêu thị theo TỪNG mốc thời gian (ngày/
// tháng) trong khoảng đã chọn, để rp-user tự vẽ biểu đồ đường + bảng pivot
// (mỗi dòng 1 mốc thời gian, mỗi cột 1 siêu thị) — rp-user lọc ra đúng các
// siêu thị người dùng CHỌN để hiển thị (API trả ĐỦ mọi siêu thị, không lọc
// ở tầng server, để đổi lựa chọn trên UI không cần gọi lại API).
//
// Chạy LẶP LẠI runDefinition() cho TỪNG mốc (mỗi mốc 1 truy vấn composite
// riêng, giống hệt cách POST /:dashboardId/export hiện dùng cho 1 mốc) —
// CHẶN TRÊN số mốc tối đa (31 ngày/12 tháng) để KHÔNG lặp hàng trăm lần mỗi
// request (composite report đọc nhiều khối nguồn + tra "Ánh xạ Điểm -
// STK_ID", không rẻ). CHẠY TUẦN TỰ (không Promise.all) — tránh N request
// cùng tranh connection pool DWH/RP cùng lúc (xem cảnh báo tương tự ở
// etl/jobs/scheduler.js:MAX_CONCURRENT_JOBS) — chấp nhận chậm hơn để an
// toàn pool, vì tính năng này KHÔNG tự refresh mỗi 30s như Ô Realtime
// thường (rp-user chỉ gọi lại khi người dùng đổi bộ lọc — xem
// RealtimeCompareTile.jsx).
const MAX_COMPARE_DAYS = 31;
const MAX_COMPARE_MONTHS = 12;
// GROUP_ENTITY_LABELS (bản 10.65, theo yêu cầu người dùng — "so sánh theo
// MINIMART, so sánh theo MART, so sánh theo [Tổng]") — ĐÚNG 3 nhãn
// `tenCuaHang` của dòng "Tổng cộng"/"Tổng cộng <nhóm>" mà
// lib/compositeReportRunner.js TỰ SINH SẴN khi definition.groupBy có khai
// (xem scripts/seedLdtdHcrcReports.js:groupBy — field 'current.dimensions.
// chain', groups MART/MINIMART, grandTotalLabel 'Tổng cộng') — KHÔNG tính
// lại gì cả, chỉ đọc ĐÚNG 3 dòng đã có sẵn trong mỗi lần chạy báo cáo (dòng
// __isSubtotal/__isGrandTotal mà computeCompareSeries() TRƯỚC ĐÂY (bản
// 10.62) đang BỎ QUA hẳn — giờ giữ lại, tách riêng vào `groups` thay vì lẫn
// vào `stores`). Thứ tự CỐ ĐỊNH (không sort theo alphabet) — khớp đúng thứ
// tự MART/MINIMART/Tổng người dùng liệt kê.
const GROUP_ENTITY_LABELS = ['Tổng cộng MART', 'Tổng cộng MINIMART', 'Tổng cộng'];

function enumerateDayBuckets(fromDate, toDate) {
  const buckets = [];
  for (let d = fromDate; d <= toDate; d = addDaysISO(d, 1)) {
    buckets.push({ key: d, label: formatDateVN(d), from: d, to: d });
  }
  return buckets;
}

function enumerateMonthBuckets(fromDate, toDate, todayStr) {
  const buckets = [];
  let cursor = firstOfMonth(fromDate);
  const endCursor = firstOfMonth(toDate);
  while (cursor <= endCursor) {
    const to = lastOfMonth(cursor) < todayStr ? lastOfMonth(cursor) : todayStr;
    buckets.push({ key: cursor.slice(0, 7), label: formatMonthLabel(cursor), from: cursor, to });
    const [y, m] = cursor.split('-').map(Number);
    cursor = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`;
  }
  return buckets;
}

// Tách riêng để /realtime-compare (JSON cho biểu đồ/bảng web) VÀ
// /realtime-compare/export (Excel/PDF, bản 10.64) dùng CHUNG đúng 1 logic
// tính buckets/series — tránh lặp lại vòng lặp runDefinition() ở 2 nơi,
// dễ lệch nhau khi sửa sau này. Ném lỗi { status, message } khi body sai/
// vượt giới hạn — nơi gọi (route) tự bắt và trả đúng mã lỗi HTTP.
// includeLastYear (bản 10.65, theo yêu cầu người dùng — "so sánh ... theo
// ngày, theo tháng và so với năm cùng kỳ") — BẬT thì đổi filters.cheDoSoSanh
// từ 'past' (mặc định mọi Ô Realtime, ẩn hẳn khối Cùng kỳ/LFL để khỏi tốn
// thêm 1 truy vấn domain GỐC mỗi mốc — xem RealtimeReportTile.jsx) sang
// 'full' để composite report TỰ chạy thêm khối `lastYear`/`lastYearGD`
// (dateOffsetYears:-1, xem seedLdtdHcrcReports.js) — ĐỌC THẲNG cột có sẵn
// `dt_cungKy` (= lastYear.measures.doanhThu), KHÔNG tự tính/gọi thêm API
// nào khác. CHỈ bật khi người dùng THỰC SỰ cần (mặc định false) vì tốn
// thêm đúng 1 truy vấn domain GỐC/mốc — đắt hơn hẳn so với mặc định 'past'.
async function computeCompareSeries(req) {
  const { reportId, dateMode, fromDate, toDate, includeLastYear } = req.body || {};
  if (!reportId || !req.userContext.isSystemRole && !req.userContext.reportIds.has(reportId)) {
    throw Object.assign(new Error('Bạn không có quyền xem báo cáo này'), { status: 403 });
  }
  if (!['day', 'month'].includes(dateMode)) throw Object.assign(new Error('dateMode phải là "day" hoặc "month"'), { status: 400 });
  if (!fromDate || !toDate || fromDate > toDate) throw Object.assign(new Error('Thiếu hoặc sai khoảng fromDate/toDate'), { status: 400 });

  const definition = await loadDefinition(reportId);
  if (!definition || !definition.isActive) throw Object.assign(new Error('Không tìm thấy báo cáo'), { status: 404 });

  const today = vietnamTodayISO();
  const buckets = dateMode === 'day' ? enumerateDayBuckets(fromDate, toDate) : enumerateMonthBuckets(fromDate, toDate, today);
  const maxBuckets = dateMode === 'day' ? MAX_COMPARE_DAYS : MAX_COMPARE_MONTHS;
  if (buckets.length > maxBuckets) {
    throw Object.assign(new Error(`Khoảng đã chọn có ${buckets.length} ${dateMode === 'day' ? 'ngày' : 'tháng'}, vượt quá tối đa ${maxBuckets} — thu hẹp khoảng ngày lại.`), { status: 400 });
  }

  const series = {}; // { tenCuaHang: [giá trị theo đúng thứ tự buckets] } — CẢ siêu thị LẪN 3 dòng nhóm
  const seriesLastYear = includeLastYear ? {} : null;
  const storeNames = new Set();
  const groupNames = new Set();
  for (let i = 0; i < buckets.length; i++) {
    const bucket = buckets[i];
    const filters = {
      eventDate: { from: bucket.from, to: bucket.to },
      cheDoSoSanh: includeLastYear ? 'full' : 'past',
      __storeScope: req.userContext.storeScope
    };
    // eslint-disable-next-line no-await-in-loop
    const { rows } = await runDefinition(definition, filters, { page: 1, pageSize: 1000 });
    for (const row of rows) {
      if (!row.tenCuaHang) continue;
      // __isSubtotal (KHÔNG riêng __isGrandTotal) — đúng CẢ 3 dòng nhóm
      // (2 "Tổng cộng MART"/"Tổng cộng MINIMART" lẫn 1 "Tổng cộng" cuối
      // cùng đều mang __isSubtotal=true, xem lib/compositeReportRunner.js).
      (row.__isSubtotal ? groupNames : storeNames).add(row.tenCuaHang);
      if (!series[row.tenCuaHang]) series[row.tenCuaHang] = new Array(buckets.length).fill(0);
      series[row.tenCuaHang][i] = typeof row.dt_thucDat === 'number' ? row.dt_thucDat : 0;
      if (seriesLastYear) {
        if (!seriesLastYear[row.tenCuaHang]) seriesLastYear[row.tenCuaHang] = new Array(buckets.length).fill(0);
        seriesLastYear[row.tenCuaHang][i] = typeof row.dt_cungKy === 'number' ? row.dt_cungKy : 0;
      }
    }
  }

  return {
    dateMode, fromDate, toDate, reportTitle: definition.title,
    buckets: buckets.map(b => ({ key: b.key, label: b.label })),
    stores: [...storeNames].sort((a, b) => a.localeCompare(b, 'vi')),
    groups: GROUP_ENTITY_LABELS.filter(label => groupNames.has(label)),
    series,
    ...(seriesLastYear ? { seriesLastYear } : {})
  };
}

router.post('/:dashboardId/realtime-compare', async (req, res, next) => {
  try {
    const result = await computeCompareSeries(req);
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// POST /:dashboardId/realtime-compare/export (bản 10.64, theo yêu cầu người
// dùng — "cho tôi xuất ra file Excel và PDF" cho phần So sánh siêu thị) —
// LUÔN xuất ĐÚNG bảng pivot (mỗi dòng 1 mốc thời gian, mỗi cột 1 siêu thị
// đã CHỌN) — giống quy ước MỌI nút "Xuất" khác trong hệ thống (xem chú
// thích POST /:dashboardId/export phía trên): xuất bảng số liệu đầy đủ,
// KHÔNG xuất ảnh biểu đồ (đường/cột/tròn người xem đang chọn trên web).
// body.stores (TUỲ CHỌN) — đúng danh sách siêu thị người dùng đã TICK trên
// web lúc bấm Xuất; rỗng/không gửi -> xuất ĐỦ mọi siêu thị trả về.
// body.entities (bản 10.65, THAY cho body.stores cũ — vẫn đọc được
// body.stores để không vỡ client cũ) — danh sách TÊN đã chọn trên web,
// CÓ THỂ LÀ siêu thị HOẶC 1 trong 3 nhãn nhóm (GROUP_ENTITY_LABELS) — xuất
// ĐÚNG những entity đã tick, không quan tâm là siêu thị hay nhóm (đều nằm
// chung trong result.series). includeLastYear BẬT -> mỗi entity xuất
// THÊM 1 cột "<tên> (Cùng kỳ)" ngay cạnh cột "<tên> (Năm nay)".
router.post('/:dashboardId/realtime-compare/export', async (req, res, next) => {
  try {
    const { format = 'excel', entities: requestedEntities, stores: requestedStores, scopeLabel } = req.body || {};
    if (!['excel', 'pdf'].includes(format)) return res.status(400).json({ error: `Định dạng xuất "${format}" chưa được hỗ trợ` });

    const result = await computeCompareSeries(req);
    const allEntities = [...result.stores, ...result.groups];
    const requested = Array.isArray(requestedEntities) && requestedEntities.length ? requestedEntities
      : (Array.isArray(requestedStores) && requestedStores.length ? requestedStores : null);
    const entities = requested ? allEntities.filter(name => requested.includes(name)) : allEntities;
    if (!entities.length) return res.status(400).json({ error: 'Không có mục nào để xuất — chọn ít nhất 1 siêu thị/nhóm trên web rồi xuất lại.' });

    // KHÔNG dùng periodLabelFor() ở trên — hàm đó cho 'month' chỉ tính 1
    // THÁNG DUY NHẤT (chứa toDate, đúng nghĩa vụ cũ "cộng dồn 1 tháng"), ở
    // đây fromDate/toDate là khoảng NHIỀU mốc (ngày hoặc tháng) nên luôn
    // hiện ĐÚNG khoảng ngày gốc người dùng đã chọn, cho cả 2 chế độ.
    const periodLabel = result.fromDate === result.toDate ? formatDateVN(result.fromDate) : `${formatDateVN(result.fromDate)} - ${formatDateVN(result.toDate)}`;
    const title = `${result.reportTitle} — ${scopeLabel || 'So sánh siêu thị'} theo thời gian (${periodLabel})`;
    const entityColumnKey = (name, suffix) => suffix ? `${name}__${suffix}` : name;
    const columns = [{ key: 'bucket', label: result.dateMode === 'day' ? 'Ngày' : 'Tháng' }];
    entities.forEach(name => {
      columns.push({ key: entityColumnKey(name), label: result.seriesLastYear ? `${name} (Năm nay)` : name });
      if (result.seriesLastYear) columns.push({ key: entityColumnKey(name, 'cungky'), label: `${name} (Cùng kỳ)` });
    });
    const exportDefinition = { title, columns };
    const rows = result.buckets.map((b, i) => {
      const row = { bucket: b.label };
      entities.forEach(name => {
        row[entityColumnKey(name)] = result.series[name]?.[i] ?? 0;
        if (result.seriesLastYear) row[entityColumnKey(name, 'cungky')] = result.seriesLastYear[name]?.[i] ?? 0;
      });
      return row;
    });

    const fileBase = `${scopeLabel || 'So sanh sieu thi'} - ${result.toDate.split('-').reverse().join('')}`;
    if (format === 'excel') {
      const buffer = await exportExcel(exportDefinition, rows);
      await logAction(req, { module: 'Dashboard', actionType: 'XUAT_DASHBOARD', targetObject: req.params.dashboardId, description: `Xuất Excel "${scopeLabel || 'So sánh siêu thị'}" (${entities.length} mục, ${rows.length} mốc)` });
      res.attachment(`${fileBase}.xlsx`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buffer);
    }
    const buffer = await exportPdf(exportDefinition, rows);
    await logAction(req, { module: 'Dashboard', actionType: 'XUAT_DASHBOARD', targetObject: req.params.dashboardId, description: `Xuất PDF "${scopeLabel || 'So sánh siêu thị'}" (${entities.length} mục, ${rows.length} mốc)` });
    res.attachment(`${fileBase}.pdf`);
    res.setHeader('Content-Type', 'application/pdf');
    return res.send(buffer);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
