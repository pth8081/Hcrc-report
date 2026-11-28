// scripts/seedPmhFullBarcodeReport.js — Tạo/CẬP NHẬT idempotent báo cáo MỚI
// "Full Barcode" (bc-pmh-full-barcode, SourceType='directDb', bản 11.58,
// theo yêu cầu người dùng — dựa trên file mẫu thật "Mẫu Báo Cáo PMH.xlsx")
// — xem "bc-pmh-full-barcode.md".
//
// SỬA bản 11.58 (theo yêu cầu người dùng — "Tôi nghĩ mỗi một sheet đấy là
// thành một báo cáo riêng nhé. Tên báo cáo thì giống tên mà trong ghi
// trong sheet ấy") — ĐỔI KIẾN TRÚC từ bản 11.57: bản 11.57 gộp sheet này +
// 2 báo cáo "Thay đổi giá" đã có thành 1 báo cáo DUY NHẤT `bc-pmh` (đúng
// mẫu BRG Weekly Post, chọn "sheet" qua bộ lọc nội bộ) — người dùng sau
// khi xem lại YÊU CẦU ĐỔI LẠI: MỖI SHEET LÀ 1 BÁO CÁO RIÊNG, tên báo cáo
// = ĐÚNG tên sheet trong file mẫu ("Full Barcode"). Đã BỎ HẲN
// `lib/pmhRunner.js`/SourceType 'pmh'/`scripts/seedPmhReport.js` (xem
// VERSION.md bản 11.58) — script NÀY thay thế, tạo 1 báo cáo
// SourceType='directDb' THUẦN (KHÔNG cần runner riêng, đúng mẫu
// scripts/seedThayDoiGiaReports.js) cho ĐÚNG sheet "Full Barcode".
//
// 2 sheet "Thay đổi giá bán tức thời"/"từ thời điểm" của file mẫu PMH
// KHÔNG cần script riêng — đã là 2 báo cáo ĐỘC LẬP sẵn có từ trước
// (`bc-thay-doi-gia-tuc-thoi`/`bc-thay-doi-gia-tu-thoi-diem`, xem
// "bc-thay-doi-gia.md"), ĐÃ đúng yêu cầu "mỗi sheet 1 báo cáo riêng" —
// KHÔNG đổi gì ở 2 báo cáo đó.
//
// Domain/VIEW/job đồng bộ GIỮ NGUYÊN không đổi so với bản 11.57 — xem
// "deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW PMH Full Barcode
// (DSMART16 trung tâm).sql" + etl/scripts/seedPmhFullBarcodeSync.js.
//
// ĐIỀU KIỆN TRƯỚC KHI CHẠY:
//   1. Đã chạy xong etl/scripts/seedPmhFullBarcodeSync.js (job đồng bộ
//      domain pmh_full_barcode) ít nhất 1 lượt.
//
// Cách dùng:
//   node scripts/seedPmhFullBarcodeReport.js [menuCode]
require('dotenv').config();
const { sql, getPool } = require('../db');

const REPORT_ID = 'bc-pmh-full-barcode';
// Title ĐÚNG tên sheet trong file mẫu "Mẫu Báo Cáo PMH.xlsx" — theo yêu
// cầu người dùng, KHÔNG đổi/diễn giải lại.
const TITLE = 'Full Barcode';
const DOMAIN = 'pmh_full_barcode';

const COLUMNS = [
  { key: 'stt', label: 'TT' },
  { key: 'maVach', label: 'Barcode', formula: 'MaVach' },
  { key: 'skuId', label: 'SKU_ID', formula: 'SkuId' },
  { key: 'maHang', label: 'Mã hàng', formula: 'MaHangHienThi' },
  { key: 'tenHang', label: 'Tên hàng', formula: 'TenHang' },
  { key: 'maNhom', label: 'Mã nhóm', formula: 'MaNhom' },
  { key: 'tenNhom', label: 'Tên nhóm', formula: 'TenNhom' },
  { key: 'maNCC', label: 'Mã NCC', formula: 'MaNCC' },
  { key: 'tenNCC', label: 'Tên nhà cung cấp', formula: 'TenNCC' },
  { key: 'donVi', label: 'ĐVT', formula: 'DonVi' },
  { key: 'giaBanLe', label: 'Giá bán lẻ', formula: 'measures.GiaBanLe' },
  { key: 'giaNhapTheoNCC', label: 'Giá nhập theo NCC', formula: 'measures.GiaNhapTheoNCC' },
  { key: 'giaVonChiDinh', label: 'Giá Vốn chỉ định', formula: 'measures.GiaVonChiDinh' }
];

function buildDefinition() {
  return {
    title: TITLE,
    domain: DOMAIN,
    filters: [
      { field: 'eventDate', type: 'dateRange', label: 'Khoảng ngày báo cáo' }
    ],
    columns: COLUMNS
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
}

async function main() {
  // reports-mua-hang (bản 11.58) — menu "Báo cáo Mua hàng" ĐÃ CÓ SẴN
  // trong rp-db/schema.sql, đúng nghiệp vụ "PMH" (Phòng Mua Hàng) — bản
  // 11.57 lỡ dùng 'reports-adhoc' ("Báo cáo MKT"), SAI menu.
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
  console.log('✅ Xong. NHỚ: Vào Hệ thống → Phân quyền, gán quyền xem cho báo cáo');
  console.log('   bc-pmh-full-barcode — mặc định KHÔNG ai xem được, kể cả admin.');
  console.log('   Báo cáo CHƯA CÓ SỐ LIỆU cho tới khi tạo xong VIEW trên DSMART16 +');
  console.log('   chạy node etl/scripts/seedPmhFullBarcodeSync.js.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
