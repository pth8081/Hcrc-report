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
const { logAction } = require('../lib/auditLog');

const router = express.Router();
router.use(requireAuth, requireMenuAccess('system-report-catalog'));

const AUTH_TYPES = ['none', 'headerKey', 'queryParam', 'basicAuth', 'oauth2ClientCredentials', 'hmacSignature'];

// AuthKeyName/AuthValueEncrypted TÁI DÙNG cho 4 AuthType khác nhau (tên khác
// nhau theo ngữ cảnh — header/param/ClientId/HMAC KeyId — xem rp-db/schema.sql).
function validateAuthPayload({ authType = 'none', authKeyName, authValue, authUsername, authPassword, tokenUrl }) {
  if (!AUTH_TYPES.includes(authType)) return `authType phải là một trong: ${AUTH_TYPES.join(', ')}`;
  if ((authType === 'headerKey' || authType === 'queryParam' || authType === 'hmacSignature') && (!authKeyName || !authValue)) {
    return `authType "${authType}" cần authKeyName và authValue`;
  }
  if (authType === 'basicAuth' && (!authUsername || !authPassword)) {
    return 'authType "basicAuth" cần authUsername và authPassword';
  }
  if (authType === 'oauth2ClientCredentials' && (!authKeyName || !authValue || !tokenUrl)) {
    return 'authType "oauth2ClientCredentials" cần authKeyName (ClientId), authValue (ClientSecret) và tokenUrl';
  }
  return null;
}

function usesKeyValue(authType) {
  return authType === 'headerKey' || authType === 'queryParam' || authType === 'hmacSignature' || authType === 'oauth2ClientCredentials';
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
    const authError = validateAuthPayload({ authType, authKeyName, authValue, authUsername, authPassword, tokenUrl });
    if (authError) return res.status(400).json({ error: authError });

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
    res.status(400).json({ ok: false, error: err.message });
  }
});

module.exports = router;
