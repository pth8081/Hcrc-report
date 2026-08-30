// lib/realtimeEngine.js — Chạy 1 endpoint realtime ĐỘNG, định nghĩa trong
// api.RealtimeEndpointDefs (admin tự tạo qua api-admin/, không cần code —
// xem routes/admin/realtimeEndpoints.js). Thay hẳn mô hình cũ "mỗi endpoint
// 1 route viết cứng" (inventory/loyalty/vouchers) — endpoint mới chỉ cần
// admin CHỌN bảng/cột qua lib/schemaBrowser.js, không đụng code.
//
// Tên bảng/cột THƯỜNG đến từ lib/schemaBrowser.js (giao diện api-admin cho
// chọn qua dropdown duyệt schema thật, không gõ tay) — nhưng
// routes/admin/realtimeEndpoints.js (validatePayload) KHÔNG tự đối chiếu
// lại với schema thật lúc lưu, chỉ kiểm tra định dạng qua
// assertSafeIdentifier bên dưới. Vì vậy assertSafeIdentifier là LỚP CHỐNG
// CHÈN SQL DUY NHẤT ở tầng server (áp dụng lúc lưu VÀ lúc chạy — 2 nơi gọi
// hàm này) — tên sai/không tồn tại vẫn qua được (lỗi SQL "invalid object
// name" bình thường lúc chạy), nhưng không có ký tự nào ngoài chữ/số/gạch
// dưới lọt được vào câu SQL. Giống hệt etl/lib/tableSyncEngine.js.
const { sql, getPool } = require('../db');
const { getPoolForDataSource } = require('./dataSourcePool');

const IDENT_RE = /^[A-Za-z0-9_]+$/;

function assertSafeIdentifier(name) {
  if (!IDENT_RE.test(name)) throw new Error(`Tên không hợp lệ trong cấu hình endpoint realtime: "${name}"`);
  return name;
}

function quoteIdent(name) {
  return `[${assertSafeIdentifier(name)}]`;
}

class NotFoundError extends Error {}

async function loadEndpointDef(endpoint) {
  const adminPool = await getPool('ADMIN');
  const result = await adminPool.request().input('endpoint', sql.VarChar(50), endpoint).query(`
    SELECT Endpoint, DataSourceId, SchemaName, TableName, KeyColumn, ColumnsJson, OrderColumn
    FROM api.RealtimeEndpointDefs WHERE Endpoint = @endpoint AND IsActive = 1
  `);
  if (!result.recordset.length) throw new NotFoundError(`Endpoint realtime "${endpoint}" không tồn tại hoặc đã tắt`);
  const row = result.recordset[0];
  return { ...row, columns: JSON.parse(row.ColumnsJson) };
}

function selectClause(def) {
  const cols = def.columns.map(quoteIdent).join(', ');
  const table = `${quoteIdent(def.SchemaName)}.${quoteIdent(def.TableName)}`;
  return { cols, table };
}

// Tra 1 khoá (vd GET /v1/realtime/inventory/SKU001) — trả 1 dòng hoặc null.
async function runLookup(endpoint, keyValue) {
  const def = await loadEndpointDef(endpoint);
  const { cols, table } = selectClause(def);
  const keyCol = quoteIdent(def.KeyColumn);
  const pool = await getPoolForDataSource(def.DataSourceId);
  const result = await pool.request()
    .input('key', sql.NVarChar(200), keyValue)
    .query(`SELECT ${cols} FROM ${table} WHERE ${keyCol} = @key`);
  return { columns: def.columns, row: result.recordset[0] || null };
}

// Danh sách phân trang (vd GET /v1/realtime/inventory/list).
async function runList(endpoint, { page = 1, pageSize = 200 } = {}) {
  const def = await loadEndpointDef(endpoint);
  const { cols, table } = selectClause(def);
  const orderCol = quoteIdent(def.OrderColumn);
  const pool = await getPoolForDataSource(def.DataSourceId);
  const result = await pool.request()
    .input('offset', sql.Int, (page - 1) * pageSize)
    .input('pageSize', sql.Int, pageSize)
    .query(`SELECT ${cols} FROM ${table} ORDER BY ${orderCol} OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`);
  // columns luôn [{key,label}] — cùng khuôn dạng với GET /v1/reports/:reportId/run
  // (xem lib/reportEngine.js:describeColumns()), dù endpoint realtime chưa có
  // khái niệm cột công thức/nhãn riêng như báo cáo.
  return { page, pageSize, columns: def.columns.map(c => ({ key: c, label: c })), rows: result.recordset };
}

module.exports = { runLookup, runList, assertSafeIdentifier, NotFoundError };
