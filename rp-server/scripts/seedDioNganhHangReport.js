// scripts/seedDioNganhHangReport.js — Tạo/CẬP NHẬT idempotent báo cáo "DIO
// theo ngành hàng" (bc-dio-nganhhang, SourceType='dioNganhHang') trong
// app.ReportCatalog — menu "Báo cáo vận hành" (reports-van-hanh), báo cáo
// ĐẦU TIÊN trong 4 báo cáo vận hành mới theo yêu cầu người dùng (xem
// bc-dio-nganhhang.md). Chạy LẠI file này an toàn — khớp theo ReportId để
// UPDATE DefinitionJson thay vì tạo trùng.
//
// LƯU Ý QUAN TRỌNG — chạy script này KHÔNG đủ để báo cáo CÓ SỐ LIỆU, cần
// làm ĐỦ theo đúng thứ tự ở bc-dio-nganhhang.md (VIEW DSMART16 → job đồng
// bộ `node etl/scripts/seedTonKhoGtriNganhHangSync.js` → script này →
// domain `doanhthu_nganhhang` đã có sẵn, KHÔNG cần làm gì thêm cho phần
// đó).
//
// CHƯA gán quyền xem (Hệ thống → Phân quyền) — admin tự làm sau.
//
// Cách dùng:
//   node scripts/seedDioNganhHangReport.js [menuCode]
require('dotenv').config();
const { sql, getPool } = require('../db');

const REPORT_ID = 'bc-dio-nganhhang';
const TITLE = 'DIO theo ngành hàng';
const DOMAIN = 'tonkho_gtri_nganhhang';

function buildDefinition() {
  return {
    title: TITLE,
    exportTitle: TITLE,
    exportFileCode: 'dio-nganhhang',
    filters: []
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
      .input('domain', sql.VarChar(50), DOMAIN)
      .input('menuItemId', sql.Int, menuItemId)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .query(`
        UPDATE app.ReportCatalog SET
          Title = @title, Domain = @domain, MenuItemId = @menuItemId, DataSourceId = NULL,
          SourceType = 'dioNganhHang', ApiConnectionId = NULL, ApiTarget = NULL, ExternalConnectionId = NULL,
          DefinitionJson = @definitionJson, IsActive = 1
        WHERE ReportId = @reportId
      `);
    console.log(`↻ Đã cập nhật báo cáo "${TITLE}" (${REPORT_ID}).`);
    return;
  }
  await pool.request()
    .input('reportId', sql.VarChar(80), REPORT_ID)
    .input('title', sql.NVarChar(200), TITLE)
    .input('domain', sql.VarChar(50), DOMAIN)
    .input('menuItemId', sql.Int, menuItemId)
    .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
    .query(`
      INSERT INTO app.ReportCatalog (ReportId, Title, Domain, MenuItemId, SourceType, DefinitionJson)
      VALUES (@reportId, @title, @domain, @menuItemId, 'dioNganhHang', @definitionJson)
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
  console.log('   1. Vào Hệ thống → Phân quyền, gán quyền xem "bc-dio-nganhhang" cho đúng vai trò');
  console.log('      (script này KHÔNG tự gán quyền).');
  console.log('   2. Cần đã tạo VIEW + chạy job "node etl/scripts/seedTonKhoGtriNganhHangSync.js"');
  console.log('      (xem bc-dio-nganhhang.md) — domain `doanhthu_nganhhang` dùng lại NGUYÊN VẸN,');
  console.log('      không cần làm gì thêm nếu đã có.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
