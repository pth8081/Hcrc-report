// lib/schemaBrowser.js — Duyệt bảng/view + cột THẬT của một nguồn đã đăng ký
// trong api.DataSources, dùng cho bước "chọn bảng" khi admin định nghĩa một
// endpoint realtime (routes/admin/dataSources.js, routes/admin/realtimeEndpoints.js)
// — không gõ tay tên bảng/cột. Chỉ SQL Server (đúng phạm vi api.DataSources
// hiện tại), khác ETL không cần trừu tượng hoá nhiều engine — xem
// etl/lib/schemaBrowser.js cho mô hình tương đương bên đó. Không cache —
// luôn hỏi trực tiếp nguồn để chắc đúng thời điểm cấu hình.
const { sql } = require('../db');
const { getPoolForDataSource } = require('./dataSourcePool');

// BASE TABLE lẫn VIEW — khuyến khích admin trỏ qua VIEW riêng (vd schema
// api_rt) để chỉ lộ đúng cột cần thiết, nhưng không bắt buộc.
async function listTables(dataSourceId) {
  const pool = await getPoolForDataSource(dataSourceId);
  const result = await pool.request().query(`
    SELECT TABLE_SCHEMA AS schemaName, TABLE_NAME AS tableName, TABLE_TYPE AS tableType
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE IN ('BASE TABLE', 'VIEW')
    ORDER BY TABLE_SCHEMA, TABLE_NAME
  `);
  return result.recordset;
}

async function listColumns(dataSourceId, schemaName, tableName) {
  const pool = await getPoolForDataSource(dataSourceId);
  const result = await pool.request()
    .input('schemaName', sql.NVarChar(128), schemaName)
    .input('tableName', sql.NVarChar(128), tableName)
    .query(`
      SELECT COLUMN_NAME AS columnName, DATA_TYPE AS dataType, IS_NULLABLE AS isNullable
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @schemaName AND TABLE_NAME = @tableName
      ORDER BY ORDINAL_POSITION
    `);
  return result.recordset;
}

module.exports = { listTables, listColumns };
