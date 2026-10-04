// routes/admin/stockAlertThresholds.js — Trang "Cảnh báo hàng tồn": upload
// file Excel (1 sheet) ghi vào etl.StockAlertThresholds — xem chú thích đầy
// đủ tại CREATE TABLE trong etl-db/schema.sql. Dùng cho báo cáo "Cảnh báo
// hàng tồn" (rp-server/lib/stockAlertRunner.js). Dùng pool "ADMIN" chung.
//
// Quyền: requireMenuEdit('stock-alert-thresholds') CHO MỌI THAO TÁC KỂ CẢ
// XEM — giống core-item-list/diem-stk-mapping, ảnh hưởng trực tiếp báo cáo
// cảnh báo hết hàng, không có mức "chỉ xem" riêng.
//
// Phạm vi siêu thị (bản 8.69, theo yêu cầu người dùng — xem
// admin.AdminUserStoreAccess/lib/adminPermissions.js) — req.adminContext.
// storeScope do requireMenuEdit gán sẵn: null = Toàn bộ (HO/vai trò hệ
// thống), mảng MaDiem = CHỈ được xem/sửa/xoá/upload đúng (các) siêu thị đó.
// Người bị giới hạn: GET / chỉ trả dòng thuộc scope; DELETE /:id/chặn dòng
// ngoài scope (404 — không lộ việc dòng đó CÓ tồn tại ở siêu thị khác);
// POST /import từ chối (400, KHÔNG ghi gì) nếu file có MaDiem ngoài scope.
const express = require('express');
const multer = require('multer');
const { sql, getPool } = require('../../db');
const { requireAdminAuth } = require('../../lib/adminAuth');
const { requireMenuEdit } = require('../../lib/adminPermissions');
const {
  parseStockAlertThresholdsFile, replaceStockAlertThresholds, distinctMaDiems,
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

// Dòng ngoài phạm vi (nếu storeScope !== null) bị LỌC BỎ hoàn toàn khỏi kết
// quả trả về — không phải chỉ ẩn trên UI, để người bị giới hạn không biết cả
// việc dòng đó tồn tại ở siêu thị khác.
function filterByScope(rows, storeScope, maDiemOf) {
  if (!storeScope) return rows;
  const scopeSet = new Set(storeScope);
  return rows.filter(r => scopeSet.has(maDiemOf(r)));
}

router.get('/', requireMenuEdit('stock-alert-thresholds'), async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().query(`
      SELECT Id, MaHang, MaDiem, NguongCanhBao, TenHang, NhaCungCap, ImportedAt, ImportedBy
      FROM etl.StockAlertThresholds
      ORDER BY MaDiem, MaHang
    `);
    const rows = result.recordset.map(r => ({
      id: r.Id, maHang: r.MaHang, maDiem: r.MaDiem, nguongCanhBao: r.NguongCanhBao,
      tenHang: r.TenHang, nhaCungCap: r.NhaCungCap, importedAt: r.ImportedAt, importedBy: r.ImportedBy
    }));
    res.json(filterByScope(rows, req.adminContext.storeScope, r => r.maDiem));
  } catch (err) { next(err); }
});

router.delete('/:id', requireMenuEdit('stock-alert-thresholds'), async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const { storeScope } = req.adminContext;

    // Tra MaDiem của dòng TRƯỚC khi xoá — cần biết để kiểm tra scope (xoá
    // thẳng kèm điều kiện MaDiem IN (...) cũng được, nhưng tách bước để trả
    // đúng 404 (không lộ thông tin) thay vì xoá "âm thầm không trúng dòng
    // nào" rồi vẫn báo 200).
    const existing = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT MaHang, MaDiem FROM etl.StockAlertThresholds WHERE Id = @id');
    if (!existing.recordset.length) return res.status(404).json({ error: 'Không tìm thấy ngưỡng cảnh báo' });
    const { MaHang, MaDiem } = existing.recordset[0];
    if (storeScope && !storeScope.includes(MaDiem)) return res.status(404).json({ error: 'Không tìm thấy ngưỡng cảnh báo' });

    await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM etl.StockAlertThresholds WHERE Id = @id');
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
    const scoped = filterByScope(rows, req.adminContext.storeScope, r => r.maDiem);
    const buffer = await buildStockAlertThresholdsExport(scoped);
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

    // Người bị giới hạn phạm vi siêu thị (bản 8.69) — TỪ CHỐI HẲN (không ghi
    // gì) nếu file có dòng thuộc siêu thị NGOÀI phạm vi của mình, thay vì âm
    // thầm bỏ qua (dễ gây hiểu nhầm "đã nhập xong" trong khi 1 phần dữ liệu
    // không được ghi) hoặc âm thầm cho qua (lọt phạm vi).
    const { storeScope } = req.adminContext;
    if (storeScope) {
      const scopeSet = new Set(storeScope);
      const outsideScope = distinctMaDiems(rows).filter(maDiem => !scopeSet.has(maDiem));
      if (outsideScope.length) {
        return res.status(400).json({
          error: `File có dòng thuộc siêu thị ngoài phạm vi được giao của bạn: ${outsideScope.join(', ')} — chỉ được nhập đúng siêu thị mình quản lý`
        });
      }
    }

    const pool = await getPool('ADMIN');
    const count = await replaceStockAlertThresholds(pool, rows, req.admin.username);
    await logAction(req, { module: 'Cảnh báo hàng tồn', actionType: 'NHAP_NGUONG_CANH_BAO', targetObject: 'StockAlertThresholds', description: `Nhập file ngưỡng cảnh báo hàng tồn (thay ĐÚNG các siêu thị có trong file: ${distinctMaDiems(rows).join(', ') || '(không có dòng nào)'}): ${count} dòng` });
    res.json({ count, rowErrors });
  } catch (err) { next(err); }
});

module.exports = router;
