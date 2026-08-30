// db.js — Hai pool kết nối TĨNH (đọc từ .env, kết nối một lần khi cần):
//   getPool('RP')  — CSDL ứng dụng HCRC_RP: Users, Roles, quyền, danh mục báo
//                    cáo, log, danh mục, cấu hình email (rp-server có ghi
//                    vào đây, khác dwh — xem rp-db/schema.sql).
//   getPool('DWH') — Data Warehouse, CHỈ ĐỌC, dùng làm nguồn mặc định cho báo
//                    cáo khi ReportCatalog.DataSourceId = NULL.
// Nguồn dữ liệu BỔ SUNG cho từng báo cáo (app.ReportDataSources) không nằm ở
// đây — đó là kết nối ĐỘNG, đọc cấu hình từ CSDL lúc chạy, xem
// lib/dataSourcePool.js.
const sql = require('mssql');
require('dotenv').config();

const pools = new Map();

function buildConfig(prefix) {
  return {
    server: process.env[`${prefix}_SERVER`],
    port: parseInt(process.env[`${prefix}_PORT`] || '1433', 10),
    database: process.env[`${prefix}_DATABASE`],
    user: process.env[`${prefix}_USER`],
    password: process.env[`${prefix}_PASSWORD`],
    options: {
      encrypt: process.env[`${prefix}_ENCRYPT`] === 'true',
      trustServerCertificate: process.env[`${prefix}_TRUST_CERT`] !== 'false',
      enableArithAbort: true
    },
    pool: {
      max: parseInt(process.env[`${prefix}_POOL_MAX`] || '10', 10),
      min: parseInt(process.env[`${prefix}_POOL_MIN`] || '2', 10),
      idleTimeoutMillis: 30000
    },
    requestTimeout: parseInt(process.env[`${prefix}_REQUEST_TIMEOUT_MS`] || '30000', 10),
    connectionTimeout: parseInt(process.env[`${prefix}_CONNECTION_TIMEOUT_MS`] || '15000', 10)
  };
}

async function getPool(prefix) {
  if (!pools.has(prefix)) {
    const config = buildConfig(prefix);
    if (!config.server || !config.database) {
      throw new Error(
        `Thiếu cấu hình kết nối cho "${prefix}" — kiểm tra .env (cần ${prefix}_SERVER, ${prefix}_DATABASE, ...)`
      );
    }
    const promise = new sql.ConnectionPool(config)
      .connect()
      .then(pool => {
        console.log(`✅ Đã kết nối [${prefix}]: ${config.server}:${config.port} - ${config.database}`);
        return pool;
      })
      .catch(err => {
        pools.delete(prefix);
        console.error(`⛔ Lỗi kết nối [${prefix}]:`, err.message);
        throw err;
      });
    pools.set(prefix, promise);
  }
  return pools.get(prefix);
}

module.exports = { sql, getPool };
