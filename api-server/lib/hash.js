// lib/hash.js — Băm API key bằng SHA-256 (nhanh, KHÔNG dùng bcrypt — xem
// tài liệu kiến trúc "Quản Trị API HCRC", mục 03, vì sao: API key bị so khớp
// trên MỖI lượt gọi, còn bcrypt cố tình chạy chậm để chống dò mật khẩu).
const crypto = require('crypto');

function sha256Hex(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

module.exports = { sha256Hex };
