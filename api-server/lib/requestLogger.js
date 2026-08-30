// lib/requestLogger.js — Middleware gắn vào MỌI route /api/v1/* (KHÔNG gắn
// vào /admin/*, xem server.js). Ghi api.RequestLog SAU KHI đã trả lời xong,
// KHÔNG CHỜ (fire-and-forget) — xem sơ đồ trong tài liệu kiến trúc "Quản Trị
// API HCRC", mục 05: đường phản hồi cho hệ thống ngoài không bao giờ được
// chờ một lượt ghi CSDL.
//
// req.consumer CHƯA có ở thời điểm bắt đầu request (middleware này chạy
// TRƯỚC requireApiKey trong từng router) — chấp nhận được vì "kết nối hiện
// tại" (lib/liveTracker) chỉ cần biết endpoint/thời gian chạy, không bắt
// buộc tên đối tác; tên đối tác luôn có đầy đủ trong Lịch sử vì lúc đó
// requireApiKey đã chạy xong.
const { sql, getPool } = require('../db');
const liveTracker = require('./liveTracker');

function requestLogger(req, res, next) {
  const startedAt = Date.now();
  const trackerId = liveTracker.start({ endpoint: req.path, method: req.method });

  res.on('finish', () => {
    liveTracker.finish(trackerId);

    logRequest({
      consumerId: req.consumer?.id || null,
      endpoint: req.path,
      method: req.method,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ipAddress: req.ip
    }).catch(err => console.error('⚠️  Ghi RequestLog thất bại:', err.message));
  });

  next();
}

async function logRequest({ consumerId, endpoint, method, statusCode, durationMs, ipAddress }) {
  const pool = await getPool('ADMIN');
  await pool.request()
    .input('consumerId', sql.Int, consumerId)
    .input('endpoint', sql.VarChar(200), endpoint)
    .input('method', sql.VarChar(10), method)
    .input('statusCode', sql.Int, statusCode)
    .input('durationMs', sql.Int, durationMs)
    .input('ipAddress', sql.VarChar(100), ipAddress)
    .query(`
      INSERT INTO api.RequestLog (ConsumerId, Endpoint, Method, StatusCode, DurationMs, IpAddress)
      VALUES (@consumerId, @endpoint, @method, @statusCode, @durationMs, @ipAddress)
    `);
}

module.exports = { requestLogger };
