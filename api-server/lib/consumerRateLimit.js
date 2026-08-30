// lib/consumerRateLimit.js — Giới hạn tần suất RIÊNG TỪNG ĐỐI TÁC, đọc đúng
// api.ApiConsumers.RateLimitPerMinute đã cấu hình (trước đây cột này chỉ
// lưu trong CSDL, không middleware nào đọc — mọi đối tác dùng chung 1 ngưỡng
// toàn cục RATE_LIMIT_PER_MINUTE, xem server.js). Đây là lớp giới hạn SAU
// xác thực (biết chắc consumer.id thật), khác bộ giới hạn theo IP TRƯỚC xác
// thực trong server.js (chặn spam nặc danh, không phân biệt được đối tác).
//
// Cửa sổ cố định (fixed window) 60 giây, đếm trong bộ nhớ tiến trình — đủ
// dùng khi chạy 1 tiến trình; chạy nhiều instance sau này (scale ngang) cần
// đổi sang store dùng chung (vd Redis) thay vì Map cục bộ này.
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
