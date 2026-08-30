// lib/dbAdapters/mssql.js — Adapter cho nguồn SQL Server. Cùng "hợp đồng"
// với lib/dbAdapters/mysql.js (quoteIdent, param, createPool, close, query,
// listTables, listColumns, listForeignKeys) — schemaBrowser.js/tableSyncEngine.js
// gọi qua hợp đồng này, không cần biết đang nói chuyện với engine nào (xem
// tài liệu kiến trúc "Quản Trị ETL HCRC", mục 04).
const sql = require('mssql');

function quoteIdent(name) {
  return `[${name}]`;
}

function param(name) {
  return `@${name}`;
}

async function createPool(config) {
  const pool = new sql.ConnectionPool({
    server: config.server,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    options: {
      encrypt: !!config.encrypt,
      trustServerCertificate: !!config.trustServerCert,
      enableArithAbort: true
    },
    connectionTimeout: 10000,
    requestTimeout: 30000
  });
  await pool.connect();
  return pool;
}

async function close(pool) {
  await pool.close();
}

async function query(pool, sqlText, params = {}) {
  const request = pool.request();
  for (const [key, value] of Object.entries(params)) {
    request.input(key, value);
  }
  const result = await request.query(sqlText);
  return result.recordset;
}

// Dùng INFORMATION_SCHEMA (chuẩn ANSI) thay vì sys.tables/sys.columns — cùng
// dạng câu truy vấn dùng được cho cả MySQL/MariaDB, dễ đối chiếu khi đọc 2
// adapter cạnh nhau.
async function listTables(pool) {
  return query(pool, `
    SELECT TABLE_SCHEMA AS schemaName, TABLE_NAME AS tableName
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_SCHEMA, TABLE_NAME
  `);
}

async function listColumns(pool, schemaName, tableName) {
  return query(pool, `
    SELECT COLUMN_NAME AS columnName, DATA_TYPE AS dataType, IS_NULLABLE AS isNullable
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @schemaName AND TABLE_NAME = @tableName
    ORDER BY ORDINAL_POSITION
  `, { schemaName, tableName });
}

async function listForeignKeys(pool, schemaName, tableName) {
  return query(pool, `
    SELECT
      kcu1.COLUMN_NAME AS columnName,
      kcu2.TABLE_SCHEMA AS refSchema, kcu2.TABLE_NAME AS refTable, kcu2.COLUMN_NAME AS refColumn
    FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
    JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu1
      ON rc.CONSTRAINT_NAME = kcu1.CONSTRAINT_NAME AND rc.CONSTRAINT_SCHEMA = kcu1.CONSTRAINT_SCHEMA
    JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu2
      ON rc.UNIQUE_CONSTRAINT_NAME = kcu2.CONSTRAINT_NAME AND rc.UNIQUE_CONSTRAINT_SCHEMA = kcu2.CONSTRAINT_SCHEMA
    WHERE kcu1.TABLE_SCHEMA = @schemaName AND kcu1.TABLE_NAME = @tableName
  `, { schemaName, tableName });
}

module.exports = { quoteIdent, param, createPool, close, query, listTables, listColumns, listForeignKeys };
