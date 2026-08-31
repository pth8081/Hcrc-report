// db.js — Hai pool TĨNH (qua prefix .env) TÁCH BIỆT hoàn toàn:
//   getPool('DWH')   — chỉ đọc Data Warehouse, dùng cho /api/v1/reports
//   getPool('ADMIN') — CSDL HCRC_API (api.ApiConsumers, api.DataSources,
//                      api.RealtimeEndpointDefs...), API Server CÓ GHI
// Tách pool có chủ đích: một API Server bị gọi dồn dập cho báo cáo tổng hợp
// không được phép ảnh hưởng tới pool quản trị, và ngược lại.
// CSDL nguồn cho /api/v1/realtime/* KHÔNG qua đây — mỗi nguồn (nhiều máy chủ
// OLTP, vd chuỗi siêu thị BRG Mart) là 1 dòng động trong api.DataSources,
// pool riêng theo Id — xem lib/dataSourcePool.js, quản lý qua trang "Nguồn
// dữ liệu" (api-admin/).
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
      min: parseInt(process.env[`${prefix}_POOL_MIN`] || '0', 10),
      idleTimeoutMillis: 30000
    },
    requestTimeout: parseInt(process.env[`${prefix}_REQUEST_TIMEOUT_MS`] || '15000', 10),
    connectionTimeout: parseInt(process.env[`${prefix}_CONNECTION_TIMEOUT_MS`] || '15000', 10)
  };
}

// Tách riêng khỏi getPool() để server.js gọi được lúc KHỞI ĐỘNG (không mở
// kết nối thật, chỉ kiểm tra biến môi trường có điền hay chưa) — trước đây
// lỗi "thiếu cấu hình" chỉ lộ ra ở REQUEST ĐẦU TIÊN cần tới pool đó, không
// phải ngay lúc `npm start`/`pm2 start`.
function assertConfigured(prefix) {
  const server = process.env[`${prefix}_SERVER`];
  const database = process.env[`${prefix}_DATABASE`];
  if (!server || !database) {
    throw new Error(
      `Thiếu cấu hình kết nối cho "${prefix}" — kiểm tra .env (cần ${prefix}_SERVER, ${prefix}_DATABASE, ...)`
    );
  }
}

async function getPool(prefix) {
  if (!pools.has(prefix)) {
    assertConfigured(prefix);
    const config = buildConfig(prefix);
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

// Đóng hết pool ĐANG MỞ — gọi lúc tắt tiến trình (SIGTERM/SIGINT, xem
// lib/processGuards.js) để không bỏ dở transaction/kết nối giữa chừng khi
// PM2 reload/stop. Bỏ qua pool nào chưa từng kết nối/đã đóng.
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

module.exports = { sql, getPool, closeAll, assertConfigured };
