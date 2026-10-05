// scripts/seedPurchaseOrderReports.js — Tạo/CẬP NHẬT idempotent 3 báo cáo
// "Đơn đặt hàng"/"Đơn nhập hàng"/"So sánh đặt–nhận" (SourceType='purchaseOrder')
// trong app.ReportCatalog — xem bc-don-dat-hang.md (tài liệu đầy đủ: nguồn
// dữ liệu, VIEW mẫu, lý do dùng chung 1 domain). Chạy LẠI file này an toàn
// — khớp theo ReportId để UPDATE DefinitionJson thay vì tạo trùng.
//
// LƯU Ý QUAN TRỌNG — chạy script này KHÔNG đủ để báo cáo CÓ SỐ LIỆU: đây
// chỉ là bước tạo "khung" 3 báo cáo trong app.ReportCatalog. Báo cáo chỉ
// thật sự chạy được sau khi:
//   1. DBA tạo VIEW dbo.vw_DonDatHangChiNhanh trên DSMART16 (xem
//      bc-don-dat-hang.md mục 2 — VIEW mẫu ở đó CHỈ VÍ DỤ, DBA PHẢI đối
//      chiếu đúng tên cột thật của ST_ORDER/ST_ORDER_ARC).
//   2. Chạy `node scripts/seedDonDatHangSync.js` (thư mục etl/) để tạo job
//      đồng bộ domain "don_dat_hang".
// Không có 2 bước trên chạy trước, cả 3 báo cáo sẽ luôn trả về rỗng (không
// lỗi, không có dữ liệu để tính) — xem lib/purchaseOrderRunner.js.
//
// CHƯA gán quyền xem (Hệ thống → Phân quyền) — script này chỉ tạo báo cáo.
//
// Cách dùng:
//   node scripts/seedPurchaseOrderReports.js [menuCode]
// menuCode (tuỳ chọn) — Code trong app.MenuItems, mặc định "reports-mua-hang"
// (đã seed sẵn trong rp-db/schema.sql, đúng ngữ cảnh "Báo cáo Mua hàng").
require('dotenv').config();
const { sql, getPool } = require('../db');

const DOMAIN = 'don_dat_hang';

// Cột CHUNG cho cả 3 báo cáo — tên field khớp ĐÚNG alias Dimensions/Measures
// đã đồng bộ ở etl/scripts/seedDonDatHangSync.js (xem bc-don-dat-hang.md).
const COMMON_HEAD = ['eventDate', 'SoDon', 'TenDiem', 'TenNCC', 'MaHang', 'TenHang', 'DVT'];
const COMMON_TAIL = ['TrangThaiLabel'];

// Trạng thái CỐ ĐỊNH (enum DSmart16 đã xác nhận: C/P/F/M/D/E) — options
// tĩnh, KHÔNG dùng optionsSource domain-scan (field này không cần quét dữ
// liệu thật để biết hết giá trị có thể có, khác "Chi nhánh"/"NCC").
const TRANG_THAI_FILTER = {
  field: 'trangThai', type: 'multiSelect', label: 'Trạng thái',
  options: [
    { value: 'C', label: 'Chưa nhập' },
    { value: 'P', label: 'Đã nhập 1 phần' },
    { value: 'F', label: 'Đã nhập hết' },
    { value: 'M', label: 'Đơn sửa' },
    { value: 'D', label: 'Đã xoá' },
    { value: 'E', label: 'Đã huỷ' }
  ]
};

const REPORTS = [
  {
    reportId: 'bc-don-dat-hang', title: 'Đơn đặt hàng',
    columns: [
      ...COMMON_HEAD, 'NgayGiao', 'measures.SoLuongTheoDon', 'measures.DonGia', 'measures.ThanhTien', ...COMMON_TAIL
    ]
  },
  {
    reportId: 'bc-don-nhap-hang', title: 'Đơn nhập hàng',
    columns: [
      ...COMMON_HEAD, 'measures.SoLuongThucNhan', 'measures.DonGia',
      { key: 'thanhTienThucNhan', label: 'Thành tiền thực nhận', formula: 'measures.SoLuongThucNhan * measures.DonGia' },
      ...COMMON_TAIL
    ]
  },
  {
    reportId: 'bc-so-sanh-dat-nhan', title: 'So sánh đặt–nhận',
    columns: [
      ...COMMON_HEAD, 'measures.SoLuongTheoDon', 'measures.SoLuongThucNhan',
      { key: 'chenhLechSoLuong', label: 'Chênh lệch SL', formula: 'measures.SoLuongTheoDon - measures.SoLuongThucNhan' },
      { key: 'tyLeHoanThanh', label: 'Tỷ lệ hoàn thành (%)', format: 'percent', formula: 'ROUND(measures.SoLuongThucNhan / measures.SoLuongTheoDon * 100, 1)' },
      { key: 'chenhLechGiaTri', label: 'Chênh lệch giá trị', formula: '(measures.SoLuongTheoDon - measures.SoLuongThucNhan) * measures.DonGia' },
      ...COMMON_TAIL
    ]
  }
];

function buildDefinition(report) {
  return {
    title: report.title,
    domain: DOMAIN,
    columns: report.columns,
    filters: [
      { field: 'eventDate', type: 'dateRange', label: 'Ngày đặt' },
      TRANG_THAI_FILTER
    ]
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
      .input('domain', sql.VarChar(50), DOMAIN)
      .input('menuItemId', sql.Int, menuItemId)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .query(`
        UPDATE app.ReportCatalog SET
          Title = @title, Domain = @domain, MenuItemId = @menuItemId, DataSourceId = NULL,
          SourceType = 'purchaseOrder', ApiConnectionId = NULL, ApiTarget = NULL, ExternalConnectionId = NULL,
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
      VALUES (@reportId, @title, @domain, @menuItemId, 'purchaseOrder', @definitionJson)
    `);
  console.log(`✅ Đã tạo báo cáo "${report.title}" (${report.reportId}).`);
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

  for (const report of REPORTS) {
    await upsertReport(pool, menuItemId, report);
  }

  console.log('');
  console.log('✅ Xong — cả 3 báo cáo đã sẵn sàng trong danh mục. NHỚ:');
  console.log('   1. Vào Hệ thống → Phân quyền, gán quyền xem đúng vai trò cho cả 3');
  console.log('      ReportId (bc-don-dat-hang/bc-don-nhap-hang/bc-so-sanh-dat-nhan) —');
  console.log('      script này KHÔNG tự gán quyền.');
  console.log('   2. Báo cáo CHƯA CÓ SỐ LIỆU cho tới khi tạo xong VIEW');
  console.log('      dbo.vw_DonDatHangChiNhanh trên DSMART16 + chạy');
  console.log('      node scripts/seedDonDatHangSync.js (thư mục etl/) — xem bc-don-dat-hang.md.');
  console.log('   3. Siêu thị KHÔNG xuất hiện trong báo cáo dù có đơn hàng thật -> kiểm tra');
  console.log('      đã khai đủ "Ánh xạ Điểm - STK_ID" cho đúng mã STK đó chưa.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
