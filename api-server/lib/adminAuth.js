// lib/adminAuth.js — Xác thực JWT qua cookie cho api-admin/ (đối chiếu
// admin.AdminUsers, bcrypt) — TÁCH HOÀN TOÀN khỏi report-server/lib/auth.js:
// khoá bí mật riêng, cookie riêng, CSDL riêng (HCRC_API), đúng tinh thần cô
// lập API Server khỏi Report Server.
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../db');

const COOKIE_NAME = 'hcrc_api_admin_token';
const TOKEN_TTL = '8h';

function getSecret() {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) throw new Error('Thiếu ADMIN_JWT_SECRET trong .env');
  return secret;
}

async function verifyCredentials(username, password) {
  if (!username || !password) return null;
  const pool = await getPool('ADMIN');
  const result = await pool.request()
    .input('username', sql.NVarChar(50), username)
    .query('SELECT Id, Username, PasswordHash, Role, IsActive FROM admin.AdminUsers WHERE Username = @username');
  const user = result.recordset[0];
  if (!user || !user.IsActive) return null;
  const ok = await bcrypt.compare(password, user.PasswordHash);
  if (!ok) return null;

  await pool.request().input('id', sql.Int, user.Id)
    .query('UPDATE admin.AdminUsers SET LastLoginAt = SYSUTCDATETIME() WHERE Id = @id');

  return { id: user.Id, username: user.Username, role: user.Role };
}

function issueToken(user) {
  return jwt.sign({ sub: user.id, username: user.username, role: user.role }, getSecret(), { expiresIn: TOKEN_TTL });
}

function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

function requireAdminAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try {
    req.admin = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Phiên đăng nhập hết hạn hoặc không hợp lệ' });
  }
}

// Dùng SAU requireAdminAuth trên route chỉ dành cho vai trò 'admin' (vd CRUD
// đối tác) — 'viewer' chỉ xem thống kê, không sửa được gì (xem tài liệu kiến
// trúc, mục 03).
function requireAdminRole(req, res, next) {
  if (req.admin?.role !== 'admin') {
    return res.status(403).json({ error: 'Chỉ vai trò admin mới thực hiện được thao tác này' });
  }
  next();
}

module.exports = { COOKIE_NAME, verifyCredentials, issueToken, verifyToken, requireAdminAuth, requireAdminRole };
