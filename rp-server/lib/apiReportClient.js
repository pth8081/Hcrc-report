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
//   'apiRealtime' -> GET {baseUrl}/api/v1/realtime/{apiTarget}/list
//                    (danh sách realtime — CHƯA hỗ trợ lọc động phía
//                    api-server, chỉ phân trang; filterValues bị bỏ qua).
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
    const data = await callApiServer(apiConnectionId, `/api/v1/realtime/${apiTarget}/list`, { page, pageSize });
    return { columns: data.columns, rows: data.rows };
  }

  throw new Error(`SourceType "${sourceType}" không hợp lệ cho apiReportClient`);
}

module.exports = { runApiReport };
