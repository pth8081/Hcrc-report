// routes/admin/dataSources.js — Trang "Nguồn dữ liệu": CRUD etl.DataSources
// + duyệt schema thật (bảng/cột/khoá ngoại) + kiểm tra kết nối. Mật khẩu
// KHÔNG BAO GIỜ trả về nguyên văn; sửa mà không gửi password thì giữ nguyên
// giá trị mã hoá cũ.
//
// POST/PUT tự động gọi testConnection() NGAY sau khi lưu — không bắt admin
// bấm riêng nút "Kiểm tra kết nối" nữa. KHÔNG chặn lưu nếu kết nối lỗi (vd
// khai báo trước cấu hình khi DB/firewall chưa mở kịp vẫn lưu được) — chỉ trả
// kèm `connectionTest: {ok, error?}` để admin biết ngay, tự quyết định sửa
// lại hay để đó chờ hạ tầng sẵn sàng.
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
const { requireAdminAuth, requireAdminRole, blockTargetImporter } = require('../../lib/adminAuth');
const { encrypt, decrypt } = require('../../lib/crypto');
const { invalidate, testConnection, testConnectionsBatch } = require('../../lib/dataSourcePool');
const schemaBrowser = require('../../lib/schemaBrowser');
const { parseDataSourcesFile, upsertDataSources } = require('../../lib/dataSourcesImport');
const { summarizeSourceSyncStatus } = require('../../lib/syncStatus');
const { logAction } = require('../../lib/auditLog');

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

// SyncStatus theo TỪNG NGUỒN (xem lib/syncStatus.js) — gộp mọi
// etl.SyncJobs trỏ vào nguồn đó, kèm lần chạy (etl.SyncLog) GẦN NHẤT của
// từng job (OUTER APPLY TOP 1, nhanh hơn nhiều so với self-join + GROUP BY
// khi mỗi job có hàng nghìn dòng log). null = nguồn chưa gắn job nào.
// blockTargetImporter (không chỉ requireAdminAuth) trên MỌI route GET dưới
// đây — 'target_importer' (vai trò hẹp, giao diện đã ẩn hẳn trang này khỏi
// menu) không được đọc host/port/database/username của các kết nối nguồn
// hay duyệt schema thật (tên bảng/cột) dù gọi thẳng API. 'viewer' vẫn xem
// được như cũ (chỉ không sửa) — xem lib/adminAuth.js.
router.get('/', blockTargetImporter, async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const sourcesResult = await pool.request().query(`
      SELECT Id, Name, Engine, Server, Port, DatabaseName, Username, Encrypt, TrustServerCert, IsActive, CreatedAt
      FROM etl.DataSources ORDER BY Name
    `);
    const jobsResult = await pool.request().query(`
      SELECT j.Id, j.DataSourceId, j.CronExpression, j.IsActive,
             l.Status AS LastStatus, l.ErrorMessage AS LastError, l.StartedAt AS LastRunAt
      FROM etl.SyncJobs j
      OUTER APPLY (
        SELECT TOP 1 Status, ErrorMessage, StartedAt
        FROM etl.SyncLog WHERE SyncJobId = j.Id ORDER BY StartedAt DESC
      ) l
    `);
    const jobsBySource = new Map();
    for (const j of jobsResult.recordset) {
      if (!jobsBySource.has(j.DataSourceId)) jobsBySource.set(j.DataSourceId, []);
      jobsBySource.get(j.DataSourceId).push(j);
    }
    const now = Date.now();
    res.json(sourcesResult.recordset.map(s => ({
      ...s,
      SyncStatus: summarizeSourceSyncStatus(jobsBySource.get(s.Id), now)
    })));
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
    const id = result.recordset[0].Id;
    const connectionTest = await tryTestConnection({
      engine, server, port: port || (engine === 'mysql' ? 3306 : 1433), database: databaseName,
      user: username, password, encrypt: enc !== false, trustServerCert
    });
    await logAction(req, { module: 'Nguồn dữ liệu', actionType: 'TAO_NGUON', targetObject: String(id), description: `Tạo nguồn "${name}" (${engine})` });
    res.status(201).json({ id, connectionTest });
  } catch (err) { next(err); }
});

router.put('/:id', requireAdminRole, async (req, res, next) => {
  try {
    const { name, server, port, databaseName, username, password, encrypt: enc, trustServerCert, isActive } = req.body || {};
    const pool = await getPool('ADMIN');

    // Luôn đọc Engine hiện có (không đổi được qua PUT — xem chú thích đầu
    // file) để dùng cho testConnection() sau khi lưu; PasswordEncrypted chỉ
    // dùng khi PUT không kèm password mới (giữ nguyên mật khẩu cũ).
    const existing = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT Engine, PasswordEncrypted FROM etl.DataSources WHERE Id = @id');
    if (!existing.recordset.length) return res.status(404).json({ error: 'Không tìm thấy nguồn dữ liệu' });
    const { Engine: engine, PasswordEncrypted: existingPasswordEncrypted } = existing.recordset[0];
    const passwordEncrypted = password ? encrypt(password) : existingPasswordEncrypted;

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
    const connectionTest = await tryTestConnection({
      engine, server, port, database: databaseName, user: username,
      password: password || decrypt(passwordEncrypted), encrypt: enc !== false, trustServerCert
    });
    await logAction(req, { module: 'Nguồn dữ liệu', actionType: 'SUA_NGUON', targetObject: req.params.id, description: `Cập nhật nguồn "${name}"` });
    res.json({ ok: true, connectionTest });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAdminRole, async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM etl.DataSources WHERE Id = @id');
    await invalidate(parseInt(req.params.id, 10));
    await logAction(req, { module: 'Nguồn dữ liệu', actionType: 'XOA_NGUON', targetObject: req.params.id, description: `Xoá nguồn dữ liệu #${req.params.id}` });
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

    const connectionResults = await testConnectionsBatch(rows.map(r => ({
      name: r.name,
      config: { engine: r.engine, server: r.server, port: r.port, database: r.databaseName, user: r.username, password: r.password, encrypt: r.encrypt, trustServerCert: r.trustServerCert }
    })));

    await logAction(req, { module: 'Nguồn dữ liệu', actionType: 'NHAP_HANG_LOAT', description: `Nhập hàng loạt: thêm mới ${result.inserted}, cập nhật ${result.updated} nguồn` });
    res.json({ inserted: result.inserted, updated: result.updated, rowErrors, connectionResults });
  } catch (err) { next(err); }
});

// ===== Duyệt schema thật =====
router.get('/:id/tables', blockTargetImporter, async (req, res, next) => {
  try {
    res.json(await schemaBrowser.listTables(req.params.id));
  } catch (err) { next(err); }
});

router.get('/:id/tables/:schemaName/:tableName/columns', blockTargetImporter, async (req, res, next) => {
  try {
    res.json(await schemaBrowser.listColumns(req.params.id, req.params.schemaName, req.params.tableName));
  } catch (err) { next(err); }
});

router.get('/:id/tables/:schemaName/:tableName/foreign-keys', blockTargetImporter, async (req, res, next) => {
  try {
    res.json(await schemaBrowser.listForeignKeys(req.params.id, req.params.schemaName, req.params.tableName));
  } catch (err) { next(err); }
});

module.exports = router;
