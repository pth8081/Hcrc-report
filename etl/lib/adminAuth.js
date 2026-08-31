// lib/adminAuth.js — Xác thực JWT qua cookie cho etl-admin/ (đối chiếu
// admin.AdminUsers, bcrypt) — TÁCH HOÀN TOÀN khỏi rp-server và
// api-server: khoá bí mật riêng, cookie riêng, CSDL riêng (HCRC_ETL).
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../db');

const COOKIE_NAME = 'hcrc_etl_admin_token';
const TOKEN_TTL = '8h';

// iss/aud RIÊNG cho token etl-admin — jwt.verify() dưới đây đòi khớp CẢ 2,
// nên dù ETL_ADMIN_JWT_SECRET có VÔ TÌNH trùng giá trị với secret của
// api-server/rp-server (vd operator copy nhầm .env), token phát hành bởi
// dịch vụ kia vẫn bị từ chối vì sai issuer/audience — lớp phòng thủ CHIỀU
// SÂU, không thay thế việc mỗi service PHẢI có secret ngẫu nhiên riêng.
const ISSUER = 'hcrc-etl-admin';

// Giá trị mẫu y hệt trong .env.example — chặn khởi động nếu operator quên
// đổi, thay vì chạy "được" với 1 secret ai cũng biết (đọc thẳng từ repo).
const PLACEHOLDER_SECRETS = new Set([
  'doi-chuoi-nay-thanh-gia-tri-ngau-nhien-dai-cho-etl',
  'doi-chuoi-nay-thanh-gia-tri-ngau-nhien-dai',
  'doi-chuoi-nay-thanh-gia-tri-ngau-nhien-dai-khac'
]);

// Hash bcrypt "giả" — chạy bcrypt.compare() ngay cả khi username không tồn
// tại, giữ thời gian phản hồi ổn định giữa "sai username" và "đúng username
// sai mật khẩu", chống dò username hợp lệ qua chênh lệch thời gian phản hồi.
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8Q0DKvSPBFEqz6GqUEmMFY6BVtR1e';

function getSecret() {
  const secret = process.env.ETL_ADMIN_JWT_SECRET;
  if (!secret) throw new Error('Thiếu ETL_ADMIN_JWT_SECRET trong .env');
  if (PLACEHOLDER_SECRETS.has(secret)) {
    throw new Error('ETL_ADMIN_JWT_SECRET vẫn là giá trị mẫu trong .env.example — đổi thành chuỗi ngẫu nhiên thật trước khi chạy');
  }
  return secret;
}

async function verifyCredentials(username, password) {
  if (!username || !password) return null;
  const pool = await getPool('ADMIN');
  const result = await pool.request()
    .input('username', sql.NVarChar(50), username)
    .query('SELECT Id, Username, PasswordHash, Role, IsActive, TwoFactorEnabled FROM admin.AdminUsers WHERE Username = @username');
  const user = result.recordset[0];
  if (!user || !user.IsActive) {
    await bcrypt.compare(password, DUMMY_HASH);
    return null;
  }
  const ok = await bcrypt.compare(password, user.PasswordHash);
  if (!ok) return null;

  await pool.request().input('id', sql.Int, user.Id)
    .query('UPDATE admin.AdminUsers SET LastLoginAt = SYSUTCDATETIME() WHERE Id = @id');

  return { id: user.Id, username: user.Username, role: user.Role, twoFactorEnabled: !!user.TwoFactorEnabled };
}

// Token phiên ĐẦY ĐỦ (đặt vào cookie, xem requireAdminAuth) — KHÔNG bao giờ
// mang claim "twofa": chỉ token loại này mới qua được requireAdminAuth, xem
// 3 hàm issue*2FA*Token bên dưới cho các bước TRUNG GIAN trước khi tới đây.
function issueToken(user) {
  return jwt.sign({ sub: user.id, username: user.username, role: user.role }, getSecret(), {
    expiresIn: TOKEN_TTL, algorithm: 'HS256', issuer: ISSUER, audience: ISSUER
  });
}

const TWOFA_TOKEN_TTL = '10m';

// Sau khi ĐÚNG mật khẩu, tài khoản Role='admin' ĐÃ bật 2FA — token này KHÔNG
// đặt vào cookie (trả trong JSON, xem routes/admin/auth.js), client tự giữ
// tạm và gửi lại ở body khi gọi POST /admin/2fa/verify. Không dùng được cho
// bất kỳ route /admin/* nào khác — xem requireAdminAuth chặn claim "twofa".
function issuePending2FAToken(user) {
  return jwt.sign({ sub: user.id, username: user.username, twofa: 'pending' }, getSecret(), {
    expiresIn: TWOFA_TOKEN_TTL, algorithm: 'HS256', issuer: ISSUER, audience: ISSUER
  });
}

// Sau khi ĐÚNG mật khẩu nhưng tài khoản Role='admin' CHƯA bật 2FA (bắt buộc)
// — chỉ đủ để gọi POST /admin/2fa/setup + /admin/2fa/confirm, không vào
// được route nào khác cho tới khi hoàn tất đăng ký.
function issueSetupRequiredToken(user) {
  return jwt.sign({ sub: user.id, username: user.username, twofa: 'setupRequired' }, getSecret(), {
    expiresIn: TWOFA_TOKEN_TTL, algorithm: 'HS256', issuer: ISSUER, audience: ISSUER
  });
}

// Mang SECRET (đã mã hoá) trong lúc admin quét QR nhưng CHƯA xác nhận mã đầu
// tiên — tránh phải ghi secret CHƯA XÁC NHẬN vào CSDL (bỏ dở giữa chừng sẽ để
// lại rác); POST /admin/2fa/confirm đọc lại secret từ CHÍNH token này.
function issueEnrollToken(user, secretEncrypted) {
  return jwt.sign({ sub: user.id, username: user.username, twofa: 'enroll', secretEncrypted }, getSecret(), {
    expiresIn: TWOFA_TOKEN_TTL, algorithm: 'HS256', issuer: ISSUER, audience: ISSUER
  });
}

function verifyToken(token) {
  return jwt.verify(token, getSecret(), { algorithms: ['HS256'], issuer: ISSUER, audience: ISSUER });
}

function requireAdminAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try {
    const payload = verifyToken(token);
    // Phòng thủ chiều sâu: cookie phiên ĐẦY ĐỦ không bao giờ được gán 1
    // token có claim "twofa" (routes/admin/auth.js chỉ res.cookie() sau khi
    // qua đủ 2 yếu tố) — dòng này chỉ chặn trường hợp lỗi logic lỡ gán nhầm.
    if (payload.twofa) return res.status(401).json({ error: 'Phiên chưa hoàn tất xác thực hai yếu tố' });
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Phiên đăng nhập hết hạn hoặc không hợp lệ' });
  }
}

// Đặt cookie phiên ĐẦY ĐỦ — dùng chung ở routes/admin/auth.js (đăng nhập
// không cần 2FA) VÀ routes/admin/twoFactor.js (sau khi qua đủ 2 yếu tố),
// tránh lặp lại cấu hình cookie ở 2 nơi dễ lệch nhau.
function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' || process.env.ADMIN_COOKIE_SECURE === 'true',
    maxAge: 8 * 60 * 60 * 1000
  });
}

// Dùng cho routes/admin/twoFactor.js: đọc token TRUNG GIAN từ BODY (không
// phải cookie — chưa đủ tin cậy để đặt vào cookie phiên), chỉ chấp nhận ĐÚNG
// loại "twofa" mong muốn (pending | setupRequired | enroll).
function requireTwoFactorToken(expectedPurpose) {
  return (req, res, next) => {
    const token = req.body?.token;
    if (!token) return res.status(401).json({ error: 'Thiếu token' });
    try {
      const payload = verifyToken(token);
      if (payload.twofa !== expectedPurpose) return res.status(401).json({ error: 'Token không đúng loại hoặc đã hết hạn' });
      req.twoFactorPayload = payload;
      next();
    } catch {
      res.status(401).json({ error: 'Token hết hạn hoặc không hợp lệ' });
    }
  };
}

// Dùng SAU requireAdminAuth trên route chỉ dành cho vai trò 'admin' — 'viewer'
// chỉ xem Dashboard/Log, không sửa được gì.
function requireAdminRole(req, res, next) {
  if (req.admin?.role !== 'admin') {
    return res.status(403).json({ error: 'Chỉ vai trò admin mới thực hiện được thao tác này' });
  }
  next();
}

// Dùng SAU requireAdminAuth trên route "Nhập chỉ tiêu" (routes/admin/salesTargets.js)
// — 'admin' vẫn vào được (không hạ quyền admin đầy đủ), CỘNG THÊM
// 'target_importer' (vai trò hẹp, CHỈ thấy trang này, không thấy
// DataSources/SyncJobs) — 'viewer' không vào được.
function requireTargetImporterRole(req, res, next) {
  if (req.admin?.role !== 'admin' && req.admin?.role !== 'target_importer') {
    return res.status(403).json({ error: 'Chỉ vai trò admin hoặc target_importer mới thực hiện được thao tác này' });
  }
  next();
}

// Dùng SAU requireAdminAuth trên route ĐỌC hạ tầng ETL thật (DataSources/
// SyncJobs/AuditLog/Users...) mà 'target_importer' (vai trò HẸP, CHỈ thấy
// đúng trang "Nhập chỉ tiêu" — etl-admin/src/components/Layout.jsx đã ẩn
// mọi mục khác khỏi menu của vai trò này) KHÔNG được thấy dù gọi thẳng API
// (bỏ qua giao diện) — trước đây các route này chỉ có requireAdminAuth nên
// một tài khoản target_importer vẫn đọc được host/port/username của mọi
// kết nối nguồn + toàn bộ schema đã duyệt, dù giao diện chưa từng cho họ
// nhìn thấy trang đó. 'viewer' vẫn xem được như cũ (chỉ không sửa được gì —
// xem requireAdminRole ở trên) — KHÔNG đổi hành vi của 'viewer'.
function blockTargetImporter(req, res, next) {
  if (req.admin?.role === 'target_importer') {
    return res.status(403).json({ error: 'Vai trò target_importer không có quyền xem mục này' });
  }
  next();
}

// getSecret xuất thêm CHỈ để server.js gọi 1 LẦN lúc khởi động — xem
// chú thích tương tự trong rp-server/lib/auth.js.
module.exports = {
  COOKIE_NAME, verifyCredentials, issueToken, verifyToken,
  requireAdminAuth, requireAdminRole, requireTargetImporterRole, blockTargetImporter, getSecret,
  issuePending2FAToken, issueSetupRequiredToken, issueEnrollToken, requireTwoFactorToken, setSessionCookie
};
