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
let activeIds = new Set(); // TẤT CẢ đối tác IsActive=1, MỌI AuthMethod (kể cả oauth2) — xem isActiveConsumer()
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
  const nextActiveIds = new Set();
  for (const row of result.recordset) {
    nextActiveIds.add(row.Id);
    if (row.AuthMethod === 'apiKey' && row.ApiKeyHash) {
      nextByApiKeyHash.set(row.ApiKeyHash, toConsumer(row));
    } else if (row.AuthMethod === 'hmac' && row.HmacKeyId && row.HmacSecretEncrypted) {
      nextByHmacKeyId.set(row.HmacKeyId, { ...toConsumer(row), hmacSecret: decrypt(row.HmacSecretEncrypted) });
    }
  }
  cacheByApiKeyHash = nextByApiKeyHash;
  cacheByHmacKeyId = nextByHmacKeyId;
  activeIds = nextActiveIds;
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

// oauth2 (lib/oauthTokens.js verifyToken) TỰ CHỨA thông tin trong JWT, không
// tra CSDL mỗi request — nhưng điều đó có nghĩa vô hiệu hoá/XOÁ HẲN 1 đối
// tác không có tác dụng gì với access token ĐÃ PHÁT, dùng được tới tận khi
// hết hạn (OAUTH_TOKEN_TTL_SECONDS, mặc định 1 GIỜ) — khác hẳn "đổi
// scope/IP chỉ có hiệu lực với token phát SAU" (đánh đổi có chủ đích, xem
// chú thích đầu lib/oauthTokens.js). Đây là lỗ hổng thu hồi thật sự: đối
// tác bị lộ bí mật, admin tắt/xoá ngay, nhưng token cũ vẫn dùng được cả giờ
// đồng hồ. isActiveConsumer() dùng CHUNG chu kỳ làm mới 30s + invalidate()
// đã có sẵn — không thêm truy vấn CSDL/request nào ngoài cỡ đã chấp nhận
// cho apiKey/hmac, chỉ rút cửa sổ thu hồi thật xuống còn tối đa ~30s.
async function isActiveConsumer(id) {
  await ensureFresh();
  return activeIds.has(id);
}

// Gọi sau khi admin thêm/sửa/xoá/luân chuyển bí mật một đối tác (bất kể
// AuthMethod nào — kể cả oauth2, dù cache này không giữ oauth2, để lần đổi
// token tiếp theo query lại CSDL luôn có LastUsedAt/IsActive mới nhất).
function invalidate() {
  lastLoadedAt = 0;
}

module.exports = { findByKey, findByHmacKeyId, isActiveConsumer, invalidate, updateLastUsed };
