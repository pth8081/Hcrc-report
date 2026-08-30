// lib/ipMatch.js — Kiểm tra 1 địa chỉ IP có khớp danh sách cho phép không —
// dùng cho giới hạn IP RIÊNG TỪNG ĐỐI TÁC (api.ApiConsumers.AllowedIps, xem
// lib/apiAuth.js) — khác lib/adminIpAllowlist.js (đó so khớp CHÍNH XÁC từng
// chuỗi IP, dùng cho /admin/*). Ở đây hỗ trợ thêm CIDR (vd "198.51.100.0/24")
// vì đối tác thường cung cấp cả dải IP, không chỉ 1 địa chỉ đơn — phổ biến
// hơn khi giới hạn IP cho tích hợp với hệ thống bên ngoài.
//
// Chỉ hỗ trợ IPv4 (kể cả CIDR) — đúng phạm vi thực tế hiện tại. IPv6 chỉ so
// khớp CHÍNH XÁC chuỗi (không hỗ trợ CIDR IPv6) — Express thường trả IPv4 ở
// dạng "::ffff:1.2.3.4" khi chạy sau proxy IPv4, nên chuẩn hoá bỏ tiền tố đó
// trước khi so khớp.

function normalizeIp(ip) {
  if (!ip) return ip;
  return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;
}

function parseIPv4(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map(p => Number(p));
  if (nums.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0;
}

function ipInCidr(ip, cidr) {
  const [rangeIp, prefixStr] = cidr.split('/');
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const ipNum = parseIPv4(ip);
  const rangeNum = parseIPv4(rangeIp);
  if (ipNum === null || rangeNum === null) return false;
  const mask = prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0;
  return (ipNum & mask) === (rangeNum & mask);
}

// allowedList: mảng chuỗi, mỗi phần tử là 1 IP đơn ("203.0.113.10") hoặc 1
// dải CIDR IPv4 ("198.51.100.0/24"). Rỗng/không truyền = không giới hạn
// (nơi gọi tự quyết định khi nào gọi hàm này — xem lib/apiAuth.js).
function ipAllowed(ip, allowedList) {
  const normalized = normalizeIp(ip);
  return allowedList.some(entry => (
    entry.includes('/') ? ipInCidr(normalized, entry) : normalizeIp(entry) === normalized
  ));
}

module.exports = { ipAllowed, normalizeIp };
