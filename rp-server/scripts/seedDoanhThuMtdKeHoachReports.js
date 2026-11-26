// scripts/seedDoanhThuMtdKeHoachReports.js — Tạo/CẬP NHẬT idempotent 3 báo
// cáo "Theo dõi doanh thu MTD theo kế hoạch" (Toàn chuỗi/LFL/NSO,
// SourceType='doanhThuMtdKeHoach') trong app.ReportCatalog — menu "Báo cáo
// vận hành" (reports-van-hanh), báo cáo 2/4 trong 4 báo cáo vận hành mới
// theo yêu cầu người dùng (xem bc-doanhthu-mtd-ke-hoach.md). Chạy LẠI file
// này an toàn — khớp theo ReportId để UPDATE DefinitionJson thay vì tạo
// trùng.
//
// LƯU Ý QUAN TRỌNG — chạy script này KHÔNG đủ để báo cáo CÓ SỐ LIỆU:
//   1. Domain `doanhthu_chinhanh` (Thực đạt) ĐÃ CÓ SẴN (dùng chung 4 báo
//      cáo "Doanh thu cuối ngày" LDTD/HCRC) — không cần làm gì thêm.
//   2. Domain `sales-targets-doanhthu-mtd` (Chỉ tiêu) là MỚI — cần vào
//      etl-admin → "Chỉ tiêu Doanh thu MTD theo kế hoạch" (mount ở
//      etl/server.js) tải file mẫu + nhập Chỉ tiêu tháng cho từng siêu thị
//      TRƯỚC khi báo cáo có cột "Chỉ tiêu"/% hoàn thành.
//   3. Phân loại LFL/NSO đọc từ etl.NsoStores ("Siêu thị NSO" ở etl-admin)
//      — ĐÃ CÓ SẴN (dùng chung 2 báo cáo "Doanh thu theo ngành hàng").
//
// CHƯA gán quyền xem (Hệ thống → Phân quyền) — admin tự làm sau.
//
// Cách dùng:
//   node scripts/seedDoanhThuMtdKeHoachReports.js [menuCode]
require('dotenv').config();
const { sql, getPool } = require('../db');

const DOMAIN = 'doanhthu_chinhanh';

const REPORTS = [
  { reportId: 'bc-doanhthu-mtd-all', title: 'Theo dõi doanh thu MTD theo kế hoạch (Toàn chuỗi)', loaiSieuThi: 'ALL' },
  { reportId: 'bc-doanhthu-mtd-lfl', title: 'Theo dõi doanh thu MTD theo kế hoạch (LFL)', loaiSieuThi: 'LFL' },
  { reportId: 'bc-doanhthu-mtd-nso', title: 'Theo dõi doanh thu MTD theo kế hoạch (NSO)', loaiSieuThi: 'NSO' }
];

function buildDefinition(spec) {
  return {
    title: spec.title,
    exportTitle: spec.title,
    exportFileCode: `doanhthu-mtd-${spec.loaiSieuThi.toLowerCase()}`,
    loaiSieuThi: spec.loaiSieuThi,
    filters: [
      { field: 'eventDate', type: 'dateRange', label: 'Khoảng ngày (bỏ trống = đầu tháng hiện tại → hôm nay)' }
    ]
  };
}

async function upsertReport(pool, menuItemId, spec) {
  const definitionJson = JSON.stringify(buildDefinition(spec));
  const existing = await pool.request().input('reportId', sql.VarChar(80), spec.reportId)
    .query('SELECT ReportId FROM app.ReportCatalog WHERE ReportId = @reportId');
  if (existing.recordset.length) {
    await pool.request()
      .input('reportId', sql.VarChar(80), spec.reportId)
      .input('title', sql.NVarChar(200), spec.title)
      .input('domain', sql.VarChar(50), DOMAIN)
      .input('menuItemId', sql.Int, menuItemId)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .query(`
        UPDATE app.ReportCatalog SET
          Title = @title, Domain = @domain, MenuItemId = @menuItemId, DataSourceId = NULL,
          SourceType = 'doanhThuMtdKeHoach', ApiConnectionId = NULL, ApiTarget = NULL, ExternalConnectionId = NULL,
          DefinitionJson = @definitionJson, IsActive = 1
        WHERE ReportId = @reportId
      `);
    console.log(`↻ Đã cập nhật báo cáo "${spec.title}" (${spec.reportId}).`);
    return;
  }
  await pool.request()
    .input('reportId', sql.VarChar(80), spec.reportId)
    .input('title', sql.NVarChar(200), spec.title)
    .input('domain', sql.VarChar(50), DOMAIN)
    .input('menuItemId', sql.Int, menuItemId)
    .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
    .query(`
      INSERT INTO app.ReportCatalog (ReportId, Title, Domain, MenuItemId, SourceType, DefinitionJson)
      VALUES (@reportId, @title, @domain, @menuItemId, 'doanhThuMtdKeHoach', @definitionJson)
    `);
  console.log(`✅ Đã tạo báo cáo "${spec.title}" (${spec.reportId}).`);
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

  for (const spec of REPORTS) {
    await upsertReport(pool, menuItemId, spec);
  }

  console.log('');
  console.log('✅ Xong — 3 báo cáo đã sẵn sàng trong danh mục. NHỚ:');
  console.log('   1. Vào Hệ thống → Phân quyền, gán quyền xem cả 3 ReportId trên cho đúng vai trò.');
  console.log('   2. Vào etl-admin → "Chỉ tiêu Doanh thu MTD theo kế hoạch", nhập Chỉ tiêu tháng');
  console.log('      cho từng siêu thị (chưa nhập thì cột "Chỉ tiêu"/% hoàn thành hiện "—").');
  console.log('   3. Kiểm tra "Siêu thị NSO" (etl-admin) đã khai đủ mã Điểm mới mở chưa.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
