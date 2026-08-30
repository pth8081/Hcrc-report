// lib/hmacSign.js — Ký request bằng HMAC-SHA256 khi gọi API đối tác có
// AuthType='hmacSignature' (app.ExternalApiConnections) — CHỈ chiều KÝ (rp-server
// là bên gọi ở đây); chiều XÁC MINH tương ứng nằm ở api-server/lib/hmacAuth.js
// (dùng khi ĐỐI TÁC gọi VÀO api-server). Cùng quy ước chuỗi ký + 3 header —
// ghép cặp có chủ đích để 2 chiều khớp nhau nếu bên kia cũng là 1 API Server
// HCRC khác, nhưng với API đối tác thật sự, quy ước ký của HỌ nhiều khả năng
// khác (tên header, thứ tự chuỗi ký...) — xem cảnh báo ở rp-db/schema.sql.
const crypto = require('crypto');

function buildSigningString({ method, path, timestamp, body }) {
  return `${method.toUpperCase()}\n${path}\n${timestamp}\n${body || ''}`;
}

function sign({ secret, method, path, body }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac('sha256', secret).update(buildSigningString({ method, path, timestamp, body }), 'utf8').digest('hex');
  return { timestamp, signature };
}

module.exports = { sign };
