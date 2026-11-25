// scripts/seedBrgWeeklyPostReport.js — Tạo/CẬP NHẬT idempotent báo cáo DUY
// NHẤT "BRG Weekly Post" (bc-brg-weekly-post, SourceType='brgWeeklyPost',
// bản 11.26, theo yêu cầu người dùng — "Weekly post vào 1 file chia nhiều
// sheet mà bạn" + "Sao lại có những bc này bạn? Có 3 báo cáo thôi") — THAY
// THẾ 5 báo cáo riêng đã tạo ở bản 11.24 (bc-brg-post-by-items/-by-store/
// -rankings/-recap/-detail): script này XOÁ 5 dòng app.ReportCatalog cũ đó
// (cascade tự xoá hẳn RoleReportAccess liên quan — xem rp-db/schema.sql,
// FK ReportId... ON DELETE CASCADE) rồi tạo 1 báo cáo mới DUY NHẤT, chọn
// "sheet" muốn xem qua bộ lọc nội bộ — xem lib/brgWeeklyPostRunner.js.
//
// KHÔNG xoá/sửa logic 5 hàm run...Report() cũ (lib/brgPost*Runner.js) —
// báo cáo mới chỉ ĐIỀU PHỐI sang chúng, không viết lại công thức.
//
// ĐIỀU KIỆN TRƯỚC KHI CHẠY: giống hệt 5 báo cáo cũ — đã tạo ít nhất 1
// chiến dịch + upload file SKU/trọng số siêu thị qua etl-admin → "Chiến
// dịch khuyến mãi (BRG Weekly Post)" — xem "bc-brg-weekly-post.md".
//
// Cách dùng:
//   node scripts/seedBrgWeeklyPostReport.js [menuCode]
require('dotenv').config();
const { sql, getPool } = require('../db');
const { SHEET_OPTIONS, DEFAULT_SHEET } = require('../lib/brgWeeklyPostRunner');

const SOURCE_TYPE = 'brgWeeklyPost';
const REPORT_ID = 'bc-brg-weekly-post';
const TITLE = 'BRG Weekly Post';
// domain KHÔNG dùng thật — giống 5 báo cáo cũ (xem lib/brgWeeklyPostCore.js).
const DOMAIN = 'brg_weekly_post';
// 5 ReportId CŨ (bản 11.24) — XOÁ hẳn khỏi app.ReportCatalog khi chạy script
// này, KHÔNG chỉ ẩn (IsActive=0) — người dùng xác nhận chỉ muốn ĐÚNG 1 báo
// cáo hiện trong menu "Báo cáo MKT", không muốn thấy 5 dòng cũ dù tắt hoạt
// động. Cascade FK tự xoá RoleReportAccess — không orphan quyền đã gán.
const OLD_REPORT_IDS = [
  'bc-brg-post-by-items', 'bc-brg-post-by-store', 'bc-brg-post-rankings',
  'bc-brg-post-recap', 'bc-brg-post-detail'
];
const FILTERS = [
  { field: 'campaignId', type: 'select', label: 'Chiến dịch khuyến mãi', optionsSource: { promoCampaigns: true } },
  {
    field: 'sheet', type: 'select', label: 'Chọn sheet', default: DEFAULT_SHEET,
    options: SHEET_OPTIONS.map(s => ({ value: s.value, label: s.label }))
  }
];

function buildDefinition() {
  return { title: TITLE, domain: DOMAIN, filters: FILTERS };
}

async function upsertReport(pool, menuItemId) {
  const definitionJson = JSON.stringify(buildDefinition());
  const existing = await pool.request().input('reportId', sql.VarChar(80), REPORT_ID)
    .query('SELECT ReportId FROM app.ReportCatalog WHERE ReportId = @reportId');

  if (existing.recordset.length) {
    await pool.request()
      .input('reportId', sql.VarChar(80), REPORT_ID)
      .input('title', sql.NVarChar(200), TITLE)
      .input('domain', sql.VarChar(50), DOMAIN)
      .input('sourceType', sql.VarChar(30), SOURCE_TYPE)
      .input('menuItemId', sql.Int, menuItemId)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .query(`
        UPDATE app.ReportCatalog SET
          Title = @title, Domain = @domain, MenuItemId = @menuItemId, DataSourceId = NULL,
          SourceType = @sourceType, ApiConnectionId = NULL, ApiTarget = NULL, ExternalConnectionId = NULL,
          DefinitionJson = @definitionJson, IsActive = 1
        WHERE ReportId = @reportId
      `);
    console.log(`↻ Đã cập nhật báo cáo "${TITLE}" (${REPORT_ID}).`);
  } else {
    await pool.request()
      .input('reportId', sql.VarChar(80), REPORT_ID)
      .input('title', sql.NVarChar(200), TITLE)
      .input('domain', sql.VarChar(50), DOMAIN)
      .input('sourceType', sql.VarChar(30), SOURCE_TYPE)
      .input('menuItemId', sql.Int, menuItemId)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .query(`
        INSERT INTO app.ReportCatalog (ReportId, Title, Domain, MenuItemId, SourceType, DefinitionJson)
        VALUES (@reportId, @title, @domain, @menuItemId, @sourceType, @definitionJson)
      `);
    console.log(`✅ Đã tạo báo cáo "${TITLE}" (${REPORT_ID}).`);
  }
}

async function removeOldReports(pool) {
  for (const oldId of OLD_REPORT_IDS) {
    const result = await pool.request().input('reportId', sql.VarChar(80), oldId)
      .query('DELETE FROM app.ReportCatalog WHERE ReportId = @reportId');
    if (result.rowsAffected[0] > 0) {
      console.log(`🗑️  Đã xoá báo cáo cũ "${oldId}" (+ mọi quyền xem đã gán, cascade tự xoá).`);
    }
  }
}

async function main() {
  const menuCode = process.argv[2] || 'reports-adhoc';
  const pool = await getPool('RP');

  const menuRow = await pool.request().input('code', sql.VarChar(50), menuCode)
    .query('SELECT Id FROM app.MenuItems WHERE Code = @code');
  if (!menuRow.recordset.length) {
    console.error(`⛔ Không tìm thấy menu "${menuCode}" trong app.MenuItems — kiểm tra lại Code hoặc chạy rp-db/schema.sql trước.`);
    process.exit(1);
  }
  const menuItemId = menuRow.recordset[0].Id;

  await upsertReport(pool, menuItemId);
  await removeOldReports(pool);

  console.log('');
  console.log('✅ Xong. NHỚ:');
  console.log('   1. Vào Hệ thống → Phân quyền, gán quyền xem cho báo cáo bc-brg-weekly-post');
  console.log('      — mặc định KHÔNG ai xem được, kể cả admin (quyền của 5 báo cáo cũ ĐÃ MẤT');
  console.log('      theo cascade xoá — gán lại quyền mới cho báo cáo gộp này).');
  console.log('   2. Tạo ít nhất 1 chiến dịch + upload file SKU/trọng số siêu thị ở etl-admin');
  console.log('      → "Chiến dịch khuyến mãi (BRG Weekly Post)" trước khi chạy thử báo cáo.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
