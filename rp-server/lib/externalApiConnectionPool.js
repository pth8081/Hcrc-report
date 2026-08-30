// lib/externalApiConnectionPool.js — Kết nối ĐỘNG tới API do ĐỐI TÁC BÊN
// NGOÀI xây dựng (app.ExternalApiConnections) — dùng khi một báo cáo có
// SourceType 'externalApi'. Khác lib/apiConnectionPool.js (đó luôn là API
// Server CỦA CHÍNH MÌNH, một khuôn dạng cố định): ở đây mỗi kết nối có thể
// dùng cách xác thực khác nhau (AuthType), nên cache trả về đủ thông tin để
// lib/externalReportClient.js tự dựng request đúng kiểu.
const { sql, getPool } = require('../db');
const { decrypt } = require('./crypto');

const cache = new Map(); // externalConnectionId -> Promise<connection>

async function loadConnection(id) {
  const rpPool = await getPool('RP');
  const result = await rpPool.request()
    .input('id', sql.Int, id)
    .query(`
      SELECT Id, Name, BaseUrl, AuthType, AuthKeyName, AuthValueEncrypted, AuthUsername, AuthPasswordEncrypted
      FROM app.ExternalApiConnections WHERE Id = @id
    `);
  if (!result.recordset.length) throw new Error(`Không tìm thấy kết nối API đối tác #${id}`);
  const row = result.recordset[0];
  return {
    name: row.Name,
    baseUrl: row.BaseUrl.replace(/\/+$/, ''),
    authType: row.AuthType,
    authKeyName: row.AuthKeyName,
    authValue: row.AuthValueEncrypted ? decrypt(row.AuthValueEncrypted) : null,
    authUsername: row.AuthUsername,
    authPassword: row.AuthPasswordEncrypted ? decrypt(row.AuthPasswordEncrypted) : null
  };
}

async function getConnection(id) {
  if (!cache.has(id)) {
    const promise = loadConnection(id).catch(err => {
      cache.delete(id);
      throw err;
    });
    cache.set(id, promise);
  }
  return cache.get(id);
}

function invalidate(id) {
  cache.delete(id);
}

// Thử một cấu hình (đã lưu, gọi theo Id) — CHỈ xác nhận máy chủ có phản hồi
// (bất kỳ mã trạng thái HTTP nào cũng tính là "phản hồi"), KHÔNG đảm bảo
// đường dẫn/JSON path báo cáo khai đúng — API đối tác không chắc có endpoint
// kiểm tra tình trạng như api-server của chính mình (xem README).
async function testConnection({ baseUrl }) {
  const res = await fetch(baseUrl.replace(/\/+$/, ''), { signal: AbortSignal.timeout(8000) });
  return { status: res.status };
}

module.exports = { getConnection, invalidate, testConnection };
