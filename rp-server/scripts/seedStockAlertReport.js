// scripts/seedStockAlertReport.js — Tạo/CẬP NHẬT idempotent báo cáo
// "Cảnh báo hàng tồn" (bc-canh-bao-ton, SourceType='stockAlert') trong
// app.ReportCatalog — đối chiếu tồn kho THẬT với NGƯỠNG RIÊNG cho từng cặp
// (Mã hàng, Siêu thị) do admin tự khai/upload (etl-admin → "Cảnh báo hàng
// tồn", etl.StockAlertThresholds) — xem rp-server/lib/stockAlertRunner.js.
// Chạy LẠI file này an toàn — khớp theo ReportId để UPDATE DefinitionJson
// thay vì tạo trùng.
//
// LƯU Ý QUAN TRỌNG — chạy script này KHÔNG đủ để báo cáo CÓ SỐ LIỆU:
//   1. Cần đã có 2 job banhang_sku/tonkho_sku chạy ổn (xem bc-ton-kho-0.md
//      Bước 1+2) — DÙNG CHUNG, không cần VIEW/job mới.
//   2. Admin đã upload danh sách ngưỡng (etl-admin → "Cảnh báo hàng tồn")
//      — không upload thì báo cáo luôn trả rỗng.
//
// CHƯA gán quyền xem (Hệ thống → Phân quyền) — admin tự làm sau.
//
// Cách dùng:
//   node scripts/seedStockAlertReport.js [menuCode]
require('dotenv').config();
const { sql, getPool } = require('../db');

const REPORT_ID = 'bc-canh-bao-ton';
const TITLE = 'Cảnh báo hàng tồn';

function buildDefinition() {
  return {
    title: TITLE,
    salesDomain: 'banhang_sku',
    stockDomain: 'tonkho_sku',
    filters: [
      {
        field: 'branches', type: 'multiSelect', label: 'Chi nhánh',
        optionsSource: { domain: 'banhang_sku', valueField: 'MaChiNhanh', labelField: 'TenChiNhanh' }
      }
    ]
  };
}

async function upsertReport(pool, menuItemId) {
  const definitionJson = JSON.stringify(buildDefinition());
  const existing = await pool.request().input('reportId', sql.VarChar(80), REPORT_ID)
    .query('SELECT ReportId FROM app.ReportCatalog WHERE ReportId = @reportId');
  if (existing.recordset.length) {
    await pool.request()
      .input('reportId', sql.VarChar(80), REPORT_ID)
      .input('title', sql.NVarChar(200), TITLE)
      .input('domain', sql.VarChar(50), 'tonkho_sku')
      .input('menuItemId', sql.Int, menuItemId)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .query(`
        UPDATE app.ReportCatalog SET
          Title = @title, Domain = @domain, MenuItemId = @menuItemId, DataSourceId = NULL,
          SourceType = 'stockAlert', ApiConnectionId = NULL, ApiTarget = NULL, ExternalConnectionId = NULL,
          DefinitionJson = @definitionJson, IsActive = 1
        WHERE ReportId = @reportId
      `);
    console.log(`↻ Đã cập nhật báo cáo "${TITLE}" (${REPORT_ID}).`);
    return;
  }
  await pool.request()
    .input('reportId', sql.VarChar(80), REPORT_ID)
    .input('title', sql.NVarChar(200), TITLE)
    .input('domain', sql.VarChar(50), 'tonkho_sku')
    .input('menuItemId', sql.Int, menuItemId)
    .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
    .query(`
      INSERT INTO app.ReportCatalog (ReportId, Title, Domain, MenuItemId, SourceType, DefinitionJson)
      VALUES (@reportId, @title, @domain, @menuItemId, 'stockAlert', @definitionJson)
    `);
  console.log(`✅ Đã tạo báo cáo "${TITLE}" (${REPORT_ID}).`);
}

async function main() {
  const menuCode = process.argv[2] || 'reports-van-hanh';
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
  console.log('✅ Xong — báo cáo đã sẵn sàng trong danh mục. NHỚ:');
  console.log('   1. Vào Hệ thống → Phân quyền, gán quyền xem "bc-canh-bao-ton" cho đúng vai trò');
  console.log('      (script này KHÔNG tự gán quyền).');
  console.log('   2. Cần đã có 2 job banhang_sku/tonkho_sku chạy ổn (xem bc-ton-kho-0.md Bước');
  console.log('      1+2) — dùng CHUNG, không cần VIEW/job mới.');
  console.log('   3. Vào etl-admin → "Cảnh báo hàng tồn", upload danh sách ngưỡng — không');
  console.log('      upload thì báo cáo luôn trả rỗng.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
