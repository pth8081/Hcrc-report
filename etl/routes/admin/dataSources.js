// routes/admin/dataSources.js — Trang "Nguồn dữ liệu": CRUD etl.DataSources
// + duyệt schema thật (bảng/cột/khoá ngoại) + kiểm tra kết nối. Mật khẩu
// KHÔNG BAO GIỜ trả về nguyên văn; sửa mà không gửi password thì giữ nguyên
// giá trị mã hoá cũ.
//
// POST /import — tạo/cập nhật HÀNG LOẠT qua file Excel (xem
// lib/dataSourcesImport.js) — dành cho khi cần khai báo nhiều nguồn cùng
// cấu trúc (vd hàng chục chi nhánh) mà không muốn bấm form từng cái, hoặc
// muốn script hoá việc cấp phát/đổi cấu hình kết nối. Khoá để cập nhật thay
// vì tạo trùng là "Name" — chạy lại file với 1 dòng sửa thì chỉ dòng đó đổi.
const express = require('express');
const multer = require('multer');
const { sql, getPool } = require('../../db');
const { requireAdminAuth, requireAdminRole } = require('../../lib/adminAuth');
const { encrypt } = require('../../lib/crypto');
const { invalidate, testConnection } = require('../../lib/dataSourcePool');
const schemaBrowser = require('../../lib/schemaBrowser');
const { parseDataSourcesFile, upsertDataSources } = require('../../lib/dataSourcesImport');

const router = express.Router();
router.use(requireAdminAuth);

// memoryStorage — chỉ đọc để parse ngay trong bộ nhớ, KHÔNG lưu file gốc lên
// đĩa (file chứa mật khẩu thật dạng chữ thường, xem lib/dataSourcesImport.js).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.xlsx$/i.test(file.originalname);
    cb(ok ? null : new Error('Chỉ nhận file .xlsx'), ok);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().query(`
      SELECT Id, Name, Engine, Server, Port, DatabaseName, Username, Encrypt, TrustServerCert, IsActive, CreatedAt
      FROM etl.DataSources ORDER BY Name
    `);
    res.json(result.recordset);
  } catch (err) { next(err); }
});

router.post('/', requireAdminRole, async (req, res, next) => {
  try {
    const { name, engine, server, port, databaseName, username, password, encrypt: enc, trustServerCert } = req.body || {};
    if (!name || !engine || !server || !databaseName || !username || !password) {
      return res.status(400).json({ error: 'Thiếu name/engine/server/databaseName/username/password' });
    }
    const pool = await getPool('ADMIN');
    const result = await pool.request()
      .input('name', sql.NVarChar(200), name)
      .input('engine', sql.VarChar(20), engine)
      .input('server', sql.NVarChar(200), server)
      .input('port', sql.Int, port || (engine === 'mysql' ? 3306 : 1433))
      .input('databaseName', sql.NVarChar(100), databaseName)
      .input('username', sql.NVarChar(100), username)
      .input('passwordEncrypted', sql.NVarChar(500), encrypt(password))
      .input('encryptConn', sql.Bit, enc === false ? 0 : 1)
      .input('trustServerCert', sql.Bit, trustServerCert ? 1 : 0)
      .query(`
        INSERT INTO etl.DataSources (Name, Engine, Server, Port, DatabaseName, Username, PasswordEncrypted, Encrypt, TrustServerCert)
        OUTPUT INSERTED.Id
        VALUES (@name, @engine, @server, @port, @databaseName, @username, @passwordEncrypted, @encryptConn, @trustServerCert)
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
        .query('SELECT PasswordEncrypted FROM etl.DataSources WHERE Id = @id');
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
        UPDATE etl.DataSources
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
    await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM etl.DataSources WHERE Id = @id');
    await invalidate(parseInt(req.params.id, 10));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Thử một cấu hình CHƯA lưu — nút "Kiểm tra kết nối".
router.post('/test', requireAdminRole, async (req, res) => {
  try {
    const { engine, server, port, databaseName, username, password, encrypt: enc, trustServerCert } = req.body || {};
    await testConnection({ engine, server, port, database: databaseName, user: username, password, encrypt: enc !== false, trustServerCert });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// Tạo/cập nhật hàng loạt qua file Excel — xem chú thích đầu file.
router.post('/import', requireAdminRole, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Thiếu file' });

    let parsed;
    try {
      parsed = await parseDataSourcesFile(req.file.buffer);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    const { rows, rowErrors } = parsed;
    if (!rows.length) return res.status(400).json({ error: 'Không có dòng hợp lệ nào để nhập', rowErrors });

    const pool = await getPool('ADMIN');
    const result = await upsertDataSources(pool, rows);
    await Promise.all(result.ids.map(id => invalidate(id)));
    res.json({ inserted: result.inserted, updated: result.updated, rowErrors });
  } catch (err) { next(err); }
});

// ===== Duyệt schema thật =====
router.get('/:id/tables', async (req, res, next) => {
  try {
    res.json(await schemaBrowser.listTables(req.params.id));
  } catch (err) { next(err); }
});

router.get('/:id/tables/:schemaName/:tableName/columns', async (req, res, next) => {
  try {
    res.json(await schemaBrowser.listColumns(req.params.id, req.params.schemaName, req.params.tableName));
  } catch (err) { next(err); }
});

router.get('/:id/tables/:schemaName/:tableName/foreign-keys', async (req, res, next) => {
  try {
    res.json(await schemaBrowser.listForeignKeys(req.params.id, req.params.schemaName, req.params.tableName));
  } catch (err) { next(err); }
});

module.exports = router;
