// db.js — Kết nối CHỈ ĐỌC tới Data Warehouse. Report Server không bao giờ ghi
// vào kho — việc ghi là của etl/ (xem tài liệu kiến trúc, mục 02). Dùng login
// SQL riêng (DWH_USER) chỉ có quyền SELECT trên schema dwh.
const sql = require('mssql');
require('dotenv').config();

const config = {
  server: process.env.DWH_SERVER,
  port: parseInt(process.env.DWH_PORT || '1433', 10),
  database: process.env.DWH_DATABASE,
  user: process.env.DWH_USER,
  password: process.env.DWH_PASSWORD,
  options: {
    encrypt: process.env.DWH_ENCRYPT === 'true',
    trustServerCertificate: process.env.DWH_TRUST_CERT !== 'false',
    enableArithAbort: true
  },
  pool: {
    max: parseInt(process.env.DWH_POOL_MAX || '10', 10),
    min: parseInt(process.env.DWH_POOL_MIN || '2', 10),
    idleTimeoutMillis: 30000
  },
  requestTimeout: parseInt(process.env.DWH_REQUEST_TIMEOUT_MS || '30000', 10),
  connectionTimeout: parseInt(process.env.DWH_CONNECTION_TIMEOUT_MS || '15000', 10)
};

let poolPromise = null;

function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config)
      .connect()
      .then(pool => {
        console.log('✅ Đã kết nối Data Warehouse:', config.server + ':' + config.port, '-', config.database);
        return pool;
      })
      .catch(err => {
        poolPromise = null;
        console.error('⛔ Lỗi kết nối Data Warehouse:', err.message);
        throw err;
      });
  }
  return poolPromise;
}

module.exports = { sql, getPool };
