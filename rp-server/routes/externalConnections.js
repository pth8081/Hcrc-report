// routes/externalConnections.js — Kết nối tới API do ĐỐI TÁC BÊN NGOÀI xây
// dựng (app.ExternalApiConnections) — quản lý trong trang "Biểu mẫu" (cùng
// chỗ chọn ExternalConnectionId cho một báo cáo SourceType 'externalApi').
// Giá trị bí mật (AuthValueEncrypted/AuthPasswordEncrypted) KHÔNG BAO GIỜ
// trả về nguyên văn; sửa mà không gửi giá trị mới thì giữ nguyên bản mã hoá cũ.
const express = require('express');
const { sql, getPool } = require('../db');
const { requireAuth, requireMenuAccess } = require('../lib/auth');
const { encrypt } = require('../lib/crypto');
const { invalidate, testConnection } = require('../lib/externalApiConnectionPool');
const { assertPublicUrl } = require('../lib/urlSafety');
const { logAction } = require('../lib/auditLog');

const router = express.Router();
router.use(requireAuth, requireMenuAccess('system-report-catalog'));

const AUTH_TYPES = ['none', 'headerKey', 'queryParam', 'basicAuth', 'oauth2ClientCredentials', 'hmacSignature'];

// AuthKeyName/AuthValueEncrypted TÁI DÙNG cho 4 AuthType khác nhau (tên khác
// nhau theo ngữ cảnh — header/param/ClientId/HMAC KeyId — xem rp-db/schema.sql).
//
// isUpdate (bản 9.10, SỬA LỖI) — TRƯỚC ĐÂY hàm này dùng CHUNG cho cả POST
// (tạo mới) LẪN PUT (sửa), luôn bắt buộc authValue/authPassword khác rỗng —
// khiến cơ chế "để trống = giữ nguyên bí mật cũ đã lưu" ở router.put() bên
// dưới (dòng comment đầu file đã hứa "sửa mà không gửi giá trị mới thì giữ
// nguyên") KHÔNG BAO GIỜ chạy tới được, vì bị validate chặn trả 400 TRƯỚC —
// người dùng buộc phải gõ lại bí mật mỗi lần chỉ muốn đổi Tên/Base URL. Khi
// isUpdate=true: VẪN bắt buộc authKeyName/authUsername/tokenUrl (không có
// cơ chế giữ nguyên cho các trường KHÔNG bí mật này), chỉ bỏ qua bắt buộc
// riêng authValue/authPassword.
function validateAuthPayload({ authType = 'none', authKeyName, authValue, authUsername, authPassword, tokenUrl }, { isUpdate = false } = {}) {
  if (!AUTH_TYPES.includes(authType)) return `authType phải là một trong: ${AUTH_TYPES.join(', ')}`;
  if (authType === 'headerKey' || authType === 'queryParam' || authType === 'hmacSignature') {
    if (!authKeyName) return `authType "${authType}" cần authKeyName`;
    if (!isUpdate && !authValue) return `authType "${authType}" cần authValue`;
  }
  if (authType === 'basicAuth') {
    if (!authUsername) return 'authType "basicAuth" cần authUsername';
    if (!isUpdate && !authPassword) return 'authType "basicAuth" cần authPassword';
  }
  if (authType === 'oauth2ClientCredentials') {
    if (!authKeyName || !tokenUrl) return 'authType "oauth2ClientCredentials" cần authKeyName (ClientId) và tokenUrl';
    if (!isUpdate && !authValue) return 'authType "oauth2ClientCredentials" cần authValue (ClientSecret)';
  }
  return null;
}

function usesKeyValue(authType) {
  return authType === 'headerKey' || authType === 'queryParam' || authType === 'hmacSignature' || authType === 'oauth2ClientCredentials';
}

// authType nào gửi thẳng 1 bí mật (API key/mật khẩu/client secret) TRÊN DÂY
// mỗi lần gọi thì bắt buộc https — cùng logic đã áp cho
// lib/hcrcWorkspaceClient.js (mật khẩu nhân viên thật). hmacSignature KHÔNG
// nằm trong danh sách này: bí mật chỉ dùng để KÝ cục bộ, không gửi đi.
const AUTH_TYPES_REQUIRING_HTTPS = new Set(['headerKey', 'queryParam', 'basicAuth', 'oauth2ClientCredentials']);

// Chặn SSRF NGAY LÚC LƯU cấu hình — baseUrl/tokenUrl không được trỏ tới
// mạng nội bộ/địa chỉ riêng tư (xem lib/urlSafety.js). Ném lỗi thẳng, để
// route bắt và trả 400 rõ ràng thay vì lưu một cấu hình nguy hiểm.
async function assertSafeConnectionUrls(baseUrl, authType, tokenUrl) {
  await assertPublicUrl(baseUrl);
  if (authType === 'oauth2ClientCredentials') await assertPublicUrl(tokenUrl);
  if (AUTH_TYPES_REQUIRING_HTTPS.has(authType)) {
    if (!/^https:\/\//i.test(baseUrl)) {
      throw new Error(`authType "${authType}" gửi bí mật (API key/mật khẩu/client secret) trên đường truyền — baseUrl phải là https://, không được http:// (tránh lộ dạng cleartext qua MITM)`);
    }
    if (authType === 'oauth2ClientCredentials' && !/^https:\/\//i.test(tokenUrl)) {
      throw new Error('authType "oauth2ClientCredentials" gửi client secret khi lấy token — tokenUrl phải là https://, không được http://');
    }
  }
}

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const result = await pool.request().query(`
      SELECT Id, Name, BaseUrl, AuthType, AuthKeyName, AuthUsername, TokenUrl, CreatedAt
      FROM app.ExternalApiConnections ORDER BY Name
    `);
    res.json(result.recordset);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, baseUrl, authType = 'none', authKeyName, authValue, authUsername, authPassword, tokenUrl } = req.body || {};
    if (!name || !baseUrl) return res.status(400).json({ error: 'Thiếu name/baseUrl' });
    const authError = validateAuthPayload({ authType, authKeyName, authValue, authUsername, authPassword, tokenUrl });
    if (authError) return res.status(400).json({ error: authError });
    try {
      await assertSafeConnectionUrls(baseUrl, authType, tokenUrl);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const pool = await getPool('RP');
    const result = await pool.request()
      .input('name', sql.NVarChar(200), name)
      .input('baseUrl', sql.NVarChar(300), baseUrl)
      .input('authType', sql.VarChar(30), authType)
      .input('authKeyName', sql.NVarChar(200), usesKeyValue(authType) ? authKeyName : null)
      .input('authValueEncrypted', sql.NVarChar(500), usesKeyValue(authType) ? encrypt(authValue) : null)
      .input('authUsername', sql.NVarChar(200), authType === 'basicAuth' ? authUsername : null)
      .input('authPasswordEncrypted', sql.NVarChar(500), authType === 'basicAuth' ? encrypt(authPassword) : null)
      .input('tokenUrl', sql.NVarChar(300), authType === 'oauth2ClientCredentials' ? tokenUrl : null)
      .query(`
        INSERT INTO app.ExternalApiConnections (Name, BaseUrl, AuthType, AuthKeyName, AuthValueEncrypted, AuthUsername, AuthPasswordEncrypted, TokenUrl)
        OUTPUT INSERTED.Id
        VALUES (@name, @baseUrl, @authType, @authKeyName, @authValueEncrypted, @authUsername, @authPasswordEncrypted, @tokenUrl)
      `);
    await logAction(req, { module: 'Biểu mẫu', actionType: 'TAO_KET_NOI_DOI_TAC', targetObject: name, description: `Tạo kết nối API đối tác "${name}"` });
    res.status(201).json({ id: result.recordset[0].Id });
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, baseUrl, authType = 'none', authKeyName, authValue, authUsername, authPassword, tokenUrl } = req.body || {};
    const authError = validateAuthPayload({ authType, authKeyName, authValue, authUsername, authPassword, tokenUrl }, { isUpdate: true });
    if (authError) return res.status(400).json({ error: authError });
    try {
      await assertSafeConnectionUrls(baseUrl, authType, tokenUrl);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const pool = await getPool('RP');
    let authValueEncrypted = null;
    let authPasswordEncrypted = null;
    if (usesKeyValue(authType)) {
      if (authValue) {
        authValueEncrypted = encrypt(authValue);
      } else {
        const existing = await pool.request().input('id', sql.Int, req.params.id)
          .query('SELECT AuthValueEncrypted FROM app.ExternalApiConnections WHERE Id = @id');
        authValueEncrypted = existing.recordset[0]?.AuthValueEncrypted;
      }
    }
    if (authType === 'basicAuth') {
      if (authPassword) {
        authPasswordEncrypted = encrypt(authPassword);
      } else {
        const existing = await pool.request().input('id', sql.Int, req.params.id)
          .query('SELECT AuthPasswordEncrypted FROM app.ExternalApiConnections WHERE Id = @id');
        authPasswordEncrypted = existing.recordset[0]?.AuthPasswordEncrypted;
      }
    }

    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('name', sql.NVarChar(200), name)
      .input('baseUrl', sql.NVarChar(300), baseUrl)
      .input('authType', sql.VarChar(30), authType)
      .input('authKeyName', sql.NVarChar(200), usesKeyValue(authType) ? authKeyName : null)
      .input('authValueEncrypted', sql.NVarChar(500), authValueEncrypted)
      .input('authUsername', sql.NVarChar(200), authType === 'basicAuth' ? authUsername : null)
      .input('authPasswordEncrypted', sql.NVarChar(500), authPasswordEncrypted)
      .input('tokenUrl', sql.NVarChar(300), authType === 'oauth2ClientCredentials' ? tokenUrl : null)
      .query(`
        UPDATE app.ExternalApiConnections
        SET Name = @name, BaseUrl = @baseUrl, AuthType = @authType, AuthKeyName = @authKeyName,
            AuthValueEncrypted = @authValueEncrypted, AuthUsername = @authUsername,
            AuthPasswordEncrypted = @authPasswordEncrypted, TokenUrl = @tokenUrl
        WHERE Id = @id
      `);
    invalidate(parseInt(req.params.id, 10));
    await logAction(req, { module: 'Biểu mẫu', actionType: 'SUA_KET_NOI_DOI_TAC', targetObject: req.params.id, description: `Cập nhật kết nối API đối tác #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM app.ExternalApiConnections WHERE Id = @id');
    invalidate(parseInt(req.params.id, 10));
    await logAction(req, { module: 'Biểu mẫu', actionType: 'XOA_KET_NOI_DOI_TAC', targetObject: req.params.id, description: `Xoá kết nối API đối tác #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) {
    if (err.number === 547) return res.status(409).json({ error: 'Kết nối đang được ít nhất 1 báo cáo dùng — bỏ gán trước khi xoá' });
    next(err);
  }
});

// Nhân bản (bản 9.22, theo yêu cầu người dùng) — tạo 1 kết nối MỚI copy
// NGUYÊN VẸN mọi cột (kể cả AuthValueEncrypted/AuthPasswordEncrypted ĐÃ MÃ
// HOÁ, đúng kiểu xác thực hiện có — AuthType không đổi khi nhân bản) từ kết
// nối gốc, CHỈ đổi Name — không giải mã, không lộ bí mật qua request body.
router.post('/:id/duplicate', async (req, res, next) => {
  try {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Thiếu name (tên bản sao mới)' });
    const pool = await getPool('RP');
    const existing = await pool.request().input('id', sql.Int, req.params.id).query(`
      SELECT BaseUrl, AuthType, AuthKeyName, AuthValueEncrypted, AuthUsername, AuthPasswordEncrypted, TokenUrl
      FROM app.ExternalApiConnections WHERE Id = @id
    `);
    if (!existing.recordset.length) return res.status(404).json({ error: 'Không tìm thấy kết nối' });
    const src = existing.recordset[0];
    const result = await pool.request()
      .input('name', sql.NVarChar(200), name)
      .input('baseUrl', sql.NVarChar(300), src.BaseUrl)
      .input('authType', sql.VarChar(30), src.AuthType)
      .input('authKeyName', sql.NVarChar(200), src.AuthKeyName)
      .input('authValueEncrypted', sql.NVarChar(500), src.AuthValueEncrypted)
      .input('authUsername', sql.NVarChar(200), src.AuthUsername)
      .input('authPasswordEncrypted', sql.NVarChar(500), src.AuthPasswordEncrypted)
      .input('tokenUrl', sql.NVarChar(300), src.TokenUrl)
      .query(`
        INSERT INTO app.ExternalApiConnections (Name, BaseUrl, AuthType, AuthKeyName, AuthValueEncrypted, AuthUsername, AuthPasswordEncrypted, TokenUrl)
        OUTPUT INSERTED.Id
        VALUES (@name, @baseUrl, @authType, @authKeyName, @authValueEncrypted, @authUsername, @authPasswordEncrypted, @tokenUrl)
      `);
    const id = result.recordset[0].Id;
    await logAction(req, { module: 'Biểu mẫu', actionType: 'NHAN_BAN_KET_NOI_DOI_TAC', targetObject: name, description: `Nhân bản kết nối API đối tác "${name}" từ #${req.params.id}` });
    res.status(201).json({ id });
  } catch (err) { next(err); }
});

// Thử một cấu hình ĐÃ LƯU (chỉ xác nhận máy chủ phản hồi — xem
// lib/externalApiConnectionPool.js:testConnection() cho giới hạn thật).
router.post('/:id/test', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const result = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT BaseUrl FROM app.ExternalApiConnections WHERE Id = @id');
    if (!result.recordset.length) return res.status(404).json({ error: 'Không tìm thấy kết nối' });
    const { status } = await testConnection({ baseUrl: result.recordset[0].BaseUrl });
    res.json({ ok: true, status });
  } catch (err) {
    // Lỗi CHẶN SSRF (lib/urlSafety.js) an toàn để hiện nguyên văn cho admin;
    // lỗi kết nối/DNS/timeout THẬT khác thì không — có thể tiết lộ thông tin
    // mạng nội bộ (hostname nội bộ phân giải được hay không, timeout ở đâu...).
    res.status(400).json({ ok: false, error: err.isUrlSafetyError ? err.message : 'Không kết nối được tới máy chủ đối tác' });
  }
});

module.exports = router;
