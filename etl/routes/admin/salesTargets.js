// routes/admin/salesTargets.js — Trang "Nhập chỉ tiêu": upload file Excel
// chỉ tiêu (target/KPI) theo tháng, ghi vào dwh.SalesTargets (bảng RIÊNG,
// KHÔNG chung dwh.ReportFacts — xem dwh/schema.sql). Dùng RIÊNG pool
// "DWH_TARGET_IMPORTER" (KHÔNG dùng pool "DWH"/etl_writer, quyền rộng hơn
// nhiều) — dù route này chạy trong CÙNG tiến trình etl với routes ghi
// dwh.ReportFacts, phòng thủ chiều sâu: lỗi ở route này không thể chạm được
// dwh.ReportFacts (xem dwh/grants.sql).
//
// Quyền: requireTargetImporterRole — 'admin' HOẶC 'target_importer' (vai
// trò hẹp, chỉ vào được đúng trang này, không thấy DataSources/SyncJobs —
// xem lib/adminAuth.js).
const express = require('express');
const multer = require('multer');
const { sql, getPool } = require('../../db');
const { requireAdminAuth, requireTargetImporterRole } = require('../../lib/adminAuth');
const { parseSalesTargetsFile, upsertSalesTargets, PERIOD_RE, TRANG_THAI_VALUES } = require('../../lib/salesTargetsImport');

const router = express.Router();
router.use(requireAdminAuth);

// memoryStorage — CHỈ đọc để parse ngay trong bộ nhớ, KHÔNG lưu file gốc
// lên đĩa (không cần giữ lại sau khi đã ghi xong dữ liệu vào DWH — tránh
// luôn câu hỏi path traversal của tên file gốc, khác template upload bên
// rp-server phải giữ file thật).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.xlsx$/i.test(file.originalname);
    cb(ok ? null : new Error('Chỉ nhận file .xlsx'), ok);
  }
});

router.get('/', requireTargetImporterRole, async (req, res, next) => {
  try {
    const { domain, periodMonth } = req.query;
    const pool = await getPool('DWH_TARGET_IMPORTER');
    const request = pool.request();
    const conditions = [];
    if (domain) { request.input('domain', sql.VarChar(50), domain); conditions.push('Domain = @domain'); }
    if (periodMonth) { request.input('periodMonth', sql.Date, periodMonth); conditions.push('PeriodMonth = @periodMonth'); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await request.query(`
      SELECT Id, Domain, EntityCode, PeriodMonth, TargetsJson, ImportedAt, ImportedBy
      FROM dwh.SalesTargets ${where}
      ORDER BY PeriodMonth DESC, EntityCode
    `);
    res.json(result.recordset.map(r => ({
      id: r.Id, domain: r.Domain, entityCode: r.EntityCode, periodMonth: r.PeriodMonth,
      targets: JSON.parse(r.TargetsJson), importedAt: r.ImportedAt, importedBy: r.ImportedBy
    })));
  } catch (err) { next(err); }
});

// Sửa/thêm ĐÚNG 1 dòng — dùng khi giữa tháng phát sinh đóng/mở siêu thị,
// KHÔNG cần chuẩn bị lại cả file Excel. Body PHẢI mang đủ "targets" hiện có
// (kể cả field không đổi) — route này GHI ĐÈ nguyên TargetsJson của dòng đó
// (giống hệt semantics import file, chỉ khác 1 dòng thay vì cả file), KHÔNG
// merge từng phần ở tầng server — tránh nhầm lẫn field nào bị giữ/field nào
// bị xoá nếu server tự ý merge. Giao diện (etl-admin) tự tải dữ liệu hiện
// có của dòng đó lên form trước khi cho sửa, để không mất dữ liệu ngoài ý
// muốn.
router.put('/one', requireTargetImporterRole, async (req, res, next) => {
  try {
    const { domain, entityCode, periodMonth, trangThai, targets } = req.body || {};
    if (!domain || !domain.trim()) return res.status(400).json({ error: 'Thiếu domain' });
    if (!entityCode || !String(entityCode).trim()) return res.status(400).json({ error: 'Thiếu entityCode (mã siêu thị)' });
    if (!PERIOD_RE.test(periodMonth || '')) {
      return res.status(400).json({ error: '"periodMonth" phải dạng YYYY-MM' });
    }
    if (trangThai && !TRANG_THAI_VALUES.includes(trangThai)) {
      return res.status(400).json({ error: `"trangThai" phải là một trong: ${TRANG_THAI_VALUES.join(', ')} (hoặc để trống)` });
    }

    const mergedTargets = { ...(targets || {}) };
    if (trangThai) mergedTargets.TrangThai = trangThai;
    else delete mergedTargets.TrangThai;
    if (!Object.keys(mergedTargets).length) {
      return res.status(400).json({ error: 'Không có giá trị chỉ tiêu nào (và không đánh dấu trangThai)' });
    }

    const pool = await getPool('DWH_TARGET_IMPORTER');
    const result = await upsertSalesTargets(pool, domain.trim(), [{
      entityCode: String(entityCode).trim(),
      periodMonth: new Date(`${periodMonth}-01T00:00:00Z`),
      targets: mergedTargets
    }], req.admin.username);
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/import', requireTargetImporterRole, upload.single('file'), async (req, res, next) => {
  try {
    const { domain } = req.body || {};
    if (!domain || !domain.trim()) return res.status(400).json({ error: 'Thiếu domain' });
    if (!req.file) return res.status(400).json({ error: 'Thiếu file (.xlsx)' });

    let parsed;
    try {
      parsed = await parseSalesTargetsFile(req.file.buffer);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    const { rows, rowErrors } = parsed;
    if (!rows.length) {
      return res.status(400).json({ error: 'Không có dòng hợp lệ nào trong file', rowErrors });
    }

    const pool = await getPool('DWH_TARGET_IMPORTER');
    const result = await upsertSalesTargets(pool, domain.trim(), rows, req.admin.username);
    res.json({ ...result, rowErrors });
  } catch (err) { next(err); }
});

module.exports = router;
