// jobs/scheduler.js — Đăng ký lịch chạy (node-cron) cho từng nguồn. Mỗi nguồn
// có thể ghi đè lịch riêng bằng biến "<envPrefix>_CRON" trong .env, không có
// thì dùng chung SYNC_CRON (mặc định 15 phút/lần).
const cron = require('node-cron');
const sources = require('../sources');
const { runSource } = require('./runSync');

function start() {
  const defaultExpr = process.env.SYNC_CRON || '*/15 * * * *';

  if (!sources.length) {
    console.warn('⚠️  Chưa có nguồn nào đăng ký trong sources/index.js — chưa có lịch nào được tạo.');
    return;
  }

  for (const source of sources) {
    const expr = process.env[`${source.envPrefix}_CRON`] || defaultExpr;
    if (!cron.validate(expr)) {
      console.error(`⛔ Lịch chạy không hợp lệ cho [${source.key}]: "${expr}"`);
      continue;
    }
    cron.schedule(expr, () => runSource(source));
    console.log(`⏱  [${source.key}] lịch chạy: ${expr}`);
  }
}

module.exports = { start };
