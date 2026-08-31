// lib/apiReportClient.js — Chạy báo cáo có SourceType 'apiReport'/'apiRealtime'
// (app.ReportCatalog) bằng cách gọi API Server qua HTTP, thay vì query SQL
// trực tiếp như lib/reportEngine.js. Trả về {columns, rows} — API Server đã
// tự chiếu cột (projectColumns ở phía api-server) nên rp-server KHÔNG cần
// biết cấu trúc dwh.ReportFacts/OLTP ở đây, chỉ forward nguyên response.
//
//   'apiReport'   -> GET {baseUrl}/api/v1/reports/{apiTarget}/run
//                    (báo cáo tổng hợp, có lọc — filterValues chuyển thành
//                    query string, đúng field name khai báo ở
//                    definition.filters).
//   'apiRealtime' -> mặc định GET {baseUrl}/api/v1/realtime/{apiTarget}/list
//                    (danh sách realtime, chỉ phân trang; filterValues bị bỏ
//                    qua) — TRỪ KHI definition.lookupField được đặt (tên 1
//                    field trong definition.filters), lúc đó chuyển hẳn sang
//                    GET {baseUrl}/api/v1/realtime/{apiTarget}/{giá trị lọc}
//                    (tra đúng 1 khoá, vd "nhập mã voucher -> ra đúng 1
//                    dòng trạng thái"). Không có filters khác được gửi kèm —
//                    endpoint tra-1-khoá của api-server không nhận lọc nào
//                    khác ngoài khoá. Xem hướng_dẫn_báo_cáo.md mục "Tra cứu
//                    1 mã qua API Server (lookupField)".
const { getConnection } = require('./apiConnectionPool');

async function callApiServer(connectionId, path, query) {
  const { baseUrl, apiKey } = await getConnection(connectionId);
  const url = new URL(`${baseUrl}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  }

  const res = await fetch(url, {
    headers: { 'X-API-Key': apiKey },
    signal: AbortSignal.timeout(30000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `API Server phản hồi lỗi ${res.status}`);
  return data;
}

// Riêng cho tra-1-khoá (GET .../:endpoint/:key) — 404 "không tìm thấy khoá"
// là kết quả BÌNH THƯỜNG (mã không tồn tại/gõ sai), không phải lỗi, nên trả
// null thay vì throw như callApiServer(). Lỗi khác (401/403/500...) vẫn ném
// ra như thường — chỉ 404 mới được coi là "không có" thay vì "hỏng".
async function callApiServerLookup(connectionId, path) {
  const { baseUrl, apiKey } = await getConnection(connectionId);
  const url = new URL(`${baseUrl}${path}`);
  const res = await fetch(url, {
    headers: { 'X-API-Key': apiKey },
    signal: AbortSignal.timeout(30000)
  });
  if (res.status === 404) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `API Server phản hồi lỗi ${res.status}`);
  return data; // hàng phẳng {Cot1: v1, Cot2: v2, ...} — xem routes/v1/realtime.js GET /:endpoint/:key
}

async function runApiReport(definition, filterValues = {}, { page = 1, pageSize = 200 } = {}) {
  const { sourceType, apiConnectionId, apiTarget } = definition;
  if (!apiConnectionId || !apiTarget) {
    throw new Error('Báo cáo thiếu apiConnectionId/apiTarget — kiểm tra lại cấu hình ở "Biểu mẫu"');
  }

  if (sourceType === 'apiReport') {
    const query = { page, pageSize };
    for (const f of definition.filters || []) {
      if (filterValues[f.field] !== undefined && filterValues[f.field] !== '') query[f.field] = filterValues[f.field];
    }
    const data = await callApiServer(apiConnectionId, `/api/v1/reports/${apiTarget}/run`, query);
    return { columns: data.columns, rows: data.rows };
  }

  if (sourceType === 'apiRealtime') {
    if (definition.lookupField) {
      const keyValue = filterValues[definition.lookupField];
      if (keyValue === undefined || keyValue === null || keyValue === '') return { columns: [], rows: [] };
      const row = await callApiServerLookup(apiConnectionId, `/api/v1/realtime/${apiTarget}/${encodeURIComponent(keyValue)}`);
      if (!row) return { columns: [], rows: [] };
      return { columns: Object.keys(row).map(k => ({ key: k, label: k })), rows: [row] };
    }
    const data = await callApiServer(apiConnectionId, `/api/v1/realtime/${apiTarget}/list`, { page, pageSize });
    return { columns: data.columns, rows: data.rows };
  }

  throw new Error(`SourceType "${sourceType}" không hợp lệ cho apiReportClient`);
}

module.exports = { runApiReport };
