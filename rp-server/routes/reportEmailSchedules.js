// routes/reportEmailSchedules.js — Trang "Lịch gửi email báo cáo": CRUD
// app.ReportEmailSchedules + app.ReportEmailScheduleTimes (đặt lịch node-cron
// gửi 1 báo cáo cho danh sách người nhận qua email, dùng cấu hình SMTP chung
// ở "Thiết lập email"). MỘT lịch có THỂ có NHIỀU giờ gửi/ngày (vd 07:00 VÀ
// 17:00) — body POST/PUT nhận `cronExpressions` (mảng chuỗi cron, KHÔNG phải
// 1 chuỗi như trước), mỗi phần tử thành 1 dòng app.ReportEmailScheduleTimes.
// Bộ lọc cố định của lịch (filterValues) không lọc theo quyền một người dùng
// cụ thể — đây là cấu hình HỆ THỐNG (ai vào được trang này qua
// requireMenuAccess coi như được cấp toàn quyền chọn báo cáo/lịch, giống
// trang "Biểu mẫu").
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

// "Số lần gửi" = độ dài mảng cronExpressions — không có ô đếm riêng, tránh dư
// thừa (đếm sai lệch với danh sách thật).
function validateCronExpressions(list) {
  if (!Array.isArray(list) || !list.length) return 'Cần ít nhất 1 giờ gửi';
  const bad = list.find(c => !cron.validate(c));
  if (bad) return `Biểu thức lịch chạy (cron) không hợp lệ: "${bad}"`;
  if (new Set(list).size !== list.length) return 'Có giờ gửi bị trùng lặp';
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
    const schedulesResult = await pool.request().query(`
      SELECT s.Id, s.Name, s.ReportId, c.Title AS ReportTitle, s.Recipients,
             s.FilterValuesJson, s.ExportFormat, s.IsActive, s.LastRunAt, s.LastStatus, s.LastError
      FROM app.ReportEmailSchedules s
      JOIN app.ReportCatalog c ON c.ReportId = s.ReportId
      ORDER BY s.Name
    `);
    const timesResult = await pool.request().query(`
      SELECT Id, ScheduleId, CronExpression, LastRunAt, LastStatus, LastError
      FROM app.ReportEmailScheduleTimes ORDER BY CronExpression
    `);
    const timesBySchedule = new Map();
    for (const t of timesResult.recordset) {
      if (!timesBySchedule.has(t.ScheduleId)) timesBySchedule.set(t.ScheduleId, []);
      timesBySchedule.get(t.ScheduleId).push(t);
    }
    res.json(schedulesResult.recordset.map(r => ({
      ...r,
      FilterValues: r.FilterValuesJson ? JSON.parse(r.FilterValuesJson) : {},
      Times: timesBySchedule.get(r.Id) || []
    })));
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, reportId, cronExpressions, recipients, filterValues = {}, exportFormat = 'excel' } = req.body || {};
    if (!name || !reportId) return res.status(400).json({ error: 'Thiếu name/reportId' });
    const cronError = validateCronExpressions(cronExpressions);
    if (cronError) return res.status(400).json({ error: cronError });
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
      .input('cronExpression', sql.VarChar(50), cronExpressions[0]) // cột cũ, chỉ hiển thị/tương thích ngược — xem rp-db/schema.sql
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

    for (const cronExpression of cronExpressions) {
      await pool.request()
        .input('scheduleId', sql.Int, id)
        .input('cronExpression', sql.VarChar(50), cronExpression)
        .query('INSERT INTO app.ReportEmailScheduleTimes (ScheduleId, CronExpression) VALUES (@scheduleId, @cronExpression)');
    }

    await scheduler.rescheduleJob(id);
    await logAction(req, { module: 'Lịch gửi email báo cáo', actionType: 'TAO_LICH', targetObject: String(id), description: `Tạo lịch "${name}" (${cronExpressions.length} giờ gửi)` });
    res.status(201).json({ id });
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, cronExpressions, recipients, filterValues = {}, exportFormat = 'excel', isActive } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Thiếu name' });
    const cronError = validateCronExpressions(cronExpressions);
    if (cronError) return res.status(400).json({ error: cronError });
    const recipientsError = validateRecipients(recipients);
    if (recipientsError) return res.status(400).json({ error: recipientsError });
    if (!['excel', 'pdf'].includes(exportFormat)) return res.status(400).json({ error: 'Định dạng xuất không hợp lệ' });

    const id = Number(req.params.id);
    const pool = await getPool('RP');

    await pool.request()
      .input('id', sql.Int, id)
      .input('name', sql.NVarChar(200), name)
      .input('cronExpression', sql.VarChar(50), cronExpressions[0]) // cột cũ, chỉ hiển thị/tương thích ngược
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

    // Cập nhật danh sách giờ gửi kiểu DIFF — giữ nguyên (và giữ nguyên lịch sử
    // LastRunAt/LastStatus) những giờ KHÔNG đổi, chỉ xoá giờ bị bỏ + thêm giờ
    // mới, không xoá-tạo-lại toàn bộ (sẽ mất lịch sử của giờ không hề đổi).
    const existingResult = await pool.request().input('scheduleId', sql.Int, id)
      .query('SELECT Id, CronExpression FROM app.ReportEmailScheduleTimes WHERE ScheduleId = @scheduleId');
    const existing = existingResult.recordset;
    const newSet = new Set(cronExpressions);
    const existingCronSet = new Set(existing.map(e => e.CronExpression));

    for (const row of existing) {
      if (!newSet.has(row.CronExpression)) {
        await pool.request().input('id', sql.Int, row.Id).query('DELETE FROM app.ReportEmailScheduleTimes WHERE Id = @id');
      }
    }
    for (const cronExpression of cronExpressions) {
      if (!existingCronSet.has(cronExpression)) {
        await pool.request()
          .input('scheduleId', sql.Int, id)
          .input('cronExpression', sql.VarChar(50), cronExpression)
          .query('INSERT INTO app.ReportEmailScheduleTimes (ScheduleId, CronExpression) VALUES (@scheduleId, @cronExpression)');
      }
    }

    await scheduler.rescheduleJob(id);
    await logAction(req, { module: 'Lịch gửi email báo cáo', actionType: 'SUA_LICH', targetObject: req.params.id, description: `Cập nhật lịch "${name}" (${cronExpressions.length} giờ gửi)` });
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
