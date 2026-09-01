// lib/hcrcWorkspaceClient.js — Gọi API do hệ thống nội bộ "HCRC Workspace"
// cung cấp (KHÔNG phải đối tác ngoài) cho 2 việc:
//   verifyPassword(username, password) — xác thực đăng nhập cho account
//     app.Users.AuthSource='hcrcWorkspace', gọi MỖI LẦN đăng nhập (xem
//     lib/auth.js). Trả boolean; lỗi mạng/timeout/HTTP != 2xx ném lỗi có
//     err.isServiceUnavailable=true (phân biệt "sai mật khẩu" — trả false —
//     với "dịch vụ xác thực ngoài không phản hồi được" — lib/auth.js xử lý
//     2 trường hợp khác nhau).
//   fetchDirectory() — lấy danh bạ nhân sự (username/họ tên/phòng ban/vị
//     trí) cho "Đồng bộ tài khoản" (routes/users.js POST /sync), bấm tay,
//     KHÔNG tự chạy theo giờ.
//
// KHÔNG áp lib/urlSafety.js (assertPublicUrl) ở đây như
// lib/externalReportClient.js — khác ExternalApiConnections (BaseUrl trỏ
// tới API ĐỐI TÁC bất kỳ trên Internet), HCRC Workspace CHỦ Ý là hệ thống
// NỘI BỘ, BaseUrl thật gần như chắc chắn là IP/tên miền nội bộ — chặn theo
// assertPublicUrl sẽ chặn luôn chính cấu hình đúng. BaseUrl/khoá API chỉ
// người có quyền menu 'system-hcrc-workspace' cấu hình được (xem
// routes/hcrcWorkspaceSettings.js) — cùng mức tin cậy như chuỗi kết nối DB
// (DWH/VPDT), không SSRF-guard.
const { getPool } = require('../db');
const { decrypt } = require('./crypto');

const VERIFY_TIMEOUT_MS = 8000;
const DIRECTORY_TIMEOUT_MS = 30000;

function serviceUnavailableError(message) {
  const err = new Error(message);
  err.isServiceUnavailable = true;
  return err;
}

async function loadSettings() {
  const pool = await getPool('RP');
  const result = await pool.request().query('SELECT * FROM app.HcrcWorkspaceSettings WHERE Id = 1');
  const row = result.recordset[0];
  if (!row || !row.IsEnabled) {
    throw serviceUnavailableError('Xác thực HCRC Workspace chưa được cấu hình/bật — vào "Xác thực HCRC Workspace" để thiết lập');
  }
  return {
    baseUrl: row.BaseUrl,
    apiKey: decrypt(row.ApiKeyEncrypted),
    verifyPath: row.VerifyPath,
    directoryPath: row.DirectoryPath
  };
}

async function callJson(url, options, timeoutMs) {
  let res;
  try {
    res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw serviceUnavailableError(`Không gọi được HCRC Workspace: ${err.message}`);
  }
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw serviceUnavailableError(`HCRC Workspace trả về không phải JSON hợp lệ (mã trạng thái ${res.status})`);
  }
  if (!res.ok) {
    // 401/403 = sai mật khẩu (verify) — KHÔNG coi là "dịch vụ không khả
    // dụng", để lib/auth.js trả về false (sai mật khẩu) thay vì lỗi 503.
    if (res.status === 401 || res.status === 403) return { ok: false, data };
    const detail = (data && (data.error || data.message)) || text.slice(0, 200) || `HTTP ${res.status}`;
    throw serviceUnavailableError(`HCRC Workspace phản hồi lỗi ${res.status}: ${detail}`);
  }
  return { ok: true, data };
}

async function verifyPassword(username, password) {
  const settings = await loadSettings();
  const { data } = await callJson(
    settings.baseUrl + settings.verifyPath,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': settings.apiKey },
      body: JSON.stringify({ username, password })
    },
    VERIFY_TIMEOUT_MS
  );
  return !!(data && data.success);
}

async function fetchDirectory() {
  const settings = await loadSettings();
  const { data } = await callJson(
    settings.baseUrl + settings.directoryPath,
    { method: 'GET', headers: { 'X-Api-Key': settings.apiKey } },
    DIRECTORY_TIMEOUT_MS
  );
  if (!Array.isArray(data)) {
    throw serviceUnavailableError('HCRC Workspace trả về danh bạ không đúng định dạng (cần một mảng)');
  }
  return data;
}

module.exports = { verifyPassword, fetchDirectory, serviceUnavailableError };
