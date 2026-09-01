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
// Giới hạn tần suất RIÊNG TỪNG ĐỐI TÁC (consumer.rateLimitPerMinute) và giới
// hạn IP RIÊNG TỪNG ĐỐI TÁC (consumer.allowedIps) đều kiểm tra SAU KHI đã
// xác thực hợp lệ theo BẤT KỲ cách nào ở trên — khác bộ giới hạn theo IP
// TRƯỚC xác thực trong server.js (chặn spam nặc danh, không biết đối tác
// nào). Xem lib/consumerRateLimit.js, lib/ipMatch.js. Rỗng/0 = không giới hạn.
const { findByKey, findByHmacKeyId, isActiveConsumer, updateLastUsed } = require('./apiConsumers');
const { verifyToken } = require('./oauthTokens');
const hmacAuth = require('./hmacAuth');
const { ipAllowed } = require('./ipMatch');
const { checkConsumerRateLimit } = require('./consumerRateLimit');

async function authenticate(req) {
  const authHeader = req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    let consumer;
    try {
      consumer = verifyToken(authHeader.slice('Bearer '.length));
    } catch {
      return { error: 'Access token không hợp lệ hoặc đã hết hạn' };
    }
    // Chữ ký JWT hợp lệ không có nghĩa đối tác vẫn còn hoạt động — token TỰ
    // CHỨA scopes/allowedIps nên KHÔNG tự phát hiện được lúc admin tắt/xoá
    // đối tác. Tra lại đúng cache 30s dùng chung với apiKey/hmac (xem
    // lib/apiConsumers.js:isActiveConsumer) để rút cửa sổ thu hồi từ "tới
    // khi token hết hạn" (tối đa OAUTH_TOKEN_TTL_SECONDS, mặc định 1 giờ)
    // xuống còn tối đa ~30 giây — không thêm truy vấn CSDL mỗi request.
    if (!(await isActiveConsumer(consumer.id))) {
      return { error: 'Access token không hợp lệ hoặc đã hết hạn' };
    }
    return consumer;
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

      const rateCheck = checkConsumerRateLimit(consumer);
      if (!rateCheck.allowed) {
        res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
        return res.status(429).json({ error: 'Vượt quá giới hạn tần suất gọi API của đối tác này, thử lại sau' });
      }

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
