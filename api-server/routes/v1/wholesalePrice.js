// routes/v1/wholesalePrice.js — API "Giá Bán Buôn" cho đối tác "Hệ thống
// Văn phòng số HCRC (HCC)" — thay cho việc hệ thống đó tự kết nối SQL
// Server trực tiếp xuống HO (DSmart16) và từng siêu thị để ghi/xoá CSPRICE
// (xem Yeu-Cau-API-Gia-Ban-Buon-DSmart*.docx, đối tác cung cấp — endpoint/
// field/storeScope/mã lỗi theo ĐÚNG tài liệu đó).
//
// 4 endpoint, mount RIÊNG trong server.js (không gộp 1 router — /ping nằm
// NGAY DƯỚI {baseUrl}, không phải {baseUrl}/wholesale-price/ping, đúng
// path đối tác đã code sẵn):
//   POST /api/v1/wholesale-price/apply       (applyRouter)
//   POST /api/v1/wholesale-price/delete      (applyRouter)
//   GET  /api/v1/wholesale-price/dealer/:custId (applyRouter, bản 11.22)
//   POST /api/v1/ping                        (pingRouter)
//
// scope riêng 'wholesalePrice' (api.ApiConsumers.Scopes) — đối tác có scope
// khác (vd 'realtime') KHÔNG mặc nhiên gọi được các endpoint này.
//
// Logic ghi/xoá CSPRICE thật nằm ở lib/wholesalePriceEngine.js — route này
// CHỈ xác thực, validate input, fan-out NHIỀU target (HO + từng siêu thị
// theo storeScope) rồi gộp kết quả theo đúng khuôn phản hồi đối tác yêu cầu
// ({"ok":true,...} / {"ok":false,"error":"..."}).
const express = require('express');
const { requireApiKey } = require('../../lib/apiAuth');
const { getPoolForDataSource } = require('../../lib/dataSourcePool');
const {
  ValidationError, StoreConfigError, IntegrityError,
  validateApplyInput, validateDeleteInput,
  loadStoreDataSources, applyPriceOnPool, deletePriceOnPool, runOnAllTargets,
  lookupDealer,
  HO_STORE_CODE
} = require('../../lib/wholesalePriceEngine');

const applyRouter = express.Router();
applyRouter.use(requireApiKey('wholesalePrice'));

const pingRouter = express.Router();
pingRouter.use(requireApiKey('wholesalePrice'));

// 1 request lỗi DO DỮ LIỆU đầu vào (field thiếu/sai định dạng) -> 400, KHÔNG
// cần fan-out đi đâu cả (chặn sớm, giống đúng cách đối tác đã tự chặn trước
// khi gọi sang — xem tài liệu, nhưng vẫn tự kiểm tra lại phòng lệch code
// 2 bên sau này).
function handleValidationError(err, res) {
  if (err instanceof ValidationError) return res.status(400).json({ ok: false, error: err.message });
  return null;
}

// Thêm các storeCode KHÔNG tìm thấy cấu hình Nguồn dữ liệu vào kết quả
// dưới dạng lỗi riêng (kind 'system' — lỗi cấu hình phía mình, không phải
// lỗi dữ liệu đối tác gửi) — không lẫn với lỗi ghi CSDL thật ở các target
// tìm thấy được.
function withMissingStoreResults(results, missingStoreCodes) {
  return [
    ...results,
    ...missingStoreCodes.map(storeCode => ({
      storeCode, ok: false, kind: 'system',
      error: `StoreCode "${storeCode}" chưa cấu hình Nguồn dữ liệu (trang "Nguồn dữ liệu", cột Mã Siêu Thị)`
    }))
  ];
}

function errorSummary(results) {
  return results.filter(r => !r.ok).map(r => `${r.storeCode}: ${r.error}`).join(' | ');
}

// Bản 11.16 (theo báo cáo người dùng — 1 nơi lỗi (vd HO thiếu quyền CSDL)
// khiến TOÀN BỘ request trả ok:false, nhưng các siêu thị khác ĐÃ ghi/xoá
// thành công thật (mỗi target chạy transaction riêng ở runOnAllTargets,
// 1 nơi lỗi không chặn nơi khác — xem wholesalePriceEngine.js) — phía gọi
// API không có cách nào biết đã thành công ở đâu để coi là "đã áp giá".
// THÊM field `results` (CHI TIẾT TỪNG storeCode, bao gồm CẢ HO) vào MỌI
// response (thành công lẫn lỗi) — CHỈ THÊM, KHÔNG đổi/xoá field `ok`/
// `error`/`overwritten`/`alreadyGone` đã có (giữ nguyên tương thích với
// tài liệu đã gửi đối tác — hệ thống đối tác chỉ đọc field cũ vẫn chạy y
// hệt, hệ thống nào đọc thêm `results` sẽ biết CHÍNH XÁC nơi nào đã áp/xoá
// được để tự đánh dấu "đã áp giá" dù response tổng là ok:false).
function toPublicResult(r) {
  const out = { storeCode: r.storeCode, ok: r.ok };
  if (r.ok) {
    if ('overwritten' in r) out.overwritten = r.overwritten;
    if ('alreadyGone' in r) out.alreadyGone = r.alreadyGone;
  } else {
    out.error = r.error;
  }
  return out;
}

applyRouter.post('/apply', async (req, res, next) => {
  try {
    let input;
    try {
      input = validateApplyInput(req.body);
    } catch (err) {
      if (handleValidationError(err, res)) return;
      throw err;
    }

    const { targets, missingStoreCodes } = await loadStoreDataSources(input.storeScope.storeCodes);
    const { results: execResults, allOk: execAllOk } = await runOnAllTargets(
      targets,
      (pool) => applyPriceOnPool(pool, input)
    );
    const results = withMissingStoreResults(execResults, missingStoreCodes);
    const allOk = execAllOk && missingStoreCodes.length === 0;

    if (!allOk) {
      const hasSystemFailure = results.some(r => !r.ok && r.kind !== 'data');
      return res.status(hasSystemFailure ? 502 : 400).json({
        ok: false,
        error: `Ghi giá thất bại tại 1 hoặc nhiều nơi: ${errorSummary(results)}`,
        results: results.map(toPublicResult)
      });
    }
    const hoResult = results.find(r => r.storeCode === HO_STORE_CODE);
    res.json({
      ok: true, custId: input.custId, skuId: input.skuId, overwritten: !!hoResult.overwritten,
      results: results.map(toPublicResult)
    });
  } catch (err) {
    if (err instanceof StoreConfigError) return res.status(502).json({ ok: false, error: err.message });
    if (err instanceof IntegrityError) return res.status(500).json({ ok: false, error: err.message });
    next(err);
  }
});

applyRouter.post('/delete', async (req, res, next) => {
  try {
    let input;
    try {
      input = validateDeleteInput(req.body);
    } catch (err) {
      if (handleValidationError(err, res)) return;
      throw err;
    }

    const { targets, missingStoreCodes } = await loadStoreDataSources(input.storeScope.storeCodes);
    const { results: execResults, allOk: execAllOk } = await runOnAllTargets(
      targets,
      (pool) => deletePriceOnPool(pool, input)
    );
    const results = withMissingStoreResults(execResults, missingStoreCodes);
    const allOk = execAllOk && missingStoreCodes.length === 0;

    if (!allOk) {
      const hasSystemFailure = results.some(r => !r.ok && r.kind !== 'data');
      return res.status(hasSystemFailure ? 502 : 400).json({
        ok: false,
        error: `Xoá giá thất bại tại 1 hoặc nhiều nơi: ${errorSummary(results)}`,
        results: results.map(toPublicResult)
      });
    }
    const hoResult = results.find(r => r.storeCode === HO_STORE_CODE);
    res.json({ ok: true, alreadyGone: !!hoResult.alreadyGone, results: results.map(toPublicResult) });
  } catch (err) {
    if (err instanceof StoreConfigError) return res.status(502).json({ ok: false, error: err.message });
    if (err instanceof IntegrityError) return res.status(500).json({ ok: false, error: err.message });
    next(err);
  }
});

// GET /wholesale-price/dealer/:custId (bản 11.22, theo yêu cầu người dùng
// — đối tác cần tự kiểm tra 1 custId có hợp lệ hay không TRƯỚC khi gọi
// apply, tránh gửi nhầm mã khách rồi mới biết lỗi). Tra thẳng dbo.DEALER
// qua ĐÚNG pool HO đã cấu hình sẵn (DEALER là bảng CHUNG, không theo từng
// siêu thị — KHÔNG cần storeScope/fan-out như apply/delete). custId KHÔNG
// tồn tại trả `exists: false`, HTTP 200 — đây là 1 kết quả tra cứu hợp lệ,
// KHÔNG phải lỗi hệ thống (lỗi hệ thống thật, vd chưa cấu hình Nguồn dữ
// liệu cho HO, vẫn trả 502 như apply/delete).
applyRouter.get('/dealer/:custId', async (req, res, next) => {
  try {
    const custId = String(req.params.custId || '').trim();
    if (!custId) return res.status(400).json({ ok: false, error: 'Thiếu custId' });

    const { targets } = await loadStoreDataSources([]);
    const hoTarget = targets.find(t => t.storeCode === HO_STORE_CODE);
    const pool = await getPoolForDataSource(hoTarget.dataSourceId);
    const dealer = await lookupDealer(pool, custId);

    if (!dealer) return res.json({ ok: true, custId, exists: false });
    res.json({
      ok: true, custId, exists: true,
      name: dealer.name, custGroup: dealer.custGroup, custLevel: dealer.custLevel, taxId: dealer.taxId
    });
  } catch (err) {
    if (err instanceof StoreConfigError) return res.status(502).json({ ok: false, error: err.message });
    next(err);
  }
});

// Nút "🔌 Kiểm Tra Kết Nối API" (đội IT đối tác tự bấm) — chỉ xác thực
// (key/scope đúng) là đủ, không đụng CSDL/giá nào.
pingRouter.post('/', (req, res) => {
  res.json({ ok: true });
});

module.exports = { applyRouter, pingRouter };
