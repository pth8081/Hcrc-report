// scripts/seedTop5ChiNhanhReports.js — Tạo/CẬP NHẬT idempotent Dashboard
// "Top 5 chi nhánh" (bản 8.20 — xem VERSION.md): 8 báo cáo "Top N"
// (SourceType='composite', dùng definition.topN — xem lib/compositeReportRunner.js)
// + 1 app.Dashboards ghép 16 ô (8 báo cáo x 2: "Trong ngày"/"Trong tháng",
// cùng 1 bộ lọc ngày báo cáo duy nhất — xem rp-user/src/modules/dashboard/
// DashboardPage.jsx). Chạy LẠI file này an toàn — khớp theo ReportId/
// DashboardId để UPDATE thay vì tạo trùng.
//
// 8 báo cáo = {MART, MINIMART} x {Doanh thu, Giao dịch} x {Cao nhất, Thấp
// nhất} — KHÔNG tách riêng báo cáo cho "trong ngày"/"trong tháng" (đó chỉ là
// khoảng eventDate khác nhau truyền lúc CHẠY báo cáo, xem
// rp-user/src/modules/dashboard/DashboardTile.jsx:computeEventDateRange()),
// nên Dashboard có 16 Ô nhưng chỉ cần 8 ĐỊNH NGHĨA báo cáo.
//
// Dữ liệu đọc từ domain "doanhthu_chinhanh"/"giaodich_chinhanh" ĐÃ CÓ sẵn
// (dùng chung với 4 báo cáo "Báo cáo doanh thu cuối ngày", xem
// scripts/seedLdtdHcrcReports.js) — KHÔNG cần job/VIEW mới, chỉ cần job
// "doanhthu_chinhanh" đã bật Dimension "chain" (MART/MINIMART, xem
// hướng_dẫn_báo_cáo.md mục 1) và "Ánh xạ Điểm - STK_ID" đã khai cho các mã
// Điểm liên quan (requireDiemStkMapping bên dưới).
//
// Cách dùng:
//   node scripts/seedTop5ChiNhanhReports.js [menuCode]
// menuCode (tuỳ chọn) — Code trong app.MenuItems để gán 8 báo cáo vào (vẫn
// xem/xuất được riêng lẻ ở trang Báo cáo, không chỉ trong Dashboard), mặc
// định "reports-kinh-doanh".
require('dotenv').config();
const { sql, getPool } = require('../db');

const CHAINS = [
  { key: 'mart', value: 'MART', label: 'MART' },
  { key: 'minimart', value: 'MINIMART', label: 'MINIMART' }
];
const METRICS = [
  { key: 'doanhthu', label: 'Doanh thu', field: 'current.measures.doanhThu', metricTab: 'revenue' },
  { key: 'giaodich', label: 'Giao dịch', field: 'currentGD.measures.SoGiaoDich', metricTab: 'transactions' }
];
const DIRECTIONS = [
  { key: 'cao', label: 'cao nhất', direction: 'desc' },
  { key: 'thap', label: 'thấp nhất', direction: 'asc' }
];
const TOP_N_LIMIT = 5;

// Khối current/currentGD GIỐNG HỆT 2 khối cùng tên trong
// scripts/seedLdtdHcrcReports.js (useDiemStkMapping/mapBuIdToMaDiem — xem
// chú thích đầy đủ ở đó) — dùng chung domain gốc "doanhthu_chinhanh"/
// "giaodich_chinhanh" (TOÀN BỘ chi nhánh trung tâm, KHÔNG phải domain
// "Thành viên" riêng — Top 5 toàn hệ thống nên cần tập hợp chi nhánh rộng
// nhất đang có dữ liệu đầy đủ). requireDiemStkMapping: true để loại mã rác/
// mã chưa khai ánh xạ (tên trống + không có "chain" để lọc Mart/Minimart).
function buildDefinition(chain, metric, direction) {
  return {
    title: `Top 5 ${chain.label} — ${metric.label} ${direction.label}`,
    domain: 'doanhthu_chinhanh',
    filters: [
      { field: 'eventDate', type: 'dateRange', label: 'Khoảng ngày báo cáo' }
    ],
    blocks: [
      { key: 'current', sourceType: 'directDb', domain: 'doanhthu_chinhanh', useDiemStkMapping: true },
      { key: 'currentGD', sourceType: 'directDb', domain: 'giaodich_chinhanh', mapBuIdToMaDiem: true }
    ],
    requireDiemStkMapping: true,
    columns: [
      { key: 'stt', label: 'TT', width: 0.4 },
      { key: 'tenCuaHang', label: 'Siêu thị/Cửa hàng', formula: 'current.dimensions.tenSieuThi || entityCode', width: 2.4 },
      { key: 'doanhThu', label: 'Doanh thu', formula: 'current.measures.doanhThu', width: 1.2 },
      { key: 'soGiaoDich', label: 'Giao dịch', formula: 'currentGD.measures.SoGiaoDich', width: 1 }
    ],
    topN: {
      field: metric.field,
      direction: direction.direction,
      limit: TOP_N_LIMIT,
      filterField: 'current.dimensions.chain',
      filterValue: chain.value
    }
  };
}

function buildReports() {
  const reports = [];
  for (const chain of CHAINS) {
    for (const metric of METRICS) {
      for (const direction of DIRECTIONS) {
        reports.push({
          reportId: `top5-${chain.key}-${metric.key}-${direction.key}`,
          title: `Top 5 ${chain.label} — ${metric.label} ${direction.label}`,
          exportFileCode: `TOP5-${chain.value}-${metric.key.toUpperCase()}-${direction.key.toUpperCase()}`,
          chain, metric, direction,
          definition: buildDefinition(chain, metric, direction)
        });
      }
    }
  }
  return reports;
}

async function upsertReport(pool, menuItemId, { reportId, title, definition }) {
  const definitionJson = JSON.stringify(definition);
  const existing = await pool.request().input('reportId', sql.VarChar(80), reportId)
    .query('SELECT ReportId FROM app.ReportCatalog WHERE ReportId = @reportId');
  if (existing.recordset.length) {
    await pool.request()
      .input('reportId', sql.VarChar(80), reportId)
      .input('title', sql.NVarChar(200), title)
      .input('menuItemId', sql.Int, menuItemId)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .query(`
        UPDATE app.ReportCatalog SET
          Title = @title, Domain = 'doanhthu_chinhanh', MenuItemId = @menuItemId, DataSourceId = NULL,
          SourceType = 'composite', ApiConnectionId = NULL, ApiTarget = NULL, ExternalConnectionId = NULL,
          DefinitionJson = @definitionJson, IsActive = 1
        WHERE ReportId = @reportId
      `);
    console.log(`↻ Đã cập nhật báo cáo "${title}" (${reportId}).`);
    return;
  }
  await pool.request()
    .input('reportId', sql.VarChar(80), reportId)
    .input('title', sql.NVarChar(200), title)
    .input('menuItemId', sql.Int, menuItemId)
    .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
    .query(`
      INSERT INTO app.ReportCatalog (ReportId, Title, Domain, MenuItemId, SourceType, DefinitionJson)
      VALUES (@reportId, @title, 'doanhthu_chinhanh', @menuItemId, 'composite', @definitionJson)
    `);
  console.log(`✅ Đã tạo báo cáo "${title}" (${reportId}).`);
}

const DASHBOARD_ID = 'top5-chi-nhanh';
const DASHBOARD_TITLE = 'Top 5 chi nhánh';

// dateMode (tiêu thụ ở DashboardTile.jsx/Top5ChartTile.jsx, KHÔNG phải
// trường chuẩn của app.Dashboards.tiles — xem routes/dashboards.js, tile
// object đi nguyên vẹn qua route đó) — 'day': eventDate = {from: fromDate,
// to: toDate} (ĐÚNG khoảng "Từ ngày — đến ngày" người dùng chọn); 'month':
// eventDate = NGUYÊN THÁNG chứa toDate (xem rp-user/src/lib/dateRange.js).
// metricTab dùng để DashboardPage lọc hiện đúng 8/16 ô theo tab đang chọn
// ("Xếp theo Doanh thu"/"Xếp theo Giao dịch") — xem DashboardPage.jsx.
//
// tile.title (bản 8.22) KHÔNG còn kèm "(Trong ngày)"/"(Trong tháng)" tĩnh —
// DashboardTile.jsx/routes/dashboards.js tự ghép thêm nhãn ngày/tháng ĐỘNG
// vào cuối theo đúng bộ lọc đang chọn (vd "(15/09/2026)"/"(Tháng 9/2026)"),
// đổi ngày là tiêu đề tự cập nhật theo, không lưu cứng ngày lúc seed.
function buildTiles(reports) {
  const tiles = [];
  for (const r of reports) {
    for (const period of [{ key: 'ngay', dateMode: 'day' }, { key: 'thang', dateMode: 'month' }]) {
      tiles.push({
        key: `${r.reportId}-${period.key}`,
        reportId: r.reportId,
        title: `Top 5 ${r.chain.label} — ${r.metric.label} ${r.direction.label}`,
        dateMode: period.dateMode,
        metricTab: r.metric.metricTab,
        chain: r.chain.key
      });
    }
  }
  return tiles;
}

async function upsertDashboard(pool, tiles) {
  const definitionJson = JSON.stringify({ tiles });
  const existing = await pool.request().input('dashboardId', sql.VarChar(80), DASHBOARD_ID)
    .query('SELECT DashboardId FROM app.Dashboards WHERE DashboardId = @dashboardId');
  if (existing.recordset.length) {
    await pool.request()
      .input('dashboardId', sql.VarChar(80), DASHBOARD_ID)
      .input('title', sql.NVarChar(200), DASHBOARD_TITLE)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .query(`
        UPDATE app.Dashboards SET Title = @title, DefinitionJson = @definitionJson, IsActive = 1
        WHERE DashboardId = @dashboardId
      `);
    console.log(`↻ Đã cập nhật dashboard "${DASHBOARD_TITLE}" (${DASHBOARD_ID}).`);
    return;
  }
  await pool.request()
    .input('dashboardId', sql.VarChar(80), DASHBOARD_ID)
    .input('title', sql.NVarChar(200), DASHBOARD_TITLE)
    .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
    .query(`
      INSERT INTO app.Dashboards (DashboardId, Title, DefinitionJson)
      VALUES (@dashboardId, @title, @definitionJson)
    `);
  console.log(`✅ Đã tạo dashboard "${DASHBOARD_TITLE}" (${DASHBOARD_ID}).`);
}

async function main() {
  const menuCode = process.argv[2] || 'reports-kinh-doanh';
  const pool = await getPool('RP');

  const menuRow = await pool.request().input('code', sql.VarChar(50), menuCode)
    .query('SELECT Id FROM app.MenuItems WHERE Code = @code');
  if (!menuRow.recordset.length) {
    console.error(`⛔ Không tìm thấy menu "${menuCode}" trong app.MenuItems — kiểm tra lại Code hoặc chạy rp-db/schema.sql trước.`);
    process.exit(1);
  }
  const menuItemId = menuRow.recordset[0].Id;

  const reports = buildReports();
  for (const report of reports) {
    await upsertReport(pool, menuItemId, report);
  }
  await upsertDashboard(pool, buildTiles(reports));

  console.log('');
  console.log('✅ Xong — 8 báo cáo Top 5 + Dashboard "Top 5 chi nhánh" (16 ô) đã sẵn sàng.');
  console.log('   NHỚ vào Hệ thống → Phân quyền, gán quyền xem 8 báo cáo "Top 5 ..." cho đúng');
  console.log('   vai trò — script này KHÔNG tự gán quyền (giống mọi báo cáo khác).');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
