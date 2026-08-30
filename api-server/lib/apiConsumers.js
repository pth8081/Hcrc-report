// lib/apiConsumers.js — Đối tác gọi API (api.ApiConsumers trong HCRC_API).
// Nạp TOÀN BỘ đối tác đang hoạt động vào bộ nhớ, làm mới mỗi 30 giây (bảng
// này nhỏ — vài chục dòng là nhiều) — tránh 1 truy vấn CSDL cho MỖI lượt hệ
// thống ngoài gọi vào, vốn có thể rất thường xuyên. invalidate() gọi ngay
// sau khi admin thêm/sửa/xoá một đối tác qua routes/admin/consumers.js —
// không chờ hết chu kỳ 30 giây.
const { sql, getPool } = require('../db');
const { sha256Hex } = require('./hash');

const REFRESH_INTERVAL_MS = 30 * 1000;
let cacheByHash = new Map(); // ApiKeyHash -> consumer
let lastLoadedAt = 0;
let loadingPromise = null;

async function load() {
  const pool = await getPool('ADMIN');
  const result = await pool.request().query(`
    SELECT Id, Name, ApiKeyHash, Scopes, RateLimitPerMinute
    FROM api.ApiConsumers WHERE IsActive = 1
  `);
  const next = new Map();
  for (const row of result.recordset) {
    next.set(row.ApiKeyHash, {
      id: row.Id,
      name: row.Name,
      scopes: row.Scopes.split(',').map(s => s.trim()).filter(Boolean),
      rateLimitPerMinute: row.RateLimitPerMinute
    });
  }
  cacheByHash = next;
  lastLoadedAt = Date.now();
}

async function ensureFresh() {
  if (Date.now() - lastLoadedAt < REFRESH_INTERVAL_MS) return;
  if (!loadingPromise) {
    loadingPromise = load().finally(() => { loadingPromise = null; });
  }
  await loadingPromise;
}

async function updateLastUsed(consumerId) {
  const pool = await getPool('ADMIN');
  await pool.request().input('id', sql.Int, consumerId)
    .query('UPDATE api.ApiConsumers SET LastUsedAt = SYSUTCDATETIME() WHERE Id = @id');
}

async function findByKey(rawKey) {
  await ensureFresh();
  const consumer = cacheByHash.get(sha256Hex(rawKey));
  if (consumer) {
    // Không await — cập nhật "lần dùng gần nhất" không được làm chậm request thật.
    updateLastUsed(consumer.id).catch(() => {});
  }
  return consumer || null;
}

// Gọi sau khi admin thêm/sửa/xoá/luân chuyển key một đối tác.
function invalidate() {
  lastLoadedAt = 0;
}

module.exports = { findByKey, invalidate };
