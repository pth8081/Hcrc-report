// lib/adminAuth.js — Xác thực JWT qua cookie cho api-admin/ (đối chiếu
// admin.AdminUsers, bcrypt) — TÁCH HOÀN TOÀN khỏi rp-server/lib/auth.js:
// khoá bí mật riêng, cookie riêng, CSDL riêng (HCRC_API), đúng tinh thần cô
// lập API Server khỏi Report Server.
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../db');

const COOKIE_NAME = 'hcrc_api_admin_token';
const TOKEN_TTL = '8h';

// iss/aud RIÊNG cho token api-admin — jwt.verify() dưới đây đòi khớp CẢ 2,
// nên dù API_ADMIN_JWT_SECRET có VÔ TÌNH trùng giá trị với secret của
// etl/rp-server (vd operator copy nhầm .env), token phát hành bởi dịch vụ
// kia vẫn bị từ chối vì sai issuer/audience — lớp phòng thủ CHIỀU SÂU,
// không thay thế việc mỗi service PHẢI có secret ngẫu nhiên riêng.
const ISSUER = 'hcrc-api-admin';

// Giá trị mẫu y hệt trong .env.example — chặn khởi động nếu operator quên
// đổi, thay vì chạy "được" với 1 secret ai cũng biết (đọc thẳng từ repo).
const PLACEHOLDER_SECRETS = new Set([
  'doi-chuoi-nay-thanh-gia-tri-ngau-nhien-dai-cho-api-admin',
  'doi-chuoi-nay-thanh-gia-tri-ngau-nhien-dai',
  'doi-chuoi-nay-thanh-gia-tri-ngau-nhien-dai-khac'
]);

// Hash bcrypt "giả" — chạy bcrypt.compare() ngay cả khi username không tồn
// tại, giữ thời gian phản hồi ổn định giữa "sai username" và "đúng username
// sai mật khẩu", chống dò username hợp lệ qua chênh lệch thời gian phản hồi.
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8Q0DKvSPBFEqz6GqUEmMFY6BVtR1e';

function getSecret() {
  const secret = process.env.API_ADMIN_JWT_SECRET;
  if (!secret) throw new Error('Thiếu API_ADMIN_JWT_SECRET trong .env');
  if (PLACEHOLDER_SECRETS.has(secret)) {
    throw new Error('API_ADMIN_JWT_SECRET vẫn là giá trị mẫu trong .env.example — đổi thành chuỗi ngẫu nhiên thật trước khi chạy');
  }
  return secret;
}

async function verifyCredentials(username, password) {
  if (!username || !password) return null;
  const pool = await getPool('ADMIN');
  const result = await pool.request()
    .input('username', sql.NVarChar(50), username)
    .query('SELECT Id, Username, PasswordHash, Role, IsActive FROM admin.AdminUsers WHERE Username = @username');
  const user = result.recordset[0];
  if (!user || !user.IsActive) {
    await bcrypt.compare(password, DUMMY_HASH);
    return null;
  }
  const ok = await bcrypt.compare(password, user.PasswordHash);
  if (!ok) return null;

  await pool.request().input('id', sql.Int, user.Id)
    .query('UPDATE admin.AdminUsers SET LastLoginAt = SYSUTCDATETIME() WHERE Id = @id');

  return { id: user.Id, username: user.Username, role: user.Role };
}

function issueToken(user) {
  return jwt.sign({ sub: user.id, username: user.username, role: user.role }, getSecret(), {
    expiresIn: TOKEN_TTL, algorithm: 'HS256', issuer: ISSUER, audience: ISSUER
  });
}

function verifyToken(token) {
  return jwt.verify(token, getSecret(), { algorithms: ['HS256'], issuer: ISSUER, audience: ISSUER });
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

// getSecret xuất thêm CHỈ để server.js gọi 1 LẦN lúc khởi động — xem
// chú thích tương tự trong rp-server/lib/auth.js.
module.exports = { COOKIE_NAME, verifyCredentials, issueToken, verifyToken, requireAdminAuth, requireAdminRole, getSecret };
