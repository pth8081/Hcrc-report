// scripts/seedPhuHangCoreReports.js — Tạo/CẬP NHẬT idempotent 2 báo cáo
// "Phủ hàng Core - Chi tiết"/"Recap ST" (SourceType='phuHangCoreChiTiet'/
// 'phuHangCoreRecap') trong app.ReportCatalog — menu "Báo cáo vận hành",
// báo cáo 4/4 trong 4 báo cáo vận hành mới theo yêu cầu người dùng (CHỈ 2
// sheet như file mẫu gốc, xem bc-phu-hang-core.md). Chạy LẠI file này an
// toàn — khớp theo ReportId để UPDATE DefinitionJson thay vì tạo trùng.
//
// LƯU Ý QUAN TRỌNG — chạy script này KHÔNG đủ để báo cáo CÓ SỐ LIỆU: cần
// đã có "Danh sách hàng Core" (etl-admin) upload đủ cho MART, VÀ 2 domain
// `banhang_sku`/`tonkho_sku` đã chạy ổn (xem bc-ton-kho-0.md Bước 1+2) —
// KHÔNG cần VIEW/job mới nào khác (domain `doanhthu_sku_nganhhang`/
// `doanhthu_nganhhang` tái dùng nguyên vẹn, đã có sẵn).
//
// CHƯA gán quyền xem (Hệ thống → Phân quyền) — admin tự làm sau.
//
// Cách dùng:
//   node scripts/seedPhuHangCoreReports.js [menuCode]
require('dotenv').config();
const { sql, getPool } = require('../db');

const REPORTS = [
  { reportId: 'bc-phu-hang-core-chi-tiet', title: 'Phủ hàng Core - Chi tiết', sourceType: 'phuHangCoreChiTiet', domain: 'tonkho_sku' },
  { reportId: 'bc-phu-hang-core-recap', title: 'Phủ hàng Core - Recap ST', sourceType: 'phuHangCoreRecap', domain: 'tonkho_sku' }
];

function buildDefinition(spec) {
  return {
    title: spec.title,
    exportTitle: spec.title,
    exportFileCode: spec.reportId,
    filters: [
      { field: 'eventDate', type: 'date', label: 'Ngày neo (bỏ trống = hôm nay) — W = 7 ngày kết thúc ngày này' }
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
      .input('domain', sql.VarChar(50), spec.domain)
      .input('menuItemId', sql.Int, menuItemId)
      .input('sourceType', sql.VarChar(20), spec.sourceType)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .query(`
        UPDATE app.ReportCatalog SET
          Title = @title, Domain = @domain, MenuItemId = @menuItemId, DataSourceId = NULL,
          SourceType = @sourceType, ApiConnectionId = NULL, ApiTarget = NULL, ExternalConnectionId = NULL,
          DefinitionJson = @definitionJson, IsActive = 1
        WHERE ReportId = @reportId
      `);
    console.log(`↻ Đã cập nhật báo cáo "${spec.title}" (${spec.reportId}).`);
    return;
  }
  await pool.request()
    .input('reportId', sql.VarChar(80), spec.reportId)
    .input('title', sql.NVarChar(200), spec.title)
    .input('domain', sql.VarChar(50), spec.domain)
    .input('menuItemId', sql.Int, menuItemId)
    .input('sourceType', sql.VarChar(20), spec.sourceType)
    .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
    .query(`
      INSERT INTO app.ReportCatalog (ReportId, Title, Domain, MenuItemId, SourceType, DefinitionJson)
      VALUES (@reportId, @title, @domain, @menuItemId, @sourceType, @definitionJson)
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
  console.log('✅ Xong — 2 báo cáo đã sẵn sàng trong danh mục. NHỚ:');
  console.log('   1. Vào Hệ thống → Phân quyền, gán quyền xem cả 2 ReportId trên cho đúng vai trò.');
  console.log('   2. Cần đã upload "Danh sách hàng Core" (etl-admin) cho LoaiDiem=MART.');
  console.log('   3. Cần 2 job banhang_sku/tonkho_sku đã chạy ổn (xem bc-ton-kho-0.md Bước 1+2).');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
