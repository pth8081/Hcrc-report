// routes/v1/wholesalePrice.js — API "Giá Bán Buôn" cho đối tác "Hệ thống
// Văn phòng số HCRC (HCC)" — thay cho việc hệ thống đó tự kết nối SQL
// Server trực tiếp xuống HO (DSmart16) và từng siêu thị để ghi/xoá CSPRICE
// (xem Yeu-Cau-API-Gia-Ban-Buon-DSmart*.docx, đối tác cung cấp — endpoint/
// field/storeScope/mã lỗi theo ĐÚNG tài liệu đó).
//
// 3 endpoint, mount RIÊNG trong server.js (không gộp 1 router — /ping nằm
// NGAY DƯỚI {baseUrl}, không phải {baseUrl}/wholesale-price/ping, đúng
// path đối tác đã code sẵn):
//   POST /api/v1/wholesale-price/apply   (applyRouter)
//   POST /api/v1/wholesale-price/delete  (applyRouter)
//   POST /api/v1/ping                    (pingRouter)
//
// scope riêng 'wholesalePrice' (api.ApiConsumers.Scopes) — đối tác có scope
// khác (vd 'realtime') KHÔNG mặc nhiên gọi được 3 endpoint này.
//
// Logic ghi/xoá CSPRICE thật nằm ở lib/wholesalePriceEngine.js — route này
// CHỈ xác thực, validate input, fan-out NHIỀU target (HO + từng siêu thị
// theo storeScope) rồi gộp kết quả theo đúng khuôn phản hồi đối tác yêu cầu
// ({"ok":true,...} / {"ok":false,"error":"..."}).
const express = require('express');
const { requireApiKey } = require('../../lib/apiAuth');
const {
  ValidationError, StoreConfigError, IntegrityError,
  validateApplyInput, validateDeleteInput,
  loadStoreDataSources, applyPriceOnPool, deletePriceOnPool, runOnAllTargets,
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
        error: `Ghi giá thất bại tại 1 hoặc nhiều nơi: ${errorSummary(results)}`
      });
    }
    const hoResult = results.find(r => r.storeCode === HO_STORE_CODE);
    res.json({ ok: true, custId: input.custId, skuId: input.skuId, overwritten: !!hoResult.overwritten });
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
        error: `Xoá giá thất bại tại 1 hoặc nhiều nơi: ${errorSummary(results)}`
      });
    }
    const hoResult = results.find(r => r.storeCode === HO_STORE_CODE);
    res.json({ ok: true, alreadyGone: !!hoResult.alreadyGone });
  } catch (err) {
    if (err instanceof StoreConfigError) return res.status(502).json({ ok: false, error: err.message });
    if (err instanceof IntegrityError) return res.status(500).json({ ok: false, error: err.message });
    next(err);
  }
});

// Nút "🔌 Kiểm Tra Kết Nối API" (đội IT đối tác tự bấm) — chỉ xác thực
// (key/scope đúng) là đủ, không đụng CSDL/giá nào.
pingRouter.post('/', (req, res) => {
  res.json({ ok: true });
});

module.exports = { applyRouter, pingRouter };
