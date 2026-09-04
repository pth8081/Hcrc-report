// routes/admin/branchCodeMap.js — Trang "Ánh xạ mã chi nhánh": upload file
// Excel (hoặc sửa từng dòng) ghi vào etl.BranchCodeMap — xem chú thích đầy
// đủ tại CREATE TABLE trong etl-db/schema.sql. Dùng pool "ADMIN" chung (bảng
// nằm trong CSDL etl cùng etl.SyncJobs/etl.DataSources, KHÔNG cần vai trò
// riêng như dwh.SalesTargets — bảng này không chạm dwh.ReportFacts).
//
// Quyền: requireAdminRole ('admin') — CHỈ admin đầy đủ mới cấu hình ánh xạ
// mã chi nhánh (ảnh hưởng cách MỌI job "Theo bảng" ghi EntityCode, khác
// phạm vi hẹp của 'target_importer').
const express = require('express');
const multer = require('multer');
const { sql, getPool } = require('../../db');
const { requireAdminAuth, requireAdminRole } = require('../../lib/adminAuth');
const { parseBranchCodeMapFile, upsertBranchCodeMap, TRANG_THAI_VALUES } = require('../../lib/branchCodeMapImport');
const { logAction } = require('../../lib/auditLog');
const { hasZipSignature } = require('../../lib/fileSignature');

const router = express.Router();
router.use(requireAdminAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.xlsx$/i.test(file.originalname);
    cb(ok ? null : new Error('Chỉ nhận file .xlsx'), ok);
  }
});

router.get('/', requireAdminRole, async (req, res, next) => {
  try {
    const { loaiMaKhac } = req.query;
    const pool = await getPool('ADMIN');
    const request = pool.request();
    let where = '';
    if (loaiMaKhac) { request.input('loaiMaKhac', sql.VarChar(50), loaiMaKhac); where = 'WHERE LoaiMaKhac = @loaiMaKhac'; }
    const result = await request.query(`
      SELECT Id, LoaiMaKhac, MaKhac, MaChuan, TenSieuThi, TrangThai, ImportedAt, ImportedBy
      FROM etl.BranchCodeMap ${where}
      ORDER BY LoaiMaKhac, MaKhac
    `);
    res.json(result.recordset.map(r => ({
      id: r.Id, loaiMaKhac: r.LoaiMaKhac, maKhac: r.MaKhac, maChuan: r.MaChuan,
      tenSieuThi: r.TenSieuThi, trangThai: r.TrangThai, importedAt: r.ImportedAt, importedBy: r.ImportedBy
    })));
  } catch (err) { next(err); }
});

// Sửa/thêm ĐÚNG 1 dòng — dùng khi 1 mã đổi giữa chừng, không cần chuẩn bị
// lại cả file Excel (cùng tinh thần routes/admin/salesTargets.js PUT /one).
router.put('/one', requireAdminRole, async (req, res, next) => {
  try {
    const { loaiMaKhac, maKhac, maChuan, tenSieuThi, trangThai } = req.body || {};
    if (!loaiMaKhac || !String(loaiMaKhac).trim()) return res.status(400).json({ error: 'Thiếu loaiMaKhac' });
    if (!maKhac || !String(maKhac).trim()) return res.status(400).json({ error: 'Thiếu maKhac' });
    if (!maChuan || !String(maChuan).trim()) return res.status(400).json({ error: 'Thiếu maChuan' });
    if (trangThai && !TRANG_THAI_VALUES.includes(trangThai)) {
      return res.status(400).json({ error: `"trangThai" phải là một trong: ${TRANG_THAI_VALUES.join(', ')} (hoặc để trống)` });
    }

    const pool = await getPool('ADMIN');
    const result = await upsertBranchCodeMap(pool, [{
      loaiMaKhac: String(loaiMaKhac).trim(),
      maKhac: String(maKhac).trim(),
      maChuan: String(maChuan).trim(),
      tenSieuThi: tenSieuThi ? String(tenSieuThi).trim() : null,
      trangThai: trangThai || null
    }], req.admin.username);
    await logAction(req, { module: 'Ánh xạ mã chi nhánh', actionType: 'SUA_ANH_XA', targetObject: `${loaiMaKhac}/${maKhac}`, description: `Sửa ánh xạ "${loaiMaKhac}/${maKhac}" -> "${maChuan}"` });
    res.json(result);
  } catch (err) { next(err); }
});

router.delete('/:id', requireAdminRole, async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().input('id', sql.Int, req.params.id)
      .query('DELETE FROM etl.BranchCodeMap OUTPUT DELETED.LoaiMaKhac, DELETED.MaKhac WHERE Id = @id');
    if (!result.recordset.length) return res.status(404).json({ error: 'Không tìm thấy dòng ánh xạ' });
    const { LoaiMaKhac, MaKhac } = result.recordset[0];
    await logAction(req, { module: 'Ánh xạ mã chi nhánh', actionType: 'XOA_ANH_XA', targetObject: `${LoaiMaKhac}/${MaKhac}`, description: `Xoá ánh xạ "${LoaiMaKhac}/${MaKhac}"` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/import', requireAdminRole, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Thiếu file (.xlsx)' });
    if (!hasZipSignature(req.file.buffer)) {
      return res.status(400).json({ error: 'File không đúng định dạng .xlsx (sai chữ ký file)' });
    }

    let parsed;
    try {
      parsed = await parseBranchCodeMapFile(req.file.buffer);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    const { rows, rowErrors } = parsed;
    if (!rows.length) {
      return res.status(400).json({ error: 'Không có dòng hợp lệ nào trong file', rowErrors });
    }

    const pool = await getPool('ADMIN');
    const result = await upsertBranchCodeMap(pool, rows, req.admin.username);
    await logAction(req, { module: 'Ánh xạ mã chi nhánh', actionType: 'NHAP_ANH_XA', targetObject: 'BranchCodeMap', description: `Nhập file ánh xạ mã chi nhánh: thêm mới ${result.inserted}, cập nhật ${result.updated} dòng` });
    res.json({ ...result, rowErrors });
  } catch (err) { next(err); }
});

module.exports = router;
