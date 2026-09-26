// scripts/seedTopZeroStockReport.js — Tạo/CẬP NHẬT idempotent báo cáo
// "Top bán chạy đang tồn kho = 0" (bc-ton-kho-0, SourceType='topZeroStock')
// trong app.ReportCatalog — thay cho việc dán tay DefinitionJson qua rp-user
// (Hệ thống → Biểu mẫu). Xem đầy đủ giải thích công thức + hướng dẫn tạo 2
// VIEW/job đồng bộ bắt buộc (banhang_sku/tonkho_sku) + 4 VIEW/job tuỳ chọn
// "Chờ nhập"/"Đã nhập" ở hướng_dẫn_báo_cáo.md mục 12. Chạy LẠI file này an
// toàn — khớp theo ReportId để UPDATE DefinitionJson thay vì tạo trùng.
//
// LƯU Ý QUAN TRỌNG — chạy script này KHÔNG đủ để báo cáo CÓ SỐ LIỆU: đây
// chỉ là bước tạo "khung" báo cáo trong app.ReportCatalog. Báo cáo chỉ thật
// sự chạy được sau khi:
//   1. DBA tạo 2 VIEW bắt buộc (dbo.vw_BanHangTheoSKU, dbo.vw_TonKhoTheoSKU)
//      trên CSDL DSMART16 — xem mục 12 Bước 1.
//   2. Admin etl-admin tạo 2 job "Theo bảng" trỏ đúng 2 VIEW đó, domain
//      "banhang_sku"/"tonkho_sku", BẬT "Giữ lịch sử theo ngày" — xem mục 12
//      Bước 2.
//   3. (Tuỳ chọn) lặp lại bước 1+2 cho 4 VIEW/job "Chờ nhập"/"Đã nhập" nếu
//      muốn có 4 cột tham khảo đó — xem mục 12 Bước 2b.
// Không có 2 job bắt buộc chạy trước, báo cáo sẽ luôn trả về rỗng (không
// lỗi, không có dữ liệu để tính) — xem lib/topSellingZeroStockRunner.js.
//
// CHƯA gán quyền xem (Hệ thống → Phân quyền) — đó là quyết định "ai được
// xem" tuỳ tổ chức, cố ý ĐỂ NGUYÊN cho admin tự làm, script này chỉ tạo báo
// cáo.
//
// Cách dùng:
//   node scripts/seedTopZeroStockReport.js [menuCode]
// menuCode (tuỳ chọn) — Code trong app.MenuItems để gán báo cáo vào, mặc
// định "reports-van-hanh" (đã seed sẵn trong rp-db/schema.sql) — báo cáo
// tồn kho thuộc nhóm vận hành, không phải kinh doanh (khác 2 báo cáo
// LDTD/HCRC ở seedLdtdHcrcReports.js).
require('dotenv').config();
const { sql, getPool } = require('../db');

const REPORT_ID = 'bc-ton-kho-0';
const TITLE = 'Top bán chạy đang tồn kho = 0';

// Khớp CHÍNH XÁC tên domain đã thống nhất ở hướng_dẫn_báo_cáo.md mục 12 —
// admin đặt tên domain khác lúc tạo job etl-admin thì phải sửa lại đúng
// tương ứng ở đây (hoặc sửa domain job cho khớp tên dưới đây).
function buildDefinition() {
  return {
    title: TITLE,
    salesDomain: 'banhang_sku',
    stockDomain: 'tonkho_sku',
    // 4 domain "Chờ nhập"/"Đã nhập" — TUỲ CHỌN, chỉ hiện cột tương ứng khi
    // job/domain đó thật sự có dữ liệu; không tạo job nào thì cột đó luôn
    // trống (không lỗi) — xem lib/topSellingZeroStockRunner.js.
    pendingSupplierDomain: 'chonhap_ncc',
    pendingTransferDomain: 'chonhap_dieuchuyen',
    receivedSupplierDomain: 'danhap_ncc',
    receivedTransferDomain: 'danhap_dieuchuyen',
    topN: 50,
    threshold: 0,
    filters: [
      {
        field: 'rankWindow', type: 'select', label: 'Khoảng thời gian xếp hạng', default: '1',
        options: [
          { value: '1', label: 'Ngày hôm trước' },
          { value: '7', label: '7 ngày gần nhất' },
          { value: '30', label: '30 ngày gần nhất' },
          { value: 'daily', label: 'Trong ngày' }
        ]
      },
      {
        field: 'branches', type: 'multiSelect', label: 'Chi nhánh',
        optionsSource: { domain: 'banhang_sku', valueField: 'MaChiNhanh', labelField: 'TenChiNhanh' }
      }
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
      .input('domain', sql.VarChar(50), 'banhang_sku')
      .input('menuItemId', sql.Int, menuItemId)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .query(`
        UPDATE app.ReportCatalog SET
          Title = @title, Domain = @domain, MenuItemId = @menuItemId, DataSourceId = NULL,
          SourceType = 'topZeroStock', ApiConnectionId = NULL, ApiTarget = NULL, ExternalConnectionId = NULL,
          DefinitionJson = @definitionJson, IsActive = 1
        WHERE ReportId = @reportId
      `);
    console.log(`↻ Đã cập nhật báo cáo "${TITLE}" (${REPORT_ID}).`);
    return;
  }
  await pool.request()
    .input('reportId', sql.VarChar(80), REPORT_ID)
    .input('title', sql.NVarChar(200), TITLE)
    .input('domain', sql.VarChar(50), 'banhang_sku')
    .input('menuItemId', sql.Int, menuItemId)
    .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
    .query(`
      INSERT INTO app.ReportCatalog (ReportId, Title, Domain, MenuItemId, SourceType, DefinitionJson)
      VALUES (@reportId, @title, @domain, @menuItemId, 'topZeroStock', @definitionJson)
    `);
  console.log(`✅ Đã tạo báo cáo "${TITLE}" (${REPORT_ID}).`);
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

  await upsertReport(pool, menuItemId);

  console.log('');
  console.log('✅ Xong — báo cáo đã sẵn sàng trong danh mục. NHỚ:');
  console.log('   1. Vào Hệ thống → Phân quyền, gán quyền xem "bc-ton-kho-0" cho đúng vai trò');
  console.log('      (script này KHÔNG tự gán quyền).');
  console.log('   2. Báo cáo CHƯA CÓ SỐ LIỆU cho tới khi tạo xong 2 VIEW (vw_BanHangTheoSKU,');
  console.log('      vw_TonKhoTheoSKU) trên DSMART16 + 2 job "Theo bảng" domain banhang_sku/');
  console.log('      tonkho_sku (BẬT "Giữ lịch sử theo ngày") ở etl-admin — xem');
  console.log('      hướng_dẫn_báo_cáo.md mục 12, Bước 1+2.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
