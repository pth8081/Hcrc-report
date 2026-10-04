// routes/internal/stockAlertThresholds.js — API NỘI BỘ (bản 8.70, theo yêu
// cầu người dùng) để rp-server gọi SANG khi 1 người dùng báo cáo (siêu thị)
// upload file ngưỡng cảnh báo hàng tồn — api-server chỉ đóng vai "nơi ghi
// dữ liệu", KHÔNG tự kiểm tra phạm vi siêu thị ở đây (rp-server đã kiểm tra
// theo storeScope của người đăng nhập TRƯỚC khi gọi sang, xem rp-server/
// routes/stockAlertThresholdsUpload.js) — route này chỉ xác thực ĐÚNG LÀ
// rp-server đang gọi (requireInternalSecret) rồi ghi thẳng vào CSDL ETL.
const express = require('express');
const { getPool } = require('../../db');
const { requireInternalSecret, internalAllowedIps } = require('../../lib/internalAuth');
const { replaceStockAlertThresholdsInEtl } = require('../../lib/stockAlertThresholdsEtlWrite');

const router = express.Router();
router.use(internalAllowedIps, requireInternalSecret);

router.post('/', async (req, res, next) => {
  try {
    const { rows, importedBy } = req.body || {};
    const pool = await getPool('ETL_DB');
    const count = await replaceStockAlertThresholdsInEtl(pool, rows, importedBy || null);
    res.json({ count });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
