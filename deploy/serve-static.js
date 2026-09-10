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
//   PORT             — cổng nội bộ, CHỈ lắng nghe 127.0.0.1 (không lộ ra
//                      ngoài dù máy chủ có IP công khai — cùng nguyên tắc
//                      "không public cổng nội bộ" áp dụng cho cả 3 service
//                      backend, xem "Hướng dẫn triển khai PM2.md").
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT, 10);
const DIST_DIR = process.env.STATIC_DIST_DIR
  ? path.resolve(__dirname, process.env.STATIC_DIST_DIR)
  : null;

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

http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let filePath = path.join(DIST_DIR, urlPath === '/' ? 'index.html' : urlPath);

  // Chặn thoát ra ngoài DIST_DIR (vd "..%2F..%2Fetc/passwd") — path.join ở
  // trên đã chuẩn hoá "../", so sánh lại cho chắc trước khi đọc file.
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(400);
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
      'Cache-Control': cacheControlFor(filePath)
    });
    fs.createReadStream(filePath).pipe(res);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`serve-static: ${DIST_DIR} -> http://127.0.0.1:${PORT}`);
});
