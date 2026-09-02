// routes/v1/oauth.js — POST /api/v1/oauth/token: đổi ClientId + client
// secret lấy access token ngắn hạn (OAuth2 Client Credentials, RFC 6749 mục
// 4.4) — chỉ đối tác AuthMethod='oauth2' (api.ApiConsumers) đổi được.
// Chấp nhận cả 2 cách gửi client_id/client_secret chuẩn OAuth2: form body
// (application/x-www-form-urlencoded) hoặc HTTP Basic auth header — để
// tương thích thư viện OAuth2 client có sẵn của đối tác (đa số hỗ trợ cả
// hai, một số CHỈ hỗ trợ Basic).
const crypto = require('crypto');
const express = require('express');
const { sql, getPool } = require('../../db');
const { sha256Hex } = require('../../lib/hash');
const { issueToken } = require('../../lib/oauthTokens');
const { logAction } = require('../../lib/auditLog');

// So sánh bằng crypto.timingSafeEqual — cùng lý do lib/hmacAuth.js:47-49
// (so sánh chuỗi thường rò rỉ thời gian xử lý theo độ dài phần khớp).
function secretMatches(clientSecret, expectedHash) {
  const actualBuf = Buffer.from(sha256Hex(clientSecret), 'hex');
  const expectedBuf = Buffer.from(expectedHash, 'hex');
  return actualBuf.length === expectedBuf.length && crypto.timingSafeEqual(actualBuf, expectedBuf);
}

const router = express.Router();

function extractClientCredentials(req) {
  const authHeader = req.header('Authorization');
  if (authHeader && authHeader.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.slice('Basic '.length), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    if (sep === -1) return {};
    return { clientId: decoded.slice(0, sep), clientSecret: decoded.slice(sep + 1) };
  }
  return { clientId: req.body?.client_id, clientSecret: req.body?.client_secret };
}

router.post('/token', async (req, res, next) => {
  try {
    if ((req.body?.grant_type || 'client_credentials') !== 'client_credentials') {
      return res.status(400).json({ error: 'unsupported_grant_type', error_description: 'Chỉ hỗ trợ grant_type=client_credentials' });
    }
    const { clientId, clientSecret } = extractClientCredentials(req);
    if (!clientId || !clientSecret) {
      return res.status(400).json({ error: 'invalid_request', error_description: 'Thiếu client_id/client_secret' });
    }

    const pool = await getPool('ADMIN');
    const result = await pool.request().input('clientId', sql.VarChar(64), clientId).query(`
      SELECT Id, Name, ClientSecretHash, Scopes, AllowedIps, RateLimitPerMinute
      FROM api.ApiConsumers WHERE ClientId = @clientId AND AuthMethod = 'oauth2' AND IsActive = 1
    `);
    const row = result.recordset[0];
    if (!row || !secretMatches(clientSecret, row.ClientSecretHash)) {
      // req.admin không tồn tại ở route đối tác này (không qua requireAdminAuth)
      // — tự ghép object tối thiểu cho logAction (chỉ đọc req.ip/req.admin.username),
      // cùng mẫu routes/admin/auth.js đăng nhập thất bại.
      await logAction({ ip: req.ip, admin: { username: clientId } }, {
        module: 'OAuth2 đối tác', actionType: 'TU_CHOI_TOKEN', targetObject: clientId,
        description: 'Đổi token thất bại — client_id/client_secret không hợp lệ', status: 'FAILED'
      });
      return res.status(401).json({ error: 'invalid_client', error_description: 'client_id/client_secret không hợp lệ' });
    }

    await pool.request().input('id', sql.Int, row.Id).query('UPDATE api.ApiConsumers SET LastUsedAt = SYSUTCDATETIME() WHERE Id = @id');

    // RateLimitPerMinute PHẢI có trong payload token — thiếu cột này khiến
    // verifyToken() rơi về "0/null = không giới hạn" (xem lib/oauthTokens.js
    // + lib/consumerRateLimit.js), tức consumer oauth2 thoát hẳn giới hạn
    // riêng admin đã đặt, chỉ còn bị chặn bởi giới hạn theo IP dùng chung.
    const consumer = {
      id: row.Id,
      name: row.Name,
      scopes: row.Scopes.split(',').map(s => s.trim()).filter(Boolean),
      allowedIps: (row.AllowedIps || '').split(',').map(s => s.trim()).filter(Boolean),
      rateLimitPerMinute: row.RateLimitPerMinute
    };
    const { accessToken, expiresIn } = issueToken(consumer);
    await logAction({ ip: req.ip, admin: { username: clientId } }, {
      module: 'OAuth2 đối tác', actionType: 'PHAT_HANH_TOKEN', targetObject: clientId,
      description: `Phát hành access token cho đối tác "${row.Name}"`
    });
    res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: expiresIn });
  } catch (err) { next(err); }
});

module.exports = router;
