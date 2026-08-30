// lib/hmacAuth.js — Xác thực bằng chữ ký HMAC-SHA256 từng request
// (AuthMethod='hmac' bên api.ApiConsumers) — chuẩn phổ biến ở cổng thanh
// toán/ngân hàng (VNPay/MoMo...), khác API key tĩnh: mỗi request tự chứng
// minh không bị giả mạo/replay bằng chữ ký + mốc thời gian, không cần gửi
// bí mật (secret) qua dây mỗi lần.
//
// 3 header đối tác PHẢI gửi kèm:
//   X-Key-Id     — định danh CÔNG KHAI (không bí mật) để biết dùng secret nào.
//   X-Timestamp  — unix giây lúc ký, phải nằm trong TOLERANCE_SECONDS quanh
//                  giờ máy chủ (chống phát lại — replay).
//   X-Signature  — hex(HMAC-SHA256(secret, chuỗi ký)).
// Chuỗi ký = `${method}\n${path}\n${timestamp}\n${rawBody}` — method viết
// hoa, path gồm cả query string (đúng nguyên trạng đối tác gọi), rawBody là
// CHUỖI THÔ (không phải object đã parse — parse lại có thể đổi thứ tự khoá/
// khoảng trắng, làm sai lệch chữ ký cả 2 phía) — xem server.js (express.json
// verify callback lưu req.rawBody).
const crypto = require('crypto');

const TOLERANCE_SECONDS = 5 * 60; // 5 phút — đủ rộng cho lệch giờ đồng hồ, đủ hẹp để chặn phát lại

function buildSigningString({ method, path, timestamp, body }) {
  return `${method.toUpperCase()}\n${path}\n${timestamp}\n${body || ''}`;
}

function computeSignature(secret, signingString) {
  return crypto.createHmac('sha256', secret).update(signingString, 'utf8').digest('hex');
}

// Trả { ok: true } hoặc { ok: false, reason }. So sánh bằng
// crypto.timingSafeEqual — so sánh chuỗi thường (===) rò rỉ thời gian xử lý
// theo độ dài phần khớp, có thể bị dò ra chữ ký đúng qua nhiều lần thử.
function verify({ secret, method, path, timestamp, body, signature }) {
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return { ok: false, reason: 'X-Timestamp không hợp lệ' };
  const skewSeconds = Math.abs(Date.now() / 1000 - tsNum);
  if (skewSeconds > TOLERANCE_SECONDS) return { ok: false, reason: 'X-Timestamp lệch quá xa giờ máy chủ (khả năng bị phát lại)' };

  const expected = computeSignature(secret, buildSigningString({ method, path, timestamp, body }));
  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(String(signature || ''), 'hex');
  if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
    return { ok: false, reason: 'Chữ ký không khớp' };
  }
  return { ok: true };
}

module.exports = { buildSigningString, computeSignature, verify };
