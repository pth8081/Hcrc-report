// routes/webauthn.js — Đăng ký/đăng nhập bằng vân tay/Face ID (WebAuthn,
// bản 8.41, theo yêu cầu người dùng) — THAY THẾ HẲN bước nhập mã 2FA khi
// dùng (không bắt gõ thêm mã 6 số nữa), KHÔNG thay thế mật khẩu (vẫn phải
// gõ mật khẩu trước — WebAuthn ở đây chỉ là CÁCH KHÁC để hoàn tất ĐÚNG
// bước "yếu tố thứ 2" mà tài khoản IsSystemRole đã bắt buộc từ trước, xem
// server.js + routes/twoFactor.js, KHÔNG phải 1 luồng đăng nhập riêng).
//
// WebAuthn gắn chặt vào 1 ORIGIN cụ thể (domain thật đang phục vụ rp-user)
// — BẮT BUỘC khai đúng WEBAUTHN_RP_ID/WEBAUTHN_RP_ORIGIN trong .env trước
// khi dùng được, xem .env.example. Sai domain thì đăng ký/đăng nhập luôn
// báo lỗi "invalid rpID"/"origin mismatch" — KHÔNG phải lỗi code.
//
// 8 route:
//   GET    /devices          — danh sách thiết bị CỦA CHÍNH MÌNH (phiên đầy đủ)
//   DELETE /devices/:id      — gỡ 1 thiết bị CỦA CHÍNH MÌNH
//   POST   /register/options — bắt đầu đăng ký thiết bị mới (phiên đầy đủ)
//   POST   /register/verify  — hoàn tất đăng ký, LƯU credential vào CSDL
//   POST   /login/options    — bắt đầu đăng nhập bằng thiết bị đã đăng ký
//                              (nhận token "pending" như /2fa/verify, CHƯA
//                              có phiên đầy đủ — THAY bước nhập mã 2FA, vẫn
//                              phải gõ ĐÚNG mật khẩu trước)
//   POST   /login/verify     — hoàn tất đăng nhập, đặt cookie phiên đầy đủ
//   POST   /login-by-username/options — bản 8.89 (theo yêu cầu người dùng),
//                              xem chú thích đầy đủ ở nhóm route bên dưới
//   POST   /login-by-username/verify  — THAY THẾ HẲN mật khẩu (không qua
//                              bước gõ mật khẩu/captcha nào) — KHÁC HẲN
//                              /login/options,/login/verify ở trên (đó vẫn
//                              đòi mật khẩu đúng trước, WebAuthn chỉ thay
//                              bước 2FA).
const crypto = require('crypto');
const express = require('express');
const {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse
} = require('@simplewebauthn/server');
const { sql, getPool } = require('../db');
const { requireAuth, requireTwoFactorToken, setSessionCookie, issueToken, isSystemRoleForRateLimit } = require('../lib/auth');
const { isBlocked, recordFailure, recordSuccess, ADMIN_PROFILE, DEFAULT_PROFILE } = require('../lib/loginRateLimit');
const { logAction } = require('../lib/auditLog');

const router = express.Router();

const RP_NAME = process.env.WEBAUTHN_RP_NAME || 'HCRC Report';
const RP_ID = process.env.WEBAUTHN_RP_ID || '';
const ORIGIN = process.env.WEBAUTHN_RP_ORIGIN || '';

function assertConfigured(res) {
  if (!RP_ID || !ORIGIN) {
    res.status(503).json({ error: 'Đăng nhập vân tay/Face ID chưa được cấu hình trên server (thiếu WEBAUTHN_RP_ID/WEBAUTHN_RP_ORIGIN) — liên hệ quản trị hệ thống' });
    return false;
  }
  return true;
}

// Challenge tạm trong bộ nhớ (giống lib/captcha.js, quy mô thật không cần
// CSDL/Redis cho dữ liệu sống vài phút này) — registerChallenges khoá theo
// userId (đã có phiên đầy đủ lúc đăng ký), loginChallenges khoá theo
// CHÍNH token "pending" (chưa có phiên lúc đăng nhập).
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const registerChallenges = new Map(); // userId -> { challenge, expiresAt }
const loginChallenges = new Map(); // token (2FA "pending") -> { challenge, userId, expiresAt }
// Khoá RIÊNG map (bản 8.89) — token ở đây là chuỗi ngẫu nhiên TỰ TẠO
// (crypto.randomUUID()), KHÔNG phải JWT "pending" như loginChallenges ở
// trên (route /login-by-username/* không đòi mật khẩu trước, không có JWT
// trung gian nào để tái dùng) — tách map riêng để KHÔNG BAO GIỜ nhầm lẫn 2
// luồng khác hẳn nhau về bảo mật (1 luồng vẫn đòi mật khẩu đúng trước, 1
// luồng THAY THẾ HẲN mật khẩu).
const passwordlessChallenges = new Map(); // token -> { challenge, userId, username, expiresAt }

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of registerChallenges) if (v.expiresAt < now) registerChallenges.delete(k);
  for (const [k, v] of loginChallenges) if (v.expiresAt < now) loginChallenges.delete(k);
  for (const [k, v] of passwordlessChallenges) if (v.expiresAt < now) passwordlessChallenges.delete(k);
}, 60 * 1000).unref();

async function getUserCredentials(userId) {
  const pool = await getPool('RP');
  const result = await pool.request().input('userId', sql.Int, userId)
    .query('SELECT Id, CredentialId, PublicKeyBase64, Counter, DeviceLabel FROM app.UserWebAuthnCredentials WHERE UserId = @userId');
  return result.recordset;
}

// ===== Quản lý thiết bị (yêu cầu phiên đầy đủ) =====

router.get('/devices', requireAuth, async (req, res, next) => {
  try {
    const rows = await getUserCredentials(req.user.sub);
    res.json(rows.map(r => ({ id: r.Id, label: r.DeviceLabel })));
  } catch (err) { next(err); }
});

router.delete('/devices/:id', requireAuth, async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    await pool.request().input('id', sql.Int, req.params.id).input('userId', sql.Int, req.user.sub)
      .query('DELETE FROM app.UserWebAuthnCredentials WHERE Id = @id AND UserId = @userId');
    await logAction(req, { module: 'Tài khoản', actionType: 'XOA_WEBAUTHN', targetObject: req.params.id, description: 'Gỡ thiết bị vân tay/Face ID' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ===== Đăng ký thiết bị mới =====

router.post('/register/options', requireAuth, async (req, res, next) => {
  try {
    if (!assertConfigured(res)) return;
    const existing = await getUserCredentials(req.user.sub);
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: req.user.username,
      userDisplayName: req.user.username,
      attestationType: 'none',
      excludeCredentials: existing.map(c => ({ id: c.CredentialId })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' }
    });
    registerChallenges.set(req.user.sub, { challenge: options.challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });
    res.json(options);
  } catch (err) { next(err); }
});

router.post('/register/verify', requireAuth, async (req, res, next) => {
  try {
    if (!assertConfigured(res)) return;
    const { response, label } = req.body || {};
    const entry = registerChallenges.get(req.user.sub);
    registerChallenges.delete(req.user.sub); // dùng 1 lần, kể cả khi xác thực sai bên dưới
    if (!entry || entry.expiresAt < Date.now()) return res.status(400).json({ error: 'Phiên đăng ký đã hết hạn, thử lại' });

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response, expectedChallenge: entry.challenge, expectedOrigin: ORIGIN, expectedRPID: RP_ID
      });
    } catch (err) {
      return res.status(400).json({ error: 'Không xác thực được thiết bị: ' + err.message });
    }
    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Không xác thực được thiết bị' });
    }

    const { credential } = verification.registrationInfo;
    const pool = await getPool('RP');
    await pool.request()
      .input('userId', sql.Int, req.user.sub)
      .input('credentialId', sql.VarChar(400), credential.id)
      .input('publicKey', sql.NVarChar(800), Buffer.from(credential.publicKey).toString('base64'))
      .input('counter', sql.BigInt, credential.counter)
      .input('label', sql.NVarChar(200), (label || '').trim() || 'Thiết bị không tên')
      .query(`
        INSERT INTO app.UserWebAuthnCredentials (UserId, CredentialId, PublicKeyBase64, Counter, DeviceLabel)
        VALUES (@userId, @credentialId, @publicKey, @counter, @label)
      `);

    await logAction(req, { module: 'Tài khoản', actionType: 'DANG_KY_WEBAUTHN', description: `Đăng ký thiết bị vân tay/Face ID "${(label || '').trim()}"` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ===== Đăng nhập bằng thiết bị đã đăng ký (thay bước nhập mã 2FA) =====
//
// Nhận token "pending" GIỐNG HỆT /2fa/verify (do POST /api/auth/login cấp
// khi đúng mật khẩu + tài khoản Admin đã bật 2FA) — WebAuthn ở đây là CÁCH
// KHÁC để hoàn tất ĐÚNG bước thứ 2 đó.

router.post('/login/options', requireTwoFactorToken('pending'), async (req, res, next) => {
  try {
    if (!assertConfigured(res)) return;
    const { sub: userId } = req.twoFactorPayload;
    const credentials = await getUserCredentials(userId);
    if (!credentials.length) return res.status(400).json({ error: 'Tài khoản chưa đăng ký thiết bị vân tay/Face ID nào' });

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: credentials.map(c => ({ id: c.CredentialId })),
      userVerification: 'preferred'
    });
    loginChallenges.set(req.body.token, { challenge: options.challenge, userId, expiresAt: Date.now() + CHALLENGE_TTL_MS });
    res.json(options);
  } catch (err) { next(err); }
});

router.post('/login/verify', requireTwoFactorToken('pending'), async (req, res, next) => {
  try {
    if (!assertConfigured(res)) return;
    const { sub: userId, username } = req.twoFactorPayload;
    const { response } = req.body || {};

    // Dùng CHUNG bộ đếm sai với /2fa/verify (namespace "2fa:<username>",
    // xem routes/twoFactor.js) — cả 2 đều là "sai ở bước yếu tố thứ 2",
    // không nên tách riêng (dễ bị lách bằng cách đổi qua lại 2 cách).
    const rateLimitKey = `2fa:${username}`;
    const retryAfter = isBlocked(req.ip, rateLimitKey, ADMIN_PROFILE);
    if (retryAfter) {
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Nhập sai quá nhiều lần, thử lại sau ít phút' });
    }

    const entry = loginChallenges.get(req.body.token);
    loginChallenges.delete(req.body.token); // dùng 1 lần
    if (!entry || entry.expiresAt < Date.now() || entry.userId !== userId) {
      return res.status(400).json({ error: 'Phiên đăng nhập vân tay/Face ID đã hết hạn, thử lại' });
    }

    const credentials = await getUserCredentials(userId);
    const matched = credentials.find((c) => c.CredentialId === response?.id);
    if (!matched) {
      recordFailure(req.ip, rateLimitKey, ADMIN_PROFILE);
      return res.status(400).json({ error: 'Không nhận diện được thiết bị này' });
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: entry.challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential: {
          id: matched.CredentialId,
          publicKey: Buffer.from(matched.PublicKeyBase64, 'base64'),
          counter: matched.Counter
        }
      });
    } catch (err) {
      recordFailure(req.ip, rateLimitKey, ADMIN_PROFILE);
      return res.status(400).json({ error: 'Xác thực vân tay/Face ID thất bại: ' + err.message });
    }
    if (!verification.verified) {
      recordFailure(req.ip, rateLimitKey, ADMIN_PROFILE);
      return res.status(400).json({ error: 'Xác thực vân tay/Face ID thất bại' });
    }
    recordSuccess(req.ip, rateLimitKey);

    const pool = await getPool('RP');
    await pool.request().input('id', sql.Int, matched.Id).input('counter', sql.BigInt, verification.authenticationInfo.newCounter)
      .query('UPDATE app.UserWebAuthnCredentials SET Counter = @counter, LastUsedAt = SYSUTCDATETIME() WHERE Id = @id');

    await logAction({ ip: req.ip, user: { sub: userId, username } }, {
      module: 'Đăng nhập', actionType: 'DANG_NHAP', description: `Đăng nhập thành công (vân tay/Face ID, thiết bị "${matched.DeviceLabel}")`
    });
    setSessionCookie(res, issueToken({ id: userId, username }));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ===== Đăng nhập THẲNG bằng vân tay/Face ID — THAY THẾ HẲN mật khẩu =====
//
// Bản 8.89 (theo yêu cầu người dùng, gửi kèm ảnh 1 app khác minh hoạ: nhớ
// sẵn tên đăng nhập, bấm vân tay ngay ở MÀN HÌNH ĐẦU là vào thẳng, không gõ
// gì thêm) — KHÁC HẲN 2 route /login/options,/login/verify ở trên (đó vẫn
// bắt buộc gõ ĐÚNG mật khẩu trước, WebAuthn chỉ thay bước NHẬP MÃ 2FA sau
// đó). Ở ĐÂY, thiết bị vân tay/Face ID đã đăng ký (trang "Tài khoản của
// tôi") coi như ĐỦ MẠNH để làm yếu tố xác thực DUY NHẤT — không đòi thêm
// mật khẩu/captcha/mã 2FA nào nữa, kể cả tài khoản Admin hệ thống
// (IsSystemRole, bình thường bắt buộc 2FA) — cùng tinh thần "passkey đăng
// nhập thẳng" nhiều hệ thống lớn (Google/Microsoft/GitHub) đã áp dụng: khoá
// riêng tư (private key) CHỈ nằm trong chip bảo mật của ĐÚNG thiết bị đã
// đăng ký + mở khoá bằng sinh trắc học = tương đương "có thiết bị" + "đúng
// là bạn", đủ 2 yếu tố trong 1 thao tác.
//
// Chống DÒ TÊN ĐĂNG NHẬP (username enumeration): route /options KHÔNG BAO
// GIỜ trả lời khác nhau giữa "username không tồn tại"/"username tồn tại
// nhưng chưa đăng ký thiết bị nào" — luôn trả về 1 bộ "options" hợp lệ
// (allowCredentials RỖNG nếu không tìm thấy gì thật), KHÔNG trả lỗi/mã
// trạng thái khác biệt. An toàn thật sự nằm ở bước /verify bên dưới: LUÔN
// đối chiếu lại credential vừa xác thực có thuộc ĐÚNG userId đã khoá cứng
// lúc tạo challenge hay không — "allowCredentials rỗng" nhiều nhất chỉ
// khiến trình duyệt cho chọn 1 credential KHÁC của người khác đã từng dùng
// chung máy, verify() vẫn từ chối thẳng vì credential đó không thuộc đúng
// userId mong đợi.
async function findUserForPasswordless(username) {
  if (!username) return null;
  const pool = await getPool('RP');
  const result = await pool.request().input('username', sql.NVarChar(50), username)
    .query('SELECT Id, Username, IsActive FROM app.Users WHERE Username = @username');
  const user = result.recordset[0];
  return user && user.IsActive ? user : null;
}

router.post('/login-by-username/options', async (req, res, next) => {
  try {
    if (!assertConfigured(res)) return;
    const { username } = req.body || {};
    const user = await findUserForPasswordless(username);
    const credentials = user ? await getUserCredentials(user.Id) : [];

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: credentials.map(c => ({ id: c.CredentialId })),
      userVerification: 'preferred'
    });
    const token = crypto.randomUUID();
    passwordlessChallenges.set(token, {
      challenge: options.challenge,
      userId: user ? user.Id : null,
      username: user ? user.Username : null,
      expiresAt: Date.now() + CHALLENGE_TTL_MS
    });
    res.json({ ...options, token });
  } catch (err) { next(err); }
});

router.post('/login-by-username/verify', async (req, res, next) => {
  try {
    if (!assertConfigured(res)) return;
    const { token, response } = req.body || {};

    const entry = passwordlessChallenges.get(token);
    passwordlessChallenges.delete(token); // dùng 1 lần, kể cả sai
    // entry.userId rỗng (username không tồn tại/chưa active lúc /options)
    // -> từ chối NGAY, không tốn công verify chữ ký làm gì (không có
    // credential thật nào để so khớp).
    if (!entry || entry.expiresAt < Date.now() || !entry.userId) {
      return res.status(400).json({ error: 'Không nhận diện được thiết bị này, hoặc phiên đã hết hạn — thử lại' });
    }
    const { userId, username } = entry;

    // Rate limit DÙNG CHUNG namespace với đăng nhập mật khẩu thường (KHÔNG
    // phải "2fa:username" như /login/verify ở trên) — route NÀY LÀ đăng
    // nhập CHÍNH, không phải bước yếu tố thứ 2 sau mật khẩu.
    const isSystemRole = await isSystemRoleForRateLimit(username);
    const profile = isSystemRole ? ADMIN_PROFILE : DEFAULT_PROFILE;
    const retryAfter = isBlocked(req.ip, username, profile);
    if (retryAfter) {
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Thử lại quá nhiều lần, thử lại sau ít phút' });
    }

    const credentials = await getUserCredentials(userId);
    const matched = credentials.find((c) => c.CredentialId === response?.id);
    if (!matched) {
      recordFailure(req.ip, username, profile);
      return res.status(400).json({ error: 'Không nhận diện được thiết bị này' });
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: entry.challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential: {
          id: matched.CredentialId,
          publicKey: Buffer.from(matched.PublicKeyBase64, 'base64'),
          counter: matched.Counter
        }
      });
    } catch (err) {
      recordFailure(req.ip, username, profile);
      return res.status(400).json({ error: 'Xác thực vân tay/Face ID thất bại: ' + err.message });
    }
    if (!verification.verified) {
      recordFailure(req.ip, username, profile);
      return res.status(400).json({ error: 'Xác thực vân tay/Face ID thất bại' });
    }
    recordSuccess(req.ip, username);

    const pool = await getPool('RP');
    await pool.request().input('id', sql.Int, matched.Id).input('counter', sql.BigInt, verification.authenticationInfo.newCounter)
      .query('UPDATE app.UserWebAuthnCredentials SET Counter = @counter, LastUsedAt = SYSUTCDATETIME() WHERE Id = @id');

    await logAction({ ip: req.ip, user: { sub: userId, username } }, {
      module: 'Đăng nhập', actionType: 'DANG_NHAP', description: `Đăng nhập thành công (vân tay/Face ID, thiết bị "${matched.DeviceLabel}" — không cần mật khẩu)`
    });
    setSessionCookie(res, issueToken({ id: userId, username }));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
