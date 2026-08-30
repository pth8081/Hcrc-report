// lib/auth.js — Xác thực JWT qua cookie httpOnly. TẠM THỜI dùng một tài khoản
// quản trị cấu hình qua .env (ADMIN_USERNAME/ADMIN_PASSWORD_HASH) — thay bằng
// bảng người dùng riêng hoặc tích hợp AD/SSO khi đã chốt (câu hỏi mở trong tài
// liệu kiến trúc, mục 10). requireAuth/verifyToken không phụ thuộc vào việc đó
// đổi thế nào sau này — chỉ verifyCredentials() cần viết lại.
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const COOKIE_NAME = 'hcrc_report_token';
const TOKEN_TTL = '8h';

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('Thiếu JWT_SECRET trong .env');
  return secret;
}

async function verifyCredentials(username, password) {
  if (!username || !password) return false;
  if (username !== process.env.ADMIN_USERNAME) return false;
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

function issueToken(username) {
  return jwt.sign({ sub: username }, getSecret(), { expiresIn: TOKEN_TTL });
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

module.exports = { COOKIE_NAME, TOKEN_TTL, verifyCredentials, issueToken, verifyToken, requireAuth };
