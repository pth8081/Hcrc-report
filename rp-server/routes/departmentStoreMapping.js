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
//
// id (TUỲ CHỌN, có khi SỬA 1 dòng đã có) — BẮT BUỘC phải UPDATE đúng dòng
// đó THEO Id, KHÔNG được upsert theo departmentRaw mới gõ: departmentRaw
// chính là trường admin cần sửa NHIỀU NHẤT (lệch chính tả/viết tắt — đúng
// lý do có trang này), nếu upsert theo tên mới sẽ KHÔNG khớp dòng cũ nào
// (tên mới chưa tồn tại) → tạo DÒNG RÁC mới, để lại dòng cũ (tên sai) vẫn
// còn nguyên, âm thầm gán sai cho ai tra theo tên cũ (lỗi ĐÃ GẶP, sửa ở
// đây). Không có id (thêm dòng mới/nhập Excel) vẫn upsert theo
// departmentRaw như cũ — đúng ý nghĩa "nhập lại thì ghi đè đúng dòng cùng
// tên".
router.put('/one', requireSystemRoleActor, async (req, res, next) => {
  try {
    const { id, departmentRaw, maDiem } = req.body || {};
    if (!departmentRaw || !String(departmentRaw).trim()) return res.status(400).json({ error: 'Thiếu departmentRaw' });
    if (!maDiem || !String(maDiem).trim()) return res.status(400).json({ error: 'Thiếu maDiem' });
    const trimmedDepartmentRaw = String(departmentRaw).trim();
    const trimmedMaDiem = String(maDiem).trim();
    const pool = await getPool('RP');

    if (id) {
      const dup = await pool.request().input('departmentRaw', sql.NVarChar(200), trimmedDepartmentRaw).input('id', sql.Int, id)
        .query('SELECT Id FROM app.DepartmentStoreMapping WHERE DepartmentRaw = @departmentRaw AND Id <> @id');
      if (dup.recordset.length) return res.status(409).json({ error: `"${trimmedDepartmentRaw}" đã được dùng cho 1 dòng khác` });
      const updateResult = await pool.request()
        .input('id', sql.Int, id)
        .input('departmentRaw', sql.NVarChar(200), trimmedDepartmentRaw)
        .input('maDiem', sql.NVarChar(50), trimmedMaDiem)
        .input('importedBy', sql.NVarChar(50), req.user.username)
        .query('UPDATE app.DepartmentStoreMapping SET DepartmentRaw = @departmentRaw, MaDiem = @maDiem, ImportedAt = SYSUTCDATETIME(), ImportedBy = @importedBy WHERE Id = @id');
      if (!updateResult.rowsAffected[0]) return res.status(404).json({ error: 'Không tìm thấy dòng ánh xạ' });
    } else {
      await upsertDepartmentStoreMapping(pool, [{ departmentRaw: trimmedDepartmentRaw, maDiem: trimmedMaDiem }], req.user.username);
    }
    invalidateDepartmentStoreMappingCache();
    await logAction(req, { module: 'Ánh xạ Phòng ban - Siêu thị', actionType: 'SUA_ANH_XA_PHONG_BAN', targetObject: trimmedDepartmentRaw, description: `Sửa ánh xạ "${trimmedDepartmentRaw}" -> "${trimmedMaDiem}"` });
    res.json({ ok: true });
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
