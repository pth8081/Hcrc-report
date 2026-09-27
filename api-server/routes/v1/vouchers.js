// routes/v1/vouchers.js — API check/redeem cho app "HCRC Voucher Redemption"
// (xem api-voucher-check-redeem.md) — api-server đóng vai trò "Core API" mà
// app đó gọi tới. Khác hẳn routes/v1/realtime.js/realtimeWrite.js (endpoint
// ĐỘNG, admin tự tạo qua api-admin/): 2 route ở đây CỐ ĐỊNH trong code vì
// hợp đồng JSON đã cố định sẵn theo tài liệu app voucher, không cần tổng
// quát hoá. KHÔNG có bảng "Đối tác nào được gọi endpoint nào" riêng
// (ConsumerRealtimeAccess kiểu) — chỉ 1 cặp endpoint cố định nên gate bằng
// scope Consumer là đủ.
//
// Scope RIÊNG 'voucherCheck'/'voucherRedeem' (Audit-Fix4) — TRƯỚC đây dùng
// chung 'realtime'/'realtimeWrite' (scope cho endpoint ĐỘNG ở trên) để đỡ
// tạo thêm scope, nhưng rà soát bảo mật chỉ ra: 2 tính năng không liên quan
// (đọc endpoint doanh thu động vs. thu hồi voucher) lại chia sẻ CÙNG 1 cổng
// quyền — cấp 'realtime' cho đối tác A vì lý do khác vô tình cũng mở luôn
// /vouchers/check cho đối tác đó. Tách riêng để cấp đúng phạm vi đúng mục
// đích (xem api-admin/src/pages/ConsumersPage.jsx).
const express = require('express');
const { requireApiKey } = require('../../lib/apiAuth');
const { checkVoucher, redeemVoucher, ConfigError, RedeemAuditFailedError } = require('../../lib/voucherRedeemService');
const guessGuard = require('../../lib/voucherGuessGuard');

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

router.post('/check', requireApiKey('voucherCheck'), async (req, res, next) => {
  try {
    // guessGuard (Audit-Fix9) — RIÊNG với checkConsumerRateLimit() ở
    // requireApiKey() (giới hạn tần suất chung, không phân biệt đúng/sai) —
    // xem lib/voucherGuessGuard.js.
    const blockedSeconds = guessGuard.isBlocked(req.consumer.id);
    if (blockedSeconds !== null) {
      res.setHeader('Retry-After', String(blockedSeconds));
      return res.status(429).json({ success: false, message: 'Qua nhieu lan do ma khong hop le lien tiep, thu lai sau.' });
    }

    const voucherCode = readVoucherCode(req, res);
    if (!voucherCode) return;
    const data = await checkVoucher(voucherCode);
    if (data.status === 'INVALID') guessGuard.recordInvalidGuess(req.consumer.id);
    else guessGuard.recordValidGuess(req.consumer.id);
    res.json({ success: true, data });
  } catch (err) {
    if (err instanceof ConfigError) return res.status(503).json({ success: false, message: err.message });
    next(err);
  }
});

router.post('/redeem', requireApiKey('voucherRedeem'), async (req, res, next) => {
  try {
    const blockedSeconds = guessGuard.isBlocked(req.consumer.id);
    if (blockedSeconds !== null) {
      res.setHeader('Retry-After', String(blockedSeconds));
      return res.status(429).json({ success: false, message: 'Qua nhieu lan do ma khong hop le lien tiep, thu lai sau.' });
    }

    const voucherCode = readVoucherCode(req, res);
    if (!voucherCode) return;

    const { result, transNum, valueAmt, redeemedAt } = await redeemVoucher(voucherCode, req.consumer.id);
    if (result === 'notFound') {
      guessGuard.recordInvalidGuess(req.consumer.id);
      return res.status(404).json({ error: 'Khong tim thay ma' }); // khớp tài liệu app voucher — riêng lỗi này dùng key "error", khác các nhánh khác dùng "success"/"message"
    }
    guessGuard.recordValidGuess(req.consumer.id); // 'alreadyUsed'/'redeemed' đều là mã CÓ TỒN TẠI, không phải lượt dò sai
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
    // Voucher ĐÃ bị đổi trạng thái thật (không lùi lại được) nhưng ghi audit
    // thất bại — khớp đúng mã lỗi 500 tài liệu app voucher gốc mô tả, PHẢI
    // trả về rõ ràng thay vì để rơi vào lỗi 500 chung chung (xem
    // voucherRedeemService.js:RedeemAuditFailedError).
    if (err instanceof RedeemAuditFailedError) {
      return res.status(500).json({ success: false, message: err.message });
    }
    next(err);
  }
});

module.exports = router;
