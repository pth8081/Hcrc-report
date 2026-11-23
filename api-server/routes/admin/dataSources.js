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
const { requireAdminAuth } = require('../../lib/adminAuth');
const { requireMenuAccess, requireMenuEdit } = require('../../lib/adminPermissions');
const { encrypt, decrypt } = require('../../lib/crypto');
const { invalidate, testConnection, testConnectionsBatch } = require('../../lib/dataSourcePool');
const schemaBrowser = require('../../lib/schemaBrowser');
const { parseDataSourcesFile, upsertDataSources, buildDataSourcesTemplate, buildDataSourcesExport } = require('../../lib/dataSourcesImport');
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
router.use(requireAdminAuth, requireMenuAccess('data-sources'));

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
    let result;
    try {
      result = await pool.request().query(`
        SELECT Id, Name, Server, Port, DatabaseName, Username, StoreCode, Encrypt, TrustServerCert, IsActive, CreatedAt
        FROM api.DataSources ORDER BY Name
      `);
    } catch (err) {
      // Lỗi 207 "Invalid column name" — CSDL CHƯA chạy lại api-db/schema.sql
      // (cột StoreCode mới thêm bản 11.9) dù code mới đã deploy, LỆCH THỨ
      // TỰ triển khai thật đã gặp (trang "Nguồn dữ liệu" hiện trống/lỗi dù
      // dữ liệu cũ vẫn còn nguyên trong CSDL, ALTER TABLE ADD COLUMN NULL
      // không xoá dòng nào). Tự lùi về SELECT không có StoreCode để trang
      // vẫn hiển thị đủ danh sách cũ trong lúc chờ DBA chạy lại schema.sql,
      // thay vì trả lỗi trắng cả trang.
      if (err.number !== 207) throw err;
      result = await pool.request().query(`
        SELECT Id, Name, Server, Port, DatabaseName, Username, Encrypt, TrustServerCert, IsActive, CreatedAt
        FROM api.DataSources ORDER BY Name
      `);
      result.recordset = result.recordset.map(r => ({ ...r, StoreCode: null }));
    }
    res.json(result.recordset);
  } catch (err) { next(err); }
});

router.post('/', requireMenuEdit('data-sources'), async (req, res, next) => {
  try {
    const { name, server, port, databaseName, username, password, encrypt: enc, trustServerCert, storeCode } = req.body || {};
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
      .input('storeCode', sql.NVarChar(50), storeCode || null)
      .query(`
        INSERT INTO api.DataSources (Name, Server, Port, DatabaseName, Username, PasswordEncrypted, Encrypt, TrustServerCert, StoreCode)
        OUTPUT INSERTED.Id
        VALUES (@name, @server, @port, @databaseName, @username, @passwordEncrypted, @encryptConn, @trustServerCert, @storeCode)
      `);
    const id = result.recordset[0].Id;
    const connectionTest = await tryTestConnection({
      server, port: port || 1433, database: databaseName, user: username, password, encrypt: enc !== false, trustServerCert
    });
    await logAction(req, { module: 'Nguồn dữ liệu', actionType: 'TAO_NGUON', targetObject: String(id), description: `Tạo nguồn "${name}"` });
    res.status(201).json({ id, connectionTest });
  } catch (err) { next(err); }
});

router.put('/:id', requireMenuEdit('data-sources'), async (req, res, next) => {
  try {
    const { name, server, port, databaseName, username, password, encrypt: enc, trustServerCert, isActive, storeCode } = req.body || {};
    if (!name || !server || !databaseName || !username) {
      return res.status(400).json({ error: 'Thiếu name/server/databaseName/username' });
    }
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
      .input('storeCode', sql.NVarChar(50), storeCode || null)
      .query(`
        UPDATE api.DataSources
        SET Name = @name, Server = @server, Port = @port, DatabaseName = @databaseName,
            Username = @username, PasswordEncrypted = @passwordEncrypted,
            Encrypt = @encryptConn, TrustServerCert = @trustServerCert, IsActive = @isActive,
            StoreCode = @storeCode
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

router.delete('/:id', requireMenuEdit('data-sources'), async (req, res, next) => {
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

// Nhân bản (bản 9.22, theo yêu cầu người dùng) — tạo 1 nguồn MỚI copy
// NGUYÊN VẸN mọi cột (kể cả PasswordEncrypted ĐÃ MÃ HOÁ) từ nguồn gốc, CHỈ
// đổi Name — không giải mã, không lộ mật khẩu qua request body.
router.post('/:id/duplicate', requireMenuEdit('data-sources'), async (req, res, next) => {
  try {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Thiếu name (tên bản sao mới)' });
    const pool = await getPool('ADMIN');
    const existing = await pool.request().input('id', sql.Int, req.params.id).query(`
      SELECT Server, Port, DatabaseName, Username, PasswordEncrypted, Encrypt, TrustServerCert, IsActive, StoreCode
      FROM api.DataSources WHERE Id = @id
    `);
    if (!existing.recordset.length) return res.status(404).json({ error: 'Không tìm thấy nguồn dữ liệu' });
    const src = existing.recordset[0];
    const result = await pool.request()
      .input('name', sql.NVarChar(200), name)
      .input('server', sql.NVarChar(200), src.Server)
      .input('port', sql.Int, src.Port)
      .input('databaseName', sql.NVarChar(100), src.DatabaseName)
      .input('username', sql.NVarChar(100), src.Username)
      .input('passwordEncrypted', sql.NVarChar(500), src.PasswordEncrypted)
      .input('encryptConn', sql.Bit, src.Encrypt)
      .input('trustServerCert', sql.Bit, src.TrustServerCert)
      .input('isActive', sql.Bit, src.IsActive)
      .input('storeCode', sql.NVarChar(50), src.StoreCode)
      .query(`
        INSERT INTO api.DataSources (Name, Server, Port, DatabaseName, Username, PasswordEncrypted, Encrypt, TrustServerCert, IsActive, StoreCode)
        OUTPUT INSERTED.Id
        VALUES (@name, @server, @port, @databaseName, @username, @passwordEncrypted, @encryptConn, @trustServerCert, @isActive, @storeCode)
      `);
    const id = result.recordset[0].Id;
    await logAction(req, { module: 'Nguồn dữ liệu', actionType: 'NHAN_BAN_NGUON', targetObject: String(id), description: `Nhân bản nguồn "${name}" từ #${req.params.id}` });
    res.status(201).json({ id });
  } catch (err) { next(err); }
});

router.post('/test', requireMenuEdit('data-sources'), async (req, res) => {
  try {
    const { server, port, databaseName, username, password, encrypt: enc, trustServerCert } = req.body || {};
    await testConnection({ server, port: port || 1433, database: databaseName, user: username, password, encrypt: enc !== false, trustServerCert });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// Tải file mẫu (.xlsx) cho "Nhập hàng loạt" — đúng cột REQUIRED/tuỳ chọn mà
// parseDataSourcesFile() đọc, kèm 1 dòng ví dụ (xem buildDataSourcesTemplate).
// POST (không phải GET) — mirror quy ước rp-server/routes/departmentStoreMapping.js
// (api-admin/src/lib/api.js:downloadFile() gửi POST).
router.post('/template', requireMenuEdit('data-sources'), async (req, res, next) => {
  try {
    const buffer = await buildDataSourcesTemplate();
    res.attachment('mau-nguon-du-lieu.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) { next(err); }
});

// Xuất danh sách nguồn dữ liệu hiện có ra .xlsx — KHÔNG kèm Password (xem
// chú thích buildDataSourcesExport) — dùng để rà soát cấu hình hiện tại,
// không dùng trực tiếp để nhập lại (phải tự điền Password trước).
router.post('/export', requireMenuEdit('data-sources'), async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().query(`
      SELECT Name, Server, Port, DatabaseName, Username, Encrypt, TrustServerCert, StoreCode
      FROM api.DataSources ORDER BY Name
    `);
    const buffer = await buildDataSourcesExport(result.recordset.map(r => ({
      name: r.Name, server: r.Server, port: r.Port, databaseName: r.DatabaseName, username: r.Username,
      encrypt: r.Encrypt, trustServerCert: r.TrustServerCert, storeCode: r.StoreCode
    })));
    res.attachment('nguon-du-lieu.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) { next(err); }
});

// Tạo/cập nhật hàng loạt qua file Excel — xem chú thích đầu file.
router.post('/import', requireMenuEdit('data-sources'), upload.single('file'), async (req, res, next) => {
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
