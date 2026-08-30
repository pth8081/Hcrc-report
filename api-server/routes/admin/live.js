// routes/admin/live.js — "Kết nối hiện tại": SSE cho request đang chạy +
// snapshot tình trạng các pool CSDL đang mở — DWH (tĩnh, mặc định cho
// /reports) và từng nguồn realtime đang kết nối (động, theo
// api.DataSources — xem lib/dataSourcePool.js). Không còn pool "OLTP" tĩnh
// như trước — 3 endpoint realtime giờ đọc theo cấu hình trong CSDL.
const express = require('express');
const { requireAdminAuth } = require('../../lib/adminAuth');
const liveTracker = require('../../lib/liveTracker');
const { getPool } = require('../../db');
const { listActivePoolStats } = require('../../lib/dataSourcePool');

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
    try {
      const pool = await getPool('DWH');
      pools.DWH = { size: pool.size, available: pool.available, pending: pool.pending, borrowed: pool.borrowed };
    } catch {
      pools.DWH = { error: 'chưa kết nối được' };
    }
    pools.realtimeSources = await listActivePoolStats();
    res.json(pools);
  } catch (err) { next(err); }
});

module.exports = router;
