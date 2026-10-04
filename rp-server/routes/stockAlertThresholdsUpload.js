// routes/stockAlertThresholdsUpload.js — Trang "Upload cảnh báo hàng tồn"
// (bản 8.70, theo yêu cầu người dùng) — người dùng báo cáo (siêu thị) tự
// upload file ngưỡng cảnh báo NGAY trên rp-user, KHÔNG cần vào etl-admin
// (khác đường cũ bản 8.68/8.69, admin tự upload qua etl-admin — đường đó
// vẫn giữ nguyên, dùng song song).
//
// Luồng: nhận file -> parse (lib/stockAlertThresholdsUpload.js) -> kiểm tra
// MỌI dòng MaDiem có nằm trong storeScope của người đăng nhập không (storeScope
// null = Admin hệ thống/không giới hạn, cho qua mọi MaDiem) -> gọi API nội bộ
// sang api-server (lib/internalApiClient.js) để GHI THẲNG vào etl.
// StockAlertThresholds (CSDL ETL) — rp-server/etl KHÔNG dùng chung CSDL,
// api-server là nơi ghi hộ.
const express = require('express');
const multer = require('multer');
const { requireAuth, requireMenuAccess } = require('../lib/auth');
const { parseStockAlertThresholdsUploadFile, distinctMaDiems, buildStockAlertThresholdsUploadTemplate } = require('../lib/stockAlertThresholdsUpload');
const { pushStockAlertThresholds } = require('../lib/internalApiClient');
const { loadDiemStkMapping } = require('../lib/diemStkMapping');
const { getUserContext } = require('../lib/permissions');
const { hasZipSignature, guardZipBombSize } = require('../lib/fileSignature');
const { logAction } = require('../lib/auditLog');

const router = express.Router();
router.use(requireAuth, requireMenuAccess('stock-alert-upload'));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.xlsx$/i.test(file.originalname);
    cb(ok ? null : new Error('Chỉ nhận file .xlsx'), ok);
  }
});

// Thông tin hiển thị trên trang: phạm vi siêu thị của NGƯỜI ĐANG ĐĂNG NHẬP
// (tên đầy đủ, không chỉ mã) — giúp người dùng biết chắc mình đang upload
// cho đúng siêu thị nào trước khi chọn file.
router.get('/', async (req, res, next) => {
  try {
    const context = await getUserContext(req.user.sub);
    if (!context) return res.status(401).json({ error: 'Tài khoản không còn hoạt động' });
    const diemMapping = await loadDiemStkMapping();
    const stores = context.storeScope
      ? context.storeScope.map(maDiem => ({ maDiem, tenSieuThi: diemMapping.get(maDiem)?.tenSieuThi || maDiem }))
      : null; // null = Toàn bộ (không giới hạn)
    res.json({ stores });
  } catch (err) { next(err); }
});

router.post('/template', async (req, res, next) => {
  try {
    const buffer = await buildStockAlertThresholdsUploadTemplate();
    res.attachment('mau-canh-bao-hang-ton.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) { next(err); }
});

router.post('/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Thiếu file (.xlsx)' });
    if (!hasZipSignature(req.file.buffer)) {
      return res.status(400).json({ error: 'File không đúng định dạng .xlsx (sai chữ ký file)' });
    }
    try {
      guardZipBombSize(req.file.buffer, 200 * 1024 * 1024);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    let parsed;
    try {
      parsed = await parseStockAlertThresholdsUploadFile(req.file.buffer);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    const { rows, rowErrors } = parsed;
    if (!rows.length) return res.status(400).json({ error: 'Không có dòng hợp lệ nào trong file', rowErrors });

    // Chặn ĐÚNG theo phạm vi siêu thị của người đăng nhập (bản 8.50/8.51 —
    // storeScope) — TỪ CHỐI HẲN (không ghi gì) nếu file có dòng thuộc siêu
    // thị NGOÀI phạm vi, mirror đúng tinh thần etl bản 8.69.
    const context = await getUserContext(req.user.sub);
    if (!context) return res.status(401).json({ error: 'Tài khoản không còn hoạt động' });
    if (context.storeScope) {
      const scopeSet = new Set(context.storeScope);
      const outsideScope = distinctMaDiems(rows).filter(maDiem => !scopeSet.has(maDiem));
      if (outsideScope.length) {
        return res.status(400).json({
          error: `File có dòng thuộc siêu thị ngoài phạm vi được giao của bạn: ${outsideScope.join(', ')} — chỉ được nhập đúng siêu thị mình quản lý`
        });
      }
    }

    let result;
    try {
      result = await pushStockAlertThresholds(rows, req.user.username);
    } catch (err) {
      if (err.isServiceUnavailable) return res.status(503).json({ error: err.message });
      throw err;
    }

    await logAction(req, {
      module: 'Cảnh báo hàng tồn (Upload)', actionType: 'NHAP_NGUONG_CANH_BAO_TU_BAO_CAO',
      description: `Upload file ngưỡng cảnh báo hàng tồn (thay đúng siêu thị trong file: ${distinctMaDiems(rows).join(', ')}): ${result.count} dòng`
    });
    res.json({ count: result.count, rowErrors });
  } catch (err) { next(err); }
});

module.exports = router;
