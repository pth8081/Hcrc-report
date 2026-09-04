// lib/auth.js — Xác thực JWT qua cookie httpOnly, đối chiếu app.Users (bcrypt).
// JWT CHỈ chứa { sub: userId, username } — KHÔNG nhúng quyền vào token, vì
// nhúng sẵn quyền chỉ có hiệu lực đổi sau khi đăng nhập lại (xem tài liệu
// kiến trúc, mục 07). requireAuth() chỉ xác thực danh tính; kiểm tra menu/
// báo cáo do requireMenuAccess()/lib/permissions.js đảm nhiệm riêng.
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../db');
const { getUserContext } = require('./permissions');
const { verifyPassword: verifyHcrcWorkspacePassword } = require('./hcrcWorkspaceClient');
const { isSessionRevoked } = require('./sessionRevocation');

const COOKIE_NAME = 'hcrc_rp_token';
const TOKEN_TTL = '2h';
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

// "Trượt phiên" (sliding session): còn dưới 30 phút là hết hạn thì tự phát
// hành token MỚI (TTL lại đủ 2h) ngay trong requireAuth() — admin còn thao
// tác (còn gọi API) thì không bao giờ bị văng ra giữa chừng, nhưng NGỪNG
// thao tác quá 2h liên tục (không request nào lọt threshold này) thì token
// cũ tự hết hạn như bình thường, phải đăng nhập lại — cách này đổi
// "TTL tuyệt đối tính từ lúc đăng nhập" (rủi ro: đang làm việc bị văng giữa
// chừng) thành "TTL tính từ lần hoạt động GẦN NHẤT" mà KHÔNG cần thêm cơ chế
// refresh-token/endpoint riêng — mọi route đã đi qua requireAuth() đều tự
// động được hưởng.
const REFRESH_THRESHOLD_SECONDS = 30 * 60;

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

// AuthSource='local' (mặc định, hành vi cũ) -> so PasswordHash tại đây.
// AuthSource='hcrcWorkspace' -> KHÔNG có PasswordHash local, gọi
// lib/hcrcWorkspaceClient.js MỖI LẦN đăng nhập — lỗi mạng/timeout/HTTP lỗi
// từ đó ném err.isServiceUnavailable=true, NÉM TIẾP ra ngoài (khác "sai mật
// khẩu" — trả null) để server.js trả 503 riêng, không lẫn với "sai mật
// khẩu" (tránh gây hiểu lầm đổi mật khẩu vô ích khi lỗi thật ở dịch vụ
// ngoài). Vai trò Admin (IsSystemRole) LUÔN bị ép AuthSource='local' lúc gán
// vai trò (xem routes/users.js) — không phụ thuộc uptime HCRC Workspace để
// đăng nhập được admin.
async function verifyCredentials(username, password) {
  if (!username || !password) return null;
  const pool = await getPool('RP');
  const result = await pool.request()
    .input('username', sql.NVarChar(50), username)
    .query('SELECT Id, Username, PasswordHash, AuthSource, IsActive, TwoFactorEnabled FROM app.Users WHERE Username = @username');
  const user = result.recordset[0];
  if (!user || !user.IsActive) {
    await bcrypt.compare(password, DUMMY_HASH);
    return null;
  }

  let ok;
  if (user.AuthSource === 'hcrcWorkspace') {
    ok = await verifyHcrcWorkspacePassword(user.Username, password);
  } else {
    ok = await bcrypt.compare(password, user.PasswordHash || DUMMY_HASH);
  }
  if (!ok) return null;

  await pool.request()
    .input('id', sql.Int, user.Id)
    .query('UPDATE app.Users SET LastLoginAt = SYSUTCDATETIME() WHERE Id = @id');

  return { id: user.Id, username: user.Username, twoFactorEnabled: !!user.TwoFactorEnabled };
}

// Tra xem 1 username có vai trò IsSystemRole=1 hay không, TRƯỚC khi kiểm
// tra/ghi nhận giới hạn đăng nhập sai liên tiếp (xem lib/loginRateLimit.js)
// — để chọn đúng "profile" ngưỡng (tài khoản hệ thống được nới lỏng hơn
// user thường). CHỈ đọc vai trò, KHÔNG so mật khẩu — không phải bước xác
// thực, chỉ để phân loại ngưỡng. Trả về false nếu username không tồn tại
// (rơi vào profile ngưỡng CHẶT mặc định, đúng ý).
async function isSystemRoleForRateLimit(username) {
  if (!username) return false;
  const pool = await getPool('RP');
  const result = await pool.request().input('username', sql.NVarChar(50), username).query(`
    SELECT TOP 1 r.IsSystemRole
    FROM app.Users u
    JOIN app.UserRoles ur ON ur.UserId = u.Id
    JOIN app.Roles r ON r.Id = ur.RoleId
    WHERE u.Username = @username AND r.IsSystemRole = 1
  `);
  return result.recordset.length > 0;
}

// Token phiên ĐẦY ĐỦ (đặt vào cookie, xem requireAuth) — KHÔNG bao giờ mang
// claim "twofa": chỉ token loại này mới qua được requireAuth, xem 3 hàm
// issue*2FA*Token bên dưới cho các bước TRUNG GIAN trước khi tới đây.
function issueToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, getSecret(), {
    expiresIn: TOKEN_TTL, algorithm: 'HS256', issuer: ISSUER, audience: ISSUER
  });
}

const TWOFA_TOKEN_TTL = '10m';

// Sau khi ĐÚNG mật khẩu, tài khoản có vai trò IsSystemRole=1 ("Admin") ĐÃ bật
// 2FA — token này KHÔNG đặt vào cookie (trả trong JSON, xem server.js), client
// tự giữ tạm và gửi lại ở body khi gọi POST /api/2fa/verify. Không dùng được
// cho bất kỳ route /api/* nào khác — xem requireAuth chặn claim "twofa".
function issuePending2FAToken(user) {
  return jwt.sign({ sub: user.id, username: user.username, twofa: 'pending' }, getSecret(), {
    expiresIn: TWOFA_TOKEN_TTL, algorithm: 'HS256', issuer: ISSUER, audience: ISSUER
  });
}

// Sau khi ĐÚNG mật khẩu nhưng tài khoản Admin CHƯA bật 2FA (bắt buộc) — chỉ
// đủ để gọi POST /api/2fa/setup + /api/2fa/confirm, không vào được route
// nào khác cho tới khi hoàn tất đăng ký.
function issueSetupRequiredToken(user) {
  return jwt.sign({ sub: user.id, username: user.username, twofa: 'setupRequired' }, getSecret(), {
    expiresIn: TWOFA_TOKEN_TTL, algorithm: 'HS256', issuer: ISSUER, audience: ISSUER
  });
}

// Mang SECRET (đã mã hoá) trong lúc admin quét QR nhưng CHƯA xác nhận mã đầu
// tiên — tránh phải ghi secret CHƯA XÁC NHẬN vào CSDL (bỏ dở giữa chừng sẽ để
// lại rác); POST /api/2fa/confirm đọc lại secret từ CHÍNH token này.
function issueEnrollToken(user, secretEncrypted) {
  return jwt.sign({ sub: user.id, username: user.username, twofa: 'enroll', secretEncrypted }, getSecret(), {
    expiresIn: TWOFA_TOKEN_TTL, algorithm: 'HS256', issuer: ISSUER, audience: ISSUER
  });
}

function verifyToken(token) {
  return jwt.verify(token, getSecret(), { algorithms: ['HS256'], issuer: ISSUER, audience: ISSUER });
}

// Gọi SAU khi payload đã qua verify chữ ký + isSessionRevoked (không trượt
// phiên cho token sắp bị coi là thu hồi) — payload.role không tồn tại ở
// service này (rp-server không nhúng role vào token, xem đầu file), issueToken
// chỉ đọc id/username nên bỏ qua an toàn.
function maybeSlideSession(payload, res) {
  if (typeof payload.exp !== 'number') return;
  const secondsLeft = payload.exp - Math.floor(Date.now() / 1000);
  if (secondsLeft > REFRESH_THRESHOLD_SECONDS) return;
  const fresh = issueToken({ id: payload.sub, username: payload.username });
  setSessionCookie(res, fresh);
}

async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ error: 'Phiên đăng nhập hết hạn hoặc không hợp lệ' });
  }
  // Phòng thủ chiều sâu: cookie phiên ĐẦY ĐỦ không bao giờ được gán 1
  // token có claim "twofa" (server.js chỉ res.cookie() sau khi qua đủ 2
  // yếu tố) — dòng này chỉ chặn trường hợp lỗi logic lỡ gán nhầm.
  if (payload.twofa) return res.status(401).json({ error: 'Phiên chưa hoàn tất xác thực hai yếu tố' });
  try {
    // Thu hồi phiên khi đổi mật khẩu/gỡ 2FA/đổi vai trò/khoá tài khoản —
    // JWT verify chữ ký xong không tự biết những thay đổi này, xem
    // lib/sessionRevocation.js.
    if (await isSessionRevoked(payload.sub, payload.iat)) {
      return res.status(401).json({ error: 'Phiên đăng nhập đã bị thu hồi (đổi mật khẩu/2FA/vai trò, hoặc tài khoản bị khoá) — đăng nhập lại' });
    }
  } catch (err) { return next(err); }
  maybeSlideSession(payload, res);
  req.user = payload;
  next();
}

// Đặt cookie phiên ĐẦY ĐỦ — dùng chung ở server.js (đăng nhập không cần
// 2FA) VÀ routes/twoFactor.js (sau khi qua đủ 2 yếu tố), tránh lặp lại cấu
// hình cookie ở 2 nơi dễ lệch nhau.
function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
    maxAge: TOKEN_TTL_MS
  });
}

// Dùng cho routes/twoFactor.js: đọc token TRUNG GIAN từ BODY (không phải
// cookie — chưa đủ tin cậy để đặt vào cookie phiên), chỉ chấp nhận ĐÚNG loại
// "twofa" mong muốn (pending | setupRequired | enroll).
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

// Dùng SAU requireAuth trên thao tác NHẠY CẢM — chặt hơn requireMenuAccess:
// menu 'system-permissions' có thể được cấp cho vai trò KHÔNG phải Admin
// (delegation hợp lệ, vd để 1 người quản lý gán quyền BÁO CÁO cho nhóm mình
// mà không cần là Admin hệ thống). Nhưng cấp quyền MENU/VAI TRÒ tuỳ ý (kể cả
// menu 'system-*' khác) lại chính là con đường leo thang: 1 tài khoản chỉ có
// menu 'system-permissions' (không IsSystemRole, KHÔNG bị bắt buộc 2FA — xem
// server.js) có thể tự tạo vai trò, tự gán menu nhạy cảm cho vai trò đó, rồi
// tự gán vai trò đó cho chính mình — coi như chiếm toàn quyền hệ thống mà
// không bao giờ qua 2FA. requireSystemRoleActor CHỈ cho phép vai trò
// IsSystemRole=1 thật sự thực hiện — dùng cho PUT :id/menu-access,
// PUT :id/report-access (routes/roles.js) và PUT :id/roles (routes/users.js).
function requireSystemRoleActor(req, res, next) {
  getUserContext(req.user.sub)
    .then(context => {
      if (!context?.isSystemRole) return res.status(403).json({ error: 'Chỉ vai trò Admin (hệ thống) mới thực hiện được thao tác này' });
      next();
    })
    .catch(next);
}

module.exports = {
  COOKIE_NAME,
  TOKEN_TTL,
  verifyCredentials,
  isSystemRoleForRateLimit,
  issueToken,
  verifyToken,
  requireSystemRoleActor,
  requireAuth,
  requireMenuAccess,
  issuePending2FAToken,
  issueSetupRequiredToken,
  issueEnrollToken,
  requireTwoFactorToken,
  setSessionCookie,
  // Xuất thêm CHỈ để server.js gọi 1 LẦN lúc khởi động (kiểm tra secret
  // không còn là giá trị mẫu) — "LỖI NGAY lúc khởi động" thay vì chỉ lộ ra
  // ở lượt đăng nhập/xác thực JWT đầu tiên, xem chú thích trong server.js.
  getSecret
};
