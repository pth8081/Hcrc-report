// lib/dataSourcePool.js — Kết nối ĐỘNG tới từng nguồn đăng ký trong
// api.DataSources (CSDL HCRC_API, pool 'ADMIN' — xem db.js) — dùng cho các
// endpoint realtime (routes/v1/realtime.js), thay OLTP_* tĩnh trong .env cũ.
// Chỉ SQL Server (đúng phạm vi hiện tại — không cần đa engine như ETL).
// Cache theo Id; invalidate() khi admin sửa/xoá một nguồn.
const { sql, getPool } = require('../db');
const { decrypt } = require('./crypto');

const pools = new Map(); // dataSourceId -> Promise<{ pool, name }>

async function loadDataSource(id) {
  const adminPool = await getPool('ADMIN');
  const result = await adminPool.request().input('id', sql.Int, id).query(`
    SELECT Id, Name, Server, Port, DatabaseName, Username, PasswordEncrypted, Encrypt, TrustServerCert
    FROM api.DataSources WHERE Id = @id AND IsActive = 1
  `);
  if (!result.recordset.length) throw new Error(`Không tìm thấy nguồn dữ liệu #${id} hoặc đã tắt`);
  return result.recordset[0];
}

async function connect(id) {
  if (!pools.has(id)) {
    const promise = (async () => {
      const source = await loadDataSource(id);
      const config = {
        server: source.Server,
        port: source.Port,
        database: source.DatabaseName,
        user: source.Username,
        password: decrypt(source.PasswordEncrypted),
        options: {
          encrypt: !!source.Encrypt,
          trustServerCertificate: !!source.TrustServerCert,
          enableArithAbort: true
        },
        pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
        requestTimeout: 15000,
        connectionTimeout: 10000
      };
      const pool = await new sql.ConnectionPool(config).connect();
      console.log(`✅ Đã kết nối nguồn dữ liệu [#${id} ${source.Name}]: ${config.server} - ${config.database}`);
      return { pool, name: source.Name };
    })().catch(err => {
      pools.delete(id);
      throw err;
    });
    pools.set(id, promise);
  }
  return pools.get(id);
}

async function getPoolForDataSource(id) {
  const { pool } = await connect(id);
  return pool;
}

// Trạng thái các pool nguồn đang mở — dùng cho màn hình "Kết nối hiện tại"
// (routes/admin/live.js) bên cạnh pool DWH tĩnh.
async function listActivePoolStats() {
  const stats = [];
  for (const [id, promise] of pools) {
    try {
      const { pool, name } = await promise;
      stats.push({ id, name, size: pool.size, available: pool.available, pending: pool.pending, borrowed: pool.borrowed });
    } catch {
      stats.push({ id, error: 'chưa kết nối được' });
    }
  }
  return stats;
}

async function invalidate(id) {
  const existing = pools.get(id);
  pools.delete(id);
  if (existing) {
    try {
      const { pool } = await existing;
      await pool.close();
    } catch { /* chưa từng kết nối thành công — bỏ qua */ }
  }
}

async function testConnection({ server, port, database, user, password, encrypt, trustServerCert }) {
  const pool = new sql.ConnectionPool({
    server, port, database, user, password,
    options: { encrypt: !!encrypt, trustServerCertificate: !!trustServerCert, enableArithAbort: true },
    connectionTimeout: 8000,
    requestTimeout: 8000
  });
  await pool.connect();
  await pool.close();
}

module.exports = { getPoolForDataSource, listActivePoolStats, invalidate, testConnection };
