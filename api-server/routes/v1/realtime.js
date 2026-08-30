// routes/v1/realtime.js — Tra cứu realtime từ CSDL OLTP (KHÔNG qua Data
// Warehouse) — vd tồn kho, điểm thẻ thành viên, voucher, hay bất kỳ loại dữ
// liệu realtime nào khác admin đã định nghĩa (api.RealtimeEndpointDefs, xem
// routes/admin/realtimeEndpoints.js). Endpoint KHÔNG còn cố định trong code —
// admin tự tạo qua api-admin/ (chọn nguồn → duyệt bảng/cột thật, không gõ
// tay), thêm loại realtime mới không cần lập trình viên viết route mới.
//
// api.ConsumerRealtimeAccess — CÙNG khuôn với api.ConsumerReportAccess bên
// routes/v1/reports.js: đối tác có scope 'realtime' hợp lệ KHÔNG mặc nhiên
// gọi được MỌI endpoint — phải được admin gán rõ ràng từng endpoint (trang
// "Đối tác"). Quan trọng khi nhiều chi nhánh/siêu thị dùng chung API Server
// (mỗi chi nhánh 1 api.DataSources + endpoint riêng) — thiếu lớp này, 1 đối
// tác đọc được realtime của MỌI chi nhánh, không riêng chi nhánh của họ.
//
// 2 route DÙNG CHUNG cho MỌI endpoint:
//   GET /:endpoint/list — danh sách phân trang.
//   GET /:endpoint/:key — tra đúng 1 khoá.
// "/list" ĐĂNG KÝ TRƯỚC "/:key" — nếu không, "/inventory/list" sẽ bị
// "/inventory/:key" nuốt mất (khớp trước, coi "list" là giá trị khoá). Một
// khoá thật sự tên "list" sẽ không tra được qua route dưới — giới hạn đã
// biết, chấp nhận được.
const express = require('express');
const { sql, getPool } = require('../../db');
const { requireApiKey } = require('../../lib/apiAuth');
const { runLookup, runList, NotFoundError } = require('../../lib/realtimeEngine');

const router = express.Router();
router.use(requireApiKey('realtime'));

async function assertConsumerCanAccessEndpoint(consumerId, endpoint) {
  const adminPool = await getPool('ADMIN');
  const result = await adminPool.request()
    .input('consumerId', sql.Int, consumerId)
    .input('endpoint', sql.VarChar(50), endpoint)
    .query('SELECT 1 FROM api.ConsumerRealtimeAccess WHERE ConsumerId = @consumerId AND Endpoint = @endpoint');
  return result.recordset.length > 0;
}

router.get('/:endpoint/list', async (req, res, next) => {
  try {
    if (!(await assertConsumerCanAccessEndpoint(req.consumer.id, req.params.endpoint))) {
      return res.status(403).json({ error: 'Đối tác chưa được cấp quyền gọi endpoint realtime này' });
    }
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
    if (!(await assertConsumerCanAccessEndpoint(req.consumer.id, req.params.endpoint))) {
      return res.status(403).json({ error: 'Đối tác chưa được cấp quyền gọi endpoint realtime này' });
    }
    const data = await runLookup(req.params.endpoint, req.params.key);
    if (!data.row) return res.status(404).json({ error: 'Không tìm thấy khoá tra cứu' });
    res.json(data.row); // phẳng, giống hành vi 3 route cũ (inventory/loyalty/vouchers)
  } catch (err) {
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
