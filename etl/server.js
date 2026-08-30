// server.js — Điểm khởi chạy ETL. MỘT tiến trình vừa chạy lịch đồng bộ nền
// (jobs/scheduler.js) vừa phục vụ /admin/* cho etl-admin/ — đúng mô hình đã
// dùng ở Report Server và API Server. Không có mặt công khai nào khác — cả
// tiến trình này chỉ nên chạy trong mạng nội bộ, không lộ ra Internet.
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const { rateLimit } = require('express-rate-limit');

const scheduler = require('./jobs/scheduler');
const { adminIpAllowlist } = require('./lib/adminIpAllowlist');
const adminAuthRoutes = require('./routes/admin/auth');
const adminUsersRoutes = require('./routes/admin/users');
const adminDataSourcesRoutes = require('./routes/admin/dataSources');
const adminSyncJobsRoutes = require('./routes/admin/syncJobs');
const adminLogRoutes = require('./routes/admin/log');
const adminDashboardRoutes = require('./routes/admin/dashboard');
const adminSalesTargetsRoutes = require('./routes/admin/salesTargets');

const app = express();
const PORT = process.env.PORT || 4003;

// Bắt buộc khi có Nginx/reverse proxy đứng trước — thiếu dòng này, req.ip
// luôn là IP của proxy cho MỌI request, làm hỏng ngầm bộ giới hạn tần suất
// theo IP dưới đây. Mặc định 1 = 1 Nginx duy nhất đứng trước.
app.set('trust proxy', parseInt(process.env.TRUST_PROXY_HOPS || '1', 10));

// Header bảo mật cơ bản. Tắt CSP mặc định của helmet — soạn cho trang HTML,
// ở đây chỉ có JSON API cho etl-admin/ (giao diện tĩnh Nginx phục vụ riêng).
app.use(helmet({ contentSecurityPolicy: false }));

app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(rateLimit({
  windowMs: 60 * 1000,
  limit: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '300', 10),
  standardHeaders: true,
  legacyHeaders: false
}));

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Lớp phòng thủ BỔ SUNG cho /admin/* — xem lib/adminIpAllowlist.js. Kiểm
// soát CHÍNH vẫn là không proxy /admin ra Internet ở Nginx.
app.use('/admin', adminIpAllowlist);
app.use('/admin/auth', adminAuthRoutes);
app.use('/admin/users', adminUsersRoutes);
app.use('/admin/data-sources', adminDataSourcesRoutes);
app.use('/admin/sync-jobs', adminSyncJobsRoutes);
app.use('/admin/log', adminLogRoutes);
app.use('/admin/dashboard', adminDashboardRoutes);
app.use('/admin/sales-targets', adminSalesTargetsRoutes);

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({ error: 'Lỗi máy chủ' });
});

// Giới hạn thời gian ở tầng HTTP server (Node) — cùng lý do đã áp dụng cho
// api-server/rp-server (xem chú thích ở đó): chống socket "chờ mãi".
const server = app.listen(PORT, () => console.log(`ETL Server đang chạy ở cổng ${PORT}`));
server.requestTimeout = 60 * 1000;
server.headersTimeout = 65 * 1000;
server.timeout = 120 * 1000;

scheduler.start();
