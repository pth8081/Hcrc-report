// scripts/seedDoanhThuTongHopHcrcReport.js — Tạo/CẬP NHẬT idempotent 2 báo
// cáo "Báo cáo tổng hợp doanh thu siêu thị (HCRC)"/"(LĐTĐ)" — bản 10.82
// (báo cáo gốc, chỉ có HCRC) + bản 10.90 (theo yêu cầu người dùng — tách
// thêm biến thể LĐTĐ, CÙNG dữ liệu doanh thu/siêu thị, CHỈ khác nguồn Chỉ
// tiêu: HCRC đọc domain `sales-targets-hcrc`, LĐTĐ đọc
// `sales-targets-ldtd` — giống đúng cách đã tách 2 báo cáo "Doanh thu
// theo ngành hàng"/"(LDTD)" trước đó, xem lib/nganhHangBrgRunner.js) —
// xem "bc-doanh-thu-tong-hop-hcrc.md".
//
// SourceType='doanhThuTongHopHcrc' (xem lib/doanhThuTongHopHcrcRunner.js) —
// cột hiển thị CỐ ĐỊNH trong code runner (giống 'topZeroStock'/'coreZeroStock'),
// DefinitionJson ở đây CHỈ cần đủ field tối thiểu (title/domain/filters/
// targetDomain) — không khai `columns` (runner tự định nghĩa).
//
// LƯU Ý QUAN TRỌNG — chạy script này KHÔNG đủ để báo cáo CÓ SỐ LIỆU:
//   1. Domain `doanhthu_nganhhang`/`doanhthu_chinhanh`/`giaodich_chinhanh`
//      ĐÃ CÓ SẴN (dùng chung, xem bản 10.86) — không cần tạo gì mới.
//   2. Domain Chỉ tiêu ĐÃ CÓ SẴN: `sales-targets-hcrc` (báo cáo HCRC) và
//      `sales-targets-ldtd` (báo cáo LĐTĐ) — báo cáo sẽ CHƯA ra số Chỉ
//      tiêu nếu đúng domain đó chưa từng được nhập trên server này.
//   3. Đã khai cột `MaQLKV`/`LoaiChuoi` cho đúng mã Điểm ở etl-admin →
//      "Ánh xạ Điểm - STK_ID" (TUỲ CHỌN — để trống vẫn chạy được, chỉ
//      thiếu đúng 2 cột đó).
//
// CHƯA gán quyền xem (Hệ thống → Phân quyền) — admin tự làm sau, RIÊNG
// cho từng báo cáo (2 báo cáo có thể cấp quyền KHÁC NHAU — vd chỉ lãnh
// đạo tập đoàn xem được báo cáo LĐTĐ).
//
// Cách dùng:
//   node scripts/seedDoanhThuTongHopHcrcReport.js [menuCode]
require('dotenv').config();
const { sql, getPool } = require('../db');

const SOURCE_TYPE = 'doanhThuTongHopHcrc';
// type: 'date' (1 ngày DUY NHẤT, KHÁC 'dateRange' các composite khác) —
// ngày được chọn là "ngày neo" cho CẢ 3 khối Ngày/Tháng/Năm cùng lúc, xem
// lib/doanhThuTongHopHcrcRunner.js. Không chọn -> mặc định hôm nay (giờ
// Việt Nam). DÙNG CHUNG cho cả 2 báo cáo.
const FILTERS = [{ field: 'eventDate', type: 'date', label: 'Ngày báo cáo' }];

// "KH doanh thu" (khối năm) = CỘNG DỒN Chỉ tiêu THÁNG đã có (ĐÚNG
// targetDomain dưới đây, domain TUẦN NHẤT — bản 10.94, SỬA bản 10.92,
// theo yêu cầu người dùng: "cộng dồn theo tháng đã có target doanh thu
// tháng LĐTĐ và HCRC cho từng ST/CH rồi nên không cần thêm phần upload
// mới" — KHÔNG CÒN domain/trang nhập Chỉ tiêu CẢ NĂM riêng nữa, xem chú
// thích đầy đủ ở lib/doanhThuTongHopHcrcRunner.js) từ đầu năm tới đúng
// tháng hiện tại.
const REPORTS = [
  {
    reportId: 'bc-doanh-thu-tong-hop-hcrc',
    title: 'Báo cáo tổng hợp doanh thu siêu thị (HCRC)',
    domain: 'doanhthu_tonghop_hcrc',
    targetDomain: 'sales-targets-hcrc'
  },
  {
    reportId: 'bc-doanh-thu-tong-hop-ldtd',
    title: 'Báo cáo tổng hợp doanh thu siêu thị (LĐTĐ)',
    domain: 'doanhthu_tonghop_ldtd',
    targetDomain: 'sales-targets-ldtd'
  }
];

function buildDefinition(report) {
  return {
    title: report.title,
    domain: report.domain,
    targetDomain: report.targetDomain,
    filters: FILTERS
  };
}

async function upsertReport(pool, menuItemId, report) {
  const definitionJson = JSON.stringify(buildDefinition(report));
  const existing = await pool.request().input('reportId', sql.VarChar(80), report.reportId)
    .query('SELECT ReportId FROM app.ReportCatalog WHERE ReportId = @reportId');

  if (existing.recordset.length) {
    await pool.request()
      .input('reportId', sql.VarChar(80), report.reportId)
      .input('title', sql.NVarChar(200), report.title)
      .input('domain', sql.VarChar(50), report.domain)
      .input('sourceType', sql.VarChar(30), SOURCE_TYPE)
      .input('menuItemId', sql.Int, menuItemId)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .query(`
        UPDATE app.ReportCatalog SET
          Title = @title, Domain = @domain, MenuItemId = @menuItemId, DataSourceId = NULL,
          SourceType = @sourceType, ApiConnectionId = NULL, ApiTarget = NULL, ExternalConnectionId = NULL,
          DefinitionJson = @definitionJson, IsActive = 1
        WHERE ReportId = @reportId
      `);
    console.log(`↻ Đã cập nhật báo cáo "${report.title}" (${report.reportId}).`);
  } else {
    await pool.request()
      .input('reportId', sql.VarChar(80), report.reportId)
      .input('title', sql.NVarChar(200), report.title)
      .input('domain', sql.VarChar(50), report.domain)
      .input('sourceType', sql.VarChar(30), SOURCE_TYPE)
      .input('menuItemId', sql.Int, menuItemId)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .query(`
        INSERT INTO app.ReportCatalog (ReportId, Title, Domain, MenuItemId, SourceType, DefinitionJson)
        VALUES (@reportId, @title, @domain, @menuItemId, @sourceType, @definitionJson)
      `);
    console.log(`✅ Đã tạo báo cáo "${report.title}" (${report.reportId}).`);
  }
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
  console.log('✅ Xong. NHỚ:');
  console.log('   1. Vào Hệ thống → Phân quyền, gán quyền xem RIÊNG cho từng báo cáo');
  console.log('      (bc-doanh-thu-tong-hop-hcrc/bc-doanh-thu-tong-hop-ldtd) — mặc định');
  console.log('      KHÔNG ai xem được, kể cả admin.');
  console.log('   2. Báo cáo "(LĐTĐ)" CHƯA CÓ SỐ Chỉ tiêu nếu domain');
  console.log('      `sales-targets-ldtd` chưa từng được nhập (etl-admin →');
  console.log('      "Chỉ tiêu Lãnh đạo Tập đoàn") trên server này.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
