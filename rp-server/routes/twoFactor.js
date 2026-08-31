// routes/twoFactor.js — Đăng ký/Xác thực hai yếu tố (2FA/TOTP) cho user có
// vai trò IsSystemRole=1 ("Admin", xem lib/permissions.js) — BẮT BUỘC, xem
// lib/twoFactor.js + server.js (luồng đăng nhập chèn bước này trước khi tới
// đây). 3 endpoint:
//   POST /setup   — token "setupRequired" (đăng ký lần đầu, bắt buộc) HOẶC
//                   phiên đầy đủ + mã hiện tại (đổi thiết bị) -> sinh secret
//                   mới, trả QR + token "enroll" mang secret đã mã hoá
//                   (CHƯA lưu CSDL — tránh để lại secret rác nếu bỏ dở).
//   POST /confirm — token "enroll" + mã 6 số đầu tiên -> xác nhận đúng, LƯU
//                   secret + bật 2FA + sinh 10 mã khôi phục (hiện đúng 1
//                   lần) + đăng nhập luôn (đặt cookie phiên đầy đủ).
//   POST /verify  — token "pending" (đã bật 2FA từ trước) + mã 6 số hoặc mã
//                   khôi phục -> đặt cookie phiên đầy đủ.
const express = require('express');
const { sql, getPool } = require('../db');
const {
  COOKIE_NAME, verifyToken, requireTwoFactorToken, issueEnrollToken, issueToken, setSessionCookie
} = require('../lib/auth');
const {
  newSecret, encryptSecret, qrDataUrl, verifyTotp,
  generateRecoveryCodes, hashRecoveryCodes, verifyRecoveryCode
} = require('../lib/twoFactor');
const { isBlocked, recordFailure, recordSuccess } = require('../lib/loginRateLimit');
const { logAction } = require('../lib/auditLog');

const router = express.Router();

router.post('/setup', async (req, res, next) => {
  try {
    let userId, username;

    if (req.body?.token) {
      // Đăng ký lần đầu — token "setupRequired" do bước đăng nhập cấp.
      let payload;
      try { payload = verifyToken(req.body.token); } catch { return res.status(401).json({ error: 'Token hết hạn hoặc không hợp lệ' }); }
      if (payload.twofa !== 'setupRequired') return res.status(401).json({ error: 'Token không đúng loại hoặc đã hết hạn' });
      userId = payload.sub; username = payload.username;
    } else {
      // Đổi thiết bị — đòi phiên đầy đủ (đã đăng nhập, đã bật 2FA từ trước)
      // + mã hiện tại, chứng minh vẫn còn kiểm soát thiết bị cũ.
      const cookieToken = req.cookies?.[COOKIE_NAME];
      if (!cookieToken) return res.status(401).json({ error: 'Chưa đăng nhập' });
      let payload;
      try { payload = verifyToken(cookieToken); } catch { return res.status(401).json({ error: 'Phiên đăng nhập hết hạn hoặc không hợp lệ' }); }
      if (payload.twofa) return res.status(401).json({ error: 'Phiên chưa hoàn tất xác thực hai yếu tố' });
      userId = payload.sub; username = payload.username;

      const pool = await getPool('RP');
      const result = await pool.request().input('id', sql.Int, userId)
        .query('SELECT TwoFactorEnabled, TwoFactorSecretEncrypted FROM app.Users WHERE Id = @id');
      const row = result.recordset[0];
      if (!row?.TwoFactorEnabled) return res.status(400).json({ error: 'Tài khoản chưa bật 2FA — đăng xuất rồi đăng nhập lại để đăng ký lần đầu' });
      const ok = await verifyTotp(userId, row.TwoFactorSecretEncrypted, req.body?.currentCode);
      if (!ok) return res.status(401).json({ error: 'Mã xác thực hiện tại không đúng' });
    }

    const secret = newSecret();
    const qr = await qrDataUrl(secret, username);
    const enrollToken = issueEnrollToken({ id: userId, username }, encryptSecret(secret));
    res.json({ qrDataUrl: qr, secret, token: enrollToken });
  } catch (err) { next(err); }
});

router.post('/confirm', requireTwoFactorToken('enroll'), async (req, res, next) => {
  try {
    const { sub: userId, username, secretEncrypted } = req.twoFactorPayload;
    const ok = await verifyTotp(userId, secretEncrypted, req.body?.code);
    if (!ok) return res.status(401).json({ error: 'Mã xác thực không đúng' });

    const pool = await getPool('RP');
    await pool.request()
      .input('id', sql.Int, userId)
      .input('secret', sql.NVarChar(500), secretEncrypted)
      .query(`
        UPDATE app.Users
        SET TwoFactorSecretEncrypted = @secret, TwoFactorEnabled = 1, TwoFactorEnrolledAt = SYSUTCDATETIME()
        WHERE Id = @id
      `);

    const recoveryCodes = generateRecoveryCodes();
    const hashes = await hashRecoveryCodes(recoveryCodes);
    await pool.request().input('id', sql.Int, userId).query('DELETE FROM app.UserTwoFactorRecoveryCodes WHERE UserId = @id');
    for (const hash of hashes) {
      await pool.request().input('id', sql.Int, userId).input('hash', sql.Char(60), hash)
        .query('INSERT INTO app.UserTwoFactorRecoveryCodes (UserId, CodeHash) VALUES (@id, @hash)');
    }

    await logAction({ ip: req.ip, user: { sub: userId, username } }, {
      module: 'Đăng nhập', actionType: 'BAT_2FA', description: 'Bật xác thực hai yếu tố thành công'
    });

    setSessionCookie(res, issueToken({ id: userId, username }));
    res.json({ ok: true, recoveryCodes });
  } catch (err) { next(err); }
});

router.post('/verify', requireTwoFactorToken('pending'), async (req, res, next) => {
  try {
    const { sub: userId, username } = req.twoFactorPayload;
    const { code, recoveryCode } = req.body || {};

    // Namespace RIÊNG "2fa:<username>" trong cùng bộ đếm login — không trộn
    // với số lần sai MẬT KHẨU của chính tài khoản đó (2 bước khác nhau).
    const rateLimitKey = `2fa:${username}`;
    const retryAfter = isBlocked(req.ip, rateLimitKey);
    if (retryAfter) {
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Nhập sai quá nhiều lần, thử lại sau ít phút' });
    }

    const pool = await getPool('RP');
    const userResult = await pool.request().input('id', sql.Int, userId)
      .query('SELECT TwoFactorSecretEncrypted FROM app.Users WHERE Id = @id AND IsActive = 1');
    const row = userResult.recordset[0];
    if (!row) return res.status(401).json({ error: 'Tài khoản không còn hoạt động' });

    let ok = false;
    if (code) {
      ok = await verifyTotp(userId, row.TwoFactorSecretEncrypted, code);
    } else if (recoveryCode) {
      const codesResult = await pool.request().input('id', sql.Int, userId)
        .query('SELECT Id, CodeHash FROM app.UserTwoFactorRecoveryCodes WHERE UserId = @id AND UsedAt IS NULL');
      const matchedId = await verifyRecoveryCode(recoveryCode, codesResult.recordset.map(r => ({ id: r.Id, codeHash: r.CodeHash })));
      if (matchedId) {
        await pool.request().input('rowId', sql.Int, matchedId)
          .query('UPDATE app.UserTwoFactorRecoveryCodes SET UsedAt = SYSUTCDATETIME() WHERE Id = @rowId');
        ok = true;
      }
    }

    if (!ok) {
      recordFailure(req.ip, rateLimitKey);
      await logAction({ ip: req.ip, user: { sub: userId, username } }, {
        module: 'Đăng nhập', actionType: 'DANG_NHAP_THAT_BAI', description: 'Sai mã xác thực hai yếu tố', status: 'FAILED'
      });
      return res.status(401).json({ error: 'Mã xác thực không đúng' });
    }
    recordSuccess(req.ip, rateLimitKey);

    await logAction({ ip: req.ip, user: { sub: userId, username } }, {
      module: 'Đăng nhập', actionType: 'DANG_NHAP', description: 'Đăng nhập thành công (2FA)'
    });
    setSessionCookie(res, issueToken({ id: userId, username }));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
