// scripts/seedKhachHangTuanReport.js — Tạo/CẬP NHẬT idempotent báo cáo
// "Báo cáo khách hàng theo tuần" (bc-khach-hang-theo-tuan) — bản 11.24,
// theo yêu cầu đội MKT, dựa trên file mẫu thật "Form báo cáo hàng tuần
// thứ 6.xlsx" — xem "bc-khach-hang-theo-tuan.md" + lib/khachHangTuanRunner.js.
//
// DÙNG CHUNG domain `doanhthu_the_chinhanh` với "Báo cáo kinh doanh theo
// tuần" (bc-kinh-doanh-theo-tuan) — KHÔNG cần VIEW/job đồng bộ RIÊNG, chỉ
// cần đã chạy xong các bước triển khai của báo cáo đó (xem
// "bc-kinh-doanh-theo-tuan.md" mục 3) trước khi chạy script này.
//
// SourceType='khachHangTuan' — cột hiển thị CỐ ĐỊNH trong code runner.
// Đưa vào menu "Báo cáo MKT" (Code='reports-adhoc') — theo đúng yêu cầu
// người dùng (3 báo cáo MKT mới đều gộp vào đây).
//
// Cách dùng:
//   node scripts/seedKhachHangTuanReport.js [menuCode]
require('dotenv').config();
const { sql, getPool } = require('../db');

const SOURCE_TYPE = 'khachHangTuan';
const REPORT_ID = 'bc-khach-hang-theo-tuan';
const TITLE = 'Báo cáo khách hàng theo tuần';
const DOMAIN = 'doanhthu_the_chinhanh';
// type: 'date' (1 ngày DUY NHẤT — ngày bất kỳ trong tuần muốn xem, runner
// tự suy ra cửa sổ 7 ngày kết thúc đúng ngày đó) — không chọn -> mặc định
// hôm nay (giờ Việt Nam), xem lib/khachHangTuanRunner.js.
const FILTERS = [{ field: 'eventDate', type: 'date', label: 'Ngày trong tuần muốn xem' }];

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
  console.log('   1. Vào Hệ thống → Phân quyền, gán quyền xem cho báo cáo bc-khach-hang-theo-tuan');
  console.log('      — mặc định KHÔNG ai xem được, kể cả admin.');
  console.log('   2. Báo cáo CHƯA CÓ SỐ LIỆU nếu chưa tạo VIEW + chạy job đồng bộ');
  console.log('      domain doanhthu_the_chinhanh (xem bc-kinh-doanh-theo-tuan.md mục 3).');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
