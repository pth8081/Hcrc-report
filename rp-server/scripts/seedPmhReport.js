// scripts/seedPmhReport.js — Tạo/CẬP NHẬT idempotent báo cáo DUY NHẤT "PMH"
// (bc-pmh, SourceType='pmh', bản 11.57, theo yêu cầu người dùng — "Bạn
// kiểm tra, phân tích và làm cho tôi báo cáo này nhé. Một báo cáo và in ra
// nhiều sheet... Giống như báo cáo weekly post của MKT") — ĐÚNG mẫu
// scripts/seedBrgWeeklyPostReport.js: 1 ReportId, chọn "sheet" muốn xem qua
// bộ lọc nội bộ — xem lib/pmhRunner.js.
//
// v1 (bản 11.57) CHỈ 3/7 sheet của file mẫu gốc "Mẫu Báo Cáo PMH.xlsx" —
// xem "bc-pmh.md" mục "Chưa làm" cho 4 sheet còn lại (đang chờ DBA xác
// nhận nguồn) + 2 cột "Thuế Nhập"/"Trạng Thái" còn thiếu ở sheet "Full
// Barcode".
//
// ĐIỀU KIỆN TRƯỚC KHI CHẠY:
//   1. Đã chạy xong etl/scripts/seedPmhFullBarcodeSync.js (job đồng bộ
//      domain pmh_full_barcode) ít nhất 1 lượt.
//   2. 2 báo cáo `bc-thay-doi-gia-tuc-thoi`/`bc-thay-doi-gia-tu-thoi-diem`
//      (xem "bc-thay-doi-gia.md") ĐÃ tồn tại trong app.ReportCatalog —
//      sheet PMH tương ứng đọc THẲNG DefinitionJson của 2 báo cáo đó lúc
//      chạy, KHÔNG hoạt động nếu 2 báo cáo gốc bị xoá.
//
// Cách dùng:
//   node scripts/seedPmhReport.js [menuCode]
require('dotenv').config();
const { sql, getPool } = require('../db');
const { SHEET_OPTIONS, DEFAULT_SHEET } = require('../lib/pmhRunner');

const SOURCE_TYPE = 'pmh';
const REPORT_ID = 'bc-pmh';
const TITLE = 'PMH';
// domain KHÔNG dùng thật ở tầng ReportCatalog — mỗi sheet tự khai domain
// riêng bên trong lib/pmhRunner.js (giống brg_weekly_post).
const DOMAIN = 'pmh';
// Bộ lọc v1 CHỈ `sheet` + `eventDate` — ÁP DỤNG CHUNG cho mọi sheet (an
// toàn, mọi domain/report đều có EventDate) — xem chú thích đầu
// lib/pmhRunner.js: 2 sheet "Thay đổi giá" tự có thêm bộ lọc Ngành
// hàng/Mã hàng/Vùng giá riêng nhưng CHƯA hiện ở đây — dùng báo cáo gốc
// riêng (`bc-thay-doi-gia-tuc-thoi`/`-tu-thoi-diem`) nếu cần lọc sâu hơn.
const FILTERS = [
  {
    field: 'sheet', type: 'select', label: 'Chọn sheet', default: DEFAULT_SHEET,
    options: SHEET_OPTIONS.map(s => ({ value: s.value, label: s.label }))
  },
  { field: 'eventDate', type: 'dateRange', label: 'Khoảng ngày báo cáo' }
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

  const reuseIds = SHEET_OPTIONS.filter(s => s.kind === 'reuse').map(s => s.reuseReportId);
  for (const reportId of reuseIds) {
    const check = await pool.request().input('reportId', sql.VarChar(80), reportId)
      .query('SELECT ReportId FROM app.ReportCatalog WHERE ReportId = @reportId AND IsActive = 1');
    if (!check.recordset.length) {
      console.error(`⛔ Chưa có báo cáo gốc "${reportId}" (hoặc đang tắt hoạt động) — chạy "node rp-server/scripts/seedThayDoiGiaReports.js" trước (xem "bc-thay-doi-gia.md").`);
      process.exit(1);
    }
  }

  await upsertReport(pool, menuItemId);

  console.log('');
  console.log('✅ Xong. NHỚ: Vào Hệ thống → Phân quyền, gán quyền xem cho báo cáo bc-pmh');
  console.log('   — mặc định KHÔNG ai xem được, kể cả admin.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
