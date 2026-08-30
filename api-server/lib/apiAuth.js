// lib/apiAuth.js — Xác thực cho hệ thống đối tác — khác hẳn lib/adminAuth.js
// (xác thực người vận hành bằng mật khẩu để vào api-admin/, hai ranh giới
// hoàn toàn tách biệt). 3 CÁCH xác thực, thử theo thứ tự dưới đây, dừng ở
// cách đầu tiên có đủ thông tin gửi kèm (không phải đối tác nào cũng gửi cả
// 3 — thường chỉ 1 loại đúng theo AuthMethod họ được cấp):
//   1. Authorization: Bearer <token>  — OAuth2 Client Credentials (AuthMethod='oauth2'),
//      xem lib/oauthTokens.js. Token TỰ CHỨA scopes/allowedIps, không tra cứu.
//   2. X-Key-Id + X-Timestamp + X-Signature — HMAC ký request (AuthMethod='hmac'),
//      xem lib/hmacAuth.js. Cần lib/apiConsumers.js:findByHmacKeyId().
//   3. X-API-Key — API key tĩnh (AuthMethod='apiKey', hành vi cũ), xem
//      lib/apiConsumers.js:findByKey().
//
// Giới hạn IP RIÊNG TỪNG ĐỐI TÁC (consumer.allowedIps) kiểm tra SAU KHI đã
// xác thực hợp lệ theo BẤT KỲ cách nào ở trên — dùng chung 1 bước cuối, xem
// lib/ipMatch.js. Rỗng = không giới hạn.
const { findByKey, findByHmacKeyId, updateLastUsed } = require('./apiConsumers');
const { verifyToken } = require('./oauthTokens');
const hmacAuth = require('./hmacAuth');
const { ipAllowed } = require('./ipMatch');

async function authenticate(req) {
  const authHeader = req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      return verifyToken(authHeader.slice('Bearer '.length));
    } catch {
      return { error: 'Access token không hợp lệ hoặc đã hết hạn' };
    }
  }

  const keyId = req.header('X-Key-Id');
  const timestamp = req.header('X-Timestamp');
  const signature = req.header('X-Signature');
  if (keyId && timestamp && signature) {
    const consumer = await findByHmacKeyId(keyId);
    if (!consumer) return { error: 'X-Key-Id không hợp lệ' };
    const result = hmacAuth.verify({
      secret: consumer.hmacSecret,
      method: req.method,
      path: req.originalUrl,
      timestamp,
      body: req.rawBody ? req.rawBody.toString('utf8') : '',
      signature
    });
    if (!result.ok) return { error: `Chữ ký HMAC không hợp lệ: ${result.reason}` };
    updateLastUsed(consumer.id).catch(() => {}); // không await — không chặn đường phản hồi
    return consumer;
  }

  const apiKey = req.header('X-API-Key');
  if (apiKey) {
    const consumer = await findByKey(apiKey);
    if (!consumer) return { error: 'API key không hợp lệ' };
    return consumer;
  }

  return { error: 'Thiếu thông tin xác thực — gửi kèm Authorization: Bearer, hoặc X-Key-Id/X-Timestamp/X-Signature, hoặc X-API-Key' };
}

function requireApiKey(...requiredScopes) {
  return async (req, res, next) => {
    try {
      const result = await authenticate(req);
      if (result.error) return res.status(401).json({ error: result.error });
      const consumer = result;

      const hasScope = requiredScopes.every(scope => consumer.scopes.includes(scope));
      if (!hasScope) return res.status(403).json({ error: 'Không có quyền gọi endpoint này' });

      if (consumer.allowedIps.length && !ipAllowed(req.ip, consumer.allowedIps)) {
        return res.status(403).json({ error: 'IP gọi tới không nằm trong danh sách cho phép của đối tác này' });
      }

      req.consumer = consumer;
      next();
    } catch (err) { next(err); }
  };
}

module.exports = { requireApiKey };
