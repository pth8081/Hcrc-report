// scripts/seedVoucherCheckReport.js — Tạo/cập nhật báo cáo "Tra cứu voucher"
// (sourceType apiRealtime, tra theo Barcode) trong app.ReportCatalog, gọi
// lại Endpoint realtime "voucher-check" đã tạo bởi
// api-server/scripts/seedVoucherCheckEndpoint.js — xem mục "Kiểm tra voucher
// nội bộ (nhân viên tra thủ công)" ở api-voucher-check-redeem.md +
// hướng_dẫn_báo_cáo.md mục 3. THAY THẾ việc vào rp-user tự tay tạo báo cáo
// (Hệ thống → Biểu mẫu) bằng CHẠY SCRIPT 1 LẦN sau khi deploy.
//
// YÊU CẦU TRƯỚC (script KHÔNG tự làm được, phải làm tay qua UI): đã tạo
// "Kết nối API Server" (rp-user → Hệ thống → Kết nối API Server) — dán API
// key của 1 "Đối tác" (tạo ở api-admin) có scope "realtime" và được tick
// endpoint "voucher-check". API key chỉ hiện đúng 1 lần lúc tạo/luân chuyển
// nên KHÔNG đi qua script/.env — đây là lý do bước này không tự động hoá
// được, giống cách seedLdtdHcrcReports.js không tự gán quyền xem báo cáo.
//
// Cách dùng:
//   node scripts/seedVoucherCheckReport.js [tenKetNoiApiServer] [menuCode]
// tenKetNoiApiServer — tên bạn đã đặt lúc tạo "Kết nối API Server", mặc
// định "API Server" nếu không truyền. menuCode mặc định "reports-kinh-doanh"
// (đổi lại nếu muốn gắn vào menu khác).
//
// IDEMPOTENT — khớp theo ReportId "bc-tra-cuu-voucher": lần đầu TẠO MỚI, các
// lần sau CẬP NHẬT tại chỗ, không tạo trùng.
require('dotenv').config();
const { sql, getPool } = require('../db');

const REPORT_ID = 'bc-tra-cuu-voucher';
// ENDPOINT phải khớp ĐÚNG endpoint đã tạo bởi
// api-server/scripts/seedVoucherCheckEndpoint.js (biến VOUCHER_CHECK_ENDPOINT
// bên đó, mặc định cùng giá trị "voucher-check" ở cả 2 nơi).
const ENDPOINT = process.env.VOUCHER_CHECK_ENDPOINT || 'voucher-check';

function buildDefinition(apiConnectionId) {
  return {
    apiConnectionId,
    apiTarget: ENDPOINT,
    // lookupField bật chế độ tra-1-khoá (GET .../voucher-check/{barcode})
    // thay vì /list — xem rp-server/lib/apiReportClient.js.
    lookupField: 'barcode',
    filters: [
      { field: 'barcode', label: 'Mã Barcode', type: 'text' }
    ],
    columns: [
      { key: 'BARCODE', label: 'Mã Barcode' },
      { key: 'STATUS', label: 'Trạng thái' },
      { key: 'VALUE_AMT', label: 'Giá trị' },
      { key: 'BAL_AMT', label: 'Số dư' },
      { key: 'ISS_DATE', label: 'Ngày phát hành' },
      { key: 'DUE_DATE', label: 'Ngày hết hạn' }
    ]
  };
}

async function main() {
  const apiConnectionName = process.argv[2] || 'API Server';
  const menuCode = process.argv[3] || 'reports-kinh-doanh';
  const pool = await getPool('RP');

  const connRow = await pool.request().input('name', sql.NVarChar(200), apiConnectionName)
    .query('SELECT Id FROM app.ApiConnections WHERE Name = @name');
  if (!connRow.recordset.length) {
    console.error(`⛔ Chưa có "Kết nối API Server" tên "${apiConnectionName}".`);
    console.error('   Vào rp-user → Hệ thống → Kết nối API Server, tạo mới (dán API key của Đối tác có scope "realtime" + tick endpoint "voucher-check"), rồi chạy lại script này.');
    console.error(`   Tên khác "API Server"? Chạy: node scripts/seedVoucherCheckReport.js "<tên đúng>"`);
    process.exit(1);
  }
  const apiConnectionId = connRow.recordset[0].Id;

  const menuRow = await pool.request().input('code', sql.VarChar(50), menuCode)
    .query('SELECT Id FROM app.MenuItems WHERE Code = @code');
  if (!menuRow.recordset.length) {
    console.error(`⛔ Không tìm thấy menu "${menuCode}" trong app.MenuItems — kiểm tra lại Code hoặc truyền đúng menuCode làm tham số thứ 2.`);
    process.exit(1);
  }
  const menuItemId = menuRow.recordset[0].Id;

  const title = 'Tra cứu voucher';
  const definitionJson = JSON.stringify(buildDefinition(apiConnectionId));

  const existing = await pool.request().input('reportId', sql.VarChar(80), REPORT_ID)
    .query('SELECT ReportId FROM app.ReportCatalog WHERE ReportId = @reportId');

  if (existing.recordset.length) {
    await pool.request()
      .input('reportId', sql.VarChar(80), REPORT_ID)
      .input('title', sql.NVarChar(200), title)
      .input('menuItemId', sql.Int, menuItemId)
      .input('apiConnectionId', sql.Int, apiConnectionId)
      .input('apiTarget', sql.NVarChar(200), ENDPOINT)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .query(`
        UPDATE app.ReportCatalog SET
          Title = @title, Domain = 'voucher-check', MenuItemId = @menuItemId, DataSourceId = NULL,
          SourceType = 'apiRealtime', ApiConnectionId = @apiConnectionId, ApiTarget = @apiTarget, ExternalConnectionId = NULL,
          DefinitionJson = @definitionJson, IsActive = 1
        WHERE ReportId = @reportId
      `);
    console.log(`↻ Đã cập nhật báo cáo "${title}" (${REPORT_ID}).`);
  } else {
    await pool.request()
      .input('reportId', sql.VarChar(80), REPORT_ID)
      .input('title', sql.NVarChar(200), title)
      .input('menuItemId', sql.Int, menuItemId)
      .input('apiConnectionId', sql.Int, apiConnectionId)
      .input('apiTarget', sql.NVarChar(200), ENDPOINT)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .query(`
        INSERT INTO app.ReportCatalog (ReportId, Title, Domain, MenuItemId, SourceType, ApiConnectionId, ApiTarget, DefinitionJson)
        VALUES (@reportId, @title, 'voucher-check', @menuItemId, 'apiRealtime', @apiConnectionId, @apiTarget, @definitionJson)
      `);
    console.log(`✅ Đã tạo báo cáo "${title}" (${REPORT_ID}).`);
  }

  console.log('');
  console.log('✅ Xong — NHỚ vào Hệ thống → Phân quyền gán quyền xem báo cáo này cho vai trò cần tra cứu (mặc định KHÔNG vai trò nào tự có quyền xem).');
  process.exit(0);
}

main().catch(err => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
