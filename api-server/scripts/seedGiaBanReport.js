// scripts/seedGiaBanReport.js — Tạo/CẬP NHẬT idempotent báo cáo "gia-ban"
// (api.ReportCatalog) — bản 10.71+, theo yêu cầu người dùng: API tra giá
// thường + giá khuyến mại theo mã hàng, dùng cho nhiều app đối tác (vd BRG
// Scan and Checkout) — `GET /api/v1/reports/gia-ban/run?maHang=...&maDiem=...`
// — xem "api-gia-ban-cho-doi-tac.md".
//
// Đọc domain `giaban_zone_sku` ĐÃ CÓ SẴN (job "Giá bán theo SKU - Live
// (DSMART16)", xem etl/scripts/seedGiaBanSync.js) + domain `vung_gia_stk`
// (job "Vùng giá theo siêu thị - Live (DSMART16)", xem
// etl/scripts/seedVungGiaSync.js) — KHÔNG tạo domain/VIEW/job đồng bộ mới
// ở đây.
//
// `singleLookup` (khác hẳn các báo cáo "ton-kho" kiểu phân trang) — xem
// routes/v1/reports.js:handleSingleLookup() — trả ĐÚNG 1 kết quả (không
// phân trang), yêu cầu BẮT BUỘC query `maHang` + `maDiem`.
//
// ĐIỀU KIỆN TRƯỚC KHI CHẠY:
//   1. Domain `giaban_zone_sku` đã có dữ liệu (chạy xong
//      etl/scripts/seedGiaBanSync.js ít nhất 1 lần).
//   2. Domain `vung_gia_stk` đã có dữ liệu (chạy xong
//      etl/scripts/seedVungGiaSync.js ít nhất 1 lần).
//   3. `.env` của api-server đã điền đủ `ETL_DIEM_STK_*` (dùng lại "Ánh xạ
//      Điểm - STK_ID" đã có cho API "ton-kho" — xem api-server/.env.example).
//
// Cách dùng:
//   node scripts/seedGiaBanReport.js
require('dotenv').config();
const { sql, getPool } = require('../db');

const REPORT_ID = 'gia-ban';
const DOMAIN = 'giaban_zone_sku';

const DEFINITION = {
  title: 'Giá bán theo mã hàng',
  domain: DOMAIN,
  // bản 10.75 — maVach (nếu đối tác gửi lên) nay được dịch sang maHang
  // TRƯỚC qua domain riêng `mavach_mahang` (lib/barcodeLookup.js, mang ĐỦ
  // mọi mã vạch của 1 SKU, không chỉ mã mặc định) — definition này chỉ
  // còn cần matchField theo maHang, không cần khai maVachField nữa.
  singleLookup: { maHangField: 'MaHangHienThi', zoneField: 'MaVungGia' },
  columns: [
    { key: 'maHang', label: 'Mã mặt hàng', formula: 'MaHangHienThi' },
    { key: 'tenHang', label: 'Tên mặt hàng', formula: 'TenHang' },
    { key: 'maVach', label: 'Mã vạch', formula: 'MaVach' },
    { key: 'giaThuong', label: 'Giá thường', formula: 'measures.GiaThuong' },
    { key: 'giaKhuyenMai', label: 'Giá khuyến mại', formula: 'measures.GiaKhuyenMai' },
    { key: 'coKhuyenMai', label: 'Đang có khuyến mại', formula: 'CoKhuyenMai' },
    { key: 'capNhatLuc', label: 'Cập nhật lúc', formula: 'syncedAt' }
  ]
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
  console.log('   2. Kiểm tra: GET /api/v1/reports/gia-ban/run?maHang=<mã hàng thật>&maDiem=<mã Điểm thật>');
  console.log('      kèm header X-API-Key đúng của đối tác đó.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
