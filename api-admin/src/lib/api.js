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
  const data = contentType.includes('application/json') ? await res.json() : null;

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
