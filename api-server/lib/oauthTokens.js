// lib/oauthTokens.js — Access token cho OAuth2 Client Credentials (RFC 6749
// mục 4.4), AuthMethod='oauth2' bên api.ApiConsumers. Token là JWT TỰ CHỨA
// (scopes, allowedIps) — verify không cần tra CSDL/cache mỗi request, khác
// hẳn lib/adminAuth.js (đó verify xong còn cần req.admin để route sau tự
// tra role) vì ở đây payload đã đủ để requireApiKey quyết định luôn. Đánh
// đổi: đổi scope/IP cho 1 đối tác chỉ có hiệu lực với token phát HÀNH SAU,
// token cũ vẫn dùng được tới khi hết hạn (OAUTH_TOKEN_TTL) — chấp nhận được,
// đúng tinh thần token ngắn hạn của OAuth2 (khác API key tĩnh không hết hạn).
const jwt = require('jsonwebtoken');

const TOKEN_TTL_SECONDS = parseInt(process.env.OAUTH_TOKEN_TTL_SECONDS || '3600', 10);

// iss cố định cho MỌI access token phát ra ở đây, aud cố định là scope
// "đối tác API" — jwt.verify() đòi khớp cả 2, phòng thủ chiều sâu chống
// nhầm lẫn với token của ranh giới khác (vd token phiên admin, dù đã dùng
// secret khác OAUTH_JWT_SECRET rồi).
const ISSUER = 'hcrc-api-oauth';
const AUDIENCE = 'hcrc-api-partners';

const PLACEHOLDER_SECRETS = new Set([
  'doi-chuoi-nay-thanh-gia-tri-ngau-nhien-dai-cho-oauth',
  'doi-chuoi-nay-thanh-gia-tri-ngau-nhien-dai',
  'doi-chuoi-nay-thanh-gia-tri-ngau-nhien-dai-khac'
]);

function getSecret() {
  const secret = process.env.OAUTH_JWT_SECRET;
  if (!secret) throw new Error('Thiếu OAUTH_JWT_SECRET trong .env');
  if (PLACEHOLDER_SECRETS.has(secret)) {
    throw new Error('OAUTH_JWT_SECRET vẫn là giá trị mẫu trong .env.example — đổi thành chuỗi ngẫu nhiên thật trước khi chạy');
  }
  return secret;
}

// consumer = { id, name, scopes, allowedIps, rateLimitPerMinute } — xem
// lib/apiConsumers.js. rateLimitPerMinute nhúng vào token CÙNG lý do
// scopes/allowedIps đã nhúng — verify không tra CSDL, đổi giới hạn chỉ có
// hiệu lực với token phát hành SAU (chấp nhận được, xem chú thích đầu file).
function issueToken(consumer) {
  const accessToken = jwt.sign(
    {
      sub: consumer.id, name: consumer.name, scopes: consumer.scopes,
      allowedIps: consumer.allowedIps, rateLimitPerMinute: consumer.rateLimitPerMinute
    },
    getSecret(),
    { expiresIn: TOKEN_TTL_SECONDS, algorithm: 'HS256', issuer: ISSUER, audience: AUDIENCE }
  );
  return { accessToken, expiresIn: TOKEN_TTL_SECONDS };
}

// Trả về hình dạng consumer y hệt lib/apiConsumers.js:findByKey() để
// lib/apiAuth.js dùng chung logic scope/IP/giới hạn tần suất phía sau, bất
// kể AuthMethod nào.
function verifyToken(token) {
  const payload = jwt.verify(token, getSecret(), { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
  return {
    id: payload.sub, name: payload.name, scopes: payload.scopes || [],
    allowedIps: payload.allowedIps || [], rateLimitPerMinute: payload.rateLimitPerMinute || 0
  };
}

// getSecret xuất thêm CHỈ để server.js gọi 1 LẦN lúc khởi động — xem
// chú thích tương tự trong rp-server/lib/auth.js.
module.exports = { issueToken, verifyToken, getSecret };
