// server.js — Điểm khởi chạy Report Server. Hai pool tĩnh (RP, DWH — xem
// db.js) + pool động cho nguồn dữ liệu bổ sung (lib/dataSourcePool.js).
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const { rateLimit } = require('express-rate-limit');
const cron = require('node-cron');

const healthRoutes = require('./routes/health');
const twoFactorRoutes = require('./routes/twoFactor');
const meRoutes = require('./routes/me');
const reportRoutes = require('./routes/reports');
const usersRoutes = require('./routes/users');
const rolesRoutes = require('./routes/roles');
const menuItemsRoutes = require('./routes/menuItems');
const categoriesRoutes = require('./routes/categories');
const emailSettingsRoutes = require('./routes/emailSettings');
const auditLogRoutes = require('./routes/auditLog');
const systemLogRoutes = require('./routes/systemLog');
const reportCatalogRoutes = require('./routes/reportCatalog');
const dataSourcesRoutes = require('./routes/dataSources');
const apiConnectionsRoutes = require('./routes/apiConnections');
const externalConnectionsRoutes = require('./routes/externalConnections');
const reportEmailSchedulesRoutes = require('./routes/reportEmailSchedules');
const anomalyAlertsRoutes = require('./routes/anomalyAlerts');
const hcrcWorkspaceSettingsRoutes = require('./routes/hcrcWorkspaceSettings');
const departmentStoreMappingRoutes = require('./routes/departmentStoreMapping');
const dashboardCatalogRoutes = require('./routes/dashboardCatalog');
const dashboardsRoutes = require('./routes/dashboards');
const adhocReportsRoutes = require('./routes/adhocReports');
const webauthnRoutes = require('./routes/webauthn');
const stockAlertThresholdsUploadRoutes = require('./routes/stockAlertThresholdsUpload');
const tlsCertificateRoutes = require('./routes/tlsCertificate');
const trustedCaRoutes = require('./routes/trustedCa');
const {
  verifyCredentials, isSystemRoleForRateLimit, issueToken, COOKIE_NAME, getSecret, setSessionCookie,
  issuePending2FAToken, issueSetupRequiredToken
} = require('./lib/auth');
const { getUserContext } = require('./lib/permissions');
const reportEmailScheduler = require('./jobs/reportEmailScheduler');
const anomalyAlertScheduler = require('./jobs/anomalyAlertScheduler');
const { isBlocked, recordFailure, recordSuccess, DEFAULT_PROFILE, ADMIN_PROFILE } = require('./lib/loginRateLimit');
const { createCaptcha, verifyCaptcha } = require('./lib/captcha');
const { logAction } = require('./lib/auditLog');
const { cleanupAuditLog } = require('./jobs/cleanupAuditLog');
const { cleanupSystemLog } = require('./jobs/cleanupSystemLog');
const { logError } = require('./lib/systemLog');
const { isSchedulerLeader } = require('./lib/clusterLeader');
const { closeAll, assertConfigured } = require('./db');
const { getKey } = require('./lib/crypto');
const { installProcessGuards } = require('./lib/processGuards');
const { createAppServer, isRunningHttps } = require('./lib/tlsServer');

// ===== Kiểm tra cấu hình BẮT BUỘC NGAY lúc khởi động — lỗi rõ ràng, dừng
// hẳn ở đây, KHÔNG đợi tới request đầu tiên cần tới DB/JWT/mã hoá mới lộ ra
// (trước đây assertConfigured()/getSecret()/getKey() chỉ được gọi lười lúc
// dùng thật — README từng nói "lỗi ngay lúc khởi động" nhưng thực tế chưa
// đúng, sửa cho khớp). KHÔNG mở kết nối CSDL thật ở đây (assertConfigured
// chỉ kiểm tra biến môi trường có điền hay chưa) — tránh làm chậm/rung lắc
// lúc khởi động nếu CSDL tạm thời chưa sẵn sàng (vd đang reboot), việc đó
// vẫn để getPool() tự thử lại đúng lúc có request cần. =====
try {
  assertConfigured('RP');
  assertConfigured('DWH');
  getSecret(); // RP_JWT_SECRET — throw nếu thiếu/còn giá trị mẫu
  getKey(); // APP_ENCRYPTION_KEY — throw nếu thiếu/sai độ dài
} catch (err) {
  console.error(`⛔ Cấu hình chưa sẵn sàng, dừng khởi động: ${err.message}`);
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 4001;

// Bắt buộc khi có Nginx/reverse proxy đứng trước — thiếu dòng này, req.ip
// luôn là IP của proxy cho MỌI request, làm hỏng ngầm: bộ giới hạn tần suất
// theo IP dưới đây, và cột IpAddress trong app.AuditLog (log sẽ ghi IP proxy
// thay vì IP người dùng thật). Mặc định 1 = 1 Nginx duy nhất đứng trước.
app.set('trust proxy', parseInt(process.env.TRUST_PROXY_HOPS || '1', 10));

// Header bảo mật cơ bản (X-Content-Type-Options, X-Frame-Options, HSTS...).
// Tắt CSP mặc định của helmet — soạn cho trang HTML, ở đây chỉ có JSON API
// (giao diện tĩnh rp-user/ do Nginx phục vụ riêng, không qua tiến trình
// này) nên CSP không có tác dụng, chỉ thêm nhiễu vào response header.
app.use(helmet({ contentSecurityPolicy: false }));

app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// express-rate-limit dùng MemoryStore mặc định (đếm trong bộ nhớ tiến
// trình) — dưới PM2 cluster mode (nhiều worker CÙNG service), ngưỡng thực
// tế trở thành LỎNG HƠN, tối đa `instances` lần RATE_LIMIT_PER_MINUTE (mỗi
// worker đếm riêng, nginx round-robin rải request 1 IP qua nhiều worker).
// QUYẾT ĐỊNH CÓ CHỦ ĐÍCH: chấp nhận đánh đổi này (không đổi sang store
// CSDL/Redis dùng chung) — đây là lớp chống spam nặc danh TRƯỚC xác thực,
// đã có deploy/fail2ban/ (đọc access log TỔNG HỢP của Nginx, không phân
// mảnh theo worker) làm lớp chặn thật sự ở tầng firewall khi có tấn công
// nghiêm trọng; lớp này chỉ cần "đủ rộng để không phiền người dùng thật,
// đủ hẹp để không ai spam thoải mái" chứ không phải ranh giới bảo mật cứng.
app.use(rateLimit({
  windowMs: 60 * 1000,
  limit: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '300', 10),
  standardHeaders: true,
  legacyHeaders: false
}));

// GET /api/auth/captcha — ảnh mã xác nhận (4 chữ số, bản 8.39) cho form
// đăng nhập, xem lib/captcha.js. KHÔNG cần đăng nhập (chạy TRƯỚC khi có
// phiên nào) — không có gì nhạy cảm (chỉ 1 token ngẫu nhiên + ảnh SVG).
app.get('/api/auth/captcha', (req, res) => {
  res.json(createCaptcha());
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { username, password, captchaToken, captchaAnswer } = req.body || {};

    // Kiểm tra CAPTCHA TRƯỚC TIÊN (bản 8.39) — rẻ (không đụng CSDL), chặn
    // sớm trước khi tốn 1 lượt tra vai trò/kiểm tra rate-limit bên dưới.
    // KHÔNG dùng chung bộ đếm sai với mật khẩu (recordFailure ở dưới) —
    // đây là lớp chống tự động hoá RIÊNG, không phải chống đoán mật khẩu.
    if (!verifyCaptcha(captchaToken, captchaAnswer)) {
      return res.status(400).json({ error: 'Mã xác nhận không đúng hoặc đã hết hạn' });
    }

    // Tra vai trò TRƯỚC (chỉ đọc app.UserRoles/app.Roles, không so mật khẩu)
    // để chọn đúng ngưỡng — tài khoản hệ thống (IsSystemRole) dùng
    // ADMIN_PROFILE (nới lỏng hơn, xem chú thích lib/loginRateLimit.js),
    // username không tồn tại/user thường dùng DEFAULT_PROFILE (ngưỡng chặt
    // như cũ).
    const isSystemRole = await isSystemRoleForRateLimit(username);
    const profile = isSystemRole ? ADMIN_PROFILE : DEFAULT_PROFILE;

    const retryAfter = isBlocked(req.ip, username, profile);
    if (retryAfter) {
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Đăng nhập sai quá nhiều lần, thử lại sau ít phút' });
    }

    const user = await verifyCredentials(username, password);
    if (!user) {
      recordFailure(req.ip, username, profile);
      // req.user chưa có (chưa xác thực) -> tự ghép object tối thiểu cho
      // logAction (chỉ đọc req.ip + req.user.username), giữ đúng tên ĐÃ GÕ
      // dù sai/không tồn tại.
      await logAction({ ip: req.ip, user: { username: username || 'unknown' } }, {
        module: 'Đăng nhập', actionType: 'DANG_NHAP_THAT_BAI', description: `Đăng nhập thất bại: "${username || ''}"`, status: 'FAILED'
      });
      return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
    }
    recordSuccess(req.ip, username);

    // 2FA BẮT BUỘC cho user có vai trò IsSystemRole=1 ("Admin", xem
    // lib/permissions.js) — user thường KHÔNG áp dụng, đăng nhập xong ngay
    // như trước đây. Đúng mật khẩu nhưng CHƯA qua đủ 2 yếu tố -> KHÔNG đặt
    // cookie phiên đầy đủ, chỉ trả token trung gian.
    // viaFallback (bản 8.47) — đăng nhập qua mật khẩu DỰ PHÒNG cục bộ vì HCRC
    // Workspace không gọi được (xem lib/auth.js:verifyCredentials()) — ghi rõ
    // vào mô tả Audit Log để Admin biết đang có sự cố, không lẫn với đăng
    // nhập bình thường.
    const fallbackNote = user.viaFallback ? ' (dùng mật khẩu dự phòng — HCRC Workspace tạm không gọi được)' : '';

    const context = await getUserContext(user.id);
    if (context?.isSystemRole) {
      await logAction({ ip: req.ip, user: { sub: user.id, username: user.username } }, {
        module: 'Đăng nhập', actionType: 'DANG_NHAP_CHO_2FA',
        description: (user.twoFactorEnabled ? 'Đúng mật khẩu, chờ xác thực hai yếu tố' : 'Đúng mật khẩu, chưa bật 2FA — bắt buộc đăng ký trước khi vào hệ thống') + fallbackNote
      });
      if (user.twoFactorEnabled) {
        return res.json({ twofa: 'pending', token: issuePending2FAToken(user) });
      }
      return res.json({ twofa: 'setupRequired', token: issueSetupRequiredToken(user) });
    }

    await logAction({ ip: req.ip, user: { sub: user.id, username: user.username } }, {
      module: 'Đăng nhập', actionType: 'DANG_NHAP', description: 'Đăng nhập thành công' + fallbackNote
    });
    setSessionCookie(res, issueToken(user));
    res.json({ ok: true });
  } catch (err) {
    // Account AuthSource='hcrcWorkspace' nhưng dịch vụ ngoài không phản hồi
    // được (mạng/timeout/HTTP lỗi, xem lib/hcrcWorkspaceClient.js) — KHÁC
    // "sai mật khẩu" (401 ở trên), không tính vào brute-force, không ghi log
    // "đăng nhập thất bại" (không phải người dùng gõ sai).
    if (err.isServiceUnavailable) {
      return res.status(503).json({ error: 'Hệ thống xác thực HCRC Workspace tạm thời không khả dụng, vui lòng thử lại sau' });
    }
    next(err);
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.use('/api/health', healthRoutes);
app.use('/api/2fa', twoFactorRoutes);
app.use('/api/webauthn', webauthnRoutes);
app.use('/api/me', meRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/dashboards', dashboardsRoutes);
app.use('/api/adhoc-reports', adhocReportsRoutes);

// "Hệ thống" — mỗi route con tự kiểm tra đúng 1 mã menu tương ứng (xem
// requireMenuAccess trong từng file route).
app.use('/api/system/users', usersRoutes);
app.use('/api/system/roles', rolesRoutes);
app.use('/api/system/menu-items', menuItemsRoutes);
app.use('/api/system/categories', categoriesRoutes);
app.use('/api/system/email-settings', emailSettingsRoutes);
app.use('/api/system/audit-log', auditLogRoutes);
app.use('/api/system/log', systemLogRoutes);
app.use('/api/system/report-catalog', reportCatalogRoutes);
app.use('/api/system/data-sources', dataSourcesRoutes);
app.use('/api/system/api-connections', apiConnectionsRoutes);
app.use('/api/system/external-connections', externalConnectionsRoutes);
app.use('/api/system/report-email-schedules', reportEmailSchedulesRoutes);
app.use('/api/system/anomaly-alerts', anomalyAlertsRoutes);
app.use('/api/system/hcrc-workspace', hcrcWorkspaceSettingsRoutes);
app.use('/api/system/department-mapping', departmentStoreMappingRoutes);
app.use('/api/system/dashboards', dashboardCatalogRoutes);
app.use('/api/stock-alert-upload', stockAlertThresholdsUploadRoutes);
app.use('/api/tls-certificate', tlsCertificateRoutes);
app.use('/api/trusted-ca', trustedCaRoutes);

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  // Ghi vào app.SystemLog (trang "Log") — lỗi route KHÔNG bắt riêng (rơi tới
  // đây) trước đây chỉ có ở pm2 log, không xem lại được qua giao diện.
  logError(`⛔ Lỗi request ${req.method} ${req.originalUrl}: ${err.message}`);
  res.status(500).json({ error: 'Lỗi máy chủ' });
});

reportEmailScheduler.start();
anomalyAlertScheduler.start();

// Dọn app.AuditLog/app.SystemLog cũ theo lịch (mặc định 02:00 hằng ngày).
// CHỈ instance leader (PM2 cluster mode nhiều worker — xem
// lib/clusterLeader.js) — N worker cùng DELETE là vô hại (idempotent) nhưng
// lãng phí, không cần N lần.
if (isSchedulerLeader()) {
  cron.schedule(process.env.CLEANUP_CRON || '0 2 * * *', () => {
    cleanupAuditLog().catch(err => console.error('⛔ Lỗi dọn AuditLog:', err.message));
    cleanupSystemLog().catch(err => console.error('⛔ Lỗi dọn SystemLog:', err.message));
  });
}

// Giới hạn thời gian ở tầng HTTP server (Node) — Express/http mặc định
// KHÔNG chặn socket "chờ mãi", một client cố tình gửi request/body nhỏ giọt
// (slow-loris) có thể giữ kết nối (và connection CSDL đã mượn trong handler)
// mở gần như vô hạn. Chỉ đáng tin cậy thật khi Nginx/proxy phía trước CŨNG
// có timeout riêng — đây là lớp phòng thủ độc lập, không thay được Nginx.
// createAppServer() (bản 8.71) — trả về https.Server NẾU đã upload chứng
// chỉ qua trang "Chứng chỉ TLS" (rp-user → Hệ thống), ngược lại http.Server
// như cũ (mặc định, KHÔNG đổi hành vi) — xem lib/tlsServer.js.
const server = createAppServer(app);
server.listen(PORT, () => console.log(`Report Server đang chạy ở cổng ${PORT} (${isRunningHttps() ? 'HTTPS' : 'HTTP'})`));
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
// tục xen kẽ khoảng nghỉ ngắn. Đặt LỚN HƠN proxy_read_timeout/proxy_send_timeout
// (65s, xem deploy/nginx.conf) để Node không bao giờ đóng trước nginx.
server.keepAliveTimeout = 75 * 1000;

installProcessGuards({ server, closeAll, serviceName: 'Report Server' });
