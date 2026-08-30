// routes/admin/syncJobs.js — Trang "Đồng bộ": CRUD etl.SyncJobs (Type='table'
// dựng từ bước duyệt schema trên etl-admin/, Type='custom' tham chiếu
// connector có sẵn trong etl/sources/) + chạy thử ngay một job. Sửa (PUT) chỉ
// cho đổi tên/lịch/bật-tắt/domain/cột Dimensions-Measures — đổi bảng nguồn
// hay bảng liên kết thì xoá job cũ, tạo job mới (đơn giản hơn, tránh cấu
// hình nửa vời).
const express = require('express');
const { sql, getPool } = require('../../db');
const { requireAdminAuth, requireAdminRole } = require('../../lib/adminAuth');
const sourcesRegistry = require('../../sources');
const { rescheduleJob, runJobIfNotAlreadyRunning } = require('../../jobs/scheduler');

const router = express.Router();
router.use(requireAdminAuth);

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().query('SELECT * FROM etl.SyncJobs ORDER BY Name');
    res.json(result.recordset);
  } catch (err) { next(err); }
});

// Danh sách connector "tuỳ biến" có sẵn trong code — dùng khi tạo job Type='custom'.
router.get('/custom-connectors', requireAdminAuth, (req, res) => {
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
      .query(`
        INSERT INTO etl.SyncJobs (
          Name, Type, DataSourceId, SourceSchema, SourceTable, KeyColumn, DateColumn, UpdatedAtColumn,
          DimensionColumnsJson, MeasureColumnsJson, JoinSchema, JoinTable, JoinType, MainJoinColumn,
          LookupJoinColumn, LookupDimensionColumnsJson, CustomConnectorKey, TargetDomain, CronExpression
        )
        OUTPUT INSERTED.Id
        VALUES (
          @name, @type, @dataSourceId, @sourceSchema, @sourceTable, @keyColumn, @dateColumn, @updatedAtColumn,
          @dimensionColumnsJson, @measureColumnsJson, @joinSchema, @joinTable, @joinType, @mainJoinColumn,
          @lookupJoinColumn, @lookupDimensionColumnsJson, @customConnectorKey, @targetDomain, @cronExpression
        )
      `);
    const id = result.recordset[0].Id;
    await rescheduleJob(id);
    res.status(201).json({ id });
  } catch (err) { next(err); }
});

router.put('/:id', requireAdminRole, async (req, res, next) => {
  try {
    const b = req.body || {};
    const pool = await getPool('ADMIN');
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('name', sql.NVarChar(200), b.name)
      .input('cronExpression', sql.VarChar(50), b.cronExpression)
      .input('isActive', sql.Bit, b.isActive ? 1 : 0)
      .input('targetDomain', sql.VarChar(50), b.targetDomain)
      .input('dimensionColumnsJson', sql.NVarChar(sql.MAX), JSON.stringify(b.dimensionColumns || []))
      .input('measureColumnsJson', sql.NVarChar(sql.MAX), JSON.stringify(b.measureColumns || []))
      .query(`
        UPDATE etl.SyncJobs
        SET Name = @name, CronExpression = @cronExpression, IsActive = @isActive, TargetDomain = @targetDomain,
            DimensionColumnsJson = @dimensionColumnsJson, MeasureColumnsJson = @measureColumnsJson
        WHERE Id = @id
      `);
    await rescheduleJob(parseInt(req.params.id, 10));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAdminRole, async (req, res, next) => {
  try {
    const jobId = parseInt(req.params.id, 10);
    const pool = await getPool('ADMIN');
    await pool.request().input('id', sql.Int, jobId).query('DELETE FROM etl.SyncJobs WHERE Id = @id');
    await rescheduleJob(jobId); // job không còn -> tự gỡ khỏi lịch
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
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
