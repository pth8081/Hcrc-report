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

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('Thiếu JWT_SECRET trong .env');
  return secret;
}

async function verifyCredentials(username, password) {
  if (!username || !password) return null;
  const pool = await getPool('RP');
  const result = await pool.request()
    .input('username', sql.NVarChar(50), username)
    .query('SELECT Id, Username, PasswordHash, IsActive FROM app.Users WHERE Username = @username');
  const user = result.recordset[0];
  if (!user || !user.IsActive) return null;
  const ok = await bcrypt.compare(password, user.PasswordHash);
  if (!ok) return null;

  await pool.request()
    .input('id', sql.Int, user.Id)
    .query('UPDATE app.Users SET LastLoginAt = SYSUTCDATETIME() WHERE Id = @id');

  return { id: user.Id, username: user.Username };
}

function issueToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, getSecret(), { expiresIn: TOKEN_TTL });
}

function verifyToken(token) {
  return jwt.verify(token, getSecret());
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
  requireMenuAccess
};
