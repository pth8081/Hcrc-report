// lib/api.js — Gọi rp-server. Luôn gửi cookie (credentials: 'include') vì
// xác thực là JWT trong cookie httpOnly, không phải Bearer token — xem
// rp-server/lib/auth.js.
async function request(path, { method = 'GET', body, isFormData = false } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: isFormData ? undefined : { 'Content-Type': 'application/json' },
    body: body ? (isFormData ? body : JSON.stringify(body)) : undefined
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await res.json() : await res.blob();

  if (!res.ok) {
    const message = isJson && data?.error ? data.error : `Lỗi ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  upload: (path, formData) => request(path, { method: 'POST', body: formData, isFormData: true })
};

// Xuất file (Excel/PDF) — trả về Blob thay vì JSON, cần header khác đôi chút
// nên tách riêng thay vì dùng chung request().
export async function downloadFile(path, body, filenameFallback) {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Lỗi ${res.status}`);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="(.+)"/);
  const filename = match ? match[1] : filenameFallback;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
