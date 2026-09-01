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
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const cron = require('node-cron');
const { rateLimit } = require('express-rate-limit');

const healthRoutes = require('./routes/v1/health');
const reportsRoutes = require('./routes/v1/reports');
const realtimeRoutes = require('./routes/v1/realtime');
const oauthRoutes = require('./routes/v1/oauth');
const adminAuthRoutes = require('./routes/admin/auth');
const adminTwoFactorRoutes = require('./routes/admin/twoFactor');
const adminConsumersRoutes = require('./routes/admin/consumers');
const adminUsersRoutes = require('./routes/admin/users');
const adminDataSourcesRoutes = require('./routes/admin/dataSources');
const adminRealtimeEndpointsRoutes = require('./routes/admin/realtimeEndpoints');
const adminReportCatalogRoutes = require('./routes/admin/reportCatalog');
const adminLiveRoutes = require('./routes/admin/live');
const adminHistoryRoutes = require('./routes/admin/history');
const adminAuditLogRoutes = require('./routes/admin/auditLog');
const adminStatsRoutes = require('./routes/admin/stats');
const { requestLogger } = require('./lib/requestLogger');
const { adminIpAllowlist } = require('./lib/adminIpAllowlist');
const { corsAllowlist } = require('./lib/corsAllowlist');
const { cleanupRequestLog } = require('./jobs/cleanupRequestLog');
const { cleanupAuditLog } = require('./jobs/cleanupAuditLog');
const { cleanupHmacSignatures } = require('./jobs/cleanupHmacSignatures');
const { isSchedulerLeader } = require('./lib/clusterLeader');
const { closeAll, assertConfigured } = require('./db');
const { getSecret: getAdminSecret } = require('./lib/adminAuth');
const { getSecret: getOAuthSecret } = require('./lib/oauthTokens');
const { getKey } = require('./lib/crypto');
const { installProcessGuards } = require('./lib/processGuards');

// ===== Kiểm tra cấu hình BẮT BUỘC NGAY lúc khởi động — xem chú thích tương
// tự trong rp-server/server.js. KHÔNG mở kết nối CSDL thật ở đây. =====
try {
  assertConfigured('ADMIN');
  assertConfigured('DWH');
  getAdminSecret(); // API_ADMIN_JWT_SECRET
  getOAuthSecret(); // OAUTH_JWT_SECRET
  getKey(); // API_ENCRYPTION_KEY
} catch (err) {
  console.error(`⛔ Cấu hình chưa sẵn sàng, dừng khởi động: ${err.message}`);
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 4002;

// Bắt buộc khi có Nginx/reverse proxy đứng trước (đúng mô hình triển khai
// thật — xem README) — thiếu dòng này, req.ip luôn là IP của proxy cho MỌI
// request, làm hỏng ngầm: giới hạn IP riêng từng đối tác (lib/ipMatch.js),
// adminIpAllowlist, bộ giới hạn tần suất theo IP dưới đây, và cột IpAddress
// trong api.RequestLog (log sẽ ghi IP proxy thay vì IP đối tác thật). Số hop
// khớp đúng số lớp proxy trước app — mặc định 1 (1 Nginx duy nhất đứng
// trước, đúng mô hình "cả 3 hệ thống + Nginx trên 1 máy chủ").
app.set('trust proxy', parseInt(process.env.TRUST_PROXY_HOPS || '1', 10));

// Header bảo mật cơ bản (X-Content-Type-Options, X-Frame-Options, HSTS...).
// Tắt CSP mặc định của helmet — soạn cho trang HTML, ở đây chỉ có JSON API
// (giao diện tĩnh api-admin/ do Nginx phục vụ riêng, không qua tiến trình
// này) nên CSP không có tác dụng, chỉ thêm nhiễu vào response header.
app.use(helmet({ contentSecurityPolicy: false }));

app.use(compression());
// verify: lưu nguyên body THÔ vào req.rawBody — HMAC (AuthMethod='hmac')
// phải ký/kiểm tra trên đúng bytes đối tác gửi, không phải bản JS đã
// parse-rồi-serialize-lại (có thể lệch thứ tự khoá/khoảng trắng, sai chữ ký
// dù nội dung logic giống hệt) — xem lib/hmacAuth.js.
app.use(express.json({ limit: '1mb', verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: false })); // POST /api/v1/oauth/token dùng form body theo chuẩn OAuth2
app.use(cookieParser());

// ===== /api/v1/* — hệ thống ngoài =====
// Lớp giới hạn THEO IP THẬT, TRƯỚC xác thực — chặn spam nặc danh (kể cả tới
// POST /api/v1/oauth/token, vốn luôn đụng CSDL ADMIN trước khi biết
// client_id có hợp lệ hay không). CỐ Ý khoá theo req.ip (đáng tin nhờ
// `trust proxy` ở trên), KHÔNG khoá theo header đối tác tự khai (X-API-Key/
// X-Key-Id/Authorization) như trước đây — header đó CHƯA được xác thực ở
// bước này, kẻ tấn công đổi giá trị mỗi request là có "bucket" riêng, vô
// hiệu hoá hoàn toàn giới hạn. Giới hạn RIÊNG theo từng đối tác (đọc đúng
// RateLimitPerMinute đã cấu hình) áp dụng SAU khi xác thực xong, trong
// lib/apiAuth.js — đây chỉ là lớp chặn spam nặc danh chung.
// CORS — TẮT MẶC ĐỊNH (CORS_ALLOWED_ORIGINS rỗng = không set header, giữ
// nguyên hành vi cũ), chỉ bật khi operator khai rõ origin cần cho phép (xem
// lib/corsAllowlist.js). Đặt TRƯỚC rate limit/requestLogger để preflight
// OPTIONS không tốn hạn mức/tạo log rác.
app.use('/api/v1', corsAllowlist);
// express-rate-limit dùng MemoryStore mặc định — dưới PM2 cluster mode
// (nhiều worker CÙNG service), ngưỡng thực tế trở thành LỎNG HƠN, tối đa
// `instances` lần RATE_LIMIT_PER_MINUTE. QUYẾT ĐỊNH CÓ CHỦ ĐÍCH: chấp nhận
// đánh đổi — cùng lý do rp-server/server.js (xem chú thích ở đó): đây là
// lớp chặn spam nặc danh TRƯỚC xác thực, có deploy/fail2ban/ (đọc access
// log tổng hợp, không phân mảnh theo worker) làm lớp chặn thật sự khi
// nghiêm trọng; giới hạn RIÊNG từng đối tác (lib/consumerRateLimit.js) mới
// là ngưỡng SLA thật, cũng đã ghi chú đánh đổi tương tự ở đó.
app.use('/api/v1', rateLimit({
  windowMs: 60 * 1000,
  limit: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '120', 10),
  standardHeaders: true,
  legacyHeaders: false
}));
app.use('/api/v1', requestLogger); // ghi log + "kết nối hiện tại" — không chặn phản hồi, xem lib/requestLogger.js

app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/oauth', oauthRoutes);
app.use('/api/v1/reports', reportsRoutes);
app.use('/api/v1/realtime', realtimeRoutes); // /api/v1/realtime/{endpoint}/list, /{endpoint}/{key}

// ===== /admin/* — api-admin/ =====
app.use('/admin', adminIpAllowlist);
app.use('/admin/auth', adminAuthRoutes);
app.use('/admin/2fa', adminTwoFactorRoutes);
app.use('/admin/consumers', adminConsumersRoutes);
app.use('/admin/users', adminUsersRoutes);
app.use('/admin/data-sources', adminDataSourcesRoutes);
app.use('/admin/realtime-endpoints', adminRealtimeEndpointsRoutes);
app.use('/admin/report-catalog', adminReportCatalogRoutes);
app.use('/admin/live', adminLiveRoutes);
app.use('/admin/history', adminHistoryRoutes);
app.use('/admin/audit-log', adminAuditLogRoutes);
app.use('/admin/stats', adminStatsRoutes);

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({ error: 'Lỗi máy chủ' });
});

// Giới hạn thời gian ở tầng HTTP server (Node) — Express/http mặc định
// KHÔNG chặn socket "chờ mãi", một client cố tình gửi request/body nhỏ giọt
// (slow-loris) có thể giữ kết nối (và connection CSDL đã mượn trong handler)
// mở gần như vô hạn. Chỉ đáng tin cậy thật khi Nginx/proxy phía trước CŨNG
// có timeout riêng — đây là lớp phòng thủ độc lập, không thay được Nginx.
const server = app.listen(PORT, () => console.log(`API Server đang chạy ở cổng ${PORT}`));
server.requestTimeout = 60 * 1000; // tối đa để nhận trọn request (header+body)
server.headersTimeout = 76 * 1000; // phải LỚN HƠN keepAliveTimeout (ràng buộc của Node)
server.timeout = 120 * 1000; // timeout rảnh (idle) cho toàn bộ kết nối
// keepAliveTimeout — Node mặc định CHỈ 5s, trong khi deploy/nginx.conf khai
// "upstream ... { keepalive 32; }" (giữ sẵn tối đa 32 kết nối nginx<->Node
// TÁI SỬ DỤNG, không tự đặt idle timeout riêng cho các kết nối này). Nếu
// Node đóng socket rảnh SAU 5s trong khi nginx vẫn coi kết nối đó còn dùng
// được (đưa lại vào pool để tái sử dụng cho request tiếp theo), nginx gửi
// request mới trên 1 socket Node đã đóng -> lỗi "502 upstream prematurely
// closed connection" NGẪU NHIÊN, đặc biệt dễ gặp khi có nhiều kết nối liên
// tục xen kẽ khoảng nghỉ ngắn (consumer gọi API lặp lại). Đặt LỚN HƠN
// proxy_read_timeout/proxy_send_timeout (65s, xem deploy/nginx.conf) để
// Node không bao giờ đóng trước nginx.
server.keepAliveTimeout = 75 * 1000;

installProcessGuards({ server, closeAll, serviceName: 'API Server' });

// Dọn api.RequestLog + admin.AuditLog cũ theo lịch (mặc định 02:00 hằng
// ngày). CHỈ instance leader (PM2 cluster mode nhiều worker — xem
// lib/clusterLeader.js) — N worker cùng DELETE là vô hại (idempotent) nhưng
// lãng phí, không cần N lần.
if (isSchedulerLeader()) {
  cron.schedule(process.env.CLEANUP_CRON || '0 2 * * *', () => {
    cleanupRequestLog().catch(err => console.error('⛔ Lỗi dọn RequestLog:', err.message));
    cleanupAuditLog().catch(err => console.error('⛔ Lỗi dọn AuditLog:', err.message));
  });
}

// admin.HmacUsedSignatures (chống phát lại chữ ký HMAC — xem lib/hmacAuth.js)
// có vòng đời NGẮN (5 phút, TOLERANCE_SECONDS), dọn theo chu kỳ RIÊNG (5
// phút) thay vì gộp vào lịch dọn hằng ngày ở trên — nếu chỉ dọn 1 lần/ngày,
// bảng phình lớn không cần thiết khi lưu lượng đối tác qua HMAC cao. CHỈ
// instance leader (cùng lý do trên).
if (isSchedulerLeader()) {
  setInterval(
    () => cleanupHmacSignatures().catch(err => console.error('⛔ Lỗi dọn HmacUsedSignatures:', err.message)),
    5 * 60 * 1000
  ).unref();
}
