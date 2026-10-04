// routes/admin/stockAlertThresholds.js — Trang "Cảnh báo hàng tồn": upload
// file Excel (1 sheet) ghi vào etl.StockAlertThresholds — xem chú thích đầy
// đủ tại CREATE TABLE trong etl-db/schema.sql. Dùng cho báo cáo "Cảnh báo
// hàng tồn" (rp-server/lib/stockAlertRunner.js). Dùng pool "ADMIN" chung.
//
// Quyền: requireMenuEdit('stock-alert-thresholds') CHO MỌI THAO TÁC KỂ CẢ
// XEM — giống core-item-list/diem-stk-mapping, ảnh hưởng trực tiếp báo cáo
// cảnh báo hết hàng, không có mức "chỉ xem" riêng.
const express = require('express');
const multer = require('multer');
const { sql, getPool } = require('../../db');
const { requireAdminAuth } = require('../../lib/adminAuth');
const { requireMenuEdit } = require('../../lib/adminPermissions');
const {
  parseStockAlertThresholdsFile, replaceStockAlertThresholds,
  buildStockAlertThresholdsTemplate, buildStockAlertThresholdsExport
} = require('../../lib/stockAlertThresholdsImport');
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

router.get('/', requireMenuEdit('stock-alert-thresholds'), async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().query(`
      SELECT Id, MaHang, MaDiem, NguongCanhBao, TenHang, NhaCungCap, ImportedAt, ImportedBy
      FROM etl.StockAlertThresholds
      ORDER BY MaDiem, MaHang
    `);
    res.json(result.recordset.map(r => ({
      id: r.Id, maHang: r.MaHang, maDiem: r.MaDiem, nguongCanhBao: r.NguongCanhBao,
      tenHang: r.TenHang, nhaCungCap: r.NhaCungCap, importedAt: r.ImportedAt, importedBy: r.ImportedBy
    })));
  } catch (err) { next(err); }
});

router.delete('/:id', requireMenuEdit('stock-alert-thresholds'), async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().input('id', sql.Int, req.params.id)
      .query('DELETE FROM etl.StockAlertThresholds OUTPUT DELETED.MaHang, DELETED.MaDiem WHERE Id = @id');
    if (!result.recordset.length) return res.status(404).json({ error: 'Không tìm thấy ngưỡng cảnh báo' });
    const { MaHang, MaDiem } = result.recordset[0];
    await logAction(req, { module: 'Cảnh báo hàng tồn', actionType: 'XOA_NGUONG_CANH_BAO', targetObject: `${MaHang}/${MaDiem}`, description: `Xoá ngưỡng cảnh báo mã hàng "${MaHang}" tại siêu thị "${MaDiem}"` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/template', requireMenuEdit('stock-alert-thresholds'), async (req, res, next) => {
  try {
    const buffer = await buildStockAlertThresholdsTemplate();
    sendXlsx(res, buffer, 'mau-canh-bao-hang-ton.xlsx');
  } catch (err) { next(err); }
});

router.get('/export', requireMenuEdit('stock-alert-thresholds'), async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().query(`
      SELECT MaHang, MaDiem, NguongCanhBao, TenHang, NhaCungCap FROM etl.StockAlertThresholds ORDER BY MaDiem, MaHang
    `);
    const rows = result.recordset.map(r => ({ maHang: r.MaHang, maDiem: r.MaDiem, nguongCanhBao: r.NguongCanhBao, tenHang: r.TenHang, nhaCungCap: r.NhaCungCap }));
    const buffer = await buildStockAlertThresholdsExport(rows);
    sendXlsx(res, buffer, 'canh-bao-hang-ton.xlsx');
  } catch (err) { next(err); }
});

router.post('/import', requireMenuEdit('stock-alert-thresholds'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Thiếu file (.xlsx)' });
    if (!hasZipSignature(req.file.buffer)) {
      return res.status(400).json({ error: 'File không đúng định dạng .xlsx (sai chữ ký file)' });
    }

    let parsed;
    try {
      parsed = await parseStockAlertThresholdsFile(req.file.buffer);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    const { rows, rowErrors } = parsed;

    const pool = await getPool('ADMIN');

    // Chặn XOÁ SẠCH âm thầm — giống core-item-list: file có 0 dòng dữ liệu
    // nhưng danh sách hiện tại ĐANG có dữ liệu thì bắt xác nhận rõ ràng
    // trước khi REPLACE thành rỗng (báo cáo "Cảnh báo hàng tồn" sẽ mất hết
    // ngưỡng đang theo dõi).
    if (!rows.length && req.body.confirmEmpty !== 'true') {
      const existing = await pool.request().query('SELECT COUNT(*) AS Cnt FROM etl.StockAlertThresholds');
      if (existing.recordset[0].Cnt > 0) {
        return res.status(400).json({
          error: 'File không có dòng dữ liệu nào — sẽ XOÁ SẠCH danh sách ngưỡng cảnh báo hiện có (báo cáo "Cảnh báo hàng tồn" sẽ mất hết dữ liệu). Nếu chắc chắn muốn xoá sạch, tick xác nhận rồi nhập lại.',
          requiresConfirm: true
        });
      }
    }

    const count = await replaceStockAlertThresholds(pool, rows, req.admin.username);
    await logAction(req, { module: 'Cảnh báo hàng tồn', actionType: 'NHAP_NGUONG_CANH_BAO', targetObject: 'StockAlertThresholds', description: `Nhập file ngưỡng cảnh báo hàng tồn (THAY HẲN): ${count} dòng` });
    res.json({ count, rowErrors });
  } catch (err) { next(err); }
});

module.exports = router;
