// scripts/seedCheckLechThueRVOrderReport.js — Tạo/CẬP NHẬT idempotent báo
// cáo MỚI "Check lệch thuế RV_ORDER" (bản 10.80, theo yêu cầu người dùng,
// dựa trên file mẫu thật "Check_RV_ORDER...xlsx") — xem
// "bc-check-lech-thue-rvorder.md".
//
// LƯU Ý QUAN TRỌNG — chạy script này KHÔNG đủ để báo cáo CÓ SỐ LIỆU:
//   1. DBA chạy "deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Check
//      lệch thuế RV_ORDER (DSMART16 trung tâm).sql".
//   2. Chạy `node etl/scripts/seedCheckLechThueRVOrderSync.js` (tạo job
//      đồng bộ).
// Không làm đủ 2 bước trên, báo cáo luôn trả về rỗng (không lỗi).
//
// CHƯA gán quyền xem (Hệ thống → Phân quyền) — admin tự làm sau.
//
// Cách dùng:
//   node scripts/seedCheckLechThueRVOrderReport.js [menuCode]
require('dotenv').config();
const { sql, getPool } = require('../db');

const REPORT_ID = 'bc-check-lech-thue-rvorder';
const TITLE = 'Check lệch thuế RV_ORDER';
const DOMAIN = 'check_lech_thue_rvorder';

const DEFINITION = {
  title: TITLE,
  domain: DOMAIN,
  filters: [
    { field: 'eventDate', type: 'dateRange', label: 'Khoảng ngày báo cáo' },
    { field: 'MaNccThucGiao', type: 'multiSelect', label: 'Nhà cung cấp thực giao', optionsSource: { domain: DOMAIN, valueField: 'MaNccThucGiao', labelField: 'TenNccThucGiao' } },
    { field: 'MaHangHienThi', type: 'multiSelect', label: 'Mã hàng', optionsSource: { domain: DOMAIN, valueField: 'MaHangHienThi', labelField: 'TenHang' } }
  ],
  columns: [
    { key: 'stt', label: 'TT' },
    { key: 'eventDate', label: 'Ngày', formula: 'eventDate' },
    { key: 'soChungTu', label: 'Số chứng từ', formula: 'SoChungTu' },
    { key: 'maHang', label: 'Mã hàng', formula: 'MaHangHienThi' },
    { key: 'tenHang', label: 'Tên hàng', formula: 'TenHang' },
    { key: 'maNccNoiBo', label: 'Mã NCC nội bộ', formula: 'MaNccNoiBo' },
    { key: 'tenNccNoiBo', label: 'Tên NCC nội bộ', formula: 'TenNccNoiBo' },
    { key: 'maNccThucGiao', label: 'Mã NCC thực giao', formula: 'MaNccThucGiao' },
    { key: 'tenNccThucGiao', label: 'Tên NCC thực giao', formula: 'TenNccThucGiao' },
    { key: 'maThue', label: 'Mã thuế', formula: 'MaThue' },
    { key: 'tongGiaTri', label: 'Tổng giá trị', formula: 'measures.TongGiaTri' },
    { key: 'giaTriThue', label: 'Giá trị thuế (đang lệch = 0)', formula: 'measures.GiaTriThue' }
  ]
};

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
  const definitionJson = JSON.stringify(DEFINITION);

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
          SourceType = 'directDb', ApiConnectionId = NULL, ApiTarget = NULL, ExternalConnectionId = NULL,
          DefinitionJson = @definitionJson, IsActive = 1
        WHERE ReportId = @reportId
      `);
    console.log(`↻ Đã cập nhật báo cáo "${TITLE}" (${REPORT_ID}).`);
  } else {
    await pool.request()
      .input('reportId', sql.VarChar(80), REPORT_ID)
      .input('title', sql.NVarChar(200), TITLE)
      .input('domain', sql.VarChar(50), DOMAIN)
      .input('menuItemId', sql.Int, menuItemId)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .query(`
        INSERT INTO app.ReportCatalog (ReportId, Title, Domain, MenuItemId, SourceType, DefinitionJson)
        VALUES (@reportId, @title, @domain, @menuItemId, 'directDb', @definitionJson)
      `);
    console.log(`✅ Đã tạo báo cáo "${TITLE}" (${REPORT_ID}).`);
  }

  console.log('');
  console.log('✅ Xong. NHỚ:');
  console.log(`   1. Vào Hệ thống → Phân quyền, gán quyền xem ${REPORT_ID} — mặc định`);
  console.log('      KHÔNG ai xem được, kể cả admin.');
  console.log('   2. Báo cáo CHƯA CÓ SỐ LIỆU cho tới khi tạo xong VIEW');
  console.log('      vw_CheckLechThueRVOrder trên DSMART16 + chạy');
  console.log('      node scripts/seedCheckLechThueRVOrderSync.js (thư mục etl/).');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
