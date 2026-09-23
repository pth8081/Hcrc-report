// lib/api.js — Gọi ETL Server dưới /admin/* (cookie phiên riêng — xem
// etl/lib/adminAuth.js).
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

// Tải file nhị phân (vd .xlsx từ /template, /export) về máy — khác request()
// ở trên vì response KHÔNG phải JSON, đọc bằng res.blob() rồi tự tạo link
// tải xuống tạm (cách chuẩn của trình duyệt, không có API "download" thẳng
// từ fetch). fallbackName dùng khi server không trả Content-Disposition.
async function downloadFile(path, fallbackName) {
  const res = await fetch(`/admin${path}`, { credentials: 'include' });
  if (!res.ok) {
    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await res.json() : null;
    const err = new Error(data?.error || `Lỗi ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : fallbackName;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  get: (path) => request(path),
  post: (path, body, isFormData = false) => request(path, { method: 'POST', body, isFormData }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  downloadFile
};
