// lib/liveTracker.js — Theo dõi request đang chạy TRONG BỘ NHỚ (không lưu
// CSDL — "kết nối hiện tại" là trạng thái tức thời, biến mất ngay khi request
// xong) + đẩy qua Server-Sent Events (SSE) cho api-admin/. Xem tài liệu kiến
// trúc "Quản Trị API HCRC", mục 01 và 05, cho lý do REST API không có khái
// niệm "kết nối mở liên tục" như CSDL/WebSocket.
let nextId = 1;
const inFlight = new Map(); // id -> { id, endpoint, method, startedAt }
const sseClients = new Set(); // Set<Response>

function broadcast(event, payload) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) res.write(data);
}

function start({ endpoint, method }) {
  const id = nextId++;
  const entry = { id, endpoint, method, startedAt: new Date().toISOString() };
  inFlight.set(id, entry);
  broadcast('start', entry);
  return id;
}

function finish(id) {
  inFlight.delete(id);
  broadcast('finish', { id });
}

function listInFlight() {
  return Array.from(inFlight.values());
}

function addClient(res) {
  sseClients.add(res);
}

function removeClient(res) {
  sseClients.delete(res);
}

module.exports = { start, finish, listInFlight, addClient, removeClient };
