// routes/reportEmailSchedules.js — Trang "Lịch gửi email báo cáo": CRUD
// app.ReportEmailSchedules (đặt lịch node-cron gửi 1 báo cáo cho danh sách
// người nhận qua email, dùng cấu hình SMTP chung ở "Thiết lập email"). Bộ
// lọc cố định của lịch (filterValues) không lọc theo quyền một người dùng cụ
// thể — đây là cấu hình HỆ THỐNG (ai vào được trang này qua requireMenuAccess
// coi như được cấp toàn quyền chọn báo cáo/lịch, giống trang "Biểu mẫu").
const express = require('express');
const cron = require('node-cron');
const { sql, getPool } = require('../db');
const { requireAuth, requireMenuAccess } = require('../lib/auth');
const { logAction } = require('../lib/auditLog');
const scheduler = require('../jobs/reportEmailScheduler');

const router = express.Router();
router.use(requireAuth, requireMenuAccess('system-email-schedules'));

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

// Danh mục báo cáo để chọn khi tạo lịch, kèm luôn filters của từng báo cáo
// (để giao diện dựng đúng ô cấu hình bộ lọc cố định/preset) — không lọc theo
// quyền xem báo cáo của TỪNG người dùng như GET /api/reports, vì trang này
// chỉ ai có quyền menu 'system-email-schedules' mới vào được.
router.get('/reports', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const result = await pool.request().query(`
      SELECT ReportId, Title, DefinitionJson FROM app.ReportCatalog WHERE IsActive = 1 ORDER BY Title
    `);
    res.json(result.recordset.map(r => ({
      reportId: r.ReportId,
      title: r.Title,
      filters: JSON.parse(r.DefinitionJson).filters || []
    })));
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const result = await pool.request().query(`
      SELECT s.Id, s.Name, s.ReportId, c.Title AS ReportTitle, s.CronExpression, s.Recipients,
             s.FilterValuesJson, s.ExportFormat, s.IsActive, s.LastRunAt, s.LastStatus, s.LastError
      FROM app.ReportEmailSchedules s
      JOIN app.ReportCatalog c ON c.ReportId = s.ReportId
      ORDER BY s.Name
    `);
    res.json(result.recordset.map(r => ({
      ...r,
      FilterValues: r.FilterValuesJson ? JSON.parse(r.FilterValuesJson) : {}
    })));
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, reportId, cronExpression, recipients, filterValues = {}, exportFormat = 'excel' } = req.body || {};
    if (!name || !reportId || !cronExpression) return res.status(400).json({ error: 'Thiếu name/reportId/cronExpression' });
    if (!cron.validate(cronExpression)) return res.status(400).json({ error: 'Biểu thức lịch chạy (cron) không hợp lệ' });
    const recipientsError = validateRecipients(recipients);
    if (recipientsError) return res.status(400).json({ error: recipientsError });
    if (!['excel', 'pdf'].includes(exportFormat)) return res.status(400).json({ error: 'Định dạng xuất không hợp lệ' });

    const pool = await getPool('RP');
    const reportCheck = await pool.request().input('reportId', sql.VarChar(80), reportId)
      .query('SELECT 1 FROM app.ReportCatalog WHERE ReportId = @reportId AND IsActive = 1');
    if (!reportCheck.recordset.length) return res.status(400).json({ error: 'Báo cáo không tồn tại hoặc đã tắt' });

    const result = await pool.request()
      .input('name', sql.NVarChar(200), name)
      .input('reportId', sql.VarChar(80), reportId)
      .input('cronExpression', sql.VarChar(50), cronExpression)
      .input('recipients', sql.NVarChar(1000), parseRecipients(recipients).join(','))
      .input('filterValuesJson', sql.NVarChar(sql.MAX), JSON.stringify(filterValues))
      .input('exportFormat', sql.VarChar(10), exportFormat)
      .input('createdBy', sql.Int, req.user.sub)
      .query(`
        INSERT INTO app.ReportEmailSchedules (Name, ReportId, CronExpression, Recipients, FilterValuesJson, ExportFormat, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@name, @reportId, @cronExpression, @recipients, @filterValuesJson, @exportFormat, @createdBy)
      `);
    const id = result.recordset[0].Id;
    await scheduler.rescheduleJob(id);
    await logAction(req, { module: 'Lịch gửi email báo cáo', actionType: 'TAO_LICH', targetObject: String(id), description: `Tạo lịch "${name}"` });
    res.status(201).json({ id });
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, cronExpression, recipients, filterValues = {}, exportFormat = 'excel', isActive } = req.body || {};
    if (!name || !cronExpression) return res.status(400).json({ error: 'Thiếu name/cronExpression' });
    if (!cron.validate(cronExpression)) return res.status(400).json({ error: 'Biểu thức lịch chạy (cron) không hợp lệ' });
    const recipientsError = validateRecipients(recipients);
    if (recipientsError) return res.status(400).json({ error: recipientsError });
    if (!['excel', 'pdf'].includes(exportFormat)) return res.status(400).json({ error: 'Định dạng xuất không hợp lệ' });

    const pool = await getPool('RP');
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('name', sql.NVarChar(200), name)
      .input('cronExpression', sql.VarChar(50), cronExpression)
      .input('recipients', sql.NVarChar(1000), parseRecipients(recipients).join(','))
      .input('filterValuesJson', sql.NVarChar(sql.MAX), JSON.stringify(filterValues))
      .input('exportFormat', sql.VarChar(10), exportFormat)
      .input('isActive', sql.Bit, isActive ? 1 : 0)
      .query(`
        UPDATE app.ReportEmailSchedules
        SET Name = @name, CronExpression = @cronExpression, Recipients = @recipients,
            FilterValuesJson = @filterValuesJson, ExportFormat = @exportFormat, IsActive = @isActive
        WHERE Id = @id
      `);
    await scheduler.rescheduleJob(Number(req.params.id));
    await logAction(req, { module: 'Lịch gửi email báo cáo', actionType: 'SUA_LICH', targetObject: req.params.id, description: `Cập nhật lịch "${name}"` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM app.ReportEmailSchedules WHERE Id = @id');
    await scheduler.rescheduleJob(Number(req.params.id));
    await logAction(req, { module: 'Lịch gửi email báo cáo', actionType: 'XOA_LICH', targetObject: req.params.id, description: `Xoá lịch #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// "Gửi ngay" — chạy thật NGAY LẬP TỨC để kiểm tra cấu hình (báo cáo/bộ lọc/
// SMTP/người nhận), không đợi tới giờ đã đặt, hoạt động cả khi lịch đang tắt.
router.post('/:id/run-now', async (req, res, next) => {
  try {
    await scheduler.runNow(Number(req.params.id));
    await logAction(req, { module: 'Lịch gửi email báo cáo', actionType: 'GUI_NGAY', targetObject: req.params.id, description: `Gửi thử ngay lịch #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
