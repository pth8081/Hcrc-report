// lib/consumerRateLimit.js — Giới hạn tần suất RIÊNG TỪNG ĐỐI TÁC, đọc đúng
// api.ApiConsumers.RateLimitPerMinute đã cấu hình (trước đây cột này chỉ
// lưu trong CSDL, không middleware nào đọc — mọi đối tác dùng chung 1 ngưỡng
// toàn cục RATE_LIMIT_PER_MINUTE, xem server.js). Đây là lớp giới hạn SAU
// xác thực (biết chắc consumer.id thật), khác bộ giới hạn theo IP TRƯỚC xác
// thực trong server.js (chặn spam nặc danh, không phân biệt được đối tác).
//
// Cửa sổ cố định (fixed window) 60 giây, đếm trong bộ nhớ tiến trình.
//
// QUYẾT ĐỊNH CÓ CHỦ ĐÍCH khi chuyển sang PM2 cluster mode (nhiều worker
// CÙNG service, xem deploy/ecosystem.config.js): GIỮ NGUYÊN đếm trong bộ
// nhớ, KHÔNG đổi sang store CSDL dùng chung. Dưới N worker, nginx round-
// robin request của 1 đối tác rải qua nhiều worker, mỗi worker đếm RIÊNG —
// ngưỡng RateLimitPerMinute thực tế trở thành LỎNG HƠN, tối đa N lần cấu
// hình. Đây là giới hạn SLA/gói cước theo hợp đồng (không phải ranh giới
// bảo mật — đối tác đã xác thực hợp lệ ở bước trước), chấp nhận lỏng hơn
// đổi lấy không thêm round-trip CSDL vào MỌI request đối tác (khác
// lib/hmacAuth.js:HmacUsedSignatures — đó PHẢI chuyển sang CSDL vì là ranh
// giới chống phát lại, sai 1 lần là cho lọt hẳn 1 request, không phải chỉ
// "lỏng hơn"). Cần đúng ngưỡng chính xác dưới cluster thật sự (SLA khắt
// khe) thì đổi sang store dùng chung (vd Redis) sau.
const WINDOW_MS = 60 * 1000;
const counters = new Map(); // consumerId -> { count, windowStart }

function checkConsumerRateLimit(consumer) {
  const limit = consumer.rateLimitPerMinute;
  if (!limit || limit <= 0) return { allowed: true }; // 0/null = không giới hạn riêng

  const now = Date.now();
  let entry = counters.get(consumer.id);
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    entry = { count: 0, windowStart: now };
    counters.set(consumer.id, entry);
  }
  entry.count += 1;
  if (entry.count > limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((WINDOW_MS - (now - entry.windowStart)) / 1000) };
  }
  return { allowed: true };
}

// Dọn bộ đếm của đối tác không gọi gần đây — tránh Map phình dần nếu có rất
// nhiều đối tác từng gọi qua vòng đời tiến trình dài.
function cleanup() {
  const now = Date.now();
  for (const [id, entry] of counters) {
    if (now - entry.windowStart >= WINDOW_MS * 2) counters.delete(id);
  }
}
const cleanupTimer = setInterval(cleanup, WINDOW_MS * 2);
cleanupTimer.unref(); // không giữ tiến trình sống chỉ vì timer này (quan trọng khi test)

module.exports = { checkConsumerRateLimit, cleanup };
