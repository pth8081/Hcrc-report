// db.js — Quản lý nhiều connection pool MSSQL dùng chung (mỗi nguồn + Data
// Warehouse là một pool riêng, định danh bằng "prefix" đọc biến môi trường
// <PREFIX>_SERVER, <PREFIX>_DATABASE, ...). getPool("DWH") dùng cho kho dữ
// liệu; getPool(source.envPrefix) dùng cho từng nguồn — xem sources/_template.js.
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
      max: parseInt(process.env[`${prefix}_POOL_MAX`] || '5', 10),
      min: 0,
      idleTimeoutMillis: 30000
    },
    requestTimeout: parseInt(process.env[`${prefix}_REQUEST_TIMEOUT_MS`] || '30000', 10),
    connectionTimeout: parseInt(process.env[`${prefix}_CONNECTION_TIMEOUT_MS`] || '15000', 10)
  };
}

// Mỗi prefix chỉ kết nối một lần — các lượt gọi getPool(prefix) sau dùng lại
// đúng promise pool đã kết nối (hoặc đang kết nối dở), giống nguyên lý getPool()
// dùng chung của vpdt-pms/server/db.js, chỉ khác là ở đây có nhiều pool song song.
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
        pools.delete(prefix); // cho phép thử kết nối lại ở lượt chạy sau
        console.error(`⛔ Lỗi kết nối [${prefix}]:`, err.message);
        throw err;
      });
    pools.set(prefix, promise);
  }
  return pools.get(prefix);
}

async function closeAll() {
  for (const [, poolPromise] of pools) {
    try {
      const pool = await poolPromise;
      await pool.close();
    } catch {
      // đã đóng hoặc chưa từng kết nối thành công — bỏ qua
    }
  }
  pools.clear();
}

module.exports = { sql, getPool, closeAll };
