// server.js — Điểm khởi chạy Report Server. Hai pool tĩnh (RP, DWH — xem
// db.js) + pool động cho nguồn dữ liệu bổ sung (lib/dataSourcePool.js).
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const { rateLimit } = require('express-rate-limit');

const healthRoutes = require('./routes/health');
const meRoutes = require('./routes/me');
const reportRoutes = require('./routes/reports');
const usersRoutes = require('./routes/users');
const rolesRoutes = require('./routes/roles');
const menuItemsRoutes = require('./routes/menuItems');
const categoriesRoutes = require('./routes/categories');
const emailSettingsRoutes = require('./routes/emailSettings');
const auditLogRoutes = require('./routes/auditLog');
const reportCatalogRoutes = require('./routes/reportCatalog');
const dataSourcesRoutes = require('./routes/dataSources');
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
    const user = await verifyCredentials(username, password);
    if (!user) return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });

    const token = issueToken(user);
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
app.use('/api/me', meRoutes);
app.use('/api/reports', reportRoutes);

// "Hệ thống" — mỗi route con tự kiểm tra đúng 1 mã menu tương ứng (xem
// requireMenuAccess trong từng file route).
app.use('/api/system/users', usersRoutes);
app.use('/api/system/roles', rolesRoutes);
app.use('/api/system/menu-items', menuItemsRoutes);
app.use('/api/system/categories', categoriesRoutes);
app.use('/api/system/email-settings', emailSettingsRoutes);
app.use('/api/system/audit-log', auditLogRoutes);
app.use('/api/system/report-catalog', reportCatalogRoutes);
app.use('/api/system/data-sources', dataSourcesRoutes);

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({ error: 'Lỗi máy chủ' });
});

app.listen(PORT, () => console.log(`Report Server đang chạy ở cổng ${PORT}`));
