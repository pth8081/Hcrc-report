// routes/v1/realtimeWrite.js — Đối tác ngoài BÁO đã dùng 1 mã (vd voucher
// dùng 1 lần là thu luôn, xác nhận với người dùng) -> GHI THẲNG vào đúng
// bảng nguồn đang chạy (KHÔNG qua Data Warehouse, KHÔNG qua bảng riêng của
// HCRC — xem hướng_dẫn_báo_cáo.md mục 13). Endpoint/bảng/cột ĐỘNG, admin tự
// cấu hình qua api-admin (api.RealtimeWriteEndpointDefs, xem
// routes/admin/realtimeWriteEndpoints.js), không cần lập trình viên viết
// route mới.
//
// KHÁC HẲN routes/v1/realtime.js (chỉ đọc) — đây là ĐƯỜNG DUY NHẤT được
// phép UPDATE ngược lại nguồn, nên tách SCOPE RIÊNG ('realtimeWrite', khác
// 'realtime' đọc) VÀ bảng cấp quyền riêng (api.ConsumerRealtimeWriteAccess)
// — đối tác có scope/quyền đọc không mặc nhiên ghi được, phải admin cấp
// thêm rõ ràng cho từng endpoint ghi.
const express = require('express');
const { sql, getPool } = require('../../db');
const { requireApiKey } = require('../../lib/apiAuth');
const { runRedeem, NotFoundError } = require('../../lib/realtimeWriteEngine');

const router = express.Router();
router.use(requireApiKey('realtimeWrite'));

async function assertConsumerCanAccessEndpoint(consumerId, endpoint) {
  const adminPool = await getPool('ADMIN');
  const result = await adminPool.request()
    .input('consumerId', sql.Int, consumerId)
    .input('endpoint', sql.VarChar(50), endpoint)
    .query('SELECT 1 FROM api.ConsumerRealtimeWriteAccess WHERE ConsumerId = @consumerId AND Endpoint = @endpoint');
  return result.recordset.length > 0;
}

router.post('/:endpoint/:key', async (req, res, next) => {
  try {
    if (!(await assertConsumerCanAccessEndpoint(req.consumer.id, req.params.endpoint))) {
      return res.status(403).json({ error: 'Đối tác chưa được cấp quyền gọi endpoint ghi này' });
    }
    const { result } = await runRedeem(req.params.endpoint, req.params.key);
    if (result === 'notFound') return res.status(404).json({ error: 'Không tìm thấy mã' });
    if (result === 'alreadyUsed') return res.json({ ok: true, alreadyUsed: true, message: 'Mã đã được đánh dấu sử dụng trước đó' });
    res.json({ ok: true, alreadyUsed: false, message: 'Đã cập nhật trạng thái sử dụng' });
  } catch (err) {
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
