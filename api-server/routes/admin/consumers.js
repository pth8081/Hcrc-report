// routes/admin/consumers.js — CRUD api.ApiConsumers. API key gốc chỉ hiện
// MỘT LẦN DUY NHẤT lúc tạo/luân chuyển (trả về trong response, KHÔNG lưu lại
// nguyên văn) — sau đó chỉ so khớp được qua hash, giống mật khẩu.
//
// GET/PUT /:id/report-access — báo cáo nào đối tác này được gọi
// (api.ConsumerReportAccess), MẶC ĐỊNH rỗng (không được gọi báo cáo nào) cho
// tới khi admin gán — cùng khuôn XOÁ HẾT + INSERT LẠI trong 1 transaction với
// rp-server/routes/roles.js PUT /:id/report-access (app.RoleReportAccess).
const crypto = require('crypto');
const express = require('express');
const { sql, getPool } = require('../../db');
const { requireAdminAuth, requireAdminRole } = require('../../lib/adminAuth');
const { sha256Hex } = require('../../lib/hash');
const { invalidate } = require('../../lib/apiConsumers');

const router = express.Router();
router.use(requireAdminAuth);

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().query(`
      SELECT Id, Name, Scopes, RateLimitPerMinute, AllowedIps, IsActive, CreatedAt, LastUsedAt
      FROM api.ApiConsumers ORDER BY Name
    `);
    res.json(result.recordset.map(r => ({ ...r, Scopes: r.Scopes.split(',').filter(Boolean) })));
  } catch (err) { next(err); }
});

router.post('/', requireAdminRole, async (req, res, next) => {
  try {
    const { name, scopes = [], rateLimitPerMinute = 120, allowedIps = '' } = req.body || {};
    if (!name || !scopes.length) return res.status(400).json({ error: 'Thiếu name/scopes' });

    const rawKey = crypto.randomBytes(32).toString('base64url');
    const pool = await getPool('ADMIN');
    const result = await pool.request()
      .input('name', sql.NVarChar(200), name)
      .input('apiKeyHash', sql.Char(64), sha256Hex(rawKey))
      .input('scopes', sql.NVarChar(200), scopes.join(','))
      .input('rateLimit', sql.Int, rateLimitPerMinute)
      .input('allowedIps', sql.NVarChar(500), allowedIps || null)
      .query(`
        INSERT INTO api.ApiConsumers (Name, ApiKeyHash, Scopes, RateLimitPerMinute, AllowedIps)
        OUTPUT INSERTED.Id
        VALUES (@name, @apiKeyHash, @scopes, @rateLimit, @allowedIps)
      `);
    invalidate();
    res.status(201).json({ id: result.recordset[0].Id, apiKey: rawKey }); // CHỈ response này có key gốc
  } catch (err) { next(err); }
});

router.post('/:id/rotate', requireAdminRole, async (req, res, next) => {
  try {
    const rawKey = crypto.randomBytes(32).toString('base64url');
    const pool = await getPool('ADMIN');
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('apiKeyHash', sql.Char(64), sha256Hex(rawKey))
      .query('UPDATE api.ApiConsumers SET ApiKeyHash = @apiKeyHash WHERE Id = @id');
    invalidate();
    res.json({ apiKey: rawKey }); // CHỈ response này có key gốc
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
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAdminRole, async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM api.ApiConsumers WHERE Id = @id');
    invalidate();
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
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
