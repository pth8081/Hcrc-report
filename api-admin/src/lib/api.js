// lib/api.js — Gọi api-server dưới /admin/* (cookie phiên riêng, KHÔNG phải
// API key — xem api-server/lib/adminAuth.js).
async function request(path, { method = 'GET', body, isFormData = false } = {}) {
  const res = await fetch(`/admin${path}`, {
    method,
    credentials: 'include',
    headers: isFormData ? undefined : { 'Content-Type': 'application/json' },
    body: body ? (isFormData ? body : JSON.stringify(body)) : undefined
  });

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    // Phản hồi không phải JSON dù HTTP status có thể vẫn 200 OK (vd rơi vào
    // SPA fallback của serve-static.js do thiếu PROXY_PREFIX/PROXY_TARGET_PORT)
    // — TRƯỚC ĐÂY âm thầm trả về null coi như thành công, lỗi thật không ai
    // biết (vd CaptchaField không hiện ảnh, không log gì cả 2 phía).
    const err = new Error(`Phản hồi không phải JSON (Content-Type: ${contentType || '(trống)'}) — kiểm tra cấu hình proxy /admin`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();

  if (!res.ok) {
    const err = new Error(data?.error || `Lỗi ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body, isFormData = false) => request(path, { method: 'POST', body, isFormData }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  del: (path) => request(path, { method: 'DELETE' })
};
