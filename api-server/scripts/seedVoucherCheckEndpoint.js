// scripts/seedVoucherCheckEndpoint.js — Tạo/cập nhật "Endpoint realtime" tra
// cứu voucher (PMCRDINF theo BARCODE, CHỈ ĐỌC) trong api.RealtimeEndpointDefs
// — THAY THẾ việc vào api-admin tự tay tạo Endpoint realtime (xem mục
// "Kiểm tra voucher nội bộ" ở api-voucher-check-redeem.md +
// hướng_dẫn_báo_cáo.md mục 3 Bước 2) bằng CHẠY SCRIPT 1 LẦN sau khi deploy.
// Endpoint này KHÁC 2 route cố định POST /api/v1/vouchers/check|redeem
// (lib/voucherRedeemService.js) — đây là đường "tra thủ công" dùng lại đúng
// cơ chế Endpoint realtime chung, chỉ đọc, không đổi STATUS gì cả.
//
// YÊU CẦU TRƯỚC: đã chạy "node scripts/seedVoucherDataSource.js" (tạo
// "Nguồn dữ liệu" trỏ DSMART16 Live cho voucher) — script này tra theo đúng
// tên đó (biến VOUCHER_DSMART16_NAME, mặc định "DSMART16 (Live) - Voucher").
//
// Cách dùng:
//   node scripts/seedVoucherCheckEndpoint.js
// hoặc:
//   npm run seed:voucher-check-endpoint
//
// IDEMPOTENT — khớp theo Endpoint (mặc định "voucher-check", đổi qua biến
// môi trường VOUCHER_CHECK_ENDPOINT nếu cần tên khác): lần đầu TẠO MỚI, các
// lần sau CẬP NHẬT tại chỗ, không tạo trùng.
//
// AN TOÀN: đối chiếu bảng/cột với schema THẬT của nguồn TRƯỚC khi ghi — cùng
// cơ chế assertSchemaMatches() ở routes/admin/realtimeEndpoints.js dùng lúc
// Lưu qua UI (dùng chung lib/schemaBrowser.js) — sai tên bảng/cột (vd
// DSMART16 đổi cấu trúc PMCRDINF) thì DỪNG NGAY, không ghi cấu hình hỏng.
require('dotenv').config();
const { sql, getPool } = require('../db');
const schemaBrowser = require('../lib/schemaBrowser');

const SCHEMA_NAME = 'dbo';
const TABLE_NAME = 'PMCRDINF';
const KEY_COLUMN = 'BARCODE';
// Cột hiển thị — khớp đúng danh sách đã xác nhận ở api-voucher-check-redeem.md
// mục 1 (CARD_ID không đưa vào đây, voucherSerial map tạm CARD_ID chỉ dùng ở
// 2 route check/redeem cố định, không liên quan endpoint tra thủ công này).
const DISPLAY_COLUMNS = ['BARCODE', 'STATUS', 'VALUE_AMT', 'BAL_AMT', 'ISS_DATE', 'DUE_DATE'];
const ORDER_COLUMN = 'BARCODE';

async function assertSchemaMatches(dataSourceId, schemaName, tableName, requiredColumns) {
  const tables = await schemaBrowser.listTables(dataSourceId);
  const tableExists = tables.some(t => t.schemaName === schemaName && t.tableName === tableName);
  if (!tableExists) throw new Error(`Bảng "${schemaName}.${tableName}" không tồn tại trên nguồn dữ liệu đã chọn`);
  const cols = await schemaBrowser.listColumns(dataSourceId, schemaName, tableName);
  const colNames = new Set(cols.map(c => c.columnName));
  const missing = [...new Set(requiredColumns.filter(Boolean))].filter(c => !colNames.has(c));
  if (missing.length) throw new Error(`Bảng "${schemaName}.${tableName}" không có cột: ${missing.join(', ')}`);
}

async function main() {
  const dataSourceName = process.env.VOUCHER_DSMART16_NAME || 'DSMART16 (Live) - Voucher';
  const endpoint = process.env.VOUCHER_CHECK_ENDPOINT || 'voucher-check';
  const label = 'Tra cứu voucher (PMCRDINF)';

  const pool = await getPool('ADMIN');

  const dsRow = await pool.request().input('name', sql.NVarChar(200), dataSourceName)
    .query('SELECT Id FROM api.DataSources WHERE Name = @name');
  if (!dsRow.recordset.length) {
    console.error(`⛔ Chưa có "Nguồn dữ liệu" tên "${dataSourceName}" — chạy "node scripts/seedVoucherDataSource.js" (hoặc npm run seed:voucher-datasource) trước.`);
    process.exit(1);
  }
  const dataSourceId = dsRow.recordset[0].Id;

  console.log(`Đang đối chiếu bảng "${SCHEMA_NAME}.${TABLE_NAME}" với schema thật trên Nguồn dữ liệu #${dataSourceId}...`);
  try {
    await assertSchemaMatches(dataSourceId, SCHEMA_NAME, TABLE_NAME, [KEY_COLUMN, ORDER_COLUMN, ...DISPLAY_COLUMNS]);
  } catch (err) {
    console.error(`⛔ ${err.message} — KHÔNG lưu gì cả.`);
    process.exit(1);
  }
  console.log('✅ Khớp schema.');

  const columnsJson = JSON.stringify(DISPLAY_COLUMNS);
  const existing = await pool.request().input('endpoint', sql.VarChar(50), endpoint)
    .query('SELECT Endpoint FROM api.RealtimeEndpointDefs WHERE Endpoint = @endpoint');

  if (existing.recordset.length) {
    await pool.request()
      .input('endpoint', sql.VarChar(50), endpoint)
      .input('label', sql.NVarChar(200), label)
      .input('dataSourceId', sql.Int, dataSourceId)
      .input('schemaName', sql.NVarChar(128), SCHEMA_NAME)
      .input('tableName', sql.NVarChar(128), TABLE_NAME)
      .input('keyColumn', sql.NVarChar(128), KEY_COLUMN)
      .input('columnsJson', sql.NVarChar(sql.MAX), columnsJson)
      .input('orderColumn', sql.NVarChar(128), ORDER_COLUMN)
      .query(`
        UPDATE api.RealtimeEndpointDefs SET
          Label = @label, DataSourceId = @dataSourceId, SchemaName = @schemaName,
          TableName = @tableName, KeyColumn = @keyColumn, ColumnsJson = @columnsJson,
          OrderColumn = @orderColumn,
          JoinSchema = NULL, JoinTable = NULL, JoinType = NULL,
          MainJoinColumn = NULL, LookupJoinColumn = NULL, JoinColumnsJson = NULL,
          IsActive = 1
        WHERE Endpoint = @endpoint
      `);
    console.log(`✅ Đã CẬP NHẬT Endpoint realtime "${endpoint}".`);
  } else {
    await pool.request()
      .input('endpoint', sql.VarChar(50), endpoint)
      .input('label', sql.NVarChar(200), label)
      .input('dataSourceId', sql.Int, dataSourceId)
      .input('schemaName', sql.NVarChar(128), SCHEMA_NAME)
      .input('tableName', sql.NVarChar(128), TABLE_NAME)
      .input('keyColumn', sql.NVarChar(128), KEY_COLUMN)
      .input('columnsJson', sql.NVarChar(sql.MAX), columnsJson)
      .input('orderColumn', sql.NVarChar(128), ORDER_COLUMN)
      .query(`
        INSERT INTO api.RealtimeEndpointDefs (
          Endpoint, Label, DataSourceId, SchemaName, TableName, KeyColumn, ColumnsJson, OrderColumn, IsActive
        ) VALUES (
          @endpoint, @label, @dataSourceId, @schemaName, @tableName, @keyColumn, @columnsJson, @orderColumn, 1
        )
      `);
    console.log(`✅ Đã TẠO MỚI Endpoint realtime "${endpoint}".`);
  }

  console.log('');
  console.log(`Kiểm tra TRỰC TIẾP trên api-server (chưa cần rp-user):`);
  console.log(`  GET /api/v1/realtime/${endpoint}/<mã-barcode>`);
  console.log(`  kèm header X-API-Key của 1 "Đối tác" có scope "realtime" và được tick endpoint "${endpoint}" (api-admin → Đối tác).`);
  console.log('Muốn có thêm báo cáo tra cứu trên rp-user: chạy tiếp rp-server/scripts/seedVoucherCheckReport.js (sau khi đã tạo "Kết nối API Server" ở rp-user).');
  process.exit(0);
}

main().catch(err => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
