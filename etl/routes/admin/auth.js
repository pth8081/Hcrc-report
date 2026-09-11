const express = require('express');
const {
  verifyCredentials, issueToken, requireAdminAuth, COOKIE_NAME, setSessionCookie,
  issuePending2FAToken, issueSetupRequiredToken
} = require('../../lib/adminAuth');
const { getAdminContext, isSystemRoleForRateLimit } = require('../../lib/adminPermissions');
const { isBlocked, recordFailure, recordSuccess, DEFAULT_PROFILE, ADMIN_PROFILE } = require('../../lib/loginRateLimit');
const { logAction } = require('../../lib/auditLog');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};

    // Tra "có vai trò hệ thống không" TRƯỚC (không so mật khẩu) để chọn đúng
    // ngưỡng — vai trò hệ thống dùng ADMIN_PROFILE (nới lỏng hơn, xem chú
    // thích lib/loginRateLimit.js), username không tồn tại/vai trò khác dùng
    // DEFAULT_PROFILE (ngưỡng chặt như cũ).
    const isSystemRole = await isSystemRoleForRateLimit(username);
    const profile = isSystemRole ? ADMIN_PROFILE : DEFAULT_PROFILE;

    const retryAfter = isBlocked(req.ip, username, profile);
    if (retryAfter) {
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Đăng nhập sai quá nhiều lần, thử lại sau ít phút' });
    }

    const admin = await verifyCredentials(username, password);
    if (!admin) {
      recordFailure(req.ip, username, profile);
      // req.admin chưa có (chưa xác thực) -> tự ghép object tối thiểu cho logAction
      // (chỉ đọc req.ip + req.admin.username), giữ đúng tên ĐÃ GÕ dù sai/không tồn tại.
      await logAction({ ip: req.ip, admin: { username: username || 'unknown' } }, {
        module: 'Đăng nhập', actionType: 'DANG_NHAP_THAT_BAI', description: `Đăng nhập thất bại: "${username || ''}"`, status: 'FAILED'
      });
      return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
    }
    recordSuccess(req.ip, username);

    // 2FA BẮT BUỘC cho vai trò HỆ THỐNG (IsSystemRole, xem lib/adminPermissions.js
    // — thay kiểm tra Role='admin' cố định trước đây) — vai trò khác KHÔNG
    // áp dụng, đăng nhập xong ngay như trước đây. Đúng mật khẩu nhưng CHƯA
    // qua đủ 2 yếu tố -> KHÔNG đặt cookie phiên đầy đủ, chỉ trả token trung gian.
    const context = await getAdminContext(admin.id);
    if (context?.isSystemRole) {
      await logAction({ ip: req.ip, admin: { sub: admin.id, username: admin.username } }, {
        module: 'Đăng nhập', actionType: 'DANG_NHAP_CHO_2FA',
        description: admin.twoFactorEnabled ? 'Đúng mật khẩu, chờ xác thực hai yếu tố' : 'Đúng mật khẩu, chưa bật 2FA — bắt buộc đăng ký trước khi vào hệ thống'
      });
      if (admin.twoFactorEnabled) {
        return res.json({ twofa: 'pending', token: issuePending2FAToken(admin) });
      }
      return res.json({ twofa: 'setupRequired', token: issueSetupRequiredToken(admin) });
    }

    await logAction({ ip: req.ip, admin: { sub: admin.id, username: admin.username } }, {
      module: 'Đăng nhập', actionType: 'DANG_NHAP', description: 'Đăng nhập thành công'
    });
    setSessionCookie(res, issueToken(admin));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

router.get('/me', requireAdminAuth, async (req, res, next) => {
  try {
    const context = await getAdminContext(req.admin.sub);
    if (!context) return res.status(401).json({ error: 'Tài khoản không còn hoạt động' });
    res.json({
      username: req.admin.username,
      isSystemRole: context.isSystemRole,
      menuAccess: Object.fromEntries(context.menuAccess)
    });
  } catch (err) { next(err); }
});

module.exports = router;
