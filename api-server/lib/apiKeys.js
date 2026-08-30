// lib/apiKeys.js — Danh sách API key cấp cho từng hệ thống đối tác. TẠM THỜI
// đọc từ biến môi trường API_KEYS_JSON, ví dụ:
//   API_KEYS_JSON=[{"key":"abc123...","name":"HeThongDoiTacA","scopes":["reports"]}]
// Chuyển sang một bảng riêng (dwh.ApiConsumers chẳng hạn) khi số lượng đối tác
// tăng lên — để thu hồi/luân chuyển key mà không cần deploy lại API Server.
let cache = null;

function loadApiKeys() {
  if (cache) return cache;
  const raw = process.env.API_KEYS_JSON;
  if (!raw) {
    console.warn('⚠️  Chưa cấu hình API_KEYS_JSON trong .env — mọi request sẽ bị từ chối.');
    cache = [];
    return cache;
  }
  try {
    cache = JSON.parse(raw);
  } catch (err) {
    throw new Error(`API_KEYS_JSON trong .env không phải JSON hợp lệ: ${err.message}`);
  }
  return cache;
}

function findByKey(key) {
  return loadApiKeys().find(entry => entry.key === key) || null;
}

module.exports = { findByKey };
