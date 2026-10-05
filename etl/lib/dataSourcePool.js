// lib/dataSourcePool.js — Kết nối ĐỘNG tới từng nguồn đăng ký trong
// etl.DataSources (CSDL HCRC_ETL, pool 'ADMIN' — xem db.js), chọn đúng
// adapter theo Engine. Cache theo Id; invalidate() khi admin sửa/xoá một
// nguồn — lần đọc sau kết nối lại với thông tin mới.
const { sql, getPool } = require('../db');
const { decrypt } = require('./crypto');
const { getAdapter } = require('./dbAdapters');
const { logInfo, logError } = require('./systemLog');

// Khoá cache = "<id>::<requestTimeout>" (bản 8.86) — KHÔNG còn chỉ theo id
// trơn: jobs/runSync.js giờ xin kết nối với 2 "hồ sơ" thời gian chờ khác
// nhau tuỳ lượt chạy ĐẦU TIÊN (requestTimeout mặc định dài, xem
// dbAdapters/mssql.js) hay ĐỊNH KỲ (requestTimeout rút ngắn, xem chú thích ở
// jobs/runSync.js) — mỗi hồ sơ cần 1 `sql.ConnectionPool` RIÊNG (requestTimeout
// được khoá cứng lúc tạo pool, không đổi được sau đó), nên 1 nguồn dữ liệu có
// thể có TỐI ĐA 2 pool đang mở song song, không tranh chấp connection lẫn
// nhau giữa job chạy lần đầu (có thể kéo dài nhiều phút) và job chạy định kỳ
// (cần thất bại/thử lại nhanh). idKeyPrefix(id) dùng để invalidate() gỡ ĐỦ
// CẢ 2 hồ sơ khi admin sửa/xoá 1 nguồn — gọi theo id trơn như trước giờ,
// không cần biết có bao nhiêu hồ sơ đang mở.
const connections = new Map(); // "<id>::<requestTimeout>" -> Promise<{ pool, adapter, engine, name }>

function cacheKey(id, requestTimeout) {
  return `${id}::${requestTimeout || 'default'}`;
}

function idKeyPrefix(id) {
  return `${id}::`;
}

async function loadDataSource(id) {
  const adminPool = await getPool('ADMIN');
  const result = await adminPool.request().input('id', sql.Int, id).query(`
    SELECT Id, Name, Engine, Server, Port, DatabaseName, Username, PasswordEncrypted, Encrypt, TrustServerCert
    FROM etl.DataSources WHERE Id = @id AND IsActive = 1
  `);
  if (!result.recordset.length) throw new Error(`Không tìm thấy nguồn dữ liệu #${id} hoặc đã tắt`);
  return result.recordset[0];
}

// options.requestTimeout (tuỳ chọn, bản 8.86) — xem chú thích `connections`
// ở trên. KHÔNG truyền = giữ nguyên hành vi cũ (dùng mặc định của adapter).
async function getConnection(id, options = {}) {
  const key = cacheKey(id, options.requestTimeout);
  if (!connections.has(key)) {
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
        trustServerCert: !!source.TrustServerCert,
        requestTimeout: options.requestTimeout
      });
      logInfo(`✅ Đã kết nối nguồn [#${id} ${source.Name}] (${source.Engine}): ${source.Server} - ${source.DatabaseName}`);
      return { pool, adapter, engine: source.Engine, name: source.Name };
    })().catch(err => {
      connections.delete(key);
      logError(`⛔ Lỗi kết nối nguồn #${id}: ${err.message}`);
      throw err;
    });
    connections.set(key, promise);
  }
  return connections.get(key);
}

// Thời gian tối đa chờ đóng 1 kết nối cũ trước khi BỎ QUA, không chờ thêm —
// LỖI THẬT đã gặp (bản 8.76): `adapter.close(pool)` (tedious `pool.close()`)
// chờ sự kiện 'end' từ driver, KHÔNG có timeout nào — nếu nguồn bên kia rớt
// mạng kiểu "zombie" (không đóng cổng hẳn, không có TCP RST, chỉ lặng im)
// thay vì từ chối kết nối rõ ràng, sự kiện 'end' có thể KHÔNG BAO GIỜ tới —
// `invalidate()` treo VĨNH VIỄN, kéo theo route DELETE /admin/data-sources/:id
// (routes/admin/dataSources.js) không bao giờ trả response, và vì
// SyncJobsPage.jsx/DataSourcesPage.jsx xoá hàng loạt chạy TUẦN TỰ (await
// trong vòng for, đúng mẫu CLAUDE.md), 1 nguồn "treo" chặn đứng toàn bộ các
// mục còn lại trong cùng 1 lượt xoá hàng loạt — admin thấy "Đang xoá..."
// không bao giờ hết, cảm giác như mất kết nối server. Mục đích CHỈ xoá cache
// (đã làm ở dòng connections.delete(id) phía trên, LUÔN chạy trước) — việc
// đóng gọn connection cũ chỉ là dọn dẹp tài nguyên, KHÔNG đáng để treo cả
// request vì nó.
const CLOSE_TIMEOUT_MS = 5000;

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout sau ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// Gọi khi admin sửa/xoá một nguồn — đóng kết nối cũ (nếu có), KHÔNG để việc
// đóng kết nối (có thể treo, xem CLOSE_TIMEOUT_MS ở trên) chặn hành động
// sửa/xoá chính — xoá khỏi cache LUÔN LUÔN thành công trước, việc đóng pool
// cũ là best-effort.
// Gỡ ĐỦ mọi "hồ sơ" (requestTimeout khác nhau, xem chú thích `connections`
// ở trên) đang mở cho ĐÚNG id này — người gọi (routes/admin/dataSources.js,
// jobs/runSync.js khi gặp lỗi mạng tạm thời...) chỉ cần biết id, không cần
// biết hồ sơ nào đang thật sự mở.
async function invalidate(id) {
  const prefix = idKeyPrefix(id);
  const keys = [...connections.keys()].filter(k => k.startsWith(prefix));
  await Promise.all(keys.map(async (key) => {
    const existing = connections.get(key);
    connections.delete(key);
    try {
      const { pool, adapter } = await existing;
      await withTimeout(adapter.close(pool), CLOSE_TIMEOUT_MS);
    } catch (err) {
      // chưa từng kết nối thành công, HOẶC đóng quá hạn (nguồn "treo") — bỏ
      // qua, chỉ cảnh báo. Cache đã xoá ở trên nên lần dùng sau vẫn tạo kết
      // nối MỚI đúng — không ảnh hưởng tính đúng đắn, chỉ có thể rò rỉ 1
      // kết nối cũ phía driver cho tới khi hệ điều hành tự dọn (hiếm, chấp
      // nhận được so với treo cả request admin đang chờ).
      logError(`⚠️  [dataSourcePool] Không đóng gọn được kết nối cũ #${id} (bỏ qua, tiếp tục): ${err.message}`);
    }
  }));
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
