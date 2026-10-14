// scripts/seedNganhHangReports.js — Tạo/CẬP NHẬT idempotent 2 báo cáo
// "Doanh thu theo ngành hàng"/"Nhập hàng theo ngành hàng" trong
// app.ReportCatalog. Chạy LẠI file này an toàn — khớp theo ReportId để
// UPDATE DefinitionJson thay vì tạo trùng.
//
// Thiết kế (theo yêu cầu người dùng, bản 9.41+): MỖI DÒNG LUÔN LÀ 1 NGÀNH
// HÀNG (không tách chi nhánh ra từng dòng, khác hẳn báo cáo doanh thu chi
// nhánh) — khối "current" đọc domain chi tiết `<STK_ID>_<DEPT_ID>` rồi
// GỘP LẠI về đúng 1 dòng/ngành hàng qua block.remapEntityCode (xem
// rp-server/lib/compositeReportRunner.js) — CỘNG DỒN mọi chi nhánh, trừ
// khi người xem chọn bộ lọc "Chi nhánh" (filterValuesField "branches") để
// thu hẹp phạm vi cộng dồn về 1/vài chi nhánh cụ thể. Chỉ tiêu (khối
// "target") nhập THEO TOÀN CÔNG TY — 1 số/ngành hàng, KHÔNG tách chi
// nhánh (xem etl/lib/salesTargetsImport.js:parseGenericShape() + 2 trang
// etl-admin "Chỉ tiêu Doanh thu/Nhập hàng theo ngành hàng") — entityCode
// của khối target CHÍNH LÀ DEPT_ID, khớp đúng entityCode đã remap của khối
// current nên GHÉP ĐƯỢC dù 2 khối khai báo ở granularity gốc khác nhau.
//
// "Cùng kỳ năm trước" (khối lastYear) — TẠM ĐỌC domain Live
// (doanhthu_nganhhang/nhaphang_nganhhang) dịch theo năm, giống current.
// Domain Live chỉ mới có dữ liệu từ lúc seedNganhHangSync.js (etl) chạy
// lần đầu — CHƯA có dữ liệu lùi xa 1 năm, nên cột "Cùng kỳ"/"% LFL" TẠM
// TRỐNG cho tới khi VIEW + job "Lịch sử (DSMART16_EOM)" tương ứng được
// tạo (xem kế hoạch "báo cáo doanh thu/nhập hàng theo ngành hàng.md" —
// CHƯA viết), lúc đó CHỈ cần đổi `historicalDomain` của khối lastYear
// trong file này sang domain Lịch sử mới — KHÔNG cần sửa gì khác (xem
// lib/compositeReportRunner.js:fetchSplitDomainRows()).
//
// requireTargetMatch: false + KHÔNG khai requireDiemStkMapping (khác báo
// cáo doanh thu chi nhánh) — ngành hàng không cần "Ánh xạ Điểm - STK_ID"
// (không có khái niệm kho cũ/mới ở cấp ngành hàng), và ngành hàng CHƯA có
// chỉ tiêu tháng đó vẫn phải hiện Thực đạt đầy đủ (không ẩn trắng).
//
// CHƯA gán quyền xem (Hệ thống → Phân quyền) — admin tự làm sau.
//
// Cách dùng:
//   node scripts/seedNganhHangReports.js [menuCode]
require('dotenv').config();
const { sql, getPool } = require('../db');

const EXPORT_TITLE_DOANH_THU = 'Hệ thống siêu thị BRGMART - Báo cáo doanh thu theo ngành hàng ngày {ngayBaoCao}';
const EXPORT_TITLE_NHAP_HANG = 'Hệ thống siêu thị BRGMART - Báo cáo nhập hàng theo ngành hàng ngày {ngayBaoCao}';

function buildDefinition({ domain, targetDomain, exportFileCode, exportTitle, thucDatField, chiTieuField, thucDatLabel }) {
  return {
    title: undefined, // gán ở REPORTS, upsertReport ghi đè field này — giữ chỗ cho rõ cấu trúc
    exportTitle,
    exportFileCode,
    domain,
    filters: [
      { field: 'eventDate', type: 'dateRange', label: 'Khoảng ngày báo cáo' },
      {
        field: 'branches', type: 'multiSelect', label: 'Chi nhánh (không chọn = toàn hệ thống)',
        optionsSource: { domain, valueField: 'STK_ID' }
      }
    ],
    blocks: [
      {
        key: 'current', sourceType: 'directDb', domain,
        remapEntityCode: { field: 'DEPT_ID', filterField: 'STK_ID', filterValuesField: 'branches' }
      },
      {
        key: 'lastYear', sourceType: 'directDb', domain, dateOffsetYears: -1,
        remapEntityCode: { field: 'DEPT_ID', filterField: 'STK_ID', filterValuesField: 'branches' }
      },
      { key: 'target', isTarget: true, targetDomain }
    ],
    requireTargetMatch: false,
    columns: [
      { key: 'entityCode' },
      { key: 'tenNganhHang', label: 'Ngành hàng', formula: 'current.dimensions.TenNganhHang || lastYear.dimensions.TenNganhHang || entityCode', width: 2 },
      { key: 'chiTieu', label: 'Chỉ tiêu', formula: `target.${chiTieuField}`, width: 1.2 },
      { key: 'thucDat', label: thucDatLabel, formula: `current.measures.${thucDatField}`, width: 1.2 },
      { key: 'tyLeDat', label: 'Tỷ lệ đạt', formula: `ROUND(current.measures.${thucDatField} / target.${chiTieuField} * 100, 1)`, format: 'percent', width: 0.9 },
      { key: 'cungKy', label: 'Cùng kỳ năm trước', formula: `lastYear.measures.${thucDatField}`, width: 1.2 },
      { key: 'lfl', label: 'Tỷ lệ % LFL', formula: `ROUND(current.measures.${thucDatField} / lastYear.measures.${thucDatField} * 100, 1)`, format: 'percent', width: 0.9 }
    ]
  };
}

const REPORTS = [
  {
    reportId: 'bc-doanh-thu-nganhhang', title: 'Báo cáo doanh thu theo ngành hàng',
    exportFileCode: 'BCDTNGANHHANG', domain: 'doanhthu_nganhhang', targetDomain: 'sales-targets-nganhhang-dt',
    exportTitle: EXPORT_TITLE_DOANH_THU, thucDatField: 'DoanhThu', chiTieuField: 'ChiTieuDoanhThu', thucDatLabel: 'Thực đạt'
  },
  {
    reportId: 'bc-nhap-hang-nganhhang', title: 'Báo cáo nhập hàng theo ngành hàng',
    exportFileCode: 'BCNHAPHANGNGANHHANG', domain: 'nhaphang_nganhhang', targetDomain: 'sales-targets-nganhhang-nh',
    exportTitle: EXPORT_TITLE_NHAP_HANG, thucDatField: 'GiaTriNhap', chiTieuField: 'ChiTieuGiaTriNhap', thucDatLabel: 'Thực nhập'
  }
];

async function upsertReport(pool, menuItemId, report) {
  const { reportId, title, domain } = report;
  const definition = buildDefinition(report);
  definition.title = title;
  const definitionJson = JSON.stringify(definition);
  const existing = await pool.request().input('reportId', sql.VarChar(80), reportId)
    .query('SELECT ReportId FROM app.ReportCatalog WHERE ReportId = @reportId');
  if (existing.recordset.length) {
    await pool.request()
      .input('reportId', sql.VarChar(80), reportId)
      .input('title', sql.NVarChar(200), title)
      .input('domain', sql.VarChar(50), domain)
      .input('menuItemId', sql.Int, menuItemId)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .query(`
        UPDATE app.ReportCatalog SET
          Title = @title, Domain = @domain, MenuItemId = @menuItemId, DataSourceId = NULL,
          SourceType = 'composite', ApiConnectionId = NULL, ApiTarget = NULL, ExternalConnectionId = NULL,
          DefinitionJson = @definitionJson, IsActive = 1
        WHERE ReportId = @reportId
      `);
    console.log(`↻ Đã cập nhật báo cáo "${title}" (${reportId}).`);
    return;
  }
  await pool.request()
    .input('reportId', sql.VarChar(80), reportId)
    .input('title', sql.NVarChar(200), title)
    .input('domain', sql.VarChar(50), domain)
    .input('menuItemId', sql.Int, menuItemId)
    .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
    .query(`
      INSERT INTO app.ReportCatalog (ReportId, Title, Domain, MenuItemId, SourceType, DefinitionJson)
      VALUES (@reportId, @title, @domain, @menuItemId, 'composite', @definitionJson)
    `);
  console.log(`✅ Đã tạo báo cáo "${title}" (${reportId}).`);
}

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

  for (const report of REPORTS) {
    await upsertReport(pool, menuItemId, report);
  }

  console.log('');
  console.log('✅ Xong — 2 báo cáo đã sẵn sàng. NHỚ:');
  console.log('   1. Đã chạy node etl/scripts/seedNganhHangSync.js (domain Live có dữ liệu).');
  console.log('   2. Đã nhập Chỉ tiêu qua etl-admin → "Chỉ tiêu Doanh thu/Nhập hàng theo ngành hàng"');
  console.log('      (để TRỐNG MaSieuThi, điền MaNganhHang = ĐÚNG DEPT_ID, xem etl/lib/salesTargetsImport.js).');
  console.log('   3. Vào Hệ thống → Phân quyền gán quyền xem cho đúng vai trò — script này KHÔNG tự gán quyền.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
