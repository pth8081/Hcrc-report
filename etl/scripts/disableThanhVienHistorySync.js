// scripts/disableThanhVienHistorySync.js — bản 8.27: 2 báo cáo "(Thành
// viên)" nay đọc "Cùng kỳ năm trước" (lastYear/lastYearGD) THẲNG từ domain
// GỐC (xem rp-server/scripts/seedLdtdHcrcReports.js) thay vì domain
// "_thanhvien" riêng — vì dữ liệu tháng đã đóng sổ giống hệt nhau dù qua
// domain nào (cả 2 domain Lịch sử đều đồng bộ CHUNG 1 VIEW trên
// DSMART16_EOM, xem scripts/seedThanhVienHistorySync.js). Do đó 2 Sync Job
// "Doanh thu/Giao dịch chi nhánh (Thành viên) - Lịch sử (DSMART16_EOM)" (do
// seedThanhVienHistorySync.js tạo) giờ ĐỒNG BỘ LẶP LẠI dữ liệu đã có sẵn ở
// domain gốc — không còn ai đọc tới domain "_thanhvien" của 2 job này nữa,
// tắt đi cho đỡ tốn tài nguyên đồng bộ.
//
// CHỈ TẮT (IsActive = 0), KHÔNG xoá job/dữ liệu đã đồng bộ — job "Live" của
// Thành viên (70 job, xem seedThanhVienLiveSync.js, đọc trực tiếp từng cửa
// hàng) KHÔNG bị đụng tới, vẫn chạy bình thường (đây mới là phần Live thật
// của kiến trúc "Thành viên").
//
// AN TOÀN: mặc định (không truyền cờ) chỉ XEM TRƯỚC, KHÔNG đổi gì cả
// (dry-run). Truyền đúng --confirm mới thực sự tắt:
//   node scripts/disableThanhVienHistorySync.js           (xem trước)
//   node scripts/disableThanhVienHistorySync.js --confirm (thực sự tắt)
require('dotenv').config();
const { sql, getPool } = require('../db');

const JOB_NAMES = [
  'Doanh thu chi nhánh (Thành viên) - Lịch sử (DSMART16_EOM)',
  'Giao dịch chi nhánh (Thành viên) - Lịch sử (DSMART16_EOM)'
];

async function main() {
  const confirmed = process.argv.includes('--confirm');
  const pool = await getPool('ADMIN');

  const jobs = [];
  for (const name of JOB_NAMES) {
    const result = await pool.request().input('name', sql.NVarChar(200), name)
      .query('SELECT Id, Name, IsActive FROM etl.SyncJobs WHERE Name = @name');
    if (result.recordset.length) jobs.push(result.recordset[0]);
    else console.warn(`⚠️  Không tìm thấy job "${name}" — có thể đã xoá hoặc chưa từng tạo, bỏ qua.`);
  }

  if (!jobs.length) {
    console.log('Không có job nào cần tắt. Xong.');
    process.exit(0);
  }

  console.log('Các job sẽ bị TẮT (IsActive = 0):');
  jobs.forEach(j => console.log(`  - "${j.Name}" (Id ${j.Id}) — đang ${j.IsActive ? 'BẬT' : 'đã tắt sẵn'}`));

  if (!confirmed) {
    console.log('\n(Chưa làm gì cả — đây là xem trước. Truyền --confirm để thực sự tắt.)');
    process.exit(0);
  }

  for (const job of jobs) {
    await pool.request().input('id', sql.Int, job.Id).query('UPDATE etl.SyncJobs SET IsActive = 0 WHERE Id = @id');
    console.log(`✅ Đã tắt job "${job.Name}" (Id ${job.Id}).`);
  }

  console.log('\nXong. Nhớ đã chạy lại node scripts/seedLdtdHcrcReports.js (rp-server) để 2 báo');
  console.log('cáo "(Thành viên)" cập nhật lastYear/lastYearGD sang domain gốc TRƯỚC KHI tắt');
  console.log('2 job này — nếu chưa, báo cáo sẽ tạm thiếu Cùng kỳ năm trước cho tới khi chạy.');
  process.exit(0);
}

main().catch(err => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
