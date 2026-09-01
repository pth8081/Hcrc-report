// routes/reportCatalog.js — Trang "Biểu mẫu": CRUD app.ReportCatalog (định
// nghĩa báo cáo — bộ lọc/cột/nguồn dữ liệu) + tải lên file mẫu .xlsx/.pptx
// vào templates/ (tham chiếu bằng tên file trong DefinitionJson.template,
// xem rp-server/README.md). Khác routes/reports.js: route ở đây thấy
// TOÀN BỘ báo cáo (kể cả IsActive=0) vì đây là trang cấu hình, không phải
// trang xem báo cáo — quyền xem thật do RoleReportAccess quyết định riêng.
const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { sql, getPool } = require('../db');
const { requireAuth, requireMenuAccess } = require('../lib/auth');
const { logAction } = require('../lib/auditLog');
const { parseFormula } = require('../lib/formulaEngine');
const { runExternalReport } = require('../lib/externalReportClient');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TEMPLATES_DIR),
    // path.basename() BẮT BUỘC — multer tự nó KHÔNG chặn traversal, dùng
    // thẳng chuỗi trả về ở đây làm tên file (path.join(destination, filename)
    // nội bộ). file.originalname là do NGƯỜI DÙNG TỰ ĐẶT khi chọn file, có
    // thể chứa "../../..." — chỉ kiểm tra ĐUÔI file (fileFilter dưới) không
    // đủ, vì "../../../etc/cron.d/evil.xlsx" vẫn khớp đuôi .xlsx. basename()
    // bỏ hết phần thư mục theo dấu "/", CHỈ đúng trên Linux (server triển
    // khai thật) — path.basename trên POSIX KHÔNG coi "\" là dấu phân cách,
    // nên xoá thêm mọi ký tự "\" còn sót (phòng hờ, không để lọt tên file kỳ
    // dị chứa "..\.." dù vô hại trên Linux, tránh gây nhầm lẫn/lỗi nếu code
    // này chạy trên hệ khác).
    filename: (req, file, cb) => {
      const safeName = path.basename(file.originalname).replace(/\\/g, '_');
      if (!safeName || safeName === '.' || safeName === '..') {
        return cb(new Error('Tên file không hợp lệ'));
      }
      cb(null, safeName);
    }
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(xlsx|pptx)$/i.test(file.originalname);
    cb(ok ? null : new Error('Chỉ nhận file .xlsx hoặc .pptx'), ok);
  }
});

const router = express.Router();
router.use(requireAuth, requireMenuAccess('system-report-catalog'));

// HasEmailSchedule/HasAnomalyAlert — CÓ ÍT NHẤT 1 dòng ở app.ReportEmailSchedules/
// app.AnomalyAlerts trỏ tới báo cáo đó hay chưa (bất kể đang bật/tắt) — cho
// trang biết ngay báo cáo nào CHƯA cấu hình gửi email/cảnh báo, không cần
// mở riêng 2 trang kia để dò từng báo cáo (xem rp-user/.../ReportCatalogPanel.jsx).
router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const result = await pool.request().query(`
      SELECT c.ReportId, c.Title, c.Domain, c.MenuItemId, c.DataSourceId, c.SourceType, c.ApiConnectionId,
             c.ApiTarget, c.ExternalConnectionId, c.DefinitionJson, c.IsActive,
             CASE WHEN es.Cnt > 0 THEN 1 ELSE 0 END AS HasEmailSchedule,
             CASE WHEN aa.Cnt > 0 THEN 1 ELSE 0 END AS HasAnomalyAlert
      FROM app.ReportCatalog c
      LEFT JOIN (SELECT ReportId, COUNT(*) AS Cnt FROM app.ReportEmailSchedules GROUP BY ReportId) es ON es.ReportId = c.ReportId
      LEFT JOIN (SELECT ReportId, COUNT(*) AS Cnt FROM app.AnomalyAlerts GROUP BY ReportId) aa ON aa.ReportId = c.ReportId
      ORDER BY c.Title
    `);
    res.json(result.recordset);
  } catch (err) { next(err); }
});

const SOURCE_TYPES = ['directDb', 'apiReport', 'apiRealtime', 'externalApi', 'composite'];

// 'apiReport'/'apiRealtime' cần apiConnectionId + apiTarget; 'externalApi'
// cần externalConnectionId (+ externalPath/externalShape trong
// DefinitionJson, kiểm tra riêng ở validateExternalDefinition — cần JSON đã
// parse). 'composite' cần "blocks" trong DefinitionJson, kiểm tra riêng ở
// validateCompositeDefinition. KHÔNG loại nào trong 4 loại này cần
// dataSourceId ở CỘT NÀY — Report Server không tự mở kết nối DB riêng cho
// chúng (xem lib/apiReportClient.js, lib/externalReportClient.js,
// lib/compositeReportRunner.js — 'composite' có thể tự khai dataSourceId
// RIÊNG cho từng khối bên trong DefinitionJson.blocks, không dùng cột này).
function validateSource({ sourceType = 'directDb', apiConnectionId, apiTarget, externalConnectionId }) {
  if (!SOURCE_TYPES.includes(sourceType)) {
    return `sourceType phải là một trong: ${SOURCE_TYPES.join(', ')}`;
  }
  if ((sourceType === 'apiReport' || sourceType === 'apiRealtime') && (!apiConnectionId || !apiTarget)) {
    return 'sourceType "apiReport"/"apiRealtime" cần apiConnectionId và apiTarget';
  }
  if (sourceType === 'externalApi' && !externalConnectionId) {
    return 'sourceType "externalApi" cần externalConnectionId';
  }
  return null;
}

// externalPath/externalShape khai TRONG DefinitionJson (không phải cột DB
// riêng như apiTarget) — kiểm tra sau khi đã JSON.parse.
function validateExternalDefinition(sourceType, definition) {
  if (sourceType !== 'externalApi') return null;
  if (!definition.externalPath) return 'sourceType "externalApi" cần khai "externalPath" trong DefinitionJson';
  if (!['lookup', 'list'].includes(definition.externalShape)) {
    return 'sourceType "externalApi" cần "externalShape" là "lookup" hoặc "list" trong DefinitionJson';
  }
  return null;
}

// blocks[] khai TRONG DefinitionJson — mỗi khối tự chọn 1 trong 3 cách lấy
// dữ liệu (directDb/apiReport/apiRealtime), HOẶC isTarget=true (đọc
// dwh.SalesTargets, xem lib/salesTargetsReader.js) — xem
// lib/compositeReportRunner.js đầu file cho hình dạng đầy đủ.
//
// MAX_COMPOSITE_BLOCKS — compositeReportRunner.js chạy MỌI khối SONG SONG
// (Promise.all), mỗi khối apiReport/apiRealtime giữ 1 lượt gọi HTTP ra
// ngoài tới 30s, mỗi khối directDb không tự chọn dataSourceId dùng CHUNG
// pool DWH (mặc định 10-20 connection, xem db.js) — 1 báo cáo composite có
// quá nhiều khối, bị gọi lặp lại (route /run không giới hạn riêng gì ngoài
// giới hạn chung theo IP ở server.js), có thể chiếm hết pool DWH/mở hàng
// chục kết nối HTTP đồng thời, ảnh hưởng tới báo cáo của NGƯỜI DÙNG KHÁC.
// Case thật hiện tại (đối chiếu siêu thị/trung tâm, mục 4
// hướng_dẫn_báo_cáo.md) chỉ cần 2-3 khối — 15 đã dư nhiều lần.
const MAX_COMPOSITE_BLOCKS = 15;

function validateCompositeDefinition(sourceType, definition) {
  if (sourceType !== 'composite') return null;
  if (!Array.isArray(definition.blocks) || !definition.blocks.length) {
    return 'sourceType "composite" cần mảng "blocks" (ít nhất 1 khối) trong DefinitionJson';
  }
  if (definition.blocks.length > MAX_COMPOSITE_BLOCKS) {
    return `sourceType "composite" chỉ hỗ trợ tối đa ${MAX_COMPOSITE_BLOCKS} khối trong "blocks" (đang có ${definition.blocks.length})`;
  }
  const seenKeys = new Set();
  for (const block of definition.blocks) {
    if (!block || !block.key) return 'Mỗi khối trong "blocks" phải có "key"';
    if (seenKeys.has(block.key)) return `Trùng "key" khối nguồn: "${block.key}"`;
    seenKeys.add(block.key);
    if (block.isTarget) {
      if (!block.targetDomain) return `Khối "${block.key}" (isTarget) thiếu "targetDomain"`;
      continue;
    }
    if (!['directDb', 'apiReport', 'apiRealtime'].includes(block.sourceType)) {
      return `Khối "${block.key}" có sourceType không hợp lệ (directDb/apiReport/apiRealtime, hoặc isTarget=true)`;
    }
    if (block.sourceType === 'directDb' && !block.domain) {
      return `Khối "${block.key}" (directDb) thiếu "domain"`;
    }
    if ((block.sourceType === 'apiReport' || block.sourceType === 'apiRealtime') && (!block.apiConnectionId || !block.apiTarget)) {
      return `Khối "${block.key}" (${block.sourceType}) thiếu apiConnectionId/apiTarget`;
    }
  }
  return null;
}

// Cột dạng công thức ({ key, label, formula }) — kiểm tra cú pháp NGAY LÚC
// LƯU, không đợi tới lúc chạy báo cáo mới lộ lỗi (xem lib/formulaEngine.js).
function validateFormulaColumns(definition) {
  for (const col of definition.columns || []) {
    if (col && typeof col === 'object' && col.formula) {
      if (!col.key) return 'Cột công thức thiếu "key"';
      try {
        parseFormula(col.formula);
      } catch (err) {
        return `Công thức cột "${col.key}" sai cú pháp: ${err.message}`;
      }
    }
  }
  return null;
}

router.post('/', async (req, res, next) => {
  try {
    const { reportId, title, domain, menuItemId, dataSourceId, definitionJson, sourceType = 'directDb', apiConnectionId, apiTarget, externalConnectionId } = req.body || {};
    if (!reportId || !title || !domain || !menuItemId || !definitionJson) {
      return res.status(400).json({ error: 'Thiếu reportId/title/domain/menuItemId/definitionJson' });
    }
    const sourceError = validateSource({ sourceType, apiConnectionId, apiTarget, externalConnectionId });
    if (sourceError) return res.status(400).json({ error: sourceError });
    const definition = JSON.parse(definitionJson); // validate JSON hợp lệ trước khi lưu
    const externalError = validateExternalDefinition(sourceType, definition);
    if (externalError) return res.status(400).json({ error: externalError });
    const compositeError = validateCompositeDefinition(sourceType, definition);
    if (compositeError) return res.status(400).json({ error: compositeError });
    const formulaError = validateFormulaColumns(definition);
    if (formulaError) return res.status(400).json({ error: formulaError });

    const pool = await getPool('RP');
    await pool.request()
      .input('reportId', sql.VarChar(80), reportId)
      .input('title', sql.NVarChar(200), title)
      .input('domain', sql.VarChar(50), domain)
      .input('menuItemId', sql.Int, menuItemId)
      .input('dataSourceId', sql.Int, sourceType === 'directDb' ? (dataSourceId || null) : null)
      .input('sourceType', sql.VarChar(20), sourceType)
      .input('apiConnectionId', sql.Int, sourceType === 'apiReport' || sourceType === 'apiRealtime' ? apiConnectionId : null)
      .input('apiTarget', sql.NVarChar(200), sourceType === 'apiReport' || sourceType === 'apiRealtime' ? apiTarget : null)
      .input('externalConnectionId', sql.Int, sourceType === 'externalApi' ? externalConnectionId : null)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .query(`
        INSERT INTO app.ReportCatalog (ReportId, Title, Domain, MenuItemId, DataSourceId, SourceType, ApiConnectionId, ApiTarget, ExternalConnectionId, DefinitionJson)
        VALUES (@reportId, @title, @domain, @menuItemId, @dataSourceId, @sourceType, @apiConnectionId, @apiTarget, @externalConnectionId, @definitionJson)
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
    const { title, domain, menuItemId, dataSourceId, definitionJson, isActive, sourceType = 'directDb', apiConnectionId, apiTarget, externalConnectionId } = req.body || {};
    const sourceError = validateSource({ sourceType, apiConnectionId, apiTarget, externalConnectionId });
    if (sourceError) return res.status(400).json({ error: sourceError });
    const definition = JSON.parse(definitionJson);
    const externalError = validateExternalDefinition(sourceType, definition);
    if (externalError) return res.status(400).json({ error: externalError });
    const compositeError = validateCompositeDefinition(sourceType, definition);
    if (compositeError) return res.status(400).json({ error: compositeError });
    const formulaError = validateFormulaColumns(definition);
    if (formulaError) return res.status(400).json({ error: formulaError });

    const pool = await getPool('RP');
    await pool.request()
      .input('reportId', sql.VarChar(80), req.params.reportId)
      .input('title', sql.NVarChar(200), title)
      .input('domain', sql.VarChar(50), domain)
      .input('menuItemId', sql.Int, menuItemId)
      .input('dataSourceId', sql.Int, sourceType === 'directDb' ? (dataSourceId || null) : null)
      .input('sourceType', sql.VarChar(20), sourceType)
      .input('apiConnectionId', sql.Int, sourceType === 'apiReport' || sourceType === 'apiRealtime' ? apiConnectionId : null)
      .input('apiTarget', sql.NVarChar(200), sourceType === 'apiReport' || sourceType === 'apiRealtime' ? apiTarget : null)
      .input('externalConnectionId', sql.Int, sourceType === 'externalApi' ? externalConnectionId : null)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .input('isActive', sql.Bit, isActive ? 1 : 0)
      .query(`
        UPDATE app.ReportCatalog
        SET Title = @title, Domain = @domain, MenuItemId = @menuItemId,
            DataSourceId = @dataSourceId, SourceType = @sourceType,
            ApiConnectionId = @apiConnectionId, ApiTarget = @apiTarget,
            ExternalConnectionId = @externalConnectionId,
            DefinitionJson = @definitionJson, IsActive = @isActive
        WHERE ReportId = @reportId
      `);
    await logAction(req, { module: 'Biểu mẫu', actionType: 'SUA_BAO_CAO', targetObject: req.params.reportId, description: `Cập nhật báo cáo "${req.params.reportId}"` });
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof SyntaxError) return res.status(400).json({ error: 'definitionJson không phải JSON hợp lệ' });
    next(err);
  }
});

// "Chạy thử" — gọi thật API đối tác với cấu hình ĐANG SOẠN (chưa cần lưu
// báo cáo trước), để phát hiện sai externalPath/externalListPath/columns
// trước khi kích hoạt cho người dùng. externalConnectionId phải trỏ tới một
// kết nối ĐÃ LƯU (key/mật khẩu chỉ tồn tại dạng mã hoá trong CSDL).
router.post('/test-external-api', async (req, res, next) => {
  try {
    const { externalConnectionId, externalPath, externalShape, externalListPath, columns = [], filters = {} } = req.body || {};
    if (!externalConnectionId || !externalPath || !externalShape) {
      return res.status(400).json({ error: 'Thiếu externalConnectionId/externalPath/externalShape' });
    }
    const formulaError = validateFormulaColumns({ columns });
    if (formulaError) return res.status(400).json({ error: formulaError });

    const result = await runExternalReport(
      { externalConnectionId, externalPath, externalShape, externalListPath, columns },
      filters
    );
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
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
    // req.file.filename = tên đã qua path.basename() ở storage.filename phía
    // trên (tên THẬT lưu trên đĩa) — trả về đúng cái này, không phải
    // originalname gốc (có thể khác nếu người dùng gõ đường dẫn traversal).
    await logAction(req, { module: 'Biểu mẫu', actionType: 'TAI_MAU', targetObject: req.file.filename, description: `Tải lên file mẫu "${req.file.filename}"` });
    res.status(201).json({ filename: req.file.filename });
  } catch (err) { next(err); }
});

module.exports = router;
