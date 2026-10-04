// scripts/seedStockThresholdReport.js — Tạo/CẬP NHẬT idempotent báo cáo
// "Tồn kho theo ngưỡng" (bc-ton-kho-nguong, SourceType='stockThreshold')
// trong app.ReportCatalog — người xem TỰ CHỌN chiều lọc (tồn dưới/trên) VÀ
// mức ngưỡng ngay trên bộ lọc, KHÁC "Top bán chạy đang tồn kho = 0"
// (seedTopZeroStockReport.js, ngưỡng cố định 0, không xếp hạng theo doanh
// số) — xem rp-server/lib/stockThresholdRunner.js. Chạy LẠI file này an
// toàn — khớp theo ReportId để UPDATE DefinitionJson thay vì tạo trùng.
//
// LƯU Ý QUAN TRỌNG — chạy script này KHÔNG đủ để báo cáo CÓ SỐ LIỆU: dùng
// LẠI NGUYÊN VẸN 2 domain banhang_sku/tonkho_sku đã có cho báo cáo
// "bc-ton-kho-0" (xem bc-ton-kho-0.md) — ĐÃ có 2 job đó chạy ổn thì báo cáo
// này CÓ SỐ LIỆU NGAY, không cần VIEW/job mới nào. Chưa từng làm báo cáo
// "bc-ton-kho-0" thì làm theo ĐÚNG Bước 1+2 ở bc-ton-kho-0.md trước.
//
// CHƯA gán quyền xem (Hệ thống → Phân quyền) — admin tự làm sau.
//
// Cách dùng:
//   node scripts/seedStockThresholdReport.js [menuCode]
require('dotenv').config();
const { sql, getPool } = require('../db');

const REPORT_ID = 'bc-ton-kho-nguong';
const TITLE = 'Tồn kho theo ngưỡng';

function buildDefinition() {
  return {
    title: TITLE,
    salesDomain: 'banhang_sku',
    stockDomain: 'tonkho_sku',
    filters: [
      {
        field: 'threshold', type: 'thresholdNumber', label: 'Mức tồn kiểm tra',
        default: { mode: 'below', value: 1 }
      },
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
          SourceType = 'stockThreshold', ApiConnectionId = NULL, ApiTarget = NULL, ExternalConnectionId = NULL,
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
      VALUES (@reportId, @title, @domain, @menuItemId, 'stockThreshold', @definitionJson)
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
  console.log('   1. Vào Hệ thống → Phân quyền, gán quyền xem "bc-ton-kho-nguong" cho đúng vai');
  console.log('      trò (script này KHÔNG tự gán quyền).');
  console.log('   2. Cần đã có 2 job banhang_sku/tonkho_sku chạy ổn (xem bc-ton-kho-0.md Bước');
  console.log('      1+2) — dùng CHUNG, không cần VIEW/job mới.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
