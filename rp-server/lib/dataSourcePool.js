// lib/dataSourcePool.js — Kết nối ĐỘNG tới nguồn dữ liệu bổ sung
// (app.ReportDataSources), dùng khi một báo cáo khai báo DataSourceId khác
// NULL (NULL = dùng Data Warehouse mặc định ở db.js). Mỗi nguồn một pool
// riêng, cache theo Id — invalidate() khi admin sửa/xoá một nguồn (xem
// routes/dataSources.js) để lần đọc sau kết nối lại đúng thông tin mới.
const { sql, getPool } = require('../db');
const { decrypt } = require('./crypto');

const dynamicPools = new Map(); // dataSourceId -> Promise<ConnectionPool>

// Mỗi nguồn tự mở pool riêng (max 5) — không có trần cho SỐ NGUỒN được cấu
// hình, nên tổng kết nối lý thuyết KHÔNG bị giới hạn ở tầng code (dù
// idleTimeoutMillis:30000/min:0 tự đóng bớt khi rảnh, không tích luỹ mãi).
// Nếu nhiều nguồn cùng được truy vấn đồng thời trong 1 cửa sổ ngắn, tổng kết
// nối có thể vượt trần do DBA cấp cho SQL Server. Đây chỉ là CẢNH BÁO CHẨN
// ĐOÁN (không chặn) để ops biết sớm, không tự ý giới hạn/đóng bớt pool đang
// dùng (có thể làm gãy báo cáo đang chạy).
const WARN_POOL_COUNT = 20;

async function loadDataSource(id) {
  const rpPool = await getPool('RP');
  const result = await rpPool.request()
    .input('id', sql.Int, id)
    .query(`
      SELECT Id, Name, Server, Port, DatabaseName, Username, PasswordEncrypted, Encrypt, TrustServerCert
      FROM app.ReportDataSources WHERE Id = @id
    `);
  if (!result.recordset.length) throw new Error(`Không tìm thấy nguồn dữ liệu #${id}`);
  return result.recordset[0];
}

async function getPoolForDataSource(id) {
  if (!dynamicPools.has(id)) {
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
        requestTimeout: 30000,
        connectionTimeout: 15000
      };
      const pool = await new sql.ConnectionPool(config).connect();
      console.log(`✅ Đã kết nối nguồn dữ liệu bổ sung [#${id} ${source.Name}]: ${config.server} - ${config.database}`);
      return pool;
    })().catch(err => {
      dynamicPools.delete(id);
      throw err;
    });
    dynamicPools.set(id, promise);
    if (dynamicPools.size > WARN_POOL_COUNT) {
      console.warn(`⚠️  [dataSourcePool] đang mở ${dynamicPools.size} pool nguồn dữ liệu bổ sung đồng thời (mỗi pool tối đa 5 kết nối) — kiểm tra lại trần kết nối SQL Server phía DBA nếu tiếp tục tăng.`);
    }
  }
  return dynamicPools.get(id);
}

// Gọi khi admin sửa/xoá một nguồn — đóng pool cũ (nếu có), lần đọc kế tiếp sẽ
// kết nối lại với thông tin mới.
async function invalidate(id) {
  const existing = dynamicPools.get(id);
  dynamicPools.delete(id);
  if (existing) {
    try {
      const pool = await existing;
      await pool.close();
    } catch { /* chưa từng kết nối thành công — bỏ qua */ }
  }
}

// Thử kết nối một cấu hình CHƯA lưu (dùng cho nút "Kiểm tra kết nối" khi
// thêm/sửa nguồn) — không cache, đóng ngay sau khi thử.
async function testConnection({ server, port, databaseName, username, password, encrypt, trustServerCert }) {
  const pool = new sql.ConnectionPool({
    server,
    port,
    database: databaseName,
    user: username,
    password,
    options: { encrypt: !!encrypt, trustServerCertificate: !!trustServerCert, enableArithAbort: true },
    connectionTimeout: 8000,
    requestTimeout: 8000
  });
  await pool.connect();
  await pool.close();
}

module.exports = { getPoolForDataSource, invalidate, testConnection };
