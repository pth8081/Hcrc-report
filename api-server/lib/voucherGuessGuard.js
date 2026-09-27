// lib/voucherGuessGuard.js — Chặn DÒ MÃ VOUCHER: đếm số lần liên tiếp
// /vouchers/check hoặc /vouchers/redeem trả về "không hợp lệ/không tồn tại"
// (INVALID/notFound), RIÊNG THEO consumer.id — khác hẳn
// lib/consumerRateLimit.js (giới hạn tần suất chung theo SLA/gói cước, áp
// dụng như nhau bất kể kết quả ĐÚNG hay SAI). Rà soát chuyên sâu phát hiện:
// 1 đối tác dò voucherCode bằng cách thử nhiều mã LIÊN TIẾP (mã dễ đoán/số
// sequence) vẫn lọt qua giới hạn tần suất bình thường nếu gọi đủ CHẬM/rải
// rác trong 1 phút — cần bắt đúng "chuỗi dò sai liên tiếp", không phải "gọi
// quá nhiều lần/phút". Mã ĐÚNG (kể cả đã USED, không phải chỉ UNUSED) xoá
// ngay bộ đếm — không phạt oan đối tác đang xử lý danh sách mã thật xen với
// vài mã lỗi bàn phím thường gặp.
//
// Đếm trong bộ nhớ tiến trình theo consumer.id (không theo IP — consumer đã
// xác thực qua API key/HMAC, không cần thêm chiều IP như
// lib/loginRateLimit.js dùng cho đăng nhập ẩn danh) — cùng quyết định giữ
// nguyên đếm trong bộ nhớ dưới PM2 cluster mode đã áp dụng ở
// consumerRateLimit.js/loginRateLimit.js (ngưỡng thực tế lỏng hơn tối đa N
// lần số worker, chấp nhận được vì đây là lớp phòng thủ CHIỀU SÂU bổ sung,
// không phải ranh giới bảo mật duy nhất).
const PROFILE = { windowMs: 10 * 60 * 1000, maxAttempts: 20 }; // 20 lần dò sai liên tiếp/10 phút
const attempts = new Map(); // consumerId -> { count, windowStart }

// Trả số giây còn phải chờ nếu đang bị chặn, hoặc null nếu chưa bị chặn.
function isBlocked(consumerId) {
  const entry = attempts.get(consumerId);
  if (!entry) return null;
  const elapsed = Date.now() - entry.windowStart;
  if (elapsed >= PROFILE.windowMs) return null;
  if (entry.count < PROFILE.maxAttempts) return null;
  return Math.ceil((PROFILE.windowMs - elapsed) / 1000);
}

function recordInvalidGuess(consumerId) {
  const now = Date.now();
  let entry = attempts.get(consumerId);
  if (!entry || now - entry.windowStart >= PROFILE.windowMs) {
    entry = { count: 0, windowStart: now };
    attempts.set(consumerId, entry);
  }
  entry.count += 1;
}

function recordValidGuess(consumerId) {
  attempts.delete(consumerId);
}

// Dọn bộ đếm của đối tác không gọi gần đây — tránh Map phình dần.
function cleanup() {
  const now = Date.now();
  for (const [id, entry] of attempts) {
    if (now - entry.windowStart >= PROFILE.windowMs) attempts.delete(id);
  }
}
const cleanupTimer = setInterval(cleanup, PROFILE.windowMs);
cleanupTimer.unref(); // không giữ tiến trình sống chỉ vì timer này (quan trọng khi test)

module.exports = { isBlocked, recordInvalidGuess, recordValidGuess, PROFILE };
