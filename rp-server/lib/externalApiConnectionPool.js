// lib/externalApiConnectionPool.js — Kết nối ĐỘNG tới API do ĐỐI TÁC BÊN
// NGOÀI xây dựng (app.ExternalApiConnections) — dùng khi một báo cáo có
// SourceType 'externalApi'. Khác lib/apiConnectionPool.js (đó luôn là API
// Server CỦA CHÍNH MÌNH, một khuôn dạng cố định): ở đây mỗi kết nối có thể
// dùng cách xác thực khác nhau (AuthType), nên cache trả về đủ thông tin để
// lib/externalReportClient.js tự dựng request đúng kiểu.
//
// AuthType='oauth2ClientCredentials' còn có 1 cache RIÊNG cho access token
// (khác cache kết nối — token hết hạn SỚM HƠN nhiều so với lúc admin đổi
// cấu hình kết nối, nên tách 2 vòng đời): getOAuth2Token() tự đổi token
// mới khi cache trống/gần hết hạn, không cần lib/externalReportClient.js
// biết chi tiết.
const { sql, getPool } = require('../db');
const { decrypt } = require('./crypto');
const { fetchSafe } = require('./urlSafety');

const cache = new Map(); // externalConnectionId -> Promise<connection>
const tokenCache = new Map(); // externalConnectionId -> { accessToken, expiresAt }
const TOKEN_EXPIRY_SAFETY_MS = 10 * 1000; // đổi token mới sớm 10s trước khi hết hạn thật, tránh vừa dùng đã hết hạn giữa chừng

async function loadConnection(id) {
  const rpPool = await getPool('RP');
  const result = await rpPool.request()
    .input('id', sql.Int, id)
    .query(`
      SELECT Id, Name, BaseUrl, AuthType, AuthKeyName, AuthValueEncrypted, AuthUsername, AuthPasswordEncrypted, TokenUrl
      FROM app.ExternalApiConnections WHERE Id = @id
    `);
  if (!result.recordset.length) throw new Error(`Không tìm thấy kết nối API đối tác #${id}`);
  const row = result.recordset[0];
  return {
    id: row.Id,
    name: row.Name,
    baseUrl: row.BaseUrl.replace(/\/+$/, ''),
    authType: row.AuthType,
    authKeyName: row.AuthKeyName,
    authValue: row.AuthValueEncrypted ? decrypt(row.AuthValueEncrypted) : null,
    authUsername: row.AuthUsername,
    authPassword: row.AuthPasswordEncrypted ? decrypt(row.AuthPasswordEncrypted) : null,
    tokenUrl: row.TokenUrl
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

// Đổi lấy access token OAuth2 Client Credentials, cache theo connection Id
// tới khi gần hết hạn thì tự đổi lại — xem lib/externalReportClient.js.
async function getOAuth2Token(connection) {
  const cached = tokenCache.get(connection.id);
  if (cached && cached.expiresAt > Date.now() + TOKEN_EXPIRY_SAFETY_MS) return cached.accessToken;

  const res = await fetchSafe(connection.tokenUrl, { // chặn SSRF (kể cả qua redirect) — xem lib/urlSafety.js
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: connection.authKeyName,
      client_secret: connection.authValue
    }),
    signal: AbortSignal.timeout(15000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Không đổi được token OAuth2 từ đối tác: ${data.error_description || data.error || `HTTP ${res.status}`}`);
  }
  const expiresIn = Number(data.expires_in) || 3600;
  tokenCache.set(connection.id, { accessToken: data.access_token, expiresAt: Date.now() + expiresIn * 1000 });
  return data.access_token;
}

function invalidate(id) {
  cache.delete(id);
  tokenCache.delete(id);
}

// Thử một cấu hình (đã lưu, gọi theo Id) — CHỈ xác nhận máy chủ có phản hồi
// (bất kỳ mã trạng thái HTTP nào cũng tính là "phản hồi"), KHÔNG đảm bảo
// đường dẫn/JSON path báo cáo khai đúng — API đối tác không chắc có endpoint
// kiểm tra tình trạng như api-server của chính mình (xem README).
async function testConnection({ baseUrl }) {
  const url = baseUrl.replace(/\/+$/, '');
  const res = await fetchSafe(url, { signal: AbortSignal.timeout(8000) }); // chặn SSRF (kể cả qua redirect) — xem lib/urlSafety.js
  return { status: res.status };
}

module.exports = { getConnection, getOAuth2Token, invalidate, testConnection };
