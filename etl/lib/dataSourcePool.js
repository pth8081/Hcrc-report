// lib/dataSourcePool.js — Kết nối ĐỘNG tới từng nguồn đăng ký trong
// etl.DataSources (CSDL HCRC_ETL, pool 'ADMIN' — xem db.js), chọn đúng
// adapter theo Engine. Cache theo Id; invalidate() khi admin sửa/xoá một
// nguồn — lần đọc sau kết nối lại với thông tin mới.
const { sql, getPool } = require('../db');
const { decrypt } = require('./crypto');
const { getAdapter } = require('./dbAdapters');

const connections = new Map(); // dataSourceId -> Promise<{ pool, adapter, engine, name }>

async function loadDataSource(id) {
  const adminPool = await getPool('ADMIN');
  const result = await adminPool.request().input('id', sql.Int, id).query(`
    SELECT Id, Name, Engine, Server, Port, DatabaseName, Username, PasswordEncrypted, Encrypt, TrustServerCert
    FROM etl.DataSources WHERE Id = @id AND IsActive = 1
  `);
  if (!result.recordset.length) throw new Error(`Không tìm thấy nguồn dữ liệu #${id} hoặc đã tắt`);
  return result.recordset[0];
}

async function getConnection(id) {
  if (!connections.has(id)) {
    const promise = (async () => {
      const source = await loadDataSource(id);
      const adapter = getAdapter(source.Engine);
      const pool = await adapter.createPool({
        server: source.Server,
        port: source.Port,
        database: source.DatabaseName,
        user: source.Username,
        password: decrypt(source.PasswordEncrypted),
        encrypt: !!source.Encrypt,
        trustServerCert: !!source.TrustServerCert
      });
      console.log(`✅ Đã kết nối nguồn [#${id} ${source.Name}] (${source.Engine}): ${source.Server} - ${source.DatabaseName}`);
      return { pool, adapter, engine: source.Engine, name: source.Name };
    })().catch(err => {
      connections.delete(id);
      throw err;
    });
    connections.set(id, promise);
  }
  return connections.get(id);
}

// Gọi khi admin sửa/xoá một nguồn — đóng kết nối cũ (nếu có).
async function invalidate(id) {
  const existing = connections.get(id);
  connections.delete(id);
  if (existing) {
    try {
      const { pool, adapter } = await existing;
      await adapter.close(pool);
    } catch { /* chưa từng kết nối thành công — bỏ qua */ }
  }
}

// Thử một cấu hình CHƯA lưu — nút "Kiểm tra kết nối" trên form thêm/sửa nguồn,
// và tự động gọi lại SAU KHI lưu (routes/admin/dataSources.js) để báo ngay kết
// nối thành công hay chưa, không bắt admin bấm riêng.
async function testConnection({ engine, server, port, database, user, password, encrypt, trustServerCert }) {
  const adapter = getAdapter(engine);
  const pool = await adapter.createPool({ server, port, database, user, password, encrypt, trustServerCert });
  await adapter.close(pool);
}

// Test NHIỀU cấu hình cùng lúc, giới hạn số kết nối thử song song (mặc định
// 5) — dùng cho nhập hàng loạt (vd 33 chi nhánh): không thử tuần tự (quá
// chậm, mỗi cấu hình sai có thể mất hết thời gian chờ timeout mới báo lỗi)
// cũng không thử toàn bộ cùng lúc (dễ quá tải phía nguồn/mạng). Không chặn gì
// cả — luôn trả đủ kết quả cho từng item theo ĐÚNG thứ tự items, item nào lỗi
// chỉ đánh dấu {ok:false, error}, không làm hỏng các item khác.
async function testConnectionsBatch(items, concurrency = 5) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        await testConnection(items[i].config);
        results[i] = { name: items[i].name, ok: true };
      } catch (err) {
        results[i] = { name: items[i].name, ok: false, error: err.message };
      }
    }
  }
  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

module.exports = { getConnection, invalidate, testConnection, testConnectionsBatch };
