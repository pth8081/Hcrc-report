// index.js — Điểm khởi chạy ETL worker.
//   node index.js          chạy nền, đồng bộ theo lịch cron (dùng với PM2)
//   node index.js --once   chạy đúng một lượt cho tất cả nguồn rồi thoát —
//                          dùng để test connector mới hoặc chạy tay khi cần
require('dotenv').config();
const { runAll } = require('./jobs/runSync');
const scheduler = require('./jobs/scheduler');
const { closeAll } = require('./db');

const RUN_ONCE = process.argv.includes('--once');

async function main() {
  if (RUN_ONCE) {
    console.log('== Chạy đồng bộ một lần (--once) ==');
    await runAll();
    await closeAll();
    process.exit(0);
  }
  console.log('== ETL worker khởi động, chạy theo lịch ==');
  scheduler.start();
}

main().catch(err => {
  console.error('⛔ Lỗi khởi động ETL worker:', err);
  process.exit(1);
});

process.on('SIGINT', async () => { await closeAll(); process.exit(0); });
process.on('SIGTERM', async () => { await closeAll(); process.exit(0); });
