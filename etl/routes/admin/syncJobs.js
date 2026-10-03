// routes/admin/syncJobs.js — Trang "Đồng bộ": CRUD etl.SyncJobs (Type='table'
// dựng từ bước duyệt schema trên etl-admin/, Type='custom' tham chiếu
// connector có sẵn trong etl/sources/) + chạy thử ngay một job. Sửa (PUT) chỉ
// cho đổi tên/lịch/bật-tắt/domain/giữ lịch sử/ánh xạ mã chi nhánh/cột
// Dimensions-Measures — đổi bảng nguồn hay bảng liên kết thì xoá job cũ, tạo
// job mới (đơn giản hơn, tránh cấu hình nửa vời).
//
// Job Type='table' được đối chiếu với schema THẬT của nguồn ngay lúc LƯU
// (POST/PUT, xem assertTableConfigMatchesSchema/validateTableJobSchema bên
// dưới) — dùng chung lib/schemaBrowser.js với dropdown trên etl-admin/, nên
// cấu hình gõ tay/tạo qua script vẫn bị chặn ngay nếu sai tên bảng/cột, không
// đợi tới lúc job chạy mới lộ ra. assertSafeIdentifier trong
// lib/tableSyncEngine.js vẫn là lớp chống chèn SQL ở tầng chạy job — kiểm tra
// ở đây không thay thế được lớp đó (schema có thể đổi giữa lúc lưu và lúc
// chạy).
const express = require('express');
const cron = require('node-cron');
const { sql, getPool } = require('../../db');
const { requireAdminAuth } = require('../../lib/adminAuth');
const { requireMenuAccess, requireMenuEdit } = require('../../lib/adminPermissions');
const sourcesRegistry = require('../../sources');
const { rescheduleJob, runJobIfNotAlreadyRunning } = require('../../jobs/scheduler');
const { assertTableConfigMatchesSchema, validateTableJobSchema } = require('../../lib/syncJobSchemaValidation');
const { parseSyncJobsFile, upsertSyncJobs, buildSyncJobsTemplate } = require('../../lib/syncJobsImport');
const { sendXlsx } = require('../../lib/xlsxResponse');
const { logAction } = require('../../lib/auditLog');
const multer = require('multer');
const { hasZipSignature } = require('../../lib/fileSignature');

const router = express.Router();
router.use(requireAdminAuth);

// memoryStorage — giống hệt routes/admin/dataSources.js: chỉ đọc để parse
// trong bộ nhớ, không ghi file gốc ra đĩa. File Sync Job KHÔNG chứa mật khẩu
// (chỉ tham chiếu Nguồn dữ liệu theo Tên) nên không cần cảnh báo xoá file
// sau khi dùng như file Nguồn dữ liệu.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.xlsx$/i.test(file.originalname);
    cb(ok ? null : new Error('Chỉ nhận file .xlsx'), ok);
  }
});

// requireMenuAccess('sync-jobs') (không chỉ requireAdminAuth) — vai trò
// không được cấp trang này (vd 'target_importer' cũ) không được thấy cấu
// hình đồng bộ dù gọi thẳng API — xem lib/adminPermissions.js.
router.get('/', requireMenuAccess('sync-jobs'), async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().query('SELECT * FROM etl.SyncJobs ORDER BY Name');
    res.json(result.recordset);
  } catch (err) { next(err); }
});

// Danh sách connector "tuỳ biến" có sẵn trong code — dùng khi tạo job Type='custom'.
router.get('/custom-connectors', requireMenuAccess('sync-jobs'), (req, res) => {
  res.json(sourcesRegistry.map(s => ({ key: s.key, label: s.label, domain: s.domain })));
});

// Tải "file mẫu" — 2 dòng ví dụ sẵn đúng khuôn báo cáo doanh thu Thành
// viên (xem chú thích buildSyncJobsTemplate() trong lib/syncJobsImport.js).
router.get('/template', requireMenuAccess('sync-jobs'), async (req, res, next) => {
  try {
    const buffer = await buildSyncJobsTemplate();
    sendXlsx(res, buffer, 'mau-sync-jobs.xlsx');
  } catch (err) { next(err); }
});

// Tạo/cập nhật hàng loạt qua file Excel — xem chú thích đầu lib/syncJobsImport.js.
// CHỈ Type='table', đối chiếu schema thật TỪNG DÒNG (gọi mạng) nên chạy tuần
// tự, phù hợp quy mô thật (vài chục/vài trăm job, không phải hàng nghìn).
router.post('/import', requireMenuEdit('sync-jobs'), upload.single('file'), async (req, res, next) => {
  // Tắt timeout socket riêng cho route này — server.js đặt server.timeout =
  // 120s (chống socket "chờ mãi" cho các route BÌNH THƯỜNG) nhưng route này
  // đối chiếu schema THẬT của TỪNG DÒNG qua mạng, CHẠY TUẦN TỰ (không song
  // song) — vài chục site "Thành viên" (vd 68 dòng) dễ vượt 120s, Node tự
  // đóng socket giữa chừng dù backend vẫn đang xử lý bình thường, client
  // thấy mất kết nối đột ngột ("Failed to fetch"/"Không kết nối được
  // backend" tuỳ qua Nginx hay serve-static.js — lỗi thật đã gặp, xem
  // VERSION.md bản 8.33/8.35). Đã nâng timeout Nginx (deploy/nginx.conf)
  // nhưng KHÔNG đủ — đây mới là nơi thật sự đóng socket trước khi tới được
  // Nginx/serve-static.js.
  req.socket.setTimeout(0);
  try {
    if (!req.file) return res.status(400).json({ error: 'Thiếu file' });
    if (!hasZipSignature(req.file.buffer)) {
      return res.status(400).json({ error: 'File không đúng định dạng .xlsx (sai chữ ký file)' });
    }

    let parsed;
    try {
      parsed = await parseSyncJobsFile(req.file.buffer);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    const { rows, rowErrors: fileErrors } = parsed;
    if (!rows.length) return res.status(400).json({ error: 'Không có dòng hợp lệ nào để nhập', rowErrors: fileErrors });

    const pool = await getPool('ADMIN');
    const result = await upsertSyncJobs(pool, rows);
    await Promise.all(result.ids.map(id => rescheduleJob(id)));

    await logAction(req, { module: 'Đồng bộ', actionType: 'NHAP_HANG_LOAT', description: `Nhập hàng loạt: thêm mới ${result.inserted}, cập nhật ${result.updated} job đồng bộ` });
    res.json({ inserted: result.inserted, updated: result.updated, rowErrors: [...fileErrors, ...result.rowErrors] });
  } catch (err) { next(err); }
});

router.post('/', requireMenuEdit('sync-jobs'), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.name || !b.type || !b.dataSourceId || !b.targetDomain) {
      return res.status(400).json({ error: 'Thiếu name/type/dataSourceId/targetDomain' });
    }
    if (b.type === 'table' && (!b.sourceSchema || !b.sourceTable || !b.keyColumn || !b.dateColumn || !b.updatedAtColumn)) {
      return res.status(400).json({ error: 'Job Type="table" thiếu sourceSchema/sourceTable/keyColumn/dateColumn/updatedAtColumn' });
    }
    if (b.type === 'custom' && !b.customConnectorKey) {
      return res.status(400).json({ error: 'Job Type="custom" thiếu customConnectorKey' });
    }
    // jobs/scheduler.js:registerJob() cũng gọi cron.validate() trước khi
    // đăng ký — nhưng lỗi ở đó chỉ console.error() rồi bỏ qua (job coi như
    // TẮT, không có cron nào chạy), KHÔNG có gì báo lại cho admin thấy trên
    // giao diện. Lưu job xong tưởng đã bật, job không bao giờ tự chạy —
    // chặn ngay lúc lưu để admin thấy lỗi rõ ràng thay vì phải soi log server.
    if (b.cronExpression && !cron.validate(b.cronExpression)) {
      return res.status(400).json({ error: `Lịch chạy (cron) không hợp lệ: "${b.cronExpression}"` });
    }
    if (b.type === 'table') {
      try {
        await validateTableJobSchema(b);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }

    const pool = await getPool('ADMIN');
    const result = await pool.request()
      .input('name', sql.NVarChar(200), b.name)
      .input('type', sql.VarChar(10), b.type)
      .input('dataSourceId', sql.Int, b.dataSourceId)
      .input('sourceSchema', sql.NVarChar(100), b.sourceSchema || null)
      .input('sourceTable', sql.NVarChar(100), b.sourceTable || null)
      .input('keyColumn', sql.NVarChar(100), b.keyColumn || null)
      .input('dateColumn', sql.NVarChar(100), b.dateColumn || null)
      .input('updatedAtColumn', sql.NVarChar(100), b.updatedAtColumn || null)
      .input('dimensionColumnsJson', sql.NVarChar(sql.MAX), JSON.stringify(b.dimensionColumns || []))
      .input('measureColumnsJson', sql.NVarChar(sql.MAX), JSON.stringify(b.measureColumns || []))
      .input('joinSchema', sql.NVarChar(100), b.joinSchema || null)
      .input('joinTable', sql.NVarChar(100), b.joinTable || null)
      .input('joinType', sql.VarChar(5), b.joinType || null)
      .input('mainJoinColumn', sql.NVarChar(100), b.mainJoinColumn || null)
      .input('lookupJoinColumn', sql.NVarChar(100), b.lookupJoinColumn || null)
      .input('lookupDimensionColumnsJson', sql.NVarChar(sql.MAX), JSON.stringify(b.lookupDimensionColumns || []))
      .input('customConnectorKey', sql.VarChar(50), b.customConnectorKey || null)
      .input('targetDomain', sql.VarChar(50), b.targetDomain)
      .input('cronExpression', sql.VarChar(50), b.cronExpression || '*/15 * * * *')
      .input('keepHistory', sql.Bit, b.keepHistory ? 1 : 0)
      .query(`
        INSERT INTO etl.SyncJobs (
          Name, Type, DataSourceId, SourceSchema, SourceTable, KeyColumn, DateColumn, UpdatedAtColumn,
          DimensionColumnsJson, MeasureColumnsJson, JoinSchema, JoinTable, JoinType, MainJoinColumn,
          LookupJoinColumn, LookupDimensionColumnsJson, CustomConnectorKey, TargetDomain, CronExpression, KeepHistory
        )
        OUTPUT INSERTED.Id
        VALUES (
          @name, @type, @dataSourceId, @sourceSchema, @sourceTable, @keyColumn, @dateColumn, @updatedAtColumn,
          @dimensionColumnsJson, @measureColumnsJson, @joinSchema, @joinTable, @joinType, @mainJoinColumn,
          @lookupJoinColumn, @lookupDimensionColumnsJson, @customConnectorKey, @targetDomain, @cronExpression, @keepHistory
        )
      `);
    const id = result.recordset[0].Id;
    await rescheduleJob(id);
    await logAction(req, { module: 'Đồng bộ', actionType: 'TAO_JOB', targetObject: String(id), description: `Tạo job đồng bộ "${b.name}"` });
    res.status(201).json({ id });
  } catch (err) { next(err); }
});

router.put('/:id', requireMenuEdit('sync-jobs'), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.name || !b.targetDomain) {
      return res.status(400).json({ error: 'Thiếu name/targetDomain' });
    }
    const pool = await getPool('ADMIN');
    const jobId = parseInt(req.params.id, 10);
    const existing = await pool.request().input('id', sql.Int, jobId)
      .query('SELECT Type, DataSourceId, SourceSchema, SourceTable, LookupDimensionColumnsJson FROM etl.SyncJobs WHERE Id = @id');
    if (!existing.recordset.length) return res.status(404).json({ error: 'Không tìm thấy job' });
    if (b.cronExpression && !cron.validate(b.cronExpression)) {
      return res.status(400).json({ error: `Lịch chạy (cron) không hợp lệ: "${b.cronExpression}"` });
    }
    const job = existing.recordset[0];
    if (job.Type === 'table') {
      // PUT không cho sửa bảng liên kết/LookupDimensionColumns (chỉ tạo mới
      // job mới nếu cần đổi) — nhưng CÓ cho sửa dimensionColumns bảng chính,
      // nên vẫn phải đối chiếu tên mới với LookupDimensionColumns CŨ đang có
      // sẵn của job này (xem chú thích trùng tên ở validateTableJobSchema).
      const existingLookupDims = JSON.parse(job.LookupDimensionColumnsJson || '[]');
      if (existingLookupDims.length) {
        const newMainDims = new Set(b.dimensionColumns || []);
        const overlap = existingLookupDims.filter(c => newMainDims.has(c));
        if (overlap.length) {
          return res.status(400).json({ error: `Cột Dimension trùng tên với bảng liên kết đã có của job này: ${overlap.join(', ')} — đổi tên khác (cột trùng tên sẽ bị đè lẫn nhau khi ghi báo cáo)` });
        }
      }
      try {
        await assertTableConfigMatchesSchema(job.DataSourceId, job.SourceSchema, job.SourceTable, [
          ...(b.dimensionColumns || []), ...(b.measureColumns || [])
        ]);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('name', sql.NVarChar(200), b.name)
      .input('cronExpression', sql.VarChar(50), b.cronExpression)
      .input('isActive', sql.Bit, b.isActive ? 1 : 0)
      .input('targetDomain', sql.VarChar(50), b.targetDomain)
      .input('dimensionColumnsJson', sql.NVarChar(sql.MAX), JSON.stringify(b.dimensionColumns || []))
      .input('measureColumnsJson', sql.NVarChar(sql.MAX), JSON.stringify(b.measureColumns || []))
      .input('keepHistory', sql.Bit, b.keepHistory ? 1 : 0)
      .query(`
        UPDATE etl.SyncJobs
        SET Name = @name, CronExpression = @cronExpression, IsActive = @isActive, TargetDomain = @targetDomain,
            DimensionColumnsJson = @dimensionColumnsJson, MeasureColumnsJson = @measureColumnsJson,
            KeepHistory = @keepHistory
        WHERE Id = @id
      `);
    await rescheduleJob(parseInt(req.params.id, 10));
    await logAction(req, { module: 'Đồng bộ', actionType: 'SUA_JOB', targetObject: req.params.id, description: `Cập nhật job đồng bộ "${b.name}"` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id', requireMenuEdit('sync-jobs'), async (req, res, next) => {
  try {
    const jobId = parseInt(req.params.id, 10);
    const pool = await getPool('ADMIN');
    await pool.request().input('id', sql.Int, jobId).query('DELETE FROM etl.SyncJobs WHERE Id = @id');
    await rescheduleJob(jobId); // job không còn -> tự gỡ khỏi lịch
    await logAction(req, { module: 'Đồng bộ', actionType: 'XOA_JOB', targetObject: req.params.id, description: `Xoá job đồng bộ #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// "Kiểm tra schema" — đối chiếu LẠI job ĐÃ LƯU với schema THẬT hiện tại của
// nguồn (KHÔNG chỉ lúc Lưu như validateTableJobSchema() ở trên) — bắt được
// trường hợp bảng/cột nguồn bị đổi tên/xoá SAU khi job đã tạo, mà job đó
// không ai vào sửa lại nên không tự phát hiện (chỉ lộ ra khi job CHẠY THẬT
// và báo lỗi SQL). Job Type='custom' không có bảng/cột để đối chiếu (logic
// tự viết tay trong etl/sources/) — trả ok:true kèm skipped:true, không
// phải lỗi. Đọc-only, không đổi dữ liệu gì — dùng requireMenuAccess như
// route GET, không cần requireMenuEdit.
router.post('/:id/check-schema', requireMenuAccess('sync-jobs'), async (req, res, next) => {
  try {
    const jobId = parseInt(req.params.id, 10);
    const pool = await getPool('ADMIN');
    const result = await pool.request().input('id', sql.Int, jobId).query('SELECT * FROM etl.SyncJobs WHERE Id = @id');
    if (!result.recordset.length) return res.status(404).json({ error: 'Không tìm thấy job' });
    const job = result.recordset[0];

    if (job.Type !== 'table') {
      return res.json({ ok: true, skipped: true, message: 'Job Type="custom" không có bảng/cột để kiểm tra (logic tự viết tay trong etl/sources/)' });
    }

    const b = {
      dataSourceId: job.DataSourceId,
      sourceSchema: job.SourceSchema,
      sourceTable: job.SourceTable,
      keyColumn: job.KeyColumn,
      dateColumn: job.DateColumn,
      updatedAtColumn: job.UpdatedAtColumn,
      dimensionColumns: JSON.parse(job.DimensionColumnsJson || '[]'),
      measureColumns: JSON.parse(job.MeasureColumnsJson || '[]'),
      joinSchema: job.JoinSchema,
      joinTable: job.JoinTable,
      mainJoinColumn: job.MainJoinColumn,
      lookupJoinColumn: job.LookupJoinColumn,
      lookupDimensionColumns: JSON.parse(job.LookupDimensionColumnsJson || '[]')
    };

    try {
      await validateTableJobSchema(b);
    } catch (err) {
      await logAction(req, {
        module: 'Đồng bộ', actionType: 'KIEM_TRA_SCHEMA', targetObject: req.params.id,
        description: `Kiểm tra schema job "${job.Name}": LỆCH — ${err.message}`, status: 'FAILED'
      });
      return res.json({ ok: false, error: err.message });
    }
    await logAction(req, {
      module: 'Đồng bộ', actionType: 'KIEM_TRA_SCHEMA', targetObject: req.params.id,
      description: `Kiểm tra schema job "${job.Name}": khớp schema nguồn`
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/:id/run-now', requireMenuEdit('sync-jobs'), async (req, res, next) => {
  try {
    const jobId = parseInt(req.params.id, 10);
    const pool = await getPool('ADMIN');
    const result = await pool.request().input('id', sql.Int, jobId).query('SELECT * FROM etl.SyncJobs WHERE Id = @id');
    if (!result.recordset.length) return res.status(404).json({ error: 'Không tìm thấy job' });
    // Đi qua ĐÚNG cơ chế chống chồng lấn của scheduler (jobs/scheduler.js) —
    // bấm "Chạy thử" khi job này đang tự chạy theo lịch cũng phải bị chặn
    // (bỏ qua lặng lẽ, ghi log), không chỉ 2 lượt cron tự động chồng nhau.
    await runJobIfNotAlreadyRunning(result.recordset[0]);
    await logAction(req, { module: 'Đồng bộ', actionType: 'CHAY_THU_JOB', targetObject: String(jobId), description: `Chạy thử job đồng bộ "${result.recordset[0].Name}"` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
