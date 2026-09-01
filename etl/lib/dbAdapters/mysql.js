// lib/dbAdapters/mysql.js — Adapter DÙNG CHUNG cho MySQL và MariaDB: cả hai
// nói cùng giao thức mạng nên cùng driver (mysql2), cùng adapter — không
// phải hai tích hợp riêng biệt (xem tài liệu kiến trúc "Quản Trị ETL HCRC",
// mục 04). Cùng "hợp đồng" với lib/dbAdapters/mssql.js.
const mysql = require('mysql2/promise');

function quoteIdent(name) {
  return `\`${name}\``;
}

function param(name) {
  return `:${name}`;
}

async function createPool(config) {
  const pool = mysql.createPool({
    host: config.server,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.encrypt ? (config.trustServerCert ? { rejectUnauthorized: false } : {}) : undefined,
    namedPlaceholders: true,
    connectionLimit: 5,
    connectTimeout: 10000,
    // decimalNumbers: true — mysql2 mặc định trả cột DECIMAL/NEWDECIMAL
    // dạng CHUỖI (vd "1500000.00", tránh mất độ chính xác cho số cực lớn),
    // trong khi driver mssql (tedious) luôn trả NUMERIC/DECIMAL/MONEY dạng
    // number JS. Cùng 1 measure (vd doanhThu) tuỳ nguồn gốc dòng sẽ ra
    // "doanhThu":1500000 (nguồn mssql) hoặc "doanhThu":"1500000.00" (nguồn
    // mysql) trong Measures JSON — lib/reportEngine.js lọc bằng
    // JSON_VALUE(...) = @param kiểu NVarChar nên khớp CHUỖI, chỉ đúng khi
    // 2 chuỗi ký tự y hệt nhau ("1500000" ≠ "1500000.00") — filter đúng về
    // nghiệp vụ vẫn có thể bỏ sót dòng tuỳ nguồn gốc. Ép về number khớp
    // đúng hành vi nguồn mssql, đồng nhất Measures JSON giữa 2 engine.
    decimalNumbers: true
  });
  await pool.query('SELECT 1'); // xác nhận kết nối được ngay, không chờ tới lượt dùng đầu tiên
  return pool;
}

async function close(pool) {
  await pool.end();
}

async function query(pool, sqlText, params = {}) {
  const [rows] = await pool.query(sqlText, params);
  return rows;
}

// INFORMATION_SCHEMA chuẩn ANSI, giới hạn về đúng CSDL đang kết nối
// (TABLE_SCHEMA = DATABASE()) — mỗi DataSource ứng với đúng 1 CSDL, không
// duyệt lẫn sang CSDL khác trên cùng máy chủ.
//
// BASE TABLE lẫn VIEW — xem chú thích tương ứng ở dbAdapters/mssql.js
// (VIEW dùng được thẳng làm nguồn đồng bộ thật, không chỉ để xem trước).
async function listTables(pool) {
  return query(pool, `
    SELECT TABLE_SCHEMA AS schemaName, TABLE_NAME AS tableName, TABLE_TYPE AS tableType
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE IN ('BASE TABLE', 'VIEW') AND TABLE_SCHEMA = DATABASE()
    ORDER BY TABLE_NAME
  `);
}

async function listColumns(pool, schemaName, tableName) {
  return query(pool, `
    SELECT COLUMN_NAME AS columnName, DATA_TYPE AS dataType, IS_NULLABLE AS isNullable
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = :schemaName AND TABLE_NAME = :tableName
    ORDER BY ORDINAL_POSITION
  `, { schemaName, tableName });
}

async function listForeignKeys(pool, schemaName, tableName) {
  return query(pool, `
    SELECT
      kcu.COLUMN_NAME AS columnName,
      kcu.REFERENCED_TABLE_SCHEMA AS refSchema,
      kcu.REFERENCED_TABLE_NAME AS refTable,
      kcu.REFERENCED_COLUMN_NAME AS refColumn
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
    WHERE kcu.TABLE_SCHEMA = :schemaName AND kcu.TABLE_NAME = :tableName
      AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
  `, { schemaName, tableName });
}

module.exports = { quoteIdent, param, createPool, close, query, listTables, listColumns, listForeignKeys };
