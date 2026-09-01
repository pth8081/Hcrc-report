// routes/anomalyAlerts.js — Trang "Cảnh báo bất thường": CRUD
// app.AnomalyAlerts (xem lib/anomalyAlertRunner.js + jobs/anomalyAlertScheduler.js).
const express = require('express');
const cron = require('node-cron');
const { sql, getPool } = require('../db');
const { requireAuth, requireMenuAccess } = require('../lib/auth');
const { logAction } = require('../lib/auditLog');
const scheduler = require('../jobs/anomalyAlertScheduler');

const router = express.Router();
router.use(requireAuth, requireMenuAccess('system-anomaly-alerts'));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseRecipients(raw) {
  return String(raw || '').split(',').map(s => s.trim()).filter(Boolean);
}
function validateRecipients(raw) {
  const list = parseRecipients(raw);
  if (!list.length) return 'Thiếu người nhận';
  const bad = list.find(e => !EMAIL_RE.test(e));
  if (bad) return `Địa chỉ email không hợp lệ: "${bad}"`;
  return null;
}

// Danh mục báo cáo để chọn khi tạo cảnh báo, kèm filters/columns — cùng khuôn
// GET /system/report-email-schedules/reports (chấp nhận trùng lặp nhỏ, đúng
// quy ước cả dự án: mỗi route tự chứa đủ, không import chéo giữa 2 module).
router.get('/reports', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const result = await pool.request().query(`
      SELECT ReportId, Title, DefinitionJson FROM app.ReportCatalog WHERE IsActive = 1 ORDER BY Title
    `);
    res.json(result.recordset.map(r => {
      const def = JSON.parse(r.DefinitionJson);
      return {
        reportId: r.ReportId,
        title: r.Title,
        filters: def.filters || [],
        columns: (def.columns || []).map(c => (typeof c === 'object' ? { key: c.key, label: c.label || c.key } : { key: c, label: c }))
      };
    }));
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const result = await pool.request().query(`
      SELECT a.Id, a.Name, a.ReportId, c.Title AS ReportTitle, a.CronExpression, a.FilterValuesJson,
             a.CompareMode, a.EntityColumnKey, a.MetricColumnKey, a.ThresholdPercent, a.Recipients,
             a.IsActive, a.LastRunAt, a.LastStatus, a.LastError, a.LastAnomalyCount
      FROM app.AnomalyAlerts a JOIN app.ReportCatalog c ON c.ReportId = a.ReportId
      ORDER BY a.Name
    `);
    res.json(result.recordset.map(r => ({ ...r, FilterValues: r.FilterValuesJson ? JSON.parse(r.FilterValuesJson) : {} })));
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const {
      name, reportId, cronExpression, filterValues = {}, compareMode = 'previousPeriod',
      entityColumnKey, metricColumnKey, thresholdPercent = 20, recipients
    } = req.body || {};
    if (!name || !reportId || !entityColumnKey || !metricColumnKey) {
      return res.status(400).json({ error: 'Thiếu name/reportId/entityColumnKey/metricColumnKey' });
    }
    if (!cron.validate(cronExpression)) return res.status(400).json({ error: 'Biểu thức lịch chạy (cron) không hợp lệ' });
    if (!['previousPeriod', 'samePeriodLastYear'].includes(compareMode)) return res.status(400).json({ error: 'Kỳ so sánh không hợp lệ' });
    const recipientsError = validateRecipients(recipients);
    if (recipientsError) return res.status(400).json({ error: recipientsError });

    const pool = await getPool('RP');
    const reportCheck = await pool.request().input('reportId', sql.VarChar(80), reportId)
      .query('SELECT 1 FROM app.ReportCatalog WHERE ReportId = @reportId AND IsActive = 1');
    if (!reportCheck.recordset.length) return res.status(400).json({ error: 'Báo cáo không tồn tại hoặc đã tắt' });

    const result = await pool.request()
      .input('name', sql.NVarChar(200), name)
      .input('reportId', sql.VarChar(80), reportId)
      .input('cronExpression', sql.VarChar(50), cronExpression)
      .input('filterValuesJson', sql.NVarChar(sql.MAX), JSON.stringify(filterValues))
      .input('compareMode', sql.VarChar(20), compareMode)
      .input('entityColumnKey', sql.VarChar(100), entityColumnKey)
      .input('metricColumnKey', sql.VarChar(100), metricColumnKey)
      .input('thresholdPercent', sql.Decimal(9, 2), thresholdPercent)
      .input('recipients', sql.NVarChar(1000), parseRecipients(recipients).join(','))
      .input('createdBy', sql.Int, req.user.sub)
      .query(`
        INSERT INTO app.AnomalyAlerts
          (Name, ReportId, CronExpression, FilterValuesJson, CompareMode, EntityColumnKey, MetricColumnKey, ThresholdPercent, Recipients, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@name, @reportId, @cronExpression, @filterValuesJson, @compareMode, @entityColumnKey, @metricColumnKey, @thresholdPercent, @recipients, @createdBy)
      `);
    const id = result.recordset[0].Id;
    await scheduler.rescheduleAlert(id);
    await logAction(req, { module: 'Cảnh báo bất thường', actionType: 'TAO_CANH_BAO', targetObject: String(id), description: `Tạo cảnh báo "${name}"` });
    res.status(201).json({ id });
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const {
      name, cronExpression, filterValues = {}, compareMode = 'previousPeriod',
      entityColumnKey, metricColumnKey, thresholdPercent = 20, recipients, isActive
    } = req.body || {};
    if (!name || !entityColumnKey || !metricColumnKey) return res.status(400).json({ error: 'Thiếu name/entityColumnKey/metricColumnKey' });
    if (!cron.validate(cronExpression)) return res.status(400).json({ error: 'Biểu thức lịch chạy (cron) không hợp lệ' });
    if (!['previousPeriod', 'samePeriodLastYear'].includes(compareMode)) return res.status(400).json({ error: 'Kỳ so sánh không hợp lệ' });
    const recipientsError = validateRecipients(recipients);
    if (recipientsError) return res.status(400).json({ error: recipientsError });

    const id = Number(req.params.id);
    const pool = await getPool('RP');
    await pool.request()
      .input('id', sql.Int, id)
      .input('name', sql.NVarChar(200), name)
      .input('cronExpression', sql.VarChar(50), cronExpression)
      .input('filterValuesJson', sql.NVarChar(sql.MAX), JSON.stringify(filterValues))
      .input('compareMode', sql.VarChar(20), compareMode)
      .input('entityColumnKey', sql.VarChar(100), entityColumnKey)
      .input('metricColumnKey', sql.VarChar(100), metricColumnKey)
      .input('thresholdPercent', sql.Decimal(9, 2), thresholdPercent)
      .input('recipients', sql.NVarChar(1000), parseRecipients(recipients).join(','))
      .input('isActive', sql.Bit, isActive ? 1 : 0)
      .query(`
        UPDATE app.AnomalyAlerts
        SET Name = @name, CronExpression = @cronExpression, FilterValuesJson = @filterValuesJson,
            CompareMode = @compareMode, EntityColumnKey = @entityColumnKey, MetricColumnKey = @metricColumnKey,
            ThresholdPercent = @thresholdPercent, Recipients = @recipients, IsActive = @isActive
        WHERE Id = @id
      `);
    await scheduler.rescheduleAlert(id);
    await logAction(req, { module: 'Cảnh báo bất thường', actionType: 'SUA_CANH_BAO', targetObject: req.params.id, description: `Cập nhật cảnh báo "${name}"` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM app.AnomalyAlerts WHERE Id = @id');
    await scheduler.rescheduleAlert(Number(req.params.id));
    await logAction(req, { module: 'Cảnh báo bất thường', actionType: 'XOA_CANH_BAO', targetObject: req.params.id, description: `Xoá cảnh báo #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// "Kiểm tra ngay" — chạy thật NGAY để thử cấu hình, hoạt động cả khi đang tắt.
router.post('/:id/run-now', async (req, res, next) => {
  try {
    const anomalyCount = await scheduler.runNow(Number(req.params.id));
    await logAction(req, { module: 'Cảnh báo bất thường', actionType: 'KIEM_TRA_NGAY', targetObject: req.params.id, description: `Kiểm tra ngay cảnh báo #${req.params.id} — ${anomalyCount} bất thường` });
    res.json({ ok: true, anomalyCount });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
