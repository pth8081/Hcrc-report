// scripts/seedTop5ChiNhanhReports.js — Tạo/CẬP NHẬT idempotent Dashboard
// "Top 5 chi nhánh" (bản 8.20 — xem VERSION.md): 8 báo cáo "Top N"
// (SourceType='composite', dùng definition.topN — xem lib/compositeReportRunner.js)
// + 1 app.Dashboards ghép 16 ô (8 báo cáo x 2: "Trong ngày"/"Trong tháng",
// cùng 1 bộ lọc ngày báo cáo duy nhất — xem rp-user/src/modules/dashboard/
// DashboardPage.jsx) + 4 ô "Realtime" (bản 8.24 — xem REALTIME_TILES bên
// dưới, tái dùng báo cáo "bc-doanh-thu-hcrc" đã có sẵn, KHÔNG tạo report
// mới ở file này). Chạy LẠI file này an toàn — khớp theo ReportId/
// DashboardId để UPDATE thay vì tạo trùng. CHẠY SAU
// scripts/seedLdtdHcrcReports.js ít nhất 1 lần (để "bc-doanh-thu-hcrc" đã
// tồn tại trước khi 4 ô Realtime tham chiếu tới).
//
// 8 báo cáo = {MART, MINIMART} x {Doanh thu, Giao dịch} x {Cao nhất, Thấp
// nhất} — KHÔNG tách riêng báo cáo cho "trong ngày"/"trong tháng" (đó chỉ là
// khoảng eventDate khác nhau truyền lúc CHẠY báo cáo, xem
// rp-user/src/modules/dashboard/DashboardTile.jsx:computeEventDateRange()),
// nên Dashboard có 16 Ô nhưng chỉ cần 8 ĐỊNH NGHĨA báo cáo.
//
// Dữ liệu đọc từ domain "Thành viên" (bản 8.34 — xem ACTIVE_DOMAIN bên
// dưới, đổi từ domain gốc "doanhthu_chinhanh"/"giaodich_chinhanh" trước
// đó) — job Live "doanhthu_chinhanh_thanhvien" phải đã bật Dimension
// "chain" (MART/MINIMART, xem hướng_dẫn_báo_cáo.md mục 1) và "Ánh xạ Điểm
// - STK_ID" đã khai cho các mã Điểm liên quan (requireDiemStkMapping bên
// dưới) — CHỈ các siêu thị đã khai Live "Thành viên" mới vào được Top 5.
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
// chú thích đầy đủ ở đó).
//
// ĐỔI sang domain "Thành viên" (bản 8.34, theo yêu cầu người dùng — đọc
// Doanh thu/Giao dịch TRỰC TIẾP từ 34 siêu thị Live mỗi 2 phút, chính xác/
// mới hơn đồng bộ tập trung mỗi 15 phút của domain gốc) — CHẤP NHẬN ĐÁNH
// ĐỔI: Top 5 giờ CHỈ xếp hạng trong đúng các siêu thị đã khai Live "Thành
// viên" (34 site tại thời điểm đổi, xem "báo cáo doanh thu thành viên.md"),
// KHÔNG còn phủ toàn bộ hệ thống như domain gốc trước đây — chi nhánh nào
// chưa khai Live sẽ KHÔNG xuất hiện trong Top 5 cho tới khi khai báo xong.
// Đổi lại DOMAIN_GOC (xem hằng số bên dưới) nếu cần quay về phủ toàn hệ
// thống trước khi toàn bộ siêu thị lên Live. requireDiemStkMapping: true
// để loại mã rác/mã chưa khai ánh xạ (tên trống + không có "chain" để lọc
// Mart/Minimart).
const DOMAIN_GOC = { revenue: 'doanhthu_chinhanh', transaction: 'giaodich_chinhanh' };
const DOMAIN_THANH_VIEN = { revenue: 'doanhthu_chinhanh_thanhvien', transaction: 'giaodich_chinhanh_thanhvien' };
const ACTIVE_DOMAIN = DOMAIN_THANH_VIEN;

function buildDefinition(chain, metric, direction) {
  return {
    title: `Top 5 ${chain.label} — ${metric.label} ${direction.label}`,
    domain: ACTIVE_DOMAIN.revenue,
    filters: [
      { field: 'eventDate', type: 'dateRange', label: 'Khoảng ngày báo cáo' }
    ],
    blocks: [
      { key: 'current', sourceType: 'directDb', domain: ACTIVE_DOMAIN.revenue, useDiemStkMapping: true },
      { key: 'currentGD', sourceType: 'directDb', domain: ACTIVE_DOMAIN.transaction, mapBuIdToMaDiem: true }
    ],
    requireDiemStkMapping: true,
    columns: [
      { key: 'stt', label: 'TT', width: 0.4 },
      { key: 'tenCuaHang', label: 'Siêu thị/Cửa hàng', formula: 'current.dimensions.tenSieuThi || entityCode', width: 2.4 },
      { key: 'doanhThu', label: 'Doanh thu', formula: 'current.measures.doanhThu', width: 1.2 },
      { key: 'soGiaoDich', label: 'Giao dịch', formula: 'currentGD.measures.SoGiaoDich', width: 1 },
      // Trung bình giá trị 1 giao dịch (bill) — doanh thu / số giao dịch,
      // CÙNG công thức "Trung bình GD" đã dùng ở báo cáo LDTD/HCRC (xem
      // scripts/seedLdtdHcrcReports.js). Chia cho 0 (chi nhánh chưa có giao
      // dịch nào trong kỳ) -> formulaEngine.js tự trả về rỗng, không lỗi.
      { key: 'trungBinhGD', label: 'Trung bình giao dịch', formula: 'ROUND(current.measures.doanhThu / currentGD.measures.SoGiaoDich, 0)', width: 1.2 }
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
      .input('domain', sql.VarChar(50), definition.domain)
      .input('menuItemId', sql.Int, menuItemId)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .query(`
        UPDATE app.ReportCatalog SET
          Title = @title, Domain = @domain, MenuItemId = @menuItemId, DataSourceId = NULL,
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
    .input('domain', sql.VarChar(50), definition.domain)
    .input('menuItemId', sql.Int, menuItemId)
    .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
    .query(`
      INSERT INTO app.ReportCatalog (ReportId, Title, Domain, MenuItemId, SourceType, DefinitionJson)
      VALUES (@reportId, @title, @domain, @menuItemId, 'composite', @definitionJson)
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
// group/groupLabel/groupIcon (bản 8.42, theo yêu cầu người dùng) — gộp các
// Ô vào 1 "nhóm" chọn được ở đầu trang Dashboard (xem DashboardPage.jsx:
// groups/activeGroup) trước khi hiện danh sách Ô bên dưới. KHÔNG cần đổi
// schema/route gì — chỉ 3 field THÊM trên mỗi tile trong DefinitionJson,
// đúng tinh thần "mọi field tuỳ chọn đọc trực tiếp từ tile" đã có sẵn.
// Dashboard/tile KHÁC không khai field này vẫn chạy y hệt trước (không có
// nhóm nào -> không hiện bộ chọn nhóm). Thêm Ô/nhóm mới SAU NÀY chỉ cần
// gắn đúng 3 field này lúc seed, không phải sửa gì ở DashboardPage.jsx.
const TOP5_GROUP = { group: 'top5', groupLabel: 'Top 5 chi nhánh', groupIcon: '🏆' };
const REALTIME_GROUP = { group: 'realtime', groupLabel: 'Realtime', groupIcon: '⚡' };

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
        chain: r.chain.key,
        ...TOP5_GROUP
      });
    }
  }
  return tiles;
}

// Ô "Realtime" (bản 8.24) — TÁI DÙNG NGUYÊN 1 báo cáo đã seed sẵn ở
// scripts/seedLdtdHcrcReports.js (chạy script ĐÓ trước script này ít nhất 1
// lần), KHÔNG tạo report mới — xem rp-user/src/modules/dashboard/
// RealtimeReportTile.jsx. kind:'realtime' + realtimeMode ('table'/'chart')
// là 2 trường RIÊNG của tile này (đi nguyên vẹn qua routes/dashboards.js
// như mọi trường khác của tile, xem DashboardPage.jsx:buildRealtimeTabs())
// — không dùng chung cơ chế metricTab/dateMode suy ra cột như 16 Ô Top 5
// ở trên.
//
// ĐỔI sang 'bc-doanh-thu-hcrc-thanh-vien' (bản 8.28, theo yêu cầu người
// dùng) — khối current/currentGD của báo cáo này đọc Doanh thu/Giao dịch
// LIVE TRỰC TIẾP từng siêu thị (70 Sync Job, xem etl/scripts/
// seedThanhVienLiveSync.js) thay vì qua đồng bộ tập trung mỗi 15 phút như
// bản gốc — đúng tinh thần "Realtime". "Cùng kỳ năm trước" vẫn đọc domain
// gốc (bản 8.27), không đổi gì ở đó. CHỈ ĐỔI ĐÚNG 1 DÒNG NÀY để quay lại
// báo cáo gốc nếu cần (vd 70 job Live Thành viên chưa thiết lập xong).
const REALTIME_REPORT_ID = 'bc-doanh-thu-hcrc-thanh-vien';
const REALTIME_TITLE = 'Doanh thu Realtime HCRC (Thành viên)';
const REALTIME_TILES = [
  { key: 'realtime-ngay', reportId: REALTIME_REPORT_ID, title: REALTIME_TITLE, kind: 'realtime', dateMode: 'day', realtimeMode: 'table', ...REALTIME_GROUP },
  { key: 'realtime-ngay-chart', reportId: REALTIME_REPORT_ID, title: REALTIME_TITLE, kind: 'realtime', dateMode: 'day', realtimeMode: 'chart', ...REALTIME_GROUP },
  { key: 'realtime-thang', reportId: REALTIME_REPORT_ID, title: REALTIME_TITLE, kind: 'realtime', dateMode: 'month', realtimeMode: 'table', ...REALTIME_GROUP },
  { key: 'realtime-thang-chart', reportId: REALTIME_REPORT_ID, title: REALTIME_TITLE, kind: 'realtime', dateMode: 'month', realtimeMode: 'chart', ...REALTIME_GROUP }
];

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
  await upsertDashboard(pool, [...buildTiles(reports), ...REALTIME_TILES]);

  console.log('');
  console.log('✅ Xong — 8 báo cáo Top 5 + Dashboard "Top 5 chi nhánh" (16 ô + 4 ô Realtime) đã sẵn sàng.');
  console.log('   NHỚ vào Hệ thống → Phân quyền, gán quyền xem 8 báo cáo "Top 5 ..." cho đúng');
  console.log('   vai trò — script này KHÔNG tự gán quyền (giống mọi báo cáo khác).');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
