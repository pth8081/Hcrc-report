// lib/apiConnectionPool.js — Kết nối ĐỘNG tới API Server (app.ApiConnections),
// dùng khi một báo cáo có SourceType 'apiReport'/'apiRealtime' (xem
// routes/reports.js, lib/apiReportClient.js). Cùng tinh thần với
// lib/dataSourcePool.js (cache theo Id, invalidate khi admin sửa/xoá) nhưng
// đây là "kết nối" HTTP + API key, không phải ConnectionPool SQL Server.
const { sql, getPool } = require('../db');
const { decrypt } = require('./crypto');

const cache = new Map(); // apiConnectionId -> Promise<{ baseUrl, apiKey, name }>

async function loadConnection(id) {
  const rpPool = await getPool('RP');
  const result = await rpPool.request()
    .input('id', sql.Int, id)
    .query('SELECT Id, Name, BaseUrl, ApiKeyEncrypted FROM app.ApiConnections WHERE Id = @id');
  if (!result.recordset.length) throw new Error(`Không tìm thấy kết nối API #${id}`);
  return result.recordset[0];
}

async function getConnection(id) {
  if (!cache.has(id)) {
    const promise = (async () => {
      const row = await loadConnection(id);
      return {
        name: row.Name,
        baseUrl: row.BaseUrl.replace(/\/+$/, ''), // bỏ dấu / cuối — path ghép vào luôn có / đầu
        apiKey: decrypt(row.ApiKeyEncrypted)
      };
    })().catch(err => {
      cache.delete(id);
      throw err;
    });
    cache.set(id, promise);
  }
  return cache.get(id);
}

// Gọi khi admin sửa/xoá một kết nối — lần đọc kế tiếp lấy lại thông tin mới.
function invalidate(id) {
  cache.delete(id);
}

// Thử một cấu hình CHƯA lưu (nút "Kiểm tra kết nối") — gọi /v1/health, không
// cần API key (health không yêu cầu xác thực, xem api-server/routes/v1/health.js).
async function testConnection({ baseUrl }) {
  const url = `${baseUrl.replace(/\/+$/, '')}/api/v1/health`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`API Server phản hồi lỗi ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok') throw new Error('API Server không ở trạng thái "ok"');
}

module.exports = { getConnection, invalidate, testConnection };
