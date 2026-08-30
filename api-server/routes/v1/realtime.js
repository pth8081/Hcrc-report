// routes/v1/realtime.js — Tra cứu realtime từ CSDL OLTP (KHÔNG qua Data
// Warehouse) — vd tồn kho, điểm thẻ thành viên, voucher, hay bất kỳ loại dữ
// liệu realtime nào khác admin đã định nghĩa (api.RealtimeEndpointDefs, xem
// routes/admin/realtimeEndpoints.js). Endpoint KHÔNG còn cố định trong code —
// admin tự tạo qua api-admin/ (chọn nguồn → duyệt bảng/cột thật, không gõ
// tay), thêm loại realtime mới không cần lập trình viên viết route mới.
//
// 2 route DÙNG CHUNG cho MỌI endpoint:
//   GET /:endpoint/list — danh sách phân trang.
//   GET /:endpoint/:key — tra đúng 1 khoá.
// "/list" ĐĂNG KÝ TRƯỚC "/:key" — nếu không, "/inventory/list" sẽ bị
// "/inventory/:key" nuốt mất (khớp trước, coi "list" là giá trị khoá). Một
// khoá thật sự tên "list" sẽ không tra được qua route dưới — giới hạn đã
// biết, chấp nhận được.
const express = require('express');
const { requireApiKey } = require('../../lib/apiAuth');
const { runLookup, runList, NotFoundError } = require('../../lib/realtimeEngine');

const router = express.Router();
router.use(requireApiKey('realtime'));

router.get('/:endpoint/list', async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const pageSize = Math.min(parseInt(req.query.pageSize || '200', 10), 1000);
    const data = await runList(req.params.endpoint, { page, pageSize });
    res.json(data);
  } catch (err) {
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    next(err);
  }
});

router.get('/:endpoint/:key', async (req, res, next) => {
  try {
    const data = await runLookup(req.params.endpoint, req.params.key);
    if (!data.row) return res.status(404).json({ error: 'Không tìm thấy khoá tra cứu' });
    res.json(data.row); // phẳng, giống hành vi 3 route cũ (inventory/loyalty/vouchers)
  } catch (err) {
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
