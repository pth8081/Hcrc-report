// scripts/seedTonKhoReport.js — Tạo/CẬP NHẬT idempotent báo cáo "ton-kho"
// (api.ReportCatalog) — bản 10.46, theo yêu cầu người dùng: cung cấp tồn
// kho LIVE toàn hệ thống (mọi siêu thị) cho đối tác ngoài qua
// `GET /api/v1/reports/ton-kho/run` — xem "api-ton-kho-cho-doi-tac.md".
//
// SỬA bản 10.50 — thêm trường maVach (SKU_DEF.BARCODE, đã JOIN sẵn trong
// VIEW nguồn, xác nhận bằng dữ liệu thật là mã EAN-13) — chạy lại script
// này SAU KHI đã chạy lại VIEW + "etl/scripts/seedTonKhoChiTietSync.js"
// bản 10.50 (thêm cột MaVach), nếu không cột maVach sẽ luôn NULL.
//
// SỬA bản 10.76 — thêm trường `dsMaVach` (TOÀN BỘ mã vạch đã đăng ký của 1
// mã hàng, không chỉ mã mặc định trong `maVach`) — SỬA LỖI THẬT: màn "Ghi
// Nhận" (HCRC Workspace) dùng dữ liệu API này để đối chiếu mã vạch quét,
// trước đây chỉ có `maVach` (1 mã mặc định) nên quét đúng mã vạch PHỤ của
// mã hàng (1 mã hàng có thể có 2-3 mã vạch đăng ký trong `dbo.BARCODE`, xem
// "api-gia-ban-cho-doi-tac.md") bị báo sai "không khớp". Đọc domain
// `mavach_mahang` ĐÃ CÓ SẴN (job "Mã vạch theo SKU - Live (DSMART16)", xem
// etl/scripts/seedMaVachSync.js) qua `definition.attachAltBarcodes` —
// KHÔNG cần VIEW/job đồng bộ mới.
//
// Đọc domain `tonkho_chitiet_sku` ĐÃ CÓ SẴN (dùng chung VIEW/job đồng bộ
// với báo cáo "Tồn kho chi tiết" nội bộ rp-server — xem
// "bc-ton-kho-chi-tiet.md") — KHÔNG tạo domain/VIEW/job đồng bộ mới.
//
// ĐIỀU KIỆN TRƯỚC KHI CHẠY:
//   1. Domain `tonkho_chitiet_sku` đã có dữ liệu (job "Tồn kho Chi tiết
//      theo SKU - Live (DSMART16)" đã chạy ít nhất 1 lần — xem
//      "etl/scripts/seedTonKhoChiTietSync.js").
//   2. Đã chạy lại VIEW "deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW
//      Tồn kho Chi tiết theo SKU (DSMART16).sql" bản 10.46 (thêm cột
//      `NgayNhapGanNhat`) + chạy lại
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
  // latestEventDateOnly (bản 10.60) — domain `tonkho_chitiet_sku` GIỮ LỊCH
  // SỬ MỖI NGÀY (5-11 TRIỆU dòng, xem dwh/schema.sql/bc-core-ton-kho-0.md),
  // nhưng báo cáo này là "tồn kho LIVE" — chỉ cần ĐÚNG ngày đồng bộ gần
  // nhất, không cần/không nên lẫn dữ liệu nhiều ngày. Thiếu dòng này khiến
  // mỗi lần gọi phải cân nhắc phân trang XUYÊN SUỐT lịch sử nhiều ngày của
  // domain — đo thật qua api-admin "Lịch sử": 7-16 giây/lần, có lần vượt
  // timeout SQL 15s -> HTTP 500 (sự cố thật đối tác báo "Failed to fetch").
  // Xem lib/reportEngine.js.
  latestEventDateOnly: true,
  filters: [],
  columns: [
    { key: 'maNganhHang', label: 'Mã ngành hàng', formula: 'MaNganhHang' },
    { key: 'tenNganhHang', label: 'Tên ngành hàng', formula: 'TenNganhHang' },
    { key: 'maHang', label: 'Mã mặt hàng', formula: 'MaHangHienThi' },
    { key: 'tenHang', label: 'Tên mặt hàng', formula: 'TenHang' },
    { key: 'maVach', label: 'Mã vạch', formula: 'MaVach' },
    // dsMaVach — formula CHỈ LÀ GIÁ TRỊ TẠM (placeholder, xem chú thích ở
    // maDiem/tenSieuThi bên dưới) — GIÁ TRỊ THẬT (mảng TOÀN BỘ mã vạch của
    // mã hàng này) được GHI ĐÈ sau, qua definition.attachAltBarcodes bên
    // dưới (routes/v1/reports.js) — bản 10.76.
    { key: 'dsMaVach', label: 'Danh sách mã vạch (đầy đủ, gồm mã mặc định)', formula: 'MaVach' },
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
  // rawStkField (bản 10.54) — tên cột STK_ID THÔ trong Dimensions (khác
  // `stkField` ở trên — đó là KEY CỘT ĐẦU RA sau projectColumns(), dùng để
  // dịch nhãn; cái này là tên field THẬT trong Dimensions JSON, dùng để lọc
  // NGAY TRONG SQL — xem forcedConditions ở lib/reportEngine.js và nhánh
  // api.ConsumerStoreAccess ở routes/v1/reports.js — BẮT BUỘC lọc Ở SQL,
  // TRƯỚC khi phân trang, không lọc sau projectColumns() như maDiem/
  // tenSieuThi, nếu không đối tác bị giới hạn siêu thị có thể nhận 1 trang
  // ÍT HƠN pageSize dù CÒN dữ liệu ở trang sau, hiểu lầm là đã hết).
  translateStkToStore: { stkField: 'maKho', maDiemField: 'maDiem', tenField: 'tenSieuThi', rawStkField: 'MaChiNhanh' },
  // attachAltBarcodes (bản 10.76) — xem routes/v1/reports.js: sau khi chạy
  // xong báo cáo, tra TOÀN BỘ mã vạch của `maHang` qua domain `mavach_mahang`
  // (lib/barcodeLookup.js:loadAltBarcodesBySku()), GHI ĐÈ cột placeholder
  // `dsMaVach` ở trên. `fallbackVachField` — nếu mã hàng đó CHƯA có dòng
  // nào trong `dbo.BARCODE` (vd dữ liệu domain `mavach_mahang` chưa đồng bộ
  // kịp) thì dùng tạm đúng giá trị cột `maVach` (mã mặc định) làm 1 phần tử
  // duy nhất, KHÔNG trả mảng rỗng khi đã biết ít nhất 1 mã vạch.
  attachAltBarcodes: { maHangField: 'maHang', fallbackVachField: 'maVach', targetField: 'dsMaVach' }
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
