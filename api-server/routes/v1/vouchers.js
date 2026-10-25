// routes/v1/vouchers.js — API check/redeem cho app "HCRC Voucher Redemption"
// (xem api-voucher-check-redeem.md) — api-server đóng vai trò "Core API" mà
// app đó gọi tới. Khác hẳn routes/v1/realtime.js/realtimeWrite.js (endpoint
// ĐỘNG, admin tự tạo qua api-admin/): 2 route ở đây CỐ ĐỊNH trong code vì
// hợp đồng JSON đã cố định sẵn theo tài liệu app voucher, không cần tổng
// quát hoá.
//
// Scope RIÊNG 'voucherCheck'/'voucherRedeem' (Audit-Fix4) — TRƯỚC đây dùng
// chung 'realtime'/'realtimeWrite' (scope cho endpoint ĐỘNG ở trên) để đỡ
// tạo thêm scope, nhưng rà soát bảo mật chỉ ra: 2 tính năng không liên quan
// (đọc endpoint doanh thu động vs. thu hồi voucher) lại chia sẻ CÙNG 1 cổng
// quyền — cấp 'realtime' cho đối tác A vì lý do khác vô tình cũng mở luôn
// /vouchers/check cho đối tác đó. Tách riêng để cấp đúng phạm vi đúng mục
// đích (xem api-admin/src/pages/ConsumersPage.jsx).
//
// NHIỀU cấu hình theo máy chủ (bản 9.59, theo yêu cầu người dùng — thêm máy
// chủ DSMART "Fuji", app voucher TỰ CHỌN gọi đúng server nào qua URL, không
// cần đổi API key/scope): `/check`, `/redeem` (KHÔNG :configKey) GIỮ NGUYÊN
// như cũ — LUÔN trỏ cấu hình 'default', đối tác hiện tại không cần đổi gì.
// `/:configKey/check`, `/:configKey/redeem` là route MỚI — app tự gọi
// `/vouchers/fuji/redeem` khi người dùng chọn "Fuji". configKey KHÁC
// 'default' BẮT BUỘC đối tác đã được gán quyền ở api.ConsumerVoucherAccess
// (trang "Đối tác" → "Cấu hình Voucher được gọi") — tránh đối tác A vô tình
// redeem nhầm sang server của đối tác B; 'default' KHÔNG cần gán gì thêm
// (giữ đúng hành vi cũ — có scope voucherCheck/voucherRedeem là gọi được).
const express = require('express');
const { requireApiKey } = require('../../lib/apiAuth');
const { sql, getPool } = require('../../db');
const { checkVoucher, redeemVoucher, ConfigError, RedeemAuditFailedError } = require('../../lib/voucherRedeemService');
const { queryRedeemedFeed, parseAllowedFields } = require('../../lib/voucherRedeemedFeedService');
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

// 'default' luôn cho qua (không cần dòng nào ở api.ConsumerVoucherAccess —
// giữ đúng hành vi cũ). Mọi configKey KHÁC phải có dòng gán rõ ràng.
async function hasConfigAccess(consumerId, configKey) {
  if (configKey === 'default') return true;
  const pool = await getPool('ADMIN');
  const result = await pool.request()
    .input('consumerId', sql.Int, consumerId)
    .input('configKey', sql.VarChar(50), configKey)
    .query('SELECT 1 FROM api.ConsumerVoucherAccess WHERE ConsumerId = @consumerId AND ConfigKey = @configKey');
  return result.recordset.length > 0;
}

function handleCheck(req, res, next, configKey) {
  (async () => {
    // guessGuard (Audit-Fix9) — RIÊNG với checkConsumerRateLimit() ở
    // requireApiKey() (giới hạn tần suất chung, không phân biệt đúng/sai) —
    // xem lib/voucherGuessGuard.js.
    const blockedSeconds = guessGuard.isBlocked(req.consumer.id);
    if (blockedSeconds !== null) {
      res.setHeader('Retry-After', String(blockedSeconds));
      return res.status(429).json({ success: false, message: 'Qua nhieu lan do ma khong hop le lien tiep, thu lai sau.' });
    }
    if (!(await hasConfigAccess(req.consumer.id, configKey))) {
      return res.status(403).json({ success: false, message: `Doi tac chua duoc cap quyen dung cau hinh voucher "${configKey}"` });
    }

    const voucherCode = readVoucherCode(req, res);
    if (!voucherCode) return;
    const data = await checkVoucher(voucherCode, configKey);
    if (data.status === 'INVALID') guessGuard.recordInvalidGuess(req.consumer.id);
    else guessGuard.recordValidGuess(req.consumer.id);
    res.json({ success: true, data });
  })().catch(err => {
    if (err instanceof ConfigError) return res.status(503).json({ success: false, message: err.message });
    next(err);
  });
}

function handleRedeem(req, res, next, configKey) {
  (async () => {
    const blockedSeconds = guessGuard.isBlocked(req.consumer.id);
    if (blockedSeconds !== null) {
      res.setHeader('Retry-After', String(blockedSeconds));
      return res.status(429).json({ success: false, message: 'Qua nhieu lan do ma khong hop le lien tiep, thu lai sau.' });
    }
    if (!(await hasConfigAccess(req.consumer.id, configKey))) {
      return res.status(403).json({ success: false, message: `Doi tac chua duoc cap quyen dung cau hinh voucher "${configKey}"` });
    }

    const voucherCode = readVoucherCode(req, res);
    if (!voucherCode) return;

    const { result, transNum, valueAmt, redeemedAt } = await redeemVoucher(voucherCode, req.consumer.id, configKey);
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
  })().catch(err => {
    if (err instanceof ConfigError) return res.status(503).json({ success: false, message: err.message });
    // Voucher ĐÃ bị đổi trạng thái thật (không lùi lại được) nhưng ghi audit
    // thất bại — khớp đúng mã lỗi 500 tài liệu app voucher gốc mô tả, PHẢI
    // trả về rõ ràng thay vì để rơi vào lỗi 500 chung chung (xem
    // voucherRedeemService.js:RedeemAuditFailedError).
    if (err instanceof RedeemAuditFailedError) {
      return res.status(500).json({ success: false, message: err.message });
    }
    next(err);
  });
}

router.post('/check', requireApiKey('voucherCheck'), (req, res, next) => handleCheck(req, res, next, 'default'));
router.post('/redeem', requireApiKey('voucherRedeem'), (req, res, next) => handleRedeem(req, res, next, 'default'));
router.post('/:configKey/check', requireApiKey('voucherCheck'), (req, res, next) => handleCheck(req, res, next, req.params.configKey));
router.post('/:configKey/redeem', requireApiKey('voucherRedeem'), (req, res, next) => handleRedeem(req, res, next, req.params.configKey));

// GET .../redeemed/since?sinceId=&pageSize= — "Danh sách voucher đã thu hồi
// (feed cho đối tác)" (bản 10.7, theo yêu cầu người dùng) — xem
// lib/voucherRedeemedFeedService.js cho công thức + lý do KHÔNG dùng mốc
// thời gian mà dùng con trỏ Id. Scope RIÊNG 'voucherRedeemedFeed' (KHÁC
// 'voucherCheck'/'voucherRedeem' — đối tác chỉ cần XEM danh sách đã thu hồi
// để đối soát KHÔNG bắt buộc cũng được cấp quyền check/redeem thật, vd 1 hệ
// thống kế toán/đối soát riêng của đối tác, không phải app quét mã).
const DEFAULT_PAGE_SIZE = 200;
const MAX_PAGE_SIZE = 1000;

function handleRedeemedFeed(req, res, next, configKey) {
  (async () => {
    if (!(await hasConfigAccess(req.consumer.id, configKey))) {
      return res.status(403).json({ error: `Doi tac chua duoc cap quyen dung cau hinh voucher "${configKey}"` });
    }
    const sinceId = Number.parseInt(req.query.sinceId, 10);
    const pageSize = Math.min(
      Number.parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE
    );

    const pool = await getPool('ADMIN');
    const consumerRow = (await pool.request().input('id', sql.Int, req.consumer.id)
      .query('SELECT VoucherRedeemedFeedFieldsJson FROM api.ApiConsumers WHERE Id = @id')).recordset[0];
    const allowedFields = parseAllowedFields(consumerRow?.VoucherRedeemedFeedFieldsJson);

    const feed = await queryRedeemedFeed({
      configKey,
      sinceId: Number.isFinite(sinceId) && sinceId >= 0 ? sinceId : 0,
      pageSize,
      allowedFields
    });
    res.json(feed);
  })().catch(next);
}

router.get('/redeemed/since', requireApiKey('voucherRedeemedFeed'), (req, res, next) => handleRedeemedFeed(req, res, next, 'default'));
router.get('/:configKey/redeemed/since', requireApiKey('voucherRedeemedFeed'), (req, res, next) => handleRedeemedFeed(req, res, next, req.params.configKey));

module.exports = router;
