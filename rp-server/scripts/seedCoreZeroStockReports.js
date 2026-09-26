// scripts/seedCoreZeroStockReports.js — Tạo/CẬP NHẬT idempotent 2 báo cáo
// "Core stock = 0" (bc-core-ton-kho-0-mart / bc-core-ton-kho-0-minimart,
// SourceType='coreZeroStock') trong app.ReportCatalog — TÁCH 2 báo cáo
// riêng cho Mart/Minimart (xác nhận người dùng), thay vì 1 báo cáo + lọc.
// Xem đầy đủ giải thích công thức + danh sách hàng Core ở
// hướng_dẫn_báo_cáo.md mục 14. Chạy LẠI file này an toàn — khớp theo
// ReportId để UPDATE DefinitionJson thay vì tạo trùng.
//
// LƯU Ý QUAN TRỌNG — chạy script này KHÔNG đủ để báo cáo CÓ SỐ LIỆU:
//   1. Đã có 2 VIEW/job banhang_sku/tonkho_sku (mục 12 Bước 1+2, DÙNG CHUNG
//      với báo cáo "Top bán chạy tồn kho=0" — KHÔNG cần tạo job riêng).
//   2. Đã có job domain "doanhthu_chinhanh" (mục 1 Bước 1) với Dimensions
//      "chain" (MART/MINIMART) — DÙNG LẠI để xác định STK_ID nào thuộc
//      loại điểm nào, KHÔNG cần job/VIEW mới.
//   3. Admin đã upload danh sách hàng Core (etl-admin → "Danh sách hàng
//      Core") cho đúng LoaiĐiểm — không upload thì báo cáo luôn trả rỗng.
//   4. (Tuỳ chọn) job/domain "Khóa All"/"Khóa theo kho"/"SL đang đặt" nếu
//      muốn loại hàng đang khoá / hiển thị SL đang đặt — xem mục 14.
//
// CHƯA gán quyền xem (Hệ thống → Phân quyền) — admin tự làm sau.
//
// Cách dùng:
//   node scripts/seedCoreZeroStockReports.js [menuCode]
require('dotenv').config();
const { sql, getPool } = require('../db');

const REPORTS = [
  { reportId: 'bc-core-ton-kho-0-mart', loaiDiem: 'MART', title: 'Core stock = 0 (Mart)' },
  { reportId: 'bc-core-ton-kho-0-minimart', loaiDiem: 'MINIMART', title: 'Core stock = 0 (Minimart)' }
];

// Khớp CHÍNH XÁC tên domain đã dùng ở mục 12 (banhang_sku/tonkho_sku) và
// mục 1 (doanhthu_chinhanh) — đổi tên domain khác lúc tạo job etl-admin thì
// phải sửa lại đúng tương ứng ở đây. 3 domain tuỳ chọn (khoaAll/khoaTheoKho/
// choDat) CHƯA có job thật nào — để sẵn tên quy ước, DBA/admin tự tạo VIEW/
// job khi cần (xem mục 14) — không tạo thì báo cáo vẫn chạy bình thường,
// chỉ là không lọc khoá/không có cột "SL đang đặt".
function buildDefinition({ loaiDiem, title }) {
  return {
    title,
    loaiDiem,
    salesDomain: 'banhang_sku',
    stockDomain: 'tonkho_sku',
    chainDomain: 'doanhthu_chinhanh',
    lockAllDomain: 'core_khoa_all',
    lockByStoreDomain: 'core_khoa_theo_kho',
    pendingOrderDomain: 'core_dang_dat',
    threshold: 0,
    filters: [
      {
        field: 'branches', type: 'multiSelect', label: 'Chi nhánh',
        optionsSource: { domain: 'banhang_sku', valueField: 'MaChiNhanh', labelField: 'TenChiNhanh' }
      }
    ]
  };
}

async function upsertReport(pool, menuItemId, report) {
  const { reportId, title } = report;
  const definitionJson = JSON.stringify(buildDefinition(report));
  const existing = await pool.request().input('reportId', sql.VarChar(80), reportId)
    .query('SELECT ReportId FROM app.ReportCatalog WHERE ReportId = @reportId');
  if (existing.recordset.length) {
    await pool.request()
      .input('reportId', sql.VarChar(80), reportId)
      .input('title', sql.NVarChar(200), title)
      .input('domain', sql.VarChar(50), 'tonkho_sku')
      .input('menuItemId', sql.Int, menuItemId)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .query(`
        UPDATE app.ReportCatalog SET
          Title = @title, Domain = @domain, MenuItemId = @menuItemId, DataSourceId = NULL,
          SourceType = 'coreZeroStock', ApiConnectionId = NULL, ApiTarget = NULL, ExternalConnectionId = NULL,
          DefinitionJson = @definitionJson, IsActive = 1
        WHERE ReportId = @reportId
      `);
    console.log(`↻ Đã cập nhật báo cáo "${title}" (${reportId}).`);
    return;
  }
  await pool.request()
    .input('reportId', sql.VarChar(80), reportId)
    .input('title', sql.NVarChar(200), title)
    .input('domain', sql.VarChar(50), 'tonkho_sku')
    .input('menuItemId', sql.Int, menuItemId)
    .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
    .query(`
      INSERT INTO app.ReportCatalog (ReportId, Title, Domain, MenuItemId, SourceType, DefinitionJson)
      VALUES (@reportId, @title, @domain, @menuItemId, 'coreZeroStock', @definitionJson)
    `);
  console.log(`✅ Đã tạo báo cáo "${title}" (${reportId}).`);
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

  for (const report of REPORTS) {
    await upsertReport(pool, menuItemId, report);
  }

  console.log('');
  console.log('✅ Xong — 2 báo cáo Core stock=0 đã sẵn sàng trong danh mục. NHỚ:');
  console.log('   1. Vào Hệ thống → Phân quyền, gán quyền xem cho đúng vai trò (script này');
  console.log('      KHÔNG tự gán quyền).');
  console.log('   2. Vào etl-admin → "Danh sách hàng Core", upload danh sách mặt hàng Core cho');
  console.log('      MỖI loại điểm (Mart/Minimart) — không upload thì báo cáo tương ứng luôn rỗng.');
  console.log('   3. Cần đã có job banhang_sku/tonkho_sku (mục 12) + doanh thu chi nhánh có');
  console.log('      Dimension "chain" (mục 1) — xem hướng_dẫn_báo_cáo.md mục 14.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
