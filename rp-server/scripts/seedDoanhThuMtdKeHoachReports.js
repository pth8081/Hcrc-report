// scripts/seedDoanhThuMtdKeHoachReports.js — Tạo/CẬP NHẬT idempotent báo
// cáo "Theo dõi doanh thu MTD theo kế hoạch" trong app.ReportCatalog — menu
// "Báo cáo vận hành" (reports-van-hanh) — theo yêu cầu người dùng (xem
// bc-doanhthu-mtd-ke-hoach.md). Chạy LẠI file này an toàn — khớp theo
// ReportId để UPDATE DefinitionJson thay vì tạo trùng.
//
// GỘP 3 BÁO CÁO CŨ THÀNH 1 (bản 11.52, theo yêu cầu người dùng — đối chiếu
// file mẫu thật đơn vị gửi "0_Thực đạt MTD...") — TRƯỚC ĐÂY 3 ReportId
// riêng (Toàn chuỗi/LFL/NSO) chỉ khác field `loaiSieuThi`, người xem phải
// đổi báo cáo mới thấy góc nhìn khác. Giờ `bc-doanhthu-mtd-all` (giữ
// NGUYÊN ReportId — không đổi quyền xem/lịch gửi email đã gán trước đó)
// LUÔN hiện CẢ 3 góc nhìn trong 1 bảng (3 dòng tổng hợp "Tổng toàn chuỗi"/
// "NSO"/"LFL" ở ĐẦU bảng + chi tiết từng siêu thị bên dưới, xem
// lib/doanhThuMtdKeHoachRunner.js) — 2 ReportId cũ
// `bc-doanhthu-mtd-lfl`/`bc-doanhthu-mtd-nso` chuyển `IsActive = 0` (ẨN
// khỏi menu, KHÔNG xoá — giữ lịch sử/tránh vỡ tham chiếu cũ nếu có).
//
// LƯU Ý QUAN TRỌNG — chạy script này KHÔNG đủ để báo cáo CÓ SỐ LIỆU:
//   1. Domain `doanhthu_chinhanh` (Thực đạt TỔNG + so M-1/N-1) VÀ
//      `doanhthu_nganhhang` (tách Bán lẻ/B2B) VÀ `giaodich_chinhanh`
//      (Bill) ĐÃ CÓ SẴN (dùng chung các báo cáo khác) — không cần làm gì
//      thêm.
//   2. Domain `sales-targets-doanhthu-mtd` (Chỉ tiêu) ĐÃ CÓ — nhập qua
//      etl-admin → "Chỉ tiêu Doanh thu MTD theo kế hoạch" (mount ở
//      etl/server.js). Bản 11.52 THÊM các cột TUỲ CHỌN mới vào CÙNG file
//      Excel nhập (định dạng "generic", xem
//      etl/lib/salesTargetsImport.js:parseGenericShape() — chỉ cần thêm
//      cột vào file, KHÔNG cần sửa code import): `ChiTieuBanLe`/
//      `ChiTieuB2B` (tách Chỉ tiêu), `CTTV`/`Horeca`/`KhachBuon` (3 thành
//      phần B2B thực đạt — KHÔNG có nguồn DSMART16, người dùng tự nhập),
//      `UocThucHienBanLe`/`UocThucHienBanBuon` ("Ước thực hiện cuối
//      tháng" QLKV tự ước tính). Để trống cột nào thì cột đó hiện "—" ở
//      báo cáo, KHÔNG bắt buộc.
//   3. Phân loại LFL/NSO đọc từ etl.NsoStores ("Siêu thị NSO" ở etl-admin)
//      — ĐÃ CÓ SẴN (dùng chung 2 báo cáo "Doanh thu theo ngành hàng").
//
// CHƯA gán quyền xem (Hệ thống → Phân quyền) — admin tự làm sau (ReportId
// `bc-doanhthu-mtd-all` ĐÃ gán trước đó thì GIỮ NGUYÊN, không cần gán lại).
//
// Cách dùng:
//   node scripts/seedDoanhThuMtdKeHoachReports.js [menuCode]
require('dotenv').config();
const { sql, getPool } = require('../db');

const DOMAIN = 'doanhthu_chinhanh';

const REPORTS = [
  { reportId: 'bc-doanhthu-mtd-all', title: 'Theo dõi doanh thu MTD theo kế hoạch' }
];
// 2 ReportId cũ tách riêng LFL/NSO — chuyển IsActive=0 (bản 11.52), KHÔNG
// xoá (giữ lịch sử chạy/lịch gửi email cũ nếu có).
const RETIRED_REPORT_IDS = ['bc-doanhthu-mtd-lfl', 'bc-doanhthu-mtd-nso'];

function buildDefinition(spec) {
  return {
    title: spec.title,
    exportTitle: spec.title,
    exportFileCode: 'doanhthu-mtd',
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

  // Ẩn 2 ReportId cũ (bản 11.52, xem chú thích đầu file) — CHỈ đổi
  // IsActive, KHÔNG xoá dòng (giữ lịch sử).
  for (const reportId of RETIRED_REPORT_IDS) {
    const result = await pool.request().input('reportId', sql.VarChar(80), reportId)
      .query('UPDATE app.ReportCatalog SET IsActive = 0 WHERE ReportId = @reportId');
    if (result.rowsAffected[0]) console.log(`↻ Đã ẩn báo cáo cũ (IsActive=0): ${reportId}`);
  }

  console.log('');
  console.log('✅ Xong — báo cáo "Theo dõi doanh thu MTD theo kế hoạch" (gộp, 1 ReportId) đã sẵn sàng. NHỚ:');
  console.log('   1. Vào Hệ thống → Phân quyền — ReportId "bc-doanhthu-mtd-all" GIỮ NGUYÊN quyền đã gán');
  console.log('      trước đó (không cần gán lại); 2 ReportId cũ đã ẩn khỏi menu, không cần đụng tới.');
  console.log('   2. Vào etl-admin → "Chỉ tiêu Doanh thu MTD theo kế hoạch" — nếu muốn có đủ cột CTTV/');
  console.log('      Horeca/Khách buôn/Ước thực hiện cuối tháng/Chỉ tiêu Bán lẻ-B2B, tải lại file Excel');
  console.log('      THÊM các cột tuỳ chọn mới (xem chú thích đầu file) — để trống vẫn chạy được, hiện "—".');
  console.log('   3. Kiểm tra "Siêu thị NSO" (etl-admin) đã khai đủ mã Điểm mới mở chưa.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
