// scripts/seedTonKhoReport.js — Tạo/CẬP NHẬT idempotent báo cáo "ton-kho"
// (api.ReportCatalog) — bản 10.46, theo yêu cầu người dùng: cung cấp tồn
// kho LIVE toàn hệ thống (mọi siêu thị) cho đối tác ngoài qua
// `GET /api/v1/reports/ton-kho/run` — xem "Tai-lieu-API-Ton-kho-cho-doi-tac.md".
//
// Đọc domain `tonkho_chitiet_sku` ĐÃ CÓ SẴN (dùng chung VIEW/job đồng bộ
// với báo cáo "Tồn kho chi tiết" nội bộ rp-server — xem
// "bc-ton-kho-chi-tiet.md") — KHÔNG tạo domain/VIEW/job đồng bộ mới.
//
// ĐIỀU KIỆN TRƯỚC KHI CHẠY:
//   1. Domain `tonkho_chitiet_sku` đã có dữ liệu (job "Tồn kho Chi tiết
//      theo SKU - Live (DSMART16)" đã chạy ít nhất 1 lần — xem
//      "etl/scripts/seedTonKhoChiTietSync.js").
//   2. Đã chạy lại VIEW "deploy/Thiết lập VIEW Tồn kho Chi tiết theo SKU
//      (DSMART16).sql" bản 10.46 (thêm cột `NgayNhapGanNhat`) + chạy lại
//      "etl/scripts/seedTonKhoChiTietSync.js" để đồng bộ thêm cột đó.
//   3. `.env` của api-server đã điền đủ `ETL_DIEM_STK_*` (xem
//      api-server/.env.example) — thiếu thì cột `tenSieuThi` sẽ hiện
//      "(chưa khai tên)" cho mọi dòng, không lỗi 500.
//
// Cách dùng:
//   node scripts/seedTonKhoReport.js
require('dotenv').config();
const { sql, getPool } = require('../db');

const REPORT_ID = 'ton-kho';
const DOMAIN = 'tonkho_chitiet_sku';

const DEFINITION = {
  title: 'Tồn kho toàn hệ thống',
  domain: DOMAIN,
  filters: [],
  columns: [
    { key: 'maNganhHang', label: 'Mã ngành hàng', formula: 'MaNganhHang' },
    { key: 'tenNganhHang', label: 'Tên ngành hàng', formula: 'TenNganhHang' },
    { key: 'maHang', label: 'Mã mặt hàng', formula: 'MaHangHienThi' },
    { key: 'tenHang', label: 'Tên mặt hàng', formula: 'TenHang' },
    { key: 'soLuongTon', label: 'Số lượng tồn', formula: 'measures.SoLuongTon' },
    { key: 'maKho', label: 'Mã kho', formula: 'MaChiNhanh' },
    // maDiem/tenSieuThi — formula CHỈ LÀ GIÁ TRỊ TẠM (placeholder, bắt
    // buộc phải có vì projectColumns() yêu cầu mọi cột object có formula,
    // xem lib/reportEngine.js) — GIÁ TRỊ THẬT được GHI ĐÈ sau, qua
    // definition.translateStkToStore bên dưới (routes/v1/reports.js).
    { key: 'maDiem', label: 'Mã Điểm (siêu thị)', formula: 'MaChiNhanh' },
    { key: 'tenSieuThi', label: 'Tên siêu thị', formula: 'MaChiNhanh' },
    { key: 'ngay', label: 'Ngày', formula: 'eventDate' },
    { key: 'ngayNhapGanNhat', label: 'Ngày nhập gần nhất', formula: 'NgayNhapGanNhat' },
    { key: 'capNhatLuc', label: 'Cập nhật lúc', formula: 'syncedAt' }
  ],
  // translateStkToStore (bản 10.46) — xem routes/v1/reports.js: sau khi
  // chạy xong báo cáo, dịch `maKho` (STK_ID thô) sang Mã Điểm/Tên siêu thị
  // CHUẨN qua "Ánh xạ Điểm - STK_ID", GHI ĐÈ 2 cột placeholder ở trên.
  translateStkToStore: { stkField: 'maKho', maDiemField: 'maDiem', tenField: 'tenSieuThi' }
};

async function main() {
  const pool = await getPool('ADMIN');
  const definitionJson = JSON.stringify(DEFINITION);

  const existing = await pool.request().input('reportId', sql.VarChar(80), REPORT_ID)
    .query('SELECT ReportId FROM api.ReportCatalog WHERE ReportId = @reportId');

  if (existing.recordset.length) {
    await pool.request()
      .input('reportId', sql.VarChar(80), REPORT_ID)
      .input('title', sql.NVarChar(200), DEFINITION.title)
      .input('domain', sql.VarChar(50), DOMAIN)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .query(`
        UPDATE api.ReportCatalog SET
          Title = @title, Domain = @domain, DefinitionJson = @definitionJson, IsActive = 1
        WHERE ReportId = @reportId
      `);
    console.log(`↻ Đã cập nhật báo cáo "${DEFINITION.title}" (${REPORT_ID}).`);
  } else {
    await pool.request()
      .input('reportId', sql.VarChar(80), REPORT_ID)
      .input('title', sql.NVarChar(200), DEFINITION.title)
      .input('domain', sql.VarChar(50), DOMAIN)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .query(`
        INSERT INTO api.ReportCatalog (ReportId, Title, Domain, DefinitionJson)
        VALUES (@reportId, @title, @domain, @definitionJson)
      `);
    console.log(`✅ Đã tạo báo cáo "${DEFINITION.title}" (${REPORT_ID}).`);
  }

  console.log('');
  console.log('✅ Xong. NHỚ:');
  console.log('   1. Vào api-admin → "Đối tác" → đúng đối tác cần dùng → nút "Báo cáo');
  console.log(`      được gọi" → tick "${DEFINITION.title}" (${REPORT_ID}) — mặc định`);
  console.log('      KHÔNG đối tác nào gọi được, kể cả có scope "reports" hợp lệ.');
  console.log('   2. Kiểm tra: GET /api/v1/reports/ton-kho/run?pageSize=5 kèm header');
  console.log('      X-API-Key đúng của đối tác đó.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
