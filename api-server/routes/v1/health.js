// routes/v1/health.js — GET /api/v1/health: TRƯỚC ĐÂY chỉ trả "tiến trình
// đang chạy", không nói được gì về việc CSDL có kết nối được hay không
// (tiến trình Node vẫn "sống" bình thường ngay cả khi CSDL sập — db.js kết
// nối LƯỜI, chỉ lộ lỗi ở request đầu tiên cần tới pool đó). Giờ PING THẬT
// cả 2 pool (ADMIN — xác thực đối tác đi qua đây MỌI request, DWH — nguồn
// /api/v1/reports) bằng "SELECT 1" (rẻ, không đụng bảng nào) — 503 nếu MỘT
// trong hai không kết nối được, để đối tác/công cụ giám sát phân biệt được
// "tiến trình treo cờ trắng" khỏi "tiến trình sống nhưng vô dụng vì mất
// CSDL". Không yêu cầu API key — dùng để hệ thống ngoài/monitoring kiểm tra
// tình trạng trước khi gọi các endpoint cần xác thực.
const express = require('express');
const { version } = require('../../package.json');
const { getPool } = require('../../db');

const router = express.Router();

async function pingPool(prefix) {
  try {
    const pool = await getPool(prefix);
    await pool.request().query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

router.get('/', async (req, res) => {
  const [admin, dwh] = await Promise.all([pingPool('ADMIN'), pingPool('DWH')]);
  const ok = admin && dwh;
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'error',
    db: { admin: admin ? 'ok' : 'error', dwh: dwh ? 'ok' : 'error' },
    version,
    time: new Date().toISOString()
  });
});

module.exports = router;
