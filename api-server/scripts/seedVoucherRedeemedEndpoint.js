// scripts/seedVoucherRedeemedEndpoint.js — Tạo/cập nhật "Endpoint realtime"
// CHỈ lộ ra voucher ĐÃ DÙNG (PMCRDINF.STATUS = 0) trong
// api.RealtimeEndpointDefs — dành cho ĐỐI TÁC NGOÀI cần tự lấy thông tin
// voucher đã tiêu để cập nhật vào hệ thống của họ (bản 9.62, theo yêu cầu
// người dùng), KHÁC HẲN scripts/seedVoucherCheckEndpoint.js (nội bộ, nhân
// viên tra MỌI trạng thái để chẩn đoán — KHÔNG lọc).
//
// Dùng ĐÚNG cơ chế Endpoint realtime chung (api.ConsumerRealtimeAccess cấp
// theo từng "Đối tác", scope 'realtime' đã có) — KHÔNG đụng/đổi gì ở 2
// route cố định POST /api/v1/vouchers/check|redeem
// (lib/voucherRedeemService.js).
//
// AN TOÀN: voucher CHƯA dùng tra qua endpoint này trả "không tìm thấy" dù
// đúng mã — KeyColumn=CARD_ID + KeyStripLeadingChar='C' (mã quét/gửi lên
// LUÔN thừa 1 ký tự 'C' đầu, xem lib/realtimeEngine.js:stripLeadingChar())
// + FilterColumn=STATUS/FilterOperator='='/FilterValue='0' (0 = đã thu
// hồi/đã dùng, xem lib/voucherRedeemService.js:USED_VALUE) áp dụng CẢ tra
// 1 khoá lẫn /list — không lộ thông tin voucher chưa dùng qua đường nào.
//
// YÊU CẦU TRƯỚC: đã tạo "Nguồn dữ liệu" trỏ DSMART16 Live cho voucher qua
// api-admin (trang "Nguồn dữ liệu") — script này tra theo đúng TÊN đó
// (biến VOUCHER_DSMART16_NAME, mặc định "DSMART16 (Live) - Voucher").
//
// Cách dùng:
//   node scripts/seedVoucherRedeemedEndpoint.js
// hoặc:
//   npm run seed:voucher-redeemed-endpoint
//
// IDEMPOTENT — khớp theo Endpoint (mặc định "voucher-redeemed", đổi qua
// biến môi trường VOUCHER_REDEEMED_ENDPOINT nếu cần tên khác): lần đầu TẠO
// MỚI, các lần sau CẬP NHẬT tại chỗ, không tạo trùng.
//
// SAU KHI CHẠY: vào api-admin → "Đối tác" → chọn đúng đối tác → "Realtime
// được gọi" → tick endpoint này (mặc định KHÔNG đối tác nào tự có quyền).
require('dotenv').config();
const { sql, getPool } = require('../db');
const schemaBrowser = require('../lib/schemaBrowser');

const SCHEMA_NAME = 'dbo';
const TABLE_NAME = 'PMCRDINF';
const KEY_COLUMN = 'CARD_ID';
const KEY_STRIP_LEADING_CHAR = 'C';
const DISPLAY_COLUMNS = ['CARD_ID', 'STATUS', 'VALUE_AMT', 'BAL_AMT', 'ISS_DATE', 'DUE_DATE'];
const ORDER_COLUMN = 'CARD_ID';
const FILTER_COLUMN = 'STATUS';
const FILTER_OPERATOR = '=';
const FILTER_VALUE = '0'; // 0 = đã thu hồi/đã dùng (đã xác nhận với người dùng — xem voucherRedeemService.js:USED_VALUE)

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
  const endpoint = process.env.VOUCHER_REDEEMED_ENDPOINT || 'voucher-redeemed';
  const label = 'Voucher đã dùng (cho đối tác ngoài)';

  const pool = await getPool('ADMIN');

  const dsRow = await pool.request().input('name', sql.NVarChar(200), dataSourceName)
    .query('SELECT Id FROM api.DataSources WHERE Name = @name');
  if (!dsRow.recordset.length) {
    console.error(`⛔ Chưa có "Nguồn dữ liệu" tên "${dataSourceName}" — vào api-admin, trang "Nguồn dữ liệu", tạo dòng trỏ DSMART16 Live trước (hoặc đổi biến VOUCHER_DSMART16_NAME khớp đúng tên đã tạo).`);
    process.exit(1);
  }
  const dataSourceId = dsRow.recordset[0].Id;

  console.log(`Đang đối chiếu bảng "${SCHEMA_NAME}.${TABLE_NAME}" với schema thật trên Nguồn dữ liệu #${dataSourceId}...`);
  try {
    await assertSchemaMatches(dataSourceId, SCHEMA_NAME, TABLE_NAME, [KEY_COLUMN, ORDER_COLUMN, FILTER_COLUMN, ...DISPLAY_COLUMNS]);
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
      .input('keyStripLeadingChar', sql.Char(1), KEY_STRIP_LEADING_CHAR)
      .input('filterColumn', sql.NVarChar(128), FILTER_COLUMN)
      .input('filterOperator', sql.VarChar(2), FILTER_OPERATOR)
      .input('filterValue', sql.NVarChar(100), FILTER_VALUE)
      .query(`
        UPDATE api.RealtimeEndpointDefs SET
          Label = @label, DataSourceId = @dataSourceId, SchemaName = @schemaName,
          TableName = @tableName, KeyColumn = @keyColumn, ColumnsJson = @columnsJson,
          OrderColumn = @orderColumn, KeyStripLeadingChar = @keyStripLeadingChar,
          FilterColumn = @filterColumn, FilterOperator = @filterOperator, FilterValue = @filterValue,
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
      .input('keyStripLeadingChar', sql.Char(1), KEY_STRIP_LEADING_CHAR)
      .input('filterColumn', sql.NVarChar(128), FILTER_COLUMN)
      .input('filterOperator', sql.VarChar(2), FILTER_OPERATOR)
      .input('filterValue', sql.NVarChar(100), FILTER_VALUE)
      .query(`
        INSERT INTO api.RealtimeEndpointDefs (
          Endpoint, Label, DataSourceId, SchemaName, TableName, KeyColumn, ColumnsJson, OrderColumn,
          KeyStripLeadingChar, FilterColumn, FilterOperator, FilterValue, IsActive
        ) VALUES (
          @endpoint, @label, @dataSourceId, @schemaName, @tableName, @keyColumn, @columnsJson, @orderColumn,
          @keyStripLeadingChar, @filterColumn, @filterOperator, @filterValue, 1
        )
      `);
    console.log(`✅ Đã TẠO MỚI Endpoint realtime "${endpoint}".`);
  }

  console.log('');
  console.log(`Chỉ trả về voucher ĐÃ DÙNG (STATUS = 0) — tra mã CHƯA dùng sẽ nhận 404, kể cả đúng mã.`);
  console.log(`Kiểm tra TRỰC TIẾP trên api-server:`);
  console.log(`  GET /api/v1/realtime/${endpoint}/<mã-quét-ra, có hoặc không có 'C' đầu đều được>`);
  console.log(`  GET /api/v1/realtime/${endpoint}/list?page=1&pageSize=200`);
  console.log(`  kèm header X-API-Key của "Đối tác" có scope "realtime" và được tick endpoint "${endpoint}" (api-admin → Đối tác → "Realtime được gọi").`);
  process.exit(0);
}

main().catch(err => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
