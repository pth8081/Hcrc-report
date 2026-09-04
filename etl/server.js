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
const cron = require('node-cron');

const scheduler = require('./jobs/scheduler');
const { cleanupSyncLog, cleanupAuditLog } = require('./jobs/cleanupLogs');
const { isSchedulerLeader } = require('./lib/clusterLeader');
const { adminIpAllowlist } = require('./lib/adminIpAllowlist');
const adminAuthRoutes = require('./routes/admin/auth');
const adminTwoFactorRoutes = require('./routes/admin/twoFactor');
const adminUsersRoutes = require('./routes/admin/users');
const adminDataSourcesRoutes = require('./routes/admin/dataSources');
const adminSyncJobsRoutes = require('./routes/admin/syncJobs');
const adminLogRoutes = require('./routes/admin/log');
const adminAuditLogRoutes = require('./routes/admin/auditLog');
const adminDashboardRoutes = require('./routes/admin/dashboard');
const adminSalesTargetsRoutes = require('./routes/admin/salesTargets');
const adminBranchCodeMapRoutes = require('./routes/admin/branchCodeMap');
const { getPool, closeAll, assertConfigured } = require('./db');
const { getSecret } = require('./lib/adminAuth');
const { getKey } = require('./lib/crypto');
const { installProcessGuards } = require('./lib/processGuards');

// ===== Kiểm tra cấu hình BẮT BUỘC NGAY lúc khởi động — xem chú thích tương
// tự trong rp-server/server.js. KHÔNG mở kết nối CSDL thật ở đây —
// DWH_TARGET_IMPORTER chỉ kiểm tra biến môi trường có điền, không kết nối
// thử (pool đó hẹp, chỉ dùng cho đúng 1 route "Nhập chỉ tiêu"). =====
try {
  assertConfigured('ADMIN');
  assertConfigured('DWH');
  assertConfigured('DWH_TARGET_IMPORTER');
  getSecret(); // ETL_ADMIN_JWT_SECRET
  getKey(); // ETL_ENCRYPTION_KEY
} catch (err) {
  console.error(`⛔ Cấu hình chưa sẵn sàng, dừng khởi động: ${err.message}`);
  process.exit(1);
}

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
// express-rate-limit dùng MemoryStore mặc định — dưới PM2 cluster mode
// (nhiều worker CÙNG service), ngưỡng thực tế trở thành LỎNG HƠN, tối đa
// `instances` lần RATE_LIMIT_PER_MINUTE. QUYẾT ĐỊNH CÓ CHỦ ĐÍCH: chấp nhận
// đánh đổi — cùng lý do rp-server/server.js (xem chú thích ở đó), có
// deploy/fail2ban/ làm lớp chặn thật sự ở tầng firewall khi nghiêm trọng.
app.use(rateLimit({
  windowMs: 60 * 1000,
  limit: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '300', 10),
  standardHeaders: true,
  legacyHeaders: false
}));

// GET /health — TRƯỚC ĐÂY chỉ trả "tiến trình đang chạy", không nói được
// CSDL quản trị (ADMIN — etl.SyncJobs/etl.DataSources, scheduler đọc liên
// tục) có kết nối được hay không. Giờ PING THẬT bằng "SELECT 1" — 503 nếu
// không kết nối được. Tình trạng ĐỒNG BỘ THỰC TẾ (job nào đang lỗi/quá hạn)
// xem trang "Dashboard" (etl-admin/, /admin/dashboard) — health chỉ trả lời
// đúng 1 câu "tiến trình + CSDL quản trị có sống không", không thay được
// Dashboard.
app.get('/health', async (req, res) => {
  let dbOk = true;
  try {
    const pool = await getPool('ADMIN');
    await pool.request().query('SELECT 1');
  } catch {
    dbOk = false;
  }
  res.status(dbOk ? 200 : 503).json({ status: dbOk ? 'ok' : 'error', db: dbOk ? 'ok' : 'error', time: new Date().toISOString() });
});

// Lớp phòng thủ BỔ SUNG cho /admin/* — xem lib/adminIpAllowlist.js. Kiểm
// soát CHÍNH vẫn là không proxy /admin ra Internet ở Nginx.
app.use('/admin', adminIpAllowlist);
app.use('/admin/auth', adminAuthRoutes);
app.use('/admin/2fa', adminTwoFactorRoutes);
app.use('/admin/users', adminUsersRoutes);
app.use('/admin/data-sources', adminDataSourcesRoutes);
app.use('/admin/sync-jobs', adminSyncJobsRoutes);
app.use('/admin/log', adminLogRoutes);
app.use('/admin/audit-log', adminAuditLogRoutes);
app.use('/admin/dashboard', adminDashboardRoutes);
app.use('/admin/sales-targets', adminSalesTargetsRoutes);
app.use('/admin/branch-code-map', adminBranchCodeMapRoutes);

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({ error: 'Lỗi máy chủ' });
});

// Giới hạn thời gian ở tầng HTTP server (Node) — cùng lý do đã áp dụng cho
// api-server/rp-server (xem chú thích ở đó): chống socket "chờ mãi".
const server = app.listen(PORT, () => console.log(`ETL Server đang chạy ở cổng ${PORT}`));
server.requestTimeout = 60 * 1000;
server.headersTimeout = 76 * 1000; // phải LỚN HƠN keepAliveTimeout (ràng buộc của Node)
server.timeout = 120 * 1000;
// keepAliveTimeout — cùng lý do đã áp dụng cho api-server/rp-server (xem chú
// thích ở đó): Node mặc định CHỈ 5s, thấp hơn thời gian nginx có thể giữ 1
// kết nối trong pool "keepalive 32" của deploy/nginx.conf để tái sử dụng ->
// dễ gây "502 upstream prematurely closed connection". Đặt LỚN HƠN
// proxy_read_timeout/proxy_send_timeout (65s).
server.keepAliveTimeout = 75 * 1000;

installProcessGuards({ server, closeAll, serviceName: 'ETL' });

scheduler.start();

// Dọn etl.SyncLog + admin.AuditLog cũ theo lịch (mặc định 02:00 hằng ngày).
// CHỈ instance leader (PM2 cluster mode nhiều worker — xem lib/clusterLeader.js)
// — N worker cùng DELETE là vô hại (idempotent) nhưng lãng phí, không cần N lần.
if (isSchedulerLeader()) {
  cron.schedule(process.env.CLEANUP_CRON || '0 2 * * *', () => {
    cleanupSyncLog().catch(err => console.error('⛔ Lỗi dọn SyncLog:', err.message));
    cleanupAuditLog().catch(err => console.error('⛔ Lỗi dọn AuditLog:', err.message));
  });
}
