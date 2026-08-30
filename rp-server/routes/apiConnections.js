// routes/apiConnections.js — Kết nối tới API Server (app.ApiConnections) —
// quản lý trong trang "Biểu mẫu" (cùng chỗ chọn ApiConnectionId cho một báo
// cáo SourceType 'apiReport'/'apiRealtime'). ApiKey KHÔNG BAO GIỜ trả về
// nguyên văn; sửa mà không gửi apiKey thì giữ nguyên giá trị mã hoá cũ.
const express = require('express');
const { sql, getPool } = require('../db');
const { requireAuth, requireMenuAccess } = require('../lib/auth');
const { encrypt } = require('../lib/crypto');
const { invalidate, testConnection } = require('../lib/apiConnectionPool');
const { logAction } = require('../lib/auditLog');

const router = express.Router();
router.use(requireAuth, requireMenuAccess('system-report-catalog'));

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const result = await pool.request().query('SELECT Id, Name, BaseUrl, CreatedAt FROM app.ApiConnections ORDER BY Name');
    res.json(result.recordset);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, baseUrl, apiKey } = req.body || {};
    if (!name || !baseUrl || !apiKey) return res.status(400).json({ error: 'Thiếu name/baseUrl/apiKey' });

    const pool = await getPool('RP');
    const result = await pool.request()
      .input('name', sql.NVarChar(200), name)
      .input('baseUrl', sql.NVarChar(300), baseUrl)
      .input('apiKeyEncrypted', sql.NVarChar(500), encrypt(apiKey))
      .query(`
        INSERT INTO app.ApiConnections (Name, BaseUrl, ApiKeyEncrypted)
        OUTPUT INSERTED.Id
        VALUES (@name, @baseUrl, @apiKeyEncrypted)
      `);
    await logAction(req, { module: 'Biểu mẫu', actionType: 'TAO_KET_NOI_API', targetObject: name, description: `Tạo kết nối API "${name}"` });
    res.status(201).json({ id: result.recordset[0].Id });
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, baseUrl, apiKey } = req.body || {};
    const pool = await getPool('RP');

    let apiKeyEncrypted;
    if (apiKey) {
      apiKeyEncrypted = encrypt(apiKey);
    } else {
      const existing = await pool.request().input('id', sql.Int, req.params.id)
        .query('SELECT ApiKeyEncrypted FROM app.ApiConnections WHERE Id = @id');
      apiKeyEncrypted = existing.recordset[0]?.ApiKeyEncrypted;
    }

    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('name', sql.NVarChar(200), name)
      .input('baseUrl', sql.NVarChar(300), baseUrl)
      .input('apiKeyEncrypted', sql.NVarChar(500), apiKeyEncrypted)
      .query('UPDATE app.ApiConnections SET Name = @name, BaseUrl = @baseUrl, ApiKeyEncrypted = @apiKeyEncrypted WHERE Id = @id');
    invalidate(parseInt(req.params.id, 10));
    await logAction(req, { module: 'Biểu mẫu', actionType: 'SUA_KET_NOI_API', targetObject: req.params.id, description: `Cập nhật kết nối API #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM app.ApiConnections WHERE Id = @id');
    invalidate(parseInt(req.params.id, 10));
    await logAction(req, { module: 'Biểu mẫu', actionType: 'XOA_KET_NOI_API', targetObject: req.params.id, description: `Xoá kết nối API #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) {
    if (err.number === 547) return res.status(409).json({ error: 'Kết nối đang được ít nhất 1 báo cáo dùng — bỏ gán trước khi xoá' });
    next(err);
  }
});

// Thử kết nối một cấu hình CHƯA lưu (nút "Kiểm tra kết nối") — chỉ ping
// /v1/health (không cần key thật), không lưu gì.
router.post('/test', async (req, res) => {
  try {
    const { baseUrl } = req.body || {};
    if (!baseUrl) return res.status(400).json({ ok: false, error: 'Thiếu baseUrl' });
    await testConnection({ baseUrl });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

module.exports = router;
