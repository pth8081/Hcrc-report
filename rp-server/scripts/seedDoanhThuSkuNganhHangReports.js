// scripts/seedDoanhThuSkuNganhHangReports.js — Tạo/CẬP NHẬT idempotent 2 báo
// cáo MỚI "Báo cáo doanh thu theo ngành hàng - theo mã hàng"/"(LDTD) - theo
// mã hàng" (bản 10.41, theo yêu cầu người dùng — 2 báo cáo "Doanh thu theo
// ngành hàng" gốc KHÔNG lọc được theo Mã hàng vì VIEW nguồn cộng gộp sẵn
// theo (siêu thị, ngành hàng, ngày); người dùng đồng ý tạo báo cáo MỚI
// HOÀN TOÀN thay vì sửa 2 báo cáo hiện có — ZERO rủi ro cho báo cáo đang
// chạy). CÙNG domain `doanhthu_sku_nganhhang` — 2 báo cáo CHỈ khác
// ReportId/Title (không có khái niệm Chỉ tiêu HCRC/LĐTĐ riêng ở đây, vì
// báo cáo này phục vụ xem CHI TIẾT theo mã hàng, không so sánh Thực đạt
// với Chỉ tiêu như 2 báo cáo gốc) — đặt tên trùng tiền tố với 2 báo cáo
// gốc + hậu tố " - theo mã hàng" để dễ nhận biết, theo đúng yêu cầu người
// dùng ("tên vẫn là báo cáo doanh thu theo ngành hàng (LDTD) và doanh thu
// theo ngành hàng (HCRC)... thêm đuôi (theo mã hàng)").
//
// ⚠️ VỊ TRÍ MENU: người dùng ban đầu đề nghị đặt ở tab "Báo cáo tự do" —
// ĐÃ KIỂM TRA: tab đó (`reports-adhoc`, Path `/reports/adhoc`) KHÔNG phải
// 1 nhóm báo cáo như "Báo cáo kinh doanh"/"Mua hàng" (Path `/reports`,
// cùng ReportsPage.jsx + "Chọn báo cáo") — nó route sang HẲN 1 trang khác
// (AdhocReportPage.jsx, self-service, không hỗ trợ bộ lọc Mã hàng tìm
// kiếm+dán như yêu cầu) — KHÔNG đặt báo cáo admin-định-nghĩa vào đó được
// về mặt kỹ thuật. Tạm đặt ở "Báo cáo kinh doanh" (cạnh 2 báo cáo gốc,
// cùng chủ đề) — đổi `menuCode` tham số dòng lệnh nếu người dùng muốn vị
// trí khác.
//
// LƯU Ý QUAN TRỌNG — chạy script này KHÔNG đủ để báo cáo CÓ SỐ LIỆU:
//   1. DBA chạy "deploy/Thiết lập VIEW Doanh thu theo Mã hàng-Ngành hàng
//      (DSMART16 trung tâm).sql".
//   2. Chạy `node etl/scripts/seedDoanhThuSkuNganhHangSync.js` (tạo job
//      đồng bộ).
// Không làm đủ 2 bước trên, báo cáo luôn trả về rỗng (không lỗi).
//
// CHƯA gán quyền xem (Hệ thống → Phân quyền) — admin tự làm sau.
//
// Cách dùng:
//   node scripts/seedDoanhThuSkuNganhHangReports.js [menuCode]
require('dotenv').config();
const { sql, getPool } = require('../db');

const DOMAIN = 'doanhthu_sku_nganhhang';

// Bộ lọc "Mã hàng" (mirror ĐÚNG MA_HANG_FILTER của seedPurchaseOrderReports.js,
// bản 10.31/10.35 — multiSelect, searchable + dán danh sách để tự chọn, vì
// SearchableSelect.jsx dùng CHUNG toàn hệ thống) — đọc DISTINCT MaHang/TenHang
// thật từ dữ liệu đã đồng bộ.
const MA_HANG_FILTER = {
  field: 'MaHang', type: 'multiSelect', label: 'Mã hàng',
  optionsSource: { domain: DOMAIN, valueField: 'MaHang', labelField: 'TenHang' }
};

const NGANH_HANG_FILTER = {
  field: 'MaNganhHang', type: 'multiSelect', label: 'Ngành hàng',
  optionsSource: { domain: DOMAIN, valueField: 'MaNganhHang', labelField: 'TenNganhHang' }
};

// Bộ lọc "Siêu thị" (bản 10.39/10.40 — translateStkViaDiemStkMapping: dịch
// nhãn qua "Ánh xạ Điểm - STK_ID", GIỮ NGUYÊN value = STK_ID thô, vì domain
// này lưu Dimensions.STK_ID trực tiếp, không qua BU_ID như domain
// don_dat_hang/doanhthu_chinhanh).
const SIEU_THI_FILTER = {
  field: 'STK_ID', type: 'multiSelect', label: 'Siêu thị',
  optionsSource: { domain: DOMAIN, valueField: 'STK_ID', translateStkViaDiemStkMapping: true }
};

const COLUMNS = [
  { key: 'stt', label: 'TT' },
  { key: 'eventDate', label: 'Ngày', formula: 'eventDate' },
  { key: 'stkId', label: 'Mã kho', formula: 'STK_ID' },
  { key: 'maHang', label: 'Mã hàng', formula: 'MaHangHienThi' },
  { key: 'tenHang', label: 'Tên hàng', formula: 'TenHang' },
  { key: 'tenNganhHang', label: 'Ngành hàng', formula: 'TenNganhHang' },
  { key: 'soLuongBan', label: 'SL bán', formula: 'measures.SoLuongBan' },
  { key: 'doanhThu', label: 'Doanh thu', formula: 'measures.DoanhThu' },
  { key: 'doanhThuBanLe', label: 'Doanh thu — Bán lẻ', formula: 'measures.DoanhThuBanLe' },
  { key: 'doanhThuBanBuon', label: 'Doanh thu — Bán buôn', formula: 'measures.DoanhThuBanBuon' },
  { key: 'laiGop', label: 'Lãi gộp', formula: 'measures.LaiGop' },
  { key: 'laiGopBanLe', label: 'Lãi gộp — Bán lẻ', formula: 'measures.LaiGopBanLe' },
  { key: 'laiGopBanBuon', label: 'Lãi gộp — Bán buôn', formula: 'measures.LaiGopBanBuon' },
  { key: 'giaTriHongHuy', label: 'Giá trị hàng hỏng hủy', formula: 'measures.GiaTriHongHuy' }
];

function buildDefinition(title) {
  return {
    title,
    domain: DOMAIN,
    filters: [
      { field: 'eventDate', type: 'dateRange', label: 'Khoảng ngày báo cáo' },
      MA_HANG_FILTER,
      NGANH_HANG_FILTER,
      SIEU_THI_FILTER
    ],
    columns: COLUMNS
  };
}

const REPORTS = [
  { reportId: 'bc-doanh-thu-sku-nganhhang', title: 'Báo cáo doanh thu theo ngành hàng - theo mã hàng' },
  { reportId: 'bc-doanh-thu-sku-nganhhang-ldtd', title: 'Báo cáo doanh thu theo ngành hàng (LDTD) - theo mã hàng' }
];

async function upsertReport(pool, menuItemId, report) {
  const definitionJson = JSON.stringify(buildDefinition(report.title));
  const existing = await pool.request().input('reportId', sql.VarChar(80), report.reportId)
    .query('SELECT ReportId FROM app.ReportCatalog WHERE ReportId = @reportId');
  if (existing.recordset.length) {
    await pool.request()
      .input('reportId', sql.VarChar(80), report.reportId)
      .input('title', sql.NVarChar(200), report.title)
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
    console.log(`↻ Đã cập nhật báo cáo "${report.title}" (${report.reportId}).`);
    return;
  }
  await pool.request()
    .input('reportId', sql.VarChar(80), report.reportId)
    .input('title', sql.NVarChar(200), report.title)
    .input('domain', sql.VarChar(50), DOMAIN)
    .input('menuItemId', sql.Int, menuItemId)
    .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
    .query(`
      INSERT INTO app.ReportCatalog (ReportId, Title, Domain, MenuItemId, SourceType, DefinitionJson)
      VALUES (@reportId, @title, @domain, @menuItemId, 'directDb', @definitionJson)
    `);
  console.log(`✅ Đã tạo báo cáo "${report.title}" (${report.reportId}).`);
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
  console.log(`✅ Xong — cả ${REPORTS.length} báo cáo đã sẵn sàng trong danh mục. NHỚ:`);
  console.log('   1. Vào Hệ thống → Phân quyền, gán quyền xem đúng vai trò cho đủ');
  console.log('      ' + REPORTS.map(r => r.reportId).join('/') + ' — script này KHÔNG tự gán quyền.');
  console.log('   2. Báo cáo CHƯA CÓ SỐ LIỆU cho tới khi tạo xong VIEW');
  console.log('      dbo.V_HCRC_DOANHTHU_SKU_NGANHHANG trên DSMART16 + chạy');
  console.log('      node scripts/seedDoanhThuSkuNganhHangSync.js (thư mục etl/).');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
