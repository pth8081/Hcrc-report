// routes/admin/syncJobs.js — Trang "Đồng bộ": CRUD etl.SyncJobs (Type='table'
// dựng từ bước duyệt schema trên etl-admin/, Type='custom' tham chiếu
// connector có sẵn trong etl/sources/) + chạy thử ngay một job. Sửa (PUT) chỉ
// cho đổi tên/lịch/bật-tắt/domain/giữ lịch sử/cột Dimensions-Measures — đổi
// bảng nguồn hay bảng liên kết thì xoá job cũ, tạo job mới (đơn giản hơn,
// tránh cấu hình nửa vời).
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
const { requireAdminAuth, requireAdminRole, blockTargetImporter } = require('../../lib/adminAuth');
const sourcesRegistry = require('../../sources');
const { rescheduleJob, runJobIfNotAlreadyRunning } = require('../../jobs/scheduler');
const schemaBrowser = require('../../lib/schemaBrowser');
const { logAction } = require('../../lib/auditLog');

const router = express.Router();
router.use(requireAdminAuth);

// Đối chiếu 1 bảng + danh sách cột trong cấu hình job Type='table' với schema
// THẬT của nguồn đã chọn (cùng nguồn schemaBrowser.js dùng để vẽ dropdown trên
// etl-admin/) — chặn ngay lúc LƯU thay vì chỉ lộ lỗi lúc job CHẠY. Quan trọng
// nhất khi job được tạo qua script/gọi API thẳng (bỏ qua dropdown), ví dụ cấu
// hình hàng loạt nhiều chi nhánh cùng cấu trúc bảng.
async function assertTableConfigMatchesSchema(dataSourceId, schemaName, tableName, requiredColumns) {
  const tables = await schemaBrowser.listTables(dataSourceId);
  const tableExists = tables.some(t => t.schemaName === schemaName && t.tableName === tableName);
  if (!tableExists) throw new Error(`Bảng "${schemaName}.${tableName}" không tồn tại trên nguồn dữ liệu đã chọn`);
  const cols = await schemaBrowser.listColumns(dataSourceId, schemaName, tableName);
  const colNames = new Set(cols.map(c => c.columnName));
  const missing = [...new Set(requiredColumns.filter(Boolean))].filter(c => !colNames.has(c));
  if (missing.length) throw new Error(`Bảng "${schemaName}.${tableName}" không có cột: ${missing.join(', ')}`);
}

// Kiểm tra toàn bộ cấu hình job Type='table' lúc TẠO (bảng chính + bảng liên
// kết nếu có) — PUT chỉ cho sửa DimensionColumns/MeasureColumns của bảng
// chính nên dùng thẳng assertTableConfigMatchesSchema, không cần hàm này.
async function validateTableJobSchema(b) {
  const mainColumns = [b.keyColumn, b.dateColumn, b.updatedAtColumn, ...(b.dimensionColumns || []), ...(b.measureColumns || [])];
  if (b.joinTable) {
    if (!b.joinSchema || !b.mainJoinColumn || !b.lookupJoinColumn) {
      throw new Error('Có joinTable thì phải kèm joinSchema/mainJoinColumn/lookupJoinColumn');
    }
    mainColumns.push(b.mainJoinColumn);
  }
  await assertTableConfigMatchesSchema(b.dataSourceId, b.sourceSchema, b.sourceTable, mainColumns);
  if (b.joinTable) {
    await assertTableConfigMatchesSchema(b.dataSourceId, b.joinSchema, b.joinTable, [
      b.lookupJoinColumn, ...(b.lookupDimensionColumns || [])
    ]);
  }
}

// blockTargetImporter (không chỉ requireAdminAuth) — 'target_importer' (vai
// trò hẹp, giao diện đã ẩn hẳn trang này khỏi menu) không được thấy cấu
// hình đồng bộ dù gọi thẳng API. 'viewer' vẫn xem được như cũ (chỉ không
// sửa) — xem lib/adminAuth.js.
router.get('/', blockTargetImporter, async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().query('SELECT * FROM etl.SyncJobs ORDER BY Name');
    res.json(result.recordset);
  } catch (err) { next(err); }
});

// Danh sách connector "tuỳ biến" có sẵn trong code — dùng khi tạo job Type='custom'.
router.get('/custom-connectors', blockTargetImporter, (req, res) => {
  res.json(sourcesRegistry.map(s => ({ key: s.key, label: s.label, domain: s.domain })));
});

router.post('/', requireAdminRole, async (req, res, next) => {
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

router.put('/:id', requireAdminRole, async (req, res, next) => {
  try {
    const b = req.body || {};
    const pool = await getPool('ADMIN');
    const jobId = parseInt(req.params.id, 10);
    const existing = await pool.request().input('id', sql.Int, jobId)
      .query('SELECT Type, DataSourceId, SourceSchema, SourceTable FROM etl.SyncJobs WHERE Id = @id');
    if (!existing.recordset.length) return res.status(404).json({ error: 'Không tìm thấy job' });
    if (b.cronExpression && !cron.validate(b.cronExpression)) {
      return res.status(400).json({ error: `Lịch chạy (cron) không hợp lệ: "${b.cronExpression}"` });
    }
    const job = existing.recordset[0];
    if (job.Type === 'table') {
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

router.delete('/:id', requireAdminRole, async (req, res, next) => {
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
// phải lỗi. Đọc-only, không đổi dữ liệu gì — dùng blockTargetImporter như
// route GET, không cần requireAdminRole.
router.post('/:id/check-schema', blockTargetImporter, async (req, res, next) => {
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

router.post('/:id/run-now', requireAdminRole, async (req, res, next) => {
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
