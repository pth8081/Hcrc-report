// lib/reportResultCache.js — Cache TTL ngắn cho kết quả CHẠY báo cáo
// (`{columns, rows}`), theo đúng (reportId, filterValues, page, pageSize) —
// dashboard/nhiều người dùng thường gọi lại CÙNG 1 báo cáo với CÙNG bộ lọc
// trong vài giây/phút liên tiếp (vd mở lại trang, refresh), mỗi lần đều
// chạy lại nguyên truy vấn dwh.ReportFacts dù dữ liệu chưa kịp đổi.
//
// TTL mặc định 30 giây — ngắn hơn NHIỀU so với chu kỳ đồng bộ ETL thông
// thường (dữ liệu vốn đã trễ theo ETL, cache thêm 30s không đáng kể), đủ để
// hấp thụ các lượt gọi lại gần nhau. Đặt REPORT_CACHE_TTL_MS=0 để tắt hẳn
// (vd khi debug, hoặc dữ liệu cần luôn mới nhất).
//
// CHỈ dùng cho đường HTTP tương tác (routes/reports.js:/:reportId/run) —
// KHÔNG dùng cho jobs/reportEmailScheduler.js (lịch gửi email luôn cần dữ
// liệu mới nhất tại thời điểm gửi, không nên lấy từ cache).
//
// Cache CHUNG cho mọi người gọi (không phân biệt user) — an toàn vì kết quả
// chỉ phụ thuộc reportId+filters+trang, không phụ thuộc danh tính người gọi
// (quyền XEM được báo cáo nào đã kiểm tra RIÊNG, trước khi tới cache này).
//
// Bản sao CÙNG NỘI DUNG cũng có ở api-server/lib/ — cố ý trùng lặp, theo
// đúng nguyên tắc "mỗi server tự chứa đủ code" đã áp dụng xuyên suốt dự án.
const DEFAULT_TTL_MS = 30 * 1000;
const cache = new Map(); // key -> { value, expiresAt }

function getTtlMs() {
  const raw = process.env.REPORT_CACHE_TTL_MS;
  if (raw === undefined) return DEFAULT_TTL_MS;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_TTL_MS;
}

// keyParts: mảng các giá trị NGUYÊN THUỶ/đối tượng JSON-hoá được, ghép theo
// thứ tự cố định của nơi gọi (vd [reportId, filters, page, pageSize]).
function buildKey(keyParts) {
  return JSON.stringify(keyParts);
}

function get(keyParts) {
  if (getTtlMs() === 0) return undefined; // tắt cache
  const key = buildKey(keyParts);
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function set(keyParts, value) {
  const ttl = getTtlMs();
  if (ttl === 0) return;
  cache.set(buildKey(keyParts), { value, expiresAt: Date.now() + ttl });
}

function cleanup() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now >= entry.expiresAt) cache.delete(key);
  }
}
const cleanupTimer = setInterval(cleanup, 60 * 1000);
cleanupTimer.unref();

module.exports = { get, set };
