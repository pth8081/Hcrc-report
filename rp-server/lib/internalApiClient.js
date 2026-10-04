// lib/internalApiClient.js — Gọi API NỘI BỘ của api-server (bản 8.70, theo
// yêu cầu người dùng: "chỉ cần 1 API cho phép gọi từ report server sang
// thôi") — dùng cho tính năng "Upload cảnh báo hàng tồn" từ rp-user: sau khi
// rp-server tự kiểm tra storeScope của người đăng nhập (xem routes/
// stockAlertThresholdsUpload.js), gọi sang api-server để GHI THẲNG vào CSDL
// ETL (api-server/routes/internal/stockAlertThresholds.js).
//
// Xác thực bằng 1 secret CỐ ĐỊNH dùng chung (INTERNAL_API_SECRET, PHẢI khớp
// y hệt giá trị bên api-server/.env) — ĐƠN GIẢN HƠN cơ chế HMAC/API key dành
// cho đối tác ngoài (lib/externalReportClient.js), vì đây là 2 service NỘI
// BỘ tin cậy lẫn nhau, không phải đối tác không biết trước.
const TIMEOUT_MS = 30000;

async function pushStockAlertThresholds(rows, importedBy) {
  const baseUrl = process.env.INTERNAL_API_SERVER_URL;
  const secret = process.env.INTERNAL_API_SECRET;
  if (!baseUrl || !secret) {
    const err = new Error('Chưa cấu hình INTERNAL_API_SERVER_URL/INTERNAL_API_SECRET — liên hệ quản trị hệ thống');
    err.isServiceUnavailable = true;
    throw err;
  }

  let res;
  try {
    res = await fetch(`${baseUrl.replace(/\/+$/, '')}/internal/stock-alert-thresholds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': secret },
      body: JSON.stringify({ rows, importedBy }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch (err) {
    // fetch() gốc (undici) luôn ném đúng message "fetch failed" cho MỌI lỗi
    // tầng mạng — ghép thêm cause để dễ chẩn đoán, mirror lib/hcrcWorkspaceClient.js.
    const cause = err.cause ? ` (${err.cause.code || err.cause.message || err.cause})` : '';
    const wrapped = new Error(`Không gọi được api-server: ${err.message}${cause}`);
    wrapped.isServiceUnavailable = true;
    throw wrapped;
  }

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json().catch(() => ({})) : {};
  if (!res.ok) {
    const err = new Error(data?.error || `api-server trả lỗi ${res.status}`);
    if (res.status >= 500) err.isServiceUnavailable = true;
    throw err;
  }
  return data;
}

module.exports = { pushStockAlertThresholds };
