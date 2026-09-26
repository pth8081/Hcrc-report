// routes/admin/coreItemList.js — Trang "Danh sách hàng Core": upload file
// Excel (2 sheet cố định "Core Mart"/"Core Minimart") ghi vào
// etl.CoreItemList — xem chú thích đầy đủ tại CREATE TABLE trong
// etl-db/schema.sql. Dùng cho báo cáo "Core stock = 0"
// (rp-server/lib/coreZeroStockRunner.js). Dùng pool "ADMIN" chung.
//
// Quyền: requireMenuEdit('core-item-list') CHO MỌI THAO TÁC KỂ CẢ XEM —
// giống diem-stk-mapping, ảnh hưởng trực tiếp danh sách mặt hàng hiện trên
// báo cáo cảnh báo hết hàng, không có mức "chỉ xem" riêng.
const express = require('express');
const multer = require('multer');
const { sql, getPool } = require('../../db');
const { requireAdminAuth } = require('../../lib/adminAuth');
const { requireMenuEdit } = require('../../lib/adminPermissions');
const {
  parseCoreItemListFile, replaceCoreItemList,
  buildCoreItemListTemplate, buildCoreItemListExport, LOAI_DIEM_TO_SHEET
} = require('../../lib/coreItemListImport');
const { logAction } = require('../../lib/auditLog');
const { hasZipSignature } = require('../../lib/fileSignature');
const { sendXlsx } = require('../../lib/xlsxResponse');

const router = express.Router();
router.use(requireAdminAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.xlsx$/i.test(file.originalname);
    cb(ok ? null : new Error('Chỉ nhận file .xlsx'), ok);
  }
});

router.get('/', requireMenuEdit('core-item-list'), async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().query(`
      SELECT Id, LoaiDiem, MaHang, MH, TenHang, Dvt, MaNganh, TenNganh, ImportedAt, ImportedBy
      FROM etl.CoreItemList
      ORDER BY LoaiDiem, MaHang
    `);
    res.json(result.recordset.map(r => ({
      id: r.Id, loaiDiem: r.LoaiDiem, maHang: r.MaHang, mh: r.MH,
      tenHang: r.TenHang, dvt: r.Dvt, maNganh: r.MaNganh, tenNganh: r.TenNganh,
      importedAt: r.ImportedAt, importedBy: r.ImportedBy
    })));
  } catch (err) { next(err); }
});

router.delete('/:id', requireMenuEdit('core-item-list'), async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().input('id', sql.Int, req.params.id)
      .query('DELETE FROM etl.CoreItemList OUTPUT DELETED.MaHang, DELETED.LoaiDiem WHERE Id = @id');
    if (!result.recordset.length) return res.status(404).json({ error: 'Không tìm thấy dòng hàng Core' });
    const { MaHang, LoaiDiem } = result.recordset[0];
    await logAction(req, { module: 'Danh sách hàng Core', actionType: 'XOA_HANG_CORE', targetObject: `${LoaiDiem}/${MaHang}`, description: `Xoá mã hàng Core "${MaHang}" (${LoaiDiem})` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Tải "file mẫu" đúng khuôn 2 sheet — điền rồi nhập lại được luôn qua POST
// /import bên dưới.
router.get('/template', requireMenuEdit('core-item-list'), async (req, res, next) => {
  try {
    const buffer = await buildCoreItemListTemplate();
    sendXlsx(res, buffer, 'mau-danh-sach-hang-core.xlsx');
  } catch (err) { next(err); }
});

// Xuất TOÀN BỘ danh sách Core đang lưu ra Excel (2 sheet) — đúng khuôn cột
// file mẫu.
router.get('/export', requireMenuEdit('core-item-list'), async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().query(`
      SELECT LoaiDiem, MaHang, MH, TenHang, Dvt, MaNganh, TenNganh FROM etl.CoreItemList ORDER BY LoaiDiem, MaHang
    `);
    const rowsByLoaiDiem = {};
    for (const loaiDiem of Object.keys(LOAI_DIEM_TO_SHEET)) rowsByLoaiDiem[loaiDiem] = [];
    for (const r of result.recordset) {
      rowsByLoaiDiem[r.LoaiDiem].push({ maHang: r.MaHang, mh: r.MH, tenHang: r.TenHang, dvt: r.Dvt, maNganh: r.MaNganh, tenNganh: r.TenNganh });
    }
    const buffer = await buildCoreItemListExport(rowsByLoaiDiem);
    sendXlsx(res, buffer, 'danh-sach-hang-core.xlsx');
  } catch (err) { next(err); }
});

router.post('/import', requireMenuEdit('core-item-list'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Thiếu file (.xlsx)' });
    if (!hasZipSignature(req.file.buffer)) {
      return res.status(400).json({ error: 'File không đúng định dạng .xlsx (sai chữ ký file)' });
    }

    let parsed;
    try {
      parsed = await parseCoreItemListFile(req.file.buffer);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    const { rowsByLoaiDiem, rowErrors } = parsed;
    const totalRows = Object.values(rowsByLoaiDiem).reduce((sum, rows) => sum + rows.length, 0);
    if (!totalRows && !Object.keys(rowsByLoaiDiem).length) {
      return res.status(400).json({ error: 'Không có sheet hợp lệ nào trong file', rowErrors });
    }

    const pool = await getPool('ADMIN');
    const counts = await replaceCoreItemList(pool, rowsByLoaiDiem, req.admin.username);
    const summary = Object.entries(counts).map(([loaiDiem, n]) => `${loaiDiem}: ${n} mã`).join(', ');
    await logAction(req, { module: 'Danh sách hàng Core', actionType: 'NHAP_DANH_SACH_HANG_CORE', targetObject: 'CoreItemList', description: `Nhập file danh sách hàng Core (THAY HẲN): ${summary}` });
    res.json({ counts, rowErrors });
  } catch (err) { next(err); }
});

module.exports = router;
