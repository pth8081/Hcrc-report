// routes/v1/vouchers.js — API check/redeem cho app "HCRC Voucher Redemption"
// (xem api-voucher-check-redeem.md) — api-server đóng vai trò "Core API" mà
// app đó gọi tới. Khác hẳn routes/v1/realtime.js/realtimeWrite.js (endpoint
// ĐỘNG, admin tự tạo qua api-admin/): 2 route ở đây CỐ ĐỊNH trong code vì
// hợp đồng JSON đã cố định sẵn theo tài liệu app voucher, không cần tổng
// quát hoá. KHÔNG có bảng "Đối tác nào được gọi endpoint nào" riêng
// (ConsumerRealtimeAccess kiểu) — chỉ 1 cặp endpoint cố định nên gate bằng
// scope Consumer là đủ (check cần 'realtime', redeem cần 'realtimeWrite' —
// đúng 2 scope đã có sẵn, không tạo scope mới).
const express = require('express');
const { requireApiKey } = require('../../lib/apiAuth');
const { checkVoucher, redeemVoucher, ConfigError } = require('../../lib/voucherRedeemService');

const router = express.Router();

const MAX_CODE_LENGTH = 24; // giới hạn cột DB (BARCODE) — khớp tài liệu app voucher

function readVoucherCode(req, res) {
  const voucherCode = typeof req.body?.voucherCode === 'string' ? req.body.voucherCode.trim() : '';
  if (!voucherCode) {
    res.status(400).json({ success: false, message: 'Thieu voucherCode' });
    return null;
  }
  if (voucherCode.length > MAX_CODE_LENGTH) {
    res.status(400).json({ success: false, message: `Ma voucher qua dai (toi da ${MAX_CODE_LENGTH} ky tu)` });
    return null;
  }
  return voucherCode;
}

router.post('/check', requireApiKey('realtime'), async (req, res, next) => {
  try {
    const voucherCode = readVoucherCode(req, res);
    if (!voucherCode) return;
    const data = await checkVoucher(voucherCode);
    res.json({ success: true, data });
  } catch (err) {
    if (err instanceof ConfigError) return res.status(503).json({ success: false, message: err.message });
    next(err);
  }
});

router.post('/redeem', requireApiKey('realtimeWrite'), async (req, res, next) => {
  try {
    const voucherCode = readVoucherCode(req, res);
    if (!voucherCode) return;

    const { result, transNum, valueAmt, redeemedAt } = await redeemVoucher(voucherCode, req.consumer.id);
    if (result === 'notFound') return res.status(404).json({ error: 'Khong tim thay ma' }); // khớp tài liệu app voucher — riêng lỗi này dùng key "error", khác các nhánh khác dùng "success"/"message"
    if (result === 'alreadyUsed') {
      return res.json({
        success: false,
        data: { success: false, status: 'USED', message: 'Voucher nay da duoc su dung. Vui long quet ma khac.' }
      });
    }
    res.json({
      success: true,
      data: { success: true, status: 'REDEEMED', pendingSync: false, transNum, valueAmt, redeemedAt }
    });
  } catch (err) {
    if (err instanceof ConfigError) return res.status(503).json({ success: false, message: err.message });
    next(err);
  }
});

module.exports = router;
