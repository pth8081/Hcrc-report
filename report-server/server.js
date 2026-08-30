// server.js — Điểm khởi chạy Report Server. Chỉ đọc Data Warehouse (db.js),
// không bao giờ ghi — và không bao giờ gọi thẳng vào CSDL nghiệp vụ nguồn.
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const { rateLimit } = require('express-rate-limit');

const healthRoutes = require('./routes/health');
const reportRoutes = require('./routes/reports');
const { verifyCredentials, issueToken, COOKIE_NAME } = require('./lib/auth');

const app = express();
const PORT = process.env.PORT || 4001;

app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.use(rateLimit({
  windowMs: 60 * 1000,
  limit: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '300', 10),
  standardHeaders: true,
  legacyHeaders: false
}));

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    const ok = await verifyCredentials(username, password);
    if (!ok) return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });

    const token = issueToken(username);
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === 'true',
      maxAge: 8 * 60 * 60 * 1000
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.use('/api/health', healthRoutes);
app.use('/api/reports', reportRoutes);

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({ error: 'Lỗi máy chủ' });
});

app.listen(PORT, () => console.log(`Report Server đang chạy ở cổng ${PORT}`));
