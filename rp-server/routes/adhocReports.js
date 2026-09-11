// routes/adhocReports.js — "Báo cáo tự do" (self-service, hướng Power BI):
// NGƯỜI DÙNG CUỐI (không phải admin) tự chọn Domain + trường nhóm/số liệu
// tổng hợp, khác app.ReportCatalog (admin định nghĩa sẵn). Xem
// lib/adhocReportEngine.js cho phần dựng câu truy vấn an toàn (whitelist
// field/agg) — route ở đây CHỈ lo phân quyền theo Domain + CRUD báo cáo đã
// lưu của riêng người dùng.
const express = require('express');
const { sql, getPool } = require('../db');
const { requireAuth, requireMenuAccess } = require('../lib/auth');
const { discoverDomainFields, runAdhocQuery } = require('../lib/adhocReportEngine');
const { logAction } = require('../lib/auditLog');

const router = express.Router();
// requireMenuAccess đã gắn sẵn req.userContext (gồm domains — xem
// lib/permissions.js) — mọi route dưới đây dùng lại, không tự gọi
// getUserContext() lần nữa.
router.use(requireAuth, requireMenuAccess('reports-adhoc'));

function requireDomainAccess(req, res, domain) {
  if (!req.userContext.domains.has(domain)) {
    res.status(403).json({ error: `Bạn không có quyền khám phá Domain "${domain}" — liên hệ admin cấp quyền ở trang Phân quyền` });
    return false;
  }
  return true;
}

// Chỉ trả Domain người dùng ĐƯỢC PHÉP mà THẬT SỰ có dữ liệu — tránh liệt kê
// Domain admin đã cấp quyền nhưng chưa/không còn dữ liệu (dễ gây nhầm "sao
// chọn vào không có gì").
router.get('/domains', async (req, res, next) => {
  try {
    if (!req.userContext.domains.size) return res.json([]);
    const dwhPool = await getPool('DWH');
    const request = dwhPool.request();
    const names = [...req.userContext.domains].map((d, i) => {
      request.input(`d${i}`, sql.VarChar(50), d);
      return `@d${i}`;
    });
    const result = await request.query(`SELECT DISTINCT Domain FROM dwh.ReportFacts WHERE Domain IN (${names.join(', ')}) ORDER BY Domain`);
    res.json(result.recordset.map(r => r.Domain));
  } catch (err) { next(err); }
});

router.get('/domains/:domain/fields', async (req, res, next) => {
  try {
    if (!requireDomainAccess(req, res, req.params.domain)) return;
    const fields = await discoverDomainFields(req.params.domain);
    res.json(fields);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.post('/run', async (req, res, next) => {
  try {
    const { domain, dimensionFields, measures, dateFrom, dateTo, entityCodes } = req.body || {};
    if (!domain) return res.status(400).json({ error: 'Thiếu domain' });
    if (!requireDomainAccess(req, res, domain)) return;

    const result = await runAdhocQuery({ domain, dimensionFields, measures, dateFrom, dateTo, entityCodes });
    await logAction(req, {
      module: 'Báo cáo tự do', actionType: 'CHAY_BAO_CAO_TU_DO', targetObject: domain,
      description: `Chạy báo cáo tự do domain "${domain}" (${(dimensionFields || []).length} trường nhóm, ${(measures || []).length} số liệu)`
    });
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// ===== Báo cáo tự do ĐÃ LƯU — riêng tư theo UserId, không có route admin
// xem của người khác ở bản đầu (xem chú thích app.UserSavedReports trong
// rp-db/schema.sql). 404 (không phải 403) khi không đúng chủ sở hữu, để
// không lộ sự tồn tại của báo cáo người khác.

router.get('/saved', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const result = await pool.request()
      .input('userId', sql.Int, req.user.sub)
      .query('SELECT Id, Title, ConfigJson, CreatedAt, UpdatedAt FROM app.UserSavedReports WHERE UserId = @userId ORDER BY UpdatedAt DESC');
    res.json(result.recordset);
  } catch (err) { next(err); }
});

router.post('/saved', async (req, res, next) => {
  try {
    const { title, configJson } = req.body || {};
    if (!title || !configJson) return res.status(400).json({ error: 'Thiếu title/configJson' });
    let parsed;
    try { parsed = JSON.parse(configJson); } catch { return res.status(400).json({ error: 'configJson không phải JSON hợp lệ' }); }
    if (!parsed.domain || !requireDomainAccess(req, res, parsed.domain)) return;

    const pool = await getPool('RP');
    const result = await pool.request()
      .input('userId', sql.Int, req.user.sub)
      .input('title', sql.NVarChar(200), title)
      .input('configJson', sql.NVarChar(sql.MAX), configJson)
      .query(`
        INSERT INTO app.UserSavedReports (UserId, Title, ConfigJson)
        OUTPUT INSERTED.Id, INSERTED.Title, INSERTED.ConfigJson, INSERTED.CreatedAt, INSERTED.UpdatedAt
        VALUES (@userId, @title, @configJson)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) { next(err); }
});

router.put('/saved/:id', async (req, res, next) => {
  try {
    const { title, configJson } = req.body || {};
    if (!title || !configJson) return res.status(400).json({ error: 'Thiếu title/configJson' });
    let parsed;
    try { parsed = JSON.parse(configJson); } catch { return res.status(400).json({ error: 'configJson không phải JSON hợp lệ' }); }
    // Kiểm tra lại quyền domain NGAY LÚC SỬA, giống POST /saved — không có
    // nhánh này trước đây thì việc chạy thật (POST /run) vẫn tự kiểm tra lại
    // domain nên không khai thác được, nhưng thiếu nó khiến 1 báo cáo lưu có
    // thể bị sửa đổi trỏ sang domain người dùng KHÔNG còn quyền (vd sau khi
    // admin thu hồi quyền) mà route này không báo lỗi ngay, chỉ phát hiện ở
    // lần chạy tiếp theo — sửa sớm cho nhất quán.
    if (!parsed.domain || !requireDomainAccess(req, res, parsed.domain)) return;

    const pool = await getPool('RP');
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('userId', sql.Int, req.user.sub)
      .input('title', sql.NVarChar(200), title)
      .input('configJson', sql.NVarChar(sql.MAX), configJson)
      .query(`
        UPDATE app.UserSavedReports SET Title = @title, ConfigJson = @configJson, UpdatedAt = SYSUTCDATETIME()
        WHERE Id = @id AND UserId = @userId
      `);
    if (!result.rowsAffected[0]) return res.status(404).json({ error: 'Không tìm thấy báo cáo đã lưu' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/saved/:id', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('userId', sql.Int, req.user.sub)
      .query('DELETE FROM app.UserSavedReports WHERE Id = @id AND UserId = @userId');
    if (!result.rowsAffected[0]) return res.status(404).json({ error: 'Không tìm thấy báo cáo đã lưu' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
