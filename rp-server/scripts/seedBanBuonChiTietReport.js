// scripts/seedBanBuonChiTietReport.js — Tạo/CẬP NHẬT idempotent báo cáo
// MỚI "Bán buôn chi tiết theo khách hàng" (bản 10.81, theo yêu cầu người
// dùng, dựa trên file mẫu thật "Ban_buon_chi_tiet_ngay...xlsx") — xem
// "bc-ban-buon-chi-tiet.md".
//
// LƯU Ý QUAN TRỌNG — chạy script này KHÔNG đủ để báo cáo CÓ SỐ LIỆU:
//   1. DBA chạy "deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Bán buôn
//      chi tiết theo khách hàng (DSMART16 trung tâm).sql".
//   2. Chạy `node etl/scripts/seedBanBuonChiTietSync.js` (tạo job đồng bộ).
// Không làm đủ 2 bước trên, báo cáo luôn trả về rỗng (không lỗi).
//
// CHƯA gán quyền xem (Hệ thống → Phân quyền) — admin tự làm sau.
//
// Cách dùng:
//   node scripts/seedBanBuonChiTietReport.js [menuCode]
require('dotenv').config();
const { sql, getPool } = require('../db');

const REPORT_ID = 'bc-ban-buon-chi-tiet';
const TITLE = 'Bán buôn chi tiết theo khách hàng';
const DOMAIN = 'banbuon_chitiet';

// Siêu thị: translateStkViaDiemStkMapping (mirror đúng seedDoanhThuSkuNganhHangReports.js)
const SIEU_THI_FILTER = {
  field: 'STK_ID', type: 'multiSelect', label: 'Siêu thị',
  optionsSource: { domain: DOMAIN, valueField: 'STK_ID', translateStkViaDiemStkMapping: true }
};
const KHACH_HANG_FILTER = {
  field: 'MaKhach', type: 'multiSelect', label: 'Khách hàng',
  optionsSource: { domain: DOMAIN, valueField: 'MaKhach', labelField: 'TenKhach' }
};
const MA_HANG_FILTER = {
  field: 'MaHangHienThi', type: 'multiSelect', label: 'Mã hàng',
  optionsSource: { domain: DOMAIN, valueField: 'MaHangHienThi', labelField: 'TenHang' }
};
const NGANH_HANG_FILTER = {
  field: 'MaNganhHang', type: 'multiSelect', label: 'Ngành hàng',
  optionsSource: { domain: DOMAIN, valueField: 'MaNganhHang', labelField: 'TenNganhHang' }
};

const DEFINITION = {
  title: TITLE,
  domain: DOMAIN,
  filters: [
    { field: 'eventDate', type: 'dateRange', label: 'Khoảng ngày báo cáo' },
    SIEU_THI_FILTER,
    KHACH_HANG_FILTER,
    NGANH_HANG_FILTER,
    MA_HANG_FILTER
  ],
  columns: [
    { key: 'stt', label: 'TT' },
    { key: 'eventDate', label: 'Ngày', formula: 'eventDate' },
    // stkId — CHỈ hiện mã kho trần, giống ĐÚNG báo cáo mẫu
    // "doanhthu_sku_nganhhang" (seedDoanhThuSkuNganhHangReports.js):
    // `translateStkViaDiemStkMapping` CHỈ dịch tên cho dropdown bộ lọc
    // "Siêu thị" (xem rp-server/routes/reports.js), KHÔNG dịch tên cho
    // CỘT KẾT QUẢ hiển thị trong bảng (khác hẳn cơ chế translateStkToStore
    // bên api-server) — rp-server hiện CHƯA có cơ chế ghi đè tên siêu thị
    // ở tầng hiển thị kết quả, nên KHÔNG thêm cột "Siêu thị" ở đây để
    // tránh hiện ra giá trị KHÔNG dịch được (mã trần, phạm quy ước
    // CLAUDE.md "không hiện mã trần").
    { key: 'stkId', label: 'Mã kho', formula: 'STK_ID' },
    { key: 'maKhach', label: 'Mã khách', formula: 'MaKhach' },
    { key: 'tenKhach', label: 'Tên khách', formula: 'TenKhach' },
    { key: 'nhomKhach', label: 'Nhóm khách', formula: 'NhomKhach' },
    { key: 'capKhach', label: 'Cấp khách', formula: 'CapKhach' },
    { key: 'maSoThueKhach', label: 'Mã số thuế khách', formula: 'MaSoThueKhach' },
    { key: 'maHang', label: 'Mã hàng', formula: 'MaHangHienThi' },
    { key: 'tenHang', label: 'Tên hàng', formula: 'TenHang' },
    { key: 'maVach', label: 'Mã vạch', formula: 'MaVach' },
    { key: 'tenNganhHang', label: 'Ngành hàng', formula: 'TenNganhHang' },
    { key: 'maThueMatHang', label: 'Mã thuế', formula: 'MaThueMatHang' },
    { key: 'tenNCC', label: 'Nhà cung cấp', formula: 'TenNCC' },
    { key: 'soLuongBan', label: 'SL bán', formula: 'measures.SoLuongBan' },
    { key: 'doanhSo', label: 'Doanh số', formula: 'measures.DoanhSo' },
    { key: 'doanhThu', label: 'Doanh thu', formula: 'measures.DoanhThu' }
  ]
};

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
  const definitionJson = JSON.stringify(DEFINITION);

  const existing = await pool.request().input('reportId', sql.VarChar(80), REPORT_ID)
    .query('SELECT ReportId FROM app.ReportCatalog WHERE ReportId = @reportId');

  if (existing.recordset.length) {
    await pool.request()
      .input('reportId', sql.VarChar(80), REPORT_ID)
      .input('title', sql.NVarChar(200), TITLE)
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
    console.log(`↻ Đã cập nhật báo cáo "${TITLE}" (${REPORT_ID}).`);
  } else {
    await pool.request()
      .input('reportId', sql.VarChar(80), REPORT_ID)
      .input('title', sql.NVarChar(200), TITLE)
      .input('domain', sql.VarChar(50), DOMAIN)
      .input('menuItemId', sql.Int, menuItemId)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .query(`
        INSERT INTO app.ReportCatalog (ReportId, Title, Domain, MenuItemId, SourceType, DefinitionJson)
        VALUES (@reportId, @title, @domain, @menuItemId, 'directDb', @definitionJson)
      `);
    console.log(`✅ Đã tạo báo cáo "${TITLE}" (${REPORT_ID}).`);
  }

  console.log('');
  console.log('✅ Xong. NHỚ:');
  console.log(`   1. Vào Hệ thống → Phân quyền, gán quyền xem ${REPORT_ID} — mặc định`);
  console.log('      KHÔNG ai xem được, kể cả admin.');
  console.log('   2. Báo cáo CHƯA CÓ SỐ LIỆU cho tới khi tạo xong VIEW');
  console.log('      vw_BanBuonChiTiet trên DSMART16 + chạy');
  console.log('      node scripts/seedBanBuonChiTietSync.js (thư mục etl/).');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
