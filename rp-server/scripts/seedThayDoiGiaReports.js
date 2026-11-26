// scripts/seedThayDoiGiaReports.js — Tạo/CẬP NHẬT idempotent 2 báo cáo MỚI
// "Thay đổi giá bán tức thời"/"Thay đổi giá từ thời điểm" (bản 10.79, theo
// yêu cầu người dùng — dựa trên file mẫu thật "Price_Changes...xlsx") —
// xem "bc-thay-doi-gia.md".
//
// LƯU Ý QUAN TRỌNG — chạy script này KHÔNG đủ để báo cáo CÓ SỐ LIỆU:
//   1. DBA chạy CẢ 2 file "deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW
//      Thay đổi giá bán tức thời (DSMART16 trung tâm).sql" và "... từ thời
//      điểm (DSMART16 trung tâm).sql".
//   2. Chạy `node etl/scripts/seedThayDoiGiaSync.js` (tạo 2 job đồng bộ).
// Không làm đủ 2 bước trên, báo cáo luôn trả về rỗng (không lỗi).
//
// CHƯA gán quyền xem (Hệ thống → Phân quyền) — admin tự làm sau.
//
// Cách dùng:
//   node scripts/seedThayDoiGiaReports.js [menuCode]
require('dotenv').config();
const { sql, getPool } = require('../db');

function nganhHangFilter(domain) {
  return { field: 'MaNganhHang', type: 'multiSelect', label: 'Ngành hàng', optionsSource: { domain, valueField: 'MaNganhHang', labelField: 'TenNganhHang' } };
}
function maHangFilter(domain) {
  return { field: 'MaHangHienThi', type: 'multiSelect', label: 'Mã hàng', optionsSource: { domain, valueField: 'MaHangHienThi', labelField: 'TenHang' } };
}
function vungGiaFilter(domain) {
  return { field: 'MaVungGia', type: 'multiSelect', label: 'Vùng giá', optionsSource: { domain, valueField: 'MaVungGia' } };
}

const REPORTS = [
  {
    reportId: 'bc-thay-doi-gia-tuc-thoi',
    title: 'Thay đổi giá bán tức thời',
    domain: 'thaydoigia_tucthoi',
    columns: [
      { key: 'stt', label: 'TT' },
      { key: 'thoiDiemThayDoi', label: 'Thời điểm thay đổi', formula: 'ThoiDiemThayDoi' },
      { key: 'maVungGia', label: 'Vùng giá', formula: 'MaVungGia' },
      { key: 'maHang', label: 'Mã hàng', formula: 'MaHangHienThi' },
      { key: 'tenHang', label: 'Tên hàng', formula: 'TenHang' },
      // maNhomHang/maNganhHang/donVi thêm bản 10.84 (theo yêu cầu người
      // dùng, kèm ảnh mẫu) — maNganhHang đã có sẵn trong domain từ bản
      // 10.79 (chỉ chưa hiện cột), maNhomHang/donVi mới thêm ở VIEW.
      { key: 'maNhomHang', label: 'Mã nhóm hàng', formula: 'MaNhomHang' },
      { key: 'maNganhHang', label: 'Mã ngành hàng', formula: 'MaNganhHang' },
      { key: 'tenNganhHang', label: 'Ngành hàng', formula: 'TenNganhHang' },
      { key: 'donVi', label: 'Đơn vị', formula: 'DonVi' },
      { key: 'giaCu', label: 'Giá cũ', formula: 'measures.GiaCu' },
      { key: 'giaMoi', label: 'Giá mới', formula: 'measures.GiaMoi' }
    ]
  },
  {
    reportId: 'bc-thay-doi-gia-tu-thoi-diem',
    title: 'Thay đổi giá từ thời điểm',
    domain: 'thaydoigia_tuthoidiem',
    columns: [
      { key: 'stt', label: 'TT' },
      { key: 'capNhatLuc', label: 'Lên lịch lúc', formula: 'CapNhatLuc' },
      { key: 'ngayApDung', label: 'Ngày áp dụng', formula: 'NgayApDung' },
      { key: 'maVungGia', label: 'Vùng giá', formula: 'MaVungGia' },
      { key: 'maHang', label: 'Mã hàng', formula: 'MaHangHienThi' },
      { key: 'tenHang', label: 'Tên hàng', formula: 'TenHang' },
      { key: 'tenNganhHang', label: 'Ngành hàng', formula: 'TenNganhHang' },
      { key: 'giaCu', label: 'Giá cũ', formula: 'measures.GiaCu' },
      { key: 'giaMoi', label: 'Giá mới', formula: 'measures.GiaMoi' },
      { key: 'maDotThayDoi', label: 'Mã đợt', formula: 'MaDotThayDoi' },
      { key: 'moTaDot', label: 'Mô tả đợt', formula: 'MoTaDot' }
    ]
  }
];

function buildDefinition(report) {
  return {
    title: report.title,
    // exportTitle (bản 11.35, theo yêu cầu người dùng — bổ sung hiển thị
    // khoảng ngày đang xem khi xuất Excel/PDF) — xem lib/reportTitleDate.js.
    exportTitle: `${report.title} ({ngayBaoCao})`,
    domain: report.domain,
    filters: [
      // quickPresets (bản 10.83, theo yêu cầu người dùng) — hiện sẵn 3 nút
      // "Ngày hôm trước"/"Trong ngày"/"Trong tháng" ngay trên form lọc,
      // xem rp-user/src/components/FilterForm.jsx. KHÔNG ảnh hưởng cách
      // lưu lịch gửi email (dùng CHUNG đúng field 'eventDate' kiểu
      // 'dateRange' này, cơ chế preset riêng đã có sẵn từ trước — xem
      // lib/reportEmailFilters.js, không cần sửa gì thêm). Lọc theo cột
      // EventDate = MODI_DATE (ngày đợt giá được LÊN LỊCH/ghi nhận — xem
      // VIEW vw_ThayDoiGiaTuThoiDiem), KHÔNG phải Ngày áp dụng — "Ngày hôm
      // trước" nghĩa là "các đợt được NHẬP/SỬA hôm qua", đúng như tên cột
      // nguồn CapNhatLuc/MODI_DATE, đã xác nhận với người dùng (bản 11.11).
      { field: 'eventDate', type: 'dateRange', label: 'Khoảng ngày báo cáo', quickPresets: true },
      nganhHangFilter(report.domain),
      maHangFilter(report.domain),
      vungGiaFilter(report.domain),
      // Bản 11.11 (theo yêu cầu người dùng) — CHỈ "Thay đổi giá từ thời
      // điểm" có khái niệm "Ngày áp dụng" ở TƯƠNG LAI (đợt lên lịch trước,
      // xem bc-thay-doi-gia.md) — "tức thời" đã áp dụng ngay lúc xảy ra,
      // không có ý nghĩa lọc này nên KHÔNG thêm filter cho report đó.
      ...(report.domain === 'thaydoigia_tuthoidiem' ? [
        {
          field: 'chiApDungTuongLai', type: 'onlyFutureDate', column: 'NgayApDung',
          label: 'Chỉ hiện giá áp dụng trong tương lai',
          // SỬA bản 11.15 (theo yêu cầu người dùng, làm rõ lại) — "tương lai"
          // TÍNH TỪ hôm nay (gồm cả hôm nay), không phải chỉ từ ngày mai —
          // xem reportEngine.js (đổi `>` thành `>=`).
          hint: 'Tick để ẩn các đợt có Ngày áp dụng TRƯỚC hôm nay (đã áp dụng) — chỉ còn Ngày áp dụng từ hôm nay trở đi (gồm cả hôm nay).'
        }
      ] : [])
    ],
    columns: report.columns
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
    .input('domain', sql.VarChar(50), report.domain)
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
  console.log('   2. Báo cáo CHƯA CÓ SỐ LIỆU cho tới khi tạo xong 2 VIEW trên DSMART16 +');
  console.log('      chạy node scripts/seedThayDoiGiaSync.js (thư mục etl/).');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
