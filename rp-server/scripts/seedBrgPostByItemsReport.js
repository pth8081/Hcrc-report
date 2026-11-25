// scripts/seedBrgPostByItemsReport.js — Tạo/CẬP NHẬT idempotent báo cáo
// "BRG Weekly Post - Theo mã hàng" (bc-brg-post-by-items) — bản 11.24,
// theo yêu cầu đội MKT, dựa trên sheet "By items" file mẫu thật
// "BRG_Weekly_Post_T6K1_BC1.xlsx" — xem "bc-brg-weekly-post.md" +
// lib/brgPostByItemsRunner.js.
//
// ĐIỀU KIỆN TRƯỚC KHI CHẠY: đã tạo ít nhất 1 chiến dịch + upload file
// SKU/trọng số siêu thị qua etl-admin → "Chiến dịch khuyến mãi (BRG
// Weekly Post)" — xem "bc-brg-weekly-post.md" mục 3. Đã có domain
// `doanhthu_sku_nganhhang`/`tonkho_chitiet_sku` chạy sẵn (2 báo cáo
// `bc-doanh-thu-sku-nganhhang`/`bc-ton-kho-chi-tiet`).
//
// Cách dùng:
//   node scripts/seedBrgPostByItemsReport.js [menuCode]
require('dotenv').config();
const { sql, getPool } = require('../db');

const SOURCE_TYPE = 'brgPostByItems';
const REPORT_ID = 'bc-brg-post-by-items';
const TITLE = 'BRG Weekly Post - Theo mã hàng';
// domain KHÔNG dùng thật (SourceType này tự đọc dwh.PromoCampaigns* +
// 2 domain thực tế bên trong lib/brgWeeklyPostCore.js) — khai 1 giá trị
// vô hại để khớp ràng buộc NOT NULL của app.ReportCatalog.Domain.
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
  console.log('✅ Xong. NHỚ:');
  console.log('   1. Vào Hệ thống → Phân quyền, gán quyền xem cho báo cáo bc-brg-post-by-items.');
  console.log('   2. Tạo ít nhất 1 chiến dịch + upload file SKU/trọng số siêu thị ở etl-admin');
  console.log('      → "Chiến dịch khuyến mãi (BRG Weekly Post)" trước khi chạy thử báo cáo.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
