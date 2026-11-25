// scripts/seedKinhDoanhTuanReport.js — Tạo/CẬP NHẬT idempotent báo cáo
// "Báo cáo kinh doanh theo tuần" (bc-kinh-doanh-theo-tuan) — bản 11.24,
// theo yêu cầu đội MKT, dựa trên file mẫu thật "FORM BÁO CÁO - BC KD T3
// 2026.xlsx" — xem "bc-kinh-doanh-theo-tuan.md" (tài liệu gốc đầy đủ
// nghiệp vụ/công thức) + lib/kinhDoanhTuanRunner.js (logic tính).
//
// SourceType='kinhDoanhTuan' — cột hiển thị CỐ ĐỊNH trong code runner
// (giống 'doanhThuTongHopHcrc'), DefinitionJson ở đây CHỈ cần field tối
// thiểu (title/domain/filters) — không khai `columns`.
//
// Đưa vào menu "Báo cáo MKT" (Code='reports-adhoc', đổi tên từ "Báo cáo
// tự do" ở bản 11.22) — theo đúng yêu cầu người dùng (3 báo cáo MKT mới
// đều gộp vào đây).
//
// ĐIỀU KIỆN TRƯỚC KHI CHẠY: đã tạo xong VIEW `V_HCRC_DOANHTHU_THE_CHINHANH`
// (Script A, DSMART16 Live) VÀ chạy xong `etl/scripts/seedDoanhThuTheSync.js`
// (job đồng bộ domain `doanhthu_the_chinhanh`) — xem "bc-kinh-doanh-theo-tuan.md".
//
// Cách dùng:
//   node scripts/seedKinhDoanhTuanReport.js [menuCode]
require('dotenv').config();
const { sql, getPool } = require('../db');

const SOURCE_TYPE = 'kinhDoanhTuan';
const REPORT_ID = 'bc-kinh-doanh-theo-tuan';
const TITLE = 'Báo cáo kinh doanh theo tuần';
const DOMAIN = 'doanhthu_the_chinhanh';
// type: 'date' (1 ngày DUY NHẤT — ngày bất kỳ trong tuần muốn xem, runner
// tự suy ra Thứ Hai -> Chủ Nhật chứa ngày đó) — không chọn -> mặc định
// hôm nay (giờ Việt Nam), xem lib/kinhDoanhTuanRunner.js.
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
  console.log('   1. Vào Hệ thống → Phân quyền, gán quyền xem cho báo cáo bc-kinh-doanh-theo-tuan');
  console.log('      — mặc định KHÔNG ai xem được, kể cả admin.');
  console.log('   2. Báo cáo CHƯA CÓ SỐ LIỆU nếu chưa tạo VIEW + chạy job đồng bộ');
  console.log('      domain doanhthu_the_chinhanh (xem bc-kinh-doanh-theo-tuan.md).');
  console.log('   3. (Tuỳ chọn) khai cột "Miền"/"Vùng QL" cho từng mã Điểm ở etl-admin →');
  console.log('      "Ánh xạ Điểm - STK_ID" — để trống thì báo cáo hiện ô trống.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
