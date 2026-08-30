// routes/admin/consumers.js — CRUD api.ApiConsumers. AuthMethod chọn MỘT
// trong 3 cách xác thực lúc TẠO, không đổi được sau đó (đổi nghĩa là tạo
// đối tác mới — tránh case nửa vời còn sót ClientId cũ mà lại có ApiKeyHash
// mới). Bí mật (apiKey/clientSecret/hmacSecret) chỉ hiện MỘT LẦN DUY NHẤT
// lúc tạo/luân chuyển (trả về trong response, KHÔNG lưu lại nguyên văn) —
// ClientId/HmacKeyId thì hiện bình thường (định danh CÔNG KHAI, không phải
// bí mật, xem api-db/schema.sql).
//
// GET/PUT /:id/report-access — báo cáo nào đối tác này được gọi
// (api.ConsumerReportAccess), MẶC ĐỊNH rỗng (không được gọi báo cáo nào) cho
// tới khi admin gán — cùng khuôn XOÁ HẾT + INSERT LẠI trong 1 transaction với
// rp-server/routes/roles.js PUT /:id/report-access (app.RoleReportAccess).
// GET/PUT /:id/realtime-access — CÙNG khuôn, cho endpoint realtime
// (api.ConsumerRealtimeAccess) thay vì báo cáo — xem routes/v1/realtime.js.
const crypto = require('crypto');
const express = require('express');
const { sql, getPool } = require('../../db');
const { requireAdminAuth, requireAdminRole } = require('../../lib/adminAuth');
const { sha256Hex } = require('../../lib/hash');
const { encrypt } = require('../../lib/crypto');
const { invalidate } = require('../../lib/apiConsumers');
const { logAction } = require('../../lib/auditLog');

const router = express.Router();
router.use(requireAdminAuth);

const AUTH_METHODS = ['apiKey', 'oauth2', 'hmac'];

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().query(`
      SELECT Id, Name, AuthMethod, ClientId, HmacKeyId, Scopes, RateLimitPerMinute, AllowedIps, IsActive, CreatedAt, LastUsedAt
      FROM api.ApiConsumers ORDER BY Name
    `);
    res.json(result.recordset.map(r => ({ ...r, Scopes: r.Scopes.split(',').filter(Boolean) })));
  } catch (err) { next(err); }
});

router.post('/', requireAdminRole, async (req, res, next) => {
  try {
    const { name, authMethod = 'apiKey', scopes = [], rateLimitPerMinute = 120, allowedIps = '' } = req.body || {};
    if (!name || !scopes.length) return res.status(400).json({ error: 'Thiếu name/scopes' });
    if (!AUTH_METHODS.includes(authMethod)) return res.status(400).json({ error: `authMethod phải là một trong: ${AUTH_METHODS.join(', ')}` });

    const pool = await getPool('ADMIN');
    const request = pool.request()
      .input('name', sql.NVarChar(200), name)
      .input('authMethod', sql.VarChar(20), authMethod)
      .input('scopes', sql.NVarChar(200), scopes.join(','))
      .input('rateLimit', sql.Int, rateLimitPerMinute)
      .input('allowedIps', sql.NVarChar(500), allowedIps || null);

    let secretsForResponse = {};
    if (authMethod === 'apiKey') {
      const rawKey = crypto.randomBytes(32).toString('base64url');
      request.input('apiKeyHash', sql.Char(64), sha256Hex(rawKey))
        .input('clientId', sql.VarChar(64), null).input('clientSecretHash', sql.Char(64), null)
        .input('hmacKeyId', sql.VarChar(64), null).input('hmacSecretEncrypted', sql.NVarChar(500), null);
      secretsForResponse = { apiKey: rawKey };
    } else if (authMethod === 'oauth2') {
      const clientId = crypto.randomBytes(12).toString('hex');
      const clientSecret = crypto.randomBytes(32).toString('base64url');
      request.input('apiKeyHash', sql.Char(64), null)
        .input('clientId', sql.VarChar(64), clientId).input('clientSecretHash', sql.Char(64), sha256Hex(clientSecret))
        .input('hmacKeyId', sql.VarChar(64), null).input('hmacSecretEncrypted', sql.NVarChar(500), null);
      secretsForResponse = { clientId, clientSecret };
    } else { // hmac
      const hmacKeyId = crypto.randomBytes(12).toString('hex');
      const hmacSecret = crypto.randomBytes(32).toString('base64url');
      request.input('apiKeyHash', sql.Char(64), null)
        .input('clientId', sql.VarChar(64), null).input('clientSecretHash', sql.Char(64), null)
        .input('hmacKeyId', sql.VarChar(64), hmacKeyId).input('hmacSecretEncrypted', sql.NVarChar(500), encrypt(hmacSecret));
      secretsForResponse = { hmacKeyId, hmacSecret };
    }

    const result = await request.query(`
      INSERT INTO api.ApiConsumers (Name, AuthMethod, ApiKeyHash, ClientId, ClientSecretHash, HmacKeyId, HmacSecretEncrypted, Scopes, RateLimitPerMinute, AllowedIps)
      OUTPUT INSERTED.Id
      VALUES (@name, @authMethod, @apiKeyHash, @clientId, @clientSecretHash, @hmacKeyId, @hmacSecretEncrypted, @scopes, @rateLimit, @allowedIps)
    `);
    invalidate();
    const id = result.recordset[0].Id;
    // KHÔNG BAO GIỜ ghi bí mật (secretsForResponse) vào audit log — chỉ tên/authMethod.
    await logAction(req, { module: 'Đối tác API', actionType: 'TAO_DOI_TAC', targetObject: String(id), description: `Tạo đối tác "${name}" (xác thực ${authMethod})` });
    res.status(201).json({ id, authMethod, ...secretsForResponse }); // CHỈ response này có bí mật gốc
  } catch (err) { next(err); }
});

// Luân chuyển bí mật — theo ĐÚNG AuthMethod hiện có của đối tác (không đổi
// được AuthMethod ở đây). 'oauth2' chỉ đổi clientSecret, giữ nguyên
// clientId; 'hmac' chỉ đổi hmacSecret, giữ nguyên hmacKeyId — đối tác không
// cần cấu hình lại định danh công khai, chỉ cần thay bí mật mới.
router.post('/:id/rotate', requireAdminRole, async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const existing = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT AuthMethod FROM api.ApiConsumers WHERE Id = @id');
    if (!existing.recordset.length) return res.status(404).json({ error: 'Không tìm thấy đối tác' });
    const authMethod = existing.recordset[0].AuthMethod;

    let secretsForResponse = {};
    if (authMethod === 'apiKey') {
      const rawKey = crypto.randomBytes(32).toString('base64url');
      await pool.request().input('id', sql.Int, req.params.id).input('apiKeyHash', sql.Char(64), sha256Hex(rawKey))
        .query('UPDATE api.ApiConsumers SET ApiKeyHash = @apiKeyHash WHERE Id = @id');
      secretsForResponse = { apiKey: rawKey };
    } else if (authMethod === 'oauth2') {
      const clientSecret = crypto.randomBytes(32).toString('base64url');
      await pool.request().input('id', sql.Int, req.params.id).input('clientSecretHash', sql.Char(64), sha256Hex(clientSecret))
        .query('UPDATE api.ApiConsumers SET ClientSecretHash = @clientSecretHash WHERE Id = @id');
      secretsForResponse = { clientSecret };
    } else { // hmac
      const hmacSecret = crypto.randomBytes(32).toString('base64url');
      await pool.request().input('id', sql.Int, req.params.id).input('hmacSecretEncrypted', sql.NVarChar(500), encrypt(hmacSecret))
        .query('UPDATE api.ApiConsumers SET HmacSecretEncrypted = @hmacSecretEncrypted WHERE Id = @id');
      secretsForResponse = { hmacSecret };
    }
    invalidate();
    // KHÔNG BAO GIỜ ghi bí mật (secretsForResponse) vào audit log.
    await logAction(req, { module: 'Đối tác API', actionType: 'LUAN_CHUYEN_BI_MAT', targetObject: req.params.id, description: `Luân chuyển bí mật đối tác #${req.params.id} (xác thực ${authMethod})` });
    res.json({ authMethod, ...secretsForResponse }); // CHỈ response này có bí mật gốc
  } catch (err) { next(err); }
});

router.put('/:id', requireAdminRole, async (req, res, next) => {
  try {
    const { name, scopes = [], rateLimitPerMinute, isActive, allowedIps = '' } = req.body || {};
    const pool = await getPool('ADMIN');
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('name', sql.NVarChar(200), name)
      .input('scopes', sql.NVarChar(200), scopes.join(','))
      .input('rateLimit', sql.Int, rateLimitPerMinute || 120)
      .input('allowedIps', sql.NVarChar(500), allowedIps || null)
      .input('isActive', sql.Bit, isActive ? 1 : 0)
      .query(`
        UPDATE api.ApiConsumers
        SET Name = @name, Scopes = @scopes, RateLimitPerMinute = @rateLimit,
            AllowedIps = @allowedIps, IsActive = @isActive
        WHERE Id = @id
      `);
    invalidate();
    await logAction(req, { module: 'Đối tác API', actionType: 'SUA_DOI_TAC', targetObject: req.params.id, description: `Cập nhật đối tác "${name}"` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAdminRole, async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM api.ApiConsumers WHERE Id = @id');
    invalidate();
    await logAction(req, { module: 'Đối tác API', actionType: 'XOA_DOI_TAC', targetObject: req.params.id, description: `Xoá đối tác #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/:id/report-access', async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT ReportId FROM api.ConsumerReportAccess WHERE ConsumerId = @id');
    res.json({ reportIds: result.recordset.map(r => r.ReportId) });
  } catch (err) { next(err); }
});

router.put('/:id/report-access', requireAdminRole, async (req, res, next) => {
  try {
    const { reportIds = [] } = req.body || {};
    const pool = await getPool('ADMIN');
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx).input('id', sql.Int, req.params.id).query('DELETE FROM api.ConsumerReportAccess WHERE ConsumerId = @id');
      for (const reportId of reportIds) {
        await new sql.Request(tx)
          .input('id', sql.Int, req.params.id)
          .input('reportId', sql.VarChar(80), reportId)
          .query('INSERT INTO api.ConsumerReportAccess (ConsumerId, ReportId) VALUES (@id, @reportId)');
      }
      await tx.commit();
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
    await logAction(req, { module: 'Đối tác API', actionType: 'SUA_QUYEN_BAO_CAO', targetObject: req.params.id, description: `Cập nhật quyền xem báo cáo đối tác #${req.params.id}: ${reportIds.join(', ') || '(rỗng)'}` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/:id/realtime-access', async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT Endpoint FROM api.ConsumerRealtimeAccess WHERE ConsumerId = @id');
    res.json({ endpoints: result.recordset.map(r => r.Endpoint) });
  } catch (err) { next(err); }
});

router.put('/:id/realtime-access', requireAdminRole, async (req, res, next) => {
  try {
    const { endpoints = [] } = req.body || {};
    const pool = await getPool('ADMIN');
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx).input('id', sql.Int, req.params.id).query('DELETE FROM api.ConsumerRealtimeAccess WHERE ConsumerId = @id');
      for (const endpoint of endpoints) {
        await new sql.Request(tx)
          .input('id', sql.Int, req.params.id)
          .input('endpoint', sql.VarChar(50), endpoint)
          .query('INSERT INTO api.ConsumerRealtimeAccess (ConsumerId, Endpoint) VALUES (@id, @endpoint)');
      }
      await tx.commit();
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
    await logAction(req, { module: 'Đối tác API', actionType: 'SUA_QUYEN_REALTIME', targetObject: req.params.id, description: `Cập nhật quyền endpoint realtime đối tác #${req.params.id}: ${endpoints.join(', ') || '(rỗng)'}` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
