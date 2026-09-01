// lib/hcrcWorkspaceClient.js — Gọi API do hệ thống nội bộ "HCRC Workspace"
// cung cấp (KHÔNG phải đối tác ngoài) cho 2 việc, ĐÚNG theo tài liệu API họ
// đã công bố (POST /api/external/verify-credentials, GET /api/external/users
// — Authorization: Bearer <key>, KHÔNG phải X-Api-Key):
//   verifyPassword(username, password) — xác thực đăng nhập cho account
//     app.Users.AuthSource='hcrcWorkspace', gọi MỖI LẦN đăng nhập (xem
//     lib/auth.js). Theo tài liệu: sai tài khoản/mật khẩu vẫn trả 200 OK
//     kèm {success:false} — CHỈ coi là "dịch vụ không khả dụng" khi mã
//     trạng thái KHÁC 200 (401/403 = sai/thu hồi khoá API hoặc IP không
//     được phép — LỖI CẤU HÌNH, không phải người dùng gõ sai; 429 = vượt
//     tần suất; 500 = lỗi máy chủ họ) — ném lỗi err.isServiceUnavailable=true
//     để lib/auth.js/server.js phân biệt rõ 2 trường hợp, không tính lỗi
//     cấu hình vào brute-force của người dùng.
//   fetchDirectory() — lấy TOÀN BỘ danh bạ (GET không kèm ?account=) cho
//     "Đồng bộ tài khoản" (routes/users.js POST /sync), bấm tay, KHÔNG tự
//     chạy theo giờ. Chuẩn hoá field response thật (username/name/dept/
//     jobTitle/phone/email/active) sang tên nội bộ report server dùng
//     (username/fullName/department/position/phone/email/isActive) NGAY Ở
//     ĐÂY — chỉ 1 chỗ biết hình dạng response thật của HCRC Workspace,
//     routes/users.js không cần biết.
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

// Trả thẳng data đã parse JSON khi HTTP 200 — MỌI mã khác 200 (400/401/403/
// 404/429/500, theo mục "Mã lỗi" của tài liệu HCRC Workspace) đều là lỗi
// dịch vụ/cấu hình, KHÔNG có ý nghĩa "sai mật khẩu" (case đó vẫn 200).
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
    const detail = (data && data.error) || text.slice(0, 200) || `HTTP ${res.status}`;
    throw serviceUnavailableError(`HCRC Workspace phản hồi lỗi ${res.status}: ${detail}`);
  }
  return data;
}

function authHeaders(apiKey, extra) {
  return { Authorization: `Bearer ${apiKey}`, ...extra };
}

async function verifyPassword(username, password) {
  const settings = await loadSettings();
  const data = await callJson(
    settings.baseUrl + settings.verifyPath,
    {
      method: 'POST',
      headers: authHeaders(settings.apiKey, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ account: username, password })
    },
    VERIFY_TIMEOUT_MS
  );
  return !!(data && data.success);
}

async function fetchDirectory() {
  const settings = await loadSettings();
  const data = await callJson(
    settings.baseUrl + settings.directoryPath,
    { method: 'GET', headers: authHeaders(settings.apiKey) },
    DIRECTORY_TIMEOUT_MS
  );
  if (!Array.isArray(data)) {
    throw serviceUnavailableError('HCRC Workspace trả về danh bạ không đúng định dạng (cần một mảng — gọi không kèm ?account=)');
  }
  return data.map(item => ({
    username: item.username,
    fullName: item.name,
    department: item.dept,
    position: item.jobTitle,
    phone: item.phone,
    email: item.email,
    isActive: item.active
  }));
}

module.exports = { verifyPassword, fetchDirectory, serviceUnavailableError };
