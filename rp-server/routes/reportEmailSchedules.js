// routes/reportEmailSchedules.js — Trang "Lịch gửi email báo cáo": CRUD
// app.ReportEmailSchedules + app.ReportEmailScheduleTimes (đặt lịch node-cron
// gửi cho danh sách người nhận qua email, dùng cấu hình SMTP chung ở "Thiết
// lập email"). MỘT lịch có THỂ có NHIỀU giờ gửi/ngày (vd 07:00 VÀ 17:00) —
// body POST/PUT nhận `cronExpressions` (mảng chuỗi cron, KHÔNG phải 1 chuỗi
// như trước), mỗi phần tử thành 1 dòng app.ReportEmailScheduleTimes.
//
// 1 LỊCH NHIỀU BÁO CÁO (bản 10.101, theo yêu cầu người dùng — "chọn được
// nhiều bc để gửi... gộp chung 1 email duy nhất") — body POST/PUT nhận
// `reports` (mảng {reportId, filterValues, bodyColumnKeys, highlightColumnKey,
// highlightThreshold}, GIỮ RIÊNG cấu hình cho TỪNG báo cáo), mỗi phần tử
// thành 1 dòng app.ReportEmailScheduleReports — xem
// rp-db/schema.sql + jobs/reportEmailScheduler.js (gộp kết quả MỌI báo cáo
// vào CÙNG 1 email khi tới giờ gửi).
//
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

// deliveryMode: 'attachment' (mặc định, xuất file đính kèm) hoặc 'body' (bảng
// HTML ngay trong nội dung email) — xem rp-db/schema.sql + jobs/reportEmailScheduler.js.
function validateDeliveryMode(mode) {
  if (!['attachment', 'body'].includes(mode)) return 'Cách gửi không hợp lệ';
  return null;
}

// reports: [{reportId, filterValues?, bodyColumnKeys?, highlightColumnKey?,
// highlightThreshold?}] — ÍT NHẤT 1 báo cáo, reportId không trùng lặp trong
// CHÍNH 1 lịch (gửi trùng 2 lần cùng báo cáo trong 1 email vô nghĩa).
function validateReports(reports) {
  if (!Array.isArray(reports) || !reports.length) return 'Cần chọn ít nhất 1 báo cáo';
  const ids = reports.map(r => r && r.reportId).filter(Boolean);
  if (ids.length !== reports.length) return 'Thiếu reportId ở 1 báo cáo đã chọn';
  if (new Set(ids).size !== ids.length) return 'Có báo cáo bị chọn trùng lặp';
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
    res.json(result.recordset.map(r => {
      const def = JSON.parse(r.DefinitionJson);
      return {
        reportId: r.ReportId,
        title: r.Title,
        filters: def.filters || [],
        // Danh sách cột để chọn "cột tô màu" khi DeliveryMode='body' — chỉ lấy
        // key/label thô từ định nghĩa (chuỗi HOẶC {key,label,formula}), không
        // cần chạy báo cáo thật (xem lib/reportEngine.js:describeColumns()).
        columns: (def.columns || []).map(c => (typeof c === 'object' ? { key: c.key, label: c.label || c.key } : { key: c, label: c }))
      };
    }));
  } catch (err) { next(err); }
});

// Danh sách người dùng hệ thống CÓ Email khai báo — cho ô "Người nhận"
// chọn qua dropdown tìm kiếm + chọn nhiều (bản 10.31, theo yêu cầu người
// dùng — trước đây phải tự gõ tay từng địa chỉ, dễ gõ sai). CHỈ trả về
// Email/Họ tên/Username (không lộ field nhạy cảm nào) — route này đã nằm
// sau requireMenuAccess('system-email-schedules') ở router.use() trên,
// không cần quyền 'system-permissions' riêng như trang "Phân quyền".
router.get('/recipients-catalog', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const result = await pool.request().query(`
      SELECT Username, FullName, Email FROM app.Users
      WHERE IsActive = 1 AND Email IS NOT NULL AND LTRIM(RTRIM(Email)) <> ''
      ORDER BY FullName
    `);
    res.json(result.recordset.map(u => ({ value: u.Email.trim(), label: `${u.FullName} <${u.Email.trim()}>` })));
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const schedulesResult = await pool.request().query(`
      SELECT s.Id, s.Name, s.Recipients, s.ExportFormat, s.IsActive, s.LastRunAt, s.LastStatus, s.LastError,
             s.Subject, s.DeliveryMode
      FROM app.ReportEmailSchedules s
      ORDER BY s.Name
    `);
    const timesResult = await pool.request().query(`
      SELECT Id, ScheduleId, CronExpression, LastRunAt, LastStatus, LastError
      FROM app.ReportEmailScheduleTimes ORDER BY CronExpression
    `);
    const reportsResult = await pool.request().query(`
      SELECT r.Id, r.ScheduleId, r.ReportId, c.Title AS ReportTitle, r.FilterValuesJson,
             r.BodyColumnKeysJson, r.HighlightColumnKey, r.HighlightThreshold
      FROM app.ReportEmailScheduleReports r
      JOIN app.ReportCatalog c ON c.ReportId = r.ReportId
      ORDER BY r.ScheduleId, r.SortOrder, r.Id
    `);
    const timesBySchedule = new Map();
    for (const t of timesResult.recordset) {
      if (!timesBySchedule.has(t.ScheduleId)) timesBySchedule.set(t.ScheduleId, []);
      timesBySchedule.get(t.ScheduleId).push(t);
    }
    const reportsBySchedule = new Map();
    for (const r of reportsResult.recordset) {
      if (!reportsBySchedule.has(r.ScheduleId)) reportsBySchedule.set(r.ScheduleId, []);
      reportsBySchedule.get(r.ScheduleId).push({
        reportId: r.ReportId, title: r.ReportTitle,
        filterValues: r.FilterValuesJson ? JSON.parse(r.FilterValuesJson) : {},
        bodyColumnKeys: r.BodyColumnKeysJson ? JSON.parse(r.BodyColumnKeysJson) : [],
        highlightColumnKey: r.HighlightColumnKey || '',
        highlightThreshold: r.HighlightThreshold ?? ''
      });
    }
    res.json(schedulesResult.recordset.map(r => {
      const reports = reportsBySchedule.get(r.Id) || [];
      return {
        ...r,
        Reports: reports,
        // Báo cáo (cột bảng danh sách) — nối tên các báo cáo trong lịch,
        // KHÔNG còn đúng 1 báo cáo/lịch như trước bản 10.101.
        ReportTitle: reports.map(x => x.title).join(', '),
        Times: timesBySchedule.get(r.Id) || []
      };
    }));
  } catch (err) { next(err); }
});

// Trả về danh sách reportId KHÔNG tồn tại/đã tắt (rỗng = mọi reportId đều
// hợp lệ) — mssql không hỗ trợ truyền mảng trực tiếp vào IN, gắn từng @rN.
async function findMissingReportIds(pool, reportIds) {
  const checkRequest = pool.request();
  reportIds.forEach((id, i) => checkRequest.input(`r${i}`, sql.VarChar(80), id));
  const checkResult = await checkRequest.query(`
    SELECT ReportId FROM app.ReportCatalog WHERE IsActive = 1 AND ReportId IN (${reportIds.map((_, i) => `@r${i}`).join(',')})
  `);
  const foundIds = new Set(checkResult.recordset.map(r => r.ReportId));
  return reportIds.filter(id => !foundIds.has(id));
}

// Ghi đè TOÀN BỘ danh sách app.ReportEmailScheduleReports của 1 lịch (xoá
// hết rồi chèn lại theo đúng mảng `reports` — khác kiểu DIFF của
// cronExpressions vì bảng này không có lịch sử LastRunAt/LastStatus RIÊNG
// theo báo cáo cần giữ, xoá-tạo-lại không mất gì).
async function replaceScheduleReports(pool, scheduleId, reports) {
  await pool.request().input('scheduleId', sql.Int, scheduleId)
    .query('DELETE FROM app.ReportEmailScheduleReports WHERE ScheduleId = @scheduleId');
  let sortOrder = 0;
  for (const r of reports) {
    await pool.request()
      .input('scheduleId', sql.Int, scheduleId)
      .input('reportId', sql.VarChar(80), r.reportId)
      .input('filterValuesJson', sql.NVarChar(sql.MAX), JSON.stringify(r.filterValues || {}))
      .input('bodyColumnKeysJson', sql.NVarChar(sql.MAX), Array.isArray(r.bodyColumnKeys) && r.bodyColumnKeys.length ? JSON.stringify(r.bodyColumnKeys) : null)
      .input('highlightColumnKey', sql.NVarChar(100), r.highlightColumnKey || null)
      .input('highlightThreshold', sql.Decimal(18, 2), r.highlightThreshold === '' || r.highlightThreshold == null ? null : r.highlightThreshold)
      .input('sortOrder', sql.Int, sortOrder)
      .query(`
        INSERT INTO app.ReportEmailScheduleReports
          (ScheduleId, ReportId, FilterValuesJson, BodyColumnKeysJson, HighlightColumnKey, HighlightThreshold, SortOrder)
        VALUES (@scheduleId, @reportId, @filterValuesJson, @bodyColumnKeysJson, @highlightColumnKey, @highlightThreshold, @sortOrder)
      `);
    sortOrder += 1;
  }
}

router.post('/', async (req, res, next) => {
  try {
    const {
      name, reports, cronExpressions, recipients, exportFormat = 'excel',
      subject = null, deliveryMode = 'attachment'
    } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Thiếu name' });
    const reportsError = validateReports(reports);
    if (reportsError) return res.status(400).json({ error: reportsError });
    const cronError = validateCronExpressions(cronExpressions);
    if (cronError) return res.status(400).json({ error: cronError });
    const recipientsError = validateRecipients(recipients);
    if (recipientsError) return res.status(400).json({ error: recipientsError });
    if (!['excel', 'pdf'].includes(exportFormat)) return res.status(400).json({ error: 'Định dạng xuất không hợp lệ' });
    const deliveryModeError = validateDeliveryMode(deliveryMode);
    if (deliveryModeError) return res.status(400).json({ error: deliveryModeError });

    const pool = await getPool('RP');
    const reportIds = reports.map(r => r.reportId);
    const missing = await findMissingReportIds(pool, reportIds);
    if (missing.length) return res.status(400).json({ error: `Báo cáo không tồn tại hoặc đã tắt: ${missing.join(', ')}` });

    // 5 cột cũ (ReportId/FilterValuesJson/...) chỉ còn lưu ĐÚNG báo cáo ĐẦU
    // TIÊN (tương thích ngược, xem rp-db/schema.sql) — nguồn thật từ nay là
    // app.ReportEmailScheduleReports.
    const first = reports[0];
    const result = await pool.request()
      .input('name', sql.NVarChar(200), name)
      .input('reportId', sql.VarChar(80), first.reportId)
      .input('cronExpression', sql.VarChar(50), cronExpressions[0])
      .input('recipients', sql.NVarChar(1000), parseRecipients(recipients).join(','))
      .input('filterValuesJson', sql.NVarChar(sql.MAX), JSON.stringify(first.filterValues || {}))
      .input('exportFormat', sql.VarChar(10), exportFormat)
      .input('subject', sql.NVarChar(500), subject || null)
      .input('deliveryMode', sql.VarChar(20), deliveryMode)
      .input('highlightColumnKey', sql.NVarChar(100), first.highlightColumnKey || null)
      .input('highlightThreshold', sql.Decimal(18, 2), first.highlightThreshold === '' || first.highlightThreshold == null ? null : first.highlightThreshold)
      .input('bodyColumnKeysJson', sql.NVarChar(sql.MAX), Array.isArray(first.bodyColumnKeys) && first.bodyColumnKeys.length ? JSON.stringify(first.bodyColumnKeys) : null)
      .input('createdBy', sql.Int, req.user.sub)
      .query(`
        INSERT INTO app.ReportEmailSchedules
          (Name, ReportId, CronExpression, Recipients, FilterValuesJson, ExportFormat, Subject, DeliveryMode, HighlightColumnKey, HighlightThreshold, BodyColumnKeysJson, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@name, @reportId, @cronExpression, @recipients, @filterValuesJson, @exportFormat, @subject, @deliveryMode, @highlightColumnKey, @highlightThreshold, @bodyColumnKeysJson, @createdBy)
      `);
    const id = result.recordset[0].Id;

    await replaceScheduleReports(pool, id, reports);

    for (const cronExpression of cronExpressions) {
      await pool.request()
        .input('scheduleId', sql.Int, id)
        .input('cronExpression', sql.VarChar(50), cronExpression)
        .query('INSERT INTO app.ReportEmailScheduleTimes (ScheduleId, CronExpression) VALUES (@scheduleId, @cronExpression)');
    }

    await scheduler.rescheduleJob(id);
    await logAction(req, { module: 'Lịch gửi email báo cáo', actionType: 'TAO_LICH', targetObject: String(id), description: `Tạo lịch "${name}" (${cronExpressions.length} giờ gửi, ${reports.length} báo cáo)` });
    res.status(201).json({ id });
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const {
      name, reports, cronExpressions, recipients, exportFormat = 'excel', isActive,
      subject = null, deliveryMode = 'attachment'
    } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Thiếu name' });
    const reportsError = validateReports(reports);
    if (reportsError) return res.status(400).json({ error: reportsError });
    const cronError = validateCronExpressions(cronExpressions);
    if (cronError) return res.status(400).json({ error: cronError });
    const recipientsError = validateRecipients(recipients);
    if (recipientsError) return res.status(400).json({ error: recipientsError });
    if (!['excel', 'pdf'].includes(exportFormat)) return res.status(400).json({ error: 'Định dạng xuất không hợp lệ' });
    const deliveryModeError = validateDeliveryMode(deliveryMode);
    if (deliveryModeError) return res.status(400).json({ error: deliveryModeError });

    const id = Number(req.params.id);
    const pool = await getPool('RP');

    const reportIds = reports.map(r => r.reportId);
    const missing = await findMissingReportIds(pool, reportIds);
    if (missing.length) return res.status(400).json({ error: `Báo cáo không tồn tại hoặc đã tắt: ${missing.join(', ')}` });

    // 5 cột cũ chỉ còn lưu ĐÚNG báo cáo ĐẦU TIÊN (tương thích ngược) — xem
    // chú thích ở POST / phía trên.
    const first = reports[0];
    await pool.request()
      .input('id', sql.Int, id)
      .input('name', sql.NVarChar(200), name)
      .input('reportId', sql.VarChar(80), first.reportId)
      .input('cronExpression', sql.VarChar(50), cronExpressions[0]) // cột cũ, chỉ hiển thị/tương thích ngược
      .input('recipients', sql.NVarChar(1000), parseRecipients(recipients).join(','))
      .input('filterValuesJson', sql.NVarChar(sql.MAX), JSON.stringify(first.filterValues || {}))
      .input('exportFormat', sql.VarChar(10), exportFormat)
      .input('subject', sql.NVarChar(500), subject || null)
      .input('deliveryMode', sql.VarChar(20), deliveryMode)
      .input('highlightColumnKey', sql.NVarChar(100), first.highlightColumnKey || null)
      .input('highlightThreshold', sql.Decimal(18, 2), first.highlightThreshold === '' || first.highlightThreshold == null ? null : first.highlightThreshold)
      .input('bodyColumnKeysJson', sql.NVarChar(sql.MAX), Array.isArray(first.bodyColumnKeys) && first.bodyColumnKeys.length ? JSON.stringify(first.bodyColumnKeys) : null)
      .input('isActive', sql.Bit, isActive ? 1 : 0)
      .query(`
        UPDATE app.ReportEmailSchedules
        SET Name = @name, ReportId = @reportId, CronExpression = @cronExpression, Recipients = @recipients,
            FilterValuesJson = @filterValuesJson, ExportFormat = @exportFormat,
            Subject = @subject, DeliveryMode = @deliveryMode,
            HighlightColumnKey = @highlightColumnKey, HighlightThreshold = @highlightThreshold,
            BodyColumnKeysJson = @bodyColumnKeysJson, IsActive = @isActive
        WHERE Id = @id
      `);

    await replaceScheduleReports(pool, id, reports);

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
    await logAction(req, { module: 'Lịch gửi email báo cáo', actionType: 'SUA_LICH', targetObject: req.params.id, description: `Cập nhật lịch "${name}" (${cronExpressions.length} giờ gửi, ${reports.length} báo cáo)` });
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
