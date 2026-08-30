// lib/apiConsumers.js — Đối tác gọi API (api.ApiConsumers trong HCRC_API).
// Nạp TOÀN BỘ đối tác đang hoạt động vào bộ nhớ, làm mới mỗi 30 giây (bảng
// này nhỏ — vài chục dòng là nhiều) — tránh 1 truy vấn CSDL cho MỖI lượt hệ
// thống ngoài gọi vào, vốn có thể rất thường xuyên. invalidate() gọi ngay
// sau khi admin thêm/sửa/xoá một đối tác qua routes/admin/consumers.js —
// không chờ hết chu kỳ 30 giây.
//
// 2 chỉ mục trong bộ nhớ, ứng với 2 AuthMethod cần tra cứu MỖI request
// (khác 'oauth2' — đó chỉ tra CSDL lúc ĐỔI TOKEN, không phải mỗi request,
// xem routes/v1/oauth.js):
//   cacheByApiKeyHash — AuthMethod='apiKey', xem lib/apiAuth.js.
//   cacheByHmacKeyId  — AuthMethod='hmac', xem lib/hmacAuth.js. Giữ
//                       hmacSecret ĐÃ GIẢI MÃ trong bộ nhớ (cùng tinh thần
//                       dataSourcePool.js giữ mật khẩu DB đã giải mã) —
//                       cần bản rõ để tính lại chữ ký so sánh mỗi request.
const { sql, getPool } = require('../db');
const { sha256Hex } = require('./hash');
const { decrypt } = require('./crypto');

const REFRESH_INTERVAL_MS = 30 * 1000;
let cacheByApiKeyHash = new Map();
let cacheByHmacKeyId = new Map();
let lastLoadedAt = 0;
let loadingPromise = null;

function toConsumer(row) {
  return {
    id: row.Id,
    name: row.Name,
    scopes: row.Scopes.split(',').map(s => s.trim()).filter(Boolean),
    rateLimitPerMinute: row.RateLimitPerMinute,
    allowedIps: (row.AllowedIps || '').split(',').map(s => s.trim()).filter(Boolean)
  };
}

async function load() {
  const pool = await getPool('ADMIN');
  const result = await pool.request().query(`
    SELECT Id, Name, AuthMethod, ApiKeyHash, HmacKeyId, HmacSecretEncrypted, Scopes, RateLimitPerMinute, AllowedIps
    FROM api.ApiConsumers WHERE IsActive = 1
  `);
  const nextByApiKeyHash = new Map();
  const nextByHmacKeyId = new Map();
  for (const row of result.recordset) {
    if (row.AuthMethod === 'apiKey' && row.ApiKeyHash) {
      nextByApiKeyHash.set(row.ApiKeyHash, toConsumer(row));
    } else if (row.AuthMethod === 'hmac' && row.HmacKeyId && row.HmacSecretEncrypted) {
      nextByHmacKeyId.set(row.HmacKeyId, { ...toConsumer(row), hmacSecret: decrypt(row.HmacSecretEncrypted) });
    }
  }
  cacheByApiKeyHash = nextByApiKeyHash;
  cacheByHmacKeyId = nextByHmacKeyId;
  lastLoadedAt = Date.now();
}

async function ensureFresh() {
  if (Date.now() - lastLoadedAt < REFRESH_INTERVAL_MS) return;
  if (!loadingPromise) {
    loadingPromise = load().finally(() => { loadingPromise = null; });
  }
  await loadingPromise;
}

async function updateLastUsed(consumerId) {
  const pool = await getPool('ADMIN');
  await pool.request().input('id', sql.Int, consumerId)
    .query('UPDATE api.ApiConsumers SET LastUsedAt = SYSUTCDATETIME() WHERE Id = @id');
}

async function findByKey(rawKey) {
  await ensureFresh();
  const consumer = cacheByApiKeyHash.get(sha256Hex(rawKey));
  if (consumer) {
    // Không await — cập nhật "lần dùng gần nhất" không được làm chậm request thật.
    updateLastUsed(consumer.id).catch(() => {});
  }
  return consumer || null;
}

async function findByHmacKeyId(keyId) {
  await ensureFresh();
  return cacheByHmacKeyId.get(keyId) || null;
}

// Gọi sau khi admin thêm/sửa/xoá/luân chuyển bí mật một đối tác (bất kể
// AuthMethod nào — kể cả oauth2, dù cache này không giữ oauth2, để lần đổi
// token tiếp theo query lại CSDL luôn có LastUsedAt/IsActive mới nhất).
function invalidate() {
  lastLoadedAt = 0;
}

module.exports = { findByKey, findByHmacKeyId, invalidate, updateLastUsed };
