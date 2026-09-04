// lib/loginRateLimit.js — Giới hạn số lần đăng nhập SAI liên tiếp theo
// (IP + username), RIÊNG cho route đăng nhập — khác bộ giới hạn tần suất
// CHUNG trong server.js (áp cho mọi route, ngưỡng cao nên gần như không cản
// được dò mật khẩu chậm/rải rác qua nhiều phút). Đếm trong bộ nhớ tiến
// trình: mỗi lần sai cộng dồn trong 1 cửa sổ, đăng nhập ĐÚNG xoá ngay bộ
// đếm (không phạt oan người dùng thật lỡ gõ sai 1-2 lần).
//
// 2 "profile" ngưỡng khác nhau (DEFAULT_PROFILE/ADMIN_PROFILE) — theo yêu
// cầu người dùng: tài khoản Role='admin' (quyền cao nhất, dùng 2FA nên đã
// có lớp bảo vệ thứ 2) được NỚI LỎNG ngưỡng (nhiều lần thử hơn, cửa sổ chờ
// ngắn hơn) thay vì áp NGƯỠNG CHẶT như tài khoản thường — tránh việc chính
// admin lỡ gõ sai vài lần liên tiếp (đổi mật khẩu chưa quen, gõ nhầm bàn
// phím) bị treo tới 15 phút. KHÔNG bỏ hẳn giới hạn cho admin (dò mật khẩu/
// mã tự động không giới hạn tốc độ vẫn là rủi ro thật cho tài khoản quyền
// cao nhất) — chỉ nới ngưỡng, vẫn có chặn. Caller (routes/admin/auth.js,
// routes/admin/twoFactor.js) tự tra Role của username TRƯỚC khi gọi
// isBlocked/recordFailure để chọn đúng profile — module này không tự tra
// CSDL (giữ nguyên tính chất "đếm thuần trong bộ nhớ, không phụ thuộc CSDL"
// để vẫn hoạt động được cả khi CSDL tạm thời chậm/lỗi).
//
// QUYẾT ĐỊNH CÓ CHỦ ĐÍCH khi chuyển sang PM2 cluster mode (nhiều worker
// CÙNG service, xem deploy/ecosystem.config.js): GIỮ NGUYÊN đếm trong bộ
// nhớ, KHÔNG đổi sang store CSDL dùng chung. Dưới N worker, request đăng
// nhập của 1 IP+username rải qua nhiều worker (nginx round-robin), mỗi
// worker đếm RIÊNG — ngưỡng maxAttempts thực tế trở thành LỎNG HƠN, tối
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
const DEFAULT_PROFILE = { windowMs: 15 * 60 * 1000, maxAttempts: 10 }; // 10 lần/15 phút — tài khoản thường
const ADMIN_PROFILE = { windowMs: 2 * 60 * 1000, maxAttempts: 50 };    // 50 lần/2 phút — Role='admin'
const MAX_WINDOW_MS = Math.max(DEFAULT_PROFILE.windowMs, ADMIN_PROFILE.windowMs);
const attempts = new Map(); // "ip:username" -> { count, windowStart }

function keyFor(ip, username) {
  return `${ip}:${String(username || '').toLowerCase()}`;
}

// Trả về số giây còn phải chờ nếu đang bị chặn, hoặc null nếu chưa bị chặn.
function isBlocked(ip, username, profile = DEFAULT_PROFILE) {
  const entry = attempts.get(keyFor(ip, username));
  if (!entry) return null;
  const elapsed = Date.now() - entry.windowStart;
  if (elapsed >= profile.windowMs) return null;
  if (entry.count < profile.maxAttempts) return null;
  return Math.ceil((profile.windowMs - elapsed) / 1000);
}

function recordFailure(ip, username, profile = DEFAULT_PROFILE) {
  const key = keyFor(ip, username);
  const now = Date.now();
  let entry = attempts.get(key);
  if (!entry || now - entry.windowStart >= profile.windowMs) {
    entry = { count: 0, windowStart: now };
    attempts.set(key, entry);
  }
  entry.count += 1;
}

function recordSuccess(ip, username) {
  attempts.delete(keyFor(ip, username));
}

// Dùng MAX_WINDOW_MS (cửa sổ DÀI NHẤT trong các profile) làm mốc quét dọn —
// an toàn cho MỌI profile đã dùng để ghi entry đó (entry cũ hơn cửa sổ dài
// nhất chắc chắn đã hết hạn dù ghi bằng profile nào).
function cleanup() {
  const now = Date.now();
  for (const [key, entry] of attempts) {
    if (now - entry.windowStart >= MAX_WINDOW_MS) attempts.delete(key);
  }
}
const cleanupTimer = setInterval(cleanup, MAX_WINDOW_MS);
cleanupTimer.unref(); // không giữ tiến trình sống chỉ vì timer này (quan trọng khi test)

module.exports = { isBlocked, recordFailure, recordSuccess, DEFAULT_PROFILE, ADMIN_PROFILE };
