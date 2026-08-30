// server.js — Điểm khởi chạy API Server. Hai ranh giới xác thực TÁCH BIỆT
// hoàn toàn, không dùng chung bất kỳ phần nào:
//   /api/v1/*  — hệ thống ngoài, xác thực bằng API key/OAuth2/HMAC
//                (lib/apiAuth.js)
//   /admin/*   — trang quản trị api-admin/, xác thực bằng cookie phiên
//                (lib/adminAuth.js)
// /admin/* KHÔNG được Nginx proxy ra Internet (xem tài liệu kiến trúc "Quản
// Trị API HCRC", mục 07) — adminIpAllowlist chỉ là lớp phòng thủ bổ sung.
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const cron = require('node-cron');
const { rateLimit } = require('express-rate-limit');

const healthRoutes = require('./routes/v1/health');
const reportsRoutes = require('./routes/v1/reports');
const realtimeRoutes = require('./routes/v1/realtime');
const oauthRoutes = require('./routes/v1/oauth');
const adminAuthRoutes = require('./routes/admin/auth');
const adminConsumersRoutes = require('./routes/admin/consumers');
const adminDataSourcesRoutes = require('./routes/admin/dataSources');
const adminRealtimeEndpointsRoutes = require('./routes/admin/realtimeEndpoints');
const adminReportCatalogRoutes = require('./routes/admin/reportCatalog');
const adminLiveRoutes = require('./routes/admin/live');
const adminHistoryRoutes = require('./routes/admin/history');
const adminStatsRoutes = require('./routes/admin/stats');
const { requestLogger } = require('./lib/requestLogger');
const { adminIpAllowlist } = require('./lib/adminIpAllowlist');
const { cleanupRequestLog } = require('./jobs/cleanupRequestLog');

const app = express();
const PORT = process.env.PORT || 4002;

app.use(compression());
// verify: lưu nguyên body THÔ vào req.rawBody — HMAC (AuthMethod='hmac')
// phải ký/kiểm tra trên đúng bytes đối tác gửi, không phải bản JS đã
// parse-rồi-serialize-lại (có thể lệch thứ tự khoá/khoảng trắng, sai chữ ký
// dù nội dung logic giống hệt) — xem lib/hmacAuth.js.
app.use(express.json({ limit: '1mb', verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: false })); // POST /api/v1/oauth/token dùng form body theo chuẩn OAuth2
app.use(cookieParser());

// ===== /api/v1/* — hệ thống ngoài =====
app.use('/api/v1', rateLimit({
  windowMs: 60 * 1000,
  limit: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '120', 10),
  standardHeaders: true,
  legacyHeaders: false,
  // Nhóm theo đúng định danh đối tác gửi kèm, bất kể AuthMethod nào — chưa
  // xác thực xong ở bước này (đó là việc của lib/apiAuth.js, chạy sau), chỉ
  // cần đủ để không gộp nhầm nhiều đối tác chung 1 IP (vd sau NAT/proxy).
  keyGenerator: (req) => req.header('X-API-Key') || req.header('X-Key-Id') || req.header('Authorization') || req.ip
}));
app.use('/api/v1', requestLogger); // ghi log + "kết nối hiện tại" — không chặn phản hồi, xem lib/requestLogger.js

app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/oauth', oauthRoutes);
app.use('/api/v1/reports', reportsRoutes);
app.use('/api/v1/realtime', realtimeRoutes); // /api/v1/realtime/{endpoint}/list, /{endpoint}/{key}

// ===== /admin/* — api-admin/ =====
app.use('/admin', adminIpAllowlist);
app.use('/admin/auth', adminAuthRoutes);
app.use('/admin/consumers', adminConsumersRoutes);
app.use('/admin/data-sources', adminDataSourcesRoutes);
app.use('/admin/realtime-endpoints', adminRealtimeEndpointsRoutes);
app.use('/admin/report-catalog', adminReportCatalogRoutes);
app.use('/admin/live', adminLiveRoutes);
app.use('/admin/history', adminHistoryRoutes);
app.use('/admin/stats', adminStatsRoutes);

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({ error: 'Lỗi máy chủ' });
});

app.listen(PORT, () => console.log(`API Server đang chạy ở cổng ${PORT}`));

// Dọn api.RequestLog cũ theo lịch (mặc định 02:00 hằng ngày).
cron.schedule(process.env.CLEANUP_CRON || '0 2 * * *', () => {
  cleanupRequestLog().catch(err => console.error('⛔ Lỗi dọn RequestLog:', err.message));
});
