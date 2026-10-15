// scripts/seedTonKhoChiTietReport.js — Tạo/CẬP NHẬT idempotent báo cáo
// "Tồn kho" (bc-ton-kho-chi-tiet, SourceType='directDb', nhóm Mua hàng)
// trong app.ReportCatalog — thay cho việc dán tay DefinitionJson qua
// rp-user. Chạy LẠI file này an toàn — khớp theo ReportId để UPDATE
// DefinitionJson thay vì tạo trùng.
//
// Yêu cầu người dùng: lọc theo ngành hàng, theo siêu thị, theo nhà cung
// cấp, theo kênh mua (mua riêng/mua chung), điều kiện lớn hơn/nhỏ hơn
// (nhập số) trên Tồn kho hiện tại. Nhà cung cấp/kênh mua lấy từ ĐƠN GẦN
// NHẤT của đúng mã hàng tại đúng chi nhánh (không phải "NCC mặc định" —
// DSMART16 không có khái niệm này, xem VIEW nguồn).
//
// LƯU Ý QUAN TRỌNG — chạy script này KHÔNG đủ để báo cáo CÓ SỐ LIỆU:
//   1. DBA chạy `deploy/Thiết lập VIEW Tồn kho Chi tiết theo SKU (DSMART16).sql`.
//   2. Chạy `node etl/scripts/seedTonKhoChiTietSync.js` (tạo job đồng bộ).
// Không làm đủ 2 bước trên, báo cáo luôn trả về rỗng (không lỗi).
//
// CHƯA gán quyền xem (Hệ thống → Phân quyền) — admin tự làm sau.
//
// Cách dùng:
//   node scripts/seedTonKhoChiTietReport.js [menuCode]
// menuCode mặc định "reports-mua-hang" (theo yêu cầu người dùng).
require('dotenv').config();
const { sql, getPool } = require('../db');

const REPORT_ID = 'bc-ton-kho-chi-tiet';
const TITLE = 'Tồn kho';
const DOMAIN = 'tonkho_chitiet_sku';

function buildDefinition() {
  return {
    title: TITLE,
    domain: DOMAIN,
    filters: [
      {
        field: 'MaNganhHang', type: 'multiSelect', label: 'Ngành hàng',
        optionsSource: { domain: DOMAIN, valueField: 'MaNganhHang', labelField: 'TenNganhHang' }
      },
      {
        field: 'MaChiNhanh', type: 'multiSelect', label: 'Siêu thị',
        optionsSource: { domain: DOMAIN, valueField: 'MaChiNhanh', labelField: 'TenChiNhanh' }
      },
      {
        field: 'MaNCC', type: 'multiSelect', label: 'Nhà cung cấp (đơn gần nhất)',
        optionsSource: { domain: DOMAIN, valueField: 'MaNCC', labelField: 'TenNCC' }
      },
      {
        field: 'KenhMua', type: 'select', label: 'Kênh mua (đơn gần nhất)',
        options: [
          { value: 'Mua riêng', label: 'Mua riêng' },
          { value: 'Mua chung', label: 'Mua chung' }
        ]
      },
      {
        field: 'tonKhoMin', column: 'measures.SoLuongTon', type: 'numberMin', label: 'Điều kiện lớn hơn (Tồn kho)'
      },
      {
        field: 'tonKhoMax', column: 'measures.SoLuongTon', type: 'numberMax', label: 'Điều kiện nhỏ hơn (Tồn kho)'
      }
    ],
    // TẤT CẢ cột đều khai dạng công thức (formula = chính tên field, vd
    // "TenChiNhanh") — lib/reportEngine.js:projectColumns() CHỈ hỗ trợ
    // nhãn (label) TUỲ CHỌN qua đường công thức; cột object KHÔNG có
    // formula bị projectColumns() coi là "chuỗi tên field thô" (ném lỗi
    // nếu không phải chuỗi thật) — xem chú thích hàm đó.
    columns: [
      { key: 'maChiNhanh', label: 'Mã chi nhánh', formula: 'MaChiNhanh' },
      { key: 'tenChiNhanh', label: 'Siêu thị', formula: 'TenChiNhanh' },
      { key: 'maHang', label: 'Mã hàng', formula: 'MaHangHienThi' },
      { key: 'tenHang', label: 'Tên hàng', formula: 'TenHang' },
      { key: 'tenNganhHang', label: 'Ngành hàng', formula: 'TenNganhHang' },
      { key: 'tenNCC', label: 'Nhà cung cấp (đơn gần nhất)', formula: 'TenNCC' },
      { key: 'kenhMua', label: 'Kênh mua (đơn gần nhất)', formula: 'KenhMua' },
      { key: 'tonKho', label: 'Tồn kho hiện tại', formula: 'measures.SoLuongTon' }
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
          SourceType = 'directDb', ApiConnectionId = NULL, ApiTarget = NULL, ExternalConnectionId = NULL,
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
      VALUES (@reportId, @title, @domain, @menuItemId, 'directDb', @definitionJson)
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
  console.log('✅ Xong — báo cáo đã sẵn sàng. NHỚ:');
  console.log('   1. Đã chạy VIEW + node etl/scripts/seedTonKhoChiTietSync.js (domain có dữ liệu).');
  console.log('   2. Vào Hệ thống → Phân quyền gán quyền xem cho đúng vai trò — script này KHÔNG tự gán quyền.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
