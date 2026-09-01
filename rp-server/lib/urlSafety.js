// lib/urlSafety.js — Chặn SSRF khi rp-server tự gọi RA NGOÀI theo cấu hình
// admin nhập (app.ExternalApiConnections.BaseUrl/TokenUrl) — vì server này
// sắp lộ ra Internet, một BaseUrl trỏ vào mạng nội bộ hoặc endpoint metadata
// cloud (169.254.169.254) sẽ biến chính server thành bàn đạp dò/đọc tài
// nguyên nội bộ. Dùng ở CẢ 2 nơi: lúc LƯU cấu hình (báo lỗi sớm cho admin)
// và NGAY TRƯỚC mỗi lần gọi thật (baseUrl có thể là tên miền — DNS có thể
// đổi IP SAU khi lưu, gọi là "DNS rebinding"; kiểm tra lại ngay trước khi
// gọi chỉ thu hẹp khung thời gian giữa kiểm tra và gọi thật xuống còn vài
// mili-giây, KHÔNG loại bỏ hoàn toàn nguy cơ rebinding tấn công đúng khoảnh
// khắc đó — coi là rủi ro còn lại đã biết, chấp nhận được vì baseUrl chỉ
// admin mới cấu hình được, không phải input công khai).
const dns = require('dns').promises;
const net = require('net');

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) return true; // dạng lạ -> từ chối
  const [a, b] = parts;
  if (a === 0) return true; // "địa chỉ này"
  if (a === 10) return true; // RFC 1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local — gồm 169.254.169.254 (metadata cloud AWS/GCP/Azure)
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC 1918
  if (a === 192 && b === 168) return true; // RFC 1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (RFC 6598)
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::1') return true; // loopback
  if (lower.startsWith('fe80:') || lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true; // link-local fe80::/10
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local fc00::/7
  if (lower.startsWith('::ffff:')) return isPrivateIPv4(lower.slice('::ffff:'.length));
  return false;
}

function isPrivateIP(ip) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true; // không nhận dạng được dạng gì -> coi là nguy hiểm, từ chối
}

// Ném lỗi rõ ràng nếu url trỏ tới nội bộ/không hợp lệ — gọi TRƯỚC khi lưu
// cấu hình VÀ TRƯỚC mỗi lần fetch() thật.
// err.isUrlSafetyError = true trên MỌI lỗi ném ra từ đây — cho phép nơi gọi
// (routes/externalConnections.js) phân biệt "chặn SSRF, an toàn để hiện
// nguyên message cho admin" với lỗi kết nối/DNS/timeout THẬT của lib khác
// (không nên hiện nguyên văn, có thể tiết lộ thông tin mạng nội bộ) — tránh
// phải đoán qua so khớp chuỗi message dễ vỡ khi đổi câu chữ.
function safetyError(message) {
  const err = new Error(message);
  err.isUrlSafetyError = true;
  return err;
}

async function assertPublicUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw safetyError(`URL không hợp lệ: "${urlString}"`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw safetyError(`Chỉ chấp nhận URL http/https, không hỗ trợ "${parsed.protocol}"`);
  }
  const hostname = parsed.hostname;
  if (hostname === 'localhost') throw safetyError('Không được trỏ tới "localhost"');

  if (net.isIP(hostname)) {
    if (isPrivateIP(hostname)) throw safetyError(`Không được trỏ tới địa chỉ nội bộ/riêng tư: ${hostname}`);
    return;
  }

  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch (err) {
    throw safetyError(`Không phân giải được tên miền "${hostname}": ${err.code || err.message}`);
  }
  const bad = addresses.find(a => isPrivateIP(a.address));
  if (bad) {
    throw safetyError(`Tên miền "${hostname}" phân giải ra địa chỉ nội bộ/riêng tư (${bad.address}) — không cho phép`);
  }
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

// fetch() mặc định (redirect:'follow') tự nhảy theo header Location của máy
// chủ đối tác MÀ KHÔNG kiểm tra lại IP đích — một BaseUrl đã qua
// assertPublicUrl() lúc gọi vẫn có thể trả về 302 trỏ thẳng tới
// 169.254.169.254 hay 10.0.0.1, vô hiệu hoá hoàn toàn kiểm tra SSRF ở trên.
// Dùng fetchSafe() THAY cho fetch() trực tiếp ở MỌI nơi gọi ra ngoài theo
// cấu hình admin (BaseUrl/TokenUrl) — tự assertPublicUrl() cho URL gốc VÀ
// từng URL redirect trước khi đi tiếp, giới hạn tối đa MAX_REDIRECTS lần.
async function fetchSafe(urlString, options = {}) {
  let current = urlString;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await assertPublicUrl(current);
    const res = await fetch(current, { ...options, redirect: 'manual' });
    if (!REDIRECT_STATUSES.has(res.status)) return res;
    const location = res.headers.get('location');
    if (!location) return res; // 3xx không có Location — trả nguyên response, để nơi gọi tự báo lỗi
    current = new URL(location, current).toString();
  }
  throw safetyError(`Quá nhiều lần chuyển hướng (>${MAX_REDIRECTS}) khi gọi "${urlString}"`);
}

module.exports = { assertPublicUrl, isPrivateIP, fetchSafe };
