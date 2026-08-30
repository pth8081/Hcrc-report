const express = require('express');
const { verifyCredentials, issueToken, requireAdminAuth, COOKIE_NAME } = require('../../lib/adminAuth');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    const admin = await verifyCredentials(username, password);
    if (!admin) return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });

    const token = issueToken(admin);
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.ADMIN_COOKIE_SECURE === 'true',
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
