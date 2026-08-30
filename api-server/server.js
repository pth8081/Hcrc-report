// server.js — Điểm khởi chạy API Server. Phục vụ hệ thống ngoài, xác thực
// bằng API key (lib/apiAuth.js) — khác Report Server (xác thực người dùng
// bằng mật khẩu). Hai nhóm route dùng hai pool kết nối tách biệt (db.js).
require('dotenv').config();
const express = require('express');
const compression = require('compression');
const { rateLimit } = require('express-rate-limit');

const healthRoutes = require('./routes/v1/health');
const reportsRoutes = require('./routes/v1/reports');
const realtimeRoutes = require('./routes/v1/realtime');

const app = express();
const PORT = process.env.PORT || 4002;

app.use(compression());
app.use(express.json({ limit: '1mb' }));

// Rate limit theo API key, không theo IP — nhiều hệ thống đối tác có thể gọi
// qua cùng dải IP (NAT), khoá theo IP dễ khiến bên này dùng nhiều làm bên
// khác bị chặn oan.
app.use('/api/v1', rateLimit({
  windowMs: 60 * 1000,
  limit: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '120', 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.header('X-API-Key') || req.ip
}));

app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/reports', reportsRoutes);
app.use('/api/v1', realtimeRoutes); // /api/v1/inventory, /api/v1/loyalty, /api/v1/vouchers

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({ error: 'Lỗi máy chủ' });
});

app.listen(PORT, () => console.log(`API Server đang chạy ở cổng ${PORT}`));
