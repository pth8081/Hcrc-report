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

// Cột join (LookupJoinColumn, xem lib/realtimeEngine.js) KHÔNG unique trên
// bảng liên kết khiến runLookup() trả về NHẦM 1 trong nhiều dòng khớp (không
// báo lỗi gì, chỉ âm thầm sai dữ liệu) — dùng lúc LƯU endpoint
// (routes/admin/realtimeEndpoints.js) để cảnh báo sớm cho admin. Chỉ coi là
// "unique" khi có index/constraint DUY NHẤT 1 CỘT (không tính unique COMPOSITE
// nhiều cột, vì lookupJoinColumn join đơn lẻ không tận dụng được).
async function isUniqueSingleColumn(dataSourceId, schemaName, tableName, columnName) {
  const pool = await getPoolForDataSource(dataSourceId);
  const result = await pool.request()
    .input('schemaName', sql.NVarChar(128), schemaName)
    .input('tableName', sql.NVarChar(128), tableName)
    .input('columnName', sql.NVarChar(128), columnName)
    .query(`
      SELECT i.index_id
      FROM sys.indexes i
      JOIN sys.objects o ON o.object_id = i.object_id
      JOIN sys.schemas s ON s.schema_id = o.schema_id
      WHERE s.name = @schemaName AND o.name = @tableName
        AND (i.is_unique = 1 OR i.is_primary_key = 1)
        AND (SELECT COUNT(*) FROM sys.index_columns ic WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id) = 1
        AND EXISTS (
          SELECT 1 FROM sys.index_columns ic
          JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
          WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND c.name = @columnName
        )
    `);
  return result.recordset.length > 0;
}

module.exports = { listTables, listColumns, isUniqueSingleColumn };
