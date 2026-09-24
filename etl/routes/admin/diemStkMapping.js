// routes/admin/diemStkMapping.js — Trang "Ánh xạ Điểm - STK_ID": upload file
// Excel (hoặc sửa từng dòng) ghi vào etl.DiemStkMapping — xem chú thích đầy
// đủ tại CREATE TABLE trong etl-db/schema.sql. Dùng pool "ADMIN" chung (bảng
// nằm trong CSDL etl, giống etl.BranchCodeMap).
//
// Quyền: requireMenuEdit('diem-stk-mapping') CHO MỌI THAO TÁC KỂ CẢ XEM —
// cùng tinh thần etl.BranchCodeMap (ảnh hưởng trực tiếp số liệu báo cáo
// doanh thu/giao dịch, không có mức "chỉ xem" riêng).
const express = require('express');
const multer = require('multer');
const { sql, getPool } = require('../../db');
const { requireAdminAuth } = require('../../lib/adminAuth');
const { requireMenuEdit } = require('../../lib/adminPermissions');
const {
  parseDiemStkMappingFile, findDuplicateStkIds, upsertDiemStkMapping, parseStkList,
  buildDiemStkMappingTemplate, buildDiemStkMappingExport, buildBranchCodeMapSyncRows
} = require('../../lib/diemStkMappingImport');
const { upsertBranchCodeMap } = require('../../lib/branchCodeMapImport');
const { logAction } = require('../../lib/auditLog');
const { logWarn } = require('../../lib/systemLog');
const { hasZipSignature } = require('../../lib/fileSignature');
const { sendXlsx } = require('../../lib/xlsxResponse');

const router = express.Router();
router.use(requireAdminAuth);

// Đồng bộ TỰ ĐỘNG sang etl.BranchCodeMap ngay sau khi ghi "Ánh xạ Điểm -
// STK_ID" (xem giải thích đầy đủ ở buildBranchCodeMapSyncRows) — LỖI ở bước
// này KHÔNG được làm hỏng/rollback việc ghi DiemStkMapping đã thành công
// (bọc try/catch riêng, chỉ cảnh báo qua Log hệ thống + trả về cho frontend
// hiển thị, cùng tinh thần "1 tính năng phụ lỗi không chặn tính năng chính"
// đã áp dụng ở rp-server/lib/diemStkMapping.js).
async function syncToBranchCodeMap(pool, diemRows, importedBy) {
  const { rows, skipped } = buildBranchCodeMapSyncRows(diemRows);
  if (!rows.length) return { synced: 0, skipped };
  try {
    await upsertBranchCodeMap(pool, rows, importedBy);
    return { synced: rows.length, skipped };
  } catch (err) {
    await logWarn(`Đồng bộ "Ánh xạ Điểm - STK_ID" -> "Ánh xạ mã chi nhánh" lỗi (dữ liệu Điểm-STK_ID đã lưu bình thường, chỉ phần đồng bộ này lỗi): ${err.message}`);
    return { synced: 0, skipped, syncError: err.message };
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.xlsx$/i.test(file.originalname);
    cb(ok ? null : new Error('Chỉ nhận file .xlsx'), ok);
  }
});

router.get('/', requireMenuEdit('diem-stk-mapping'), async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().query(`
      SELECT Id, MaDiem, MaStkCu, MaStkMoi, TenSieuThi, ImportedAt, ImportedBy
      FROM etl.DiemStkMapping
      ORDER BY MaDiem
    `);
    res.json(result.recordset.map(r => ({
      id: r.Id, maDiem: r.MaDiem, maStkCu: parseStkList(r.MaStkCu), maStkMoi: parseStkList(r.MaStkMoi),
      tenSieuThi: r.TenSieuThi, importedAt: r.ImportedAt, importedBy: r.ImportedBy
    })));
  } catch (err) { next(err); }
});

// Sửa/thêm ĐÚNG 1 dòng — dùng khi 1 mã Điểm đổi giữa chừng, không cần chuẩn
// bị lại cả file Excel (cùng tinh thần routes/admin/branchCodeMap.js PUT /one).
router.put('/one', requireMenuEdit('diem-stk-mapping'), async (req, res, next) => {
  try {
    const { maDiem, maStkCu, maStkMoi, tenSieuThi } = req.body || {};
    if (!maDiem || !String(maDiem).trim()) return res.status(400).json({ error: 'Thiếu maDiem' });

    const row = {
      maDiem: String(maDiem).trim(),
      maStkCu: Array.isArray(maStkCu) ? maStkCu.map(s => String(s).trim()).filter(Boolean) : parseStkList(maStkCu),
      maStkMoi: Array.isArray(maStkMoi) ? maStkMoi.map(s => String(s).trim()).filter(Boolean) : parseStkList(maStkMoi),
      tenSieuThi: tenSieuThi ? String(tenSieuThi).trim() : null
    };

    const pool = await getPool('ADMIN');
    const conflicts = await findDuplicateStkIds(pool, [row]);
    if (conflicts.length) return res.status(400).json({ error: 'Phát hiện mã STK_ID trùng với mã Điểm khác — không lưu', conflicts });

    const result = await upsertDiemStkMapping(pool, [row], req.admin.username);
    const branchCodeMapSync = await syncToBranchCodeMap(pool, [row], req.admin.username);
    await logAction(req, { module: 'Ánh xạ Điểm - STK_ID', actionType: 'SUA_ANH_XA_DIEM_STK', targetObject: row.maDiem, description: `Sửa ánh xạ mã Điểm "${row.maDiem}"${branchCodeMapSync.synced ? ' — đã tự đồng bộ sang Ánh xạ mã chi nhánh' : ''}` });
    res.json({ ...result, branchCodeMapSync });
  } catch (err) { next(err); }
});

router.delete('/:id', requireMenuEdit('diem-stk-mapping'), async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().input('id', sql.Int, req.params.id)
      .query('DELETE FROM etl.DiemStkMapping OUTPUT DELETED.MaDiem WHERE Id = @id');
    if (!result.recordset.length) return res.status(404).json({ error: 'Không tìm thấy dòng ánh xạ' });
    const { MaDiem } = result.recordset[0];
    await logAction(req, { module: 'Ánh xạ Điểm - STK_ID', actionType: 'XOA_ANH_XA_DIEM_STK', targetObject: MaDiem, description: `Xoá ánh xạ mã Điểm "${MaDiem}"` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Tải "file mẫu" đúng khuôn cột — điền rồi nhập lại được luôn qua POST
// /import bên dưới.
router.get('/template', requireMenuEdit('diem-stk-mapping'), async (req, res, next) => {
  try {
    const buffer = await buildDiemStkMappingTemplate();
    sendXlsx(res, buffer, 'mau-anh-xa-diem-stk.xlsx');
  } catch (err) { next(err); }
});

// Xuất TOÀN BỘ ánh xạ đang lưu ra Excel — đúng khuôn cột file mẫu.
router.get('/export', requireMenuEdit('diem-stk-mapping'), async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().query(`
      SELECT MaDiem, MaStkCu, MaStkMoi, TenSieuThi
      FROM etl.DiemStkMapping
      ORDER BY MaDiem
    `);
    const rows = result.recordset.map(r => ({
      maDiem: r.MaDiem, maStkCu: parseStkList(r.MaStkCu), maStkMoi: parseStkList(r.MaStkMoi), tenSieuThi: r.TenSieuThi
    }));
    const buffer = await buildDiemStkMappingExport(rows);
    sendXlsx(res, buffer, 'anh-xa-diem-stk.xlsx');
  } catch (err) { next(err); }
});

router.post('/import', requireMenuEdit('diem-stk-mapping'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Thiếu file (.xlsx)' });
    if (!hasZipSignature(req.file.buffer)) {
      return res.status(400).json({ error: 'File không đúng định dạng .xlsx (sai chữ ký file)' });
    }

    let parsed;
    try {
      parsed = await parseDiemStkMappingFile(req.file.buffer);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    const { rows, rowErrors } = parsed;
    if (!rows.length) {
      return res.status(400).json({ error: 'Không có dòng hợp lệ nào trong file', rowErrors });
    }

    const pool = await getPool('ADMIN');
    // CHẶN HẲN toàn bộ file nếu phát hiện trùng mã STK_ID giữa 2 mã Điểm
    // khác nhau — xem chú thích lib/diemStkMappingImport.js: đây là lỗi cấu
    // hình nghiêm trọng (cộng trùng doanh thu), KHÔNG chỉ bỏ qua đúng dòng
    // lỗi như các file import khác trong repo.
    const conflicts = await findDuplicateStkIds(pool, rows);
    if (conflicts.length) {
      return res.status(400).json({
        error: `Phát hiện ${conflicts.length} mã STK_ID trùng giữa các mã Điểm khác nhau — ĐÃ HUỶ TOÀN BỘ lượt nhập (không có dòng nào được lưu), sửa lại file rồi nhập lại`,
        conflicts
      });
    }

    const result = await upsertDiemStkMapping(pool, rows, req.admin.username);
    const branchCodeMapSync = await syncToBranchCodeMap(pool, rows, req.admin.username);
    await logAction(req, { module: 'Ánh xạ Điểm - STK_ID', actionType: 'NHAP_ANH_XA_DIEM_STK', targetObject: 'DiemStkMapping', description: `Nhập file ánh xạ Điểm-STK_ID: thêm mới ${result.inserted}, cập nhật ${result.updated} dòng — tự đồng bộ ${branchCodeMapSync.synced} dòng sang Ánh xạ mã chi nhánh` });
    res.json({ ...result, rowErrors, branchCodeMapSync });
  } catch (err) { next(err); }
});

module.exports = router;
