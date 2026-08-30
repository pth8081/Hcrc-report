const express = require('express');
const { verifyCredentials, issueToken, requireAdminAuth, COOKIE_NAME } = require('../../lib/adminAuth');
const { isBlocked, recordFailure, recordSuccess } = require('../../lib/loginRateLimit');
const { logAction } = require('../../lib/auditLog');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};

    const retryAfter = isBlocked(req.ip, username);
    if (retryAfter) {
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Đăng nhập sai quá nhiều lần, thử lại sau ít phút' });
    }

    const admin = await verifyCredentials(username, password);
    if (!admin) {
      recordFailure(req.ip, username);
      // req.admin chưa có (chưa xác thực) -> tự ghép object tối thiểu cho logAction
      // (chỉ đọc req.ip + req.admin.username), giữ đúng tên ĐÃ GÕ dù sai/không tồn tại.
      await logAction({ ip: req.ip, admin: { username: username || 'unknown' } }, {
        module: 'Đăng nhập', actionType: 'DANG_NHAP_THAT_BAI', description: `Đăng nhập thất bại: "${username || ''}"`, status: 'FAILED'
      });
      return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
    }
    recordSuccess(req.ip, username);
    await logAction({ ip: req.ip, admin: { sub: admin.id, username: admin.username } }, {
      module: 'Đăng nhập', actionType: 'DANG_NHAP', description: 'Đăng nhập thành công'
    });

    const token = issueToken(admin);
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      // Luôn bật ở production, KỂ CẢ khi quên đặt ADMIN_COOKIE_SECURE trong
      // .env — tránh bẫy cấu hình gửi cookie phiên qua HTTP thường.
      secure: process.env.NODE_ENV === 'production' || process.env.ADMIN_COOKIE_SECURE === 'true',
      maxAge: 8 * 60 * 60 * 1000
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

router.get('/me', requireAdminAuth, (req, res) => {
  res.json({ username: req.admin.username, role: req.admin.role });
});

module.exports = router;
