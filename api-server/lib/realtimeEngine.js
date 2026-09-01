// lib/realtimeEngine.js — Chạy 1 endpoint realtime ĐỘNG, định nghĩa trong
// api.RealtimeEndpointDefs (admin tự tạo qua api-admin/, không cần code —
// xem routes/admin/realtimeEndpoints.js). Thay hẳn mô hình cũ "mỗi endpoint
// 1 route viết cứng" (inventory/loyalty/vouchers) — endpoint mới chỉ cần
// admin CHỌN bảng/cột qua lib/schemaBrowser.js, không đụng code.
//
// Bảng liên kết TUỲ CHỌN, TỐI ĐA 1 (JoinTable — cùng DataSourceId, xem
// api-db/schema.sql) — cùng mẫu etl/lib/tableSyncEngine.js: dữ liệu cần ghép
// từ 2 bảng (vd Vouchers.CustomerId -> Customers.CustomerName) được XỬ LÝ
// (JOIN) NGAY TRONG api-server, client/report chỉ nhận 1 dòng phẳng đã ghép
// sẵn, không phải tự ghép. Cần ghép NHIỀU HƠN 1 bảng, hoặc logic phức tạp
// hơn 1 JOIN đơn giản, thì tạo VIEW phía nguồn rồi trỏ endpoint vào VIEW đó
// thay vì mở rộng thêm engine này — xem hướng_dẫn_báo_cáo.md.
//
// Tên bảng/cột THƯỜNG đến từ lib/schemaBrowser.js (giao diện api-admin cho
// chọn qua dropdown duyệt schema thật, không gõ tay), và
// routes/admin/realtimeEndpoints.js đối chiếu lại với schema thật lúc lưu
// (assertSchemaMatches, cùng nguồn schemaBrowser.js) — nhưng đó chỉ là kiểm
// tra 1 lần lúc lưu, schema nguồn có thể đổi sau đó mà endpoint không hay
// biết. Vì vậy assertSafeIdentifier bên dưới vẫn là LỚP CHỐNG CHÈN SQL DUY
// NHẤT ở tầng server (áp dụng lúc lưu VÀ lúc chạy — 2 nơi gọi hàm này) — tên
// sai/không còn tồn tại vẫn qua được (lỗi SQL "invalid object name" bình
// thường lúc chạy), nhưng không có ký tự nào ngoài chữ/số/gạch dưới lọt được
// vào câu SQL. Giống hệt etl/lib/tableSyncEngine.js.
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
    SELECT Endpoint, DataSourceId, SchemaName, TableName, KeyColumn, ColumnsJson, OrderColumn,
           JoinSchema, JoinTable, JoinType, MainJoinColumn, LookupJoinColumn, JoinColumnsJson
    FROM api.RealtimeEndpointDefs WHERE Endpoint = @endpoint AND IsActive = 1
  `);
  if (!result.recordset.length) throw new NotFoundError(`Endpoint realtime "${endpoint}" không tồn tại hoặc đã tắt`);
  const row = result.recordset[0];
  return {
    ...row,
    columns: JSON.parse(row.ColumnsJson),
    joinColumns: row.JoinTable ? JSON.parse(row.JoinColumnsJson || '[]') : []
  };
}

// Ghép SELECT + FROM (kèm JOIN nếu có) dùng chung cho runLookup/runList. Cột
// bảng chính LUÔN qua alias m., cột bảng liên kết qua alias j. — không phải
// để đổi tên (kết quả trả về vẫn đúng tên cột gốc, SQL Server tự dùng tên
// cột khi SELECT alias.column không kèm AS) mà để tránh lỗi "ambiguous
// column name" nếu 2 bảng tình cờ trùng tên cột. Trùng tên cột giữa 2 bảng
// vẫn là lỗi cấu hình (báo lỗi rõ ràng lúc chạy) — không tự động đổi tên,
// giống hệt việc không hỗ trợ alias cột nói chung (xem chú thích đầu file).
function selectClause(def) {
  const mainCols = def.columns.map(c => `m.${quoteIdent(c)}`);
  const table = `${quoteIdent(def.SchemaName)}.${quoteIdent(def.TableName)} m`;
  let joinClause = '';
  let joinCols = [];
  if (def.JoinTable) {
    const joinType = def.JoinType === 'INNER' ? 'INNER' : 'LEFT';
    joinCols = def.joinColumns.map(c => `j.${quoteIdent(c)}`);
    joinClause = `${joinType} JOIN ${quoteIdent(def.JoinSchema)}.${quoteIdent(def.JoinTable)} j ON m.${quoteIdent(def.MainJoinColumn)} = j.${quoteIdent(def.LookupJoinColumn)}`;
  }
  const cols = [...mainCols, ...joinCols].join(', ');
  return { cols, table, joinClause, allColumns: [...def.columns, ...def.joinColumns] };
}

// Tra 1 khoá (vd GET /v1/realtime/inventory/SKU001) — trả 1 dòng hoặc null.
async function runLookup(endpoint, keyValue) {
  const def = await loadEndpointDef(endpoint);
  const { cols, table, joinClause, allColumns } = selectClause(def);
  const keyCol = quoteIdent(def.KeyColumn);
  const pool = await getPoolForDataSource(def.DataSourceId);
  // TOP 2 (không phải TOP 1) — đủ 1 dòng thừa để PHÁT HIỆN join nhân dòng
  // (LookupJoinColumn không unique trên bảng liên kết, xem
  // routes/admin/realtimeEndpoints.js checkJoinCardinalityWarning cảnh báo
  // lúc lưu — đây là lớp bảo vệ lúc CHẠY, phòng khi dữ liệu nguồn đổi sau
  // đó khiến cột từng unique nay không còn). Không có join thì KeyColumn là
  // khoá tra cứu nên tối đa 1 dòng, nhánh cảnh báo này không kích hoạt.
  const result = await pool.request()
    .input('key', sql.NVarChar(200), keyValue)
    .query(`SELECT TOP 2 ${cols} FROM ${table} ${joinClause} WHERE m.${keyCol} = @key`);
  if (result.recordset.length > 1) {
    console.warn(`⚠️  [realtime:${endpoint}] khoá "${keyValue}" khớp NHIỀU HƠN 1 dòng sau JOIN — LookupJoinColumn "${def.LookupJoinColumn}" có thể không unique trên "${def.JoinSchema}.${def.JoinTable}". Trả về dòng đầu tiên (không đảm bảo dòng nào), kiểm tra lại cấu hình endpoint.`);
  }
  return { columns: allColumns, row: result.recordset[0] || null };
}

// Danh sách phân trang (vd GET /v1/realtime/inventory/list).
async function runList(endpoint, { page = 1, pageSize = 200 } = {}) {
  const def = await loadEndpointDef(endpoint);
  const { cols, table, joinClause, allColumns } = selectClause(def);
  const orderCol = quoteIdent(def.OrderColumn);
  const pool = await getPoolForDataSource(def.DataSourceId);
  // Có JOIN thì SELECT kèm cột khoá bảng chính (bí danh riêng, KHÔNG trả về
  // API) để phát hiện cardinality — cùng rủi ro như runLookup() ở trên
  // (LookupJoinColumn không unique khiến 1 dòng bảng chính bị NHÂN THÀNH
  // NHIỀU dòng sau JOIN), nhưng ở đây không có TOP để giới hạn nên phải dò
  // trùng khoá NGAY TRONG trang kết quả thay vì so đếm cố định.
  const keyCol = def.JoinTable ? `, m.${quoteIdent(def.KeyColumn)} AS __rt_key_check` : '';
  const result = await pool.request()
    .input('offset', sql.Int, (page - 1) * pageSize)
    .input('pageSize', sql.Int, pageSize)
    .query(`SELECT ${cols}${keyCol} FROM ${table} ${joinClause} ORDER BY m.${orderCol} OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`);
  let rows = result.recordset;
  if (def.JoinTable) {
    const seen = new Set();
    const duplicated = rows.some(row => (seen.has(row.__rt_key_check) ? true : (seen.add(row.__rt_key_check), false)));
    if (duplicated) {
      console.warn(`⚠️  [realtime:${endpoint}] JOIN nhân dòng trong trang kết quả (trang ${page}) — LookupJoinColumn "${def.LookupJoinColumn}" có thể không unique trên "${def.JoinSchema}.${def.JoinTable}", danh sách trả về nhiều dòng hơn số bản ghi thật của bảng chính. Kiểm tra lại cấu hình endpoint.`);
    }
    rows = rows.map(({ __rt_key_check, ...rest }) => rest);
  }
  // columns luôn [{key,label}] — cùng khuôn dạng với GET /v1/reports/:reportId/run
  // (xem lib/reportEngine.js:describeColumns()), dù endpoint realtime chưa có
  // khái niệm cột công thức/nhãn riêng như báo cáo.
  return { page, pageSize, columns: allColumns.map(c => ({ key: c, label: c })), rows };
}

module.exports = { runLookup, runList, assertSafeIdentifier, NotFoundError };
