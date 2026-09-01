// routes/hcrcWorkspaceSettings.js — Trang "Xác thực HCRC Workspace": cấu
// hình DUY NHẤT (Id=1, xem rp-db/schema.sql app.HcrcWorkspaceSettings) cho
// lib/hcrcWorkspaceClient.js — BaseUrl + khoá API (mã hoá) dùng cho MỌI lần
// đăng nhập của account AuthSource='hcrcWorkspace' VÀ mỗi lần "Đồng bộ tài
// khoản" (routes/users.js POST /system/users/sync). Khoá API KHÔNG BAO GIỜ
// trả về nguyên văn qua API — GET chỉ báo hasApiKey để giao diện biết đã
// cấu hình hay chưa (giống routes/emailSettings.js).
const express = require('express');
const { sql, getPool } = require('../db');
const { requireAuth, requireMenuAccess, requireSystemRoleActor } = require('../lib/auth');
const { encrypt } = require('../lib/crypto');
const { logAction } = require('../lib/auditLog');
const { fetchDirectory } = require('../lib/hcrcWorkspaceClient');

const router = express.Router();
router.use(requireAuth, requireMenuAccess('system-hcrc-workspace'));

// Sửa cấu hình/chạy thử = quyết định hệ thống nào xác thực được đăng nhập
// của người khác — THAO TÁC NHẠY CẢM, chỉ Admin hệ thống thật (không phải
// chỉ có menu qua RoleMenuAccess), cùng mức với routes/users.js reset-2fa/
// auth-source. requireSystemRoleActor dùng chung, xem lib/auth.js.

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const result = await pool.request().query(`
      SELECT BaseUrl, ApiKeyEncrypted, VerifyPath, DirectoryPath, IsEnabled, LastSyncAt, LastSyncStatus, LastSyncError
      FROM app.HcrcWorkspaceSettings WHERE Id = 1
    `);
    if (!result.recordset.length) return res.json(null);
    const row = result.recordset[0];
    res.json({
      baseUrl: row.BaseUrl,
      hasApiKey: !!row.ApiKeyEncrypted,
      verifyPath: row.VerifyPath,
      directoryPath: row.DirectoryPath,
      isEnabled: !!row.IsEnabled,
      lastSyncAt: row.LastSyncAt,
      lastSyncStatus: row.LastSyncStatus,
      lastSyncError: row.LastSyncError
    });
  } catch (err) { next(err); }
});

// lib/hcrcWorkspaceClient.js ghép chuỗi thẳng baseUrl + path (không dùng
// new URL(base, path)) — path bắt đầu bằng "/" và có KÝ TỰ "@" (vd
// "@evil.com/x") sẽ bị trình phân tích URL coi "@" là ranh giới userinfo,
// biến phần domain SAU "@" thành host thật, "@" trước đó vô nghĩa — admin
// gõ nhầm/tài khoản admin bị chiếm có thể âm thầm đổi hướng cả BaseUrl hợp
// lệ sang máy chủ khác. Validate ở đây (path phải bắt đầu "/", không chứa
// khoảng trắng/"@") để chặn sớm, không đợi lỗi khó hiểu lúc gọi thật.
function isSafeApiPath(p) {
  return typeof p === 'string' && p.startsWith('/') && !/[\s@]/.test(p);
}

router.put('/', requireSystemRoleActor, async (req, res, next) => {
  try {
    const { baseUrl, apiKey, verifyPath, directoryPath, isEnabled } = req.body || {};
    if (!baseUrl) return res.status(400).json({ error: 'Thiếu baseUrl' });
    // BẮT BUỘC https — POST /verify-credentials gửi MẬT KHẨU THẬT của
    // người dùng trong body, http:// sẽ truyền plaintext qua mạng.
    if (!/^https:\/\//i.test(baseUrl)) {
      return res.status(400).json({ error: 'baseUrl phải bắt đầu bằng "https://" — endpoint xác thực gửi mật khẩu thật trong body, không dùng http://' });
    }
    try { new URL(baseUrl); } catch { return res.status(400).json({ error: 'baseUrl không phải URL hợp lệ' }); }
    if (verifyPath && !isSafeApiPath(verifyPath)) {
      return res.status(400).json({ error: 'verifyPath phải bắt đầu bằng "/", không chứa khoảng trắng hay ký tự "@"' });
    }
    if (directoryPath && !isSafeApiPath(directoryPath)) {
      return res.status(400).json({ error: 'directoryPath phải bắt đầu bằng "/", không chứa khoảng trắng hay ký tự "@"' });
    }

    const pool = await getPool('RP');
    let apiKeyEncrypted;
    if (apiKey) {
      apiKeyEncrypted = encrypt(apiKey);
    } else {
      const existing = await pool.request().query('SELECT ApiKeyEncrypted FROM app.HcrcWorkspaceSettings WHERE Id = 1');
      apiKeyEncrypted = existing.recordset[0]?.ApiKeyEncrypted || null;
    }
    if (!apiKeyEncrypted) return res.status(400).json({ error: 'Thiếu apiKey' });

    await pool.request()
      .input('baseUrl', sql.NVarChar(300), baseUrl)
      .input('apiKeyEncrypted', sql.NVarChar(500), apiKeyEncrypted)
      .input('verifyPath', sql.NVarChar(200), verifyPath || '/api/external/verify-credentials')
      .input('directoryPath', sql.NVarChar(200), directoryPath || '/api/external/users')
      .input('isEnabled', sql.Bit, isEnabled ? 1 : 0)
      .query(`
        MERGE app.HcrcWorkspaceSettings AS target
        USING (SELECT 1 AS Id) AS src ON target.Id = src.Id
        WHEN MATCHED THEN UPDATE SET
          BaseUrl = @baseUrl, ApiKeyEncrypted = @apiKeyEncrypted, VerifyPath = @verifyPath,
          DirectoryPath = @directoryPath, IsEnabled = @isEnabled, UpdatedAt = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (Id, BaseUrl, ApiKeyEncrypted, VerifyPath, DirectoryPath, IsEnabled)
          VALUES (1, @baseUrl, @apiKeyEncrypted, @verifyPath, @directoryPath, @isEnabled);
      `);

    await logAction(req, { module: 'Xác thực HCRC Workspace', actionType: 'CAP_NHAT', description: `Cập nhật cấu hình HCRC Workspace (${isEnabled ? 'đang bật' : 'đang tắt'})` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// "Kiểm tra kết nối" — gọi thật GET {baseUrl}{directoryPath}, chỉ báo số bản
// ghi lấy được (KHÔNG lộ nội dung danh bạ ra ngoài log/response ở đây,
// "Đồng bộ tài khoản" thật mới ghi vào app.Users — xem routes/users.js).
router.post('/test-connection', requireSystemRoleActor, async (req, res, next) => {
  try {
    const directory = await fetchDirectory();
    res.json({ ok: true, count: directory.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
