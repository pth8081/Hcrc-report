// lib/loginRateLimit.js — Giới hạn số lần đăng nhập SAI liên tiếp theo
// (IP + username), RIÊNG cho route đăng nhập — khác bộ giới hạn tần suất
// CHUNG trong server.js (áp cho mọi route, ngưỡng cao nên gần như không cản
// được dò mật khẩu chậm/rải rác qua nhiều phút). Đếm trong bộ nhớ tiến
// trình: mỗi lần sai cộng dồn trong 1 cửa sổ 15 phút, đăng nhập ĐÚNG xoá
// ngay bộ đếm (không phạt oan người dùng thật lỡ gõ sai 1-2 lần).
//
// QUYẾT ĐỊNH CÓ CHỦ ĐÍCH khi chuyển sang PM2 cluster mode (nhiều worker
// CÙNG service, xem deploy/ecosystem.config.js): GIỮ NGUYÊN đếm trong bộ
// nhớ, KHÔNG đổi sang store CSDL dùng chung. Dưới N worker, request đăng
// nhập của 1 IP+username rải qua nhiều worker (nginx round-robin), mỗi
// worker đếm RIÊNG — ngưỡng MAX_ATTEMPTS thực tế trở thành LỎNG HƠN, tối
// đa N lần cấu hình (KHÔNG PHẢI vô hiệu hoá hẳn — vẫn có tác dụng, chỉ rộng
// hơn). Chấp nhận đánh đổi này vì đã có deploy/fail2ban/ (đọc access log
// TỔNG HỢP của Nginx, KHÔNG phân mảnh theo worker — vẫn phát hiện/chặn đúng
// dò mật khẩu ở tầng firewall bất kể clustering) làm lớp phòng thủ CHIỀU
// SÂU thứ 2, độc lập với bộ đếm trong bộ nhớ này. Cần đúng ngưỡng chính xác
// dưới cluster thật sự thì đổi sang store dùng chung (vd Redis) sau.
//
// Bản sao CÙNG NỘI DUNG cũng có ở rp-server/lib/ và api-server/lib/ — cố ý
// trùng lặp, theo đúng nguyên tắc "mỗi server tự chứa đủ code" đã áp dụng
// xuyên suốt dự án (không dùng thư mục shared/).
const WINDOW_MS = 15 * 60 * 1000; // 15 phút
const MAX_ATTEMPTS = 10;
const attempts = new Map(); // "ip:username" -> { count, windowStart }

function keyFor(ip, username) {
  return `${ip}:${String(username || '').toLowerCase()}`;
}

// Trả về số giây còn phải chờ nếu đang bị chặn, hoặc null nếu chưa bị chặn.
function isBlocked(ip, username) {
  const entry = attempts.get(keyFor(ip, username));
  if (!entry) return null;
  const elapsed = Date.now() - entry.windowStart;
  if (elapsed >= WINDOW_MS) return null;
  if (entry.count < MAX_ATTEMPTS) return null;
  return Math.ceil((WINDOW_MS - elapsed) / 1000);
}

function recordFailure(ip, username) {
  const key = keyFor(ip, username);
  const now = Date.now();
  let entry = attempts.get(key);
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    entry = { count: 0, windowStart: now };
    attempts.set(key, entry);
  }
  entry.count += 1;
}

function recordSuccess(ip, username) {
  attempts.delete(keyFor(ip, username));
}

function cleanup() {
  const now = Date.now();
  for (const [key, entry] of attempts) {
    if (now - entry.windowStart >= WINDOW_MS) attempts.delete(key);
  }
}
const cleanupTimer = setInterval(cleanup, WINDOW_MS);
cleanupTimer.unref(); // không giữ tiến trình sống chỉ vì timer này (quan trọng khi test)

module.exports = { isBlocked, recordFailure, recordSuccess };
