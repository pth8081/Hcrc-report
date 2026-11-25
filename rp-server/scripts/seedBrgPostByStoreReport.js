// scripts/seedBrgPostByStoreReport.js — Tạo/CẬP NHẬT idempotent báo cáo
// "BRG Weekly Post - Theo siêu thị" (bc-brg-post-by-store) — bản 11.24,
// theo yêu cầu đội MKT, dựa trên sheet "By Store" file mẫu thật — xem
// "bc-brg-weekly-post.md" + lib/brgPostByStoreRunner.js. CÙNG điều kiện
// triển khai với "Theo mã hàng" (bc-brg-post-by-items) — xem file đó.
//
// Cách dùng:
//   node scripts/seedBrgPostByStoreReport.js [menuCode]
require('dotenv').config();
const { sql, getPool } = require('../db');

const SOURCE_TYPE = 'brgPostByStore';
const REPORT_ID = 'bc-brg-post-by-store';
const TITLE = 'BRG Weekly Post - Theo siêu thị';
const DOMAIN = 'brg_weekly_post';
const FILTERS = [{
  field: 'campaignId', type: 'select', label: 'Chiến dịch khuyến mãi',
  optionsSource: { promoCampaigns: true }
}];

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

  console.log('');
  console.log('✅ Xong. Gán quyền xem cho bc-brg-post-by-store ở Hệ thống → Phân quyền.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
