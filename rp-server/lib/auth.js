// lib/auth.js — Xác thực JWT qua cookie httpOnly, đối chiếu app.Users (bcrypt).
// JWT CHỈ chứa { sub: userId, username } — KHÔNG nhúng quyền vào token, vì
// nhúng sẵn quyền chỉ có hiệu lực đổi sau khi đăng nhập lại (xem tài liệu
// kiến trúc, mục 07). requireAuth() chỉ xác thực danh tính; kiểm tra menu/
// báo cáo do requireMenuAccess()/lib/permissions.js đảm nhiệm riêng.
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../db');
const { getUserContext } = require('./permissions');

const COOKIE_NAME = 'hcrc_rp_token';
const TOKEN_TTL = '8h';

// iss/aud RIÊNG cho token rp-server — jwt.verify() dưới đây đòi khớp CẢ 2,
// nên dù RP_JWT_SECRET có VÔ TÌNH trùng giá trị với secret của etl/api-server
// (vd operator copy nhầm .env), token phát hành bởi dịch vụ kia vẫn bị từ
// chối vì sai issuer/audience — lớp phòng thủ CHIỀU SÂU, không thay thế
// việc mỗi service PHẢI có secret ngẫu nhiên riêng.
const ISSUER = 'hcrc-rp';

// Giá trị mẫu y hệt trong .env.example — chặn khởi động nếu operator quên
// đổi, thay vì chạy "được" với 1 secret ai cũng biết (đọc thẳng từ repo).
const PLACEHOLDER_SECRETS = new Set([
  'doi-chuoi-nay-thanh-gia-tri-ngau-nhien-dai-cho-rp',
  'doi-chuoi-nay-thanh-gia-tri-ngau-nhien-dai',
  'doi-chuoi-nay-thanh-gia-tri-ngau-nhien-dai-khac'
]);

// Hash bcrypt "giả" — không ứng với mật khẩu thật nào, chỉ dùng để CHẠY
// bcrypt.compare() ngay cả khi username không tồn tại, giữ thời gian phản
// hồi gần như nhau giữa 2 trường hợp "sai username" và "đúng username sai
// mật khẩu" — nếu không, thời gian phản hồi khác nhau đủ để dò được username
// hợp lệ từ xa (bcrypt.compare cố ý chậm, chỉ chạy khi user tồn tại).
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8Q0DKvSPBFEqz6GqUEmMFY6BVtR1e';

function getSecret() {
  const secret = process.env.RP_JWT_SECRET;
  if (!secret) throw new Error('Thiếu RP_JWT_SECRET trong .env');
  if (PLACEHOLDER_SECRETS.has(secret)) {
    throw new Error('RP_JWT_SECRET vẫn là giá trị mẫu trong .env.example — đổi thành chuỗi ngẫu nhiên thật trước khi chạy');
  }
  return secret;
}

async function verifyCredentials(username, password) {
  if (!username || !password) return null;
  const pool = await getPool('RP');
  const result = await pool.request()
    .input('username', sql.NVarChar(50), username)
    .query('SELECT Id, Username, PasswordHash, IsActive FROM app.Users WHERE Username = @username');
  const user = result.recordset[0];
  if (!user || !user.IsActive) {
    await bcrypt.compare(password, DUMMY_HASH);
    return null;
  }
  const ok = await bcrypt.compare(password, user.PasswordHash);
  if (!ok) return null;

  await pool.request()
    .input('id', sql.Int, user.Id)
    .query('UPDATE app.Users SET LastLoginAt = SYSUTCDATETIME() WHERE Id = @id');

  return { id: user.Id, username: user.Username };
}

function issueToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, getSecret(), {
    expiresIn: TOKEN_TTL, algorithm: 'HS256', issuer: ISSUER, audience: ISSUER
  });
}

function verifyToken(token) {
  return jwt.verify(token, getSecret(), { algorithms: ['HS256'], issuer: ISSUER, audience: ISSUER });
}

function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Phiên đăng nhập hết hạn hoặc không hợp lệ' });
  }
}

// Dùng SAU requireAuth trên route cần đúng 1 mã menu (vd requireMenuAccess
// ('system-permissions')). Vai trò Admin (IsSystemRole) luôn qua được mọi
// kiểm tra — xem lib/permissions.js.
function requireMenuAccess(menuCode) {
  return async (req, res, next) => {
    try {
      const context = await getUserContext(req.user.sub);
      if (!context) return res.status(401).json({ error: 'Tài khoản không còn hoạt động' });
      if (!context.menuCodes.has(menuCode)) {
        return res.status(403).json({ error: 'Bạn không có quyền truy cập mục này' });
      }
      req.userContext = context;
      next();
    } catch (err) { next(err); }
  };
}

module.exports = {
  COOKIE_NAME,
  TOKEN_TTL,
  verifyCredentials,
  issueToken,
  verifyToken,
  requireAuth,
  requireMenuAccess,
  // Xuất thêm CHỈ để server.js gọi 1 LẦN lúc khởi động (kiểm tra secret
  // không còn là giá trị mẫu) — "LỖI NGAY lúc khởi động" thay vì chỉ lộ ra
  // ở lượt đăng nhập/xác thực JWT đầu tiên, xem chú thích trong server.js.
  getSecret
};
