// routes/admin/dataSources.js — Trang "Nguồn dữ liệu": CRUD api.DataSources
// (kết nối CSDL OLTP thật, thay OLTP_* tĩnh trong .env) + duyệt schema thật
// của một nguồn (bảng/view, cột) — dùng ở bước "chọn bảng" khi admin định
// nghĩa một endpoint realtime (xem routes/admin/realtimeEndpoints.js,
// lib/schemaBrowser.js). Gán nguồn cho TỪNG ENDPOINT không còn ở đây — mỗi
// endpoint tự khai báo DataSourceId của nó khi tạo (routes/admin/realtimeEndpoints.js),
// vì giờ 1 endpoint không chỉ cần 1 nguồn mà còn cần bảng/cột/khoá cụ thể.
// Mật khẩu KHÔNG BAO GIỜ trả về nguyên văn.
//
// POST/PUT tự động gọi testConnection() NGAY sau khi lưu — không bắt admin
// bấm riêng nút "Kiểm tra kết nối" nữa. KHÔNG chặn lưu nếu kết nối lỗi (vd
// khai báo trước cấu hình khi DB/firewall chưa mở kịp vẫn lưu được) — chỉ trả
// kèm `connectionTest: {ok, error?}` để admin biết ngay.
//
// POST /import — tạo/cập nhật HÀNG LOẠT qua file Excel (xem
// lib/dataSourcesImport.js) — dành cho khi cần khai báo nhiều nguồn cùng
// cấu trúc (vd hàng chục chi nhánh) mà không muốn bấm form từng cái, hoặc
// muốn script hoá việc cấp phát/đổi cấu hình kết nối. Khoá để cập nhật thay
// vì tạo trùng là "Name" — chạy lại file với 1 dòng sửa thì chỉ dòng đó đổi.
// Cũng test kết nối cho TỪNG dòng ngay sau khi ghi (song song có giới hạn,
// xem testConnectionsBatch) — trả `connectionResults` theo tên từng dòng,
// không chặn ghi dòng nào.
const express = require('express');
const multer = require('multer');
const { sql, getPool } = require('../../db');
const { requireAdminAuth, requireAdminRole } = require('../../lib/adminAuth');
const { encrypt, decrypt } = require('../../lib/crypto');
const { invalidate, testConnection, testConnectionsBatch } = require('../../lib/dataSourcePool');
const schemaBrowser = require('../../lib/schemaBrowser');
const { parseDataSourcesFile, upsertDataSources } = require('../../lib/dataSourcesImport');
const { logAction } = require('../../lib/auditLog');
const { hasZipSignature } = require('../../lib/fileSignature');

// Chạy testConnection() nhưng KHÔNG BAO GIỜ throw — dùng ngay sau khi lưu,
// lỗi kết nối không được làm hỏng response lưu-thành-công.
async function tryTestConnection(config) {
  try {
    await testConnection(config);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

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
    const id = result.recordset[0].Id;
    const connectionTest = await tryTestConnection({
      server, port: port || 1433, database: databaseName, user: username, password, encrypt: enc !== false, trustServerCert
    });
    await logAction(req, { module: 'Nguồn dữ liệu', actionType: 'TAO_NGUON', targetObject: String(id), description: `Tạo nguồn "${name}"` });
    res.status(201).json({ id, connectionTest });
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
      if (!existing.recordset.length) return res.status(404).json({ error: 'Không tìm thấy nguồn dữ liệu' });
      passwordEncrypted = existing.recordset[0].PasswordEncrypted;
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
    const connectionTest = await tryTestConnection({
      server, port, database: databaseName, user: username,
      password: password || decrypt(passwordEncrypted), encrypt: enc !== false, trustServerCert
    });
    await logAction(req, { module: 'Nguồn dữ liệu', actionType: 'SUA_NGUON', targetObject: req.params.id, description: `Cập nhật nguồn "${name}"` });
    res.json({ ok: true, connectionTest });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAdminRole, async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM api.DataSources WHERE Id = @id');
    await invalidate(parseInt(req.params.id, 10));
    await logAction(req, { module: 'Nguồn dữ liệu', actionType: 'XOA_NGUON', targetObject: req.params.id, description: `Xoá nguồn dữ liệu #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) {
    if (err.number === 547) return res.status(409).json({ error: 'Nguồn đang được ít nhất 1 endpoint realtime dùng — xoá endpoint đó trước' });
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

// Tạo/cập nhật hàng loạt qua file Excel — xem chú thích đầu file.
router.post('/import', requireAdminRole, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Thiếu file' });
    // fileFilter (đuôi .xlsx) chỉ soi được originalname, CHƯA có nội dung —
    // kiểm tra thêm chữ ký ZIP thật của file trước khi đưa vào ExcelJS,
    // chặn file đổi đuôi giả mạo (xem lib/fileSignature.js).
    if (!hasZipSignature(req.file.buffer)) {
      return res.status(400).json({ error: 'File không đúng định dạng .xlsx (sai chữ ký file)' });
    }

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

    const connectionResults = await testConnectionsBatch(rows.map(r => ({
      name: r.name,
      config: { server: r.server, port: r.port, database: r.databaseName, user: r.username, password: r.password, encrypt: r.encrypt, trustServerCert: r.trustServerCert }
    })));

    await logAction(req, { module: 'Nguồn dữ liệu', actionType: 'NHAP_HANG_LOAT', description: `Nhập hàng loạt: thêm mới ${result.inserted}, cập nhật ${result.updated} nguồn` });
    res.json({ inserted: result.inserted, updated: result.updated, rowErrors, connectionResults });
  } catch (err) { next(err); }
});

// ===== Duyệt schema thật — dùng khi tạo/sửa 1 endpoint realtime =====
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

module.exports = router;
