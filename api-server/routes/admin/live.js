// routes/admin/live.js — "Kết nối hiện tại": SSE cho request đang chạy +
// snapshot tình trạng các pool CSDL (DWH/OLTP) đang mở — hai loại thông tin
// khác nhau, xem tài liệu kiến trúc "Quản Trị API HCRC", mục 01.
const express = require('express');
const { requireAdminAuth } = require('../../lib/adminAuth');
const liveTracker = require('../../lib/liveTracker');
const { getPool } = require('../../db');

const router = express.Router();
router.use(requireAdminAuth);

router.get('/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.flushHeaders();

  // Gửi ngay danh sách hiện có khi vừa kết nối — không đợi sự kiện tiếp theo.
  res.write(`event: snapshot\ndata: ${JSON.stringify(liveTracker.listInFlight())}\n\n`);

  liveTracker.addClient(res);
  req.on('close', () => liveTracker.removeClient(res));
});

router.get('/pools', async (req, res, next) => {
  try {
    const pools = {};
    for (const prefix of ['DWH', 'OLTP']) {
      try {
        const pool = await getPool(prefix);
        pools[prefix] = { size: pool.size, available: pool.available, pending: pool.pending, borrowed: pool.borrowed };
      } catch {
        pools[prefix] = { error: 'chưa kết nối được' };
      }
    }
    res.json(pools);
  } catch (err) { next(err); }
});

module.exports = router;
