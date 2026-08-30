// index.js — Chạy TOÀN BỘ job đồng bộ đang bật MỘT LẦN rồi thoát — dùng để
// test job mới hoặc chạy tay khi cần. Chạy nền theo lịch thật + phục vụ
// /admin/* cho etl-admin/ thì dùng server.js (node server.js, hoặc pm2 start
// server.js).
require('dotenv').config();
const { runAll } = require('./jobs/runSync');
const { closeAll } = require('./db');

runAll()
  .then(() => closeAll())
  .then(() => process.exit(0))
  .catch(err => {
    console.error('⛔ Lỗi:', err);
    process.exit(1);
  });
