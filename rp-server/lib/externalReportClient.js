// lib/externalReportClient.js — Chạy báo cáo có SourceType 'externalApi'
// (app.ReportCatalog) bằng cách gọi THẲNG một API do đối tác bên ngoài xây
// dựng — khác lib/apiReportClient.js (đó luôn gọi API Server CỦA CHÍNH
// MÌNH, biết trước hình dạng response). Ở đây response là JSON tuỳ ý của
// đối tác, nên admin phải tự khai đường dẫn tới dữ liệu (externalListPath)
// và đường dẫn từng cột (columns — TÁI DÙNG đúng cú pháp cột thường/công
// thức đã có, xem lib/formulaEngine.js) thay vì chỉ chọn tên field có sẵn.
//
// GIỚI HẠN ĐÃ BIẾT: không tự phân trang phía API đối tác (không biết quy
// ước tham số của họ — page/limit/offset khác nhau tuỳ nơi) — page/pageSize
// từ rp-user KHÔNG được chuyển sang API đối tác, chỉ lấy nguyên response họ
// trả về 1 lần gọi. Nếu API đối tác cần phân trang, admin tự thêm tham số
// cố định vào externalPath (vd "/orders?limit=500").
const { evaluateFormula } = require('./formulaEngine');
const { describeColumns } = require('./reportEngine');
const { getConnection, getOAuth2Token } = require('./externalApiConnectionPool');
const hmacSign = require('./hmacSign');
const { fetchSafe } = require('./urlSafety');

function getByPath(obj, path) {
  if (!path) return obj;
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

// Chèn {field} trong pathTemplate từ filterValues (URL-encode), các
// filterValues còn lại (không dùng trong path) được thêm vào query string.
function buildUrl(baseUrl, pathTemplate, filterValues) {
  const usedKeys = new Set();
  const path = pathTemplate.replace(/\{(\w+)\}/g, (match, key) => {
    usedKeys.add(key);
    const value = filterValues[key];
    if (value === undefined || value === null || value === '') {
      throw new Error(`Thiếu giá trị cho tham số đường dẫn "{${key}}"`);
    }
    return encodeURIComponent(value);
  });
  const url = new URL(baseUrl + path);
  for (const [key, value] of Object.entries(filterValues)) {
    if (usedKeys.has(key) || value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, value);
  }
  return url;
}

// Async — 'oauth2ClientCredentials' cần đổi/tra cache token (có thể gọi
// mạng), các loại khác đồng bộ nhưng viết chung 1 hàm async cho gọn nơi gọi.
async function applyAuth(url, headers, connection, { method, body }) {
  switch (connection.authType) {
    case 'headerKey':
      headers[connection.authKeyName] = connection.authValue;
      break;
    case 'queryParam':
      url.searchParams.set(connection.authKeyName, connection.authValue);
      break;
    case 'basicAuth':
      headers['Authorization'] = `Basic ${Buffer.from(`${connection.authUsername}:${connection.authPassword}`).toString('base64')}`;
      break;
    case 'oauth2ClientCredentials': {
      const token = await getOAuth2Token(connection);
      headers['Authorization'] = `Bearer ${token}`;
      break;
    }
    case 'hmacSignature': {
      const { timestamp, signature } = hmacSign.sign({ secret: connection.authValue, method, path: url.pathname + url.search, body });
      headers['X-Key-Id'] = connection.authKeyName;
      headers['X-Timestamp'] = String(timestamp);
      headers['X-Signature'] = signature;
      break;
    }
    default: // 'none'
      break;
  }
}

async function fetchJson(url, headers) {
  const res = await fetchSafe(url.toString(), { headers, signal: AbortSignal.timeout(30000) }); // chặn SSRF (kể cả qua redirect) — xem lib/urlSafety.js
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`API đối tác trả về không phải JSON hợp lệ (mã trạng thái ${res.status})`);
  }
  if (!res.ok) {
    const detail = (data && (data.error || data.message)) || text.slice(0, 200) || `HTTP ${res.status}`;
    throw new Error(`API đối tác phản hồi lỗi ${res.status}: ${detail}`);
  }
  return data;
}

function projectExternalColumns(row, columns) {
  const out = {};
  for (const col of columns) {
    if (col && typeof col === 'object' && col.formula) {
      out[col.key] = evaluateFormula(col.formula, (path) => getByPath(row, path.join('.')));
      continue;
    }
    out[col] = getByPath(row, col) ?? null;
  }
  return out;
}

async function runExternalReport(definition, filterValues = {}) {
  const { externalConnectionId, externalPath, externalShape, externalListPath, columns } = definition;
  if (!externalConnectionId || !externalPath || !externalShape) {
    throw new Error('Báo cáo thiếu externalConnectionId/externalPath/externalShape — kiểm tra lại cấu hình');
  }
  if (!['lookup', 'list'].includes(externalShape)) {
    throw new Error(`externalShape "${externalShape}" không hợp lệ — phải là "lookup" hoặc "list"`);
  }

  const connection = await getConnection(externalConnectionId);
  const url = buildUrl(connection.baseUrl, externalPath, filterValues);
  const headers = {};
  await applyAuth(url, headers, connection, { method: 'GET', body: '' });

  const data = await fetchJson(url, headers);
  const payload = externalListPath ? getByPath(data, externalListPath) : data;
  if (payload === undefined) {
    throw new Error(`Không tìm thấy dữ liệu tại đường dẫn "${externalListPath || '(gốc response)'}"`);
  }

  if (externalShape === 'lookup') {
    if (Array.isArray(payload)) throw new Error('externalShape="lookup" nhưng dữ liệu tại đường dẫn khai là một mảng, không phải 1 bản ghi');
    return { columns: describeColumns(columns), rows: payload ? [projectExternalColumns(payload, columns)] : [] };
  }

  if (!Array.isArray(payload)) throw new Error('externalShape="list" nhưng dữ liệu tại đường dẫn khai không phải một mảng');
  return { columns: describeColumns(columns), rows: payload.map(row => projectExternalColumns(row, columns)) };
}

module.exports = { runExternalReport };
