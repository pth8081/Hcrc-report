// routes/admin/dataSources.js — Trang "Nguồn dữ liệu": CRUD api.DataSources
// (nguồn cho các endpoint realtime, thay OLTP_* tĩnh trong .env) + gán mỗi
// endpoint (inventory/loyalty/vouchers) cho đúng một nguồn
// (api.RealtimeEndpoints). Mật khẩu KHÔNG BAO GIỜ trả về nguyên văn.
const express = require('express');
const { sql, getPool } = require('../../db');
const { requireAdminAuth, requireAdminRole } = require('../../lib/adminAuth');
const { encrypt } = require('../../lib/crypto');
const { invalidate, testConnection } = require('../../lib/dataSourcePool');

const router = express.Router();
router.use(requireAdminAuth);

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().query(`
      SELECT Id, Name, Server, Port, DatabaseName, Username, Encrypt, TrustServerCert, IsActive, CreatedAt
      FROM api.DataSources ORDER BY Name
    `);
    res.json(result.recordset);
  } catch (err) { next(err); }
});

router.post('/', requireAdminRole, async (req, res, next) => {
  try {
    const { name, server, port, databaseName, username, password, encrypt: enc, trustServerCert } = req.body || {};
    if (!name || !server || !databaseName || !username || !password) {
      return res.status(400).json({ error: 'Thiếu name/server/databaseName/username/password' });
    }
    const pool = await getPool('ADMIN');
    const result = await pool.request()
      .input('name', sql.NVarChar(200), name)
      .input('server', sql.NVarChar(200), server)
      .input('port', sql.Int, port || 1433)
      .input('databaseName', sql.NVarChar(100), databaseName)
      .input('username', sql.NVarChar(100), username)
      .input('passwordEncrypted', sql.NVarChar(500), encrypt(password))
      .input('encryptConn', sql.Bit, enc === false ? 0 : 1)
      .input('trustServerCert', sql.Bit, trustServerCert ? 1 : 0)
      .query(`
        INSERT INTO api.DataSources (Name, Server, Port, DatabaseName, Username, PasswordEncrypted, Encrypt, TrustServerCert)
        OUTPUT INSERTED.Id
        VALUES (@name, @server, @port, @databaseName, @username, @passwordEncrypted, @encryptConn, @trustServerCert)
      `);
    res.status(201).json({ id: result.recordset[0].Id });
  } catch (err) { next(err); }
});

router.put('/:id', requireAdminRole, async (req, res, next) => {
  try {
    const { name, server, port, databaseName, username, password, encrypt: enc, trustServerCert, isActive } = req.body || {};
    const pool = await getPool('ADMIN');

    let passwordEncrypted;
    if (password) {
      passwordEncrypted = encrypt(password);
    } else {
      const existing = await pool.request().input('id', sql.Int, req.params.id)
        .query('SELECT PasswordEncrypted FROM api.DataSources WHERE Id = @id');
      passwordEncrypted = existing.recordset[0]?.PasswordEncrypted;
    }

    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('name', sql.NVarChar(200), name)
      .input('server', sql.NVarChar(200), server)
      .input('port', sql.Int, port)
      .input('databaseName', sql.NVarChar(100), databaseName)
      .input('username', sql.NVarChar(100), username)
      .input('passwordEncrypted', sql.NVarChar(500), passwordEncrypted)
      .input('encryptConn', sql.Bit, enc === false ? 0 : 1)
      .input('trustServerCert', sql.Bit, trustServerCert ? 1 : 0)
      .input('isActive', sql.Bit, isActive ? 1 : 0)
      .query(`
        UPDATE api.DataSources
        SET Name = @name, Server = @server, Port = @port, DatabaseName = @databaseName,
            Username = @username, PasswordEncrypted = @passwordEncrypted,
            Encrypt = @encryptConn, TrustServerCert = @trustServerCert, IsActive = @isActive
        WHERE Id = @id
      `);
    await invalidate(parseInt(req.params.id, 10));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAdminRole, async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM api.DataSources WHERE Id = @id');
    await invalidate(parseInt(req.params.id, 10));
    res.json({ ok: true });
  } catch (err) {
    if (err.number === 547) return res.status(409).json({ error: 'Nguồn đang được gán cho ít nhất 1 endpoint — bỏ gán trước khi xoá' });
    next(err);
  }
});

router.post('/test', requireAdminRole, async (req, res) => {
  try {
    const { server, port, databaseName, username, password, encrypt: enc, trustServerCert } = req.body || {};
    await testConnection({ server, port: port || 1433, database: databaseName, user: username, password, encrypt: enc !== false, trustServerCert });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ===== Gán nguồn cho từng endpoint realtime =====
const KNOWN_ENDPOINTS = ['inventory', 'loyalty', 'vouchers'];

router.get('/realtime-endpoints', async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().query('SELECT Endpoint, DataSourceId FROM api.RealtimeEndpoints');
    const byEndpoint = new Map(result.recordset.map(r => [r.Endpoint, r.DataSourceId]));
    res.json(KNOWN_ENDPOINTS.map(e => ({ endpoint: e, dataSourceId: byEndpoint.get(e) || null })));
  } catch (err) { next(err); }
});

router.put('/realtime-endpoints/:endpoint', requireAdminRole, async (req, res, next) => {
  try {
    if (!KNOWN_ENDPOINTS.includes(req.params.endpoint)) return res.status(400).json({ error: 'Endpoint không hợp lệ' });
    const { dataSourceId } = req.body || {};
    if (!dataSourceId) return res.status(400).json({ error: 'Thiếu dataSourceId' });

    const pool = await getPool('ADMIN');
    await pool.request()
      .input('endpoint', sql.VarChar(50), req.params.endpoint)
      .input('dataSourceId', sql.Int, dataSourceId)
      .query(`
        MERGE api.RealtimeEndpoints AS target
        USING (SELECT @endpoint AS Endpoint) AS src ON target.Endpoint = src.Endpoint
        WHEN MATCHED THEN UPDATE SET DataSourceId = @dataSourceId
        WHEN NOT MATCHED THEN INSERT (Endpoint, DataSourceId) VALUES (@endpoint, @dataSourceId);
      `);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
