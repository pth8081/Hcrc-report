// routes/admin/nsoStores.js — Trang "Siêu thị NSO": upload file Excel (hoặc
// sửa từng dòng) ghi vào etl.NsoStores — xem chú thích đầy đủ tại CREATE
// TABLE trong etl-db/schema.sql. Mirror routes/admin/diemStkMapping.js,
// ĐƠN GIẢN HƠN — chỉ MaDiem + TenSieuThi, không có kho cũ/mới/BuId/LoaiChuoi,
// không cần kiểm tra trùng STK_ID (MERGE theo MaDiem, UNIQUE tự chặn trùng).
//
// Quyền: requireMenuEdit('nso-stores') CHO MỌI THAO TÁC KỂ CẢ XEM — ảnh
// hưởng trực tiếp báo cáo doanh thu/lãi gộp theo ngành hàng (khối LFL/NSO),
// không có mức "chỉ xem" riêng — cùng quy ước diem-stk-mapping.
const express = require('express');
const multer = require('multer');
const { sql, getPool } = require('../../db');
const { requireAdminAuth } = require('../../lib/adminAuth');
const { requireMenuEdit } = require('../../lib/adminPermissions');
const {
  parseNsoStoresFile, upsertNsoStores, buildNsoStoresTemplate, buildNsoStoresExport
} = require('../../lib/nsoStoresImport');
const { logAction } = require('../../lib/auditLog');
const { hasZipSignature } = require('../../lib/fileSignature');
const { sendXlsx } = require('../../lib/xlsxResponse');

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

router.get('/', requireMenuEdit('nso-stores'), async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().query(`
      SELECT Id, MaDiem, TenSieuThi, IsActive, ImportedAt, ImportedBy
      FROM etl.NsoStores
      ORDER BY MaDiem
    `);
    res.json(result.recordset.map(r => ({
      id: r.Id, maDiem: r.MaDiem, tenSieuThi: r.TenSieuThi, isActive: !!r.IsActive,
      importedAt: r.ImportedAt, importedBy: r.ImportedBy
    })));
  } catch (err) { next(err); }
});

// Khoá/Kích hoạt 1 dòng — KHÔNG xoá dữ liệu, chỉ bật/tắt IsActive. Khi
// khoá, mã Điểm đó coi như KHÔNG CÓ trong danh sách NSO (mặc định LFL).
router.put('/:id/active', requireMenuEdit('nso-stores'), async (req, res, next) => {
  try {
    const isActive = !!(req.body || {}).isActive;
    const pool = await getPool('ADMIN');
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('isActive', sql.Bit, isActive)
      .query('UPDATE etl.NsoStores SET IsActive = @isActive OUTPUT INSERTED.MaDiem WHERE Id = @id');
    if (!result.recordset.length) return res.status(404).json({ error: 'Không tìm thấy dòng' });
    const { MaDiem } = result.recordset[0];
    await logAction(req, {
      module: 'Siêu thị NSO',
      actionType: isActive ? 'KICH_HOAT_NSO' : 'KHOA_NSO',
      targetObject: MaDiem,
      description: `${isActive ? 'Kích hoạt' : 'Khoá'} siêu thị NSO "${MaDiem}"`
    });
    res.json({ ok: true, isActive });
  } catch (err) { next(err); }
});

// Sửa/thêm ĐÚNG 1 dòng.
router.put('/one', requireMenuEdit('nso-stores'), async (req, res, next) => {
  try {
    const { maDiem, tenSieuThi } = req.body || {};
    if (!maDiem || !String(maDiem).trim()) return res.status(400).json({ error: 'Thiếu maDiem' });

    const row = { maDiem: String(maDiem).trim(), tenSieuThi: tenSieuThi ? String(tenSieuThi).trim() : null };

    const pool = await getPool('ADMIN');
    const result = await upsertNsoStores(pool, [row], req.admin.username);
    await logAction(req, { module: 'Siêu thị NSO', actionType: 'SUA_NSO', targetObject: row.maDiem, description: `Sửa siêu thị NSO "${row.maDiem}"` });
    res.json(result);
  } catch (err) { next(err); }
});

router.delete('/:id', requireMenuEdit('nso-stores'), async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().input('id', sql.Int, req.params.id)
      .query('DELETE FROM etl.NsoStores OUTPUT DELETED.MaDiem WHERE Id = @id');
    if (!result.recordset.length) return res.status(404).json({ error: 'Không tìm thấy dòng' });
    const { MaDiem } = result.recordset[0];
    await logAction(req, { module: 'Siêu thị NSO', actionType: 'XOA_NSO', targetObject: MaDiem, description: `Xoá siêu thị NSO "${MaDiem}"` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/template', requireMenuEdit('nso-stores'), async (req, res, next) => {
  try {
    const buffer = await buildNsoStoresTemplate();
    sendXlsx(res, buffer, 'mau-sieu-thi-nso.xlsx');
  } catch (err) { next(err); }
});

router.get('/export', requireMenuEdit('nso-stores'), async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().query('SELECT MaDiem, TenSieuThi FROM etl.NsoStores ORDER BY MaDiem');
    const rows = result.recordset.map(r => ({ maDiem: r.MaDiem, tenSieuThi: r.TenSieuThi }));
    const buffer = await buildNsoStoresExport(rows);
    sendXlsx(res, buffer, 'sieu-thi-nso.xlsx');
  } catch (err) { next(err); }
});

router.post('/import', requireMenuEdit('nso-stores'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Thiếu file (.xlsx)' });
    if (!hasZipSignature(req.file.buffer)) {
      return res.status(400).json({ error: 'File không đúng định dạng .xlsx (sai chữ ký file)' });
    }

    let parsed;
    try {
      parsed = await parseNsoStoresFile(req.file.buffer);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    const { rows, rowErrors } = parsed;
    if (!rows.length) {
      return res.status(400).json({ error: 'Không có dòng hợp lệ nào trong file', rowErrors });
    }

    const pool = await getPool('ADMIN');
    const result = await upsertNsoStores(pool, rows, req.admin.username);
    await logAction(req, { module: 'Siêu thị NSO', actionType: 'NHAP_NSO', targetObject: 'NsoStores', description: `Nhập file Siêu thị NSO: thêm mới ${result.inserted}, cập nhật ${result.updated} dòng` });
    res.json({ ...result, rowErrors });
  } catch (err) { next(err); }
});

module.exports = router;
