// lib/corsAllowlist.js — CORS cho /api/v1/* (KHÔNG cho /admin/* — trang
// quản trị luôn same-origin qua Nginx, không cần và không nên mở CORS ở đó).
// TẮT MẶC ĐỊNH (an toàn theo mặc định, không đổi hành vi hiện tại) — hầu hết
// đối tác gọi API server-to-server (không có Origin header, CORS không liên
// quan). Chỉ bật khi thật sự cần: một đối tác chạy JS trực tiếp trên trình
// duyệt (domain của họ) gọi thẳng /api/v1/* — operator khai RÕ từng origin
// qua CORS_ALLOWED_ORIGINS (phân cách dấu phẩy), không có "*" (API key/HMAC/
// OAuth token không nên lộ cho MỌI origin bất kỳ).
function parseAllowedOrigins() {
  return (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

// Header đối tác có thể gửi khi gọi từ trình duyệt — khớp đúng những gì
// lib/apiAuth.js và lib/hmacAuth.js thực sự đọc (Authorization, X-API-Key,
// X-Key-Id/X-Timestamp/X-Signature) + Content-Type cho request có body.
const ALLOWED_REQUEST_HEADERS = 'Content-Type, Authorization, X-API-Key, X-Key-Id, X-Timestamp, X-Signature';

function corsAllowlist(req, res, next) {
  const origin = req.headers.origin;
  if (origin) {
    const allowed = parseAllowedOrigins();
    if (allowed.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', ALLOWED_REQUEST_HEADERS);
      res.setHeader('Access-Control-Max-Age', '600');
    }
  }
  if (req.method === 'OPTIONS') return res.status(204).end(); // preflight — không chạm rate limit/xác thực phía sau
  next();
}

module.exports = { corsAllowlist, parseAllowedOrigins };
