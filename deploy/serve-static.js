// deploy/serve-static.js — Server tĩnh tối giản để chạy 3 giao diện SPA
// (rp-user/api-admin/etl-admin) BẰNG PM2 giống 3 service backend, thay vì để
// Nginx đọc thẳng file — dùng khi muốn thao tác vận hành đồng nhất (mọi thứ
// đều thấy trong `pm2 status`/`pm2 logs`, không tách 2 kiểu quản lý khác
// nhau). Không phụ thuộc gói ngoài (chỉ dùng module có sẵn của Node) — tránh
// phải cài thêm gói global trên máy chủ. Đây là PHƯƠNG ÁN THAY THẾ, không
// bắt buộc — mặc định Nginx vẫn có thể đọc thẳng file tĩnh (xem
// "Hướng dẫn triển khai.md" mục 7).
//
// Tham số qua biến môi trường (đặt trong deploy/ecosystem.config.js):
//   STATIC_DIST_DIR — đường dẫn thư mục dist/, TÍNH TƯƠNG ĐỐI so với chính
//                      file này (KHÔNG phụ thuộc cwd lúc `pm2 start`).
//   PORT             — cổng nội bộ, CHỈ lắng nghe 127.0.0.1 (không lộ ra
//                      ngoài dù máy chủ có IP công khai — giống lưu ý ở mục
//                      1, Bước 5 của deploy/README.md, nhưng ở đây làm đúng
//                      ngay từ đầu thay vì để "khuyến nghị làm sau").
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
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

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
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`serve-static: ${DIST_DIR} -> http://127.0.0.1:${PORT}`);
});
