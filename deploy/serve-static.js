// deploy/serve-static.js — Server tĩnh tối giản để chạy 3 giao diện SPA
// (rp-user/api-admin/etl-admin) BẰNG PM2 giống 3 service backend. Dùng
// BẮT BUỘC nếu triển khai theo "Hướng dẫn triển khai PM2.md" (không có
// Nginx nào khác đọc file tĩnh thay); TUỲ CHỌN nếu triển khai theo
// "Hướng dẫn triển khai sử dụng PM2 + Nginx.md" (mặc định file đó để
// Nginx đọc thẳng file, xem `deploy/nginx.conf`). Không phụ thuộc gói
// ngoài (chỉ dùng module có sẵn của Node) — tránh phải cài thêm gói
// global trên máy chủ.
//
// Tham số qua biến môi trường (đặt trong deploy/ecosystem.config.js):
//   STATIC_DIST_DIR — đường dẫn thư mục dist/, TÍNH TƯƠNG ĐỐI so với chính
//                      file này (KHÔNG phụ thuộc cwd lúc `pm2 start`).
//   PORT             — lắng nghe TẤT CẢ interface (giống 3 service backend
//                      — rp-server/api-server/etl đều `app.listen(PORT)`
//                      không chỉ định host) — BẮT BUỘC để "Hướng dẫn triển
//                      khai PM2.md" (không Nginx) truy cập được bằng
//                      `http://<ip-máy-chủ>:<port>/` từ máy khác như tài
//                      liệu đã hứa. Ranh giới an toàn thật sự là TƯỜNG LỬA
//                      (đóng port này lại khi thêm Nginx — xem "Hướng dẫn
//                      triển khai sử dụng PM2 + Nginx.md" mục 5), không
//                      phải địa chỉ bind — từng cố tình bind riêng
//                      127.0.0.1 ở đây, khiến bản PM2-only KHÔNG TRUY CẬP
//                      ĐƯỢC từ máy khác dù tường lửa đã mở đúng port (lỗi
//                      thật đã gặp, sửa ở đây).
//   PROXY_PREFIX,
//   PROXY_TARGET_PORT — CHỈ dùng ở "Hướng dẫn triển khai PM2.md" (không
//                      Nginx). Frontend (rp-user/api-admin/etl-admin) gọi
//                      API bằng đường dẫn TƯƠNG ĐỐI (`fetch('/api/...')`
//                      hay `fetch('/admin/...')`, xem src/lib/api.js của
//                      từng giao diện) — đúng domain/port với chính trang
//                      đang mở. Bản Nginx không sao vì Nginx đứng CHUNG 1
//                      cổng, tự định tuyến `/api`/`/admin` sang đúng service
//                      (xem deploy/nginx.conf); nhưng bản PM2-only KHÔNG có
//                      lớp đó — tiến trình NÀY (serve-static.js, phục vụ
//                      trang tĩnh ở cổng 5173/5174/5175) mới là nơi nhận
//                      request, không phải backend (cổng 4001-4003). Thiếu
//                      2 biến này, request rơi vào nhánh "SPA fallback" bên
//                      dưới — trả về `index.html` (200 OK, không phải JSON)
//                      một cách ÂM THẦM: bấm "Đăng nhập" không báo lỗi gì
//                      (code frontend thấy response không phải JSON, không
//                      ném lỗi), và vì request chưa từng tới backend nên
//                      `pm2 logs hcrc-rp-server`/`hcrc-api-server`/`hcrc-etl`
//                      cũng KHÔNG có dòng nào — lỗi thật đã gặp, sửa ở đây
//                      bằng cách proxy thẳng các đường dẫn có tiền tố này
//                      sang `http://127.0.0.1:<PROXY_TARGET_PORT>`, kèm
//                      X-Forwarded-For/-Proto để TRUST_PROXY_HOPS=1 (đã đặt
//                      sẵn ở cả 3 service, xem server.js) nhận đúng IP người
//                      dùng thật thay vì luôn thấy 127.0.0.1.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT, 10);
const DIST_DIR = process.env.STATIC_DIST_DIR
  ? path.resolve(__dirname, process.env.STATIC_DIST_DIR)
  : null;
const PROXY_PREFIX = process.env.PROXY_PREFIX || null;
const PROXY_TARGET_PORT = process.env.PROXY_TARGET_PORT
  ? parseInt(process.env.PROXY_TARGET_PORT, 10)
  : null;

// Số phiên bản chung của cả hệ thống, đọc từ VERSION.md gốc repo (mục mới
// nhất luôn ở ĐẦU file) — in ra log khởi động (thấy ngay qua `pm2 list`/
// `pm2 logs`, không cần mở web) + lộ qua GET /__version (JSON, không đi qua
// SPA fallback hay proxy) cho script/monitoring tự kiểm tra. Bản TĨNH đã
// build sẵn nhúng version lúc build (xem vite.config.js, __APP_VERSION__ ở
// sidebar) — số ở đây LUÔN khớp vì cùng đọc từ 1 nguồn, chỉ khác thời điểm
// đọc (build-time vs runtime của chính serve-static.js).
function readAppVersion() {
  try {
    const text = fs.readFileSync(path.resolve(__dirname, '../VERSION.md'), 'utf8');
    return text.match(/^## (\d+\.\d+)/m)?.[1] || '?';
  } catch {
    return '?';
  }
}
const APP_VERSION = readAppVersion();

if (!PORT || !DIST_DIR) {
  console.error('Thiếu PORT hoặc STATIC_DIST_DIR trong biến môi trường.');
  process.exit(1);
}
if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  console.error(`Không thấy index.html trong ${DIST_DIR} — chạy "npm run build" ở thư mục giao diện trước.`);
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// Cache-Control ĐÚNG bắt buộc để cập nhật bản mới hiện ra ngay — thiếu hẳn
// header này trước đây (mọi file trả về không kèm Cache-Control gì) khiến
// trình duyệt (nặng nhất trên mobile, và nặng hơn nữa ở chế độ "Thêm vào
// màn hình chính" — webview giữ cache rất lâu, ít khi tự revalidate) tự
// suy đoán thời hạn cache theo giờ sửa file, có thể giữ `index.html` CŨ
// hàng giờ/hàng ngày mà không gọi lại server — người dùng vẫn thấy bản cũ
// dù server đã có bản mới, vì trình duyệt chưa từng biết tên file JS/CSS
// mới (Vite đổi tên theo hash nội dung, nhưng phải tải `index.html` MỚI
// mới biết tên mới đó là gì).
//   - `index.html` (kể cả khi trả về do SPA fallback) -> `no-cache` — LUÔN
//     phải hỏi lại server (kèm ETag, server trả 304 nếu chưa đổi — vẫn rẻ,
//     không phải tải lại toàn bộ), không được dùng bản cache cũ mù quáng.
//   - File trong `assets/` (Vite tự đặt tên kèm hash nội dung, vd
//     `index-Dz04KvoF.js`) -> cache CỰC DÀI + `immutable` — an toàn tuyệt
//     đối vì nội dung đổi là tên file đổi theo, không bao giờ có chuyện
//     cùng tên nhưng khác nội dung.
//   - File tĩnh khác không hash tên (vd favicon) -> cache ngắn, vẫn tự
//     revalidate được nếu đổi.
//   - `sw.js`/`registerSW.js`/`manifest.webmanifest` (rp-user — service
//     worker PWA, xem vite-plugin-pwa trong vite.config.js) -> CŨNG
//     `no-cache` như index.html: service worker cache CŨ mà không tự biết
//     kiểm tra bản mới thì coi như tự tạo ra lại ĐÚNG lỗi vừa sửa ở trên,
//     lần này khó phát hiện hơn vì lỗi nằm trong chính cơ chế cập nhật.
const NO_CACHE_FILES = new Set(['index.html', 'sw.js', 'registerSW.js', 'manifest.webmanifest']);
function cacheControlFor(filePath) {
  if (NO_CACHE_FILES.has(path.basename(filePath))) return 'no-cache';
  if (path.dirname(filePath).endsWith(`${path.sep}assets`)) return 'public, max-age=31536000, immutable';
  return 'public, max-age=3600';
}

// Header bảo mật — mirror ĐÚNG bộ đã áp cho topology "PM2 + Nginx"
// (deploy/nginx.conf, add_header CSP/X-Frame-Options/X-Content-Type-Options/
// Referrer-Policy ở mọi server{} phục vụ 3 giao diện tĩnh). Topology
// "PM2-only" (dùng chính file này, không qua Nginx) trước đây KHÔNG gửi
// header nào trong số này — nếu có XSS thì script chèn được sẽ có toàn
// quyền script-src, và trang đăng nhập admin/report có thể bị nhúng iframe
// (clickjacking) — rà soát an ninh mạng, mục Medium-High. Không áp cho
// proxyToBackend() (JSON, đã có helmet riêng ở từng service, rủi ro thấp
// hơn nhiều — xem chú thích proxyToBackend()).
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};

// Proxy TCP thô sang backend (không dùng thư viện ngoài, xem đầu file) —
// forward nguyên request (method/headers/body) và pipe thẳng response về,
// không đụng vào Cache-Control/JSON gì (để nguyên response gốc của backend).
function proxyToBackend(req, res) {
  const forwardedFor = req.headers['x-forwarded-for']
    ? `${req.headers['x-forwarded-for']}, ${req.socket.remoteAddress}`
    : req.socket.remoteAddress;
  const proxyReq = http.request({
    host: '127.0.0.1',
    port: PROXY_TARGET_PORT,
    method: req.method,
    path: req.url,
    headers: {
      ...req.headers,
      'x-forwarded-for': forwardedFor,
      'x-forwarded-proto': 'http',
      'x-forwarded-host': req.headers.host || ''
    }
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (err) => {
    console.error(`serve-static: lỗi proxy sang 127.0.0.1:${PROXY_TARGET_PORT} — ${err.message}`);
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Không kết nối được backend' }));
  });
  req.pipe(proxyReq);
}

http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

  // GET /__version — kiểm tra nhanh bản đang chạy qua curl/script, không đi
  // qua SPA fallback (không trả về index.html) hay proxy backend.
  if (urlPath === '/__version') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', ...SECURITY_HEADERS });
    return res.end(JSON.stringify({ version: APP_VERSION, distDir: DIST_DIR }));
  }

  if (PROXY_PREFIX && PROXY_TARGET_PORT && (urlPath === PROXY_PREFIX || urlPath.startsWith(`${PROXY_PREFIX}/`))) {
    return proxyToBackend(req, res);
  }

  let filePath = path.join(DIST_DIR, urlPath === '/' ? 'index.html' : urlPath);

  // Chặn thoát ra ngoài DIST_DIR (vd "..%2F..%2Fetc/passwd") — path.join ở
  // trên đã chuẩn hoá "../", so sánh lại cho chắc trước khi đọc file.
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(400, SECURITY_HEADERS);
    return res.end('Bad request');
  }

  fs.stat(filePath, (err, stat) => {
    // Không phải file thật (vd "/reports/abc" do React Router tự vẽ ở
    // client) -> trả về index.html, đúng kiểu "SPA fallback" mà Nginx
    // try_files $uri $uri/ /index.html vẫn làm khi đọc thẳng file.
    if (err || stat.isDirectory()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': cacheControlFor(filePath),
      ...SECURITY_HEADERS
    });
    fs.createReadStream(filePath).pipe(res);
  });
}).listen(PORT, () => {
  console.log(`serve-static: ${DIST_DIR} -> http://0.0.0.0:${PORT} (bản ${APP_VERSION})`);
});
