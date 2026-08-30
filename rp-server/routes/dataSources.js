// routes/dataSources.js — Nguồn dữ liệu bổ sung cho báo cáo (mục 05 tài liệu
// kiến trúc) — quản lý trong trang "Biểu mẫu" (cùng chỗ chọn DataSourceId cho
// một báo cáo). Mật khẩu KHÔNG BAO GIỜ trả về nguyên văn; sửa mà không gửi
// password thì giữ nguyên giá trị mã hoá cũ.
const express = require('express');
const { sql, getPool } = require('../db');
const { requireAuth, requireMenuAccess } = require('../lib/auth');
const { encrypt } = require('../lib/crypto');
const { invalidate, testConnection } = require('../lib/dataSourcePool');
const { logAction } = require('../lib/auditLog');

const router = express.Router();
router.use(requireAuth, requireMenuAccess('system-report-catalog'));

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const result = await pool.request().query(`
      SELECT Id, Name, Server, Port, DatabaseName, Username, Encrypt, TrustServerCert, CreatedAt
      FROM app.ReportDataSources ORDER BY Name
    `);
    res.json(result.recordset);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, server, port, databaseName, username, password, encrypt: enc, trustServerCert } = req.body || {};
    if (!name || !server || !databaseName || !username || !password) {
      return res.status(400).json({ error: 'Thiếu name/server/databaseName/username/password' });
    }
    const pool = await getPool('RP');
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
        INSERT INTO app.ReportDataSources (Name, Server, Port, DatabaseName, Username, PasswordEncrypted, Encrypt, TrustServerCert)
        OUTPUT INSERTED.Id
        VALUES (@name, @server, @port, @databaseName, @username, @passwordEncrypted, @encryptConn, @trustServerCert)
      `);
    await logAction(req, { module: 'Biểu mẫu', actionType: 'TAO_NGUON_DU_LIEU', targetObject: name, description: `Tạo nguồn dữ liệu "${name}"` });
    res.status(201).json({ id: result.recordset[0].Id });
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, server, port, databaseName, username, password, encrypt: enc, trustServerCert } = req.body || {};
    const pool = await getPool('RP');

    let passwordEncrypted;
    if (password) {
      passwordEncrypted = encrypt(password);
    } else {
      const existing = await pool.request().input('id', sql.Int, req.params.id)
        .query('SELECT PasswordEncrypted FROM app.ReportDataSources WHERE Id = @id');
      passwordEncrypted = existing.recordset[0]?.PasswordEncrypted;
    }

    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('name', sql.NVarChar(200), name)
      .input('server', sql.NVarChar(200), server)
      .input('port', sql.Int, port || 1433)
      .input('databaseName', sql.NVarChar(100), databaseName)
      .input('username', sql.NVarChar(100), username)
      .input('passwordEncrypted', sql.NVarChar(500), passwordEncrypted)
      .input('encryptConn', sql.Bit, enc === false ? 0 : 1)
      .input('trustServerCert', sql.Bit, trustServerCert ? 1 : 0)
      .query(`
        UPDATE app.ReportDataSources
        SET Name = @name, Server = @server, Port = @port, DatabaseName = @databaseName,
            Username = @username, PasswordEncrypted = @passwordEncrypted,
            Encrypt = @encryptConn, TrustServerCert = @trustServerCert
        WHERE Id = @id
      `);
    await invalidate(parseInt(req.params.id, 10)); // đóng pool cũ — lần đọc sau kết nối lại với thông tin mới
    await logAction(req, { module: 'Biểu mẫu', actionType: 'SUA_NGUON_DU_LIEU', targetObject: req.params.id, description: `Cập nhật nguồn dữ liệu #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM app.ReportDataSources WHERE Id = @id');
    await invalidate(parseInt(req.params.id, 10));
    await logAction(req, { module: 'Biểu mẫu', actionType: 'XOA_NGUON_DU_LIEU', targetObject: req.params.id, description: `Xoá nguồn dữ liệu #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Thử kết nối một cấu hình CHƯA lưu — nút "Kiểm tra kết nối" trên form thêm/sửa.
router.post('/test', async (req, res, next) => {
  try {
    const { server, port, databaseName, username, password, encrypt: enc, trustServerCert } = req.body || {};
    await testConnection({ server, port: port || 1433, databaseName, username, password, encrypt: enc !== false, trustServerCert });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

module.exports = router;
