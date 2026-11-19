// scripts/seedBanBuonTheoLoaiHinhReport.js — Tạo/CẬP NHẬT idempotent báo
// cáo MỚI "Doanh thu Bán buôn theo loại hình (Mart/Mini Mart/Kho)" (bản
// 10.98, theo yêu cầu người dùng) — xem "bc-ban-buon-theo-loai-hinh.md".
//
// SourceType='banBuonTheoLoaiHinh' (xem lib/banBuonTheoLoaiHinhRunner.js) —
// cột hiển thị CỐ ĐỊNH trong code runner, DefinitionJson ở đây CHỈ cần đủ
// field tối thiểu (title/domain/filters) — không khai `columns`.
//
// LƯU Ý QUAN TRỌNG — chạy script này KHÔNG đủ để báo cáo CÓ SỐ LIỆU ĐÚNG:
//   1. Domain `doanhthu_nganhhang` ĐÃ CÓ SẴN (dùng chung) — không cần tạo
//      VIEW/job đồng bộ mới.
//   2. Admin CẦN khai đủ `LoaiChuoi` = "MART"/"MINIMART"/"KHO" (chữ hoa,
//      KHÔNG dấu) cho MỌI mã Điểm có doanh thu bán buôn ở etl-admin →
//      "Ánh xạ Điểm - STK_ID" — mã Điểm nào ĐỂ TRỐNG LoaiChuoi sẽ bị BỎ
//      QUA hoàn toàn khỏi báo cáo này (không suy đoán, không tính vào
//      "Tổng cộng").
//
// CHƯA gán quyền xem (Hệ thống → Phân quyền) — admin tự làm sau.
//
// Cách dùng:
//   node scripts/seedBanBuonTheoLoaiHinhReport.js [menuCode]
require('dotenv').config();
const { sql, getPool } = require('../db');

const REPORT_ID = 'bc-ban-buon-theo-loai-hinh';
const TITLE = 'Doanh thu Bán buôn theo loại hình (Mart/Mini Mart/Kho)';
const SOURCE_TYPE = 'banBuonTheoLoaiHinh';
const DOMAIN = 'banbuon_theo_loaihinh'; // chỉ để hiển thị, runner không query theo domain này

const DEFINITION = {
  title: TITLE,
  domain: DOMAIN,
  filters: [
    { field: 'eventDate', type: 'dateRange', label: 'Khoảng ngày báo cáo' }
  ]
};

async function main() {
  const menuCode = process.argv[2] || 'reports-kinh-doanh';
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

  console.log('');
  console.log('✅ Xong. NHỚ:');
  console.log(`   1. Vào Hệ thống → Phân quyền, gán quyền xem ${REPORT_ID} — mặc định`);
  console.log('      KHÔNG ai xem được, kể cả admin.');
  console.log('   2. etl-admin → "Ánh xạ Điểm - STK_ID": khai đủ LoaiChuoi =');
  console.log('      "MART"/"MINIMART"/"KHO" cho MỌI mã Điểm có doanh thu bán buôn —');
  console.log('      mã nào để trống LoaiChuoi sẽ bị bỏ qua hoàn toàn khỏi báo cáo.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
