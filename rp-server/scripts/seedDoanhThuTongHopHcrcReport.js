// scripts/seedDoanhThuTongHopHcrcReport.js — Tạo/CẬP NHẬT idempotent báo
// cáo MỚI "Báo cáo tổng hợp doanh thu siêu thị hàng ngày" (bản 10.82, theo
// yêu cầu người dùng, dựa trên file mẫu thật đội vận hành đang tự tổng hợp
// tay) — xem "bc-doanh-thu-tong-hop-hcrc.md".
//
// SourceType='doanhThuTongHopHcrc' (xem lib/doanhThuTongHopHcrcRunner.js) —
// cột hiển thị CỐ ĐỊNH trong code runner (giống 'topZeroStock'/'coreZeroStock'),
// DefinitionJson ở đây CHỈ cần đủ field tối thiểu (title/domain/filters) —
// không khai `columns` (runner tự định nghĩa, bỏ qua nếu có khai ở đây).
//
// LƯU Ý QUAN TRỌNG — chạy script này KHÔNG đủ để báo cáo CÓ SỐ LIỆU:
//   1. DBA chạy "deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Doanh thu
//      tổng hợp theo siêu thị HCRC (DSMART16 trung tâm).sql".
//   2. Chạy `node etl/scripts/seedDoanhThuTongHopHcrcSync.js` (tạo job
//      đồng bộ domain `doanhthu_tonghop_hcrc`).
//   3. Domain `giaodich_chinhanh` + `sales-targets-hcrc` ĐÃ CÓ SẴN (dùng
//      chung với "Doanh thu cuối ngày") — không cần làm gì thêm cho 2 cái
//      này, NHƯNG báo cáo sẽ CHƯA ra số Bill/Chỉ tiêu nếu 2 domain đó chưa
//      từng được đồng bộ/nhập trên server này.
//   4. Đã khai cột `MaQLKV`/`LoaiChuoi` cho đúng mã Điểm ở etl-admin →
//      "Ánh xạ Điểm - STK_ID" (TUỲ CHỌN — để trống vẫn chạy được, chỉ
//      thiếu đúng 2 cột đó).
//
// CHƯA gán quyền xem (Hệ thống → Phân quyền) — admin tự làm sau.
//
// Cách dùng:
//   node scripts/seedDoanhThuTongHopHcrcReport.js [menuCode]
require('dotenv').config();
const { sql, getPool } = require('../db');

const REPORT_ID = 'bc-doanh-thu-tong-hop-hcrc';
const TITLE = 'Báo cáo tổng hợp doanh thu siêu thị hàng ngày';
const DOMAIN = 'doanhthu_tonghop_hcrc';
const SOURCE_TYPE = 'doanhThuTongHopHcrc';

const DEFINITION = {
  title: TITLE,
  domain: DOMAIN,
  // type: 'date' (1 ngày DUY NHẤT, KHÁC 'dateRange' các composite khác) —
  // ngày được chọn là "ngày neo" cho CẢ 3 khối Ngày/Tháng/Năm cùng lúc,
  // xem lib/doanhThuTongHopHcrcRunner.js. Không chọn -> mặc định hôm nay
  // (giờ Việt Nam).
  filters: [
    { field: 'eventDate', type: 'date', label: 'Ngày báo cáo' }
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
  console.log('   2. Báo cáo CHƯA CÓ SỐ LIỆU DOANH THU cho tới khi tạo xong VIEW');
  console.log('      vw_DoanhThuTongHopHCRC trên DSMART16 + chạy');
  console.log('      node scripts/seedDoanhThuTongHopHcrcSync.js (thư mục etl/).');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
