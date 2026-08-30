// lib/dbAdapters/index.js — Registry adapter theo Engine (etl.DataSources.Engine).
// Thêm PostgreSQL sau này (driver "pg", cũng theo chuẩn INFORMATION_SCHEMA)
// chỉ cần thêm 1 file adapter mới ở đây — không đổi gì ở nơi gọi.
const mssql = require('./mssql');
const mysql = require('./mysql');

const adapters = { mssql, mysql };

function getAdapter(engine) {
  const adapter = adapters[engine];
  if (!adapter) throw new Error(`Không hỗ trợ engine "${engine}" — chỉ "mssql" hoặc "mysql" (dùng chung cho MariaDB)`);
  return adapter;
}

module.exports = { getAdapter };
