// routes/departmentStoreMapping.js — Trang "Ánh xạ Phòng ban -> Siêu thị"
// (bản 8.49) — mirror khuôn etl/routes/admin/diemStkMapping.js, đơn giản
// hoá (map 1-1, không có khái niệm gộp nhiều mã/tách kỳ). Dùng để GỢI Ý mã
// Điểm cho người dùng "Siêu Thị" (phạm vi dữ liệu, dự kiến bản sau) khi
// Department (vpdt) không khớp thẳng TenSieuThi đã khai ở "Ánh xạ Điểm -
// STK_ID" (lib/departmentStoreMapping.js tự thử khớp tên trước).
const express = require('express');
const multer = require('multer');
const { sql, getPool } = require('../db');
const { requireAuth, requireMenuAccess, requireSystemRoleActor } = require('../lib/auth');
const {
  parseDepartmentStoreMappingFile, upsertDepartmentStoreMapping,
  buildDepartmentStoreMappingTemplate, buildDepartmentStoreMappingExport
} = require('../lib/departmentStoreMappingImport');
const { invalidateDepartmentStoreMappingCache } = require('../lib/departmentStoreMapping');
const { logAction } = require('../lib/auditLog');
const { hasZipSignature } = require('../lib/fileSignature');

const router = express.Router();
router.use(requireAuth, requireMenuAccess('system-department-mapping'));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.xlsx$/i.test(file.originalname);
    cb(ok ? null : new Error('Chỉ nhận file .xlsx'), ok);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const result = await pool.request().query(`
      SELECT Id, DepartmentRaw, MaDiem, ImportedAt, ImportedBy
      FROM app.DepartmentStoreMapping ORDER BY DepartmentRaw
    `);
    res.json(result.recordset.map(r => ({
      id: r.Id, departmentRaw: r.DepartmentRaw, maDiem: r.MaDiem, importedAt: r.ImportedAt, importedBy: r.ImportedBy
    })));
  } catch (err) { next(err); }
});

// Sửa/thêm ĐÚNG 1 dòng — dùng khi 1 siêu thị đổi tên/thêm mới, không cần
// chuẩn bị lại cả file Excel.
router.put('/one', requireSystemRoleActor, async (req, res, next) => {
  try {
    const { departmentRaw, maDiem } = req.body || {};
    if (!departmentRaw || !String(departmentRaw).trim()) return res.status(400).json({ error: 'Thiếu departmentRaw' });
    if (!maDiem || !String(maDiem).trim()) return res.status(400).json({ error: 'Thiếu maDiem' });
    const pool = await getPool('RP');
    const result = await upsertDepartmentStoreMapping(pool, [{ departmentRaw: String(departmentRaw).trim(), maDiem: String(maDiem).trim() }], req.user.username);
    invalidateDepartmentStoreMappingCache();
    await logAction(req, { module: 'Ánh xạ Phòng ban - Siêu thị', actionType: 'SUA_ANH_XA_PHONG_BAN', targetObject: departmentRaw, description: `Sửa ánh xạ "${departmentRaw}" -> "${maDiem}"` });
    res.json(result);
  } catch (err) { next(err); }
});

router.delete('/:id', requireSystemRoleActor, async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const result = await pool.request().input('id', sql.Int, req.params.id)
      .query('DELETE FROM app.DepartmentStoreMapping OUTPUT DELETED.DepartmentRaw WHERE Id = @id');
    if (!result.recordset.length) return res.status(404).json({ error: 'Không tìm thấy dòng ánh xạ' });
    invalidateDepartmentStoreMappingCache();
    await logAction(req, { module: 'Ánh xạ Phòng ban - Siêu thị', actionType: 'XOA_ANH_XA_PHONG_BAN', targetObject: result.recordset[0].DepartmentRaw, description: `Xoá ánh xạ "${result.recordset[0].DepartmentRaw}"` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST (không phải GET) — rp-user/src/lib/api.js:downloadFile() luôn gửi
// POST (khớp quy ước các trang xuất file khác của rp-user, vd
// routes/dashboards.js:/export), khác hẳn quy ước GET của etl-admin.
router.post('/template', async (req, res, next) => {
  try {
    const buffer = await buildDepartmentStoreMappingTemplate();
    res.attachment('mau-anh-xa-phong-ban-sieu-thi.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) { next(err); }
});

router.post('/export', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const result = await pool.request().query('SELECT DepartmentRaw, MaDiem FROM app.DepartmentStoreMapping ORDER BY DepartmentRaw');
    const buffer = await buildDepartmentStoreMappingExport(result.recordset.map(r => ({ departmentRaw: r.DepartmentRaw, maDiem: r.MaDiem })));
    res.attachment('anh-xa-phong-ban-sieu-thi.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) { next(err); }
});

router.post('/import', requireSystemRoleActor, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Thiếu file (.xlsx)' });
    if (!hasZipSignature(req.file.buffer)) {
      return res.status(400).json({ error: 'File không đúng định dạng .xlsx (sai chữ ký file)' });
    }
    let parsed;
    try {
      parsed = await parseDepartmentStoreMappingFile(req.file.buffer);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    const { rows, rowErrors } = parsed;
    if (!rows.length) return res.status(400).json({ error: 'Không có dòng hợp lệ nào trong file', rowErrors });

    const pool = await getPool('RP');
    const result = await upsertDepartmentStoreMapping(pool, rows, req.user.username);
    invalidateDepartmentStoreMappingCache();
    await logAction(req, { module: 'Ánh xạ Phòng ban - Siêu thị', actionType: 'NHAP_ANH_XA_PHONG_BAN', description: `Nhập file ánh xạ: thêm mới ${result.inserted}, cập nhật ${result.updated} dòng` });
    res.json({ ...result, rowErrors });
  } catch (err) { next(err); }
});

module.exports = router;
