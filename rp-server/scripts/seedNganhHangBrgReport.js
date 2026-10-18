// scripts/seedNganhHangBrgReport.js — Tạo/CẬP NHẬT idempotent báo cáo
// "Doanh thu, lãi gộp theo ngành hàng" (SourceType='nganhHangBrg', mẫu
// BRGMART người dùng gửi — bản 9.63). Khác hẳn seedNganhHangReports.js
// (SourceType='composite') vì có hình dạng đặc thù (3 khối "Toàn hệ thống
// BRG"/"LFL"/"NSO" lặp lại 12 ngành hàng) — xử lý hoàn toàn trong
// lib/nganhHangBrgRunner.js, DefinitionJson ở đây CHỈ cần đủ field tối
// thiểu để route /reports tìm đúng runner + hiện đúng tiêu đề xuất file
// (không cần blocks/columns — runner tự khai trong code, xem chú thích
// đầu nganhHangBrgRunner.js).
//
// Chạy LẠI file này an toàn — khớp theo ReportId để UPDATE DefinitionJson
// thay vì tạo trùng.
//
// Cách dùng:
//   node scripts/seedNganhHangBrgReport.js [menuCode]
require('dotenv').config();
const { sql, getPool } = require('../db');

const REPORT_ID = 'bc-doanh-thu-nganhhang-brgmart';
const TITLE = 'Báo cáo doanh thu, lãi gộp theo ngành hàng (BRGMART)';
const DOMAIN = 'doanhthu_nganhhang';
const EXPORT_TITLE = 'Hệ thống siêu thị BRGMART - Báo cáo doanh thu, lãi gộp theo ngành hàng ngày {ngayBaoCao}';
const EXPORT_FILE_CODE = 'BCDTLGNGANHHANGBRG';

function buildDefinition() {
  return {
    title: TITLE,
    exportTitle: EXPORT_TITLE,
    exportFileCode: EXPORT_FILE_CODE,
    domain: DOMAIN,
    sourceType: 'nganhHangBrg',
    filters: [
      { field: 'eventDate', type: 'dateRange', label: 'Khoảng ngày báo cáo' }
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
      .input('domain', sql.VarChar(50), DOMAIN)
      .input('menuItemId', sql.Int, menuItemId)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .query(`
        UPDATE app.ReportCatalog SET
          Title = @title, Domain = @domain, MenuItemId = @menuItemId, DataSourceId = NULL,
          SourceType = 'nganhHangBrg', ApiConnectionId = NULL, ApiTarget = NULL, ExternalConnectionId = NULL,
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
      VALUES (@reportId, @title, @domain, @menuItemId, 'nganhHangBrg', @definitionJson)
    `);
  console.log(`✅ Đã tạo báo cáo "${TITLE}" (${REPORT_ID}).`);
}

async function main() {
  const menuCode = process.argv[2] || 'reports-mua-hang';
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
  console.log('   1. Chạy node etl/scripts/seedHangHongHuySync.js (đồng bộ "Hàng hỏng hủy" từ');
  console.log('      V_HCRC_HANGHONGHUY_NGANHHANG — domain hanghonghuy_nganhhang có dữ liệu).');
  console.log('   2. Vào etl-admin → "Chỉ tiêu Doanh thu/Lãi gộp theo ngành hàng (BRGMART)" nhập');
  console.log('      ChiTieuDoanhThu/ChiTieuLaiGop theo MaNganhHang (để trống MaSieuThi).');
  console.log('   3. (Nếu có siêu thị mới mở) Vào etl-admin → "Siêu thị NSO" khai Mã Điểm — Mã Điểm');
  console.log('      KHÔNG khai ở đây mặc định tính là LFL.');
  console.log('   4. Vào Hệ thống → Phân quyền gán quyền xem cho đúng vai trò — script này KHÔNG');
  console.log(`      tự gán quyền (ReportId = ${REPORT_ID}).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
