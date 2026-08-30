// routes/reportCatalog.js — Trang "Biểu mẫu": CRUD app.ReportCatalog (định
// nghĩa báo cáo — bộ lọc/cột/nguồn dữ liệu) + tải lên file mẫu .xlsx/.pptx
// vào templates/ (tham chiếu bằng tên file trong DefinitionJson.template,
// xem report-server/README.md). Khác routes/reports.js: route ở đây thấy
// TOÀN BỘ báo cáo (kể cả IsActive=0) vì đây là trang cấu hình, không phải
// trang xem báo cáo — quyền xem thật do RoleReportAccess quyết định riêng.
const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { sql, getPool } = require('../db');
const { requireAuth, requireMenuAccess } = require('../lib/auth');
const { logAction } = require('../lib/auditLog');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TEMPLATES_DIR),
    filename: (req, file, cb) => cb(null, file.originalname)
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(xlsx|pptx)$/i.test(file.originalname);
    cb(ok ? null : new Error('Chỉ nhận file .xlsx hoặc .pptx'), ok);
  }
});

const router = express.Router();
router.use(requireAuth, requireMenuAccess('system-report-catalog'));

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const result = await pool.request().query(`
      SELECT ReportId, Title, Domain, MenuItemId, DataSourceId, DefinitionJson, IsActive
      FROM app.ReportCatalog ORDER BY Title
    `);
    res.json(result.recordset);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { reportId, title, domain, menuItemId, dataSourceId, definitionJson } = req.body || {};
    if (!reportId || !title || !domain || !menuItemId || !definitionJson) {
      return res.status(400).json({ error: 'Thiếu reportId/title/domain/menuItemId/definitionJson' });
    }
    JSON.parse(definitionJson); // validate JSON hợp lệ trước khi lưu

    const pool = await getPool('RP');
    await pool.request()
      .input('reportId', sql.VarChar(80), reportId)
      .input('title', sql.NVarChar(200), title)
      .input('domain', sql.VarChar(50), domain)
      .input('menuItemId', sql.Int, menuItemId)
      .input('dataSourceId', sql.Int, dataSourceId || null)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .query(`
        INSERT INTO app.ReportCatalog (ReportId, Title, Domain, MenuItemId, DataSourceId, DefinitionJson)
        VALUES (@reportId, @title, @domain, @menuItemId, @dataSourceId, @definitionJson)
      `);
    await logAction(req, { module: 'Biểu mẫu', actionType: 'TAO_BAO_CAO', targetObject: reportId, description: `Tạo báo cáo "${title}"` });
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err instanceof SyntaxError) return res.status(400).json({ error: 'definitionJson không phải JSON hợp lệ' });
    if (err.number === 2627 || err.number === 2601) return res.status(409).json({ error: 'ReportId đã tồn tại' });
    next(err);
  }
});

router.put('/:reportId', async (req, res, next) => {
  try {
    const { title, domain, menuItemId, dataSourceId, definitionJson, isActive } = req.body || {};
    JSON.parse(definitionJson);

    const pool = await getPool('RP');
    await pool.request()
      .input('reportId', sql.VarChar(80), req.params.reportId)
      .input('title', sql.NVarChar(200), title)
      .input('domain', sql.VarChar(50), domain)
      .input('menuItemId', sql.Int, menuItemId)
      .input('dataSourceId', sql.Int, dataSourceId || null)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .input('isActive', sql.Bit, isActive ? 1 : 0)
      .query(`
        UPDATE app.ReportCatalog
        SET Title = @title, Domain = @domain, MenuItemId = @menuItemId,
            DataSourceId = @dataSourceId, DefinitionJson = @definitionJson, IsActive = @isActive
        WHERE ReportId = @reportId
      `);
    await logAction(req, { module: 'Biểu mẫu', actionType: 'SUA_BAO_CAO', targetObject: req.params.reportId, description: `Cập nhật báo cáo "${req.params.reportId}"` });
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof SyntaxError) return res.status(400).json({ error: 'definitionJson không phải JSON hợp lệ' });
    next(err);
  }
});

router.delete('/:reportId', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    await pool.request().input('reportId', sql.VarChar(80), req.params.reportId)
      .query('DELETE FROM app.ReportCatalog WHERE ReportId = @reportId');
    await logAction(req, { module: 'Biểu mẫu', actionType: 'XOA_BAO_CAO', targetObject: req.params.reportId, description: `Xoá báo cáo "${req.params.reportId}"` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Danh sách file mẫu đã tải lên templates/ — để chọn khi điền
// DefinitionJson.template thay vì phải nhớ/gõ tay tên file.
router.get('/templates', (req, res, next) => {
  try {
    const files = fs.readdirSync(TEMPLATES_DIR).filter(f => /\.(xlsx|pptx)$/i.test(f));
    res.json(files);
  } catch (err) { next(err); }
});

router.post('/templates', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Thiếu file' });
    await logAction(req, { module: 'Biểu mẫu', actionType: 'TAI_MAU', targetObject: req.file.originalname, description: `Tải lên file mẫu "${req.file.originalname}"` });
    res.status(201).json({ filename: req.file.originalname });
  } catch (err) { next(err); }
});

module.exports = router;
